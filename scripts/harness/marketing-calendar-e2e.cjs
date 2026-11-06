// Roteiro de ponta a ponta da M1-B (calendário editorial, Links de trabalho,
// Painel e aviso de prazo). Spec: docs/specs/2026/q4/q4-2/ala-marketing/
// m1-aprovacao-calendario.md, critérios B1 a B8.
//
// Uso (com a API e o Vite do harness no ar):
//   API=http://127.0.0.1:3612 WEB=http://localhost:5182 HARNESS_DB=wf_m1b \
//   HARNESS_SEED=seed-marketing-out.wf_m1b.json node marketing-calendar-e2e.cjs
// Opcional: API_RUN_DIR (pasta com dist/ e node_modules da API, para o B7
// chamar o método do cron direto; padrão ../../../.api-run-3612),
// ONLY=b1,b5 (só algumas partes).
//
// Exercita API e tela (Playwright + Edge, 1440 e 375), confere o banco pelo pg,
// papel por papel (Visualizador não escreve, freelancer não vê outra marca,
// quem é de fora leva 403) e zero 401/5xx. Capturas em prints/marketing-calendar/.
// Estados de aprovação (Para aprovar, Ajustes pedidos) são gravados direto no
// banco: o roteiro não depende do módulo de cards da M1-A.
// Idempotente: arquiva os cards "E2E ..." e apaga os links "E2E ..." antes.
const { chromium } = require('playwright-core')
const pg = require('pg')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const API = process.env.API ?? 'http://127.0.0.1:3612'
const WEB = process.env.WEB ?? 'http://localhost:5182'
const DB = process.env.HARNESS_DB ?? 'wf_m1b'
const seed = JSON.parse(
  fs.readFileSync(process.env.HARNESS_SEED ?? path.join(__dirname, `seed-marketing-out.${DB}.json`), 'utf8'),
)
const RUN_DIR = process.env.API_RUN_DIR ?? path.resolve(__dirname, '../../../.api-run-3612')
const OUT = path.join(__dirname, 'prints', 'marketing-calendar')
const ONLY = (process.env.ONLY ?? '').toLowerCase().split(',').filter(Boolean)
const want = (part) => !ONLY.length || ONLY.includes(part)
fs.mkdirSync(OUT, { recursive: true })

const G = seed.groupId
const C = seed.companies
const U = seed.users
const TZ = 'America/Sao_Paulo'
const STAMP = Date.now().toString(36)

let fails = 0
let oks = 0
const results = {}
let part = 'prep'
function check(cond, msg, extra = '') {
  console.log(`${cond ? 'OK  ' : 'FAIL'} [${part}] ${msg}${extra ? '  (' + extra + ')' : ''}`)
  if (cond) oks++
  else fails++
  results[part] = results[part] ?? { ok: 0, fail: 0 }
  results[part][cond ? 'ok' : 'fail']++
  return !!cond
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, ms = 6000, step = 150) {
  const end = Date.now() + ms
  let last
  while (Date.now() < end) {
    last = await fn()
    if (last) return last
    await sleep(step)
  }
  return last
}

// ── Datas de Brasília ──────────────────────────────────────────────────────
const spFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
function sp(date) {
  const p = Object.fromEntries(
    spFmt
      .formatToParts(new Date(date))
      .filter((x) => x.type !== 'literal')
      .map((x) => [x.type, x.value]),
  )
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}
// Brasília sem horário de verão desde 2019: -03:00 fixo serve para o roteiro.
const spIso = (day, time) => new Date(`${day}T${time}:00-03:00`).toISOString()
const toUtc = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
const fromUtc = (ms) => new Date(ms).toISOString().slice(0, 10)
const addDays = (d, n) => fromUtc(toUtc(d) + n * 86400000)
const weekday = (d) => new Date(toUtc(d)).getUTCDay()
const mondayOf = (d) => addDays(d, -((weekday(d) + 6) % 7))
const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const today = sp(new Date()).day
const gridStart = mondayOf(`${today.slice(0, 7)}-01`)
const monthLast = (() => {
  const [y, m] = [+today.slice(0, 4), +today.slice(5, 7)]
  return fromUtc(Date.UTC(y, m, 0))
})()
const gridEnd = addDays(mondayOf(monthLast), 6)
const inGrid = (d) => d >= gridStart && d <= gridEnd

// ── API ───────────────────────────────────────────────────────────────────
const tokens = {}
async function token(who) {
  if (tokens[who]) return tokens[who]
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${who}@nevo.test`, password: 'nevo1234' }),
  })
  tokens[who] = (await r.json()).accessToken
  return tokens[who]
}
async function api(who, method, suffix, body) {
  const r = await fetch(`${API}/marketing/g/${G}${suffix}`, {
    method,
    headers: { authorization: `Bearer ${await token(who)}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await r.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: r.status, json, text }
}

// ── Banco ─────────────────────────────────────────────────────────────────
// O Prisma grava DateTime como `timestamp` SEM fuso, em UTC. O pg leria como
// hora local da máquina (o harness roda em Cuiabá, -4h): lê como UTC.
pg.types.setTypeParser(1114, (s) => new Date(`${s.replace(' ', 'T')}Z`))
const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
const q = async (sql, params) => (await db.query(sql, params)).rows
const cardRow = async (id) => (await q('SELECT * FROM "MarketingCard" WHERE id=$1', [id]))[0]
const logsOf = (entityId, verb) =>
  q('SELECT * FROM "MarketingLog" WHERE "entityId"=$1 AND verb=$2 ORDER BY "createdAt"', [entityId, verb])

// ── Navegador ─────────────────────────────────────────────────────────────
const DESK = { width: 1440, height: 900, mobile: false }
const PHONE = { width: 375, height: 812, mobile: true }
const allBad = []

async function open(browser, who, route, vp, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.mobile ? 2 : 1,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    locale: 'pt-BR',
    timezoneId: opts.timezoneId ?? TZ,
    reducedMotion: 'reduce',
  })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB }).catch(() => {})
  const tk = await token(who)
  await ctx.addInitScript(
    ([t, fake]) => {
      localStorage.setItem('token', t)
      localStorage.setItem('onboarding.autoShown', '1')
      localStorage.setItem('onboarding.completed', '1')
      localStorage.setItem('ui.idlePermissionPrompt', 'done')
      if (fake) {
        // Fonte de mentira (só no teste): prova a faixa de vários dias sem M2/M3.
        window.__mkCalendarTestSources = [
          async (_groupId, range) =>
            fake.filter((i) => i.endDay >= range.from && i.startDay <= range.to).map(({ startDay, endDay, ...i }) => i),
        ]
      }
    },
    [tk, opts.fake ?? null],
  )
  const page = await ctx.newPage()
  const bad = []
  page.on('response', (res) => {
    const u = res.url()
    if (u.startsWith(API) && (res.status() === 401 || res.status() >= 500)) {
      bad.push(`${res.status()} ${u.replace(API, '')}`)
      allBad.push(`${who} ${res.status()} ${u.replace(API, '')}`)
    }
  })
  page.on('pageerror', (e) => console.log(`  [pageerror ${who}] ${String(e).slice(0, 200)}`))
  await page.goto(WEB + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  return { ctx, page, bad }
}

async function calendarReady(page) {
  await page.waitForSelector('.mkcal .mkc-month, .mkcal .mkc-wk, .mkcal .mkc-ag, .mkcal .mkc-ag__empty', { timeout: 15000 })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(250)
}

/** 375 sem rolagem lateral: a página e todo contêiner acima da ala. */
async function noSideScroll(page) {
  return page.evaluate(() => {
    const out = []
    const doc = document.documentElement
    if (doc.scrollWidth > window.innerWidth + 1) out.push(`html ${doc.scrollWidth}`)
    let el = document.querySelector('.mk-layout')
    while (el) {
      const ox = getComputedStyle(el).overflowX
      if (el.scrollWidth > el.clientWidth + 1 && (ox === 'auto' || ox === 'scroll')) out.push(`${el.className || el.tagName} ${el.scrollWidth}>${el.clientWidth}`)
      el = el.parentElement
    }
    const body = document.querySelector('.mk-layout__body')
    if (body && body.scrollWidth > body.clientWidth + 1) out.push(`body ${body.scrollWidth}>${body.clientWidth}`)
    return out
  })
}

/**
 * Captura. `full`: a tela inteira da ala, mesmo no celular, onde quem rola é
 * o conteúdo da moldura (e não a página): solta a altura e a rolagem dos
 * contêineres acima da ala só para a foto. Use no FIM do contexto.
 */
async function shot(page, name, full = false) {
  const file = path.join(OUT, name)
  if (full) {
    await page.evaluate(() => {
      let el = document.querySelector('.mk-layout')?.parentElement
      while (el && el !== document.documentElement) {
        const s = getComputedStyle(el)
        if (/(auto|scroll|hidden)/.test(s.overflowY) || s.height !== 'auto') {
          el.style.overflow = 'visible'
          el.style.height = 'auto'
          el.style.maxHeight = 'none'
          el.style.minHeight = '0'
        }
        el = el.parentElement
      }
      document.documentElement.style.height = 'auto'
    })
    await page.waitForTimeout(150)
  }
  await page.screenshot({ path: file, fullPage: full })
}

async function realDrag(page, src, dst, dstPos = { x: 0.5, y: 0.75 }) {
  const s = await src.boundingBox()
  const d = await dst.boundingBox()
  const sx = s.x + Math.min(30, s.width / 2)
  const sy = s.y + s.height / 2
  const dx = d.x + d.width * dstPos.x
  const dy = d.y + d.height * dstPos.y
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  for (let i = 1; i <= 14; i++) {
    await page.mouse.move(sx + ((dx - sx) * i) / 14, sy + ((dy - sy) * i) / 14)
    await sleep(25)
  }
  await page.mouse.up()
}

// ── Cron direto (B7): um contexto Nest da API, sem HTTP, no banco do harness ──
function runDeadlineCron() {
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (/^DATABASE_URL|^SUPABASE|^JWT|^ENCRYPTION/.test(k)) delete env[k]
  const url = `postgresql://postgres:postgres@127.0.0.1:55432/${DB}?sslmode=disable`
  Object.assign(env, {
    NODE_ENV: 'development',
    DOTENV_CONFIG_PATH: 'C:/nao-existe/.env',
    DATABASE_URL_IPV6_FAST_CONNECTION: url,
    DATABASE_URL_IPV4_POOL_CONNECTION: url,
    JWT_SECRET: 'harness-jwt-secret-local-only',
    ENCRYPTION_KEY: 'harnesskey-32-bytes-local-only!!',
    SUPABASE_BUCKET_URL: 'http://127.0.0.1:54329',
    SUPABASE_SERVICE_ROLE_BUCKET_KEY: 'harness',
    TIMER_AUTO_STOP_ENABLED: 'false',
    FRONTEND_URL: WEB,
  })
  const code = `
    const { NestFactory } = require('@nestjs/core');
    const { SchedulerRegistry } = require('@nestjs/schedule');
    const { AppModule } = require('./dist/src/app.module');
    const { MarketingDeadlineService } = require('./dist/src/marketing/home/marketing-deadline.service');
    (async () => {
      const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
      const result = await app.get(MarketingDeadlineService).run();
      let next = null;
      try { next = app.get(SchedulerRegistry).getCronJob('marketing-deadline-warnings').nextDate().toISO(); } catch (e) { next = 'erro: ' + e.message; }
      console.log('RESULT ' + JSON.stringify({ result, next }));
      await app.close();
      process.exit(0);
    })().catch((e) => { console.error(e); process.exit(1); });`
  const r = spawnSync(process.execPath, ['-e', code], { cwd: RUN_DIR, env, encoding: 'utf8', timeout: 180000 })
  const line = (r.stdout ?? '').split(/\r?\n/).find((l) => l.startsWith('RESULT '))
  if (!line) return { error: `${r.status} ${(r.stderr ?? '').slice(-1500)}` }
  return JSON.parse(line.slice(7))
}

;(async () => {
  await db.connect()
  const browser = await chromium.launch({ channel: 'msedge', headless: true })

  // ── Preparação ────────────────────────────────────────────────────────────
  part = 'prep'
  for (const who of ['nicolas', 'leticia', 'marcel', 'freela', 'diretoria', 'luis']) await token(who)
  await q(`UPDATE "MarketingCard" SET "archivedAt"=now() WHERE "groupId"=$1 AND title LIKE 'E2E %' AND "archivedAt" IS NULL`, [G])
  await q(`DELETE FROM "MarketingLink" WHERE "groupId"=$1 AND title LIKE 'E2E %'`, [G])

  async function quick(who, body) {
    const r = await api(who, 'POST', '/calendar/cards', body)
    if (r.status !== 201) console.log('  criar falhou', r.status, r.text)
    return r.json
  }
  // Dia de origem/destino do arraste, sempre dentro da grade do mês atual.
  const dragFrom = today
  const dragTo = inGrid(addDays(today, 1)) ? addDays(today, 1) : addDays(today, -1)
  const weekFrom = today
  const weekTo = weekday(today) === 0 ? addDays(today, -1) : addDays(today, 1) // mesma semana
  const tzDay = inGrid(addDays(today, 2)) ? addDays(today, 2) : addDays(today, -2)
  // No máximo 3 por dia (o 4º vira "+N"): hoje tem arrastar, recusa e semana.
  const cDrag = await quick('marcel', { companyId: C.pet, title: `E2E arrastar ${STAMP}`, kind: 'REEL', publishAt: spIso(dragFrom, '14:30'), networks: ['INSTAGRAM'] })
  const cWeekDrag = await quick('marcel', { companyId: C.pet, title: `E2E semana ${STAMP}`, publishAt: spIso(weekFrom, '09:15') })
  const cRefuse = await quick('nicolas', { companyId: C.pet, title: `E2E recusa ${STAMP}`, publishAt: spIso(dragFrom, '11:00') })
  const cPublished = await quick('nicolas', { companyId: C.emmitec, title: `E2E publicado ${STAMP}`, publishAt: spIso(tzDay, '08:00') })
  const cLate = await quick('nicolas', { companyId: C.pet, title: `E2E 23h30 ${STAMP}`, publishAt: spIso(tzDay, '23:30') })
  await q(`UPDATE "MarketingCard" SET status='PUBLISHED', "publishedAt"=now() WHERE id=$1`, [cPublished.id])
  check(!!cDrag?.id && !!cPublished?.id && !!cRefuse?.id && !!cLate?.id && !!cWeekDrag?.id, 'cards do roteiro criados pela API (POST /calendar/cards)')
  // Links do roteiro (um por marca e um do grupo inteiro), usados no B4 e no B5
  const linkPet = await api('nicolas', 'POST', '/links', { title: `E2E Instagram Pet ${STAMP}`, url: 'https://instagram.com/petjourney', category: 'Redes sociais', companyId: C.pet, username: 'petjourney', secret: `pet-${STAMP}!` })
  const linkEmmi = await api('nicolas', 'POST', '/links', { title: `E2E LinkedIn Emmi ${STAMP}`, url: 'https://linkedin.com/company/emmi', category: 'Redes sociais', companyId: C.emmitec, username: 'emmi', secret: `emmi-${STAMP}!` })
  const linkGroup = await api('nicolas', 'POST', '/links', { title: `E2E Meta Business ${STAMP}`, url: 'https://business.facebook.com', category: 'Anúncios', secret: `grupo-${STAMP}!` })
  check(linkPet.status === 201 && linkEmmi.status === 201 && linkGroup.status === 201 && linkGroup.json.companyId === null, 'links do roteiro criados pela API (marca e grupo inteiro)')
  check(JSON.stringify([linkPet.json, linkEmmi.json, linkGroup.json]).indexOf(STAMP + '!') === -1, 'resposta do POST /links não devolve a senha')
  const L = { pet: linkPet.json, emmi: linkEmmi.json, group: linkGroup.json }

  // ── B1: Mês, Semana e Lista na data certa (Brasília), com marca e status ──
  if (want('b1')) {
    part = 'B1'
    const seedCards = await q(
      `SELECT id, title, "companyId", status, "publishAt", networks FROM "MarketingCard" WHERE id = ANY($1) AND "publishAt" IS NOT NULL`,
      [seed.cards.map((c) => c.id)],
    )
    check(seedCards.length >= 4, 'seed tem cards com data de publicação', `${seedCards.length}`)
    // API: o intervalo de Brasília devolve exatamente os cards do banco
    const from = gridStart
    const to = gridEnd
    const r = await api('nicolas', 'GET', `/calendar?from=${from}&to=${to}`)
    const dbInRange = await q(
      `SELECT id FROM "MarketingCard" WHERE "groupId"=$1 AND "archivedAt" IS NULL AND "publishAt" >= $2 AND "publishAt" < $3`,
      [G, spIso(from, '00:00'), spIso(addDays(to, 1), '00:00')],
    )
    check(r.status === 200 && r.json.cards.length === dbInRange.length, 'GET /calendar = cards do banco no intervalo de Brasília', `${r.json?.cards?.length} x ${dbInRange.length}`)
    check(r.json.timeZone === TZ && typeof r.json.undated === 'number', 'resposta traz fuso e "undated"', `undated ${r.json.undated}`)
    const undatedDb = (await q(`SELECT count(*)::int n FROM "MarketingCard" WHERE "groupId"=$1 AND "archivedAt" IS NULL AND "publishAt" IS NULL AND status NOT IN ('PUBLISHED','DELIVERED')`, [G]))[0].n
    check(r.json.undated === undatedDb, '"undated" bate com o banco (abertos sem data)', `${r.json.undated} x ${undatedDb}`)
    const big = await api('nicolas', 'GET', `/calendar?from=${from}&to=${addDays(from, 100)}`)
    check(big.status === 400 && /100 dias/.test(big.json?.message), 'intervalo de 101 dias: 400 em PT-BR', big.json?.message)
    const ok100 = await api('nicolas', 'GET', `/calendar?from=${from}&to=${addDays(from, 99)}`)
    check(ok100.status === 200, 'intervalo de 100 dias: 200')
    const bad = await api('nicolas', 'GET', `/calendar?from=2026-02-30&to=2026-03-01`)
    check(bad.status === 400, 'data inválida: 400', bad.json?.message)
    const lateItem = r.json.cards.find((c) => c.id === cLate.id)
    check(lateItem && sp(lateItem.publishAt).day === tzDay && sp(lateItem.publishAt).time === '23:30', 'card das 23h30 de Brasília volta no dia certo pela API', lateItem?.publishAt)

    const brandName = { [C.pet]: 'PetJourney', [C.emmitec]: 'Emmitec', [C.nevo]: 'Nevo Studio' }
    const brandColor = { [C.pet]: 'teal', [C.emmitec]: 'indigo', [C.nevo]: 'amber' }
    const statusLabel = { IDEA: 'Ideia', IN_PRODUCTION: 'Em produção' }

    // Mês (computador), fuso do navegador = Brasília
    for (const card of seedCards) {
      const { day, time } = sp(card.publishAt)
      const { ctx, page, bad: badRes } = await open(browser, 'nicolas', `/marketing/calendario?dia=${day}`, DESK)
      await calendarReady(page)
      const chip = page.locator(`.mkc-day[data-day="${day}"] .mkc-chip[data-item="card:${card.id}"]`)
      const label = (await chip.getAttribute('aria-label').catch(() => null)) ?? ''
      check((await chip.count()) === 1, `Mês: "${card.title.slice(0, 28)}" no dia ${ddmm(day)}`)
      check(label.startsWith(time) && label.includes(brandName[card.companyId]) && label.includes(statusLabel[card.status]), `Mês: hora ${time}, marca e status no item`, label)
      const brandStyle = (await chip.locator('.mkc-chip__brand').getAttribute('style').catch(() => '')) ?? ''
      check(brandStyle.includes(`--tag-${brandColor[card.companyId]}`), 'Mês: ponto na cor da marca', brandStyle)
      if (card === seedCards[0]) await shot(page, 'cal-mes-d1440.png')
      check(badRes.length === 0, 'sem 401/5xx', badRes.join(', '))
      await ctx.close()
    }

    // Mês com o navegador em Tóquio: o dia continua o de Brasília
    {
      const { ctx, page } = await open(browser, 'nicolas', `/marketing/calendario?dia=${tzDay}`, DESK, { timezoneId: 'Asia/Tokyo' })
      await calendarReady(page)
      const chip = page.locator(`.mkc-day[data-day="${tzDay}"] .mkc-chip[data-item="card:${cLate.id}"]`)
      check((await chip.count()) === 1 && (await chip.innerText()).includes('23:30'), 'navegador em Tóquio: 23h30 de Brasília fica no mesmo dia e hora', `${tzDay}`)
      await ctx.close()
    }

    // Semana (computador) e Lista
    const sample = seedCards.find((c) => c.status === 'IN_PRODUCTION') ?? seedCards[0]
    const s = sp(sample.publishAt)
    {
      const { ctx, page, bad: badRes } = await open(browser, 'nicolas', `/marketing/calendario?vista=semana&dia=${s.day}`, DESK)
      await calendarReady(page)
      const blk = page.locator(`.mkc-wk__col[data-day="${s.day}"] .mkc-blk[data-item="card:${sample.id}"]`)
      check((await blk.count()) === 1, `Semana: "${sample.title.slice(0, 28)}" na coluna de ${ddmm(s.day)}`)
      check(((await blk.innerText().catch(() => '')) ?? '').includes(s.time), `Semana: bloco mostra ${s.time}`)
      const top = await blk.evaluate((el) => parseFloat(el.style.top)).catch(() => -1)
      const [hh, mm] = s.time.split(':').map(Number)
      check(Math.abs(top - ((hh * 60 + mm) / 60) * 44 - 1) < 1.5, 'Semana: bloco na altura da hora certa', `top ${top}`)
      await shot(page, 'cal-semana-d1440.png')
      check(badRes.length === 0, 'sem 401/5xx', badRes.join(', '))
      await ctx.close()
    }
    {
      const { ctx, page, bad: badRes } = await open(browser, 'nicolas', `/marketing/calendario?vista=lista&dia=${s.day}`, DESK)
      await calendarReady(page)
      const row = page.locator(`.mkc-ag__day[data-day="${s.day}"] .mkc-row[data-item="card:${sample.id}"]`)
      check((await row.count()) === 1, `Lista: "${sample.title.slice(0, 28)}" no dia ${ddmm(s.day)}`)
      const txt = (await row.innerText().catch(() => '')) ?? ''
      check(txt.includes(s.time) && txt.includes(brandName[sample.companyId]) && txt.includes(statusLabel[sample.status]), 'Lista: hora, marca e status na linha', txt.replace(/\s+/g, ' '))
      await shot(page, 'cal-lista-d1440.png')
      check(badRes.length === 0, 'sem 401/5xx', badRes.join(', '))
      await ctx.close()
    }

    // Celular: mês em pontos e a agenda do dia embaixo
    {
      const { ctx, page, bad: badRes } = await open(browser, 'leticia', `/marketing/calendario?dia=${s.day}`, PHONE)
      await calendarReady(page)
      const dots = await page.locator(`.mkc-day[data-day="${s.day}"] .mkc-day__dots i`).count()
      check(dots >= 1, 'celular: ponto no dia do card', `${dots}`)
      const inAgenda = page.locator(`.mkc-ag__day[data-day="${s.day}"] .mkc-row[data-item="card:${sample.id}"]`)
      check((await inAgenda.count()) === 1, 'celular: agenda do dia mostra o card')
      await shot(page, 'cal-mes-m375.png')
      const other = addDays(s.day, 1)
      await page.locator(`.mkc-day[data-day="${other}"] .mkc-day__num`).click()
      await page.waitForTimeout(500)
      check(page.url().includes(`dia=${other}`) && (await page.locator(`.mkc-ag__day[data-day="${other}"]`).count()) === 1, 'celular: tocar no dia troca a agenda', page.url())
      await page.locator('.mkc-ag').first().scrollIntoViewIfNeeded()
      await shot(page, 'cal-dia-m375.png')
      const h = await page.locator('.mkcal__view').first().evaluate((el) => el.getBoundingClientRect().height)
      check(h >= 40, 'celular: troca de visão com alvo grande', `${h}px`)
      const numH = await page.locator('.mkc-day__num').first().evaluate((el) => el.getBoundingClientRect().height)
      check(numH >= 36, 'celular: número do dia tocável', `${numH}px`)
      check(badRes.length === 0, 'sem 401/5xx', badRes.join(', '))
      await ctx.close()
    }
  }

  // ── Faixas de várias dias (fonte de mentira) e filtro por rede ────────────
  if (want('faixa')) {
    part = 'faixa'
    const D1 = addDays(gridStart, 7 + 3) // quinta da 2ª semana
    const D2 = addDays(D1, 7) // quinta da 3ª semana
    const D3 = addDays(gridStart, 14 + 1) // terça da 3ª semana
    const D4 = addDays(gridStart, 21 + 4) // sexta da 4ª semana
    const fake = [
      { id: 'campaign:e2e-camp', source: 'campaign', entityId: 'e2e-camp', title: 'Campanha E2E Dia dos Pets', companyId: C.pet, start: D1, end: D2, allDay: true, tone: 'purple', kindLabel: 'Campanha', statusLabel: 'Ativa', to: { name: 'marketing-campaigns' }, draggable: false, startDay: D1, endDay: D2 },
      { id: 'activation:e2e-feira', source: 'activation', entityId: 'e2e-feira', title: 'Feira Pet E2E', companyId: C.pet, start: spIso(D3, '09:00'), end: spIso(addDays(D3, 2), '18:00'), allDay: false, tone: 'orange', kindLabel: 'Feira', to: { name: 'marketing-activations' }, draggable: false, startDay: D3, endDay: addDays(D3, 2) },
      { id: 'activation:e2e-palestra', source: 'activation', entityId: 'e2e-palestra', title: 'Palestra E2E', companyId: null, start: D4, end: null, allDay: true, tone: 'cyan', kindLabel: 'Palestra', to: { name: 'marketing-activations' }, draggable: false, startDay: D4, endDay: D4 },
    ]
    {
      const { ctx, page, bad: badRes } = await open(browser, 'nicolas', `/marketing/calendario?dia=${today}`, DESK, { fake })
      await calendarReady(page)
      const segs = await page.locator('.mkc-band[data-item="campaign:e2e-camp"]').evaluateAll((els) => els.map((e) => [e.dataset.bandCol, e.dataset.bandSpan, e.getAttribute('draggable')]))
      check(segs.length === 2 && segs[0][0] === '3' && segs[0][1] === '4' && segs[1][0] === '0' && segs[1][1] === '4', 'campanha de 8 dias vira faixa em 2 semanas (qui a dom, seg a qui)', JSON.stringify(segs))
      check(segs.every((s) => s[2] === 'false'), 'faixa não arrasta (draggable: false)')
      const feira = await page.locator('.mkc-band[data-item="activation:e2e-feira"]').evaluateAll((els) => els.map((e) => [e.dataset.bandCol, e.dataset.bandSpan]))
      check(feira.length === 1 && feira[0][0] === '1' && feira[0][1] === '3', 'ativação com hora de 3 dias: faixa de ter a qui', JSON.stringify(feira))
      const palestra = page.locator(`.mkc-day[data-day="${D4}"] .mkc-chip[data-item="activation:e2e-palestra"]`)
      check((await palestra.count()) === 1 && (await palestra.locator('.mkc-chip__time').count()) === 0, 'item de dia inteiro sem fim: ponto no dia, sem hora')
      check((await palestra.getAttribute('draggable')) === 'false', 'item de outra fonte não arrasta')
      const cardChips = await page.locator('.mkc-chip[data-item^="card:"]').count()
      check(cardChips > 0, 'cards continuam aparecendo junto das outras fontes', `${cardChips}`)
      await shot(page, 'cal-faixa-d1440.png')
      // Filtro por rede: some o card sem a rede, a faixa fica (é contexto)
      await page.selectOption('.mkcal__net', 'TIKTOK')
      await page.waitForTimeout(500)
      const reelSeed = seed.cards.find((c) => c.title.startsWith('Reel'))
      const carrossel = seed.cards.find((c) => c.title.startsWith('Carrossel'))
      check(page.url().includes('rede=TIKTOK'), 'filtro de rede vai para a URL')
      check((await page.locator(`.mkc-chip[data-item="card:${carrossel.id}"]`).count()) === 0, 'rede TikTok esconde o carrossel (só Instagram)')
      const reelDay = sp((await cardRow(reelSeed.id)).publishAt).day
      if (inGrid(reelDay)) check((await page.locator(`.mkc-chip[data-item="card:${reelSeed.id}"]`).count()) === 1, 'rede TikTok mantém o reel (Instagram e TikTok)')
      check((await page.locator('.mkc-band[data-item="campaign:e2e-camp"]').count()) === 2, 'faixa da campanha continua com o filtro de rede')
      await page.selectOption('.mkcal__net', '')
      await page.waitForTimeout(300)
      // Clicar na faixa vai para o `to`
      await page.locator('.mkc-band[data-item="campaign:e2e-camp"]').first().click()
      await page.waitForURL(/\/marketing\/campanhas/, { timeout: 5000 }).catch(() => {})
      check(page.url().includes('/marketing/campanhas'), 'clicar na faixa leva ao "to" da fonte', page.url())
      check(badRes.length === 0, 'sem 401/5xx', badRes.join(', '))
      await ctx.close()
    }
    {
      const { ctx, page } = await open(browser, 'nicolas', `/marketing/calendario?vista=semana&dia=${D1}`, DESK, { fake })
      await calendarReady(page)
      const seg = await page.locator('.mkc-wk__band[data-item="campaign:e2e-camp"]').count()
      check(seg === 1, 'Semana: campanha na faixa "Dia todo"', `${seg}`)
      await shot(page, 'cal-faixa-semana-d1440.png')
      await ctx.close()
    }
    {
      const { ctx, page } = await open(browser, 'nicolas', `/marketing/calendario?vista=lista&dia=${D1}`, DESK, { fake })
      await calendarReady(page)
      const rows = page.locator('.mkc-row[data-item="campaign:e2e-camp"]')
      const when = await rows.first().locator('.mkc-row__when').innerText().catch(() => '')
      check((await rows.count()) === 1 && when === `${ddmm(D1)} a ${ddmm(D2)}`, 'Lista: campanha aparece uma vez, com o período', when)
      await ctx.close()
    }
    {
      const { ctx, page } = await open(browser, 'nicolas', `/marketing/calendario?dia=${D1}`, PHONE, { fake })
      await calendarReady(page)
      check((await page.locator('.mkc-band[data-item="campaign:e2e-camp"]').count()) === 2, 'celular: faixa vira traço nas duas semanas')
      await shot(page, 'cal-faixa-m375.png')
      await ctx.close()
    }
  }

  // ── B2: arrastar persiste (mesma hora) e Publicado não arrasta ────────────
  if (want('b2')) {
    part = 'B2'
    const before = sp((await cardRow(cDrag.id)).publishAt)
    const { ctx, page, bad: badRes } = await open(browser, 'marcel', `/marketing/calendario?dia=${today}`, DESK)
    await calendarReady(page)
    const chip = page.locator(`.mkc-day[data-day="${dragFrom}"] .mkc-chip[data-item="card:${cDrag.id}"]`)
    check((await chip.getAttribute('draggable')) === 'true', 'card aberto arrasta (draggable)')
    await realDrag(page, chip, page.locator(`.mkc-day[data-day="${dragTo}"]`))
    const moved = await waitFor(async () => {
      const row = await cardRow(cDrag.id)
      return sp(row.publishAt).day === dragTo ? row : null
    })
    check(!!moved, `arrastar com o mouse grava o novo dia (${ddmm(dragFrom)} para ${ddmm(dragTo)})`, moved ? moved.publishAt.toISOString() : 'sem mudança')
    check(moved && sp(moved.publishAt).time === before.time, `mantém a hora (${before.time})`, moved ? sp(moved.publishAt).time : '')
    check((await page.locator(`.mkc-day[data-day="${dragTo}"] .mkc-chip[data-item="card:${cDrag.id}"]`).count()) === 1, 'o card aparece no dia novo na tela')
    const log = await logsOf(cDrag.id, 'rescheduled')
    check(log.length === 1 && log[0].actorId === U.marcel && log[0].summary.includes(`${ddmm(dragTo)} às ${before.time}`), 'histórico "rescheduled" com a frase', log[0]?.summary)
    await shot(page, 'cal-arrastado-d1440.png')

    // Publicado: não arrasta na tela e a API recusa
    const pub = page.locator(`.mkc-chip[data-item="card:${cPublished.id}"]`)
    check((await pub.getAttribute('draggable')) === 'false' && (await pub.getAttribute('class')).includes('is-fixed'), 'Publicado: draggable=false na tela')
    const pubBefore = (await cardRow(cPublished.id)).publishAt.toISOString()
    await realDrag(page, pub, page.locator(`.mkc-day[data-day="${dragTo}"]`)).catch(() => {})
    await sleep(1200)
    check((await cardRow(cPublished.id)).publishAt.toISOString() === pubBefore, 'Publicado: arrastar não muda nada no banco')
    const apiPub = await api('nicolas', 'PATCH', `/calendar/cards/${cPublished.id}`, { publishAt: spIso(dragTo, '08:00') })
    check(apiPub.status === 400 && apiPub.json?.message === 'Card publicado não muda de data.', 'Publicado: PATCH dá 400 com a frase', `${apiPub.status} ${apiPub.json?.message}`)

    // Otimista com desfazer: a tela acha que arrasta, a API recusa, o card volta
    await q(`UPDATE "MarketingCard" SET status='PUBLISHED' WHERE id=$1`, [cRefuse.id])
    const refuse = page.locator(`.mkc-day[data-day="${dragFrom}"] .mkc-chip[data-item="card:${cRefuse.id}"]`)
    if ((await refuse.count()) === 0) await page.locator(`.mkc-day[data-day="${dragFrom}"] .mkc-more`).click().catch(() => {})
    await realDrag(page, refuse, page.locator(`.mkc-day[data-day="${dragTo}"]`))
    const toast = await waitFor(async () => (await page.locator('[data-sonner-toast]', { hasText: 'Card publicado não muda de data.' }).count()) > 0, 5000)
    check(!!toast, 'recusa da API vira aviso com a frase dela')
    await waitFor(async () => (await page.locator(`.mkc-day[data-day="${dragFrom}"] .mkc-chip[data-item="card:${cRefuse.id}"]`).count()) === 1, 5000)
    check((await page.locator(`.mkc-day[data-day="${dragFrom}"] .mkc-chip[data-item="card:${cRefuse.id}"]`).count()) === 1, 'e o card volta para o dia de antes (desfaz)')
    check(sp((await cardRow(cRefuse.id)).publishAt).day === dragFrom, 'banco não mudou')

    // Semana: arrastar para outra coluna, mantendo a hora
    await page.goto(`${WEB}/marketing/calendario?vista=semana&dia=${weekFrom}`, { waitUntil: 'networkidle' })
    await calendarReady(page)
    const blk = page.locator(`.mkc-wk__col[data-day="${weekFrom}"] .mkc-blk[data-item="card:${cWeekDrag.id}"]`)
    await blk.scrollIntoViewIfNeeded()
    await realDrag(page, blk, page.locator(`.mkc-wk__col[data-day="${weekTo}"]`), { x: 0.5, y: 0.5 })
    const movedWeek = await waitFor(async () => {
      const row = await cardRow(cWeekDrag.id)
      return sp(row.publishAt).day === weekTo ? row : null
    })
    check(!!movedWeek && sp(movedWeek.publishAt).time === '09:15', `Semana: arrastar para ${ddmm(weekTo)} grava e mantém 09:15`, movedWeek ? sp(movedWeek.publishAt).time : '')
    check(badRes.length === 0, 'sem 401/5xx (a recusa é 400, de propósito)', badRes.join(', '))
    await ctx.close()

    // Teclado: ← → e T
    {
      const { ctx: c2, page: p2 } = await open(browser, 'marcel', '/marketing/calendario', DESK)
      await calendarReady(p2)
      const t0 = await p2.locator('.mkcal__title').innerText()
      await p2.keyboard.press('ArrowRight')
      await p2.waitForTimeout(500)
      const t1 = await p2.locator('.mkcal__title').innerText()
      await p2.keyboard.press('s')
      await p2.waitForTimeout(300)
      const isWeek = p2.url().includes('vista=semana')
      await p2.keyboard.press('t')
      await p2.keyboard.press('m')
      await p2.waitForTimeout(400)
      const t2 = await p2.locator('.mkcal__title').innerText()
      check(t1 !== t0 && isWeek && t2 === t0 && !p2.url().includes('dia='), 'teclado: → avança, S semana, T hoje, M mês', `${t0} > ${t1} > ${t2}`)
      await c2.close()
    }
  }

  // ── B3: clicar no dia vazio cria o card naquela data ─────────────────────
  if (want('b3')) {
    part = 'B3'
    const { ctx, page, bad: badRes } = await open(browser, 'nicolas', `/marketing/calendario?dia=${today}`, DESK)
    await calendarReady(page)
    const empty = await page.$$eval('.mkc-day:not(.is-out)', (cells) =>
      cells.filter((c) => !c.querySelector('.mkc-chip') && !c.classList.contains('is-today')).map((c) => c.dataset.day),
    )
    // Dia vazio (esta grade não tem fonte de mentira, então nem faixa por cima)
    const day = empty[0] ?? null
    check(!!day, 'achou um dia vazio no mês', day ?? '')
    const cell = page.locator(`.mkc-day[data-day="${day}"]`)
    const box = await cell.boundingBox()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 14)
    await page.waitForSelector('[role="dialog"][aria-label="Novo card no calendário"]', { timeout: 4000 }).catch(() => {})
    const dialog = page.locator('[role="dialog"][aria-label="Novo card no calendário"]')
    check((await dialog.count()) === 1, 'clicar no dia vazio abre a criação rápida')
    check((await dialog.locator('[data-field="day"]').inputValue()) === day && (await dialog.locator('[data-field="time"]').inputValue()) === '10:00', 'diálogo já vem com o dia e 10:00', day)
    const title = `E2E criado no dia ${STAMP}`
    await dialog.locator('[data-field="title"]').fill(title)
    await dialog.locator('[data-field="brand"]').selectOption(C.nevo)
    await dialog.locator('[data-field="kind"]').selectOption('CAROUSEL')
    await shot(page, 'cal-criar-d1440.png')
    await dialog.locator('[data-action="create"]').click()
    const row = await waitFor(async () => (await q('SELECT * FROM "MarketingCard" WHERE title=$1', [title]))[0])
    check(!!row, 'card gravado no banco')
    check(row && row.publishAt.toISOString() === spIso(day, '10:00'), 'publishAt = dia escolhido às 10:00 de Brasília', row?.publishAt?.toISOString())
    check(row && row.companyId === C.nevo && row.kind === 'CAROUSEL' && row.status === 'IDEA' && row.createdById === U.nicolas, 'marca, tipo, status Ideia e autor certos')
    const created = await waitFor(async () => (await page.locator(`.mkc-day[data-day="${day}"] .mkc-chip[data-item="card:${row?.id}"]`).count()) === 1)
    check(!!created, 'o card aparece no dia na tela')
    check((await logsOf(row?.id, 'created')).length === 1, 'histórico "created" pela fábrica')
    await shot(page, 'cal-criado-d1440.png')
    // Clicar no item leva ao card
    await page.locator(`.mkc-chip[data-item="card:${row.id}"]`).click()
    await page.waitForURL(/\/marketing\/cards\//, { timeout: 5000 }).catch(() => {})
    check(page.url().includes(`/marketing/cards/${row.id}`), 'clicar no item leva à página do card', page.url())
    await page.waitForTimeout(800)
    check(badRes.length === 0, 'sem 401/5xx', badRes.join(', '))
    await ctx.close()

    // Celular: tocar no dia, "Criar" na agenda
    {
      const { ctx: c2, page: p2, bad: b2 } = await open(browser, 'marcel', `/marketing/calendario?dia=${day}`, PHONE)
      await calendarReady(p2)
      await p2.locator(`.mkc-ag__day[data-day="${day}"] .mkc-ag__add`).click()
      const d2 = p2.locator('[role="dialog"][aria-label="Novo card no calendário"]')
      await d2.waitFor({ timeout: 4000 }).catch(() => {})
      const t2 = `E2E celular ${STAMP}`
      await d2.locator('[data-field="title"]').fill(t2)
      await d2.locator('[data-field="time"]').fill('16:45')
      await shot(p2, 'cal-criar-m375.png')
      await d2.locator('[data-action="create"]').click()
      const r2 = await waitFor(async () => (await q('SELECT * FROM "MarketingCard" WHERE title=$1', [t2]))[0])
      check(r2 && r2.publishAt.toISOString() === spIso(day, '16:45'), 'celular: cria pela agenda do dia, com a hora escolhida', r2?.publishAt?.toISOString())
      check(b2.length === 0, 'sem 401/5xx', b2.join(', '))
      await c2.close()
    }
  }

  // ── B4: freelancer só vê PetJourney; Diretoria vê e não cria ──────────────
  if (want('b4')) {
    part = 'B4'

    const fCal = await api('freela', 'GET', `/calendar?from=${gridStart}&to=${gridEnd}`)
    check(fCal.status === 200 && fCal.json.cards.length > 0 && fCal.json.cards.every((c) => c.companyId === C.pet), 'freelancer: calendário só com PetJourney', `${fCal.json?.cards?.length} cards`)
    const fEmmi = await api('freela', 'GET', `/calendar?from=${gridStart}&to=${gridEnd}&companyId=${C.emmitec}`)
    check(fEmmi.status === 403, 'freelancer pedindo a Emmitec: 403', fEmmi.json?.message)
    const fLinks = await api('freela', 'GET', '/links')
    const fIds = fLinks.json.map((l) => l.id)
    check(fLinks.status === 200 && fLinks.json.every((l) => l.companyId === C.pet) && fIds.includes(linkPet.json.id), 'freelancer: links só da PetJourney')
    check(!fIds.includes(linkEmmi.json.id) && !fIds.includes(linkGroup.json.id), 'freelancer não vê o da Emmitec nem o do grupo inteiro (que guardam senha)')
    const fReveal = await api('freela', 'POST', `/links/${linkEmmi.json.id}/reveal`)
    check(fReveal.status === 404, 'freelancer revelando link da Emmitec: 404', `${fReveal.status}`)
    const fCreate = await api('freela', 'POST', '/links', { title: 'E2E x', url: 'https://x.com', companyId: C.emmitec })
    check(fCreate.status === 403, 'freelancer criando link na Emmitec: 403')
    const fGroup = await api('freela', 'POST', '/links', { title: 'E2E grupo freela', url: 'https://x.com', companyId: null })
    check(fGroup.status === 201 && fGroup.json.companyId === C.pet, 'freelancer sem marca: o link vai para a PetJourney')
    const fCard = await api('freela', 'POST', '/calendar/cards', { companyId: C.emmitec, title: 'E2E freela emmi', publishAt: spIso(today, '10:00') })
    check(fCard.status === 403, 'freelancer criando card na Emmitec: 403')
    const emmiCard = seed.cards.find((c) => c.title.startsWith('Post institucional'))
    const fMove = await api('freela', 'PATCH', `/calendar/cards/${emmiCard.id}`, { publishAt: spIso(today, '10:00') })
    check(fMove.status === 404, 'freelancer arrastando card da Emmitec: 404', `${fMove.status}`)
    const fHome = await api('freela', 'GET', '/home')
    const fHomeCards = ['awaitingApproval', 'changesRequested', 'overdue', 'dueSoon', 'week'].flatMap((k) => fHome.json[k])
    check(fHome.status === 200 && fHomeCards.every((c) => c.companyId === C.pet), 'freelancer: painel só com PetJourney')

    const dCreate = await api('diretoria', 'POST', '/calendar/cards', { companyId: C.pet, title: 'E2E diretoria', publishAt: spIso(today, '10:00') })
    const dMove = await api('diretoria', 'PATCH', `/calendar/cards/${cDrag.id}`, { publishAt: spIso(today, '10:00') })
    const dLink = await api('diretoria', 'POST', '/links', { title: 'E2E d', url: 'https://x.com' })
    const dEdit = await api('diretoria', 'PATCH', `/links/${linkPet.json.id}`, { title: 'E2E d' })
    const dDel = await api('diretoria', 'DELETE', `/links/${linkPet.json.id}`)
    check([dCreate, dMove, dLink, dEdit, dDel].every((r) => r.status === 403), 'Diretoria (Visualizador): criar, mover, criar/editar/apagar link = 403', [dCreate, dMove, dLink, dEdit, dDel].map((r) => r.status).join(','))
    const dCal = await api('diretoria', 'GET', `/calendar?from=${gridStart}&to=${gridEnd}`)
    check(dCal.status === 200 && dCal.json.cards.length > 0, 'Diretoria vê o calendário')
    const dFav = await api('diretoria', 'POST', `/links/${linkPet.json.id}/favorite`, { favorite: true })
    check(dFav.status === 201 && dFav.json.isFavorite === true, 'Diretoria favorita (é dela, não escreve na ala)')

    for (const route of ['/calendar?from=2026-11-01&to=2026-11-30', '/links', '/home']) {
      const r = await api('luis', 'GET', route)
      check(r.status === 403, `quem é de fora (Luis): GET ${route.split('?')[0]} = 403`)
    }
    const lReveal = await api('luis', 'POST', `/links/${linkPet.json.id}/reveal`)
    check(lReveal.status === 403, 'quem é de fora revelando: 403')

    // Tela do freelancer (moldura só da ala; link direto funciona)
    {
      const { ctx, page, bad: badRes } = await open(browser, 'freela', `/marketing/calendario?dia=${today}`, DESK)
      await calendarReady(page)
      check(page.url().includes('/marketing/calendario'), 'freelancer abre o link direto do calendário', page.url())
      const ids = await page.$$eval('[data-item^="card:"]', (els) => els.map((e) => e.dataset.item.slice(5)))
      const companies = (await q('SELECT DISTINCT "companyId" FROM "MarketingCard" WHERE id = ANY($1)', [ids])).map((r) => r.companyId)
      check(ids.length > 0 && companies.length === 1 && companies[0] === C.pet, 'freelancer: tela só com cards da PetJourney', `${ids.length} itens`)
      check((await page.locator('.mk-layout__brand').count()) === 0, 'freelancer: sem filtro de marca (tem uma só)')
      await shot(page, 'freela-cal-d1440.png')
      await page.goto(`${WEB}/marketing/links`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.mkl', { timeout: 8000 })
      await page.waitForTimeout(400)
      const linkIds = await page.$$eval('li.lk', (els) => els.map((e) => e.dataset.link))
      check(linkIds.includes(linkPet.json.id) && !linkIds.includes(linkEmmi.json.id) && !linkIds.includes(linkGroup.json.id), 'freelancer: tela de links só com PetJourney')
      await shot(page, 'freela-links-d1440.png')
      check(badRes.length === 0, 'sem 401/5xx', badRes.join(', '))
      await ctx.close()
    }
    // Tela da Diretoria: vê, não cria nem arrasta
    {
      const { ctx, page, bad: badRes } = await open(browser, 'diretoria', `/marketing/calendario?dia=${today}`, DESK)
      await calendarReady(page)
      check((await page.locator('[data-action="new-card"]').count()) === 0, 'Diretoria: sem "Novo card"')
      const drags = await page.$$eval('.mkc-chip', (els) => els.map((e) => e.getAttribute('draggable')))
      check(drags.length > 0 && drags.every((d) => d === 'false'), 'Diretoria: nenhum item arrasta', `${drags.length}`)
      check((await page.locator('.mkc-day__add').count()) === 0, 'Diretoria: sem "+" no dia')
      const box = await page.locator('.mkc-day:not(.is-out)').nth(3).boundingBox()
      await page.mouse.click(box.x + box.width / 2, box.y + box.height - 10)
      await page.waitForTimeout(400)
      check((await page.locator('[role="dialog"][aria-label="Novo card no calendário"]').count()) === 0, 'Diretoria: clicar no dia não abre criação')
      await page.keyboard.press('n')
      await page.waitForTimeout(300)
      check((await page.locator('[role="dialog"]').count()) === 0, 'Diretoria: tecla N não abre criação')
      await shot(page, 'diretoria-cal-d1440.png')
      check(badRes.length === 0, 'sem 401/5xx', badRes.join(', '))
      await ctx.close()
    }
  }

  // ── B5: a listagem nunca tem a senha; revelar por papel, com histórico ────
  if (want('b5')) {
    part = 'B5'
    const secrets = [`pet-${STAMP}!`, `emmi-${STAMP}!`, `grupo-${STAMP}!`]
    const ciphers = (await q(`SELECT "secretCipher" FROM "MarketingLink" WHERE "groupId"=$1 AND "secretCipher" IS NOT NULL`, [G])).map((r) => r.secretCipher)
    for (const who of ['nicolas', 'leticia', 'marcel', 'freela', 'diretoria']) {
      const r = await api(who, 'GET', '/links')
      const leaks = secrets.filter((s) => r.text.includes(s)).length + ciphers.filter((c) => r.text.includes(c)).length
      const keys = new Set(r.json.flatMap((l) => Object.keys(l)))
      check(r.status === 200 && leaks === 0 && !keys.has('secret') && !keys.has('secretCipher'), `GET /links (${who}): JSON sem senha, nem em claro nem cifrada`, `${r.json.length} links, chaves: ${[...keys].join(' ')}`)
    }
    const dbCipher = (await q('SELECT "secretCipher" FROM "MarketingLink" WHERE id=$1', [L.pet.id]))[0].secretCipher
    check(dbCipher && !dbCipher.includes(`pet-${STAMP}`), 'no banco a senha está cifrada')
    const reveal = await api('leticia', 'POST', `/links/${L.pet.id}/reveal`)
    check(reveal.status === 201 && reveal.json.secret === `pet-${STAMP}!`, 'Admin (Letícia) revela e recebe a senha')
    const revealedLog = await logsOf(L.pet.id, 'revealed')
    check(revealedLog.some((l) => l.actorId === U.leticia && l.summary.startsWith('revelou a senha')), 'histórico registra "revealed" da Letícia', revealedLog.map((l) => l.summary).join(' | '))
    const dReveal = await api('diretoria', 'POST', `/links/${L.pet.id}/reveal`)
    check(dReveal.status === 403 && dReveal.json.message === 'Visualizador não revela senha.', 'Diretoria (Visualizador) revelando: 403', dReveal.json?.message)
    const mReveal = await api('marcel', 'POST', `/links/${L.pet.id}/reveal`)
    check(mReveal.status === 201, 'Editor revela com editorRevealsSecrets ligado (padrão)')
    const bad = await api('nicolas', 'POST', '/links', { title: 'E2E js', url: 'javascript:alert(1)' })
    check(bad.status === 400, 'URL javascript: recusada (400)', bad.json?.message)
    const keep = await api('nicolas', 'PATCH', `/links/${L.emmi.id}`, { notes: 'só nota' })
    const after = (await q('SELECT "secretCipher" FROM "MarketingLink" WHERE id=$1', [L.emmi.id]))[0].secretCipher
    const emmiBefore = ciphers.find((c) => c === after)
    check(keep.status === 200 && keep.json.hasSecret && !!emmiBefore, 'PATCH sem secret mantém a senha guardada')

    // Tela da Letícia: Revelar mostra, copia e esconde sozinha em 30 s
    {
      const { ctx, page, bad: badRes } = await open(browser, 'leticia', '/marketing/links', DESK)
      await page.waitForSelector(`li.lk[data-link="${L.pet.id}"]`, { timeout: 8000 })
      const listBodies = []
      page.on('response', async (res) => {
        if (/\/links(\?|$)/.test(res.url()) && res.request().method() === 'GET') listBodies.push(await res.text().catch(() => ''))
      })
      const row = page.locator(`li.lk[data-link="${L.pet.id}"]`)
      check((await row.locator('[data-field="secret"]').count()) === 0, 'senha começa escondida')
      await row.locator('[data-action="reveal"]').click()
      await row.locator('[data-field="secret"]').waitFor({ timeout: 4000 }).catch(() => {})
      check((await row.locator('[data-field="secret"]').innerText().catch(() => '')) === `pet-${STAMP}!`, 'Revelar mostra a senha')
      await shot(page, 'links-revelado-d1440.png')
      await row.locator('[data-action="copy-secret"]').click()
      await page.waitForTimeout(400)
      const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null)
      check(clip === null || clip === `pet-${STAMP}!`, 'copiar senha põe a senha na área de transferência', clip === null ? 'sem permissão de leitura no headless' : 'ok')
      await row.locator('[data-action="copy-link"]').click()
      await page.waitForTimeout(300)
      const clip2 = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null)
      check(clip2 === null || clip2 === 'https://instagram.com/petjourney', 'copiar link copia a URL', clip2 ?? '')
      await page.waitForTimeout(31_000)
      check((await row.locator('[data-field="secret"]').count()) === 0, 'senha some sozinha depois de 30 s')
      check(listBodies.every((b) => !secrets.some((s) => b.includes(s))), 'nenhuma resposta de listagem da tela trouxe a senha')
      check(badRes.length === 0, 'sem 401/5xx', badRes.join(', '))
      await ctx.close()
    }
    // Tela do Marcel: criar, favoritar, editar (sem trocar senha), apagar
    {
      const { ctx, page, bad: badRes } = await open(browser, 'marcel', '/marketing/links', DESK)
      await page.waitForSelector('.mkl', { timeout: 8000 })
      await page.locator('[data-action="new-link"]').click()
      const dlg = page.locator('[role="dialog"][aria-label="Novo link"]')
      await dlg.waitFor({ timeout: 4000 })
      const title = `E2E Canva ${STAMP}`
      await dlg.locator('[data-field="title"]').fill(title)
      await dlg.locator('[data-field="url"]').fill('canva.com/petjourney')
      await dlg.locator('[data-field="username"]').click() // sai do campo: vira https://
      await dlg.locator('[data-field="category"]').selectOption('Ferramentas')
      await dlg.locator('[data-field="brand"]').selectOption(C.pet)
      await dlg.locator('[data-field="username"]').fill('marcel@pet')
      await dlg.locator('[data-field="secret"]').fill(`canva-${STAMP}`)
      await shot(page, 'links-criar-d1440.png')
      await dlg.locator('[data-action="save-link"]').click()
      const row = await waitFor(async () => (await q('SELECT * FROM "MarketingLink" WHERE title=$1', [title]))[0])
      check(row && row.url === 'https://canva.com/petjourney' && row.category === 'Ferramentas' && row.companyId === C.pet && row.createdById === U.marcel, 'criar pela tela grava URL com https, categoria e marca', row?.url)
      check(row && row.secretCipher && !row.secretCipher.includes(`canva-${STAMP}`), 'senha criada pela tela vai cifrada')
      const li = page.locator(`li.lk[data-link="${row?.id}"]`)
      await li.waitFor({ timeout: 5000 }).catch(() => {})
      check((await page.locator('[data-section="Ferramentas"]').locator(`li.lk[data-link="${row?.id}"]`).count()) === 1, 'aparece na categoria Ferramentas')
      await li.locator('[data-action="favorite"]').click()
      const fav = await waitFor(async () => (await q('SELECT * FROM "MarketingLinkFavorite" WHERE "linkId"=$1 AND "userId"=$2', [row.id, U.marcel])).length === 1)
      check(!!fav && (await page.locator('[data-section="favoritos"]').locator(`li.lk[data-link="${row.id}"]`).count()) === 1, 'favoritar grava e sobe para Favoritos')
      // Editar sem mexer na senha
      const cipherBefore = row.secretCipher
      await page.locator(`li.lk[data-link="${row.id}"] [data-action="edit"]`).click()
      const edit = page.locator('[role="dialog"][aria-label="Editar link"]')
      await edit.waitFor({ timeout: 4000 })
      check((await edit.locator('[data-field="secret"]').inputValue()) === '', 'editar não traz a senha para o formulário')
      await edit.locator('[data-field="title"]').fill(`${title} editado`)
      await edit.locator('[data-action="save-link"]').click()
      const edited = await waitFor(async () => (await q('SELECT * FROM "MarketingLink" WHERE id=$1 AND title=$2', [row.id, `${title} editado`]))[0])
      check(edited && edited.secretCipher === cipherBefore, 'editar com a senha vazia mantém a guardada')
      // Apagar a senha guardada
      await page.locator(`li.lk[data-link="${row.id}"] [data-action="edit"]`).click()
      await edit.waitFor({ timeout: 4000 })
      await edit.locator('[data-field="clear-secret"]').check()
      await edit.locator('[data-action="save-link"]').click()
      const cleared = await waitFor(async () => (await q('SELECT * FROM "MarketingLink" WHERE id=$1 AND "secretCipher" IS NULL', [row.id]))[0])
      check(!!cleared, '"Apagar senha guardada" limpa a senha (secret: null)')
      // Marcel não apaga o link do Nicolas; apaga o dele
      check((await page.locator(`li.lk[data-link="${L.pet.id}"] [data-action="delete"]`).count()) === 0, 'Editor não vê Apagar no link de outra pessoa')
      await page.locator(`li.lk[data-link="${row.id}"] [data-action="delete"]`).click()
      await page.locator('.confirm-submit').click()
      const gone = await waitFor(async () => (await q('SELECT 1 FROM "MarketingLink" WHERE id=$1', [row.id])).length === 0)
      check(!!gone && (await logsOf(row.id, 'deleted')).length === 1, 'apagar com confirmação remove e registra')
      const mDelOther = await api('marcel', 'DELETE', `/links/${L.pet.id}`)
      check(mDelOther.status === 403, 'Editor apagando link de outra pessoa pela API: 403')
      check(badRes.length === 0, 'sem 401/5xx', badRes.join(', '))
      await ctx.close()
    }
    // Tela da Diretoria: sem Revelar, sem criar, sem editar
    {
      const { ctx, page, bad: badRes } = await open(browser, 'diretoria', '/marketing/links', DESK)
      await page.waitForSelector(`li.lk[data-link="${L.pet.id}"]`, { timeout: 8000 })
      check((await page.locator('[data-action="reveal"]').count()) === 0 && (await page.locator('[data-action="copy-secret"]').count()) === 0, 'Diretoria: nenhum Revelar nem copiar senha')
      check((await page.locator('[data-action="new-link"]').count()) === 0 && (await page.locator('[data-action="edit"]').count()) === 0 && (await page.locator('[data-action="delete"]').count()) === 0, 'Diretoria: sem criar, editar e apagar')
      check((await page.getByText('As senhas ficam escondidas para o seu papel').count()) === 1, 'Diretoria: aviso curto de que a senha é com Admin')
      await shot(page, 'links-diretoria-d1440.png')
      check(badRes.length === 0, 'sem 401/5xx', badRes.join(', '))
      await ctx.close()
    }
  }

  // ── B6: Painel (Para aprovar para a Letícia, Ajustes pedidos para o Marcel) ──
  if (want('b6')) {
    part = 'B6'
    const aw = await quick('marcel', { companyId: C.pet, title: `E2E aguardando ${STAMP}`, kind: 'POST', publishAt: spIso(addDays(today, 3), '12:00') })
    const ch = await quick('marcel', { companyId: C.emmitec, title: `E2E ajuste ${STAMP}`, kind: 'REEL', publishAt: spIso(addDays(today, 4), '12:00') })
    const wk = await quick('leticia', { companyId: C.pet, title: `E2E nesta semana ${STAMP}`, publishAt: spIso(today, '17:00') })
    const late = await quick('leticia', { companyId: C.nevo, title: `E2E atrasado ${STAMP}`, publishAt: spIso(addDays(today, 5), '10:00') })
    // Estados de aprovação direto no banco (o fluxo de aprovar é da M1-A)
    await q(`UPDATE "MarketingCard" SET status='AWAITING_APPROVAL', "assigneeId"=$2, "dueAt"=$3 WHERE id=$1`, [aw.id, U.marcel, spIso(addDays(today, 2), '18:00')])
    await q(`UPDATE "MarketingCard" SET status='CHANGES_REQUESTED', "assigneeId"=$2 WHERE id=$1`, [ch.id, U.marcel])
    await q(`UPDATE "MarketingCard" SET status='IN_PRODUCTION', "assigneeId"=$2, "dueAt"=$3 WHERE id=$1`, [late.id, U.marcel, spIso(addDays(today, -2), '18:00')])
    const has = (list, id) => list.some((c) => c.id === id)
    const hL = (await api('leticia', 'GET', '/home')).json
    check(has(hL.awaitingApproval, aw.id) && hL.isAdmin, 'API: Letícia (Admin) tem o card em Para aprovar')
    check(!has(hL.changesRequested, ch.id), 'API: ajuste do Marcel não aparece como da Letícia')
    const hM = (await api('marcel', 'GET', '/home')).json
    check(has(hM.changesRequested, ch.id), 'API: Marcel tem o card em Ajustes pedidos')
    check(has(hM.awaitingApproval, aw.id) && !hM.isAdmin, 'API: Marcel vê o seu aguardando (não é Admin)')
    const hD = (await api('diretoria', 'GET', '/home')).json
    check(!has(hD.awaitingApproval, aw.id) && !has(hD.changesRequested, ch.id), 'API: Diretoria não tem nada para aprovar nem ajuste')
    check(has(hL.overdue, late.id) && has(hL.dueSoon, aw.id), 'API: atrasado e prazo nos próximos 3 dias')
    check(has(hL.week, wk.id) && hL.weekStart === mondayOf(today), 'API: semana de segunda a domingo com a publicação de hoje', hL.weekStart)
    check(typeof hL.countsByStatus.AWAITING_APPROVAL === 'number' && hL.recent.length > 0 && hL.recent.length <= 20, 'API: contagem por status e até 20 de atividade')
    const hPet = (await api('leticia', 'GET', `/home?companyId=${C.pet}`)).json
    check(['awaitingApproval', 'overdue', 'week'].every((k) => hPet[k].every((c) => c.companyId === C.pet)) && !has(hPet.overdue, late.id), 'API: filtro de marca no painel')

    {
      const { ctx, page, bad: badRes } = await open(browser, 'leticia', '/marketing', DESK)
      await page.waitForSelector('[data-section="para-aprovar"]', { timeout: 8000 })
      check((await page.locator(`[data-section="para-aprovar"] [data-card="${aw.id}"]`).count()) === 1, 'tela: Letícia vê o card em Para aprovar')
      check((await page.locator(`[data-section="atrasados"] [data-card="${late.id}"].is-late`).count()) === 1, 'tela: atrasado em vermelho')
      check((await page.locator(`[data-section="semana"] [data-day="${today}"] [data-card="${wk.id}"]`).count()) === 1, 'tela: Esta semana mostra a publicação no dia de hoje')
      await shot(page, 'home-leticia-d1440.png')
      await page.locator(`[data-section="para-aprovar"] [data-card="${aw.id}"]`).click()
      await page.waitForURL(/\/marketing\/cards\//, { timeout: 5000 }).catch(() => {})
      check(page.url().includes(`/marketing/cards/${aw.id}`), 'tela: a linha leva ao card', page.url())
      await page.waitForTimeout(600)
      check(badRes.length === 0, 'sem 401/5xx', badRes.join(', '))
      await ctx.close()
    }
    {
      const { ctx, page, bad: badRes } = await open(browser, 'marcel', '/marketing', DESK)
      await page.waitForSelector('[data-section="ajustes"]', { timeout: 8000 })
      check((await page.locator(`[data-section="ajustes"] [data-card="${ch.id}"]`).count()) === 1, 'tela: Marcel vê o card em Ajustes pedidos para você')
      check((await page.getByText('Seus cards aguardando aprovação').count()) === 1, 'tela: Editor vê "Seus cards aguardando aprovação"')
      await shot(page, 'home-marcel-d1440.png')
      check(badRes.length === 0, 'sem 401/5xx', badRes.join(', '))
      await ctx.close()
    }
    {
      const { ctx, page, bad: badRes } = await open(browser, 'diretoria', '/marketing', DESK)
      await page.waitForSelector('[data-section="para-aprovar"]', { timeout: 8000 })
      check((await page.getByText('Nenhum card seu esperando aprovação.').count()) === 1 && (await page.getByText('Nenhum ajuste pedido para você.').count()) === 1, 'tela: estados vazios com frase curta')
      check(badRes.length === 0, 'sem 401/5xx', badRes.join(', '))
      await ctx.close()
    }
  }

  // ── B7: aviso de prazo (método do cron chamado direto) sem duplicar ──────
  if (want('b7')) {
    part = 'B7'
    const tomorrow = addDays(today, 1)
    const dl = await quick('nicolas', { companyId: C.pet, title: `E2E prazo amanhã ${STAMP}`, publishAt: spIso(addDays(today, 6), '10:00') })
    const pb = await quick('marcel', { companyId: C.emmitec, title: `E2E publica amanhã ${STAMP}`, publishAt: spIso(tomorrow, '13:00') })
    const sch = await quick('marcel', { companyId: C.pet, title: `E2E agendado amanhã ${STAMP}`, publishAt: spIso(tomorrow, '15:00') })
    await q(`UPDATE "MarketingCard" SET status='IN_PRODUCTION', "assigneeId"=$2, "dueAt"=$3 WHERE id=$1`, [dl.id, U.freela, spIso(tomorrow, '23:30')])
    await q(`UPDATE "MarketingCard" SET status='SCHEDULED' WHERE id=$1`, [sch.id])
    const ids = [dl.id, pb.id, sch.id]
    const notifs = async () =>
      q(`SELECT "userId", type, split_part(link, '?', 1) AS link FROM "Notification" WHERE split_part(link, '?', 1) = ANY($1) ORDER BY type, "userId"`, [ids.map((id) => `/marketing/cards/${id}`)])
    const first = runDeadlineCron()
    check(!first.error, 'contexto da API sobe e roda MarketingDeadlineService.run()', first.error ?? JSON.stringify(first.result))
    const next = first.next && !first.next.startsWith('erro') ? sp(first.next) : null
    check(next && next.time === '08:00', 'cron registrado para 8h de Brasília', first.next)
    const n1 = await notifs()
    const dlN = n1.filter((n) => n.link.endsWith(dl.id))
    const pbN = n1.filter((n) => n.link.endsWith(pb.id))
    check(dlN.length === 1 && dlN[0].type === 'MARKETING_DEADLINE_TOMORROW' && dlN[0].userId === U.freela, 'prazo amanhã (23h30 de Brasília): avisa o responsável', JSON.stringify(dlN.map((n) => [n.type, n.userId])))
    const pbUsers = pbN.map((n) => n.userId).sort()
    check(
      pbN.every((n) => n.type === 'MARKETING_PUBLISH_TOMORROW') && JSON.stringify(pbUsers) === JSON.stringify([U.leticia, U.marcel, U.nicolas].sort()),
      'publicação amanhã sem agendar: avisa responsável (quem criou) e Admins da marca',
      pbN.map((n) => n.userId).join(','),
    )
    check(!pbN.some((n) => n.userId === U.freela || n.userId === U.diretoria), 'freelancer (outra marca) e Diretoria não recebem')
    check(n1.filter((n) => n.link.endsWith(sch.id)).length === 0, 'Agendado não recebe aviso de publicação')
    const logs1 = await q(`SELECT "entityId", "actorId", summary FROM "MarketingLog" WHERE verb='deadline_warned' AND "entityId" = ANY($1)`, [ids])
    check(logs1.length === 2 && logs1.every((l) => l.actorId === 'system'), 'um "deadline_warned" por card, assinado pelo sistema', logs1.map((l) => l.summary).join(' | '))

    const second = runDeadlineCron()
    const n2 = await notifs()
    const logs2 = await q(`SELECT 1 FROM "MarketingLog" WHERE verb='deadline_warned' AND "entityId" = ANY($1)`, [ids])
    check(!second.error && n2.length === n1.length && logs2.length === 2, 'rodar de novo no mesmo dia não duplica aviso nem registro', `${n1.length} -> ${n2.length} avisos, alreadyWarned ${second.result?.alreadyWarned}`)
    // Sino do freelancer (sem empresa: o aviso da ala aparece sem x-company-id)
    const inbox = await fetch(`${API}/inbox?unread=true`, { headers: { authorization: `Bearer ${await token('freela')}` } })
    const list = await inbox.json().catch(() => [])
    const arr = Array.isArray(list) ? list : (list.items ?? list.data ?? [])
    check(inbox.status === 200 && arr.some((n) => (n.link ?? '').split('?')[0] === `/marketing/cards/${dl.id}`), 'o aviso aparece no sino (inbox) do freelancer', `${inbox.status}`)
    {
      const { ctx, page, bad: badRes } = await open(browser, 'nicolas', '/marketing', DESK)
      await page.waitForSelector('[data-section="atividade"]', { timeout: 8000 })
      const sys = page.locator('[data-section="atividade"] [data-verb="deadline_warned"]').first()
      check((await sys.count()) === 1 && (await sys.innerText()).startsWith('Nevo'), 'Atividade recente mostra o aviso assinado por "Nevo"')
      await shot(page, 'home-aviso-d1440.png')
      check(badRes.length === 0, 'sem 401/5xx', badRes.join(', '))
      await ctx.close()
    }
  }

  // ── B8: 375 sem rolagem lateral nas três telas ───────────────────────────
  if (want('b8')) {
    part = 'B8'
    const screens = [
      ['nicolas', '/marketing/calendario', 'cal-m375.png'],
      ['nicolas', '/marketing/calendario?vista=semana', 'cal-semana-m375.png'],
      ['nicolas', '/marketing/calendario?vista=lista', 'cal-lista-m375.png'],
      ['diretoria', '/marketing/calendario', 'cal-diretoria-m375.png'],
      ['leticia', '/marketing/links', 'links-m375.png'],
      ['freela', '/marketing/links', 'links-freela-m375.png'],
      ['leticia', '/marketing', 'home-m375.png'],
      ['marcel', '/marketing', 'home-marcel-m375.png'],
    ]
    for (const [who, route, file] of screens) {
      const { ctx, page, bad: badRes } = await open(browser, who, route, PHONE)
      await page.waitForSelector('.mk-layout__body > *', { timeout: 10000 }).catch(() => {})
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)
      const over = await noSideScroll(page)
      check(over.length === 0, `${route} (${who}): sem rolagem lateral em 375`, over.join('; '))
      if (route.includes('links')) {
        const reveal = page.locator('[data-action="reveal"]').first()
        if (await reveal.count()) {
          const h = await reveal.evaluate((el) => el.getBoundingClientRect().height)
          check(h >= 44, 'links: botão Revelar com 44px no celular', `${h}px`)
          await reveal.click()
          await page.waitForTimeout(600)
          const over2 = await noSideScroll(page)
          check(over2.length === 0, 'links: senha revelada não abre rolagem lateral', over2.join('; '))
        }
      }
      await shot(page, file, true)
      check(badRes.length === 0, 'sem 401/5xx', badRes.join(', '))
      await ctx.close()
    }
  }

  await browser.close()
  await db.end()
  part = 'fim'
  check(allBad.length === 0, 'nenhuma resposta 401/5xx em todo o roteiro', allBad.join(', '))
  console.log('\nResumo por critério:')
  for (const [k, v] of Object.entries(results)) if (v && typeof v.ok === 'number') console.log(`  ${k}: ${v.ok} OK, ${v.fail} FALHA`)
  console.log(fails ? `\n${fails} FALHA(S) de ${oks + fails}` : `\nTUDO OK (${oks} checagens)`)
  process.exit(fails ? 1 : 0)
})().catch(async (err) => {
  console.error(err)
  process.exit(2)
})
