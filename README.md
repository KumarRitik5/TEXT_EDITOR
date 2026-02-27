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

### 1) Push code

Push this repo to GitHub/GitLab/Bitbucket.

### 2) Create project in Vercel

1. Open Vercel Dashboard.
2. Click **Add New Project**.
3. Import your repository.
4. Keep Root Directory as repo root (`text_editor`).

`vercel.json` is already configured:
- install: `npm run install:app`
- build: `npm run build`
- output: `react-editor/dist`

### 3) Configure environment variables (Vercel Project Settings)

Add these in **Settings → Environment Variables**:

Required:
- `COMPILER_ENDPOINTS` = your compiler execute endpoint(s), comma separated

Optional:
- `COMPILER_API_KEY` = compiler provider key

Recommended example:
- `COMPILER_ENDPOINTS=https://your-piston-host/api/v2/execute`

### 4) Deploy

1. Click **Deploy**.
2. After success, open your Vercel URL.
3. Verify API endpoints:
	- `https://<your-app>.vercel.app/api/health`
	- `POST https://<your-app>.vercel.app/api/compile`

### 5) Connect realtime collaboration (important)

Vercel Serverless does not host long-running WebSocket rooms for this app.

Use one of these options:

Option A (fastest): Deploy [backend/](backend/) to a websocket-friendly host
- Railway / Render / Fly.io
- Start command: `npm run start`
- Set backend env values from [backend/.env.example](backend/.env.example)

Option B: Use a managed realtime provider
- Ably / Pusher / Supabase Realtime

Then in Textory UI:
1. In toolbar, set **WS Host** to your deployed websocket endpoint (e.g. `wss://your-backend.example.com/ws`).
2. Set **Room** to a shared id (e.g. `team-alpha`).
3. Set your **Name**.
4. Click **Connect WS**.
5. Share room link using **Share Room** button.

### 6) Custom domain (optional)

1. Vercel Project → **Settings → Domains**.
2. Add your domain.
3. Update DNS as instructed.
4. Re-open app and verify `/api/health` on custom domain.

### 7) Redeploy flow

- Every push to your connected branch triggers Vercel redeploy.
- For env var changes, trigger a redeploy manually from Deployments tab.

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
