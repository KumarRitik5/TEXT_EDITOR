const { getCompilerEndpoints } = require('./_compiler')

module.exports = async function handler(_req, res) {
  res.status(200).json({
    ok: true,
    service: 'textory-vercel-api',
    compilerEndpoints: getCompilerEndpoints(),
  })
}