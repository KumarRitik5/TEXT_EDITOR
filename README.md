# Textory

Textory now has a proper split architecture:

- Frontend: [react-editor/](react-editor/)
- Backend API + WebSocket: [backend/](backend/)

Also supports Vercel deployment for frontend + `/api/compile` and `/api/health` via serverless functions in [api/](api/).

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

## Deploy on Vercel

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. Vercel will use [vercel.json](vercel.json) (already configured):
	- install: `npm run install:app`
	- build: `npm run build`
	- output: `react-editor/dist`
4. Add environment variables in Vercel Project Settings:
	- `COMPILER_ENDPOINTS`
	- `COMPILER_API_KEY` (optional)
5. Deploy.

After deploy, frontend compile works via:
- `POST /api/compile`
- `GET /api/health`

### Important (Realtime collaboration)

Vercel Serverless Functions do not provide long-lived WebSocket servers for room collaboration.

For live collaboration in production, use one of these:
- Keep `backend/` deployed on a WS-friendly host (Railway/Render/Fly.io), then set WS URL in app.
- Or move realtime to a managed service (Ably / Pusher / Supabase Realtime).

## Backend env

Create `backend/.env` from `backend/.env.example` and configure:

- `PORT` (default `8787`)
- `FRONTEND_ORIGIN` (default `http://localhost:5173`)
- `COMPILER_ENDPOINTS` (comma-separated execute endpoints)
- `COMPILER_API_KEY` (optional)
