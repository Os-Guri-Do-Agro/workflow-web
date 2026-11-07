// Roteiro de ponta a ponta do Acervo (ala Marketing, rodada R1, P1): critérios
// do Acervo da spec docs/specs/2026/q4/q4-2/ala-marketing/r1-acervo-tarefas-convite.md,
// pela API E pela tela (Edge headless, 1440 e 375, claro e escuro).
//
// Uso (cada agente com o seu banco, API, storage falso e Vite):
//   API=http://127.0.0.1:3611 WEB=http://localhost:5181 HARNESS_DB=wf_r1a \
//   STORAGE=http://127.0.0.1:54331 node marketing-library-e2e.cjs
// Pré-requisitos: banco do marketing-db.sh, fake-storage, API (api-run.sh) e Vite no ar.
// Login: token em cache num arquivo temporário e validado em /user/me (a API
// limita 10 logins por minuto por processo).
// Escreve só no banco do harness: o Acervo do grupo e os cards "E2E Acervo ..."
// são recriados a cada rodada. No fim (passo 11) as tabelas da R1 são
// renomeadas por instantes para provar o "indisponível" e voltam ao nome.
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const pg = require('pg')

const API = process.env.API ?? 'http://127.0.0.1:3611'
const WEB = process.env.WEB ?? 'http://localhost:5181'
const DB = process.env.HARNESS_DB ?? 'wf_r1a'
const seedPath = path.resolve(__dirname, process.env.HARNESS_SEED ?? `seed-marketing-out.${DB}.json`)
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
const OUT = process.env.SHOTS ?? path.join(__dirname, 'prints', 'marketing-library')
const ONLY = process.env.ONLY ?? ''
const sharp = require(path.join(__dirname, '../../../workflow-api/node_modules/sharp'))
fs.mkdirSync(OUT, { recursive: true })

const G = seed.groupId
const U = seed.users
const C = seed.companies

let fails = 0
const results = []
const check = (crit, cond, msg, extra = '') => {
  const line = `${cond ? 'OK  ' : 'FAIL'} [${crit}] ${msg}${extra !== '' && extra !== undefined ? '  (' + String(extra).slice(0, 300) + ')' : ''}`
  console.log(line)
  results.push({ crit, ok: !!cond, msg })
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
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

// ── Login com cache ─────────────────────────────────────────────────────────
const TOKEN_CACHE = path.join(os.tmpdir(), `nevo-harness-tokens-${DB}-${new URL(API).port}.json`)
async function token(email) {
  let cache = {}
  try {
    cache = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'))
  } catch {}
  if (cache[email]) {
    const r = await fetch(`${API}/user/me`, { headers: { authorization: `Bearer ${cache[email]}` } })
    if (r.ok) return cache[email]
  }
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'nevo1234' }),
  })
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`)
  cache[email] = (await r.json()).accessToken
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify(cache))
  return cache[email]
}

// ── API ─────────────────────────────────────────────────────────────────────
async function api(tok, method, route, body) {
  const url = route.startsWith('/marketing') || route.startsWith('/user') ? `${API}${route}` : `${API}/marketing/g/${G}${route}`
  const r = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  const text = await r.text()
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { status: r.status, data }
}

async function zipCall(tok, ids) {
  const r = await fetch(`${API}/marketing/g/${G}/library/zip`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
    body: JSON.stringify({ ids }),
  })
  const buf = Buffer.from(await r.arrayBuffer())
  let data = null
  if (r.status !== 200) {
    try {
      data = JSON.parse(buf.toString('utf8'))
    } catch {}
  }
  return { status: r.status, buf, data, disposition: r.headers.get('content-disposition') }
}

/** Entradas de um zip pelo diretório central (fim do arquivo). */
function zipNames(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0) return null
  const count = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)
  const names = []
  for (let i = 0; i < count; i++) {
    const n = buf.readUInt16LE(off + 28)
    const e = buf.readUInt16LE(off + 30)
    const c = buf.readUInt16LE(off + 32)
    names.push(buf.subarray(off + 46, off + 46 + n).toString('utf8'))
    off += 46 + n + e + c
  }
  return names
}

/** O mesmo caminho do navegador: tickets do lote, PUT direto, confirm e criação do item. */
async function uploadLib(tok, { companyId, folderId = null, name, buffer, mime = 'image/jpeg', relativePath, keepBoth, createItem = true }) {
  const t = await api(tok, 'POST', '/library/uploads', {
    companyId,
    folderId,
    files: [{ name, size: buffer.length, mimeType: mime, sha256: sha(buffer), relativePath, keepBoth }],
  })
  if (t.status !== 201) return { status: t.status, data: t.data }
  const f = t.data.files[0]
  if (!f.ticket) return { status: 201, duplicateOf: f.duplicateOf, error: f.error }
  const put = await fetch(f.ticket.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': mime, authorization: `Bearer ${f.ticket.token}` },
    body: buffer,
  })
  if (!put.ok) throw new Error(`PUT ${put.status}`)
  const c = await api(tok, 'POST', `/assets/${f.ticket.asset.id}/confirm`, {})
  if (c.status >= 300) throw new Error(`confirm ${c.status}`)
  if (!createItem) return { status: 201, assetId: f.ticket.asset.id }
  const it = await api(tok, 'POST', '/library/items', { assetId: f.ticket.asset.id, folderId: f.folderId, companyId })
  return { status: it.status, item: it.data, assetId: f.ticket.asset.id }
}

async function uploadCard(tok, cardId, buffer, name, mime = 'image/png') {
  const t = await api(tok, 'POST', `/cards/${cardId}/assets`, { name, mimeType: mime, size: buffer.length, sha256: sha(buffer) })
  if (t.status !== 201) throw new Error(`ticket card ${t.status} ${JSON.stringify(t.data)}`)
  const put = await fetch(t.data.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': mime, authorization: `Bearer ${t.data.token}` },
    body: buffer,
  })
  if (!put.ok) throw new Error(`PUT ${put.status}`)
  const c = await api(tok, 'POST', `/assets/${t.data.asset.id}/confirm`, {})
  if (c.status >= 300) throw new Error(`confirm ${c.status}`)
  return c.data
}

// ── Arquivos de teste ───────────────────────────────────────────────────────
async function photo(label, hue, w = 640, h = 480) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="hsl(${hue},55%,60%)"/>
    <circle cx="${w * 0.72}" cy="${h * 0.3}" r="${h * 0.12}" fill="hsl(${(hue + 40) % 360},70%,85%)"/>
    <path d="M0 ${h * 0.75} Q ${w * 0.3} ${h * 0.55} ${w * 0.6} ${h * 0.72} T ${w} ${h * 0.66} V ${h} H 0 Z" fill="hsl(${(hue + 160) % 360},45%,38%)"/>
    <text x="24" y="${h - 28}" font-family="Arial" font-size="34" font-weight="700" fill="hsl(0,0%,98%)">${label}</text>
  </svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer()
}

// ── Navegador ───────────────────────────────────────────────────────────────
const DESK = { width: 1440, height: 900, mobile: false }
const PHONE = { width: 375, height: 812, mobile: true }
const allBad = []
const allErrors = []

async function newCtx(browser, tok, vp, theme = 'light') {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.mobile ? 2 : 1,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    reducedMotion: 'reduce',
    acceptDownloads: true,
  })
  await ctx.addInitScript(
    ([t, th]) => {
      localStorage.setItem('token', t)
      localStorage.setItem('ui.theme', th)
      localStorage.setItem('onboarding.autoShown', '1')
      localStorage.setItem('onboarding.completed', '1')
      localStorage.setItem('ui.idlePermissionPrompt', 'done')
      localStorage.setItem('ui.timerSounds', 'false')
      localStorage.setItem('nevo.idle.protectionSnoozedUntil', String(Date.now() + 864e5))
    },
    [tok, theme],
  )
  return ctx
}

async function open(ctx, route, who) {
  const page = await ctx.newPage()
  page.on('response', (res) => {
    const u = res.url()
    if (u.startsWith(API) && (res.status() === 401 || res.status() >= 500)) {
      const allowed = page.allow503 && res.status() === 503
      if (!allowed) allBad.push(`${who}: ${res.status()} ${res.request().method()} ${u.replace(API, '')}`)
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

const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) })
const scrollWidth = (page) => page.evaluate(() => document.documentElement.scrollWidth)
const toasts = (page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map((t) => t.textContent?.trim() ?? ''))

/** Solta uma pasta "de verdade" (entradas de webkitGetAsEntry) na área do Acervo. */
async function dropFolder(page, tree) {
  await page.evaluate(async (spec) => {
    const toFile = (f) => {
      const bin = atob(f.b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return new File([bytes], f.name, { type: f.type })
    }
    const make = (node, parentPath) => {
      const fullPath = `${parentPath}/${node.name}`
      if (node.b64) {
        const file = toFile(node)
        return { isFile: true, isDirectory: false, name: node.name, fullPath, file: (ok) => ok(file) }
      }
      const kids = node.children.map((c) => make(c, fullPath))
      return {
        isFile: false,
        isDirectory: true,
        name: node.name,
        fullPath,
        createReader() {
          // Lotes de 7, como o navegador faz com pasta grande (lotes de 100).
          let i = 0
          return {
            readEntries(ok) {
              const batch = kids.slice(i, i + 7)
              i += 7
              setTimeout(() => ok(batch), 5)
            },
          }
        },
      }
    }
    const root = make(spec, '')
    const dt = {
      types: ['Files'],
      files: [],
      items: [{ kind: 'file', type: '', webkitGetAsEntry: () => root, getAsFile: () => null }],
      dropEffect: 'copy',
    }
    const fire = (el, type) => {
      const ev = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(ev, 'dataTransfer', { value: dt })
      el.dispatchEvent(ev)
    }
    const main = document.querySelector('.lib__main')
    fire(main, 'dragenter')
    await new Promise((r) => setTimeout(r, 120))
    const overlay = document.querySelector('[data-drop="overlay"]')
    fire(overlay ?? main, 'dragover')
    fire(overlay ?? main, 'drop')
  }, tree)
}

async function pasteImage(page, buffer, name = 'image.png', type = 'image/png') {
  await page.evaluate(
    ({ b64, name, type }) => {
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const dt = new DataTransfer()
      dt.items.add(new File([bytes], name, { type }))
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    },
    { b64: buffer.toString('base64'), name, type },
  )
}

async function mountDialog(page, opts) {
  await page.evaluate(async (o) => {
    const mod = await import('/scripts/harness/library-dialogs-mount.ts')
    window.__unmountLib = mod.mountLibraryDialog(o)
  }, opts)
}

;(async () => {
  const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
  await db.connect()
  const q = async (sql, params) => (await db.query(sql, params)).rows

  const tok = {
    nicolas: await token('nicolas@nevo.test'),
    leticia: await token('leticia@nevo.test'),
    marcel: await token('marcel@nevo.test'),
    freela: await token('freela@nevo.test'),
    diretoria: await token('diretoria@nevo.test'),
    luis: await token('luis@nevo.test'),
  }

  // ── Rodada limpa ──────────────────────────────────────────────────────────
  for (const t of ['MarketingLibraryUsage', 'MarketingLibraryItem', 'MarketingLibraryFolder']) {
    const exists = await q(`SELECT to_regclass($1) AS r`, [`public."${t}"`])
    if (!exists[0].r) {
      // Rodada anterior caiu no meio do passo 11: devolve o nome.
      await q(`ALTER TABLE IF EXISTS "${t}__r1off" RENAME TO "${t}"`)
    }
  }
  const oldCards = await q(`SELECT id FROM "MarketingCard" WHERE "groupId"=$1 AND title LIKE 'E2E Acervo%'`, [G])
  for (const r of oldCards) await api(tok.nicolas, 'DELETE', `/cards/${r.id}`)
  await q(`DELETE FROM "MarketingLibraryItem" WHERE "groupId"=$1`, [G])
  await q(`DELETE FROM "MarketingLibraryFolder" WHERE "groupId"=$1`, [G])
  await q(
    `DELETE FROM "MarketingAsset" WHERE "groupId"=$1 AND "cardId" IS NULL AND "versionId" IS NULL AND "activationId" IS NULL AND "expenseId" IS NULL AND "quoteId" IS NULL`,
    [G],
  )
  await q(`DELETE FROM "MarketingLog" WHERE "groupId"=$1 AND "entityType" LIKE 'library%'`, [G])
  await q(`UPDATE "CompanyGroup" SET settings='{}' WHERE id=$1`, [G])

  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const photos = []
  for (let i = 0; i < 34; i++) photos.push(await photo(`Foto ${String(i + 1).padStart(2, '0')}`, (i * 37) % 360))
  const extra = []
  for (let i = 0; i < 24; i++) extra.push(await photo(`Extra ${i + 1}`, (i * 53 + 11) % 360, 400, 300))

  const ids = {}
  try {
    // ════════════════════════════════════════════════════════════════════
    // 1. Papéis e marcas pela API (inclusive acesso cruzado por id)
    // ════════════════════════════════════════════════════════════════════
    const gF = await api(tok.nicolas, 'POST', '/library/folders', { companyId: null, name: 'E2E Logos' })
    check('papel', gF.status === 201 && gF.data.companyId === null, 'Dono cria pasta na Geral do grupo', gF.status)
    const gFm = await api(tok.marcel, 'POST', '/library/folders', { companyId: null, name: 'E2E Não pode' })
    check('papel', gFm.status === 403 && /Geral do grupo/.test(gFm.data?.message), 'Editor NÃO escreve na Geral (403 com a frase)', gFm.data?.message)
    const gFl = await api(tok.leticia, 'POST', '/library/folders', { companyId: null, parentId: gF.data.id, name: 'Oficiais' })
    check('papel', gFl.status === 201 && gFl.data.depth === 2, 'Admin sem restrição cria subpasta na Geral', gFl.status)
    const dupName = await api(tok.leticia, 'POST', '/library/folders', { companyId: null, parentId: gF.data.id, name: ' oficiais ' })
    check('pasta', dupName.status === 409, 'nome repetido entre irmãs (sem diferença de caixa): 409', dupName.data?.message)

    const g1 = await uploadLib(tok.leticia, { companyId: null, folderId: gFl.data.id, name: 'logo-geral.jpg', buffer: extra[0] })
    ids.G1 = g1.item?.id
    check('papel', g1.status === 201 && g1.item?.companyId === null, 'Admin envia para a Geral do grupo', g1.status)
    const e1 = await uploadLib(tok.marcel, { companyId: C.emmitec, name: 'emmi-produto.jpg', buffer: extra[1] })
    ids.E1 = e1.item?.id
    ids.E1asset = e1.assetId
    const p1 = await uploadLib(tok.marcel, { companyId: C.pet, name: 'pet-produto.jpg', buffer: extra[2] })
    ids.P1 = p1.item?.id
    check('papel', e1.status === 201 && p1.status === 201, 'Editor envia para Emmitec e PetJourney')
    const f1 = await uploadLib(tok.freela, { companyId: C.pet, name: 'freela-foto.jpg', buffer: extra[3] })
    ids.F1 = f1.item?.id
    check('papel', f1.status === 201, 'freelancer (só PetJourney) envia para a PetJourney', f1.status)
    const fE = await api(tok.freela, 'POST', '/library/uploads', { companyId: C.emmitec, files: [{ name: 'x.jpg', size: 10, mimeType: 'image/jpeg' }] })
    const fG = await api(tok.freela, 'POST', '/library/uploads', { companyId: null, files: [{ name: 'x.jpg', size: 10, mimeType: 'image/jpeg' }] })
    check('marca', fE.status === 403 && fG.status === 403, 'freelancer não envia para a Emmitec nem para a Geral (403)', `${fE.status} ${fG.status}`)

    const fl = await api(tok.freela, 'GET', '/library/items')
    const flIds = (fl.data?.items ?? []).map((i) => i.id)
    check(
      'marca',
      fl.status === 200 && flIds.includes(ids.P1) && flIds.includes(ids.F1) && flIds.includes(ids.G1) && !flIds.includes(ids.E1),
      'freelancer lista PetJourney e a Geral, e NÃO a Emmitec',
      flIds.length,
    )
    const ftree = await api(tok.freela, 'GET', '/library/folders')
    check(
      'marca',
      ftree.status === 200 && !ftree.data.locations.some((l) => l.companyId === C.emmitec) && ftree.data.locations.some((l) => l.companyId === null),
      'árvore do freelancer: Geral e PetJourney, sem a Emmitec',
      JSON.stringify(ftree.data.locations.map((l) => l.name)),
    )
    const cross = await Promise.all([
      api(tok.freela, 'GET', `/library/items/${ids.E1}`),
      api(tok.freela, 'GET', `/library/items/${ids.E1}/download`),
      api(tok.freela, 'PATCH', `/library/items/${ids.E1}`, { title: 'invadido' }),
      api(tok.freela, 'DELETE', `/library/items/${ids.E1}`),
      api(tok.freela, 'POST', '/library/items/bulk', { ids: [ids.E1], acao: 'favoritar' }),
      api(tok.freela, 'GET', `/assets/${ids.E1asset}/download`),
      api(tok.freela, 'POST', '/library/items/from-asset', { assetId: ids.E1asset, companyId: C.pet }),
    ])
    check('marca', cross.every((r) => r.status === 404), 'id da Emmitec na mão do freelancer: 404 em detalhe, download, editar, apagar, lote, download do arquivo e cópia', cross.map((r) => r.status).join(','))
    const zipCross = await zipCall(tok.freela, [ids.P1, ids.E1])
    check('marca', zipCross.status === 404, 'zip com um id da Emmitec no meio: 404 (nada sai)', zipCross.status)
    const stillE1 = await q(`SELECT title FROM "MarketingLibraryItem" WHERE id=$1`, [ids.E1])
    check('marca', stillE1[0]?.title === 'emmi-produto', 'o item da Emmitec segue intacto no banco')

    const v = {
      list: await api(tok.diretoria, 'GET', '/library/items'),
      dl: await api(tok.diretoria, 'GET', `/library/items/${ids.P1}/download`),
      zip: await zipCall(tok.diretoria, [ids.P1, ids.G1]),
    }
    check('papel', v.list.status === 200 && v.dl.status === 200 && /^http/.test(v.dl.data?.url) && v.zip.status === 200, 'Visualizador vê, baixa e baixa zip', `${v.list.status} ${v.dl.status} ${v.zip.status}`)
    const dlFile = await fetch(v.dl.data.url)
    const dlBuf = Buffer.from(await dlFile.arrayBuffer())
    check('papel', dlFile.ok && sha(dlBuf) === sha(extra[2]) && /pet-produto\.jpg/.test(dlFile.headers.get('content-disposition') ?? ''), 'download devolve o ORIGINAL (mesmo sha256) com o título como nome', dlFile.headers.get('content-disposition'))
    const vw = await Promise.all([
      api(tok.diretoria, 'POST', '/library/uploads', { companyId: C.pet, files: [{ name: 'x.jpg', size: 10, mimeType: 'image/jpeg' }] }),
      api(tok.diretoria, 'POST', '/library/folders', { companyId: C.pet, name: 'x' }),
      api(tok.diretoria, 'PATCH', `/library/items/${ids.P1}`, { title: 'x' }),
      api(tok.diretoria, 'DELETE', `/library/items/${ids.P1}`),
      api(tok.diretoria, 'POST', '/library/items/bulk', { ids: [ids.P1], acao: 'mover', companyId: C.pet }),
      api(tok.diretoria, 'POST', '/library/items/from-asset', { assetId: p1.assetId }),
    ])
    check('papel', vw.every((r) => r.status === 403), 'Visualizador não sobe, não cria pasta, não edita, não apaga, não move, não copia (403)', vw.map((r) => r.status).join(','))
    const out = await api(tok.luis, 'GET', '/library/items')
    check('papel', out.status === 403, 'quem é de fora da ala leva 403', out.status)

    const mDelF = await api(tok.marcel, 'DELETE', `/library/items/${ids.F1}`)
    check('papel', mDelF.status === 403 && /só apaga o que você criou/.test(mDelF.data?.message), 'Editor não apaga o que outra pessoa enviou (sem editorCanDelete)', mDelF.data?.message)
    const mDelG = await api(tok.marcel, 'DELETE', `/library/items/${ids.G1}`)
    check('papel', mDelG.status === 403, 'Editor não apaga item da Geral', mDelG.status)
    await api(tok.nicolas, 'PATCH', '/settings', { settings: { editorCanDelete: true } })
    const f2 = await uploadLib(tok.freela, { companyId: C.pet, name: 'freela-apagar.jpg', buffer: extra[4] })
    const mDelF2 = await api(tok.marcel, 'DELETE', `/library/items/${f2.item.id}`)
    check('papel', mDelF2.status === 200, 'com editorCanDelete o Editor apaga o de outra pessoa', mDelF2.status)
    await api(tok.nicolas, 'PATCH', '/settings', { settings: { editorCanDelete: false } })
    const fOwn = await uploadLib(tok.freela, { companyId: C.pet, name: 'freela-meu.jpg', buffer: extra[5] })
    const fDelOwn = await api(tok.freela, 'DELETE', `/library/items/${fOwn.item.id}`)
    check('papel', fDelOwn.status === 200, 'Editor apaga o que ele mesmo enviou', fDelOwn.status)

    // "Em espera": subiu e confirmou, mas o item não existe. Só quem subiu lê.
    const wait = await uploadLib(tok.freela, { companyId: C.pet, name: 'espera.jpg', buffer: extra[6], createItem: false })
    const wOther = await api(tok.marcel, 'GET', `/assets/${wait.assetId}/download`)
    const wOwner = await api(tok.freela, 'GET', `/assets/${wait.assetId}/download`)
    const wSteal = await api(tok.marcel, 'POST', '/library/items', { assetId: wait.assetId, companyId: C.pet })
    check('arquivo', wOther.status === 404 && wOwner.status === 200 && wSteal.status === 404, '"em espera" de outra pessoa: download 404 e não vira item dela; quem subiu baixa', `${wOther.status} ${wOwner.status} ${wSteal.status}`)

    // Pasta: profundidade, ciclo e apagar com conteúdo.
    let parent = null
    const chain = []
    for (let d = 1; d <= 5; d++) {
      const r = await api(tok.marcel, 'POST', '/library/folders', { companyId: C.pet, parentId: parent, name: `E2E Nível ${d}` })
      chain.push(r.data?.id)
      parent = r.data?.id
    }
    const sixth = await api(tok.marcel, 'POST', '/library/folders', { companyId: C.pet, parentId: parent, name: 'E2E Nível 6' })
    check('pasta', chain.every(Boolean) && sixth.status === 400 && /5 níveis/.test(sixth.data?.message), 'pasta vai até 5 níveis (o 6º dá 400 com a frase)', sixth.data?.message)
    const cycle = await api(tok.marcel, 'PATCH', `/library/folders/${chain[0]}`, { parentId: chain[3] })
    check('pasta', cycle.status === 400 && /dentro dela mesma/.test(cycle.data?.message), 'mover pasta para dentro da filha: 400 (ciclo)', cycle.data?.message)
    const crossLoc = await api(tok.nicolas, 'PATCH', `/library/folders/${chain[0]}`, { parentId: gF.data.id })
    check('pasta', crossLoc.status === 400, 'pasta não muda de marca para a Geral (400)', crossLoc.data?.message)
    const lvlItem = await uploadLib(tok.marcel, { companyId: C.pet, folderId: chain[1], name: 'nivel2.jpg', buffer: extra[7] })
    // R2 (C6): pasta com conteúdo não dá mais 409; vai para a Lixeira levando as
    // subpastas e os arquivos (mesmo deletedAt), e restaurar devolve tudo junto.
    const delTrash = await api(tok.marcel, 'DELETE', `/library/folders/${chain[1]}`)
    check('pasta', delTrash.status === 200 && delTrash.data?.trashedFolders === 3 && delTrash.data?.trashedItems === 1 && delTrash.data?.trashed?.type === 'library_folder', 'apagar pasta com conteúdo: vai para a lixeira com as 3 subpastas e o arquivo', JSON.stringify(delTrash.data))
    const restored = await api(tok.marcel, 'POST', '/trash/restore', { type: 'library_folder', id: chain[1] })
    const back = await q(`SELECT count(*)::int AS n FROM "MarketingLibraryFolder" WHERE id = ANY($1) AND "deletedAt" IS NULL`, [chain.slice(1)])
    const itemBack = await q(`SELECT "deletedAt" FROM "MarketingLibraryItem" WHERE id=$1`, [lvlItem.item.id])
    check('pasta', (restored.status === 200 || restored.status === 201) && back[0]?.n === 4 && itemBack[0]?.deletedAt === null, 'restaurar a pasta devolve as subpastas e o arquivo juntos', `${restored.status} ${back[0]?.n}`)
    const delUp = await api(tok.marcel, 'DELETE', `/library/folders/${chain[1]}?mover=pai`)
    const after = await q(`SELECT "folderId" FROM "MarketingLibraryItem" WHERE id=$1`, [lvlItem.item.id])
    const n3 = await q(`SELECT "parentId" FROM "MarketingLibraryFolder" WHERE id=$1`, [chain[2]])
    check('pasta', delUp.status === 200 && after[0]?.folderId === chain[0] && n3[0]?.parentId === chain[0], '?mover=pai: arquivo e subpasta sobem para a pasta de cima', JSON.stringify(delUp.data))

    // ════════════════════════════════════════════════════════════════════
    // 2. Tela: pasta com subpastas e 30 fotos, Ctrl+V, duplicata, lote
    // ════════════════════════════════════════════════════════════════════
    const mCtx = await newCtx(browser, tok.marcel, DESK)
    const mPage = await open(mCtx, `/marketing/acervo?local=${C.pet}`, 'marcel')
    await mPage.waitForSelector('.lft', { timeout: 15000 })
    await shot(mPage, 'acervo-marca-d1440.png')
    await mPage.click('[data-action="new-folder"]')
    await mPage.fill('input[name="folderName"]', 'E2E Campanha')
    await mPage.click('[data-action="save-folder"]')
    const camp = await waitFor(async () => (await q(`SELECT id FROM "MarketingLibraryFolder" WHERE "groupId"=$1 AND name='E2E Campanha' AND "companyId"=$2`, [G, C.pet]))[0])
    check('tela', !!camp, 'Editor cria a pasta "E2E Campanha" pela tela')
    ids.camp = camp?.id
    await mPage.locator(`[data-folder-id="${ids.camp}"] .ltr-main`).first().click()
    await mPage.waitForURL(/pasta=/)

    // Pasta arrastada: E2E Viagem / Dia 1 (10), Dia 2 / Manhã (10), Dia 2 / Tarde (10)
    const fileNode = (i) => ({ name: `foto-${String(i + 1).padStart(2, '0')}.jpg`, type: 'image/jpeg', b64: photos[i].toString('base64') })
    const tree = {
      name: 'E2E Viagem',
      children: [
        { name: 'Dia 1', children: Array.from({ length: 10 }, (_, i) => fileNode(i)) },
        {
          name: 'Dia 2',
          children: [
            { name: 'Manhã', children: Array.from({ length: 10 }, (_, i) => fileNode(10 + i)) },
            { name: 'Tarde', children: Array.from({ length: 10 }, (_, i) => fileNode(20 + i)) },
            { name: '.DS_Store', type: 'application/octet-stream', b64: Buffer.from('lixo').toString('base64') },
          ],
        },
      ],
    }
    await dropFolder(mPage, tree)
    const panel = await waitFor(async () => (await mPage.locator('[data-panel="uploads"] [data-upload]').count()) >= 30, 8000)
    check('pasta', panel, 'a bandeja de envios mostra os 30 arquivos (o .DS_Store fica de fora)', await mPage.locator('[data-panel="uploads"] [data-upload]').count())
    await shot(mPage, 'envio-pasta-d1440.png')
    // Continua usando a ala enquanto sobe: vai para Aprovações e volta.
    await mPage.click('a.mk-tab[href*="/marketing/aprovacoes"]')
    await mPage.waitForURL(/aprovacoes/, { timeout: 8000 })
    const items30 = await waitFor(
      async () => {
        const r = await q(
          `SELECT count(*)::int n FROM "MarketingLibraryItem" i JOIN "MarketingLibraryFolder" f ON f.id=i."folderId" WHERE i."groupId"=$1 AND f.name IN ('Dia 1','Manhã','Tarde')`,
          [G],
        )
        return r[0].n === 30 ? r[0].n : null
      },
      60000,
      400,
    )
    check('pasta', items30 === 30, 'os 30 itens chegaram mesmo com a pessoa em outra tela da ala', items30)
    const fold = await q(
      `SELECT f.name, p.name AS parent FROM "MarketingLibraryFolder" f LEFT JOIN "MarketingLibraryFolder" p ON p.id=f."parentId" WHERE f."groupId"=$1 AND f."companyId"=$2 ORDER BY f.name`,
      [G, C.pet],
    )
    const has = (name, par) => fold.some((f) => f.name === name && f.parent === par)
    check(
      'pasta',
      has('E2E Viagem', 'E2E Campanha') && has('Dia 1', 'E2E Viagem') && has('Dia 2', 'E2E Viagem') && has('Manhã', 'Dia 2') && has('Tarde', 'Dia 2'),
      'o Acervo recria a árvore: E2E Campanha / E2E Viagem / Dia 1, Dia 2 / Manhã, Tarde',
      JSON.stringify(fold.filter((f) => /Viagem|Dia|Manhã|Tarde/.test(f.name))),
    )
    const perFolder = await q(
      `SELECT f.name, count(*)::int n FROM "MarketingLibraryItem" i JOIN "MarketingLibraryFolder" f ON f.id=i."folderId" WHERE i."groupId"=$1 AND f.name IN ('Dia 1','Manhã','Tarde') GROUP BY f.name ORDER BY f.name`,
      [G],
    )
    check('pasta', perFolder.length === 3 && perFolder.every((r) => r.n === 10), 'cada subpasta com as suas 10 fotos', JSON.stringify(perFolder))
    const thumbs = await q(
      `SELECT count(*)::int n FROM "MarketingLibraryItem" i JOIN "MarketingAsset" a ON a.id=i."assetId" WHERE i."groupId"=$1 AND a.width=640 AND a.height=480 AND a.sha256 IS NOT NULL`,
      [G],
    )
    check('pasta', thumbs[0].n >= 30, 'os arquivos têm dimensões medidas e sha256', thumbs[0].n)
    const logUp = await q(`SELECT summary FROM "MarketingLog" WHERE "groupId"=$1 AND "entityType"='library_upload' AND summary LIKE 'enviou 10 arquivos%'`, [G])
    check('pasta', logUp.length >= 1, 'o histórico junta o lote ("enviou 10 arquivos para ...")', logUp.map((l) => l.summary).join(' | '))

    await goto(mPage, `/marketing/acervo?local=${C.pet}&pasta=${ids.camp}`)
    const viagem = (await q(`SELECT id FROM "MarketingLibraryFolder" WHERE "groupId"=$1 AND name='E2E Viagem'`, [G]))[0]?.id
    const dia1 = (await q(`SELECT id FROM "MarketingLibraryFolder" WHERE "groupId"=$1 AND name='Dia 1'`, [G]))[0]?.id
    ids.viagem = viagem
    ids.dia1 = dia1
    const treeVisible = await waitFor(async () => (await mPage.locator(`[data-folder-id="${viagem}"]`).count()) > 0)
    check('tela', treeVisible, 'a árvore mostra a pasta enviada')
    await shot(mPage, 'arvore-d1440.png')

    // Ctrl+V de imagem na pasta aberta
    await pasteImage(mPage, photos[30])
    const pasted = await waitFor(async () => (await q(`SELECT id, title FROM "MarketingLibraryItem" WHERE "groupId"=$1 AND "folderId"=$2 AND title LIKE 'Colado %'`, [G, ids.camp]))[0], 15000)
    check('colar', !!pasted, 'Ctrl+V de uma imagem cai na pasta aberta, com nome "Colado <data hora>"', pasted?.title)

    // Mesmo arquivo de novo: "já está no acervo em <pasta>", Pular e Manter os dois.
    // A pergunta mora na bandeja "Envios" (fila global), não num diálogo da tela.
    const dupPrompt = '[data-testid="upload-tray"] [data-prompt]'
    await mPage.setInputFiles('input[name="files"]', { name: 'de-novo.jpg', mimeType: 'image/jpeg', buffer: photos[0] })
    const dupDlg = await waitFor(async () => (await mPage.locator(dupPrompt).count()) > 0, 15000)
    const dupText = dupDlg ? await mPage.locator('[data-testid="upload-tray"] .mkt__row:has([data-prompt])').innerText() : ''
    check('duplicata', dupDlg && /[Jj]á está no acervo em/.test(dupText) && /PetJourney \/ E2E Campanha \/ E2E Viagem \/ Dia 1/.test(dupText), 'mesmo arquivo de novo avisa "já está no acervo em <pasta>" (na bandeja)', dupText.replace(/\s+/g, ' '))
    await shot(mPage, 'duplicata-d1440.png')
    await mPage.click('[data-testid="upload-tray"] [data-choice="skip"]')
    await sleep(1500)
    const afterSkip = await q(`SELECT count(*)::int n FROM "MarketingLibraryItem" i JOIN "MarketingAsset" a ON a.id=i."assetId" WHERE i."groupId"=$1 AND a.sha256=$2`, [G, sha(photos[0])])
    check('duplicata', afterSkip[0].n === 1, 'Pular: nada novo no Acervo', afterSkip[0].n)
    await mPage.setInputFiles('input[name="files"]', { name: 'de-novo.jpg', mimeType: 'image/jpeg', buffer: photos[0] })
    await mPage.waitForSelector('[data-testid="upload-tray"] [data-choice="keep"]', { timeout: 15000 })
    await mPage.click('[data-testid="upload-tray"] [data-choice="keep"]')
    const kept = await waitFor(async () => {
      const r = await q(`SELECT count(*)::int n FROM "MarketingLibraryItem" i JOIN "MarketingAsset" a ON a.id=i."assetId" WHERE i."groupId"=$1 AND a.sha256=$2`, [G, sha(photos[0])])
      return r[0].n === 2 ? 2 : null
    }, 15000)
    check('duplicata', kept === 2, 'Manter os dois: sobe a segunda cópia', kept)

    // Grade da Dia 1: seleção com caixa e Shift+clique, lote
    await goto(mPage, `/marketing/acervo?local=${C.pet}&pasta=${dia1}`)
    await mPage.waitForSelector('.lg-tile', { timeout: 10000 })
    const tiles = mPage.locator('.lg-tile')
    check('tela', (await tiles.count()) === 10, 'a pasta Dia 1 mostra as 10 miniaturas', await tiles.count())
    const thumbSrc = await tiles.first().locator('img').getAttribute('src')
    check('tela', /\.thumb\.webp/.test(thumbSrc ?? ''), 'a grade usa a miniatura webp (não o original)', thumbSrc?.slice(0, 120))
    await tiles.nth(0).locator('.lck').click()
    await tiles.nth(2).locator('.lck').click({ modifiers: ['Shift'] })
    const selCount = await mPage.locator('.lib-bulk__count').innerText().catch(() => '')
    check('lote', /3 selecionados/.test(selCount), 'caixa + Shift+clique selecionam o intervalo (3)', selCount)
    await shot(mPage, 'selecao-lote-d1440.png')
    const selIds = await mPage.evaluate(() => [...document.querySelectorAll('.lg-tile.is-selected')].map((e) => e.getAttribute('data-item-id')))
    await mPage.click('[data-bulk="favoritar"]')
    const starred = await waitFor(async () => {
      const r = await q(`SELECT count(*)::int n FROM "MarketingLibraryItem" WHERE id = ANY($1) AND starred`, [selIds])
      return r[0].n === 3
    })
    check('lote', starred, 'Favoritar em lote grava nos 3')
    await mPage.click('[data-bulk="etiquetar"]')
    await mPage.locator('.dlg .lti-input').fill('Praia')
    await mPage.keyboard.press('Enter')
    await mPage.click('[data-action="apply-tags"]')
    const tagged = await waitFor(async () => {
      const r = await q(`SELECT count(*)::int n FROM "MarketingLibraryItem" WHERE id = ANY($1) AND 'praia' = ANY(tags)`, [selIds])
      return r[0].n === 3
    })
    check('lote', tagged, 'Etiquetar em lote grava a etiqueta normalizada ("praia")')
    await mPage.click('[data-bulk="mover"]')
    await mPage.locator(`.lib-pick-box [data-folder-id="${ids.camp}"] .ltr-main`).click()
    await shot(mPage, 'mover-d1440.png')
    await mPage.click('[data-action="confirm-pick"]')
    const moved = await waitFor(async () => {
      const r = await q(`SELECT count(*)::int n FROM "MarketingLibraryItem" WHERE id = ANY($1) AND "folderId"=$2`, [selIds, ids.camp])
      return r[0].n === 3
    })
    check('lote', moved, 'Mover em lote leva os 3 para "E2E Campanha"')

    // Detalhes: título, etiqueta, nota; tela cheia com setas e Esc
    await mPage.waitForSelector('.lg-tile', { timeout: 10000 })
    const firstId = await mPage.locator('.lg-tile').first().getAttribute('data-item-id')
    await mPage.locator('.lg-tile').first().click()
    await mPage.waitForSelector('[data-panel="details"]', { timeout: 8000 })
    await mPage.fill('input[name="itemTitle"]', 'Pôr do sol na praia')
    await mPage.locator('input[name="itemTitle"]').press('Enter')
    await mPage.locator('[data-panel="details"] .lti-input').fill('Verão')
    await mPage.locator('[data-panel="details"] .lti-input').press('Enter')
    await mPage.fill('textarea[name="itemNote"]', 'Foto livre para usar em post.')
    await mPage.locator('input[name="itemTitle"]').click()
    const detSaved = await waitFor(async () => {
      const r = await q(`SELECT title, tags, note FROM "MarketingLibraryItem" WHERE id=$1`, [firstId])
      return r[0]?.title === 'Pôr do sol na praia' && r[0]?.tags.includes('verao') && r[0]?.note === 'Foto livre para usar em post.' ? r[0] : null
    })
    check('detalhes', !!detSaved, 'painel salva título, etiqueta ("verao") e nota', JSON.stringify(detSaved))
    const facts = await mPage.locator('[data-panel="details"] .ldt__facts').first().innerText()
    // O sha256 fica em "Mais detalhes", como "Código de conferência" (sem jargão na tela).
    await mPage.locator('[data-panel="details"] [data-section="more"] summary').click()
    const more = await mPage.locator('[data-panel="details"] [data-section="more"]').innerText()
    check(
      'detalhes',
      /640 × 480 px/.test(facts) && /Marcel/.test(facts) && /RGB/.test(facts) && !/Hash|sha256/i.test(facts) && /Código de conferência/.test(more) && /[0-9a-f]{6}/.test(more),
      'dados técnicos: dimensões, espaço de cor, tamanho, quem enviou e quando; o código de conferência em "Mais detalhes"',
      `${facts.replace(/\s+/g, ' ').slice(0, 160)} | ${more.replace(/\s+/g, ' ').slice(0, 80)}`,
    )
    await shot(mPage, 'detalhes-d1440.png')
    await mPage.locator('.lg-tile').nth(1).dblclick()
    await mPage.waitForSelector('.viewer', { timeout: 8000 })
    const c1 = await mPage.locator('.viewer').innerText()
    await mPage.keyboard.press('ArrowRight')
    await sleep(300)
    const c2 = await mPage.locator('.viewer').innerText()
    check('tela cheia', /2 de \d+/.test(c1) && /3 de \d+/.test(c2), 'tela cheia abre no arquivo e a seta anda', `${c1.match(/\d+ de \d+/)?.[0]} -> ${c2.match(/\d+ de \d+/)?.[0]}`)
    await shot(mPage, 'tela-cheia-d1440.png')
    await mPage.keyboard.press('Escape')
    const closed = await waitFor(async () => (await mPage.locator('.viewer').count()) === 0, 3000)
    check('tela cheia', closed, 'Esc fecha a tela cheia')

    // Ao vivo: outra pessoa envia para a pasta aberta e a miniatura aparece sem recarregar.
    await goto(mPage, `/marketing/acervo?local=${C.pet}&pasta=${ids.camp}`)
    await mPage.waitForSelector('.lg-tile', { timeout: 10000 })
    const beforeLive = await mPage.locator('.lg-tile').count()
    const treeCount = () => mPage.locator(`.lib__tree [data-folder-id="${ids.camp}"] .ltr-count`).first().innerText().catch(() => '0')
    const beforeTree = Number(await treeCount())
    const live = await uploadLib(tok.nicolas, { companyId: C.pet, folderId: ids.camp, name: 'ao-vivo.jpg', buffer: photos[33] })
    const liveSeen = await waitFor(async () => (await mPage.locator(`[data-item-id="${live.item?.id}"]`).count()) > 0, 10000)
    check('ao vivo', liveSeen && (await mPage.locator('.lg-tile').count()) === beforeLive + 1, 'arquivo enviado por outra pessoa aparece na pasta aberta sem recarregar (marketing:changed)', `${beforeLive} -> ${await mPage.locator('.lg-tile').count()}`)
    const afterTree = await waitFor(async () => (Number(await treeCount()) === beforeTree + 1 ? Number(await treeCount()) : null), 8000)
    check('ao vivo', afterTree === beforeTree + 1, 'a contagem da pasta na árvore acompanha', `${beforeTree} -> ${afterTree}`)

    // Lista e arrastar item para pasta da árvore
    await goto(mPage, `/marketing/acervo?local=${C.pet}&pasta=${dia1}&vista=lista`)
    await mPage.waitForSelector('.lg-row', { timeout: 8000 })
    await shot(mPage, 'lista-d1440.png')
    const dragId = await mPage.locator('.lg-row').first().getAttribute('data-item-id')
    await mPage.locator('.lg-row').first().dragTo(mPage.locator(`.lib__tree [data-folder-id="${viagem}"]`))
    const dragged = await waitFor(async () => (await q(`SELECT "folderId" FROM "MarketingLibraryItem" WHERE id=$1`, [dragId]))[0]?.folderId === viagem)
    check('tela', dragged, 'arrastar o arquivo para uma pasta da árvore move')

    // Zip pela tela (Dia 1)
    await goto(mPage, `/marketing/acervo?local=${C.pet}&pasta=${dia1}`)
    await mPage.waitForSelector('.lg-tile', { timeout: 8000 })
    await mPage.locator('.lg-tile').first().locator('.lck').click()
    await mPage.locator('.lib-bulk .lck').first().click() // selecionar todos
    const nSel = await mPage.locator('.lib-bulk__count').innerText()
    const dlPromise = mPage.waitForEvent('download', { timeout: 20000 })
    await mPage.click('[data-bulk="zip"]')
    const download = await dlPromise.catch(() => null)
    let zipOk = false
    if (download) {
      const p = path.join(os.tmpdir(), `acervo-e2e-${Date.now()}.zip`)
      await download.saveAs(p)
      const names = zipNames(fs.readFileSync(p))
      zipOk = names?.length === Number(nSel.match(/\d+/)?.[0]) && names.every((n) => /\.jpg$/.test(n))
      check('zip', zipOk, 'Baixar zip pela tela salva o zip com os arquivos selecionados', `${nSel}: ${names?.slice(0, 3).join(', ')}`)
    } else check('zip', false, 'Baixar zip pela tela', 'sem download')

    // ════════════════════════════════════════════════════════════════════
    // 3. Zip de 50 e recusa de 201 (API)
    // ════════════════════════════════════════════════════════════════════
    // R2 (C6): o que está na Lixeira não entra no zip (a API dá 404 para ele).
    let pool = (await q(`SELECT id FROM "MarketingLibraryItem" WHERE "groupId"=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL ORDER BY "createdAt"`, [G, C.pet])).map((r) => r.id)
    for (let i = 8; pool.length < 50 && i < extra.length; i++) {
      const r = await uploadLib(tok.marcel, { companyId: C.pet, folderId: ids.camp, name: `extra-${i}.jpg`, buffer: extra[i] })
      if (r.item?.id) pool.push(r.item.id)
    }
    const fifty = pool.slice(0, 50)
    const z50 = await zipCall(tok.diretoria, fifty)
    const z50names = z50.status === 200 ? zipNames(z50.buf) : null
    check('zip', z50.status === 200 && z50names?.length === 50 && new Set(z50names).size === 50, 'zip de 50 arquivos: 50 entradas, sem nome repetido', `${z50.status} ${z50names?.length} ${z50.disposition}`)
    const ids201 = [...pool, ...Array.from({ length: 201 - pool.length }, (_, i) => `nao-existe-${i}`)]
    const z201 = await zipCall(tok.diretoria, ids201)
    check('zip', z201.status === 400 && z201.data?.message === 'O zip leva até 200 arquivos por vez e você escolheu 201. Baixe em partes.', '201 itens dão a mensagem clara', z201.data?.message)

    // ════════════════════════════════════════════════════════════════════
    // 4. "Escolher do acervo": V2 por cópia, mesmo sha256, volta para Aguardando
    // ════════════════════════════════════════════════════════════════════
    const card = await api(tok.marcel, 'POST', '/cards', { companyId: C.pet, title: 'E2E Acervo Post', kind: 'CAROUSEL', status: 'IN_PRODUCTION', networks: ['INSTAGRAM'] })
    const cardId = card.data?.id
    const v1asset = await uploadCard(tok.marcel, cardId, await photo('Arte V1', 300), 'arte-v1.jpg', 'image/jpeg')
    await api(tok.marcel, 'POST', `/cards/${cardId}/versions`, { assetIds: [v1asset.id] })
    await api(tok.marcel, 'POST', `/cards/${cardId}/move`, { status: 'AWAITING_APPROVAL' })
    const rc = await api(tok.leticia, 'POST', `/cards/${cardId}/request-changes`, { body: 'Use a foto do produto do acervo.' })
    check('escolher', rc.status < 300 && rc.data?.status === 'CHANGES_REQUESTED', 'card em Ajustes pedidos antes de escolher do acervo', rc.data?.status ?? rc.data?.message)

    // A tela do "Escolher do acervo" (montada na página, antes da costura do orquestrador)
    await goto(mPage, `/marketing/acervo?local=${C.pet}`)
    await mountDialog(mPage, { which: 'picker', groupId: G, companyId: C.pet })
    await mPage.waitForSelector('[data-dialog="library-picker"] [data-pick-item]', { timeout: 10000 })
    const pickIds = await mPage.evaluate(() => [...document.querySelectorAll('[data-pick-item]')].map((e) => e.getAttribute('data-pick-item')))
    check('escolher', pickIds.includes(ids.P1) && !pickIds.includes(ids.E1), 'o seletor mostra a marca do card (e a Geral) e não a outra marca', pickIds.length)
    const firstPicked = await mPage.locator('[data-pick-item]').first().getAttribute('data-pick-item')
    const firstStar = await q(`SELECT starred FROM "MarketingLibraryItem" WHERE id=$1`, [firstPicked])
    check('escolher', firstStar[0]?.starred === true, 'favoritos aparecem primeiro no seletor')
    await mPage.locator(`[data-pick-item="${ids.P1}"]`).click()
    await mPage.locator('[data-dialog="library-picker"] [data-location="geral"] .lft-loc__main').click()
    await mPage.waitForSelector(`[data-pick-item="${ids.G1}"]`, { timeout: 8000 })
    await mPage.locator(`[data-pick-item="${ids.G1}"]`).click()
    await shot(mPage, 'escolher-do-acervo-d1440.png')
    await mPage.click('[data-action="use-picked"]')
    const picked = await waitFor(async () => (await mPage.evaluate(() => window.__libDialog?.picked)) ?? null)
    check('escolher', JSON.stringify(picked) === JSON.stringify([ids.P1, ids.G1]), 'o seletor emite os ids na ordem do clique (carrossel)', JSON.stringify(picked))
    await mPage.evaluate(() => window.__unmountLib?.())

    const fl2 = await api(tok.marcel, 'POST', `/cards/${cardId}/versions/from-library`, { itemIds: picked ?? [ids.P1, ids.G1], note: 'Do acervo' })
    const cRow = (await q(`SELECT c.status, v.number FROM "MarketingCard" c JOIN "MarketingCardVersion" v ON v.id=c."currentVersionId" WHERE c.id=$1`, [cardId]))[0]
    check('escolher', fl2.status === 201 && cRow?.status === 'AWAITING_APPROVAL' && cRow?.number === 2, 'cria a V2 e o card volta para Aguardando aprovação', `${fl2.status} ${JSON.stringify(cRow)}`)
    const v2assets = await q(
      `SELECT a.id, a.sha256, a."storagePath", a.position FROM "MarketingAsset" a JOIN "MarketingCard" c ON c."currentVersionId"=a."versionId" WHERE c.id=$1 ORDER BY a.position`,
      [cardId],
    )
    const libAssets = await q(`SELECT i.id, a.id AS aid, a.sha256, a."storagePath" FROM "MarketingLibraryItem" i JOIN "MarketingAsset" a ON a.id=i."assetId" WHERE i.id = ANY($1)`, [[ids.P1, ids.G1]])
    const libP1 = libAssets.find((a) => a.id === ids.P1)
    const libG1 = libAssets.find((a) => a.id === ids.G1)
    check(
      'escolher',
      v2assets.length === 2 && v2assets[0].sha256 === libP1?.sha256 && v2assets[1].sha256 === libG1?.sha256 && v2assets[0].id !== libP1?.aid && v2assets[0].storagePath !== libP1?.storagePath,
      'a V2 é CÓPIA (arquivo e objeto novos) com o mesmo sha256, na ordem escolhida',
      JSON.stringify(v2assets.map((a) => a.sha256.slice(0, 8))),
    )
    ids.v2copyOfP1 = v2assets[0]?.id
    const notif = await q(`SELECT title FROM "Notification" WHERE "userId"=$1 AND type='MARKETING_NEW_VERSION' AND split_part(link,'?',1)=$2`, [U.leticia, `/marketing/cards/${cardId}`])
    check('escolher', notif.length >= 1, 'Letícia é avisada da V2 (mesmo caminho do upload de versão)', notif[0]?.title)
    const usage = await q(`SELECT "itemId", "versionId" FROM "MarketingLibraryUsage" WHERE "cardId"=$1`, [cardId])
    check('escolher', usage.length === 2 && usage.every((u) => !!u.versionId), '"Usado em" gravado para os dois itens', usage.length)
    const otherBrand = await api(tok.nicolas, 'POST', `/cards/${cardId}/versions/from-library`, { itemIds: [ids.E1] })
    check('escolher', otherBrand.status === 400 && /marca do card ou da Geral/.test(otherBrand.data?.message), 'item de outra marca no card: 400 com a frase', otherBrand.data?.message)
    const freelaCross = await api(tok.freela, 'POST', `/cards/${cardId}/versions/from-library`, { itemIds: [ids.E1] })
    check('marca', freelaCross.status === 404, 'freelancer com id da Emmitec no "Escolher do acervo": 404', freelaCross.status)

    await goto(mPage, `/marketing/acervo?local=${C.pet}&item=${ids.P1}`)
    const usedLink = await waitFor(async () => (await mPage.locator(`[data-usage-card="${cardId}"]`).count()) > 0, 10000)
    const usedText = usedLink ? await mPage.locator('[data-section="usages"]').innerText() : ''
    check('escolher', usedLink && /V2 de E2E Acervo Post/.test(usedText), 'o item mostra "Usado em: V2 de <card>" com link', usedText.replace(/\s+/g, ' '))
    await shot(mPage, 'usado-em-d1440.png')
    await mPage.locator(`[data-usage-card="${cardId}"]`).click()
    await mPage.waitForURL(/\/marketing\/cards\//, { timeout: 8000 }).catch(() => {})
    check('escolher', mPage.url().includes(`/marketing/cards/${cardId}`), 'o link do "Usado em" abre o card', mPage.url().replace(WEB, ''))

    // ════════════════════════════════════════════════════════════════════
    // 5. Apagar de um lado não afeta o outro
    // ════════════════════════════════════════════════════════════════════
    const delP1 = await api(tok.marcel, 'DELETE', `/library/items/${ids.P1}`)
    const copyRow = await q(`SELECT id FROM "MarketingAsset" WHERE id=$1`, [ids.v2copyOfP1])
    const copyDl = await api(tok.marcel, 'GET', `/assets/${ids.v2copyOfP1}/download`)
    const copyFetch = copyDl.status === 200 ? await fetch(copyDl.data.url) : null
    const copyBytes = copyFetch ? Buffer.from(await copyFetch.arrayBuffer()) : Buffer.alloc(0)
    check('independência', delP1.status === 200 && copyRow.length === 1 && copyFetch?.ok && sha(copyBytes) === libP1?.sha256, 'apagar o item do Acervo não apaga a versão do card (arquivo e bytes seguem)', `${delP1.status} ${copyDl.status}`)
    const delCard = await api(tok.marcel, 'DELETE', `/cards/${cardId}`)
    const g1Row = await q(`SELECT i.id FROM "MarketingLibraryItem" i WHERE i.id=$1`, [ids.G1])
    const g1Dl = await api(tok.marcel, 'GET', `/library/items/${ids.G1}/download`)
    const g1Fetch = g1Dl.status === 200 ? await fetch(g1Dl.data.url) : null
    check('independência', delCard.status === 200 && g1Row.length === 1 && g1Fetch?.ok, 'apagar o card não apaga o item do Acervo (e o "Usado em" sai junto)', `${delCard.status} ${g1Dl.status}`)
    // R2 (C6): o card vai para a Lixeira; a linha de uso fica no banco (restaurar
    // devolve), mas o "Usado em" e a contagem não mostram card na lixeira.
    const g1Detail = await api(tok.marcel, 'GET', `/library/items/${ids.G1}`)
    const usageRows = await q(`SELECT count(*)::int n FROM "MarketingLibraryUsage" WHERE "cardId"=$1`, [cardId])
    check(
      'independência',
      g1Detail.status === 200 && !(g1Detail.data?.usages ?? []).some((u) => u.cardId === cardId) && usageRows[0].n > 0,
      'o uso do card apagado sai do "Usado em" (a linha fica para o restaurar)',
      `${g1Detail.status} usos=${(g1Detail.data?.usages ?? []).length} linhas=${usageRows[0].n}`,
    )

    // ════════════════════════════════════════════════════════════════════
    // 6. "Mandar para o acervo" (cópia de um arquivo de versão)
    // ════════════════════════════════════════════════════════════════════
    const card2 = await api(tok.marcel, 'POST', '/cards', { companyId: C.pet, title: 'E2E Acervo Mandar', kind: 'POST', networks: ['INSTAGRAM'] })
    const art = await photo('Arte para guardar', 210)
    const art2 = await photo('Outra arte', 120)
    const a2 = await uploadCard(tok.marcel, card2.data.id, art, 'arte-guardar.jpg', 'image/jpeg')
    const a3 = await uploadCard(tok.marcel, card2.data.id, art2, 'outra-arte.jpg', 'image/jpeg')
    await api(tok.marcel, 'POST', `/cards/${card2.data.id}/versions`, { assetIds: [a2.id, a3.id] })
    const sent = await api(tok.marcel, 'POST', '/library/items/from-asset', { assetId: a2.id, folderId: ids.camp })
    const sentSha = sent.status === 201 ? (await q(`SELECT a.sha256 FROM "MarketingLibraryItem" i JOIN "MarketingAsset" a ON a.id=i."assetId" WHERE i.id=$1`, [sent.data.id]))[0]?.sha256 : null
    check('mandar', sent.status === 201 && sentSha === sha(art) && sent.data.asset.id !== a2.id, '"Mandar para o acervo" copia com o mesmo sha256 (arquivo novo)', `${sent.status} ${sentSha?.slice(0, 8)}`)
    const again = await api(tok.marcel, 'POST', '/library/items/from-asset', { assetId: a2.id })
    check('mandar', again.status === 409 && again.data?.duplicateOf?.folderPath === 'PetJourney / E2E Campanha', 'de novo: 409 com "já está no acervo em <pasta>"', again.data?.message)
    const logSent = await q(`SELECT summary FROM "MarketingLog" WHERE "groupId"=$1 AND verb='copied_in' ORDER BY "createdAt" DESC LIMIT 1`, [G])
    check('mandar', /a partir da V1 de "E2E Acervo Mandar"/.test(logSent[0]?.summary ?? ''), 'o histórico conta de onde veio', logSent[0]?.summary)

    // A tela do "Mandar para o acervo" (montada na página)
    await goto(mPage, `/marketing/acervo?local=${C.pet}`)
    await mountDialog(mPage, { which: 'send', groupId: G, companyId: C.pet, assetId: a3.id, defaultTitle: 'outra-arte.jpg' })
    await mPage.waitForSelector('[data-dialog="send-to-library"] .lft', { timeout: 10000 })
    await mPage.locator(`.lib-pick-box [data-folder-id="${viagem}"] .ltr-main`).click()
    await shot(mPage, 'mandar-para-o-acervo-d1440.png')
    await mPage.click('[data-action="send-to-library"]')
    const sentUi = await waitFor(async () => (await mPage.evaluate(() => window.__libDialog?.sent)) ?? null, 10000)
    const sentUiRow = sentUi ? (await q(`SELECT i.title, i."folderId", a.sha256 FROM "MarketingLibraryItem" i JOIN "MarketingAsset" a ON a.id=i."assetId" WHERE i.id=$1`, [sentUi.id]))[0] : null
    check('mandar', sentUiRow?.folderId === viagem && sentUiRow?.sha256 === sha(art2) && sentUiRow?.title === 'outra-arte', 'pela tela: escolhe a pasta, copia com o título sem extensão', JSON.stringify(sentUiRow))
    await mPage.evaluate(() => window.__unmountLib?.())
    await mountDialog(mPage, { which: 'send', groupId: G, companyId: C.pet, assetId: a3.id, defaultTitle: 'outra-arte.jpg' })
    await mPage.waitForSelector('[data-action="send-to-library"]:not([disabled])', { timeout: 10000 })
    await mPage.click('[data-action="send-to-library"]')
    const dupUi = await waitFor(async () => (await mPage.locator('[data-duplicate]').count()) > 0, 8000)
    const dupUiText = dupUi ? await mPage.locator('[data-duplicate]').innerText() : ''
    check('mandar', dupUi && /já está no acervo em/.test(dupUiText), 'pela tela: repetido mostra onde já está', dupUiText.replace(/\s+/g, ' '))
    await shot(mPage, 'mandar-repetido-d1440.png')
    await mPage.click('[data-action="send-keep-both"]')
    const keptUi = await waitFor(async () => (await mPage.evaluate(() => window.__libDialog?.sent)) ?? null, 8000)
    const keptN = await q(`SELECT count(*)::int n FROM "MarketingLibraryItem" i JOIN "MarketingAsset" a ON a.id=i."assetId" WHERE i."groupId"=$1 AND a.sha256=$2`, [G, sha(art2)])
    check('mandar', !!keptUi && keptN[0].n === 2, '"Manter os dois" pela tela', keptN[0].n)
    await mPage.evaluate(() => window.__unmountLib?.())

    // ════════════════════════════════════════════════════════════════════
    // 7. Visualizador e freelancer na tela
    // ════════════════════════════════════════════════════════════════════
    const vCtx = await newCtx(browser, tok.diretoria, DESK)
    const vPage = await open(vCtx, `/marketing/acervo?local=${C.pet}&pasta=${ids.camp}`, 'diretoria')
    await vPage.waitForSelector('.lg-tile', { timeout: 10000 })
    const vButtons = {
      upload: await vPage.locator('[data-action="upload-menu"]').count(),
      folder: await vPage.locator('[data-action="new-folder"]').count(),
    }
    await vPage.locator('.lg-tile').first().locator('.lck').click()
    const vBulk = await vPage.evaluate(() => [...document.querySelectorAll('[data-bulk]')].map((b) => b.getAttribute('data-bulk')))
    check('papel', vButtons.upload === 0 && vButtons.folder === 0 && JSON.stringify(vBulk) === '["zip"]', 'Visualizador na tela: sem Enviar, sem Nova pasta; no lote só "Baixar zip"', JSON.stringify(vBulk))
    await vPage.locator('.lg-tile').first().click()
    await vPage.waitForSelector('[data-panel="details"]')
    const vDet = {
      del: await vPage.locator('[data-action="delete-one"]').count(),
      move: await vPage.locator('[data-action="move-one"]').count(),
      title: await vPage.locator('input[name="itemTitle"]').count(),
      dl: await vPage.locator('[data-action="download"]').count(),
    }
    check('papel', vDet.del === 0 && vDet.move === 0 && vDet.title === 0 && vDet.dl === 1, 'Visualizador no painel: baixa, não edita, não move, não apaga', JSON.stringify(vDet))
    await shot(vPage, 'visualizador-d1440.png')
    await vCtx.close()

    const fCtx = await newCtx(browser, tok.freela, DESK)
    const fPage = await open(fCtx, '/marketing/acervo', 'freela')
    await fPage.waitForSelector('.lft', { timeout: 10000 })
    const fLocs = await fPage.evaluate(() => [...document.querySelectorAll('.lib__tree [data-location]')].map((e) => e.getAttribute('data-location')))
    check('marca', fLocs.includes('geral') && fLocs.includes(C.pet) && !fLocs.includes(C.emmitec) && fPage.url().includes(`local=`) === false, 'freelancer abre na PetJourney e vê a Geral; sem Emmitec', JSON.stringify(fLocs))
    await goto(fPage, `/marketing/acervo?item=${ids.E1}`)
    await sleep(1200)
    const fT = await toasts(fPage)
    const fDet = await fPage.locator('[data-panel="details"]').count()
    check('marca', fDet === 0 && fT.some((t) => /não está mais no Acervo/.test(t)), 'freelancer com link de item da Emmitec: nada abre, só o aviso', fT.join(' | '))
    await shot(fPage, 'freelancer-d1440.png')
    await fCtx.close()

    // ════════════════════════════════════════════════════════════════════
    // 8. Celular 375px (freelancer): uma coluna, folhas, câmera e galeria
    // ════════════════════════════════════════════════════════════════════
    const phCtx = await newCtx(browser, tok.marcel, PHONE)
    const ph = await open(phCtx, `/marketing/acervo?local=${C.pet}&pasta=${ids.camp}`, 'marcel-375')
    await ph.waitForSelector('.lg-tile', { timeout: 10000 })
    const sw1 = await scrollWidth(ph)
    const cam = await ph.locator('input[name="camera"]').getAttribute('capture')
    const camAccept = await ph.locator('input[name="camera"]').getAttribute('accept')
    const gal = await ph.locator('input[name="gallery"]').getAttribute('accept')
    const btns = { foto: await ph.locator('[data-action="camera"]').count(), galeria: await ph.locator('[data-action="gallery"]').count() }
    check('celular', sw1 <= 375, '375px sem rolagem lateral', sw1)
    check('celular', cam === 'environment' && camAccept === 'image/*' && /image\/\*,video\/\*/.test(gal ?? '') && btns.foto === 1 && btns.galeria === 1, '"Tirar foto" abre a câmera traseira (capture=environment) e "Galeria" aceita foto e vídeo', `${cam} ${camAccept} ${gal}`)
    await shot(ph, 'celular-grade-m375.png')
    await ph.setInputFiles('input[name="camera"]', { name: 'IMG_CAMERA.jpg', mimeType: 'image/jpeg', buffer: photos[31] })
    const camItem = await waitFor(async () => (await q(`SELECT id FROM "MarketingLibraryItem" WHERE "groupId"=$1 AND "folderId"=$2 AND title='IMG_CAMERA'`, [G, ids.camp]))[0], 15000)
    check('celular', !!camItem, 'foto da câmera cai na pasta aberta', camItem?.id)
    await ph.click('[data-action="open-tree"]')
    await ph.waitForSelector('.lsh .lft', { timeout: 5000 })
    await shot(ph, 'celular-pastas-m375.png')
    await ph.locator(`.lsh [data-folder-id="${dia1}"] .ltr-main`).click()
    await ph.waitForURL(new RegExp(`pasta=${dia1}`), { timeout: 5000 }).catch(() => {})
    await ph.waitForSelector('.lg-tile', { timeout: 8000 })
    await ph.locator('.lg-tile').first().locator('.lg-thumb').click()
    const sheet = await waitFor(async () => (await ph.locator('.lsh [data-panel="details"]').count()) > 0, 6000)
    check('celular', sheet, 'tocar no arquivo abre os detalhes em folha de baixo')
    await shot(ph, 'celular-detalhes-m375.png')
    const sw2 = await scrollWidth(ph)
    check('celular', sw2 <= 375, 'detalhes no celular sem rolagem lateral', sw2)
    await phCtx.close()

    // ════════════════════════════════════════════════════════════════════
    // 9. Escuro (desktop e celular)
    // ════════════════════════════════════════════════════════════════════
    const dCtx = await newCtx(browser, tok.nicolas, DESK, 'dark')
    const dPage = await open(dCtx, `/marketing/acervo?local=${C.pet}&pasta=${ids.camp}`, 'nicolas-dark')
    await dPage.waitForSelector('.lg-tile', { timeout: 10000 })
    await shot(dPage, 'escuro-grade-d1440.png')
    await dPage.locator('.lg-tile').first().click()
    await dPage.waitForSelector('[data-panel="details"]')
    await shot(dPage, 'escuro-detalhes-d1440.png')
    await goto(dPage, '/marketing/acervo')
    await dPage.waitForSelector('.lft')
    await shot(dPage, 'escuro-todos-d1440.png')
    await dCtx.close()
    const dmCtx = await newCtx(browser, tok.nicolas, PHONE, 'dark')
    const dm = await open(dmCtx, `/marketing/acervo?local=${C.pet}&pasta=${dia1}`, 'nicolas-dark-375')
    await dm.waitForSelector('.lg-tile', { timeout: 10000 })
    await shot(dm, 'escuro-celular-m375.png')
    check('celular', (await scrollWidth(dm)) <= 375, 'escuro no celular sem rolagem lateral')
    await dmCtx.close()

    // Claro: Todos os arquivos (Dono) e a Geral
    const lPage = await open(await newCtx(browser, tok.nicolas, DESK), '/marketing/acervo', 'nicolas')
    await lPage.waitForSelector('.lg-tile', { timeout: 10000 })
    await shot(lPage, 'todos-d1440.png')
    await goto(lPage, `/marketing/acervo?local=geral&pasta=${gF.data.id}`)
    await shot(lPage, 'geral-d1440.png')

    // ════════════════════════════════════════════════════════════════════
    // 10. Produção antes da migration: Acervo "indisponível", resto igual
    // ════════════════════════════════════════════════════════════════════
    if (ONLY !== 'sem-503') {
      const someCard = seed.cards[0].id
      const cardAsset = a2.id
      for (const t of ['MarketingLibraryUsage', 'MarketingLibraryItem', 'MarketingLibraryFolder']) {
        await q(`ALTER TABLE "${t}" RENAME TO "${t}__r1off"`)
      }
      try {
        const off = {
          items: await api(tok.nicolas, 'GET', '/library/items'),
          folders: await api(tok.nicolas, 'GET', '/library/folders'),
          uploads: await api(tok.nicolas, 'POST', '/library/uploads', { companyId: C.pet, files: [{ name: 'x.jpg', size: 10, mimeType: 'image/jpeg' }] }),
          fromLib: await api(tok.nicolas, 'POST', `/cards/${someCard}/versions/from-library`, { itemIds: ['x'] }),
        }
        check(
          'produção',
          Object.values(off).every((r) => r.status === 503 && /Acervo ainda está sendo instalado/.test(r.data?.message)),
          'sem as tabelas da R1, toda rota do Acervo responde 503 com a frase amigável (nunca 500)',
          Object.values(off).map((r) => r.status).join(','),
        )
        const alive = {
          cards: await api(tok.nicolas, 'GET', '/cards'),
          me: await api(tok.nicolas, 'GET', '/marketing/me'),
          dl: await api(tok.marcel, 'GET', `/assets/${cardAsset}/download`),
        }
        check('produção', alive.cards.status === 200 && alive.me.status === 200 && alive.me.data?.available === true && alive.dl.status === 200, 'o resto da ala segue igual (cards, /me, download de arquivo do card)', `${alive.cards.status} ${alive.me.status} ${alive.dl.status}`)
        lPage.allow503 = true
        await goto(lPage, '/marketing/acervo')
        const offText = await waitFor(async () => {
          const t = await lPage.locator('.lib-page').innerText()
          return /O Acervo ainda não está disponível/.test(t) ? t : null
        }, 10000)
        check('produção', !!offText, 'a tela mostra "O Acervo ainda não está disponível" em vez de erro')
        await shot(lPage, 'indisponivel-d1440.png')
        await goto(lPage, '/marketing/aprovacoes')
        await lPage.waitForSelector('.mkb__col', { timeout: 10000 }).catch(() => {})
        check('produção', (await lPage.locator('.mkb__col').count()) > 0, 'Aprovações abre normalmente sem as tabelas da R1')
      } finally {
        for (const t of ['MarketingLibraryUsage', 'MarketingLibraryItem', 'MarketingLibraryFolder']) {
          await q(`ALTER TABLE IF EXISTS "${t}__r1off" RENAME TO "${t}"`)
        }
        lPage.allow503 = false
      }
      const back = await api(tok.nicolas, 'GET', '/library/items')
      check('produção', back.status === 200, 'com as tabelas de volta, o Acervo responde de novo', back.status)
    }
  } catch (error) {
    console.error(error)
    check('roteiro', false, 'o roteiro rodou até o fim', error?.message)
  } finally {
    check('geral', allBad.length === 0, 'zero 401/5xx da API nas telas', allBad.slice(0, 8).join(' | '))
    check('geral', allErrors.length === 0, 'zero erro de JavaScript nas telas', allErrors.slice(0, 5).join(' | '))
    await browser.close()
    await db.end()
    const ok = results.filter((r) => r.ok).length
    console.log(`\n${ok}/${results.length} checagens OK, ${fails} falha(s). Capturas em ${OUT}`)
    process.exit(fails ? 1 : 0)
  }
})()
