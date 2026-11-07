// Ponta a ponta da M2-B (Ideias e Campanhas) da ala Marketing, pela API e pela tela.
// Uso (ambiente do M2-B): API=http://127.0.0.1:3622 WEB=http://localhost:5184 HARNESS_DB=wf_m2b \
//   HARNESS_SEED=seed-marketing-out.wf_m2b.json node marketing-strategy-e2e.cjs
//
// Cobre os critérios da spec m2-rastreio-estrategia.md:
//   I1  Diretoria curte e não cria; "Transformar em post" cria o card com ideaId; converter de novo dá 409
//   C1  Editor envia para aprovação; Editor aprovando leva 403; Admin aprova; sem aprovação, Rascunho vai a Ativa
//   C2  Gasto da campanha soma os lançamentos (um pago, um previsto), gravados direto no banco
//   C3  Card da Emmitec não liga em campanha da PetJourney (400); freelancer não vê campanha da Emmitec
//   C4  A fonte do calendário devolve a campanha que cruza o mês
// Também: papel por papel, zero 401/5xx, 1440 e 375 sem rolagem lateral, capturas em prints/marketing-strategy/.
const { chromium } = require('playwright-core')
const pg = require('pg')
const fs = require('node:fs')
const path = require('node:path')
const { pickOption } = require('./app-select.cjs')

const API = process.env.API ?? 'http://127.0.0.1:3622'
const WEB = process.env.WEB ?? 'http://localhost:5184'
const DB = process.env.HARNESS_DB ?? 'wf_m2b'
const PGPORT = process.env.PGPORT ?? '55432'
const seedPath = process.env.HARNESS_SEED ?? path.join(__dirname, `seed-marketing-out.${DB}.json`)
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
const out = process.argv[2] ?? path.join(__dirname, 'prints', 'marketing-strategy')
fs.mkdirSync(out, { recursive: true })

const G = seed.groupId
const U = seed.users
const C = seed.companies
const results = []
let fails = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${name}${extra ? '  (' + extra + ')' : ''}`)
  results.push({ name, ok })
  if (!ok) fails++
}

// ── API ────────────────────────────────────────────────────────────────────
const tokens = {}
async function login(key) {
  if (tokens[key]) return tokens[key]
  // O login tem limite de tentativas (429 com Retry-After): espera e tenta de novo.
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `${key}@nevo.test`, password: 'nevo1234' }),
    })
    if (r.status === 429) {
      const wait = Number(r.headers.get('retry-after') ?? 5)
      await new Promise((res) => setTimeout(res, (wait + 1) * 1000))
      continue
    }
    tokens[key] = (await r.json()).accessToken
    return tokens[key]
  }
  throw new Error(`login de ${key} bloqueado pelo limite de tentativas`)
}
async function call(who, method, route, body) {
  const t = await login(who)
  const r = await fetch(`${API}/marketing/g/${G}${route}`, {
    method,
    headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try {
    data = await r.json()
  } catch {
    /* sem corpo */
  }
  return { status: r.status, data }
}
const badApi = []
const noteBad = (status, where) => {
  if (status === 401 || status >= 500) badApi.push(`${status} ${where}`)
}
async function api(who, method, route, body) {
  const res = await call(who, method, route, body)
  noteBad(res.status, `${who} ${method} ${route}`)
  return res
}

const ymd = (d) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const addDays = (n) => ymd(new Date(Date.now() + n * 86_400_000))

// ── Banco ──────────────────────────────────────────────────────────────────
let db
const q = (sql, params) => db.query(sql, params)
const cuid = () => 'c' + require('node:crypto').randomUUID().replace(/-/g, '').slice(0, 24)

async function resetState() {
  await q(`DELETE FROM "MarketingIdea" WHERE "groupId"=$1`, [G])
  await q(`DELETE FROM "MarketingCard" WHERE "groupId"=$1 AND "ideaId" IS NOT NULL`, [G])
  await q(`UPDATE "MarketingCard" SET "campaignId"=NULL WHERE "groupId"=$1`, [G])
  await q(`DELETE FROM "MarketingExpense" WHERE "groupId"=$1`, [G])
  await q(`DELETE FROM "MarketingUtm" WHERE "groupId"=$1`, [G])
  await q(`DELETE FROM "ShortLink" WHERE label LIKE 'E2E%'`)
  await q(`DELETE FROM "MarketingCampaign" WHERE "groupId"=$1`, [G])
  await q(`DELETE FROM "MarketingLog" WHERE "groupId"=$1 AND "entityType" IN ('idea','campaign')`, [G])
  await q(`DELETE FROM "Notification" WHERE type LIKE 'MARKETING_CAMPAIGN%'`)
  await setSettings({})
}
const setSettings = (obj) => q(`UPDATE "CompanyGroup" SET settings=$2 WHERE id=$1`, [G, JSON.stringify(obj)])

// ── Navegador ──────────────────────────────────────────────────────────────
const badUi = []
const pageErrors = []
async function open(browser, who, route, vp, activeCompany) {
  const t = await login(who)
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.mobile ? 2 : 1,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    reducedMotion: 'reduce',
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  await ctx.addInitScript(
    ([tk, c]) => {
      localStorage.setItem('token', tk)
      if (c) localStorage.setItem('activeCompany', c)
      localStorage.setItem('onboarding.autoShown', '1')
      localStorage.setItem('onboarding.completed', '1')
      localStorage.setItem('ui.idlePermissionPrompt', 'done')
    },
    [t, activeCompany ?? null],
  )
  const page = await ctx.newPage()
  page.on('response', (res) => {
    const u = res.url()
    if (u.startsWith(API) && (res.status() === 401 || res.status() >= 500)) badUi.push(`${who} ${res.status()} ${u.replace(API, '')}`)
  })
  page.on('pageerror', (e) => pageErrors.push(`${who}: ${e.message}`))
  await page.goto(WEB + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  return { ctx, page }
}
const shot = (page, name) => page.screenshot({ path: path.join(out, name) })
const noSideScroll = async (page, width, label) => {
  const sw = await page.evaluate(() => document.documentElement.scrollWidth)
  check(`${label}: sem rolagem lateral`, sw <= width, `scrollWidth ${sw}`)
}
/** Alvos de toque abaixo de 44px dentro de `scope` (só visíveis). */
async function smallTargets(page, scope) {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel)
    if (!root) return ['(escopo não encontrado)']
    const small = []
    for (const el of root.querySelectorAll('button, a[href], select, input:not([type=hidden]), textarea, [role=tab]')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const st = getComputedStyle(el)
      if (st.visibility === 'hidden' || st.display === 'none') continue
      if (r.height < 43.5 || r.width < 43.5) {
        // texto comprido em botão largo conta pela altura; ícone precisa dos dois
        if (r.height < 43.5 || (r.width < 43.5 && !el.textContent.trim())) {
          small.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}"`)
        }
      }
    }
    return small
  }, scope)
}

;(async () => {
  db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${PGPORT}/${DB}` })
  await db.connect()
  await resetState()

  // ═══ I1: Ideias, pela API ═══════════════════════════════════════════════
  console.log('\n── I1: Ideias (API) ──')
  const mk1 = await api('marcel', 'POST', '/ideas', {
    title: 'Reel: pet fantasiado no Halloween',
    description: 'Mostrar fantasias simples feitas em casa',
    referenceUrl: 'https://www.tiktok.com/@pets/video/123',
    network: 'TIKTOK',
    kind: 'TREND',
    tags: ['#Halloween', 'reel'],
    companyId: C.pet,
  })
  check('Editor cria ideia (201) com link e tags normalizadas', mk1.status === 201 && mk1.data.tags.join() === 'halloween,reel', `${mk1.status}`)
  const idea1 = mk1.data
  const mk2 = await api('marcel', 'POST', '/ideas', { title: 'Sorteio de um mês de ração', kind: 'IDEA' })
  const idea2 = mk2.data
  check('Ideia sem marca é do grupo (companyId null)', mk2.status === 201 && idea2.companyId === null)

  const vCreate = await api('diretoria', 'POST', '/ideas', { title: 'Tentativa da diretoria' })
  check('Diretoria (Visualizador) não cria ideia (403)', vCreate.status === 403, `${vCreate.status}`)
  const vList = await api('diretoria', 'GET', '/ideas')
  check('Diretoria vê o mural (200) e não curtiu ainda', vList.status === 200 && vList.data.length === 2 && vList.data.every((i) => !i.likedByMe))
  const vLike = await api('diretoria', 'POST', `/ideas/${idea1.id}/like`, { liked: true })
  check('Diretoria curte ideia (2xx, 1 curtida)', vLike.status < 300 && vLike.data.likesCount === 1 && vLike.data.liked === true, `${vLike.status}`)
  const vLike2 = await api('diretoria', 'POST', `/ideas/${idea1.id}/like`, { liked: true })
  check('Curtir duas vezes não duplica', vLike2.data.likesCount === 1)
  const vList2 = await api('diretoria', 'GET', '/ideas?sort=likes')
  check('Mural ordenado por curtidas: a curtida sobe e likedByMe vem marcado', vList2.data[0].id === idea1.id && vList2.data[0].likedByMe === true)
  const vConv = await api('diretoria', 'POST', `/ideas/${idea1.id}/convert`, {})
  check('Diretoria não transforma em post (403)', vConv.status === 403, `${vConv.status}`)
  const vEdit = await api('diretoria', 'PATCH', `/ideas/${idea1.id}`, { title: 'x' })
  const vDel = await api('diretoria', 'DELETE', `/ideas/${idea1.id}`)
  check('Diretoria não edita nem apaga (403)', vEdit.status === 403 && vDel.status === 403)

  const badUrl = await api('marcel', 'POST', '/ideas', { title: 'Link ruim', referenceUrl: 'javascript:alert(1)' })
  check('Link de referência que não é http/https dá 400', badUrl.status === 400, `${badUrl.status}`)
  const badKind = await api('marcel', 'POST', '/ideas', { title: 'Tipo ruim', kind: 'MEME' })
  check('Tipo inválido dá 400', badKind.status === 400)

  const filt = await api('leticia', 'GET', '/ideas?kind=TREND&tag=halloween&q=fantasiado')
  check('Filtros tipo + tag + busca acham a trend', filt.status === 200 && filt.data.length === 1 && filt.data[0].id === idea1.id)

  // Transformar em post
  const conv = await api('marcel', 'POST', `/ideas/${idea1.id}/convert`, {})
  check('Editor transforma em post (201 ou 200 com card)', (conv.status === 201 || conv.status === 200) && !!conv.data?.card?.id, `${conv.status}`)
  const cardId = conv.data?.card?.id
  const cardRow = (await q(`SELECT "ideaId","companyId",status,title,networks,briefing FROM "MarketingCard" WHERE id=$1`, [cardId])).rows[0]
  check('Card existe no banco com ideaId, marca e status Ideia', cardRow?.ideaId === idea1.id && cardRow.companyId === C.pet && cardRow.status === 'IDEA', JSON.stringify(cardRow))
  check('Card herda a rede e o link no briefing', cardRow?.networks?.includes('TIKTOK') && cardRow.briefing?.includes('tiktok.com/@pets/video/123'))
  const ideaRow = (await q(`SELECT status,"convertedCardId" FROM "MarketingIdea" WHERE id=$1`, [idea1.id])).rows[0]
  check('Ideia vira CONVERTED com convertedCardId', ideaRow.status === 'CONVERTED' && ideaRow.convertedCardId === cardId)
  const again = await api('leticia', 'POST', `/ideas/${idea1.id}/convert`, {})
  check('Converter de novo dá 409 com o card existente', again.status === 409 && again.data.existingId === cardId, `${again.status} ${again.data?.existingId}`)
  const cardCount = (await q(`SELECT count(*)::int AS n FROM "MarketingCard" WHERE "ideaId"=$1`, [idea1.id])).rows[0].n
  check('Continua só 1 card dessa ideia', cardCount === 1, `${cardCount}`)

  // Dois cliques ao mesmo tempo
  const race = await api('marcel', 'POST', '/ideas', { title: 'Corrida de conversão', companyId: C.pet })
  const [r1, r2] = await Promise.all([
    call('marcel', 'POST', `/ideas/${race.data.id}/convert`, {}),
    call('leticia', 'POST', `/ideas/${race.data.id}/convert`, {}),
  ])
  const statuses = [r1.status, r2.status].sort()
  const raceCards = (await q(`SELECT count(*)::int AS n FROM "MarketingCard" WHERE "ideaId"=$1`, [race.data.id])).rows[0].n
  check('Dois cliques ao mesmo tempo: um passa e o outro leva 409, 1 card', statuses[1] === 409 && statuses[0] < 300 && raceCards === 1, `${statuses.join(',')} cards=${raceCards}`)

  // Ideia sem marca exige a marca
  const noBrand = await api('marcel', 'POST', `/ideas/${idea2.id}/convert`, {})
  check('Ideia sem marca exige a marca (400)', noBrand.status === 400, `${noBrand.status}`)
  const withBrand = await api('marcel', 'POST', `/ideas/${idea2.id}/convert`, { companyId: C.emmitec, kind: 'CAROUSEL', title: 'Carrossel do sorteio' })
  const c2 = (await q(`SELECT kind,title,"companyId" FROM "MarketingCard" WHERE id=$1`, [withBrand.data?.card?.id])).rows[0]
  check('Com a marca, o card nasce com o tipo e o título pedidos', c2?.kind === 'CAROUSEL' && c2.title === 'Carrossel do sorteio' && c2.companyId === C.emmitec, JSON.stringify(c2))

  // Freelancer: só a PetJourney
  const emmiIdea = await api('nicolas', 'POST', '/ideas', { title: 'Ideia só da Emmitec', companyId: C.emmitec, kind: 'REFERENCE' })
  const fList = await api('freela', 'GET', '/ideas')
  check('Freelancer não vê ideia da Emmitec, vê as do grupo e da PetJourney', fList.status === 200 && !fList.data.some((i) => i.id === emmiIdea.data.id) && fList.data.some((i) => i.companyId === null))
  const fLike = await api('freela', 'POST', `/ideas/${emmiIdea.data.id}/like`, { liked: true })
  check('Freelancer não curte ideia da Emmitec (404)', fLike.status === 404, `${fLike.status}`)
  const fCreate = await api('freela', 'POST', '/ideas', { title: 'Tentativa', companyId: C.emmitec })
  check('Freelancer não cria ideia na marca Emmitec (403)', fCreate.status === 403, `${fCreate.status}`)
  const fFilter = await api('freela', 'GET', `/ideas?companyId=${C.emmitec}`)
  check('Freelancer filtrando a marca Emmitec leva 403', fFilter.status === 403)

  // Editar / arquivar / apagar
  const own = await api('marcel', 'POST', '/ideas', { title: 'Ideia do Marcel', companyId: C.pet })
  const edOther = await api('freela', 'PATCH', `/ideas/${own.data.id}`, { title: 'Roubada' })
  check('Editor não edita ideia de outro Editor (403)', edOther.status === 403, `${edOther.status}`)
  const edAdmin = await api('leticia', 'PATCH', `/ideas/${own.data.id}`, { title: 'Ideia do Marcel (revisada)' })
  check('Admin edita ideia de outro (200)', edAdmin.status === 200 && edAdmin.data.title.endsWith('(revisada)'))
  const arch = await api('marcel', 'POST', `/ideas/${own.data.id}/archive`, { archived: true })
  const listOpen = await api('marcel', 'GET', '/ideas')
  const listArch = await api('marcel', 'GET', '/ideas?status=ARCHIVED')
  check('Arquivar tira do mural e aparece em arquivadas', arch.data.status === 'ARCHIVED' && !listOpen.data.some((i) => i.id === own.data.id) && listArch.data.some((i) => i.id === own.data.id))
  const unarch = await api('marcel', 'POST', `/ideas/${own.data.id}/archive`, { archived: false })
  check('Desarquivar volta para aberta', unarch.data.status === 'OPEN')
  const delOther = await api('freela', 'DELETE', `/ideas/${own.data.id}`)
  check('Editor não apaga ideia de outro (403)', delOther.status === 403)
  const delOwn = await api('marcel', 'DELETE', `/ideas/${own.data.id}`)
  check('Autor apaga a própria ideia (200)', delOwn.status === 200)
  const logIdea = await q(`SELECT verb FROM "MarketingLog" WHERE "entityType"='idea' AND "groupId"=$1`, [G])
  // R2 (C6): apagar manda para a Lixeira, e o histórico registra 'trashed'.
  check('Histórico registra criar, converter, editar, arquivar e mandar para a lixeira', ['created', 'converted', 'updated', 'archived', 'trashed'].every((v) => logIdea.rows.some((r) => r.verb === v)))

  // ═══ Campanhas, pela API ════════════════════════════════════════════════
  console.log('\n── C1 a C4: Campanhas (API) ──')
  const start = addDays(-3)
  const end = addDays(10)
  const mkc = await api('marcel', 'POST', '/campaigns', {
    companyId: C.pet,
    name: 'Dia dos Pets 2026',
    objective: 'Dobrar os cadastros de tutores',
    startDate: start,
    endDate: end,
    budgetCents: 130_000,
    audience: 'Tutores de cães e gatos, 25 a 45 anos',
    channels: ['Instagram', 'Meta Ads'],
  })
  const camp = mkc.data
  check('Editor cria campanha em Rascunho (201)', mkc.status === 201 && camp.status === 'DRAFT', `${mkc.status}`)
  const vCamp = await api('diretoria', 'POST', '/campaigns', { companyId: C.pet, name: 'Tentativa' })
  check('Diretoria não cria campanha (403)', vCamp.status === 403)
  const badPeriod = await api('marcel', 'POST', '/campaigns', { companyId: C.pet, name: 'Período ruim', startDate: '2026-12-10', endDate: '2026-12-01' })
  check('Início depois do fim dá 400', badPeriod.status === 400)
  const badBrand = await api('freela', 'POST', '/campaigns', { companyId: C.emmitec, name: 'Fora da marca' })
  check('Freelancer não cria campanha na Emmitec (403)', badBrand.status === 403)

  // C1
  const direct = await api('marcel', 'POST', `/campaigns/${camp.id}/status`, { status: 'ACTIVE' })
  check('C1 Com aprovação ligada, Rascunho não vai direto a Ativa (400)', direct.status === 400, `${direct.status}`)
  const send = await api('marcel', 'POST', `/campaigns/${camp.id}/status`, { status: 'AWAITING_APPROVAL' })
  check('C1 Editor envia para aprovação (201)', (send.status === 201 || send.status === 200) && send.data.status === 'AWAITING_APPROVAL', `${send.status}`)
  const notifAdmin = (await q(`SELECT count(*)::int AS n FROM "Notification" WHERE "userId"=$1 AND type='MARKETING_CAMPAIGN_APPROVAL_REQUESTED'`, [U.leticia])).rows[0].n
  const notifSelf = (await q(`SELECT count(*)::int AS n FROM "Notification" WHERE "userId"=$1 AND type LIKE 'MARKETING_CAMPAIGN%'`, [U.marcel])).rows[0].n
  check('C1 O Admin é avisado e quem enviou não', notifAdmin === 1 && notifSelf === 0, `admin=${notifAdmin} editor=${notifSelf}`)
  const edApprove = await api('marcel', 'POST', `/campaigns/${camp.id}/status`, { status: 'APPROVED' })
  check('C1 Editor tentando aprovar leva 403', edApprove.status === 403, `${edApprove.status}`)
  const viewerMove = await api('diretoria', 'POST', `/campaigns/${camp.id}/status`, { status: 'APPROVED' })
  check('C1 Diretoria não muda status (403)', viewerMove.status === 403)
  const approve = await api('leticia', 'POST', `/campaigns/${camp.id}/status`, { status: 'APPROVED' })
  const apRow = (await q(`SELECT status,"approvedById","approvedAt" FROM "MarketingCampaign" WHERE id=$1`, [camp.id])).rows[0]
  check('C1 Admin aprova e o banco guarda quem e quando', apRow.status === 'APPROVED' && apRow.approvedById === U.leticia && !!apRow.approvedAt, `${approve.status}`)
  const notifCreator = (await q(`SELECT count(*)::int AS n FROM "Notification" WHERE "userId"=$1 AND type='MARKETING_CAMPAIGN_APPROVED'`, [U.marcel])).rows[0].n
  check('C1 Quem criou é avisado da aprovação', notifCreator === 1)
  const act = await api('marcel', 'POST', `/campaigns/${camp.id}/status`, { status: 'ACTIVE' })
  check('C1 Aprovada vira Ativa pelo Editor', act.data?.status === 'ACTIVE', `${act.status}`)

  // Sem aprovação: Rascunho vai direto a Ativa
  await setSettings({ campaignNeedsApproval: false })
  const quick = await api('marcel', 'POST', '/campaigns', { companyId: C.pet, name: 'Relâmpago sem aprovação' })
  const quickAct = await api('marcel', 'POST', `/campaigns/${quick.data.id}/status`, { status: 'ACTIVE' })
  check('C1 Com campaignNeedsApproval desligado, Rascunho vai direto a Ativa', quickAct.data?.status === 'ACTIVE', `${quickAct.status}`)
  const quickApprove = await api('marcel', 'POST', `/campaigns/${quick.data.id}/status`, { status: 'CANCELED' })
  check('C1 Editor continua sem cancelar (403)', quickApprove.status === 403)
  await setSettings({})

  // C2: gasto
  console.log('── C2: gasto ──')
  const exp = (desc, cents, status, date) =>
    q(
      `INSERT INTO "MarketingExpense"(id,"groupId","companyId",date,description,"amountCents",category,status,"campaignId","createdById","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,'Tráfego pago',$7,$8,$9,now())`,
      [cuid(), G, C.pet, date, desc, cents, status, camp.id, U.leticia],
    )
  await exp('E2E anúncio Meta semana 1', 30_000, 'PAID', addDays(-2))
  await exp('E2E anúncio Meta semana 2 (previsto)', 12_000, 'PLANNED', addDays(5))
  await q(`INSERT INTO "MarketingExpense"(id,"groupId","companyId",date,description,"amountCents",category,status,"createdById","updatedAt") VALUES ($1,$2,$3,$4,'E2E gasto sem campanha',99999,'Outros','PAID',$5,now())`, [cuid(), G, C.pet, addDays(-1), U.leticia])
  // UTM da campanha (a M2-A é dona da tela; aqui só o necessário para somar cliques e leituras)
  const slId = cuid()
  const qrId = cuid()
  await q(`INSERT INTO "ShortLink"(id,code,"ownerId","companyId",label,"targetUrl","utmSource","utmMedium","utmCampaign","clickCount","updatedAt") VALUES ($1,$2,$3,$4,'E2E link',$5,'instagram','bio','dia-dos-pets',40,now())`, [slId, 'e2e' + slId.slice(-6), U.leticia, C.pet, 'https://petjourney.test/'])
  await q(`INSERT INTO "QrCode"(id,code,"ownerId","companyId",label,"targetUrl","scanCount","updatedAt") VALUES ($1,$2,$3,$4,'E2E qr','https://petjourney.test/',7,now())`, [qrId, 'e2q' + qrId.slice(-6), U.leticia, C.pet])
  await q(`INSERT INTO "MarketingUtm"(id,"groupId","companyId","shortLinkId","qrCodeId","campaignId",placement,"createdById","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,'E2E bio do Instagram',$7,now())`, [cuid(), G, C.pet, slId, qrId, camp.id, U.leticia])

  const lst = await api('leticia', 'GET', '/campaigns')
  const row = lst.data.find((c) => c.id === camp.id)
  check('C2 Lista soma pago e previsto separados (só os da campanha)', row?.spentPaidCents === 30_000 && row?.spentPlannedCents === 12_000, `${row?.spentPaidCents}/${row?.spentPlannedCents}`)
  check('C2 Lista traz cards, UTMs, cliques e leituras', row?.utmsCount === 1 && row?.clicks === 40 && row?.scans === 7 && row?.cardsCount === 0)
  const det = await api('leticia', 'GET', `/campaigns/${camp.id}`)
  check('C2 Detalhe lista os 2 lançamentos (só leitura) e a UTM', det.data.expenses?.length === 2 && det.data.utms?.length === 1 && det.data.utms[0].shortLink.clickCount === 40)
  check('C2 Ritmo: orçamento dividido pelos dias e esperado até hoje', det.data.pace?.dailyCents === Math.round(130_000 / 14) && det.data.pace.elapsedDays === 4 && det.data.pace.expectedCents === Math.round(130_000 / 14) * 4, JSON.stringify(det.data.pace))
  await setSettings({ viewerSeesFinance: false })
  const noFin = await api('diretoria', 'GET', `/campaigns/${camp.id}`)
  check('C2 Visualizador sem financeiro não recebe gasto nem lançamentos', noFin.status === 200 && noFin.data.spentPaidCents === null && noFin.data.expenses === null && noFin.data.pace === null && noFin.data.clicks === 40)
  await setSettings({})
  const withFin = await api('diretoria', 'GET', `/campaigns/${camp.id}`)
  check('C2 Com o padrão, a Diretoria vê o gasto (financeiro liberado)', withFin.data.spentPaidCents === 30_000)

  // C3
  console.log('── C3: marcas ──')
  const emmiCamp = await api('nicolas', 'POST', '/campaigns', { companyId: C.emmitec, name: 'Campanha EMMI institucional', startDate: start, endDate: end })
  const emmiCardId = seed.cards.find((c) => c.title.includes('EMMI')).id
  const petCardId = seed.cards.find((c) => c.title.includes('Dicas de banho')).id
  const linkEmmi = await api('leticia', 'POST', `/campaigns/${camp.id}/cards`, { cardId: emmiCardId })
  check('C3 Card da Emmitec não liga em campanha da PetJourney (400)', linkEmmi.status === 400, `${linkEmmi.status}`)
  const emmiAfter = (await q(`SELECT "campaignId" FROM "MarketingCard" WHERE id=$1`, [emmiCardId])).rows[0]
  check('C3 O card da Emmitec continua sem campanha', emmiAfter.campaignId === null)
  const linkPet = await api('marcel', 'POST', `/campaigns/${camp.id}/cards`, { cardId: petCardId })
  const petAfter = (await q(`SELECT "campaignId" FROM "MarketingCard" WHERE id=$1`, [petCardId])).rows[0]
  check('C3 Card da PetJourney liga (grava campaignId)', linkPet.status < 300 && petAfter.campaignId === camp.id, `${linkPet.status}`)
  const vLink = await api('diretoria', 'POST', `/campaigns/${camp.id}/cards`, { cardId: petCardId })
  check('C3 Diretoria não liga card (403)', vLink.status === 403)
  const fLink = await api('freela', 'POST', `/campaigns/${emmiCamp.data.id}/cards`, { cardId: emmiCardId })
  check('C3 Freelancer não liga em campanha da Emmitec (404)', fLink.status === 404, `${fLink.status}`)
  const linkable = await api('marcel', 'GET', `/campaigns/${camp.id}/linkable-cards`)
  check('C3 Cards ligáveis são só da mesma marca e sem os já ligados', linkable.status === 200 && linkable.data.every((c) => c.id !== emmiCardId && c.id !== petCardId) && linkable.data.length >= 1)
  const detCards = await api('leticia', 'GET', `/campaigns/${camp.id}`)
  check('C3 Detalhe mostra o card ligado', detCards.data.cards.length === 1 && detCards.data.cards[0].id === petCardId)
  const fGet = await api('freela', 'GET', `/campaigns/${emmiCamp.data.id}`)
  check('C3 Freelancer não vê campanha da Emmitec (404)', fGet.status === 404, `${fGet.status}`)
  const fLst = await api('freela', 'GET', '/campaigns')
  check('C3 Lista do freelancer só tem a PetJourney', fLst.status === 200 && fLst.data.length > 0 && fLst.data.every((c) => c.companyId === C.pet))
  const fCal = await api('freela', 'GET', `/campaigns/calendar?from=${start}&to=${end}`)
  check('C3 Calendário do freelancer também não traz a Emmitec', fCal.status === 200 && fCal.data.every((c) => c.companyId === C.pet))
  const unl = await api('marcel', 'DELETE', `/campaigns/${camp.id}/cards/${petCardId}`)
  const unl2 = await api('marcel', 'DELETE', `/campaigns/${camp.id}/cards/${petCardId}`)
  check('C3 Desligar tira o campaignId; desligar de novo dá 404', unl.status === 200 && unl2.status === 404)
  await api('marcel', 'POST', `/campaigns/${camp.id}/cards`, { cardId: petCardId })

  // C4 (API)
  console.log('── C4: calendário ──')
  const monthStart = ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const monthEnd = ymd(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0))
  const cal = await api('leticia', 'GET', `/campaigns/calendar?from=${monthStart}&to=${monthEnd}`)
  check('C4 A rota do calendário devolve a campanha que cruza o mês', cal.status === 200 && cal.data.some((c) => c.id === camp.id && c.startDate === start && c.endDate === end), `${cal.data?.length}`)
  const calFar = await api('leticia', 'GET', `/campaigns/calendar?from=2030-01-01&to=2030-01-31`)
  check('C4 Mês sem campanha volta vazio', calFar.status === 200 && calFar.data.length === 0)
  const calBad = await api('leticia', 'GET', `/campaigns/calendar?from=ontem&to=hoje`)
  check('C4 Datas inválidas dão 400', calBad.status === 400)

  // Resultados, aprendizados, edição e exclusão
  const res = await api('marcel', 'PATCH', `/campaigns/${camp.id}/results`, { impressions: 12000, leads: 15, notes: 'Semana 1 boa' })
  check('Resultados são salvos (inteiros >= 0)', res.status === 200 && res.data.results.leads === 15 && res.data.results.impressions === 12000)
  const resBad = await api('marcel', 'PATCH', `/campaigns/${camp.id}/results`, { leads: -5 })
  check('Resultado negativo dá 400', resBad.status === 400)
  const resV = await api('diretoria', 'PATCH', `/campaigns/${camp.id}/results`, { leads: 1 })
  check('Diretoria não lança resultado (403)', resV.status === 403)
  const learn = await api('marcel', 'PATCH', `/campaigns/${camp.id}`, { learnings: 'Reels de bastidores geraram o dobro de cliques' })
  check('Aprendizados são salvos', learn.status === 200 && learn.data.learnings.startsWith('Reels'))
  const delActive = await api('marcel', 'DELETE', `/campaigns/${camp.id}`)
  check('Editor não apaga campanha fora do Rascunho (403)', delActive.status === 403)
  const delDraft = await api('marcel', 'DELETE', `/campaigns/${quick.data.id}`)
  check('Editor não apaga campanha Ativa, mesmo a que ele criou (403)', delDraft.status === 403)
  const throwaway = await api('marcel', 'POST', '/campaigns', { companyId: C.pet, name: 'Descartável' })
  const delThrow = await api('marcel', 'DELETE', `/campaigns/${throwaway.data.id}`)
  check('Editor apaga o próprio Rascunho (200)', delThrow.status === 200)

  // ═══ Tela ═══════════════════════════════════════════════════════════════
  console.log('\n── Tela ──')
  // Ideias abertas para a tela (as da API já viraram post ou arquivo)
  await api('marcel', 'POST', '/ideas', { title: 'Sorteio de um mês de ração (tela)', kind: 'IDEA', tags: ['sorteio'] })
  await api('marcel', 'POST', '/ideas', { title: 'Antes e depois do banho, com música em alta', kind: 'TREND', network: 'INSTAGRAM', tags: ['banho', 'reel'], companyId: C.pet, description: 'Corte rápido do pet sujo para o pet cheiroso, no ritmo da música do momento' })
  await api('marcel', 'POST', '/ideas', { title: 'Rotina do tutor de primeira viagem', kind: 'REFERENCE', referenceUrl: 'https://www.instagram.com/p/exemplo123/', network: 'INSTAGRAM', tags: ['reel'], companyId: C.pet })
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const desk = { width: 1440, height: 900, mobile: false }
  const phone = { width: 375, height: 812, mobile: true }

  // Ideias, Admin, 1440
  {
    const { ctx, page } = await open(browser, 'leticia', '/marketing/ideias', desk, C.pet)
    await page.locator('.it').first().waitFor()
    const tiles = await page.locator('.it').count()
    check('Ideias 1440: o mural mostra as ideias abertas em grade', tiles >= 3, `${tiles} células`)
    const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.iv-grid')).gridTemplateColumns.split(' ').length)
    check('Ideias 1440: grade densa com 3 ou mais colunas', cols >= 3, `${cols} colunas`)
    await shot(page, 'ideias-admin-d1440.png')

    await page.locator('input[aria-label="Nova ideia"]').fill('Trend: tutor dançando com o pet')
    await pickOption(page, page.locator('.iv-quick__kind'), 'Trend')
    await page.locator('.iv-quick button[type=submit]').click()
    await page.locator('.it', { hasText: 'Trend: tutor dançando com o pet' }).waitFor()
    check('Ideias 1440: criar rápido põe a trend no mural', true)
    const fromUi = (await q(`SELECT kind,"createdById" FROM "MarketingIdea" WHERE title=$1`, ['Trend: tutor dançando com o pet'])).rows[0]
    check('Ideias 1440: a trend gravou o tipo e o autor', fromUi?.kind === 'TREND' && fromUi.createdById === U.leticia)

    await page.locator('.iv-seg button', { hasText: 'Trends' }).click()
    await page.waitForTimeout(400)
    const onlyTrends = await page.locator('.it').count()
    check('Ideias 1440: filtro Trends vai para a URL e filtra', page.url().includes('tipo=trends') && onlyTrends >= 1 && (await page.locator('.it:not(:has-text("Trend"))').count()) === 0, page.url())
    await page.locator('.iv-seg button', { hasText: 'Tudo' }).click()

    // Transformar em post pela tela
    const screenIdeaId = (await q(`SELECT id FROM "MarketingIdea" WHERE title=$1`, ['Sorteio de um mês de ração (tela)'])).rows[0].id
    const target = page.locator('.it', { hasText: 'Sorteio de um mês de ração (tela)' })
    await target.locator('.it__cta', { hasText: 'Transformar em post' }).click()
    await pickOption(page, page.locator('[data-field="convert-brand"]'), 'PetJourney')
    await shot(page, 'ideias-converter-d1440.png')
    await page.getByRole('button', { name: 'Criar post' }).click()
    await page.waitForURL(/\/marketing\/cards\//, { timeout: 8000 })
    const newCardId = page.url().split('/marketing/cards/')[1].split('?')[0]
    const uiCard = (await q(`SELECT "ideaId","companyId" FROM "MarketingCard" WHERE id=$1`, [newCardId])).rows[0]
    check('Ideias 1440: Transformar em post cria o card (ideaId no banco) e abre /marketing/cards/<id>', uiCard?.ideaId === screenIdeaId && uiCard.companyId === C.pet, JSON.stringify(uiCard))
    await page.goto(WEB + '/marketing/ideias?status=viraram', { waitUntil: 'networkidle' })
    await page.locator('.it').first().waitFor()
    check('Ideias 1440: aba "Viraram post" mostra "Ver post" no lugar do botão', (await page.locator('.it__cta', { hasText: 'Ver post' }).count()) >= 1 && (await page.locator('.it__cta', { hasText: 'Transformar' }).count()) === 0)
    await shot(page, 'ideias-viraram-d1440.png')
    await ctx.close()
  }

  // Ideias, Diretoria (Visualizador), 1440
  {
    const { ctx, page } = await open(browser, 'diretoria', '/marketing/ideias', desk, null)
    await page.locator('.it').first().waitFor()
    check('Ideias Diretoria: sem campo de criar e sem "Transformar em post"', (await page.locator('.iv-quick').count()) === 0 && (await page.locator('.it__cta', { hasText: 'Transformar' }).count()) === 0)
    const tile = page.locator('.it', { hasText: 'Trend: tutor dançando com o pet' })
    const before = Number((await tile.locator('.it__like span').innerText()).trim())
    await tile.locator('.it__like').click()
    await page.waitForTimeout(500)
    const after = Number((await tile.locator('.it__like span').innerText()).trim())
    const dbLike = (await q(`SELECT count(*)::int AS n FROM "MarketingIdeaLike" WHERE "userId"=$1`, [U.diretoria])).rows[0].n
    check('Ideias Diretoria: curtir pela tela soma 1 e grava no banco', after === before + 1 && dbLike >= 2, `${before} -> ${after}, curtidas no banco ${dbLike}`)
    await shot(page, 'ideias-diretoria-d1440.png')
    await ctx.close()
  }

  // Ideias, celular
  {
    const { ctx, page } = await open(browser, 'leticia', '/marketing/ideias', phone, C.pet)
    await page.locator('.it').first().waitFor()
    await shot(page, 'ideias-admin-m375.png')
    await noSideScroll(page, 375, 'Ideias 375')
    const small = await smallTargets(page, '.iv')
    check('Ideias 375: alvos de toque de 44px', small.length === 0, small.slice(0, 6).join(' | '))
    await page.locator('.it__cta').first().click()
    await page.locator('[role=dialog]').waitFor()
    await shot(page, 'ideias-converter-m375.png')
    await noSideScroll(page, 375, 'Ideias 375 (diálogo)')
    const smallDlg = await smallTargets(page, '[role=dialog]')
    check('Ideias 375: diálogo com alvos de 44px', smallDlg.length === 0, smallDlg.slice(0, 6).join(' | '))
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Com mais detalhes' }).click()
    await page.locator('[role=dialog]').waitFor()
    await shot(page, 'ideias-nova-m375.png')
    await noSideScroll(page, 375, 'Ideias 375 (nova ideia)')
    await ctx.close()
  }

  // Campanhas, Editor (Marcel): lista, painel e envio
  let panelCampaignUrl
  {
    const { ctx, page } = await open(browser, 'marcel', '/marketing/campanhas', desk, C.pet)
    await page.locator('.cv__row').first().waitFor()
    const rows = await page.locator('.cv__row').count()
    check('Campanhas 1440: lista as campanhas das marcas do Editor', rows >= 3, `${rows} linhas`)
    const rowText = await page.locator(`.cv__row[data-campaign-id="${camp.id}"]`).innerText()
    check('Campanhas 1440: linha mostra status, orçamento e gasto', rowText.includes('Ativa') && rowText.includes('1.300,00') && rowText.includes('300,00'), rowText.replace(/\s+/g, ' '))
    await shot(page, 'campanhas-lista-d1440.png')

    await page.locator(`.cv__row[data-campaign-id="${camp.id}"]`).click()
    await page.locator('.cp__title h2').waitFor()
    panelCampaignUrl = page.url()
    check('Campanhas 1440: o painel abre pela URL ?campanha=<id>', panelCampaignUrl.includes(`campanha=${camp.id}`), panelCampaignUrl)
    const spent = await page.locator('[data-testid=spent-paid]').innerText()
    const planned = await page.locator('[data-testid=spent-planned]').innerText()
    const clicks = await page.locator('[data-testid=clicks]').innerText()
    check('Campanhas 1440: o Resumo soma o gasto (pago e previsto) e os cliques das UTMs', spent.includes('300,00') && planned.includes('120,00') && clicks.trim() === '40', `${spent} / ${planned} / ${clicks}`)
    check('Campanhas 1440: os lançamentos aparecem só para leitura (2 linhas, sem editar)', (await page.locator('.cp__table tbody tr').count()) === 2)
    check('Campanhas 1440: o ritmo é mostrado', (await page.locator('.cp__pace .mk-chip').count()) === 1)
    await shot(page, 'campanhas-painel-resumo-d1440.png')

    // Editor não vê "Aprovar"; vê Pausar/Encerrar (está Ativa)
    check('Campanhas 1440: Editor não tem o botão Aprovar nem Cancelar', (await page.locator('[data-status-action="APPROVED"]').count()) === 0 && (await page.locator('[data-status-action="CANCELED"]').count()) === 0)
    check('Campanhas 1440: Editor tem Pausar e Encerrar numa campanha Ativa', (await page.locator('[data-status-action="PAUSED"]').count()) === 1 && (await page.locator('[data-status-action="ENDED"]').count()) === 1)

    // Artes
    await page.locator('[data-tab="cards"]').click()
    await page.locator('[data-card-row]').first().waitFor()
    check('Campanhas 1440: aba Artes lista o card ligado com link para o card', (await page.locator('[data-card-row] a[href^="/marketing/cards/"]').count()) === 1)
    await page.locator('[data-action="link-card"]').click()
    await page.locator('[role=dialog]').waitFor()
    await page.waitForTimeout(500)
    const offered = await page.locator('[data-link-card]').count()
    check('Campanhas 1440: o seletor de card só oferece cards da mesma marca', offered >= 1 && (await page.locator('[role=dialog]', { hasText: 'Post institucional EMMI' }).count()) === 0, `${offered} cards`)
    await shot(page, 'campanhas-ligar-card-d1440.png')
    await page.locator('[data-link-card]').first().click()
    await page.waitForTimeout(700)
    check('Campanhas 1440: ligar pelo diálogo adiciona o card', (await page.locator('[data-card-row]').count()) === 2)
    await shot(page, 'campanhas-painel-artes-d1440.png')

    // UTMs
    await page.locator('[data-tab="utms"]').click()
    await page.locator('[data-utm-row]').first().waitFor()
    const utmText = await page.locator('[data-utm-row]').first().innerText()
    check('Campanhas 1440: aba UTMs mostra local, cliques, leituras e o link curto', utmText.includes('E2E bio do Instagram') && utmText.includes('40 cliques') && utmText.includes('7 leituras') && utmText.includes('/l/'), utmText.replace(/\s+/g, ' '))
    await shot(page, 'campanhas-painel-utms-d1440.png')

    // Resultados
    await page.locator('[data-tab="results"]').click()
    const impressions = await page.locator('[data-result="impressions"]').inputValue()
    check('Campanhas 1440: aba Resultados carrega o que foi lançado', impressions === '12000', impressions)
    await page.locator('[data-result="signups"]').fill('9')
    await page.getByRole('button', { name: 'Salvar resultados' }).click()
    await page.waitForTimeout(600)
    const savedResults = (await q(`SELECT results FROM "MarketingCampaign" WHERE id=$1`, [camp.id])).rows[0].results
    check('Campanhas 1440: salvar resultados grava no banco, sem perder o que havia', savedResults.signups === 9 && savedResults.leads === 15, JSON.stringify(savedResults))
    await page.locator('[data-result="leads"]').fill('abc')
    await page.getByRole('button', { name: 'Salvar resultados' }).click()
    check('Campanhas 1440: número inválido mostra o erro na tela', (await page.locator('.cp__body .mk-error').count()) === 1)
    await page.locator('[data-result="leads"]').fill('15')
    await shot(page, 'campanhas-painel-resultados-d1440.png')

    // Aprendizados
    await page.locator('[data-tab="learnings"]').click()
    const learnVal = await page.locator('[data-field="learnings"]').inputValue()
    check('Campanhas 1440: aba Aprendizados traz o texto salvo', learnVal.startsWith('Reels de bastidores'))
    await shot(page, 'campanhas-painel-aprendizados-d1440.png')

    // Mandar outra campanha para aprovação pela tela
    const mkDraft = await api('marcel', 'POST', '/campaigns', { companyId: C.pet, name: 'Semana do Gato', startDate: addDays(7), endDate: addDays(14), budgetCents: 50_000, channels: ['TikTok'] })
    await page.goto(`${WEB}/marketing/campanhas?campanha=${mkDraft.data.id}`, { waitUntil: 'networkidle' })
    await page.locator('[data-status-action="AWAITING_APPROVAL"]').click()
    await page.locator('[data-testid=campaign-status]', { hasText: 'Aguardando aprovação' }).waitFor()
    check('Campanhas 1440: Editor envia para aprovação pela tela', (await q(`SELECT status FROM "MarketingCampaign" WHERE id=$1`, [mkDraft.data.id])).rows[0].status === 'AWAITING_APPROVAL')
    check('Campanhas 1440: depois de enviar, o Editor não vê Aprovar', (await page.locator('[data-status-action="APPROVED"]').count()) === 0)
    await shot(page, 'campanhas-aguardando-editor-d1440.png')
    camp.awaitingId = mkDraft.data.id
    await ctx.close()
  }

  // Campanhas, Admin (Letícia): aprova e cria
  {
    const { ctx, page } = await open(browser, 'leticia', `/marketing/campanhas?campanha=${camp.awaitingId}`, desk, C.pet)
    await page.locator('[data-status-action="APPROVED"]').waitFor()
    await shot(page, 'campanhas-aguardando-admin-d1440.png')
    await page.locator('[data-status-action="APPROVED"]').click()
    await page.locator('[data-testid=campaign-status]', { hasText: 'Aprovada' }).waitFor()
    const ap = (await q(`SELECT status,"approvedById" FROM "MarketingCampaign" WHERE id=$1`, [camp.awaitingId])).rows[0]
    check('Campanhas 1440: Admin aprova pela tela e o banco guarda quem aprovou', ap.status === 'APPROVED' && ap.approvedById === U.leticia)
    check('Campanhas 1440: Admin vê Ativar e Cancelar numa Aprovada', (await page.locator('[data-status-action="ACTIVE"]').count()) === 1 && (await page.locator('[data-status-action="CANCELED"]').count()) === 1)

    await page.locator('[data-action="new-campaign"]').click()
    await page.locator('[role=dialog]').waitFor()
    await page.getByRole('button', { name: 'Criar campanha' }).click()
    check('Campanhas 1440: criar sem nome mostra o erro', (await page.locator('[role=dialog] .mk-error').count()) >= 1)
    await page.locator('[role=dialog] input[placeholder^="Ex.:"]').fill('Black Friday dos Pets')
    await pickOption(page, page.locator('[role=dialog] [data-field="brand"]'), 'PetJourney')
    const dates = page.locator('[role=dialog] input[type=date]')
    await dates.nth(0).fill(addDays(20))
    await dates.nth(1).fill(addDays(30))
    await page.locator('[role=dialog] input[placeholder="0,00"]').first().fill('1.500,00')
    await page.locator('[role=dialog] .cd__channel', { hasText: 'Instagram' }).click()
    await shot(page, 'campanhas-nova-d1440.png')
    await page.getByRole('button', { name: 'Criar campanha' }).click()
    await page.locator('.cp__title h2', { hasText: 'Black Friday dos Pets' }).waitFor()
    const bf = (await q(`SELECT status,"budgetCents","startDate","endDate",channels FROM "MarketingCampaign" WHERE name='Black Friday dos Pets'`)).rows[0]
    check('Campanhas 1440: criar pela tela grava em centavos, datas e canais', bf?.status === 'DRAFT' && bf.budgetCents === 150_000 && bf.startDate === addDays(20) && bf.endDate === addDays(30) && bf.channels.includes('Instagram'), JSON.stringify(bf))
    await page.locator('.cp [aria-label="Editar campanha"]').click()
    await page.locator('[role=dialog]').waitFor()
    check('Campanhas 1440: ao editar, a marca fica travada', await page.locator('[role=dialog] [data-field="brand"] button[role="combobox"]').isDisabled())
    await page.keyboard.press('Escape')
    await ctx.close()
  }

  // Campanhas, Diretoria: só lê
  {
    const { ctx, page } = await open(browser, 'diretoria', `/marketing/campanhas?campanha=${camp.id}`, desk, null)
    await page.locator('.cp__title h2').waitFor()
    check('Campanhas Diretoria: sem "Nova campanha", sem editar e sem botões de status', (await page.locator('[data-action="new-campaign"]').count()) === 0 && (await page.locator('.cp [aria-label="Editar campanha"]').count()) === 0 && (await page.locator('.cp__actions').count()) === 0)
    await page.locator('[data-tab="results"]').click()
    check('Campanhas Diretoria: resultados só leitura', await page.locator('[data-result="leads"]').isDisabled())
    await shot(page, 'campanhas-diretoria-d1440.png')
    await ctx.close()
  }

  // Campanhas, freelancer: não vê Emmitec
  {
    const { ctx, page } = await open(browser, 'freela', '/marketing/campanhas', desk, null)
    await page.locator('.cv__row').first().waitFor()
    const body = await page.locator('.cv__list').innerText()
    check('Campanhas Freelancer: a lista não mostra a campanha da Emmitec', !body.includes('Campanha EMMI institucional') && body.includes('Dia dos Pets 2026'))
    await page.goto(`${WEB}/marketing/campanhas?campanha=${emmiCamp.data.id}`, { waitUntil: 'networkidle' })
    await page.getByText('Campanha não encontrada').waitFor()
    check('Campanhas Freelancer: abrir a campanha da Emmitec pela URL mostra "não encontrada"', true)
    await shot(page, 'campanhas-freela-emmitec-d1440.png')
    await ctx.close()
  }

  // Campanhas, celular
  {
    const { ctx, page } = await open(browser, 'leticia', '/marketing/campanhas', phone, C.pet)
    await page.locator('.cv__row').first().waitFor()
    await shot(page, 'campanhas-lista-m375.png')
    await noSideScroll(page, 375, 'Campanhas 375 (lista)')
    const small = await smallTargets(page, '.cv__list')
    check('Campanhas 375: lista com alvos de 44px', small.length === 0, small.slice(0, 6).join(' | '))
    await page.locator(`.cv__row[data-campaign-id="${camp.id}"]`).click()
    await page.locator('.cp__title h2').waitFor()
    await page.waitForTimeout(300)
    await shot(page, 'campanhas-painel-m375.png')
    await noSideScroll(page, 375, 'Campanhas 375 (painel)')
    const smallPanel = await smallTargets(page, '.cp')
    check('Campanhas 375: painel com alvos de 44px', smallPanel.length === 0, smallPanel.slice(0, 8).join(' | '))
    const covers = await page.evaluate(() => {
      const r = document.querySelector('.cv__panel').getBoundingClientRect()
      return r.width >= window.innerWidth - 1
    })
    check('Campanhas 375: o painel ocupa a tela toda', covers)
    await page.locator('[data-tab="results"]').click()
    await shot(page, 'campanhas-resultados-m375.png')
    await noSideScroll(page, 375, 'Campanhas 375 (resultados)')
    await page.locator('.cp__back').click()
    await page.locator('.cv__row').first().waitFor()
    check('Campanhas 375: o botão voltar fecha o painel e volta à lista', !page.url().includes('campanha='))
    await page.locator('[data-action="new-campaign"]').click()
    await page.locator('[role=dialog]').waitFor()
    await shot(page, 'campanhas-nova-m375.png')
    await noSideScroll(page, 375, 'Campanhas 375 (nova)')
    const smallDlg = await smallTargets(page, '[role=dialog]')
    check('Campanhas 375: diálogo de campanha com alvos de 44px', smallDlg.length === 0, smallDlg.slice(0, 8).join(' | '))
    await ctx.close()
  }

  // C4 (fonte do calendário), dentro do app, com a sessão da Letícia
  {
    const { ctx, page } = await open(browser, 'leticia', '/marketing/campanhas', desk, C.pet)
    const items = await page.evaluate(
      async ([g, from, to]) => {
        const mod = await import('/src/features/marketing/campaigns/campaigns-calendar-source.ts')
        return mod.campaignsCalendarSource(g, { from, to }, null)
      },
      [G, monthStart, monthEnd],
    )
    const item = items.find((i) => i.entityId === camp.id)
    check(
      'C4 A fonte do calendário devolve a campanha que cruza o mês, no contrato (faixa, dia inteiro, sem arrastar)',
      !!item && item.source === 'campaign' && item.allDay === true && item.draggable === false && item.start === start && item.end === end && item.id === `campaign:${camp.id}` && item.to.name === 'marketing-campaigns' && item.to.query.campanha === camp.id,
      JSON.stringify(item),
    )
    const none = await page.evaluate(
      async ([g]) => {
        const mod = await import('/src/features/marketing/campaigns/campaigns-calendar-source.ts')
        return mod.campaignsCalendarSource(g, { from: '2030-01-01', to: '2030-01-31' }, null)
      },
      [G],
    )
    check('C4 A fonte devolve vazio num mês sem campanha', Array.isArray(none) && none.length === 0)
    const byBrand = await page.evaluate(
      async ([g, from, to, brand]) => {
        const mod = await import('/src/features/marketing/campaigns/campaigns-calendar-source.ts')
        return mod.campaignsCalendarSource(g, { from, to }, brand)
      },
      [G, monthStart, monthEnd, C.emmitec],
    )
    check('C4 O filtro de marca da fonte só traz a Emmitec', byBrand.length >= 1 && byBrand.every((i) => i.companyId === C.emmitec))
    await ctx.close()
  }

  await browser.close()
  await db.end()

  check('Nenhuma resposta 401/5xx na API', badApi.length === 0, badApi.join(', '))
  check('Nenhuma resposta 401/5xx na tela', badUi.length === 0, badUi.join(', '))
  check('Nenhum erro de JavaScript na página', pageErrors.length === 0, pageErrors.join(' | '))

  console.log(fails ? `\n${fails} FALHA(S) de ${results.length}` : `\nTUDO OK (${results.length} checagens)`)
  process.exit(fails ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
