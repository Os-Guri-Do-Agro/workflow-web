// Roteiro de ponta a ponta do board de Aprovações que CABE na tela (ala
// Marketing, nov/2026). Pedido do Nicolas: "ruim ficou arrastar tanto". Prova,
// pela tela (Edge headless) e pelo banco:
//   encaixe  as colunas dividem a largura: 1366 e 1512 sem rolagem lateral com o seed
//   card     o card não diminui: título até 3 linhas, meta e rodapé numa linha só
//   vazia    coluna vazia é faixa de 44px; clicar abre só por agora; arrastar até ela
//            (a grade não pula durante o arraste) e ela abre ao receber o card
//   final    Publicado começa recolhido com cards, abre com um clique e lembra a escolha
//   mover    "Mover para" no card pelo mouse: só os status possíveis, os outros
//            desabilitados com o motivo; o espelho do front bate com o `allowedMoves`
//   teclado  Tab chega no botão, Enter abre, setas e Enter escolhem, Esc fecha
//   recusa   mover pelo menu usa o mesmo /move do arraste e mostra a MESMA frase
//   borda    em 1024 o board rola sozinho perto da borda durante o arraste
//   grafica  a trilha Gráfica (Impresso e entregue recolhido, "Abrir na Gráfica")
//   celular  375px não muda: uma coluna, abas, folha "Mover para"
// Prints claro e escuro em prints/marketing-board-fit/.
//
// Uso (cada agente com o seu banco, API e Vite):
//   API=http://127.0.0.1:3619 WEB=http://localhost:5189 HARNESS_DB=wf_mkboard \
//   node marketing-board-fit-e2e.cjs
// Pré-requisitos: banco do marketing-db.sh, fake-storage (54329), a API (api-run.sh) e o Vite.
// Escreve só no banco do harness: cards "E2E Fit ..." são recriados a cada rodada e
// apagados no fim; os cards do seed voltam ao status e à posição de origem.
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const pg = require('pg')

const API = process.env.API ?? 'http://127.0.0.1:3619'
const WEB = process.env.WEB ?? 'http://localhost:5189'
const DB = process.env.HARNESS_DB ?? 'wf_mkboard'
const seed = JSON.parse(fs.readFileSync(path.resolve(__dirname, process.env.HARNESS_SEED ?? `seed-marketing-out.${DB}.json`), 'utf8'))
const OUT = process.env.SHOTS ?? path.join(__dirname, 'prints', 'marketing-board-fit')
fs.mkdirSync(OUT, { recursive: true })

const G = seed.groupId
const U = seed.users
const C = seed.companies
const BOARD = '/marketing/aprovacoes'
const DIGITAL = ['IDEA', 'IN_PRODUCTION', 'AWAITING_APPROVAL', 'CHANGES_REQUESTED', 'APPROVED', 'SCHEDULED', 'PUBLISHED']
const PRINT_DESK = ['SENT_TO_PRINTER', 'PROOF_RECEIVED', 'DELIVERED']

let fails = 0
const results = []
const check = (crit, cond, msg, extra = '') => {
  const line = `${cond ? 'OK  ' : 'FAIL'} [${crit}] ${msg}${extra ? '  (' + String(extra).slice(0, 400) + ')' : ''}`
  console.log(line)
  results.push({ crit, ok: !!cond })
  if (!cond) fails++
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
const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

// ── Login com cache (a API limita 10 logins por minuto por processo) ────────
const CACHE = path.join(os.tmpdir(), 'nevo-harness-mkboard-tokens.json')
async function login(email) {
  let cache = {}
  try {
    cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'))
  } catch {}
  const key = `${API}|${email}`
  if (cache[key]) {
    try {
      const r = await fetch(`${API}/user/me`, { headers: { authorization: `Bearer ${cache[key]}` } })
      if (r.ok && (await r.json())?.email === email) return cache[key]
    } catch {}
  }
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'nevo1234' }),
  })
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`)
  const token = (await r.json()).accessToken
  cache[key] = token
  fs.writeFileSync(CACHE, JSON.stringify(cache))
  return token
}

async function api(token, method, route, body) {
  const url = route.startsWith('/marketing') ? `${API}${route}` : `${API}/marketing/g/${G}${route}`
  const r = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try {
    data = await r.json()
  } catch {}
  return { status: r.status, data }
}
const must = (r, what) => {
  if (r.status >= 300) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.data)}`)
  return r.data
}

// PNG 1x1 (para peça impressa, se a versão só de legenda não valer).
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
async function upload(token, cardId, buffer, name, mimeType) {
  const t = must(await api(token, 'POST', `/cards/${cardId}/assets`, { name, mimeType, size: buffer.length, sha256: sha(buffer) }), 'ticket')
  const put = await fetch(t.uploadUrl, { method: 'PUT', headers: { 'content-type': mimeType, authorization: `Bearer ${t.token}` }, body: buffer })
  if (!put.ok) throw new Error(`PUT ${put.status}`)
  return must(await api(token, 'POST', `/assets/${t.asset.id}/confirm`, {}), 'confirm')
}

// ── Navegador ───────────────────────────────────────────────────────────────
const allBad = []
const allErrors = []

async function newCtx(browser, token, vp, theme = 'light') {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.mobile ? 2 : 1,
    isMobile: !!vp.mobile,
    hasTouch: !!vp.mobile,
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
    [token, C.pet, theme],
  )
  return ctx
}

async function open(ctx, route, who) {
  const page = await ctx.newPage()
  page.on('response', (res) => {
    const u = res.url()
    if (u.startsWith(API) && (res.status() === 401 || res.status() >= 500)) allBad.push(`${who}: ${res.status()} ${res.request().method()} ${u.replace(API, '')}`)
  })
  page.on('pageerror', (e) => {
    allErrors.push(`${who}@${phase}: ${e.message}`)
    console.log(`  (erro de página em ${who}@${phase}: ${(e.stack ?? e.message).split('\n').slice(0, 6).join(' / ')})`)
  })
  await goto(page, route)
  return page
}
/** Etapa do roteiro, para o erro de página dizer onde aconteceu. */
let phase = 'início'

async function goto(page, route) {
  await page.goto(WEB + route, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.addStyleTag({ content: '#__vue-devtools-container__{display:none!important}' }).catch(() => {})
  if (route.startsWith(BOARD)) await page.waitForSelector('.mkb__col', { timeout: 15000 })
  await sleep(500)
}

async function finger(page) {
  const cdp = await page.context().newCDPSession(page)
  const send = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  return {
    async hold(x, y, ms = 520) {
      await send('touchStart', x, y)
      await sleep(ms / 2)
      await send('touchMove', x + 2, y + 1)
      await sleep(ms / 2)
      await send('touchEnd')
    },
  }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) })
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent?.trim() ?? ''))

/** Larguras, estado e contagem das colunas, e as rolagens. */
function metrics(page) {
  return page.evaluate(() => {
    const lanes = document.querySelector('.mkb__lanes')
    let main = null
    for (let p = lanes.parentElement; p; p = p.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) {
        main = p
        break
      }
    }
    const lr = lanes.getBoundingClientRect()
    return {
      lanesClient: lanes.clientWidth,
      lanesScroll: lanes.scrollWidth,
      scrollLeft: lanes.scrollLeft,
      lanesLeft: lr.left,
      lanesRight: lr.right,
      docScroll: document.documentElement.scrollWidth,
      mainOverflowY: main ? main.scrollHeight - main.clientHeight : 0,
      cols: [...document.querySelectorAll('.mkb__col')].map((c) => {
        const r = c.getBoundingClientRect()
        return {
          s: c.dataset.col,
          x: Math.round(r.left * 10) / 10,
          w: Math.round(r.width * 10) / 10,
          h: Math.round(r.height),
          collapsed: c.dataset.collapsed === 'true',
          count: c.querySelector('.mkb__count')?.textContent?.trim() ?? '',
          cards: c.querySelectorAll('.mkc[data-id]').length,
          label: (c.querySelector('.mkb__label, .mkb__rail-label')?.textContent ?? '').trim(),
        }
      }),
    }
  })
}
const col = (m, s) => m.cols.find((c) => c.s === s)

/** Título até 3 linhas, meta e rodapé numa linha só, em todo card visível. */
function cardLines(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.mkc[data-id]')].map((card) => {
      const t = card.querySelector('.mkc__title')
      const meta = card.querySelector('.mkc__meta')
      const foot = card.querySelector('.mkc__foot')
      const lh = parseFloat(getComputedStyle(t).lineHeight)
      return {
        id: card.dataset.id,
        width: Math.round(card.getBoundingClientRect().width),
        clamp: getComputedStyle(t).webkitLineClamp,
        lines: Math.round(t.getBoundingClientRect().height / lh),
        cut: t.scrollHeight > t.clientHeight + 1,
        metaH: Math.round(meta.getBoundingClientRect().height),
        footH: foot ? Math.round(foot.getBoundingClientRect().height) : 0,
        footOver: foot ? foot.scrollWidth > foot.clientWidth + 1 : false,
      }
    }),
  )
}

function menuItems(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[role="menu"] [data-move-to]')].map((el) => ({
      to: el.dataset.moveTo,
      disabled: el.hasAttribute('data-disabled'),
      current: el.classList.contains('is-current'),
      why: el.querySelector('[data-why]')?.textContent?.trim() ?? '',
    })),
  )
}

async function openMenu(page, cardId) {
  const card = page.locator(`.mkc[data-id="${cardId}"]`)
  await card.scrollIntoViewIfNeeded()
  await card.hover()
  await card.locator('[data-action="move-menu"]').click()
  await page.waitForSelector('[role="menu"] [data-move-to]', { timeout: 5000 })
  return menuItems(page)
}

async function closeMenu(page) {
  await page.keyboard.press('Escape')
  await page.waitForSelector('[role="menu"]', { state: 'detached', timeout: 5000 }).catch(() => {})
}

const enabledOf = (items) => items.filter((i) => !i.disabled).map((i) => i.to)

;(async () => {
  const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
  await db.connect()
  const q = async (sql, params) => (await db.query(sql, params)).rows
  const statusOf = async (id) => (await q(`SELECT status FROM "MarketingCard" WHERE id=$1`, [id]))[0]?.status

  const tok = {
    marcel: await login('marcel@nevo.test'),
    leticia: await login('leticia@nevo.test'),
    nicolas: await login('nicolas@nevo.test'),
  }

  // Rodada limpa: tira os cards "E2E" de rodadas anteriores (o storage deles também)
  // e devolve o seed ao status e à posição de origem.
  async function cleanup() {
    const old = await q(`SELECT id FROM "MarketingCard" WHERE "groupId"=$1 AND title LIKE 'E2E %'`, [G])
    for (const r of old) await api(tok.nicolas, 'DELETE', `/cards/${r.id}`)
    for (const [i, c] of seed.cards.entries()) {
      await q(`UPDATE "MarketingCard" SET status=$2, position=$3, "archivedAt"=NULL WHERE id=$1`, [c.id, c.status, 1024 * (i + 1)])
    }
  }
  await cleanup()

  // Card com versão só de legenda (sem arquivo): o caminho mais curto até Aguardando.
  async function newCard(title, extra = {}) {
    return must(
      await api(tok.marcel, 'POST', '/cards', { companyId: C.pet, title, kind: 'POST', networks: ['INSTAGRAM'], status: 'IN_PRODUCTION', ...extra }),
      `criar ${title}`,
    ).id
  }
  async function withVersion(id, kind = 'POST') {
    if (kind === 'PRINT') {
      // Peça impressa vai com arquivo (sobe pelo fake-storage, como no navegador).
      const asset = await upload(tok.marcel, id, PNG_1PX, 'arte.png', 'image/png')
      must(await api(tok.marcel, 'POST', `/cards/${id}/versions`, { assetIds: [asset.id] }), 'versão com arquivo')
      return
    }
    must(await api(tok.marcel, 'PATCH', `/cards/${id}`, { captions: { INSTAGRAM: 'Legenda do roteiro do board.' } }), 'legenda')
    must(await api(tok.marcel, 'POST', `/cards/${id}/versions`, { assetIds: [] }), 'versão só de legenda')
  }
  const moveApi = async (token, id, status) => must(await api(token, 'POST', `/cards/${id}/move`, { status }), `mover ${status}`)
  // R2 (A, achado 7): Agendado só pelo "Agendar publicação" (aqui, à mão em cada rede); o move direto dá 409.
  async function scheduleApi(token, id) {
    const plan = must(await api(token, 'GET', `/cards/${id}/publications`), 'plano').plan
    must(await api(token, 'POST', `/cards/${id}/publications`, { items: plan.map((p) => ({ network: p.network, mode: 'MANUAL', placement: p.defaultPlacement, accountId: null })) }), 'agendar')
  }
  const allowedOf = async (token, id) => must(await api(token, 'GET', `/cards/${id}`), 'detalhe').me.allowedMoves

  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const ids = {}
  try {
    // ════════════════════════════════════════════════════════════════════
    // encaixe + card: o seed em 1366 e 1512, sem rolagem lateral
    // ════════════════════════════════════════════════════════════════════
    phase = 'encaixe'
    for (const w of [1366, 1512]) {
      const ctx = await newCtx(browser, tok.marcel, { width: w, height: 900 })
      const page = await open(ctx, BOARD, `marcel-${w}`)
      const m = await metrics(page)
      check('encaixe', m.lanesScroll <= m.lanesClient + 1 && m.docScroll <= w, `${w}: board do seed sem rolagem lateral`, `fita ${m.lanesScroll}/${m.lanesClient}, página ${m.docScroll}`)
      const opened = m.cols.filter((c) => !c.collapsed)
      check(
        'encaixe',
        sameSet(opened.map((c) => c.s), ['IDEA', 'IN_PRODUCTION']) && opened.every((c) => c.w >= 232 && c.w <= 320.5),
        `${w}: Ideia e Em produção abertas, entre 232px e 320px`,
        opened.map((c) => `${c.s} ${c.w}`).join(', '),
      )
      const rails = m.cols.filter((c) => c.collapsed)
      check(
        'vazia',
        sameSet(rails.map((c) => c.s), ['AWAITING_APPROVAL', 'CHANGES_REQUESTED', 'APPROVED', 'SCHEDULED', 'PUBLISHED']) &&
          rails.every((c) => Math.abs(c.w - 44) < 0.6 && c.count === '0' && c.label),
        `${w}: as 5 colunas vazias viram faixa de 44px com o nome e a contagem 0`,
        rails.map((c) => `${c.s} ${c.w} "${c.label}" ${c.count}`).join(', '),
      )
      check('encaixe', m.mainOverflowY <= 1 && m.cols.every((c) => c.h > 400), `${w}: a coluna vai até o pé da tela sem a página rolar`, `sobra ${m.mainOverflowY}, alturas ${[...new Set(m.cols.map((c) => c.h))].join('/')}`)
      const lines = await cardLines(page)
      check(
        'card',
        lines.length === 4 && lines.every((l) => l.clamp === '3' && l.lines <= 3 && l.metaH <= 17 && l.footH <= 23 && !l.footOver),
        `${w}: card com título até 3 linhas e meta e rodapé numa linha`,
        JSON.stringify(lines.map((l) => `${l.width}px ${l.lines}l meta${l.metaH} rod${l.footH}`)),
      )
      await shot(page, `seed-d${w}-claro.png`)
      await ctx.close()
      const dark = await newCtx(browser, tok.marcel, { width: w, height: 900 }, 'dark')
      const dp = await open(dark, BOARD, `marcel-${w}-escuro`)
      await shot(dp, `seed-d${w}-escuro.png`)
      await dark.close()
    }

    // ════════════════════════════════════════════════════════════════════
    // vazia: clicar abre só por agora; arrastar até a faixa
    // ════════════════════════════════════════════════════════════════════
    phase = 'vazia-clique'
    const mCtx = await newCtx(browser, tok.marcel, { width: 1512, height: 900 })
    const page = await open(mCtx, BOARD, 'marcel')
    const storeKey = `marketing.board.columns.${U.marcel}`
    const store = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), storeKey)

    await page.click('[data-col="CHANGES_REQUESTED"] [data-action="expand-column"]')
    const peeked = await waitFor(async () => {
      const c = col(await metrics(page), 'CHANGES_REQUESTED')
      return !c.collapsed && c.w >= 232 ? c : null
    })
    const peekUi = await page.evaluate(() => ({
      empty: document.querySelector('[data-col="CHANGES_REQUESTED"] .mkb__empty')?.textContent?.trim(),
      focus: document.activeElement?.getAttribute('data-action'),
      focusCol: document.activeElement?.closest('[data-col]')?.getAttribute('data-col'),
    }))
    check(
      'vazia',
      !!peeked && peekUi.empty === 'Nenhum card' && peekUi.focus === 'collapse-column' && peekUi.focusCol === 'CHANGES_REQUESTED',
      'clicar na faixa vazia abre a coluna (Nenhum card) e o foco vai para o Recolher',
      `${peeked?.w}px ${JSON.stringify(peekUi)}`,
    )
    await shot(page, 'vazia-aberta-d1512.png')
    check('vazia', !(await store()).digital?.CHANGES_REQUESTED, 'abrir coluna vazia não grava preferência', JSON.stringify(await store()))
    await page.click('[data-col="CHANGES_REQUESTED"] [data-action="collapse-column"]')
    const reRail = await waitFor(async () => col(await metrics(page), 'CHANGES_REQUESTED').collapsed)
    const railFocus = await page.evaluate(() => document.activeElement?.closest('[data-col]')?.getAttribute('data-col') + ':' + document.activeElement?.getAttribute('data-action'))
    check('vazia', reRail && railFocus === 'CHANGES_REQUESTED:expand-column', 'Recolher volta para a faixa com o foco nela', railFocus)
    await page.click('[data-col="CHANGES_REQUESTED"] [data-action="expand-column"]')
    await goto(page, BOARD)
    check('vazia', col(await metrics(page), 'CHANGES_REQUESTED').collapsed, 'recarregou: a coluna vazia aberta por agora volta a ser faixa')

    phase = 'vazia-arraste'
    // Arrastar até a faixa vazia de Aguardando aprovação.
    ids.drag = await newCard('E2E Fit Arrastar para Aguardando')
    await withVersion(ids.drag)
    await goto(page, BOARD)
    const src = page.locator(`.mkc[data-id="${ids.drag}"]`)
    await src.waitFor({ timeout: 10000 })
    const before = await metrics(page)
    const sb = await src.boundingBox()
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2)
    await page.mouse.down()
    await page.mouse.move(sb.x + sb.width / 2 + 16, sb.y + sb.height / 2 + 6, { steps: 4 })
    const railBox = await page.locator('[data-col="AWAITING_APPROVAL"]').boundingBox()
    await page.mouse.move(railBox.x + railBox.width / 2, railBox.y + 220, { steps: 12 })
    await sleep(250)
    const mid = await metrics(page)
    const midUi = await page.evaluate(() => ({
      dragging: document.querySelector('.mkb')?.classList.contains('is-dragging'),
      over: document.querySelector('.mkb__col.is-over')?.getAttribute('data-col'),
      railRing: [...document.querySelectorAll('.mkb__col[data-collapsed]')].map((c) => getComputedStyle(c).boxShadow !== 'none'),
    }))
    const still = before.cols.every((c, i) => Math.abs(c.x - mid.cols[i].x) < 0.6 && Math.abs(c.w - mid.cols[i].w) < 0.6)
    check(
      'vazia',
      midUi.dragging && midUi.over === 'AWAITING_APPROVAL' && midUi.railRing.length >= 4 && midUi.railRing.every(Boolean),
      'arrastando: toda faixa vira alvo (contorno) e a de Aguardando acende sob o cursor',
      JSON.stringify(midUi),
    )
    check('vazia', still, 'arrastando: nenhuma coluna muda de lugar nem de largura (a grade não pula)')
    await shot(page, 'arrastar-para-faixa-d1512.png')
    await page.mouse.up()
    const landed = await waitFor(async () => (await statusOf(ids.drag)) === 'AWAITING_APPROVAL', 8000)
    const after = await waitFor(async () => {
      const c = col(await metrics(page), 'AWAITING_APPROVAL')
      return !c.collapsed && c.cards === 1 ? c : null
    })
    check('vazia', landed && !!after, 'soltou na faixa: o banco grava Aguardando e a coluna abre com o card', `${await statusOf(ids.drag)} ${JSON.stringify(after)}`)
    await shot(page, 'faixa-recebeu-card-d1512.png')

    // ════════════════════════════════════════════════════════════════════
    // Cards em todos os status (pela API, como a equipe faria)
    // ════════════════════════════════════════════════════════════════════
    phase = 'gerar'
    const LONG = 'E2E Fit Carrossel de inverno: banho, tosa, cuidados com as patas e o que fazer quando o pet não quer sair de casa no frio'
    ids.long = await newCard(LONG, { status: 'IDEA' })
    ids.adjKey = await newCard('E2E Fit Ajustes no texto do carrossel')
    ids.adjEdge = await newCard('E2E Fit Ajustes na trilha do reel')
    ids.approved = await newCard('E2E Fit Aprovado sem data de publicação')
    ids.scheduled = await newCard('E2E Fit Agendado para sexta', { publishAt: new Date(Date.now() + 5 * 864e5).toISOString() })
    ids.pub1 = await newCard('E2E Fit Publicado na semana passada', { publishAt: new Date(Date.now() + 3 * 864e5).toISOString() })
    ids.pub2 = await newCard('E2E Fit Publicado ontem', { publishAt: new Date(Date.now() + 4 * 864e5).toISOString() })
    ids.noVersion = await newCard('E2E Fit Sem versão ainda')
    ids.noContent = await newCard('E2E Fit Versão sem arte nem legenda')
    for (const k of ['adjKey', 'adjEdge', 'approved', 'scheduled', 'pub1', 'pub2', 'noContent']) await withVersion(ids[k])
    for (const k of ['adjKey', 'adjEdge', 'approved', 'scheduled', 'pub1', 'pub2']) await moveApi(tok.marcel, ids[k], 'AWAITING_APPROVAL')
    for (const k of ['adjKey', 'adjEdge']) must(await api(tok.leticia, 'POST', `/cards/${ids[k]}/request-changes`, { body: 'Trocar a foto de capa' }), 'ajuste')
    for (const k of ['approved', 'scheduled', 'pub1', 'pub2']) must(await api(tok.leticia, 'POST', `/cards/${ids[k]}/approve`, {}), 'aprovar')
    for (const k of ['scheduled', 'pub1', 'pub2']) await scheduleApi(tok.marcel, ids[k])
    for (const k of ['pub1', 'pub2']) await moveApi(tok.marcel, ids[k], 'PUBLISHED')
    // Versão que perdeu a legenda: o resumo do board só sabe que há V1.
    must(await api(tok.marcel, 'PATCH', `/cards/${ids.noContent}`, { captions: {} }), 'tirar legenda')
    const ncAllowed = await allowedOf(tok.marcel, ids.noContent)
    check('recusa', !ncAllowed.includes('AWAITING_APPROVAL'), 'preparo: o servidor não deixa mandar para aprovação a V1 sem arte nem legenda', ncAllowed.join(','))

    // ════════════════════════════════════════════════════════════════════
    // final: Publicado recolhido com cards; abrir; lembrar
    // ════════════════════════════════════════════════════════════════════
    phase = 'final'
    await goto(page, BOARD)
    let m = await metrics(page)
    const pub = col(m, 'PUBLISHED')
    check('final', pub.collapsed && pub.count === '2' && Math.abs(pub.w - 44) < 0.6, 'Publicado começa recolhido mesmo com 2 cards, mostrando o número', JSON.stringify(pub))
    const openCols = m.cols.filter((c) => !c.collapsed)
    check(
      'encaixe',
      openCols.length === 6 && m.lanesScroll > m.lanesClient && openCols.every((c) => Math.abs(c.w - 232) < 0.6),
      '1512 com 6 colunas cheias: elas encolhem até 232px antes de rolar de lado (só rola quando nem assim cabe)',
      `${openCols.map((c) => c.w).join(',')} fita ${m.lanesScroll}/${m.lanesClient}`,
    )
    const narrow = await cardLines(page)
    const longL = narrow.find((l) => l.id === ids.long)
    check(
      'card',
      narrow.every((l) => l.lines <= 3 && l.metaH <= 17 && l.footH <= 23 && !l.footOver) && longL?.lines === 3 && longL?.cut,
      'coluna de 232px: título longo para em 3 linhas, meta e rodapé seguem numa linha',
      JSON.stringify(narrow.map((l) => `${l.width}px ${l.lines}l${l.cut ? '+' : ''} meta${l.metaH} rod${l.footH}`)),
    )
    await shot(page, 'todos-status-d1512-claro.png')
    await page.click('[data-col="PUBLISHED"] [data-action="expand-column"]')
    const pubOpen = await waitFor(async () => {
      const c = col(await metrics(page), 'PUBLISHED')
      return !c.collapsed && c.cards === 2 ? c : null
    })
    check('final', !!pubOpen, 'um clique abre o Publicado com os 2 cards', JSON.stringify(pubOpen))
    check('final', (await store()).digital?.PUBLISHED === 'open', `a escolha fica guardada por pessoa (${storeKey})`, JSON.stringify(await store()))
    await goto(page, BOARD)
    check('final', !col(await metrics(page), 'PUBLISHED').collapsed, 'recarregou: Publicado continua aberto')
    await page.locator('[data-col="PUBLISHED"]').scrollIntoViewIfNeeded()
    await page.locator('[data-col="PUBLISHED"]').hover()
    await page.click('[data-col="PUBLISHED"] [data-action="collapse-column"]')
    await waitFor(async () => col(await metrics(page), 'PUBLISHED').collapsed)
    await goto(page, BOARD)
    check('final', col(await metrics(page), 'PUBLISHED').collapsed && (await store()).digital?.PUBLISHED === 'closed', 'recolheu e recarregou: Publicado volta recolhido', JSON.stringify(await store()))

    // ════════════════════════════════════════════════════════════════════
    // mover: "Mover para" pelo mouse
    // ════════════════════════════════════════════════════════════════════
    phase = 'mover-mouse'
    const btnOpacity = (id) => page.locator(`.mkc[data-id="${id}"] [data-action="move-menu"]`).evaluate((b) => getComputedStyle(b).opacity)
    await page.locator(`.mkc[data-id="${ids.scheduled}"]`).scrollIntoViewIfNeeded()
    await page.mouse.move(2, 2)
    const hidden = await waitFor(async () => ((await btnOpacity(ids.scheduled)) === '0' ? '0' : null), 2000)
    await page.locator(`.mkc[data-id="${ids.scheduled}"]`).hover()
    const shown = await waitFor(async () => ((await btnOpacity(ids.scheduled)) === '1' ? '1' : null), 2000)
    check('mover', hidden === '0' && shown === '1', 'o botão "Mover para" some fora do card e aparece no hover', `${hidden} -> ${shown}`)
    const urlBefore = page.url()
    const itemsD = await openMenu(page, ids.scheduled)
    check('mover', page.url() === urlBefore, 'clicar no botão abre o menu e não abre o card')
    const serverD = await allowedOf(tok.marcel, ids.scheduled)
    check(
      'mover',
      sameSet(enabledOf(itemsD), ['APPROVED', 'PUBLISHED']) && sameSet(enabledOf(itemsD), serverD),
      'Agendado (Editor): só Aprovado e Publicado liberados, igual ao allowedMoves do servidor',
      `menu ${enabledOf(itemsD)} / servidor ${serverD}`,
    )
    const cur = itemsD.find((i) => i.current)
    const blockedD = itemsD.filter((i) => i.disabled && !i.current)
    check(
      'mover',
      cur?.to === 'SCHEDULED' && cur.disabled && blockedD.length === 4 && blockedD.every((i) => i.why.length > 8) &&
        itemsD.find((i) => i.to === 'IDEA')?.why === 'Só Admin reabre o card.',
      'o atual vem marcado e cada opção proibida vem desabilitada com o motivo',
      JSON.stringify(blockedD.map((i) => `${i.to}: ${i.why}`)),
    )
    await shot(page, 'menu-mover-d1512-claro.png')
    await page.locator('[role="menu"] [data-move-to="PUBLISHED"]').click()
    const movedD = await waitFor(async () => (await statusOf(ids.scheduled)) === 'PUBLISHED', 8000)
    await sleep(300)
    m = await metrics(page)
    const recv = await page.evaluate(() => document.querySelector('.mkb__col.is-received')?.getAttribute('data-col'))
    check(
      'mover',
      movedD && col(m, 'PUBLISHED').collapsed && col(m, 'PUBLISHED').count === '3' && recv === 'PUBLISHED',
      'escolher Publicado grava no banco; a faixa recolhida conta 3 e acende',
      `${await statusOf(ids.scheduled)} ${JSON.stringify(col(m, 'PUBLISHED'))} acesa=${recv}`,
    )
    const happyToasts = await toasts(page)
    check('mover', happyToasts.length === 0, 'nenhuma recusa no caminho feliz', happyToasts.join(' | '))

    phase = 'mover-proibido'
    // Opção proibida: desabilitada, com o motivo, e clicar não faz nada.
    const itemsC = await openMenu(page, ids.approved)
    const sched = itemsC.find((i) => i.to === 'SCHEDULED')
    check('mover', sched?.disabled && sched.why === 'Defina a data de publicação antes de agendar.', 'Aprovado sem data: Agendado desabilitado com o motivo', JSON.stringify(sched))
    check('mover', sameSet(enabledOf(itemsC), await allowedOf(tok.marcel, ids.approved)), 'Aprovado (Editor): o menu bate com o servidor', `menu ${enabledOf(itemsC)}`)
    await page.locator('[role="menu"] [data-move-to="SCHEDULED"]').click({ force: true })
    await sleep(500)
    check('mover', (await page.locator('[role="menu"]').count()) === 1 && (await statusOf(ids.approved)) === 'APPROVED', 'clicar na opção desabilitada não move e o menu fica aberto')
    await shot(page, 'menu-opcao-proibida-d1512.png')
    await closeMenu(page)
    const itemsN = await openMenu(page, ids.noVersion)
    const awN = itemsN.find((i) => i.to === 'AWAITING_APPROVAL')
    check('mover', awN?.disabled && /Feche uma versão/.test(awN.why) && sameSet(enabledOf(itemsN), await allowedOf(tok.marcel, ids.noVersion)), 'sem versão: Aguardando desabilitado ("Feche uma versão") e o resto bate com o servidor', JSON.stringify(awN))
    await closeMenu(page)

    phase = 'mover-admin'
    // Admin (Letícia): reabrir para o começo vem liberado, como no servidor.
    const lCtx = await newCtx(browser, tok.leticia, { width: 1512, height: 900 })
    const lPage = await open(lCtx, BOARD, 'leticia')
    const itemsCA = await openMenu(lPage, ids.approved)
    const serverCA = await allowedOf(tok.leticia, ids.approved)
    check('mover', sameSet(enabledOf(itemsCA), serverCA) && enabledOf(itemsCA).includes('IN_PRODUCTION'), 'Admin: reabrir (Ideia, Em produção) liberado, igual ao servidor', `menu ${enabledOf(itemsCA)} / servidor ${serverCA}`)
    await closeMenu(lPage)
    const itemsAwA = await openMenu(lPage, ids.drag)
    const apA = itemsAwA.find((i) => i.to === 'APPROVED')
    check('mover', apA?.disabled && /botão Aprovar/.test(apA.why), 'Admin em Aguardando: Aprovado leva ao botão Aprovar da página do card', apA?.why)
    await closeMenu(lPage)
    await lCtx.close()

    // ════════════════════════════════════════════════════════════════════
    // teclado: Tab, Enter, setas, Enter; e Esc
    // ════════════════════════════════════════════════════════════════════
    phase = 'teclado'
    const keyCard = page.locator(`.mkc[data-id="${ids.adjKey}"]`)
    await page.mouse.move(2, 2)
    await keyCard.focus()
    // Com "reduzir movimento" a opacidade troca no quadro seguinte (transição de 0.01ms).
    const visibleOnFocus = await waitFor(async () => ((await btnOpacity(ids.adjKey)) === '1' ? '1' : null), 2000)
    await page.keyboard.press('Tab')
    const onBtn = await page.evaluate(() => ({ action: document.activeElement?.getAttribute('data-action'), card: document.activeElement?.closest('.mkc')?.getAttribute('data-id') }))
    check('teclado', visibleOnFocus === '1' && onBtn.action === 'move-menu' && onBtn.card === ids.adjKey, 'foco no card mostra o botão e o Tab chega nele', JSON.stringify({ visibleOnFocus, ...onBtn }))
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="menu"] [data-move-to]', { timeout: 5000 })
    await sleep(150)
    const focus1 = await page.evaluate(() => document.activeElement?.getAttribute('data-move-to'))
    await page.keyboard.press('ArrowDown')
    const focus2 = await page.evaluate(() => document.activeElement?.getAttribute('data-move-to'))
    check('teclado', focus1 === 'IN_PRODUCTION' && focus2 === 'AWAITING_APPROVAL', 'Enter abre com o foco na primeira opção liberada; a seta pula as desabilitadas', `${focus1} -> ${focus2}`)
    await shot(page, 'menu-teclado-d1512.png')
    await page.keyboard.press('Enter')
    const movedKey = await waitFor(async () => (await statusOf(ids.adjKey)) === 'AWAITING_APPROVAL', 8000)
    const focusAfter = await waitFor(
      () =>
        page.evaluate((id) => {
          const a = document.activeElement
          return a?.getAttribute('data-id') === id ? a.closest('[data-col]')?.getAttribute('data-col') : null
        }, ids.adjKey),
      4000,
    )
    check('teclado', movedKey && focusAfter === 'AWAITING_APPROVAL', 'Enter escolhe: grava no banco e o foco segue o card na coluna nova', `${await statusOf(ids.adjKey)} foco em ${focusAfter}`)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await page.waitForSelector('[role="menu"] [data-move-to]', { timeout: 5000 })
    await page.keyboard.press('Escape')
    const escUi = await waitFor(
      () =>
        page.evaluate(() =>
          document.querySelector('[role="menu"]') ? null : `${document.activeElement?.getAttribute('data-action')}:${document.activeElement?.closest('.mkc')?.getAttribute('data-id')}`,
        ),
      3000,
    )
    check('teclado', escUi === `move-menu:${ids.adjKey}`, 'Esc fecha o menu e o foco volta ao botão', escUi)

    // ════════════════════════════════════════════════════════════════════
    // recusa: o menu usa o mesmo /move do arraste e mostra a mesma frase
    // ════════════════════════════════════════════════════════════════════
    phase = 'recusa-menu'
    const itemsX = await openMenu(page, ids.noContent)
    check('recusa', enabledOf(itemsX).includes('AWAITING_APPROVAL'), 'com V1, o menu deixa tentar Aguardando (o resumo não sabe do conteúdo)')
    await page.locator('[role="menu"] [data-move-to="AWAITING_APPROVAL"]').click()
    const toastMenu = await waitFor(async () => (await toasts(page)).find((t) => t.includes('legenda')), 6000)
    await sleep(700)
    const backX = (await page.locator(`[data-col="IN_PRODUCTION"] .mkc[data-id="${ids.noContent}"]`).count()) === 1
    check('recusa', !!toastMenu && backX && (await statusOf(ids.noContent)) === 'IN_PRODUCTION', 'pelo menu: o servidor recusa, o card volta e a frase dele aparece', toastMenu)
    await shot(page, 'menu-recusado-d1512.png')
    // Espera o aviso do menu sair sozinho (tirar o nó na mão quebra o vue-sonner).
    await waitFor(async () => !(await toasts(page)).some((t) => t.includes('legenda')), 12000, 250)
    phase = 'recusa-arraste'
    const xCard = page.locator(`.mkc[data-id="${ids.noContent}"]`)
    await xCard.scrollIntoViewIfNeeded()
    await xCard.dragTo(page.locator('[data-col="AWAITING_APPROVAL"]'))
    const toastDrag = await waitFor(async () => (await toasts(page)).find((t) => t.includes('legenda')), 6000)
    check('recusa', !!toastDrag && toastDrag === toastMenu && (await statusOf(ids.noContent)) === 'IN_PRODUCTION', 'arrastando o mesmo card: a MESMA frase', toastDrag)
    await mCtx.close()

    // ════════════════════════════════════════════════════════════════════
    // borda: 1024, o board rola sozinho perto da borda durante o arraste
    // ════════════════════════════════════════════════════════════════════
    phase = 'borda'
    const eCtx = await newCtx(browser, tok.marcel, { width: 1024, height: 800 })
    const ep = await open(eCtx, BOARD, 'marcel-1024')
    m = await metrics(ep)
    check('borda', m.lanesScroll > m.lanesClient, '1024 com 5 colunas cheias: há rolagem lateral', `${m.lanesScroll}/${m.lanesClient}`)
    // Fita no fim; pega um card de Ajustes pedidos e leva para Em produção, à esquerda.
    await ep.evaluate(() => {
      const l = document.querySelector('.mkb__lanes')
      l.scrollLeft = l.scrollWidth
    })
    await sleep(200)
    const maxLeft = (await metrics(ep)).scrollLeft
    const eCard = ep.locator(`.mkc[data-id="${ids.adjEdge}"]`)
    const eb = await eCard.boundingBox()
    await ep.mouse.move(eb.x + eb.width / 2, eb.y + 24)
    await ep.mouse.down()
    await ep.mouse.move(eb.x + eb.width / 2 - 20, eb.y + 30, { steps: 4 })
    await ep.mouse.move(m.lanesLeft + 12, eb.y + 40, { steps: 10 })
    await sleep(300)
    const midLeft = (await metrics(ep)).scrollLeft
    await shot(ep, 'borda-rolando-d1024.png')
    // Parado na borda, a fita vai até o começo; aí Em produção está inteira à vista.
    const reached = await waitFor(async () => {
      const mm = await metrics(ep)
      return mm.scrollLeft <= 0.5 && col(mm, 'IN_PRODUCTION').x >= mm.lanesLeft - 0.5 ? mm : null
    }, 5000, 80)
    check('borda', maxLeft > 0 && midLeft < maxLeft - 40 && !!reached, 'segurando na borda esquerda (cursor parado): a fita rola até Em produção aparecer', `${maxLeft} -> ${midLeft} -> ${reached?.scrollLeft}`)
    const ipCol = col(await metrics(ep), 'IN_PRODUCTION')
    await ep.mouse.move(ipCol.x + ipCol.w / 2, eb.y + 120, { steps: 6 })
    await ep.mouse.up()
    const edgeMoved = await waitFor(async () => (await statusOf(ids.adjEdge)) === 'IN_PRODUCTION', 8000)
    check('borda', edgeMoved, 'soltou em Em produção depois de rolar: o banco grava', await statusOf(ids.adjEdge))
    // E para a direita: arrasta da Ideia, segura na borda direita e volta.
    await ep.evaluate(() => (document.querySelector('.mkb__lanes').scrollLeft = 0))
    await sleep(200)
    const lc = ep.locator(`.mkc[data-id="${ids.long}"]`)
    const lb = await lc.boundingBox()
    await ep.mouse.move(lb.x + lb.width / 2, lb.y + 20)
    await ep.mouse.down()
    await ep.mouse.move(lb.x + lb.width / 2 + 20, lb.y + 26, { steps: 4 })
    await ep.mouse.move(Math.min(m.lanesRight, 1024) - 10, lb.y + 60, { steps: 10 })
    await sleep(900)
    const rightLeft = (await metrics(ep)).scrollLeft
    await ep.mouse.move(m.lanesLeft + 10, lb.y + 60, { steps: 10 })
    const backZero = await waitFor(async () => ((await metrics(ep)).scrollLeft <= 0.5 ? true : null), 5000, 80)
    const ideaCol = col(await metrics(ep), 'IDEA')
    await ep.mouse.move(ideaCol.x + ideaCol.w / 2, lb.y + 200, { steps: 6 })
    await ep.mouse.up()
    await sleep(600)
    check('borda', rightLeft > 150 && !!backZero && (await statusOf(ids.long)) === 'IDEA', 'segurando na borda direita rola para a direita, e na esquerda volta ao começo', `0 -> ${rightLeft} -> 0: ${!!backZero}`)
    await eCtx.close()

    // ════════════════════════════════════════════════════════════════════
    // grafica: a trilha da peça impressa
    // ════════════════════════════════════════════════════════════════════
    phase = 'grafica'
    ids.printApproved = await newCard('E2E Fit Placa aprovada para impressão', { kind: 'PRINT', networks: [] })
    await withVersion(ids.printApproved, 'PRINT')
    await moveApi(tok.marcel, ids.printApproved, 'AWAITING_APPROVAL')
    must(await api(tok.leticia, 'POST', `/cards/${ids.printApproved}/approve`, {}), 'aprovar peça')
    ids.printDelivered = await newCard('E2E Fit Folder entregue nas clínicas', { kind: 'PRINT', networks: [], status: 'IDEA' })
    ids.printSent = await newCard('E2E Fit Banner na gráfica', { kind: 'PRINT', networks: [], status: 'IDEA' })
    // Estado da gráfica direto no banco (o caminho de verdade é a tela Gráfica, coberta pelo marketing-print-e2e).
    await q(`UPDATE "MarketingCard" SET status='DELIVERED' WHERE id=$1`, [ids.printDelivered])
    await q(`UPDATE "MarketingCard" SET status='SENT_TO_PRINTER' WHERE id=$1`, [ids.printSent])
    const gCtx = await newCtx(browser, tok.marcel, { width: 1512, height: 900 })
    const gp = await open(gCtx, `${BOARD}?trilha=grafica`, 'marcel-grafica')
    m = await metrics(gp)
    const del = col(m, 'DELIVERED')
    // Outro roteiro (marketing-print-e2e) pode ter deixado peças entregues neste banco.
    const deliveredDb = (await q(`SELECT count(*)::int n FROM "MarketingCard" WHERE "groupId"=$1 AND kind='PRINT' AND status='DELIVERED' AND "archivedAt" IS NULL`, [G]))[0].n
    check('grafica', m.cols.map((c) => c.s).join() === 'IDEA,IN_PRODUCTION,AWAITING_APPROVAL,CHANGES_REQUESTED,APPROVED,SENT_TO_PRINTER,PROOF_RECEIVED,DELIVERED', 'Gráfica: as 8 colunas da trilha da peça', m.cols.map((c) => c.s).join(','))
    check(
      'grafica',
      del.collapsed && deliveredDb >= 1 && del.count === String(deliveredDb) && col(m, 'APPROVED').label === 'Aprovado para impressão' && !col(m, 'SENT_TO_PRINTER').collapsed,
      'Impresso e entregue começa recolhido com cards (o número do banco); "Aprovado para impressão" aberto',
      JSON.stringify([del, deliveredDb, col(m, 'APPROVED').label]),
    )
    check('grafica', m.lanesScroll <= m.lanesClient + 1, '1512: a Gráfica também cabe sem rolagem lateral', `${m.lanesScroll}/${m.lanesClient}`)
    await shot(gp, 'grafica-d1512-claro.png')
    const itemsG = await openMenu(gp, ids.printApproved)
    const desk = itemsG.filter((i) => PRINT_DESK.includes(i.to))
    const serverG = await allowedOf(tok.marcel, ids.printApproved)
    check(
      'grafica',
      desk.length === 3 && desk.every((i) => i.disabled && i.why === 'Envio, prova e entrega são pela tela Gráfica.') &&
        sameSet(enabledOf(itemsG), serverG.filter((s) => !PRINT_DESK.includes(s))),
      'peça aprovada: envio, prova e entrega desabilitados ("pela tela Gráfica"); o resto bate com o servidor',
      `menu ${enabledOf(itemsG)} / servidor ${serverG}`,
    )
    await shot(gp, 'grafica-menu-d1512.png')
    await gp.click('[role="menu"] [data-action="open-print"]')
    await gp.waitForURL(/\/marketing\/grafica/, { timeout: 8000 }).catch(() => {})
    check('grafica', gp.url().includes('/marketing/grafica') && gp.url().includes(`peca=${ids.printApproved}`), '"Abrir na Gráfica" leva à peça na tela Gráfica', gp.url().replace(WEB, ''))
    await goto(gp, `${BOARD}?trilha=grafica`)
    await gp.click('[data-col="DELIVERED"] [data-action="expand-column"]')
    await waitFor(async () => !col(await metrics(gp), 'DELIVERED').collapsed)
    await goto(gp, `${BOARD}?trilha=grafica`)
    const gStore = await gp.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), storeKey)
    check('grafica', !col(await metrics(gp), 'DELIVERED').collapsed && gStore.print?.DELIVERED === 'open', 'abrir Impresso e entregue fica guardado na trilha Gráfica', JSON.stringify(gStore))
    await goto(gp, BOARD)
    check('grafica', col(await metrics(gp), 'PUBLISHED').collapsed, 'a escolha da Gráfica não mexe no Digital (Publicado segue recolhido)')
    await gCtx.close()
    const gDark = await newCtx(browser, tok.marcel, { width: 1512, height: 900 }, 'dark')
    const gdp = await open(gDark, `${BOARD}?trilha=grafica`, 'marcel-grafica-escuro')
    await shot(gdp, 'grafica-d1512-escuro.png')
    await goto(gdp, BOARD)
    await shot(gdp, 'todos-status-d1512-escuro.png')
    await openMenu(gdp, ids.approved)
    await shot(gdp, 'menu-mover-d1512-escuro.png')
    await gDark.close()

    // ════════════════════════════════════════════════════════════════════
    // celular: 375 não muda
    // ════════════════════════════════════════════════════════════════════
    phase = 'celular'
    for (const theme of ['light', 'dark']) {
      const pCtx = await newCtx(browser, tok.marcel, { width: 375, height: 812, mobile: true }, theme)
      const pp = await open(pCtx, BOARD, `marcel-375-${theme}`)
      await pp.waitForSelector('.col-tabs [role="tab"]', { timeout: 10000 })
      const ui = await pp.evaluate(() => {
        const lanes = document.querySelector('.mkb__lanes')
        return {
          tabs: document.querySelectorAll('.col-tabs [role="tab"]').length,
          sw: document.documentElement.scrollWidth,
          moveBtns: document.querySelectorAll('[data-action="move-menu"]').length,
          rails: document.querySelectorAll('.mkb__rail, .mkb__col[data-collapsed]').length,
          widths: [...document.querySelectorAll('.mkb__col')].map((c) => Math.round(c.getBoundingClientRect().width)),
          lanesW: Math.round(lanes.getBoundingClientRect().width),
          inlineH: lanes.style.height,
        }
      })
      check(
        'celular',
        ui.tabs === 7 && ui.sw <= 375 && ui.moveBtns === 0 && ui.rails === 0 && ui.widths.every((w) => w === ui.lanesW) && ui.inlineH === '',
        `375 (${theme}): uma coluna por vez, 7 abas, sem rolagem lateral, sem faixa nem botão do computador`,
        JSON.stringify(ui),
      )
      await shot(pp, `celular-m375-${theme === 'light' ? 'claro' : 'escuro'}.png`)
      if (theme === 'light') {
        const hand = await finger(pp)
        const seedIdea = seed.cards.find((c) => c.title === 'Dicas de banho no inverno')
        const target = pp.locator(`.mkc[data-id="${seedIdea.id}"]`)
        await target.scrollIntoViewIfNeeded()
        const tb = await target.boundingBox()
        await hand.hold(tb.x + tb.width / 2, tb.y + tb.height / 2)
        const sheet = await waitFor(() => pp.locator('.mks[role="dialog"]').count(), 3000)
        const sheetUi = await pp.evaluate(() => ({
          current: document.querySelector('.mks__opt--current')?.getAttribute('data-move-to'),
          awaiting: document.querySelector('#mk-move-why-AWAITING_APPROVAL')?.textContent?.trim() ?? '',
          heights: [...document.querySelectorAll('.mks__opt')].map((b) => Math.round(b.getBoundingClientRect().height)),
        }))
        check('celular', sheet && sheetUi.current === 'IDEA' && sheetUi.heights.every((h) => h >= 48) && /Feche uma versão/.test(sheetUi.awaiting), '375: segurar abre a mesma folha "Mover para" (alvos de 48px), com o motivo do mesmo espelho', JSON.stringify(sheetUi))
        await shot(pp, 'celular-folha-m375-claro.png')
        await pp.locator('.mks__close').tap()
      }
      await pCtx.close()
    }
  } catch (error) {
    console.error(error)
    check('geral', false, 'o roteiro quebrou no meio', error.message)
  } finally {
    await browser.close()
    check('geral', allBad.length === 0, 'nenhuma resposta 401/5xx em nenhuma tela', allBad.join(' | '))
    check('geral', allErrors.length === 0, 'nenhum erro de JavaScript nas páginas', allErrors.join(' | '))
    await cleanup().catch((e) => console.error('limpeza:', e.message))
    await db.end()
  }

  const byCrit = {}
  for (const r of results) {
    byCrit[r.crit] ??= { ok: 0, fail: 0 }
    byCrit[r.crit][r.ok ? 'ok' : 'fail']++
  }
  console.log('\nResumo por critério:')
  for (const [k, v] of Object.entries(byCrit)) console.log(`  ${k}: ${v.fail ? 'FALHOU' : 'atendido'} (${v.ok} ok, ${v.fail} falha)`)
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK')
  process.exit(fails ? 1 : 0)
})()
