const vscode = require("vscode");
const cp = require("child_process");
const util = require("util");
const path = require("path");
const os = require("os");

const exec = util.promisify(cp.exec);

const whenContext = "gitStageFilePicker";
let stageFilePicker;

const isMacOS = os.platform() === "darwin";

// symbols
// ⌘
// ⌥
// ^
// ⇧

function activate(context) {
  context.subscriptions.push(
    stageFilePicker,
    // |---------------------------|
    // |        Open Picker        |
    // |---------------------------|

    vscode.commands.registerCommand("gitStageFile.quickStage", async () => {
      // set When context
      vscode.commands.executeCommand("setContext", whenContext, true);

      // get CWD
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder is open.");
        return;
      }

      //   Create Picker
      // -----------------

      stageFilePicker = vscode.window.createQuickPick();
      stageFilePicker.keepScrollPosition = true;
      stageFilePicker.placeholder = "Select a file to Stage or Unstage ...";
      stageFilePicker.title = "Git: Stage File";

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
        stageFilePicker.value = "";
        if (!changes) {
          changes = await stageFilePicker.getChanges();
        }
        changes = changes.map(createQuickPickItem);

        const unstagedChanges = changes.filter((change) => change.notStaged);
        const unstagedChangesGroup = [
          {
            label: `Changes (${unstagedChanges.length})`,
            kind: vscode.QuickPickItemKind.Separator,
          },
          ...unstagedChanges,
        ];

        const stagedChanges = changes.filter((change) => !change.notStaged);
        const stagedChangesGroup = [
          {
            label: `Staged Changes (${stagedChanges.length})`,
            kind: vscode.QuickPickItemKind.Separator,
          },
          ...stagedChanges,
        ];

        stageFilePicker.items = [
          ...stagedChangesGroup,
          ...unstagedChangesGroup,
        ];

        vscode.commands.executeCommand("git.refresh");
      };

      stageFilePicker.updateItems(changes); // update UI with files

      // |------------------------------|
      // |        Input Handling        |
      // |------------------------------|

      //   on Enter
      // ------------

      stageFilePicker.onDidChangeSelection(async ([selection]) => {
        if (selection) {
          // store the index of the current selection
          const selectionIndex = stageFilePicker.items.findIndex(
            (item) => item.filepath === selection.filepath
          );

          await stageFilePicker.stageFile(
            selection.filepath,
            selection.notStaged
          );
          await stageFilePicker.updateItems();

          // set the active item to the saved index
          // this keeps the selector from jumping around
          let newSelection = stageFilePicker.items[selectionIndex];
          if (newSelection.kind === vscode.QuickPickItemKind.Separator) {
            newSelection = stageFilePicker.items[selectionIndex + 1];
          }
          stageFilePicker.activeItems = [newSelection];
        }
      });

      //   on Esc
      // ----------

      stageFilePicker.onDidHide(() => {
        stageFilePicker.dispose();
        // remove when context
        vscode.commands.executeCommand("setContext", whenContext, undefined);
        // maybe make this optional? not sure
        vscode.commands.executeCommand("workbench.scm.focus");
      });

      //   Buttons
      // -----------
      stageFilePicker.onDidTriggerButton((event) => {
        vscode.commands.executeCommand(event.command);
      });
      stageFilePicker.buttons = [
        {
          iconPath: new vscode.ThemeIcon("add"),
          id: "stageAll",
          tooltip: `Stage All (${isMacOS ? "⌘⇧S" : "Shift+Ctrl+S"})`,
          command: "gitStageFile.stageAll",
        },
        {
          iconPath: new vscode.ThemeIcon("remove"),
          id: "unstageAll",
          tooltip: `Unstage All (${isMacOS ? "⌘⇧U" : "Shift+Ctrl+U"})`,
          command: "gitStageFile.unstageAll",
        },
      ];

      stageFilePicker.show(); // show the picker!
    }),

    // |------------------------------------|
    // |        Commands for Buttons        |
    // |------------------------------------|

    vscode.commands.registerCommand("gitStageFile.stageAll", () => {
      vscode.commands.executeCommand("git.stageAll");
      setTimeout(() => {
        if (stageFilePicker) {
          stageFilePicker.updateItems();
        }
      }, 10);
    }),

    vscode.commands.registerCommand("gitStageFile.unstageAll", () => {
      vscode.commands.executeCommand("git.unstageAll");
      setTimeout(() => {
        if (stageFilePicker) {
          stageFilePicker.updateItems();
        }
      }, 10);
    })
  );
}

function createQuickPickItem(fileStatus) {
  const filepath = fileStatus.slice(3);
  const directory = path.dirname(filepath);
  const file = path.basename(filepath);

  const untracked = fileStatus[0] === "?" && fileStatus[1] === "?";
  const notStaged = untracked || fileStatus[0] === " ";

  const stageSymbol = notStaged ? "$(add)" : "$(remove)";
  const label = ` ${stageSymbol} ${file}`;
  const description = `${fileStatus[notStaged ? 1 : 0]}${
    directory === "." ? "" : `      ${directory}${path.sep}`
  }`;

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
