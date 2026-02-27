import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

const app = express()
const port = Number(process.env.PORT || 8787)
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'

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

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    for (const client of wss.clients) {
      if (client === socket || client.readyState !== 1) continue
      client.send(raw.toString())
    }
  })
})

server.listen(port, () => {
  console.log(`[backend] listening on http://localhost:${port}`)
})
