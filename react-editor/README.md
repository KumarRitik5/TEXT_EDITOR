
# Textory

A React-based, more feature-rich text editor built with Vite + Monaco Editor.

## Features

- Monaco editor (syntax highlighting, minimap, multi-cursor, built-in Find/Replace)
- Multi-tab documents
- Open / Save
	- Uses File System Access API when available (Chrome/Edge)
	- Falls back to file input + download when not available
- Autosaves your open tabs to localStorage
- Theme toggle (dark/light)
- Font size, word wrap, minimap toggles
- Help dialog (explains Wrap/Minimap + shortcuts)
- Save As + Format button
- Drag & drop a file onto the editor to open it
- Status bar (words/chars/lines + cursor position)

## Run

From this folder:

```powershell
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## Shortcuts

- Ctrl+N: New tab
- Ctrl+O: Open file
- Ctrl+S: Save
- Ctrl+Shift+S: Save As
- Ctrl+F: Find (Monaco)
- Ctrl+H: Replace (Monaco)
- Ctrl+/: Help

## Notes

- Your files are not uploaded anywhere. Autosave is stored locally in your browser.
