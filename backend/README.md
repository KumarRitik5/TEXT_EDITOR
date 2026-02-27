# Textory Backend

Backend service for Textory frontend.

## Features

- `GET /api/health` health + config visibility
- `POST /api/compile` compiler proxy endpoint
- `WS /ws` room-based channel for live document sync + presence updates

## Setup

```powershell
npm install
copy .env.example .env
```

## Run

```powershell
npm run dev
```

Default server URL: `http://localhost:8787`
