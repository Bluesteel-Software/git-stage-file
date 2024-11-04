const vscode = require("vscode");
const cp = require("child_process");
const util = require("util");
const path = require("path");
const os = require("os");

const exec = util.promisify(cp.exec);
const isMacOS = os.platform() === "darwin";


let stageFilePicker;
let updateTimer;

const whenContext = "QuickStageVisible";

const extPrefix = "quickStage";

const commands = {
  quickStage: `${extPrefix}.quickStage`,
  toggleChanges: `${extPrefix}.toggleChanges`,
  discardChanges: `${extPrefix}.discardChanges`,
  scrollEditorUp: `${extPrefix}.scrollEditorUp`,
  scrollEditorDown: `${extPrefix}.scrollEditorDown`,

  stageAll: 'git.stageAll',
  unstageAll: 'git.unstageAll',
};

const STATUS_SYMBOLS = [
  // staged
  'M',  // 0
  'A',  // 1
  'D',  // 2
  'R',  // 3
  'C',  // 4

  // unstaged
  'M',  // 5
  'D',  // 6
  'U',  // 7
  'I',  // 8
];

function useGitApi (){
  return vscode.extensions
  .getExtension("vscode.git")
  .exports.getAPI(1);
}

  //   Activate
  // ------------

async function activate(context) {
  context.subscriptions.push(

    // UI
    stageFilePicker,

    // |-----------------------------|
    // |      QuickStagePicker       |
    // |-----------------------------|

    vscode.commands.registerCommand(commands.quickStage, async () => {

      // set When context
      vscode.commands.executeCommand("setContext", whenContext, true);

      // get gitAPI
      const gitAPI = useGitApi()
      if (!gitAPI) {
        vscode.window.showInformationMessage('SCM extension not found')
        return;
      }

      //   Repository
      // --------------

      const repositories = useGitApi().repositories;
      if (!repositories) {
        vscode.window.showInformationMessage('No Git repositories found')
        return;
      }

      let repository;
      if (repositories.length > 1){
        const items = repositories.map(repo => ({
          label: path.basename(repo.rootUri.fsPath),
          description: repo.state.HEAD?.name || '',
          repository: repo
        }));
        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a repository',
        });
        if (!selected) return; // exit on 'esc'
        repository = selected.repository;
      } else { // only one repository
        repository = repositories.pop();
      }

      const {stagedChanges, unstagedChanges}= getChanges()
      if (!unstagedChanges && !stagedChanges) {
        vscode.window.showInformationMessage("No Changes");
        return; // no changes. exit.
      }

      const repoEventListener = repository.repository.onDidRunOperation(()=>{
        if (stageFilePicker){
          const { stagedChanges, unstagedChanges} = getChanges()
          if (
            stagedChanges.length !== stageFilePicker.stagedChanges.length ||
            unstagedChanges.length !== stageFilePicker.unstagedChanges.length
          ) {
            if (updateTimer){
              clearTimeout(updateTimer)
            }
            updateTimer = setTimeout(() => {
              stageFilePicker.updateItems();
              const index = stageFilePicker.selectionIndex
              if ( index ){
                stageFilePicker.setActiveItem(index)
                stageFilePicker.selectionIndex = null
              }
            }, 50);
          }
        }
      })

      //   Create Picker
      // -----------------

      stageFilePicker = vscode.window.createQuickPick();
      stageFilePicker.keepScrollPosition = true;
      stageFilePicker.placeholder = "Select a file to Stage or Unstage ...";
      stageFilePicker.stagedChanges = stagedChanges
      stageFilePicker.unstagedChanges = unstagedChanges

      //   Update UI
      // -------------

      stageFilePicker.updateItems = () => {
        // reset typed input
        stageFilePicker.value = "";
        const { stagedChanges, unstagedChanges } = getChanges()
        // update changes cache
        stageFilePicker.stagedChanges = stagedChanges
        stageFilePicker.unstagedChanges = unstagedChanges
        // create quickPick items
        const stagedItems = stagedChanges.map(createQuickPickItem);
        const unstagedItems = unstagedChanges.map(createQuickPickItem);

        const stageAllItem = {
          description: `      Stage All Changes (${
            isMacOS ? "⌘⇧S" : "Shift+Ctrl+S"
          })`,
          command: commands.stageAll,
        };
        const unstageAllItem = {
          description: `      Unstage All Changes (${
            isMacOS ? "⌘⇧U" : "Shift+Ctrl+U"
          })`,
          command: commands.unstageAll,
        };

        const unstagedChangesGroup = [];
        if (stagedChanges.length > 0) {
          unstagedChangesGroup.push(unstageAllItem);
        }
        unstagedChangesGroup.push({
          // separator
          label: `Changes (${unstagedChanges.length})`,
          kind: vscode.QuickPickItemKind.Separator,
        });
        unstagedChangesGroup.push(...unstagedItems);

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

      };

      stageFilePicker.setActiveItem = (index=0) => {
        while (
          stageFilePicker.items[index].command === commands.stageAll ||
          stageFilePicker.items[index].command === commands.unstageAll ||
          stageFilePicker.items[index].kind === vscode.QuickPickItemKind.Separator
        ) { index++ };
        stageFilePicker.activeItems = [stageFilePicker.items[index]];
      }

      stageFilePicker.updateItems();
      stageFilePicker.setActiveItem();
      stageFilePicker.show();



      // |-----------------------------|
      // |        Functionality        |
      // |-----------------------------|

      function getChanges() {
        return {
          unstagedChanges: repository.state.workingTreeChanges,
          stagedChanges: repository.state.indexChanges,
        };
      }

      function createQuickPickItem(resource) {
        const filepath = resource.uri.fsPath;
        const directory = path.relative(repository.rootUri.fsPath, path.dirname(resource.uri.fsPath));
        const file = path.basename(filepath);
        const stageSymbol = resource.status < 5 ? "$(remove)" : "$(add)";
        const label = `${stageSymbol} ${file}`;
        const description = directory === "" ? "" : `      ${directory}${path.sep}`;
        return {
          label,
          description,
          resource,
        };
      }

      //   Stage File
      // --------------

      stageFilePicker.toggleStage = async (selection) => {
        const filepath = selection.resource.uri.fsPath
        const isStaged = selection.resource.status < 5
        const command = isStaged
          ? `git reset ${filepath}`
          : `git add -f ${filepath}`
        try {
          await exec(command, { cwd: repository.rootUri.fsPath });
        } catch (err) {
          console.log(err);
          vscode.window.showErrorMessage(
            `Failed to ${isStaged ? "unstage" : "stage"} file: ${path.basename(filepath)}`
          );
        }
        vscode.commands.executeCommand("git.refresh")

        // these work very intermittently maybe only with untracked files.
        // could potentially be debugged
        // if (isStaged){
        //   console.log('unstaging file',resource);
        //   vscode.commands.executeCommand("git.unstage",resource)
        // }else{
        //   console.log('staging file',resource);
        //   vscode.commands.executeCommand("git.stage",resource)
        // }

        // store the selectionIndex for use during updateItems()
        let selectionIndex = stageFilePicker.items.findIndex(
          (item) => item.resource && item.resource.uri.fsPath === selection.resource.uri.fsPath
        );
        // if the unstageAll item is added to the list
        // the desired item is pushed down by one index
        if (stageFilePicker.stagedChanges.length === 0) {
          selectionIndex++;
        }
        stageFilePicker.selectionIndex = selectionIndex
      }


      //   Discard File
      // ----------------

      stageFilePicker.discardFile = (selection) => {
        vscode.commands.executeCommand("git.clean", selection.resource.resource)
      }

      //   Open File
      // -------------



      //   Diff File
      // -------------

      stageFilePicker.diffFile = (selection, options={}) => {
        vscode.commands.executeCommand(
          "vscode.diff",
          selection.resource.resource.leftUri,
          selection.resource.resource.rightUri,
          '',
          options
        );
      }

      // |------------------------------|
      // |        Input Handling        |
      // |------------------------------|

      //   on Arrow Keys
      // -----------------

      stageFilePicker.onDidChangeActive(([selection]) => {
        if (vscode.workspace.getConfiguration(extPrefix).get('previewDiff', true) && selection.resource){
          stageFilePicker.diffFile(selection,{
              preview: true,
              preserveFocus: true
          });
        }
      });


      let acceptedSelection = false;

      //   on Enter
      // ------------

      // stageFilePicker.onDidAccept()
      stageFilePicker.onDidChangeSelection(([selection]) => {
        if (selection) {
          switch (selection.command) {
            case commands.stageAll:
              vscode.commands.executeCommand(commands.stageAll);
              break;
            case commands.unstageAll:
              vscode.commands.executeCommand(commands.unstageAll);
              break;
            default:
              // if previewing diffs
              acceptedSelection = true;
              if (vscode.workspace.getConfiguration(extPrefix).get('previewDiff', true) && selection.resource){
                // move focus to editor
                vscode.commands.executeCommand('workbench.action.keepEditor')
                vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup")
              } else {
                stageFilePicker.diffFile(selection)
              }
            break;
          }
        }
      });

      //   on Esc
      // ----------

      stageFilePicker.onDidHide(() => {
        stageFilePicker.dispose();
        repoEventListener.dispose();
        vscode.commands.executeCommand("setContext", whenContext, false); // remove when context

        // if previewing diffs do not close the diff on 'Enter'
        if (vscode.workspace.getConfiguration(extPrefix).get('previewDiff', true) && !acceptedSelection){
          const [selection] = stageFilePicker.activeItems;
          const activeEditor = vscode.window.activeTextEditor;
          if (activeEditor && activeEditor.document.uri.fsPath === selection.resource.uri.fsPath) {
            vscode.commands.executeCommand('workbench.action.closeActiveEditor');
          }
        }
      })
    }),

    //   on Space
    // ------------

    vscode.commands.registerCommand(commands.toggleChanges, () => {
      if (stageFilePicker) {
        const [selection] = stageFilePicker.activeItems
        if (selection) {
          switch (selection.command) {
            case commands.stageAll:
              vscode.commands.executeCommand(commands.stageAll);
              break;
            case commands.unstageAll:
              vscode.commands.executeCommand(commands.unstageAll);
              break;
            default:
              stageFilePicker.toggleStage(selection)
            break;
          }
        }
      }
    }),


    //   ^Up & ^Down
    // ---------------

    vscode.commands.registerCommand(commands.scrollEditorUp, () => {
      if (stageFilePicker && vscode.workspace.getConfiguration(extPrefix).get('previewDiff', true)) {
        vscode.commands.executeCommand("editorScroll",{ to: "up", by: "line"})
      }
    }),

    vscode.commands.registerCommand(commands.scrollEditorDown, () => {
      if (stageFilePicker && vscode.workspace.getConfiguration(extPrefix).get('previewDiff', true)) {
        vscode.commands.executeCommand("editorScroll",{ to: "down", by: "line"})
      }
    }),

    //   on Delete
    // -------------

    vscode.commands.registerCommand(commands.discardChanges, () => {
      if (stageFilePicker){
        const [selection] = stageFilePicker.activeItems;
        if (selection){
          switch (selection.command) {
            case commands.stageAll:
              return; // do nothing
            case commands.unstageAll:
              return; // do nothing
            default:
              stageFilePicker.discardFile(selection)
            break;
          }
        }
      }

    })


  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
