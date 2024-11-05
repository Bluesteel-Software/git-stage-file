# Git QuickStage
⌨️ Preview and Stage files using only your keyboard.

---

## Usage
 
### Open: 
Open QuickStage using `⌘S` / `Ctrl+S` while focused on the SCM sidebar

or you might add a custom keybinding:
```
{
    "key": "your-keybinding",
    "command": "quickStage.quickStage"
},
```

### Controls:

`UP` / `DOWN` => Select a file to preview

`Enter` => Stage / Unstage a file

`Space` => Open a Diff Editor for the selected file in the background

`Delete` or `⌘Backspace` / `Ctrl+backspace` => Discard the File Changes

`⌘O` / `Ctrl+O` => Open the File in a normal editor

`⌘C` / `Ctrl+C` => Focus the SCM Sidebar

`⌘⇧S` / `Shift+Ctrl+S` => Stage All Files

`⌘⇧U` / `Shift+Ctrl+U` => Unstage All Files

`Escape` => close QuickStage.


## Settings

### Focus SCM Sidebar:
 
By default, **Quick Stage** will automatically shift focus to the SCM Sidebar when **Quick Stage** is closed.
#### `focusScmSidebarOnExit`
You may turn this off with `"quickStage.focusScmSidebarOnExit": false`

Note: To ensure that Focus always goes to the Commit input box also add:
- `"scm.autoReveal": false,` 


----
### Preview Mode:

By default, **Quick Stage** will open a diff preview of the current selection.

 **Quick Stage** comes with two settings to customize your preview experience:
 
 #### `previewDiff`
 
 Setting `"quickStage.previewDiff": false,` will turn off the diff previews that are shown while **Quick Stage** is open.

 #### `closePreviewOnExit`
 
 Setting `"quickStage.closePreviewOnExit": false,` will leave the diff preview open when **Quick Stage** is closed.  

Keybindings are provided so you may scroll the diff editor in the background, to review the file without closing **Quick Stage**:

- Mac: `Ctrl+UP` / `Ctrl+DOWN` 
- PC: `Alt+UP` / `Alt+DOWN`

## Troubleshooting

**Quick Stage** opens a new preview for each file, creating a lot of open tabs. 

- You probably have `"workbench.editor.enablePreview"` set to `false`. Try setting this to `true`.

---
Focusing the SCM Sidebar moves focus to the SCM view but not to the Commit input box

- Please ensure you have set `"scm.autoReveal": false,`

---
Why do Some Diff editors remain open while some are closed? 
- **Quick Stage** opens the diff files in VS Code's 'preview' mode, which swaps out the file without opening a new tab. When `quickStage.closePreviewOnExit` is true, these 'preview' editors will be closed. *However*, any diff editor that is opened by pressing `Space` is **NOT** in 'preview' mode and these diff editors will persist after **Quick Stage** is closed even if `quickStage.closePreviewOnExit` is set to `true`.


----
**Quick Stage** not working with multiple repos in the workspace

- Quick Stage should now work with multiple repositories in the workspace! But I have not done alot of testing with this. Please let me know if you have any issues with multiple repositories


----
#### Let me know if there are any improvements or ideas for this extension!
