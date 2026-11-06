// Ponta a ponta da "Ordem: Entrega | Manual" do board do mês: a ordem de
// entrega como padrão (atrasadas e "Hoje" no topo, sem data no fim), o lugar
// da data ao criar e ao trocar de coluna (arraste, lozenge do painel, folha do
// celular, ala Marketing), o índice que o servidor recebe no `PATCH /move`, o
// "Manual" continuando a reordenar e a escolha persistindo, o agrupado por
// pessoa, a Lista e o celular de 375px. Prints claro e escuro.
//
// Uso (cada agente com o seu banco, API e Vite; ver README.md):
//   API=http://127.0.0.1:3609 WEB=http://localhost:5179 HARNESS_DB=wf_board \
//   node board-entrega-e2e.cjs
//   ONLY=desktop|lanes|manual|marketing|celular|prints  roda uma parte
//   SHOTS=<pasta>  (padrão: prints/board-entrega)
// Precisa do banco do marketing-db.sh (o passo da ala lê o seed-marketing-out).
//
// O ORÁCULO é independente do front: a ordem esperada sai do banco (linhas da
// coluna por `position, createdAt`) com a regra reescrita aqui (dia UTC do
// prazo, nível de prioridade 0 a 4, ordem manual), e cada `PATCH /move` tem o
// corpo capturado para conferir a posição contra a coluna INTEIRA.
//
// Escreve só no banco do harness: cria as tarefas "E2E-ordem ..." (Nevo Studio
// e PetJourney, mês corrente) e o card "E2E-ordem ..." da ala, e no fim apaga
// os dois e devolve status, posição e `updatedAt` das tarefas que já existiam.
const { chromium } = require('playwright-core')
const pg = require('pg')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { randomUUID } = require('crypto')

const API = process.env.API ?? 'http://127.0.0.1:3599'
const WEB = process.env.WEB ?? 'http://localhost:5174'
const DB = process.env.HARNESS_DB ?? 'wf'
const PGPORT = process.env.PGPORT ?? '55432'
const ONLY = process.env.ONLY ?? ''
const SHOTS = process.env.SHOTS ?? path.join(__dirname, 'prints', 'board-entrega')
const PREFIX = 'E2E-ordem'
fs.mkdirSync(SHOTS, { recursive: true })
const part = (name) => !ONLY || ONLY.split(',').includes(name)

const results = []
function check(name, ok, extra = '') {
  const line = `${ok ? 'OK     ' : 'FALHOU '} ${name}${extra !== '' ? ' :: ' + String(extra).slice(0, 400) : ''}`
  results.push({ ok, line })
  console.log(line)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, timeout = 8000, step = 120) {
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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ── Datas pelo dia de Brasília (o do navegador do roteiro) ──────────────────
const todayBr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
function dateOnly(offset) {
  const [y, m, d] = todayBr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10)
}
/** Como a API grava: meio-dia UTC. */
const due = (offset) => (offset === null ? null : `${dateOnly(offset)}T12:00:00.000Z`)
const monthNumber = Number(todayBr.slice(5, 7))

// ── Oráculo (regra reescrita aqui, sem importar o front) ────────────────────
const dayOf = (d) => (d ? Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 864e5) : null)
const levelOf = (p) => {
  const n = Math.floor(Number(p))
  if (!Number.isFinite(n) || n <= 0) return 0
  return n >= 4 ? 4 : n
}
function keyCompare(a, b) {
  if (a.day !== b.day) {
    if (a.day === null) return 1
    if (b.day === null) return -1
    return a.day - b.day
  }
  return b.level - a.level
}
const keyOfRow = (r) => ({ day: dayOf(r.dueDate), level: levelOf(r.priorityNumber) })
const deliveryOrder = (rows) =>
  rows
    .map((r, i) => ({ r, i, k: keyOfRow(r) }))
    .sort((a, b) => keyCompare(a.k, b.k) || a.i - b.i)
    .map((x) => x.r.id)
/** Índice certo para o card entrar na coluna (sem ele): quantos vêm antes ou empatam. */
const expectedRank = (rowsWithout, card) => rowsWithout.filter((r) => keyCompare(keyOfRow(r), keyOfRow(card)) <= 0).length

// ── Login com cache (10 logins por minuto por processo da API) ──────────────
const CACHE = path.join(os.tmpdir(), 'nevo-harness-board-entrega-tokens.json')
async function stillValid(token, email) {
  try {
    const r = await fetch(API + '/user/me', { headers: { authorization: 'Bearer ' + token } })
    return r.ok && (await r.json())?.email === email
  } catch {
    return false
  }
}
async function login(email) {
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {}
  const key = `${API}|${email}`
  if (cache[key] && cache[key].exp > Date.now() && (await stillValid(cache[key].token, email))) return cache[key].token
  const r = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'nevo1234' }),
  }).then((res) => res.json())
  if (!r.accessToken) throw new Error('login falhou: ' + JSON.stringify(r))
  cache[key] = { token: r.accessToken, exp: Date.now() + 6 * 3600e3 }
  fs.writeFileSync(CACHE, JSON.stringify(cache))
  return r.accessToken
}

// ── Navegador ───────────────────────────────────────────────────────────────
const pageErrors = []
async function newContext(browser, token, company, { width = 1440, height = 900, mobile = false, theme = 'light' } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    reducedMotion: 'reduce',
  })
  await ctx.addInitScript(
    ([t, c, th]) => {
      localStorage.setItem('token', t)
      localStorage.setItem('activeCompany', c)
      localStorage.setItem('ui.theme', th)
      localStorage.setItem('onboarding.autoShown', '1')
      localStorage.setItem('onboarding.completed', '1')
      localStorage.setItem('ui.idlePermissionPrompt', 'done')
      localStorage.setItem('ui.timerSounds', 'false')
      localStorage.setItem('nevo.idle.protectionSnoozedUntil', String(Date.now() + 864e5))
    },
    [token, company, theme],
  )
  return ctx
}
async function open(ctx, route, name = route) {
  const page = await ctx.newPage()
  page.on('pageerror', (e) => pageErrors.push(`[${name}] ${e.message}`))
  /** Todo `PATCH /activity/:id/move` que a tela manda, com o corpo. */
  page.moves = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    const m = /^\/activity\/([^/]+)\/move$/.exec(u.pathname)
    if (r.method() === 'PATCH' && m) page.moves.push({ id: m[1], body: JSON.parse(r.postData() || '{}') })
  })
  await page.goto(WEB + route, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.addStyleTag({ content: '#__vue-devtools-container__{display:none!important}' }).catch(() => {})
  await sleep(700)
  return page
}
async function reload(page) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.addStyleTag({ content: '#__vue-devtools-container__{display:none!important}' }).catch(() => {})
  await page.waitForSelector('.card[data-id]', { timeout: 10000 })
  await sleep(500)
}
/** Ids na tela, de cima para baixo, numa coluna do board simples. */
const colIds = (page, status) =>
  page.evaluate(
    (s) => [...document.querySelectorAll(`.board [data-col="${s}"] .card[data-id]`)].map((e) => e.dataset.id).filter((id) => !id.startsWith('tmp:')),
    status,
  )
const box = async (locator) => {
  const b = await locator.boundingBox()
  if (!b) throw new Error('sem caixa: ' + locator)
  return b
}
async function mouseDrag(page, from, to, steps = 16) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
    await sleep(30)
  }
  await sleep(180)
  await page.mouse.up()
}
async function finger(page) {
  const cdp = await page.context().newCDPSession(page)
  const send = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  return {
    async hold(x, y, ms = 480) {
      await send('touchStart', x, y)
      await sleep(ms / 2)
      await send('touchMove', x + 2, y + 1)
      await sleep(ms / 2)
      await send('touchEnd')
    },
    async holdAndDrag(x, y, x2, y2, ms = 480, steps = 14) {
      await send('touchStart', x, y)
      await sleep(ms)
      for (let i = 1; i <= steps; i++) {
        await sleep(40)
        await send('touchMove', x + ((x2 - x) * i) / steps, y + ((y2 - y) * i) / steps)
      }
      await sleep(200)
      await send('touchEnd')
    },
  }
}
const pressed = (page, order) => page.locator(`.group-by [data-order="${order}"]`).getAttribute('aria-pressed')

;(async () => {
  const seedPath = path.join(__dirname, `seed-marketing-out.${DB}.json`)
  const seed = JSON.parse(fs.readFileSync(fs.existsSync(seedPath) ? seedPath : path.join(__dirname, `seed-out.${DB}.json`), 'utf8'))
  const U = seed.users
  const C = seed.companies
  const G = seed.groupId ?? null

  const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${PGPORT}/${DB}` })
  await db.connect()
  const q = (sql, p) => db.query(sql, p)
  const monthOf = async (company) =>
    (await q(`SELECT m.id FROM "Month" m JOIN "Quarter" q ON q.id=m."quarterId" WHERE q."companyId"=$1 AND m.number=$2`, [company, monthNumber])).rows[0].id
  const M = { nevo: await monthOf(C.nevo), pet: await monthOf(C.pet) }
  const rowsOf = async (month, status) =>
    (
      await q(
        `SELECT id, "dueDate", "priorityNumber", position FROM "Activity" WHERE "monthId"=$1 AND status=$2 AND "parentId" IS NULL ORDER BY position, "createdAt"`,
        [month, status],
      )
    ).rows
  const rowOf = async (id) => (await q(`SELECT id, status, position, "dueDate", "priorityNumber" FROM "Activity" WHERE id=$1`, [id])).rows[0]
  const manualIds = async (month, status) => (await rowsOf(month, status)).map((r) => r.id)
  const deliveryIds = async (month, status) => deliveryOrder(await rowsOf(month, status))

  // Limpa rodada anterior que tenha caído no meio.
  if (G) await q(`DELETE FROM "MarketingCard" WHERE "groupId"=$1 AND title LIKE $2`, [G, PREFIX + '%'])
  await q(`DELETE FROM "Activity" WHERE title LIKE $1`, [PREFIX + '%'])

  // Estado de antes (volta no fim, passe ou falhe).
  const snapshot = (await q(`SELECT id, status, position, "updatedAt" FROM "Activity" WHERE "monthId" = ANY($1)`, [[M.nevo, M.pet]])).rows
  const restore = async () => {
    if (G) await q(`DELETE FROM "MarketingCard" WHERE "groupId"=$1 AND title LIKE $2`, [G, PREFIX + '%']).catch(() => {})
    await q(`DELETE FROM "Activity" WHERE title LIKE $1 OR id = ANY($2)`, [PREFIX + '%', createdIds])
    for (const r of snapshot) {
      await q(`UPDATE "Activity" SET status=$2, position=$3, "updatedAt"=$4 WHERE id=$1`, [r.id, r.status, r.position, r.updatedAt])
    }
  }
  const createdIds = []

  // ── Cenário no Nevo Studio: ordem manual de propósito fora da ordem de entrega ──
  const id = () => 'c' + randomUUID().replace(/-/g, '').slice(0, 24)
  let minute = 0
  async function insert(title, status, position, offset, prio, who) {
    const aid = id()
    const created = new Date(Date.now() - (300 - minute++) * 60e3)
    const stamp = new Date(Date.now() - 3 * 864e5) // fora do "Atualizadas 24h"
    await q(
      `INSERT INTO "Activity"(id,title,description,"priorityNumber",status,position,"dueDate","monthId","parentId","createdAt","updatedAt") VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,NULL,$8,$9)`,
      [aid, `${PREFIX} ${title}`, prio, status, position, due(offset), M.nevo, created, stamp],
    )
    for (const u of who) await q(`INSERT INTO "ActivityResponsible"("userId","activityId") VALUES ($1,$2)`, [U[u], aid])
    return aid
  }
  const T = {
    fut: await insert('Futura +10 Baixa', 'TODO', 0, 10, 1, ['nicolas']),
    sda: await insert('Sem data Alta', 'TODO', 1, null, 3, ['leticia']),
    hb: await insert('Hoje Baixa', 'TODO', 2, 0, 1, ['nicolas']),
    atr: await insert('Atrasada 3d', 'TODO', 3, -3, 0, ['marcel']),
    hu: await insert('Hoje Urgente', 'TODO', 4, 0, 4, ['leticia']),
    sd: await insert('Sem data', 'TODO', 5, null, 0, ['nicolas']),
    ama: await insert('Amanha Media', 'TODO', 6, 1, 2, ['nicolas']),
    // Par empatado (mesmo dia e prioridade): é o que separa a conta certa da
    // ingênua no status em massa (ver o passo da Lista).
    ea: await insert('Empate A', 'TODO', 7, 2, 1, ['ana']),
    eb: await insert('Empate B', 'TODO', 8, 2, 1, ['ana']),
    p6: await insert('Andamento +6', 'IN_PROGRESS', 0, 6, 2, ['leticia']),
    pm1: await insert('Andamento -1', 'IN_PROGRESS', 1, -1, 2, ['nicolas']),
    p2: await insert('Andamento +2', 'IN_PROGRESS', 2, 2, 0, ['marcel']),
    p12: await insert('Andamento +12', 'IN_PROGRESS', 3, 12, 2, ['nicolas']),
    e4: await insert('Em teste +4', 'IN_TESTING', 0, 4, 2, ['nicolas']),
    e0: await insert('Em teste hoje', 'IN_TESTING', 1, 0, 0, ['luis']),
    r5: await insert('Revisada +5', 'REVIEWED', 0, 5, 1, ['marcel']),
    ra: await insert('Revisada -2', 'REVIEWED', 1, -2, 1, ['marcel']),
    dsd: await insert('Concluida sem data', 'DONE', 0, null, 2, ['nicolas']),
    d5: await insert('Concluida -5', 'DONE', 1, -5, 0, ['leticia']),
  }
  const STATUSES = ['TODO', 'IN_PROGRESS', 'IN_TESTING', 'REVIEWED', 'DONE']

  const token = await login('nicolas@nevo.test')
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const board = `/tasks/${M.nevo}`

  try {
    // ════════════════════════════════════════════════════════════════════
    // 1. Computador: Entrega é o padrão
    // ════════════════════════════════════════════════════════════════════
    if (part('desktop')) {
      const ctx = await newContext(browser, token, C.nevo)
      const page = await open(ctx, board, 'desktop')
      await page.waitForSelector('.board [data-col="TODO"] .card[data-id]', { timeout: 15000 })

      check('padrão: URL sem "ordem" e "Entrega" marcado', !page.url().includes('ordem=') && (await pressed(page, 'due')) === 'true' && (await pressed(page, 'manual')) === 'false', page.url().replace(WEB, ''))
      for (const s of STATUSES) {
        const dom = await colIds(page, s)
        const exp = await deliveryIds(M.nevo, s)
        check(`padrão: ${s} na ordem de entrega`, same(dom, exp), `${dom.length} cards`)
      }
      const todoDom = await colIds(page, 'TODO')
      const todoManual = await manualIds(M.nevo, 'TODO')
      check('o cenário é de verdade: a ordem manual de A fazer é outra', !same(todoDom, todoManual))
      check('A fazer: atrasada no topo, depois as de hoje (Urgente antes de Baixa)', todoDom[0] === T.atr && todoDom[1] === T.hu && todoDom[2] === T.hb, todoDom.slice(0, 3).join(','))
      check('A fazer: sem data no fim (Alta antes de sem prioridade)', todoDom.at(-2) === T.sda && todoDom.at(-1) === T.sd)
      const labels = await page.evaluate(
        ([a, h]) => {
          const read = (id) => {
            const el = document.querySelector(`.card[data-id="${id}"] .mi[title^="Prazo:"]`)
            return { text: el?.textContent?.trim() ?? '', late: !!el?.classList.contains('mi--late') }
          }
          return { atr: read(a), hoje: read(h) }
        },
        [T.atr, T.hu],
      )
      check('o card do topo mostra "Atrasada 3d" em vermelho', labels.atr.text === 'Atrasada 3d' && labels.atr.late, JSON.stringify(labels.atr))
      check('o segundo mostra "Hoje" em vermelho', labels.hoje.text === 'Hoje' && labels.hoje.late, JSON.stringify(labels.hoje))
      const head = await page.evaluate(() => {
        const h = document.querySelector('.board-head')
        const first = document.querySelector('.board .card[data-id]')
        const g = [...document.querySelectorAll('.group-by')].map((x) => x.innerText.replace(/\s+/g, ' ').trim())
        const base = document.querySelector('.tasks-page').getBoundingClientRect().top
        return {
          h: Math.round(h.getBoundingClientRect().height),
          first: Math.round(first.getBoundingClientRect().top - base),
          toolbar: Math.round(document.querySelector('.board-toolbar').getBoundingClientRect().top - base),
          text: h.innerText,
          groups: g,
        }
      })
      check('1440: cabeçalho numa linha, toolbar em 50px e 1º card nos mesmos 124px', head.h <= 32 && head.toolbar === 50 && head.first === 124, JSON.stringify({ h: head.h, toolbar: head.toolbar, first: head.first }))
      check('1440: "Agrupar Nenhum Pessoa" e "Ordem Entrega Manual" lado a lado', head.groups.join(' / ') === 'Agrupar Nenhum Pessoa / Ordem Entrega Manual', head.groups.join(' / '))
      check('sem travessão no cabeçalho', !head.text.includes('—'))
      await page.screenshot({ path: path.join(SHOTS, 'entrega-d1440-claro.png') })

      // "Ordenar por prioridade" volta para a ordem de ENTREGA.
      await page.locator('[data-col="TODO"] .lane__btn[aria-label="Mais ações de A fazer"]').click()
      await page.locator('.task-lane-menu .dd-item', { hasText: 'Ordenar por prioridade' }).click()
      await sleep(300)
      await page.locator('[data-col="TODO"] .lane__btn[aria-label="Mais ações de A fazer"]').click()
      const back = await page.locator('.task-lane-menu .dd-item', { hasText: 'Voltar à ordem' }).innerText()
      check('coluna ordenada por prioridade oferece "Voltar à ordem de entrega"', back.trim() === 'Voltar à ordem de entrega', back)
      await page.locator('.task-lane-menu .dd-item', { hasText: 'Voltar à ordem' }).click()
      await sleep(300)
      check('e volta mesmo', same(await colIds(page, 'TODO'), await deliveryIds(M.nevo, 'TODO')))

      // Arrastar DENTRO da coluna não reordena nem grava.
      const before = await manualIds(M.nevo, 'TODO')
      const domBefore = await colIds(page, 'TODO')
      const movesBefore = page.moves.length
      const b0 = await box(page.locator(`.card[data-id="${domBefore[0]}"]`))
      const b2 = await box(page.locator(`.card[data-id="${domBefore[2]}"]`))
      await mouseDrag(page, { x: b0.x + b0.width / 2, y: b0.y + 16 }, { x: b2.x + b2.width / 2, y: b2.y + b2.height * 0.8 })
      await sleep(900)
      check('Entrega: arrastar dentro da coluna não reordena a tela', same(await colIds(page, 'TODO'), domBefore))
      check('Entrega: e não manda PATCH /move', page.moves.length === movesBefore, `${page.moves.length - movesBefore} pedidos`)
      check('Entrega: a ordem manual no banco ficou igual', same(await manualIds(M.nevo, 'TODO'), before))

      // Arrastar para OUTRA coluna, com "Só minhas" ligado: soltar no TOPO de
      // Em andamento e o card cair no lugar da data na coluna inteira.
      await page.locator('.board-toolbar .chip', { hasText: 'Só minhas' }).click()
      await waitFor(async () => page.url().includes('minhas=1'))
      await sleep(400)
      const progRows = await rowsOf(M.nevo, 'IN_PROGRESS')
      const want = expectedRank(progRows, await rowOf(T.fut))
      const visibleProg = await colIds(page, 'IN_PROGRESS')
      check('filtro esconde cards de Em andamento (o índice visível não serve)', visibleProg.length < progRows.length, `${visibleProg.length}/${progRows.length}`)
      const src = await box(page.locator(`.card[data-id="${T.fut}"]`))
      const top = await box(page.locator(`[data-col="IN_PROGRESS"] .card[data-id="${visibleProg[0]}"]`))
      const n0 = page.moves.length
      await mouseDrag(page, { x: src.x + src.width / 2, y: src.y + 16 }, { x: top.x + top.width / 2, y: top.y + 6 })
      const sent = await waitFor(() => page.moves.slice(n0).find((m) => m.id === T.fut), 6000)
      check('arraste entre colunas manda um PATCH /move', !!sent)
      check('o servidor recebe a posição da DATA na coluna inteira (não o topo visível)', sent?.body?.position === want && sent?.body?.status === 'IN_PROGRESS', `enviado ${JSON.stringify(sent?.body)}, esperado ${want}`)
      await sleep(450)
      const afterDrop = await colIds(page, 'IN_PROGRESS')
      const expVisible = (await deliveryIds(M.nevo, 'IN_PROGRESS')).filter((x) => afterDrop.includes(x))
      check('o card aparece no lugar da data na coluna nova (filtrada)', same(afterDrop, expVisible) && afterDrop.includes(T.fut), afterDrop.join(','))
      const row = await rowOf(T.fut)
      check('banco: Em andamento, na posição da data', row.status === 'IN_PROGRESS' && (await manualIds(M.nevo, 'IN_PROGRESS')).indexOf(T.fut) === want, `${row.status} idx ${(await manualIds(M.nevo, 'IN_PROGRESS')).indexOf(T.fut)}`)
      await sleep(2800)
      check('sem pular depois do eco do realtime e do refetch', same(await colIds(page, 'IN_PROGRESS'), afterDrop))
      await reload(page)
      check('sem pular depois de recarregar', same(await colIds(page, 'IN_PROGRESS'), afterDrop))
      await page.locator('.board-toolbar .chip', { hasText: 'Só minhas' }).click()
      await waitFor(async () => !page.url().includes('minhas=1'))
      await sleep(400)
      check('sem filtro: a coluna inteira na ordem de entrega', same(await colIds(page, 'IN_PROGRESS'), await deliveryIds(M.nevo, 'IN_PROGRESS')))

      // Criar pelo formulário: prazo amanhã, prioridade Alta, em A fazer.
      const todoRowsBefore = await rowsOf(M.nevo, 'TODO')
      const created = { dueDate: new Date(due(1)), priorityNumber: 3 }
      const wantNew = expectedRank(todoRowsBefore, created)
      const n1 = page.moves.length
      const postWait = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/activity', { timeout: 15000 })
      await page.locator('.board-head .btn--primary', { hasText: 'Nova tarefa' }).click()
      const dlg = page.locator('[role="dialog"]')
      await dlg.locator('[placeholder="O que precisa ser feito?"]').fill(`${PREFIX} Criada amanha Alta`)
      await dlg.locator('.prio-chip', { hasText: 'Alta' }).click()
      await dlg.locator('input[type="date"]').fill(dateOnly(1))
      await dlg.locator('button', { hasText: 'Criar tarefa' }).click()
      const createdRes = await postWait
      const newId = (await createdRes.json()).id
      createdIds.push(newId)
      const moveNew = await waitFor(() => page.moves.slice(n1).find((m) => m.id === newId), 8000)
      check('criar pelo formulário: o servidor recebe a posição da data', moveNew?.body?.position === wantNew && moveNew?.body?.status === 'TODO', `enviado ${JSON.stringify(moveNew?.body)}, esperado ${wantNew}`)
      await waitFor(async () => (await colIds(page, 'TODO')).includes(newId), 8000)
      await sleep(600)
      const todoAfter = await colIds(page, 'TODO')
      check('criada aparece no lugar da data (entre as de hoje e as de depois)', same(todoAfter, await deliveryIds(M.nevo, 'TODO')) && todoAfter.indexOf(newId) === todoAfter.indexOf(T.hb) + 1, todoAfter.indexOf(newId))
      check('banco: criada na posição da data', (await manualIds(M.nevo, 'TODO')).indexOf(newId) === wantNew)
      await sleep(2000)
      check('criada: sem pular depois do refetch', same(await colIds(page, 'TODO'), todoAfter))

      // Criar inline ("Criar" no rodapé): sem prazo, então o fim é o lugar dela.
      const n2 = page.moves.length
      const qPost = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/activity', { timeout: 15000 })
      await page.locator('[data-create="TODO"]').click()
      await page.locator('.quick__field').fill(`${PREFIX} Inline sem data`)
      await page.keyboard.press('Enter')
      const pendingLast = await waitFor(async () => page.evaluate(() => [...document.querySelectorAll('.board [data-col="TODO"] .card[data-id]')].at(-1)?.dataset.id?.startsWith('tmp:')), 3000)
      check('inline: o card otimista aparece no fim (sem data)', !!pendingLast)
      const qId = (await (await qPost).json()).id
      createdIds.push(qId)
      await waitFor(() => page.moves.slice(n2).find((m) => m.id === qId), 8000)
      await page.keyboard.press('Escape')
      await sleep(800)
      const todoQ = await colIds(page, 'TODO')
      check('inline: a tarefa real fica no fim, sem pular', todoQ.at(-1) === qId && same(todoQ, await deliveryIds(M.nevo, 'TODO')))
      check('banco: inline no fim da ordem manual', (await manualIds(M.nevo, 'TODO')).at(-1) === qId)

      // Lozenge do painel: "Hoje Baixa" para Em teste.
      const testRows = await rowsOf(M.nevo, 'IN_TESTING')
      const wantHb = expectedRank(testRows, await rowOf(T.hb))
      const n3 = page.moves.length
      await page.locator(`.card[data-id="${T.hb}"] .card__meta`).click()
      await page.waitForSelector('.lozenge', { timeout: 10000 })
      await sleep(500)
      await page.locator('.lozenge').click()
      await page.locator('.task-panel-menu [role="menuitemradio"]', { hasText: 'Em teste' }).click()
      const moveHb = await waitFor(() => page.moves.slice(n3).find((m) => m.id === T.hb), 8000)
      check('lozenge: o servidor recebe a posição da data (não o fim)', moveHb?.body?.position === wantHb && moveHb?.body?.status === 'IN_TESTING', `enviado ${JSON.stringify(moveHb?.body)}, esperado ${wantHb} (fim seria ${testRows.length})`)
      await sleep(500)
      const testDom = await colIds(page, 'IN_TESTING')
      check('lozenge: o card aparece no lugar da data em Em teste', same(testDom, await deliveryIds(M.nevo, 'IN_TESTING')) && testDom.includes(T.hb), testDom.join(','))
      await page.keyboard.press('Escape')
      await sleep(2600)
      check('lozenge: sem pular depois do eco e do refetch', same(await colIds(page, 'IN_TESTING'), testDom))
      check('banco: lozenge na posição da data', (await manualIds(M.nevo, 'IN_TESTING')).indexOf(T.hb) === wantHb)
      await page.screenshot({ path: path.join(SHOTS, 'entrega-d1440-depois-dos-movimentos.png') })

      // A Lista segue a mesma ordem.
      await page.locator('.board-head .views__btn', { hasText: 'Lista' }).click()
      await page.waitForSelector('.list .row[data-id]', { timeout: 10000 })
      await sleep(400)
      const list = await page.evaluate(() =>
        [...document.querySelectorAll('.list .grp')].map((g) => ({
          name: g.querySelector('.grp-h__name')?.textContent?.trim(),
          ids: [...g.querySelectorAll('.row[data-id]')].map((r) => r.dataset.id).filter((id) => !id.startsWith('tmp:')),
        })),
      )
      const label = { TODO: 'A fazer', IN_PROGRESS: 'Em andamento', IN_TESTING: 'Em teste', REVIEWED: 'Revisados', DONE: 'Concluído' }
      let listOk = true
      for (const s of STATUSES) {
        const g = list.find((x) => x.name === label[s])
        if (g && g.ids.length && !same(g.ids, await deliveryIds(M.nevo, s))) listOk = false
      }
      check('Lista: cada grupo na ordem de entrega', listOk && list.length >= 4)
      check('Lista: o controle "Ordem" fica à vista', await page.locator('.group-by [data-order="due"]').isVisible())

      // Status em massa (um `/move` por vez, pelo mesmo caminho do lozenge):
      // cada índice tem que ser o da coluna que o SERVIDOR tem naquela hora,
      // sem contar as selecionadas que a Lista já empurrou e ainda não gravou.
      const doneStart = await rowsOf(M.nevo, 'DONE')
      const nB = page.moves.length
      for (const tid of [T.atr, T.sda]) await page.locator(`.list .row[data-id="${tid}"] .cb`).click()
      await page.locator('.bulk .bulk__btn', { hasText: 'Status' }).click()
      await page.locator('.task-bulk-menu [role="menuitemradio"]', { hasText: 'Concluído' }).click()
      const bulkSent = await waitFor(() => {
        const ms = page.moves.slice(nB).filter((m) => m.id === T.atr || m.id === T.sda)
        return ms.length === 2 ? ms : null
      }, 10000)
      const sim = [...doneStart]
      const wantBulk = []
      for (const m of bulkSent ?? []) {
        const r = await rowOf(m.id)
        const at = expectedRank(sim, r)
        wantBulk.push(at)
        sim.splice(at, 0, r)
      }
      check('massa: cada /move recebe a posição da data na coluna do servidor', !!bulkSent && same(bulkSent.map((m) => m.body.position), wantBulk) && bulkSent.every((m) => m.body.status === 'DONE'), `enviado ${JSON.stringify(bulkSent?.map((m) => m.body.position))}, esperado ${JSON.stringify(wantBulk)}`)
      await sleep(1500)
      check('massa: banco igual à simulação (as duas no lugar da data)', same(await manualIds(M.nevo, 'DONE'), sim.map((r) => r.id)))

      // O par empatado para Em teste. Gravando A, a B já está na coluna da tela
      // mas não no servidor: se entrasse na conta (empate conta como "antes"),
      // A iria um lugar abaixo, depois de um card de data maior.
      const testStart = await rowsOf(M.nevo, 'IN_TESTING')
      const nE = page.moves.length
      for (const tid of [T.ea, T.eb]) await page.locator(`.list .row[data-id="${tid}"] .cb`).click()
      await page.locator('.bulk .bulk__btn', { hasText: 'Status' }).click()
      await page.locator('.task-bulk-menu [role="menuitemradio"]', { hasText: 'Em teste' }).click()
      const tieSent = await waitFor(() => {
        const ms = page.moves.slice(nE).filter((m) => m.id === T.ea || m.id === T.eb)
        return ms.length === 2 ? ms : null
      }, 10000)
      const simT = [...testStart]
      const wantTie = []
      for (const m of tieSent ?? []) {
        const r = await rowOf(m.id)
        const at = expectedRank(simT, r)
        wantTie.push(at)
        simT.splice(at, 0, r)
      }
      check('massa com empate: a selecionada ainda não gravada fica fora da conta', !!tieSent && same(tieSent.map((m) => m.body.position), wantTie), `enviado ${JSON.stringify(tieSent?.map((m) => m.body.position))}, esperado ${JSON.stringify(wantTie)}`)
      await sleep(1500)
      check('massa com empate: banco igual à simulação', same(await manualIds(M.nevo, 'IN_TESTING'), simT.map((r) => r.id)))
      await page.locator('.board-head .views__btn', { hasText: 'Board' }).click()
      await sleep(600)
      const doneDom = await colIds(page, 'DONE')
      const testDom2 = await colIds(page, 'IN_TESTING')
      check('massa: Concluído e Em teste na ordem de entrega no board', same(doneDom, await deliveryIds(M.nevo, 'DONE')) && same(testDom2, await deliveryIds(M.nevo, 'IN_TESTING')), `${doneDom.length}/${testDom2.length}`)
      await sleep(2200)
      check('massa: sem pular depois do refetch', same(await colIds(page, 'DONE'), doneDom) && same(await colIds(page, 'IN_TESTING'), testDom2))

      // Escuro.
      const dark = await newContext(browser, token, C.nevo, { theme: 'dark' })
      const dp = await open(dark, board, 'desktop-escuro')
      await dp.waitForSelector('.board .card[data-id]', { timeout: 15000 })
      await dp.screenshot({ path: path.join(SHOTS, 'entrega-d1440-escuro.png') })
      await dark.close()

      // 1280: cabeçalho compacto, ainda numa linha.
      const narrow = await newContext(browser, token, C.nevo, { width: 1280, height: 800 })
      const np = await open(narrow, board, 'desktop-1280')
      await np.waitForSelector('.board .card[data-id]', { timeout: 15000 })
      // O que a "Ordem" não pode fazer é crescer o cabeçalho: a toolbar começa
      // nos mesmos 50px (6 + 32 + 12). Se a toolbar quebra sozinha (depende de
      // quantos rostos e contagens a empresa tem), isso é dela e já era assim.
      const nh = await np.evaluate(() => {
        const base = document.querySelector('.tasks-page').getBoundingClientRect().top
        return {
          h: Math.round(document.querySelector('.board-head').getBoundingClientRect().height),
          labels: [...document.querySelectorAll('.group-by__label')].map((l) => getComputedStyle(l).display),
          toolbar: Math.round(document.querySelector('.board-toolbar').getBoundingClientRect().top - base),
        }
      })
      check('1280: cabeçalho numa linha (rótulos recolhidos) e a toolbar no mesmo lugar (50px)', nh.h <= 32 && nh.labels.every((d) => d === 'none') && nh.toolbar === 50, JSON.stringify(nh))
      await np.screenshot({ path: path.join(SHOTS, 'entrega-d1280-claro.png'), clip: { x: 0, y: 0, width: 1280, height: 420 } })
      await narrow.close()
      await ctx.close()
    }

    // ════════════════════════════════════════════════════════════════════
    // 2. Agrupar por pessoa
    // ════════════════════════════════════════════════════════════════════
    if (part('lanes')) {
      const ctx = await newContext(browser, token, C.nevo)
      const page = await open(ctx, `${board}?agrupar=pessoa`, 'agrupado')
      await page.waitForSelector('.swim .card[data-id]', { timeout: 15000 })
      const cells = async () =>
        page.evaluate(() =>
          [...document.querySelectorAll('.swim__lane')].flatMap((lane) =>
            [...lane.querySelectorAll('.swim__list')].map((l) => ({
              lane: lane.dataset.laneKey,
              col: l.dataset.navCol,
              ids: [...l.querySelectorAll('.card[data-id]')].map((c) => c.dataset.id),
            })),
          ),
        )
      let lanesOk = true
      let checked = 0
      for (const c of await cells()) {
        if (c.ids.length < 2) continue
        checked++
        const exp = (await deliveryIds(M.nevo, c.col)).filter((x) => c.ids.includes(x))
        if (!same(c.ids, exp)) lanesOk = false
      }
      check('agrupado: cada célula na ordem de entrega da coluna', lanesOk && checked >= 3, `${checked} células com 2+ cards`)
      await page.screenshot({ path: path.join(SHOTS, 'entrega-pessoa-d1440-claro.png') })

      // Arrastar na linha do Nicolas, de A fazer para Em teste, soltando no topo.
      const laneSel = `.swim__lane[data-lane-key="${U.nicolas}"]`
      const testRows = await rowsOf(M.nevo, 'IN_TESTING')
      const want = expectedRank(testRows, await rowOf(T.ama))
      const src = await box(page.locator(`${laneSel} .card[data-id="${T.ama}"]`))
      const dstFirst = page.locator(`${laneSel} .swim__list[data-nav-col="IN_TESTING"] .card[data-id]`).first()
      const dst = await box(dstFirst)
      const n0 = page.moves.length
      await mouseDrag(page, { x: src.x + src.width / 2, y: src.y + 16 }, { x: dst.x + dst.width / 2, y: dst.y + 6 })
      const sent = await waitFor(() => page.moves.slice(n0).find((m) => m.id === T.ama), 6000)
      check('agrupado: o servidor recebe a posição da data na coluna inteira', sent?.body?.position === want && sent?.body?.status === 'IN_TESTING', `enviado ${JSON.stringify(sent?.body)}, esperado ${want}`)
      await sleep(500)
      const cell = async () => page.evaluate((sel) => [...document.querySelectorAll(`${sel} .swim__list[data-nav-col="IN_TESTING"] .card[data-id]`)].map((c) => c.dataset.id), laneSel)
      const got = await cell()
      check('agrupado: o card cai no lugar da data dentro da linha', same(got, (await deliveryIds(M.nevo, 'IN_TESTING')).filter((x) => got.includes(x))) && got.includes(T.ama), got.join(','))
      await sleep(2600)
      check('agrupado: sem pular depois do eco e do refetch', same(await cell(), got))
      // Dentro da célula não reordena.
      const todoCell = async () => page.evaluate((sel) => [...document.querySelectorAll(`${sel} .swim__list[data-nav-col="TODO"] .card[data-id]`)].map((c) => c.dataset.id), laneSel)
      const tc = await todoCell()
      if (tc.length >= 2) {
        const a = await box(page.locator(`${laneSel} .card[data-id="${tc[0]}"]`))
        const b = await box(page.locator(`${laneSel} .card[data-id="${tc[1]}"]`))
        const n1 = page.moves.length
        await mouseDrag(page, { x: a.x + a.width / 2, y: a.y + 16 }, { x: b.x + b.width / 2, y: b.y + b.height * 0.85 })
        await sleep(900)
        check('agrupado: arrastar dentro da célula não reordena nem grava', same(await todoCell(), tc) && page.moves.length === n1)
      }
      const dark = await newContext(browser, token, C.nevo, { theme: 'dark' })
      const dp = await open(dark, `${board}?agrupar=pessoa`, 'agrupado-escuro')
      await dp.waitForSelector('.swim .card[data-id]', { timeout: 15000 })
      await dp.screenshot({ path: path.join(SHOTS, 'entrega-pessoa-d1440-escuro.png') })
      await dark.close()
      await ctx.close()
    }

    // ════════════════════════════════════════════════════════════════════
    // 3. Manual: reordena arrastando e a escolha persiste
    // ════════════════════════════════════════════════════════════════════
    if (part('manual')) {
      const ctx = await newContext(browser, token, C.nevo)
      const page = await open(ctx, board, 'manual')
      await page.waitForSelector('.board .card[data-id]', { timeout: 15000 })
      await page.locator('.group-by [data-order="manual"]').click()
      await waitFor(async () => page.url().includes('ordem=manual'))
      await sleep(400)
      check('Manual: vai para a URL (ordem=manual) e fica marcado', page.url().includes('ordem=manual') && (await pressed(page, 'manual')) === 'true')
      const dom = await colIds(page, 'TODO')
      check('Manual: A fazer na ordem manual do banco', same(dom, await manualIds(M.nevo, 'TODO')))
      check('Manual: e ela é diferente da de entrega', !same(dom, await deliveryIds(M.nevo, 'TODO')))
      await page.screenshot({ path: path.join(SHOTS, 'manual-d1440-claro.png') })
      const a = await box(page.locator(`.card[data-id="${dom[0]}"]`))
      const b = await box(page.locator(`.card[data-id="${dom[1]}"]`))
      const n0 = page.moves.length
      await mouseDrag(page, { x: a.x + a.width / 2, y: a.y + 16 }, { x: b.x + b.width / 2, y: b.y + b.height * 0.85 })
      const sent = await waitFor(() => page.moves.slice(n0).find((m) => m.id === dom[0]), 6000)
      await sleep(600)
      const after = await colIds(page, 'TODO')
      check('Manual: arrastar dentro da coluna reordena (tela)', after[0] === dom[1] && after[1] === dom[0], `${dom.slice(0, 2)} -> ${after.slice(0, 2)}`)
      check('Manual: e grava (PATCH /move posição 1, banco igual à tela)', sent?.body?.position === 1 && same(await manualIds(M.nevo, 'TODO'), after), JSON.stringify(sent?.body))
      await reload(page)
      check('Manual: recarregar mantém a escolha (URL) e a ordem', page.url().includes('ordem=manual') && (await pressed(page, 'manual')) === 'true' && same(await colIds(page, 'TODO'), after))
      await page.locator('.month-nav button[aria-label^="Próximo mês"]').click()
      await waitFor(async () => !page.url().includes(M.nevo))
      check('Manual: o ‹ › leva a escolha para o outro mês', page.url().includes('ordem=manual'), page.url().replace(WEB, ''))
      await page.locator('.month-nav button[aria-label^="Mês anterior"]').click()
      await waitFor(async () => page.url().includes(M.nevo))
      await page.waitForSelector('.board .card[data-id]', { timeout: 10000 })
      // "Lembrar filtro": uma visita nova, sem nada na URL, volta em Manual.
      await page.locator('.board-toolbar .icon-toggle[aria-label="Lembrar filtro"]').click()
      await sleep(300)
      const stored = await page.evaluate((c) => JSON.parse(localStorage.getItem(`workflow:tasks-filter:v1:${c}`) || 'null'), C.nevo)
      check('Lembrar filtro guarda a ordem', stored?.order === 'manual', JSON.stringify(stored))
      await page.goto(WEB + board, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.board .card[data-id]', { timeout: 10000 })
      await waitFor(async () => page.url().includes('ordem=manual'), 4000)
      check('visita nova sem "ordem" na URL: volta em Manual pela memória (e a URL mostra)', page.url().includes('ordem=manual') && (await pressed(page, 'manual')) === 'true' && same(await colIds(page, 'TODO'), after))
      await page.locator('.board-toolbar .icon-toggle[aria-label="Lembrar filtro"]').click()
      await sleep(300)
      await page.locator('.group-by [data-order="due"]').click()
      await waitFor(async () => !page.url().includes('ordem='))
      await sleep(400)
      check('voltar para Entrega: some da URL e a coluna volta à ordem de entrega', !page.url().includes('ordem=') && same(await colIds(page, 'TODO'), await deliveryIds(M.nevo, 'TODO')))
      // Sem memória, uma visita nova abre em Entrega (o padrão).
      const fresh = await newContext(browser, token, C.nevo)
      const fp = await open(fresh, board, 'manual-visita-nova')
      await fp.waitForSelector('.board .card[data-id]', { timeout: 10000 })
      check('sem memória: visita nova abre em Entrega', (await pressed(fp, 'due')) === 'true' && same(await colIds(fp, 'TODO'), await deliveryIds(M.nevo, 'TODO')))
      await fresh.close()
      const dark = await newContext(browser, token, C.nevo, { theme: 'dark' })
      const dp = await open(dark, `${board}?ordem=manual`, 'manual-escuro')
      await dp.waitForSelector('.board .card[data-id]', { timeout: 15000 })
      await dp.screenshot({ path: path.join(SHOTS, 'manual-d1440-escuro.png') })
      await dark.close()
      await ctx.close()
    }

    // ════════════════════════════════════════════════════════════════════
    // 4. Ala Marketing (grava no FIM da coluna): a tela põe no lugar da data
    // ════════════════════════════════════════════════════════════════════
    if (part('marketing')) {
      if (!G) {
        check('ala Marketing: precisa do seed-marketing-out do banco', false, seedPath)
      } else {
        const tok = { marcel: await login('marcel@nevo.test'), leticia: await login('leticia@nevo.test') }
        const api = async (t, method, route, body, headers = {}) => {
          const url = route.startsWith('/activity') ? API + route : `${API}/marketing/g/${G}${route}`
          const r = await fetch(url, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${t}`, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
          let data = null
          try {
            data = await r.json()
          } catch {}
          return { status: r.status, data }
        }
        const task = await api(token, 'POST', '/activity', { title: `${PREFIX} Post da ala (atrasada 2d)`, monthId: M.pet, status: 'IN_PROGRESS', responsibleUserIds: [U.marcel], dueDate: due(-2) }, { 'x-company-id': C.pet })
        check('ala: tarefa criada (Em andamento, atrasada 2d)', task.status === 201, task.status)
        const tid = task.data?.id
        if (tid) createdIds.push(tid)
        const card = await api(tok.marcel, 'POST', '/cards', { companyId: C.pet, title: `${PREFIX} card da ala`, kind: 'POST', status: 'IN_PRODUCTION' })
        const cid = card.data?.id
        await api(tok.marcel, 'PATCH', `/cards/${cid}`, { captions: { INSTAGRAM: 'Legenda do roteiro da ordem' }, networks: ['INSTAGRAM'] })
        await api(tok.marcel, 'POST', `/cards/${cid}/versions`, { assetIds: [] })
        const mv = await api(tok.marcel, 'POST', `/cards/${cid}/move`, { status: 'AWAITING_APPROVAL' })
        check('ala: card em Aguardando', card.status === 201 && mv.status === 200, `${card.status}/${mv.status}`)

        const ctx = await newContext(browser, token, C.pet)
        const page = await open(ctx, `/tasks/${M.pet}`, 'marketing')
        await page.waitForSelector('.board .card[data-id]', { timeout: 15000 })
        const link = await api(tok.marcel, 'POST', `/cards/${cid}/tasks`, { activityId: tid })
        const inTest = await waitFor(async () => (await colIds(page, 'IN_TESTING')).includes(tid), 8000)
        check('ala liga a tarefa: ela chega em Em teste na tela (realtime)', link.status === 201 && !!inTest, link.status)
        const manualT = await manualIds(M.pet, 'IN_TESTING')
        const dom = await colIds(page, 'IN_TESTING')
        check('banco: a ala gravou no FIM de Em teste', manualT.at(-1) === tid && manualT.length > 1, manualT.indexOf(tid))
        check('tela: o card fica no lugar da data (topo, atrasada), não no fim', same(dom, await deliveryIds(M.pet, 'IN_TESTING')) && dom[0] === tid, dom.join(','))
        await sleep(2500)
        check('ala: sem pular depois do refetch', same(await colIds(page, 'IN_TESTING'), dom))
        const ap = await api(tok.leticia, 'POST', `/cards/${cid}/approve`, {})
        const inDone = await waitFor(async () => (await colIds(page, 'DONE')).includes(tid), 8000)
        const manualD = await manualIds(M.pet, 'DONE')
        const domD = await colIds(page, 'DONE')
        check('ala aprova: Concluído, gravado no fim no banco', ap.status < 300 && !!inDone && manualD.at(-1) === tid, `${ap.status} idx ${manualD.indexOf(tid)}/${manualD.length}`)
        check('tela: em Concluído, no lugar da data (antes das sem data)', same(domD, await deliveryIds(M.pet, 'DONE')) && domD[0] === tid, domD.join(','))
        await reload(page)
        check('ala: recarregar mantém o lugar da data', same(await colIds(page, 'DONE'), domD))
        await ctx.close()
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // 5. Celular 375
    // ════════════════════════════════════════════════════════════════════
    if (part('celular')) {
      const ctx = await newContext(browser, token, C.nevo, { width: 375, height: 812, mobile: true })
      const page = await open(ctx, board, 'celular')
      const hand = await finger(page)
      await page.waitForSelector('.kb__tabs [role="tab"]', { timeout: 15000 })
      check('375: o controle "Ordem" não ocupa o topo (como o Agrupar)', !(await page.locator('.group-by [data-order="due"]').isVisible()))
      check('375: A fazer na ordem de entrega', same(await colIds(page, 'TODO'), await deliveryIds(M.nevo, 'TODO')))
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      check('375: nada rola de lado', over <= 0, over)
      await page.screenshot({ path: path.join(SHOTS, 'entrega-m375-claro.png') })

      // Segurar e arrastar dentro da coluna: em Entrega não reordena.
      const dom = await colIds(page, 'TODO')
      const n0 = page.moves.length
      const a = await box(page.locator(`[data-col="TODO"] .card[data-id="${dom[0]}"]`))
      const b = await box(page.locator(`[data-col="TODO"] .card[data-id="${dom[1]}"]`))
      await hand.holdAndDrag(a.x + a.width / 2, a.y + 20, a.x + a.width / 2, b.y + b.height * 0.8)
      await sleep(1200)
      if (await page.locator('.ms[role="dialog"]').count()) await page.keyboard.press('Escape')
      check('375: segurar e arrastar não reordena nem grava em Entrega', same(await colIds(page, 'TODO'), dom) && page.moves.length === n0, `${page.moves.length - n0} pedidos`)

      // Folha "Mover para": Hoje Urgente vai para Em andamento, no lugar da data.
      const progRows = await rowsOf(M.nevo, 'IN_PROGRESS')
      const want = expectedRank(progRows, await rowOf(T.hu))
      const hu = await box(page.locator(`[data-col="TODO"] .card[data-id="${T.hu}"]`))
      await hand.hold(hu.x + hu.width / 2, hu.y + 20)
      await waitFor(async () => (await page.locator('.ms[role="dialog"]').count()) > 0, 2500)
      const n1 = page.moves.length
      await page.locator('.ms__opt[data-move-to="IN_PROGRESS"]').tap()
      const sent = await waitFor(() => page.moves.slice(n1).find((m) => m.id === T.hu), 6000)
      check('375: a folha manda a posição da data (não o fim)', sent?.body?.position === want && sent?.body?.status === 'IN_PROGRESS', `enviado ${JSON.stringify(sent?.body)}, esperado ${want} (fim seria ${progRows.length})`)
      await page.locator('.kb__tabs [data-tab="IN_PROGRESS"]').tap()
      await sleep(800)
      const prog = await colIds(page, 'IN_PROGRESS')
      check('375: na aba Em andamento o card está no lugar da data', same(prog, await deliveryIds(M.nevo, 'IN_PROGRESS')) && prog.includes(T.hu), prog.indexOf(T.hu))
      await sleep(2400)
      check('375: sem pular depois do eco e do refetch', same(await colIds(page, 'IN_PROGRESS'), prog))
      await page.screenshot({ path: path.join(SHOTS, 'entrega-m375-em-andamento-claro.png') })
      // ?ordem=manual no celular: a ordem manual, e arrastar volta a reordenar.
      const man = await open(ctx, `${board}?ordem=manual`, 'celular-manual')
      await man.waitForSelector('.kb__tabs [role="tab"]', { timeout: 15000 })
      check('375 com ?ordem=manual: A fazer na ordem manual', same(await colIds(man, 'TODO'), await manualIds(M.nevo, 'TODO')))
      await ctx.close()

      const dark = await newContext(browser, token, C.nevo, { width: 375, height: 812, mobile: true, theme: 'dark' })
      const dp = await open(dark, board, 'celular-escuro')
      await dp.waitForSelector('.kb__tabs [role="tab"]', { timeout: 15000 })
      await dp.screenshot({ path: path.join(SHOTS, 'entrega-m375-escuro.png') })
      await dark.close()
    }

    check('nenhum erro de página', pageErrors.length === 0, pageErrors.join(' | '))
  } catch (e) {
    check('roteiro sem exceção', false, e.stack || e.message)
  } finally {
    await browser.close().catch(() => {})
    await restore().catch((e) => console.log('restauração falhou: ' + e.message))
    const left = (await q(`SELECT count(*)::int n FROM "Activity" WHERE title LIKE $1`, [PREFIX + '%'])).rows[0].n
    console.log(`\nbanco devolvido (sobras "${PREFIX}": ${left})`)
    await db.end()
    const ok = results.filter((r) => r.ok).length
    console.log(`\n${ok}/${results.length} OK`)
    process.exitCode = ok === results.length ? 0 : 1
  }
})()
