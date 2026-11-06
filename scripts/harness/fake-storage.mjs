#!/usr/bin/env node
// Storage falso compativel com o Supabase Storage, para o harness local.
//
// Uso: node fake-storage.mjs [porta]        (padrao 54329)
//
// A API do harness (api.sh) aponta SUPABASE_BUCKET_URL para ca, entao uploads,
// URLs assinadas, downloads e remocoes funcionam de ponta a ponta sem tocar a
// nuvem. O navegador tambem fala direto com este servidor: PUT na URL assinada
// de upload e GET (com Range) na URL assinada de leitura, por isso CORS aberto.
//
// Os formatos de rota/resposta foram conferidos contra o @supabase/storage-js
// 2.98 da API (workflow-api/node_modules/@supabase/storage-js/dist/index.mjs).
//
// Dados:   scripts/harness/fake-storage-data/<bucket>/<path>   (fora do git)
// Metadados (content-type etc.): fake-storage-data/.meta/<bucket>/<path>.json
// Tokens assinados: fake-storage-data/.tokens.json (sobrevivem a reinicio)
//
// Upload retomavel (TUS 1.0.0), no molde do Supabase Storage (conferido no
// codigo do supabase/storage, src/http/routes/tus): POST em
// /upload/resumable/sign com o token de createSignedUploadUrl no cabecalho
// `x-signature` (sem service key), Upload-Metadata com bucketName/objectName/
// contentType/cacheControl, PATCH com Upload-Offset e HEAD para retomar. O
// Location devolvido e /upload/resumable/sign/<id>. Bytes recebidos de um PATCH
// cortado no meio FICAM (como no servidor real), entao o HEAD devolve o offset
// de onde parou, nem sempre multiplo de 6 MB.
//
// Controle do harness (so para teste, nao existe no storage real):
//   GET  /__harness            config e contadores
//   POST /__harness  {throttleBps?, dropAfterBytes?, failPatches?, maxBytes?, reset?}
//     throttleBps     limita a leitura dos uploads (PUT e PATCH), em bytes/s
//     dropAfterBytes  derruba a conexao do PROXIMO PATCH depois de N bytes
//     failPatches     responde 503 aos proximos N PATCH
//     maxBytes        teto por arquivo (o "limite global do projeto"), 413 acima
//     reset           zera os contadores
//
// Node puro, sem dependencias.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const fsp = fs.promises
const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.join(HERE, 'fake-storage-data')
const META = path.join(DATA, '.meta')
const TMP = path.join(DATA, '.tmp')
const BUCKETS_FILE = path.join(DATA, '.buckets.json')
const TOKENS_FILE = path.join(DATA, '.tokens.json')

const PORT = Number(process.argv[2] || process.env.FAKE_STORAGE_PORT || 54329)
const PREFIX = '/storage/v1'

// Buckets que em producao ja existem (criados no painel) e que o codigo da API
// NAO cria sozinho. Os demais (drive-files, avatars, ocr-documents) a API cria.
const BUCKETS_INICIAIS = [{ id: 'workflow-attachments', public: true }]

fs.mkdirSync(META, { recursive: true })
fs.mkdirSync(TMP, { recursive: true })

// --------------------------------------------------------------------------
// Estado persistido: buckets e tokens
// --------------------------------------------------------------------------

function lerJson(file, vazio) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return vazio
  }
}

/** @type {Record<string, any>} */
const buckets = lerJson(BUCKETS_FILE, {})
/** @type {Record<string, {k:'read'|'upload', b:string, p:string, exp:number, upsert?:boolean}>} */
let tokens = lerJson(TOKENS_FILE, {})

function salvarBuckets() {
  fs.writeFileSync(BUCKETS_FILE, JSON.stringify(buckets, null, 2))
}

let tokensTimer = null
function salvarTokens() {
  if (tokensTimer) return
  tokensTimer = setTimeout(() => {
    tokensTimer = null
    flushTokens()
  }, 200)
}
function flushTokens() {
  const agora = Date.now() / 1000
  tokens = Object.fromEntries(Object.entries(tokens).filter(([, t]) => t.exp > agora))
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens))
}

function novoBucket(id, opts = {}) {
  const agora = new Date().toISOString()
  buckets[id] = {
    id,
    name: id,
    owner: '',
    public: !!opts.public,
    type: 'STANDARD',
    file_size_limit: opts.file_size_limit ?? null,
    allowed_mime_types: opts.allowed_mime_types ?? null,
    created_at: agora,
    updated_at: agora,
  }
  fs.mkdirSync(path.join(DATA, encSeg(id)), { recursive: true })
  salvarBuckets()
  return buckets[id]
}

function emitirToken(dados, ttlSec) {
  const token = crypto.randomBytes(24).toString('base64url')
  tokens[token] = { ...dados, exp: Math.floor(Date.now() / 1000) + ttlSec }
  salvarTokens()
  return token
}

// --------------------------------------------------------------------------
// Caminhos no disco
// --------------------------------------------------------------------------

/** Escapa o que o Windows nao aceita num nome de arquivo (reversivel, % incluso). */
function encSeg(s) {
  const hex = (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()
  return s
    .replace(/[<>:"|?*\\%\x00-\x1f]/g, hex)
    .replace(/[. ]+$/, (m) => [...m].map(hex).join(''))
}
function decSeg(s) {
  return decodeURIComponent(s)
}

function arquivoDe(bucket, segs) {
  return path.join(DATA, encSeg(bucket), ...segs.map(encSeg))
}
function metaDe(bucket, segs) {
  const ult = segs[segs.length - 1]
  return path.join(META, encSeg(bucket), ...segs.slice(0, -1).map(encSeg), encSeg(ult) + '.json')
}

const MIME_POR_EXT = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', pdf: 'application/pdf', txt: 'text/plain',
  json: 'application/json', csv: 'text/csv', zip: 'application/zip', html: 'text/html',
}

async function lerMeta(bucket, segs, stat) {
  let m = null
  try {
    m = JSON.parse(await fsp.readFile(metaDe(bucket, segs), 'utf8'))
  } catch {
    // Arquivo posto na mao na pasta: deduz o que da.
  }
  const ext = segs[segs.length - 1].split('.').pop()?.toLowerCase() ?? ''
  return {
    id: m?.id ?? crypto.createHash('md5').update(bucket + '/' + segs.join('/')).digest('hex'),
    contentType: m?.contentType ?? MIME_POR_EXT[ext] ?? 'application/octet-stream',
    cacheControl: m?.cacheControl ?? 'max-age=3600',
    etag: m?.etag ?? `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`,
    metadata: m?.metadata ?? {},
    createdAt: m?.createdAt ?? stat.birthtime.toISOString(),
    updatedAt: m?.updatedAt ?? stat.mtime.toISOString(),
  }
}

async function statArquivo(file) {
  try {
    const st = await fsp.stat(file)
    return st.isFile() ? st : null
  } catch {
    return null
  }
}

// --------------------------------------------------------------------------
// Respostas
// --------------------------------------------------------------------------

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Expose-Headers':
    'Content-Length, Content-Range, Content-Type, Accept-Ranges, ETag, Last-Modified, Cache-Control, ' +
    'Location, Upload-Offset, Upload-Length, Upload-Expires, Tus-Resumable, Tus-Version, Tus-Max-Size, Tus-Extension',
}

// --------------------------------------------------------------------------
// Controle do harness (throttle e falhas de proposito) e contadores
// --------------------------------------------------------------------------

const harness = {
  throttleBps: 0,
  dropAfterBytes: 0,
  failPatches: 0,
  maxBytes: Number(process.env.FAKE_STORAGE_MAX_BYTES) || 0,
}
const novosContadores = () => ({
  puts: 0,
  putBytes: 0,
  tusCreates: 0,
  tusHeads: 0,
  tusPatches: 0,
  tusPatchBytes: 0,
  tusDrops: 0,
  tusFails: 0,
  tusCompleted: 0,
  tusOffsetConflicts: 0,
  /** objectName -> quantas vezes o upload foi CRIADO (retomar nao cria de novo) */
  createsPorObjeto: {},
})
let contadores = novosContadores()

/**
 * Le o corpo respeitando o throttle do harness (o gerador repassa os pedacos).
 * Espera ate o horario em que aqueles bytes "deveriam" ter chegado, em vez de
 * um setTimeout por pedaco: no Windows o timer minimo e ~15 ms e o throttle
 * por pedaco saia bem mais lento que o pedido.
 */
async function* comThrottle(src) {
  const t0 = Date.now()
  let bytes = 0
  for await (const c of src) {
    if (harness.throttleBps > 0) {
      // pedacos pequenos para o progresso no navegador andar liso
      for (let i = 0; i < c.length; i += 32 * 1024) {
        const parte = c.subarray(i, i + 32 * 1024)
        bytes += parte.length
        const espera = t0 + (bytes / harness.throttleBps) * 1000 - Date.now()
        if (espera > 0) await new Promise((r) => setTimeout(r, espera))
        yield parte
      }
    } else {
      yield c
    }
  }
}

class HttpError extends Error {
  constructor(status, error, message, statusCode = String(status)) {
    super(message)
    this.status = status
    this.error = error
    this.statusCode = statusCode
  }
}

const erros = {
  bucketNaoExiste: () => new HttpError(404, 'Bucket not found', 'Bucket not found'),
  objetoNaoExiste: () => new HttpError(404, 'not_found', 'Object not found'),
  jaExiste: () => new HttpError(409, 'Duplicate', 'The resource already exists'),
  semAuth: () => new HttpError(400, 'Unauthorized', 'Authorization header is missing', '403'),
  tokenInvalido: (msg) => new HttpError(400, 'InvalidJWT', msg, '403'),
  chaveInvalida: () => new HttpError(400, 'InvalidKey', 'Invalid key'),
  rotaNaoExiste: () => new HttpError(404, 'not_found', 'Route not found'),
}

function enviarJson(res, status, corpo) {
  const buf = Buffer.from(JSON.stringify(corpo))
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
  })
  res.end(buf)
}

async function lerCorpo(req, limite = 20 * 1024 * 1024) {
  const partes = []
  let total = 0
  for await (const c of req) {
    total += c.length
    if (total > limite) throw new HttpError(413, 'Payload too large', 'Body too large')
    partes.push(c)
  }
  return Buffer.concat(partes)
}

async function lerJsonCorpo(req) {
  const buf = await lerCorpo(req)
  if (buf.length === 0) return {}
  try {
    return JSON.parse(buf.toString('utf8'))
  } catch {
    throw new HttpError(400, 'invalid_json', 'Invalid JSON body')
  }
}

function exigirAuth(req) {
  if (!req.headers.authorization && !req.headers.apikey) throw erros.semAuth()
}

function exigirBucket(id) {
  const b = buckets[id]
  if (!b) throw erros.bucketNaoExiste()
  return b
}

// --------------------------------------------------------------------------
// Upload (corpo cru ou multipart) -> arquivo temporario
// --------------------------------------------------------------------------

function parseMultipart(buf, boundary) {
  const delim = Buffer.from('--' + boundary)
  const fim = Buffer.from('\r\n--' + boundary)
  const partes = []
  let pos = buf.indexOf(delim)
  while (pos !== -1) {
    pos += delim.length
    if (buf[pos] === 0x2d && buf[pos + 1] === 0x2d) break
    pos += 2 // CRLF depois do boundary
    const cabFim = buf.indexOf('\r\n\r\n', pos)
    if (cabFim === -1) break
    const cabecalho = buf.subarray(pos, cabFim).toString('utf8')
    const ini = cabFim + 4
    const prox = buf.indexOf(fim, ini)
    if (prox === -1) break
    partes.push({ cabecalho, corpo: buf.subarray(ini, prox) })
    pos = prox + 2
  }
  return partes.map((p) => {
    const disp = /content-disposition:[^\r\n]*/i.exec(p.cabecalho)?.[0] ?? ''
    return {
      nome: /\bname="([^"]*)"/i.exec(disp)?.[1] ?? '',
      arquivo: /\bfilename=/i.test(disp),
      tipo: /content-type:\s*([^\r\n]+)/i.exec(p.cabecalho)?.[1]?.trim(),
      corpo: p.corpo,
    }
  })
}

/** Recebe o corpo da requisicao e deixa em um arquivo temporario. */
async function receberUpload(req) {
  const tmp = path.join(TMP, crypto.randomUUID())
  const tipoReq = req.headers['content-type'] ?? ''
  const hash = crypto.createHash('md5')
  let size = 0
  let contentType = tipoReq || 'application/octet-stream'
  let cacheControl = req.headers['cache-control'] || 'max-age=3600'
  let metadata = {}
  try {
    if (req.headers['x-metadata']) {
      metadata = JSON.parse(Buffer.from(String(req.headers['x-metadata']), 'base64').toString('utf8'))
    }
  } catch {
    // metadata invalido e ignorado, como o storage real faria com lixo opcional
  }

  const multipart = /^multipart\/form-data/i.test(tipoReq)
  if (multipart) {
    const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(tipoReq)
    if (!boundary) throw new HttpError(400, 'invalid_request', 'Missing multipart boundary')
    const partes = parseMultipart(await lerCorpo(req, 512 * 1024 * 1024), boundary[1] ?? boundary[2])
    const arq = partes.find((p) => p.arquivo) ?? partes.find((p) => p.nome === '')
    if (!arq) throw new HttpError(400, 'invalid_request', 'No file part in multipart body')
    const cc = partes.find((p) => p.nome === 'cacheControl')
    if (cc) cacheControl = `max-age=${cc.corpo.toString('utf8')}`
    const md = partes.find((p) => p.nome === 'metadata')
    if (md) {
      try {
        metadata = JSON.parse(md.corpo.toString('utf8'))
      } catch {
        // ignora
      }
    }
    contentType = arq.tipo || 'application/octet-stream'
    size = arq.corpo.length
    hash.update(arq.corpo)
    await fsp.writeFile(tmp, arq.corpo)
  } else {
    await pipeline(
      req,
      comThrottle,
      async function* (src) {
        for await (const c of src) {
          hash.update(c)
          size += c.length
          yield c
        }
      },
      fs.createWriteStream(tmp),
    )
  }
  return { tmp, size, etag: `"${hash.digest('hex')}"`, contentType, cacheControl, metadata }
}

async function gravarObjeto(bucketId, segs, up, upsert) {
  const b = exigirBucket(bucketId)
  const destino = arquivoDe(bucketId, segs)
  try {
    if (harness.maxBytes && up.size > harness.maxBytes) {
      throw new HttpError(413, 'Payload too large', 'The object exceeded the maximum allowed size')
    }
    if (b.file_size_limit && up.size > b.file_size_limit) {
      throw new HttpError(413, 'Payload too large', 'The object exceeded the maximum allowed size')
    }
    if (Array.isArray(b.allowed_mime_types) && b.allowed_mime_types.length > 0) {
      const mime = up.contentType.split(';')[0].trim().toLowerCase()
      const ok = b.allowed_mime_types.some((p) =>
        p.endsWith('/*') ? mime.startsWith(p.slice(0, -1)) : mime === p.toLowerCase(),
      )
      if (!ok) throw new HttpError(415, 'invalid_mime_type', `mime type ${mime} is not supported`)
    }
    const existente = await statArquivo(destino)
    if (existente && !upsert) throw erros.jaExiste()

    const anterior = existente ? await lerMeta(bucketId, segs, existente) : null
    const id = crypto.randomUUID()
    const agora = new Date().toISOString()
    try {
      await fsp.mkdir(path.dirname(destino), { recursive: true })
      await fsp.rename(up.tmp, destino)
    } catch (e) {
      if (e?.code === 'ENOTDIR' || e?.code === 'EEXIST' || e?.code === 'EISDIR') {
        throw new HttpError(400, 'InvalidKey', 'Conflito entre pasta e arquivo no mesmo caminho')
      }
      throw e
    }
    const mf = metaDe(bucketId, segs)
    await fsp.mkdir(path.dirname(mf), { recursive: true })
    await fsp.writeFile(
      mf,
      JSON.stringify({
        id,
        contentType: up.contentType,
        cacheControl: up.cacheControl,
        etag: up.etag,
        metadata: up.metadata,
        createdAt: anterior?.createdAt ?? agora,
        updatedAt: agora,
      }),
    )
    return { Id: id, Key: `${bucketId}/${segs.join('/')}` }
  } finally {
    await fsp.rm(up.tmp, { force: true })
  }
}

// --------------------------------------------------------------------------
// Leitura (GET/HEAD) com Range
// --------------------------------------------------------------------------

function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header ?? '').split(',')[0].trim())
  if (!m || (m[1] === '' && m[2] === '')) return null
  let ini
  let fim
  if (m[1] === '') {
    const n = Number(m[2])
    ini = Math.max(0, size - n)
    fim = size - 1
  } else {
    ini = Number(m[1])
    fim = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  if (ini >= size || ini > fim) return 'invalido'
  return { ini, fim }
}

async function servirObjeto(req, res, url, bucketId, segs, { head }) {
  exigirBucket(bucketId)
  const file = arquivoDe(bucketId, segs)
  const st = await statArquivo(file)
  if (!st) throw erros.objetoNaoExiste()
  const meta = await lerMeta(bucketId, segs, st)

  const h = {
    'Content-Type': meta.contentType,
    'Accept-Ranges': 'bytes',
    ETag: meta.etag,
    'Last-Modified': new Date(meta.updatedAt).toUTCString(),
    'Cache-Control': meta.cacheControl,
  }
  if (url.searchParams.has('download')) {
    const nome = url.searchParams.get('download') || segs[segs.length - 1]
    h['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`
  }

  if (req.headers['if-none-match'] && req.headers['if-none-match'] === meta.etag) {
    res.writeHead(304, h)
    return res.end()
  }

  const rng = req.headers.range ? parseRange(req.headers.range, st.size) : null
  if (rng === 'invalido') {
    res.writeHead(416, { ...h, 'Content-Range': `bytes */${st.size}` })
    return res.end()
  }
  if (rng) {
    res.writeHead(206, {
      ...h,
      'Content-Length': rng.fim - rng.ini + 1,
      'Content-Range': `bytes ${rng.ini}-${rng.fim}/${st.size}`,
    })
    if (head) return res.end()
    return pipeline(fs.createReadStream(file, { start: rng.ini, end: rng.fim }), res).catch(() => {})
  }
  res.writeHead(200, { ...h, 'Content-Length': st.size })
  if (head) return res.end()
  return pipeline(fs.createReadStream(file), res).catch(() => {})
}

// --------------------------------------------------------------------------
// Tokens assinados
// --------------------------------------------------------------------------

function validarToken(url, kind, bucketId, segs) {
  const token = url.searchParams.get('token')
  if (!token) throw erros.tokenInvalido('Missing token')
  const t = tokens[token]
  if (!t || t.k !== kind) throw erros.tokenInvalido('Invalid token')
  if (t.exp < Date.now() / 1000) throw erros.tokenInvalido('"exp" claim timestamp check failed')
  if (t.b !== bucketId || t.p !== segs.join('/')) throw erros.tokenInvalido('Invalid token for this object')
  return t
}

// --------------------------------------------------------------------------
// Upload retomavel (TUS 1.0.0)
// --------------------------------------------------------------------------

/** @type {Map<string, {id:string,bucket:string,path:string,length:number,offset:number,tmp:string,contentType:string,cacheControl:string,metadata:object,upsert:boolean,expira:number,completo:boolean}>} */
const tusUploads = new Map()
const TUS_TTL_MS = 24 * 60 * 60 * 1000

function tusHeaders(extra = {}) {
  return { 'Tus-Resumable': '1.0.0', 'Cache-Control': 'no-store', ...extra }
}

/** Upload-Metadata: "chave base64,chave base64". */
function parseUploadMetadata(header) {
  const out = {}
  for (const par of String(header ?? '').split(',')) {
    const [k, v] = par.trim().split(' ')
    if (!k) continue
    out[k] = v ? Buffer.from(v, 'base64').toString('utf8') : ''
  }
  return out
}

/** O token de createSignedUploadUrl vem em `x-signature` e vale para UM objeto. */
function tusAssinatura(req, bucketId, objectName) {
  const token = req.headers['x-signature']
  if (!token || typeof token !== 'string') {
    throw new HttpError(400, 'InvalidSignature', 'Missing x-signature header', '400')
  }
  const t = tokens[token]
  if (!t || t.k !== 'upload') throw new HttpError(400, 'InvalidSignature', 'The signature is invalid', '400')
  if (t.exp < Date.now() / 1000) throw new HttpError(400, 'ExpiredSignature', 'The signature has expired', '400')
  if (t.b !== bucketId || t.p !== objectName) {
    throw new HttpError(400, 'InvalidSignature', 'The signature does not match this object', '400')
  }
  return t
}

function tusRegistro(id) {
  const u = tusUploads.get(id)
  if (!u || u.expira < Date.now()) throw new HttpError(404, 'not_found', 'Upload not found')
  return u
}

async function tusCriar(req, res, url, assinado) {
  if (!assinado) exigirAuth(req)
  if (req.headers['upload-defer-length']) {
    throw new HttpError(400, 'invalid_request', 'Upload-Defer-Length is not supported')
  }
  const length = Number(req.headers['upload-length'])
  if (!Number.isInteger(length) || length < 0) {
    throw new HttpError(400, 'invalid_request', 'Upload-Length header is missing or invalid')
  }
  const meta = parseUploadMetadata(req.headers['upload-metadata'])
  const bucketId = meta.bucketName
  const objectName = String(meta.objectName ?? '').replace(/^\/+/, '')
  if (!bucketId || !objectName) throw new HttpError(400, 'invalid_request', 'bucketName and objectName are required')
  const bk = exigirBucket(bucketId)
  const segs = chave(objectName.split('/').filter(Boolean))
  const tok = assinado ? tusAssinatura(req, bk.id, segs.join('/')) : null
  const upsert = tok ? !!tok.upsert : String(req.headers['x-upsert']) === 'true'
  const limite = harness.maxBytes || bk.file_size_limit || 0
  if (limite && length > limite) {
    throw new HttpError(413, 'Payload too large', 'The object exceeded the maximum allowed size')
  }
  if (!upsert && (await statArquivo(arquivoDe(bk.id, segs)))) throw erros.jaExiste()

  const id = crypto.randomUUID()
  const tmp = path.join(TMP, `tus-${id}`)
  await fsp.writeFile(tmp, Buffer.alloc(0))
  let metadata = {}
  try {
    metadata = meta.metadata ? JSON.parse(meta.metadata) : {}
  } catch {
    // ignora, como o servidor real faria com metadata invalido opcional
  }
  tusUploads.set(id, {
    id,
    bucket: bk.id,
    path: segs.join('/'),
    length,
    offset: 0,
    tmp,
    contentType: meta.contentType || 'application/octet-stream',
    cacheControl: meta.cacheControl ? `max-age=${meta.cacheControl}` : 'max-age=3600',
    metadata,
    upsert,
    expira: Date.now() + TUS_TTL_MS,
    completo: false,
  })
  contadores.tusCreates++
  contadores.createsPorObjeto[segs.join('/')] = (contadores.createsPorObjeto[segs.join('/')] ?? 0) + 1
  const host = req.headers.host ?? `127.0.0.1:${PORT}`
  const base = `http://${host}${PREFIX}/upload/resumable${assinado ? '/sign' : ''}`
  res.writeHead(
    201,
    tusHeaders({
      Location: `${base}/${id}`,
      'Upload-Expires': new Date(Date.now() + TUS_TTL_MS).toUTCString(),
      'Content-Length': 0,
    }),
  )
  return res.end()
}

async function tusConcluir(u) {
  const st = await fsp.stat(u.tmp)
  const hash = crypto.createHash('md5')
  await pipeline(fs.createReadStream(u.tmp), async function* (src) {
    for await (const c of src) hash.update(c)
  })
  await gravarObjeto(
    u.bucket,
    u.path.split('/'),
    {
      tmp: u.tmp,
      size: st.size,
      etag: `"${hash.digest('hex')}"`,
      contentType: u.contentType,
      cacheControl: u.cacheControl,
      metadata: u.metadata,
    },
    u.upsert,
  )
  u.completo = true
  contadores.tusCompleted++
}

/** PATCH: anexa os bytes no offset atual. Conexao cortada no meio guarda o que chegou. */
async function tusPatch(req, res, u) {
  const tipo = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  if (tipo !== 'application/offset+octet-stream') {
    throw new HttpError(415, 'invalid_content_type', 'Content-Type must be application/offset+octet-stream')
  }
  const offset = Number(req.headers['upload-offset'])
  if (!Number.isInteger(offset)) throw new HttpError(400, 'invalid_request', 'Upload-Offset header is missing')
  if (u.completo) {
    res.writeHead(204, tusHeaders({ 'Upload-Offset': String(u.length) }))
    return res.end()
  }
  if (offset !== u.offset) {
    contadores.tusOffsetConflicts++
    throw new HttpError(409, 'offset_mismatch', `Upload-Offset ${offset} does not match ${u.offset}`)
  }
  contadores.tusPatches++
  if (harness.failPatches > 0) {
    harness.failPatches--
    contadores.tusFails++
    req.resume()
    throw new HttpError(503, 'unavailable', 'Fake storage refused this part (harness failPatches)')
  }
  const cortarEm = harness.dropAfterBytes > 0 ? harness.dropAfterBytes : 0
  if (cortarEm) harness.dropAfterBytes = 0
  const restante = u.length - u.offset
  const sock = req.socket
  const out = fs.createWriteStream(u.tmp, { flags: 'a' })
  let recebidos = 0
  let cortou = false
  try {
    for await (const c of comThrottle(req)) {
      // byte a mais que o declarado e descartado (o loop segue ate o fim do corpo:
      // sair antes derruba o socket e a resposta nao chega)
      let parte = recebidos + c.length > restante ? c.subarray(0, Math.max(0, restante - recebidos)) : c
      if (cortarEm && recebidos + parte.length >= cortarEm) {
        parte = parte.subarray(0, Math.max(0, cortarEm - recebidos))
        cortou = true
      }
      if (parte.length) {
        if (!out.write(parte)) await new Promise((r) => out.once('drain', r))
        recebidos += parte.length
      }
      if (cortou) break
    }
  } catch {
    // conexao caiu no meio: o que chegou fica (o HEAD conta)
  }
  await new Promise((r) => out.end(r))
  u.offset += recebidos
  contadores.tusPatchBytes += recebidos
  if (cortou) {
    contadores.tusDrops++
    sock?.destroy()
    return
  }
  if (u.offset >= u.length) await tusConcluir(u)
  if (!res.headersSent && !sock?.destroyed) {
    res.writeHead(204, tusHeaders({ 'Upload-Offset': String(u.offset) }))
    res.end()
  }
}

async function rotearTus(req, res, url, segs) {
  // segs: ['upload', 'resumable', ('sign')?, (id)?]
  const assinado = segs[2] === 'sign'
  const id = segs[assinado ? 3 : 2]
  const metodo = req.method
  if (!id) {
    if (metodo === 'POST') return tusCriar(req, res, url, assinado)
    throw erros.rotaNaoExiste()
  }
  const u = tusRegistro(id)
  if (assinado) tusAssinatura(req, u.bucket, u.path)
  else exigirAuth(req)
  if (metodo === 'HEAD') {
    contadores.tusHeads++
    res.writeHead(
      200,
      tusHeaders({ 'Upload-Offset': String(u.completo ? u.length : u.offset), 'Upload-Length': String(u.length) }),
    )
    return res.end()
  }
  if (metodo === 'PATCH') return tusPatch(req, res, u)
  if (metodo === 'DELETE') {
    tusUploads.delete(id)
    await fsp.rm(u.tmp, { force: true })
    res.writeHead(204, tusHeaders())
    return res.end()
  }
  throw erros.rotaNaoExiste()
}

// --------------------------------------------------------------------------
// Roteamento
// --------------------------------------------------------------------------

function chave(segs) {
  if (segs.length === 0) throw erros.chaveInvalida()
  if (segs.some((s) => s === '.' || s === '..')) throw erros.chaveInvalida()
  return segs
}

async function listarObjetos(bucketId, corpo) {
  exigirBucket(bucketId)
  const prefixo = String(corpo.prefix ?? '').replace(/^\/+|\/+$/g, '')
  const segsPref = prefixo ? chave(prefixo.split('/')) : []
  const dir = path.join(DATA, encSeg(bucketId), ...segsPref.map(encSeg))
  let entradas = []
  try {
    entradas = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const busca = String(corpo.search ?? '').toLowerCase()
  const itens = []
  for (const e of entradas) {
    const nome = decSeg(e.name)
    if (busca && !nome.toLowerCase().includes(busca)) continue
    if (e.isDirectory()) {
      itens.push({ name: nome, id: null, updated_at: null, created_at: null, last_accessed_at: null, metadata: null })
    } else {
      const st = await fsp.stat(path.join(dir, e.name))
      const m = await lerMeta(bucketId, [...segsPref, nome], st)
      itens.push({
        name: nome,
        id: m.id,
        updated_at: m.updatedAt,
        created_at: m.createdAt,
        last_accessed_at: m.updatedAt,
        metadata: {
          eTag: m.etag,
          size: st.size,
          mimetype: m.contentType,
          cacheControl: m.cacheControl,
          lastModified: m.updatedAt,
          contentLength: st.size,
          httpStatusCode: 200,
        },
      })
    }
  }
  const col = corpo.sortBy?.column ?? 'name'
  const dirOrd = corpo.sortBy?.order === 'desc' ? -1 : 1
  itens.sort((a, b) => {
    const va = col === 'name' ? a.name : (a[col] ?? '')
    const vb = col === 'name' ? b.name : (b[col] ?? '')
    return va < vb ? -dirOrd : va > vb ? dirOrd : 0
  })
  const off = Number(corpo.offset ?? 0)
  const lim = Number(corpo.limit ?? 100)
  return itens.slice(off, off + lim)
}

async function removerObjeto(bucketId, segs) {
  const file = arquivoDe(bucketId, segs)
  const st = await statArquivo(file)
  if (!st) return null
  const meta = await lerMeta(bucketId, segs, st)
  await fsp.rm(file, { force: true })
  await fsp.rm(metaDe(bucketId, segs), { force: true })
  // poda pastas vazias ate a raiz do bucket
  for (let n = segs.length - 1; n > 0; n--) {
    try {
      await fsp.rmdir(arquivoDe(bucketId, segs.slice(0, n)))
      await fsp.rmdir(path.dirname(metaDe(bucketId, segs.slice(0, n + 1)))).catch(() => {})
    } catch {
      break
    }
  }
  return {
    name: segs.join('/'),
    bucket_id: bucketId,
    owner: '',
    id: meta.id,
    updated_at: meta.updatedAt,
    created_at: meta.createdAt,
    last_accessed_at: meta.updatedAt,
    metadata: { size: st.size, mimetype: meta.contentType, eTag: meta.etag },
    buckets: { id: bucketId, name: bucketId },
  }
}

async function copiarOuMover(corpo, mover) {
  const origem = exigirBucket(corpo.bucketId)
  const destBucket = corpo.destinationBucket ?? origem.id
  exigirBucket(destBucket)
  const sSegs = chave(String(corpo.sourceKey ?? '').split('/').filter(Boolean))
  const dSegs = chave(String(corpo.destinationKey ?? '').split('/').filter(Boolean))
  const sFile = arquivoDe(origem.id, sSegs)
  if (!(await statArquivo(sFile))) throw erros.objetoNaoExiste()
  const dFile = arquivoDe(destBucket, dSegs)
  if (await statArquivo(dFile)) throw erros.jaExiste()
  await fsp.mkdir(path.dirname(dFile), { recursive: true })
  await fsp.mkdir(path.dirname(metaDe(destBucket, dSegs)), { recursive: true })
  const mSrc = metaDe(origem.id, sSegs)
  if (mover) {
    await fsp.rename(sFile, dFile)
    await fsp.rename(mSrc, metaDe(destBucket, dSegs)).catch(() => {})
  } else {
    // Copia do lado do servidor (POST /object/copy do storage-js 2.98: corpo
    // { bucketId, sourceKey, destinationKey, destinationBucket }, resposta
    // { Key }). Os bytes sao os mesmos (o sha256 do original vale para a
    // copia); o objeto novo ganha id e datas proprios, como no storage real.
    await fsp.copyFile(sFile, dFile)
    const st = await fsp.stat(dFile)
    const m = await lerMeta(origem.id, sSegs, st)
    const agora = new Date().toISOString()
    await fsp.writeFile(
      metaDe(destBucket, dSegs),
      JSON.stringify({ ...m, id: crypto.randomUUID(), createdAt: agora, updatedAt: agora }),
    )
  }
  return `${destBucket}/${dSegs.join('/')}`
}

async function rotear(req, res, url, segs) {
  const metodo = req.method
  const [raiz, ...r] = segs

  if (!raiz || raiz === 'health' || raiz === 'status') {
    return enviarJson(res, 200, { status: 'ok', fake: true })
  }

  // ---- controle do harness (nao existe no storage real) -------------------
  if (raiz === '__harness') {
    if (metodo === 'POST') {
      const c = await lerJsonCorpo(req)
      for (const k of ['throttleBps', 'dropAfterBytes', 'failPatches', 'maxBytes']) {
        if (k in c) harness[k] = Math.max(0, Number(c[k]) || 0)
      }
      if (c.reset) contadores = novosContadores()
    }
    return enviarJson(res, 200, { harness, contadores, tusAbertos: tusUploads.size })
  }

  // ---- upload retomavel (TUS) ---------------------------------------------
  if (raiz === 'upload' && r[0] === 'resumable') return rotearTus(req, res, url, segs)

  // ---- buckets ----------------------------------------------------------
  if (raiz === 'bucket') {
    exigirAuth(req)
    const [id, acao] = r
    if (!id) {
      if (metodo === 'GET') return enviarJson(res, 200, Object.values(buckets))
      if (metodo === 'POST') {
        const c = await lerJsonCorpo(req)
        const nome = String(c.id ?? c.name ?? '')
        if (!nome || nome.startsWith('.') || /[/\\]/.test(nome)) {
          throw new HttpError(400, 'InvalidBucketName', 'Bucket name invalid')
        }
        if (buckets[nome]) throw erros.jaExiste()
        novoBucket(nome, c)
        return enviarJson(res, 200, { name: nome })
      }
    } else if (!acao) {
      if (metodo === 'GET') return enviarJson(res, 200, exigirBucket(id))
      if (metodo === 'PUT') {
        const b = exigirBucket(id)
        const c = await lerJsonCorpo(req)
        if (typeof c.public === 'boolean') b.public = c.public
        if ('file_size_limit' in c) b.file_size_limit = c.file_size_limit ?? null
        if ('allowed_mime_types' in c) b.allowed_mime_types = c.allowed_mime_types ?? null
        b.updated_at = new Date().toISOString()
        salvarBuckets()
        return enviarJson(res, 200, { message: 'Successfully updated' })
      }
      if (metodo === 'DELETE') {
        exigirBucket(id)
        const dir = path.join(DATA, encSeg(id))
        if ((await fsp.readdir(dir).catch(() => [])).length > 0) {
          throw new HttpError(409, 'InvalidRequest', 'Bucket not empty')
        }
        await fsp.rm(dir, { recursive: true, force: true })
        delete buckets[id]
        salvarBuckets()
        return enviarJson(res, 200, { message: 'Successfully deleted' })
      }
    } else if (acao === 'empty' && metodo === 'POST') {
      exigirBucket(id)
      await fsp.rm(path.join(DATA, encSeg(id)), { recursive: true, force: true })
      await fsp.rm(path.join(META, encSeg(id)), { recursive: true, force: true })
      await fsp.mkdir(path.join(DATA, encSeg(id)), { recursive: true })
      return enviarJson(res, 200, { message: 'Successfully emptied' })
    }
    throw erros.rotaNaoExiste()
  }

  // ---- imagem com transformacao: serve o original, sem redimensionar ------
  if (raiz === 'render' && r[0] === 'image') {
    const [modo, bucketId, ...resto] = r.slice(1)
    if (metodo !== 'GET' && metodo !== 'HEAD') throw erros.rotaNaoExiste()
    return roteadorLeitura(req, res, url, modo, bucketId, resto, metodo === 'HEAD')
  }

  if (raiz !== 'object') throw erros.rotaNaoExiste()

  // ---- objetos ------------------------------------------------------------
  const [a, b, c, ...resto] = r

  // Upload assinado: POST cria o token, PUT sobe usando o token.
  if (a === 'upload' && b === 'sign') {
    const bucketId = c
    const ks = chave(resto)
    if (metodo === 'POST') {
      exigirAuth(req)
      const bk = exigirBucket(bucketId)
      const upsert = String(req.headers['x-upsert']) === 'true'
      if (!upsert && (await statArquivo(arquivoDe(bk.id, ks)))) throw erros.jaExiste()
      const token = emitirToken({ k: 'upload', b: bk.id, p: ks.join('/'), upsert }, 2 * 60 * 60)
      return enviarJson(res, 200, {
        url: `/object/upload/sign/${bk.id}/${encodeURI(ks.join('/'))}?token=${token}`,
      })
    }
    if (metodo === 'PUT') {
      const t = validarToken(url, 'upload', bucketId, ks)
      exigirBucket(bucketId)
      contadores.puts++
      const up = await receberUpload(req)
      contadores.putBytes += up.size
      const r2 = await gravarObjeto(bucketId, ks, up, !!t.upsert)
      return enviarJson(res, 200, { Key: r2.Key })
    }
    throw erros.rotaNaoExiste()
  }

  // URL assinada de leitura: POST cria (um ou lote), GET le.
  if (a === 'sign') {
    if (metodo === 'POST' && !c) {
      // lote: /object/sign/<bucket>  { expiresIn, paths }
      exigirAuth(req)
      const bk = exigirBucket(b)
      const corpo = await lerJsonCorpo(req)
      const ttl = Number(corpo.expiresIn) || 60
      const saida = []
      for (const p of corpo.paths ?? []) {
        const ks = String(p).split('/').filter(Boolean)
        if (ks.length === 0 || ks.some((s) => s === '..' || s === '.') || !(await statArquivo(arquivoDe(bk.id, ks)))) {
          saida.push({
            error: 'Either the object does not exist or you do not have access to it',
            path: p,
            signedURL: null,
          })
          continue
        }
        const token = emitirToken({ k: 'read', b: bk.id, p: ks.join('/') }, ttl)
        saida.push({ error: null, path: p, signedURL: `/object/sign/${bk.id}/${ks.join('/')}?token=${token}` })
      }
      return enviarJson(res, 200, saida)
    }
    const ks = chave([c, ...resto].filter((s) => s !== undefined))
    if (metodo === 'POST') {
      exigirAuth(req)
      const bk = exigirBucket(b)
      const corpo = await lerJsonCorpo(req)
      if (!(await statArquivo(arquivoDe(bk.id, ks)))) throw erros.objetoNaoExiste()
      const token = emitirToken({ k: 'read', b: bk.id, p: ks.join('/') }, Number(corpo.expiresIn) || 60)
      // Caminho CRU de proposito: o storage-js aplica encodeURI no resultado.
      return enviarJson(res, 200, { signedURL: `/object/sign/${bk.id}/${ks.join('/')}?token=${token}` })
    }
    if (metodo === 'GET' || metodo === 'HEAD') {
      validarToken(url, 'read', b, ks)
      return servirObjeto(req, res, url, b, ks, { head: metodo === 'HEAD' })
    }
    throw erros.rotaNaoExiste()
  }

  if (a === 'info') {
    if (metodo !== 'GET' && metodo !== 'HEAD') throw erros.rotaNaoExiste()
    const todos = [b, c, ...resto].filter((s) => s !== undefined)
    const modo = todos[0] === 'authenticated' || todos[0] === 'public' ? todos.shift() : null
    const bucketId = todos.shift()
    const ks = chave(todos)
    const bk = exigirBucket(bucketId)
    if (modo === 'public') {
      if (!bk.public) throw erros.bucketNaoExiste()
    } else {
      exigirAuth(req)
    }
    const st = await statArquivo(arquivoDe(bucketId, ks))
    if (!st) throw erros.objetoNaoExiste()
    const m = await lerMeta(bucketId, ks, st)
    return enviarJson(res, 200, {
      id: m.id,
      name: ks.join('/'),
      version: m.id,
      bucket_id: bucketId,
      size: st.size,
      content_type: m.contentType,
      cache_control: m.cacheControl,
      etag: m.etag,
      metadata: m.metadata,
      last_modified: m.updatedAt,
      created_at: m.createdAt,
    })
  }

  if (a === 'list' && metodo === 'POST') {
    exigirAuth(req)
    return enviarJson(res, 200, await listarObjetos(b, await lerJsonCorpo(req)))
  }
  if ((a === 'move' || a === 'copy') && metodo === 'POST' && !b) {
    exigirAuth(req)
    const corpo = await lerJsonCorpo(req)
    const key = await copiarOuMover(corpo, a === 'move')
    return enviarJson(res, 200, a === 'move' ? { message: 'Successfully moved' } : { Key: key })
  }

  if (a === 'public' || a === 'authenticated') {
    if (metodo !== 'GET' && metodo !== 'HEAD') throw erros.rotaNaoExiste()
    return roteadorLeitura(req, res, url, a, b, [c, ...resto].filter((s) => s !== undefined), metodo === 'HEAD')
  }

  // /object/<bucket> (DELETE em lote) e /object/<bucket>/<path...>
  const bucketId = a
  if (!bucketId) throw erros.rotaNaoExiste()
  if (!b) {
    if (metodo === 'DELETE') {
      exigirAuth(req)
      exigirBucket(bucketId)
      const corpo = await lerJsonCorpo(req)
      const removidos = []
      for (const p of corpo.prefixes ?? []) {
        const ks = String(p).split('/').filter(Boolean)
        if (ks.length === 0 || ks.some((s) => s === '..' || s === '.')) continue
        const x = await removerObjeto(bucketId, ks)
        if (x) removidos.push(x)
      }
      return enviarJson(res, 200, removidos)
    }
    throw erros.rotaNaoExiste()
  }
  const ks = chave([b, c, ...resto].filter((s) => s !== undefined))
  if (metodo === 'POST' || metodo === 'PUT') {
    exigirAuth(req)
    exigirBucket(bucketId)
    const upsert = metodo === 'PUT' || String(req.headers['x-upsert']) === 'true'
    const up = await receberUpload(req)
    return enviarJson(res, 200, await gravarObjeto(bucketId, ks, up, upsert))
  }
  if (metodo === 'GET' || metodo === 'HEAD') {
    return roteadorLeitura(req, res, url, 'authenticated', bucketId, ks, metodo === 'HEAD')
  }
  if (metodo === 'DELETE') {
    exigirAuth(req)
    exigirBucket(bucketId)
    const x = await removerObjeto(bucketId, ks)
    if (!x) throw erros.objetoNaoExiste()
    return enviarJson(res, 200, { message: 'Successfully deleted' })
  }
  throw erros.rotaNaoExiste()
}

/** Leitura por modo: public (bucket publico), authenticated (precisa de auth), sign (token). */
async function roteadorLeitura(req, res, url, modo, bucketId, ks, head) {
  ks = chave(ks)
  if (modo === 'public') {
    const bk = exigirBucket(bucketId)
    if (!bk.public) throw erros.bucketNaoExiste()
  } else if (modo === 'sign') {
    validarToken(url, 'read', bucketId, ks)
  } else {
    exigirAuth(req)
  }
  return servirObjeto(req, res, url, bucketId, ks, { head })
}

// --------------------------------------------------------------------------
// Servidor
// --------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const t0 = Date.now()
  let rota = req.url
  res.on('finish', () => {
    const hora = new Date().toTimeString().slice(0, 8)
    const rng = req.headers.range ? ` range=${req.headers.range}` : ''
    console.log(`${hora} ${req.method} ${rota} ${res.statusCode} ${Date.now() - t0}ms${rng}`)
  })

  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v)
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] ||
      'authorization, apikey, content-type, x-upsert, x-client-info, cache-control, range, x-metadata, if-none-match, ' +
        'x-signature, tus-resumable, upload-length, upload-metadata, upload-offset, upload-defer-length',
  )

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  try {
    const url = new URL(req.url, 'http://fake-storage')
    rota = url.pathname
    let p = url.pathname
    if (p.startsWith(PREFIX)) p = p.slice(PREFIX.length)
    let segs
    try {
      segs = p.split('/').filter((s) => s !== '').map(decSeg)
    } catch {
      throw new HttpError(400, 'InvalidKey', 'Invalid URL encoding')
    }
    await rotear(req, res, url, segs)
  } catch (e) {
    if (res.headersSent) {
      res.destroy()
      return
    }
    if (e instanceof HttpError) {
      return enviarJson(res, e.status, { statusCode: e.statusCode, error: e.error, message: e.message })
    }
    console.error(e)
    enviarJson(res, 500, { statusCode: '500', error: 'Internal', message: String(e?.message ?? e) })
  }
})

server.requestTimeout = 0 // uploads grandes
server.headersTimeout = 60_000

for (const b of BUCKETS_INICIAIS) {
  if (!buckets[b.id]) novoBucket(b.id, b)
}
for (const id of Object.keys(buckets)) fs.mkdirSync(path.join(DATA, encSeg(id)), { recursive: true })
flushTokens()

// Upload retomavel abandonado expira (24 h, como o Location do servidor real).
setInterval(() => {
  const agora = Date.now()
  for (const [id, u] of tusUploads) {
    if (u.expira < agora || u.completo) {
      if (!u.completo) fsp.rm(u.tmp, { force: true }).catch(() => {})
      if (u.expira < agora) tusUploads.delete(id)
    }
  }
}, 10 * 60 * 1000).unref()

server.listen(PORT, '127.0.0.1', () => {
  console.log(`fake-storage ouvindo em http://127.0.0.1:${PORT}${PREFIX}  (dados: ${DATA})`)
})

function sair() {
  try {
    flushTokens()
  } catch {
    // nada
  }
  process.exit(0)
}
process.on('SIGINT', sair)
process.on('SIGTERM', sair)
