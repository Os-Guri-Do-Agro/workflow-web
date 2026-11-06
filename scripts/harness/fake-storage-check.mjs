// Verificacao do fake-storage.mjs usando o @supabase/supabase-js REAL da API.
//
// Uso (com o fake no ar):  node fake-storage-check.mjs [porta] [tamanhoKB]
//   porta padrao 54329; tamanhoKB padrao 64 (use 5120 para ~5 MB).
//
// Replica o que o app faz: o PUT na URL assinada de upload sai como o
// navegador faz em src/service/drive/drive-service.ts (uploadDirect):
// PUT com Content-Type do arquivo e Authorization: Bearer <token>.

import { createRequire } from 'node:module'
import crypto from 'node:crypto'

const require = createRequire('C:/TRABALHO/workflow/workflow-api/package.json')
const { createClient } = require('@supabase/supabase-js')

const PORTA = process.argv[2] || '54329'
const KB = Number(process.argv[3] || 64)
const BASE = `http://127.0.0.1:${PORTA}`
const BUCKET = 'drive-files'

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
let falhas = 0
function ok(cond, msg, extra = '') {
  console.log(`${cond ? 'OK   ' : 'FALHA'} ${msg}${extra ? '  ' + extra : ''}`)
  if (!cond) falhas++
}

// PNG "de mentira": assinatura valida + bytes aleatorios.
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  crypto.randomBytes(KB * 1024 - 8),
])
const shaPng = sha(png)
console.log(`Arquivo de teste: ${png.length} bytes, sha256 ${shaPng.slice(0, 16)}...`)

const client = createClient(BASE, 'harness')
const storage = client.storage

// 1. Bucket privado, idempotente, igual ao DriveStorageService.ensureBucket
{
  let { data, error } = await storage.getBucket(BUCKET)
  if (!data) {
    ok(!!error, 'getBucket de bucket inexistente devolve erro', `(${error?.message})`)
    const r = await storage.createBucket(BUCKET, { public: false })
    ok(!r.error, 'createBucket privado', r.error?.message)
    ;({ data } = await storage.getBucket(BUCKET))
  }
  ok(data?.public === false, 'bucket drive-files existe e e privado')
  const dup = await storage.createBucket(BUCKET, { public: false })
  ok(!!dup.error, 'createBucket duplicado recusado', `(${dup.error?.message})`)
}

const caminho = `teste/a-${Date.now()}.png`
const files = storage.from(BUCKET)

// 2. URL assinada de upload + PUT como o navegador
const up = await files.createSignedUploadUrl(caminho)
ok(!up.error && up.data?.signedUrl && up.data?.token, 'createSignedUploadUrl', up.error?.message)
console.log('     signedUrl:', up.data.signedUrl.replace(/token=.*/, 'token=<...>'))

// preflight que o navegador faz (Authorization + Content-Type sao nao simples)
{
  const pre = await fetch(up.data.signedUrl, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5174',
      'Access-Control-Request-Method': 'PUT',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  })
  const allow = pre.headers.get('access-control-allow-headers') ?? ''
  ok(
    pre.status === 204 &&
      pre.headers.get('access-control-allow-origin') === '*' &&
      /authorization/i.test(allow) &&
      /PUT/.test(pre.headers.get('access-control-allow-methods') ?? ''),
    'preflight OPTIONS liberado (CORS)',
    `(${pre.status}, headers: ${allow})`,
  )
}

// token desconhecido e recusado
{
  const falso = up.data.signedUrl.replace(/token=[^&]+/, 'token=desconhecido')
  const r = await fetch(falso, { method: 'PUT', body: png, headers: { 'content-type': 'image/png' } })
  const j = await r.json().catch(() => ({}))
  ok(r.status === 400 && j.error === 'InvalidJWT', 'PUT com token desconhecido recusado', `(${r.status} ${JSON.stringify(j)})`)
  const info0 = await files.info(caminho)
  ok(!!info0.error, 'objeto NAO foi gravado pelo token falso')
}

// token valido, so que para OUTRO caminho: recusado
{
  const outro = await files.createSignedUploadUrl(`teste/outro-${Date.now()}.png`)
  const trocada = up.data.signedUrl.replace(/token=[^&]+/, `token=${outro.data.token}`)
  const r = await fetch(trocada, { method: 'PUT', body: png, headers: { 'content-type': 'image/png' } })
  ok(r.status === 400, 'token de outro caminho recusado', `(${r.status})`)
}

{
  const r = await fetch(up.data.signedUrl, {
    method: 'PUT',
    body: png,
    headers: { 'content-type': 'image/png', authorization: `Bearer ${up.data.token}`, origin: 'http://localhost:5174' },
  })
  const j = await r.json().catch(() => ({}))
  ok(r.status === 200 && j.Key === `${BUCKET}/${caminho}`, 'PUT na URL assinada de upload', `(${r.status} ${JSON.stringify(j)})`)
  ok(r.headers.get('access-control-allow-origin') === '*', 'resposta do PUT traz Access-Control-Allow-Origin')
}

// 3. info com tamanho e content-type reais
{
  const { data, error } = await files.info(caminho)
  ok(!error && data?.size === png.length, 'info devolve o tamanho real', `(size=${data?.size}, esperado ${png.length})`)
  ok(data?.contentType === 'image/png', 'info devolve o content-type real', `(${data?.contentType})`)
}

// 4. URL assinada de leitura + Range
{
  const s = await files.createSignedUrl(caminho, 60)
  ok(!s.error && s.data?.signedUrl?.includes('/storage/v1/object/sign/'), 'createSignedUrl', s.error?.message)
  const r = await fetch(s.data.signedUrl, { headers: { Range: 'bytes=0-9' } })
  const buf = Buffer.from(await r.arrayBuffer())
  ok(r.status === 206, 'GET com Range responde 206', `(${r.status})`)
  ok(buf.length === 10 && buf.equals(png.subarray(0, 10)), 'Range devolve 10 bytes corretos', `(${buf.length})`)
  ok(r.headers.get('content-range') === `bytes 0-9/${png.length}`, 'Content-Range correto', `(${r.headers.get('content-range')})`)
  ok(r.headers.get('accept-ranges') === 'bytes', 'Accept-Ranges: bytes')
  ok(r.headers.get('content-type') === 'image/png', 'GET devolve o content-type gravado')

  const meio = await fetch(s.data.signedUrl, { headers: { Range: `bytes=${png.length - 5}-` } })
  const bm = Buffer.from(await meio.arrayBuffer())
  ok(meio.status === 206 && bm.equals(png.subarray(png.length - 5)), 'Range aberto (a partir de N) correto')

  const suf = await fetch(s.data.signedUrl, { headers: { Range: 'bytes=-4' } })
  ok(suf.status === 206 && Buffer.from(await suf.arrayBuffer()).equals(png.subarray(png.length - 4)), 'Range de sufixo (-N) correto')

  const ruim = await fetch(s.data.signedUrl, { headers: { Range: `bytes=${png.length + 10}-` } })
  ok(ruim.status === 416, 'Range fora do arquivo responde 416', `(${ruim.status})`)

  const inteiro = await fetch(s.data.signedUrl)
  ok(inteiro.status === 200 && sha(Buffer.from(await inteiro.arrayBuffer())) === shaPng, 'GET inteiro na URL assinada confere (sha256)')

  const falsa = await fetch(s.data.signedUrl.replace(/token=[^&]+/, 'token=xyz'))
  ok(falsa.status === 400, 'GET com token de leitura falso recusado', `(${falsa.status})`)

  const semAuthPriv = await fetch(`${BASE}/storage/v1/object/${BUCKET}/${caminho}`)
  ok(semAuthPriv.status === 400, 'GET direto no bucket privado sem auth recusado', `(${semAuthPriv.status})`)
  const pub = await fetch(`${BASE}/storage/v1/object/public/${BUCKET}/${caminho}`)
  ok(pub.status === 404, 'URL publica de bucket privado nao abre', `(${pub.status})`)

  const expirada = await files.createSignedUrl(caminho, 1)
  await new Promise((r2) => setTimeout(r2, 2200))
  const rExp = await fetch(expirada.data.signedUrl)
  ok(rExp.status === 400, 'URL assinada expirada recusada', `(${rExp.status})`)

  const lote = await files.createSignedUrls([caminho, 'nao/existe.png'], 60)
  ok(!lote.error && lote.data?.[0]?.signedUrl && lote.data?.[1]?.error, 'createSignedUrls em lote (um existe, um nao)', JSON.stringify(lote.data?.map((d) => ({ p: d.path, e: d.error }))))
  const rl = await fetch(lote.data[0].signedUrl, { headers: { Range: 'bytes=0-9' } })
  ok(rl.status === 206, 'URL do lote funciona', `(${rl.status})`)
}

// 5. download autenticado pelo servidor
{
  const { data, error } = await files.download(caminho)
  const buf = Buffer.from(await data.arrayBuffer())
  ok(!error && buf.length === png.length && sha(buf) === shaPng, 'download autenticado confere (sha256)', `(${buf.length} bytes)`)
  const dl = await files.download(`teste/nao-existe-${Date.now()}.png`)
  ok(!!dl.error, 'download de inexistente devolve erro', `(${dl.error?.message})`)
}

// 6. upload autenticado (Buffer, como a API faz) e (Blob/multipart, como o storage-js faz com Blob)
const caminho2 = `teste/b-${Date.now()}.png`
{
  const r = await files.upload(caminho2, png, { contentType: 'image/png', upsert: false })
  ok(!r.error && r.data?.path === caminho2, 'upload autenticado (Buffer)', r.error?.message)
  const dup = await files.upload(caminho2, png, { contentType: 'image/png', upsert: false })
  ok(!!dup.error, 'upload duplicado sem upsert recusado', `(${dup.error?.message})`)
  const ups = await files.upload(caminho2, Buffer.from('novo'), { contentType: 'text/plain', upsert: true })
  ok(!ups.error, 'upload com upsert sobrescreve', ups.error?.message)
  const i2 = await files.info(caminho2)
  ok(i2.data?.size === 4 && i2.data?.contentType === 'text/plain', 'info reflete o upsert', JSON.stringify({ s: i2.data?.size, c: i2.data?.contentType }))

  const caminho3 = `teste/c-${Date.now()}.png`
  const blobUp = await files.upload(caminho3, new Blob([png], { type: 'image/png' }), { upsert: false })
  ok(!blobUp.error, 'upload com Blob (multipart)', blobUp.error?.message)
  const i3 = await files.info(caminho3)
  ok(i3.data?.size === png.length && i3.data?.contentType === 'image/png', 'multipart: tamanho e content-type reais', JSON.stringify({ s: i3.data?.size, c: i3.data?.contentType }))
  const d3 = await files.download(caminho3)
  ok(sha(Buffer.from(await d3.data.arrayBuffer())) === shaPng, 'multipart: download confere (sha256)')

  const viaToken = await files.createSignedUploadUrl(`teste/d-${Date.now()}.png`)
  const ut = await files.uploadToSignedUrl(viaToken.data.path, viaToken.data.token, png, { contentType: 'image/png' })
  ok(!ut.error, 'uploadToSignedUrl (storage-js)', ut.error?.message)
  await files.remove([viaToken.data.path, caminho3])
}

// 7. remocao em lote e info depois
{
  const rm = await files.remove([caminho, caminho2])
  ok(!rm.error && rm.data?.length === 2, 'remove em lote', rm.error?.message ?? `(${rm.data?.length} removidos)`)
  const i = await files.info(caminho)
  ok(!!i.error && i.error.status === 404, 'info depois de remover: nao existe', `(${i.error?.status} ${i.error?.message})`)
  const e = await files.exists(caminho)
  ok(e.data === false, 'exists depois de remover: false')
  const s = await files.createSignedUrl(caminho, 60)
  ok(!!s.error, 'createSignedUrl de removido devolve erro', `(${s.error?.message})`)
}

// 8. bucket publico: upload + getPublicUrl abre sem auth, com CORS
{
  const pb = 'workflow-attachments'
  const f = client.storage.from(pb)
  const p = `${Date.now()}-foto.png`
  const r = await f.upload(p, png, { contentType: 'image/png', upsert: false })
  ok(!r.error, 'upload no bucket publico workflow-attachments', r.error?.message)
  const { publicUrl } = f.getPublicUrl(p).data
  const g = await fetch(publicUrl, { headers: { Origin: 'http://localhost:5174' } })
  const buf = Buffer.from(await g.arrayBuffer())
  ok(g.status === 200 && sha(buf) === shaPng, 'getPublicUrl abre sem auth e confere (sha256)', `(${g.status})`)
  ok(g.headers.get('access-control-allow-origin') === '*', 'URL publica com CORS')
  await f.remove([p])
  const g2 = await fetch(publicUrl)
  ok(g2.status === 404, 'URL publica depois de remover: 404', `(${g2.status})`)
}

console.log(falhas === 0 ? '\nTUDO OK' : `\n${falhas} FALHA(S)`)
process.exit(falhas === 0 ? 0 : 1)
