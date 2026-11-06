// Roteiro de ponta a ponta do MOTOR DE ENVIO da ala Marketing (R1, P2):
// spec docs/specs/2026/q4/q4-2/ala-marketing/r1-acervo-tarefas-convite.md,
// decisões D4 e D5 e os critérios de "Envios".
//
// Cobre, pela tela (Edge headless) e conferindo banco e storage:
//   U1 bandeja com vários arquivos, 3 em paralelo, progresso, velocidade e tempo
//   U2 fechar o diálogo da versão no meio: a versão nasce sozinha ao terminar,
//      na ordem do carrossel e com a nota, mesmo trocando de tela; e fechar pelo X
//      não cancela nem fecha versão
//   U3 Ctrl+V de imagem (fora de campo de texto entra; dentro da nota, não)
//   U4 rede caindo no meio de arquivo grande: conexão cortada pelo storage
//      (retoma do offset, sem recriar o upload) e navegador offline (espera a rede)
//   U5 beforeunload com envio pendente (e sem pendente não pergunta)
//   U6 hash de ~300 MB sem travar a página (requestAnimationFrame e intervalo),
//      sha256 igual ao do Node, ao do banco e ao do objeto no storage
//   U7 foto de ativação, nota fiscal (linha e diálogo) e orçamento (clipe e
//      soltar em cima) pela fila
//   U8 cancelar apaga o envio pendente; tentar de novo sobe
//   U9 limite por arquivo em MB (acima de 32 MB, recusado antes do hash; sempre antes do ticket)
//   U10 celular 375: Tirar foto, Galeria, faixa da bandeja acima das abas
//
// Uso (cada agente com o seu banco, API, storage falso e Vite):
//   API=http://127.0.0.1:3621 WEB=http://localhost:5182 STORAGE=http://127.0.0.1:54332 \
//   HARNESS_DB=wf_r1b node marketing-uploads-e2e.cjs
// A API precisa de MARKETING_MAX_FILE_BYTES >= 330 MB para o U6 (o roteiro
// confere em /assets/limits e pula o U6 com aviso se for menor).
// Escreve só no banco do harness e apaga o arquivo de 300 MB no fim.
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const pg = require('pg')

const API = process.env.API ?? 'http://127.0.0.1:3621'
const WEB = process.env.WEB ?? 'http://localhost:5182'
const STORAGE = process.env.STORAGE ?? 'http://127.0.0.1:54332'
const DB = process.env.HARNESS_DB ?? 'wf_r1b'
const seed = JSON.parse(fs.readFileSync(path.resolve(__dirname, process.env.HARNESS_SEED ?? `seed-marketing-out.${DB}.json`), 'utf8'))
const OUT = process.env.SHOTS ?? path.join(__dirname, 'prints', 'marketing-uploads')
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean)
const sharp = require(path.join(__dirname, '../../../workflow-api/node_modules/sharp'))
fs.mkdirSync(OUT, { recursive: true })
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nevo-uploads-e2e-'))

const G = seed.groupId
const C = seed.companies
const MB = 1024 * 1024

let fails = 0
const results = []
const check = (crit, cond, msg, extra = '') => {
  const line = `${cond ? 'OK  ' : 'FAIL'} [${crit}] ${msg}${extra !== '' ? '  (' + String(extra).slice(0, 300) + ')' : ''}`
  console.log(line)
  results.push({ crit, ok: !!cond, msg })
  if (!cond) fails++
}
const run = (key) => !ONLY.length || ONLY.includes(key)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, timeout = 10000, step = 120) {
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

// ── API e login (o limite é de 10 logins por minuto: o token fica em cache) ─────
const TOKENS = path.join(os.tmpdir(), `nevo-uploads-e2e-tokens.${DB}.json`)
let tokenCache = {}
try {
  tokenCache = JSON.parse(fs.readFileSync(TOKENS, 'utf8'))
} catch {}
async function token(user) {
  const cached = tokenCache[user]
  if (cached) {
    const me = await fetch(`${API}/user/me`, { headers: { authorization: `Bearer ${cached}` } })
    if (me.ok) return cached
  }
  for (let i = 0; i < 6; i++) {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `${user}@nevo.test`, password: 'nevo1234' }),
    })
    if (r.status === 429) {
      await sleep(Number(r.headers.get('retry-after') ?? 10) * 1000)
      continue
    }
    if (!r.ok) throw new Error(`login ${user}: ${r.status}`)
    tokenCache[user] = (await r.json()).accessToken
    fs.writeFileSync(TOKENS, JSON.stringify(tokenCache))
    return tokenCache[user]
  }
  throw new Error(`login ${user} bloqueado`)
}
const tok = {}
async function api(user, method, route, body) {
  const url = route.startsWith('/marketing') || route.startsWith('/user') ? `${API}${route}` : `${API}/marketing/g/${G}${route}`
  const r = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tok[user]}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try {
    data = await r.json()
  } catch {}
  return { status: r.status, data }
}
async function harness(cfg = {}) {
  const r = await fetch(`${STORAGE}/__harness`, { method: 'POST', body: JSON.stringify(cfg) })
  return r.json()
}
/** sha256 do objeto que chegou ao storage (baixa pela URL assinada da API). */
async function storedSha(assetId) {
  const d = await api('marcel', 'GET', `/assets/${assetId}/download`)
  if (d.status !== 200) return `download ${d.status}`
  const r = await fetch(d.data.url)
  const hash = crypto.createHash('sha256')
  for await (const chunk of r.body) hash.update(chunk)
  return hash.digest('hex')
}

// ── Arquivos de teste ───────────────────────────────────────────────────────
async function noisyPng(w, h, seedHue) {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: seedHue, g: 120, b: 200 }, noise: { type: 'gaussian', mean: 128, sigma: 40 } } })
    .png()
    .toBuffer()
}
function randomFile(name, bytes) {
  const file = path.join(TMP, name)
  const fd = fs.openSync(file, 'w')
  const hash = crypto.createHash('sha256')
  let left = bytes
  while (left > 0) {
    const n = Math.min(left, 8 * MB)
    const buf = crypto.randomBytes(n)
    hash.update(buf)
    fs.writeSync(fd, buf)
    left -= n
  }
  fs.closeSync(fd)
  return { file, sha: hash.digest('hex'), size: bytes }
}
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')

// ── Navegador ───────────────────────────────────────────────────────────────
const DESK = { width: 1440, height: 900, mobile: false }
const PHONE = { width: 375, height: 812, mobile: true }
const allBad = []
const allErrors = []

async function newCtx(browser, user, vp) {
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
    [tok[user], C.pet],
  )
  return ctx
}
async function open(ctx, route, who) {
  const page = await ctx.newPage()
  page.on('response', (res) => {
    const u = res.url()
    if (u.startsWith(API) && (res.status() === 401 || res.status() >= 500)) allBad.push(`${who}: ${res.status()} ${res.request().method()} ${u.replace(API, '')}`)
  })
  page.on('pageerror', (e) => allErrors.push(`${who}: ${e.message}`))
  await page.goto(WEB + route, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.addStyleTag({ content: '#__vue-devtools-container__{display:none!important}' }).catch(() => {})
  await sleep(400)
  return page
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) })
const tray = (page) => page.locator('[data-testid="upload-tray"]')
const rows = (page) => page.locator('[data-testid="upload-tray"] .mkt__row')
/** A linha MAIS NOVA com esse nome (o mesmo arquivo pode ter subido antes). */
const rowOf = (page, name) => page.locator(`[data-testid="upload-tray"] .mkt__row[data-name="${name}"]`).last()
const statusOf = (page, name) => rowOf(page, name).getAttribute('data-status').catch(() => null)
async function openTray(page) {
  const t = page.locator('[data-testid="upload-tray"] .mkt__toggle')
  if ((await t.getAttribute('aria-expanded')) !== 'true') await t.click()
}
async function openVersionDialog(page) {
  await page.click('[data-action="upload-version"]')
  await page.waitForSelector('input[name="files"]', { state: 'attached', timeout: 8000 })
  await sleep(250)
}
/** Arquivo como o navegador recebe ao soltar (DataTransfer criado na página). */
async function dropFiles(page, selector, files) {
  await page.evaluate(
    ([sel, list]) => {
      const el = document.querySelector(sel)
      const dt = new DataTransfer()
      for (const f of list) dt.items.add(new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name, { type: f.type }))
      el.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }))
      el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }))
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
    },
    [selector, files.map((f) => ({ name: f.name, type: f.type, b64: f.buffer.toString('base64') }))],
  )
}

;(async () => {
  const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
  await db.connect()
  const q = async (sql, params) => (await db.query(sql, params)).rows

  tok.marcel = await token('marcel')
  tok.leticia = await token('leticia')
  await harness({ throttleBps: 0, dropAfterBytes: 0, failPatches: 0, maxBytes: 0, reset: true })

  // Rodada limpa: cards, ativações, orçamentos e lançamentos "E2E Envios".
  for (const r of await q(`SELECT id FROM "MarketingCard" WHERE "groupId"=$1 AND title LIKE 'E2E Envios%'`, [G])) await api('leticia', 'DELETE', `/cards/${r.id}`)
  for (const r of await q(`SELECT id FROM "MarketingQuote" WHERE "groupId"=$1 AND description LIKE 'E2E Envios%'`, [G])) await api('leticia', 'DELETE', `/quotes/${r.id}`)
  for (const r of await q(`SELECT id FROM "MarketingActivation" WHERE "groupId"=$1 AND title LIKE 'E2E Envios%'`, [G])) await api('leticia', 'DELETE', `/activations/${r.id}`)
  for (const r of await q(`SELECT id FROM "MarketingExpense" WHERE "groupId"=$1 AND description LIKE 'E2E Envios%'`, [G])) await api('leticia', 'DELETE', `/finance/expenses/${r.id}`)

  const limits = (await api('marcel', 'GET', '/assets/limits')).data
  check('API', limits?.resumable === true && limits?.chunkBytes === 6 * MB, 'limits: upload em partes ligado, partes de 6 MB', JSON.stringify(limits))

  const newCard = async (title) => {
    const r = await api('marcel', 'POST', '/cards', { companyId: C.pet, title, kind: 'CAROUSEL', status: 'IN_PRODUCTION' })
    if (r.status !== 201) throw new Error(`card ${r.status} ${JSON.stringify(r.data)}`)
    return r.data.id
  }

  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const pngA = await noisyPng(700, 500, 30)
  const pngB = await noisyPng(700, 500, 90)
  const pngC = await noisyPng(700, 500, 160)
  const big20 = randomFile('video-20mb.mp4', 20 * MB + 4321)
  let big300 = null

  try {
    // ════════════════════════════════════════════════════════════════════
    // U1 + U2. Bandeja com 5 arquivos; fechar a versão no meio do envio
    // ════════════════════════════════════════════════════════════════════
    if (run('u1')) {
      const cardId = await newCard('E2E Envios carrossel')
      const ctx = await newCtx(browser, 'marcel', DESK)
      const page = await open(ctx, `/marketing/cards/${cardId}`, 'marcel')
      await harness({ throttleBps: 2 * MB, reset: true })
      await openVersionDialog(page)
      const hint = await page.locator('.mkup__hint').innerText()
      check('U9', /até \d+ MB por arquivo/.test(hint), 'o diálogo diz o limite por arquivo em MB', hint)
      await page.setInputFiles('input[name="files"]', [
        { name: 'arte-a.png', mimeType: 'image/png', buffer: pngA },
        { name: 'arte-b.png', mimeType: 'image/png', buffer: pngB },
        { name: 'arte-c.png', mimeType: 'image/png', buffer: pngC },
        { name: 'video-20mb.mp4', mimeType: 'video/mp4', buffer: fs.readFileSync(big20.file) },
        { name: 'roteiro.pdf', mimeType: 'application/pdf', buffer: pdf },
      ])
      // amostra a bandeja enquanto sobe: quantos ativos ao mesmo tempo
      let maxActive = 0
      let sawQueued = false
      let sawSpeed = ''
      const sampler = (async () => {
        const end = Date.now() + 25000
        while (Date.now() < end) {
          const s = await page
            .evaluate(() => [...document.querySelectorAll('[data-testid="upload-tray"] .mkt__row')].map((r) => [r.getAttribute('data-status'), r.querySelector('.mkt__state')?.textContent ?? '']))
            .catch(() => [])
          const active = s.filter(([st]) => st === 'hashing' || st === 'uploading' || st === 'confirming').length
          maxActive = Math.max(maxActive, active)
          if (s.some(([st]) => st === 'queued')) sawQueued = true
          const sp = s.find(([, t]) => /\/s/.test(t) && /falta/.test(t))
          if (sp && !sawSpeed) sawSpeed = sp[1]
          if (s.length && s.every(([st]) => st === 'done')) break
          await sleep(100)
        }
      })()
      await waitFor(async () => (await rows(page).count()) === 5, 8000)
      check('U1', (await rows(page).count()) === 5, 'bandeja "Envios" lista os 5 arquivos')
      await waitFor(async () => (await page.locator('[data-entry="uploading"]').count()) > 0, 5000)
      // ordem do carrossel: arte-c sobe um (fica a, c, b, vídeo, pdf), com o envio rodando
      await page.getByRole('button', { name: 'Subir arte-c.png na ordem' }).click()
      await page.fill('textarea[name="note"]', 'Ordem conferida com o cliente')
      const orderUi = await page.locator('.mkup__list .mkup__name').allInnerTexts()
      check('U2', orderUi.join(',') === 'arte-a.png,arte-c.png,arte-b.png,video-20mb.mp4,roteiro.pdf', 'reordenar no meio do envio', orderUi.join(','))
      const btn = page.locator('[data-action="close-version"]')
      const label = await btn.innerText()
      check('U2', /Fechar a V1 ao terminar/.test(label), 'com envio pendente o botão vira "Fechar a V1 ao terminar"', label)
      await shot(page, 'u2-dialogo-no-meio-d1440.png')
      await btn.click()
      await page.waitForSelector('input[name="files"]', { state: 'detached', timeout: 5000 }).catch(() => {})
      check('U2', (await page.locator('.mkup').count()) === 0, 'o diálogo fecha na hora')
      await openTray(page)
      const draftLine = await page.locator('.mkt__draft').first().innerText().catch(() => '')
      check('U2', /fecha quando/.test(draftLine), 'a bandeja avisa que a versão fecha sozinha', draftLine)
      await shot(page, 'u1-bandeja-subindo-d1440.png')
      {
        const tb = await tray(page).boundingBox()
        const lb = await page.locator('.launcher').first().boundingBox().catch(() => null)
        check('U1', tb && tb.width >= 360 && tb.x + tb.width <= 1440 && (!lb || tb.x + tb.width <= lb.x), 'bandeja embaixo à direita, sem cobrir o mascote do assistente', `${JSON.stringify(tb)} / ${JSON.stringify(lb)}`)
      }
      const midSummary = await page.locator('[data-testid="upload-summary"]').innerText()
      check('U1', /de 5 enviados/.test(midSummary) && /%/.test(midSummary), 'resumo da bandeja: quantos, % e tempo', midSummary)
      // troca de tela no meio, DENTRO do app (recarregar a página zeraria a fila): a fila é global
      await page.locator('a.mk-tab', { hasText: 'Aprovações' }).first().click()
      await page.waitForURL(/\/marketing\/aprovacoes/, { timeout: 8000 }).catch(() => {})
      await sleep(600)
      const stillThere = await tray(page).count()
      const statesNow = await page.evaluate(() => [...document.querySelectorAll('[data-testid="upload-tray"] .mkt__row')].map((r) => r.getAttribute('data-status')))
      const pct = async () => Number(/(\d+)%/.exec(await page.locator('[data-testid="upload-summary"]').innerText())?.[1] ?? -1)
      const pctA = await pct()
      await sleep(1500)
      const pctB = await pct()
      check(
        'U2',
        stillThere === 1 && statesNow.some((s) => s === 'uploading') && pctB > pctA,
        'trocar de tela não para o envio (bandeja segue e o progresso anda)',
        `${statesNow.join(',')} ${pctA}% -> ${pctB}%`,
      )
      await sampler
      check('U1', maxActive === 3, 'sobe 3 em paralelo (nunca mais de 3)', String(maxActive))
      check('U1', sawQueued, 'o 4º e o 5º esperam na fila')
      check('U1', !!sawSpeed, 'linha mostra bytes, velocidade e tempo restante', sawSpeed)
      const version = await waitFor(async () => {
        const r = await q(
          `SELECT v.number, v.note, a.name, a.position, a.sha256, a.size, a.id, a.status FROM "MarketingCardVersion" v JOIN "MarketingAsset" a ON a."versionId"=v.id WHERE v."cardId"=$1 ORDER BY a.position`,
          [cardId],
        )
        return r.length === 5 ? r : null
      }, 40000)
      check('U2', !!version, 'a V1 nasce sozinha quando o último arquivo termina', version ? '' : 'nada no banco')
      if (version) {
        check('U2', version.map((r) => r.name).join(',') === orderUi.join(','), 'banco: ordem do carrossel igual à da tela', version.map((r) => r.name).join(','))
        check('U2', version[0].note === 'Ordem conferida com o cliente' && version[0].number === 1, 'banco: nota da versão gravada', version[0].note)
        const expected = { 'arte-a.png': sha(pngA), 'arte-b.png': sha(pngB), 'arte-c.png': sha(pngC), 'video-20mb.mp4': big20.sha, 'roteiro.pdf': sha(pdf) }
        check('U1', version.every((r) => r.sha256 === expected[r.name] && r.status === 'READY'), 'sha256 do worker = sha256 do Node, em todos', version.map((r) => `${r.name}:${r.sha256?.slice(0, 8)}`).join(' '))
        const vid = version.find((r) => r.name === 'video-20mb.mp4')
        check('U1', (await storedSha(vid.id)) === big20.sha, 'o vídeo que chegou ao storage (TUS) é byte a byte o original')
      }
      const counters = (await harness()).contadores
      check('D5', counters.tusCreates === 1 && counters.tusCompleted === 1 && counters.tusPatches >= 4, 'acima de 6 MB vai pelo TUS (1 upload, partes de 6 MB)', JSON.stringify({ c: counters.tusCreates, p: counters.tusPatches }))
      check('D5', counters.puts === 4, 'até 6 MB vai no PUT único (4 arquivos)', String(counters.puts))
      await openTray(page)
      const closedText = await waitFor(async () => {
        const t = await page.locator('.mkt__draft.is-closed').first().innerText().catch(() => '')
        return /V1 de "E2E Envios carrossel" fechada/.test(t) ? t : null
      }, 5000)
      check('U2', !!closedText, 'bandeja registra "V1 fechada" (na outra tela)', closedText ?? '')
      await shot(page, 'u2-v1-criada-bandeja-d1440.png')
      await page.goto(`${WEB}/marketing/cards/${cardId}`, { waitUntil: 'domcontentloaded' })
      const v1 = await waitFor(async () => (await page.locator('[data-version="1"]').count()) > 0, 8000)
      check('U2', !!v1, 'tela do card mostra a V1')
      await shot(page, 'u2-v1-no-card-d1440.png')

      // fechar pelo X no meio: não cancela e não fecha versão
      await harness({ throttleBps: 1 * MB })
      await openVersionDialog(page)
      const pngD = await noisyPng(900, 700, 200)
      await page.setInputFiles('input[name="files"]', [{ name: 'arte-d.png', mimeType: 'image/png', buffer: pngD }, { name: 'video-20mb.mp4', mimeType: 'video/mp4', buffer: fs.readFileSync(big20.file) }])
      await waitFor(async () => (await page.locator('[data-entry="uploading"]').count()) > 0, 5000)
      const foot = await page.locator('.mkup__foot-hint').innerText().catch(() => '')
      check('U2', /continua em Envios/.test(foot), 'o rodapé avisa que fechar a janela não cancela', foot)
      await page.locator('.mkup__head [aria-label="Fechar"]').click()
      await sleep(300)
      await waitFor(async () => (await statusOf(page, 'video-20mb.mp4')) === 'done' && (await statusOf(page, 'arte-d.png')) === 'done', 60000)
      const staged = await q(`SELECT name, status FROM "MarketingAsset" WHERE "cardId"=$1 AND "versionId" IS NULL`, [cardId])
      const versions = await q(`SELECT number FROM "MarketingCardVersion" WHERE "cardId"=$1`, [cardId])
      check('U2', staged.length === 2 && staged.every((s) => s.status === 'READY') && versions.length === 1, 'fechar pelo X: os 2 arquivos sobem soltos e nenhuma V2 é criada', JSON.stringify({ staged: staged.length, versions: versions.length }))
      await harness({ throttleBps: 0 })
      await openVersionDialog(page)
      const ready = await waitFor(async () => (await page.locator('[data-entry="ready"]').count()) === 2, 8000)
      check('U2', !!ready, 'reabrir o diálogo mostra os 2 prontos para a V2')

      // ════════════════════════════════════════════════════════════════════
      // U3. Ctrl+V de imagem
      // ════════════════════════════════════════════════════════════════════
      const pngPaste = await noisyPng(400, 300, 250)
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: WEB })
      let pasteMode = 'teclado'
      const wrote = await page
        .evaluate(async (b64) => {
          const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' })
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          return true
        }, pngPaste.toString('base64'))
        .catch(() => false)
      // foco DENTRO da nota: a colagem é do texto, nenhum arquivo entra
      await page.locator('textarea[name="note"]').focus()
      const before = await page.locator('.mkup__list li').count()
      if (wrote) await page.keyboard.press('Control+V')
      await sleep(500)
      check('U3', (await page.locator('.mkup__list li').count()) === before, 'Ctrl+V com foco na nota não vira arquivo')
      // foco fora de campo de texto: a imagem entra
      await page.locator('.mkup__title').click()
      if (wrote) await page.keyboard.press('Control+V')
      let pasted = await waitFor(async () => (await page.locator('.mkup__list li').count()) === before + 1, 3000)
      if (!pasted) {
        pasteMode = 'evento'
        await page.evaluate((b64) => {
          const dt = new DataTransfer()
          dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'image.png', { type: 'image/png' }))
          document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
        }, pngPaste.toString('base64'))
        pasted = await waitFor(async () => (await page.locator('.mkup__list li').count()) === before + 1, 3000)
      }
      const pastedName = await page.locator('.mkup__list .mkup__name').last().innerText().catch(() => '')
      check('U3', !!pasted && /^Colado \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.\d{2}\.png$/.test(pastedName), `Ctrl+V de imagem entra na versão com nome legível (via ${pasteMode})`, pastedName)
      const pastedReady = await waitFor(async () => (await page.locator('[data-entry="ready"]').count()) === 3, 10000)
      check('U3', !!pastedReady, 'a imagem colada sobe e fica pronta')
      // Pela área de transferência de verdade o navegador RECODIFICA o PNG (os bytes
      // mudam); o que precisa bater é o sha256 do que a página colou com o que chegou.
      const pastedRow = (await q(`SELECT id, sha256 FROM "MarketingAsset" WHERE "cardId"=$1 AND name=$2`, [cardId, pastedName]))[0]
      const pastedStored = pastedRow ? await storedSha(pastedRow.id) : null
      check(
        'U3',
        !!pastedRow?.sha256 && pastedRow.sha256 === pastedStored && (pasteMode === 'teclado' || pastedRow.sha256 === sha(pngPaste)),
        'colada: sha256 do navegador confere com o objeto no storage',
        `${pastedRow?.sha256?.slice(0, 12)} / ${pastedStored?.slice(0, 12)}`,
      )
      await shot(page, 'u3-colado-d1440.png')
      await page.click('[data-action="close-version"]')
      const v2 = await waitFor(async () => (await q(`SELECT 1 FROM "MarketingCardVersion" WHERE "cardId"=$1 AND number=2`, [cardId])).length === 1, 8000)
      check('U2', !!v2, 'sem envio pendente, "Fechar a V2" fecha na hora (caminho de sempre)')

      // ════════════════════════════════════════════════════════════════════
      // U5. beforeunload com envio pendente
      // ════════════════════════════════════════════════════════════════════
      await harness({ throttleBps: 1 * MB })
      await openVersionDialog(page)
      await page.setInputFiles('input[name="files"]', big20.file)
      await waitFor(async () => (await statusOf(page, 'video-20mb.mp4')) === 'uploading', 8000)
      let asked = null
      page.once('dialog', async (d) => {
        asked = d.type()
        await d.dismiss()
      })
      await page.close({ runBeforeUnload: true })
      await waitFor(async () => asked !== null, 5000)
      check('U5', asked === 'beforeunload', 'fechar a aba com envio pendente pede confirmação', String(asked))
      check('U5', !page.isClosed(), 'ficar na página mantém a aba aberta')
      const goesOn = await waitFor(async () => (await statusOf(page, 'video-20mb.mp4')) === 'done', 40000)
      check('U5', !!goesOn, 'e o envio continua até o fim')
      await harness({ throttleBps: 0 })
      let askedAgain = null
      page.once('dialog', async (d) => {
        askedAgain = d.type()
        await d.accept()
      })
      await page.close({ runBeforeUnload: true })
      await sleep(800)
      check('U5', askedAgain === null && page.isClosed(), 'sem envio pendente, fecha sem perguntar', String(askedAgain))
      await ctx.close()
    }

    // ════════════════════════════════════════════════════════════════════
    // U4. Rede caindo no meio de um arquivo grande
    // ════════════════════════════════════════════════════════════════════
    if (run('u4')) {
      const cardId = await newCard('E2E Envios rede')
      const ctx = await newCtx(browser, 'marcel', DESK)
      const page = await open(ctx, `/marketing/cards/${cardId}`, 'marcel')
      // (a) o storage corta a conexão no meio da 1ª parte e recusa a 2ª (503)
      await harness({ reset: true, throttleBps: 4 * MB, dropAfterBytes: Math.round(2.5 * MB), failPatches: 0 })
      await openVersionDialog(page)
      await page.setInputFiles('input[name="files"]', big20.file)
      const cut = await waitFor(async () => (await harness()).contadores.tusDrops === 1, 20000)
      check('U4', !!cut, 'storage cortou a conexão no meio de uma parte')
      await harness({ failPatches: 1 })
      await openTray(page)
      const notice = await waitFor(async () => {
        const t = await rowOf(page, 'video-20mb.mp4').locator('.mkt__state').innerText().catch(() => '')
        return /Falha de rede\. Nova tentativa em \d+ s\./.test(t) ? t : null
      }, 10000)
      check('U4', !!notice, 'a linha avisa a nova tentativa sozinha, em pt-BR', notice ?? '')
      await shot(page, 'u4-falha-e-nova-tentativa-d1440.png')
      const done = await waitFor(async () => (await statusOf(page, 'video-20mb.mp4')) === 'done', 60000)
      check('U4', !!done, 'retoma e termina sem ação de ninguém')
      const row = (await q(`SELECT id, "storagePath", sha256 FROM "MarketingAsset" WHERE "cardId"=$1 AND name='video-20mb.mp4'`, [cardId]))[0]
      const c1 = (await harness()).contadores
      const creates = c1.createsPorObjeto[row?.storagePath] ?? 0
      check('U4', creates === 1 && c1.tusHeads >= 1, 'retomou do offset (HEAD) sem recriar o upload', JSON.stringify({ creates, heads: c1.tusHeads, fails: c1.tusFails }))
      check('U4', c1.tusPatchBytes === big20.size, 'o storage recebeu cada byte uma vez só', `${c1.tusPatchBytes} de ${big20.size}`)
      check('U4', row?.sha256 === big20.sha && (await storedSha(row.id)) === big20.sha, 'arquivo final íntegro (sha256 do banco e do storage)')

      // (b) o navegador fica offline no meio
      await harness({ reset: true, throttleBps: 3 * MB })
      const big40 = randomFile('bruto-40mb.mp4', 40 * MB + 77)
      await page.setInputFiles('input[name="files"]', big40.file)
      await waitFor(async () => (await harness()).contadores.tusPatchBytes > 8 * MB, 20000)
      await ctx.setOffline(true)
      const off = await waitFor(async () => /Sem internet/.test(await page.locator('[data-testid="upload-summary"]').innerText()), 15000)
      check('U4', !!off, 'offline: a bandeja diz "Sem internet" e espera', await page.locator('[data-testid="upload-summary"]').innerText())
      await shot(page, 'u4-offline-d1440.png')
      await sleep(2500)
      const stalled = (await harness()).contadores.tusPatchBytes
      await ctx.setOffline(false)
      const back = await waitFor(async () => (await statusOf(page, 'bruto-40mb.mp4')) === 'done', 60000)
      check('U4', !!back, 'a rede volta e o envio retoma sozinho até o fim')
      const row2 = (await q(`SELECT id, "storagePath", sha256 FROM "MarketingAsset" WHERE "cardId"=$1 AND name='bruto-40mb.mp4'`, [cardId]))[0]
      const c2 = (await harness()).contadores
      // O offline emulado do Chromium PAUSA a requisição que já está no ar (não
      // derruba): ela segue quando a rede volta, sem HEAD. Corte de conexão de
      // verdade é o caso (a) acima, que retoma pelo HEAD.
      check('U4', (c2.createsPorObjeto[row2?.storagePath] ?? 0) === 1 && c2.tusPatchBytes === big40.size, 'continuou do ponto: 1 upload só e nenhum byte repetido', JSON.stringify({ creates: c2.createsPorObjeto[row2?.storagePath], heads: c2.tusHeads, bytes: c2.tusPatchBytes, parado: stalled }))
      check('U4', row2?.sha256 === big40.sha && (await storedSha(row2.id)) === big40.sha, 'arquivo de 40 MB íntegro depois da queda')
      fs.rmSync(big40.file, { force: true })

      // ════════════════════════════════════════════════════════════════════
      // U8. Cancelar apaga o envio pendente; tentar de novo sobe
      // ════════════════════════════════════════════════════════════════════
      await harness({ reset: true, throttleBps: 1 * MB })
      const big12 = randomFile('cancelar-12mb.mp4', 12 * MB)
      await page.setInputFiles('input[name="files"]', big12.file)
      await waitFor(async () => (await harness()).contadores.tusPatchBytes > 1 * MB, 15000)
      const pendingRow = await waitFor(async () => (await q(`SELECT id FROM "MarketingAsset" WHERE "cardId"=$1 AND name='cancelar-12mb.mp4' AND status='PENDING'`, [cardId]))[0], 5000)
      // a janela é modal (cobre a bandeja): fecha a janela, o envio segue, e cancela pela bandeja
      await page.locator('.mkup__head [aria-label="Fechar"]').click()
      await sleep(300)
      await openTray(page)
      await shot(page, 'u8-bandeja-cancelar-d1440.png')
      await rowOf(page, 'cancelar-12mb.mp4').locator('[data-action="cancel"]').click()
      const canceled = await waitFor(async () => (await statusOf(page, 'cancelar-12mb.mp4')) === 'canceled', 5000)
      const gone = await waitFor(async () => (await q(`SELECT 1 FROM "MarketingAsset" WHERE id=$1`, [pendingRow?.id])).length === 0, 5000)
      check('U8', !!canceled && !!gone, 'cancelar para o envio e apaga a linha PENDING na API')
      await harness({ throttleBps: 0 })
      await rowOf(page, 'cancelar-12mb.mp4').locator('[data-action="retry"]').click()
      const redone = await waitFor(async () => (await statusOf(page, 'cancelar-12mb.mp4')) === 'done', 30000)
      const r12 = (await q(`SELECT sha256 FROM "MarketingAsset" WHERE "cardId"=$1 AND name='cancelar-12mb.mp4' AND status='READY'`, [cardId]))
      check('U8', !!redone && r12.length === 1 && r12[0].sha256 === big12.sha, 'tentar de novo sobe do zero e confere', String(r12.length))
      fs.rmSync(big12.file, { force: true })
      await ctx.close()
    }

    // ════════════════════════════════════════════════════════════════════
    // U6. Hash de ~300 MB sem travar a página
    // ════════════════════════════════════════════════════════════════════
    if (run('u6')) {
      if (!limits || limits.maxBytes < 330 * MB) {
        check('U6', false, 'API com MARKETING_MAX_FILE_BYTES >= 330 MB para o teste de 300 MB', String(limits?.maxMb))
      } else {
        const cardId = await newCard('E2E Envios 300 MB')
        big300 = randomFile('bruto-300mb.mov', 300 * MB + 999)
        await harness({ reset: true, throttleBps: 0 })
        const ctx = await newCtx(browser, 'marcel', DESK)
        const page = await open(ctx, `/marketing/cards/${cardId}`, 'marcel')
        await openVersionDialog(page)
        await page.evaluate(() => {
          const w = window
          w.__frames = 0
          w.__gaps = []
          const tick = () => {
            w.__frames++
            requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
          let last = performance.now()
          setInterval(() => {
            const now = performance.now()
            w.__gaps.push(now - last)
            last = now
          }, 50)
          w.__long = 0
          try {
            new PerformanceObserver((list) => {
              for (const e of list.getEntries()) w.__long = Math.max(w.__long, e.duration)
            }).observe({ type: 'longtask', buffered: false })
          } catch {}
        })
        await page.setInputFiles('input[name="files"]', big300.file)
        const started = await waitFor(async () => (await statusOf(page, 'bruto-300mb.mov')) === 'hashing', 10000, 30)
        const t0 = Date.now()
        const f0 = await page.evaluate(() => window.__frames)
        await page.evaluate(() => (window.__gaps = []))
        // um clique durante o hash: a página responde
        let clickMs = null
        const hashing = await waitFor(async () => {
          if (clickMs === null && Date.now() - t0 > 400) {
            const c0 = Date.now()
            await page.locator('textarea[name="note"]').click()
            await page.keyboard.type('ok')
            clickMs = Date.now() - c0
          }
          const s = await statusOf(page, 'bruto-300mb.mov')
          return s && s !== 'hashing' ? s : null
        }, 60000, 50)
        const secs = (Date.now() - t0) / 1000
        const f1 = await page.evaluate(() => window.__frames)
        const gaps = await page.evaluate(() => window.__gaps)
        const longTask = await page.evaluate(() => window.__long)
        const fps = (f1 - f0) / secs
        const maxGap = Math.max(0, ...gaps)
        console.log(`(hash de 300 MB: ${secs.toFixed(1)} s, ${(300 / secs).toFixed(0)} MB/s; ${fps.toFixed(0)} fps; maior intervalo ${maxGap.toFixed(0)} ms; maior tarefa longa ${longTask.toFixed(0)} ms; clique+digitação ${clickMs} ms)`)
        check('U6', !!started && !!hashing, 'o arquivo passa pelo estado "Conferindo o arquivo" (hash)')
        check('U6', fps >= 30, 'requestAnimationFrame não para durante o hash', `${fps.toFixed(0)} fps`)
        check('U6', maxGap < 250, 'a thread da tela não trava (intervalo de 50 ms atrasa menos de 250 ms)', `${maxGap.toFixed(0)} ms`)
        check('U6', clickMs !== null && clickMs < 1500 && (await page.locator('textarea[name="note"]').inputValue()).includes('ok'), 'clicar e digitar durante o hash funciona', `${clickMs} ms`)
        const up = await waitFor(async () => (await statusOf(page, 'bruto-300mb.mov')) === 'done', 240000, 250)
        check('U6', !!up, '300 MB sobem pelo TUS até o fim')
        const r = (await q(`SELECT id, sha256, size FROM "MarketingAsset" WHERE "cardId"=$1 AND name='bruto-300mb.mov'`, [cardId]))[0]
        check('U6', r?.sha256 === big300.sha, 'sha256 do worker = Node = banco (300 MB)', r?.sha256?.slice(0, 16))
        check('U6', r && (await storedSha(r.id)) === big300.sha && r.size === big300.size, 'o objeto de 300 MB no storage confere byte a byte')
        const c = (await harness()).contadores
        check('U6', c.tusCreates === 1 && c.tusPatches === Math.ceil(big300.size / (6 * MB)), 'TUS em partes de 6 MB (51 partes)', String(c.tusPatches))
        await shot(page, 'u6-300mb-d1440.png')
        await ctx.close()
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // U7. Foto de ativação, nota fiscal e orçamento pela fila
    // ════════════════════════════════════════════════════════════════════
    if (run('u7')) {
      await harness({ reset: true, throttleBps: 0 })
      const start = new Date(Date.now() + 5 * 864e5).toISOString()
      const act = await api('marcel', 'POST', '/activations', { companyId: C.pet, kind: 'FAIR', title: 'E2E Envios Feira', startAt: start })
      const A = act.data?.id
      const quote = await api('marcel', 'POST', '/quotes', { description: 'E2E Envios Banner', amountCents: 12000, supplierName: 'Gráfica Teste', activationId: A })
      const Q = quote.data?.id
      check('U7', !!A && !!Q, 'ativação e orçamento de teste criados', `${act.status}/${quote.status}`)
      const ctx = await newCtx(browser, 'marcel', DESK)
      const page = await open(ctx, `/marketing/ativacoes?ativacao=${A}`, 'marcel')
      await page.waitForSelector('.ap__input', { state: 'attached', timeout: 10000 })
      const photos0 = await page.locator('.ap__tile img').count()
      await page.setInputFiles('.ap__input', { name: 'estande.png', mimeType: 'image/png', buffer: pngA })
      const p1 = await waitFor(async () => (await page.locator('.ap__tile img').count()) === photos0 + 1, 15000)
      check('U7', !!p1, 'ativação: "Adicionar fotos" sobe pela fila e a foto entra na grade')
      await dropFiles(page, '.ap', [{ name: 'publico.png', type: 'image/png', buffer: pngB }])
      const p2 = await waitFor(async () => (await page.locator('.ap__tile img').count()) === photos0 + 2, 15000)
      check('U7', !!p2, 'ativação: soltar no painel inteiro sobe a foto')
      await dropFiles(page, '.ap', [{ name: 'contrato.pdf', type: 'application/pdf', buffer: pdf }])
      await sleep(400)
      const toastText = await page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent ?? '').join(' | '))
      check('U7', /Só foto e vídeo entram na ativação/.test(toastText), 'ativação: PDF é recusado com a frase de sempre', toastText)
      await page.evaluate((b64) => {
        const dt = new DataTransfer()
        dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'image.png', { type: 'image/png' }))
        document.body.focus()
        document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
      }, pngC.toString('base64'))
      const p3 = await waitFor(async () => (await page.locator('.ap__tile img').count()) === photos0 + 3, 15000)
      check('U7', !!p3, 'ativação: Ctrl+V de imagem com o painel aberto sobe a foto')
      // orçamento: soltar em cima do orçamento anexa nele (não nas fotos)
      await page.waitForSelector('.qp__item', { timeout: 8000 })
      await dropFiles(page, '.qp__item', [{ name: 'orcamento.pdf', type: 'application/pdf', buffer: pdf }])
      const qf = await waitFor(async () => {
        const l = await api('marcel', 'GET', `/quotes?activationId=${A}`)
        const it = (l.data ?? []).find((x) => x.id === Q)
        return it?.files?.length === 1 ? it : null
      }, 15000)
      check('U7', !!qf && qf.files[0].name === 'orcamento.pdf', 'orçamento: soltar em cima anexa o arquivo ao orçamento')
      check('U7', (await page.locator('.ap__tile img').count()) === photos0 + 3, 'soltar no orçamento não vira foto da ativação')
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.qp__item').getByRole('button', { name: 'Anexar arquivo' }).click()])
      await chooser.setFiles([
        { name: 'proposta-1.pdf', mimeType: 'application/pdf', buffer: pdf },
        { name: 'proposta-2.png', mimeType: 'image/png', buffer: pngA },
      ])
      const qf2 = await waitFor(async () => {
        const l = await api('marcel', 'GET', `/quotes?activationId=${A}`)
        return ((l.data ?? []).find((x) => x.id === Q)?.files?.length ?? 0) === 3
      }, 15000)
      check('U7', !!qf2, 'orçamento: o clipe aceita vários arquivos de uma vez')
      await shot(page, 'u7-ativacao-orcamento-d1440.png')

      // nota fiscal: pela linha e pelo diálogo de lançamento novo
      const me = await api('marcel', 'GET', '/marketing/me')
      const cat = me.data.groups.find((g) => g.id === G)?.settings?.expenseCategories?.[0] ?? 'Outros'
      const month = new Date().toISOString().slice(0, 7)
      const exp = await api('marcel', 'POST', '/finance/expenses', { companyId: C.pet, date: `${month}-10`, description: 'E2E Envios Brindes', amountCents: 5000, category: cat, status: 'PAID' })
      check('U7', exp.status === 201, 'lançamento de teste criado', String(exp.status))
      await page.goto(`${WEB}/marketing/financeiro?mes=${month}&marca=${C.pet}`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('tr.fe-row', { timeout: 15000 })
      const rowE = page.locator('tr.fe-row', { hasText: 'E2E Envios Brindes' })
      await rowE.hover()
      const [ch] = await Promise.all([page.waitForEvent('filechooser'), rowE.getByRole('button', { name: /Anexar nota em/ }).click()])
      await ch.setFiles({ name: 'nf-brindes.pdf', mimeType: 'application/pdf', buffer: pdf })
      const nf = await waitFor(async () => (await rowE.innerText()).includes('1 nota'), 15000)
      check('U7', !!nf, 'nota fiscal pela linha: sobe pela fila e a linha mostra "1 nota"')
      await page.getByRole('button', { name: 'Lançamento completo' }).click()
      const dlg = page.locator('[role=dialog]')
      await dlg.locator('input[placeholder^="Ex.: Folders"]').fill('E2E Envios Camisetas')
      await dlg.locator('#fx-amount').fill('99,00')
      await dropFiles(page, '[role=dialog] form', [{ name: 'nf-camisetas.pdf', type: 'application/pdf', buffer: pdf }])
      await sleep(300)
      check('U7', (await dlg.locator('.fx-file.is-queued').count()) === 1, 'lançamento novo: nota solta na janela fica na fila até salvar')
      await dlg.getByRole('button', { name: 'Lançar' }).click()
      await page.waitForSelector('tr.fe-row:has-text("E2E Envios Camisetas")', { timeout: 15000 })
      const list = await api('marcel', 'GET', `/finance/expenses?month=${month}&companyId=${C.pet}&q=Camisetas`)
      check('U7', list.data?.items?.[0]?.invoices?.length === 1, 'lançamento novo: a nota sobe depois de salvar e liga ao lançamento')
      await shot(page, 'u7-financeiro-d1440.png')
      await ctx.close()
    }

    // ════════════════════════════════════════════════════════════════════
    // U9. Limite por arquivo: recusado ANTES do hash, com o limite em MB
    // ════════════════════════════════════════════════════════════════════
    if (run('u9')) {
      const cardId = await newCard('E2E Envios limite')
      const ctx = await newCtx(browser, 'marcel', DESK)
      // a API real está com 400 MB no harness: a resposta de limits é trocada por 5 MB
      await ctx.route('**/assets/limits', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ maxBytes: 5 * MB, maxMb: 5, resumable: true, chunkBytes: 6 * MB }) }))
      const tickets = []
      const page = await open(ctx, `/marketing/cards/${cardId}`, 'marcel')
      page.on('request', (r) => r.method() === 'POST' && /\/cards\/[^/]+\/assets$/.test(r.url()) && tickets.push(r.url()))
      await openVersionDialog(page)
      // acima de 32 MB a fila confere o teto ANTES do hash (não calcula à toa);
      // abaixo disso calcula enquanto o teto chega e recusa antes do ticket
      const seven = randomFile('grande-34mb.mp4', 34 * MB)
      const small = randomFile('medio-7mb.mp4', 7 * MB)
      const sawHash = []
      const t0 = Date.now()
      await page.setInputFiles('input[name="files"]', seven.file)
      const err = await waitFor(async () => {
        const st = await page.locator('[data-entry] .mkup__size').allInnerTexts().catch(() => [])
        if (st.some((t) => /Conferindo/.test(t))) sawHash.push(1)
        return (await page.locator('[data-entry="error"] .mk-error').innerText().catch(() => '')) || null
      }, 5000, 20)
      const ms = Date.now() - t0
      check('U9', err === 'Passa do limite de 5 MB por arquivo.', 'arquivo grande: erro em pt-BR com o limite em MB', err)
      check('U9', !sawHash.length && ms < 2000, 'acima de 32 MB: recusado antes do hash', `${ms} ms`)
      await page.setInputFiles('input[name="files"]', small.file)
      const err2 = await waitFor(async () => ((await page.locator('[data-entry="error"] .mk-error').count()) === 2 ? 'ok' : null), 8000)
      check('U9', !!err2, 'arquivo de 7 MB também recusado com a mesma frase')
      check('U9', tickets.length === 0, 'nenhum ticket pedido para arquivo acima do teto', String(tickets.length))
      fs.rmSync(small.file, { force: true })
      check('U9', /até 5 MB por arquivo/.test(await page.locator('.mkup__hint').innerText()), 'o diálogo explica o limite por arquivo')
      check('U9', (await page.locator('[data-action="close-version"]').isDisabled()), 'com arquivo em erro, a versão não fecha')
      await shot(page, 'u9-limite-d1440.png')
      fs.rmSync(seven.file, { force: true })
      await ctx.close()
    }

    // ════════════════════════════════════════════════════════════════════
    // U10. Celular 375
    // ════════════════════════════════════════════════════════════════════
    if (run('u10')) {
      await harness({ reset: true, throttleBps: 512 * 1024 })
      const cardId = await newCard('E2E Envios celular')
      const ctx = await newCtx(browser, 'marcel', PHONE)
      const page = await open(ctx, `/marketing/cards/${cardId}`, 'marcel-cel')
      await openVersionDialog(page)
      const cam = page.locator('[role=dialog] input[type=file][capture="environment"]')
      check('U10', (await cam.count()) === 1 && (await cam.getAttribute('accept')) === 'image/*', 'celular: "Tirar foto" abre a câmera traseira (capture=environment)')
      const camBtn = await page.getByRole('button', { name: 'Tirar foto' }).boundingBox()
      const galBtn = await page.getByRole('button', { name: 'Galeria' }).boundingBox()
      check('U10', camBtn && galBtn && camBtn.height >= 44 && galBtn.height >= 44, 'botões Tirar foto e Galeria com 44 px de toque', `${camBtn?.height}/${galBtn?.height}`)
      await shot(page, 'u10-dialogo-m375.png')
      await page.setInputFiles('[role=dialog] .mkus input:not([capture])', [
        { name: 'galeria-1.png', mimeType: 'image/png', buffer: pngA },
        { name: 'galeria-2.png', mimeType: 'image/png', buffer: pngB },
      ])
      await waitFor(async () => (await page.locator('[data-entry]').count()) === 2, 5000)
      await page.locator('.mkup__head [aria-label="Fechar"]').click()
      await sleep(400)
      const inset = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--shell-bottom-inset').trim())
      // a barra fixa de ações do card ("Subir a V1") não pode ficar coberta: a faixa sobe acima dela
      const geo = await waitFor(async () => {
        const g = await page.evaluate(() => {
          const t = document.querySelector('[data-testid="upload-tray"]').getBoundingClientRect()
          const bar = document.querySelector('.mkcv__actions--bar')?.getBoundingClientRect() ?? null
          return { t: { x: t.x, y: t.y, w: t.width, h: t.height }, bar: bar && { y: bar.y, h: bar.height } }
        })
        return !g.bar || g.t.y + g.t.h <= g.bar.y ? g : null
      }, 4000)
      check(
        'U10',
        !!geo && geo.t.x >= 6 && geo.t.w >= 355 && geo.t.y + geo.t.h <= 812 - 58,
        'celular: faixa na largura toda, acima das abas e da barra de ações do card',
        `${JSON.stringify(geo)} inset=${inset}`,
      )
      const target = await rows(page).count()
      check('U10', target === 2, 'a faixa já conta os 2 arquivos', String(target))
      check('U10', (await page.locator('[data-testid="upload-tray"] .mkt__toggle').getAttribute('aria-expanded')) === 'false', 'celular: a faixa começa recolhida')
      await shot(page, 'u10-faixa-m375.png')
      await page.locator('[data-testid="upload-tray"] .mkt__toggle').click()
      await sleep(300)
      check('U10', (await rows(page).count()) === 2, 'tocar na faixa abre a lista')
      const sw = await page.evaluate(() => document.documentElement.scrollWidth)
      check('U10', sw <= 375, 'celular: sem rolagem lateral', String(sw))
      await shot(page, 'u10-faixa-aberta-m375.png')
      await harness({ throttleBps: 0 })
      const ok = await waitFor(async () => (await page.locator('[data-testid="upload-tray"] .mkt__row[data-status="done"]').count()) === 2, 20000)
      check('U10', !!ok, 'celular: os 2 da galeria sobem')
      await ctx.close()
    }
  } catch (error) {
    check('ERRO', false, 'o roteiro quebrou', error.stack)
  } finally {
    await harness({ throttleBps: 0, dropAfterBytes: 0, failPatches: 0, maxBytes: 0 }).catch(() => {})
    await browser.close()
    await db.end()
    fs.rmSync(TMP, { recursive: true, force: true })
    const leftover = fs.existsSync(TMP)
    console.log(`(arquivos de teste apagados: ${!leftover})`)
  }

  check('GERAL', allBad.length === 0, 'nenhuma resposta 401/5xx da API na tela', allBad.slice(0, 5).join(' | '))
  check('GERAL', allErrors.length === 0, 'nenhum erro de JavaScript na página', allErrors.slice(0, 5).join(' | '))
  const ok = results.filter((r) => r.ok).length
  console.log(`\n${ok}/${results.length} checagens OK${fails ? `, ${fails} FALHA(S)` : ''}`)
  process.exit(fails ? 1 : 0)
})()
