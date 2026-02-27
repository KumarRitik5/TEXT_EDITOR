import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

const app = express()
const port = Number(process.env.PORT || 8787)
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'

const DEFAULT_ROOM = 'lobby'
const rooms = new Map()

app.use(cors({ origin: frontendOrigin }))
app.use(express.json({ limit: '1mb' }))

const SUPPORTED_LANGUAGES = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  java: 'java',
  cpp: 'cpp',
  csharp: 'csharp',
  go: 'go',
  rust: 'rust',
  php: 'php',
  shell: 'bash',
}

function getCompilerEndpoints() {
  return String(process.env.COMPILER_ENDPOINTS || 'https://piston.rs/api/v2/execute')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
}

function sanitizeRoomId(value) {
  const clean = String(value || '').trim().toLowerCase()
  if (!clean) return DEFAULT_ROOM
  return clean.replace(/[^a-z0-9-_]/g, '').slice(0, 64) || DEFAULT_ROOM
}

function sanitizeUserName(value) {
  const clean = String(value || '').trim()
  if (!clean) return 'Guest'
  return clean.slice(0, 40)
}

function getOrCreateRoom(roomId) {
  const key = sanitizeRoomId(roomId)
  const existing = rooms.get(key)
  if (existing) return existing

  const created = {
    id: key,
    sockets: new Set(),
    users: new Map(),
    latestDoc: null,
  }
  rooms.set(key, created)
  return created
}

function removeSocketFromRoom(room, socket) {
  room.sockets.delete(socket)
  room.users.delete(socket)
  if (room.sockets.size === 0) {
    rooms.delete(room.id)
  }
}

function getRoomParticipants(room) {
  return Array.from(room.users.values())
}

function sendJson(socket, payload) {
  if (!socket || socket.readyState !== 1) return
  socket.send(JSON.stringify(payload))
}

function broadcastToRoom(room, payload, exceptSocket = null) {
  const raw = JSON.stringify(payload)
  for (const client of room.sockets) {
    if (client.readyState !== 1) continue
    if (exceptSocket && client === exceptSocket) continue
    client.send(raw)
  }
}

function publishPresence(room) {
  broadcastToRoom(room, {
    type: 'presence:update',
    roomId: room.id,
    participants: getRoomParticipants(room),
  })
}

async function executeWithEndpoint({ endpoint, language, code, stdin, timeoutMs, apiKey }) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const headers = {
      'Content-Type': 'application/json',
    }

    const cleanApiKey = String(apiKey || '').trim()
    if (cleanApiKey) {
      headers.Authorization = `Bearer ${cleanApiKey}`
      headers['X-API-Key'] = cleanApiKey
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        language,
        version: '*',
        files: [{ content: code || '' }],
        stdin: stdin || '',
      }),
    })

    const text = await response.text()

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        bodyText: text,
      }
    }

    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      return {
        ok: false,
        status: 502,
        bodyText: 'Invalid compiler response payload',
      }
    }

    return {
      ok: true,
      data: parsed,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'textory-backend',
    compilerEndpoints: getCompilerEndpoints(),
  })
})

app.post('/api/compile', async (req, res) => {
  const language = String(req.body?.language || '')
  const sourceCode = String(req.body?.code || '')
  const stdin = String(req.body?.stdin || '')
  const timeoutMs = Math.max(1000, Math.min(30000, Number(req.body?.timeoutMs || 20000)))

  const mappedLanguage = SUPPORTED_LANGUAGES[language]
  if (!mappedLanguage) {
    return res.status(400).json({
      error: 'unsupported_language',
      message: 'This language is not supported for compilation yet.',
    })
  }

  const endpoints = getCompilerEndpoints()
  if (!endpoints.length) {
    return res.status(500).json({
      error: 'missing_configuration',
      message: 'No compiler endpoints configured. Set COMPILER_ENDPOINTS in backend .env.',
    })
  }

  const apiKey = process.env.COMPILER_API_KEY || ''
  let lastFailure = null

  for (const endpoint of endpoints) {
    try {
      const result = await executeWithEndpoint({
        endpoint,
        language: mappedLanguage,
        code: sourceCode,
        stdin,
        timeoutMs,
        apiKey,
      })

      if (!result.ok) {
        lastFailure = {
          endpoint,
          status: result.status,
          bodyText: result.bodyText,
        }
        continue
      }

      const run = result.data?.run || {}

      return res.json({
        success: Number(run.code || 0) === 0,
        code: Number(run.code || 0),
        stdout: String(run.stdout || ''),
        stderr: String(run.stderr || ''),
        output: String(run.output || ''),
      })
    } catch (error) {
      const msg = String(error?.message || '')
      if (error?.name === 'AbortError') {
        return res.status(504).json({ error: 'timeout', message: 'Compilation timed out.' })
      }
      lastFailure = {
        endpoint,
        status: 502,
        bodyText: msg || 'Compiler endpoint is unreachable.',
      }
    }
  }

  if (lastFailure?.status === 401 || lastFailure?.status === 403) {
    return res.status(502).json({
      error: 'compiler_auth_failed',
      message: `Compiler rejected request at ${lastFailure.endpoint} (${lastFailure.status}). Configure COMPILER_API_KEY or use a different endpoint.`,
      details: lastFailure.bodyText || '',
    })
  }

  if (String(lastFailure?.bodyText || '').toLowerCase().includes('whitelist only')) {
    return res.status(502).json({
      error: 'compiler_whitelist_only',
      message: `Compiler endpoint at ${lastFailure.endpoint} is whitelist-only. Use your own hosted compiler endpoint.`,
      details: lastFailure.bodyText || '',
    })
  }

  return res.status(502).json({
    error: 'compiler_failed',
    message: `Compiler request failed at ${lastFailure?.endpoint || 'unknown endpoint'}${lastFailure?.status ? ` (${lastFailure.status})` : ''}.`,
    details: lastFailure?.bodyText || '',
  })
})

const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (socket, request) => {
  let activeRoom = getOrCreateRoom(DEFAULT_ROOM)
  let activeUserName = 'Guest'
  let activeClientId = ''

  const switchRoom = ({ roomId, userName, clientId }) => {
    const nextRoom = getOrCreateRoom(roomId)
    const nextUserName = sanitizeUserName(userName)
    const nextClientId = String(clientId || '').trim()

    if (activeRoom && activeRoom !== nextRoom) {
      removeSocketFromRoom(activeRoom, socket)
      publishPresence(activeRoom)
    }

    activeRoom = nextRoom
    activeUserName = nextUserName
    activeClientId = nextClientId
    socket._roomId = activeRoom.id
    socket._userName = activeUserName
    socket._clientId = activeClientId

    activeRoom.sockets.add(socket)
    activeRoom.users.set(socket, {
      name: activeUserName,
      clientId: activeClientId,
    })

    sendJson(socket, {
      type: 'room:state',
      roomId: activeRoom.id,
      participants: getRoomParticipants(activeRoom),
      doc: activeRoom.latestDoc,
    })

    publishPresence(activeRoom)
  }

  try {
    const url = new URL(request?.url || '/', `http://localhost:${port}`)
    switchRoom({
      roomId: url.searchParams.get('room') || DEFAULT_ROOM,
      userName: url.searchParams.get('name') || 'Guest',
      clientId: url.searchParams.get('clientId') || '',
    })
  } catch {
    switchRoom({ roomId: DEFAULT_ROOM, userName: 'Guest', clientId: '' })
  }

  socket.on('message', (raw) => {
    let data = null
    try {
      data = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (!data || typeof data !== 'object') return

    if (data.type === 'join') {
      switchRoom({
        roomId: data.roomId,
        userName: data.userName,
        clientId: data.clientId,
      })
      return
    }

    if (data.type !== 'doc:sync') return
    if (!data.doc || typeof data.doc !== 'object') return

    activeRoom.latestDoc = {
      id: String(data.doc.id || ''),
      name: String(data.doc.name || ''),
      language: String(data.doc.language || 'plaintext'),
      value: String(data.doc.value || ''),
      updatedAt: Date.now(),
    }

    broadcastToRoom(activeRoom, {
      type: 'doc:sync',
      roomId: activeRoom.id,
      userName: activeUserName,
      clientId: activeClientId,
      doc: activeRoom.latestDoc,
    }, socket)
  })

  socket.on('close', () => {
    if (!activeRoom) return
    removeSocketFromRoom(activeRoom, socket)
    publishPresence(activeRoom)
  })
})

server.listen(port, () => {
  console.log(`[backend] listening on http://localhost:${port}`)
})
