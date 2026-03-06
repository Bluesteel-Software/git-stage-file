const vscode = require("vscode");
const cp = require("child_process");
const util = require("util");
const path = require("path");
const os = require("os");

const exec = util.promisify(cp.exec);
const execFile = util.promisify(cp.execFile);
const isMacOS = os.platform() === "darwin";

let stageFilePicker;
let repoEventListener;
let updateTimer;
let fileWasOpened;

const extPrefix = "quickStage";
const whenContext = "QuickStageVisible";
const KEYS = {
  closeSidebarsOnOpen: 'closeSidebarsOnOpen',
  closePreviewOnExit: 'closePreviewOnExit',
  focusScmSidebarOnExit: 'focusScmSidebarOnExit',
  passFocusOnOpenDiff: 'passFocusOnOpenDiff',
  previewDiff: 'previewDiff',
}
const COMMANDS = {
  quickStage: `${extPrefix}.quickStage`,
  openDiff: `${extPrefix}.openDiff`,
  discardChanges: `${extPrefix}.discardChanges`,
  openFile: `${extPrefix}.openFile`,
  stageAll: `${extPrefix}.stageAll`,
  unstageAll: `${extPrefix}.unstageAll`
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
  // Helpers: compute changed ranges for the active editor by running
  // `git diff -U0 HEAD -- <file>` (safe execFile usage). For files
  // missing in HEAD (new/untracked) treat the whole file as changed.
  async function getChangedRangesForEditor(editor){
    if (!editor) return [];
    const doc = editor.document;
    if (!stageFilePicker || !stageFilePicker.repository) return [];
    const repoRoot = stageFilePicker.repository.rootUri.fsPath;

    // For git: URIs the original fsPath is stored in the query when we
    // created the HEAD URI. Prefer that if present.
    let fsPath = doc.uri.fsPath;
    if (doc.uri.scheme === 'git' && doc.uri.query){
      try{
        const q = JSON.parse(doc.uri.query);
        if (q && q.path) fsPath = q.path;
      }catch(e){}
    }

    const relPath = path.relative(repoRoot, fsPath).replace(/\\/g,'/');

    // If HEAD doesn't exist for this path, treat whole file as changed
    try{
      await execFile('git',['cat-file','-e',`HEAD:${relPath}`], { cwd: repoRoot });
    }catch(err){
      // HEAD missing -> entire file
      return [{ start: 0, end: Math.max(0, doc.lineCount - 1) }];
    }

    // Get diffs with zero context to make hunks compact
    try{
      const { stdout } = await execFile('git', ['diff','-U0','HEAD','--', relPath], { cwd: repoRoot });
      const ranges = [];
      const hunkRe = /@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/g;
      let m;
      while ((m = hunkRe.exec(stdout)) !== null){
        const start = parseInt(m[1],10); // 1-based
        const count = m[2] ? parseInt(m[2],10) : 1;
        const s0 = Math.max(0, start - 1);
        const e0 = Math.max(0, s0 + Math.max(1,count) - 1);
        ranges.push({ start: s0, end: e0 });
      }
      if (ranges.length === 0){
        // No hunks -> nothing changed (or binary) -> treat whole file conservatively
        return [{ start: 0, end: Math.max(0, doc.lineCount - 1) }];
      }
      return ranges;
    }catch(err){
      return [{ start: 0, end: Math.max(0, doc.lineCount - 1) }];
    }
  }

  async function jumpToChange(editor, direction){
    if (!editor) return;
    const visible = editor.visibleRanges;
    if (!visible || visible.length === 0) return;
    const visStart = visible[0].start.line;
    const visEnd = visible[visible.length - 1].end.line;
    const visHalf = Math.floor((visStart + visEnd) / 2);
    const visLines = visEnd - visStart + 1;
    const ranges = await getChangedRangesForEditor(editor);
    if (!ranges || ranges.length === 0) return;

    let targetRange = null;
    if (direction === 'next'){
      for (const r of ranges){
        if (r.start > visHalf) {
          targetRange = r;
          break;
        } else if (r.end > visEnd) {
          targetRange = { start: visEnd, end: r.end };
          break;
        }
      }
    } else { // prev
      for (let i = ranges.length - 1; i >= 0; i--){
        const r = ranges[i];
        if (r.start < visStart - visLines) {
          targetRange = { start: visStart - visLines + 20, end: r.end };
          break;
        } else if (r.start < visStart) {
          targetRange = r;
          break;
        }
      }
    }

    if (!targetRange) return;
    const targetLine = Math.max(0, targetRange.start - 10);
    const pos = new vscode.Position(targetLine, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.AtTop);
  }

  context.subscriptions.push(

    stageFilePicker,
    repoEventListener,

    // |--------------------------|
    // |        QuickStage        |
    // |--------------------------|

    vscode.commands.registerCommand(COMMANDS.quickStage, async () => {

      vscode.commands.executeCommand("setContext", whenContext, true); // set When context

      function exit(){
        if (stageFilePicker){stageFilePicker.dispose()};
        if (repoEventListener){repoEventListener.dispose()};
        vscode.commands.executeCommand("setContext", whenContext, false); // remove when context
      }

      // get gitAPI
      const gitAPI = useGitApi()
      if (!gitAPI) {
        vscode.window.showInformationMessage('SCM extension not found')
        return exit();
      }

      //   Repository
      // --------------

      const repositories = useGitApi().repositories;
      if (!repositories) {
        vscode.window.showInformationMessage('No Git repositories found')
        return exit();
      }

      let repository;
      const multipleRepositories = repositories.length > 1;
      if (multipleRepositories){
        const items = repositories.map(repo => ({
          label: path.basename(repo.rootUri.fsPath),
          description: repo.state.HEAD?.name || '',
          repository: repo
        }));
        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a repository',
        });
        if (!selected) return exit(); // exit on 'esc'
        repository = selected.repository;
      } else { // only one repository
        repository = repositories.pop();
      }

      const {stagedChanges, unstagedChanges}= getChanges()
      if (unstagedChanges.length === 0 && stagedChanges.length === 0) {
        vscode.window.showInformationMessage("No Changes");
        return exit(); // no changes. exit.
      }

      // |-------------------------------|
      // |        all systems go!        |
      // |-------------------------------|

      if (
        vscode.workspace.getConfiguration(extPrefix).get(KEYS.previewDiff, true)
        && vscode.workspace.getConfiguration(extPrefix).get(KEYS.closeSidebarsOnOpen, true)
      ){
        vscode.commands.executeCommand("workbench.action.closeSidebar");
        vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
        vscode.commands.executeCommand("workbench.action.closePanel");
      }

      repoEventListener = repository.state.onDidChange(()=>{
        if (stageFilePicker){
          if (stageFilePicker.ignoreFocusOut){stageFilePicker.ignoreFocusOut=false}
          const { stagedChanges, unstagedChanges} = getChanges()
          if (
            stagedChanges.length !== stageFilePicker.stagedChanges.length ||
            unstagedChanges.length !== stageFilePicker.unstagedChanges.length
          ) {
            if (updateTimer){
              clearTimeout(updateTimer)
            }
            updateTimer = setTimeout(() => {
              const index = stageFilePicker.selectionIndex
              stageFilePicker.updateItems(index ? index : 0);
              stageFilePicker.selectionIndex = null
            }, 50);
          }
        }
      })

      //   Create Picker
      // -----------------

      stageFilePicker = vscode.window.createQuickPick();

      stageFilePicker.keepScrollPosition = true;
      stageFilePicker.placeholder = "Select a file to Stage or Unstage ...";
      stageFilePicker.repository = repository;
      stageFilePicker.stagedChanges = stagedChanges;
      stageFilePicker.unstagedChanges = unstagedChanges;
      stageFilePicker.onDidTriggerItemButton(({button, item}) => button.trigger(item));

      // Minimal commit message logic
      function getAllFilenames() {
        return [
          ...stageFilePicker.stagedChanges,
          ...stageFilePicker.unstagedChanges
        ].map(r => path.basename(r.uri.fsPath).toLowerCase());
      }

      function updateItems() {
        const filenames = getAllFilenames();
        const value = stageFilePicker.value.trim().toLowerCase();
        let matchCount = 0;
        if (value) {
          matchCount = filenames.filter(f => f.includes(value)).length;
        }
        if (!value || matchCount > 0) {
          // Normal file list
          const stagedItems = stageFilePicker.stagedChanges.map(file => ({ label: path.basename(file.uri.fsPath) }));
          const unstagedItems = stageFilePicker.unstagedChanges.map(file => ({ label: path.basename(file.uri.fsPath) }));
          stageFilePicker.items = [...stagedItems, ...unstagedItems];
        } else {
          // Show commit message option
          stageFilePicker.items = [{ label: `$(edit) Enter commit message: "${stageFilePicker.value}"`, alwaysShow: true, commitMsg: stageFilePicker.value }];
        }
      }

      stageFilePicker.onDidChangeValue(updateItems);

      stageFilePicker.onDidAccept(() => {
        const [item] = stageFilePicker.selectedItems;
        if (item && item.commitMsg !== undefined) {
          // Set commit message in SCM input box
          const gitAPI = useGitApi();
          if (gitAPI && gitAPI.repositories && gitAPI.repositories.length > 0) {
            const repo = stageFilePicker.repository || gitAPI.repositories[0];
            if (repo && repo.inputBox) {
              repo.inputBox.value = item.commitMsg;
              // Move cursor to end
              const len = item.commitMsg.length;
              // VS Code API does not expose direct selection, but setting value then focusing works
              setTimeout(() => {
                vscode.commands.executeCommand('workbench.scm.focus');
                // Some SCM providers may not focus input, so try again
                setTimeout(() => {
                  // Try to move cursor to end by re-setting value
                  repo.inputBox.value = item.commitMsg;
                }, 50);
              }, 50);
            }
          }
          stageFilePicker.hide();
        }
      });

      updateItems();


      //   Update UI
      // -------------

      stageFilePicker.updateItems = (index=0) => {
        // reset typed input
        stageFilePicker.value = "";

        const { stagedChanges, unstagedChanges } = getChanges()
        // changes might be discarded...
        if (unstagedChanges.length === 0 && stagedChanges.length === 0) {
          return exit(); // no changes. exit.
        }
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
          command: COMMANDS.stageAll,
        };
        const unstageAllItem = {
          description: `      Unstage All Changes (${
            isMacOS ? "⌘⇧U" : "Shift+Ctrl+U"
          })`,
          command: COMMANDS.unstageAll,
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

        //   set active item
        // -------------------
        while (
          index >= stageFilePicker.items.length ||
          stageFilePicker.items[index].command === COMMANDS.unstageAll
        ) {index--};
        while (
          stageFilePicker.items[index].command === COMMANDS.stageAll ||
          stageFilePicker.items[index].kind === vscode.QuickPickItemKind.Separator
        ) {index++};
        stageFilePicker.activeItems = [stageFilePicker.items[index]];
      };

      stageFilePicker.updateItems();
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
        let directory = path.relative(repository.rootUri.fsPath, path.dirname(resource.uri.fsPath));
        if (directory !== "") directory = `${directory}${path.sep}`;
        const file = path.basename(filepath);
        const isStaged =  resource.status < 5;
        const stageSymbol = isStaged ? "diff-remove" : "diff-insert";
        const statusSymbol = STATUS_SYMBOLS[resource.status]
        const label = `$(${stageSymbol}) ${file}`;
        const description = `     ${statusSymbol ? statusSymbol : " "}     ${directory}`;

        let buttons = []
        // add discard changes only for unstaged files
        if (!isStaged){
          // discard Changes
          buttons.push({
            iconPath: new vscode.ThemeIcon("discard"),
            tooltip: "Discard Changes (Delete)",
            trigger: () => {
              vscode.commands.executeCommand(COMMANDS.discardChanges)
            }
          })
        }
        buttons = [
          ...buttons,
          // go to file
          {
            iconPath: new vscode.ThemeIcon("go-to-file"),
            tooltip: `Open File (${isMacOS ? "⌘O" : "Ctrl+O"})`,
            trigger: (selection) => {
              stageFilePicker.openFile(selection)
            }
          },
          // toggle stage
          {
            iconPath: new vscode.ThemeIcon(stageSymbol),
            tooltip: `${isStaged ? "Unstage" : "Stage"} File (Enter)`,
            trigger: (selection) => {
              stageFilePicker.toggleStage(selection)
            }
          },
        ]
        return {
          label,
          description,
          resource,
          buttons,
        };
      }

      //   Stage File
      // --------------

      stageFilePicker.toggleStage = async (selection) => {
        const isStaged = selection.resource.status < 5
        if (isStaged){
          vscode.commands.executeCommand("git.unstage",selection.resource.uri)
        }else{
          vscode.commands.executeCommand("git.stage",selection.resource.uri)
        }

        let selectionIndex = stageFilePicker.items.findIndex(
          (item) => item.resource && item.resource.uri.fsPath === selection.resource.uri.fsPath
        );

        // if staging a file, move the index to the next item
        if (!isStaged){
          selectionIndex++;
        }

        // if the "unstageAll item" is added to the list
        // the desired target item is pushed down by one index
        if (stageFilePicker.stagedChanges.length === 0) {
          selectionIndex++;
        }

        // store the selectionIndex for use in repoEventListener()
        stageFilePicker.selectionIndex = selectionIndex
      }

      fileWasOpened = false;

      //   Discard File
      // ----------------

      stageFilePicker.discardFile = (selection) => {
        cp.exec(
          `git restore "${selection.resource.uri.fsPath}"`,
          { cwd: repository.rootUri.fsPath }
        );
      }

      //   Open File
      // -------------

      stageFilePicker.openFile = (selection) => {
        fileWasOpened = true
        vscode.commands.executeCommand("vscode.open", selection.resource.uri, { preview: false});
      }

      //   Diff File
      // -------------

      stageFilePicker.diffFile = (selection, options={}) => {

      // thanks @anatolytimonin and @dannypernik for all your help here!

        const fileUri = selection.resource.uri;
        if (selection.resource.status === 1 || selection.resource.status === 7) {
          vscode.commands.executeCommand(
            "vscode.open",
            fileUri,
            options
          );
        } else {
          const headFileUri = fileUri.with({
            scheme: 'git',
            query: JSON.stringify({
              path: fileUri.fsPath,
              ref: 'HEAD'
            })
          });

          vscode.commands.executeCommand(
            "vscode.diff",
            headFileUri,
            selection.resource.uri,
            '',
            options
          );
        }
      }

      // |------------------------------|
      // |        Input Handling        |
      // |------------------------------|

      //   on Arrow Keys
      // -----------------

      stageFilePicker.onDidChangeActive(([selection]) => {
        // preview the diff for the selected file
        if (!selection) return;
        if (vscode.workspace.getConfiguration(extPrefix).get(KEYS.previewDiff, true) && selection.resource){
          stageFilePicker.diffFile(selection,{
              preview: true,
              preserveFocus: true
          });
        }
      });

      //   on Enter
      // ------------

      // these are both called on 'enter' when .canSelectMany is false
      // except .onDidAccept() is not passed .activeItems as params

      // stageFilePicker.onDidAccept();
      stageFilePicker.onDidChangeSelection(([selection]) => {
        if (selection) {
          switch (selection.command) {
            case COMMANDS.stageAll: // selection was stageAll
              vscode.commands.executeCommand(COMMANDS.stageAll);
              break;
            case COMMANDS.unstageAll: // selection was unstageAll
              vscode.commands.executeCommand(COMMANDS.unstageAll);
              break;
            default: // selection was a file
              stageFilePicker.toggleStage(selection)
            break;
          }
        }
      });

      //   on Esc
      // ----------

      stageFilePicker.onDidHide(() => {
        exit();

        if (vscode.workspace.getConfiguration(extPrefix).get(KEYS.closePreviewOnExit, true)){
          const tabs = vscode.window.tabGroups.activeTabGroup.tabs
          tabs.forEach((tab) => {
            if (tab.isPreview){
              vscode.window.tabGroups.close(tab);
            }
          })
        }

        if (!fileWasOpened && vscode.workspace.getConfiguration(extPrefix).get(KEYS.focusScmSidebarOnExit, true)){
          vscode.commands.executeCommand("workbench.scm.focus");
        }
      })

    }),

    //   on Space
    // ------------

    vscode.commands.registerCommand(COMMANDS.openDiff, () => {
      if (stageFilePicker) {
        const [selection] = stageFilePicker.activeItems
        if (selection){
          switch (selection.command) {
            case COMMANDS.stageAll:
              return; // do nothing
            case COMMANDS.unstageAll:
              return; // do nothing
            default:
              fileWasOpened = true
              stageFilePicker.diffFile(selection,
                {
                  preview: false,
                  preserveFocus: !vscode.workspace.getConfiguration(extPrefix).get(KEYS.passFocusOnOpenDiff, false),
                });
            break;
          }
        }
      }
    }),

    //   on Delete
    // -------------

    vscode.commands.registerCommand(COMMANDS.discardChanges, () => {
      if (stageFilePicker){
        stageFilePicker.ignoreFocusOut = true;
        const [selection] = stageFilePicker.activeItems;
        if (selection){
          switch (selection.command) {
            case COMMANDS.stageAll:
              return; // do nothing
            case COMMANDS.unstageAll:
              return; // do nothing
            default:
              stageFilePicker.discardFile(selection)
            break;
          }
        }
      }
    }),

    vscode.commands.registerCommand(COMMANDS.openFile, () => {
      if (stageFilePicker){
        stageFilePicker.ignoreFocusOut = false;
        const [selection] = stageFilePicker.activeItems;
        if (selection){
          switch (selection.command) {
            case COMMANDS.stageAll:
              return; // do nothing
            case COMMANDS.unstageAll:
              return; // do nothing
            default:
              stageFilePicker.openFile(selection)
            break;
          }
        }
      }
    }),

    vscode.commands.registerCommand(COMMANDS.stageAll, () => {
      if (stageFilePicker) {
        if (stageFilePicker.multipleRepositories){
          vscode.commands.executeCommand("git.stage", ...stageFilePicker.unstagedChanges.map(item => item.uri));
        } else {
          vscode.commands.executeCommand("git.stageAll");
        }
      }
    }),

    vscode.commands.registerCommand(COMMANDS.unstageAll, () => {
      if (stageFilePicker) {
        if (stageFilePicker.multipleRepositories){
          vscode.commands.executeCommand("git.unstage",...stageFilePicker.stagedChanges.map(item => item.uri));
        } else {
          vscode.commands.executeCommand("git.unstageAll");
        }
      }
    }),
  );
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
