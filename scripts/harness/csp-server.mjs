// Serve o build de produção com os cabeçalhos do vercel.json (CSP + afins) e
// fallback de SPA. Única diferença: connect-src soma a API local em http/ws.
// Uso: node csp-server.mjs <dist-dir> <porta>
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'

const [dist, portArg] = process.argv.slice(2)
const port = Number(portArg ?? 5180)
const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'))
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg' }

function headersFor(urlPath) {
  const out = {}
  for (const rule of vercel.headers) {
    const re = new RegExp('^' + rule.source.replace(/\(\?!/g, '(?!') + '$')
    if (re.test(urlPath)) for (const h of rule.headers) out[h.key] = h.value
  }
  if (out['Content-Security-Policy']) {
    out['Content-Security-Policy'] = out['Content-Security-Policy'].replace("connect-src 'self' https: wss: data: blob:", "connect-src 'self' https: wss: data: blob: http://127.0.0.1:3599 ws://127.0.0.1:3599")
  }
  return out
}

createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = path.resolve(dist, '.' + urlPath)
  if (!file.startsWith(path.resolve(dist)) || !existsSync(file) || statSync(file).isDirectory()) file = path.join(dist, 'index.html')
  const headers = { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', ...headersFor(urlPath) }
  res.writeHead(200, headers)
  res.end(readFileSync(file))
}).listen(port, () => console.log('[csp] http://localhost:' + port))
