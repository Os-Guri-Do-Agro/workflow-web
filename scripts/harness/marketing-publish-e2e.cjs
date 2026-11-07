// Roteiro de ponta a ponta da PUBLICAÇÃO NAS REDES (ala Marketing, R2, parte A):
// todos os critérios de aceite da parte A da spec
// docs/specs/2026/q4/q4-2/ala-marketing/r2-publicacao-dados-avisos.md,
// pela API, pelo banco, pelas redes falsas e pela tela (Edge, 1440 e 375).
//
// Uso (agente A):
//   node fake-social.mjs 54351          (o roteiro sobe sozinho se não estiver no ar)
//   bash marketing-db.sh wf_pub         (banco limpo)
//   (cd ../../../workflow-api && NODE_OPTIONS=--max-old-space-size=4096 npx nest build)
//   VITE_API_URL=http://127.0.0.1:3651 vite --port 5251   (no ar)
//   node marketing-publish-e2e.cjs
//
// O roteiro SOBE A PRÓPRIA API na porta 3651 (pare a sua antes): primeiro sem
// as chaves das redes (critério "inerte sem chave"), depois com as chaves
// apontando para as redes falsas, e por um instante uma SEGUNDA instância
// (porta efêmera, mesmo banco) para provar que dois agendadores não publicam
// duas vezes. Os logs das APIs ficam em prints/marketing-publish/api-*.log e
// são varridos atrás de token no fim.
//
// Env: API_PORT (3651), WEB (http://localhost:5251), HARNESS_DB (wf_pub),
// SOCIAL (http://127.0.0.1:54351), SHOTS, ONLY=a,b,... (partes), KEEP_API=1
// (deixa a API com chaves no ar no fim). Storage: HARNESS_STORAGE_URL (padrão 54329) e
// STORAGE_DIR, a pasta drive-files dele (padrão fake-storage-data/drive-files).
const { chromium } = require('playwright-core')
const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const pg = require('pg')

const API_DIR = path.resolve(__dirname, '../../../workflow-api')
const sharp = require(path.join(API_DIR, 'node_modules/sharp'))
const PORT = Number(process.env.API_PORT ?? 3651)
const API = `http://127.0.0.1:${PORT}`
const WEB = process.env.WEB ?? 'http://localhost:5251'
const DB = process.env.HARNESS_DB ?? 'wf_pub'
const SOCIAL = process.env.SOCIAL ?? 'http://127.0.0.1:54351'
const OUT = process.env.SHOTS ?? path.join(__dirname, 'prints', 'marketing-publish')
fs.mkdirSync(OUT, { recursive: true })
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean)
const on = (part) => !ONLY.length || ONLY.includes(part)
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, `seed-marketing-out.${DB}.json`), 'utf8'))
const G = seed.groupId
const U = seed.users
const C = seed.companies
const ENCRYPTION_KEY = 'harnesskey-32-bytes-local-only!!'

let fails = 0
const results = []
const check = (crit, cond, msg, extra = '') => {
  const line = `${cond ? 'OK  ' : 'FAIL'} [${crit}] ${msg}${extra !== '' && extra !== undefined ? '  (' + String(extra).slice(0, 300) + ')' : ''}`
  console.log(line)
  results.push(line)
  if (!cond) fails++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, timeout = 15000, step = 300) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    try {
      last = await fn()
    } catch {
      last = undefined
    }
    if (last) return last
    await sleep(step)
  }
  return last
}
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
function decrypt(enc) {
  const [iv, tag, data] = enc.split(':')
  const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), Buffer.from(iv, 'hex'))
  d.setAuthTag(Buffer.from(tag, 'hex'))
  return d.update(data, 'hex', 'utf8') + d.final('utf8')
}
function encrypt(text) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), iv)
  let e = c.update(text, 'utf8', 'hex')
  e += c.final('hex')
  return `${iv.toString('hex')}:${c.getAuthTag().toString('hex')}:${e}`
}

// ── Processos (API com e sem chaves, segunda instância, redes falsas) ──────
const procs = []
// API_DIST: build à parte (`tsc -p tsconfig.build.json --outDir <pasta>`), sem `nest build` no dist compartilhado.
const API_DIST = process.env.API_DIST ?? path.join(API_DIR, 'dist')
function runDir(name) {
  // RUN_PREFIX: pasta própria quando outro agente roda o roteiro ao mesmo tempo.
  const dir = path.resolve(API_DIR, '..', `.api-run-${process.env.RUN_PREFIX ?? ''}${name}`)
  fs.mkdirSync(dir, { recursive: true })
  fs.rmSync(path.join(dir, 'dist'), { recursive: true, force: true })
  fs.cpSync(API_DIST, path.join(dir, 'dist'), { recursive: true })
  if (!fs.existsSync(path.join(dir, 'node_modules'))) fs.symlinkSync(path.join(API_DIR, 'node_modules'), path.join(dir, 'node_modules'), 'junction')
  fs.copyFileSync(path.join(API_DIR, 'package.json'), path.join(dir, 'package.json'))
  return dir
}
const SOCIAL_ENV = {
  META_APP_ID: 'fake-meta-app',
  META_APP_SECRET: 'fake-meta-secret',
  META_GRAPH_URL: `${SOCIAL}/meta`,
  META_AUTH_URL: `${SOCIAL}/meta-www`,
  YOUTUBE_CLIENT_ID: 'fake-yt',
  YOUTUBE_CLIENT_SECRET: 'fake-yt-secret',
  YOUTUBE_API_URL: `${SOCIAL}/google`,
  YOUTUBE_AUTH_URL: `${SOCIAL}/google-auth`,
  YOUTUBE_OAUTH_URL: `${SOCIAL}/google-oauth`,
  LINKEDIN_CLIENT_ID: 'fake-li',
  LINKEDIN_CLIENT_SECRET: 'fake-li-secret',
  LINKEDIN_API_URL: `${SOCIAL}/li`,
  LINKEDIN_AUTH_URL: `${SOCIAL}/li-www`,
  TIKTOK_CLIENT_KEY: 'fake-tt',
  TIKTOK_CLIENT_SECRET: 'fake-tt-secret',
  TIKTOK_API_URL: `${SOCIAL}/tt`,
  TIKTOK_AUTH_URL: `${SOCIAL}/tt-www`,
}
function baseEnv(port) {
  const env = { ...process.env }
  for (const k of [...Object.keys(SOCIAL_ENV), 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) delete env[k]
  const db = `postgresql://postgres:postgres@127.0.0.1:55432/${DB}?sslmode=disable`
  return {
    ...env,
    NODE_ENV: 'development',
    DOTENV_CONFIG_PATH: 'C:/nao-existe/.env',
    DATABASE_URL_IPV6_FAST_CONNECTION: db,
    DATABASE_URL_IPV4_POOL_CONNECTION: db,
    JWT_SECRET: 'harness-jwt-secret-local-only',
    ENCRYPTION_KEY,
    PORT: String(port),
    SUPABASE_BUCKET_URL: process.env.HARNESS_STORAGE_URL ?? 'http://127.0.0.1:54329',
    SUPABASE_SERVICE_ROLE_BUCKET_KEY: 'harness',
    TIMER_AUTO_STOP_ENABLED: 'false',
    FRONTEND_URL: WEB,
    PUBLIC_API_URL: API,
    QR_PUBLIC_BASE_URL: API,
    MARKETING_MAX_FILE_BYTES: '419430400',
    MARKETING_PUBLISH_CRON: '*/5 * * * * *',
    MARKETING_PUBLISH_BACKOFF_SEC: '5,10,15',
    MARKETING_PUBLISH_POLL_MS: '200',
  }
}
async function startApi(name, { social, port = PORT }) {
  const dir = runDir(name)
  const log = path.join(OUT, `api-${name}.log`)
  const out = fs.openSync(log, 'w')
  const env = { ...baseEnv(port), ...(social ? SOCIAL_ENV : {}) }
  const proc = spawn(process.execPath, ['dist/src/main.js'], { cwd: dir, env, stdio: ['ignore', out, out] })
  procs.push(proc)
  const ok = await waitFor(() => fs.readFileSync(log, 'utf8').includes('Nest application successfully started'), 240000, 500)
  if (!ok) throw new Error(`API ${name} não subiu (veja ${log})`)
  let actualPort = port
  if (port === 0) {
    // Porta efêmera: descobre pelo netstat do processo.
    const { execSync } = require('node:child_process')
    const net = execSync(`netstat -ano -p tcp`).toString().split('\n').find((l) => l.includes('LISTENING') && l.trim().endsWith(` ${proc.pid}`))
    actualPort = net ? Number(net.trim().split(/\s+/)[1].split(':').pop()) : null
  }
  return { proc, log, port: actualPort }
}
async function stopApi(handle) {
  if (!handle?.proc || handle.proc.exitCode !== null) return
  handle.proc.kill()
  await waitFor(() => handle.proc.exitCode !== null || handle.proc.signalCode !== null, 10000, 200)
}
async function ensureFakeSocial() {
  const up = await fetch(`${SOCIAL}/__control/state`).then((r) => r.ok).catch(() => false)
  if (up) return
  const proc = spawn(process.execPath, [path.join(__dirname, 'fake-social.mjs'), String(new URL(SOCIAL).port)], { stdio: 'ignore' })
  procs.push(proc)
  await waitFor(() => fetch(`${SOCIAL}/__control/state`).then((r) => r.ok), 10000)
}
const social = {
  state: async () => (await fetch(`${SOCIAL}/__control/state`)).json(),
  reset: () => fetch(`${SOCIAL}/__control/reset`, { method: 'POST' }),
  fail: (match, status, times) =>
    fetch(`${SOCIAL}/__control/fail`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ match, status, times }) }),
  delay: (match, ms) =>
    fetch(`${SOCIAL}/__control/delay`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ match, ms }) }),
  clear: () => fetch(`${SOCIAL}/__control/clear-faults`, { method: 'POST' }),
}

// ── Login com cache (10 logins por minuto) ──────────────────────────────────
const CACHE = path.join(os.tmpdir(), 'nevo-harness-pub-tokens.json')
async function login(email) {
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {}
  const key = `${DB}|${email}`
  const hit = cache[key]
  if (hit && hit.exp > Date.now()) {
    const r = await fetch(`${API}/user/me`, { headers: { authorization: `Bearer ${hit.token}` } }).catch(() => null)
    if (r?.ok && (await r.json())?.email === email) return hit.token
  }
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'nevo1234' }) })
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`)
  const token = (await r.json()).accessToken
  cache[key] = { token, exp: Date.now() + 6 * 3600e3 }
  fs.writeFileSync(CACHE, JSON.stringify(cache))
  return token
}

// ── API ─────────────────────────────────────────────────────────────────────
const seenBodies = []
const apiBad = []
async function api(token, method, route, body) {
  const url = route.startsWith('/marketing') || route.startsWith('/user') ? `${API}${route}` : `${API}/marketing/g/${G}${route}`
  const r = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await r.text()
  seenBodies.push(text)
  let data = null
  try {
    data = JSON.parse(text)
  } catch {}
  if (r.status >= 500 || r.status === 401) apiBad.push(`${r.status} ${method} ${route}`)
  return { status: r.status, data }
}

async function upload(token, cardId, buffer, name, mimeType, meta = {}) {
  const t = await api(token, 'POST', `/cards/${cardId}/assets`, { name, mimeType, size: buffer.length, sha256: sha(buffer) })
  if (t.status !== 201) throw new Error(`ticket ${t.status} ${JSON.stringify(t.data)}`)
  const put = await fetch(t.data.uploadUrl, { method: 'PUT', headers: { 'content-type': mimeType, authorization: `Bearer ${t.data.token}` }, body: buffer })
  if (!put.ok) throw new Error(`PUT ${put.status}`)
  const c = await api(token, 'POST', `/assets/${t.data.asset.id}/confirm`, meta)
  if (c.status >= 300) throw new Error(`confirm ${c.status}`)
  return c.data
}

// ── Arquivos de teste ───────────────────────────────────────────────────────
async function photo(w, h, hue, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="hsl(${hue},55%,60%)"/><text x="50%" y="50%" font-family="Arial" font-size="${Math.round(w / 9)}" font-weight="700" text-anchor="middle" fill="#222">${label}</text></svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer()
}
/** MP4 estrutural (ftyp + moov + mdat), sem codificador: a duração e o tamanho do quadro são o que conta. */
function mp4({ durationSec = 10, width = 1080, height = 1920, pad = 200 * 1024 } = {}) {
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b }
  const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n & 0xffff); return b }
  const box = (type, ...p) => { const body = Buffer.concat(p); return Buffer.concat([u32(8 + body.length), Buffer.from(type, 'latin1'), body]) }
  const full = (type, v, f, ...p) => box(type, Buffer.from([v, (f >> 16) & 255, (f >> 8) & 255, f & 255]), ...p)
  const matrix = Buffer.concat([u32(0x10000), u32(0), u32(0), u32(0), u32(0x10000), u32(0), u32(0), u32(0), u32(0x40000000)])
  const T = 1000, D = Math.round(durationSec * T)
  const ftyp = box('ftyp', Buffer.from('isom'), u32(0x200), Buffer.from('isomiso2avc1mp41'))
  const sps = Buffer.from([0x67, 0x42, 0xc0, 0x1e, 0xd9, 0x00, 0xa0, 0x47, 0xfe, 0xc8]), pps = Buffer.from([0x68, 0xce, 0x3c, 0x80])
  const avcC = box('avcC', Buffer.from([1, 0x42, 0xc0, 0x1e, 0xff, 0xe1]), u16(sps.length), sps, Buffer.from([1]), u16(pps.length), pps)
  const entry = box('avc1', Buffer.alloc(6), u16(1), u16(0), u16(0), Buffer.alloc(12), u16(width), u16(height), u32(0x480000), u32(0x480000), u32(0), u16(1), Buffer.alloc(32), u16(0x18), u16(0xffff), avcC)
  const moov = (off) => box('moov',
    full('mvhd', 0, 0, u32(0), u32(0), u32(T), u32(D), u32(0x10000), u16(0x100), Buffer.alloc(10), matrix, Buffer.alloc(24), u32(2)),
    box('trak', full('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(D), Buffer.alloc(8), u16(0), u16(0), u16(0), u16(0), matrix, u32(width << 16), u32(height << 16)),
      box('mdia', full('mdhd', 0, 0, u32(0), u32(0), u32(T), u32(D), u16(0x55c4), u16(0)), full('hdlr', 0, 0, u32(0), Buffer.from('vide'), Buffer.alloc(12), Buffer.from('VideoHandler\0')),
        box('minf', full('vmhd', 0, 1, Buffer.alloc(8)), box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
          box('stbl', full('stsd', 0, 0, u32(1), entry), full('stts', 0, 0, u32(1), u32(1), u32(D)), full('stsc', 0, 0, u32(1), u32(1), u32(1), u32(1)), full('stsz', 0, 0, u32(0), u32(1), u32(pad)), full('stco', 0, 0, u32(1), u32(off)))))))
  const len = moov(0).length
  const mdat = Buffer.concat([u32(8 + pad), Buffer.from('mdat'), Buffer.alloc(pad, 0x11)])
  return Buffer.concat([ftyp, moov(ftyp.length + len + 8), mdat])
}

// ── Navegador ───────────────────────────────────────────────────────────────
const DESK = { width: 1440, height: 900, mobile: false }
const PHONE = { width: 375, height: 812, mobile: true }
const pageBad = []
const pageErrors = []
const wsFrames = []
const pageBodies = []
async function newCtx(browser, token, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.mobile ? 2 : 1,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    reducedMotion: 'reduce',
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  await ctx.addInitScript(([t]) => {
    localStorage.setItem('token', t)
    localStorage.setItem('ui.theme', 'light')
    localStorage.setItem('onboarding.autoShown', '1')
    localStorage.setItem('onboarding.completed', '1')
    localStorage.setItem('ui.idlePermissionPrompt', 'done')
    localStorage.setItem('ui.timerSounds', 'false')
    localStorage.setItem('nevo.idle.protectionSnoozedUntil', String(Date.now() + 864e5))
  }, [token])
  return ctx
}
function watchPage(page, who) {
  page.on('response', async (res) => {
    const u = res.url()
    if (!u.startsWith(API)) return
    if (res.status() === 401 || res.status() >= 500) pageBad.push(`${who}: ${res.status()} ${res.request().method()} ${u.replace(API, '')}`)
    try {
      const ct = res.headers()['content-type'] || ''
      if (ct.includes('json')) pageBodies.push(await res.text())
    } catch {}
  })
  page.on('websocket', (ws) => {
    ws.on('framereceived', (f) => wsFrames.push(String(f.payload)))
    ws.on('framesent', (f) => wsFrames.push(String(f.payload)))
  })
  page.on('pageerror', (e) => pageErrors.push(`${who}: ${e.message}`))
}
async function open(ctx, route, who) {
  const page = await ctx.newPage()
  watchPage(page, who)
  await page.goto(WEB + route, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.addStyleTag({ content: '#__vue-devtools-container__{display:none!important}' }).catch(() => {})
  await sleep(500)
  return page
}
async function goto(page, route) {
  await page.goto(WEB + route, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await sleep(500)
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name), fullPage: false })
async function tallShot(page, name, height = 1700) {
  const vp = page.viewportSize()
  await page.setViewportSize({ width: vp.width, height })
  await sleep(300)
  await page.screenshot({ path: path.join(OUT, name) })
  await page.setViewportSize(vp)
}
const scrollWidth = (page) => page.evaluate(() => document.documentElement.scrollWidth)

// O Prisma grava `timestamp` sem fuso, em UTC: lido como UTC (o `pg` leria no fuso da máquina).
pg.types.setTypeParser(1114, (s) => new Date(`${s.replace(' ', 'T')}Z`))

;(async () => {
  const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
  await db.connect()
  const q = async (sql, params) => (await db.query(sql, params)).rows
  const one = async (sql, params) => (await q(sql, params))[0]

  await ensureFakeSocial()
  await social.reset()
  // Rodada limpa: cards, contas e campanhas "E2E" deste roteiro.
  await q(`DELETE FROM "MarketingCard" WHERE "groupId"=$1 AND title LIKE 'E2E Pub%'`, [G])
  await q(`DELETE FROM "MarketingSocialAccount" WHERE "groupId"=$1`, [G])
  await q(`DELETE FROM "MarketingExpense" WHERE "groupId"=$1 AND notes LIKE '%[meta-ads %'`, [G])
  await q(`DELETE FROM "MarketingCampaign" WHERE "groupId"=$1 AND name LIKE 'E2E Pub%'`, [G])
  await q(`DELETE FROM "Notification" WHERE type LIKE 'MARKETING_PUBLISH%' OR type LIKE 'MARKETING_SOCIAL%' OR type='MARKETING_PUBLISHED'`)

  let main = null
  let second = null
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const tok = {}
  try {
    // ══════════════════════════════════════════════════════════════════════
    // A1. Sem chave da rede: passo a passo com as URLs de callback; a ala segue
    // ══════════════════════════════════════════════════════════════════════
    main = await startApi('pub-nokeys', { social: false })
    for (const who of ['nicolas', 'leticia', 'marcel', 'freela', 'diretoria', 'luis']) tok[who] = await login(`${who}@nevo.test`)

    async function approvedCard(title, { kind = 'POST', networks = ['INSTAGRAM'], files = [], publishInSec = 3600, captions, company = C.pet, assignee = U.marcel } = {}) {
      const created = await api(tok.marcel, 'POST', '/cards', { companyId: company, title, kind, status: 'IN_PRODUCTION', networks })
      if (created.status !== 201) throw new Error(`card ${title}: ${created.status} ${JSON.stringify(created.data)}`)
      const id = created.data.id
      await api(tok.marcel, 'PATCH', `/cards/${id}`, {
        captions: captions ?? Object.fromEntries(networks.map((n) => [n, `Legenda ${n} de ${title}`])),
        hashtags: ['pets'],
        assigneeId: assignee,
      })
      const ids = []
      for (const f of files) ids.push((await upload(tok.marcel, id, f.buffer, f.name, f.mime, f.meta ?? {})).id)
      const v = await api(tok.marcel, 'POST', `/cards/${id}/versions`, { assetIds: ids })
      if (v.status !== 201) throw new Error(`versão ${title}: ${v.status} ${JSON.stringify(v.data)}`)
      await api(tok.marcel, 'POST', `/cards/${id}/move`, { status: 'AWAITING_APPROVAL' })
      const ap = await api(tok.leticia, 'POST', `/cards/${id}/approve`, {})
      if (ap.status !== 200) throw new Error(`aprovar ${title}: ${ap.status} ${JSON.stringify(ap.data)}`)
      await api(tok.marcel, 'PATCH', `/cards/${id}`, { publishAt: new Date(Date.now() + publishInSec * 1000).toISOString() })
      return id
    }
    const planItems = (plan, override = {}) =>
      plan.map((p) => ({ network: p.network, mode: p.defaultMode, placement: p.defaultPlacement, accountId: p.defaultAccountId, ...(override[p.network] ?? {}) }))

    if (on('a1')) {
      const st = await api(tok.nicolas, 'GET', '/social/status')
      check('A1', st.status === 200 && st.data.providers.every((p) => !p.configured), 'sem as chaves, as 4 redes aparecem como "sem chave"', st.data?.providers?.map((p) => `${p.provider}:${p.configured}`).join(' '))
      check('A1', st.data.providers.every((p) => p.callbackUrl === `${API}/marketing/social/callback/${p.provider}`), 'URL de callback de cada rede pronta (base pública da API)', st.data.providers.map((p) => p.callbackUrl).join(' '))
      const conn = await api(tok.nicolas, 'GET', `/social/connect/meta?companyId=${C.pet}`)
      check('A1', conn.status === 400 && /não está configurada no servidor/.test(conn.data?.message), 'conectar sem chave responde 400 com a frase, nunca 500', conn.data?.message)

      const nCtx = await newCtx(browser, tok.nicolas, DESK)
      const nPage = await open(nCtx, `/marketing/configuracoes?aba=redes&grupo=${G}`, 'nicolas')
      await nPage.locator('[data-testid="social-setup"]').waitFor({ timeout: 15000 })
      const provs = await nPage.locator('[data-testid="social-setup"] [data-provider]').evaluateAll((els) => els.map((e) => [e.dataset.provider, e.dataset.configured]))
      check('A1', provs.length === 4 && provs.every(([, c]) => c === '0'), 'a aba Redes mostra as 4 redes sem chave', JSON.stringify(provs))
      const urls = await nPage.locator('[data-testid="callback-url"]').allInnerTexts()
      check('A1', urls.includes(`${API}/marketing/social/callback/meta`) && urls.length === 4, 'o passo a passo traz a URL de callback de cada rede', urls.join(' | '))
      const steps = await nPage.locator('[data-provider="meta"] .ss__steps li').count()
      check('A1', steps >= 3, 'passo a passo de criar o app da Meta na tela', steps)
      await nPage.locator('[data-provider="meta"] [data-action="copy-callback"]').click()
      const clip = await nPage.evaluate(() => navigator.clipboard.readText()).catch(() => '')
      check('A1', clip === `${API}/marketing/social/callback/meta`, 'o botão Copiar põe a URL de callback na área de transferência', clip)
      check('A1', (await nPage.locator('[data-connect]').count()) === 0, 'sem chave não há botão Conectar')
      await tallShot(nPage, 'a1-redes-sem-chave-d1440.png', 1500)

      // A ala segue funcionando: telas e um agendamento à mão.
      const routes = ['/cards', '/home', '/campaigns', `/calendar?from=2026-11-01&to=2026-11-30`]
      const statuses = []
      for (const r of routes) statuses.push((await api(tok.nicolas, 'GET', r)).status)
      check('A1', statuses.every((s) => s === 200), 'cards, painel, campanhas e calendário respondem sem as chaves', statuses.join(','))
      const manual = await approvedCard('E2E Pub sem chave', { networks: ['INSTAGRAM', 'PINTEREST'], files: [{ buffer: await photo(1080, 1080, 40, 'A1'), name: 'a1.jpg', mime: 'image/jpeg' }], publishInSec: 8 })
      const plan = await api(tok.marcel, 'GET', `/cards/${manual}/publications`)
      check('A1', plan.data.plan.every((p) => p.defaultMode === 'MANUAL') && /não está ligada no servidor/.test(plan.data.plan[0].hint ?? ''), 'sem chave a rede sai à mão, com a explicação na linha', plan.data.plan[0].hint)
      const sch = await api(tok.marcel, 'POST', `/cards/${manual}/publications`, { items: planItems(plan.data.plan) })
      check('A1', sch.status === 201, 'agendar à mão funciona sem chave', sch.status)
      const waiting = await waitFor(async () => (await q(`SELECT status FROM "MarketingPublication" WHERE "cardId"=$1`, [manual])).every((r) => r.status === 'WAITING_MANUAL'), 40000, 1000)
      check('A1', waiting, 'na hora o agendador transforma em lembrete (WAITING_MANUAL), sem rede nenhuma')
      await nCtx.close()
    }
    await stopApi(main)

    // ══════════════════════════════════════════════════════════════════════
    // A2. Conectar a Meta (rede falsa): página, Instagram e conta de anúncio
    // ══════════════════════════════════════════════════════════════════════
    main = await startApi('pub', { social: true })
    await social.reset()
    const nCtx = await newCtx(browser, tok.nicolas, DESK)
    const nPage = await open(nCtx, `/marketing/configuracoes?aba=redes&grupo=${G}`, 'nicolas')
    await nPage.locator('[data-testid="settings-social"]').waitFor({ timeout: 15000 })
    const petBlock = nPage.locator(`[data-brand="${C.pet}"]`)
    await petBlock.locator('[data-connect="meta"]').click()
    await nPage.waitForURL(/meta-www\/v27\.0\/dialog\/oauth/, { timeout: 15000 })
    await shot(nPage, 'a2-dialogo-meta-falso.png')
    // Auditoria da parte A (achados 1 e 5): a volta do OAuth NÃO grava; abre a
    // escolha, e só quem pediu, logado, grava o que marcar, na marca escolhida.
    const pendingReq = nPage.waitForRequest((r) => /\/social\/pending\/[\w-]+$/.test(r.url()), { timeout: 20000 })
    await nPage.locator('#allow').click()
    await nPage.waitForURL(/\/marketing\/configuracoes/, { timeout: 20000 })
    const pendingKey = /\/social\/pending\/([\w-]+)$/.exec((await pendingReq).url())[1]
    const picker = nPage.locator('[data-testid="connect-picker"]')
    await picker.waitFor({ timeout: 15000 })
    await picker.locator('[data-network]').first().waitFor({ timeout: 15000 })
    const savedBefore = await q(`SELECT 1 FROM "MarketingSocialAccount" WHERE "groupId"=$1`, [G])
    check('A2', savedBefore.length === 0, 'a volta da Meta não grava nada: abre a escolha das contas', savedBefore.length)
    const pickerNets = await picker.locator('[data-network]').evaluateAll((els) => els.map((e) => e.dataset.network).sort())
    check('A2', pickerNets.join(',') === 'FACEBOOK,INSTAGRAM,META_ADS', 'a escolha mostra página, Instagram e conta de anúncio, sem nada marcado', pickerNets.join(','))
    check('A2', (await picker.locator('input[type="checkbox"]:checked').count()) === 0, 'nada vem marcado (a pessoa escolhe o que é da marca)')
    await shot(nPage, 'a2-escolher-contas-d1440.png')
    // Outra pessoa com o link da reserva: 404 (Admin, Editor, Visualizador), e nada grava.
    const otherGet = await api(tok.leticia, 'GET', `/social/pending/${pendingKey}`)
    const otherPost = await api(tok.leticia, 'POST', `/social/pending/${pendingKey}/confirm`, { companyId: C.pet, refs: ['x'] })
    const editorGet = await api(tok.marcel, 'GET', `/social/pending/${pendingKey}`)
    const viewerGet = await api(tok.diretoria, 'GET', `/social/pending/${pendingKey}`)
    check('A2', [otherGet.status, otherPost.status, editorGet.status, viewerGet.status].every((s) => s === 404), 'outra pessoa não usa a reserva de quem conectou (404, nem para Admin)', `${otherGet.status} ${otherPost.status} ${editorGet.status} ${viewerGet.status}`)
    for (const box of await picker.locator('input[type="checkbox"]').all()) await box.check()
    await picker.locator('[data-action="confirm-connection"]').click()
    await nPage.locator('[data-testid="social-banner"]').waitFor({ timeout: 15000 })
    const banner = await nPage.locator('[data-testid="social-banner"]').innerText()
    check('A2', /Meta: 3 contas conectadas na PetJourney/.test(banner), 'confirmar grava as 3 marcadas e mostra "3 contas conectadas na PetJourney"', banner)
    const reused = await api(tok.nicolas, 'GET', `/social/pending/${pendingKey}`)
    check('A2', reused.status === 404, 'a reserva é de uso único (some depois de confirmar)', reused.status)
    const urlAfter = nPage.url()
    check('A2', !/escolher=|conectado=|grupo=/.test(urlAfter) && /aba=redes/.test(urlAfter), 'a URL perde a reserva e o grupo e fica na aba Redes', urlAfter)
    const petRows = await petBlock.locator('[data-account]').evaluateAll((els) => els.map((e) => e.dataset.account))
    check('A2', ['FACEBOOK', 'INSTAGRAM', 'META_ADS'].every((n) => petRows.includes(n)), 'a marca PetJourney mostra página, Instagram e conta de anúncio', petRows.join(','))
    await tallShot(nPage, 'a2-redes-meta-conectada-d1440.png', 1300)
    const accRows = await q(`SELECT network, "accessTokenEnc", "refreshTokenEnc", "expiresAt", "companyId" FROM "MarketingSocialAccount" WHERE "groupId"=$1`, [G])
    check('A2', accRows.length === 3 && accRows.every((r) => !r.accessTokenEnc.includes('FAKETOKEN') && decrypt(r.accessTokenEnc).startsWith('FAKETOKEN-META')), 'no banco o token está cifrado (AES-GCM) e decifra para o token da rede', accRows.map((r) => r.network).join(','))
    check('A2', accRows.find((r) => r.network === 'META_ADS')?.expiresAt && !accRows.find((r) => r.network === 'INSTAGRAM')?.expiresAt, 'conta de anúncio com validade (token longo de 60 dias); página e Instagram sem validade')

    // YouTube, LinkedIn e TikTok pelo mesmo caminho (navegador falso por fetch).
    async function connectByFetch(provider, companyId) {
      const c = await api(tok.nicolas, 'GET', `/social/connect/${provider}?companyId=${companyId}`)
      const html = await (await fetch(c.data.url)).text()
      const href = /id="allow" href="([^"]+)"/.exec(html)[1].replace(/&amp;/g, '&')
      const cb = await fetch(href, { redirect: 'manual' })
      return cb.headers.get('location') ?? ''
    }
    // Conecta e confirma pela API (a mesma rota da tela): marca tudo para a marca.
    async function connectAndPick(provider, companyId) {
      const loc = await connectByFetch(provider, companyId)
      const key = new URL(loc).searchParams.get('escolher')
      if (!key) return { loc, saved: -1, blocked: [] }
      const p = await api(tok.nicolas, 'GET', `/social/pending/${key}`)
      const r = await api(tok.nicolas, 'POST', `/social/pending/${key}/confirm`, { companyId, refs: p.data.items.map((i) => i.ref) })
      return { loc, saved: r.data?.saved ?? -1, blocked: r.data?.blocked ?? [], items: p.data.items }
    }
    for (const p of ['youtube', 'linkedin', 'tiktok']) {
      const r = await connectAndPick(p, C.pet)
      check('A2', /escolher=/.test(r.loc) && r.saved === 1, `conectar ${p} abre a escolha e grava 1 conta`, `${r.loc.replace(WEB, '')} saved=${r.saved}`)
    }
    const again = await connectAndPick('meta', C.emmitec)
    check(
      'A2',
      again.saved === 0 && again.blocked.length === 3 && again.items.every((i) => i.linkedTo?.companyId === C.pet),
      'a mesma conta Meta não muda de marca sozinha (as 3 vêm travadas, "já está na PetJourney")',
      `saved=${again.saved} blocked=${again.blocked.join(' | ')}`,
    )
    // Callback adulterado: nada grava.
    const forged = await fetch(`${API}/marketing/social/callback/meta?code=FAKECODE-x&state=abc.def`, { redirect: 'manual' })
    check('A2', /erro=invalido/.test(forged.headers.get('location') ?? ''), 'callback com state forjado volta com erro e não grava', forged.headers.get('location'))
    const replay = await (async () => {
      const c = await api(tok.nicolas, 'GET', `/social/connect/tiktok?companyId=${C.pet}`)
      const html = await (await fetch(c.data.url)).text()
      const href = /id="allow" href="([^"]+)"/.exec(html)[1].replace(/&amp;/g, '&')
      await fetch(href, { redirect: 'manual' })
      return (await fetch(href, { redirect: 'manual' })).headers.get('location') ?? ''
    })()
    check('A2', /erro=repetido/.test(replay), 'o mesmo retorno do OAuth não grava duas vezes', replay.replace(WEB, ''))
    const deniedLoc = await (async () => {
      const c = await api(tok.nicolas, 'GET', `/social/connect/linkedin?companyId=${C.pet}`)
      const html = await (await fetch(c.data.url)).text()
      const href = /id="deny" href="([^"]+)"/.exec(html)[1].replace(/&amp;/g, '&')
      return (await fetch(href, { redirect: 'manual' })).headers.get('location') ?? ''
    })()
    check('A2', /erro=negado/.test(deniedLoc), 'cancelar na rede volta com "negado"', deniedLoc.replace(WEB, ''))
    const editorConnect = await api(tok.marcel, 'GET', `/social/connect/meta?companyId=${C.pet}`)
    check('A2', editorConnect.status === 403, 'Editor não conecta conta (só Dono e Admin)', editorConnect.status)

    // Conta da Emmitec (outra marca) direto no banco, para os testes de acesso.
    const emmiAccount = (await one(
      `INSERT INTO "MarketingSocialAccount"(id,"groupId","companyId",network,"externalId",name,username,"accessTokenEnc",scopes,status,meta,"updatedAt") VALUES ('acc-e2e-emmi',$1,$2,'INSTAGRAM','ig-emmitec','Emmitec','emmitec',$3,'{}','ACTIVE','{}',now()) RETURNING id`,
      [G, C.emmitec, encrypt('FAKETOKEN-EMMI-NAO-DEVE-SAIR')],
    )).id

    const accounts = (await api(tok.nicolas, 'GET', '/social/accounts')).data
    const igPet = accounts.find((a) => a.network === 'INSTAGRAM' && a.companyId === C.pet)
    check('A2', accounts.length === 7 && !JSON.stringify(accounts).includes('FAKETOKEN') && !JSON.stringify(accounts).includes('TokenEnc'), 'a lista de contas tem as 7 contas e nenhum token (nem cifrado)', accounts.map((a) => a.network).join(','))

    // ══════════════════════════════════════════════════════════════════════
    // A3. Carrossel de 3 fotos (uma CMYK) para daqui a 2 min
    // ══════════════════════════════════════════════════════════════════════
    const mCtx = await newCtx(browser, tok.marcel, DESK)
    const mPage = await open(mCtx, `/marketing?grupo=${G}`, 'marcel')
    let carousel = null
    let carouselAt = 0
    if (on('a3')) {
      const cmyk = await sharp(await photo(1600, 2000, 210, 'CMYK')).toColourspace('cmyk').jpeg({ quality: 90 }).toBuffer()
      check('A3', (await sharp(cmyk).metadata()).space === 'cmyk', 'a foto 2 do carrossel é CMYK de verdade')
      carousel = await approvedCard('E2E Pub carrossel CMYK', {
        kind: 'CAROUSEL',
        networks: ['INSTAGRAM'],
        files: [
          { buffer: await photo(2400, 2400, 20, 'Foto 1'), name: 'foto-1.jpg', mime: 'image/jpeg' },
          { buffer: cmyk, name: 'foto-2-cmyk.jpg', mime: 'image/jpeg' },
          { buffer: await sharp(await photo(1080, 1350, 130, 'Foto 3')).png().toBuffer(), name: 'foto-3.png', mime: 'image/png' },
        ],
        publishInSec: 120,
      })
      carouselAt = Date.now() + 120_000
      await goto(mPage, `/marketing/cards/${carousel}`)
      const panel = mPage.locator('[data-testid="card-publish"]')
      await panel.waitFor({ timeout: 15000 })
      await mPage.locator('[data-action="open-schedule"]').click()
      const dialog = mPage.locator('[data-testid="publish-dialog"]')
      await dialog.waitFor({ timeout: 10000 })
      await waitFor(async () => /Tudo certo para agendar/.test(await dialog.innerText()), 20000)
      const dlgText = await dialog.innerText()
      check('A3', /Carrossel/.test(dlgText) && /Publicar sozinho/.test(dlgText), 'o diálogo propõe Instagram, Publicar sozinho, Carrossel', dlgText.replace(/\s+/g, ' ').slice(0, 200))
      await shot(mPage, 'a3-dialogo-agendar-carrossel-d1440.png')
      await mPage.locator('[data-action="confirm-schedule"]').click()
      await waitFor(async () => (await one(`SELECT status FROM "MarketingCard" WHERE id=$1`, [carousel]))?.status === 'SCHEDULED', 10000)
      const pubRow = await one(`SELECT status, "scheduledAt", caption, placement, mode FROM "MarketingPublication" WHERE "cardId"=$1`, [carousel])
      check('A3', pubRow?.status === 'SCHEDULED' && pubRow.placement === 'CAROUSEL' && pubRow.mode === 'AUTO' && /#pets/.test(pubRow.caption), 'agendar cria a publicação AUTO de carrossel com a legenda congelada (legenda + hashtags)', JSON.stringify(pubRow))
      await panel.locator('[data-testid="publication-row"]').first().waitFor({ timeout: 10000 })
      await tallShot(mPage, 'a3-card-agendado-d1440.png', 1400)
    }

    // ══════════════════════════════════════════════════════════════════════
    // A4. Foto fora da proporção, Story longo e Reels curto: barrados antes
    // ══════════════════════════════════════════════════════════════════════
    if (on('a4')) {
      const tall = await approvedCard('E2E Pub feed fora da proporção', { networks: ['INSTAGRAM'], files: [{ buffer: await photo(1080, 1920, 300, '9:16'), name: 'vertical.jpg', mime: 'image/jpeg' }] })
      const story = await approvedCard('E2E Pub story longo', { kind: 'STORY', networks: ['INSTAGRAM'], files: [{ buffer: mp4({ durationSec: 75 }), name: 'story-75s.mp4', mime: 'video/mp4', meta: { durationSec: 75 } }] })
      const reel = await approvedCard('E2E Pub reels curto', { kind: 'REEL', networks: ['INSTAGRAM'], files: [{ buffer: mp4({ durationSec: 2 }), name: 'reels-2s.mp4', mime: 'video/mp4', meta: { durationSec: 2 } }] })
      const item = (placement) => [{ network: 'INSTAGRAM', mode: 'AUTO', placement, accountId: igPet.id }]
      const c1 = await api(tok.marcel, 'POST', `/cards/${tall}/publications/check`, { items: item('FEED') })
      check('A4', c1.data.items[0].problems.includes('A foto tem 1080x1920 e o feed aceita de 4:5 a 1,91:1.'), 'foto 1080x1920 no feed: "A foto tem 1080x1920 e o feed aceita de 4:5 a 1,91:1."', c1.data.items[0].problems.join(' | '))
      const c2 = await api(tok.marcel, 'POST', `/cards/${story}/publications`, { items: item('STORY') })
      check('A4', c2.status === 400 && c2.data.message === 'O Story precisa de vídeo de 3 s a 1 min, e o vídeo tem 1 min 15 s.', 'Story de 75 s barrado ao agendar (400) com a duração', c2.data?.message)
      const c3 = await api(tok.marcel, 'POST', `/cards/${reel}/publications`, { items: item('REEL') })
      check('A4', c3.status === 400 && c3.data.message === 'O Reels precisa de vídeo de 3 s a 15 min, e o vídeo tem 2 s.', 'Reels de 2 s barrado ao agendar (400) com a duração', c3.data?.message)
      const none = await q(`SELECT 1 FROM "MarketingPublication" WHERE "cardId" = ANY($1)`, [[tall, story, reel]])
      check('A4', none.length === 0, 'nada foi agendado nos três cards barrados')
      // Na tela: a frase aparece e o Agendar fica travado.
      await goto(mPage, `/marketing/cards/${reel}`)
      await mPage.locator('[data-action="open-schedule"]').click()
      const dlg = mPage.locator('[data-testid="publish-dialog"]')
      await dlg.waitFor({ timeout: 10000 })
      const prob = await waitFor(async () => {
        const t = await dlg.locator('[data-testid="publish-problems"]').innerText().catch(() => '')
        return t.includes('O Reels precisa de vídeo de 3 s a 15 min') ? t : null
      }, 20000)
      check('A4', !!prob && (await mPage.locator('[data-action="confirm-schedule"]').isDisabled()), 'na tela, o Reels curto mostra a frase em vermelho e o Agendar fica travado', prob)
      await shot(mPage, 'a4-reels-curto-barrado-d1440.png')
      await mPage.keyboard.press('Escape')
      await goto(mPage, `/marketing/cards/${tall}`)
      await mPage.locator('[data-action="open-schedule"]').click()
      const dlg2 = mPage.locator('[data-testid="publish-dialog"]')
      await dlg2.waitFor({ timeout: 10000 })
      // Escolhe o formato Feed pelo AppSelect (o padrão pode ser Feed já).
      const prob2 = await waitFor(async () => {
        const t = await dlg2.locator('[data-testid="publish-problems"]').innerText().catch(() => '')
        return t.includes('1080x1920') ? t : null
      }, 20000)
      check('A4', !!prob2, 'na tela, a foto vertical no feed mostra a proporção aceita', prob2)
      await shot(mPage, 'a4-foto-fora-proporcao-d1440.png')
      await mPage.keyboard.press('Escape')
    }

    // ══════════════════════════════════════════════════════════════════════
    // A8. TikTok vira rascunho; MANUAL vira lembrete com baixar, copiar e marcar
    // ══════════════════════════════════════════════════════════════════════
    let tiktokCard = null
    if (on('a8')) {
      tiktokCard = await approvedCard('E2E Pub TikTok e Pinterest', {
        kind: 'REEL',
        networks: ['TIKTOK', 'PINTEREST'],
        files: [{ buffer: mp4({ durationSec: 12, pad: 6 * 1024 * 1024 }), name: 'reels-12s.mp4', mime: 'video/mp4', meta: { durationSec: 12 } }],
        publishInSec: 10,
      })
      const pl = await api(tok.marcel, 'GET', `/cards/${tiktokCard}/publications`)
      const tt = pl.data.plan.find((p) => p.network === 'TIKTOK')
      check('A8', tt.defaultMode === 'DRAFT' && tt.defaultPlacement === 'VIDEO' && !!tt.defaultAccountId, 'TikTok com conta sai como rascunho (DRAFT) por padrão', JSON.stringify([tt.defaultMode, tt.defaultPlacement]))
      const s = await api(tok.marcel, 'POST', `/cards/${tiktokCard}/publications`, { items: planItems(pl.data.plan) })
      check('A8', s.status === 201, 'agenda TikTok (rascunho) e Pinterest (à mão)', s.status)
      const done = await waitFor(async () => {
        const rows = await q(`SELECT network, status FROM "MarketingPublication" WHERE "cardId"=$1`, [tiktokCard])
        return rows.find((r) => r.network === 'TIKTOK')?.status === 'DRAFT_SENT' && rows.find((r) => r.network === 'PINTEREST')?.status === 'WAITING_MANUAL' ? rows : null
      }, 60000, 1000)
      check('A8', !!done, 'na hora: TikTok DRAFT_SENT e Pinterest WAITING_MANUAL', JSON.stringify(done))
      const fake = await social.state()
      const ttPub = fake.ttPublishes[0]
      check('A8', ttPub?.uploaded && ttPub?.ftyp && ttPub.count === 1 && fake.published.some((p) => p.network === 'TIKTOK' && p.kind === 'INBOX_DRAFT'), 'o vídeo foi para a caixa de entrada do TikTok (FILE_UPLOAD em partes, ftyp conferido)', JSON.stringify(ttPub))
      // O aviso é gravado logo depois do status: espera os dois chegarem.
      const notes = (await waitFor(async () => {
        const rows = await q(`SELECT type, title, body, "userId" FROM "Notification" WHERE type IN ('MARKETING_PUBLISH_DRAFT','MARKETING_PUBLISH_NOW') AND link LIKE $1`, [`/marketing/cards/${tiktokCard}%`])
        return rows.length >= 2 ? rows : null
      }, 10000)) ?? []
      const draftNote = notes.find((n) => n.type === 'MARKETING_PUBLISH_DRAFT')
      const manualNote = notes.find((n) => n.type === 'MARKETING_PUBLISH_NOW')
      check('A8', draftNote?.title === 'Abra o TikTok para publicar E2E Pub TikTok e Pinterest' && draftNote.userId === U.marcel, 'aviso do TikTok: "Abra o TikTok para publicar ..." para o responsável', draftNote?.title)
      check('A8', manualNote?.title === 'Hora de publicar E2E Pub TikTok e Pinterest no Pinterest' && manualNote.userId === U.marcel, 'aviso do à mão: "Hora de publicar <título> no <rede>"', manualNote?.title)

      await goto(mPage, `/marketing/cards/${tiktokCard}`)
      const panel = mPage.locator('[data-testid="card-publish"]')
      await panel.locator('[data-network="PINTEREST"]').waitFor({ timeout: 15000 })
      const pin = panel.locator('[data-network="PINTEREST"]')
      const ttRow = panel.locator('[data-network="TIKTOK"]')
      check('A8', (await pin.locator('[data-action="download-art"]').count()) === 1 && (await pin.locator('[data-action="copy-caption"]').count()) === 1 && (await pin.locator('[data-action="open-network"]').count()) === 1 && (await pin.locator('[data-action="mark-published"]').count()) === 1, 'lembrete à mão mostra Baixar arte, Copiar legenda, Abrir Pinterest e Marquei como publicado')
      check('A8', /caixa de entrada do TikTok/.test(await ttRow.innerText()), 'TikTok mostra "O vídeo está na caixa de entrada do TikTok"')
      await tallShot(mPage, 'a8-tiktok-rascunho-pinterest-lembrete-d1440.png', 1500)
      const dl = mPage.waitForEvent('download', { timeout: 15000 }).catch(() => null)
      await pin.locator('[data-action="download-art"]').click()
      const download = await dl
      check('A8', !!download && /reels-12s\.mp4$/.test(download.suggestedFilename()), 'Baixar arte baixa o arquivo da versão aprovada', download?.suggestedFilename())
      await pin.locator('[data-action="copy-caption"]').click()
      const clip = await mPage.evaluate(() => navigator.clipboard.readText()).catch(() => '')
      check('A8', clip.startsWith('Legenda PINTEREST de E2E Pub TikTok e Pinterest') && clip.includes('#pets'), 'Copiar legenda copia a legenda congelada (com as hashtags)', clip.replace(/\s+/g, ' '))
      const openHref = await pin.locator('[data-action="open-network"]').getAttribute('href')
      check('A8', /pinterest\.com/.test(openHref ?? ''), 'Abrir Pinterest leva para o Pinterest', openHref)
      await pin.locator('[data-action="mark-published"]').click()
      await mPage.locator('[data-testid="mark-dialog"] input').fill('https://www.pinterest.com/pin/123456/')
      await mPage.locator('[data-action="confirm-mark"]').click()
      await waitFor(async () => (await one(`SELECT status FROM "MarketingPublication" WHERE "cardId"=$1 AND network='PINTEREST'`, [tiktokCard]))?.status === 'PUBLISHED', 10000)
      check('A8', (await one(`SELECT status FROM "MarketingCard" WHERE id=$1`, [tiktokCard])).status === 'SCHEDULED', 'com o TikTok ainda em rascunho, o card segue Agendado')
      await ttRow.locator('[data-action="mark-published"]').click()
      await mPage.locator('[data-action="confirm-mark"]').click()
      const pubCard = await waitFor(async () => {
        const c = await one(`SELECT status, "publishedUrl", "publishedAt" FROM "MarketingCard" WHERE id=$1`, [tiktokCard])
        return c?.status === 'PUBLISHED' ? c : null
      }, 10000)
      check('A8', pubCard?.publishedUrl === 'https://www.pinterest.com/pin/123456/' && !!pubCard.publishedAt, '"Marquei como publicado" nos dois fecha o card em Publicado, com o link', JSON.stringify(pubCard))
      const byScheduler = await waitFor(() => one(`SELECT summary, "actorId" FROM "MarketingLog" WHERE "entityId"=$1 AND summary LIKE '%pelo agendador%'`, [tiktokCard]), 10000)
      check('A8', byScheduler?.actorId === 'system', 'o histórico diz "pelo agendador" (autor: Nevo)', byScheduler?.summary)
    }

    // ══════════════════════════════════════════════════════════════════════
    // A11. YouTube (upload retomável), LinkedIn (vídeo em partes e várias fotos) e Facebook
    // ══════════════════════════════════════════════════════════════════════
    if (on('a11')) {
      const video = await approvedCard('E2E Pub vídeo nas redes', {
        kind: 'VIDEO',
        networks: ['YOUTUBE', 'LINKEDIN', 'FACEBOOK'],
        files: [{ buffer: mp4({ durationSec: 40, width: 1920, height: 1080, pad: 9 * 1024 * 1024 }), name: 'video-40s.mp4', mime: 'video/mp4', meta: { durationSec: 40 } }],
        publishInSec: 8,
      })
      const photos = await approvedCard('E2E Pub fotos LinkedIn e Facebook', {
        networks: ['LINKEDIN', 'FACEBOOK'],
        files: [
          { buffer: await photo(1200, 1200, 30, 'L1'), name: 'l1.jpg', mime: 'image/jpeg' },
          { buffer: await photo(1600, 900, 80, 'L2'), name: 'l2.jpg', mime: 'image/jpeg' },
        ],
        publishInSec: 8,
      })
      for (const id of [video, photos]) {
        const pl = await api(tok.marcel, 'GET', `/cards/${id}/publications`)
        const r = await api(tok.marcel, 'POST', `/cards/${id}/publications`, { items: planItems(pl.data.plan) })
        check('A11', r.status === 201, `agenda ${pl.data.plan.map((p) => `${p.network}:${p.defaultMode}:${p.defaultPlacement}`).join(' ')}`, r.data?.message ?? r.status)
      }
      const done = await waitFor(async () => {
        const rows = await q(`SELECT c.title, p.network, p.status, p.permalink, p."lastError" FROM "MarketingPublication" p JOIN "MarketingCard" c ON c.id=p."cardId" WHERE p."cardId" = ANY($1)`, [[video, photos]])
        return rows.length === 5 && rows.every((r) => r.status === 'PUBLISHED' || r.status === 'FAILED') ? rows : null
      }, 90000, 1000)
      check('A11', done?.every((r) => r.status === 'PUBLISHED'), 'as 5 publicações (YouTube, LinkedIn x2, Facebook x2) saíram', JSON.stringify(done?.map((r) => [r.network, r.status, r.lastError])))
      const fake = await social.state()
      const yt = fake.ytSessions.find((s) => s.done)
      check('A11', yt?.chunks === 2 && yt.received === yt.total, 'YouTube recebeu o vídeo pelo upload retomável em 2 partes de até 8 MB', JSON.stringify(yt))
      const ytPost = fake.published.find((p) => p.network === 'YOUTUBE')
      check('A11', ytPost?.title === 'E2E Pub vídeo nas redes' && /#pets/.test(ytPost.caption), 'título do card no YouTube e a legenda na descrição', JSON.stringify({ t: ytPost?.title }))
      const liVideo = fake.published.find((p) => p.network === 'LINKEDIN' && p.kind === 'VIDEO')
      const liUpload = fake.liUploads.find((u) => u.kind === 'video')
      check('A11', !!liVideo && liUpload?.parts === 3, 'LinkedIn: vídeo em 3 partes de 4 MB (initialize, PUT com ETag, finalize) e post com o vídeo', JSON.stringify(liUpload))
      const liMulti = fake.published.find((p) => p.network === 'LINKEDIN' && p.kind === 'MULTI_IMAGE')
      check('A11', liMulti?.media?.length === 2, 'LinkedIn: 2 fotos no mesmo post (multiImage)', liMulti?.media?.length)
      const fbVideo = fake.published.find((p) => p.network === 'FACEBOOK' && p.kind === 'VIDEO')
      const fbMulti = fake.published.find((p) => p.network === 'FACEBOOK' && p.kind === 'MULTI_PHOTO')
      check('A11', !!fbVideo && fbMulti?.media?.length === 2 && fbMulti.media.every((m) => m.image.components === 3 && m.image.width <= 1440), 'Facebook: vídeo por file_url e post com 2 fotos JPEG sRGB (attached_media)', JSON.stringify(fbMulti?.media?.map((m) => m.image.width)))
      // O card vai para Publicado logo depois da última publicação: espera os dois.
      const cards = (await waitFor(async () => {
        const rows = await q(`SELECT status, "publishedUrl" FROM "MarketingCard" WHERE id = ANY($1)`, [[video, photos]])
        return rows.every((c) => c.status === 'PUBLISHED') ? rows : null
      }, 15000)) ?? (await q(`SELECT status, "publishedUrl" FROM "MarketingCard" WHERE id = ANY($1)`, [[video, photos]]))
      check('A11', cards.every((c) => c.status === 'PUBLISHED' && c.publishedUrl), 'os dois cards foram para Publicado com o primeiro link', JSON.stringify(cards))
      const ytLink = done?.find((r) => r.network === 'YOUTUBE')?.permalink
      check('A11', /youtube\.com\/watch\?v=/.test(ytLink ?? ''), 'link do YouTube no padrão watch?v=', ytLink)
      const m = await api(tok.marcel, 'POST', `/cards/${video}/publications/metrics`)
      const ytMetrics = m.data?.publication?.publications?.find((p) => p.network === 'YOUTUBE')?.metrics
      const liMetrics = m.data?.publication?.publications?.find((p) => p.network === 'LINKEDIN')?.metrics
      check('A11', ytMetrics?.views > 0 && ytMetrics?.likes > 0 && liMetrics?.impressions > 0, 'números do YouTube (visualizações, curtidas) e do LinkedIn (impressões) chegam no card', JSON.stringify({ ytMetrics, liMetrics }))
    }

    // ══════════════════════════════════════════════════════════════════════
    // A5. Dois agendadores ao mesmo tempo não publicam duas vezes
    // ══════════════════════════════════════════════════════════════════════
    if (on('a5')) {
      const logStartA = fs.readFileSync(main.log, 'utf8').length
      second = await startApi('pub-b', { social: true, port: 0 })
      check('A5', !!second.port, 'segunda API (mesmo banco, mesmas redes) no ar', `porta ${second.port}`)
      await social.delay('POST /v27.0/17841400000000001/media_publish', 1500)
      const ids = []
      for (let i = 1; i <= 8; i++) {
        ids.push(await approvedCard(`E2E Pub dupla ${i}`, { networks: ['INSTAGRAM'], files: [{ buffer: await photo(1080, 1080, i * 60, `D${i}`), name: `d${i}.jpg`, mime: 'image/jpeg' }], publishInSec: 3600 }))
      }
      for (const id of ids) {
        const pl = await api(tok.marcel, 'GET', `/cards/${id}/publications`)
        await api(tok.marcel, 'POST', `/cards/${id}/publications`, { items: planItems(pl.data.plan) })
      }
      // Todos vencem juntos, no mesmo instante, para as duas instâncias.
      await q(`UPDATE "MarketingPublication" SET "scheduledAt"=now() - interval '1 second' WHERE "cardId" = ANY($1)`, [ids])
      const all = await waitFor(async () => {
        const rows = await q(`SELECT status, attempts, "externalId" FROM "MarketingPublication" WHERE "cardId" = ANY($1)`, [ids])
        return rows.every((r) => r.status === 'PUBLISHED') ? rows : null
      }, 60000, 1000)
      check('A5', !!all, 'as 8 publicações saíram', JSON.stringify(all?.map((r) => r.status)))
      const fake = await social.state()
      const mine = fake.published.filter((p) => p.network === 'INSTAGRAM' && /E2E Pub dupla/.test(p.caption))
      const perCaption = {}
      for (const p of mine) perCaption[p.caption] = (perCaption[p.caption] ?? 0) + 1
      const publishCalls = Object.values(fake.mediaPublishCalls)
      check('A5', mine.length === 8 && Object.values(perCaption).every((n) => n === 1), 'a rede recebeu exatamente 1 post por card (nenhum repetido)', JSON.stringify(perCaption))
      check('A5', publishCalls.every((n) => n === 1), 'nenhum container recebeu media_publish duas vezes', JSON.stringify(fake.mediaPublishCalls))
      check('A5', all.every((r) => r.attempts === 1), 'cada publicação foi pega uma vez só (attempts = 1)', all.map((r) => r.attempts).join(','))
      const logA = fs.readFileSync(main.log, 'utf8')
      const logB = fs.readFileSync(second.log, 'utf8')
      const runsOf = (log) => [...log.matchAll(/agendador: (\d+) vencida\(s\), (\d+) pega/g)].map((m) => [Number(m[1]), Number(m[2])])
      const runsA = runsOf(logA.slice(logStartA))
      const runsB = runsOf(logB)
      const sawB = runsB.reduce((s, [d]) => s + d, 0)
      const gotA = runsA.reduce((s, [, c]) => s + c, 0)
      const gotB = runsB.reduce((s, [, c]) => s + c, 0)
      check('A5', sawB > 0 && runsA.length > 0, 'as duas instâncias viram as mesmas linhas vencidas e disputaram (vencidas e pegas no log de cada uma)', `A=${JSON.stringify(runsA)} B=${JSON.stringify(runsB)}`)
      check('A5', gotA + gotB >= 8 && all.length === 8, 'cada linha foi pega por UMA instância (a outra registra a perda da disputa)', `pegas A=${gotA} B=${gotB}`)
      await social.clear()
      // Para a segunda instância só quando nada está saindo por ela (matar no meio
      // deixaria a trava até o agendador de cá retomar, 10 minutos depois).
      await waitFor(async () => (await q(`SELECT 1 FROM "MarketingPublication" WHERE status='PUBLISHING'`)).length === 0, 120000, 1000)
      await stopApi(second)
      second = null
    }

    // ══════════════════════════════════════════════════════════════════════
    // A3 (fim). O carrossel saiu: 3 JPEG sRGB até 1440 px e card Publicado com o link
    // ══════════════════════════════════════════════════════════════════════
    if (on('a3') && carousel) {
      const wait = Math.max(0, carouselAt - Date.now())
      console.log(`     ... esperando o carrossel (${Math.round(wait / 1000)} s para a hora marcada)`)
      const published = await waitFor(async () => {
        const c = await one(`SELECT status, "publishedUrl", "publishedAt" FROM "MarketingCard" WHERE id=$1`, [carousel])
        return c?.status === 'PUBLISHED' ? c : null
      }, wait + 60000, 2000)
      const pub = await one(`SELECT status, "publishedAt", permalink, "externalId" FROM "MarketingPublication" WHERE "cardId"=$1`, [carousel])
      const late = pub?.publishedAt ? Math.round((pub.publishedAt.getTime() - carouselAt) / 1000) : null
      check('A3', pub?.status === 'PUBLISHED' && late !== null && late >= -6 && late <= 30, 'saiu na hora marcada (2 min depois de agendar, no tique seguinte do agendador)', `${pub?.publishedAt?.toISOString()} (${late} s da hora marcada)`)
      const fake = await social.state()
      const post = fake.published.find((p) => p.network === 'INSTAGRAM' && p.kind === 'CAROUSEL' && /carrossel CMYK/.test(p.caption))
      const imgs = post?.media?.map((m) => m.image) ?? []
      check('A3', imgs.length === 3, 'o Instagram recebeu um carrossel com 3 itens', imgs.length)
      check('A3', imgs.every((i) => i.jpeg && i.components === 3 && i.iccSrgb), 'os 3 itens são JPEG de 3 canais com perfil sRGB (a foto CMYK foi convertida)', JSON.stringify(imgs.map((i) => [i.components, i.iccSrgb])))
      check('A3', imgs.every((i) => i.width <= 1440) && imgs[0].width === 1440 && imgs[1].width === 1440 && imgs[2].width === 1080, 'larguras até 1440 px (2400 e 1600 reduzidas; 1080 mantida)', imgs.map((i) => `${i.width}x${i.height}`).join(' '))
      check('A3', imgs.every((i) => i.size <= 8 * 1024 * 1024), 'cada JPEG com até 8 MB', imgs.map((i) => i.size).join(','))
      check('A3', !!published && published.publishedUrl === pub.permalink && /instagram\.com\/p\//.test(pub.permalink), 'o card foi sozinho para Publicado com o link do post', published?.publishedUrl)
      // Os JPEG derivados saem do storage depois de publicar. STORAGE_DIR é a pasta
      // drive-files do storage da API (HARNESS_STORAGE_URL). Pasta errada faria esta
      // checagem passar em falso: sem a pasta ou sem nada do grupo nela, falha com a frase.
      const pubId = (await one(`SELECT id FROM "MarketingPublication" WHERE "cardId"=$1`, [carousel])).id
      const storageDir = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.join(__dirname, 'fake-storage-data', 'drive-files')
      const storageProblem = !fs.existsSync(storageDir)
        ? `a pasta do storage ${storageDir} não existe: aponte STORAGE_DIR para a pasta drive-files do storage da API`
        : !fs.existsSync(path.join(storageDir, 'marketing', G))
          ? `a pasta do storage ${storageDir} não tem nada do grupo ${G}: a API grava em outro storage? Aponte STORAGE_DIR para a pasta drive-files dele`
          : null
      const derivedDir = path.join(storageDir, 'marketing', G, 'publish', pubId)
      const left = fs.existsSync(derivedDir) ? fs.readdirSync(derivedDir).filter((f) => f.endsWith('.jpg') && !f.endsWith('.meta.json')) : []
      check('A3', !storageProblem && left.length === 0, 'os JPEG derivados foram apagados do storage depois de publicar', storageProblem ?? left.join(','))
      await goto(mPage, `/marketing/cards/${carousel}`)
      const row = mPage.locator('[data-testid="card-publish"] [data-network="INSTAGRAM"]')
      await row.waitFor({ timeout: 15000 })
      check('A3', /Publicada/.test(await row.innerText()) && (await row.locator('[data-action="open-post"]').getAttribute('href')) === pub.permalink, 'o card mostra Publicada e "Ver post" com o link')
      check('A3', /Publicado/.test(await mPage.locator('[data-testid="head-status"]').innerText()), 'o status do card no topo é Publicado')
      await tallShot(mPage, 'a3-carrossel-publicado-d1440.png', 1400)
    }

    // ══════════════════════════════════════════════════════════════════════
    // A6. Rede fora do ar: 3 novas tentativas, FAILED com aviso; "Tentar de novo" publica
    // ══════════════════════════════════════════════════════════════════════
    if (on('a6')) {
      const down = await approvedCard('E2E Pub rede fora do ar', { networks: ['INSTAGRAM'], files: [{ buffer: await photo(1080, 1080, 0, 'Fora'), name: 'fora.jpg', mime: 'image/jpeg' }], publishInSec: 3600 })
      await social.fail('meta:POST /v27.0/17841400000000001/media', 'drop', 4)
      const pl = await api(tok.marcel, 'GET', `/cards/${down}/publications`)
      await api(tok.marcel, 'POST', `/cards/${down}/publications`, { items: planItems(pl.data.plan) })
      await q(`UPDATE "MarketingPublication" SET "scheduledAt"=now() WHERE "cardId"=$1`, [down])
      const failed = await waitFor(async () => {
        const r = await one(`SELECT status, attempts, "lastError" FROM "MarketingPublication" WHERE "cardId"=$1`, [down])
        return r?.status === 'FAILED' ? r : null
      }, 120000, 1000)
      check('A6', failed?.attempts === 4, 'com a rede fora: a primeira tentativa e mais 3 (1, 5 e 15 no padrão; 5, 10 e 15 s no harness)', failed?.attempts)
      check('A6', /fora do ar/.test(failed?.lastError ?? '') && /Desistiu depois de 4 tentativas/.test(failed?.lastError ?? ''), 'FAILED com a frase do motivo', failed?.lastError)
      const retryLogs = await q(`SELECT summary FROM "MarketingLog" WHERE "entityId"=$1 AND verb='publish_retry_later'`, [down])
      check('A6', retryLogs.length === 3, 'o histórico mostra as 3 novas tentativas marcadas', retryLogs.length)
      const failNote = (await waitFor(async () => {
        const rows = await q(`SELECT "userId", title FROM "Notification" WHERE type='MARKETING_PUBLISH_FAILED' AND link LIKE $1`, [`/marketing/cards/${down}%`])
        return rows.length ? rows : null
      }, 10000)) ?? []
      check('A6', failNote.length === 1 && failNote[0].userId === U.marcel, 'aviso de falha para o responsável (que também agendou)', JSON.stringify(failNote))
      await goto(mPage, `/marketing/cards/${down}`)
      const row = mPage.locator('[data-testid="card-publish"] [data-network="INSTAGRAM"]')
      await row.waitFor({ timeout: 15000 })
      check('A6', /Falhou/.test(await row.innerText()) && (await row.locator('[data-action="retry-publication"]').count()) === 1, 'o card mostra Falhou, o motivo e "Tentar de novo"')
      await tallShot(mPage, 'a6-falhou-tentar-de-novo-d1440.png', 1300)
      await row.locator('[data-action="retry-publication"]').click()
      const ok = await waitFor(async () => (await one(`SELECT status FROM "MarketingCard" WHERE id=$1`, [down]))?.status === 'PUBLISHED', 40000, 1000)
      check('A6', !!ok, '"Tentar de novo" publica e o card vai para Publicado')
    }

    // ══════════════════════════════════════════════════════════════════════
    // A7. Mudar publishAt reagenda; versão nova ou lixeira cancelam e avisam
    // ══════════════════════════════════════════════════════════════════════
    if (on('a7')) {
      const re = await approvedCard('E2E Pub reagendar', { networks: ['INSTAGRAM', 'PINTEREST'], files: [{ buffer: await photo(1080, 1080, 90, 'R'), name: 'r.jpg', mime: 'image/jpeg' }], publishInSec: 3600 })
      const pl = await api(tok.marcel, 'GET', `/cards/${re}/publications`)
      await api(tok.marcel, 'POST', `/cards/${re}/publications`, { items: planItems(pl.data.plan) })
      // Muda a data pela tela (campo Publicação do card).
      await goto(mPage, `/marketing/cards/${re}`)
      const target = new Date(Date.now() + 2 * 86_400_000)
      const local = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(target).replace(' ', 'T')
      await mPage.locator('#mkf-pub').fill(local)
      await mPage.locator('#mkf-pub').dispatchEvent('change')
      const moved = await waitFor(async () => {
        const rows = await q(`SELECT "scheduledAt" FROM "MarketingPublication" WHERE "cardId"=$1`, [re])
        const card = await one(`SELECT "publishAt" FROM "MarketingCard" WHERE id=$1`, [re])
        return rows.length === 2 && rows.every((r) => r.scheduledAt.getTime() === card.publishAt.getTime()) && Math.abs(card.publishAt.getTime() - target.getTime()) < 60_000 ? card : null
      }, 10000)
      const dbg = { card: (await one(`SELECT "publishAt" FROM "MarketingCard" WHERE id=$1`, [re]))?.publishAt, pubs: await q(`SELECT network, status, "scheduledAt" FROM "MarketingPublication" WHERE "cardId"=$1`, [re]), target: target.toISOString() }
      check('A7', !!moved, 'mudar a data de publicação no card reagenda as duas publicações para a nova hora', JSON.stringify(dbg))
      // O histórico é gravado logo DEPOIS das linhas mudarem: espera por ele (antes era corrida no roteiro).
      const log = await waitFor(() => one(`SELECT summary FROM "MarketingLog" WHERE "entityId"=$1 AND verb='publish_rescheduled' AND summary LIKE '%passou para%'`, [re]), 8000)
      check('A7', /passou para/.test(log?.summary ?? ''), 'o histórico registra o reagendamento', log?.summary)

      // Versão nova: volta para aprovação e cancela com aviso.
      // Quem sobe a V2 é a freelancer: o responsável (Marcel), que agendou, recebe o aviso.
      const extra = await upload(tok.freela, re, await photo(1080, 1080, 200, 'V2'), 'v2.jpg', 'image/jpeg')
      await api(tok.freela, 'POST', `/cards/${re}/versions`, { assetIds: [extra.id] })
      const canceled = await waitFor(async () => (await q(`SELECT status, "lastError" FROM "MarketingPublication" WHERE "cardId"=$1`, [re])).every((r) => r.status === 'CANCELED'), 10000)
      check('A7', !!canceled, 'versão nova cancela as publicações pendentes')
      const cNote = await q(`SELECT "userId", body FROM "Notification" WHERE type='MARKETING_PUBLISH_CANCELED' AND link LIKE $1`, [`/marketing/cards/${re}%`])
      check('A7', cNote.length === 1 && cNote[0].userId === U.marcel && /voltou para aprovação/.test(cNote[0].body), 'versão nova (subida pela freelancer) avisa o responsável que agendou', JSON.stringify(cNote))

      // Lixeira (parte C): agenda de novo e manda para a lixeira.
      await api(tok.marcel, 'POST', `/cards/${re}/move`, { status: 'AWAITING_APPROVAL' }).catch(() => null)
      await api(tok.leticia, 'POST', `/cards/${re}/approve`, {})
      const pl2 = await api(tok.marcel, 'GET', `/cards/${re}/publications`)
      const s2 = await api(tok.marcel, 'POST', `/cards/${re}/publications`, { items: planItems(pl2.data.plan) })
      check('A7', s2.status === 201, 'aprovado de novo, agenda outra vez', s2.status)
      const del = await api(tok.leticia, 'DELETE', `/cards/${re}`)
      const trashed = await waitFor(async () => (await q(`SELECT status, "lastError" FROM "MarketingPublication" WHERE "cardId"=$1`, [re])).every((r) => r.status === 'CANCELED' && /lixeira/.test(r.lastError)), 10000)
      check('A7', del.status === 200 && !!trashed, 'card na lixeira cancela as publicações ("o card foi para a lixeira")', del.status)
      const tNote = await q(`SELECT body FROM "Notification" WHERE type='MARKETING_PUBLISH_CANCELED' AND body LIKE '%lixeira%' AND link LIKE $1`, [`/marketing/cards/${re}%`])
      check('A7', tNote.length >= 1, 'aviso de cancelamento pela lixeira', tNote[0]?.body)
      const restored = await api(tok.leticia, 'POST', '/trash/restore', { type: 'card', id: re })
      const back = await waitFor(async () => (await q(`SELECT status FROM "MarketingPublication" WHERE "cardId"=$1`, [re])).every((r) => r.status === 'SCHEDULED'), 10000)
      check('A7', restored.status < 300 && !!back, 'restaurar da lixeira devolve o agendamento (data ainda no futuro)', restored.status)

      // Desagendar pela tela.
      await goto(mPage, `/marketing/cards/${re}`)
      await mPage.locator('[data-action="unschedule"]').click()
      await mPage.getByRole('button', { name: 'Desagendar' }).last().click()
      const un = await waitFor(async () => {
        const c = await one(`SELECT status FROM "MarketingCard" WHERE id=$1`, [re])
        const rows = await q(`SELECT status FROM "MarketingPublication" WHERE "cardId"=$1`, [re])
        return c.status === 'APPROVED' && rows.every((r) => r.status === 'CANCELED')
      }, 10000)
      check('A7', !!un, 'Desagendar volta o card para Aprovado e cancela tudo')
    }

    // ══════════════════════════════════════════════════════════════════════
    // A9. Resultados do post e anúncios da Meta (card e campanha); "Lançar gasto" não duplica
    // ══════════════════════════════════════════════════════════════════════
    if (on('a9') && carousel) {
      await goto(mPage, `/marketing/cards/${carousel}`)
      await mPage.locator('[data-action="refresh-metrics"]').click()
      const metrics = mPage.locator('[data-testid="card-publish"] [data-testid="publication-metrics"]')
      await metrics.waitFor({ timeout: 15000 })
      const mText = await metrics.innerText()
      const mRow = await one(`SELECT m.reach, m.likes, m.comments, m.saves, m.shares, m.views FROM "MarketingPostMetric" m JOIN "MarketingPublication" p ON p.id=m."publicationId" WHERE p."cardId"=$1`, [carousel])
      check('A9', mRow && mRow.reach > 0 && mRow.likes > 0 && mRow.saves > 0 && mRow.views > 0, 'Atualizar números grava alcance, curtidas, comentários, salvos, compartilhamentos e visualizações', JSON.stringify(mRow))
      check('A9', mText.includes(Number(mRow.reach).toLocaleString('pt-BR')) && /Alcance/.test(mText) && /Salvos/.test(mText), 'o card mostra os números do post', mText.replace(/\s+/g, ' '))
      await tallShot(mPage, 'a9-numeros-do-post-no-card-d1440.png', 1400)

      const camp = await api(tok.marcel, 'POST', '/campaigns', { companyId: C.pet, name: 'E2E Pub campanha de lançamento', startDate: new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10) })
      const campId = camp.data.id
      await api(tok.marcel, 'PATCH', `/cards/${carousel}`, { campaignId: campId })
      const cs = await api(tok.marcel, 'GET', `/campaigns/${campId}/social`)
      check('A9', cs.data.posts.count === 1 && cs.data.posts.totals.reach === mRow.reach, 'a campanha soma os números dos posts dos seus cards', JSON.stringify(cs.data.posts.totals))
      await goto(mPage, `/marketing/campanhas?campanha=${campId}`)
      await mPage.getByRole('tab', { name: /Resultados/ }).click()
      await mPage.locator('[data-testid="campaign-posts"]').waitFor({ timeout: 15000 })
      await mPage.locator('[data-action="link-ad"]').click()
      const dlg = mPage.locator('[data-testid="link-ad-dialog"]')
      await dlg.locator('[data-ad="23850000000000001"] [data-action="pick-ad"]').click()
      // O diálogo fecha quando a API responde (a ligação e os dias já gravados).
      await dlg.waitFor({ state: 'hidden', timeout: 30000 })
      await mPage.locator('[data-testid="ad-link"]').waitFor({ timeout: 20000 })
      const link = await one(`SELECT l.id, (SELECT count(*)::int FROM "MarketingAdMetricDay" d WHERE d."adLinkId"=l.id) AS days, (SELECT sum("spendCents")::int FROM "MarketingAdMetricDay" d WHERE d."adLinkId"=l.id) AS spend FROM "MarketingCampaignAdLink" l WHERE l."campaignId"=$1`, [campId])
      check('A9', link?.days >= 20, 'ligar a campanha de anúncio puxa um dia por linha desde o início da campanha', link?.days)
      const adText = await mPage.locator('[data-testid="ads-totals"]').innerText()
      const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ')
      check('A9', adText.replace(/\u00a0/g, ' ').includes(brl(link.spend)), 'a campanha mostra o gasto total da Meta', `${adText.replace(/\s+/g, ' ')} esperado ${brl(link.spend)}`)
      check('A9', (await mPage.locator('.csr__bar').count()) === link.days, 'série por dia desenhada (uma barra por dia)', await mPage.locator('.csr__bar').count())
      await tallShot(mPage, 'a9-anuncios-na-campanha-d1440.png', 1600)
      const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)
      const monthRow = mPage.locator(`[data-month="${month}"]`)
      await monthRow.locator('[data-action="launch-spend"]').click()
      await monthRow.locator('[data-testid="launched"]').waitFor({ timeout: 15000 })
      const exp = await q(`SELECT "amountCents", category, "campaignId", status FROM "MarketingExpense" WHERE "campaignId"=$1 AND "deletedAt" IS NULL`, [campId])
      const monthSpend = (await one(`SELECT sum("spendCents")::int AS s FROM "MarketingAdMetricDay" WHERE "adLinkId"=$1 AND date LIKE $2`, [link.id, `${month}%`])).s
      check('A9', exp.length === 1 && exp[0].category === 'Tráfego pago' && exp[0].amountCents === monthSpend, '"Lançar gasto do mês" cria um lançamento em Tráfego pago com o gasto do mês', JSON.stringify(exp))
      const dup = await api(tok.marcel, 'POST', `/campaigns/${campId}/ad-links/${link.id}/launch`, { month })
      const dupConcurrent = await Promise.all([1, 2, 3].map(() => api(tok.marcel, 'POST', `/campaigns/${campId}/ad-links/${link.id}/launch`, { month })))
      const exp2 = await q(`SELECT 1 FROM "MarketingExpense" WHERE "campaignId"=$1`, [campId])
      check('A9', dup.status === 409 && dupConcurrent.every((r) => r.status === 409) && exp2.length === 1, 'lançar de novo (inclusive 3 cliques juntos) dá 409 e não duplica', `${dup.status} ${dup.data?.message}`)
      const fin = await api(tok.marcel, 'GET', `/finance/expenses?month=${month}`)
      check('A9', fin.status === 200 && fin.data.items.filter((e) => e.campaignId === campId || e.campaign?.id === campId).length === 1, 'o lançamento aparece uma vez no Financeiro', fin.status)
      await tallShot(mPage, 'a9-gasto-lancado-d1440.png', 1600)
    }

    // ══════════════════════════════════════════════════════════════════════
    // A10. Editor de outra marca não vê a conta nem agenda nela; Visualizador só vê o status
    // ══════════════════════════════════════════════════════════════════════
    if (on('a10')) {
      const fAcc = await api(tok.freela, 'GET', '/social/accounts')
      check('A10', fAcc.status === 200 && fAcc.data.length > 0 && fAcc.data.every((a) => a.companyId === C.pet), 'freelancer (Editor só da PetJourney) vê só as contas da PetJourney', fAcc.data.map((a) => a.name).join(','))
      const emmiCard = await approvedCard('E2E Pub card da Emmitec', { company: C.emmitec, networks: ['INSTAGRAM'], files: [{ buffer: await photo(1080, 1080, 250, 'E'), name: 'e.jpg', mime: 'image/jpeg' }], assignee: null })
      const fe = await api(tok.freela, 'GET', `/cards/${emmiCard}/publications`)
      const fs2 = await api(tok.freela, 'POST', `/cards/${emmiCard}/publications`, { items: [{ network: 'INSTAGRAM', mode: 'AUTO', placement: 'FEED', accountId: emmiAccount }] })
      check('A10', fe.status === 404 && fs2.status === 404, 'freelancer não vê nem agenda card da Emmitec (404)', `${fe.status} ${fs2.status}`)
      const petCard = await approvedCard('E2E Pub card da Pet com conta alheia', { networks: ['INSTAGRAM'], files: [{ buffer: await photo(1080, 1080, 260, 'P'), name: 'p.jpg', mime: 'image/jpeg' }] })
      const wrong = await api(tok.freela, 'POST', `/cards/${petCard}/publications`, { items: [{ network: 'INSTAGRAM', mode: 'AUTO', placement: 'FEED', accountId: emmiAccount }] })
      check('A10', wrong.status === 400 && /não é da marca do card/.test(wrong.data.message), 'usar a conta da Emmitec num card da PetJourney é recusado com a frase (sem revelar a conta)', wrong.data?.message)
      const fp = await api(tok.freela, 'GET', `/cards/${petCard}/publications`)
      check('A10', fp.data.plan[0].accounts.every((a) => a.id !== emmiAccount), 'no plano do card, só as contas da marca do card', fp.data.plan[0].accounts.map((a) => a.name).join(','))
      const vCheck = await api(tok.diretoria, 'POST', `/cards/${petCard}/publications/check`, { items: [] })
      const vSched = await api(tok.diretoria, 'POST', `/cards/${petCard}/publications`, { items: [] })
      const vConnect = await api(tok.diretoria, 'GET', `/social/connect/meta?companyId=${C.pet}`)
      check('A10', vCheck.status === 403 && vSched.status === 403 && vConnect.status === 403, 'Visualizador não confere, não agenda e não conecta (403)', `${vCheck.status} ${vSched.status} ${vConnect.status}`)
      if (carousel) {
        const vView = await api(tok.diretoria, 'GET', `/cards/${carousel}/publications`)
        check('A10', vView.status === 200 && vView.data.plan === null && vView.data.publications.every((p) => p.caption === null && p.account === null && !p.can.retry && !p.can.markPublished), 'Visualizador vê só o status (sem conta, sem legenda, sem plano, sem ação)', JSON.stringify(vView.data.publications.map((p) => p.status)))
        const vCtx = await newCtx(browser, tok.diretoria, DESK)
        const vPage = await open(vCtx, `/marketing/cards/${carousel}?grupo=${G}`, 'diretoria')
        const panel = vPage.locator('[data-testid="card-publish"]')
        await panel.waitFor({ timeout: 15000 })
        check('A10', (await panel.locator('[data-action]:not([data-action="open-post"])').count()) === 0 && /Publicada/.test(await panel.innerText()), 'na tela do Visualizador: status por rede e nenhum botão de ação')
        // Auditoria da parte A: o Visualizador não recebe o plano, e mesmo assim lê o formato em português.
        const vText = await panel.innerText()
        check('A10', /Carrossel/.test(vText) && !/\b(CAROUSEL|FEED|REEL|STORY)\b/.test(vText), 'o Visualizador lê o formato em português (Carrossel), nunca o código', vText.replace(/\s+/g, ' ').slice(0, 160))
        await tallShot(vPage, 'a10-visualizador-so-status-d1440.png', 1300)
        await vCtx.close()
      }
      const outsider = await api(tok.luis, 'GET', '/social/accounts')
      check('A10', outsider.status === 403, 'quem não é da ala leva 403', outsider.status)
    }

    // ══════════════════════════════════════════════════════════════════════
    // Desconectar com revogação na rede
    // ══════════════════════════════════════════════════════════════════════
    if (on('a2')) {
      await goto(nPage, `/marketing/configuracoes?aba=redes`)
      const ttRow = nPage.locator(`[data-brand="${C.pet}"] [data-account="TIKTOK"]`)
      await ttRow.waitFor({ timeout: 15000 })
      await ttRow.locator('[data-action="disconnect"]').click()
      await nPage.getByRole('button', { name: 'Desconectar' }).last().click()
      await waitFor(async () => (await nPage.locator(`[data-brand="${C.pet}"] [data-account="TIKTOK"]`).count()) === 0, 10000)
      const ttDb = await one(`SELECT status, "accessTokenEnc", "refreshTokenEnc" FROM "MarketingSocialAccount" WHERE network='TIKTOK' AND "groupId"=$1`, [G])
      const fake = await social.state()
      check('A2', ttDb.status === 'REVOKED' && ttDb.accessTokenEnc === '' && ttDb.refreshTokenEnc === null && fake.revokes.some((r) => r.provider === 'tiktok'), 'Desconectar revoga no TikTok e apaga os tokens guardados (a linha fica para o histórico)', JSON.stringify(ttDb))
      await tallShot(nPage, 'a2-redes-depois-de-desconectar-d1440.png', 1300)
    }

    // ══════════════════════════════════════════════════════════════════════
    // Celular (375 px)
    // ══════════════════════════════════════════════════════════════════════
    if (on('mobile')) {
      const pCtx = await newCtx(browser, tok.marcel, PHONE)
      const pPage = await open(pCtx, `/marketing/configuracoes?aba=redes&grupo=${G}`, 'marcel-375')
      await pPage.locator('[data-testid="settings-social"]').waitFor({ timeout: 15000 })
      check('mobile', (await scrollWidth(pPage)) <= 375, 'aba Redes a 375 px sem rolagem lateral', await scrollWidth(pPage))
      await tallShot(pPage, 'mobile-redes-m375.png', 1600)
      if (tiktokCard) {
        await goto(pPage, `/marketing/cards/${tiktokCard}`)
        await pPage.locator('[data-testid="card-publish"]').waitFor({ timeout: 15000 })
        check('mobile', (await scrollWidth(pPage)) <= 375, 'card com o painel Publicação a 375 px sem rolagem lateral', await scrollWidth(pPage))
      }
      const fresh = await approvedCard('E2E Pub celular', { networks: ['INSTAGRAM', 'TIKTOK', 'PINTEREST'], files: [{ buffer: await photo(1080, 1350, 170, 'Cel'), name: 'cel.jpg', mime: 'image/jpeg' }] })
      await goto(pPage, `/marketing/cards/${fresh}`)
      const panel = pPage.locator('[data-testid="card-publish"]')
      await panel.scrollIntoViewIfNeeded()
      const cta = pPage.locator('[data-action="open-schedule"]')
      const box = await cta.boundingBox()
      check('mobile', box && box.height >= 44, 'botão Agendar publicação com 44 px de toque', box?.height)
      await cta.click()
      const dlg = pPage.locator('[data-testid="publish-dialog"]')
      await dlg.waitFor({ timeout: 10000 })
      await waitFor(async () => /Corrija|Tudo certo/.test(await dlg.innerText()), 20000)
      const dlgBox = await dlg.boundingBox()
      const triggers = await dlg.locator('.app-select__trigger').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))
      check('mobile', dlgBox && dlgBox.width <= 375 && (await scrollWidth(pPage)) <= 375 && triggers.every((h) => h >= 44), 'diálogo de agendar cabe em 375 px, com os selects de 44 px', `${dlgBox?.width} ${triggers.join(',')}`)
      await shot(pPage, 'mobile-agendar-m375.png')
      await pPage.keyboard.press('Escape')
      if (carousel) {
        const camp = await one(`SELECT "campaignId" FROM "MarketingCard" WHERE id=$1`, [carousel])
        if (camp?.campaignId) {
          await goto(pPage, `/marketing/campanhas?campanha=${camp.campaignId}`)
          await pPage.getByRole('tab', { name: /Resultados/ }).click().catch(() => {})
          await pPage.locator('[data-testid="campaign-ads"]').waitFor({ timeout: 15000 }).catch(() => {})
          check('mobile', (await scrollWidth(pPage)) <= 375, 'resultados da campanha (posts e anúncios) a 375 px sem rolagem lateral', await scrollWidth(pPage))
          await tallShot(pPage, 'mobile-campanha-anuncios-m375.png', 1700)
        }
      }
      await pCtx.close()
    }

    // ══════════════════════════════════════════════════════════════════════
    // Token nunca em resposta, log ou socket
    // ══════════════════════════════════════════════════════════════════════
    const leaks = []
    for (const b of [...seenBodies, ...pageBodies]) if (/FAKETOKEN/.test(b)) leaks.push(b.slice(0, 200))
    check('A2', leaks.length === 0, `nenhuma resposta da API (${seenBodies.length + pageBodies.length} lidas) tem token de rede`, leaks[0])
    check('A2', !wsFrames.some((f) => /FAKETOKEN/.test(f)), `nenhuma mensagem do socket (${wsFrames.length}) tem token`, wsFrames.length)
    const logs = fs.readdirSync(OUT).filter((f) => f.startsWith('api-') && f.endsWith('.log'))
    const logLeak = logs.filter((f) => /FAKETOKEN/.test(fs.readFileSync(path.join(OUT, f), 'utf8')))
    check('A2', logLeak.length === 0, `nenhum log das APIs (${logs.join(', ')}) tem token`, logLeak.join(','))
    const notifLeak = await q(`SELECT 1 FROM "Notification" WHERE title LIKE '%FAKETOKEN%' OR body LIKE '%FAKETOKEN%' OR link LIKE '%FAKETOKEN%'`)
    const histLeak = await q(`SELECT 1 FROM "MarketingLog" WHERE summary LIKE '%FAKETOKEN%'`)
    const errLeak = await q(`SELECT 1 FROM "MarketingPublication" WHERE "lastError" LIKE '%FAKETOKEN%' UNION ALL SELECT 1 FROM "MarketingSocialAccount" WHERE "lastError" LIKE '%FAKETOKEN%' OR meta::text LIKE '%FAKETOKEN%'`)
    check('A2', !notifLeak.length && !histLeak.length && !errLeak.length, 'nenhum aviso, histórico, motivo de erro ou meta da conta tem token')

    check('geral', apiBad.length === 0 && pageBad.length === 0, 'zero 401 e zero 5xx da API (roteiro e telas)', [...apiBad, ...pageBad].join(' | '))
    check('geral', pageErrors.length === 0, 'nenhum erro de JavaScript nas telas', pageErrors.slice(0, 3).join(' | '))
    await nCtx.close()
    await mCtx.close()
  } catch (error) {
    console.error(error)
    fails++
  } finally {
    await browser.close()
    if (second) await stopApi(second)
    if (!process.env.KEEP_API && main) await stopApi(main)
    for (const p of procs) if (p !== main?.proc && p !== second?.proc && p.exitCode === null && !process.env.KEEP_API) p.kill()
    await db.end()
    fs.writeFileSync(path.join(OUT, 'resultado.txt'), results.join('\n') + `\n\n${fails ? `${fails} FALHA(S)` : 'TUDO OK'}\n`)
    console.log(`\n${results.filter((r) => r.startsWith('OK')).length} OK, ${fails} falha(s). Prints em ${OUT}`)
    process.exit(fails ? 1 : 0)
  }
})()
