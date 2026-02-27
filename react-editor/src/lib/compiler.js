const DEFAULT_COMPILER_ENDPOINTS = [
  'https://piston.rs/api/v2/execute',
]

const LANGUAGE_MAP = {
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

export function getCompilerLanguage(monacoLanguage) {
  return LANGUAGE_MAP[monacoLanguage] || null
}

function buildEndpoints(customEndpoint) {
  const list = [customEndpoint, ...DEFAULT_COMPILER_ENDPOINTS]
  const cleaned = list
    .map(value => String(value || '').trim())
    .filter(Boolean)

  return [...new Set(cleaned)]
}

export async function compileWithPiston({ language, code, timeoutMs = 20000, endpoint, apiKey }) {
  const compilerLanguage = getCompilerLanguage(language)
  if (!compilerLanguage) {
    throw new Error('This language is not supported for compilation yet.')
  }

  const endpoints = buildEndpoints(endpoint)
  const cleanApiKey = String(apiKey || '').trim()
  let lastError = null

  for (const executeUrl of endpoints) {
    const host = (() => {
      try { return new URL(executeUrl).host } catch { return executeUrl }
    })()

    const authModes = cleanApiKey ? [true, false] : [false]

    for (const useAuth of authModes) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const headers = {
          'Content-Type': 'application/json',
        }

        if (useAuth) {
          headers.Authorization = `Bearer ${cleanApiKey}`
          headers['X-API-Key'] = cleanApiKey
        }

        const response = await fetch(executeUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            language: compilerLanguage,
            version: '*',
            files: [{ content: code || '' }],
          }),
          signal: controller.signal,
        })

        if (response.status === 401 || response.status === 403) {
          const bodyText = await response.text().catch(() => '')
          if (bodyText.toLowerCase().includes('whitelist only')) {
            lastError = new Error(`Compiler endpoint at ${host} is whitelist-only. Use your own hosted Piston URL in Settings (or another provider endpoint with valid API key).`)
            continue
          }

          lastError = new Error(`Compiler endpoint rejected request (${response.status}) at ${host}. Check Compiler URL/API key or try another endpoint.`)
          continue
        }

        if (!response.ok) {
          lastError = new Error(`Compiler request failed (${response.status}) at ${host}`)
          continue
        }

        const data = await response.json()
        const run = data?.run || {}

        return {
          success: Number(run.code || 0) === 0,
          code: Number(run.code || 0),
          stdout: String(run.stdout || ''),
          stderr: String(run.stderr || ''),
          output: String(run.output || ''),
        }
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error('Compilation timed out. Please try again.')
        }
        const msg = String(error?.message || '')
        if (msg) {
          lastError = new Error(`Compiler endpoint unreachable at ${host}. ${msg}`)
        } else {
          lastError = error
        }
      } finally {
        clearTimeout(timeoutId)
      }
    }
  }

  throw lastError || new Error('Compilation failed')
}
