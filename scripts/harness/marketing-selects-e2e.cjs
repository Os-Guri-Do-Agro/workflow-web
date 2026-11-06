// Roteiro dos selects da ala Marketing: nenhum <select> nativo, todos pelo AppSelect.
//
// Uso (com a API e o Vite do harness no ar, banco com o seed da ala):
//   API=http://127.0.0.1:3639 WEB=http://localhost:5209 HARNESS_DB=wf_sel \
//   HARNESS_SEED=seed-marketing-out.wf_sel.json node marketing-selects-e2e.cjs
// Opcional: SHOTS=<pasta> (padrão prints/marketing-selects), ONLY=a,b,c,d,e.
//
// Partes:
//   a. código-fonte: zero <select> em src/features/marketing sem o comentário de
//      motivo (e o <datalist> nativo também precisa do motivo);
//   b. DOM: percorre as telas da ala e os diálogos de criação e conta os <select>
//      reais da página (zero) e os comboboxes do AppSelect;
//   c. teclado: abre 6 AppSelect representativos e escolhe com setas e Enter
//      (Escape devolve o foco ao gatilho; Enter na linha de lançamento rápido
//      abre a lista e NÃO lança);
//   d. voltar o valor: campos que salvam sozinhos, com a API recusando (page.route
//      responde 400): Tipo do card, Situação do parceiro, Situação da ativação e
//      Cor da empresa. Confere o campo, o banco, que foi UMA chamada por escolha
//      e que abrir e reabrir os painéis não grava nada;
//   e. celular 375px: o menu do AppSelect cabe na tela, o gatilho tem 44px, sem
//      rolagem lateral; prints claro e escuro em prints/marketing-selects/.
const { chromium } = require('playwright-core')
const { Client } = require('pg')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pickOption, pickByKeyboard, openSelect, closeSelect, selectedText, listOptions, optionTexts, combo } = require('./app-select.cjs')

const API = process.env.API ?? 'http://127.0.0.1:3639'
const WEB = process.env.WEB ?? 'http://localhost:5209'
const DB = process.env.HARNESS_DB ?? 'wf_sel'
const seed = JSON.parse(fs.readFileSync(process.env.HARNESS_SEED ?? path.join(__dirname, `seed-marketing-out.${DB}.json`), 'utf8'))
const SHOTS = process.env.SHOTS ?? path.join(__dirname, 'prints', 'marketing-selects')
const ONLY = (process.env.ONLY ?? '').toLowerCase().split(',').filter(Boolean)
const want = (part) => !ONLY.length || ONLY.includes(part)
fs.mkdirSync(SHOTS, { recursive: true })

const G = seed.groupId
const C = seed.companies
const SRC = path.resolve(__dirname, '../../src/features/marketing')
const base = `/marketing/g/${G}`

let fails = 0
let total = 0
const check = (cond, msg, extra = '') => {
  total++
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}${extra ? '  (' + extra + ')' : ''}`)
  if (!cond) fails++
}
const section = (name) => console.log(`\n== ${name}`)

// ── Token e chamadas diretas (cache, limite de 10 logins por minuto) ─────────
const TOKEN_CACHE = path.join(os.tmpdir(), `nevo-selects-e2e-tokens-${G}.json`)
let tokens = {}
try {
  tokens = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'))
} catch {
  tokens = {}
}
const checked = new Set()
async function token(key) {
  if (tokens[key] && !checked.has(key)) {
    const me = await fetch(`${API}/user/me`, { headers: { authorization: `Bearer ${tokens[key]}` } })
    if (me.ok) checked.add(key)
    else delete tokens[key]
  }
  if (tokens[key]) return tokens[key]
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${key}@nevo.test`, password: 'nevo1234' }),
  })
  const j = await r.json()
  if (!j.accessToken) throw new Error(`login ${key}: ${r.status}`)
  tokens[key] = j.accessToken
  checked.add(key)
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify(tokens))
  return tokens[key]
}
async function call(key, method, route, body) {
  const r = await fetch(`${API}${base}${route}`, {
    method,
    headers: { authorization: `Bearer ${await token(key)}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try {
    data = await r.json()
  } catch {}
  return { status: r.status, data }
}

let db
const q = async (sql, params = []) => (await db.query(sql, params)).rows

// ── Navegador ────────────────────────────────────────────────────────────────
const DESK = { width: 1440, height: 1000 }
const PHONE = { width: 375, height: 812, mobile: true }
const badNet = []
const pageErrors = []
async function openCtx(browser, who, vp, theme = 'light') {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.mobile ? 2 : 1,
    isMobile: !!vp.mobile,
    hasTouch: !!vp.mobile,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    reducedMotion: 'reduce',
  })
  const tk = await token(who)
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
    [tk, C.pet, theme],
  )
  return ctx
}
async function openPage(ctx, route, label) {
  const page = await ctx.newPage()
  page.on('response', (res) => {
    const u = res.url()
    if (u.startsWith(API) && (res.status() === 401 || res.status() >= 500)) badNet.push(`${label}: ${res.status()} ${res.request().method()} ${u.replace(API, '')}`)
  })
  page.on('pageerror', (e) => pageErrors.push(`${label}: ${String(e.message).slice(0, 160)}`))
  await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle' })
  return page
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name) })
const nativeCount = (page) => page.evaluate(() => document.querySelectorAll('select').length)
const comboCount = (page) => page.locator('button[role="combobox"]').count()
async function waitFor(fn, ms = 8000) {
  const t0 = Date.now()
  for (;;) {
    const v = await fn().catch(() => null)
    if (v) return v
    if (Date.now() - t0 > ms) return null
    await new Promise((r) => setTimeout(r, 150))
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// a. Código-fonte
// ═══════════════════════════════════════════════════════════════════════════
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(vue|ts)$/.test(e.name)) out.push(p)
  }
  return out
}
function partA() {
  section('a. código-fonte (src/features/marketing)')
  const files = walk(SRC)
  const bareSelect = []
  const bareDatalist = []
  let appSelectTags = 0
  let nativeWithReason = 0
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/)
    lines.forEach((line, i) => {
      appSelectTags += (line.match(/<AppSelect\b/g) ?? []).length
      const near = lines.slice(Math.max(0, i - 2), i + 1).join('\n')
      const reason = /nativ[oa]/i.test(near) && /(<!--|\/\/|\/\*)/.test(near)
      const isLineComment = /^\s*(\/\/|\*|<!--)/.test(line)
      if (/<select\b/.test(line) && !isLineComment) {
        if (reason) nativeWithReason++
        else bareSelect.push(`${path.relative(SRC, f)}:${i + 1}`)
      }
      if (/<datalist\b/.test(line) && !reason) bareDatalist.push(`${path.relative(SRC, f)}:${i + 1}`)
    })
  }
  check(bareSelect.length === 0, 'nenhum <select> sem o comentário de motivo', bareSelect.join(', '))
  check(nativeWithReason === 0, `<select> nativos que ficaram com motivo: ${nativeWithReason} (a ala fechou com zero)`)
  check(bareDatalist.length === 0, '<datalist> nativo (forma de pagamento) tem o motivo registrado', bareDatalist.join(', '))
  check(appSelectTags >= 60, `a ala usa o AppSelect em ${appSelectTags} lugares`)
  const css = fs.readFileSync(path.join(SRC, 'marketing.css'), 'utf8')
  check(/app-select__trigger/.test(css), 'marketing.css cuida do alvo de toque de 44px do AppSelect no celular')
}

// ═══════════════════════════════════════════════════════════════════════════
// b. DOM: telas e diálogos
// ═══════════════════════════════════════════════════════════════════════════
async function sweep(page, label, expectCombos) {
  const native = await nativeCount(page)
  const combos = await comboCount(page)
  check(native === 0, `${label}: zero <select> no DOM`, `${native}`)
  if (expectCombos) check(combos >= expectCombos, `${label}: ${combos} AppSelect (esperado ${expectCombos} ou mais)`)
}
async function dialogSweep(page, label, open, expectCombos) {
  try {
    await open()
    await page.locator('[role="dialog"]').first().waitFor({ state: 'visible', timeout: 6000 })
    await page.waitForTimeout(250)
    await sweep(page, `${label} (diálogo)`, expectCombos)
    await page.keyboard.press('Escape')
    await page.locator('[role="dialog"]').first().waitFor({ state: 'detached', timeout: 4000 }).catch(() => {})
  } catch (e) {
    check(false, `${label}: abriu o diálogo`, String(e.message).split('\n')[0].slice(0, 120))
    await page.keyboard.press('Escape').catch(() => {})
  }
}
async function partB(browser) {
  section('b. telas da ala e diálogos (1440), sem <select> nativo')
  const ctx = await openCtx(browser, 'nicolas', DESK)
  const cards = seed.cards
  const idea = cards.find((c) => c.status === 'IDEA') ?? cards[0]

  const page = await openPage(ctx, '/marketing', 'b')
  await page.waitForSelector('.mk-layout__tabs', { timeout: 15000 })
  await sweep(page, 'Painel')

  await page.goto(`${WEB}/marketing/aprovacoes`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.mka__filters', { timeout: 15000 })
  await sweep(page, 'Aprovações', 3)
  await dialogSweep(page, 'Aprovações: novo card', () => page.locator('[data-action="new-card"]').click(), 3)

  await page.goto(`${WEB}/marketing/calendario`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.mkcal__bar', { timeout: 15000 })
  await sweep(page, 'Calendário', 1)
  await dialogSweep(page, 'Calendário: novo card', () => page.locator('[data-action="new-card"]').click(), 2)

  await page.goto(`${WEB}/marketing/ideias`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.iv-quick', { timeout: 15000 })
  await sweep(page, 'Ideias', 2)
  await dialogSweep(page, 'Ideias: mais detalhes', () => page.getByRole('button', { name: 'Com mais detalhes' }).click(), 2)

  await page.goto(`${WEB}/marketing/campanhas`, { waitUntil: 'networkidle' })
  await sweep(page, 'Campanhas', 1)
  await dialogSweep(page, 'Campanhas: nova', () => page.locator('[data-action="new-campaign"]').click(), 1)

  await page.goto(`${WEB}/marketing/utm`, { waitUntil: 'networkidle' })
  await sweep(page, 'UTMs e QR', 2)
  await dialogSweep(page, 'UTMs: nova', () => page.getByRole('button', { name: 'Nova UTM' }).first().click(), 3)

  await page.goto(`${WEB}/marketing/grafica`, { waitUntil: 'networkidle' })
  await sweep(page, 'Gráfica')
  await dialogSweep(page, 'Gráfica: nova peça', () => page.getByRole('button', { name: /Nova peça/ }).first().click(), 1)

  await page.goto(`${WEB}/marketing/ativacoes`, { waitUntil: 'networkidle' })
  await sweep(page, 'Ativações')
  await dialogSweep(page, 'Ativações: nova', () => page.getByRole('button', { name: 'Nova ativação' }).first().click(), 3)

  await page.goto(`${WEB}/marketing/parceiros`, { waitUntil: 'networkidle' })
  await sweep(page, 'Parceiros', 2)
  await dialogSweep(page, 'Parceiros: novo', () => page.getByRole('button', { name: 'Novo parceiro' }).first().click(), 3)

  await page.goto(`${WEB}/marketing/financeiro`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const lanc = page.getByRole('tab', { name: /Lançamentos/ }).or(page.getByRole('link', { name: /Lançamentos/ }))
  if (await lanc.count()) await lanc.first().click()
  await page.waitForSelector('.fe-quick', { timeout: 10000 }).catch(() => {})
  await sweep(page, 'Financeiro: lançamentos', 4)
  await dialogSweep(page, 'Financeiro: lançamento completo', () => page.getByRole('button', { name: 'Lançamento completo' }).click(), 4)

  await page.goto(`${WEB}/marketing/links`, { waitUntil: 'networkidle' })
  await sweep(page, 'Links', 1)
  await dialogSweep(page, 'Links: novo', () => page.locator('[data-action="new-link"]').click(), 2)

  await page.goto(`${WEB}/marketing/acervo`, { waitUntil: 'networkidle' })
  await sweep(page, 'Acervo')

  await page.goto(`${WEB}/marketing/configuracoes`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.sc__row', { timeout: 15000 })
  await sweep(page, 'Configurações', 1)
  await dialogSweep(page, 'Configurações: convidar', () => page.getByRole('button', { name: 'Convidar' }).click(), 0)

  await page.goto(`${WEB}/marketing/cards/${idea.id}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid="card-kind"]', { timeout: 15000 })
  await sweep(page, 'Card', 2)

  check(badNet.length === 0, 'telas: nenhuma 401/5xx', badNet.join(', '))
  check(pageErrors.length === 0, 'telas: nenhum erro de página', pageErrors.slice(0, 2).join(' | '))
  await ctx.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// c. Teclado
// ═══════════════════════════════════════════════════════════════════════════
async function partC(browser) {
  section('c. teclado: abrir, setas, Enter e Escape em 6 AppSelect')
  const ctx = await openCtx(browser, 'nicolas', DESK)
  const page = await openPage(ctx, '/marketing/aprovacoes', 'c')
  await page.waitForSelector('.mka__filters', { timeout: 15000 })

  // 1. Aprovações: filtro de status (URL)
  const status = page.locator('[data-sel="status"]')
  const statusOpts = await listOptions(page, status)
  check(statusOpts[0] === 'Todos os status' && statusOpts.length > 3, '1. status: a lista traz "Todos os status" e as colunas', statusOpts.join(' | '))
  await pickByKeyboard(page, status, 'Em produção')
  await waitFor(async () => page.url().includes('status=IN_PRODUCTION'))
  check(page.url().includes('status=IN_PRODUCTION'), '1. status: escolher "Em produção" por seta e Enter filtra pela URL', page.url())
  check((await selectedText(page, status)) === 'Em produção', '1. status: o gatilho mostra o escolhido')
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('role'))
  check(focused === 'combobox', '1. status: o foco volta ao gatilho depois de escolher', `${focused}`)
  // Escape fecha sem escolher
  await openSelect(page, status)
  await page.keyboard.press('Escape')
  await page.locator('[role="listbox"]').first().waitFor({ state: 'detached', timeout: 6000 }).catch(() => {})
  check((await page.locator('[role="listbox"]').count()) === 0 && (await selectedText(page, status)) === 'Em produção', '1. status: Escape fecha a lista e mantém o valor')
  await pickByKeyboard(page, status, 'Todos os status')
  await waitFor(async () => !page.url().includes('status='))
  check(!page.url().includes('status='), '1. status: voltar a "Todos os status" limpa a URL')

  // 2. Novo card: tipo (diálogo)
  await page.locator('[data-action="new-card"]').click()
  const dlg = page.locator('[role="dialog"]').first()
  await dlg.waitFor({ state: 'visible', timeout: 6000 })
  const kind = dlg.locator('[data-field="kind"]')
  await pickByKeyboard(page, kind, 'Reel')
  check((await selectedText(page, kind)) === 'Reel', '2. novo card: tipo escolhido por teclado dentro do diálogo', await selectedText(page, kind))
  check((await dlg.isVisible()) === true, '2. novo card: o diálogo continua aberto depois de escolher')
  await shot(page, 'novo-card-teclado-d1440.png')
  // Escape com a lista aberta fecha só a lista; o diálogo fica (o segundo Escape fecha o diálogo)
  await openSelect(page, kind)
  await page.keyboard.press('Escape')
  await page.locator('[role="listbox"]').first().waitFor({ state: 'detached', timeout: 3000 }).catch(() => {})
  check((await dlg.isVisible()) && (await selectedText(page, kind)) === 'Reel', '2. novo card: Escape com a lista aberta fecha só a lista e o diálogo fica')
  await page.keyboard.press('Escape')
  await dlg.waitFor({ state: 'detached', timeout: 4000 }).catch(() => {})
  check(!(await dlg.isVisible().catch(() => false)), '2. novo card: o segundo Escape fecha o diálogo')

  // 3. Calendário: rede
  await page.goto(`${WEB}/marketing/calendario`, { waitUntil: 'networkidle' })
  const net = page.locator('[data-testid="calendar-network"]')
  await net.waitFor({ timeout: 10000 })
  await pickByKeyboard(page, net, 'Instagram')
  await waitFor(async () => page.url().includes('rede=INSTAGRAM'))
  check(page.url().includes('rede=INSTAGRAM'), '3. calendário: rede escolhida por teclado vai para a URL', page.url())
  // Setas dentro do select NÃO andam o calendário (o atalho global ignora o combobox)
  const titleBefore = await page.locator('.mkcal__title').innerText()
  await combo(page, net).focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowRight')
  const titleAfter = await page.locator('.mkcal__title').innerText()
  check(titleBefore === titleAfter, '3. calendário: setas no select não mudam o período', `${titleBefore} / ${titleAfter}`)
  await openSelect(page, net)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Escape')
  check((await page.locator('.mkcal__title').innerText()) === titleBefore, '3. calendário: setas com a lista aberta também não mudam o período')

  // 4. Parceiros: tipo
  await page.goto(`${WEB}/marketing/parceiros`, { waitUntil: 'networkidle' })
  const pk = page.locator('[data-filter="tipo"]')
  await pk.waitFor({ timeout: 10000 })
  const pkOpts = await listOptions(page, pk)
  await pickByKeyboard(page, pk, pkOpts[2])
  await waitFor(async () => page.url().includes('tipo='))
  check(page.url().includes('tipo=') && (await selectedText(page, pk)) === pkOpts[2], `4. parceiros: tipo "${pkOpts[2]}" por teclado`, page.url())

  // 5. Ideias: ordenar
  await page.goto(`${WEB}/marketing/ideias`, { waitUntil: 'networkidle' })
  const sort = page.locator('[data-testid="idea-sort"]')
  await sort.waitFor({ timeout: 10000 })
  // A ordem mora na URL (?ordem=recentes) e o router.replace é assíncrono: espera a rota trocar.
  await pickByKeyboard(page, sort, 'Mais recentes')
  await waitFor(async () => page.url().includes('ordem=recentes') && (await selectedText(page, sort)) === 'Mais recentes')
  check(
    page.url().includes('ordem=recentes') && (await selectedText(page, sort)) === 'Mais recentes',
    '5. ideias: ordenar por teclado',
    page.url(),
  )
  await pickByKeyboard(page, sort, 'Mais curtidas')
  await waitFor(async () => !page.url().includes('ordem=') && (await selectedText(page, sort)) === 'Mais curtidas')
  check(
    !page.url().includes('ordem=') && (await selectedText(page, sort)) === 'Mais curtidas',
    '5. ideias: e voltar',
    `${page.url()} | ${await selectedText(page, sort)}`,
  )

  // 6. Financeiro: Enter no select da linha rápida abre a lista e NÃO lança
  await page.goto(`${WEB}/marketing/financeiro`, { waitUntil: 'networkidle' })
  const lanc = page.getByRole('tab', { name: /Lançamentos/ }).or(page.getByRole('link', { name: /Lançamentos/ }))
  if (await lanc.count()) await lanc.first().click()
  await page.waitForSelector('.fe-quick', { timeout: 10000 })
  const posts = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/expenses/.test(r.url())) posts.push(r.url())
  })
  await page.locator('.fe-quick input[aria-label="Descrição do lançamento"]').fill('E2E selects não lança')
  const cat = page.locator('.fe-quick [data-quick="category"]')
  await combo(page, cat).focus()
  await page.keyboard.press('Enter')
  await page.locator('[role="listbox"]').first().waitFor({ state: 'visible', timeout: 4000 })
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.locator('[role="listbox"]').first().waitFor({ state: 'detached', timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(400)
  check(posts.length === 0, '6. financeiro: Enter no select da linha rápida escolhe a opção e NÃO lança o lançamento', `${posts.length} POST`)
  const cats = await listOptions(page, page.locator('[data-filter="categoria"]'))
  check(cats[0] === 'Todas as categorias' && cats.length >= 2, '6. financeiro: filtro de categoria com "Todas as categorias"', cats.slice(0, 3).join(' | '))
  await page.locator('.fe-quick input[aria-label="Descrição do lançamento"]').fill('')
  await ctx.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// d. O valor volta quando a API recusa
// ═══════════════════════════════════════════════════════════════════════════
const REFUSED = 'Recusado de propósito pelo teste'
async function refuseAll(page, urlRe) {
  const hits = []
  await page.route(urlRe, async (route) => {
    const req = route.request()
    if (req.method() !== 'PATCH') return route.fallback()
    hits.push(req.url())
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ statusCode: 400, message: REFUSED }) })
  })
  return hits
}
async function partD(browser) {
  section('d. campos que salvam sozinhos voltam ao valor anterior quando a API recusa (400)')
  const ctx = await openCtx(browser, 'nicolas', DESK)
  const mutations = []
  ctx.on('request', (r) => {
    if (/\/marketing\//.test(r.url()) && r.method() !== 'GET' && r.method() !== 'OPTIONS') mutations.push(`${r.method()} ${r.url().replace(API, '')}`)
  })

  // Dados: parceiro e ativação criados pela API (apagados no fim)
  const stamp = Date.now().toString(36)
  const p = await call('nicolas', 'POST', '/partners', { companyId: C.pet, name: `E2E Selects Parceiro ${stamp}`, kind: 'PET_SHOP', status: 'NEGOTIATING' })
  const a = await call('nicolas', 'POST', '/activations', {
    companyId: C.pet, kind: 'FAIR', title: `E2E Selects Ativação ${stamp}`, status: 'PLANNED', startAt: new Date(Date.now() + 5 * 864e5).toISOString(),
  })
  check(p.status === 201 && a.status === 201, 'dados: parceiro e ativação criados', `${p.status}/${a.status}`)
  const cardId = (seed.cards.find((c) => c.status === 'IDEA') ?? seed.cards[0]).id
  const cardBefore = (await q('SELECT kind FROM "MarketingCard" WHERE id=$1', [cardId]))[0].kind

  // ── 1. Card: Tipo ──
  {
    const page = await openPage(ctx, `/marketing/cards/${cardId}`, 'd1')
    const field = page.locator('[data-testid="card-kind"]')
    await field.waitFor({ timeout: 15000 })
    await page.waitForTimeout(800)
    check(mutations.length === 0, '1. card: abrir a tela não grava nada', mutations.join(', '))
    const before = await selectedText(page, field)
    const hits = await refuseAll(page, new RegExp(`${base}/cards/${cardId}$`))
    const target = before === 'Story' ? 'Vídeo' : 'Story'
    await pickOption(page, field, target)
    await waitFor(async () => (await page.locator('body').innerText()).includes(REFUSED))
    check((await page.locator('body').innerText()).includes(REFUSED), '1. card: o aviso mostra a frase da API')
    await page.waitForTimeout(300)
    const after = await selectedText(page, field)
    check(after === before, `1. card: o Tipo voltou a "${before}" depois da recusa`, `mostra "${after}"`)
    check(hits.length === 1, '1. card: uma chamada por escolha', `${hits.length}`)
    check((await q('SELECT kind FROM "MarketingCard" WHERE id=$1', [cardId]))[0].kind === cardBefore, '1. card: o banco não mudou')
    await page.unroute(new RegExp(`${base}/cards/${cardId}$`))
    // Controle: sem a recusa, a mesma escolha grava e o campo mostra a escolha
    await pickOption(page, field, target)
    const saved = await waitFor(async () => (await q('SELECT kind FROM "MarketingCard" WHERE id=$1', [cardId]))[0].kind !== cardBefore)
    check(!!saved && (await selectedText(page, field)) === target, '1. card: sem recusa o Tipo grava e o campo mostra a escolha', await selectedText(page, field))
    await pickOption(page, field, before)
    await waitFor(async () => (await q('SELECT kind FROM "MarketingCard" WHERE id=$1', [cardId]))[0].kind === cardBefore)
    await shot(page, 'card-tipo-d1440.png')
    await page.close()
  }

  // ── 2. Parceiro: Situação ──
  {
    mutations.length = 0
    const page = await openPage(ctx, `/marketing/parceiros?parceiro=${p.data.id}`, 'd2')
    const field = page.getByRole('combobox', { name: 'Situação do parceiro', exact: true })
    await field.waitFor({ timeout: 15000 })
    await page.waitForTimeout(800)
    check(mutations.length === 0, '2. parceiro: abrir o painel não grava nada', mutations.join(', '))
    const before = await selectedText(page, field)
    check(before === 'Negociando', '2. parceiro: o campo mostra a situação gravada', before)
    const hits = await refuseAll(page, new RegExp(`${base}/partners/${p.data.id}$`))
    await pickOption(page, field, 'Encerrado')
    await waitFor(async () => (await page.locator('body').innerText()).includes(REFUSED))
    await page.waitForTimeout(300)
    check((await page.locator('body').innerText()).includes(REFUSED), '2. parceiro: o aviso mostra a frase da API')
    check((await selectedText(page, field)) === before, '2. parceiro: a Situação voltou a "Negociando"', await selectedText(page, field))
    check(hits.length === 1, '2. parceiro: uma chamada por escolha', `${hits.length}`)
    check((await q('SELECT status FROM "MarketingPartner" WHERE id=$1', [p.data.id]))[0].status === 'NEGOTIATING', '2. parceiro: o banco não mudou')
    // Fecha e reabre o painel: continua sem gravar
    mutations.length = 0
    await page.unroute(new RegExp(`${base}/partners/${p.data.id}$`))
    await page.goto(`${WEB}/marketing/parceiros`, { waitUntil: 'networkidle' })
    await page.goto(`${WEB}/marketing/parceiros?parceiro=${p.data.id}`, { waitUntil: 'networkidle' })
    await page.getByRole('combobox', { name: 'Situação do parceiro', exact: true }).waitFor({ timeout: 15000 })
    await page.waitForTimeout(600)
    check(mutations.length === 0, '2. parceiro: reabrir o painel não grava nada', mutations.join(', '))
    await shot(page, 'parceiro-situacao-d1440.png')
    await page.close()
  }

  // ── 3. Ativação: Situação ──
  {
    mutations.length = 0
    const page = await openPage(ctx, `/marketing/ativacoes?ativacao=${a.data.id}`, 'd3')
    const field = page.getByRole('combobox', { name: 'Situação da ativação', exact: true })
    await field.waitFor({ timeout: 15000 })
    await page.waitForTimeout(800)
    check(mutations.length === 0, '3. ativação: abrir o painel não grava nada', mutations.join(', '))
    const before = await selectedText(page, field)
    const hits = await refuseAll(page, new RegExp(`${base}/activations/${a.data.id}$`))
    await pickOption(page, field, 'Cancelada')
    await waitFor(async () => (await page.locator('body').innerText()).includes(REFUSED))
    await page.waitForTimeout(300)
    check((await page.locator('body').innerText()).includes(REFUSED), '3. ativação: o aviso mostra a frase da API')
    check((await selectedText(page, field)) === before, `3. ativação: a Situação voltou a "${before}"`, await selectedText(page, field))
    check(hits.length === 1, '3. ativação: uma chamada por escolha', `${hits.length}`)
    check((await q('SELECT status FROM "MarketingActivation" WHERE id=$1', [a.data.id]))[0].status === 'PLANNED', '3. ativação: o banco não mudou')
    await page.close()
  }

  // ── 4. Configurações: Cor da empresa ──
  {
    mutations.length = 0
    const page = await openPage(ctx, '/marketing/configuracoes', 'd4')
    const wrap = page.locator(`[data-color-for="${C.pet}"]`)
    await wrap.waitFor({ timeout: 15000 })
    await page.waitForTimeout(800)
    check(mutations.length === 0, '4. configurações: abrir a tela não grava nada', mutations.join(', '))
    const before = await selectedText(page, wrap)
    const hits = await refuseAll(page, new RegExp(`${base}/companies/${C.pet}$`))
    const target = before === 'Rosa' ? 'Roxo' : 'Rosa'
    await pickOption(page, wrap, target)
    await waitFor(async () => (await page.locator('body').innerText()).includes(REFUSED))
    await page.waitForTimeout(500)
    check((await page.locator('body').innerText()).includes(REFUSED), '4. configurações: o aviso mostra a frase da API')
    check((await selectedText(page, wrap)) === before, `4. configurações: a Cor voltou a "${before}"`, await selectedText(page, wrap))
    check(hits.length === 1, '4. configurações: uma chamada por escolha', `${hits.length}`)
    await shot(page, 'configuracoes-cor-d1440.png')
    await page.close()
  }

  // Limpeza
  await call('nicolas', 'DELETE', `/partners/${p.data.id}`)
  await call('nicolas', 'DELETE', `/activations/${a.data.id}`)
  check(badNet.length === 0, 'campos que salvam: nenhuma 401/5xx', badNet.join(', '))
  await ctx.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// e. Celular 375px
// ═══════════════════════════════════════════════════════════════════════════
async function partE(browser) {
  section('e. celular 375px: menu dentro da tela, gatilho de 44px, claro e escuro')
  for (const theme of ['light', 'dark']) {
    const tn = theme === 'light' ? 'claro' : 'escuro'
    const ctx = await openCtx(browser, 'nicolas', PHONE, theme)
    const page = await openPage(ctx, '/marketing/aprovacoes', `e-${theme}`)
    await page.waitForSelector('.mka__bar', { timeout: 15000 })
    // Os filtros ficam atrás do botão "Filtros" no celular
    await page.getByRole('button', { name: /^Filtros/ }).click()
    const st = page.locator('[data-sel="rede"]').or(page.locator('[data-sel="resp"]')).first()
    await st.waitFor({ timeout: 6000 })
    const h = await combo(page, st).evaluate((el) => el.getBoundingClientRect().height)
    check(h >= 43.5, `${tn}: gatilho do filtro com 44px no celular`, `${Math.round(h)}px`)
    await shot(page, `aprovacoes-filtros-${tn}-m375.png`)
    await openSelect(page, st)
    const box = await page.locator('[role="listbox"]').first().boundingBox()
    const vp = page.viewportSize()
    check(!!box && box.x >= 0 && box.x + box.width <= vp.width + 0.5 && box.y >= 0 && box.y + box.height <= vp.height + 0.5, `${tn}: o menu do AppSelect cabe na tela`, box && `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}`)
    await shot(page, `aprovacoes-menu-${tn}-m375.png`)
    await page.keyboard.press('Escape')

    // Diálogo de novo card
    await page.locator('[data-action="new-card"]').click()
    const dlg = page.locator('[role="dialog"]').first()
    await dlg.waitFor({ state: 'visible', timeout: 6000 })
    const kind = dlg.locator('[data-field="kind"]')
    const h2 = await combo(page, kind).evaluate((el) => el.getBoundingClientRect().height)
    check(h2 >= 43.5, `${tn}: Tipo do novo card com 44px`, `${Math.round(h2)}px`)
    await openSelect(page, kind)
    const b2 = await page.locator('[role="listbox"]').first().boundingBox()
    check(!!b2 && b2.x >= 0 && b2.x + b2.width <= vp.width + 0.5 && b2.y >= 0 && b2.y + b2.height <= vp.height + 0.5, `${tn}: menu do Tipo dentro da tela`, b2 && `${Math.round(b2.x)},${Math.round(b2.y)} ${Math.round(b2.width)}x${Math.round(b2.height)}`)
    await shot(page, `novo-card-menu-${tn}-m375.png`)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    check((await page.evaluate(() => document.documentElement.scrollWidth)) <= vp.width, `${tn}: sem rolagem lateral nas Aprovações`)

    // Outras telas: sem rolagem lateral e gatilhos de 44px
    for (const [route, ready, label] of [
      ['/marketing/parceiros', '.pv__list', 'Parceiros'],
      ['/marketing/calendario', '.mkcal__bar', 'Calendário'],
      ['/marketing/ideias', '.iv-quick', 'Ideias'],
      ['/marketing/configuracoes', '.sc__row', 'Configurações'],
    ]) {
      await page.goto(`${WEB}${route}`, { waitUntil: 'networkidle' })
      await page.waitForSelector(ready, { timeout: 15000 })
      const heights = await page.evaluate(() => [...document.querySelectorAll('button[role="combobox"]')].map((b) => Math.round(b.getBoundingClientRect().height)))
      check(heights.length > 0 && heights.every((x) => x >= 44), `${tn}: ${label}: ${heights.length} gatilhos, todos com 44px`, heights.join(','))
      check((await page.evaluate(() => document.documentElement.scrollWidth)) <= vp.width, `${tn}: ${label}: sem rolagem lateral`)
      check((await nativeCount(page)) === 0, `${tn}: ${label}: zero <select> nativo`)
      await shot(page, `${label.toLowerCase()}-${tn}-m375.png`)
    }
    // Menu aberto na Configurações (cor da empresa, perto da borda direita)
    const color = page.locator(`[data-color-for="${C.pet}"]`)
    if (await color.count()) {
      await openSelect(page, color)
      const b3 = await page.locator('[role="listbox"]').first().boundingBox()
      check(!!b3 && b3.x >= 0 && b3.x + b3.width <= vp.width + 0.5 && b3.y >= 0 && b3.y + b3.height <= vp.height + 0.5, `${tn}: menu da Cor (borda direita) dentro da tela`, b3 && `${Math.round(b3.x)},${Math.round(b3.y)} ${Math.round(b3.width)}x${Math.round(b3.height)}`)
      await shot(page, `configuracoes-menu-${tn}-m375.png`)
      await page.keyboard.press('Escape')
    }
    await ctx.close()
  }
  // Desktop, claro e escuro, para o Nicolas olhar
  for (const theme of ['light', 'dark']) {
    const tn = theme === 'light' ? 'claro' : 'escuro'
    const ctx = await openCtx(browser, 'nicolas', DESK, theme)
    const page = await openPage(ctx, '/marketing/aprovacoes', `e-d-${theme}`)
    await page.waitForSelector('.mka__filters', { timeout: 15000 })
    await openSelect(page, page.locator('[data-sel="status"]'))
    await shot(page, `aprovacoes-menu-${tn}-d1440.png`)
    await page.keyboard.press('Escape')
    await page.goto(`${WEB}/marketing/financeiro`, { waitUntil: 'networkidle' })
    const lanc = page.getByRole('tab', { name: /Lançamentos/ }).or(page.getByRole('link', { name: /Lançamentos/ }))
    if (await lanc.count()) await lanc.first().click()
    await page.waitForSelector('.fe-quick', { timeout: 10000 }).catch(() => {})
    await shot(page, `financeiro-filtros-${tn}-d1440.png`)
    await ctx.close()
  }
  check(badNet.length === 0, 'celular: nenhuma 401/5xx', badNet.join(', '))
}

async function main() {
  db = new Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
  await db.connect()
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    if (want('a')) partA()
    if (want('b')) await partB(browser)
    if (want('c')) await partC(browser)
    if (want('d')) await partD(browser)
    if (want('e')) await partE(browser)
  } finally {
    await browser.close()
    await db.end()
  }
  console.log(`\n${fails ? `${fails} FALHA(S)` : 'TUDO OK'}  (${total - fails}/${total})`)
  process.exit(fails ? 1 : 0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
