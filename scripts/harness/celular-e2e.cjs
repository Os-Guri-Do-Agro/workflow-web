// Ponta a ponta do celular (spec v2-celular-roadmap-notas, C1, C2 e N1a), com toque
// de verdade: os gestos vão pelo CDP (`Input.dispatchTouchEvent`), que o
// Chromium trata como dedo na tela (rola, faz snap, dispara touch e clique),
// não por eventos sintéticos de JS, que o navegador não deixa rolar nada.
//
// O roteiro prepara e devolve o estado: guarda status e posição de todas as
// tarefas do mês e devolve no fim (passe ou falhe), e a nota de teste é criada
// e apagada por ele. Cada checagem imprime OK ou FALHOU.
//
// Uso (Git Bash, a partir de scripts/harness):
//   node celular-e2e.cjs            # tudo
//   ONLY=board node celular-e2e.cjs # só uma parte (board | desktop | notas | overflow | sessao)
//   SHOTS=<pasta> node celular-e2e.cjs  # guarda as capturas dos passos principais
//
// Precisa do harness no ar (Postgres embutido, API e Vite; ver README.md).
const { chromium } = require('playwright-core')
const pg = require('pg')
const fs = require('fs')
const os = require('os')
const path = require('path')

const API = process.env.API ?? 'http://127.0.0.1:3599'
const WEB = process.env.WEB ?? 'http://localhost:5174'
const PGPORT = process.env.PGPORT ?? '55432'
const ONLY = process.env.ONLY ?? ''
const SHOTS = process.env.SHOTS ?? ''

const results = []
function check(name, ok, extra = '') {
  const line = `${ok ? 'OK     ' : 'FALHOU '} ${name}${extra ? ' :: ' + extra : ''}`
  results.push(line)
  console.log(line)
}

// Token do cache só vale se a API ainda conhece a pessoa: o banco do harness é
// recriado com ids novos e o token antigo (ainda no prazo) não é de ninguém.
async function stillValid(token, email) {
  try {
    const r = await fetch(API + '/user/me', { headers: { authorization: 'Bearer ' + token } })
    if (!r.ok) return false
    const me = await r.json()
    return me?.email === email
  } catch {
    return false
  }
}

// ── Login com cache (o harness limita 10 logins por minuto por IP) ──────────
const CACHE = path.join(os.tmpdir(), 'nevo-harness-tokens.json')
async function login(email) {
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {}
  if (cache[email] && cache[email].exp > Date.now() && (await stillValid(cache[email].accessToken, email))) return cache[email].accessToken
  const r = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'nevo1234' }),
  }).then((res) => res.json())
  if (!r.accessToken) throw new Error('login falhou: ' + JSON.stringify(r))
  cache[email] = { accessToken: r.accessToken, exp: Date.now() + 6 * 3600e3 }
  fs.writeFileSync(CACHE, JSON.stringify(cache))
  return r.accessToken
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(fn, timeout = 6000, step = 100) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    last = await fn()
    if (last) return last
    await sleep(step)
  }
  return last
}

async function newContext(browser, token, company, { width = 375, height = 812, mobile = true } = {}) {
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
    ([t, c]) => {
      localStorage.setItem('token', t)
      localStorage.setItem('activeCompany', c)
      localStorage.setItem('ui.theme', 'light')
      localStorage.setItem('onboarding.autoShown', '1')
      localStorage.setItem('onboarding.completed', '1')
      localStorage.setItem('ui.idlePermissionPrompt', 'done')
      localStorage.setItem('ui.timerSounds', 'false')
      localStorage.setItem('nevo.idle.protectionSnoozedUntil', String(Date.now() + 864e5))
    },
    [token, company],
  )
  return ctx
}

async function open(ctx, route) {
  const page = await ctx.newPage()
  page.errors = []
  page.on('pageerror', (e) => page.errors.push(e.message))
  await page.goto(WEB + route, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.addStyleTag({ content: '#__vue-devtools-container__{display:none!important}' }).catch(() => {})
  await sleep(800)
  return page
}

// ── Dedo (CDP) ──────────────────────────────────────────────────────────────
async function finger(page) {
  const cdp = await page.context().newCDPSession(page)
  const send = (type, x, y) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  return {
    async swipe(x1, y1, x2, y2, steps = 10, total = 160) {
      await send('touchStart', x1, y1)
      for (let i = 1; i <= steps; i++) {
        await sleep(total / steps)
        await send('touchMove', x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps)
      }
      await send('touchEnd')
    },
    async hold(x, y, ms = 480) {
      await send('touchStart', x, y)
      // Um tremor de 2px no meio: dedo de gente não fica parado.
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
    async tap(x, y) {
      await send('touchStart', x, y)
      await sleep(60)
      await send('touchEnd')
    },
  }
}

async function center(locator) {
  const b = await locator.boundingBox()
  if (!b) throw new Error('sem caixa para ' + locator)
  return { x: b.x + b.width / 2, y: b.y + Math.min(b.height / 2, 24), box: b }
}

const activeTab = (page) =>
  page.evaluate(() => document.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-tab') ?? null)

const sheetOpen = (page) => page.evaluate(() => !!document.querySelector('.ms[role="dialog"]'))

/** Textos dos toasts à vista (o vue-sonner empilha; o mais novo vem primeiro). */
async function toastList(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent?.trim() ?? ''),
  )
}

// ── Banco ───────────────────────────────────────────────────────────────────
async function statusOf(db, id) {
  return (await db.query(`SELECT status, position FROM "Activity" WHERE id=$1`, [id])).rows[0]
}

;(async () => {
  const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${PGPORT}/${process.env.HARNESS_DB ?? 'wf'}` })
  await db.connect()
  const company = (await db.query(`SELECT id FROM "Company" WHERE name='PetJourney'`)).rows[0].id
  const month = (
    await db.query(
      `SELECT m.id FROM "Month" m JOIN "Quarter" q ON q.id=m."quarterId"
       WHERE q."companyId"=$1 AND m.name='Novembro'`,
      [company],
    )
  ).rows[0].id
  // Estado do mês antes de tudo: é o que volta no fim.
  // O `updatedAt` volta junto: sem ele o filtro "Atualizadas 24h" do board
  // contaria as tarefas que o roteiro mexeu.
  const snapshot = (
    await db.query(`SELECT id, status, position, "updatedAt" FROM "Activity" WHERE "monthId"=$1`, [month])
  ).rows
  const restore = async () => {
    for (const r of snapshot) {
      await db.query(`UPDATE "Activity" SET status=$2, position=$3, "updatedAt"=$4 WHERE id=$1`, [
        r.id,
        r.status,
        r.position,
        r.updatedAt,
      ])
    }
  }
  const byTitle = async (title) =>
    (await db.query(`SELECT id FROM "Activity" WHERE "monthId"=$1 AND title=$2`, [month, title])).rows[0].id

  const token = await login('nicolas@nevo.test')
  /** O que o roteiro criou e precisa apagar no fim (a nota de teste). */
  const cleanups = []
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const shotDir = SHOTS || null
  const shot = async (page, name) => {
    if (shotDir) await page.screenshot({ path: path.join(shotDir, name) })
  }

  try {
    // ════════════════════════════════════════════════════════════════════
    // C1. Board do mês no celular
    // ════════════════════════════════════════════════════════════════════
    if (!ONLY || ONLY === 'board') {
      const ctx = await newContext(browser, token, company)
      const page = await open(ctx, `/tasks/${month}`)
      const hand = await finger(page)
      await page.waitForSelector('.kb__tabs [role="tab"]', { timeout: 10000 })

      const tabs = await page.evaluate(() =>
        [...document.querySelectorAll('.kb__tabs [role="tab"]')].map((t) => ({
          col: t.getAttribute('data-tab'),
          label: t.querySelector('.col-tab__label')?.textContent?.trim() ?? '',
          count: Number(t.querySelector('.col-tab__count')?.textContent ?? -1),
          cards: document.querySelectorAll(`[data-col="${t.getAttribute('data-tab')}"] .card[data-id]`).length,
          h: t.getBoundingClientRect().height,
        })),
      )
      check(
        '375: abas com nome e contagem das 5 colunas',
        tabs.length === 5 && tabs.every((t) => t.count === t.cards && t.label.length > 2),
        tabs.map((t) => `${t.label} ${t.count}`).join(', '),
      )
      check('375: aba da coluna visível marcada (A fazer)', (await activeTab(page)) === 'TODO')
      const tabStyle = await page.evaluate(() => {
        const on = document.querySelector('.kb__tabs [aria-selected="true"]')
        const probe = document.createElement('span')
        probe.style.background = 'var(--accent-soft)'
        document.body.appendChild(probe)
        const soft = getComputedStyle(probe).backgroundColor
        probe.remove()
        return { bg: on ? getComputedStyle(on).backgroundColor : '', soft }
      })
      check('375: aba ativa usa --accent-soft', tabStyle.bg === tabStyle.soft, `${tabStyle.bg} / ${tabStyle.soft}`)
      const oneCol = await page.evaluate(() => {
        const board = document.querySelector('.board')
        const lanes = [...board.querySelectorAll(':scope > [data-col]')]
        const b = board.getBoundingClientRect()
        const visible = lanes.filter((l) => {
          const r = l.getBoundingClientRect()
          return r.right > b.left + 4 && r.left < b.right - 4
        })
        return { visible: visible.map((l) => l.dataset.col), w: lanes[0].getBoundingClientRect().width, bw: b.width }
      })
      check(
        '375: uma coluna por vez (só A fazer na tela, largura da fita)',
        oneCol.visible.length === 1 && oneCol.visible[0] === 'TODO' && Math.abs(oneCol.w - oneCol.bw) < 1,
        JSON.stringify(oneCol),
      )
      check(
        '375: sem dica "/" de teclado na busca',
        await page.evaluate(() => {
          const k = document.querySelector('.find .kbd')
          return !k || getComputedStyle(k).display === 'none'
        }),
      )
      await shot(page, 'board-m375.png')

      // Deslizar sobre um card: troca de coluna e o card fica onde estava.
      const cpfId = await byTitle('Validar CPF no cadastro do tutor')
      const before = await statusOf(db, cpfId)
      const cpf = page.locator(`[data-col="TODO"] .card[data-id="${cpfId}"]`)
      let c = await center(cpf)
      await hand.swipe(c.x + 120, c.y, c.x - 140, c.y + 6)
      await sleep(900)
      check('deslizar sobre o card troca para "Em andamento"', (await activeTab(page)) === 'IN_PROGRESS', await activeTab(page))
      const lanePos = await page.evaluate(() => {
        const board = document.querySelector('.board')
        const lane = board.querySelector('[data-col="IN_PROGRESS"]')
        return Math.round(lane.getBoundingClientRect().left - board.getBoundingClientRect().left)
      })
      check('a fita parou alinhada na coluna nova (snap)', Math.abs(lanePos) <= 1, `${lanePos}px`)
      const after = await statusOf(db, cpfId)
      const stillThere = await page.locator(`[data-col="TODO"] .card[data-id="${cpfId}"]`).count()
      check(
        'deslizar NÃO move o card (banco e tela)',
        after.status === before.status && after.position === before.position && stillThere === 1,
        `${before.status}/${before.position} -> ${after.status}/${after.position}`,
      )
      check('deslizar não abriu a tarefa', !page.url().includes('task='))

      // Tocar na aba leva à coluna.
      await page.locator('.kb__tabs [data-tab="DONE"]').tap()
      await sleep(700)
      const doneAt = await page.evaluate(() => {
        const board = document.querySelector('.board')
        const lane = board.querySelector('[data-col="DONE"]')
        return Math.round(lane.getBoundingClientRect().left - board.getBoundingClientRect().left)
      })
      check('tocar na aba "Concluído" leva à coluna', (await activeTab(page)) === 'DONE' && Math.abs(doneAt) <= 1, `${doneAt}px`)
      await page.locator('.kb__tabs [data-tab="TODO"]').tap()
      await sleep(700)

      // Segurar e soltar: folha "Mover para".
      c = await center(cpf)
      await hand.hold(c.x, c.y)
      const opened = await waitFor(() => sheetOpen(page), 2000)
      check('segurar e soltar abre a folha "Mover para"', !!opened)
      check('segurar não abriu a tarefa por baixo', !page.url().includes('task='), page.url().replace(WEB, ''))
      const sheetInfo = await page.evaluate(() => ({
        current: document.querySelector('.ms__opt--current')?.getAttribute('data-move-to'),
        heights: [...document.querySelectorAll('.ms__opt')].map((b) => Math.round(b.getBoundingClientRect().height)),
        focusIn: !!document.activeElement?.closest('.ms'),
        teleported: document.querySelector('.ms-scrim')?.parentElement === document.body,
      }))
      check('folha: coluna atual marcada', sheetInfo.current === 'TODO', sheetInfo.current)
      check('folha: alvos de 48px', sheetInfo.heights.length === 5 && sheetInfo.heights.every((h) => h >= 48), sheetInfo.heights.join(','))
      check('folha: Teleport para o body e foco dentro', sheetInfo.teleported && sheetInfo.focusIn)
      await shot(page, 'board-m375-folha.png')

      // Mover pela folha grava no banco.
      await page.locator('.ms__opt[data-move-to="IN_PROGRESS"]').tap()
      const moved = await waitFor(async () => (await statusOf(db, cpfId)).status === 'IN_PROGRESS', 5000)
      check('tocar em "Em andamento" move o card (banco: IN_PROGRESS)', !!moved, (await statusOf(db, cpfId)).status)
      check('a folha fecha depois de escolher', !(await sheetOpen(page)))
      check(
        'o card aparece na coluna nova',
        (await page.locator(`[data-col="IN_PROGRESS"] .card[data-id="${cpfId}"]`).count()) === 1,
      )

      // Esc e o fundo fecham; o foco volta para o card.
      const crashId = await byTitle('Crash ao abrir galeria no Android 14')
      const crash = page.locator(`.card[data-id="${crashId}"]`)
      c = await center(crash)
      await hand.hold(c.x, c.y)
      await waitFor(() => sheetOpen(page), 2000)
      await page.keyboard.press('Escape')
      await sleep(350)
      const focusBack = await page.evaluate(() => document.activeElement?.getAttribute('data-id'))
      check('Esc fecha a folha', !(await sheetOpen(page)))
      check('o foco volta para o card segurado', focusBack === crashId, String(focusBack))
      await hand.hold(c.x, c.y)
      await waitFor(() => sheetOpen(page), 2000)
      await hand.tap(187, 60)
      await sleep(350)
      check('tocar no fundo fecha a folha', !(await sheetOpen(page)))
      check('tocar no fundo não abriu nada atrás', !page.url().includes('task='))
      const crashNow = await statusOf(db, crashId)
      check('fechar a folha não move nada', crashNow.status === 'TODO', crashNow.status)

      // Revisados sem as três plataformas: recusado na folha com a mesma frase do menu.
      const pushId = await byTitle('Push de lembrete de vacina')
      await db.query(`DELETE FROM "ActivityTestCheck" WHERE "activityId"=$1`, [pushId])
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.addStyleTag({ content: '#__vue-devtools-container__{display:none!important}' }).catch(() => {})
      await page.waitForSelector('.kb__tabs [role="tab"]')
      await page.locator('.kb__tabs [data-tab="IN_TESTING"]').tap()
      await sleep(700)
      const push = page.locator(`[data-col="IN_TESTING"] .card[data-id="${pushId}"]`)
      c = await center(push)
      await hand.hold(c.x, c.y)
      await waitFor(() => sheetOpen(page), 2000)
      const hint = await page.evaluate(() => document.querySelector('#move-sheet-why-REVIEWED')?.textContent?.trim() ?? '')
      check('folha adianta o motivo embaixo de Revisados', hint.startsWith('Marque o teste em'), hint)
      await shot(page, 'board-m375-folha-revisados.png')
      await page.locator('.ms__opt[data-move-to="REVIEWED"]').tap()
      const sheetToasts = await waitFor(async () => {
        const list = await toastList(page)
        return list.length ? list : null
      }, 3000)
      await sleep(400)
      const pushAfterSheet = await statusOf(db, pushId)
      check('Revisados pela folha: recusado (banco segue IN_TESTING)', pushAfterSheet.status === 'IN_TESTING', pushAfterSheet.status)
      // O mesmo pedido pelo menu "…" do card, para comparar a frase. O toque vem
      // logo depois da folha: prova também que o primeiro toque não é engolido.
      await push.locator('.card__more').tap()
      await sleep(400)
      check('o "…" do card abre no primeiro toque depois da folha', (await page.locator('.task-card-menu').count()) === 1)
      await page.locator('.task-card-menu .dd-item', { hasText: 'Mover para Revisados' }).tap({ timeout: 5000 })
      const allToasts = await waitFor(async () => {
        const list = await toastList(page)
        return list.length > (sheetToasts?.length ?? 0) ? list : null
      }, 3000)
      const sheetMsg = sheetToasts?.[0] ?? ''
      const menuMsg = allToasts ? allToasts.find((t, i) => i !== allToasts.indexOf(sheetMsg)) ?? '' : ''
      check(
        'a recusa da folha tem a mesma mensagem do menu',
        !!sheetMsg && sheetMsg === menuMsg && sheetMsg === hint,
        `folha="${sheetMsg}" menu="${menuMsg}"`,
      )
      check('Revisados pelo menu: recusado também', (await statusOf(db, pushId)).status === 'IN_TESTING')
      await sleep(4500) // os toasts somem sozinhos

      // Segurar e arrastar reordena dentro da coluna. Desde a "Ordem: Entrega"
      // (padrão), reordenar na mão só existe no modo Manual (`?ordem=manual`).
      await page.goto(`${WEB}/tasks/${month}?ordem=manual`, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle').catch(() => {})
      await sleep(800)
      await page.locator('.kb__tabs [data-tab="TODO"]').tap()
      await sleep(700)
      const order = async () =>
        page.evaluate(() => [...document.querySelectorAll('[data-col="TODO"] .card[data-id]')].map((e) => e.dataset.id))
      const o1 = await order()
      const first = page.locator(`[data-col="TODO"] .card[data-id="${o1[0]}"]`)
      const second = page.locator(`[data-col="TODO"] .card[data-id="${o1[1]}"]`)
      const a = await center(first)
      const b = await second.boundingBox()
      await hand.holdAndDrag(a.x, a.y, a.x, b.y + b.height * 0.8)
      await sleep(1200)
      const o2 = await order()
      const dbOrder = (
        await db.query(`SELECT id, position FROM "Activity" WHERE id = ANY($1)`, [[o1[0], o1[1]]])
      ).rows.reduce((acc, r) => ({ ...acc, [r.id]: r.position }), {})
      check(
        'segurar e arrastar reordena dentro da coluna (tela e banco)',
        o2[0] === o1[1] && o2[1] === o1[0] && dbOrder[o1[0]] > dbOrder[o1[1]],
        `${o1.slice(0, 2).join(',')} -> ${o2.slice(0, 2).join(',')}`,
      )
      check('arrastar não abre a folha', !(await sheetOpen(page)))
      const allTodo = (await db.query(`SELECT count(*)::int n FROM "Activity" WHERE id = ANY($1) AND status='TODO'`, [o1])).rows[0].n
      check('arrastar no celular não troca a coluna de ninguém', allTodo === o1.length, `${allTodo}/${o1.length}`)
      check('board do mês sem erro de página', page.errors.length === 0, page.errors.join(' | '))
      await restore()
      await ctx.close()

      // ── Agrupado por pessoa no celular ──
      const ctx2 = await newContext(browser, token, company)
      const lanesPage = await open(ctx2, `/tasks/${month}?agrupar=pessoa`)
      const hand2 = await finger(lanesPage)
      await lanesPage.waitForSelector('.swim__tabs [role="tab"]', { timeout: 10000 })
      check('agrupado 375: abas no topo, A fazer marcada', (await activeTab(lanesPage)) === 'TODO')
      const swim = await lanesPage.evaluate(() => {
        const s = document.querySelector('.swim')
        const cols = new Set([...document.querySelectorAll('.swim__list')].map((l) => l.getAttribute('data-nav-col')))
        return { over: s.scrollWidth - s.clientWidth, cols: [...cols] }
      })
      check('agrupado 375: uma coluna por linha e nada rola de lado', swim.over <= 0 && swim.cols.join() === 'TODO', JSON.stringify(swim))
      await shot(lanesPage, 'board-m375-pessoa.png')
      const firstLaneCard = lanesPage.locator('.swim .card[data-id]').first()
      c = await center(firstLaneCard)
      await hand2.swipe(c.x + 110, c.y, c.x - 130, c.y + 4)
      await sleep(600)
      const swimCols = await lanesPage.evaluate(() => [
        ...new Set([...document.querySelectorAll('.swim__list')].map((l) => l.getAttribute('data-nav-col'))),
      ])
      check('agrupado: deslizar troca para "Em andamento"', (await activeTab(lanesPage)) === 'IN_PROGRESS' && swimCols.join() === 'IN_PROGRESS', swimCols.join())
      const inProg = lanesPage.locator('.swim .card[data-id]').first()
      const inProgId = await inProg.getAttribute('data-id')
      c = await center(inProg)
      await hand2.hold(c.x, c.y)
      check('agrupado: segurar abre a folha', !!(await waitFor(() => sheetOpen(lanesPage), 2000)))
      await lanesPage.keyboard.press('Escape')
      const inProgDb = await statusOf(db, inProgId)
      check('agrupado: nada mudou de status', inProgDb.status === 'IN_PROGRESS', inProgDb.status)
      check('agrupado sem erro de página', lanesPage.errors.length === 0, lanesPage.errors.join(' | '))
      await ctx2.close()

      // ── /board (várias empresas) no celular ──
      const ctx3 = await newContext(browser, token, company)
      const bp = await open(ctx3, '/board')
      const hand3 = await finger(bp)
      await bp.waitForSelector('.kanban-tabs [role="tab"]', { timeout: 10000 })
      check('/board 375: abas e A fazer marcada', (await activeTab(bp)) === 'TODO')
      const bpOne = await bp.evaluate(() => {
        const k = document.querySelector('.kanban')
        const lane = k.querySelector('[data-col="TODO"]')
        return Math.abs(lane.getBoundingClientRect().width - k.getBoundingClientRect().width) < 1
      })
      check('/board 375: uma coluna por vez', bpOne)
      await shot(bp, 'visao-geral-m375.png')
      const bcpf = bp.locator(`[data-col="TODO"] .card[data-id="${cpfId}"]`)
      await bcpf.scrollIntoViewIfNeeded()
      c = await center(bcpf)
      await hand3.swipe(c.x + 120, c.y, c.x - 140, c.y + 6)
      await sleep(900)
      check('/board: deslizar troca de coluna', (await activeTab(bp)) === 'IN_PROGRESS')
      check('/board: deslizar não move o card', (await statusOf(db, cpfId)).status === 'TODO')
      await bp.locator('.kanban-tabs [data-tab="TODO"]').tap()
      await sleep(700)
      c = await center(bcpf)
      await hand3.hold(c.x, c.y)
      check('/board: segurar e soltar abre a folha', !!(await waitFor(() => sheetOpen(bp), 2000)))
      check('/board: segurar não abriu o painel', !bp.url().includes('task='))
      await bp.locator('.ms__opt[data-move-to="IN_PROGRESS"]').tap()
      const bMoved = await waitFor(async () => (await statusOf(db, cpfId)).status === 'IN_PROGRESS', 5000)
      check('/board: mover pela folha grava (banco: IN_PROGRESS)', !!bMoved)
      check('/board sem erro de página', bp.errors.length === 0, bp.errors.join(' | '))
      await restore()
      await ctx3.close()
    }

    // ════════════════════════════════════════════════════════════════════
    // Computador: nada muda (sem abas, arraste de mouse como antes)
    // ════════════════════════════════════════════════════════════════════
    if (!ONLY || ONLY === 'desktop') {
      const ctx = await newContext(browser, token, company, { width: 1440, height: 900, mobile: false })
      const page = await open(ctx, `/tasks/${month}`)
      await page.waitForSelector('.board [data-col="TODO"] .card[data-id]', { timeout: 10000 })
      check('1440: board do mês sem abas', (await page.locator('[role="tablist"].col-tabs').count()) === 0)
      const widths = await page.evaluate(() =>
        [...document.querySelectorAll('.board > [data-col]')].map((l) => Math.round(l.getBoundingClientRect().width)),
      )
      check('1440: cinco colunas lado a lado como antes', widths.length === 5 && widths.every((w) => w >= 220 && w <= 360), widths.join(','))
      const cpfId = await byTitle('Validar CPF no cadastro do tutor')
      const src = page.locator(`.card[data-id="${cpfId}"]`)
      const dst = page.locator('[data-col="IN_PROGRESS"] .lane__list')
      const s = await src.boundingBox()
      const d = await dst.boundingBox()
      await page.mouse.move(s.x + s.width / 2, s.y + 20)
      await page.mouse.down()
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(s.x + s.width / 2 + ((d.x + d.width / 2 - s.x - s.width / 2) * i) / 12, s.y + 20 + ((d.y + 30 - s.y - 20) * i) / 12)
        await sleep(30)
      }
      await page.mouse.up()
      const dragged = await waitFor(async () => (await statusOf(db, cpfId)).status === 'IN_PROGRESS', 5000)
      check('1440: arrastar com o mouse entre colunas continua gravando', !!dragged, (await statusOf(db, cpfId)).status)
      check('1440: mouse não abre a folha', !(await sheetOpen(page)))
      await restore()
      const bp = await open(ctx, '/board')
      await bp.waitForSelector('.kanban [data-col="TODO"]', { timeout: 10000 })
      check('1440: /board sem abas', (await bp.locator('[role="tablist"].col-tabs').count()) === 0)
      check(
        '1440: /board segue com arraste nativo (draggable=true)',
        (await bp.locator('.kanban .card[draggable="true"]').count()) > 0,
      )
      await ctx.close()
    }

    // ════════════════════════════════════════════════════════════════════
    // C2. Notas no celular
    // ════════════════════════════════════════════════════════════════════
    if (!ONLY || ONLY === 'notas') {
      const api = async (method, url, body, tk = token) => {
        const res = await fetch(API + url, {
          method,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${tk}`, 'x-company-id': company },
          body: body ? JSON.stringify(body) : undefined,
        })
        const text = await res.text()
        return { status: res.status, body: text ? JSON.parse(text) : null }
      }
      // A nota do roteiro: criada aqui, apagada no fim.
      const created = await api('POST', '/notes', {
        title: 'Nota do roteiro celular',
        content: '<p>Primeira linha da nota</p><p>Segunda linha para formatar</p><p>Terceira linha com palavra</p>',
        tags: [],
        folderId: null,
      })
      const noteId = created.body?.id
      check('nota de teste criada pela API', created.status < 300 && !!noteId, String(created.status))
      cleanups.push(() => api('DELETE', `/notes/${noteId}`))

      // Shim do teclado: o Chromium do harness não abre teclado virtual. O shim
      // troca o `window.visualViewport` por um que encolhe quando o roteiro
      // manda (`__kb(300)`), como o iOS e o Chrome Android fazem: a página fica
      // do mesmo tamanho e só a área visível diminui.
      const ctx = await newContext(browser, token, company)
      const writesOnOpen = []
      ctx.on('request', (r) => {
        if (r.url().includes(`/notes/${noteId}`) && r.method() === 'PATCH') writesOnOpen.push(Date.now())
      })
      await ctx.addInitScript(() => {
        const real = window.visualViewport
        let kb = 0
        const fake = new EventTarget()
        Object.defineProperties(fake, {
          offsetTop: { get: () => 0 },
          offsetLeft: { get: () => 0 },
          pageTop: { get: () => window.scrollY },
          pageLeft: { get: () => window.scrollX },
          scale: { get: () => 1 },
          width: { get: () => (real ? real.width : window.innerWidth) },
          height: { get: () => (real ? real.height : window.innerHeight) - kb },
        })
        Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake })
        window.__kb = (px) => {
          kb = px
          fake.dispatchEvent(new Event('resize'))
        }
      })
      const page = await open(ctx, `/notes/${noteId}`)
      const hand = await finger(page)
      await page.waitForSelector('.ProseMirror', { timeout: 10000 })
      await sleep(600)
      // Abrir não é editar: antes o `setEditable` do hydrate emitia `update` e o
      // autosave gravava a nota igual (updatedAt novo, 409 em nota compartilhada).
      check('abrir a nota não grava nada (nenhum PATCH)', writesOnOpen.length === 0, `${writesOnOpen.length} PATCH`)

      const headerLine = async () =>
        page.evaluate(() => {
          const h = document.querySelector('.note-header')
          const st = document.querySelector('.note-header .save-status, .note-header .note-header__readonly')
          return {
            h: Math.round(h.getBoundingClientRect().height),
            st: st ? Math.round(st.getBoundingClientRect().height) : -1,
            text: st?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
            over: h.scrollWidth - h.clientWidth,
          }
        })
      let hl = await headerLine()
      check('nota 375: topo em uma linha (estado inicial)', hl.h <= 56 && hl.st <= 24 && hl.over <= 0, JSON.stringify(hl))
      check('nota 375: sem toolbar no topo', (await page.locator('.note-toolbar-row').count()) === 0)
      check(
        'nota 375: Compartilhar vira ícone',
        await page.evaluate(() => {
          const b = document.querySelector('.note-header__share')
          return !!b && b.textContent.trim() === '' && b.getAttribute('aria-label') === 'Compartilhar nota'
        }),
      )
      const barHidden = await page.evaluate(() => {
        const b = document.querySelector('[data-note-keyboard-bar]')
        return !b || getComputedStyle(b).display === 'none'
      })
      check('sem foco: barra de formatação fora e tab bar à vista', barHidden && (await page.locator('.m-tabs').isVisible()))
      await shot(page, 'nota-m375.png')

      // Foco no editor (toque no texto).
      const second = page.locator('.ProseMirror p', { hasText: 'Segunda linha' })
      let c = await center(second)
      await hand.tap(c.box.x + c.box.width - 4, c.y)
      await sleep(500)
      const focused = await page.evaluate(() => document.activeElement?.classList.contains('ProseMirror'))
      check('tocar no texto põe o foco no editor', !!focused)
      const chrome = async () =>
        page.evaluate(() => ({
          tabbar: !!document.querySelector('.m-tabs') && getComputedStyle(document.querySelector('.m-tabs')).display !== 'none',
          cls: document.documentElement.classList.contains('shell-tabbar-hidden'),
          inset: document.documentElement.style.getPropertyValue('--shell-bottom-inset'),
          bar: (() => {
            const b = document.querySelector('[data-note-keyboard-bar]')
            if (!b || getComputedStyle(b).display === 'none') return null
            const r = b.getBoundingClientRect()
            return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }
          })(),
        }))
      let ch = await chrome()
      check('com foco: a tab bar sai', !ch.tabbar && ch.cls, JSON.stringify(ch))
      check('com foco: --shell-bottom-inset passa a ser a barra', ch.inset.includes('52px'), ch.inset)
      check('com foco: barra presa no rodapé (teclado fechado)', !!ch.bar && Math.abs(ch.bar.bottom - 812) <= 1, JSON.stringify(ch.bar))
      // Teclado de 300px (shim): a barra sobe junto com a borda da área visível.
      await page.evaluate(() => window.__kb(300))
      await sleep(250)
      ch = await chrome()
      check('teclado aberto (shim visualViewport): barra presa acima do teclado', !!ch.bar && Math.abs(ch.bar.bottom - (812 - 300)) <= 1, JSON.stringify(ch.bar))
      await shot(page, 'nota-m375-teclado.png')
      const bar = page.locator('[data-note-keyboard-bar]')
      const actions = await bar.locator('button[data-action]').evaluateAll((els) =>
        els.map((e) => ({ a: e.dataset.action, h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) })),
      )
      check(
        'barra: checklist, lista, título, negrito, itálico, link, desfazer e fechar teclado, com 44px',
        ['taskList', 'bulletList', 'heading', 'bold', 'italic', 'link', 'undo', 'close'].every((k) => actions.some((x) => x.a === k)) &&
          actions.every((x) => x.h >= 44 && x.w >= 44),
        actions.map((x) => x.a).join(','),
      )
      const scroller = await bar.locator('.kbar__scroll').evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, ox: getComputedStyle(e).overflowX }))
      check('barra rola de lado quando não cabe', scroller.ox === 'auto', JSON.stringify(scroller))

      // Aplicar pela barra: o foco não sai do editor a cada toque.
      const tapAction = async (key) => {
        const btn = bar.locator(`button[data-action="${key}"]`)
        await btn.scrollIntoViewIfNeeded()
        const b = await btn.boundingBox()
        await hand.tap(b.x + b.width / 2, b.y + b.height / 2)
        await sleep(250)
      }
      await tapAction('taskList')
      const asTask = await page.evaluate(() => !!document.querySelector('.ProseMirror ul[data-type="taskList"] li p')?.textContent?.includes('Segunda linha'))
      check('barra: Checklist transforma a linha em tarefa', asTask)
      check('barra: o editor segue com o foco depois do toque', await page.evaluate(() => document.activeElement?.classList.contains('ProseMirror')))
      await tapAction('taskList') // desfaz o checklist pelo mesmo botão
      await tapAction('bulletList')
      check('barra: Lista transforma em lista', await page.evaluate(() => !!document.querySelector('.ProseMirror ul:not([data-type]) li')?.textContent?.includes('Segunda linha')))
      await tapAction('bulletList')
      await tapAction('heading')
      check('barra: Título transforma em título', await page.evaluate(() => !!document.querySelector('.ProseMirror h2')?.textContent?.includes('Segunda linha')))
      // Negrito numa palavra selecionada (seleção por teclado, como o sistema faz).
      const third = page.locator('.ProseMirror p', { hasText: 'Terceira linha' })
      c = await center(third)
      await hand.tap(c.box.x + c.box.width - 2, c.y)
      await sleep(250)
      await page.keyboard.press('End')
      for (let i = 0; i < 'palavra'.length; i++) await page.keyboard.press('Shift+ArrowLeft')
      await sleep(250)
      check('seleção com toque: o bubble menu NÃO abre', !(await page.locator('.note-bubble').isVisible().catch(() => false)))
      await tapAction('bold')
      check('barra: Negrito aplica na seleção', await page.evaluate(() => document.querySelector('.ProseMirror strong')?.textContent === 'palavra'))
      check('barra: botão Negrito marcado com o acento', await bar.locator('button[data-action="bold"]').evaluate((e) => e.classList.contains('kbar__btn--on')))
      // Gravou: o autosave leva o HTML formatado ao banco.
      const saved = await waitFor(async () => {
        const r = (await db.query(`SELECT content FROM "Note" WHERE id=$1`, [noteId])).rows[0]
        return r && r.content.includes('<strong>palavra</strong>') && r.content.includes('<h2>') ? r.content : null
      }, 8000)
      check('formatação gravada na nota (banco)', !!saved)
      hl = await headerLine()
      check('topo segue em uma linha depois de salvar', hl.h <= 56 && hl.st <= 24, JSON.stringify(hl))

      // Fechar teclado: a barra some e a tab bar volta.
      await page.evaluate(() => window.__kb(0))
      await tapAction('close')
      await sleep(400)
      ch = await chrome()
      check('"Fechar teclado" tira o foco do editor', !(await page.evaluate(() => document.activeElement?.classList.contains('ProseMirror'))))
      check('sem foco de novo: barra fora, tab bar de volta', !ch.bar && ch.tabbar && !ch.cls && ch.inset.includes('58px'), JSON.stringify(ch))

      // Estados de salvamento: Salvando e Erro também numa linha só.
      await page.route(`**/notes/${noteId}`, async (route) => {
        if (route.request().method() !== 'PATCH') return route.continue().catch(() => {})
        await sleep(2500)
        return route.continue().catch(() => {})
      })
      c = await center(page.locator('.ProseMirror p', { hasText: 'Primeira linha' }))
      await hand.tap(c.box.x + c.box.width - 2, c.y)
      await page.keyboard.type(' x')
      const saving = await waitFor(async () => {
        const h = await headerLine()
        return h.text.startsWith('Salvando') ? h : null
      }, 5000)
      check('estado Salvando: uma linha', !!saving && saving.h <= 56 && saving.st <= 24, JSON.stringify(saving))
      // Espera a gravação atrasada terminar antes de tirar o atraso.
      await waitFor(async () => (await headerLine()).text.startsWith('Salvo'), 8000)
      await page.unroute(`**/notes/${noteId}`)
      await page.route(`**/notes/${noteId}`, (route) =>
        (route.request().method() === 'PATCH'
          ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"falha simulada"}' })
          : route.continue()
        ).catch(() => {}),
      )
      await page.keyboard.type('y')
      const errored = await waitFor(async () => {
        const h = await headerLine()
        return h.text.startsWith('Erro') ? h : null
      }, 8000)
      check('estado Erro (com tentar de novo): uma linha', !!errored && errored.h <= 56 && errored.st <= 24 && errored.over <= 0, JSON.stringify(errored))
      await shot(page, 'nota-m375-erro.png')
      await page.unroute(`**/notes/${noteId}`)
      await page.locator('.save-status__retry').tap()
      await sleep(1500)

      // Sair da nota com o foco no editor não deixa a tab bar presa fora.
      c = await center(page.locator('.ProseMirror p', { hasText: 'Primeira linha' }))
      await hand.tap(c.box.x + 10, c.y)
      await sleep(300)
      await page.goto(WEB + '/notes', { waitUntil: 'domcontentloaded' })
      await sleep(1500)
      ch = await chrome()
      check('saiu da nota com foco: tab bar volta', ch.tabbar && !ch.cls, JSON.stringify(ch))
      check('notas sem erro de página', page.errors.length === 0, page.errors.join(' | '))
      await ctx.close()

      // Viewport encolhendo de verdade (Android com resizes-content): a barra segue.
      const ctxR = await newContext(browser, token, company)
      const pr = await open(ctxR, `/notes/${noteId}`)
      const handR = await finger(pr)
      await pr.waitForSelector('.ProseMirror p', { timeout: 15000 }).catch(async () => {
        if (shotDir) await pr.screenshot({ path: path.join(shotDir, 'dbg-ctxR.png') })
        console.log('ctxR url', pr.url(), await pr.evaluate(() => document.querySelector('.note-page')?.innerText?.slice(0, 200)))
      })
      c = await center(pr.locator('.ProseMirror p').first())
      await handR.tap(c.box.x + 20, c.y)
      await sleep(300)
      await pr.setViewportSize({ width: 375, height: 480 })
      await sleep(400)
      const rb = await pr.evaluate(() => Math.round(document.querySelector('[data-note-keyboard-bar]').getBoundingClientRect().bottom))
      check('viewport encolhido de verdade: barra na borda de baixo', Math.abs(rb - 480) <= 1, `${rb}`)
      await ctxR.close()

      // Só leitura (convidada VIEW) também numa linha.
      const leticiaId = (await db.query(`SELECT id FROM "User" WHERE email='leticia@nevo.test'`)).rows[0].id
      const granted = await api('POST', `/notes/${noteId}/access`, { userId: leticiaId, level: 'VIEW' })
      if (granted.status < 300) {
        const tokL = await login('leticia@nevo.test')
        const ctxL = await newContext(browser, tokL, company)
        const pl = await open(ctxL, `/notes/${noteId}`)
        await pl.waitForSelector('.note-header__readonly', { timeout: 10000 }).catch(() => {})
        const hr = await pl.evaluate(() => {
          const h = document.querySelector('.note-header')
          const st = document.querySelector('.note-header__readonly')
          return { h: Math.round(h.getBoundingClientRect().height), st: st ? Math.round(st.getBoundingClientRect().height) : -1, text: st?.textContent?.trim() }
        })
        check('estado Só leitura: uma linha', hr.h <= 56 && hr.st > 0 && hr.st <= 24, JSON.stringify(hr))
        await ctxL.close()
      } else {
        check('estado Só leitura: compartilhar com a Letícia', false, `${granted.status} ${JSON.stringify(granted.body)}`)
      }

      // Lista de notas no celular.
      const ctxN = await newContext(browser, token, company)
      const pn = await open(ctxN, '/notes')
      await pn.waitForSelector('.notes__search', { timeout: 10000 })
      const list = await pn.evaluate(() => {
        const s = document.querySelector('.notes__search').getBoundingClientRect()
        const f = document.querySelector('.notes__folders-toggle').getBoundingClientRect()
        const input = document.querySelector('.notes__search input')
        const pins = [...document.querySelectorAll('.card__pin')].map((p) => getComputedStyle(p).opacity)
        return { sameRow: Math.abs(s.top - f.top) < 2, font: getComputedStyle(input).fontSize, pins, label: document.querySelector('.notes__folders-label').textContent.trim() }
      })
      check('lista 375: busca e pastas na mesma linha', list.sameRow, JSON.stringify(list))
      check('lista 375: busca com 16px (sem zoom do iOS)', list.font === '16px', list.font)
      check('lista 375: fixar à vista no toque', list.pins.length > 0 && list.pins.every((o) => o === '1'), list.pins.join(','))
      await shot(pn, 'notas-m375.png')
      await ctxN.close()

      // Computador: toolbar do topo e bubble menu como estão.
      const ctxD = await newContext(browser, token, company, { width: 1440, height: 900, mobile: false })
      const pd = await open(ctxD, `/notes/${noteId}`)
      await pd.waitForSelector('.ProseMirror p')
      check('1440: toolbar do topo presente', (await pd.locator('.note-toolbar-row .tt-toolbar').count()) === 1)
      const pb = await pd.locator('.ProseMirror p', { hasText: 'Primeira linha' }).boundingBox()
      await pd.mouse.move(pb.x + 4, pb.y + pb.height / 2)
      await pd.mouse.down()
      await pd.mouse.move(pb.x + 120, pb.y + pb.height / 2, { steps: 8 })
      await pd.mouse.up()
      await sleep(700)
      check('1440: selecionar com o mouse abre o bubble menu', await pd.locator('.note-bubble').isVisible().catch(() => false))
      check('1440: sem barra do teclado', (await pd.locator('[data-note-keyboard-bar]').count()) === 0)
      await pd.mouse.click(700, 120)
      await shot(pd, 'nota-d1440.png')
      await ctxD.close()
    }

    // ════════════════════════════════════════════════════════════════════
    // Zero rolagem lateral da página em 320, 375 e 414
    // ════════════════════════════════════════════════════════════════════
    if (!ONLY || ONLY === 'overflow') {
      const nicolasId = (await db.query(`SELECT id FROM "User" WHERE email='nicolas@nevo.test'`)).rows[0].id
      const someNote = (
        await db.query(`SELECT id FROM "Note" WHERE "createdById"=$1 ORDER BY "isPinned" DESC, title LIMIT 1`, [nicolasId])
      ).rows[0]?.id
      const routes = [`/tasks/${month}`, `/tasks/${month}?agrupar=pessoa`, '/board', '/notes', someNote ? `/notes/${someNote}` : null].filter(Boolean)
      for (const width of [320, 375, 414]) {
        const ctx = await newContext(browser, token, company, { width, height: 800 })
        for (const route of routes) {
          const page = await open(ctx, route)
          await sleep(500)
          const m = await page.evaluate(() => {
            const main = document.querySelector('main')
            return {
              doc: document.documentElement.scrollWidth - window.innerWidth,
              main: main ? main.scrollWidth - main.clientWidth : 0,
            }
          })
          check(`${width}px ${route.replace(month, '<mês>')}: sem rolagem lateral`, m.doc <= 0 && m.main <= 0, JSON.stringify(m))
          await page.close()
        }
        await ctx.close()
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // N1. /login e /redefinir-senha sem nenhuma resposta 401
    // ════════════════════════════════════════════════════════════════════
    if (!ONLY || ONLY === 'sessao') {
      const watchApi = (page) => {
        const seen = []
        page.on('response', (r) => {
          if (r.url().startsWith(API)) seen.push(`${r.status()} ${r.request().method()} ${r.url().slice(API.length)}`)
        })
        return seen
      }
      for (const route of ['/login', '/redefinir-senha?token=token-de-teste', `/tasks/${month}`]) {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
        const page = await ctx.newPage()
        const seen = watchApi(page)
        await page.goto(WEB + route, { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('networkidle').catch(() => {})
        await sleep(2500)
        const unauthorized = seen.filter((s) => s.startsWith('401'))
        check(`sem sessão ${route.replace(month, '<mês>')}: nenhuma resposta 401`, unauthorized.length === 0, unauthorized.join(', ') || `${seen.length} chamada(s)`)
        await ctx.close()
      }
      // Logado continua igual: o login pelo formulário leva à área logada e o
      // cronômetro e o sino buscam os dados (antes eles também buscavam no login).
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      await ctx.addInitScript(() => {
        localStorage.setItem('onboarding.autoShown', '1')
        localStorage.setItem('onboarding.completed', '1')
        localStorage.setItem('ui.idlePermissionPrompt', 'done')
      })
      const page = await ctx.newPage()
      const seen = watchApi(page)
      await page.goto(WEB + '/login', { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('input[type="email"], input[autocomplete="email"], input[name="email"]', { timeout: 10000 })
      await page.locator('input[type="email"], input[autocomplete="email"], input[name="email"]').first().fill('nicolas@nevo.test')
      await page.locator('input[type="password"]').first().fill('nevo1234')
      await page.locator('button[type="submit"]').first().click()
      await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 }).catch(() => {})
      await sleep(3500)
      const after = seen.join(' | ')
      check('login pelo formulário entra na área logada', !page.url().includes('/login'), page.url().replace(WEB, ''))
      check('logado: o cronômetro busca /time/current (200)', /200 GET \/time\/current/.test(after))
      check('logado: o sino busca /inbox/unread-count (200)', /200 GET \/inbox\/unread-count/.test(after))
      check('logado: a sequência busca /streak/me (200)', /200 GET \/streak\/me/.test(after))
      check('login inteiro sem nenhuma resposta 401', !seen.some((s) => s.startsWith('401')), seen.filter((s) => s.startsWith('401')).join(', '))
      await ctx.close()
    }
  } catch (err) {
    check('roteiro rodou até o fim', false, err.stack?.split('\n').slice(0, 3).join(' / '))
  } finally {
    await restore().catch(() => {})
    for (const fn of cleanups.reverse()) await fn().catch(() => {})
    await browser.close()
    await db.end()
    const failed = results.filter((r) => r.startsWith('FALHOU')).length
    console.log(`\n${results.length - failed} OK, ${failed} FALHOU`)
    process.exitCode = failed ? 1 : 0
  }
})()
