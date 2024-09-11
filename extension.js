const vscode = require("vscode");
const cp = require("child_process");
const util = require("util");
const path = require("path");

const exec = util.promisify(cp.exec);

const whenContext = "gitStageFilePicker";
let stageFilePicker;

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("gitStageFile.openPicker", async () => {
      // |---------------------------|
      // |        Open Picker        |
      // |---------------------------|

      // set When context
      vscode.commands.executeCommand("setContext", whenContext, true);

      // get CWD
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder is open.");
        return;
      }

      // |-----------------------------|
      // |        Create Picker        |
      // |-----------------------------|

      stageFilePicker = vscode.window.createQuickPick();
      stageFilePicker.keepScrollPosition = true;
      stageFilePicker.placeholder = "Select a file to Stage or Unstage ...";
      //   stageFilePicker.title = "Stage File Picker";

      //   Get Changes
      // ---------------

      stageFilePicker.getChanges = async () => {
        try {
          // Run the Git command from the workspace root
          const { stdout } = await exec(
            "git status --porcelain --untracked-files=all",
            { cwd: workspaceFolder }
          );

          // |-----------------------|
          // |        Feature        |
          // |-----------------------|
          //   if multiple git repositories, select which repository

          const changes = [];

          stdout.split("\n").forEach((line) => {
            if (line.length > 0) {
              changes.push(line);
            }
          });
          return changes;
        } catch (err) {
          console.log(err);
          vscode.window.showErrorMessage("Failed to get changes.");
          return [];
        }
      };

      let changes = await stageFilePicker.getChanges();

      if (changes.length === 0) {
        vscode.window.showInformationMessage("No Changes");
        return; // no changes. exit.
      }

      //   Stage Toggler
      // -----------------

      stageFilePicker.stageFile = async (filepath, notStaged) => {
        const command = notStaged
          ? `git add ${filepath}`
          : `git reset ${filepath}`;

        try {
          await exec(command, { cwd: workspaceFolder });
        } catch (err) {
          console.log(err);
          vscode.window.showErrorMessage(
            `Failed to ${notStaged ? "stage" : "unstage"} file: ${filepath}`
          );
        }
      };

      //   Update UI
      // -------------

      stageFilePicker.updateItems = async (changes) => {
        if (!changes) {
          changes = await stageFilePicker.getChanges();
        }

        changes = changes.map(createQuickPickItem);

        const unstagedChanges = changes.filter((change) => change.notStaged);
        const unstagedChangesGroup = [
          {
            label: "Changes",
            kind: vscode.QuickPickItemKind.Separator,
          },
          {
            id: "stage",
            label: "(⌘⇧S)",
            description: "Stage All",
            alwaysShow: true,
          },
          ...unstagedChanges,
        ];

        const stagedChanges = changes.filter((change) => !change.notStaged);
        const stagedChangesGroup = [
          {
            label: "Staged Changes",
            kind: vscode.QuickPickItemKind.Separator,
          },
          {
            id: "unstage",
            label: "(⌘⇧U)",
            description: "Unstage All",
            alwaysShow: true,
          },
          ...stagedChanges,
        ];

        const items = [];
        if (stagedChanges.length > 0) {
          items.push(...stagedChangesGroup);
        }
        if (unstagedChanges.length > 0) {
          items.push(...unstagedChangesGroup);
        }
        stageFilePicker.items = items;
        vscode.commands.executeCommand("git.refresh");
      };
      stageFilePicker.updateItems(changes);

      // |------------------------------|
      // |        Input Handling        |
      // |------------------------------|

      //   on Enter
      // ------------

      stageFilePicker.onDidChangeSelection(async ([selection]) => {
        if (selection) {
          switch (selection.id) {
            case "stage":
              vscode.commands.executeCommand("gitStageFile.stageAll");
              break;
            case "unstage":
              vscode.commands.executeCommand("gitStageFile.unstageAll");
              break;
            default:
              // store the index of the current selection
              const selectionIndex = stageFilePicker.items.findIndex(
                (item) => item.filepath === selection.filepath
              );
              await stageFilePicker.stageFile(
                selection.filepath,
                selection.notStaged
              );
              await stageFilePicker.updateItems();

              // set the active item to the stored index
              //   this maintains the selection position in the quickPick
              let newSelection = stageFilePicker.items[selectionIndex];
              if (newSelection.kind === vscode.QuickPickItemKind.Separator) {
                newSelection = stageFilePicker.items[selectionIndex + 1];
              }
              stageFilePicker.activeItems = [newSelection];
          }
          stageFilePicker.value = "";
        }
      });

      // |-----------------------|
      // |        Buttons        |
      // |-----------------------|

      //   stageFilePicker.buttons = [
      //     {
      //       iconPath: new vscode.ThemeIcon("add"),
      //       id: "stageAll",
      //       tooltip: "Stage All (⌘⇧S)",
      //     },
      //     {
      //       iconPath: new vscode.ThemeIcon("remove"),
      //       id: "unstageAll",
      //       tooltip: "Unstage All (⌘⇧U)",
      //     },
      //   ];

      //         .replace("CMD", "⌘")
      //         .replace("ALT", "⌥")
      //         .replace("CTRL", "^")
      //         .replace("SHIFT", "⇧");

      //   stageFilePicker.onDidTriggerButton(async (button) => {
      //     switch (button.id) {
      //       case "stageAll":
      //         vscode.commands.executeCommand("git-stage-file.stageAll");
      //         break;
      //       case "unstageAll":
      //         vscode.commands.executeCommand("git-stage-file.unstageAll");
      //         break;
      //     }
      //   });

      //   on Esc
      // ----------

      stageFilePicker.onDidHide(() => {
        stageFilePicker.dispose();
        // remove when context
        vscode.commands.executeCommand("setContext", whenContext, undefined);
        // maybe make this optional? not sure
        vscode.commands.executeCommand("workbench.scm.focus");
      });

      //   show the picker!
      stageFilePicker.show();
    }),

    // |------------------------------------|
    // |        Commands for Buttons        |
    // |------------------------------------|

    vscode.commands.registerCommand("gitStageFile.stageAll", () => {
      vscode.commands.executeCommand("git.stageAll");
      setTimeout(() => {
        stageFilePicker.updateItems();
      }, 10);
    }),

    vscode.commands.registerCommand("gitStageFile.unstageAll", () => {
      vscode.commands.executeCommand("git.unstageAll");
      setTimeout(() => {
        stageFilePicker.updateItems();
      }, 10);
    })

    // vscode.commands.registerCommand("gitStageFile.discardChange", () => {
    // //   vscode.commands.executeCommand("git.unstageAll");

    // // get the active item from the
    //   setTimeout(() => {
    //     stageFilePicker.updateItems();
    //   }, 10);
    // }),
  );
}

function createQuickPickItem(fileStatus) {
  const filepath = fileStatus.slice(3);
  const directory = path.dirname(filepath);
  const file = path.basename(filepath);

  const untracked = fileStatus[0] === "?" && fileStatus[1] === "?";

  const notStaged = untracked || fileStatus[0] === " ";
  const stageSymbol = notStaged ? "$(add)" : "$(remove)";

  const description = `${fileStatus[notStaged ? 1 : 0]}      ${
    directory === "." ? "" : `${directory}${path.sep}`
  }`;

  const label = ` ${stageSymbol} ${file}`;

  //   const discardButton = {
  //     iconPath: new vscode.ThemeIcon("discard"),
  //     id: "discard",
  //     tooltip: "Discard File",
  //   };

  // description should be file path if any
  // move symbol

  //   create UI button for git scm

  return {
    label,
    description,
    filepath,
    notStaged,
  };
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
