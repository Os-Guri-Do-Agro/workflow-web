// Redes sociais FALSAS para o harness da ala Marketing (R2, parte A).
// Imita, em Node puro, os endpoints que a API do Nevo usa de cada rede, com os
// mesmos caminhos, cabeçalhos e formatos de resposta da documentação oficial:
//
//   Meta (Graph v27.0)   /meta/...        diálogo de login em /meta-www/...
//   YouTube              /google/...      consentimento em /google-auth/..., token em /google-oauth/...
//   LinkedIn             /li/rest/...     OAuth em /li-www/oauth/v2/...
//   TikTok               /tt/v2/...       autorização em /tt-www/v2/auth/authorize/
//
// Uso: node fake-social.mjs [porta]   (padrão 54351)
// Envs da API (veja README): META_GRAPH_URL=http://127.0.0.1:54351/meta,
// META_AUTH_URL=http://127.0.0.1:54351/meta-www, YOUTUBE_API_URL=.../google,
// YOUTUBE_AUTH_URL=.../google-auth, YOUTUBE_OAUTH_URL=.../google-oauth,
// LINKEDIN_API_URL=.../li, LINKEDIN_AUTH_URL=.../li-www, TIKTOK_API_URL=.../tt,
// TIKTOK_AUTH_URL=.../tt-www (e qualquer valor nas chaves *_ID/*_SECRET).
//
// Controle (para os roteiros):
//   GET  /__control/state           chamadas, posts publicados, uploads, tokens emitidos (só contagem)
//   POST /__control/reset           zera tudo
//   POST /__control/fail            { match, status (número ou "drop"), times, body? }
//   POST /__control/delay           { match, ms }
//   POST /__control/revoke          { provider }  (invalida os tokens emitidos, simula "tirou o acesso")
// `match` é um trecho de "<rede>:<MÉTODO> <caminho>", ex.: "meta:POST /v27.0/17841400000000001/media_publish".
//
// Todo token emitido começa com FAKETOKEN-: o roteiro procura esse texto em
// respostas, logs e socket da API (não pode aparecer em lugar nenhum).
import http from 'node:http'
import { randomBytes, createHash } from 'node:crypto'

const PORT = Number(process.argv[2] || process.env.FAKE_SOCIAL_PORT || 54351)
const VERSION = 'v27.0'

const rnd = (n = 8) => randomBytes(n).toString('hex')
const tok = (kind) => `FAKETOKEN-${kind}-${rnd(10)}`
const num = (s, mod) => {
  const h = createHash('sha1').update(String(s)).digest()
  return h.readUInt32BE(0) % mod
}

// ── Dados fixos das contas ──────────────────────────────────────────────────
const META = {
  user: { id: 'fb-user-1', name: 'Nicolas Teste' },
  pages: [
    { id: '1001', name: 'PetJourney Brasil', ig: { id: '17841400000000001', username: 'petjourney.br', name: 'PetJourney' } },
  ],
  adAccounts: [{ id: 'act_2001', account_id: '2001', name: 'PetJourney Ads', currency: 'BRL', account_status: 1 }],
  campaigns: {
    act_2001: [
      { id: '23850000000000001', name: 'Lançamento Novembro (leads)', objective: 'OUTCOME_LEADS', status: 'ACTIVE', effective_status: 'ACTIVE' },
      { id: '23850000000000002', name: 'Tráfego para o site', objective: 'OUTCOME_TRAFFIC', status: 'PAUSED', effective_status: 'PAUSED' },
    ],
  },
}
const YT = { channel: { id: 'UC-fake-petjourney', title: 'PetJourney TV', customUrl: '@petjourneytv' } }
const LI = { orgs: [{ id: '3001', localizedName: 'PetJourney', vanityName: 'petjourney' }] }
const TT = { user: { open_id: 'tt-open-petjourney', display_name: 'PetJourney', avatar_url: 'https://example.invalid/tt.png' } }

// ── Estado ──────────────────────────────────────────────────────────────────
let S
function reset() {
  S = {
    calls: [],
    codes: new Map(), // code -> { provider, redirect_uri, used }
    tokens: new Map(), // token -> { provider, kind, revoked, extra }
    containers: new Map(), // ig container id -> { igId, kind, image?, video?, children?, caption, polls }
    published: [], // { network, id, creationId?, caption, media: [...] }
    mediaPublishCalls: new Map(), // creation_id -> count
    fbPhotos: new Map(),
    ytSessions: new Map(),
    liUploads: new Map(),
    liVideos: new Map(),
    ttPublishes: new Map(),
    ttUploads: new Map(),
    fails: [],
    delays: [],
    downloads: [],
    revokes: [],
  }
}
reset()

function issue(provider, kind, extra = {}) {
  const t = tok(`${provider.toUpperCase()}-${kind}`)
  S.tokens.set(t, { provider, kind, revoked: false, extra })
  return t
}

// ── Utilitários HTTP ────────────────────────────────────────────────────────
function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, {
    'content-type': typeof body === 'string' && body.startsWith('<') ? 'text/html; charset=utf-8' : 'application/json',
    'access-control-allow-origin': '*',
    ...headers,
  })
  res.end(data)
}
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', () => resolve(Buffer.alloc(0)))
  })
}
function parseFields(req, buf) {
  const type = req.headers['content-type'] || ''
  if (type.includes('application/json')) {
    try {
      return JSON.parse(buf.toString('utf8') || '{}')
    } catch {
      return {}
    }
  }
  if (type.includes('x-www-form-urlencoded') || (!type && buf.length && /^[\w%.\-]+=/.test(buf.toString('utf8')))) {
    return Object.fromEntries(new URLSearchParams(buf.toString('utf8')))
  }
  return {}
}
function bearer(req) {
  const h = req.headers.authorization || ''
  const m = /^(?:Bearer|OAuth)\s+(.+)$/i.exec(h)
  return m ? m[1].trim() : null
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function metaError(res, status, message, code = 100, extra = {}) {
  return send(res, status, { error: { message, type: code === 190 ? 'OAuthException' : 'GraphMethodException', code, fbtrace_id: rnd(6), ...extra } })
}
/** Token válido do provedor (não revogado). */
function validToken(t, provider) {
  const info = t ? S.tokens.get(t) : null
  return info && info.provider === provider && !info.revoked ? info : null
}

async function download(url, bytes = 0) {
  const r = await fetch(url, bytes ? { headers: { range: `bytes=0-${bytes - 1}` } } : {})
  if (!r.ok && r.status !== 206) throw new Error(`download ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

/** Cabeçalho de JPEG: largura, altura, componentes (3 = RGB/YCbCr, 4 = CMYK) e perfil ICC. */
function jpegInfo(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return { jpeg: false }
  let i = 2
  let icc = Buffer.alloc(0)
  let adobe = null
  while (i < buf.length) {
    if (buf[i] !== 0xff) break
    const marker = buf[i + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    const len = buf.readUInt16BE(i + 2)
    const seg = buf.subarray(i + 4, i + 2 + len)
    if (marker === 0xe2 && seg.subarray(0, 12).toString('latin1') === 'ICC_PROFILE\0') icc = Buffer.concat([icc, seg.subarray(14)])
    if (marker === 0xee && seg.subarray(0, 5).toString('latin1') === 'Adobe') adobe = seg[11]
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      return {
        jpeg: true,
        height: seg.readUInt16BE(1),
        width: seg.readUInt16BE(3),
        components: seg[5],
        hasIcc: icc.length > 0,
        iccSrgb: icc.includes(Buffer.from('sRGB')) || icc.includes(Buffer.from('s\0R\0G\0B')),
        adobeTransform: adobe,
        size: buf.length,
      }
    }
    i += 2 + len
  }
  return { jpeg: true, width: null, height: null }
}

async function checkImageUrl(url) {
  const buf = await download(url)
  const info = jpegInfo(buf)
  S.downloads.push({ url: url.replace(/token=[^&]+/, 'token=...'), ...info })
  return info
}
async function checkVideoUrl(url) {
  const head = await download(url, 64)
  const ok = head.subarray(4, 8).toString('latin1') === 'ftyp'
  S.downloads.push({ url: url.replace(/token=[^&]+/, 'token=...'), video: true, ftyp: ok })
  return ok
}

function loginPage(title, approve, cancel, scopes) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Arial,sans-serif;margin:40px;max-width:520px}a{display:inline-block;margin:8px 8px 0 0;padding:10px 14px;border:1px solid #999;border-radius:6px;text-decoration:none;color:#111}a#allow{background:#1877f2;color:#fff;border-color:#1877f2}</style></head>
<body><h1>${title}</h1><p>Rede FALSA do harness. O app pede: <code>${scopes}</code></p>
<a id="allow" href="${approve}">Continuar</a><a id="deny" href="${cancel}">Cancelar</a></body></html>`
}

function authorizePage(provider, q, res) {
  const redirect = q.get('redirect_uri')
  const state = q.get('state') || ''
  if (!redirect) return send(res, 400, { error: 'redirect_uri faltando' })
  const code = `FAKECODE-${provider}-${rnd(8)}`
  S.codes.set(code, { provider, redirect_uri: redirect, used: false })
  const sep = redirect.includes('?') ? '&' : '?'
  const approve = `${redirect}${sep}code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
  const cancel = `${redirect}${sep}error=access_denied&error_description=${encodeURIComponent('The user denied your request.')}&state=${encodeURIComponent(state)}`
  return send(res, 200, loginPage(`Entrar com ${provider}`, approve, cancel, q.get('scope') || ''))
}

function useCode(code, provider, redirect) {
  const c = code ? S.codes.get(code) : null
  if (!c || c.provider !== provider || c.used) return 'invalid'
  if (redirect && c.redirect_uri !== redirect) return 'redirect'
  c.used = true
  return 'ok'
}

// ── Insights falsos, estáveis por id ────────────────────────────────────────
function igInsights(id, metrics) {
  const base = 500 + num(id, 2000)
  const values = { reach: base, likes: Math.round(base / 9), comments: Math.round(base / 60), saved: Math.round(base / 40), shares: Math.round(base / 50), views: base * 3, replies: 2 }
  return { data: metrics.map((m) => ({ name: m, period: 'lifetime', values: [{ value: values[m] ?? 0 }], title: m, id: `${id}/insights/${m}/lifetime` })) }
}
function adDays(campaignId, since, until) {
  const out = []
  const d = new Date(`${since}T00:00:00Z`)
  const end = new Date(`${until}T00:00:00Z`)
  let i = 0
  while (d <= end && i < 400) {
    const ymd = d.toISOString().slice(0, 10)
    const seed = num(`${campaignId}:${ymd}`, 1000)
    out.push({
      date_start: ymd,
      date_stop: ymd,
      spend: (25 + seed / 10).toFixed(2),
      impressions: String(3000 + seed * 3),
      reach: String(2000 + seed * 2),
      clicks: String(40 + (seed % 60)),
      objective: (Object.values(META.campaigns).flat().find((c) => c.id === campaignId) || {}).objective || 'OUTCOME_LEADS',
      actions: [
        { action_type: 'lead', value: String(2 + (seed % 7)) },
        { action_type: 'link_click', value: String(30 + (seed % 50)) },
      ],
    })
    d.setUTCDate(d.getUTCDate() + 1)
    i++
  }
  return out
}

// ── Meta (Graph) ────────────────────────────────────────────────────────────
async function meta(req, res, path, q, buf) {
  const fields = { ...Object.fromEntries(q), ...parseFields(req, buf) }
  const p = path.replace(new RegExp(`^/${VERSION}`), '')
  const t = bearer(req) || fields.access_token || null
  const appToken = 'fake-meta-app|fake-meta-secret'

  if (p === '/oauth/access_token') {
    if (fields.grant_type === 'fb_exchange_token') {
      const info = validToken(fields.fb_exchange_token, 'meta')
      if (!info) return metaError(res, 400, 'Error validating access token: Session has expired', 190)
      const long = issue('meta', 'USER-LONG')
      return send(res, 200, { access_token: long, token_type: 'bearer', expires_in: 5183944 })
    }
    const r = useCode(fields.code, 'meta', fields.redirect_uri)
    if (r !== 'ok') return metaError(res, 400, r === 'redirect' ? 'Error validating verification code. Please make sure your redirect_uri is identical to the one you used in the OAuth dialog request' : 'This authorization code has been used.', 100)
    if (!fields.client_secret) return metaError(res, 400, 'Missing client_secret', 1)
    return send(res, 200, { access_token: issue('meta', 'USER-SHORT'), token_type: 'bearer', expires_in: 5400 })
  }
  if (p === '/debug_token') {
    const info = validToken(fields.input_token, 'meta')
    return send(res, 200, {
      data: {
        app_id: 'fake-meta-app',
        type: info?.kind?.startsWith('PAGE') ? 'PAGE' : 'USER',
        is_valid: !!info,
        expires_at: info?.kind === 'USER-LONG' ? Math.floor(Date.now() / 1000) + 5183944 : 0,
        scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish', 'instagram_manage_insights', 'read_insights', 'business_management', 'ads_read'],
        user_id: META.user.id,
      },
    })
  }
  // Revogar: DELETE /{user-id}/permissions com o token do app
  if (req.method === 'DELETE' && /\/permissions$/.test(p)) {
    if (t !== appToken && !validToken(t, 'meta')) return metaError(res, 400, 'Invalid OAuth access token', 190)
    for (const info of S.tokens.values()) if (info.provider === 'meta') info.revoked = true
    S.revokes.push({ provider: 'meta', at: Date.now() })
    return send(res, 200, { success: true })
  }
  const info = validToken(t, 'meta')
  if (!info) return metaError(res, 401, 'Invalid OAuth access token - Cannot parse access token', 190)

  if (p === '/me') return send(res, 200, { id: META.user.id, name: META.user.name })
  if (p === '/me/accounts') {
    return send(res, 200, {
      data: META.pages.map((pg) => ({
        id: pg.id,
        name: pg.name,
        access_token: issue('meta', `PAGE-${pg.id}`, { pageId: pg.id }),
        picture: { data: { url: 'https://example.invalid/page.png' } },
        instagram_business_account: { id: pg.ig.id, username: pg.ig.username, name: pg.ig.name, profile_picture_url: 'https://example.invalid/ig.png' },
      })),
      paging: {},
    })
  }
  if (p === '/me/adaccounts') return send(res, 200, { data: META.adAccounts, paging: {} })

  // Instagram: container
  let m = /^\/(\d+)\/media$/.exec(p)
  if (m && req.method === 'POST') {
    const igId = m[1]
    if (!META.pages.some((pg) => pg.ig.id === igId)) return metaError(res, 400, 'Unsupported post request.', 100)
    const id = `ctr${rnd(6)}`
    const c = { id, igId, kind: fields.media_type || 'IMAGE', caption: fields.caption || '', carouselItem: fields.is_carousel_item === 'true' || fields.is_carousel_item === true, polls: 0 }
    if (c.kind === 'CAROUSEL') {
      const children = String(fields.children || '').split(',').filter(Boolean)
      if (children.length < 2 || children.length > 20) return metaError(res, 400, 'The carousel must have between 2 and 20 children.', 100)
      for (const ch of children) if (!S.containers.has(ch)) return metaError(res, 400, `Child ${ch} not found`, 100)
      c.children = children
    } else if (fields.image_url) {
      const img = await checkImageUrl(fields.image_url).catch((e) => ({ error: e.message }))
      if (img.error || !img.jpeg) return metaError(res, 400, 'Only photo or video can be accepted as media type. (image is not JPEG)', 9004, { error_subcode: 2207052 })
      if (img.components !== 3) return metaError(res, 400, 'The image color space is not supported (CMYK).', 9004, { error_subcode: 2207026 })
      if (img.width > 1440 || img.width < 320) return metaError(res, 400, `Invalid image width ${img.width}`, 9004)
      if (img.size > 8 * 1024 * 1024) return metaError(res, 400, 'The image is over 8 MB', 9004)
      c.image = img
    } else if (fields.video_url) {
      const ok = await checkVideoUrl(fields.video_url).catch(() => false)
      if (!ok) return metaError(res, 400, 'The video file is not MP4/MOV', 9004, { error_subcode: 2207026 })
      c.video = true
    } else return metaError(res, 400, 'image_url or video_url is required', 100)
    S.containers.set(id, c)
    return send(res, 200, { id })
  }
  // Instagram: lista das mídias da conta (GET), mais nova primeiro. O Nevo usa
  // para achar o post de um container que saiu numa tentativa anterior.
  if (m && req.method === 'GET') {
    const limit = Math.max(1, Math.min(50, Number(fields.limit || 25)))
    const data = S.published
      .filter((x) => x.network === 'INSTAGRAM' && S.containers.get(x.creationId)?.igId === m[1])
      .slice()
      .reverse()
      .slice(0, limit)
      .map((x) => ({ id: x.id, caption: x.caption, permalink: `https://www.instagram.com/p/FAKE${x.id.slice(-6)}/`, timestamp: new Date(x.at).toISOString() }))
    return send(res, 200, { data, paging: {} })
  }
  // Instagram: publicar
  m = /^\/(\d+)\/media_publish$/.exec(p)
  if (m && req.method === 'POST') {
    const c = S.containers.get(fields.creation_id)
    if (!c) return metaError(res, 400, 'The media is not ready for publishing, please wait for a moment', 9007, { error_subcode: 2207027 })
    S.mediaPublishCalls.set(c.id, (S.mediaPublishCalls.get(c.id) || 0) + 1)
    if (c.published) return metaError(res, 400, 'The media has already been published', 9007)
    c.published = true
    const mediaId = `1790${Date.now()}${num(c.id, 1000)}`
    const items = c.children ? c.children.map((ch) => S.containers.get(ch)) : [c]
    S.published.push({
      network: 'INSTAGRAM',
      id: mediaId,
      creationId: c.id,
      kind: c.kind,
      caption: c.caption,
      media: items.map((it) => (it.image ? { image: it.image } : { video: true })),
      at: Date.now(),
    })
    return send(res, 200, { id: mediaId })
  }
  // Instagram: insights e campos da mídia
  m = /^\/(\d+)\/insights$/.exec(p)
  const isAdCampaign = m && Object.values(META.campaigns).flat().some((c) => c.id === m[1])
  if (m && req.method === 'GET' && !isAdCampaign) {
    const metrics = String(fields.metric || '').split(',').filter(Boolean)
    if (S.published.find((x) => x.id === m[1] && x.network === 'INSTAGRAM')) return send(res, 200, igInsights(m[1], metrics))
    // post do Facebook
    const fb = S.published.find((x) => x.id === m[1] && x.network === 'FACEBOOK')
    if (fb) {
      const base = 300 + num(fb.id, 900)
      const val = { post_media_view: base * 2, post_total_media_view_unique: base, post_clicks: Math.round(base / 12), post_reactions_by_type_total: { like: Math.round(base / 10), love: 3 } }
      return send(res, 200, { data: metrics.map((x) => ({ name: x, period: 'lifetime', values: [{ value: val[x] ?? 0 }] })), paging: {} })
    }
    return metaError(res, 400, 'Unsupported get request.', 100)
  }
  // Facebook: foto, feed, vídeo
  m = /^\/(\d+)\/photos$/.exec(p)
  if (m && req.method === 'POST') {
    if (m[1] !== META.pages[0].id || info.kind !== `PAGE-${m[1]}`) return metaError(res, 403, '(#200) The user hasn\'t authorized the application to perform this action', 200)
    const img = await checkImageUrl(fields.url).catch((e) => ({ error: e.message }))
    if (img.error || !img.jpeg) return metaError(res, 400, 'Invalid image', 324)
    const photoId = `ph${rnd(5)}`
    S.fbPhotos.set(photoId, { image: img })
    if (String(fields.published) === 'false') return send(res, 200, { id: photoId })
    const postId = `${m[1]}_${rnd(6)}`
    S.published.push({ network: 'FACEBOOK', id: postId, kind: 'PHOTO', caption: fields.caption || '', media: [{ image: img }], at: Date.now() })
    return send(res, 200, { id: photoId, post_id: postId })
  }
  m = /^\/(\d+)\/feed$/.exec(p)
  if (m && req.method === 'POST') {
    if (info.kind !== `PAGE-${m[1]}`) return metaError(res, 403, '(#200) Requires pages_manage_posts', 200)
    const attached = Array.isArray(fields.attached_media) ? fields.attached_media : []
    for (const a of attached) if (!S.fbPhotos.has(a.media_fbid)) return metaError(res, 400, 'Invalid media_fbid', 100)
    const postId = `${m[1]}_${rnd(6)}`
    S.published.push({ network: 'FACEBOOK', id: postId, kind: attached.length ? 'MULTI_PHOTO' : 'TEXT', caption: fields.message || '', media: attached.map((a) => S.fbPhotos.get(a.media_fbid)), at: Date.now() })
    return send(res, 200, { id: postId })
  }
  m = /^\/(\d+)\/videos$/.exec(p)
  if (m && req.method === 'POST') {
    if (info.kind !== `PAGE-${m[1]}`) return metaError(res, 403, '(#200) Requires pages_manage_posts', 200)
    const ok = await checkVideoUrl(fields.file_url).catch(() => false)
    if (!ok) return metaError(res, 400, 'Invalid video file', 352)
    const vid = `vd${Date.now()}`
    S.published.push({ network: 'FACEBOOK', id: vid, kind: 'VIDEO', caption: fields.description || '', media: [{ video: true }], at: Date.now() })
    return send(res, 200, { id: vid })
  }
  // Anúncios
  m = /^\/(act_\d+)\/campaigns$/.exec(p)
  if (m) return send(res, 200, { data: META.campaigns[m[1]] || [], paging: {} })
  m = /^\/(\d+)\/insights$/.exec(p)
  if (m) {
    const tr = JSON.parse(fields.time_range || '{}')
    return send(res, 200, { data: adDays(m[1], tr.since, tr.until), paging: {} })
  }
  // GET de nó (container, mídia, post)
  m = /^\/([\w.-]+)$/.exec(p)
  if (m && req.method === 'GET') {
    const id = m[1]
    const c = S.containers.get(id)
    if (c) {
      c.polls++
      const status = c.video && c.polls < 2 ? 'IN_PROGRESS' : c.published ? 'PUBLISHED' : 'FINISHED'
      return send(res, 200, { id, status_code: status, status: status === 'IN_PROGRESS' ? 'In Progress: Media is still being processed.' : 'Finished: Media has been uploaded.' })
    }
    const pub = S.published.find((x) => x.id === id)
    if (pub?.network === 'INSTAGRAM') {
      const base = 500 + num(id, 2000)
      return send(res, 200, { id, permalink: `https://www.instagram.com/p/FAKE${id.slice(-6)}/`, like_count: Math.round(base / 9), comments_count: Math.round(base / 60) })
    }
    if (pub?.network === 'FACEBOOK') {
      const base = 300 + num(id, 900)
      return send(res, 200, { id, permalink_url: `https://www.facebook.com/${id}`, shares: { count: Math.round(base / 40) }, comments: { data: [], summary: { total_count: Math.round(base / 30) } }, reactions: { data: [], summary: { total_count: Math.round(base / 10) } } })
    }
    return metaError(res, 404, `Unsupported get request. Object with ID '${id}' does not exist`, 100)
  }
  return metaError(res, 404, `Rota falsa não existe: ${req.method} ${path}`, 100)
}

// ── Google / YouTube ────────────────────────────────────────────────────────
async function googleOauth(req, res, path, q, buf) {
  const f = { ...Object.fromEntries(q), ...parseFields(req, buf) }
  if (path === '/token') {
    if (f.grant_type === 'refresh_token') {
      const info = validToken(f.refresh_token, 'youtube')
      if (!info || info.kind !== 'REFRESH') return send(res, 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' })
      return send(res, 200, { access_token: issue('youtube', 'ACCESS'), expires_in: 3599, scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly', token_type: 'Bearer' })
    }
    const r = useCode(f.code, 'youtube', f.redirect_uri)
    if (r !== 'ok') return send(res, 400, { error: 'invalid_grant', error_description: 'Bad Request' })
    return send(res, 200, {
      access_token: issue('youtube', 'ACCESS'),
      expires_in: 3599,
      refresh_token: issue('youtube', 'REFRESH'),
      scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
      token_type: 'Bearer',
    })
  }
  if (path === '/revoke') {
    for (const info of S.tokens.values()) if (info.provider === 'youtube') info.revoked = true
    S.revokes.push({ provider: 'youtube', at: Date.now() })
    return send(res, 200, {})
  }
  return send(res, 404, { error: 'not_found' })
}

async function google(req, res, path, q, buf) {
  const info = validToken(bearer(req), 'youtube')
  if (!info || info.kind !== 'ACCESS') return send(res, 401, { error: { code: 401, message: 'Request had invalid authentication credentials.', status: 'UNAUTHENTICATED' } })
  if (path === '/youtube/v3/channels') {
    return send(res, 200, { items: [{ id: YT.channel.id, snippet: { title: YT.channel.title, customUrl: YT.channel.customUrl, thumbnails: { default: { url: 'https://example.invalid/yt.png' } } } }] })
  }
  if (path === '/youtube/v3/videos' && req.method === 'GET') {
    const id = q.get('id')
    const pub = S.published.find((x) => x.id === id && x.network === 'YOUTUBE')
    if (!pub) return send(res, 200, { items: [] })
    const base = 800 + num(id, 5000)
    return send(res, 200, { items: [{ id, statistics: { viewCount: String(base), likeCount: String(Math.round(base / 20)), commentCount: String(Math.round(base / 200)) } }] })
  }
  if (path === '/upload/youtube/v3/videos' && req.method === 'POST') {
    if (q.get('uploadType') !== 'resumable') return send(res, 400, { error: { message: 'uploadType=resumable' } })
    const total = Number(req.headers['x-upload-content-length'])
    const meta = parseFields(req, buf)
    if (!total || !meta?.snippet?.title) return send(res, 400, { error: { code: 400, message: 'Missing title or length' } })
    const sid = rnd(8)
    S.ytSessions.set(sid, { total, received: 0, meta, chunks: 0, firstBytes: null })
    return send(res, 200, {}, { location: `http://127.0.0.1:${PORT}/google/upload-session/${sid}` })
  }
  const m = /^\/upload-session\/(\w+)$/.exec(path)
  if (m && req.method === 'PUT') {
    const s = S.ytSessions.get(m[1])
    if (!s) return send(res, 404, { error: { message: 'session expired' } })
    const range = req.headers['content-range'] || ''
    const all = /bytes \*\/(\d+)/.exec(range)
    if (all) {
      if (s.done) return send(res, 200, s.done)
      return send(res, 308, '', s.received ? { range: `bytes=0-${s.received - 1}` } : {})
    }
    const r = /bytes (\d+)-(\d+)\/(\d+)/.exec(range)
    if (!r || Number(r[1]) !== s.received || Number(r[3]) !== s.total) return send(res, 400, { error: { message: `bad range ${range}, expected ${s.received}` } })
    if (!s.firstBytes) s.firstBytes = buf.subarray(0, 16)
    s.received = Number(r[2]) + 1
    s.chunks++
    if (s.received < s.total) return send(res, 308, '', { range: `bytes=0-${s.received - 1}` })
    if (s.firstBytes.subarray(4, 8).toString('latin1') !== 'ftyp') return send(res, 400, { error: { message: 'invalid video' } })
    const id = `ytv${rnd(5)}`
    s.done = { kind: 'youtube#video', id, snippet: s.meta.snippet, status: s.meta.status }
    S.published.push({ network: 'YOUTUBE', id, kind: 'VIDEO', caption: s.meta.snippet.description || '', title: s.meta.snippet.title, chunks: s.chunks, bytes: s.total, at: Date.now() })
    return send(res, 201, s.done)
  }
  return send(res, 404, { error: { message: `rota falsa ${req.method} ${path}` } })
}

// ── LinkedIn ────────────────────────────────────────────────────────────────
async function liWww(req, res, path, q, buf) {
  const f = { ...Object.fromEntries(q), ...parseFields(req, buf) }
  if (path === '/oauth/v2/authorization') return authorizePage('linkedin', q, res)
  if (path === '/oauth/v2/accessToken') {
    if (f.grant_type === 'refresh_token') {
      const info = validToken(f.refresh_token, 'linkedin')
      if (!info) return send(res, 400, { error: 'invalid_grant', error_description: 'The provided refresh token is invalid' })
      return send(res, 200, { access_token: issue('linkedin', 'ACCESS'), expires_in: 5184000, refresh_token: f.refresh_token, refresh_token_expires_in: 31536000 })
    }
    const r = useCode(f.code, 'linkedin', f.redirect_uri)
    if (r !== 'ok') return send(res, 400, { error: 'invalid_request', error_description: 'Unable to retrieve access token: authorization code not found' })
    return send(res, 200, { access_token: issue('linkedin', 'ACCESS'), expires_in: 5184000, refresh_token: issue('linkedin', 'REFRESH'), refresh_token_expires_in: 31536000, scope: 'r_organization_admin,r_organization_social,w_organization_social' })
  }
  if (path === '/oauth/v2/revoke') {
    const info = S.tokens.get(f.token)
    if (info) info.revoked = true
    S.revokes.push({ provider: 'linkedin', at: Date.now() })
    return send(res, 200, {})
  }
  return send(res, 404, { message: 'not found' })
}

async function li(req, res, path, q, buf) {
  if (path.startsWith('/upload/')) {
    const id = path.split('/')[2]
    const up = S.liUploads.get(id)
    if (!up || req.method !== 'PUT') return send(res, 404, { message: 'upload not found' })
    up.bytes += buf.length
    up.parts++
    if (!up.firstBytes) up.firstBytes = buf.subarray(0, 16)
    return send(res, up.kind === 'image' ? 201 : 200, '', { etag: `"etag-${id}-${up.parts}"` })
  }
  const info = validToken(bearer(req), 'linkedin')
  if (!info) return send(res, 401, { status: 401, serviceErrorCode: 65600, code: 'INVALID_ACCESS_TOKEN', message: 'Invalid access token' })
  if (!/^\d{6}$/.test(String(req.headers['linkedin-version'] || ''))) return send(res, 400, { status: 400, message: 'A version must be present' })
  if (req.headers['x-restli-protocol-version'] !== '2.0.0') return send(res, 400, { status: 400, message: 'X-Restli-Protocol-Version 2.0.0 required' })
  if (path === '/rest/organizationAcls') return send(res, 200, { elements: LI.orgs.map((o) => ({ role: 'ADMINISTRATOR', organization: `urn:li:organization:${o.id}`, roleAssignee: 'urn:li:person:fake', state: 'APPROVED' })), paging: { count: 10, start: 0, links: [] } })
  let m = /^\/rest\/organizations\/(\d+)$/.exec(path)
  if (m) {
    const o = LI.orgs.find((x) => x.id === m[1])
    return o ? send(res, 200, { id: Number(o.id), localizedName: o.localizedName, vanityName: o.vanityName }) : send(res, 404, { message: 'not found' })
  }
  const body = parseFields(req, buf)
  if (path === '/rest/images' && q.get('action') === 'initializeUpload') {
    const id = rnd(6)
    S.liUploads.set(id, { kind: 'image', bytes: 0, parts: 0 })
    return send(res, 200, { value: { uploadUrlExpiresAt: Date.now() + 3600e3, uploadUrl: `http://127.0.0.1:${PORT}/li/upload/${id}`, image: `urn:li:image:FAKE${id}` } })
  }
  if (path === '/rest/videos' && q.get('action') === 'initializeUpload') {
    const size = Number(body?.initializeUploadRequest?.fileSizeBytes || 0)
    const id = rnd(6)
    const PART = 4 * 1024 * 1024
    const parts = []
    for (let s = 0; s < size; s += PART) parts.push({ uploadUrl: `http://127.0.0.1:${PORT}/li/upload/${id}`, firstByte: s, lastByte: Math.min(size, s + PART) - 1 })
    S.liUploads.set(id, { kind: 'video', bytes: 0, parts: 0, size })
    S.liVideos.set(`urn:li:video:FAKE${id}`, { uploadId: id, polls: 0, finalized: false })
    return send(res, 200, { value: { uploadUrlsExpireAt: Date.now() + 3600e3, video: `urn:li:video:FAKE${id}`, uploadInstructions: parts, uploadToken: '' } })
  }
  if (path === '/rest/videos' && q.get('action') === 'finalizeUpload') {
    const v = S.liVideos.get(body?.finalizeUploadRequest?.video)
    if (!v) return send(res, 400, { message: 'video not found' })
    const up = S.liUploads.get(v.uploadId)
    if ((body.finalizeUploadRequest.uploadedPartIds || []).length !== up.parts) return send(res, 400, { message: 'parts mismatch' })
    v.finalized = true
    return send(res, 200, {})
  }
  m = /^\/rest\/videos\/(.+)$/.exec(path)
  if (m) {
    const v = S.liVideos.get(decodeURIComponent(m[1]))
    if (!v) return send(res, 404, { message: 'not found' })
    v.polls++
    return send(res, 200, { id: decodeURIComponent(m[1]), status: v.finalized && v.polls > 1 ? 'AVAILABLE' : 'PROCESSING' })
  }
  if (path === '/rest/posts' && req.method === 'POST') {
    if (!String(body.author || '').startsWith('urn:li:organization:')) return send(res, 422, { status: 422, message: 'author must be an organization urn' })
    if (body.lifecycleState !== 'PUBLISHED' || body.visibility !== 'PUBLIC' || !body.distribution) return send(res, 400, { status: 400, code: 'MISSING_FIELD', message: 'missing fields' })
    const urn = `urn:li:share:7${Date.now()}`
    const media = body.content?.multiImage?.images || (body.content?.media ? [body.content.media] : [])
    S.published.push({ network: 'LINKEDIN', id: urn, kind: body.content?.multiImage ? 'MULTI_IMAGE' : body.content?.media?.id?.includes(':video:') ? 'VIDEO' : media.length ? 'IMAGE' : 'TEXT', caption: body.commentary, media, at: Date.now() })
    return send(res, 201, '', { 'x-restli-id': urn })
  }
  if (path === '/rest/organizationalEntityShareStatistics') {
    const base = 200 + num(q.toString(), 900)
    return send(res, 200, { elements: [{ totalShareStatistics: { impressionCount: base * 4, uniqueImpressionsCount: base * 3, clickCount: Math.round(base / 5), likeCount: Math.round(base / 9), commentCount: 4, shareCount: 2, engagement: 0.03 } }] })
  }
  return send(res, 404, { status: 404, message: `rota falsa ${req.method} ${path}` })
}

// ── TikTok ──────────────────────────────────────────────────────────────────
function ttErr(res, status, code, message) {
  return send(res, status, { data: {}, error: { code, message, log_id: rnd(8) } })
}
async function tt(req, res, path, q, buf) {
  const f = { ...Object.fromEntries(q), ...parseFields(req, buf) }
  if (path === '/v2/oauth/token/') {
    if (f.grant_type === 'refresh_token') {
      const info = validToken(f.refresh_token, 'tiktok')
      if (!info) return send(res, 400, { error: 'invalid_grant', error_description: 'Refresh token is invalid or expired.' })
      return send(res, 200, { access_token: issue('tiktok', 'ACCESS'), expires_in: 86400, open_id: TT.user.open_id, refresh_token: issue('tiktok', 'REFRESH'), refresh_expires_in: 31536000, scope: 'user.info.basic,video.upload', token_type: 'Bearer' })
    }
    const r = useCode(f.code, 'tiktok', f.redirect_uri)
    if (r !== 'ok') return send(res, 400, { error: 'invalid_grant', error_description: 'Authorization code is expired.' })
    return send(res, 200, { access_token: issue('tiktok', 'ACCESS'), expires_in: 86400, open_id: TT.user.open_id, refresh_token: issue('tiktok', 'REFRESH'), refresh_expires_in: 31536000, scope: 'user.info.basic,video.upload', token_type: 'Bearer' })
  }
  if (path === '/v2/oauth/revoke/') {
    const info = S.tokens.get(f.token)
    if (info) info.revoked = true
    S.revokes.push({ provider: 'tiktok', at: Date.now() })
    return send(res, 200, {})
  }
  if (path.startsWith('/upload/')) {
    const id = path.split('/')[2]
    const up = S.ttUploads.get(id)
    if (!up) return ttErr(res, 404, 'not_found', 'upload not found')
    const r = /bytes (\d+)-(\d+)\/(\d+)/.exec(req.headers['content-range'] || '')
    if (!r || Number(r[1]) !== up.received || Number(r[3]) !== up.size) return ttErr(res, 400, 'invalid_param', 'Content-Range inválido')
    if (!up.first) up.first = buf.subarray(0, 16)
    up.received = Number(r[2]) + 1
    up.chunks++
    if (up.received >= up.size) {
      const p = S.ttPublishes.get(up.publishId)
      p.uploaded = true
      p.ftyp = up.first.subarray(4, 8).toString('latin1') === 'ftyp'
    }
    return send(res, up.received >= up.size ? 201 : 206, '')
  }
  const info = validToken(bearer(req), 'tiktok')
  if (!info) return ttErr(res, 401, 'access_token_invalid', 'The access token is invalid or not found in the request.')
  if (path === '/v2/user/info/') return send(res, 200, { data: { user: TT.user }, error: { code: 'ok', message: '', log_id: rnd(8) } })
  if (path === '/v2/post/publish/inbox/video/init/') {
    const s = f.source_info || {}
    if (s.source !== 'FILE_UPLOAD') return ttErr(res, 400, 'invalid_param', 'source must be FILE_UPLOAD')
    const pending = [...S.ttPublishes.values()].filter((p) => !p.done).length
    if (pending >= 5) return ttErr(res, 403, 'spam_risk_too_many_pending_share', 'too many pending shares')
    const id = rnd(6)
    const publishId = `v_inbox_file~v2.${rnd(10)}`
    S.ttUploads.set(id, { publishId, size: Number(s.video_size), received: 0, chunks: 0, expected: Number(s.total_chunk_count) })
    S.ttPublishes.set(publishId, { publishId, uploaded: false, polls: 0, size: Number(s.video_size), chunkSize: Number(s.chunk_size), count: Number(s.total_chunk_count) })
    return send(res, 200, { data: { publish_id: publishId, upload_url: `http://127.0.0.1:${PORT}/tt/upload/${id}` }, error: { code: 'ok', message: '', log_id: rnd(8) } })
  }
  if (path === '/v2/post/publish/status/fetch/') {
    const p = S.ttPublishes.get(f.publish_id)
    if (!p) return ttErr(res, 400, 'invalid_param', 'publish_id not found')
    p.polls++
    let status = 'PROCESSING_UPLOAD'
    if (p.uploaded && !p.ftyp) status = 'FAILED'
    else if (p.uploaded && p.polls > 1) {
      status = 'SEND_TO_USER_INBOX'
      if (!p.done) {
        p.done = true
        S.published.push({ network: 'TIKTOK', id: p.publishId, kind: 'INBOX_DRAFT', bytes: p.size, at: Date.now() })
      }
    }
    return send(res, 200, { data: { status, fail_reason: status === 'FAILED' ? 'file_format_check_failed' : undefined, uploaded_bytes: p.size }, error: { code: 'ok', message: '', log_id: rnd(8) } })
  }
  return ttErr(res, 404, 'not_found', `rota falsa ${req.method} ${path}`)
}

// ── Servidor ────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const path = url.pathname
  const q = url.searchParams
  if (req.method === 'OPTIONS') return send(res, 204, '')
  const buf = await readBody(req)

  if (path.startsWith('/__control')) {
    const body = parseFields(req, buf)
    if (path === '/__control/state') {
      return send(res, 200, {
        calls: S.calls,
        published: S.published,
        mediaPublishCalls: Object.fromEntries(S.mediaPublishCalls),
        downloads: S.downloads,
        tokensIssued: S.tokens.size,
        revokes: S.revokes,
        ytSessions: [...S.ytSessions.values()].map((s) => ({ total: s.total, received: s.received, chunks: s.chunks, done: !!s.done })),
        ttPublishes: [...S.ttPublishes.values()],
        liUploads: [...S.liUploads.values()].map((u) => ({ kind: u.kind, bytes: u.bytes, parts: u.parts })),
      })
    }
    if (path === '/__control/reset') {
      reset()
      return send(res, 200, { ok: true })
    }
    if (path === '/__control/fail') {
      S.fails.push({ match: String(body.match || ''), status: body.status ?? 503, times: Number(body.times ?? 1), body: body.body })
      return send(res, 200, { ok: true, fails: S.fails })
    }
    if (path === '/__control/delay') {
      S.delays.push({ match: String(body.match || ''), ms: Number(body.ms || 0) })
      return send(res, 200, { ok: true })
    }
    if (path === '/__control/clear-faults') {
      S.fails = []
      S.delays = []
      return send(res, 200, { ok: true })
    }
    if (path === '/__control/revoke') {
      for (const info of S.tokens.values()) if (!body.provider || info.provider === body.provider) info.revoked = true
      return send(res, 200, { ok: true })
    }
    return send(res, 404, { error: 'controle desconhecido' })
  }

  let provider = null
  let sub = path
  for (const [prefix, name] of [
    ['/meta-www', 'meta-www'],
    ['/meta', 'meta'],
    ['/google-auth', 'google-auth'],
    ['/google-oauth', 'google-oauth'],
    ['/google', 'google'],
    ['/li-www', 'li-www'],
    ['/li', 'li'],
    ['/tt-www', 'tt-www'],
    ['/tt', 'tt'],
  ]) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      provider = name
      sub = path.slice(prefix.length) || '/'
      break
    }
  }
  const key = `${provider}:${req.method} ${sub}`
  S.calls.push({ at: Date.now(), key, query: [...q.keys()].join(','), auth: !!req.headers.authorization })

  for (const d of S.delays) if (key.includes(d.match)) await sleep(d.ms)
  const fail = S.fails.find((f) => f.times > 0 && key.includes(f.match))
  if (fail) {
    fail.times--
    if (fail.status === 'drop') return req.socket.destroy()
    return send(res, Number(fail.status), fail.body ?? { error: { message: 'Service temporarily unavailable (falha simulada)', code: 2, is_transient: true } })
  }

  try {
    if (provider === 'meta-www') {
      if (sub === `/${VERSION}/dialog/oauth`) return authorizePage('meta', q, res)
      return send(res, 404, 'not found')
    }
    if (provider === 'meta') return await meta(req, res, sub, q, buf)
    if (provider === 'google-auth') {
      if (sub === '/o/oauth2/v2/auth') {
        if (q.get('access_type') !== 'offline') return send(res, 400, { error: 'access_type=offline faltando' })
        return authorizePage('youtube', q, res)
      }
      return send(res, 404, 'not found')
    }
    if (provider === 'google-oauth') return await googleOauth(req, res, sub, q, buf)
    if (provider === 'google') return await google(req, res, sub, q, buf)
    if (provider === 'li-www') return await liWww(req, res, sub, q, buf)
    if (provider === 'li') return await li(req, res, sub, q, buf)
    if (provider === 'tt-www') {
      if (sub === '/v2/auth/authorize/') return authorizePage('tiktok', q, res)
      return send(res, 404, 'not found')
    }
    if (provider === 'tt') return await tt(req, res, sub, q, buf)
    return send(res, 404, { error: `rede falsa desconhecida: ${path}` })
  } catch (error) {
    console.error('[fake-social] erro', key, error)
    return send(res, 500, { error: { message: String(error?.message || error) } })
  }
})

server.listen(PORT, '127.0.0.1', () => console.log(`[fake-social] redes falsas em http://127.0.0.1:${PORT}`))
