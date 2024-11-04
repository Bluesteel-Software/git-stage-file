# Git QuickStage

Preview and Stage files using only your keyboard.
⌨️

## Usage
 
### Open: 
Open QuickStage using `⌘S` / `Ctrl+S` while focused on the SCM sidebar

or you might add something like this:
```
{
    "key": "your-keybinding",
    "command": "quickStage.quickStage",
    "when": "editorFocus"
},
```

### Controls:

`UP` and `DOWN` to select a file to preview

`Enter` => Close QuickStage and shift focus to the diff editor

`Space` => Stage / Unstage a file

`Delete` or `⌘Backspace` / `Ctrl+backspace` => Discard the File Changes

`⌘O` / `Ctrl+O` => Open the File in a normal editor

`⌘⇧S` / `Shift+Ctrl+S` => Stage All Files

`⌘⇧U` / `Shift+Ctrl+U` => Unstage All Files

`Escape` => close QuickStage.

### Preview Mode:

By default, **Quick Stage** will open a diff preview of whatever file is hightlighted.

Keybindings are added so you may scroll the diff editor in the background, So you may quickly review the file without closing **Quick Stage**

- Mac: `Ctrl+UP` and `Ctrl+DOWN` or

- PC: `Alt+UP` and `Alt+DOWN`



You may turn Preview Mode off in settings by searching for `quickstage preview diff` or by adding `"quickStage.previewDiff": false,` to your `settings.json`.

note:

`"workbench.editor.enablePreview"` is `true` by default, but if you have this set to `false`, each preview will open in a new tab, and it will be quite annoying...



---

- Quick Stage now works with multiple repositories in the workspace!
- Quick Stage

Let me know if there are any improvements that could be made to this extension!
