const { compileCode } = require('./_compiler')

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed', message: 'Use POST.' })
  }

  let body = req.body || {}
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body || '{}')
    } catch {
      return res.status(400).json({ error: 'invalid_json', message: 'Invalid JSON body.' })
    }
  }

  const result = await compileCode({
    language: body.language,
    code: body.code,
    stdin: body.stdin,
    timeoutMs: body.timeoutMs,
  })

  return res.status(result.status).json(result.body)
}