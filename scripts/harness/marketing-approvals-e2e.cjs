// Roteiro de ponta a ponta da Aprovação (ala Marketing, M1-A): critérios A1 a A10
// da spec docs/specs/2026/q4/q4-2/ala-marketing/m1-aprovacao-calendario.md, pela
// API E pela tela (Edge headless, 1440 e 375, toque de verdade pelo CDP no celular).
//
// Uso (cada agente com o seu banco, API e Vite):
//   API=http://127.0.0.1:3611 WEB=http://localhost:5181 HARNESS_DB=wf_m1a \
//   HARNESS_SEED=seed-marketing-out.wf_m1a.json node marketing-approvals-e2e.cjs
// Pré-requisitos: banco do marketing-db.sh, fake-storage (54329) e a API e o Vite no ar.
// Escreve só no banco do harness (cards com título "E2E ..." são recriados a cada rodada).
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { pickOption } = require('./app-select.cjs')
const pg = require('pg')

const API = process.env.API ?? 'http://127.0.0.1:3611'
const WEB = process.env.WEB ?? 'http://localhost:5181'
const DB = process.env.HARNESS_DB ?? 'wf_m1a'
const seedPath = path.resolve(__dirname, process.env.HARNESS_SEED ?? `seed-marketing-out.${DB}.json`)
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
const OUT = process.env.SHOTS ?? path.join(__dirname, 'prints', 'marketing-approvals')
const sharp = require(path.join(__dirname, '../../../workflow-api/node_modules/sharp'))
fs.mkdirSync(OUT, { recursive: true })

const G = seed.groupId
const U = seed.users
const C = seed.companies

let fails = 0
const results = []
const check = (crit, cond, msg, extra = '') => {
  const line = `${cond ? 'OK  ' : 'FAIL'} [${crit}] ${msg}${extra ? '  (' + String(extra).slice(0, 300) + ')' : ''}`
  console.log(line)
  results.push({ crit, ok: !!cond, msg })
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
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

// ── API ─────────────────────────────────────────────────────────────────────
async function login(email) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'nevo1234' }),
  })
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`)
  return (await r.json()).accessToken
}

async function api(token, method, route, body) {
  const url = route.startsWith('/marketing') || route.startsWith('/inbox') ? `${API}${route}` : `${API}/marketing/g/${G}${route}`
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

/** Pede o ticket, faz o PUT direto no storage e confirma (o mesmo caminho do navegador). */
async function upload(token, cardId, buffer, name, mimeType) {
  const t = await api(token, 'POST', `/cards/${cardId}/assets`, { name, mimeType, size: buffer.length, sha256: sha(buffer) })
  if (t.status !== 201) throw new Error(`ticket ${t.status} ${JSON.stringify(t.data)}`)
  const put = await fetch(t.data.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': mimeType, authorization: `Bearer ${t.data.token}` },
    body: buffer,
  })
  if (!put.ok) throw new Error(`PUT ${put.status}`)
  const c = await api(token, 'POST', `/assets/${t.data.asset.id}/confirm`, {})
  if (c.status >= 300) throw new Error(`confirm ${c.status}`)
  return c.data
}

// ── Arquivos de teste ───────────────────────────────────────────────────────
async function png(label, hue, w = 1200, h = 900) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="hsl(${hue},55%,62%)"/>
    <circle cx="${w * 0.3}" cy="${h * 0.4}" r="70" fill="hsl(${hue},40%,30%)"/>
    <rect x="${w * 0.62}" y="${h * 0.62}" width="260" height="160" rx="18" fill="hsl(${(hue + 180) % 360},50%,45%)"/>
    <text x="50%" y="16%" font-family="Arial" font-size="72" font-weight="700" text-anchor="middle" fill="hsl(0,0%,12%)">${label}</text>
  </svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

/** Vídeo de ~9 s gravado no próprio Edge (canvas + MediaRecorder): sem ffmpeg na máquina. */
async function makeClip(browser) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' })
  const out = await page.evaluate(async () => {
    const c = document.createElement('canvas')
    c.width = 640
    c.height = 360
    const g = c.getContext('2d')
    const stream = c.captureStream(15)
    const mime = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t))
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 500000 })
    const chunks = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const t0 = performance.now()
    let alive = true
    const draw = () => {
      if (!alive) return
      const s = (performance.now() - t0) / 1000
      g.fillStyle = `hsl(${(s * 40) % 360},55%,40%)`
      g.fillRect(0, 0, 640, 360)
      g.fillStyle = 'white'
      g.font = 'bold 140px Arial'
      g.textAlign = 'center'
      g.fillText(`${Math.floor(s)}s`, 320, 230)
      requestAnimationFrame(draw)
    }
    draw()
    rec.start(250)
    await new Promise((r) => setTimeout(r, 9400))
    const stopped = new Promise((r) => (rec.onstop = r))
    rec.stop()
    await stopped
    alive = false
    const blob = new Blob(chunks, { type: mime.split(';')[0] })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return { b64: btoa(bin), mime: blob.type }
  })
  await ctx.close()
  return { buffer: Buffer.from(out.b64, 'base64'), mime: out.mime, ext: out.mime.includes('mp4') ? 'mp4' : 'webm' }
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
  page.bad = []
  page.on('response', (res) => {
    const u = res.url()
    if (u.startsWith(API) && (res.status() === 401 || res.status() >= 500)) {
      const line = `${who}: ${res.status()} ${res.request().method()} ${u.replace(API, '')}`
      page.bad.push(line)
      allBad.push(line)
    }
  })
  page.on('pageerror', (e) => allErrors.push(`${who}: ${e.message}`))
  await page.goto(WEB + route, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.addStyleTag({ content: '#__vue-devtools-container__{display:none!important}' }).catch(() => {})
  await sleep(500)
  return page
}

async function goto(page, route) {
  await page.goto(WEB + route, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await sleep(400)
}

async function finger(page) {
  const cdp = await page.context().newCDPSession(page)
  const send = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
  return {
    async tap(x, y) {
      await send('touchStart', x, y)
      await sleep(60)
      await send('touchEnd')
    },
    async hold(x, y, ms = 520) {
      await send('touchStart', x, y)
      await sleep(ms / 2)
      await send('touchMove', x + 2, y + 1)
      await sleep(ms / 2)
      await send('touchEnd')
    },
  }
}

async function centerOf(locator) {
  await locator.scrollIntoViewIfNeeded()
  const b = await locator.boundingBox()
  if (!b) throw new Error('sem caixa')
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b }
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) })
const scrollWidth = (page) => page.evaluate(() => document.documentElement.scrollWidth)
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent?.trim() ?? ''))
const headStatus = (page) => page.locator('[data-testid="head-status"]').innerText().catch(() => '')

;(async () => {
  const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
  await db.connect()
  const q = async (sql, params) => (await db.query(sql, params)).rows

  // Rodada limpa: tira os cards de rodadas anteriores (o storage deles também).
  const old = await q(`SELECT id FROM "MarketingCard" WHERE "groupId"=$1 AND title LIKE 'E2E %'`, [G])
  const tok = {
    nicolas: await login('nicolas@nevo.test'),
    leticia: await login('leticia@nevo.test'),
    marcel: await login('marcel@nevo.test'),
    freela: await login('freela@nevo.test'),
    diretoria: await login('diretoria@nevo.test'),
    luis: await login('luis@nevo.test'),
  }
  for (const r of old) await api(tok.nicolas, 'DELETE', `/cards/${r.id}`)
  const seedIdea = seed.cards.find((c) => c.title === 'Dicas de banho no inverno')
  // Os cards do seed voltam ao status de origem (uma rodada anterior pode ter movido).
  for (const c of seed.cards) await q(`UPDATE "MarketingCard" SET status=$2 WHERE id=$1`, [c.id, c.status])

  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const img1 = await png('Arte 1 (V1)', 200)
  const img2 = await png('Arte 2 (V1)', 30)
  const img3 = await png('Arte 1 (V2)', 140)
  const clip = await makeClip(browser)
  console.log(`(vídeo de teste: ${clip.mime}, ${clip.buffer.length} bytes)`)

  let mainCardId = null
  try {
    // ════════════════════════════════════════════════════════════════════
    // A1. Marcel cria, sobe 2 imagens, fecha a V1 e envia; Letícia é avisada
    // ════════════════════════════════════════════════════════════════════
    const mCtx = await newCtx(browser, tok.marcel, DESK, C.pet)
    const mPage = await open(mCtx, '/marketing/aprovacoes', 'marcel')
    await mPage.waitForSelector('.mkb__col', { timeout: 15000 })
    await mPage.click('[data-action="new-card"]')
    await mPage.waitForSelector('input[name="title"]')
    await mPage.fill('input[name="title"]', 'E2E Post do Dia dos Pets')
    // AppSelect: abre o gatilho do campo e clica na opção pelo texto.
    await pickOption(mPage, '[data-field="companyId"]', 'PetJourney')
    await pickOption(mPage, '[data-field="kind"]', 'Carrossel')
    await shot(mPage, 'novo-card-d1440.png')
    await mPage.getByRole('button', { name: 'Criar card' }).click()
    await mPage.waitForURL(/\/marketing\/cards\//, { timeout: 10000 })
    mainCardId = mPage.url().split('/marketing/cards/')[1].split('?')[0]
    check('A1', !!mainCardId, 'Marcel cria o card pela tela e cai na página do card', mainCardId)

    await mPage.click('[data-action="upload-version"]')
    await mPage.setInputFiles('input[name="files"]', [
      { name: 'arte-1.png', mimeType: 'image/png', buffer: img1 },
      { name: 'arte-2.png', mimeType: 'image/png', buffer: img2 },
    ])
    const ready2 = await waitFor(async () => (await mPage.locator('[data-entry="ready"]').count()) === 2, 20000)
    check('A1', ready2, 'as 2 imagens sobem direto para o storage (progresso por arquivo)')
    await shot(mPage, 'subir-v1-d1440.png')
    await mPage.click('[data-action="close-version"]')
    await mPage.waitForSelector('[data-version="1"]', { timeout: 10000 })
    await mPage.click('[data-action="send-approval"]')
    const sent = await waitFor(async () => (await headStatus(mPage)).includes('Aguardando aprovação'))
    check('A1', sent, 'Enviar para aprovação muda o status na tela', await headStatus(mPage))
    const a1 = (await q(`SELECT c.status, v.number, (SELECT count(*)::int FROM "MarketingAsset" a WHERE a."versionId"=v.id) n
      FROM "MarketingCard" c JOIN "MarketingCardVersion" v ON v.id=c."currentVersionId" WHERE c.id=$1`, [mainCardId]))[0]
    check('A1', a1?.status === 'AWAITING_APPROVAL' && a1?.number === 1 && a1?.n === 2, 'banco: Aguardando, V1 com 2 arquivos', JSON.stringify(a1))
    await shot(mPage, 'card-v1-d1440.png')
    const notifL = await q(`SELECT title, link FROM "Notification" WHERE "userId"=$1 AND type='MARKETING_APPROVAL_REQUESTED' AND split_part(link, '?', 1)=$2`, [U.leticia, `/marketing/cards/${mainCardId}`])
    const notifSelf = await q(`SELECT 1 FROM "Notification" WHERE "userId"=$1 AND split_part(link, '?', 1)=$2`, [U.marcel, `/marketing/cards/${mainCardId}`])
    check('A1', notifL.length === 1 && notifSelf.length === 0, 'Letícia avisada (APPROVAL_REQUESTED); Marcel não recebe aviso da própria ação', JSON.stringify(notifL))
    // O link do aviso leva o grupo (quem está em dois grupos cai no certo).
    check('A1', notifL[0]?.link === `/marketing/cards/${mainCardId}?grupo=${encodeURIComponent(seed.groupId)}`, 'link do aviso leva ?grupo= do grupo', notifL[0]?.link)

    // Sino da Letícia, na tela
    const lCtx = await newCtx(browser, tok.leticia, DESK, C.pet)
    const lPage = await open(lCtx, '/marketing', 'leticia')
    await lPage.click('.inbox-trigger')
    const bellItem = lPage.locator('.inbox-item-title', { hasText: 'E2E Post do Dia dos Pets' }).first()
    const inBell = await waitFor(async () => (await bellItem.count()) > 0)
    check('A1', inBell, 'Letícia vê o aviso no sino', inBell ? await bellItem.innerText() : '')
    await shot(lPage, 'sino-leticia-d1440.png')
    if (inBell) {
      await bellItem.click()
      await lPage.waitForURL(/\/marketing\/cards\//, { timeout: 8000 }).catch(() => {})
      check('A1', lPage.url().includes(`/marketing/cards/${mainCardId}`), 'clicar no aviso abre a página do card', lPage.url().replace(WEB, ''))
    }

    // ════════════════════════════════════════════════════════════════════
    // A2. Pedir ajuste sem comentário: 400; com comentário e 2 linhas: ajustes
    // ════════════════════════════════════════════════════════════════════
    const rc0 = await api(tok.leticia, 'POST', `/cards/${mainCardId}/request-changes`, {})
    const rc1 = await api(tok.leticia, 'POST', `/cards/${mainCardId}/request-changes`, { body: '   ' })
    check('A2', rc0.status === 400 && /Pedir ajuste exige um comentário/.test(rc0.data?.message), 'API: pedir ajuste sem comentário dá 400 com a frase', rc0.data?.message)
    check('A2', rc1.status === 400, 'API: comentário só com espaço também dá 400')
    await goto(lPage, `/marketing/cards/${mainCardId}`)
    await lPage.click('[data-action="request-changes"]')
    await lPage.click('[data-action="confirm-changes"]')
    const errUi = await waitFor(async () => (await lPage.locator('[data-testid="review-error"]').innerText()).includes('exige um comentário'))
    check('A2', errUi, 'tela: Pedir ajuste vazio mostra a frase e não grava')
    await lPage.fill('textarea[name="body"]', 'Trocar a foto do gato pela do cachorro\nLogo maior no canto de baixo')
    await shot(lPage, 'pedir-ajuste-d1440.png')
    await lPage.click('[data-action="confirm-changes"]')
    const changed = await waitFor(async () => (await headStatus(lPage)).includes('Ajustes pedidos'))
    check('A2', changed, 'tela: card em Ajustes pedidos', await headStatus(lPage))
    const a2 = (await q(`SELECT status FROM "MarketingCard" WHERE id=$1`, [mainCardId]))[0]
    const items = await q(`SELECT text, kind FROM "MarketingChecklistItem" WHERE "cardId"=$1 ORDER BY position`, [mainCardId])
    check('A2', a2.status === 'CHANGES_REQUESTED' && items.length === 2 && items.every((i) => i.kind === 'ADJUSTMENT'), 'banco: CHANGES_REQUESTED e 2 itens ADJUSTMENT', JSON.stringify(items))
    const notifM = await q(`SELECT 1 FROM "Notification" WHERE "userId"=$1 AND type='MARKETING_CHANGES_REQUESTED' AND split_part(link, '?', 1)=$2`, [U.marcel, `/marketing/cards/${mainCardId}`])
    check('A2', notifM.length === 1, 'Marcel avisado do ajuste (CHANGES_REQUESTED)')
    await shot(lPage, 'card-ajuste-d1440.png')

    // ════════════════════════════════════════════════════════════════════
    // A3. Marcel marca os itens e sobe a V2: volta para Aguardando sozinho
    // ════════════════════════════════════════════════════════════════════
    await goto(mPage, `/marketing/cards/${mainCardId}`)
    const boxes = mPage.locator('[data-item] input[type="checkbox"]')
    for (let i = 0; i < (await boxes.count()); i++) {
      await boxes.nth(i).check()
      await sleep(500)
    }
    const doneRows = await waitFor(async () => {
      const r = await q(`SELECT "doneById" FROM "MarketingChecklistItem" WHERE "cardId"=$1 AND "doneAt" IS NOT NULL`, [mainCardId])
      return r.length === 2 ? r : null
    })
    check('A3', doneRows && doneRows.every((r) => r.doneById === U.marcel), 'Marcel marca os 2 itens (banco grava quem marcou)')
    await mPage.click('[data-action="upload-version"]')
    await mPage.setInputFiles('input[name="files"]', [
      { name: 'arte-1-v2.png', mimeType: 'image/png', buffer: img3 },
      { name: 'arte-2.png', mimeType: 'image/png', buffer: img2 },
    ])
    await waitFor(async () => (await mPage.locator('[data-entry="ready"]').count()) === 2, 20000)
    await mPage.fill('textarea[name="note"]', 'Foto do cachorro e logo maior')
    await mPage.click('[data-action="close-version"]')
    const back = await waitFor(async () => (await headStatus(mPage)).includes('Aguardando aprovação'), 10000)
    check('A3', back, 'tela: a V2 volta o card para Aguardando aprovação sozinho', await headStatus(mPage))
    const a3 = (await q(`SELECT c.status, c."approvedVersionId", v.number FROM "MarketingCard" c JOIN "MarketingCardVersion" v ON v.id=c."currentVersionId" WHERE c.id=$1`, [mainCardId]))[0]
    check('A3', a3.status === 'AWAITING_APPROVAL' && a3.number === 2 && a3.approvedVersionId === null, 'banco: Aguardando, versão atual V2, sem aprovação', JSON.stringify(a3))
    const notifNV = await q(`SELECT 1 FROM "Notification" WHERE "userId"=$1 AND type='MARKETING_NEW_VERSION' AND split_part(link, '?', 1)=$2`, [U.leticia, `/marketing/cards/${mainCardId}`])
    check('A3', notifNV.length === 1, 'Letícia avisada da V2 (NEW_VERSION)')
    await mPage.click('[data-version="compare"]')
    await mPage.waitForSelector('[data-testid="compare"]')
    const cmp = await waitFor(async () => {
      const r = await mPage.evaluate(() =>
        [...document.querySelectorAll('[data-testid="compare"] [data-side]')].map((s) => ({
          side: s.getAttribute('data-side'),
          version: s.querySelector('button[role="combobox"]')?.textContent?.trim(),
          img: (() => {
            const i = s.querySelector('img[data-testid="version-image"]')
            return i && i.complete ? i.naturalWidth : 0
          })(),
          left: Math.round(s.getBoundingClientRect().left),
        })),
      )
      return r.length === 2 && r.every((x) => x.img > 0) ? r : null
    })
    check(
      'A3',
      cmp && cmp[0].version.startsWith('V1') && cmp[1].version.startsWith('V2') && cmp[1].left > cmp[0].left,
      'Comparar abre V1 e V2 lado a lado, com as imagens carregadas',
      JSON.stringify(cmp),
    )
    await shot(mPage, 'comparar-v1-v2-d1440.png')

    // ════════════════════════════════════════════════════════════════════
    // A4. Comentário no ponto da imagem e no segundo 7 do vídeo
    // ════════════════════════════════════════════════════════════════════
    await goto(lPage, `/marketing/cards/${mainCardId}`)
    const image = lPage.locator('img[data-testid="version-image"]').first()
    await image.waitFor({ timeout: 10000 })
    await waitFor(() => image.evaluate((i) => i.complete && i.naturalWidth > 0))
    const ib = await image.boundingBox()
    await lPage.mouse.click(ib.x + ib.width * 0.3, ib.y + ib.height * 0.4)
    await lPage.waitForSelector('[data-testid="comment-draft"]')
    await lPage.fill('textarea[name="comment"]', 'Aumentar o contraste aqui')
    const marcelName = (await q(`SELECT name FROM "User" WHERE id=$1`, [U.marcel]))[0].name
    await pickOption(lPage, '.mkcm__mention-sel', marcelName)
    await lPage.click('[data-action="send-comment"]')
    await lPage.waitForSelector('[data-pin]', { timeout: 8000 })
    const comments = (await api(tok.leticia, 'GET', `/cards/${mainCardId}/comments`)).data
    const pinC = comments.find((c) => c.body.startsWith('Aumentar o contraste aqui'))
    const notifMention = await q(`SELECT title FROM "Notification" WHERE "userId"=$1 AND type='MARKETING_MENTIONED' AND split_part(link, '?', 1)=$2`, [U.marcel, `/marketing/cards/${mainCardId}`])
    check('extra', pinC?.mentions?.includes(U.marcel) && notifMention.length === 1, 'menção pela tela grava o id e avisa o Marcel (MENTIONED)', notifMention[0]?.title)
    const v2Id = (await q(`SELECT "currentVersionId" FROM "MarketingCard" WHERE id=$1`, [mainCardId]))[0].currentVersionId
    check(
      'A4',
      pinC && Math.abs(pinC.anchorX - 0.3) < 0.01 && Math.abs(pinC.anchorY - 0.4) < 0.01 && pinC.assetId && pinC.versionId === v2Id,
      'comentário no ponto grava x e y entre 0 e 1, o arquivo e a V2',
      pinC && `${pinC.anchorX}, ${pinC.anchorY}`,
    )
    const pinPos = await lPage.evaluate(() => {
      const img = document.querySelector('img[data-testid="version-image"]').getBoundingClientRect()
      const pin = document.querySelector('[data-pin]').getBoundingClientRect()
      return { x: (pin.left + pin.width / 2 - img.left) / img.width, y: (pin.top + pin.height / 2 - img.top) / img.height }
    })
    check('A4', Math.abs(pinPos.x - 0.3) < 0.02 && Math.abs(pinPos.y - 0.4) < 0.02, 'o pino aparece no lugar clicado', JSON.stringify(pinPos))
    const badAnchor = await api(tok.leticia, 'POST', `/cards/${mainCardId}/comments`, { body: 'fora', assetId: pinC?.assetId, anchorX: 1.5, anchorY: 0.2 })
    check('A4', badAnchor.status === 400 && /entre 0 e 1/.test(badAnchor.data?.message), 'API: ponto fora da imagem dá 400', badAnchor.data?.message)
    await lPage.locator(`[data-anchor="${pinC.id}"]`).click()
    const lit = await waitFor(() => lPage.locator(`[data-pin="${pinC.id}"].is-on`).count())
    check('A4', lit, 'clicar no comentário acende o pino')
    await shot(lPage, 'pino-na-arte-d1440.png')
    // As linhas do "Pedir ajuste" já vêm com o comentário com ponto ainda aberto.
    await lPage.click('[data-action="request-changes"]')
    await lPage.waitForSelector('.mkrv__line input')
    const prefill = await lPage.locator('.mkrv__line input').evaluateAll((els) => els.map((e) => e.value))
    check('A2', prefill.some((v) => v.startsWith('Aumentar o contraste aqui')), 'Pedir ajuste já traz os comentários com ponto abertos como linhas do checklist', prefill.join(' | '))
    await shot(lPage, 'pedir-ajuste-preenchido-d1440.png')
    await lPage.locator('.mkrv__foot .mk-btn--ghost').click()
    await lPage.click(`[data-resolve="${pinC.id}"]`)
    const resolved = await waitFor(async () => (await q(`SELECT "resolvedById" FROM "MarketingComment" WHERE id=$1 AND "resolvedAt" IS NOT NULL`, [pinC.id]))[0])
    const pinGray = await waitFor(() => lPage.locator(`[data-pin="${pinC.id}"].is-resolved`).count())
    check('extra', resolved?.resolvedById === U.leticia && pinGray, 'Resolver o comentário grava quem resolveu e apaga o pino', resolved?.resolvedById)
    const assign = await api(tok.leticia, 'PATCH', `/cards/${mainCardId}`, { assigneeId: U.marcel, captions: { INSTAGRAM: 'Feliz Dia dos Pets!' }, hashtags: ['#diadospets', 'pets'] })
    const notifAssign = await q(`SELECT 1 FROM "Notification" WHERE "userId"=$1 AND type='MARKETING_CARD_ASSIGNED' AND split_part(link, '?', 1)=$2`, [U.marcel, `/marketing/cards/${mainCardId}`])
    check(
      'extra',
      assign.status === 200 && assign.data.assignee?.id === U.marcel && assign.data.captions.INSTAGRAM === 'Feliz Dia dos Pets!' && assign.data.hashtags.join() === 'diadospets,pets' && notifAssign.length === 1,
      'PATCH grava responsável, legenda e hashtags e avisa o responsável (CARD_ASSIGNED)',
      `${assign.status} ${JSON.stringify(assign.data?.captions)} ${assign.data?.hashtags}`,
    )

    // Vídeo: card REEL com o clipe
    const reel = await api(tok.marcel, 'POST', '/cards', { companyId: C.pet, title: 'E2E Reel com corte', kind: 'REEL', networks: ['INSTAGRAM', 'TIKTOK'], status: 'IN_PRODUCTION' })
    const clipAsset = await upload(tok.marcel, reel.data.id, clip.buffer, `reel.${clip.ext}`, clip.mime)
    await api(tok.marcel, 'POST', `/cards/${reel.data.id}/versions`, { assetIds: [clipAsset.id] })
    await goto(lPage, `/marketing/cards/${reel.data.id}`)
    const video = lPage.locator('video[data-testid="version-video"]')
    await video.waitFor({ timeout: 10000 })
    await waitFor(() => video.evaluate((v) => v.readyState >= 1))
    await video.evaluate(async (v) => {
      v.muted = true
      await v.play().catch(() => {})
      await new Promise((r) => setTimeout(r, 300))
      v.pause()
      v.currentTime = 7
      await new Promise((r) => {
        v.addEventListener('seeked', r, { once: true })
        setTimeout(r, 3000)
      })
    })
    await sleep(300)
    await lPage.click('[data-action="comment-at-time"]')
    const draftTxt = await lPage.locator('[data-testid="comment-draft"]').innerText()
    check('A4', draftTxt.includes('0:07'), '"Comentar neste minuto" marca o segundo 7', draftTxt)
    await lPage.fill('textarea[name="comment"]', 'Cortar a cena a partir daqui')
    await lPage.click('[data-action="send-comment"]')
    await lPage.waitForSelector('[data-mark]', { timeout: 8000 })
    const vComments = (await api(tok.leticia, 'GET', `/cards/${reel.data.id}/comments`)).data
    const tC = vComments.find((c) => c.anchorTime !== null)
    check('A4', tC && Math.abs(tC.anchorTime - 7) < 0.25, 'API: comentário gravado no segundo 7 do vídeo', tC?.anchorTime)
    await video.evaluate(async (v) => {
      v.currentTime = 0
      await new Promise((r) => {
        v.addEventListener('seeked', r, { once: true })
        setTimeout(r, 2000)
      })
    })
    await lPage.locator(`[data-anchor="${tC.id}"]`).click()
    const jumped = await waitFor(async () => {
      const t = await video.evaluate((v) => v.currentTime)
      return Math.abs(t - 7) < 0.5 ? t : null
    }, 5000)
    check('A4', !!jumped, 'clicar no comentário pula o vídeo para 0:07', jumped)
    await shot(lPage, 'video-minuto-d1440.png')

    // Arquivar tira do board; o filtro "Arquivados" mostra e desarquivar devolve.
    await goto(mPage, `/marketing/cards/${reel.data.id}`)
    await mPage.getByRole('button', { name: 'Arquivar' }).click()
    const archived = await waitFor(async () => (await q(`SELECT "archivedAt" FROM "MarketingCard" WHERE id=$1`, [reel.data.id]))[0].archivedAt)
    await goto(mPage, '/marketing/aprovacoes')
    await mPage.waitForSelector('.mkb__col')
    const hidden = (await mPage.locator(`.mkc[data-id="${reel.data.id}"]`).count()) === 0
    await goto(mPage, '/marketing/aprovacoes?arquivados=1')
    await mPage.waitForSelector('.mkb__col')
    const listed = (await mPage.locator(`.mkc[data-id="${reel.data.id}"]`).count()) === 1
    await mPage.locator(`.mkc[data-id="${reel.data.id}"]`).click()
    await mPage.waitForURL(/\/marketing\/cards\//)
    await mPage.getByRole('button', { name: 'Desarquivar' }).click()
    const unarchived = await waitFor(async () => (await q(`SELECT "archivedAt" FROM "MarketingCard" WHERE id=$1`, [reel.data.id]))[0].archivedAt === null)
    check('extra', archived && hidden && listed && unarchived, 'arquivar tira do board, "Arquivados" mostra e desarquivar devolve')

    // ════════════════════════════════════════════════════════════════════
    // A6 (parte 1). Marcel tenta aprovar: 403. Arrastar para Aprovado: 400
    // ════════════════════════════════════════════════════════════════════
    const ap = await api(tok.marcel, 'POST', `/cards/${mainCardId}/approve`, {})
    check('A6', ap.status === 403, 'Marcel (Editor) tenta aprovar pela API: 403', `${ap.status} ${ap.data?.message}`)
    const mv = await api(tok.marcel, 'POST', `/cards/${mainCardId}/move`, { status: 'APPROVED' })
    check('A6', mv.status === 400 && /botão Aprovar/.test(mv.data?.message), 'API: mover para Aprovado dá 400 com o motivo', mv.data?.message)
    await goto(mPage, '/marketing/aprovacoes')
    const src = mPage.locator(`[data-col="AWAITING_APPROVAL"] .mkc[data-id="${mainCardId}"]`)
    await src.waitFor({ timeout: 10000 })
    // Aprovado está vazio, então é uma faixa recolhida de 44px (sem `.mkb__cards`):
    // o alvo de soltura é a coluna inteira (o board cabe na tela desde nov/2026,
    // ver marketing-board-fit-e2e.cjs).
    await mPage.locator('[data-col="APPROVED"]').scrollIntoViewIfNeeded()
    await src.dragTo(mPage.locator('[data-col="APPROVED"]'))
    const refused = await waitFor(async () => (await toasts(mPage)).find((t) => t.includes('botão Aprovar')), 6000)
    await sleep(600)
    const stillAwaiting = await mPage.locator(`[data-col="AWAITING_APPROVAL"] .mkc[data-id="${mainCardId}"]`).count()
    const dbAfterDrag = (await q(`SELECT status FROM "MarketingCard" WHERE id=$1`, [mainCardId]))[0].status
    check('A6', !!refused && stillAwaiting === 1 && dbAfterDrag === 'AWAITING_APPROVAL', 'tela: arrastar para Aprovado volta o card e mostra o motivo', refused)
    await shot(mPage, 'arrastar-recusado-d1440.png')

    // ════════════════════════════════════════════════════════════════════
    // A5. Letícia aprova pelo celular, na página do card, sem rolagem lateral
    // ════════════════════════════════════════════════════════════════════
    const lpCtx = await newCtx(browser, tok.leticia, PHONE, C.pet)
    const lp = await open(lpCtx, `/marketing/cards/${mainCardId}`, 'leticia-celular')
    await lp.waitForSelector('[data-action="approve"]', { timeout: 10000 })
    await waitFor(() => lp.locator('img[data-testid="version-image"]').first().evaluate((i) => i.complete && i.naturalWidth > 0))
    const sw1 = await scrollWidth(lp)
    check('A5', sw1 <= 375, '375: página do card sem rolagem lateral', `scrollWidth ${sw1}`)
    const bar = await lp.evaluate(() => {
      const el = document.querySelector('.mkcv__actions--bar')
      if (!el) return null
      const r = el.getBoundingClientRect()
      const btns = [...el.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().height))
      // A tab bar do MobileShell: a barra de ação encosta em cima dela.
      const tabs = document.querySelector('.m-tabs')?.getBoundingClientRect()
      return { bottom: Math.round(r.bottom), tabTop: tabs ? Math.round(tabs.top) : innerHeight, fixed: getComputedStyle(el).position, btns }
    })
    check(
      'A5',
      bar && bar.fixed === 'fixed' && Math.abs(bar.tabTop - bar.bottom) <= 2 && bar.btns.every((h) => h >= 44),
      '375: barra de ação presa embaixo (acima da tab bar), botões de 44px',
      JSON.stringify(bar),
    )
    await shot(lp, 'card-celular-m375.png')
    const hand = await finger(lp)
    const imgC = await centerOf(lp.locator('img[data-testid="version-image"]').first())
    await hand.tap(imgC.box.x + imgC.box.width * 0.6, imgC.box.y + imgC.box.height * 0.3)
    const confirmShown = await waitFor(() => lp.locator('[data-action="confirm-point"]').count())
    check('A5', confirmShown, '375: tocar na imagem pede confirmação antes do pino')
    await shot(lp, 'card-celular-confirmar-ponto-m375.png')
    const confirmBox = await lp.evaluate(() => {
      const r = document.querySelector('.mkv__confirm')?.getBoundingClientRect()
      return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight } : null
    })
    check('A5', confirmBox && confirmBox.bottom <= confirmBox.vh && confirmBox.top >= 0, '375: a pergunta do ponto fica à vista (presa embaixo)', JSON.stringify(confirmBox))
    await lp.locator('[data-action="cancel-point"]').tap()
    const ap5 = await centerOf(lp.locator('[data-action="approve"]'))
    await hand.tap(ap5.x, ap5.y)
    await lp.waitForSelector('[data-action="confirm-approve"]', { timeout: 5000 })
    await shot(lp, 'aprovar-celular-m375.png')
    const cf = await centerOf(lp.locator('[data-action="confirm-approve"]'))
    await hand.tap(cf.x, cf.y)
    const approved = await waitFor(async () => (await headStatus(lp)).includes('Aprovado'), 8000)
    const a5 = (await q(`SELECT status, "approvedVersionId", "currentVersionId", "approvedById" FROM "MarketingCard" WHERE id=$1`, [mainCardId]))[0]
    check(
      'A5',
      approved && a5.status === 'APPROVED' && a5.approvedVersionId === a5.currentVersionId && a5.approvedById === U.leticia,
      'Letícia aprova com o dedo; banco grava a versão aprovada',
      JSON.stringify(a5),
    )
    const sw2 = await scrollWidth(lp)
    check('A5', sw2 <= 375, '375: depois de aprovar continua sem rolagem lateral', `scrollWidth ${sw2}`)
    await shot(lp, 'aprovado-celular-m375.png')
    const notifAp = await q(`SELECT 1 FROM "Notification" WHERE "userId"=$1 AND type='MARKETING_APPROVED' AND split_part(link, '?', 1)=$2`, [U.marcel, `/marketing/cards/${mainCardId}`])
    check('A5', notifAp.length === 1, 'Marcel avisado da aprovação (APPROVED)')

    // ════════════════════════════════════════════════════════════════════
    // A6 (parte 2). Diretoria (VIEWER): 403 em tudo que escreve; tela sem botões
    // ════════════════════════════════════════════════════════════════════
    const vComment = await api(tok.diretoria, 'POST', `/cards/${mainCardId}/comments`, { body: 'oi' })
    const vMove = await api(tok.diretoria, 'POST', `/cards/${mainCardId}/move`, { status: 'SCHEDULED' })
    const vUpload = await api(tok.diretoria, 'POST', `/cards/${mainCardId}/assets`, { name: 'x.png', mimeType: 'image/png', size: 10 })
    const vCreate = await api(tok.diretoria, 'POST', '/cards', { companyId: C.pet, title: 'Não pode' })
    const vApprove = await api(tok.diretoria, 'POST', `/cards/${mainCardId}/approve`, {})
    const vRead = await api(tok.diretoria, 'GET', `/cards/${mainCardId}`)
    check(
      'A6',
      [vComment, vMove, vUpload, vCreate, vApprove].every((r) => r.status === 403) && vRead.status === 200,
      'Diretoria comenta, move, sobe, cria ou aprova: 403; ler: 200',
      [vComment, vMove, vUpload, vCreate, vApprove, vRead].map((r) => r.status).join(','),
    )
    const dCtx = await newCtx(browser, tok.diretoria, DESK, null)
    const dPage = await open(dCtx, `/marketing/cards/${mainCardId}`, 'diretoria')
    await dPage.waitForSelector('[data-testid="head-status"]', { timeout: 10000 })
    const dUi = await dPage.evaluate(() => ({
      actions: [...document.querySelectorAll('[data-action]')].map((e) => e.getAttribute('data-action')),
      composer: !!document.querySelector('.mkcm__composer'),
      status: !!document.querySelector('[data-testid="status-select"]'),
      checkboxesEnabled: [...document.querySelectorAll('[data-item] input')].filter((i) => !i.disabled).length,
      titleInput: !!document.querySelector('.mkcv__title--input'),
    }))
    check(
      'A6',
      dUi.actions.filter((a) => a !== 'download-original').length === 0 && !dUi.composer && !dUi.status && dUi.checkboxesEnabled === 0 && !dUi.titleInput,
      'tela da Diretoria: sem Aprovar, ajuste, subir, enviar, comentar, mudar status nem apagar',
      JSON.stringify(dUi),
    )
    await shot(dPage, 'diretoria-card-d1440.png')
    await goto(dPage, '/marketing/aprovacoes')
    await dPage.waitForSelector('.mkb__col')
    const dBoard = await dPage.evaluate(() => ({
      newCard: !!document.querySelector('[data-action="new-card"]'),
      draggable: document.querySelectorAll('.mkc[draggable="true"]').length,
    }))
    check('A6', !dBoard.newCard && dBoard.draggable === 0, 'board da Diretoria: sem Novo card e nada arrastável', JSON.stringify(dBoard))
    await shot(dPage, 'diretoria-board-d1440.png')

    // ════════════════════════════════════════════════════════════════════
    // A7. Freelancer não lista nem abre card da Emmitec; só a moldura da ala
    // ════════════════════════════════════════════════════════════════════
    const emmiCard = seed.cards.find((c) => c.title === 'Post institucional EMMI')
    const fList = await api(tok.freela, 'GET', '/cards')
    const fOpen = await api(tok.freela, 'GET', `/cards/${emmiCard.id}`)
    const fFilter = await api(tok.freela, 'GET', `/cards?companyId=${C.emmitec}`)
    const fComments = await api(tok.freela, 'GET', `/cards/${emmiCard.id}/comments`)
    const fComment = await api(tok.freela, 'POST', `/cards/${emmiCard.id}/comments`, { body: 'x' })
    check(
      'A7',
      fList.status === 200 && fList.data.length > 0 && fList.data.every((c) => c.companyId === C.pet),
      'API: freelancer só lista PetJourney',
      `${fList.data?.length} cards`,
    )
    check('A7', fOpen.status === 404 && fComments.status === 404 && fComment.status === 404, 'API: abrir, ler ou comentar card da Emmitec dá 404', [fOpen.status, fComments.status, fComment.status].join(','))
    check('A7', fFilter.status === 200 && fFilter.data.length === 0, 'API: filtrar pela Emmitec devolve lista vazia')
    const out403 = await api(tok.luis, 'GET', '/cards')
    check('A7', out403.status === 403, 'quem é de fora da ala (Luis) leva 403', out403.status)
    const fCtx = await newCtx(browser, tok.freela, DESK, null)
    const fPage = await open(fCtx, '/board', 'freela')
    await sleep(800)
    check('A7', fPage.url().endsWith('/marketing') && (await fPage.locator('.mo-shell').count()) === 1, 'freelancer em /board cai na moldura só da ala', fPage.url().replace(WEB, ''))
    await goto(fPage, '/marketing/aprovacoes')
    await fPage.waitForSelector('.mkb__col')
    const fTitles = await fPage.locator('.mkc__title').allInnerTexts()
    check('A7', fTitles.length > 0 && !fTitles.includes('Post institucional EMMI'), 'tela: board do freelancer sem o card da Emmitec', fTitles.join(' | '))
    await shot(fPage, 'freela-board-d1440.png')
    await goto(fPage, `/marketing/cards/${emmiCard.id}`)
    const fNotFound = await waitFor(() => fPage.getByText('Card não encontrado').count())
    check('A7', fNotFound, 'tela: freelancer abrindo card da Emmitec vê "Card não encontrado"')
    await shot(fPage, 'freela-card-emmi-d1440.png')

    // ════════════════════════════════════════════════════════════════════
    // A8. Prazo vencido em vermelho no board e na lista
    // ════════════════════════════════════════════════════════════════════
    const lateCard = seed.cards.find((c) => c.title.startsWith('Carrossel: 5 sinais'))
    await goto(mPage, '/marketing/aprovacoes')
    const lateTone = await mPage.evaluate((id) => {
      const el = document.querySelector(`.mkc[data-id="${id}"] .mk-late`)
      const probe = document.createElement('span')
      probe.style.color = 'var(--due-late)'
      document.body.appendChild(probe)
      const want = getComputedStyle(probe).color
      probe.remove()
      return { found: !!el, color: el ? getComputedStyle(el).color : null, want }
    }, lateCard.id)
    check('A8', lateTone.found && lateTone.color === lateTone.want, 'board: prazo vencido em vermelho (--due-late)', JSON.stringify(lateTone))
    await shot(mPage, 'board-d1440.png')
    await goto(mPage, '/marketing/aprovacoes?vista=lista')
    await mPage.waitForSelector('.mk-table')
    const lateRow = await mPage.evaluate((id) => {
      const td = document.querySelector(`tr[data-id="${id}"] td.mk-late`)
      const probe = document.createElement('span')
      probe.style.color = 'var(--due-late)'
      document.body.appendChild(probe)
      const want = getComputedStyle(probe).color
      probe.remove()
      return { found: !!td, color: td ? getComputedStyle(td).color : null, want }
    }, lateCard.id)
    check('A8', lateRow.found && lateRow.color === lateRow.want, 'lista: prazo vencido em vermelho', JSON.stringify(lateRow))
    await mPage.click('[data-sort="prazo"]')
    await sleep(400)
    check('A8', mPage.url().includes('ordem=prazo'), 'lista: ordenar por prazo vai para a URL', mPage.url().replace(WEB, ''))
    await shot(mPage, 'lista-d1440.png')
    await goto(mPage, '/marketing/aprovacoes?atrasados=1')
    const onlyLate = await mPage.locator('.mkc').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')))
    check('A8', onlyLate.length === 1 && onlyLate[0] === lateCard.id, 'filtro "Atrasados" mostra só o vencido', onlyLate.join(','))

    // Celular: board de uma coluna, abas e "Mover para" segurando o card
    const mpCtx = await newCtx(browser, tok.marcel, PHONE, C.pet)
    const mp = await open(mpCtx, '/marketing/aprovacoes', 'marcel-celular')
    await mp.waitForSelector('.col-tabs [role="tab"]', { timeout: 10000 })
    const tabs = await mp.locator('.col-tabs [role="tab"]').count()
    const swb = await scrollWidth(mp)
    check('A8', tabs === 7 && swb <= 375, '375: board com as 7 abas de status e sem rolagem lateral', `abas ${tabs}, scrollWidth ${swb}`)
    const lateOnPhone = await mp.locator(`.mkc[data-id="${lateCard.id}"] .mk-late`).count()
    await mp.locator('.col-tabs [data-tab="IN_PRODUCTION"]').tap()
    await sleep(700)
    check('A8', lateOnPhone === 1, '375: o prazo vencido também fica vermelho no celular')
    await shot(mp, 'board-m375.png')
    await mp.locator('.col-tabs [data-tab="IDEA"]').tap()
    await sleep(700)
    const mHand = await finger(mp)
    const ideaC = await centerOf(mp.locator(`.mkc[data-id="${seedIdea.id}"]`))
    await mHand.hold(ideaC.x, ideaC.y)
    const sheet = await waitFor(() => mp.locator('.mks[role="dialog"]').count(), 3000)
    check('A8', sheet, '375: segurar o card abre a folha "Mover para"')
    const sheetInfo = await mp.evaluate(() => ({
      current: document.querySelector('.mks__opt--current')?.getAttribute('data-move-to'),
      heights: [...document.querySelectorAll('.mks__opt')].map((b) => Math.round(b.getBoundingClientRect().height)),
      approvedHint: document.querySelector('#mk-move-why-CHANGES_REQUESTED')?.textContent?.trim() ?? '',
    }))
    check('A8', sheetInfo.current === 'IDEA' && sheetInfo.heights.every((h) => h >= 48), '375: folha marca o status atual e tem alvos de 48px', JSON.stringify(sheetInfo))
    await shot(mp, 'board-folha-m375.png')
    await mp.locator('.mks__opt[data-move-to="IN_PRODUCTION"]').tap()
    const movedPhone = await waitFor(async () => (await q(`SELECT status FROM "MarketingCard" WHERE id=$1`, [seedIdea.id]))[0].status === 'IN_PRODUCTION')
    check('A8', movedPhone, '375: tocar em "Em produção" na folha move o card (banco)')
    await goto(mp, '/marketing/aprovacoes?vista=lista')
    await mp.waitForSelector('.mk-table')
    const swl = await scrollWidth(mp)
    check('A8', swl <= 375 && (await mp.locator(`tr[data-id="${lateCard.id}"] td.mk-late`).count()) === 1, '375: lista sem rolagem lateral e com o vencido em vermelho', `scrollWidth ${swl}`)
    await shot(mp, 'lista-m375.png')
    await q(`UPDATE "MarketingCard" SET status='IDEA' WHERE id=$1`, [seedIdea.id])

    // ════════════════════════════════════════════════════════════════════
    // A10. CMYK ganha prévia RGB e o download devolve o original (sha256)
    // ════════════════════════════════════════════════════════════════════
    const cmyk = await sharp(img1).toColourspace('cmyk').jpeg({ quality: 90 }).toBuffer()
    const cmykMeta = await sharp(cmyk).metadata()
    const placa = await api(tok.marcel, 'POST', '/cards', { companyId: C.pet, title: 'E2E Placa de balcão CMYK', kind: 'PRINT', status: 'IN_PRODUCTION' })
    const cAsset = await upload(tok.marcel, placa.data.id, cmyk, 'placa-balcao-cmyk.jpg', 'image/jpeg')
    check('A10', cmykMeta.space === 'cmyk' && cAsset.colorSpace === 'cmyk' && cAsset.hasPreview, 'arquivo CMYK confirmado com prévia RGB à parte', `${cmykMeta.space} -> ${cAsset.colorSpace}, prévia ${cAsset.hasPreview}`)
    await api(tok.marcel, 'POST', `/cards/${placa.data.id}/versions`, { assetIds: [cAsset.id] })
    const pDetail = (await api(tok.marcel, 'GET', `/cards/${placa.data.id}`)).data
    const pa = pDetail.versions[0].assets[0]
    const prev = await fetch(pa.previewUrl)
    const prevBuf = Buffer.from(await prev.arrayBuffer())
    const prevMeta = await sharp(prevBuf).metadata()
    check('A10', prev.ok && prevMeta.space === 'srgb' && prevMeta.format === 'webp', 'a prévia é uma imagem RGB (webp) separada', `${prevMeta.format} ${prevMeta.space}`)
    const dl = await api(tok.marcel, 'GET', `/assets/${cAsset.id}/download`)
    const orig = Buffer.from(await (await fetch(dl.data.url)).arrayBuffer())
    check('A10', sha(orig) === sha(cmyk) && dl.data.sha256 === sha(cmyk) && orig.length === cmyk.length, 'download devolve o original com o mesmo sha256', `${sha(orig).slice(0, 12)} = ${sha(cmyk).slice(0, 12)}`)
    const origMeta = await sharp(orig).metadata()
    check('A10', origMeta.space === 'cmyk', 'o original baixado continua CMYK', origMeta.space)
    await goto(mPage, `/marketing/cards/${placa.data.id}`)
    await mPage.waitForSelector('[data-testid="preview-notice"]', { timeout: 10000 })
    const notice = await mPage.locator('[data-testid="preview-notice"]').innerText()
    const shownSrc = await mPage.locator('img[data-testid="version-image"]').getAttribute('src')
    check('A10', notice === 'Prévia aproximada em RGB; o original em CMYK segue intacto.' && /\.preview\.webp/.test(shownSrc), 'tela: mostra a prévia RGB com o aviso', notice)
    await waitFor(() => mPage.locator('img[data-testid="version-image"]').evaluate((i) => i.complete && i.naturalWidth > 0))
    await shot(mPage, 'cmyk-previa-d1440.png')
    await goto(mPage, '/marketing/aprovacoes?trilha=grafica')
    await mPage.waitForSelector('.mkb__col')
    const printCols = await mPage.locator('.mkb__col').evaluateAll((els) => els.map((e) => e.getAttribute('data-col')))
    check('A10', printCols.includes('SENT_TO_PRINTER') && printCols.includes('DELIVERED') && !printCols.includes('SCHEDULED'), 'filtro Gráfica mostra a trilha da gráfica', printCols.join(','))
    await shot(mPage, 'board-grafica-d1440.png')

    // ════════════════════════════════════════════════════════════════════
    // A9. Apagar card (R2, C6): vai para a Lixeira, restaurar devolve, e só o
    // "Apagar de vez" (Admin) tira a linha e os objetos do storage.
    // ════════════════════════════════════════════════════════════════════
    const before = (await api(tok.marcel, 'GET', `/cards/${mainCardId}`)).data
    const urls = before.versions.flatMap((v) => v.assets.map((a) => a.url))
    const rows = await q(`SELECT "storagePath" FROM "MarketingAsset" WHERE "cardId"=$1`, [mainCardId])
    const okBefore = (await Promise.all(urls.map((u) => fetch(u).then((r) => r.status)))).every((s) => s === 200)
    check('A9', urls.length === 4 && rows.length === 4 && okBefore, 'antes: 4 arquivos (V1 e V2) no storage e no banco', `${urls.length} urls, ${rows.length} linhas`)
    await goto(mPage, `/marketing/cards/${mainCardId}`)
    await mPage.click('[data-action="delete-card"]')
    await mPage.waitForSelector('.confirm-submit')
    await shot(mPage, 'apagar-card-d1440.png')
    await mPage.click('.confirm-submit')
    await mPage.waitForURL(/\/marketing\/aprovacoes/, { timeout: 8000 }).catch(() => {})
    const trashedRow = await waitFor(async () => (await q(`SELECT "deletedAt", "deletedById" FROM "MarketingCard" WHERE id=$1 AND "deletedAt" IS NOT NULL`, [mainCardId]))[0])
    const keptRows = await q(`SELECT 1 FROM "MarketingAsset" WHERE "cardId"=$1`, [mainCardId])
    const inTrash = await Promise.all(urls.map((u) => fetch(u).then((r) => r.status)))
    check('A9', !!trashedRow && trashedRow.deletedById === U.marcel && keptRows.length === 4, 'lixeira: o card fica no banco com deletedAt de quem apagou, com os 4 arquivos', `${trashedRow?.deletedById} ${keptRows.length} linhas`)
    check('A9', inTrash.every((s) => s === 200), 'lixeira: os objetos continuam no storage (restaurar devolve)', inTrash.join(','))
    const a9Hidden = await api(tok.marcel, 'GET', `/cards/${mainCardId}`)
    const a9Listed = (await api(tok.leticia, 'GET', '/cards')).data ?? []
    const trashList = (await api(tok.leticia, 'GET', '/trash?type=card')).data?.items ?? []
    check('A9', a9Hidden.status === 404 && !a9Listed.some((c) => c.id === mainCardId) && trashList.some((i) => i.id === mainCardId), 'lixeira: o card some do board e do detalhe (404) e aparece na Lixeira', `${a9Hidden.status}`)
    const restoredCard = await api(tok.marcel, 'POST', '/trash/restore', { type: 'card', id: mainCardId })
    const a9Back = await api(tok.marcel, 'GET', `/cards/${mainCardId}`)
    const backFiles = a9Back.data?.versions?.flatMap((v) => v.assets) ?? []
    check('A9', (restoredCard.status === 200 || restoredCard.status === 201) && a9Back.status === 200 && backFiles.length === 4, 'restaurar devolve o card com V1, V2 e os 4 arquivos', `${restoredCard.status} ${a9Back.status} ${backFiles.length}`)
    const again = await api(tok.marcel, 'DELETE', `/cards/${mainCardId}`)
    const editorPurge = await api(tok.marcel, 'DELETE', `/trash/card/${mainCardId}`)
    check('A9', again.status === 200 && again.data?.trashed?.type === 'card' && editorPurge.status === 403, 'de novo para a lixeira; Editor não apaga de vez (403)', `${again.status} ${editorPurge.status}`)
    const purged = await api(tok.leticia, 'DELETE', `/trash/card/${mainCardId}`)
    const goneRows = await q(`SELECT 1 FROM "MarketingAsset" WHERE "cardId"=$1`, [mainCardId])
    const goneCard = await q(`SELECT 1 FROM "MarketingCard" WHERE id=$1`, [mainCardId])
    const after = await Promise.all(urls.map((u) => fetch(u).then((r) => r.status)))
    check('A9', purged.status === 200 && goneRows.length === 0 && goneCard.length === 0, 'apagar de vez (Admin): card e arquivos saem do banco', `${purged.status} ${JSON.stringify(purged.data)}`)
    check('A9', after.every((s) => s === 404 || s === 400), 'apagar de vez: nenhum dos objetos existe mais no storage', after.join(','))
    mainCardId = null

    // Fecha: 401/5xx e erros de página
    for (const c of [mCtx, lCtx, lpCtx, dCtx, fCtx, mpCtx]) await c.close()
  } catch (error) {
    console.error(error)
    check('geral', false, 'o roteiro quebrou no meio', error.message)
  } finally {
    await browser.close()
    check('geral', allBad.length === 0, 'nenhuma resposta 401/5xx em nenhuma tela', allBad.join(' | '))
    check('geral', allErrors.length === 0, 'nenhum erro de JavaScript nas páginas', allErrors.join(' | '))
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
