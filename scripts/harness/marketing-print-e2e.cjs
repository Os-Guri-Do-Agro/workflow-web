// Roteiro de ponta a ponta da M2-A (Gráfica): API e tela.
// Uso: node marketing-print-e2e.cjs [saida]
// Env: API (padrão http://127.0.0.1:3621), WEB (padrão http://localhost:5183),
//      HARNESS_DB (padrão wf_m2a), STORAGE (padrão http://127.0.0.1:54329),
//      HARNESS_SEED (padrão seed-marketing-out.wf_m2a.json), SKIP_UI=1 pula a tela.
//
// O upload de versão é da M1 (outro worktree), então o estado da peça aprovada é
// montado aqui direto: original CMYK gravado no fake-storage (bucket drive-files),
// linhas MarketingCardVersion e MarketingAsset no banco e o card marcado como
// aprovado. A prévia RGB sai do `confirm` REAL da fundação (mede o arquivo e gera
// a prévia à parte), o que também prova a fundação.
// Critérios: G1 (pré-gráfica antes de enviar, prova e entrega gravam e registram),
// G2 (CMYK com prévia RGB e download com o mesmo sha256), G3 (Diretoria vê e não muda).
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { createRequire } = require('node:module')

const apiRequire = createRequire(path.join(__dirname, '../../../workflow-api/package.json'))
const sharp = apiRequire('sharp')
const { createClient } = apiRequire('@supabase/supabase-js')
const pg = require('pg')

const API = process.env.API ?? 'http://127.0.0.1:3621'
const WEB = process.env.WEB ?? 'http://localhost:5183'
const STORAGE = process.env.STORAGE ?? 'http://127.0.0.1:54329'
const DB = process.env.HARNESS_DB ?? 'wf_m2a'
const seed = JSON.parse(
  fs.readFileSync(process.env.HARNESS_SEED ?? path.join(__dirname, 'seed-marketing-out.wf_m2a.json'), 'utf8'),
)
const out = process.argv[2] ?? path.join(__dirname, 'prints', 'marketing-print')
fs.mkdirSync(out, { recursive: true })
const G = seed.groupId
const PET = seed.companies.pet
const EMMI = seed.companies.emmitec

let fails = 0
const check = (cond, msg, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}${extra ? '  (' + extra + ')' : ''}`)
  if (!cond) fails++
}
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const newId = () => 'c' + crypto.randomUUID().replace(/-/g, '').slice(0, 24)
const RUN = Date.now().toString(36)

const tokens = {}
async function login(key) {
  if (tokens[key]) return tokens[key]
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${key}@nevo.test`, password: 'nevo1234' }),
  })
  tokens[key] = (await r.json()).accessToken
  return tokens[key]
}
async function call(who, method, route, body) {
  const t = await login(who)
  const r = await fetch(`${API}/marketing/g/${G}${route}`, {
    method,
    headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  try {
    json = await r.json()
  } catch {}
  return { status: r.status, json }
}

const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
const storage = createClient(STORAGE, 'harness').storage

/** Arte de teste: um cartaz simples, gravada em CMYK (JPEG CMYK, como a gráfica pede). */
async function cmykArt(label) {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
      <rect width="1200" height="800" fill="#f4efe6"/>
      <rect x="60" y="60" width="1080" height="680" rx="24" fill="#0f8b8d"/>
      <circle cx="320" cy="400" r="170" fill="#f2a541"/>
      <text x="560" y="360" font-size="84" font-family="sans-serif" font-weight="700" fill="#ffffff">${label}</text>
      <text x="560" y="450" font-size="44" font-family="sans-serif" fill="#e8f5f5">Arte em CMYK para a grafica</text>
    </svg>`,
  )
  const rgb = await sharp(svg).png().toBuffer()
  return sharp(rgb).toColourspace('cmyk').jpeg({ quality: 92 }).toBuffer()
}

/** Monta uma peça impressa APROVADA com arquivo CMYK; devolve ids e o hash do original. */
async function seedApprovedPiece(companyId, title, { withFile = true } = {}) {
  const cardId = newId()
  const versionId = newId()
  await db.query(
    `INSERT INTO "MarketingCard"(id,"groupId","companyId",kind,title,status,networks,"createdById","assigneeId",position,"dueAt","updatedAt")
     VALUES ($1,$2,$3,'PRINT',$4,'APPROVED','{}',$5,$6,$7,$8,now())`,
    [cardId, G, companyId, title, seed.users.leticia, seed.users.marcel, 5000, new Date(Date.now() + 5 * 86400000)],
  )
  await db.query(`INSERT INTO "MarketingCardVersion"(id,"cardId",number,"createdById") VALUES ($1,$2,1,$3)`, [versionId, cardId, seed.users.marcel])
  let file = null
  if (withFile) {
    const bytes = await cmykArt(title.slice(0, 18))
    const assetId = newId()
    const storagePath = `marketing/${G}/${assetId}.jpg`
    const up = await storage.from('drive-files').upload(storagePath, bytes, { contentType: 'image/jpeg', upsert: false })
    if (up.error) throw new Error('upload no fake-storage: ' + up.error.message)
    const original = sha(bytes)
    await db.query(
      `INSERT INTO "MarketingAsset"(id,"groupId","companyId","cardId","versionId",name,"storagePath","mimeType",size,sha256,position,status,"uploadedById")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'image/jpeg',$8,$9,0,'PENDING',$10)`,
      [assetId, G, companyId, cardId, versionId, `${title.replace(/\W+/g, '-').toLowerCase()}-cmyk.jpg`, storagePath, bytes.length, original, seed.users.leticia],
    )
    // confirm REAL da fundação: lê o arquivo, vê que é CMYK e gera a prévia RGB à parte
    const conf = await call('leticia', 'POST', `/assets/${assetId}/confirm`, {})
    file = { assetId, original, size: bytes.length, confirm: conf }
  }
  await db.query(
    `UPDATE "MarketingCard" SET "currentVersionId"=$2,"approvedVersionId"=$2,"approvedById"=$3,"approvedAt"=now() WHERE id=$1`,
    [cardId, versionId, seed.users.leticia],
  )
  return { cardId, versionId, file }
}

async function apiPart(pieceA) {
  console.log('\n== API ==')
  const { cardId, file } = pieceA
  check(file.confirm.status === 201 && file.confirm.json?.colorSpace === 'cmyk' && file.confirm.json?.hasPreview === true, 'montagem: confirm da fundação mede CMYK e gera a prévia', JSON.stringify(file.confirm.json?.colorSpace))

  // G3: Diretoria (Visualizador) vê a lista e não muda nada
  const dirList = await call('diretoria', 'GET', '/print/cards')
  check(dirList.status === 200 && dirList.json.some((c) => c.id === cardId), 'G3 Diretoria vê a lista de peças', `${dirList.status}`)
  const dirStatus = await call('diretoria', 'POST', `/print/cards/${cardId}/status`, { status: 'SENT_TO_PRINTER' })
  check(dirStatus.status === 403, 'G3 Diretoria não muda status (403)', `${dirStatus.status}`)
  check((await call('diretoria', 'PATCH', `/print/cards/${cardId}/specs`, { paper: 'x' })).status === 403, 'G3 Diretoria não edita a especificação (403)')
  check((await call('diretoria', 'POST', `/print/cards/${cardId}/prepress`)).status === 403, 'G3 Diretoria não abre o checklist (403)')
  check((await call('diretoria', 'POST', '/print/cards', { companyId: PET, title: 'x' })).status === 403, 'G3 Diretoria não cria peça (403)')
  check((await call('luis', 'GET', '/print/cards')).status === 403, 'G3 quem é de fora da ala leva 403')

  // G2: CMYK mostra prévia RGB e o download devolve o mesmo sha256
  const list = await call('marcel', 'GET', '/print/cards')
  const card = list.json.find((c) => c.id === cardId)
  check(!!card && card.approvalValid === true, 'peça aprovada vale para a versão atual', JSON.stringify(card?.approvalValid))
  const f = card?.files?.[0]
  check(f && f.colorSpace === 'cmyk' && f.hasPreview && !!f.previewUrl && !!f.url, 'G2 arquivo CMYK vem com colorSpace, hasPreview, url e previewUrl')
  check(f && f.sha256 === file.original && f.size === file.size, 'G2 sha256 e tamanho gravados são os do original', `${f?.sha256?.slice(0, 12)}`)
  const prev = await fetch(f.previewUrl)
  const prevBytes = Buffer.from(await prev.arrayBuffer())
  const prevMeta = await sharp(prevBytes).metadata()
  check(prev.status === 200 && prevMeta.format === 'webp' && prevMeta.space === 'srgb', 'G2 a prévia é uma cópia RGB (webp) à parte', `${prevMeta.format}/${prevMeta.space}`)
  const dl = await call('marcel', 'GET', `/assets/${f.id}/download`)
  check(dl.status === 200 && dl.json.sha256 === file.original, 'G2 download devolve o sha256 do original')
  const orig = Buffer.from(await (await fetch(dl.json.url)).arrayBuffer())
  const origMeta = await sharp(orig).metadata()
  check(sha(orig) === file.original && origMeta.space === 'cmyk', 'G2 o arquivo baixado tem o MESMO sha256 e continua CMYK', `${sha(orig).slice(0, 12)} ${origMeta.space}`)
  check(sha(orig) !== sha(prevBytes), 'G2 a prévia não substitui o original')
  check((await call('diretoria', 'GET', `/assets/${f.id}/download`)).status === 200, 'Diretoria também baixa o original')

  // G1: pré-gráfica antes de enviar
  const send1 = await call('marcel', 'POST', `/print/cards/${cardId}/status`, { status: 'SENT_TO_PRINTER' })
  check(send1.status === 400 && /Faltam 8 itens do pré-gráfica/.test(send1.json?.message ?? ''), 'G1 sem abrir o checklist: 400 "Faltam 8 itens"', `${send1.status} ${send1.json?.message?.slice(0, 70)}`)
  const open = await call('marcel', 'POST', `/print/cards/${cardId}/prepress`)
  check(open.status === 201 && open.json.prepress.total === 8 && open.json.prepress.done === 0, 'G1 abre o checklist padrão com 8 itens', `${open.status}`)
  const again = await call('marcel', 'POST', `/print/cards/${cardId}/prepress`)
  check(again.json.prepress.total === 8, 'G1 abrir de novo não duplica os itens')
  const items = open.json.prepress.items
  check(/Sangria de 3 mm/.test(items[0].text) && items.some((i) => /CMYK/.test(i.text)) && items.some((i) => /300 dpi/.test(i.text)), 'G1 os itens são os da spec')
  for (const it of items.slice(0, 7)) {
    const r = await call('marcel', 'PATCH', `/print/cards/${cardId}/prepress/${it.id}`, { done: true })
    if (r.status !== 200) check(false, 'marcar item', `${r.status}`)
  }
  const send2 = await call('marcel', 'POST', `/print/cards/${cardId}/status`, { status: 'SENT_TO_PRINTER' })
  check(send2.status === 400 && /Faltam 1 item do pré-gráfica/.test(send2.json?.message ?? ''), 'G1 com 1 item aberto: 400 "Faltam 1 item"', send2.json?.message?.slice(0, 90))
  const force1 = await call('marcel', 'POST', `/print/cards/${cardId}/status`, { status: 'SENT_TO_PRINTER', force: true })
  check(force1.status === 403, 'G1 Editor não força o envio (403)', `${force1.status}`)
  check((await call('marcel', 'PATCH', `/print/cards/${cardId}/prepress/${seed.cards[0].id}`, { done: true })).status === 404, 'item de outro card: 404')
  await call('marcel', 'PATCH', `/print/cards/${cardId}/prepress/${items[7].id}`, { done: false })
  const done = await call('marcel', 'PATCH', `/print/cards/${cardId}/prepress/${items[7].id}`, { done: true })
  check(done.status === 200 && done.json.prepress.done === 8, 'G1 todos marcados: 8 de 8', `${done.status}`)
  const specs = await call('marcel', 'PATCH', `/print/cards/${cardId}/specs`, { format: 'A5 (15 x 21 cm)', paper: 'Couchê 300 g', finish: 'Verniz localizado', quantity: 500, bleedMm: 3, colors: '4x4 CMYK', printer: 'Gráfica Rápida', notes: 'Entregar na clínica' })
  check(specs.status === 200 && specs.json.printSpecs.quantity === 500 && specs.json.printSpecs.paper === 'Couchê 300 g', 'G1 grava a especificação', `${specs.status}`)
  check((await call('marcel', 'PATCH', `/print/cards/${cardId}/specs`, { quantity: -3 })).status === 400, 'especificação inválida: 400')

  const sent = await call('marcel', 'POST', `/print/cards/${cardId}/status`, { status: 'SENT_TO_PRINTER' })
  check(sent.status === 201 && sent.json.status === 'SENT_TO_PRINTER', 'G1 com tudo marcado vai para a gráfica', `${sent.status} ${sent.json?.message ?? ''}`)
  const proof = await call('marcel', 'POST', `/print/cards/${cardId}/status`, { status: 'PROOF_RECEIVED' })
  check(proof.status === 201 && proof.json.status === 'PROOF_RECEIVED', 'G1 prova recebida grava')
  const skip = await call('marcel', 'POST', `/print/cards/${cardId}/status`, { status: 'APPROVED' })
  check(skip.status === 400, 'G1 de Prova recebida não volta direto para Aprovado (400)', `${skip.status}`)
  const delivered = await call('marcel', 'POST', `/print/cards/${cardId}/status`, { status: 'DELIVERED' })
  check(delivered.status === 201 && delivered.json.status === 'DELIVERED', 'G1 entregue grava')
  const st = await db.query(`SELECT status FROM "MarketingCard" WHERE id=$1`, [cardId])
  check(st.rows[0].status === 'DELIVERED', 'G1 o banco tem o status Entregue')
  const log = await call('leticia', 'GET', `/log?entityType=card&entityId=${cardId}`)
  const verbs = (log.json ?? []).filter((l) => l.verb === 'status_changed').map((l) => l.summary)
  check(verbs.length === 3 && verbs.some((s) => /Enviado para a gráfica/.test(s)) && verbs.some((s) => /Prova recebida/.test(s)) && verbs.some((s) => /Impresso e entregue/.test(s)), 'G1 o histórico registra enviado, prova e entregue', `${verbs.length}`)
  await new Promise((r) => setTimeout(r, 300))
  const notif = await db.query(`SELECT "userId", type, link FROM "Notification" WHERE type='MARKETING_PROOF_RECEIVED' AND link LIKE $1`, [`%${cardId}%`])
  const notified = notif.rows.map((r) => r.userId)
  check(notified.includes(seed.users.leticia) && !notified.includes(seed.users.marcel), 'G1 prova recebida avisa a Admin e não quem moveu', `${notified.length} aviso(s)`)
  check((await call('marcel', 'POST', `/print/cards/${cardId}/status`, { status: 'SENT_TO_PRINTER' })).status === 400, 'peça entregue não volta pela Gráfica (400)')

  // Admin força o envio com item aberto (outra peça)
  const B = await seedApprovedPiece(PET, `Folder para forcar ${RUN}`, { withFile: false })
  await call('marcel', 'POST', `/print/cards/${B.cardId}/prepress`)
  const forced = await call('leticia', 'POST', `/print/cards/${B.cardId}/status`, { status: 'SENT_TO_PRINTER', force: true })
  check(forced.status === 201 && forced.json.status === 'SENT_TO_PRINTER', 'G1 Admin envia mesmo com pré-gráfica aberto (force)', `${forced.status}`)
  const logB = await call('leticia', 'GET', `/log?entityType=card&entityId=${B.cardId}`)
  check((logB.json ?? []).some((l) => /8 itens do pré-gráfica em aberto/.test(l.summary)), 'G1 o histórico diz que foi enviado com itens em aberto')

  // Aprovação que não vale para a versão atual
  const C = await seedApprovedPiece(PET, `Cartao aprovacao velha ${RUN}`, { withFile: false })
  await db.query(`UPDATE "MarketingCard" SET "approvedVersionId"=NULL WHERE id=$1`, [C.cardId])
  await call('marcel', 'POST', `/print/cards/${C.cardId}/prepress`)
  const noApproval = await call('leticia', 'POST', `/print/cards/${C.cardId}/status`, { status: 'SENT_TO_PRINTER', force: true })
  check(noApproval.status === 400 && /não foi aprovada/.test(noApproval.json?.message ?? ''), 'sem aprovação valendo nem o Admin envia (400)', noApproval.json?.message)

  // Criar peça + marcas
  const created = await call('freela', 'POST', '/print/cards', { companyId: PET, title: `Placa nova ${RUN}`, printSpecs: { format: 'A4', quantity: 50 } })
  check(created.status === 201 && created.json.status === 'IN_PRODUCTION' && created.json.kind === 'PRINT' && created.json.printSpecs.quantity === 50, 'freelancer cria peça da PetJourney (Em produção, com especificação)', `${created.status}`)
  const crossCreate = await call('freela', 'POST', '/print/cards', { companyId: EMMI, title: 'x' })
  check(crossCreate.status === 403, 'freelancer não cria peça da Emmitec (403)')
  const E = await seedApprovedPiece(EMMI, `Placa EMMI ${RUN}`, { withFile: false })
  const freelaList = await call('freela', 'GET', '/print/cards')
  check(freelaList.status === 200 && !freelaList.json.some((c) => c.companyId === EMMI) && freelaList.json.some((c) => c.id === created.json.id), 'G3 freelancer não vê peça da Emmitec e vê as da PetJourney')
  check((await call('freela', 'POST', `/print/cards/${E.cardId}/status`, { status: 'SENT_TO_PRINTER' })).status === 404, 'freelancer mexer em peça da Emmitec: 404')
  check((await call('freela', 'GET', `/print/cards?companyId=${EMMI}`)).json?.length === 0, 'filtrar pela marca escondida: vazio')
  const filtered = await call('leticia', 'GET', '/print/cards?status=DELIVERED')
  check(filtered.json.every((c) => c.status === 'DELIVERED') && filtered.json.some((c) => c.id === cardId), 'filtro por status')
  check((await call('leticia', 'GET', '/print/cards?status=XYZ')).status === 400, 'status inválido: 400')
  // card que não é PRINT não aparece nem aceita a trilha
  const post = seed.cards.find((c) => c.title.startsWith('Dicas de banho')).id
  check((await call('leticia', 'POST', `/print/cards/${post}/status`, { status: 'SENT_TO_PRINTER' })).status === 404, 'card que não é peça impressa: 404')
}

// ── Tela ───────────────────────────────────────────────────────────────────
async function uiPart(pieceUi) {
  const { chromium } = require('playwright-core')
  console.log('\n== TELA ==')
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const desk = { width: 1440, height: 900, mobile: false, tag: 'd1440' }
  const phone = { width: 375, height: 812, mobile: true, tag: 'm375' }

  async function open(who, route, vp, company) {
    const t = await login(who)
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.mobile ? 2 : 1,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      reducedMotion: 'reduce',
    })
    await ctx.addInitScript(([tk, c]) => {
      localStorage.setItem('token', tk)
      if (c) localStorage.setItem('activeCompany', c)
      localStorage.setItem('onboarding.autoShown', '1')
      localStorage.setItem('onboarding.completed', '1')
      localStorage.setItem('ui.idlePermissionPrompt', 'done')
    }, [t, company ?? null])
    const page = await ctx.newPage()
    const bad = []
    page.on('response', (res) => {
      const u = res.url()
      if (u.startsWith(API) && (res.status() === 401 || res.status() >= 500)) bad.push(`${res.status()} ${u.replace(API, '')}`)
    })
    page.on('pageerror', (e) => bad.push(`pageerror ${e.message}`))
    await page.goto(WEB + route, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    return { ctx, page, bad }
  }
  const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) })
  const noHScroll = async (page, label, w) => {
    const sw = await page.evaluate(() => document.documentElement.scrollWidth)
    check(sw <= w, `${label}: sem rolagem lateral`, `scrollWidth ${sw}`)
  }

  // Editor (Marcel), desktop: o fluxo inteiro pela tela
  {
    const vp = desk
    const { ctx, page, bad } = await open('marcel', '/marketing/grafica', vp, PET)
    await shot(page, `lista-${vp.tag}`)
    await noHScroll(page, `${vp.tag} lista`, vp.width)
    const rows = await page.locator('.mk-pr-row').count()
    check(rows >= 1, `${vp.tag} lista mostra as peças`, `${rows}`)
    await page.locator('.mk-pr-row', { hasText: pieceUi.title }).first().click()
    await page.waitForSelector('[data-testid="print-panel"]')
    await page.waitForSelector('[data-testid="print-panel"] img')
    check(page.url().includes('peca='), `${vp.tag} painel abre pela URL`)
    const note = await page.locator('[data-testid="print-preview-note"]').innerText()
    check(/Prévia aproximada em RGB; o original em CMYK segue intacto/.test(note), `${vp.tag} aviso da prévia RGB`, note)
    check((await page.locator('[data-testid="print-cmyk"]').count()) === 1, `${vp.tag} selo CMYK no arquivo`)
    const imgOk = await page.locator('[data-testid="print-panel"] img').evaluate((img) => img.complete && img.naturalWidth > 0)
    check(imgOk, `${vp.tag} a prévia carregou`)
    await shot(page, `painel-${vp.tag}`)

    // Baixar original: a URL assinada é pedida e chega ao storage
    const dlReq = page.waitForResponse((r) => /\/assets\/[^/]+\/download$/.test(r.url()), { timeout: 8000 }).catch(() => null)
    await page.locator('[data-testid="print-panel"]').getByRole('button', { name: 'Baixar original' }).click()
    const dlRes = await dlReq
    const dlJson = dlRes ? await dlRes.json() : null
    check(!!dlJson && dlJson.sha256 === pieceUi.file.original, `${vp.tag} "Baixar original" pede o original com o sha256 certo`)

    // Enviar sem abrir o checklist: o aviso do servidor aparece
    await page.locator('[data-testid="print-panel"]').getByRole('button', { name: 'Enviar para a gráfica' }).click()
    await page.waitForSelector('[data-testid="print-error"]')
    const err = await page.locator('[data-testid="print-error"]').innerText()
    check(/Faltam 8 itens do pré-gráfica/.test(err), `${vp.tag} enviar sem checklist mostra "Faltam 8 itens"`, err.slice(0, 60))
    check((await page.locator('[data-testid="print-panel"]').getByRole('button', { name: 'Enviar mesmo assim' }).count()) === 0, `${vp.tag} Editor não vê "Enviar mesmo assim"`)
    await page.locator('[data-testid="print-panel"]').getByRole('button', { name: 'Abrir checklist' }).click()
    await page.waitForSelector('[data-testid="prepress-item"]')
    const boxes = page.locator('[data-testid="prepress-item"]')
    check((await boxes.count()) === 8, `${vp.tag} checklist com 8 itens`)
    for (let i = 0; i < 7; i++) {
      await boxes.nth(i).check()
      await page.waitForTimeout(120)
    }
    await shot(page, `checklist-${vp.tag}`)
    await page.locator('[data-testid="print-panel"]').getByRole('button', { name: 'Enviar para a gráfica' }).click()
    await page.waitForTimeout(500)
    const err2 = await page.locator('[data-testid="print-error"]').innerText()
    check(/Faltam 1 item do pré-gráfica/.test(err2), `${vp.tag} com 7 de 8: "Faltam 1 item"`, err2.slice(0, 60))
    await boxes.nth(7).check()
    await page.waitForTimeout(300)
    // especificação pela tela
    await page.getByPlaceholder('Couchê 300 g').fill('Couchê 250 g')
    await page.getByPlaceholder('500').fill('300')
    await page.locator('[data-testid="print-panel"]').getByRole('button', { name: 'Salvar especificação' }).click()
    await page.waitForTimeout(600)
    const saved = await db.query(`SELECT "printSpecs" FROM "MarketingCard" WHERE id=$1`, [pieceUi.cardId])
    check(saved.rows[0].printSpecs?.paper === 'Couchê 250 g' && saved.rows[0].printSpecs?.quantity === 300, `${vp.tag} a especificação foi gravada no banco`)
    await page.locator('[data-testid="print-panel"]').getByRole('button', { name: 'Enviar para a gráfica' }).click()
    await page.locator('[data-testid="print-panel"]').getByRole('button', { name: 'Prova recebida' }).waitFor()
    check(true, `${vp.tag} com tudo marcado a peça vai para a gráfica e aparece "Prova recebida"`)
    await shot(page, `enviado-${vp.tag}`)
    await page.locator('[data-testid="print-panel"]').getByRole('button', { name: 'Prova recebida' }).click()
    await page.locator('[data-testid="print-panel"]').getByRole('button', { name: 'Marcar como entregue' }).waitFor()
    await page.locator('[data-testid="print-panel"]').getByRole('button', { name: 'Marcar como entregue' }).click()
    await page.waitForTimeout(600)
    const fin = await db.query(`SELECT status FROM "MarketingCard" WHERE id=$1`, [pieceUi.cardId])
    check(fin.rows[0].status === 'DELIVERED', `${vp.tag} prova e entrega pela tela gravam no banco`)
    check((await page.getByText('Impresso e entregue').count()) >= 1, `${vp.tag} a tela mostra Impresso e entregue`)
    const link = await page.getByRole('link', { name: 'Abrir aprovação' }).getAttribute('href')
    check(link === `/marketing/cards/${pieceUi.cardId}`, `${vp.tag} link "Abrir aprovação"`, link)
    check((await page.getByText('Orçamentos').count()) >= 1, `${vp.tag} seção Orçamentos presente`)
    await shot(page, `entregue-${vp.tag}`)

    // filtro por etapa na URL
    await page.locator('.mk-pr__chip', { hasText: 'Impresso e entregue' }).click()
    await page.waitForTimeout(300)
    check(page.url().includes('status=DELIVERED'), `${vp.tag} filtro por etapa vai para a URL`)
    // nova peça pela tela
    await page.getByRole('button', { name: 'Nova peça' }).click()
    await page.fill('[data-testid="print-title"]', `Peça criada na tela ${RUN}`)
    await page.getByRole('button', { name: 'Criar peça' }).click()
    await page.waitForSelector(`.pp-title h2:has-text("Peça criada na tela ${RUN}")`)
    const mine = await db.query(`SELECT status, kind FROM "MarketingCard" WHERE title=$1`, [`Peça criada na tela ${RUN}`])
    check(mine.rows[0]?.status === 'IN_PRODUCTION' && mine.rows[0]?.kind === 'PRINT', `${vp.tag} nova peça nasce Em produção (PRINT)`)
    check(bad.length === 0, `${vp.tag} editor: nenhuma 401/5xx`, bad.join(', '))
    await ctx.close()
  }

  // Celular
  {
    const vp = phone
    const { ctx, page, bad } = await open('marcel', '/marketing/grafica', vp, PET)
    await shot(page, `lista-${vp.tag}`)
    await noHScroll(page, `${vp.tag} lista`, vp.width)
    await page.locator('.mk-pr-row', { hasText: pieceUi2.title }).first().click()
    await page.waitForSelector('[data-testid="print-panel"] img')
    await page.waitForTimeout(400)
    await shot(page, `painel-${vp.tag}`)
    await noHScroll(page, `${vp.tag} painel`, vp.width)
    const box = page.locator('[data-testid="prepress-item"]').first()
    await page.locator('[data-testid="print-panel"]').getByRole('button', { name: 'Abrir checklist' }).click()
    await box.waitFor()
    const h = await box.evaluate((el) => el.closest('label').getBoundingClientRect().height)
    check(h >= 44, `${vp.tag} item do checklist com 44px de toque`, `${Math.round(h)}px`)
    await page.locator('[data-testid="prepress-item"]').first().scrollIntoViewIfNeeded()
    await shot(page, `checklist-${vp.tag}`)
    check(bad.length === 0, `${vp.tag} editor: nenhuma 401/5xx`, bad.join(', '))
    await ctx.close()
  }

  // Visualizador: vê, não muda
  {
    const { ctx, page, bad } = await open('diretoria', '/marketing/grafica', desk, null)
    check((await page.locator('.mk-pr-row').count()) >= 1, 'Diretoria vê a lista')
    check((await page.getByRole('button', { name: 'Nova peça' }).count()) === 0, 'Diretoria não tem "Nova peça"')
    await page.locator('.mk-pr-row', { hasText: pieceUi2.title }).first().click()
    await page.waitForSelector('[data-testid="print-panel"]')
    for (const name of ['Enviar para a gráfica', 'Prova recebida', 'Salvar especificação', 'Abrir checklist']) {
      check((await page.locator('[data-testid="print-panel"]').getByRole('button', { name }).count()) === 0, `Diretoria não tem "${name}"`)
    }
    check((await page.locator('[data-testid="print-panel"]').getByRole('button', { name: 'Baixar original' }).count()) >= 1, 'Diretoria baixa o original')
    await shot(page, 'diretoria-d1440')
    check(bad.length === 0, 'Diretoria: nenhuma 401/5xx', bad.join(', '))
    await ctx.close()
  }
  // Admin: "Enviar mesmo assim"
  {
    const { ctx, page, bad } = await open('leticia', '/marketing/grafica', desk, PET)
    await page.locator('.mk-pr-row', { hasText: pieceUi2.title }).first().click()
    await page.waitForSelector('[data-testid="print-panel"]')
    // o checklist já foi aberto pelo teste do celular; se não, abre agora
    const abrir = page.locator('[data-testid="print-panel"]').getByRole('button', { name: 'Abrir checklist' })
    if (await abrir.count()) await abrir.click()
    await page.waitForSelector('[data-testid="prepress-item"]')
    await page.locator('[data-testid="print-panel"]').getByRole('button', { name: 'Enviar para a gráfica' }).click()
    await page.waitForSelector('[data-testid="print-error"]')
    await page.locator('[data-testid="print-panel"]').getByRole('button', { name: 'Enviar mesmo assim' }).click()
    await page.waitForSelector('text=Enviar com o pré-gráfica aberto?')
    await shot(page, 'admin-forca-d1440')
    await page.getByRole('button', { name: 'Enviar mesmo assim' }).last().click()
    await page.locator('[data-testid="print-panel"]').getByRole('button', { name: 'Prova recebida' }).waitFor()
    const st = await db.query(`SELECT status FROM "MarketingCard" WHERE id=$1`, [pieceUi2.cardId])
    check(st.rows[0].status === 'SENT_TO_PRINTER', 'Admin força o envio pela tela')
    check(bad.length === 0, 'Admin: nenhuma 401/5xx', bad.join(', '))
    await ctx.close()
  }
  await browser.close()
}

let pieceUi2
;(async () => {
  await db.connect()
  const b = await storage.getBucket('drive-files')
  if (!b.data) await storage.createBucket('drive-files', { public: false })
  const A = await seedApprovedPiece(PET, `Placa de balcao API ${RUN}`)
  const U1 = await seedApprovedPiece(PET, `Placa de balcao tela ${RUN}`)
  U1.title = `Placa de balcao tela ${RUN}`
  const U2 = await seedApprovedPiece(PET, `Folder da feira tela ${RUN}`)
  U2.title = `Folder da feira tela ${RUN}`
  pieceUi2 = U2
  await apiPart(A)
  if (!process.env.SKIP_UI) await uiPart(U1)
  await db.end()
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK')
  process.exit(fails ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})
