const vscode = require("vscode");
const cp = require("child_process");
const util = require("util");
const path = require("path");
const os = require("os");

const exec = util.promisify(cp.exec);

const whenContext = "QuickStageFocused";

let stageFilePicker;

const isMacOS = os.platform() === "darwin";

const extPrefix = "quickStage";

const commands = {
  quickStage: `${extPrefix}.quickStage`,
  diff: `${extPrefix}.diffFile`,
  stageAll: `${extPrefix}.stageAll`,
  unstageAll: `${extPrefix}.unstageAll`,
};

// symbols
// ⌘
// ⌥
// ^
// ⇧

function activate(context) {
  context.subscriptions.push(
    // UI
    stageFilePicker,

    // |---------------------------|
    // |        Open Picker        |
    // |---------------------------|

    vscode.commands.registerCommand(commands.quickStage, async () => {
      // set When context
      vscode.commands.executeCommand("setContext", whenContext, true);

      // get CWD
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder is open.");
        return;
      }

      //   Get Changes
      // ---------------

      async function getChanges() {
        try {
          // Run the Git command from the workspace root
          const { stdout } = await exec(
            "git status --porcelain --untracked-files=all",
            { cwd: workspaceFolder }
          );

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
        }
      }

      //   Create Picker
      // -----------------

      stageFilePicker = vscode.window.createQuickPick();
      stageFilePicker.keepScrollPosition = true;
      stageFilePicker.placeholder = "Select a file to Stage or Unstage ...";

      // |-----------------------|
      // |        Feature        |
      // |-----------------------|
      //   if multiple git repositories, select which repository

      //   Get Changes
      // ---------------

      let changes = await getChanges();
      if (changes === undefined) {
        return; // exit
      } else if (changes.length === 0) {
        vscode.window.showInformationMessage("No Changes");
        return; // no changes. exit.
      }

      //   Stage Toggler
      // -----------------

      async function stageFile(filepath, notStaged) {
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
      }

      //   Update UI
      // -------------

      let showingUnstageAll;
      stageFilePicker.updateItems = async (changes) => {
        const prevShowingUnstageAll = showingUnstageAll;

        stageFilePicker.value = "";

        if (!changes) {
          changes = await getChanges();
        }
        changes = changes.map(createQuickPickItem);

        const unstagedChanges = changes.filter((change) => change.notStaged);
        const stagedChanges = changes.filter((change) => !change.notStaged);

        const unstageAllItem = {
          description: `      Unstage All Changes (${
            isMacOS ? "⌘⇧U" : "Shift+Ctrl+U"
          })`,
          command: commands.unstageAll,
        };
        showingUnstageAll = false;

        const unstagedChangesGroup = [];

        if (stagedChanges.length > 0) {
          unstagedChangesGroup.push(unstageAllItem);
          showingUnstageAll = true;
        }
        unstagedChangesGroup.push({
          // separator
          label: `Changes (${unstagedChanges.length})`,
          kind: vscode.QuickPickItemKind.Separator,
        });

        unstagedChangesGroup.push(...unstagedChanges);

        const stageAllItem = {
          description: `      Stage All Changes (${
            isMacOS ? "⌘⇧S" : "Shift+Ctrl+S"
          })`,
          command: commands.stageAll,
        };

        const stagedChangesGroup = [];

        if (unstagedChanges.length > 0) {
          stagedChangesGroup.push(stageAllItem);
        }

        stagedChangesGroup.push({
          // separator
          label: `Staged Changes (${stagedChanges.length})`,
          kind: vscode.QuickPickItemKind.Separator,
        });

        stagedChangesGroup.push(...stagedChanges);

        stageFilePicker.items = [
          ...stagedChangesGroup,
          ...unstagedChangesGroup,
        ];

        // set active item
        let start = 0;
        let newSelection = stageFilePicker.items[start];

        // skip over stageAllItem
        if (newSelection.command === commands.stageAll) {
          newSelection = stageFilePicker.items[++start];
        }
        // skip over Stage separator
        if (newSelection.kind === vscode.QuickPickItemKind.Separator) {
          newSelection = stageFilePicker.items[++start];
        }
        // skip over Unstage separator
        if (newSelection.kind === vscode.QuickPickItemKind.Separator) {
          newSelection = stageFilePicker.items[++start];
        }

        stageFilePicker.activeItems = [newSelection];

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
          if (selection.command === commands.stageAll) {
            //   selected stageAll
            vscode.commands.executeCommand(commands.stageAll);
          } else if (selection.command === commands.unstageAll) {
            //   selected unstageAll
            vscode.commands.executeCommand(commands.unstageAll);
          } else {
            //   selected a file
            // -------------------

            // store the index of the current selection
            let selectionIndex = stageFilePicker.items.findIndex(
              (item) => item.filepath === selection.filepath
            );

            const prevShowingUnstageAll = showingUnstageAll;

            await stageFile(selection.filepath, selection.notStaged);
            await stageFilePicker.updateItems();

            // // set the active item to the saved index
            // // this keeps the selector from jumping around
            if (prevShowingUnstageAll !== showingUnstageAll) {
              if (!prevShowingUnstageAll && showingUnstageAll) {
                selectionIndex++;
              }
            }

            let newSelection = stageFilePicker.items[selectionIndex];
            // skip over unstageAllItem
            if (newSelection.command === commands.unstageAll) {
              newSelection = stageFilePicker.items[++selectionIndex];
            }
            // skip over separators
            if (newSelection.kind === vscode.QuickPickItemKind.Separator) {
              newSelection = stageFilePicker.items[++selectionIndex];
            }
            stageFilePicker.activeItems = [newSelection];
          }
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

      stageFilePicker.show(); // show the picker!
    }),


    // |----------------------------------------|
    // |        Commands for keybindings        |
    // |----------------------------------------|

    //   Diff File
    // -------------

    vscode.commands.registerCommand(commands.diff, () => {
      console.log("diffFile()");
      if (stageFilePicker) {
        stageFilePicker.diffFile();
      }
    }),

    //   Stage All
    // -------------

    vscode.commands.registerCommand(commands.stageAll, () => {
      vscode.commands.executeCommand("git.stageAll");
      setTimeout(() => {
        if (stageFilePicker) {
          stageFilePicker.updateItems();
        }
      }, 30);
    }),

    //   Unstage All
    // ---------------

    vscode.commands.registerCommand(commands.unstageAll, () => {
      vscode.commands.executeCommand("git.unstageAll");
      setTimeout(() => {
        if (stageFilePicker) {
          stageFilePicker.updateItems();
        }
      }, 30);
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
