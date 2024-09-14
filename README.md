# Git QuickStage File Picker

An extension that provides a **QuickPick** interface to easily stage or unstage individual files in your Git repository using only the keyboard.

## Usage

The QuickStage picker can be opened by pressing (Ctrl+S) on Windows/Linux or (⌘S) macOS while focused on the SCM (git) Sidebar view.

The QuickStage picker will show all changes in the current repository,

You may search for a file by typing in the input box, or navigate with the `UP` and `DOWN` keys.

pressing `Enter` on a file will Stage/Unstage that file.

The QuickStage picker will remain open, allowing you to stage multiple files at a time,

Pressing `Escape` will close the QuickStage picker and shift focus to the SCM (git) Sidebar view. Allowing you to input a Commit message.

### Stage/Unstage All
This UI is all about using the keyboard so the following keybindings are available when the QuickStage picker is open.
- **Stage All**: (Shift+Ctrl+S) Windows/Linux or (⌘⇧S) macOS
- **Unstage All**: (Shift+Ctrl+U) Windows/Linux or (⌘⇧U) macOS

## Requirements

- Git must be installed and available in your system’s PATH.
- A Git-enabled project in your workspace.

## Known Issues

- The extension currently only supports a single Git repository in the CWD.

## Release Notes

### v0.1.0

- Initial release of **Git QuickStage picker**.


----

### Tips

You may also open the QuickStage picker directly, without opening the SCM sidebar first by:

- Using the **Command Palette** (Ctrl+Shift+P) or (⌘⇧P) and searching for 'QuickStage picker'

- Saving a Keybinding to open the QuickStage picker directly, in keybindings.json.

```

// choose your desired keybinding
{
    "key": "cmd+shift+t",
    "command": "gitStageFile.quickStage",
},
...

```



Please let me know if there are any improvements that could be made to this extension!
