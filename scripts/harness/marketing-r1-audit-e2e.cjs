// Roteiro dos achados da auditoria do front da R1 (ala Marketing), de ponta a
// ponta pela tela e conferido no banco:
//   A. o "repetido" do Acervo não trava a fila ao sair da tela nem da ala;
//   B. cancelar e tentar de novo, em sequência rápida, não duplica nada;
//   C. a falha ao criar o item do Acervo vira erro (não "Enviado"), e o
//      "Tentar de novo" refaz só esse passo, com o mesmo arquivo guardado;
//   D. o "Tentar de novo" de arquivo de pasta arrastada não aninha subpastas;
//   E. sair da conta com envio pendente pergunta, cancela no servidor e a
//      próxima conta da aba começa sem fila;
//   F. o zip é baixado pelo navegador (link de uso único, nada em memória);
//   G. o rodapé do convite "Do Nevo" cabe na tela (375 e 1366x768);
//   H. nenhuma tela da ala passa da largura em 1024, 1280 e 375;
//   I. extras: arrastar para outra marca pergunta, colar com diálogo aberto
//      não cai na pasta de trás, a seleção não zera sozinha, soltar arquivo
//      fora de uma área não abre o arquivo no navegador.
//
// Uso: API=http://127.0.0.1:3629 WEB=http://localhost:5199 HARNESS_DB=wf_fix \
//      SHOTS=<pasta> node marketing-r1-audit-e2e.cjs     (ONLY=A,B,... roda uma parte)
// Pré-requisitos: banco do marketing-db.sh, fake-storage, API (api-run.sh) e Vite.
// Não mexe na configuração do fake-storage (é compartilhado): o atraso e a
// falha de rede saem do `page.route` do próprio navegador.
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const pg = require('pg')

const API = process.env.API ?? 'http://127.0.0.1:3629'
const WEB = process.env.WEB ?? 'http://localhost:5199'
const DB = process.env.HARNESS_DB ?? 'wf_fix'
const seed = JSON.parse(fs.readFileSync(path.resolve(__dirname, process.env.HARNESS_SEED ?? `seed-marketing-out.${DB}.json`), 'utf8'))
const OUT = process.env.SHOTS ?? path.join(__dirname, 'prints', 'marketing-r1-audit')
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean)
fs.mkdirSync(OUT, { recursive: true })

const G = seed.groupId
const C = seed.companies
const run = (key) => !ONLY.length || ONLY.includes(key)

let fails = 0
let oks = 0
const check = (crit, cond, msg, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} [${crit}] ${msg}${extra !== '' && extra !== undefined ? '  (' + String(extra).slice(0, 300) + ')' : ''}`)
  if (cond) oks++
  else fails++
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
/** Conteúdo único por rodada (o Acervo avisa repetido pelo sha256 do grupo inteiro). */
const RUN = crypto.randomBytes(4).toString('hex')
const blob = (label, kb = 24) => Buffer.concat([Buffer.from(`aud ${RUN} ${label}\n`), crypto.randomBytes(kb * 1024)])

// ── Login com cache (a API limita 10 logins por minuto por processo) ─────────
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
  for (let i = 0; i < 6; i++) {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'nevo1234' }),
    })
    if (r.status === 429) {
      await sleep(Number(r.headers.get('retry-after') ?? 10) * 1000)
      continue
    }
    if (!r.ok) throw new Error(`login ${email}: ${r.status}`)
    cache[email] = (await r.json()).accessToken
    fs.writeFileSync(TOKEN_CACHE, JSON.stringify(cache))
    return cache[email]
  }
  throw new Error(`login ${email} bloqueado`)
}

async function api(tk, method, route, body) {
  const url = route.startsWith('/marketing') || route.startsWith('/user') ? `${API}${route}` : `${API}/marketing/g/${G}${route}`
  const r = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tk}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await r.text()
  let data = text
  try {
    data = JSON.parse(text)
  } catch {}
  return { status: r.status, data, headers: r.headers }
}

/** O caminho do navegador pela API: ticket, PUT direto, confirm e o item. */
async function uploadLib(tk, { companyId, folderId = null, name, buffer, mime = 'application/octet-stream' }) {
  const t = await api(tk, 'POST', '/library/uploads', {
    companyId,
    folderId,
    files: [{ name, size: buffer.length, mimeType: mime, sha256: sha(buffer), keepBoth: true }],
  })
  const f = t.data?.files?.[0]
  if (!f?.ticket) throw new Error(`ticket ${t.status} ${JSON.stringify(t.data).slice(0, 200)}`)
  const put = await fetch(f.ticket.uploadUrl, { method: 'PUT', headers: { 'content-type': mime, authorization: `Bearer ${f.ticket.token}` }, body: buffer })
  if (!put.ok) throw new Error(`PUT ${put.status}`)
  const c = await api(tk, 'POST', `/assets/${f.ticket.asset.id}/confirm`, {})
  if (c.status >= 300) throw new Error(`confirm ${c.status}`)
  const it = await api(tk, 'POST', '/library/items', { assetId: f.ticket.asset.id, folderId: f.folderId, companyId })
  return it.data
}

/** Entradas de um zip pelo diretório central. */
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

// ── Navegador ───────────────────────────────────────────────────────────────
const DESK = { width: 1440, height: 900 }
const allBad = []
const allErrors = []

async function newCtx(browser, tk, vp = DESK, opts = {}) {
  const mobile = vp.width < 640
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    reducedMotion: 'reduce',
    acceptDownloads: true,
  })
  await ctx.addInitScript(
    ([t, c]) => {
      // Só na primeira carga: o passo do logout troca a conta na mesma aba.
      if (!sessionStorage.getItem('aud.boot')) {
        sessionStorage.setItem('aud.boot', '1')
        localStorage.setItem('token', t)
        if (c) localStorage.setItem('activeCompany', c)
      }
      localStorage.setItem('ui.theme', 'light')
      localStorage.setItem('onboarding.autoShown', '1')
      localStorage.setItem('onboarding.completed', '1')
      localStorage.setItem('ui.idlePermissionPrompt', 'done')
      localStorage.setItem('ui.timerSounds', 'false')
      localStorage.setItem('nevo.idle.protectionSnoozedUntil', String(Date.now() + 864e5))
    },
    [tk, opts.company === undefined ? C.pet : opts.company],
  )
  return ctx
}
async function open(ctx, route, who) {
  const page = await ctx.newPage()
  page.on('response', (res) => {
    const u = res.url()
    if (u.startsWith(API) && (res.status() === 401 || res.status() >= 500) && !page.allowBad) {
      allBad.push(`${who}: ${res.status()} ${res.request().method()} ${u.replace(API, '')}`)
    }
  })
  page.on('pageerror', (e) => allErrors.push(`${who}: ${e.message}`))
  page.on('dialog', (d) => d.accept().catch(() => {}))
  await page.goto(WEB + route, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.addStyleTag({ content: '#__vue-devtools-container__{display:none!important}' }).catch(() => {})
  await sleep(400)
  return page
}
async function goto(page, route) {
  await page.goto(WEB + route, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await sleep(400)
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name) })
const tray = '[data-testid="upload-tray"]'
const row = (name) => `${tray} .mkt__row[data-name="${name}"]`
const statusOf = (page, name) => page.locator(row(name)).last().getAttribute('data-status').catch(() => null)
async function openTray(page) {
  const t = page.locator(`${tray} .mkt__toggle`)
  if ((await t.count()) && (await t.getAttribute('aria-expanded')) === 'false') await t.click()
}
const toasts = (page) => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], .toast, [role="status"]')].map((t) => t.textContent?.trim() ?? '').join(' | '))

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
          let i = 0
          return { readEntries(ok) { const b = kids.slice(i, i + 50); i += 50; setTimeout(() => ok(b), 5) } }
        },
      }
    }
    const root = make(spec, '')
    const dt = { types: ['Files'], files: [], items: [{ kind: 'file', type: '', webkitGetAsEntry: () => root, getAsFile: () => null }], dropEffect: 'copy' }
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

;(async () => {
  const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
  await db.connect()
  const q = async (sql, params) => (await db.query(sql, params)).rows
  const tok = {
    nicolas: await token('nicolas@nevo.test'),
    marcel: await token('marcel@nevo.test'),
    leticia: await token('leticia@nevo.test'),
  }

  // Área própria do roteiro (não mexe no resto do Acervo).
  const oldFolders = await q(`SELECT id FROM "MarketingLibraryFolder" WHERE "groupId"=$1 AND name LIKE 'E2E Aud%' AND "parentId" IS NULL`, [G])
  for (const f of oldFolders) await api(tok.nicolas, 'DELETE', `/library/folders/${f.id}?mover=pai`)
  const audRoot = (await api(tok.marcel, 'POST', '/library/folders', { companyId: C.pet, name: `E2E Auditoria ${RUN}` })).data
  const folderOf = async (name, parentId) => (await api(tok.marcel, 'POST', '/library/folders', { companyId: C.pet, parentId, name })).data
  const itemsBySha = async (s) => (await q(`SELECT i.id, i."folderId", i."assetId" FROM "MarketingLibraryItem" i JOIN "MarketingAsset" a ON a.id=i."assetId" WHERE i."groupId"=$1 AND a.sha256=$2`, [G, s]))
  const pendingByName = async (name) => (await q(`SELECT id FROM "MarketingAsset" WHERE "groupId"=$1 AND name=$2 AND status='PENDING'`, [G, name]))

  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    // ══════════════════════════════════════════════════════════════════════
    // A. Repetido sem travar a fila
    // ══════════════════════════════════════════════════════════════════════
    if (run('A')) {
      console.log('\n== A. repetido não trava a fila ==')
      const fA = await folderOf('A repetidos', audRoot.id)
      const dups = [blob('dup-1'), blob('dup-2'), blob('dup-3')]
      for (const [i, b] of dups.entries()) await uploadLib(tok.marcel, { companyId: C.pet, folderId: fA.id, name: `aud-dup-${i + 1}.bin`, buffer: b })
      const fresh = [blob('novo-1'), blob('novo-2'), blob('novo-3')]
      const ctx = await newCtx(browser, tok.marcel)
      const page = await open(ctx, `/marketing/acervo?local=${C.pet}&pasta=${fA.id}`, 'marcel')
      await page.waitForSelector('input[name="files"]', { state: 'attached', timeout: 15000 })
      // 3 repetidos primeiro: com a pergunta segurando vaga (o defeito), os 3 novos nunca saíam.
      await page.setInputFiles('input[name="files"]', [
        ...dups.map((b, i) => ({ name: `aud-dup-${i + 1}.bin`, mimeType: 'application/octet-stream', buffer: b })),
        ...fresh.map((b, i) => ({ name: `aud-novo-${i + 1}.bin`, mimeType: 'application/octet-stream', buffer: b })),
      ])
      // Sai da tela do Acervo na hora (fica na ala).
      await page.click('a.mk-tab[href*="/marketing/aprovacoes"]')
      await page.waitForURL(/aprovacoes/, { timeout: 8000 })
      const freshIn = await waitFor(async () => {
        const n = (await Promise.all(fresh.map(async (b) => (await itemsBySha(sha(b))).length))).reduce((s, x) => s + x, 0)
        return n === 3 ? n : null
      }, 30000)
      check('A', freshIn === 3, 'com 3 repetidos esperando resposta e a pessoa fora do Acervo, os 3 arquivos novos sobem', freshIn)
      await openTray(page)
      const prompts = await waitFor(async () => ((await page.locator(`${tray} [data-prompt]`).count()) === 3 ? 3 : null), 8000)
      check('A', prompts === 3, 'as 3 perguntas ficam na bandeja (em outra tela da ala), sem segurar vaga', prompts)
      const askText = await page.locator(`${tray} .mkt__row:has([data-prompt])`).first().innerText()
      check('A', /Já está no acervo em/.test(askText) && /E2E Auditoria/.test(askText), 'a pergunta diz onde o arquivo já está', askText.replace(/\s+/g, ' ').slice(0, 140))
      const summary = await page.locator('[data-testid="upload-summary"]').innerText()
      check('A', /esperando a sua resposta|esperando resposta/.test(summary), 'o resumo da bandeja avisa que há resposta pendente', summary)
      await shot(page, 'A-repetidos-na-bandeja-d1440.png')
      // "Fazer o mesmo para os outros" + Pular: os 3 de uma vez.
      await page.locator(`${tray} .mkt__row:has([data-prompt])`).first().locator('[data-testid="upload-apply-all"]').click()
      await page.locator(`${tray} .mkt__row:has([data-prompt])`).first().locator('[data-choice="skip"]').click()
      const skipped = await waitFor(async () => {
        const st = await Promise.all(dups.map((_, i) => statusOf(page, `aud-dup-${i + 1}.bin`)))
        return st.every((s) => s === 'skipped') ? st : null
      }, 10000)
      check('A', !!skipped, '"Fazer o mesmo para os outros" + Pular: os 3 repetidos ficam como Pulado', JSON.stringify(skipped))
      const dupCount = (await Promise.all(dups.map(async (b) => (await itemsBySha(sha(b))).length))).join(',')
      check('A', dupCount === '1,1,1', 'Pular não cria item novo no Acervo', dupCount)
      const skipText = await page.locator(`${row('aud-dup-1.bin')} .mkt__state`).last().innerText()
      check('A', /Pulado/.test(skipText) && !/Falhou|erro/i.test(skipText), 'pulado tem texto próprio (não é falha nem cancelado)', skipText)

      // Sair da ALA com pergunta aberta: vira "Pular" e nada fica pendente.
      await goto(page, `/marketing/acervo?local=${C.pet}&pasta=${fA.id}`)
      await page.setInputFiles('input[name="files"]', [{ name: 'aud-dup-1.bin', mimeType: 'application/octet-stream', buffer: dups[0] }])
      await waitFor(async () => (await page.locator(`${tray} [data-prompt]`).count()) > 0, 10000)
      const originA = await page.evaluate(() => performance.timeOrigin)
      // Sai da ala e volta pelo menu (sem recarregar: a fila de módulo continua viva).
      await page.locator('a[href="/notes"], a[href="/tasks"], a[href="/"]').first().click()
      await page.waitForURL((u) => !u.pathname.startsWith('/marketing'), { timeout: 8000 }).catch(() => {})
      await sleep(600)
      await page.locator('a[href="/marketing"]').first().click()
      await page.waitForURL(/\/marketing/, { timeout: 8000 })
      await page.locator('a.mk-tab[href*="/marketing/acervo"]').click()
      await page.waitForURL(/acervo/, { timeout: 8000 })
      check('A', (await page.evaluate(() => performance.timeOrigin)) === originA, 'saiu e voltou para a ala sem recarregar a página')
      await openTray(page)
      const leftAla = await waitFor(async () => {
        const rows = await page.locator(row('aud-dup-1.bin')).evaluateAll((els) => els.map((e) => e.getAttribute('data-status')))
        return rows.length >= 1 && rows.every((s) => s === 'skipped') ? rows : null
      }, 8000)
      check('A', !!leftAla, 'saiu da ala com a pergunta aberta: o repetido vira Pulado (a fila não fica presa)', JSON.stringify(leftAla))
      const pendingNow = await page.evaluate(() => {
        const ev = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(ev)
        return ev.defaultPrevented
      })
      check('A', pendingNow === false, 'nada pendente: fechar a aba não pede confirmação', pendingNow)
      await ctx.close()
    }

    // ══════════════════════════════════════════════════════════════════════
    // B. Cancelar e tentar de novo sem duplicar
    // ══════════════════════════════════════════════════════════════════════
    if (run('B')) {
      console.log('\n== B. cancelar e tentar de novo ==')
      const fB = await folderOf('B cancelar', audRoot.id)
      const ctx = await newCtx(browser, tok.marcel)
      const page = await open(ctx, `/marketing/acervo?local=${C.pet}&pasta=${fB.id}`, 'marcel')
      // Atraso de 1,5 s em todo envio de bytes ao storage, só nesta aba.
      let slow = true
      const storageHost = new URL(process.env.STORAGE ?? 'http://127.0.0.1:54329').host
      await page.route((url) => url.host === storageHost && /object|upload/.test(url.pathname), async (route) => {
        const m = route.request().method()
        if (slow && (m === 'PUT' || m === 'PATCH' || m === 'POST')) await sleep(1500)
        await route.continue().catch(() => {})
      })
      const tickets = []
      page.on('request', (r) => {
        if (r.method() === 'POST' && r.url().endsWith('/library/uploads')) tickets.push(r.url())
      })
      const fileB = blob('cancelar', 900)
      await page.setInputFiles('input[name="files"]', [{ name: 'aud-cancelar.bin', mimeType: 'application/octet-stream', buffer: fileB }])
      await openTray(page)
      await waitFor(async () => (await statusOf(page, 'aud-cancelar.bin')) === 'uploading', 10000)
      // Cancelar, tentar de novo, cancelar, tentar de novo: em sequência rápida.
      for (let i = 0; i < 2; i++) {
        await page.locator(`${row('aud-cancelar.bin')} [data-action="cancel"]`).click()
        await waitFor(async () => (await statusOf(page, 'aud-cancelar.bin')) === 'canceled', 4000)
        await openTray(page)
        const retryBtn = page.locator(`${row('aud-cancelar.bin')} [data-action="retry"]`)
        await waitFor(async () => (await retryBtn.count()) && !(await retryBtn.isDisabled()), 4000)
        await retryBtn.click()
        await waitFor(async () => ['hashing', 'uploading', 'queued'].includes(await statusOf(page, 'aud-cancelar.bin')), 4000)
        await sleep(i === 0 ? 300 : 900)
      }
      slow = false
      const done = await waitFor(async () => (await statusOf(page, 'aud-cancelar.bin')) === 'done', 20000)
      check('B', !!done, 'depois de cancelar e tentar de novo duas vezes, o arquivo termina como Enviado', await statusOf(page, 'aud-cancelar.bin'))
      await sleep(2500)
      const itemsB = await itemsBySha(sha(fileB))
      check('B', itemsB.length === 1, 'um item só no Acervo (nenhuma execução velha criou outro)', itemsB.length)
      const orphans = await pendingByName('aud-cancelar.bin')
      check('B', orphans.length === 0, 'nenhum envio pendente sobrou no servidor (o cancelado foi abortado)', orphans.length)
      const rowsB = await page.locator(row('aud-cancelar.bin')).count()
      check('B', rowsB === 1, 'a bandeja tem uma linha só para o arquivo', rowsB)
      check('B', tickets.length >= 2, 'cada "Tentar de novo" depois do cancelar pediu um ticket novo', tickets.length)
      await shot(page, 'B-cancelar-tentar-d1440.png')
      await ctx.close()
    }

    // ══════════════════════════════════════════════════════════════════════
    // C. Falha ao criar o item do Acervo
    // ══════════════════════════════════════════════════════════════════════
    if (run('C')) {
      console.log('\n== C. falha ao criar o item ==')
      const fC = await folderOf('C falha do item', audRoot.id)
      const ctx = await newCtx(browser, tok.marcel)
      const page = await open(ctx, `/marketing/acervo?local=${C.pet}&pasta=${fC.id}`, 'marcel')
      const itemsUrl = `${API}/marketing/g/${G}/library/items`
      let failItem = true
      let ticketCalls = 0
      page.on('request', (r) => {
        if (r.method() === 'POST' && r.url().endsWith('/library/uploads')) ticketCalls++
      })
      await page.route((url) => url.href === itemsUrl, async (route) => {
        if (failItem && route.request().method() === 'POST') {
          return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ statusCode: 400, message: 'Pasta não encontrada neste lugar do Acervo.' }) })
        }
        return route.continue()
      })
      const fileC = blob('falha-item', 40)
      await page.setInputFiles('input[name="files"]', [{ name: 'aud-falha-item.bin', mimeType: 'application/octet-stream', buffer: fileC }])
      await openTray(page)
      const errored = await waitFor(async () => (await statusOf(page, 'aud-falha-item.bin')) === 'error', 15000)
      check('C', !!errored, 'item do Acervo recusado: o arquivo fica com erro na bandeja (não "Enviado")', await statusOf(page, 'aud-falha-item.bin'))
      const errText = await page.locator(`${row('aud-falha-item.bin')} .mkt__state`).innerText().catch(() => '')
      check('C', /Pasta não encontrada/.test(errText), 'a frase da recusa aparece na linha', errText)
      const panelRow = await page.locator('[data-panel="uploads"] [data-upload]').first().getAttribute('data-upload').catch(() => null)
      check('C', panelRow === 'error', 'o painel do Acervo (só leitura) concorda com a bandeja: Falhou', panelRow)
      const readyAsset = await q(`SELECT id FROM "MarketingAsset" WHERE "groupId"=$1 AND sha256=$2 AND status='READY'`, [G, sha(fileC)])
      check('C', readyAsset.length === 1 && (await itemsBySha(sha(fileC))).length === 0, 'no banco: o arquivo está guardado (READY) e o item não existe', `${readyAsset.length} asset(s)`)
      await shot(page, 'C-falha-do-item-d1440.png')
      failItem = false
      const before = ticketCalls
      await page.locator(`${row('aud-falha-item.bin')} [data-action="retry"]`).click()
      const okC = await waitFor(async () => (await statusOf(page, 'aud-falha-item.bin')) === 'done', 15000)
      const itemsC = await itemsBySha(sha(fileC))
      check('C', !!okC && itemsC.length === 1, '"Tentar de novo" cria o item e a linha vira Enviado', `${await statusOf(page, 'aud-falha-item.bin')} ${itemsC.length}`)
      check('C', itemsC[0]?.assetId === readyAsset[0]?.id && ticketCalls === before, 'refez só o passo do item: o mesmo arquivo, sem pedir outro envio', `${itemsC[0]?.assetId === readyAsset[0]?.id} tickets+${ticketCalls - before}`)
      const panelDone = await waitFor(async () => (await page.locator('[data-panel="uploads"] [data-upload="done"]').count()) === 1, 4000)
      check('C', !!panelDone, 'o painel do Acervo mostra Enviado depois do "Tentar de novo"')
      await ctx.close()
    }

    // ══════════════════════════════════════════════════════════════════════
    // D. Subpasta no "Tentar de novo"
    // ══════════════════════════════════════════════════════════════════════
    if (run('D')) {
      console.log('\n== D. subpasta no Tentar de novo ==')
      const base = await folderOf('D base', audRoot.id)
      const ctx = await newCtx(browser, tok.marcel)
      const page = await open(ctx, `/marketing/acervo?local=${C.pet}&pasta=${base.id}`, 'marcel')
      // O confirm do primeiro envio é recusado: o "Tentar de novo" pede ticket novo.
      let failConfirm = true
      await page.route((url) => /\/assets\/[^/]+\/confirm$/.test(url.pathname), async (route) => {
        if (failConfirm) {
          failConfirm = false
          return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ statusCode: 400, message: 'O arquivo não chegou inteiro. Envie de novo.' }) })
        }
        return route.continue()
      })
      const fileD = blob('subpasta', 30)
      await dropFolder(page, { name: 'Lote', children: [{ name: 'Sub', children: [{ name: 'aud-sub.bin', type: 'application/octet-stream', b64: fileD.toString('base64') }] }] })
      await openTray(page)
      const errD = await waitFor(async () => (await statusOf(page, 'aud-sub.bin')) === 'error', 15000)
      check('D', !!errD, 'confirm recusado: o arquivo da pasta fica com erro', await statusOf(page, 'aud-sub.bin'))
      await page.locator(`${row('aud-sub.bin')} [data-action="retry"]`).click()
      const okD = await waitFor(async () => (await statusOf(page, 'aud-sub.bin')) === 'done', 15000)
      check('D', !!okD, '"Tentar de novo" sobe o arquivo', await statusOf(page, 'aud-sub.bin'))
      const tree = await q(
        `WITH RECURSIVE t AS (SELECT id, name, "parentId", 0 AS d FROM "MarketingLibraryFolder" WHERE id=$1
           UNION ALL SELECT f.id, f.name, f."parentId", t.d+1 FROM "MarketingLibraryFolder" f JOIN t ON f."parentId"=t.id)
         SELECT id, name, "parentId", d FROM t ORDER BY d, name`,
        [base.id],
      )
      const names = tree.map((f) => `${f.d}:${f.name}`).join(' > ')
      const lote = tree.filter((f) => f.name === 'Lote')
      const sub = tree.filter((f) => f.name === 'Sub')
      check('D', lote.length === 1 && sub.length === 1 && lote[0].parentId === base.id && sub[0].parentId === lote[0].id, 'a árvore fica base / Lote / Sub, sem aninhar de novo dentro da subpasta', names)
      const itemD = await itemsBySha(sha(fileD))
      check('D', itemD.length === 1 && itemD[0].folderId === sub[0]?.id, 'o item cai na subpasta certa', JSON.stringify(itemD))
      await ctx.close()
    }

    // ══════════════════════════════════════════════════════════════════════
    // E. Logout limpa a fila
    // ══════════════════════════════════════════════════════════════════════
    if (run('E')) {
      console.log('\n== E. sair da conta limpa a fila ==')
      const fE = await folderOf('E logout', audRoot.id)
      const ctx = await newCtx(browser, tok.marcel)
      const page = await open(ctx, `/marketing/acervo?local=${C.pet}&pasta=${fE.id}`, 'marcel')
      page.allowBad = true // o 401 do abort depois do logout é esperado se a corrida perder
      const storageHost = new URL(process.env.STORAGE ?? 'http://127.0.0.1:54329').host
      // Os bytes nunca chegam ao storage: o envio fica no ar até alguém cancelar.
      await page.route((url) => url.host === storageHost, async (route) => {
        const m = route.request().method()
        if (m === 'PUT' || m === 'PATCH') return // segura para sempre
        await route.continue().catch(() => {})
      })
      const fileE = blob('logout', 60)
      await page.setInputFiles('input[name="files"]', [{ name: 'aud-logout.bin', mimeType: 'application/octet-stream', buffer: fileE }])
      const pend = await waitFor(async () => ((await pendingByName('aud-logout.bin')).length ? true : null), 15000)
      check('E', !!pend, 'envio no ar: há um envio pendente no servidor', pend)
      const originBefore = await page.evaluate(() => performance.timeOrigin)
      await page.locator('button[aria-label="Abrir menu do usuário"]').first().click()
      await page.getByText('Sair', { exact: true }).first().click()
      const dlg = page.locator('[role="dialog"]:has-text("Sair com envio em andamento?")')
      const asked = await waitFor(async () => (await dlg.count()) > 0, 5000)
      check('E', !!asked, 'Sair com envio pendente pede confirmação', asked)
      const dlgText = asked ? await dlg.innerText() : ''
      check('E', /1 arquivo subindo/.test(dlgText) && !dlgText.includes(String.fromCharCode(0x2014)), 'a confirmação diz quantos arquivos e não usa travessão', dlgText.replace(/\s+/g, ' ').slice(0, 160))
      await shot(page, 'E-sair-com-envio-d1440.png')
      await dlg.getByRole('button', { name: 'Sair e cancelar' }).click()
      await page.waitForURL(/\/login/, { timeout: 10000 }).catch(() => {})
      check('E', /\/login/.test(page.url()), 'depois de confirmar, vai para o login', page.url())
      const gone = await waitFor(async () => ((await pendingByName('aud-logout.bin')).length === 0 ? true : null), 8000)
      check('E', !!gone, 'o envio pendente foi abortado no servidor (com a sessão ainda válida)', gone)
      // Outra conta na MESMA aba, sem recarregar (login pelo formulário e
      // navegação pelo menu): a fila é de módulo e só some pelo reset da sessão.
      await page.locator('input[type="email"]').fill('leticia@nevo.test')
      await page.locator('input[type="password"]').fill('nevo1234')
      await page.locator('button[type="submit"]').click()
      await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 15000 }).catch(() => {})
      await page.locator('a[href="/marketing"]').first().click()
      await page.waitForURL(/\/marketing/, { timeout: 10000 }).catch(() => {})
      await page.locator('a.mk-tab[href*="/marketing/acervo"]').click()
      await page.waitForURL(/acervo/, { timeout: 10000 }).catch(() => {})
      await sleep(1200)
      const originAfter = await page.evaluate(() => performance.timeOrigin)
      check('E', originAfter === originBefore, 'a troca de conta foi sem recarregar a página (o que limpou a fila foi o reset da sessão)', `${originBefore} ${originAfter}`)
      const leftover = await page.locator(`${tray} .mkt__row`).count()
      const panel = await page.locator('[data-panel="uploads"]').count()
      check('E', leftover === 0 && panel === 0, 'a próxima conta da aba começa sem bandeja nem painel de envios', `${leftover} linhas, ${panel} painel`)
      await ctx.close()
    }

    // ══════════════════════════════════════════════════════════════════════
    // F. Zip nativo (link de uso único)
    // ══════════════════════════════════════════════════════════════════════
    if (run('F')) {
      console.log('\n== F. zip pelo navegador ==')
      const fF = await folderOf('F zip', audRoot.id)
      for (let i = 0; i < 3; i++) await uploadLib(tok.marcel, { companyId: C.pet, folderId: fF.id, name: `aud-zip-${i + 1}.bin`, buffer: blob(`zip-${i}`, 30) })
      const ctx = await newCtx(browser, tok.marcel)
      const page = await open(ctx, `/marketing/acervo?local=${C.pet}&pasta=${fF.id}`, 'marcel')
      await page.waitForSelector('.lg-tile', { timeout: 10000 })
      const calls = []
      let ticketBody = null
      page.on('request', (r) => {
        if (r.url().includes('/library/zip')) calls.push(`${r.method()} ${new URL(r.url()).pathname.replace(/\/marketing\/g\/[^/]+/, '')}`)
      })
      page.on('response', async (r) => {
        if (r.url().endsWith('/library/zip/ticket') && r.request().method() === 'POST') ticketBody = await r.json().catch(() => null)
      })
      await page.locator('.lg-tile').first().locator('.lck').click()
      await page.locator('.lib-bulk .lck').first().click()
      const dl = page.waitForEvent('download', { timeout: 20000 })
      await page.click('[data-bulk="zip"]')
      const download = await dl.catch(() => null)
      let names = null
      if (download) {
        const p = path.join(os.tmpdir(), `aud-zip-${RUN}.zip`)
        await download.saveAs(p)
        names = zipNames(fs.readFileSync(p))
      }
      check('F', !!download && names?.length === 3, 'o navegador baixa o zip com os 3 arquivos', `${download?.suggestedFilename()} ${names?.join(', ')}`)
      check('F', calls.some((c) => c === 'POST /library/zip/ticket') && !calls.some((c) => c === 'POST /library/zip'), 'pede o link de uso único; o zip não passa pela memória da aba (sem POST /library/zip)', calls.join(' | '))
      check('F', calls.some((c) => /^GET \/library\/zip\/[A-Za-z0-9_-]{20,}$/.test(c)), 'o download é um GET pelo link (iframe escondido)', calls.join(' | '))
      check('F', (await page.locator('iframe[data-zip-download]').count()) >= 1, 'o iframe escondido do download existe (sem sair da página)')
      const toastF = await waitFor(async () => {
        const t = await toasts(page)
        return /Baixando .*\.zip/.test(t) ? t : null
      }, 5000)
      check('F', !!toastF, 'aviso: "Baixando <nome>.zip" e o andamento nos downloads do navegador', toastF)
      if (ticketBody?.url) {
        const again = await fetch(`${API}${ticketBody.url}`)
        const html = await again.text()
        check('F', again.status === 410 && /nevo-zip/.test(html) && /venceu/.test(html), 'o link é de uso único: a segunda vez dá 410 com a página que avisa a tela', `${again.status} ${html.slice(0, 80)}`)
      } else check('F', false, 'resposta do ticket capturada', JSON.stringify(ticketBody))
      // Link que falha (já usado): a página de erro avisa a tela, que mostra a frase.
      await page.route((url) => url.pathname.endsWith('/library/zip/ticket'), async (route) => {
        const res = await route.fetch()
        const body = await res.json()
        await fetch(`${API}${body.url}`).then((r) => r.arrayBuffer()) // gasta o link antes da tela
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      })
      await page.click('[data-bulk="zip"]')
      const errToast = await waitFor(async () => {
        const t = await toasts(page)
        return /O link do zip venceu/.test(t) ? t : null
      }, 8000)
      check('F', !!errToast, 'link que falha: a tela mostra a frase da API ("O link do zip venceu...") e não sai da página', errToast)
      check('F', page.url().includes('/marketing/acervo'), 'a página continua no Acervo', page.url())
      await ctx.close()
    }

    // ══════════════════════════════════════════════════════════════════════
    // G. Rodapé do convite "Do Nevo"
    // ══════════════════════════════════════════════════════════════════════
    if (run('G')) {
      console.log('\n== G. rodapé do convite ==')
      for (const vp of [
        { name: 'm375', width: 375, height: 812 },
        { name: 'm375-baixo', width: 375, height: 667 },
        { name: 'd1366', width: 1366, height: 768 },
      ]) {
        const ctx = await newCtx(browser, tok.leticia, vp)
        const page = await open(ctx, '/marketing/configuracoes', 'leticia')
        await page.getByRole('button', { name: 'Convidar' }).click()
        const dialog = page.locator('[role=dialog]')
        await dialog.locator('[data-testid="inv-tab-nevo"]').waitFor({ timeout: 8000 })
        await dialog.locator('[data-testid="inv-tab-nevo"]').click()
        await sleep(600)
        const submit = dialog.locator('[data-testid="inv-submit"]')
        const box = await submit.boundingBox()
        const visible = !!box && box.y >= 0 && box.y + box.height <= vp.height && box.x + box.width <= vp.width
        check('G', visible, `${vp.name}: o botão do rodapé fica dentro da tela`, box ? `y=${Math.round(box.y)} h=${Math.round(box.height)} vh=${vp.height}` : 'sem caixa')
        const list = await dialog.locator('.inv__list').first().evaluate((el) => ({ max: getComputedStyle(el).maxHeight, h: el.getBoundingClientRect().height })).catch(() => null)
        check('G', !!list && list.h <= Math.min(300, vp.height * 0.4) + 1, `${vp.name}: a lista de pessoas tem no máximo min(300px, 40% da altura)`, JSON.stringify(list))
        const sw = await page.evaluate(() => document.documentElement.scrollWidth)
        check('G', sw <= vp.width, `${vp.name}: sem rolagem lateral`, sw)
        await shot(page, `G-convite-rodape-${vp.name}.png`)
        await ctx.close()
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // H. Nada passa da largura (1024, 1280, 375)
    // ══════════════════════════════════════════════════════════════════════
    if (run('H')) {
      console.log('\n== H. larguras ==')
      const routes = ['/marketing', '/marketing/aprovacoes', '/marketing/acervo', '/marketing/financeiro', '/marketing/calendario', '/marketing/utm', '/marketing/ativacoes', '/marketing/configuracoes']
      for (const vp of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }, { width: 375, height: 812 }]) {
        const ctx = await newCtx(browser, tok.nicolas, vp)
        const page = await open(ctx, '/marketing', 'nicolas')
        const over = []
        for (const r of routes) {
          await goto(page, r)
          await sleep(300)
          const m = await page.evaluate(() => {
            const main = document.querySelector('main')
            const lay = document.querySelector('.mk-layout')
            const mr = main?.getBoundingClientRect()
            return {
              doc: document.documentElement.scrollWidth,
              win: window.innerWidth,
              mainRight: mr ? Math.round(mr.right) : 0,
              layout: lay ? [lay.clientWidth, lay.scrollWidth] : null,
            }
          })
          const bad = m.doc > m.win || m.mainRight > m.win + 1 || (m.layout && m.layout[1] > m.layout[0] + 1)
          if (bad) over.push(`${r} ${JSON.stringify(m)}`)
          if (r === '/marketing/aprovacoes' || r === '/marketing/acervo' || r === '/marketing') await shot(page, `H-${vp.width}${r.replace(/\//g, '_')}.png`)
        }
        check('H', over.length === 0, `${vp.width}px: nenhuma tela da ala passa da largura (${routes.length} telas)`, over.join(' ; '))
        await ctx.close()
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // I. Extras: outra marca, colar com diálogo, seleção, soltar fora
    // ══════════════════════════════════════════════════════════════════════
    if (run('I')) {
      console.log('\n== I. extras ==')
      const fI = await folderOf('I extras', audRoot.id)
      const itI = []
      for (let i = 0; i < 3; i++) itI.push(await uploadLib(tok.nicolas, { companyId: C.pet, folderId: fI.id, name: `aud-extra-${i + 1}.bin`, buffer: blob(`extra-${i}`, 20) }))
      const ctx = await newCtx(browser, tok.nicolas)
      const page = await open(ctx, `/marketing/acervo?local=${C.pet}&pasta=${fI.id}`, 'nicolas')
      await page.waitForSelector('.lg-tile', { timeout: 10000 })

      // Seleção não zera sozinha: refetch da árvore (tempo real) com 2 selecionados.
      await page.locator('.lg-tile').nth(0).locator('.lck').click()
      await page.locator('.lg-tile').nth(1).locator('.lck').click()
      await uploadLib(tok.marcel, { companyId: C.pet, folderId: audRoot.id, name: 'aud-extra-tempo-real.bin', buffer: blob('tempo-real', 10) })
      await sleep(2500)
      const selAfter = await page.locator('.lib-bulk__count').innerText().catch(() => '')
      check('I', /2 selecionados/.test(selAfter), 'a seleção sobrevive ao tempo real (a árvore recarregou)', selAfter)

      // Colar com o diálogo de etiquetas aberto: não cai na pasta de trás.
      await page.click('[data-bulk="etiquetar"]')
      await page.locator('.dlg').first().waitFor({ timeout: 4000 })
      const beforePaste = (await q(`SELECT count(*)::int n FROM "MarketingLibraryItem" WHERE "folderId"=$1`, [fI.id]))[0].n
      await page.evaluate(() => {
        const dt = new DataTransfer()
        dt.items.add(new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])], 'image.png', { type: 'image/png' }))
        document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
      })
      await sleep(2500)
      const afterPaste = (await q(`SELECT count(*)::int n FROM "MarketingLibraryItem" WHERE "folderId"=$1`, [fI.id]))[0].n
      const trayRows = await page.locator(`${tray} .mkt__row[data-name^="Colado"]`).count()
      check('I', afterPaste === beforePaste && trayRows === 0, 'Ctrl+V com o diálogo de etiquetas aberto não envia para a pasta de trás', `${beforePaste} -> ${afterPaste}, ${trayRows} na bandeja`)
      await page.keyboard.press('Escape')
      await sleep(300)
      // As etiquetas usam os ids guardados ao abrir (a seleção ainda é a mesma).
      await page.click('[data-bulk="etiquetar"]')
      await page.locator('.dlg .lti-input').fill('auditoria')
      await page.keyboard.press('Enter')
      await page.click('[data-action="apply-tags"]')
      const tagged = await waitFor(async () => {
        const r = await q(`SELECT count(*)::int n FROM "MarketingLibraryItem" WHERE "folderId"=$1 AND 'auditoria' = ANY(tags)`, [fI.id])
        return r[0].n === 2 ? 2 : null
      })
      check('I', tagged === 2, 'Etiquetar grava nos 2 escolhidos ao abrir o diálogo', tagged)
      await page.locator('.lib-bulk button:has-text("Limpar seleção")').click().catch(() => {})

      // Arrastar para a pasta de outra marca pergunta (o mesmo aviso do Mover).
      await goto(page, `/marketing/acervo?local=${C.pet}&pasta=${fI.id}`)
      await page.waitForSelector('.lg-tile', { timeout: 10000 })
      // Outra marca DO GRUPO que a árvore mostra (nem a PetJourney nem a Geral).
      const other = await page.evaluate((pet) => [...document.querySelectorAll('.lib__tree [data-location]')].map((e) => e.getAttribute('data-location')).find((k) => k && k !== pet && k !== 'geral'), C.pet)
      const dragId = await page.locator('.lg-tile').first().getAttribute('data-item-id')
      const target = page.locator(`.lib__tree [data-location="${other}"]`)
      if (await target.count()) {
        // Arrasto HTML5 sintético (o mesmo DataTransfer do dragstart ao drop).
        await page.evaluate((loc) => {
          const tile = document.querySelector('.lg-tile')
          const dest = document.querySelector(`.lib__tree [data-location="${loc}"]`)
          const dt = new DataTransfer()
          const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }))
          fire(tile, 'dragstart')
          fire(dest, 'dragenter')
          fire(dest, 'dragover')
          fire(dest, 'drop')
          fire(tile, 'dragend')
        }, other)
        const confirmDlg = page.locator('[role="dialog"]:has-text("Mudar de marca?")')
        const asked = await waitFor(async () => (await confirmDlg.count()) > 0, 4000)
        const txt = asked ? await confirmDlg.innerText() : ''
        check('I', !!asked && /Mudar de marca faz o arquivo aparecer para quem vê a nova marca/.test(txt), 'arrastar para outra marca pede confirmação com o aviso do Mover', txt.replace(/\s+/g, ' ').slice(0, 160))
        await shot(page, 'I-arrastar-outra-marca-d1440.png')
        await confirmDlg.getByRole('button', { name: 'Cancelar' }).click()
        await sleep(600)
        const still = (await q(`SELECT "companyId" FROM "MarketingLibraryItem" WHERE id=$1`, [dragId]))[0]?.companyId
        check('I', still === C.pet, 'Cancelar não move', still)
        // Arrasto de verdade (mouse) para uma PASTA da outra marca, e "Mover para cá".
        const otherFolder = (await api(tok.nicolas, 'POST', '/library/folders', { companyId: other, name: `E2E Aud outra ${RUN}` })).data
        await goto(page, `/marketing/acervo?local=${C.pet}&pasta=${fI.id}&vista=lista`)
        await page.waitForSelector('.lg-row', { timeout: 10000 })
        await page.locator('.lg-row').first().dragTo(page.locator(`.lib__tree [data-folder-id="${otherFolder.id}"]`))
        const asked2 = await waitFor(async () => (await confirmDlg.count()) > 0, 4000)
        check('I', !!asked2, 'arrasto com o mouse para a pasta da outra marca também pergunta')
        if (asked2) {
          await shot(page, 'I-arrastar-mouse-outra-marca-d1440.png')
          await confirmDlg.getByRole('button', { name: 'Mover para cá' }).click()
          const moved = await waitFor(async () => {
            const r = await q(`SELECT "companyId" FROM "MarketingLibraryItem" WHERE "folderId"=$1`, [otherFolder.id])
            return r.length === 1 && r[0].companyId === other ? r : null
          }, 6000)
          check('I', !!moved, 'confirmado, o arquivo vai para a pasta (e a marca) da outra marca', JSON.stringify(moved))
        }
      } else check('I', false, 'a árvore mostra outra marca para o teste de arrastar', other)

      // Soltar arquivo fora de uma área de envio (as abas): o navegador não abre o arquivo.
      const prevented = await page.evaluate(() => {
        const el = document.querySelector('.mk-layout__tabs')
        const dt = new DataTransfer()
        dt.items.add(new File(['x'], 'solto.txt', { type: 'text/plain' }))
        const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })
        const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
        el.dispatchEvent(over)
        el.dispatchEvent(drop)
        return [over.defaultPrevented, drop.defaultPrevented]
      })
      check('I', prevented[0] && prevented[1], 'arquivo solto nas abas da ala: o navegador não abre o arquivo (dragover e drop seguros)', JSON.stringify(prevented))
      await ctx.close()
    }

    // ══════════════════════════════════════════════════════════════════════
    // J. Bandeja não cobre o fim da página (375) nem o painel de detalhes (641-980)
    // ══════════════════════════════════════════════════════════════════════
    if (run('J')) {
      console.log('\n== J. bandeja e o fim da página ==')
      const fJ = await folderOf('J fim da pagina', audRoot.id)
      const bulkTk = tok.nicolas
      for (let i = 0; i < 62; i++) await uploadLib(bulkTk, { companyId: C.pet, folderId: fJ.id, name: `aud-j-${i + 1}.bin`, buffer: blob(`j-${i}`, 2) })
      for (const vp of [{ name: 'm375', width: 375, height: 812 }, { name: 'd900', width: 900, height: 720 }]) {
        const ctx = await newCtx(browser, tok.nicolas, vp)
        const page = await open(ctx, `/marketing/acervo?local=${C.pet}&pasta=${fJ.id}`, 'nicolas')
        await page.waitForSelector('.lg-tile', { timeout: 10000 })
        // Um envio pequeno faz a bandeja aparecer.
        await page.setInputFiles('input[name="files"]', [{ name: `aud-j-bandeja-${vp.name}.bin`, mimeType: 'application/octet-stream', buffer: blob(`j-bandeja-${vp.name}`, 4) }])
        await waitFor(async () => (await statusOf(page, `aud-j-bandeja-${vp.name}.bin`)) === 'done', 15000)
        await sleep(600)
        if (vp.name === 'm375') {
          // Desce até o fim: o "Carregar mais" (e a última fileira) ficam acima da bandeja.
          await page.evaluate(() => {
            const main = document.querySelector('main, .m-main')
            main?.scrollTo(0, main.scrollHeight)
            window.scrollTo(0, document.documentElement.scrollHeight)
          })
          await sleep(500)
          const m = await page.evaluate(() => {
            const trayEl = document.querySelector('[data-testid="upload-tray"]')
            const more = document.querySelector('.lib-more button')
            const tiles = [...document.querySelectorAll('.lg-tile')]
            const last = tiles[tiles.length - 1]
            return {
              trayTop: trayEl ? Math.round(trayEl.getBoundingClientRect().top) : null,
              moreBottom: more ? Math.round(more.getBoundingClientRect().bottom) : null,
              lastBottom: last ? Math.round(last.getBoundingClientRect().bottom) : null,
              space: getComputedStyle(document.documentElement).getPropertyValue('--mkt-tray-space'),
            }
          })
          // A rolagem até o fim já carrega a página seguinte (então o "Carregar mais" pode ter sumido).
          const endBottom = Math.max(m.lastBottom ?? 0, m.moreBottom ?? 0)
          check('J', m.trayTop !== null && m.lastBottom !== null && endBottom <= m.trayTop && parseInt(m.space, 10) > 0, '375: no fim da página, a última fileira (e o "Carregar mais", se houver) fica acima da bandeja: o espaço é reservado', JSON.stringify(m))
          const xBox = await page.locator(`${tray} .mkt__x`).boundingBox().catch(() => null)
          check('J', !!xBox && xBox.width >= 44 && xBox.height >= 44, '375: o X da bandeja tem alvo de 44 px', JSON.stringify(xBox))
          await shot(page, 'J-fim-da-pagina-m375.png')
        } else {
          await page.locator('.lg-tile').first().click()
          await page.waitForSelector('.lib__details', { timeout: 8000 })
          await sleep(400)
          const m = await page.evaluate(() => {
            const trayEl = document.querySelector('[data-testid="upload-tray"]')
            const det = document.querySelector('.lib__details')
            return {
              trayTop: trayEl ? Math.round(trayEl.getBoundingClientRect().top) : null,
              detailsBottom: det ? Math.round(det.getBoundingClientRect().bottom) : null,
              pos: det ? getComputedStyle(det).position : null,
            }
          })
          check('J', m.pos === 'fixed' && m.trayTop !== null && m.detailsBottom <= m.trayTop, '900 px: o painel de detalhes por cima termina acima da bandeja', JSON.stringify(m))
          await shot(page, 'J-detalhes-d900.png')
        }
        await ctx.close()
      }
    }
  } catch (error) {
    console.error(error)
    check('roteiro', false, 'o roteiro rodou até o fim', error.message)
  } finally {
    await browser.close()
    await db.end()
  }
  check('geral', allBad.length === 0, 'nenhuma resposta 401/5xx da API nas telas', allBad.slice(0, 5).join(' | '))
  check('geral', allErrors.length === 0, 'nenhum erro de JavaScript nas telas', allErrors.slice(0, 5).join(' | '))
  console.log(`\n${oks}/${oks + fails} checagens OK, ${fails} falha(s). Capturas em ${OUT}`)
  process.exit(fails ? 1 : 0)
})()
