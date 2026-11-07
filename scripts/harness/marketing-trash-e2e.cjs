// Roteiro de ponta a ponta da LIXEIRA da ala (rodada R2, parte C, C6): spec
// docs/specs/2026/q4/q4-2/ala-marketing/r2-publicacao-dados-avisos.md.
//
// Os 12 tipos (card, campanha, ideia, cofre, UTM, ativação, parceiro,
// lançamento, recorrente, orçamento, pasta e item do Acervo): apagar manda para
// a lixeira e o item some de TODAS as telas e totais (listas, contagens,
// calendário, painel, totais do financeiro, ano, exportação, redirect da UTM e
// do QR); restaurar volta tudo; papéis (Admin vê e restaura tudo, Editor só o
// que mandou, "Apagar de vez" só Admin, Visualizador não vê); pasta leva os
// itens e devolve juntos; o expurgo de 30 dias apaga de vez e limpa o storage;
// card agendado na lixeira cancela a publicação e restaurar reagenda (parte A).
// Pela API e pela tela (Edge headless, 1440 e 375, claro e escuro).
//
// Uso: API=http://127.0.0.1:3671 WEB=http://localhost:5271 HARNESS_DB=wf_r2c \
//      API_RUN_DIR=../../../.api-run-3671 node marketing-trash-e2e.cjs
// Env: SHOTS (prints/marketing-trash), ONLY=A,B,C... (partes), STORAGE (URL do storage
// que a API usa, padrão http://127.0.0.1:54329; vai também para o contexto do expurgo) e
// STORAGE_DIR (a pasta drive-files desse storage, padrão fake-storage-data/drive-files).
// Pasta que não existe ou sem nada do grupo faz as checagens de storage falharem com a
// frase, em vez de o "saiu do storage" passar em falso.
// Escreve só no banco do harness (itens "E2E Lixeira ...", recriados a cada rodada).
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const pg = require('pg')

const API = process.env.API ?? 'http://127.0.0.1:3671'
const WEB = process.env.WEB ?? 'http://localhost:5271'
const DB = process.env.HARNESS_DB ?? 'wf_r2c'
const seed = JSON.parse(fs.readFileSync(path.resolve(__dirname, process.env.HARNESS_SEED ?? `seed-marketing-out.${DB}.json`), 'utf8'))
const OUT = process.env.SHOTS ?? path.join(__dirname, 'prints', 'marketing-trash')
const RUN_DIR = path.resolve(__dirname, process.env.API_RUN_DIR ?? `../../../.api-run-${new URL(API).port}`)
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean)
const STORAGE = process.env.STORAGE ?? 'http://127.0.0.1:54329'
const STORAGE_DIR = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.join(__dirname, 'fake-storage-data', 'drive-files')
const sharp = require(path.join(__dirname, '../../../workflow-api/node_modules/sharp'))
fs.mkdirSync(OUT, { recursive: true })

const G = seed.groupId
const C = seed.companies
const PET = C.pet
const RUN = Date.now().toString(36).slice(-5)
const TAG = `E2E Lixeira ${RUN}`

let fails = 0
let oks = 0
const check = (part, cond, msg, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} [${part}] ${msg}${extra !== '' && extra !== undefined ? '  (' + String(extra).slice(0, 300) + ')' : ''}`)
  if (cond) oks++
  else fails++
}
const want = (p) => !ONLY.length || ONLY.includes(p)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, timeout = 10000, step = 150) {
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

// ── Banco ──────────────────────────────────────────────────────────────────
const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
const q = async (sql, params) => (await db.query(sql, params)).rows

// ── Login com cache (a API limita 10 logins por minuto) ─────────────────────
const TOKEN_CACHE = path.join(os.tmpdir(), `nevo-harness-tokens-${DB}-${new URL(API).port}.json`)
const WHO_IP = { nicolas: 1, leticia: 2, marcel: 3, freela: 4, diretoria: 5 }
async function token(who) {
  const email = `${who}@nevo.test`
  let cache = {}
  try {
    cache = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'))
  } catch {}
  if (cache[email]) {
    const r = await fetch(`${API}/user/me`, { headers: { authorization: `Bearer ${cache[email]}` } })
    if (r.ok) return cache[email]
  }
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.61.0.${WHO_IP[who] ?? 9}` },
    body: JSON.stringify({ email, password: 'nevo1234' }),
  })
  if (!r.ok) throw new Error(`login ${who}: ${r.status}`)
  cache[email] = (await r.json()).accessToken
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify(cache))
  return cache[email]
}

async function api(who, method, route, body) {
  const tok = await token(who)
  const url = route.startsWith('/') && !route.startsWith('/marketing') && !route.startsWith('/l/') && !route.startsWith('/q/')
    ? `${API}/marketing/g/${G}${route}`
    : `${API}${route}`
  const r = await fetch(url, {
    method,
    redirect: 'manual',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await r.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { status: r.status, data, location: r.headers.get('location') }
}

async function photo(hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800"><rect width="100%" height="100%" fill="hsl(${hue},55%,58%)"/><circle cx="420" cy="260" r="90" fill="hsl(${(hue + 40) % 360},70%,85%)"/></svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer()
}

async function uploadCard(who, cardId, buffer, name) {
  const t = await api(who, 'POST', `/cards/${cardId}/assets`, { name, mimeType: 'image/jpeg', size: buffer.length, sha256: sha(buffer) })
  if (t.status !== 201) throw new Error(`ticket card ${t.status} ${JSON.stringify(t.data)}`)
  const put = await fetch(t.data.uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/jpeg', authorization: `Bearer ${t.data.token}` }, body: buffer })
  if (!put.ok) throw new Error(`PUT ${put.status}`)
  const c = await api(who, 'POST', `/assets/${t.data.asset.id}/confirm`, {})
  if (c.status >= 300) throw new Error(`confirm ${c.status}`)
  return t.data.asset.id
}

async function uploadLib(who, { companyId, folderId, name, buffer }) {
  const t = await api(who, 'POST', '/library/uploads', {
    companyId,
    folderId,
    files: [{ name, size: buffer.length, mimeType: 'image/jpeg', sha256: sha(buffer), keepBoth: true }],
  })
  const f = t.data.files[0]
  const put = await fetch(f.ticket.uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/jpeg', authorization: `Bearer ${f.ticket.token}` }, body: buffer })
  if (!put.ok) throw new Error(`PUT ${put.status}`)
  await api(who, 'POST', `/assets/${f.ticket.asset.id}/confirm`, {})
  const it = await api(who, 'POST', '/library/items', { assetId: f.ticket.asset.id, folderId: f.folderId, companyId })
  return it.data
}

const storagePath = async (assetId) => (await q('SELECT "storagePath" FROM "MarketingAsset" WHERE id=$1', [assetId]))[0]?.storagePath
const inStorage = (p) => !!p && fs.existsSync(path.join(STORAGE_DIR, ...p.split('/')))
/**
 * A pasta do storage serve? Pasta errada faria todo "saiu do storage" passar em falso,
 * então sem a pasta ou sem nada do grupo nela as checagens de storage falham com a frase.
 */
function storageProblem() {
  if (!fs.existsSync(STORAGE_DIR)) {
    return `a pasta do storage ${STORAGE_DIR} não existe: aponte STORAGE_DIR para a pasta drive-files do storage que a API usa (${STORAGE})`
  }
  if (!fs.existsSync(path.join(STORAGE_DIR, 'marketing', G))) {
    return `a pasta do storage ${STORAGE_DIR} não tem nada do grupo ${G}: a API grava em outro storage? Aponte STORAGE_DIR para a pasta drive-files do storage dela (${STORAGE})`
  }
  return null
}

/** Método de cron chamado direto num contexto da API (como o calendar-e2e faz com o aviso de prazo). */
function runInApi(code) {
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (/^DATABASE_URL|^SUPABASE|^JWT|^ENCRYPTION|^VAPID|^SENDGRID/.test(k)) delete env[k]
  const url = `postgresql://postgres:postgres@127.0.0.1:55432/${DB}?sslmode=disable`
  Object.assign(env, {
    NODE_ENV: 'development',
    DOTENV_CONFIG_PATH: 'C:/nao-existe/.env',
    DATABASE_URL_IPV6_FAST_CONNECTION: url,
    DATABASE_URL_IPV4_POOL_CONNECTION: url,
    JWT_SECRET: 'harness-jwt-secret-local-only',
    ENCRYPTION_KEY: 'harnesskey-32-bytes-local-only!!',
    SUPABASE_BUCKET_URL: STORAGE,
    SUPABASE_SERVICE_ROLE_BUCKET_KEY: 'harness',
    TIMER_AUTO_STOP_ENABLED: 'false',
    FRONTEND_URL: WEB,
  })
  const wrapped = `
    const { NestFactory } = require('@nestjs/core');
    const { AppModule } = require('./dist/src/app.module');
    (async () => {
      const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
      const out = await (async () => { ${code} })();
      console.log('RESULT ' + JSON.stringify(out));
      await app.close();
      process.exit(0);
    })().catch((e) => { console.error(e); process.exit(1); });`
  const r = spawnSync(process.execPath, ['-e', wrapped], { cwd: RUN_DIR, env, encoding: 'utf8', timeout: 180000 })
  const line = (r.stdout ?? '').split(/\r?\n/).find((l) => l.startsWith('RESULT '))
  if (!line) return { error: `${r.status} ${(r.stderr ?? '').slice(-1500)}` }
  return JSON.parse(line.slice(7))
}

// ── Navegador ─────────────────────────────────────────────────────────────
async function newPage(browser, who, vp = { width: 1440, height: 900 }, theme = 'light') {
  const t = await token(who)
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: !!vp.mobile,
    hasTouch: !!vp.mobile,
    deviceScaleFactor: vp.mobile ? 2 : 1,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    reducedMotion: 'reduce',
    colorScheme: theme,
  })
  await ctx.addInitScript(([tk, th]) => {
    localStorage.setItem('token', tk)
    localStorage.setItem('onboarding.autoShown', '1')
    localStorage.setItem('onboarding.completed', '1')
    localStorage.setItem('ui.idlePermissionPrompt', 'done')
    localStorage.setItem('ui.theme', th)
  }, [t, theme])
  const page = await ctx.newPage()
  const bad = []
  page.on('response', (res) => {
    if (res.url().startsWith(API) && (res.status() === 401 || res.status() >= 500)) bad.push(`${res.status()} ${res.url().replace(API, '')}`)
  })
  return { ctx, page, bad }
}

const month = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7)
const todayYmd = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)

// ── Dados ──────────────────────────────────────────────────────────────────
const X = {}

async function createAll() {
  const card = await api('marcel', 'POST', '/cards', { companyId: PET, title: `${TAG} card`, kind: 'POST', networks: ['INSTAGRAM'] })
  X.card = card.data
  // Publicação nesta semana (aparece no calendário e no painel).
  const publishAt = new Date(Date.now() + 2 * 3600_000).toISOString()
  await api('marcel', 'PATCH', `/cards/${X.card.id}`, { publishAt })
  X.cardAsset = await uploadCard('marcel', X.card.id, await photo(12), 'arte-lixeira.jpg')
  X.campaign = (await api('leticia', 'POST', '/campaigns', { companyId: PET, name: `${TAG} campanha` })).data
  await api('leticia', 'POST', `/campaigns/${X.campaign.id}/cards`, { cardId: X.card.id })
  X.idea = (await api('marcel', 'POST', '/ideas', { companyId: PET, title: `${TAG} ideia` })).data
  X.link = (await api('marcel', 'POST', '/links', { companyId: PET, title: `${TAG} cofre`, url: 'https://exemplo.com/cofre', secret: 'segredo-123' })).data
  X.partner = (await api('marcel', 'POST', '/partners', { companyId: PET, name: `${TAG} parceiro` })).data
  X.activation = (await api('marcel', 'POST', '/activations', { companyId: PET, title: `${TAG} ativação`, startAt: `${todayYmd}T13:00:00.000Z`, partnerId: X.partner.id })).data
  X.utm = (await api('leticia', 'POST', '/utm', {
    companyId: PET,
    targetUrl: 'https://petjourney.com.br/lixeira',
    utmSource: 'instagram',
    utmMedium: 'bio',
    utmCampaign: `lixeira-${RUN}`,
    placement: `${TAG} UTM`,
    withQr: true,
    force: true,
    campaignId: X.campaign.id,
    cardId: X.card.id,
    partnerId: X.partner.id,
    activationId: X.activation.id,
  })).data
  X.expense = (await api('marcel', 'POST', '/finance/expenses', {
    companyId: PET,
    date: todayYmd,
    description: `${TAG} lançamento`,
    amountCents: 123_45,
    category: 'Gráfica',
    status: 'PAID',
    campaignId: X.campaign.id,
    activationId: X.activation.id,
    cardId: X.card.id,
    partnerId: X.partner.id,
  })).data
  X.recurring = (await api('marcel', 'POST', '/finance/recurring', {
    companyId: PET,
    description: `${TAG} recorrente`,
    amountCents: 9_90,
    category: 'Ferramentas e assinaturas',
    dayOfMonth: 28,
    startMonth: month,
  })).data
  X.quote = (await api('marcel', 'POST', '/quotes', {
    companyId: PET,
    description: `${TAG} orçamento`,
    amountCents: 500_00,
    activationId: X.activation.id,
    partnerId: X.partner.id,
  })).data
  X.folder = (await api('marcel', 'POST', '/library/folders', { companyId: PET, name: `${TAG} pasta` })).data
  X.sub = (await api('marcel', 'POST', '/library/folders', { companyId: PET, name: 'Sub', parentId: X.folder.id })).data
  X.itemA = await uploadLib('marcel', { companyId: PET, folderId: X.folder.id, name: `lix-a-${RUN}.jpg`, buffer: await photo(200) })
  X.itemB = await uploadLib('marcel', { companyId: PET, folderId: X.sub.id, name: `lix-b-${RUN}.jpg`, buffer: await photo(260) })
  X.item = await uploadLib('marcel', { companyId: PET, folderId: null, name: `lix-solo-${RUN}.jpg`, buffer: await photo(300) })
}

/** O que cada tipo tem que mostrar (ou não) nas telas e totais. */
async function snapshot() {
  const s = {}
  const ids = (list) => new Set((list ?? []).map((x) => x.id))
  s.cards = ids((await api('leticia', 'GET', '/cards')).data)
  const cal = (await api('leticia', 'GET', `/calendar?from=${todayYmd}&to=${todayYmd.slice(0, 8)}28`)).data
  s.calendar = ids(cal?.cards)
  const home = (await api('leticia', 'GET', '/home')).data
  s.homeWeek = ids(home?.week)
  s.homeActive = Object.values(home?.countsByStatus ?? {}).reduce((a, b) => a + b, 0)
  const camps = (await api('leticia', 'GET', '/campaigns')).data ?? []
  s.campaigns = ids(camps)
  const myCamp = camps.find((c) => c.id === X.campaign.id)
  s.campCards = myCamp?.cardsCount ?? null
  s.campUtms = myCamp?.utmsCount ?? null
  s.campSpent = myCamp?.spentPaidCents ?? null
  s.ideas = ids((await api('leticia', 'GET', '/ideas?status=ALL')).data)
  s.links = ids((await api('leticia', 'GET', '/links')).data)
  s.utms = ids((await api('leticia', 'GET', '/utm')).data)
  const page = (await api('leticia', 'GET', '/utm/page')).data
  s.utmTotal = page?.total ?? null
  const acts = (await api('leticia', 'GET', '/activations')).data
  s.activations = ids(acts)
  const partners = (await api('leticia', 'GET', '/partners')).data ?? []
  s.partners = ids(partners)
  s.partnerActs = partners.find((p) => p.id === X.partner.id)?.activationsCount ?? null
  const exp = (await api('leticia', 'GET', `/finance/expenses?month=${month}`)).data
  s.expenses = ids(exp?.items)
  s.expensePaid = exp?.totals?.paidCents ?? null
  s.expenseCount = exp?.totals?.count ?? null
  const sum = (await api('leticia', 'GET', `/finance/summary?month=${month}`)).data
  s.summaryPaid = sum?.total?.paidCents ?? null
  s.recurringPending = sum?.recurringPending?.items?.map((i) => i.ruleId) ?? []
  const year = (await api('leticia', 'GET', `/finance/year?year=${month.slice(0, 4)}`)).data
  s.yearPaid = year?.total?.paidCents ?? null
  s.recurring = ids((await api('leticia', 'GET', `/finance/recurring?month=${month}`)).data?.items)
  s.quotes = ids((await api('leticia', 'GET', `/quotes`)).data)
  const folders = (await api('leticia', 'GET', `/library/folders?companyId=${PET}`)).data
  s.folders = ids(folders?.folders)
  s.libraryItems = ids((await api('leticia', 'GET', `/library/items?companyId=${PET}&limit=200`)).data?.items)
  s.redirect = (await fetch(`${API}/l/${X.utm.shortLink.code}`, { redirect: 'manual' })).status
  s.qr = (await fetch(`${API}/q/${X.utm.qr.code}`, { redirect: 'manual' })).status
  s.qrImage = (await fetch(`${API}/q/image/${X.utm.qr.code}`)).status
  const xlsx = await fetch(`${API}/marketing/g/${G}/finance/export.xlsx?month=${month}`, { headers: { authorization: `Bearer ${await token('leticia')}` } })
  s.exportOk = xlsx.status
  s.exportBytes = Buffer.from(await xlsx.arrayBuffer()).length
  const exp2 = (await api('leticia', 'GET', `/finance/expenses/${X.expense.id}`)).status
  s.expenseDetail = exp2
  return s
}

;(async () => {
  await db.connect()
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  for (const who of ['nicolas', 'leticia', 'marcel', 'freela', 'diretoria']) await token(who)

  // ── A. Os 12 tipos existem e aparecem ───────────────────────────────────
  await createAll()
  const before = await snapshot()
  if (want('A')) {
    const p = 'A'
    check(p, !!X.card?.id && !!X.campaign?.id && !!X.idea?.id && !!X.link?.id && !!X.utm?.id && !!X.activation?.id && !!X.partner?.id && !!X.expense?.id && !!X.recurring?.id && !!X.quote?.id && !!X.folder?.id && !!X.item?.id, 'os 12 tipos criados pela API', JSON.stringify(Object.fromEntries(Object.entries(X).map(([k, v]) => [k, typeof v === 'object' ? !!v?.id : !!v]))))
    check(p, before.cards.has(X.card.id) && before.calendar.has(X.card.id) && before.homeWeek.has(X.card.id), 'card na lista, no calendário e no painel')
    check(p, before.campCards === 1 && before.campUtms === 1 && before.campSpent === 12345, 'campanha conta o card, a UTM e o gasto', `${before.campCards}/${before.campUtms}/${before.campSpent}`)
    check(p, before.redirect === 302 && before.qr === 302, 'link curto e QR redirecionam', `${before.redirect}/${before.qr}`)
    check(p, before.partnerActs === 1, 'parceiro conta a ativação')
    check(p, before.expenses.has(X.expense.id) && before.recurringPending.includes(X.recurring.id), 'lançamento na lista e recorrente pendente no resumo')
  }

  // ── B. Mandar para a lixeira (pela tela e pela API) some de tudo ─────────
  if (want('B')) {
    const p = 'B'
    // Card pela tela: botão "Mandar para a lixeira", diálogo, toast com "Desfazer".
    const { ctx, page, bad } = await newPage(browser, 'marcel')
    await page.goto(`${WEB}/marketing/cards/${X.card.id}`, { waitUntil: 'networkidle' })
    await page.locator('[data-action="delete-card"]').click()
    const dlg = page.getByRole('dialog')
    await dlg.waitFor()
    check(p, /Mandar o card para a lixeira\?/.test(await dlg.innerText()) && /30 dias/.test(await dlg.innerText()), 'diálogo diz "Mandar para a lixeira" e os 30 dias')
    await page.screenshot({ path: path.join(OUT, '01-card-confirmar.png') })
    await dlg.getByRole('button', { name: 'Mandar para a lixeira' }).click()
    const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'foi para a lixeira' }).first()
    await toast.waitFor({ timeout: 8000 })
    check(p, (await toast.getByRole('button', { name: 'Desfazer' }).count()) === 1, 'toast "foi para a lixeira" com Desfazer')
    // A tela anuncia o toast e só depois troca a rota (`router.replace`): espera a URL.
    await page.waitForURL(/\/marketing\/aprovacoes/, { timeout: 8000 }).catch(() => {})
    await page.screenshot({ path: path.join(OUT, '02-toast-desfazer.png') })
    check(p, /\/marketing\/aprovacoes/.test(page.url()), 'a tela volta para a Aprovação', page.url())
    // "Desfazer" devolve o card e volta para ele.
    const navs = []
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) navs.push(f.url())
    })
    await toast.getByRole('button', { name: 'Desfazer' }).click()
    const back = await waitFor(async () => (await q('SELECT "deletedAt" FROM "MarketingCard" WHERE id=$1', [X.card.id]))[0]?.deletedAt === null)
    check(p, back, 'Desfazer restaurou o card (deletedAt nulo no banco)')
    await page.waitForURL(new RegExp(`/marketing/cards/${X.card.id}`), { timeout: 8000 }).catch(() => {})
    check(p, page.url().includes(`/marketing/cards/${X.card.id}`), 'Desfazer voltou para a página do card')
    // Auditoria da parte C: a volta leva o grupo (a tela escolhe o grupo e tira o parâmetro).
    check(
      p,
      navs.some((u) => u.includes(`/marketing/cards/${X.card.id}`) && new URL(u).searchParams.get('grupo') === G),
      'a volta do Desfazer leva ?grupo= do card',
      navs.join(' | '),
    )
    // De novo, agora para valer.
    await page.locator('[data-action="delete-card"]').click()
    await page.getByRole('dialog').getByRole('button', { name: 'Mandar para a lixeira' }).click()
    await waitFor(async () => !!(await q('SELECT "deletedAt" FROM "MarketingCard" WHERE id=$1', [X.card.id]))[0]?.deletedAt)
    // Lançamento pela tela do financeiro.
    await page.goto(`${WEB}/marketing/financeiro?aba=lancamentos&mes=${month}`, { waitUntil: 'networkidle' })
    const row = page.getByText(`${TAG} lançamento`).first()
    await row.click()
    const fx = page.getByRole('dialog')
    await fx.getByRole('button', { name: /Mandar para a lixeira/ }).click()
    await page.getByRole('dialog').filter({ hasText: 'Mandar o lançamento para a lixeira?' }).getByRole('button', { name: 'Mandar para a lixeira' }).click()
    const expGone = await waitFor(async () => !!(await q('SELECT "deletedAt" FROM "MarketingExpense" WHERE id=$1', [X.expense.id]))[0]?.deletedAt)
    check(p, expGone, 'lançamento foi para a lixeira pela tela')
    check(p, bad.length === 0, 'tela sem 401/5xx', bad.join(', '))
    await ctx.close()

    // O resto pela API, cada um por quem pode.
    const r = {
      campaign: await api('leticia', 'DELETE', `/campaigns/${X.campaign.id}`),
      idea: await api('marcel', 'DELETE', `/ideas/${X.idea.id}`),
      link: await api('marcel', 'DELETE', `/links/${X.link.id}`),
      utm: await api('leticia', 'DELETE', `/utm/${X.utm.id}`),
      activation: await api('marcel', 'DELETE', `/activations/${X.activation.id}`),
      partner: await api('marcel', 'DELETE', `/partners/${X.partner.id}`),
      recurring: await api('leticia', 'DELETE', `/finance/recurring/${X.recurring.id}`),
      quote: await api('marcel', 'DELETE', `/quotes/${X.quote.id}`),
      item: await api('marcel', 'DELETE', `/library/items/${X.item.id}`),
      folder: await api('marcel', 'DELETE', `/library/folders/${X.folder.id}`),
    }
    for (const [k, v] of Object.entries(r)) check(p, v.status === 200 && !!v.data?.trashed, `${k}: apagar devolve "trashed"`, `${v.status} ${JSON.stringify(v.data).slice(0, 120)}`)
    check(p, r.folder.data?.trashedItems === 2 && r.folder.data?.trashedFolders === 1, 'pasta levou a subpasta e os 2 arquivos', JSON.stringify(r.folder.data))

    const after = await snapshot()
    check(p, !after.cards.has(X.card.id), 'card some da lista do board')
    check(p, !after.calendar.has(X.card.id), 'card some do calendário')
    check(p, !after.homeWeek.has(X.card.id) && after.homeActive === before.homeActive - 1, 'card some do painel (semana e contagem)', `${before.homeActive} -> ${after.homeActive}`)
    check(p, !after.campaigns.has(X.campaign.id), 'campanha some da lista')
    check(p, !after.ideas.has(X.idea.id), 'ideia some (inclusive em "todas")')
    check(p, !after.links.has(X.link.id), 'link do cofre some')
    check(p, !after.utms.has(X.utm.id) && after.utmTotal === before.utmTotal - 1, 'UTM some da lista e do total', `${before.utmTotal} -> ${after.utmTotal}`)
    check(p, after.redirect === 404 && after.qr === 404, 'UTM na lixeira: link curto e QR param de redirecionar', `${after.redirect}/${after.qr}`)
    check(p, before.qrImage === 200 && after.qrImage === 404, 'UTM na lixeira: a imagem pública do QR some, como ao apagar', `${before.qrImage} -> ${after.qrImage}`)
    check(p, !after.activations.has(X.activation.id), 'ativação some')
    check(p, !after.partners.has(X.partner.id), 'parceiro some')
    check(p, !after.expenses.has(X.expense.id) && after.expenseCount === before.expenseCount - 1, 'lançamento some da lista e da contagem')
    check(p, after.expensePaid === before.expensePaid - 12345 && after.summaryPaid === before.summaryPaid - 12345, 'total pago do mês (lista e resumo) sem o lançamento', `${before.summaryPaid} -> ${after.summaryPaid}`)
    check(p, after.yearPaid === before.yearPaid - 12345, 'total do ano sem o lançamento', `${before.yearPaid} -> ${after.yearPaid}`)
    check(p, after.expenseDetail === 404, 'lançamento na lixeira não abre (404)')
    check(p, after.exportOk === 200, 'exportação do mês sai (sem o lançamento)', after.exportBytes)
    check(p, !after.recurring.has(X.recurring.id) && !after.recurringPending.includes(X.recurring.id), 'recorrente some da lista e do pendente')
    check(p, !after.quotes.has(X.quote.id), 'orçamento some')
    check(p, !after.folders.has(X.folder.id) && !after.folders.has(X.sub.id), 'pasta e subpasta somem da árvore')
    check(p, ![X.itemA.id, X.itemB.id, X.item.id].some((id) => after.libraryItems.has(id)), 'os 3 arquivos do Acervo somem')
    // O arquivo do card na lixeira não baixa; o storage continua lá (até o expurgo).
    const dl = await api('leticia', 'GET', `/assets/${X.cardAsset}/download`)
    check(p, dl.status === 404, 'arquivo de card na lixeira não baixa (404)', dl.status)
    check(p, !storageProblem() && inStorage(await storagePath(X.cardAsset)), 'o objeto continua no storage enquanto está na lixeira', storageProblem() ?? '')

    // A lixeira tem os 12 (pasta com o que foi junto; arquivo da pasta não aparece solto).
    const trash = (await api('leticia', 'GET', '/trash')).data
    const mine = (trash?.items ?? []).filter((i) => i.title.includes(TAG) || [X.item.id, X.utm.id].includes(i.id))
    const types = new Set(mine.map((i) => i.type))
    check(p, types.size === 12, 'a Lixeira lista os 12 tipos', [...types].sort().join(','))
    const folderEntry = mine.find((i) => i.type === 'library_folder')
    check(p, folderEntry?.contents?.folders === 1 && folderEntry?.contents?.items === 2, 'pasta na lixeira com "1 subpasta e 2 arquivos"', JSON.stringify(folderEntry?.contents))
    check(p, !mine.some((i) => i.id === X.itemA.id || i.id === X.itemB.id), 'arquivos que foram com a pasta não aparecem soltos')
    check(p, mine.every((i) => i.canPurge && i.canRestore), 'Admin pode restaurar e apagar de vez tudo')
  }

  // ── C. Papéis ───────────────────────────────────────────────────────────
  if (want('C')) {
    const p = 'C'
    const editor = (await api('marcel', 'GET', '/trash')).data
    const eItems = (editor?.items ?? []).filter((i) => i.title.includes(TAG) || i.id === X.item.id || i.id === X.utm.id)
    check(p, eItems.every((i) => i.deletedBy?.id === seed.users.marcel), 'Editor vê só o que ele mandou', eItems.map((i) => i.type).join(','))
    check(p, !eItems.some((i) => i.type === 'utm' || i.type === 'campaign' || i.type === 'recurring_expense'), 'o que a Admin apagou (UTM, campanha, recorrente) não aparece para o Editor')
    check(p, eItems.every((i) => i.canRestore && !i.canPurge), 'Editor restaura, não apaga de vez')
    const other = await api('marcel', 'POST', '/trash/restore', { type: 'campaign', id: X.campaign.id })
    check(p, other.status === 403, 'Editor não restaura o que outra pessoa apagou (403)', other.status)
    const purge = await api('marcel', 'DELETE', `/trash/card/${X.card.id}`)
    check(p, purge.status === 403, 'Editor não apaga de vez (403)', purge.status)
    const viewer = await api('diretoria', 'GET', '/trash')
    check(p, viewer.status === 403, 'Visualizador não vê a lixeira (403)', viewer.status)
    const vRestore = await api('diretoria', 'POST', '/trash/restore', { type: 'idea', id: X.idea.id })
    check(p, vRestore.status === 403, 'Visualizador não restaura (403)')
    // Freelancer só da PetJourney não vê o que é de outra marca na lixeira.
    const emmiCard = (await api('marcel', 'POST', '/cards', { companyId: C.emmitec, title: `${TAG} EMMI`, kind: 'POST' })).data
    await api('marcel', 'DELETE', `/cards/${emmiCard.id}`)
    const freela = (await api('freela', 'GET', '/trash')).data
    check(p, !(freela?.items ?? []).some((i) => i.id === emmiCard.id), 'freelancer não vê item da lixeira de marca que não é dele')
    // Tela: Visualizador não tem o atalho; Editor vê a frase "os itens que você mandou".
    // A Lixeira mora no cabeçalho (`placement: 'header'`), não na fita de abas.
    const v = await newPage(browser, 'diretoria')
    await v.page.goto(`${WEB}/marketing`, { waitUntil: 'networkidle' })
    await v.page.locator('[data-testid="header-link-settings"]').waitFor({ timeout: 8000 }).catch(() => {})
    check(
      p,
      (await v.page.locator('[data-testid="header-link-trash"]').count()) === 0 &&
        (await v.page.locator('.mk-tab', { hasText: 'Lixeira' }).count()) === 0 &&
        (await v.page.locator('[data-testid="header-link-settings"]').count()) === 1,
      'Visualizador não vê a Lixeira (nem no cabeçalho nem nas abas); Configurações sim',
    )
    // Auditoria da parte C: pela URL, "sem acesso" (antes dizia "A lixeira está vazia").
    await v.page.goto(`${WEB}/marketing/lixeira`, { waitUntil: 'networkidle' })
    const noAccess = v.page.locator('[data-testid="trash-no-access"]')
    await noAccess.waitFor({ timeout: 6000 }).catch(() => {})
    check(p, (await noAccess.count()) === 1 && /de quem edita na ala/.test(await noAccess.innerText()), 'Visualizador pela URL vê "A Lixeira é de quem edita na ala"')
    check(p, !/A lixeira está vazia/.test(await v.page.locator('.mkt').innerText()), 'e não "A lixeira está vazia"')
    await v.page.screenshot({ path: path.join(OUT, '03b-lixeira-visualizador.png'), fullPage: true })
    await v.ctx.close()
    const e = await newPage(browser, 'marcel')
    // Editor chega pela Lixeira do cabeçalho.
    await e.page.goto(`${WEB}/marketing`, { waitUntil: 'networkidle' })
    await e.page.locator('[data-testid="header-link-trash"]').click()
    await e.page.waitForURL(/\/marketing\/lixeira/, { timeout: 8000 }).catch(() => {})
    check(p, (await e.page.locator('[data-testid="header-link-trash"][aria-current="page"]').count()) === 1, 'Editor abre a Lixeira pelo atalho do cabeçalho (ativo)')
    await e.page.locator('[data-testid="trash-list"]').waitFor()
    check(p, /Aqui ficam os itens que você mandou/.test(await e.page.locator('.mkt__note').innerText()), 'Editor lê que a lista é só do que ele mandou')
    check(p, (await e.page.locator('[data-action="purge"]').count()) === 0, 'Editor não vê "Apagar de vez"')
    await e.page.screenshot({ path: path.join(OUT, '03-lixeira-editor.png'), fullPage: true })
    await e.ctx.close()
    await api('leticia', 'DELETE', `/trash/card/${emmiCard.id}`)
  }

  // ── D. Restaurar volta tudo ─────────────────────────────────────────────
  if (want('D')) {
    const p = 'D'
    // Um pela tela da lixeira (Admin), o resto pela API.
    const { ctx, page, bad } = await newPage(browser, 'leticia')
    await page.goto(`${WEB}/marketing/lixeira`, { waitUntil: 'networkidle' })
    await page.locator('[data-testid="trash-list"]').waitFor()
    await page.screenshot({ path: path.join(OUT, '04-lixeira-admin.png'), fullPage: true })
    const rowCard = page.locator(`.mkt__row[data-type="card"][data-id="${X.card.id}"]`)
    check(p, (await rowCard.innerText()).includes('apagado'), 'linha do card mostra quem e quando apagou')
    // "apagada" no feminino (Ideia, UTM, Campanha, Ativação, Pasta).
    for (const [type, id] of [['campaign', X.campaign.id], ['idea', X.idea.id], ['utm', X.utm.id]]) {
      const row = page.locator(`.mkt__row[data-type="${type}"][data-id="${id}"]`)
      const txt = (await row.count()) ? await row.innerText() : ''
      check(p, /\bapagada\b/.test(txt) && !/\bapagado\b/.test(txt), `${type}: "apagada" no feminino`, txt.replace(/\s+/g, ' ').slice(0, 120))
    }
    await rowCard.locator('[data-action="restore"]').click()
    const back = await waitFor(async () => (await q('SELECT "deletedAt" FROM "MarketingCard" WHERE id=$1', [X.card.id]))[0]?.deletedAt === null)
    check(p, back, 'Restaurar pela tela devolve o card')
    await waitFor(async () => (await rowCard.count()) === 0)
    check(p, (await rowCard.count()) === 0, 'o card sai da lista da lixeira')
    check(p, bad.length === 0, 'tela sem 401/5xx', bad.join(', '))
    await ctx.close()
    const rest = [
      ['campaign', X.campaign.id, 'leticia'],
      ['idea', X.idea.id, 'marcel'],
      ['link', X.link.id, 'marcel'],
      ['utm', X.utm.id, 'leticia'],
      ['activation', X.activation.id, 'marcel'],
      ['partner', X.partner.id, 'marcel'],
      ['expense', X.expense.id, 'marcel'],
      ['recurring_expense', X.recurring.id, 'leticia'],
      ['quote', X.quote.id, 'marcel'],
      ['library_item', X.item.id, 'marcel'],
      ['library_folder', X.folder.id, 'marcel'],
    ]
    for (const [type, id, who] of rest) {
      const r = await api(who, 'POST', '/trash/restore', { type, id })
      check(p, r.status === 201 || r.status === 200, `restaurar ${type}`, `${r.status} ${JSON.stringify(r.data).slice(0, 120)}`)
    }
    const again = await snapshot()
    const same = (k) => (before[k] instanceof Set ? [...before[k]].every((id) => again[k].has(id)) : before[k] === again[k])
    for (const k of ['cards', 'calendar', 'homeWeek', 'campaigns', 'ideas', 'links', 'utms', 'activations', 'partners', 'expenses', 'recurring', 'quotes', 'folders', 'libraryItems']) {
      check(p, same(k), `volta em ${k}`)
    }
    for (const k of ['campCards', 'campUtms', 'campSpent', 'partnerActs', 'expensePaid', 'summaryPaid', 'yearPaid', 'utmTotal', 'homeActive', 'redirect', 'qr', 'qrImage']) {
      check(p, before[k] === again[k], `volta ${k}`, `${before[k]} = ${again[k]}`)
    }
    // Vínculos intactos: a UTM ainda aponta para o card, a campanha, o parceiro e a ativação.
    const u = (await api('leticia', 'GET', `/utm/${X.utm.id}`)).data
    check(p, u?.card?.id === X.card.id && u?.campaign?.id === X.campaign.id && u?.partner?.id === X.partner.id && u?.activation?.id === X.activation.id, 'UTM restaurada com todos os vínculos')
    const e = (await api('leticia', 'GET', `/finance/expenses/${X.expense.id}`)).data
    check(p, e?.campaignName && e?.cardTitle && e?.activationTitle && e?.partnerName, 'lançamento restaurado com os nomes dos vínculos')
    const folderItems = (await api('leticia', 'GET', `/library/items?folderId=${X.folder.id}&subpastas=1`)).data?.items ?? []
    check(p, folderItems.length === 2, 'pasta restaurada devolve os 2 arquivos (com a subpasta)', folderItems.length)
  }

  // ── E. Vínculo na lixeira some de quem aponta para ele ──────────────────
  if (want('E')) {
    const p = 'E'
    await api('leticia', 'DELETE', `/campaigns/${X.campaign.id}`)
    await api('marcel', 'DELETE', `/partners/${X.partner.id}`)
    const card = (await api('leticia', 'GET', `/cards/${X.card.id}`)).data
    check(p, card?.campaign === null, 'card com campanha na lixeira mostra sem campanha')
    const exp = (await api('leticia', 'GET', `/finance/expenses/${X.expense.id}`)).data
    check(p, exp?.campaignName === null && exp?.campaignId === X.campaign.id, 'lançamento esconde o nome da campanha na lixeira e guarda o vínculo')
    const act = (await api('leticia', 'GET', `/activations/${X.activation.id}`)).data
    check(p, act?.partner === null, 'ativação esconde o parceiro na lixeira')
    // Salvar o lançamento sem mexer no vínculo não perde o vínculo.
    const save = await api('marcel', 'PATCH', `/finance/expenses/${X.expense.id}`, { description: `${TAG} lançamento editado`, campaignId: X.campaign.id })
    check(p, save.status === 200, 'editar o lançamento com o vínculo na lixeira funciona (o vínculo não é conferido de novo)', save.status)
    await api('leticia', 'POST', '/trash/restore', { type: 'campaign', id: X.campaign.id })
    await api('marcel', 'POST', '/trash/restore', { type: 'partner', id: X.partner.id })
    const exp2 = (await api('leticia', 'GET', `/finance/expenses/${X.expense.id}`)).data
    check(p, !!exp2?.campaignName, 'restaurar a campanha devolve o nome no lançamento')
  }

  // ── F. Expurgo de 30 dias limpa o storage ───────────────────────────────
  if (want('F')) {
    const p = 'F'
    const old = (await api('marcel', 'POST', '/cards', { companyId: PET, title: `${TAG} velho`, kind: 'POST' })).data
    const oldAsset = await uploadCard('marcel', old.id, await photo(40), 'velho.jpg')
    const young = (await api('marcel', 'POST', '/cards', { companyId: PET, title: `${TAG} novo`, kind: 'POST' })).data
    const oldItem = await uploadLib('marcel', { companyId: PET, folderId: null, name: `velho-${RUN}.jpg`, buffer: await photo(80) })
    await api('marcel', 'DELETE', `/cards/${old.id}`)
    await api('marcel', 'DELETE', `/cards/${young.id}`)
    await api('marcel', 'DELETE', `/library/items/${oldItem.id}`)
    await q(`UPDATE "MarketingCard" SET "deletedAt" = now() - interval '31 days' WHERE id=$1`, [old.id])
    await q(`UPDATE "MarketingLibraryItem" SET "deletedAt" = now() - interval '31 days' WHERE id=$1`, [oldItem.id])
    await q(`UPDATE "MarketingCard" SET "deletedAt" = now() - interval '29 days' WHERE id=$1`, [young.id])
    const oldPath = await storagePath(oldAsset)
    const itemAsset = (await q('SELECT "assetId" FROM "MarketingLibraryItem" WHERE id=$1', [oldItem.id]))[0]?.assetId
    const itemPath = await storagePath(itemAsset)
    check(p, !storageProblem() && inStorage(oldPath) && inStorage(itemPath), 'antes do expurgo os objetos estão no storage', storageProblem() ?? '')
    const res = runInApi(`
      const { MarketingTrashService } = require('./dist/src/marketing/trash/trash.service');
      const { SchedulerRegistry } = require('@nestjs/schedule');
      const r = await app.get(MarketingTrashService).expurge();
      let next = null;
      try { next = app.get(SchedulerRegistry).getCronJob('marketing-trash-purge').nextDate().toISO(); } catch (e) { next = 'erro: ' + e.message; }
      return { r, next };`)
    check(p, !res.error, 'expurgo roda no contexto da API', res.error)
    check(p, (res.r?.total ?? 0) >= 2, 'o expurgo apagou o que tinha mais de 30 dias', JSON.stringify(res.r))
    check(p, typeof res.next === 'string' && /T0[3]:00/.test(res.next) || /T06:00/.test(res.next ?? ''), 'cron registrado (3h de Brasília)', res.next)
    check(p, (await q('SELECT 1 FROM "MarketingCard" WHERE id=$1', [old.id])).length === 0, 'card de 31 dias saiu do banco')
    check(p, (await q('SELECT 1 FROM "MarketingAsset" WHERE id=$1', [oldAsset])).length === 0, 'arquivo do card saiu do banco')
    check(p, !storageProblem() && !inStorage(oldPath), 'objeto do card saiu do storage', storageProblem() ?? '')
    check(p, (await q('SELECT 1 FROM "MarketingLibraryItem" WHERE id=$1', [oldItem.id])).length === 0 && !storageProblem() && !inStorage(itemPath), 'item do Acervo de 31 dias saiu do banco e do storage', storageProblem() ?? '')
    check(p, (await q('SELECT "deletedAt" FROM "MarketingCard" WHERE id=$1', [young.id])).length === 1, 'o de 29 dias continua na lixeira')
    const log = await q(`SELECT summary FROM "MarketingLog" WHERE "groupId"=$1 AND verb='purged' AND "actorId"='system' ORDER BY "createdAt" DESC LIMIT 1`, [G])
    check(p, /com mais de 30 dias na lixeira/.test(log[0]?.summary ?? ''), 'histórico registra o expurgo assinado pelo Nevo', log[0]?.summary)
    // "Apagar de vez" pela tela (Admin), com o diálogo.
    const { ctx, page } = await newPage(browser, 'leticia')
    await page.goto(`${WEB}/marketing/lixeira`, { waitUntil: 'networkidle' })
    const row = page.locator(`.mkt__row[data-type="card"][data-id="${young.id}"]`)
    await row.locator('[data-action="purge"]').click()
    const dlg = page.getByRole('dialog')
    await dlg.waitFor()
    check(p, /Não dá para desfazer/.test(await dlg.innerText()), 'Apagar de vez avisa que não dá para desfazer')
    await page.screenshot({ path: path.join(OUT, '05-apagar-de-vez.png') })
    await dlg.getByRole('button', { name: 'Apagar de vez' }).click()
    const gone = await waitFor(async () => (await q('SELECT 1 FROM "MarketingCard" WHERE id=$1', [young.id])).length === 0)
    check(p, gone, 'Apagar de vez pela tela tira o card do banco')
    await ctx.close()
  }

  // ── G. Pasta pela tela: leva os itens e o Desfazer devolve juntos ───────
  if (want('G')) {
    const p = 'G'
    const { ctx, page, bad } = await newPage(browser, 'marcel')
    await page.goto(`${WEB}/marketing/acervo?marca=${PET}`, { waitUntil: 'networkidle' })
    const node = page.locator(`.ltr-row[data-folder-id="${X.folder.id}"]`).first()
    await node.waitFor({ timeout: 10000 })
    await node.hover()
    const more = node.locator(`button[aria-label="Ações da pasta ${TAG} pasta"]`).first()
    if (await more.count()) {
      await more.click()
      await page.getByRole('menuitem', { name: 'Mandar para a lixeira' }).click()
      const dlg = page.getByRole('dialog')
      await dlg.waitFor()
      const text = await dlg.innerText()
      check(p, /vai para a lixeira com 1 subpasta e 2 arquivos/.test(text), 'diálogo da pasta conta o que vai junto', text.slice(0, 160))
      await page.screenshot({ path: path.join(OUT, '06-pasta-confirmar.png') })
      await dlg.getByRole('button', { name: 'Mandar para a lixeira' }).click()
      const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'foi para a lixeira' }).first()
      await toast.waitFor({ timeout: 8000 })
      const trashed = await waitFor(async () => {
        const rows = await q('SELECT "deletedAt" FROM "MarketingLibraryItem" WHERE id = ANY($1)', [[X.itemA.id, X.itemB.id]])
        return rows.length === 2 && rows.every((r) => !!r.deletedAt)
      })
      check(p, trashed, 'os 2 arquivos foram junto com a pasta')
      await toast.getByRole('button', { name: 'Desfazer' }).click()
      const restored = await waitFor(async () => {
        const rows = await q('SELECT "deletedAt" FROM "MarketingLibraryItem" WHERE id = ANY($1) UNION ALL SELECT "deletedAt" FROM "MarketingLibraryFolder" WHERE id = ANY($2)', [[X.itemA.id, X.itemB.id], [X.folder.id, X.sub.id]])
        return rows.length === 4 && rows.every((r) => r.deletedAt === null)
      })
      check(p, restored, 'Desfazer devolve a pasta, a subpasta e os 2 arquivos juntos')
    } else {
      check(p, false, 'menu da pasta encontrado na árvore')
    }
    check(p, bad.length === 0, 'tela sem 401/5xx', bad.join(', '))
    await ctx.close()
  }

  // ── H. Visual: lixeira no celular e no escuro ───────────────────────────
  if (want('H')) {
    const p = 'H'
    await api('marcel', 'DELETE', `/ideas/${X.idea.id}`)
    await api('leticia', 'DELETE', `/utm/${X.utm.id}`)
    const m = await newPage(browser, 'leticia', { width: 375, height: 812, mobile: true })
    await m.page.goto(`${WEB}/marketing/lixeira`, { waitUntil: 'networkidle' })
    await m.page.locator('[data-testid="trash-list"]').waitFor()
    const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check(p, overflow <= 0, 'lixeira sem rolagem lateral em 375px', overflow)
    const btn = await m.page.locator('[data-action="restore"]').first().boundingBox()
    check(p, (btn?.height ?? 0) >= 40, 'Restaurar com 40px ou mais no celular', btn?.height)
    await m.page.screenshot({ path: path.join(OUT, '07-lixeira-375.png'), fullPage: true })
    await m.ctx.close()
    const d = await newPage(browser, 'leticia', { width: 1440, height: 900 }, 'dark')
    await d.page.goto(`${WEB}/marketing/lixeira`, { waitUntil: 'networkidle' })
    await d.page.locator('[data-testid="trash-list"]').waitFor()
    await d.page.screenshot({ path: path.join(OUT, '08-lixeira-escuro.png'), fullPage: true })
    const texts = await d.page.locator('.mkt').innerText()
    check(p, !/—/.test(texts), 'nenhum em-dash na tela da lixeira')
    await d.ctx.close()
    await api('marcel', 'POST', '/trash/restore', { type: 'idea', id: X.idea.id })
    await api('leticia', 'POST', '/trash/restore', { type: 'utm', id: X.utm.id })
  }

  // ── I. Card agendado: a lixeira cancela a publicação, restaurar reagenda ─
  // (a parte A responde pelo MARKETING_CARD_TRASH: onCardTrashed, restoreForCard, onCardPurged)
  if (want('I')) {
    const p = 'I'
    const c = (await api('marcel', 'POST', '/cards', { companyId: PET, title: `${TAG} agendado`, kind: 'POST', networks: ['INSTAGRAM'] })).data
    const asset = await uploadCard('marcel', c.id, await photo(40), 'arte-agendada.jpg')
    await api('marcel', 'POST', `/cards/${c.id}/versions`, { assetIds: [asset] })
    const at = new Date(Date.now() + 3 * 24 * 3600_000)
    await q(`UPDATE "MarketingCard" SET status='SCHEDULED', "approvedVersionId"="currentVersionId", "approvedAt"=now(), "publishAt"=$2 WHERE id=$1`, [c.id, at])
    await q(
      `INSERT INTO "MarketingPublication" (id, "groupId", "companyId", "cardId", network, mode, status, "scheduledAt", "versionId", "updatedAt")
       SELECT 'pub_' || md5(random()::text), "groupId", "companyId", id, 'INSTAGRAM', 'MANUAL', 'SCHEDULED', "publishAt", "approvedVersionId", now()
         FROM "MarketingCard" WHERE id=$1`,
      [c.id],
    )
    const pubOf = async () => (await q('SELECT status, "lastError", "scheduledAt" FROM "MarketingPublication" WHERE "cardId"=$1', [c.id]))[0]
    const del = await api('marcel', 'DELETE', `/cards/${c.id}`)
    check(p, del.status === 200 && del.data?.trashed?.type === 'card', 'card agendado vai para a lixeira', del.status)
    const canceled = await waitFor(async () => (await pubOf())?.status === 'CANCELED')
    const pc = await pubOf()
    check(p, !!canceled && /lixeira/.test(pc?.lastError ?? ''), 'a publicação pendente é cancelada com o motivo da lixeira', `${pc?.status} ${pc?.lastError}`)
    const res = await api('marcel', 'POST', '/trash/restore', { type: 'card', id: c.id })
    const note = res.data?.restored?.[0]?.note ?? ''
    check(p, (res.status === 200 || res.status === 201) && /1 publicação voltou para a fila/.test(note), 'Restaurar diz que a publicação voltou para a fila', `${res.status} ${note}`)
    const pr = await pubOf()
    check(p, pr?.status === 'SCHEDULED' && pr?.scheduledAt?.getTime() === at.getTime(), 'a publicação volta a Agendada no horário do card', `${pr?.status} ${pr?.scheduledAt?.toISOString()}`)
    // Apagar de vez leva a publicação junto (cascade) sem erro no gancho de limpeza.
    await api('marcel', 'DELETE', `/cards/${c.id}`)
    const purge = await api('leticia', 'DELETE', `/trash/card/${c.id}`)
    check(p, purge.status === 200, 'Admin apaga de vez o card agendado', purge.status)
    check(p, !(await pubOf()) && !(await q('SELECT 1 FROM "MarketingCard" WHERE id=$1', [c.id])).length, 'card e publicação saem do banco')
  }

  await browser.close()
  await db.end()
  console.log(`\n${oks} ok, ${fails} falha(s)`)
  process.exit(fails ? 1 : 0)
})().catch(async (e) => {
  console.error(e)
  process.exit(1)
})
