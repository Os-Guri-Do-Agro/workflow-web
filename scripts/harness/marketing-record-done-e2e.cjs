// Roteiro de ponta a ponta do "Registrar como já publicado" e da volta pela
// origem (ala Marketing, 24/11/2026). Pedido da Leticia (19/11), com prints:
// soltar em Publicado dava "Esse passo não existe no fluxo do card", o "Mudar
// status" só mostrava Ideia e Em produção, e editar pelo Calendário "jogava
// para Aprovações". Prova, pela tela (Edge headless) e pela API:
//   board    Admin solta em Publicado: abre o registro (data e link), grava
//            Publicado com a data de verdade, sem erro; o Editor ouve o motivo
//   menu     "Mover para" do Admin: Publicado liberado como registro; o resto
//            bate com o `allowedMoves` do servidor; cancelar não muda nada
//   card     "Mudar status" lista os 7 status, com o motivo de quem não pode
//            ir; registrar pela página (data no futuro recusada, link aparece)
//   origem   card aberto pelo Calendário volta para o Calendário (mesma vista e
//            dia), com a aba e o breadcrumb certos; pelo board e por link
//            colado, Aprovações
//   grafica  peça impressa: soltar em Impresso e entregue registra a entrega
//   celular  375px: a folha "Mover para" traz o registro e abre o diálogo
//   api      Editor 403, data no futuro 400, link sem http 400
// Prints claro e escuro em prints/marketing-record-done/.
//
// Uso:
//   PGPORT=55442 API=http://127.0.0.1:3661 WEB=http://localhost:5174 HARNESS_DB=wf_rec \
//   node marketing-record-done-e2e.cjs
// Pré-requisitos: banco do marketing-db.sh, fake-storage (54329), a API (api-run.sh) e o Vite.
// Escreve só no banco do harness: cards "E2E Rec ..." são recriados a cada rodada e apagados no fim.
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const pg = require('pg')

const API = process.env.API ?? 'http://127.0.0.1:3661'
const WEB = process.env.WEB ?? 'http://localhost:5174'
const DB = process.env.HARNESS_DB ?? 'wf_rec'
const PGPORT = process.env.PGPORT ?? '55432'
const seed = JSON.parse(fs.readFileSync(path.resolve(__dirname, `seed-marketing-out.${DB}.json`), 'utf8'))
const OUT = process.env.SHOTS ?? path.join(__dirname, 'prints', 'marketing-record-done')
fs.mkdirSync(OUT, { recursive: true })

const G = seed.groupId
const C = seed.companies
const BOARD = '/marketing/aprovacoes'
// O board só com os cards do roteiro: os de outros roteiros no mesmo banco fariam
// as colunas rolarem de lado, e o arraste até a faixa da borda erraria o alvo.
const MINE = `${BOARD}?q=${encodeURIComponent('E2E Rec')}`
const DIGITAL = ['IDEA', 'IN_PRODUCTION', 'AWAITING_APPROVAL', 'CHANGES_REQUESTED', 'APPROVED', 'SCHEDULED', 'PUBLISHED']
const DESK = { width: 1440, height: 900 }

let fails = 0
const check = (crit, cond, msg, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} [${crit}] ${msg}${extra ? '  (' + String(extra).slice(0, 400) + ')' : ''}`)
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

// ── API ─────────────────────────────────────────────────────────────────────
const CACHE = path.join(os.tmpdir(), 'nevo-harness-mkrec-tokens.json')
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
  const r = await fetch(`${API}/marketing/g/${G}${route}`, {
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

// ── Navegador ───────────────────────────────────────────────────────────────
const allBad = []
const allErrors = []
let phase = 'início'

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
  page.on('pageerror', (e) => allErrors.push(`${who}@${phase}: ${e.message}`))
  await goto(page, route)
  return page
}

async function goto(page, route) {
  await page.goto(WEB + route, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.addStyleTag({ content: '#__vue-devtools-container__{display:none!important}' }).catch(() => {})
  if (route.startsWith(BOARD)) await page.waitForSelector('.mkb__col', { timeout: 15000 })
  await sleep(400)
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) })
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent?.trim() ?? ''))

function menuItems(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[role="menu"] [data-move-to]')].map((el) => ({
      to: el.dataset.moveTo,
      disabled: el.hasAttribute('data-disabled'),
      record: el.hasAttribute('data-record'),
      current: el.classList.contains('is-current'),
      why: el.querySelector('[data-why]')?.textContent?.trim() ?? '',
      text: el.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    })),
  )
}
const enabledOf = (items) => items.filter((i) => !i.disabled && !i.record && !i.current).map((i) => i.to)

async function openBoardMenu(page, cardId) {
  const card = page.locator(`.mkc[data-id="${cardId}"]`)
  await card.scrollIntoViewIfNeeded()
  await card.hover()
  await card.locator('[data-action="move-menu"]').click()
  await page.waitForSelector('[role="menu"] [data-move-to]', { timeout: 5000 })
  return menuItems(page)
}

const dialogOpen = (page) => page.evaluate(() => !!document.querySelector('[data-testid="record-done-dialog"]'))

/** Instante ISO de um dia e hora de Brasília (UTC-3, sem horário de verão). */
const spIso = (ymd, hhmm) => new Date(`${ymd}T${hhmm}:00-03:00`).toISOString()
const ymdOffset = (days) => {
  const d = new Date(Date.now() - 3 * 3600e3 + days * 864e5)
  return d.toISOString().slice(0, 10)
}

async function main() {
  const tok = {
    leticia: await login('leticia@nevo.test'),
    marcel: await login('marcel@nevo.test'),
  }
  const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${PGPORT}/${DB}` })
  await db.connect()
  const cleanup = async () => {
    await db.query(`DELETE FROM "MarketingCard" WHERE "groupId" = $1 AND title LIKE 'E2E Rec%'`, [G])
  }
  await cleanup()

  const past = ymdOffset(-3)
  const pastIso = spIso(past, '10:00')
  const mk = async (title, extra = {}) =>
    must(await api(tok.leticia, 'POST', '/cards', { companyId: C.pet, title, kind: 'POST', status: 'IN_PRODUCTION', networks: ['INSTAGRAM'], ...extra }), `criar ${title}`)
  const ids = {
    drag: (await mk('E2E Rec arrastar', { publishAt: pastIso })).id,
    menu: (await mk('E2E Rec menu', { status: 'IDEA' })).id,
    editor: (await mk('E2E Rec editor')).id,
    page: (await mk('E2E Rec pagina', { publishAt: pastIso })).id,
    cal: (await mk('E2E Rec calendario', { publishAt: spIso(ymdOffset(2), '15:00') })).id,
    phone: (await mk('E2E Rec celular')).id,
    print: must(await api(tok.leticia, 'POST', '/cards', { companyId: C.pet, title: 'E2E Rec peca', kind: 'PRINT', status: 'IN_PRODUCTION' }), 'criar peça').id,
  }
  const detail = async (id, token = tok.leticia) => must(await api(token, 'GET', `/cards/${id}`), 'detalhe')

  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    // ════════════════════════════════════════════════════════════════════
    // api: as recusas da rota nova
    // ════════════════════════════════════════════════════════════════════
    phase = 'api'
    const e403 = await api(tok.marcel, 'POST', `/cards/${ids.editor}/record-done`, {})
    check('api', e403.status === 403 && /Só Admin registra um post como já publicado/.test(e403.data?.message ?? ''), 'Editor registra: 403 com o motivo', `${e403.status} ${e403.data?.message}`)
    const eFut = await api(tok.leticia, 'POST', `/cards/${ids.editor}/record-done`, { at: new Date(Date.now() + 864e5).toISOString() })
    check('api', eFut.status === 400 && /Agendar publicação/.test(eFut.data?.message ?? ''), 'data no futuro: 400 apontando para Agendar publicação', `${eFut.status} ${eFut.data?.message}`)
    const eUrl = await api(tok.leticia, 'POST', `/cards/${ids.editor}/record-done`, { url: 'instagram.com/p/x' })
    check('api', eUrl.status === 400 && /http ou https/.test(eUrl.data?.message ?? ''), 'link sem http: 400', `${eUrl.status} ${eUrl.data?.message}`)
    const eMove = await api(tok.leticia, 'POST', `/cards/${ids.editor}/move`, { status: 'PUBLISHED' })
    check('api', eMove.status === 400 && /Registrar como já publicado/.test(eMove.data?.message ?? ''), 'o /move do Admin para Publicado aponta para o registro', eMove.data?.message)
    const dEditor = await detail(ids.editor, tok.marcel)
    const dAdmin = await detail(ids.editor)
    check('api', dEditor.me.canRecordDone === false && dAdmin.me.canRecordDone === true, 'me.canRecordDone: Editor não, Admin sim', `${dEditor.me.canRecordDone}/${dAdmin.me.canRecordDone}`)
    check('api', (await detail(ids.editor)).status === 'IN_PRODUCTION', 'nada mudou depois das recusas')

    // ════════════════════════════════════════════════════════════════════
    // board: Admin solta em Publicado
    // ════════════════════════════════════════════════════════════════════
    phase = 'board'
    const actx = await newCtx(browser, tok.leticia, DESK)
    const ap = await open(actx, MINE, 'leticia')
    await ap.locator(`.mkc[data-id="${ids.drag}"]`).dragTo(ap.locator('[data-col="PUBLISHED"]'))
    const opened = await waitFor(() => dialogOpen(ap), 5000)
    const errs = (await toasts(ap)).filter((t) => /não existe|Não deu/.test(t))
    if (!opened) await shot(ap, 'board-falha-arraste-d1440.png')
    check('board', opened && errs.length === 0, 'soltar em Publicado abre "Registrar como já publicado", sem toast de erro', (await toasts(ap)).join(' | ') || 'sem toast')
    const dlg = await ap.evaluate(() => {
      const d = document.querySelector('[data-testid="record-done-dialog"]')
      return {
        title: d?.querySelector('.mkrd__title')?.textContent?.trim(),
        when: d?.querySelector('input[name="at"]')?.value,
        noVersion: !!d?.querySelector('[data-testid="record-no-version"]'),
      }
    })
    check('board', dlg.title === 'Registrar como já publicado' && dlg.when === `${past}T10:00` && dlg.noVersion, 'título, data já vem da publicação planejada (passada) e o aviso de card sem arte', JSON.stringify(dlg))
    await ap.locator('[data-testid="record-done-dialog"] input[name="url"]').fill('https://instagram.com/p/e2e-rec')
    await shot(ap, 'board-dialogo-d1440.png')
    await ap.locator('[data-action="confirm-record-done"]').click()
    const dDrag = await waitFor(async () => {
      const d = await detail(ids.drag)
      return d.status === 'PUBLISHED' ? d : null
    })
    check(
      'board',
      dDrag && dDrag.publishedAt === pastIso && dDrag.publishAt === pastIso && dDrag.publishedUrl === 'https://instagram.com/p/e2e-rec',
      'gravou Publicado com a data de verdade (publicado e calendário) e o link',
      dDrag && `${dDrag.status} ${dDrag.publishedAt} ${dDrag.publishedUrl}`,
    )
    const okToast = await waitFor(async () => (await toasts(ap)).find((t) => /registrado como publicado/.test(t)), 4000)
    check('board', !!okToast && !(await dialogOpen(ap)), 'diálogo fecha e o toast confirma', okToast)
    const inCol = await waitFor(() => ap.evaluate((id) => document.querySelector(`.mkc[data-id="${id}"]`)?.closest('[data-col]')?.getAttribute('data-col') ?? document.querySelector('[data-col="PUBLISHED"] .mkb__count')?.textContent, ids.drag))
    check('board', !!inCol, 'o card sai de Em produção', inCol)
    const hist = must(await api(tok.leticia, 'GET', `/log?entityType=card&entityId=${ids.drag}&take=20`), 'histórico')
    const histText = JSON.stringify(hist)
    check('board', /registrou .*como já publicado/.test(histText) && /sem passar pela aprovação/.test(histText), 'o histórico diz que foi registrado à mão, sem aprovação')

    // ════════════════════════════════════════════════════════════════════
    // menu: "Mover para" do Admin
    // ════════════════════════════════════════════════════════════════════
    phase = 'menu'
    await goto(ap, MINE)
    const itemsA = await openBoardMenu(ap, ids.menu)
    const pubA = itemsA.find((i) => i.to === 'PUBLISHED')
    const serverA = (await detail(ids.menu)).me.allowedMoves
    check('menu', pubA && !pubA.disabled && pubA.record && /Registrar como já publicado/.test(pubA.text), 'Publicado liberado como "Registrar como já publicado"', JSON.stringify(pubA))
    check('menu', sameSet(enabledOf(itemsA), serverA), 'o resto do menu bate com o allowedMoves do servidor', `menu ${enabledOf(itemsA)} / servidor ${serverA}`)
    check('menu', sameSet(itemsA.map((i) => i.to), DIGITAL), 'o menu lista os 7 status da trilha')
    await shot(ap, 'menu-admin-d1440.png')
    await ap.locator('[role="menu"] [data-move-to="PUBLISHED"]').click()
    check('menu', await waitFor(() => dialogOpen(ap), 4000), 'escolher abre o diálogo')
    await ap.locator('[data-testid="record-done-dialog"] .mk-btn--ghost', { hasText: 'Cancelar' }).click()
    await sleep(400)
    check('menu', !(await dialogOpen(ap)) && (await detail(ids.menu)).status === 'IDEA', 'cancelar fecha e o card fica em Ideia')
    await actx.close()

    // ════════════════════════════════════════════════════════════════════
    // editor: não registra, ouve o motivo
    // ════════════════════════════════════════════════════════════════════
    phase = 'editor'
    const ectx = await newCtx(browser, tok.marcel, DESK)
    const ep = await open(ectx, MINE, 'marcel')
    await ep.locator(`.mkc[data-id="${ids.editor}"]`).dragTo(ep.locator('[data-col="PUBLISHED"]'))
    const eToast = await waitFor(async () => (await toasts(ep)).find((t) => /Só Admin registra/.test(t)), 5000)
    check('editor', !!eToast && !(await dialogOpen(ep)), 'Editor solta em Publicado: sem diálogo, toast com o motivo', eToast)
    check('editor', (await detail(ids.editor)).status === 'IN_PRODUCTION', 'o card volta para Em produção')
    await goto(ep, MINE)
    const itemsE = await openBoardMenu(ep, ids.editor)
    const pubE = itemsE.find((i) => i.to === 'PUBLISHED')
    check('editor', pubE?.disabled && !pubE.record && /Só Admin registra/.test(pubE.why), 'no menu do Editor, Publicado desabilitado com o motivo', JSON.stringify(pubE))
    check('editor', sameSet(enabledOf(itemsE), (await detail(ids.editor, tok.marcel)).me.allowedMoves), 'o menu do Editor bate com o servidor')
    await ectx.close()

    // ════════════════════════════════════════════════════════════════════
    // card: "Mudar status" na página
    // ════════════════════════════════════════════════════════════════════
    phase = 'card'
    for (const theme of ['light', 'dark']) {
      const cctx = await newCtx(browser, tok.leticia, DESK, theme)
      const cp = await open(cctx, `/marketing/cards/${ids.page}`, `leticia-${theme}`)
      await cp.waitForSelector('[data-action="status-menu"]', { timeout: 10000 })
      await cp.locator('[data-action="status-menu"]').click()
      await cp.waitForSelector('[role="menu"] [data-move-to]', { timeout: 5000 })
      const itemsP = await menuItems(cp)
      await shot(cp, `card-mudar-status-${theme}-d1440.png`)
      if (theme === 'light') {
        const serverP = (await detail(ids.page)).me.allowedMoves
        const aw = itemsP.find((i) => i.to === 'AWAITING_APPROVAL')
        const pub = itemsP.find((i) => i.to === 'PUBLISHED')
        check('card', sameSet(itemsP.map((i) => i.to), DIGITAL), '"Mudar status" lista os 7 status (antes: só Ideia e Em produção)', itemsP.map((i) => i.to).join(','))
        check('card', sameSet(enabledOf(itemsP), serverP), 'liberados = allowedMoves do servidor', `menu ${enabledOf(itemsP)} / servidor ${serverP}`)
        check('card', aw?.disabled && /Feche uma versão/.test(aw.why), 'Aguardando aprovação desabilitado com o motivo (sem V1)', JSON.stringify(aw))
        check('card', pub?.record && !pub.disabled, 'Publicado vira o registro', JSON.stringify(pub))
        check('card', itemsP.filter((i) => i.disabled && !i.current).every((i) => i.why.length > 0), 'todo status bloqueado diz o motivo', JSON.stringify(itemsP.filter((i) => i.disabled && !i.why)))
        await cp.locator('[role="menu"] [data-move-to="PUBLISHED"]').click()
        await waitFor(() => dialogOpen(cp), 4000)
        // Data no futuro: o diálogo recusa antes de chamar a API.
        await cp.locator('[data-testid="record-done-dialog"] input[name="at"]').fill(`${ymdOffset(5)}T10:00`)
        await cp.locator('[data-action="confirm-record-done"]').click()
        const futErr = await waitFor(() => cp.evaluate(() => document.querySelector('[data-testid="record-error"]')?.textContent?.trim()), 3000)
        check('card', /futuro/.test(futErr ?? '') && (await detail(ids.page)).status === 'IN_PRODUCTION', 'data no futuro: o diálogo diz e nada muda', futErr)
        await cp.locator('[data-testid="record-done-dialog"] input[name="at"]').fill(`${past}T09:30`)
        await cp.locator('[data-testid="record-done-dialog"] input[name="url"]').fill('https://instagram.com/p/e2e-pagina')
        await cp.locator('[data-action="confirm-record-done"]').click()
        const head = await waitFor(() => cp.evaluate(() => (document.querySelector('[data-testid="head-status"]')?.textContent?.trim() === 'Publicado' ? 'Publicado' : null)), 6000)
        const link = await cp.evaluate(() => document.querySelector('[data-testid="card-published-link"]')?.getAttribute('href'))
        const dPage = await detail(ids.page)
        check('card', head === 'Publicado' && link === 'https://instagram.com/p/e2e-pagina', 'a página mostra Publicado e o "Ver o post"', `${head} ${link}`)
        check('card', dPage.publishedAt === spIso(past, '09:30') && dPage.me.canRecordDone === false, 'gravou a hora escolhida (Brasília) e não oferece registrar de novo', dPage.publishedAt)
        check('card', !(await cp.evaluate(() => !!document.querySelector('[data-testid="record-done-dialog"]'))), 'diálogo fechado depois de registrar')
        const panel = await waitFor(() => cp.evaluate(() => document.querySelector('[data-testid="publish-empty"]')?.textContent?.trim()), 5000)
        check('card', /saiu fora do Nevo e foi registrado à mão/.test(panel ?? ''), 'o painel Publicação diz que saiu fora do Nevo (não "versão não aprovada")', panel)
        await shot(cp, 'card-publicado-light-d1440.png')
      } else {
        // O card já está Publicado (registrado na volta clara): reabrir avisa que a aprovação cai.
        const idea = itemsP.find((i) => i.to === 'IDEA')
        const pubD = itemsP.find((i) => i.to === 'PUBLISHED')
        check('card', idea && !idea.disabled && /Reabre o card/.test(idea.text) && pubD?.current && !pubD.record, 'card publicado: Ideia liberada com "Reabre o card", Publicado é o atual', JSON.stringify([idea, pubD]))
      }
      await cctx.close()
    }

    // ════════════════════════════════════════════════════════════════════
    // origem: Calendário, board e link colado
    // ════════════════════════════════════════════════════════════════════
    phase = 'origem'
    const octx = await newCtx(browser, tok.leticia, DESK)
    const calDay = ymdOffset(2)
    const calRoute = `/marketing/calendario?vista=semana&dia=${calDay}`
    const op = await open(octx, calRoute, 'leticia-origem')
    await op.waitForSelector(`[data-item="card:${ids.cal}"]`, { timeout: 10000 })
    await op.locator(`[data-item="card:${ids.cal}"]`).first().click()
    await op.waitForURL(new RegExp(`/marketing/cards/${ids.cal}`), { timeout: 8000 })
    await op.waitForSelector('[data-testid="card-back"]', { timeout: 8000 })
    const fromCal = await op.evaluate(() => ({
      back: document.querySelector('[data-testid="card-back"]')?.textContent?.trim(),
      tab: document.querySelector('.mk-tab[aria-current="page"]')?.textContent?.trim(),
      crumbs: [...document.querySelectorAll('.breadcrumbs .crumb')].map((c) => c.textContent?.trim()),
    }))
    check('origem', fromCal.back === 'Calendário' && fromCal.tab === 'Calendário' && fromCal.crumbs.includes('Calendário') && !fromCal.crumbs.includes('Aprovações'), 'aberto pelo Calendário: volta, aba e breadcrumb dizem Calendário', JSON.stringify(fromCal))
    await shot(op, 'origem-calendario-d1440.png')
    // Editar no card e voltar: o Calendário abre na mesma vista e no mesmo dia.
    await op.locator('.mkcv__title--input').fill('E2E Rec calendario editado')
    await op.locator('.mkcv__title--input').press('Enter')
    await waitFor(async () => (await detail(ids.cal)).title === 'E2E Rec calendario editado', 5000)
    await op.locator('[data-testid="card-back"]').click()
    await op.waitForURL(/\/marketing\/calendario/, { timeout: 8000 })
    const backUrl = new URL(op.url())
    check('origem', backUrl.searchParams.get('vista') === 'semana' && backUrl.searchParams.get('dia') === calDay, 'a volta é para o Calendário na mesma vista e dia', backUrl.search)
    const edited = await waitFor(() => op.evaluate((id) => document.querySelector(`[data-item="card:${id}"]`)?.textContent?.includes('editado'), ids.cal), 6000)
    check('origem', !!edited, 'o Calendário já mostra o título editado')
    // Pelo board: Aprovações.
    await goto(op, BOARD)
    await op.locator(`.mkc[data-id="${ids.editor}"]`).click()
    await op.waitForSelector('[data-testid="card-back"]', { timeout: 8000 })
    const fromBoard = await op.evaluate(() => ({
      back: document.querySelector('[data-testid="card-back"]')?.textContent?.trim(),
      tab: document.querySelector('.mk-tab[aria-current="page"]')?.textContent?.trim(),
    }))
    check('origem', fromBoard.back === 'Aprovações' && fromBoard.tab === 'Aprovações', 'aberto pelo board: Aprovações', JSON.stringify(fromBoard))
    // Link colado (sem origem): Aprovações.
    const pp = await octx.newPage()
    await goto(pp, `/marketing/cards/${ids.cal}`)
    await pp.waitForSelector('[data-testid="card-back"]', { timeout: 8000 })
    const pasted = await pp.evaluate(() => document.querySelector('[data-testid="card-back"]')?.textContent?.trim())
    check('origem', pasted === 'Aprovações', 'link colado: Aprovações', pasted)
    await octx.close()

    // ════════════════════════════════════════════════════════════════════
    // grafica: peça impressa
    // ════════════════════════════════════════════════════════════════════
    phase = 'grafica'
    const gctx = await newCtx(browser, tok.leticia, DESK)
    const gp = await open(gctx, `${MINE}&trilha=grafica`, 'leticia-grafica')
    await gp.locator(`.mkc[data-id="${ids.print}"]`).dragTo(gp.locator('[data-col="DELIVERED"]'))
    await waitFor(() => dialogOpen(gp), 5000)
    const gDlg = await gp.evaluate(() => ({
      title: document.querySelector('.mkrd__title')?.textContent?.trim(),
      hasDate: !!document.querySelector('[data-testid="record-done-dialog"] input[name="at"]'),
    }))
    check('grafica', gDlg.title === 'Registrar como já entregue' && !gDlg.hasDate, 'soltar em Impresso e entregue abre "Registrar como já entregue", sem data', JSON.stringify(gDlg))
    await shot(gp, 'grafica-dialogo-d1440.png')
    await gp.locator('[data-action="confirm-record-done"]').click()
    const dPrint = await waitFor(async () => ((await detail(ids.print)).status === 'DELIVERED' ? true : null), 5000)
    check('grafica', !!dPrint, 'a peça foi para Impresso e entregue')
    await gctx.close()

    // ════════════════════════════════════════════════════════════════════
    // celular: folha "Mover para"
    // ════════════════════════════════════════════════════════════════════
    phase = 'celular'
    const mctx = await newCtx(browser, tok.leticia, { width: 375, height: 812, mobile: true })
    const mp = await open(mctx, MINE, 'leticia-375')
    await mp.locator('.mkb-tabs button, [role="tab"]', { hasText: 'Em produção' }).first().click().catch(() => {})
    await sleep(500)
    const el = mp.locator(`.mkc[data-id="${ids.phone}"]`)
    await el.scrollIntoViewIfNeeded()
    const box = await el.boundingBox()
    const cdp = await mctx.newCDPSession(mp)
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
    const x = box.x + box.width / 2
    const y = box.y + 20
    await touch('touchStart', x, y)
    await sleep(300)
    await touch('touchMove', x + 2, y + 1)
    await sleep(300)
    await touch('touchEnd')
    const sheet = await waitFor(() => mp.evaluate(() => {
      const opt = document.querySelector('.mks [data-move-to="PUBLISHED"]')
      return opt ? { note: opt.querySelector('[data-record]')?.textContent?.trim() ?? '', disabled: opt.disabled } : null
    }), 5000)
    check('celular', sheet && /Registrar como já publicado/.test(sheet.note) && !sheet.disabled, 'a folha mostra Publicado como registro', JSON.stringify(sheet))
    await shot(mp, 'celular-folha-m375.png')
    await mp.locator('.mks [data-move-to="PUBLISHED"]').click()
    check('celular', await waitFor(() => dialogOpen(mp), 4000), 'tocar abre o diálogo de registro')
    const fits = await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    check('celular', fits, 'o diálogo cabe em 375 sem rolagem lateral')
    await shot(mp, 'celular-dialogo-m375.png')
    await mctx.close()
  } catch (e) {
    check('geral', false, `o roteiro parou na etapa "${phase}"`, e.message)
    throw e
  } finally {
    await browser.close()
    await cleanup()
    await db.end()
    check('geral', allBad.length === 0, 'nenhuma resposta 401/5xx em nenhuma tela', allBad.join(' | '))
    check('geral', allErrors.length === 0, 'nenhum erro de página', allErrors.join(' | '))
    console.log(`\n${fails ? `FALHAS: ${fails}` : 'TUDO OK'}  (prints em ${OUT})`)
    process.exitCode = fails ? 1 : 0
  }
}

main().catch((e) => {
  console.error(e)
  console.log('FALHA: o roteiro parou no meio (erro acima); o "TUDO OK" de cima não vale.')
  process.exitCode = 1
})
