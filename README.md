# Git Stage File Picker

An extension that provides a **QuickPick** interface to easily stage or unstage individual files in your Git repository using only the keyboard.

## Usage

The Stage File Picker can be opened by pressing `(Ctrl+S)` or `(⌘S)` while focused on the SCM (git) Sidebar view.

The Stage File Picker will show all changes in the current repository,
pressing `Enter` on a file will Stage/Unstage that file depending on it's current state.

You may search for a file by typing in the input box.

The Stage File Picker will remain open, allowing you to stage multiple files at a time,

Pressing `Escape` will close the Stage File Picker and shift focus to the SCM (git) Sidebar view. Allowing you to input a Commit message.

### Stage/Unstage All
This UI is all about using the keyboard so the following keybindings are available when the Stage File Picker is open.
- **Stage All**: `Shift+Ctrl+S` (Windows/Linux) or `⌘⇧S` (macOS)
- **Unstage All**: `Shift+Ctrl+U` (Windows/Linux) or `⌘⇧U` (macOS)

## Requirements

- Git must be installed and available in your system’s PATH.
- A Git-enabled project in your workspace.

## Known Issues

- The extension currently only supports a single Git repository in the CWD.

## Release Notes

### v0.1.0

- Initial release of **Git Stage File Picker**.


----

### Tips

You may also open the Stage File Picker directly, without opening the SCM sidebar first by:

- Using the **Command Palette** `(Ctrl+Shift+P)` or `(⌘⇧P)` and searching for 'Stage File Picker'

- Saving a Keybinding to open the Stage File Picker directly, in keybindings.json.

```

// choose your desired keybinding
{
    "key": "cmd+shift+t",
    "command": "gitStageFile.openPicker",
},
...

```



Please let me know if there are any improvements that could be made to this extension!
