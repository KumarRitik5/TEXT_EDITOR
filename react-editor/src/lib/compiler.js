const PISTON_EXECUTE_URL = 'https://emkc.org/api/v2/piston/execute'

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

export async function compileWithPiston({ language, code, timeoutMs = 20000 }) {
  const compilerLanguage = getCompilerLanguage(language)
  if (!compilerLanguage) {
    throw new Error('This language is not supported for compilation yet.')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(PISTON_EXECUTE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: compilerLanguage,
        version: '*',
        files: [{ content: code || '' }],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Compiler request failed (${response.status})`)
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
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
