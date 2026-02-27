# Textory Backend

Backend service for Textory frontend.

## Features

- `GET /api/health` health + config visibility
- `POST /api/compile` compiler proxy endpoint
- `WS /ws` broadcast channel for live document sync

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
