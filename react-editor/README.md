
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
- Compile button (Piston API)
- Compile now goes through backend `/api/compile`
- Room-based WebSocket live collaboration via backend `/ws` (same room id = same live document)
- Drag & drop a file onto the editor to open it
- Java support (syntax highlighting + language selection)
- Status bar (words/chars/lines + cursor position)

## Run

From workspace root (recommended):

```powershell
npm run install:app
npm run install:backend
npm run dev:backend
npm run dev:frontend
```

Or from this folder only (frontend):

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
- Ctrl+Enter: Compile active document

## Notes

- Autosave and editor settings are stored locally in your browser.
- Compile uses your backend configuration (`backend/.env`) and never calls compiler providers directly from browser.
- If compile fails, check backend env values for `COMPILER_ENDPOINTS` and `COMPILER_API_KEY`.
- For live collaboration, share the same `Room` value with your friend, then both click `Connect WS`.
- On Vercel deploy, compile works through serverless `/api/compile`, but live WS collaboration needs an external WS host/service.
- WebSocket sync sends/receives JSON messages in this shape:

```json
{
	"type": "doc:sync",
	"clientId": "client-uuid",
	"doc": {
		"id": "doc-id",
		"name": "main.py",
		"language": "python",
		"value": "print('hi')",
		"updatedAt": 1700000000000
	}
}
```
