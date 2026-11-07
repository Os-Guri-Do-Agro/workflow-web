// Roteiro de ponta a ponta da TAREFA DO NEVO ligada ao card (ala Marketing, R1,
// parte P3): critérios "Tarefa" da spec
// docs/specs/2026/q4/q4-2/ala-marketing/r1-acervo-tarefas-convite.md (D6 a D8),
// pela API, pelo banco e pela tela (Edge headless, 1440 e 375).
//
// Uso (cada agente com o seu banco, API e Vite):
//   API=http://127.0.0.1:3631 WEB=http://localhost:5183 HARNESS_DB=wf_r1c \
//   node marketing-tasks-e2e.cjs
// Pré-requisitos: banco do marketing-db.sh, a API (api-run.sh) e o Vite no ar.
//
// Escreve só no banco do harness: as tarefas e os cards "E2E ..." são
// recriados a cada rodada. Para simular falha ao mover, cria um gatilho no
// Postgres (só neste banco) e apaga no fim; para simular a produção sem a
// migration, renomeia a tabela MarketingCardTask e devolve o nome no fim.
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const pg = require('pg')

const API = process.env.API ?? 'http://127.0.0.1:3631'
const WEB = process.env.WEB ?? 'http://localhost:5183'
const DB = process.env.HARNESS_DB ?? 'wf_r1c'
const seed = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, process.env.HARNESS_SEED ?? `seed-marketing-out.${DB}.json`), 'utf8'),
)
const OUT = process.env.SHOTS ?? path.join(__dirname, 'prints', 'marketing-tasks')
fs.mkdirSync(OUT, { recursive: true })

const G = seed.groupId
const U = seed.users
const C = seed.companies

let fails = 0
const check = (crit, cond, msg, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} [${crit}] ${msg}${extra ? '  (' + String(extra).slice(0, 300) + ')' : ''}`)
  if (!cond) fails++
}
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

// ── Login com cache (a API limita 10 logins por minuto) ─────────────────────
const CACHE = path.join(os.tmpdir(), 'nevo-harness-r1c-tokens.json')
async function stillValid(token, email) {
  try {
    const r = await fetch(`${API}/user/me`, { headers: { authorization: `Bearer ${token}` } })
    return r.ok && (await r.json())?.email === email
  } catch {
    return false
  }
}
async function login(email) {
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {}
  const key = `${API}|${email}`
  const hit = cache[key]
  if (hit && hit.exp > Date.now() && (await stillValid(hit.token, email))) return hit.token
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'nevo1234' }),
  })
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`)
  const token = (await r.json()).accessToken
  cache[key] = { token, exp: Date.now() + 6 * 3600e3 }
  fs.writeFileSync(CACHE, JSON.stringify(cache))
  return token
}

// ── API ─────────────────────────────────────────────────────────────────────
const apiBad = []
async function api(token, method, route, body, headers = {}) {
  const url = route.startsWith('/marketing') || route.startsWith('/activity') || route.startsWith('/backlog')
    ? `${API}${route}`
    : `${API}/marketing/g/${G}${route}`
  const r = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try {
    data = await r.json()
  } catch {}
  if (r.status >= 500 || r.status === 401) apiBad.push(`${r.status} ${method} ${route}`)
  return { status: r.status, data }
}

// ── Navegador ───────────────────────────────────────────────────────────────
const DESK = { width: 1440, height: 900, mobile: false }
const PHONE = { width: 375, height: 812, mobile: true }
const allBad = []
const allErrors = []

async function newCtx(browser, token, vp, company) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.mobile ? 2 : 1,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    reducedMotion: 'reduce',
  })
  await ctx.addInitScript(
    ([t, c]) => {
      localStorage.setItem('token', t)
      if (c) localStorage.setItem('activeCompany', c)
      localStorage.setItem('ui.theme', 'light')
      localStorage.setItem('onboarding.autoShown', '1')
      localStorage.setItem('onboarding.completed', '1')
      localStorage.setItem('ui.idlePermissionPrompt', 'done')
      localStorage.setItem('ui.timerSounds', 'false')
      localStorage.setItem('nevo.idle.protectionSnoozedUntil', String(Date.now() + 864e5))
    },
    [token, company ?? null],
  )
  return ctx
}

async function open(ctx, route, who) {
  const page = await ctx.newPage()
  page.on('response', (res) => {
    const u = res.url()
    if (u.startsWith(API) && (res.status() === 401 || res.status() >= 500)) {
      allBad.push(`${who}: ${res.status()} ${res.request().method()} ${u.replace(API, '')}`)
    }
  })
  page.on('pageerror', (e) => allErrors.push(`${who}: ${e.message}`))
  await page.goto(WEB + route, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.addStyleTag({ content: '#__vue-devtools-container__{display:none!important}' }).catch(() => {})
  await sleep(400)
  return page
}

async function goto(page, route) {
  await page.goto(WEB + route, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await sleep(400)
}

const shot = (page, name, full = false) => page.screenshot({ path: path.join(OUT, name), fullPage: full })
const scrollWidth = (page) => page.evaluate(() => document.documentElement.scrollWidth)
const section = (page) => page.locator('[data-testid="card-tasks"]')
const itemText = (page) => section(page).locator('.mct__item').allInnerTexts().catch(() => [])

;(async () => {
  const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
  await db.connect()
  const q = async (sql, params) => (await db.query(sql, params)).rows
  const one = async (sql, params) => (await q(sql, params))[0]

  // ── Rodada limpa ──────────────────────────────────────────────────────────
  await q(`DROP TRIGGER IF EXISTS e2e_r1c_fail ON "Activity"`)
  await q(`DROP FUNCTION IF EXISTS e2e_r1c_fail()`)
  const renamed = await one(`SELECT to_regclass('"MarketingCardTask_off"') AS t`)
  if (renamed?.t) await q(`ALTER TABLE "MarketingCardTask_off" RENAME TO "MarketingCardTask"`)
  await q(`UPDATE "CompanyGroupCompany" SET "marketingEnabled"=true WHERE "groupId"=$1`, [G])
  await q(`DELETE FROM "MarketingCard" WHERE "groupId"=$1 AND title LIKE 'E2E Tarefa%'`, [G])
  await q(`DELETE FROM "Activity" WHERE title LIKE 'E2E %'`)

  const tok = {
    nicolas: await login('nicolas@nevo.test'),
    leticia: await login('leticia@nevo.test'),
    marcel: await login('marcel@nevo.test'),
    freela: await login('freela@nevo.test'),
    diretoria: await login('diretoria@nevo.test'),
    ana: await login('ana@nevo.test'),
  }

  // Mês corrente de cada empresa (o board do Nevo é por mês).
  const monthNumber = Number(new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', month: 'numeric' }).format(new Date()))
  const monthOf = async (companyId) =>
    (await one(`SELECT m.id FROM "Month" m JOIN "Quarter" q ON q.id=m."quarterId" WHERE q."companyId"=$1 AND m.number=$2`, [companyId, monthNumber])).id
  const M = { pet: await monthOf(C.pet), emmitec: await monthOf(C.emmitec) }

  // Tarefas Em andamento criadas pela API (o seed compartilhado fica como está).
  async function task(company, title, who = [U.marcel]) {
    const r = await api(tok.nicolas, 'POST', '/activity', { title, monthId: M[company], status: 'IN_PROGRESS', responsibleUserIds: who }, { 'x-company-id': C[company] })
    if (r.status !== 201) throw new Error(`criar tarefa ${title}: ${r.status} ${JSON.stringify(r.data)}`)
    return r.data.id
  }
  const T1 = await task('pet', 'E2E Post do Dia dos Pets no app', [U.marcel, U.nicolas])
  const T2 = await task('pet', 'E2E Banner da loja (falha simulada)')
  const T3 = await task('emmitec', 'E2E Painel EMMI em andamento')
  const T4 = await task('pet', 'E2E Tarefa que vai ser apagada')
  const T5 = await task('pet', 'E2E Folder da clínica (gráfica)')
  const T6 = await task('pet', 'E2E Legenda revisada')
  const status = async (id) => (await one(`SELECT status FROM "Activity" WHERE id=$1`, [id]))?.status

  // Cards: post só de texto (V1 sem arquivo, com legenda) já em Aguardando.
  async function awaitingCard(title, kind = 'POST') {
    const created = kind === 'PRINT'
      ? await api(tok.marcel, 'POST', '/print/cards', { companyId: C.pet, title })
      : await api(tok.marcel, 'POST', '/cards', { companyId: C.pet, title, kind, status: 'IN_PRODUCTION' })
    if (created.status !== 201) throw new Error(`card ${title}: ${created.status} ${JSON.stringify(created.data)}`)
    const id = created.data.id
    await api(tok.marcel, 'PATCH', `/cards/${id}`, { captions: { INSTAGRAM: `Legenda de ${title}` }, networks: ['INSTAGRAM'] })
    const v = await api(tok.marcel, 'POST', `/cards/${id}/versions`, { assetIds: [] })
    if (v.status !== 201) throw new Error(`versão ${title}: ${v.status} ${JSON.stringify(v.data)}`)
    const mv = await api(tok.marcel, 'POST', `/cards/${id}/move`, { status: 'AWAITING_APPROVAL' })
    if (mv.status !== 200) throw new Error(`mover ${title}: ${mv.status} ${JSON.stringify(mv.data)}`)
    return id
  }
  const A = await awaitingCard('E2E Tarefa: post do Dia dos Pets')
  const B = await awaitingCard('E2E Tarefa: banner (falha simulada)')
  const CC = await awaitingCard('E2E Tarefa: legenda depois de aprovada')
  const P = await awaitingCard('E2E Tarefa: folder impresso', 'PRINT')

  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    // ════════════════════════════════════════════════════════════════════
    // 1. Marcel liga a tarefa Em andamento ao card Aguardando: vai para Em teste
    // ════════════════════════════════════════════════════════════════════
    const mCtx = await newCtx(browser, tok.marcel, DESK, C.pet)
    const mPage = await open(mCtx, `/marketing/cards/${A}?grupo=${G}`, 'marcel')
    await section(mPage).waitFor({ timeout: 15000 })
    check('ligar', /Nenhuma tarefa ligada/.test(await section(mPage).innerText()), 'card sem tarefa mostra o vazio explicando o que faz')
    await shot(mPage, 'card-sem-tarefa-d1440.png')
    await mPage.click('[data-action="link-task"]')
    const list = mPage.locator('[data-testid="task-candidates"]')
    await list.waitFor({ timeout: 10000 })
    const firstRows = await list.locator('.mtp__row').allInnerTexts()
    check('ligar', firstRows.some((t) => t.includes('E2E Post do Dia dos Pets no app')) && firstRows.some((t) => t.includes('E2E Painel EMMI')),
      'o seletor lista tarefas Em andamento da PetJourney e da Emmitec (Marcel é das duas)', firstRows.length)
    check('ligar', !firstRows.some((t) => t.includes('Landing da campanha')), 'tarefa da Sentia (fora do grupo) não aparece')
    check('ligar', !firstRows.some((t) => t.includes('Validar CPF')), 'tarefa A fazer não aparece')
    const firstCompany = (await list.locator('.mtp__row').first().innerText()).includes('PetJourney')
    check('ligar', firstCompany, 'a marca do card (PetJourney) vem primeiro')
    check('ligar', /Novembro|Dezembro|Outubro|Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro/.test(firstRows[0] ?? ''), 'a linha mostra o mês da tarefa', firstRows[0])
    const faces = await list.locator(`[data-task="${T1}"] .mtp__faces > :not(.mtp__more)`).count()
    check('ligar', faces >= 1, 'a linha mostra os responsáveis (PersonAvatar)', faces)
    await shot(mPage, 'seletor-d1440.png')

    // Filtro por empresa (AppSelect): só a Emmitec.
    await mPage.locator('[data-testid="task-company-filter"] [role="combobox"]').click()
    await mPage.locator('[role="option"]', { hasText: 'Emmitec' }).click()
    const onlyEmmi = await waitFor(async () => {
      const rows = await list.locator('.mtp__row').allInnerTexts()
      return rows.length > 0 && rows.every((t) => t.includes('Emmitec')) ? rows : null
    })
    check('ligar', !!onlyEmmi, 'o filtro de empresa (AppSelect) deixa só a Emmitec', onlyEmmi?.length)
    await mPage.locator('[data-testid="task-company-filter"] [role="combobox"]').click()
    await mPage.locator('[role="option"]', { hasText: 'Todas as empresas' }).click()

    await mPage.fill('input[name="task-search"]', 'post do dia')
    const searched = await waitFor(async () => {
      const rows = await list.locator('.mtp__row').allInnerTexts()
      return rows.length === 1 && rows[0].includes('E2E Post do Dia dos Pets no app')
    })
    check('ligar', !!searched, 'a busca por título acha a tarefa (sem diferenciar maiúscula)')
    await mPage.click(`[data-task="${T1}"] [data-action="pick-task"]`)
    const linkedUi = await waitFor(async () => (await itemText(mPage)).some((t) => t.includes('E2E Post do Dia dos Pets no app') && t.includes('Em teste')))
    check('ligar', !!linkedUi, 'a tarefa aparece no card já em Em teste', (await itemText(mPage)).join(' | '))
    check('ligar', (await status(T1)) === 'IN_TESTING', 'banco: a tarefa foi para Em teste na hora (D6)', await status(T1))
    const log1 = await one(`SELECT id, "changedById", "previousStatus", "newStatus" FROM "ActivityLog" WHERE "activityId"=$1 ORDER BY "changedAt" DESC LIMIT 1`, [T1])
    check('ligar', log1?.id.startsWith('mkt_') && log1.changedById === U.marcel && log1.previousStatus === 'IN_PROGRESS',
      'histórico da tarefa: autor Marcel, origem ala Marketing', JSON.stringify(log1))
    const link1 = await one(`SELECT "lastSyncStatus", "lastSyncAt", "lastSyncError", "companyId", "linkedById" FROM "MarketingCardTask" WHERE "cardId"=$1 AND "activityId"=$2`, [A, T1])
    check('ligar', link1?.lastSyncStatus === 'IN_TESTING' && !!link1.lastSyncAt && !link1.lastSyncError && link1.companyId === C.pet && link1.linkedById === U.marcel,
      'banco: vínculo com lastSyncStatus, lastSyncAt e quem ligou', JSON.stringify(link1))
    const openHref = await section(mPage).locator('[data-action="open-task"]').first().getAttribute('href')
    check('ligar', openHref?.includes(`/tasks/${M.pet}`) && openHref.includes(`task=${T1}`) && openHref.includes(`company=${C.pet}`),
      '"Abrir no board" leva ao board do mês com a tarefa e a empresa (padrão do aviso)', openHref)
    await section(mPage).scrollIntoViewIfNeeded()
    await shot(mPage, 'card-com-tarefa-d1440.png')

    // ════════════════════════════════════════════════════════════════════
    // 2. Aprovar leva para Concluído, com o board aberto atualizando ao vivo
    // ════════════════════════════════════════════════════════════════════
    const nCtx = await newCtx(browser, tok.nicolas, DESK, C.pet)
    const board = await open(nCtx, `/tasks/${M.pet}`, 'nicolas-board')
    const inTest = await waitFor(async () => (await board.locator(`[data-col="IN_TESTING"] .card[data-id="${T1}"]`).count()) === 1, 15000)
    check('ao vivo', !!inTest, 'board do Nicolas mostra a tarefa em Em teste')
    await shot(board, 'board-antes-d1440.png')

    const lCtx = await newCtx(browser, tok.leticia, DESK, C.pet)
    const lPage = await open(lCtx, `/marketing/cards/${A}?grupo=${G}`, 'leticia')
    await lPage.click('[data-action="approve"]')
    await lPage.click('[data-action="confirm-approve"]')
    const approved = await waitFor(async () => (await lPage.locator('[data-testid="head-status"]').innerText()).includes('Aprovado'))
    check('aprovar', !!approved, 'Letícia aprova pela tela')
    check('aprovar', (await status(T1)) === 'DONE', 'banco: a tarefa foi para Concluído', await status(T1))
    const live = await waitFor(async () => (await board.locator(`[data-col="DONE"] .card[data-id="${T1}"]`).count()) === 1, 10000)
    check('ao vivo', !!live, 'o board do Nicolas (outra página, sem recarregar) leva a tarefa para Concluído')
    await shot(board, 'board-ao-vivo-concluido-d1440.png')
    // A página do Marcel também atualiza sozinha (marketing:changed).
    const marcelLive = await waitFor(async () => (await itemText(mPage)).some((t) => t.includes('Concluído')), 10000)
    check('ao vivo', !!marcelLive, 'o card aberto pelo Marcel atualiza a tarefa para Concluído sozinho')
    const log2 = await one(`SELECT id, "changedById" FROM "ActivityLog" WHERE "activityId"=$1 AND "newStatus"='DONE'`, [T1])
    check('aprovar', log2?.id.startsWith('mkt_') && log2.changedById === U.leticia, 'histórico: quem aprovou (Letícia) é o autor do movimento', JSON.stringify(log2))
    // Pelo id da tarefa no link (novo a cada rodada): o relógio do banco não entra na conta.
    const notifs = await q(`SELECT "userId", title, link FROM "Notification" WHERE type='ACTIVITY_STATUS' AND link LIKE $1 AND title LIKE '%Concluído%'`, [`%task=${T1}&%`])
    const expectedTitle = '"E2E Post do Dia dos Pets no app" mudou para Concluído pela ala Marketing'
    check('aprovar', notifs.length === 2 && notifs.every((n) => n.title === expectedTitle) && notifs.every((n) => n.link === `/tasks/${M.pet}?task=${T1}&company=${C.pet}`),
      'aviso aos responsáveis (Marcel e Nicolas) diz "pela ala Marketing"', JSON.stringify(notifs))
    const feed = await one(`SELECT summary FROM "FeedEvent" WHERE "entityId"=$1 AND "actorId"=$2 ORDER BY "createdAt" DESC LIMIT 1`, [T1, U.leticia])
    check('aprovar', feed?.summary === 'moveu "E2E Post do Dia dos Pets no app" para Concluído pela ala Marketing', 'feed da empresa com a origem', feed?.summary)
    const mlog = await one(`SELECT summary FROM "MarketingLog" WHERE "entityId"=$1 AND verb='task_moved' AND "actorId"=$2 ORDER BY "createdAt" DESC LIMIT 1`, [A, U.leticia])
    check('aprovar', /moveu a tarefa "E2E Post do Dia dos Pets no app" para Concluído/.test(mlog?.summary ?? ''), 'histórico do card registra o movimento da tarefa', mlog?.summary)

    // ════════════════════════════════════════════════════════════════════
    // 3. Histórico da tarefa no painel do Nevo: autor + "pela ala Marketing"
    // ════════════════════════════════════════════════════════════════════
    await goto(board, `/tasks/${M.pet}?task=${T1}`)
    const feedLines = await waitFor(async () => {
      const lines = await board.locator('.feed__item').allInnerTexts()
      return lines.some((l) => /Letícia\s+moveu de Em teste para Concluído\s+pela ala Marketing/.test(l)) ? lines : null
    })
    check('histórico', !!feedLines, 'painel da tarefa: "Letícia moveu de Em teste para Concluído pela ala Marketing"', (feedLines ?? []).join(' | '))
    check('histórico', !!feedLines?.some((l) => /Marcel\s+moveu de Em andamento para Em teste\s+pela ala Marketing/.test(l)), 'e "Marcel moveu de Em andamento para Em teste pela ala Marketing"')

    // ════════════════════════════════════════════════════════════════════
    // 4. "Cards de marketing" no painel da tarefa
    // ════════════════════════════════════════════════════════════════════
    const tmc = board.locator('[data-testid="task-marketing-cards"]')
    await tmc.waitFor({ timeout: 10000 }).catch(() => {})
    const tmcHref = await tmc.locator('a').first().getAttribute('href').catch(() => null)
    check('painel', tmcHref === `/marketing/cards/${A}?grupo=${G}`, 'Nicolas (membro da ala com a marca) vê o card com link e ?grupo=', tmcHref)
    check('painel', /Aprovado/.test(await tmc.innerText().catch(() => '')), 'o card aparece com o status da ala')
    await shot(board, 'painel-tarefa-cards-d1440.png')
    // Sem card ligado, a seção não aparece.
    await goto(board, `/tasks/${M.pet}?task=${T4}`)
    await board.locator('.feed__item').first().waitFor({ timeout: 10000 }).catch(() => {})
    await sleep(600)
    check('painel', (await board.locator('[data-testid="task-marketing-cards"]').count()) === 0, 'tarefa sem card: a seção não aparece')
    // Ana é da PetJourney, mas não é da ala: só a contagem, sem link.
    const aCtx = await newCtx(browser, tok.ana, DESK, C.pet)
    const aPage = await open(aCtx, `/tasks/${M.pet}?task=${T1}`, 'ana')
    const anaText = await waitFor(async () => (await aPage.locator('[data-testid="task-marketing-count"]').innerText()) || null, 10000)
    check('painel', anaText === 'Ligada a 1 card de marketing.', 'quem não é da ala vê só "Ligada a 1 card de marketing."', anaText)
    check('painel', (await aPage.locator('[data-testid="task-marketing-cards"] a').count()) === 0, 'sem link para quem não é da ala')
    await shot(aPage, 'painel-tarefa-so-contagem-d1440.png')
    const anaApi = await api(tok.ana, 'GET', `/marketing/tasks/${T1}/cards`, undefined, { 'x-company-id': C.pet })
    check('painel', anaApi.status === 200 && anaApi.data.total === 1 && anaApi.data.cards.length === 0, 'API: total 1 e nenhum card para quem não é da ala', JSON.stringify(anaApi.data))
    const luisApi = await api(await login('luis@nevo.test'), 'GET', `/marketing/tasks/${T1}/cards`, undefined, { 'x-company-id': C.pet })
    check('painel', luisApi.status === 403, 'quem não é da empresa da tarefa: 403 (regra do Nevo)', luisApi.status)
    await aCtx.close()

    // ════════════════════════════════════════════════════════════════════
    // 5. Versão nova volta o card para Aguardando (tarefa Em teste);
    //    pedir ajuste volta a tarefa para Em andamento
    // ════════════════════════════════════════════════════════════════════
    await goto(board, `/tasks/${M.pet}`)
    const v2 = await api(tok.marcel, 'POST', `/cards/${A}/versions`, { assetIds: [], note: 'V2 com a legenda nova' })
    check('versão', v2.status === 201 && v2.data.status === 'AWAITING_APPROVAL', 'V2 volta o card para Aguardando', v2.status)
    check('versão', (await status(T1)) === 'IN_TESTING', 'banco: a tarefa volta para Em teste com a versão nova', await status(T1))
    const backLive = await waitFor(async () => (await board.locator(`[data-col="IN_TESTING"] .card[data-id="${T1}"]`).count()) === 1, 10000)
    check('versão', !!backLive, 'o board atualiza ao vivo para Em teste')
    await goto(lPage, `/marketing/cards/${A}?grupo=${G}`)
    await lPage.click('[data-action="request-changes"]')
    await lPage.fill('textarea[name="body"]', 'Trocar a foto da capa')
    await lPage.click('[data-action="confirm-changes"]')
    const changes = await waitFor(async () => (await lPage.locator('[data-testid="head-status"]').innerText()).includes('Ajustes pedidos'))
    check('ajuste', !!changes, 'Letícia pede ajuste pela tela')
    check('ajuste', (await status(T1)) === 'IN_PROGRESS', 'banco: a tarefa volta para Em andamento', await status(T1))
    const progLive = await waitFor(async () => (await board.locator(`[data-col="IN_PROGRESS"] .card[data-id="${T1}"]`).count()) === 1, 10000)
    check('ajuste', !!progLive, 'o board atualiza ao vivo para Em andamento')
    await shot(lPage, 'card-ajuste-pedido-d1440.png')

    // ════════════════════════════════════════════════════════════════════
    // 6. Legenda mudada depois de aprovado; e a mesma faixa não atropela o board
    // ════════════════════════════════════════════════════════════════════
    const l6 = await api(tok.marcel, 'POST', `/cards/${CC}/tasks`, { activityId: T6 })
    check('legenda', l6.status === 201 && (await status(T6)) === 'IN_TESTING', 'ligar em Aguardando: tarefa Em teste', l6.status)
    await api(tok.leticia, 'POST', `/cards/${CC}/approve`, {})
    check('legenda', (await status(T6)) === 'DONE', 'aprovar: Concluído', await status(T6))
    const cap = await api(tok.marcel, 'PATCH', `/cards/${CC}`, { captions: { INSTAGRAM: 'Legenda corrigida depois de aprovada' } })
    check('legenda', cap.data?.status === 'AWAITING_APPROVAL' && (await status(T6)) === 'IN_TESTING', 'legenda nova derruba a aprovação: card Aguardando e tarefa Em teste', `${cap.data?.status} / ${await status(T6)}`)
    await api(tok.leticia, 'POST', `/cards/${CC}/approve`, {})
    // Alguém reabre a tarefa no board; agendar o post (mesma faixa do mapa) não a devolve para Concluído.
    await api(tok.nicolas, 'PATCH', `/activity/${T6}/move`, { status: 'IN_PROGRESS', position: 0 }, { 'x-company-id': C.pet })
    const publishAt = new Date(Date.now() + 5 * 864e5).toISOString()
    await api(tok.marcel, 'PATCH', `/cards/${CC}`, { publishAt })
    // Desde a R2, Agendado só pelo "Agendar publicação" (o /move dá 409); o agendar
    // também chama a sincronia da tarefa (Aprovado para Agendado, mesma faixa do mapa).
    const sch = await api(tok.marcel, 'POST', `/cards/${CC}/publications`, { items: [{ network: 'INSTAGRAM', mode: 'MANUAL' }] })
    const schCard = await api(tok.marcel, 'GET', `/cards/${CC}`)
    check('legenda', sch.status < 300 && schCard.data?.status === 'SCHEDULED' && (await status(T6)) === 'IN_PROGRESS', 'Aprovado para Agendado (pelo Agendar publicação) não atropela a tarefa reaberta no board', `${sch.status} ${schCard.data?.status} / ${await status(T6)}`)

    // ════════════════════════════════════════════════════════════════════
    // 7. Falha ao mover: aparece no card com "Tentar de novo"
    // ════════════════════════════════════════════════════════════════════
    const l2 = await api(tok.marcel, 'POST', `/cards/${B}/tasks`, { activityId: T2 })
    check('falha', l2.status === 201 && (await status(T2)) === 'IN_TESTING', 'card B ligado à tarefa (Em teste)', l2.status)
    await q(`CREATE OR REPLACE FUNCTION e2e_r1c_fail() RETURNS trigger AS $$
      BEGIN
        IF NEW.id IN ('${T2}', '${T5}') AND NEW.status = 'DONE' THEN RAISE EXCEPTION 'falha simulada do roteiro'; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`)
    await q(`CREATE TRIGGER e2e_r1c_fail BEFORE UPDATE ON "Activity" FOR EACH ROW EXECUTE FUNCTION e2e_r1c_fail()`)
    await goto(lPage, `/marketing/cards/${B}?grupo=${G}`)
    await lPage.click('[data-action="approve"]')
    await lPage.click('[data-action="confirm-approve"]')
    const approvedB = await waitFor(async () => (await lPage.locator('[data-testid="head-status"]').innerText()).includes('Aprovado'))
    check('falha', !!approvedB, 'a aprovação não é bloqueada pela falha da tarefa')
    const chip = lPage.locator('[data-testid="task-sync-error"]')
    const chipText = await waitFor(async () => (await chip.count()) ? await chip.innerText() : null, 10000)
    check('falha', /Não deu para mover a tarefa para Concluído\./.test(chipText ?? '') && /Tentar de novo/.test(chipText ?? ''), 'o card mostra a falha com "Tentar de novo"', chipText)
    check('falha', !/falha simulada|prisma|invocation/i.test(chipText ?? ''), 'a frase do card não é a mensagem crua do banco')
    const lb = await one(`SELECT "lastSyncError", "lastSyncStatus" FROM "MarketingCardTask" WHERE "cardId"=$1`, [B])
    check('falha', !!lb?.lastSyncError && lb.lastSyncStatus === 'IN_TESTING' && (await status(T2)) === 'IN_TESTING', 'banco: lastSyncError gravado, tarefa onde estava', JSON.stringify(lb))
    const failLog = await one(`SELECT summary FROM "MarketingLog" WHERE "entityId"=$1 AND verb='task_sync_failed' ORDER BY "createdAt" DESC LIMIT 1`, [B])
    check('falha', !!failLog, 'histórico do card registra a falha (MarketingLog)', failLog?.summary)
    await section(lPage).scrollIntoViewIfNeeded()
    await shot(lPage, 'card-falha-sync-d1440.png')
    await section(lPage).screenshot({ path: path.join(OUT, 'secao-falha-sync-d1440.png') })
    await q(`DROP TRIGGER IF EXISTS e2e_r1c_fail ON "Activity"`)
    await lPage.click('[data-action="retry-task"]')
    const cleared = await waitFor(async () => (await chip.count()) === 0, 10000)
    check('falha', !!cleared && (await status(T2)) === 'DONE', '"Tentar de novo" move a tarefa e o aviso some', await status(T2))
    const lb2 = await one(`SELECT "lastSyncError", "lastSyncStatus" FROM "MarketingCardTask" WHERE "cardId"=$1`, [B])
    check('falha', !lb2?.lastSyncError && lb2?.lastSyncStatus === 'DONE', 'banco: erro limpo e lastSyncStatus Concluído', JSON.stringify(lb2))
    await section(lPage).screenshot({ path: path.join(OUT, 'secao-tentar-de-novo-ok-d1440.png') })

    // ════════════════════════════════════════════════════════════════════
    // 8. Trilha da gráfica: a falha na aprovação se resolve ao enviar
    // ════════════════════════════════════════════════════════════════════
    await api(tok.marcel, 'POST', `/cards/${P}/tasks`, { activityId: T5 })
    await q(`CREATE TRIGGER e2e_r1c_fail BEFORE UPDATE ON "Activity" FOR EACH ROW EXECUTE FUNCTION e2e_r1c_fail()`)
    await api(tok.leticia, 'POST', `/cards/${P}/approve`, {})
    const lp = await one(`SELECT "lastSyncError" FROM "MarketingCardTask" WHERE "cardId"=$1`, [P])
    check('gráfica', !!lp?.lastSyncError && (await status(T5)) === 'IN_TESTING', 'peça aprovada com a tarefa presa (falha simulada)', await status(T5))
    await q(`DROP TRIGGER IF EXISTS e2e_r1c_fail ON "Activity"`)
    const prep = await api(tok.marcel, 'POST', `/print/cards/${P}/prepress`)
    for (const item of prep.data?.prepress?.items ?? []) await api(tok.marcel, 'PATCH', `/print/cards/${P}/prepress/${item.id}`, { done: true })
    const sent = await api(tok.marcel, 'POST', `/print/cards/${P}/status`, { status: 'SENT_TO_PRINTER' })
    const lp2 = await one(`SELECT "lastSyncError", "lastSyncStatus" FROM "MarketingCardTask" WHERE "cardId"=$1`, [P])
    check('gráfica', sent.status === 201 && (await status(T5)) === 'DONE' && !lp2?.lastSyncError, 'Enviar para a gráfica move a tarefa para Concluído (o caminho da trilha também sincroniza)', `${sent.status} / ${await status(T5)} / ${JSON.stringify(lp2)}`)

    // ════════════════════════════════════════════════════════════════════
    // 9. Freelancer (só da ala, sem empresa): vê o título, sem link
    // ════════════════════════════════════════════════════════════════════
    const fCtx = await newCtx(browser, tok.freela, DESK, null)
    const fPage = await open(fCtx, `/marketing/cards/${A}?grupo=${G}`, 'freela')
    await section(fPage).waitFor({ timeout: 15000 })
    const fText = await waitFor(async () => {
      const t = (await itemText(fPage)).join(' | ')
      return t.includes('E2E Post do Dia dos Pets no app') ? t : null
    })
    check('freelancer', !!fText && /Em andamento/.test(fText) && /PetJourney/.test(fText), 'vê título, status e empresa', fText)
    check('freelancer', (await section(fPage).locator('a[href*="/tasks/"]').count()) === 0, 'nenhum link para o board')
    check('freelancer', (await section(fPage).locator('.mct__item[data-open="0"] .mct__lock').count()) === 1, 'o cadeado explica que só quem é da empresa abre')
    const fApi = await api(tok.freela, 'GET', `/cards/${A}/tasks`)
    const fItem = fApi.data?.items?.[0] ?? {}
    check('freelancer', fApi.status === 200 && !('activityId' in fItem) && !('monthId' in fItem) && !('companyId' in fItem) && fItem.canOpen === false,
      'API: sem id navegável para quem não é da empresa', JSON.stringify(Object.keys(fItem)))
    await section(fPage).screenshot({ path: path.join(OUT, 'freelancer-secao-d1440.png') })
    // Regra D8 (API aa9e03c): sem UserCompany em nenhuma empresa do grupo, a API
    // devolve canLink: false e o botão "Ligar tarefa" nem aparece. O título da
    // tarefa já ligada continua à vista, sem link (conferido acima).
    check('freelancer', fApi.data?.canLink === false, 'API: canLink false para quem não é de nenhuma empresa do grupo', String(fApi.data?.canLink))
    check('freelancer', (await section(fPage).locator('[data-action="link-task"]').count()) === 0, 'o botão "Ligar tarefa" não aparece para o freelancer')
    check('freelancer', (await section(fPage).locator('[data-action="retry-task"]').count()) === 0, 'nem o "Tentar de novo" (não ligou, não é Admin nem da empresa)')
    await shot(fPage, 'freelancer-sem-ligar-d1440.png')
    await fCtx.close()

    // ════════════════════════════════════════════════════════════════════
    // 10. Permissões de ligar e desligar; empresa desligada do grupo
    // ════════════════════════════════════════════════════════════════════
    const noMember = await api(tok.leticia, 'POST', `/cards/${A}/tasks`, { activityId: T3 })
    check('permissão', noMember.status === 403, 'Letícia (Admin da ala, sem UserCompany na Emmitec) tenta ligar: 403', `${noMember.status} ${noMember.data?.message}`)
    const freelaLink = await api(tok.freela, 'POST', `/cards/${A}/tasks`, { activityId: T1 })
    check('permissão', freelaLink.status === 403, 'freelancer sem empresa tenta ligar: 403', freelaLink.status)
    const ghost = await api(tok.nicolas, 'POST', `/cards/${A}/tasks`, { activityId: 'nao-existe' })
    check('permissão', ghost.status === 403 && ghost.data?.message === noMember.data?.message, 'tarefa inexistente: o mesmo 403 (não revela)', ghost.status)
    const viewer = await api(tok.diretoria, 'POST', `/cards/${A}/tasks`, { activityId: T1 })
    check('permissão', viewer.status === 403, 'Visualizador não liga', viewer.status)
    const dup = await api(tok.marcel, 'POST', `/cards/${A}/tasks`, { activityId: T1 })
    check('permissão', dup.status === 409, 'a mesma tarefa duas vezes: 409', dup.status)
    const cand0 = await api(tok.nicolas, 'GET', `/tasks/candidates?cardId=${A}`)
    check('candidatas', cand0.status === 200 && cand0.data.items.some((i) => i.id === T3) && !cand0.data.items.some((i) => i.companyId === C.sentia),
      'Nicolas (é da Sentia também) não vê tarefa da Sentia, que não é do grupo')
    const off = await api(tok.nicolas, 'PATCH', `/marketing/g/${G}/companies/${C.emmitec}`, { marketingEnabled: false })
    const cand1 = await api(tok.marcel, 'GET', '/tasks/candidates')
    check('candidatas', off.status === 200 && cand1.status === 200 && !cand1.data.items.some((i) => i.id === T3) && !cand1.data.companies.some((c) => c.companyId === C.emmitec),
      'Emmitec desligada no grupo: a tarefa dela some das candidatas e do filtro', `${off.status} ${cand1.data?.items?.length}`)
    const offLink = await api(tok.marcel, 'POST', `/cards/${A}/tasks`, { activityId: T3 })
    check('candidatas', offLink.status === 403, 'e ligar tarefa da Emmitec desligada dá 403', offLink.status)
    await api(tok.nicolas, 'PATCH', `/marketing/g/${G}/companies/${C.emmitec}`, { marketingEnabled: true })
    const cand2 = await api(tok.marcel, 'GET', '/tasks/candidates')
    check('candidatas', cand2.data.items.some((i) => i.id === T3), 'religada, a tarefa volta')

    // Desligar: freelancer (não ligou, não é da empresa) não; quem ligou sim.
    const l4 = await api(tok.marcel, 'POST', `/cards/${A}/tasks`, { activityId: T4 })
    const link4 = l4.data?.items?.find((i) => i.activityId === T4)
    const fUnlink = await api(tok.freela, 'DELETE', `/cards/${A}/tasks/${link4?.id}`)
    check('desligar', fUnlink.status === 403, 'freelancer não desliga tarefa que não ligou', fUnlink.status)

    // ════════════════════════════════════════════════════════════════════
    // 11. Tarefa apagada no Nevo some do card sem erro
    // ════════════════════════════════════════════════════════════════════
    await goto(mPage, `/marketing/cards/${A}?grupo=${G}`)
    const hasT4 = await waitFor(async () => (await itemText(mPage)).some((t) => t.includes('E2E Tarefa que vai ser apagada')))
    check('apagada', !!hasT4, 'a segunda tarefa aparece no card (2 de 5)')
    const del = await api(tok.nicolas, 'DELETE', `/activity/${T4}`, undefined, { 'x-company-id': C.pet })
    check('apagada', del.status === 200, 'tarefa apagada no Nevo', del.status)
    const cascade = await one(`SELECT count(*)::int n FROM "MarketingCardTask" WHERE "activityId"=$1`, [T4])
    check('apagada', cascade.n === 0, 'banco: o vínculo saiu em cascata')
    await goto(mPage, `/marketing/cards/${A}?grupo=${G}`)
    await section(mPage).waitFor({ timeout: 10000 })
    await sleep(500)
    const after = (await itemText(mPage)).join(' | ')
    check('apagada', !after.includes('E2E Tarefa que vai ser apagada') && after.includes('E2E Post do Dia dos Pets no app'), 'a tarefa apagada some do card e a outra fica', after)
    check('apagada', (await section(mPage).locator('[role="alert"]').count()) === 0, 'sem erro na tela')

    // Desligar pela tela com confirmação.
    await mPage.click('[data-action="unlink-task"]')
    await mPage.getByRole('button', { name: 'Desligar', exact: true }).click()
    const unlinked = await waitFor(async () => /Nenhuma tarefa ligada/.test(await section(mPage).innerText()))
    check('desligar', !!unlinked, 'quem ligou desliga pela tela, com confirmação')
    check('desligar', (await status(T1)) === 'IN_PROGRESS', 'desligar não mexe na tarefa', await status(T1))
    // Liga de novo para as provas de celular.
    await api(tok.marcel, 'POST', `/cards/${A}/tasks`, { activityId: T1 })

    // ════════════════════════════════════════════════════════════════════
    // 12. Celular, 375px
    // ════════════════════════════════════════════════════════════════════
    const pCtx = await newCtx(browser, tok.marcel, PHONE, C.pet)
    const pPage = await open(pCtx, `/marketing/cards/${A}?grupo=${G}`, 'marcel-375')
    await section(pPage).waitFor({ timeout: 15000 })
    await section(pPage).scrollIntoViewIfNeeded()
    check('375', (await scrollWidth(pPage)) <= 375, 'card no celular sem rolagem lateral', await scrollWidth(pPage))
    const openBox = await section(pPage).locator('[data-action="open-task"]').first().boundingBox()
    check('375', !!openBox && openBox.height >= 43.5, '"Abrir no board" com alvo de 44px', openBox?.height)
    await section(pPage).screenshot({ path: path.join(OUT, 'card-tarefa-375.png') })
    await pPage.click('[data-action="link-task"]')
    await pPage.locator('[data-testid="task-candidates"], [data-testid="task-picker-empty"]').first().waitFor({ timeout: 10000 })
    check('375', (await scrollWidth(pPage)) <= 375, 'seletor no celular sem rolagem lateral', await scrollWidth(pPage))
    const pickBox = await pPage.locator('[data-action="pick-task"]').first().boundingBox()
    check('375', !!pickBox && pickBox.height >= 43.5, '"Ligar" com alvo de 44px', pickBox?.height)
    await shot(pPage, 'seletor-375.png')
    await pCtx.close()
    const npCtx = await newCtx(browser, tok.nicolas, PHONE, C.pet)
    const npPage = await open(npCtx, `/tasks/${M.pet}?task=${T1}`, 'nicolas-375')
    const tmcPhone = npPage.locator('[data-testid="task-marketing-cards"]')
    await tmcPhone.waitFor({ timeout: 15000 }).catch(() => {})
    await tmcPhone.scrollIntoViewIfNeeded().catch(() => {})
    check('375', (await tmcPhone.count()) === 1 && (await scrollWidth(npPage)) <= 375, 'painel da tarefa no celular mostra "Cards de marketing" sem rolagem lateral', await scrollWidth(npPage))
    await shot(npPage, 'painel-tarefa-375.png')
    await npCtx.close()

    // ════════════════════════════════════════════════════════════════════
    // 13. Produção antes da migration da R1: nada de 500
    // ════════════════════════════════════════════════════════════════════
    await q(`ALTER TABLE "MarketingCardTask" RENAME TO "MarketingCardTask_off"`)
    try {
      const l503 = await api(tok.marcel, 'GET', `/cards/${A}/tasks`)
      check('sem migration', l503.status === 503 && /instalada/.test(l503.data?.message ?? ''), 'lista do card: 503 "indisponível" em PT-BR', `${l503.status} ${l503.data?.message}`)
      const p503 = await api(tok.marcel, 'POST', `/cards/${A}/tasks`, { activityId: T6 })
      check('sem migration', p503.status === 503, 'ligar: 503', p503.status)
      const c503 = await api(tok.marcel, 'GET', `/tasks/candidates?cardId=${A}`)
      check('sem migration', c503.status === 503 || c503.status === 200, 'candidatas: sem 500', c503.status)
      const noCards = await api(tok.nicolas, 'GET', `/marketing/tasks/${T1}/cards`, undefined, { 'x-company-id': C.pet })
      check('sem migration', noCards.status === 200 && noCards.data.available === false, 'painel da tarefa: available false (a seção não aparece)', JSON.stringify(noCards.data))
      const mv = await api(tok.marcel, 'POST', `/cards/${A}/move`, { status: 'AWAITING_APPROVAL' })
      check('sem migration', mv.status === 200, 'mudar o status do card segue funcionando (sync é no-op)', mv.status)
      await goto(mPage, `/marketing/cards/${A}?grupo=${G}`)
      await mPage.locator('[data-testid="head-status"]').waitFor({ timeout: 10000 })
      await sleep(800)
      check('sem migration', (await section(mPage).count()) === 0, 'a seção "Tarefa no Nevo" some do card')
      await shot(mPage, 'card-sem-migration-d1440.png')
    } finally {
      await q(`ALTER TABLE "MarketingCardTask_off" RENAME TO "MarketingCardTask"`)
    }
  } finally {
    await q(`DROP TRIGGER IF EXISTS e2e_r1c_fail ON "Activity"`).catch(() => {})
    await q(`DROP FUNCTION IF EXISTS e2e_r1c_fail()`).catch(() => {})
    await q(`UPDATE "CompanyGroupCompany" SET "marketingEnabled"=true WHERE "groupId"=$1`, [G]).catch(() => {})
    await browser.close()
    await db.end()
  }

  // 503 da etapa "sem migration" é esperado; o resto tem que ser limpo.
  const bad = [...allBad, ...apiBad].filter((l) => !l.includes('503'))
  check('geral', bad.length === 0, 'zero 401 e zero 5xx (tela e API)', bad.join(' ; '))
  check('geral', allErrors.length === 0, 'zero erro de JavaScript na tela', allErrors.join(' ; '))
  console.log(`\n${fails ? `${fails} FALHA(S)` : 'TUDO OK'} (prints em ${OUT})`)
  process.exit(fails ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})
