// Roteiro de ponta a ponta da PRÉVIA DO FEED do Instagram (rodada R2, parte
// C, C5): spec docs/specs/2026/q4/q4-2/ala-marketing/r2-publicacao-dados-avisos.md.
//
// No Calendário, modo "Feed": grade de 3 colunas por marca com os cards do
// Instagram Agendados e Publicados, mais novo primeiro, com a miniatura da
// versão aprovada e a hora. Arrastar um agendado sobre outro troca os horários
// numa chamada só (`POST calendar/feed/swap`, com o horário que a grade
// mostrava); a API recusando, nada muda e a grade volta. Grade velha (outra
// pessoa trocou antes): 409 com a frase e a grade recarrega. No celular,
// "Trocar horário" faz o mesmo por toque, e a dica de arrastar não aparece.
// Visualizador vê, não troca. Edge headless, 1440 e 375, claro e escuro.
//
// Uso: API=http://127.0.0.1:3671 WEB=http://localhost:5271 HARNESS_DB=wf_r2c node marketing-feed-e2e.cjs
// Env: SHOTS (prints/marketing-feed), ONLY=A,B,C,D,E.
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const pg = require('pg')

const API = process.env.API ?? 'http://127.0.0.1:3671'
const WEB = process.env.WEB ?? 'http://localhost:5271'
const DB = process.env.HARNESS_DB ?? 'wf_r2c'
const seed = JSON.parse(fs.readFileSync(path.resolve(__dirname, process.env.HARNESS_SEED ?? `seed-marketing-out.${DB}.json`), 'utf8'))
const OUT = process.env.SHOTS ?? path.join(__dirname, 'prints', 'marketing-feed')
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean)
const sharp = require(path.join(__dirname, '../../../workflow-api/node_modules/sharp'))
fs.mkdirSync(OUT, { recursive: true })

const G = seed.groupId
const PET = seed.companies.pet
const RUN = Date.now().toString(36).slice(-5)
const TAG = `E2E Feed ${RUN}`

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

const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
const q = async (sql, params) => (await db.query(sql, params)).rows

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
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.63.0.${WHO_IP[who] ?? 9}` },
    body: JSON.stringify({ email, password: 'nevo1234' }),
  })
  if (!r.ok) throw new Error(`login ${who}: ${r.status}`)
  cache[email] = (await r.json()).accessToken
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify(cache))
  return cache[email]
}
async function api(who, method, route, body) {
  const tok = await token(who)
  const r = await fetch(`${API}/marketing/g/${G}${route}`, {
    method,
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
  return { status: r.status, data }
}

async function art(label, hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><rect width="100%" height="100%" fill="hsl(${hue},60%,55%)"/><text x="80" y="700" font-size="140" font-family="Arial" font-weight="700" fill="#fff">${label}</text></svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer()
}

/** Card com V1 aprovada e a arte (o caminho de verdade até a versão; o status sai direto no banco). */
async function feedCard(title, hue, status, publishAt, files = 1) {
  const card = (await api('marcel', 'POST', '/cards', { companyId: PET, title, kind: files > 1 ? 'CAROUSEL' : 'POST', networks: ['INSTAGRAM'] })).data
  const ids = []
  for (let i = 0; i < files; i++) {
    const buf = await art(`${title.slice(-2)}${i ? `.${i}` : ''}`, hue + i * 20)
    const t = await api('marcel', 'POST', `/cards/${card.id}/assets`, { name: `arte-${i}.jpg`, mimeType: 'image/jpeg', size: buf.length, sha256: sha(buf) })
    await fetch(t.data.uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/jpeg', authorization: `Bearer ${t.data.token}` }, body: buf })
    await api('marcel', 'POST', `/assets/${t.data.asset.id}/confirm`, {})
    ids.push(t.data.asset.id)
  }
  await api('marcel', 'POST', `/cards/${card.id}/versions`, { assetIds: ids })
  await q(
    `UPDATE "MarketingCard" SET status=$2, "approvedVersionId"="currentVersionId", "approvedAt"=now(), "publishAt"=$3,
       "publishedAt" = CASE WHEN $2 = 'PUBLISHED' THEN $3::timestamp ELSE NULL END,
       "publishedUrl" = CASE WHEN $2 = 'PUBLISHED' THEN 'https://www.instagram.com/p/e2e' ELSE NULL END
     WHERE id=$1`,
    [card.id, status, publishAt],
  )
  return card.id
}

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

const publishAtOf = async (id) => (await q('SELECT "publishAt" FROM "MarketingCard" WHERE id=$1', [id]))[0]?.publishAt?.getTime()
/**
 * O instante em UTC (ISO), como a API manda. A coluna é `timestamp` sem fuso e
 * o pg lê na hora local da máquina: para comparar com o que a tela envia ou
 * para chamar a API, leia como texto.
 */
const utcAt = async (id) => {
  const t = (await q('SELECT "publishAt"::text AS t FROM "MarketingCard" WHERE id=$1', [id]))[0]?.t
  return t ? new Date(`${t.replace(' ', 'T')}Z`).toISOString() : null
}
const pubAtOf = async (cardId) => (await q('SELECT "scheduledAt" FROM "MarketingPublication" WHERE "cardId"=$1', [cardId]))[0]?.scheduledAt?.getTime()
/** Publicação agendada (modo À mão, sem conta) na hora do card: o que a parte A cria ao agendar. */
async function schedulePub(cardId) {
  await q(
    `INSERT INTO "MarketingPublication" (id, "groupId", "companyId", "cardId", network, mode, status, "scheduledAt", "versionId", "updatedAt")
     SELECT 'pub_' || md5(random()::text), "groupId", "companyId", id, 'INSTAGRAM', 'MANUAL', 'SCHEDULED', "publishAt", "approvedVersionId", now()
       FROM "MarketingCard" WHERE id=$1`,
    [cardId],
  )
}
const feedOrder = (page) => page.locator('[data-testid="feed-grid"] .cf__tile').evaluateAll((els) => els.map((e) => e.getAttribute('data-card')))

;(async () => {
  await db.connect()
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  for (const who of ['leticia', 'marcel', 'diretoria']) await token(who)
  // Só os cards desta rodada no feed da marca (os de rodadas velhas vão para a lixeira).
  await q(`UPDATE "MarketingCard" SET "deletedAt"=now() WHERE "groupId"=$1 AND "companyId"=$2 AND 'INSTAGRAM' = ANY(networks) AND status IN ('SCHEDULED','PUBLISHED') AND "deletedAt" IS NULL`, [G, PET])

  const h = 3600_000
  const t0 = Date.now()
  const X = {
    s1: await feedCard(`${TAG} S1`, 10, 'SCHEDULED', new Date(t0 + 30 * h)),
    s2: await feedCard(`${TAG} S2`, 120, 'SCHEDULED', new Date(t0 + 54 * h), 3),
    s3: await feedCard(`${TAG} S3`, 210, 'SCHEDULED', new Date(t0 + 78 * h)),
    pub: await feedCard(`${TAG} P1`, 290, 'PUBLISHED', new Date(t0 - 20 * h)),
    appr: await feedCard(`${TAG} A1`, 330, 'APPROVED', new Date(t0 + 100 * h)),
  }
  const at0 = { s1: await publishAtOf(X.s1), s2: await publishAtOf(X.s2), s3: await publishAtOf(X.s3) }

  // ── A. Grade: 3 colunas, mais novo primeiro, miniatura e hora ───────────
  if (want('A')) {
    const p = 'A'
    const api1 = await api('diretoria', 'GET', `/calendar/feed?companyId=${PET}`)
    check(p, api1.status === 200, 'Visualizador lê o feed pela API', api1.status)
    const ids = (api1.data?.cards ?? []).map((c) => c.id)
    check(p, JSON.stringify(ids) === JSON.stringify([X.s3, X.s2, X.s1, X.pub]), 'Agendados e Publicados, mais novo primeiro (o Aprovado fica de fora)', JSON.stringify(ids))
    check(p, (api1.data?.cards ?? []).every((c) => c.cover?.url), 'cada post com a miniatura da versão aprovada')
    check(p, api1.data?.cards?.find((c) => c.id === X.s2)?.fileCount === 3, 'carrossel diz quantos arquivos')
    check(p, (api1.data?.cards ?? []).every((c) => c.canSwap === false), 'Visualizador não troca (canSwap falso)')
    const { ctx, page, bad } = await newPage(browser, 'marcel')
    await page.goto(`${WEB}/marketing/calendario?vista=feed&marca=${PET}`, { waitUntil: 'networkidle' })
    await page.locator('[data-testid="feed-grid"]').waitFor()
    const cols = await page.locator('[data-testid="feed-grid"]').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
    check(p, cols === 3, 'grade de 3 colunas', cols)
    check(p, JSON.stringify(await feedOrder(page)) === JSON.stringify([X.s3, X.s2, X.s1, X.pub]), 'a tela na mesma ordem da API')
    const loaded = await waitFor(async () =>
      page.locator('[data-testid="feed-grid"] img.cf__img').evaluateAll((imgs) => imgs.length >= 4 && imgs.every((i) => i.complete && i.naturalWidth > 0)),
    )
    check(p, loaded, 'as miniaturas carregam de verdade (naturalWidth > 0)')
    const when = await page.locator(`.cf__tile[data-card="${X.s1}"] .cf__when`).innerText()
    check(p, /^\d{2}\/\d{2} \d{2}:\d{2}$/.test(when), 'cada post mostra dia e hora', when)
    check(p, (await page.locator(`.cf__tile[data-card="${X.s2}"] .cf__badge`).count()) === 1, 'selo de carrossel no post com 3 arquivos')
    check(p, (await page.locator(`.cf__tile[data-card="${X.pub}"]`).getAttribute('draggable')) === 'false', 'Publicado não arrasta')
    check(p, (await page.locator(`.cf__tile[data-card="${X.s1}"]`).getAttribute('draggable')) === 'true', 'Agendado arrasta')
    check(p, await page.locator('.cf__hint--drag').isVisible(), 'no computador aparece a dica de arrastar')
    await page.screenshot({ path: path.join(OUT, '01-feed-1440.png'), fullPage: true })
    check(p, bad.length === 0, 'tela sem 401/5xx', bad.join(', '))
    await ctx.close()
  }

  // ── B. Arrastar um agendado sobre outro troca os horários ───────────────
  if (want('B')) {
    const p = 'B'
    const { ctx, page, bad } = await newPage(browser, 'marcel')
    const swaps = []
    const patches = []
    page.on('request', (r) => {
      const pathname = new URL(r.url()).pathname
      if (r.method() === 'POST' && pathname.endsWith('/calendar/feed/swap')) swaps.push(r.postDataJSON())
      if (r.method() === 'PATCH' && /\/cards\/[^/]+$/.test(pathname)) patches.push(pathname.split('/').pop())
    })
    await schedulePub(X.s1)
    await schedulePub(X.s3)
    await page.goto(`${WEB}/marketing/calendario?vista=feed&marca=${PET}`, { waitUntil: 'networkidle' })
    await page.locator('[data-testid="feed-grid"]').waitFor()
    // O horário que a grade mostra de cada um (o que a troca tem de mandar como esperado).
    const shown = {
      s1: await page.locator(`.cf__tile[data-card="${X.s1}"] .cf__when`).getAttribute('data-when'),
      s3: await page.locator(`.cf__tile[data-card="${X.s3}"] .cf__when`).getAttribute('data-when'),
    }
    await page.dragAndDrop(`.cf__tile[data-card="${X.s1}"]`, `.cf__tile[data-card="${X.s3}"]`)
    const swapped = await waitFor(async () => (await publishAtOf(X.s1)) === at0.s3 && (await publishAtOf(X.s3)) === at0.s1)
    check(p, swapped, 'arrastar S1 sobre S3 troca os horários no banco')
    // A troca chama o MARKETING_PUBLISH_HOOKS da parte A: a publicação vai junto.
    const pubSwapped = await waitFor(async () => (await pubAtOf(X.s1)) === at0.s3 && (await pubAtOf(X.s3)) === at0.s1)
    check(p, pubSwapped, 'e reagenda a publicação dos dois para o horário novo', `${await pubAtOf(X.s1)} / ${await pubAtOf(X.s3)}`)
    // Auditoria da parte C: um pedido só, com o horário que a grade mostrava de cada um.
    const sent = swaps[0]
    check(
      p,
      swaps.length === 1 && patches.length === 0 &&
        sent?.a?.id === X.s1 && !!shown.s1 && new Date(sent.a.publishAt).getTime() === new Date(shown.s1).getTime() &&
        sent?.b?.id === X.s3 && !!shown.s3 && new Date(sent.b.publishAt).getTime() === new Date(shown.s3).getTime(),
      'uma chamada só (POST calendar/feed/swap) com o horário esperado de cada card',
      JSON.stringify({ swaps, patches }),
    )
    await waitFor(async () => JSON.stringify(await feedOrder(page)) === JSON.stringify([X.s1, X.s2, X.s3, X.pub]))
    check(p, JSON.stringify(await feedOrder(page)) === JSON.stringify([X.s1, X.s2, X.s3, X.pub]), 'a grade reordena com os horários novos')
    const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Horários trocados' })
    check(p, (await toast.count()) >= 1, 'toast "Horários trocados"')
    const log = await q(`SELECT summary FROM "MarketingLog" WHERE "entityId" = ANY($1) AND verb='rescheduled' ORDER BY "createdAt" DESC LIMIT 2`, [[X.s1, X.s3]])
    check(p, log.length === 2 && log.every((l) => /trocou o horário de/.test(l.summary)), 'histórico registra a troca nos dois', log.map((l) => l.summary).join(' | '))
    await page.screenshot({ path: path.join(OUT, '02-feed-trocado.png'), fullPage: true })

    // ── API recusa a troca: nada muda no banco e a grade volta ──
    const before = { s2: await publishAtOf(X.s2), s3: await publishAtOf(X.s3) }
    await page.route('**/calendar/feed/swap', (route) =>
      route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Card arquivado não muda de data. Desarquive antes.' }) }),
    )
    await page.dragAndDrop(`.cf__tile[data-card="${X.s2}"]`, `.cf__tile[data-card="${X.s3}"]`)
    const err = page.locator('[data-sonner-toast]').filter({ hasText: 'Card arquivado não muda' })
    await err.first().waitFor({ timeout: 8000 }).catch(() => {})
    check(p, (await err.count()) >= 1, 'a frase da recusa aparece no toast')
    await sleep(500)
    check(p, (await publishAtOf(X.s2)) === before.s2 && (await publishAtOf(X.s3)) === before.s3, 'nada mudou no banco')
    await waitFor(async () => JSON.stringify(await feedOrder(page)) === JSON.stringify([X.s1, X.s2, X.s3, X.pub]))
    check(p, JSON.stringify(await feedOrder(page)) === JSON.stringify([X.s1, X.s2, X.s3, X.pub]), 'a grade volta à ordem de antes')
    await page.unroute('**/calendar/feed/swap')

    // ── Grade velha (auditoria da parte C): outra pessoa trocou com a tela aberta ──
    // A Letícia, em outra tela, troca S2 com S3 pela API; o Marcel, com a grade
    // de antes, arrasta S2 sobre S1. O tempo real atualizaria a grade dele na
    // hora, então o roteiro segura o GET do feed na resposta de antes até a
    // troca do Marcel sair (é a grade velha: aviso perdido, aba voltando do
    // fundo, ou as duas trocas no mesmo segundo).
    const staleFeed = (await api('marcel', 'GET', `/calendar/feed?companyId=${PET}`)).data
    let freeze = true
    await page.route('**/calendar/feed?**', (route) =>
      freeze && route.request().method() === 'GET'
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(staleFeed) })
        : route.continue(),
    )
    const thaw = (r) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/calendar/feed/swap')) freeze = false
    }
    page.on('request', thaw)
    const iso = { s2: await utcAt(X.s2), s3: await utcAt(X.s3) }
    const other = await api('leticia', 'POST', '/calendar/feed/swap', {
      a: { id: X.s2, publishAt: iso.s2 },
      b: { id: X.s3, publishAt: iso.s3 },
    })
    check(p, other.status === 201 || other.status === 200, 'a outra troca (pela API) passa', other.status)
    const afterOther = { s1: await publishAtOf(X.s1), s2: await publishAtOf(X.s2), s3: await publishAtOf(X.s3) }
    await page.dragAndDrop(`.cf__tile[data-card="${X.s2}"]`, `.cf__tile[data-card="${X.s1}"]`)
    const stale = page.locator('[data-sonner-toast]').filter({ hasText: 'Os horários mudaram enquanto a grade estava aberta' })
    await stale.first().waitFor({ timeout: 8000 }).catch(() => {})
    check(p, (await stale.count()) >= 1, '409 com a frase: "Os horários mudaram enquanto a grade estava aberta... Nada foi trocado."', await stale.first().innerText().catch(() => ''))
    await sleep(500)
    check(
      p,
      (await publishAtOf(X.s1)) === afterOther.s1 && (await publishAtOf(X.s2)) === afterOther.s2 && (await publishAtOf(X.s3)) === afterOther.s3,
      'nada foi trocado: o banco fica com a troca da outra pessoa',
    )
    // A grade recarrega e mostra o que está gravado (S2 e S3 trocados pela Letícia).
    // Mais novo primeiro: S1 (o mais tarde), S3 (que pegou o horário do S2), S2, o Publicado.
    const fresh = [X.s1, X.s3, X.s2, X.pub]
    const reloaded = await waitFor(async () => JSON.stringify(await feedOrder(page)) === JSON.stringify(fresh), 8000)
    check(p, reloaded, 'a grade recarrega com os horários de verdade', JSON.stringify(await feedOrder(page)))
    await page.screenshot({ path: path.join(OUT, '02b-feed-grade-velha.png'), fullPage: true })
    page.off('request', thaw)
    await page.unroute('**/calendar/feed?**')
    // Volta S2 e S3 ao lugar para as partes seguintes.
    const back = await api('leticia', 'POST', '/calendar/feed/swap', {
      a: { id: X.s2, publishAt: await utcAt(X.s2) },
      b: { id: X.s3, publishAt: await utcAt(X.s3) },
    })
    check(p, back.status === 201 || back.status === 200, 'S2 e S3 voltam ao lugar (troca pela API)', back.status)
    await page.reload({ waitUntil: 'networkidle' })
    await page.locator('[data-testid="feed-grid"]').waitFor()
    // Soltar num Publicado não faz nada.
    const pubBefore = await publishAtOf(X.pub)
    await page.dragAndDrop(`.cf__tile[data-card="${X.s2}"]`, `.cf__tile[data-card="${X.pub}"]`)
    await sleep(800)
    check(p, (await publishAtOf(X.pub)) === pubBefore && (await publishAtOf(X.s2)) === before.s2, 'soltar sobre um Publicado não troca nada')
    check(p, bad.length === 0, 'tela sem 401/5xx', bad.join(', '))
    await ctx.close()
  }

  // ── C. Celular: "Trocar horário" por toque ──────────────────────────────
  if (want('C')) {
    const p = 'C'
    const { ctx, page } = await newPage(browser, 'marcel', { width: 375, height: 812, mobile: true })
    await page.goto(`${WEB}/marketing/calendario?vista=feed&marca=${PET}`, { waitUntil: 'networkidle' })
    await page.locator('[data-testid="feed-grid"]').waitFor()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check(p, overflow <= 0, 'feed sem rolagem lateral em 375px', overflow)
    const cols = await page.locator('[data-testid="feed-grid"]').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
    check(p, cols === 3, 'no celular continua 3 colunas (como o perfil)', cols)
    // Celular não arrasta: a dica de arrastar some e fica a do botão.
    check(p, !(await page.locator('.cf__hint--drag').isVisible()), 'no celular a dica de arrastar não aparece')
    check(p, await page.locator('.cf__hint--tap').isVisible(), 'no celular aparece a dica do botão de trocar')
    const btn = page.locator(`.cf__tile[data-card="${X.s2}"] [data-action="swap"]`)
    const box = await btn.boundingBox()
    check(p, (box?.height ?? 0) >= 36, 'botão de trocar com 36px ou mais', box?.height)
    const a = await publishAtOf(X.s2)
    const b = await publishAtOf(X.s3)
    await btn.tap()
    check(p, (await btn.getAttribute('aria-pressed')) === 'true', 'tocar marca o primeiro')
    await page.screenshot({ path: path.join(OUT, '03-feed-375-marcado.png'), fullPage: true })
    await page.locator(`.cf__tile[data-card="${X.s3}"] [data-action="swap"]`).tap()
    const ok = await waitFor(async () => (await publishAtOf(X.s2)) === b && (await publishAtOf(X.s3)) === a)
    check(p, ok, 'tocar no segundo troca os horários')
    await page.screenshot({ path: path.join(OUT, '04-feed-375.png'), fullPage: true })
    await ctx.close()
  }

  // ── D. Visualizador vê e não troca; escuro ──────────────────────────────
  if (want('D')) {
    const p = 'D'
    const { ctx, page } = await newPage(browser, 'diretoria', { width: 1440, height: 900 }, 'dark')
    await page.goto(`${WEB}/marketing/calendario?vista=feed&marca=${PET}`, { waitUntil: 'networkidle' })
    await page.locator('[data-testid="feed-grid"]').waitFor()
    check(p, (await page.locator('[data-action="swap"]').count()) === 0, 'Visualizador não vê "Trocar horário"')
    check(p, (await page.locator('.cf__tile[draggable="true"]').count()) === 0, 'Visualizador não arrasta')
    await page.screenshot({ path: path.join(OUT, '05-feed-visualizador-escuro.png'), fullPage: true })
    const txt = await page.locator('[data-testid="calendar-feed"]').innerText()
    check(p, !/—/.test(txt), 'nenhum em-dash no feed')
    await ctx.close()
    // API: Editor de outra marca não troca card da PetJourney.
    const freela = await api('freela', 'GET', `/calendar/feed?companyId=${seed.companies.emmitec}`)
    check(p, freela.status === 403, 'freelancer só da PetJourney não lê o feed de outra marca (403)', freela.status)
  }

  // ── E. Modo Feed no Calendário: aba e atalho F ──────────────────────────
  if (want('E')) {
    const p = 'E'
    const { ctx, page } = await newPage(browser, 'leticia')
    await page.goto(`${WEB}/marketing/calendario`, { waitUntil: 'networkidle' })
    await page.locator('.mkcal__view[data-view="feed"]').click()
    await page.waitForURL(/vista=feed/)
    check(p, /vista=feed/.test(page.url()), 'a aba "Feed" do Calendário põe ?vista=feed')
    await page.goto(`${WEB}/marketing/calendario`, { waitUntil: 'networkidle' })
    await page.keyboard.press('f')
    await page.waitForURL(/vista=feed/, { timeout: 4000 }).catch(() => {})
    check(p, /vista=feed/.test(page.url()), 'atalho F abre o Feed')
    // Sem filtro de marca e com várias marcas: escolhe a marca dentro do feed.
    check(p, (await page.locator('.cf__brand').count()) >= 2, 'sem filtro, o feed oferece as marcas')
    await ctx.close()
  }

  // Limpa: os cards da rodada vão para a lixeira.
  await q(`UPDATE "MarketingCard" SET "deletedAt"=now() WHERE title LIKE $1`, [`${TAG}%`])
  await browser.close()
  await db.end()
  console.log(`\n${oks} ok, ${fails} falha(s)`)
  process.exit(fails ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
