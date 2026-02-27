# Textory

Textory now has a proper split architecture:

- Frontend: [react-editor/](react-editor/)
- Backend API + WebSocket: [backend/](backend/)

## Setup

```powershell
npm run install:app
npm run install:backend
```

## Run (Fullstack)

Start backend:

```powershell
npm run dev:backend
```

Start frontend in another terminal:

```powershell
npm run dev:frontend
```

Open http://localhost:5173.

## Backend env

Create `backend/.env` from `backend/.env.example` and configure:

- `PORT` (default `8787`)
- `FRONTEND_ORIGIN` (default `http://localhost:5173`)
- `COMPILER_ENDPOINTS` (comma-separated execute endpoints)
- `COMPILER_API_KEY` (optional)
