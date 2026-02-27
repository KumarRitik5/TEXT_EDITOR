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
    .map((value) => value.trim())
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

async function compileCode({ language, code, stdin, timeoutMs }) {
  const mappedLanguage = SUPPORTED_LANGUAGES[String(language || '')]
  if (!mappedLanguage) {
    return {
      status: 400,
      body: {
        error: 'unsupported_language',
        message: 'This language is not supported for compilation yet.',
      },
    }
  }

  const endpoints = getCompilerEndpoints()
  if (!endpoints.length) {
    return {
      status: 500,
      body: {
        error: 'missing_configuration',
        message: 'No compiler endpoints configured. Set COMPILER_ENDPOINTS.',
      },
    }
  }

  const apiKey = process.env.COMPILER_API_KEY || ''
  let lastFailure = null

  for (const endpoint of endpoints) {
    try {
      const result = await executeWithEndpoint({
        endpoint,
        language: mappedLanguage,
        code: String(code || ''),
        stdin: String(stdin || ''),
        timeoutMs: Math.max(1000, Math.min(30000, Number(timeoutMs || 20000))),
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
      return {
        status: 200,
        body: {
          success: Number(run.code || 0) === 0,
          code: Number(run.code || 0),
          stdout: String(run.stdout || ''),
          stderr: String(run.stderr || ''),
          output: String(run.output || ''),
        },
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        return {
          status: 504,
          body: { error: 'timeout', message: 'Compilation timed out.' },
        }
      }

      lastFailure = {
        endpoint,
        status: 502,
        bodyText: String(error?.message || 'Compiler endpoint is unreachable.'),
      }
    }
  }

  if (lastFailure?.status === 401 || lastFailure?.status === 403) {
    return {
      status: 502,
      body: {
        error: 'compiler_auth_failed',
        message: `Compiler rejected request at ${lastFailure.endpoint} (${lastFailure.status}). Configure COMPILER_API_KEY or use a different endpoint.`,
        details: lastFailure.bodyText || '',
      },
    }
  }

  if (String(lastFailure?.bodyText || '').toLowerCase().includes('whitelist only')) {
    return {
      status: 502,
      body: {
        error: 'compiler_whitelist_only',
        message: `Compiler endpoint at ${lastFailure.endpoint} is whitelist-only. Use your own hosted compiler endpoint.`,
        details: lastFailure.bodyText || '',
      },
    }
  }

  return {
    status: 502,
    body: {
      error: 'compiler_failed',
      message: `Compiler request failed at ${lastFailure?.endpoint || 'unknown endpoint'}${lastFailure?.status ? ` (${lastFailure.status})` : ''}.`,
      details: lastFailure?.bodyText || '',
    },
  }
}

module.exports = {
  getCompilerEndpoints,
  compileCode,
}