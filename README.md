# Git QuickStage

⌨️ Preview and Stage files using the keyboard.

[For a detailed article on what you can do with **Quick Stage** go here!](https://medium.com/vs-code-keybindings/staging-files-in-vs-code-with-the-keyboard-2a80d3dc035c)

---

## Usage
 
### Open: 
There are two ways to open **Quick Stage**.

- **(⌘S)** \ **(Ctrl+S)** which works whenever you are focused on the SCM sidebar view

- **(⌘⌥S)** \ **(Ctrl+Alt+S)** Which works at any time

If **(⌘⌥S)** does not work or conflicts with one our your keybindings you can change this in the keybindings GUI. Search for `quickStage`


### Controls:

**(UP)** \ **(DOWN)** => Select a file to preview

**(Enter)** => Stage \ Unstage a file

**(Space)** => Open a Diff Editor for the selected file in the background

**(Delete)** -or- **(⌘Backspace)** \ **(Ctrl+backspace)** => Discard the File Changes

**(⌘O)** \ **(Ctrl+O)** => Open the File in a normal editor

**(⌘⇧S)** \ **(Shift+Ctrl+S)** => Stage All Files

**(⌘⇧U)** \ **(Shift+Ctrl+U)** => Unstage All Files

**(Escape)** => Close QuickStage.

#### Scroll the Editor in the background:

Mac: **(Option)** + [ **(UP)**, **(DOWN)**, **(LEFT)**, or **(RIGHT)** ]

PC: **(Alt)** + [ **(UP)**, **(DOWN)**, **(LEFT)**, or **(RIGHT)** ]


## Settings

### Close Sidebars When Quick Stage is Opened:

#### `closeSidebarsOnOpen`
**Quick Stage** automatically closes the Sidebar, AuxBar, and Panel when opened to make viewing file diffs easier.
This feature is ignored if `previewDiff` is turned off. 

Turn off this feature with: `"quickStage.closeSidebarsOnOpen": false,`

### AutoFocus the SCM Sidebar:
 
#### `focusScmSidebarOnExit`
**Quick Stage** will automatically shift focus to the SCM view when **Quick Stage** is closed.

**Quick Stage** will **NOT** auto focus the SCM view if you open a file **(⌘O)** or diff a file **(Space)**.

Turn off this feature with: `"quickStage.focusScmSidebarOnExit": false`

Note: To ensure that Focus always moves to the Commit input box when opening the SCM view add `"scm.autoReveal": false,` to your `settings.json`

If you choose to turn this feature off, you may also use the default command **(⌘^G)** => `"workbench.view.scm"`  to move focus to the SCM view. You can change this command to anything you would like with:
```
  {
    "key": "your+keybinding",
    "command": "workbench.view.scm",
    "when": "workbench.scm.active"
  },
```

----
### Preview Mode:
**Quick Stage** comes with two settings to customize the Preview behaviour:

#### `previewDiff`
**Quick Stage** opens a diff preview of the selected file in the background while **Quick Stage** is open.

The **Scroll Keybindings** are provided so you can review the previewed file without closing **Quick Stage**.

Turn off this feature with: `"quickStage.previewDiff": false,`

#### `closePreviewOnExit`
**Quick Stage** automatically closes the Preview Editor when exited to keep the workspace clean.
 
Turn off this feature with: `"quickStage.closePreviewOnExit": false,`
 

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
