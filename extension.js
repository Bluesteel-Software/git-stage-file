const vscode = require("vscode");
const cp = require("child_process");
const util = require("util");
const path = require("path");
const os = require("os");

const exec = util.promisify(cp.exec);
const isMacOS = os.platform() === "darwin";


let stageFilePicker;

const whenContext = "QuickStageFocused";

const extPrefix = "quickStage";

const commands = {
  quickStage: `${extPrefix}.quickStage`,
  focusQuickStage: `${extPrefix}.focusQuickStage`,
  diff: `${extPrefix}.diffFile`,
  stageAll: `${extPrefix}.stageAll`,
  unstageAll: `${extPrefix}.unstageAll`,
};

const STATUS = [
  'INDEX_MODIFIED',   // 0
  'INDEX_ADDED',      // 1
  'INDEX_DELETED',    // 2
  'INDEX_RENAMED',    // 3
  'INDEX_COPIED',     // 4
  'MODIFIED',         // 5
  'DELETED',          // 6
  'UNTRACKED',        // 7
  'IGNORED',          // 8
  'INTENT_TO_ADD',    // 9
  'INTENT_TO_RENAME',  // 10
  'TYPE_CHANGED',      // 11
  'ADDED_BY_US',       // 12
  'ADDED_BY_THEM',     // 13
  'DELETED_BY_US',     // 14
  'DELETED_BY_THEM',   // 15
  'BOTH_ADDED',        // 16
  'BOTH_DELETED',      // 17
  'BOTH_MODIFIED'      // 18
];













async function activate(context) {
  context.subscriptions.push(
    // UI
    stageFilePicker,

    vscode.commands.registerCommand(commands.quickStage, async () => {
      // |-----------------------------|
      // |      QuickStagePicker       |
      // |-----------------------------|

      // set When context
      vscode.commands.executeCommand("setContext", whenContext, true);

      // get CWD
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder is open.");
        return;
      }

      const gitAPI = vscode.extensions
        .getExtension("vscode.git")
        .exports.getAPI(1);

      const repositories = gitAPI.repositories;
      // |-----------------------|
      // |        Feature        |
      // |-----------------------|
      //   if multiple git repositories, select which repository

      const selectedRepo = repositories[0];
      console.log("repo",selectedRepo);


      //   Get Changes
      // ---------------

      function getChanges() {
        return {
          unstagedChanges: selectedRepo.state.workingTreeChanges,
          stagedChanges: selectedRepo.state.indexChanges,
        };
      }

      //   Create Picker
      // -----------------

      stageFilePicker = vscode.window.createQuickPick();
      stageFilePicker.keepScrollPosition = true;
      stageFilePicker.ignoreFocusOut = true;
      stageFilePicker.placeholder = "Select a file to Stage or Unstage ...";

      //   Get Changes
      // ---------------

      let { stagedChanges, unstagedChanges } = await getChanges();
      if (stagedChanges === undefined && unstagedChanges == undefined) {
        return; // exit
      } else if (unstagedChanges.length === 0 && stagedChanges.length === 0) {
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
      stageFilePicker.updateItems = async () => {
        const prevShowingUnstageAll = showingUnstageAll;

        stageFilePicker.value = "";

        // get changes
        const { stagedChanges, unstagedChanges } = getChanges();

        console.log("stagedChanges", stagedChanges);
        console.log("unstagedChanges", unstagedChanges);

        // create quickPick items
        const stagedItems = stagedChanges.map(createQuickPickItem);
        const unstagedItems = unstagedChanges.map(createQuickPickItem);

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

        unstagedChangesGroup.push(...unstagedItems);

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

        stagedChangesGroup.push(...stagedItems);

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

      stageFilePicker.updateItems(); // update UI with files

      stageFilePicker.diffFile = async () => {
        const [selection] = stageFilePicker.activeItems;
        const resource=selection.resource.resource
        vscode.commands.executeCommand(
          "vscode.diff",
          resource.leftUri,
          resource.rightUri,
        );
      };
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

    vscode.commands.registerCommand(commands.focusQuickStage, () => {
      console.log("focusing on quickPick");

      if (stageFilePicker) {
        vscode.commands.executeCommand("quickInput.first")
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
      }, 500);
    }),

    //   Unstage All
    // ---------------

    vscode.commands.registerCommand(commands.unstageAll, () => {
      vscode.commands.executeCommand("git.unstageAll");
      setTimeout(() => {
        if (stageFilePicker) {
          stageFilePicker.updateItems();
        }
      }, 500);
    })
  );
}

function createQuickPickItem(resource) {
  const filepath = resource.uri.fsPath;
  const directory = path.dirname(filepath);
  const file = path.basename(filepath);

  // const untracked = fileStatus[0] === "?" && fileStatus[1] === "?";
  // const notStaged = untracked || fileStatus[0] === " ";

  const stageSymbol = resource.status < 5 ? "$(remove)" : "$(add)";
  const label = `${stageSymbol} ${file}`;
  // const description = `${fileStatus[notStaged ? 1 : 0]}${
  //   directory === "." ? "" : `      ${directory}${path.sep}`
  // }`;
  const description = `      ${directory}${path.sep}`;

  return {
    label,
    description,
    resource,
  };
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
