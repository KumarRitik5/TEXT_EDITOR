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
    const response = await fetch('/api/compile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        language: compilerLanguage,
        code: code || '',
        timeoutMs,
      }),
      signal: controller.signal,
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(String(payload?.message || `Compilation failed (${response.status})`))
    }

    return {
      success: Boolean(payload.success),
      code: Number(payload.code || 0),
      stdout: String(payload.stdout || ''),
      stderr: String(payload.stderr || ''),
      output: String(payload.output || ''),
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
