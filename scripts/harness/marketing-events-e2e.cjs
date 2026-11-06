// Roteiro de ponta a ponta da M3-B: Ativações, Parceiros e Orçamentos.
// Uso: node marketing-events-e2e.cjs [saida]
//   env API (padrão http://127.0.0.1:3632), WEB (http://localhost:5186),
//       HARNESS_DB (wf_m3b), HARNESS_SEED (seed-marketing-out.<banco>.json)
// Cobre V1 a V3, P1, P2, Q1, Q2 pela API e pela tela (Edge, 1440 e 375), papel
// por papel (Visualizador não escreve, Editor não escolhe orçamento, freelancer
// não vê outra marca, quem é de fora leva 403), zero 401/5xx e capturas em
// prints/marketing-events/. Reexecutável: apaga o que ele mesmo criou ("E2E ").
//
// R1 (D12): a lista de ativações pagina por cursor. O roteiro põe 560 próximas
// e 60 passadas direto no banco ("E2E pag ..."), percorre as páginas pela API
// (sem repetir nem pular, inclusive com uma inserção no meio) e confere a tela
// com "Carregar mais" e o número de cada aba vindo do servidor.
const { chromium } = require('playwright-core')
const pg = require('pg')
const zlib = require('node:zlib')
const fs = require('node:fs')
const path = require('node:path')

const API = process.env.API ?? 'http://127.0.0.1:3632'
const WEB = process.env.WEB ?? 'http://localhost:5186'
const DB = process.env.HARNESS_DB ?? 'wf_m3b'
const seedPath = process.env.HARNESS_SEED ?? path.join(__dirname, `seed-marketing-out.${DB}.json`)
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
const out = process.argv[2] ?? path.join(__dirname, 'prints', 'marketing-events')
fs.mkdirSync(out, { recursive: true })

const G = seed.groupId
const PET = seed.companies.pet
const EMMI = seed.companies.emmitec
const base = `/marketing/g/${G}`

let fails = 0
const check = (cond, msg, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}${extra ? '  (' + extra + ')' : ''}`)
  if (!cond) fails++
}
const section = (name) => console.log(`\n== ${name}`)

// ── API ─────────────────────────────────────────────────────────────────────

const tokens = {}
async function token(who) {
  if (!tokens[who]) {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `${who}@nevo.test`, password: 'nevo1234' }),
    })
    tokens[who] = (await r.json()).accessToken
    if (!tokens[who]) throw new Error(`login falhou para ${who}`)
  }
  return tokens[who]
}

const apiBad = []
async function call(who, method, route, body) {
  const r = await fetch(`${API}${route}`, {
    method,
    headers: { authorization: `Bearer ${await token(who)}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (r.status >= 500) apiBad.push(`${r.status} ${method} ${route}`)
  let json = null
  try {
    json = await r.json()
  } catch {
    /* sem corpo */
  }
  return { status: r.status, body: json }
}
const get = (who, route) => call(who, 'GET', `${base}${route}`)
const post = (who, route, body) => call(who, 'POST', `${base}${route}`, body ?? {})
const patch = (who, route, body) => call(who, 'PATCH', `${base}${route}`, body)
const del = (who, route) => call(who, 'DELETE', `${base}${route}`)

// PNG de verdade (listras de duas cores) para as fotos aparecerem nas capturas.
function crc32(buf) {
  let c
  let crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function makePng(w, h, a, b) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const c = Math.floor((x + y) / 24) % 2 ? a : b
      const o = y * (w * 3 + 1) + 1 + x * 3
      raw[o] = c[0]
      raw[o + 1] = c[1]
      raw[o + 2] = c[2]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Upload pelo fluxo de ticket: ticket + PUT na URL assinada + confirm.
async function uploadViaTicket(who, ticketRoute, name, mimeType, bytes) {
  const t = await post(who, ticketRoute, { name, mimeType, size: bytes.length })
  if (t.status !== 201 && t.status !== 200) return { ok: false, step: 'ticket', status: t.status, body: t.body }
  const put = await fetch(t.body.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': mimeType, authorization: `Bearer ${t.body.token}` },
    body: bytes,
  })
  if (!put.ok) return { ok: false, step: 'put', status: put.status }
  const c = await post(who, `/assets/${t.body.asset.id}/confirm`, {})
  if (c.status >= 300) return { ok: false, step: 'confirm', status: c.status, body: c.body }
  return { ok: true, asset: c.body, assetId: t.body.asset.id }
}

// ── Banco ───────────────────────────────────────────────────────────────────

const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })

function ymdOffset(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function isoAt(days, hour = 9) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

async function setGroupSettings(settings) {
  await db.query('UPDATE "CompanyGroup" SET settings=$1 WHERE id=$2', [JSON.stringify(settings), G])
}

async function cleanupPrevious() {
  const acts = await get('leticia', '/activations')
  for (const a of acts.body ?? []) if (a.title.startsWith('E2E ')) await del('leticia', `/activations/${a.id}`)
  const partners = await get('leticia', '/partners')
  for (const p of partners.body ?? []) if (p.name.startsWith('E2E ')) await del('leticia', `/partners/${p.id}`)
  const quotes = await get('leticia', '/quotes')
  for (const q of quotes.body ?? []) if ((q.description ?? '').startsWith('E2E ')) await del('leticia', `/quotes/${q.id}`)
  await db.query(`DELETE FROM "MarketingExpense" WHERE "groupId"=$1 AND description LIKE 'E2E %'`, [G])
}

// ── Navegador ───────────────────────────────────────────────────────────────

async function open(browser, who, route, vp, bad) {
  const t = await token(who)
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
    ([tk, c]) => {
      localStorage.setItem('token', tk)
      if (c) localStorage.setItem('activeCompany', c)
      localStorage.setItem('onboarding.autoShown', '1')
      localStorage.setItem('onboarding.completed', '1')
      localStorage.setItem('ui.idlePermissionPrompt', 'done')
    },
    [t, who === 'freela' || who === 'diretoria' ? null : PET],
  )
  const page = await ctx.newPage()
  page.on('response', (res) => {
    const u = res.url()
    if (u.startsWith(API) && (res.status() === 401 || res.status() >= 500)) bad.push(`${res.status()} ${u.replace(API, '')}`)
  })
  page.on('pageerror', (e) => bad.push(`pageerror ${e.message}`))
  page.errs = []
  page.on('console', (m) => m.type() === 'error' && page.errs.push(m.text().slice(0, 300)))
  await page.goto(WEB + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  return { ctx, page }
}

const desk = { width: 1440, height: 900, mobile: false }
const phone = { width: 375, height: 812, mobile: true }

async function noSideScroll(page, label) {
  const m = await page.evaluate(() => {
    const body = document.querySelector('.mk-layout__body')
    return {
      doc: document.documentElement.scrollWidth,
      body: body ? body.scrollWidth - body.clientWidth : 0,
      vw: window.innerWidth,
    }
  })
  check(m.doc <= m.vw + 1 && m.body <= 1, `${label}: sem rolagem lateral`, `doc ${m.doc}/${m.vw}, corpo +${m.body}`)
}

// Alvos de toque do celular: tudo que se clica dentro do trecho deve ter 44px de altura.
async function touchTargets(page, rootSel, label) {
  const small = await page.evaluate((sel) => {
    const root = document.querySelector(sel)
    if (!root) return ['(raiz não achada)']
    const list = []
    for (const el of root.querySelectorAll('button, a[href], select, input:not([type=checkbox]):not([type=file]), textarea, label.ap__check')) {
      const r = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden' || style.opacity === '0') continue
      if (r.height < 43.5) list.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} "${(el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(r.height)}px`)
    }
    return list
  }, rootSel)
  check(small.length === 0, `${label}: alvos de toque com 44px`, small.slice(0, 6).join('; '))
}

// ── R1 (D12): paginação da lista de ativações ──────────────────────────────
async function pagination(browser) {
  section('R1: lista de ativações paginada (acima de 500)')
  const DAY = 86400000
  await db.query(`DELETE FROM "MarketingActivation" WHERE "groupId"=$1 AND title LIKE 'E2E pag %'`, [G])
  // 560 próximas (uma por dia a partir de amanhã) e 60 passadas (uma por dia para trás).
  await db.query(
    `INSERT INTO "MarketingActivation"(id,"groupId","companyId",kind,title,"startAt",status,"updatedAt")
     SELECT 'cpag' || lpad(i::text, 21, '0'), $1, $2, 'EVENT', 'E2E pag próxima ' || lpad(i::text, 3, '0'),
            now() + (i || ' days')::interval, CASE WHEN i % 5 = 0 THEN 'CONFIRMED' ELSE 'PLANNED' END, now()
     FROM generate_series(1, 560) AS i`,
    [G, PET],
  )
  await db.query(
    `INSERT INTO "MarketingActivation"(id,"groupId","companyId",kind,title,"startAt",status,"updatedAt")
     SELECT 'cpas' || lpad(i::text, 21, '0'), $1, $2, 'FAIR', 'E2E pag passada ' || lpad(i::text, 3, '0'),
            now() - ((i + 1) || ' days')::interval, 'DONE', now()
     FROM generate_series(1, 60) AS i`,
    [G, PET],
  )
  try {
    const legacy = await get('marcel', '/activations')
    check(Array.isArray(legacy.body) && legacy.body.length === 500, 'sem página a lista de antes para em 500 (era o corte calado)', String(legacy.body?.length))

    // Próximas: percorre tudo pelo cursor
    const seen = []
    let cursor = null
    let pages = 0
    let counts = null
    let inserted = false
    do {
      const r = await get('marcel', `/activations?quando=proximas&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
      if (r.status !== 200) {
        check(false, 'página de próximas responde 200', `${r.status} ${JSON.stringify(r.body?.message)}`)
        break
      }
      if (pages === 0) {
        counts = r.body.counts
        check(r.body.items.length === 50 && !!r.body.nextCursor, 'primeira página: 50 itens e um cursor')
      }
      seen.push(...r.body.items)
      cursor = r.body.nextCursor
      pages++
      if (pages === 2 && !inserted) {
        // Alguém cria uma ativação que cairia ANTES do cursor: nada repete nem pula.
        await db.query(
          `INSERT INTO "MarketingActivation"(id,"groupId","companyId",kind,title,"startAt",status,"updatedAt")
           VALUES ('cpagmeio000000000000000', $1, $2, 'EVENT', 'E2E pag no meio', now() + interval '2 hours', 'PLANNED', now())`,
          [G, PET],
        )
        inserted = true
      }
    } while (cursor && pages < 40)
    const ids = seen.map((a) => a.id)
    const mine = seen.filter((a) => a.title.startsWith('E2E pag próxima'))
    check(new Set(ids).size === ids.length, 'percorrendo as páginas nenhuma ativação repete', `${ids.length} itens, ${new Set(ids).size} únicos`)
    check(mine.length === 560, 'as 560 próximas aparecem, nenhuma some', String(mine.length))
    check(ids.length === counts.upcoming, 'o total percorrido bate com o número da aba Próximas', `${ids.length} x ${counts.upcoming}`)
    check(pages === Math.ceil(counts.upcoming / 50), `páginas de 50 (${pages})`)
    const sorted = seen.every((a, i) => i === 0 || new Date(seen[i - 1].startAt) <= new Date(a.startAt))
    check(sorted, 'próximas em ordem de início, da mais perto para a mais longe')
    check(counts.past >= 60, 'a contagem das passadas vem junto', String(counts.past))
    check(!ids.includes('cpagmeio000000000000000'), 'a criada no meio da rolagem (antes do cursor) não entra repetindo as já vistas')

    const past = await get('marcel', '/activations?quando=passadas&limit=50')
    const p0 = past.body.items
    check(past.status === 200 && p0.length === 50 && p0.every((a, i) => i === 0 || new Date(p0[i - 1].startAt) >= new Date(a.startAt)), 'passadas da mais recente para trás')
    const p0mine = p0.filter((a) => a.title.startsWith('E2E pag passada'))
    check(p0mine[0]?.title === 'E2E pag passada 001' && p0mine[1]?.title === 'E2E pag passada 002', 'das passadas, a mais recente vem primeiro', p0mine.slice(0, 2).map((a) => a.title).join(', '))
    const p1 = await get('marcel', `/activations?quando=passadas&limit=50&cursor=${encodeURIComponent(past.body.nextCursor)}`)
    check(p1.status === 200 && !p1.body.items.some((a) => p0.some((b) => b.id === a.id)), 'a segunda página das passadas continua sem repetir')

    const conf = await get('marcel', '/activations?quando=proximas&limit=100&status=CONFIRMED')
    check(conf.status === 200 && conf.body.items.every((a) => a.status === 'CONFIRMED') && conf.body.counts.upcoming >= 112, 'filtro de situação vale na página e na contagem', `${conf.body?.items?.length} ${conf.body?.counts?.upcoming}`)
    check((await get('marcel', '/activations?quando=proximas&limit=500')).body.items.length === 100, 'limit acima de 100 vira 100')
    check((await get('marcel', '/activations?quando=proximas&cursor=lixo')).status === 400, 'cursor estragado é 400')
    check((await get('marcel', '/activations?quando=amanha')).status === 400, '"quando" fora da lista é 400')
    const freela = await get('freela', '/activations?quando=proximas&limit=50')
    const petOnly = await get('marcel', `/activations?quando=proximas&limit=1&companyId=${PET}`)
    check(
      freela.status === 200 && freela.body.counts.upcoming === petOnly.body.counts.upcoming && freela.body.items.every((a) => a.companyId === PET),
      'freelancer pagina e conta só a PetJourney',
      `${freela.body?.counts?.upcoming} x ${petOnly.body?.counts?.upcoming}`,
    )
    check((await get('luis', '/activations?quando=proximas')).status === 403, 'quem é de fora leva 403 na página')
    check((await get('marcel', `/activations?quando=proximas&companyId=${encodeURIComponent('outra-marca')}`)).status === 403, 'marca fora do acesso na página: 403')

    // Tela
    const counted = (await get('marcel', '/activations?quando=proximas&limit=1')).body.counts
    for (const vp of [desk, phone]) {
      const badNet = []
      const tag = vp.mobile ? 'm375' : 'd1440'
      const { ctx, page } = await open(browser, 'marcel', '/marketing/ativacoes', vp, badNet)
      await page.locator('.av__row').first().waitFor()
      check(await page.locator('.av__row').count() === 50, `${tag} a aba abre com 50 linhas`)
      const nUp = Number((await page.locator('[data-testid="av-count-upcoming"]').innerText()).replace(/\D/g, ''))
      const nPast = Number((await page.locator('[data-testid="av-count-past"]').innerText()).replace(/\D/g, ''))
      check(nUp === counted.upcoming && nPast === counted.past, `${tag} o número das abas vem do servidor (${nUp} e ${nPast})`, `${counted.upcoming}/${counted.past}`)
      const more = page.locator('[data-testid="av-more"]')
      check(new RegExp(`Mostrando 50 de ${counted.upcoming.toLocaleString('pt-BR').replace('.', '\\.')}`).test(await more.innerText()), `${tag} rodapé diz quantas de quantas`, await more.innerText())
      await more.getByRole('button', { name: 'Carregar mais' }).click()
      await page.waitForFunction(() => document.querySelectorAll('.av__row').length === 100, null, { timeout: 10000 }).catch(() => null)
      check(await page.locator('.av__row').count() === 100, `${tag} "Carregar mais" traz mais 50`)
      if (vp.mobile) {
        const h = await more.getByRole('button', { name: 'Carregar mais' }).evaluate((el) => el.getBoundingClientRect().height)
        check(h >= 43.5, `${tag} "Carregar mais" com alvo de toque de 44px`, `${Math.round(h)}px`)
        const fh = await page.locator('[data-testid="av-filter-status"] button[role=combobox]').evaluate((el) => el.getBoundingClientRect().height)
        check(fh >= 43.5, `${tag} filtro (AppSelect) com 44px`, `${Math.round(fh)}px`)
      }
      await page.screenshot({ path: path.join(out, `ativacoes-paginadas-${tag}.png`), fullPage: !vp.mobile })
      await noSideScroll(page, `${tag} lista paginada`)
      await page.locator('.av__tab', { hasText: 'Passadas' }).click()
      await page.locator('.av__row', { hasText: 'E2E pag passada 001' }).first().waitFor({ timeout: 8000 })
      const pastRows = await page.locator('.av__row').allInnerTexts()
      const i1 = pastRows.findIndex((t) => t.includes('E2E pag passada 001'))
      const i2 = pastRows.findIndex((t) => t.includes('E2E pag passada 002'))
      check(i1 >= 0 && i2 > i1, `${tag} Passadas começa pela mais recente`, `${i1} ${i2}`)
      check(await page.locator('select').count() === 0, `${tag} filtros sem <select> nativo`)
      // Filtro de situação pelo AppSelect
      await page.locator('[data-testid="av-filter-status"] button[role=combobox]').click()
      await page.getByRole('option', { name: 'Realizada', exact: true }).click()
      await page.waitForTimeout(600)
      check(page.url().includes('situacao=DONE'), `${tag} filtro de situação vai para a URL`)
      check(badNet.length === 0, `${tag} lista paginada: nenhuma 401/5xx`, badNet.join(', '))
      await ctx.close()
    }
  } finally {
    await db.query(`DELETE FROM "MarketingActivation" WHERE "groupId"=$1 AND title LIKE 'E2E pag %'`, [G])
  }
}

;(async () => {
  await db.connect()
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    await setGroupSettings({})
    await cleanupPrevious()

    // ════════════════════════════════════════════════════════════════════════
    section('API: acesso por papel e marca')
    const viewerWrite = await post('diretoria', '/activations', {
      companyId: PET, title: 'E2E visualizador', startAt: isoAt(5),
    })
    check(viewerWrite.status === 403, 'Visualizador não cria ativação (403)', String(viewerWrite.status))
    const outsider = await get('luis', '/activations')
    check(outsider.status === 403, 'Quem é de fora da ala leva 403 na lista', String(outsider.status))
    check((await get('luis', '/partners')).status === 403, 'Quem é de fora leva 403 em parceiros')
    check((await get('luis', '/quotes')).status === 403, 'Quem é de fora leva 403 em orçamentos')
    const otherGroup = await call('marcel', 'GET', '/marketing/g/grupo-que-nao-existe/activations')
    check(otherGroup.status === 403, 'Grupo inexistente dá a mesma resposta de "não é seu" (403)', String(otherGroup.status))
    const noAuth = await fetch(`${API}${base}/activations`)
    check(noAuth.status === 401, 'Sem login: 401', String(noAuth.status))

    // ════════════════════════════════════════════════════════════════════════
    section('V1: datas e checklist padrão')
    const bad = await post('marcel', '/activations', {
      companyId: PET, title: 'E2E fim antes', startAt: isoAt(8, 14), endAt: isoAt(8, 9),
    })
    check(bad.status === 400, 'V1: fim antes do início é 400', `${bad.status} ${JSON.stringify(bad.body?.message)}`)
    check(/antes do início/.test(String(bad.body?.message)), 'V1: a mensagem diz o motivo em PT-BR')
    const noTitle = await post('marcel', '/activations', { companyId: PET, startAt: isoAt(8) })
    check(noTitle.status === 400, 'Sem título: 400 do DTO', String(noTitle.status))
    const badKind = await post('marcel', '/activations', { companyId: PET, title: 'E2E tipo', kind: 'FESTA', startAt: isoAt(8) })
    check(badKind.status === 400, 'Tipo fora da lista: 400', String(badKind.status))

    const partner0 = await post('marcel', '/partners', { companyId: PET, name: 'E2E Clínica Vida Felina', kind: 'VET_CLINIC', status: 'NEGOTIATING', city: 'Campo Grande' })
    check(partner0.status === 201 || partner0.status === 200, 'cria parceiro de apoio', String(partner0.status))
    const partnerId = partner0.body.id

    const actA = await post('marcel', '/activations', {
      companyId: PET, kind: 'FAIR', title: 'E2E Feira Pet Show', startAt: isoAt(3, 9), endAt: isoAt(4, 18),
      location: 'Expogrande, Campo Grande', partnerId, status: 'CONFIRMED', notes: 'Estande de 3x3 no pavilhão azul.',
    })
    check(actA.status === 201 || actA.status === 200, 'V1: ativação válida é criada', String(actA.status))
    const A = actA.body.id
    const sameInstant = await post('marcel', '/activations', { companyId: PET, title: 'E2E um instante', startAt: isoAt(9, 10), endAt: isoAt(9, 10) })
    check(sameInstant.status === 201 || sameInstant.status === 200, 'fim igual ao início passa')
    await del('leticia', `/activations/${sameInstant.body.id}`)
    const patchBad = await patch('marcel', `/activations/${A}`, { endAt: isoAt(2, 9) })
    check(patchBad.status === 400, 'V1: PATCH com fim antes do início (já gravado) é 400', String(patchBad.status))
    const patchPartner = await post('marcel', '/partners', { companyId: EMMI, name: 'E2E Parceiro Emmitec' })
    const crossPartner = await patch('marcel', `/activations/${A}`, { partnerId: patchPartner.body.id })
    check(crossPartner.status === 400, 'parceiro de outra marca é 400', String(crossPartner.status))

    const withResults = await patch('marcel', `/activations/${A}`, { results: 'E2E Passaram cerca de 1.200 pessoas. 86 cadastros no tablet e 40 folders entregues.' })
    check(withResults.status === 200 && withResults.body.results.startsWith('E2E Passaram'), 'o campo Como foi é gravado')
    const t1 = await post('marcel', `/activations/${A}/checklist/template`)
    const t2 = await post('marcel', `/activations/${A}/checklist/template`)
    check(t1.body?.created === 7, 'V1: checklist padrão cria 7 itens', JSON.stringify(t1.body?.created))
    check(t2.body?.created === 0 && t2.body?.items?.length === 7, 'V1: segunda aplicação não cria nada (uma vez só)', `${t2.body?.created}/${t2.body?.items?.length}`)
    const [tp, tq] = await Promise.all([post('marcel', `/activations/${A}/checklist/template`), post('marcel', `/activations/${A}/checklist/template`)])
    check(tp.status < 300 && tq.status < 300, 'duas aplicações simultâneas não quebram')
    const dA = await get('marcel', `/activations/${A}`)
    check(dA.body.checklist.length === 7, 'V1: detalhe tem exatamente 7 itens', String(dA.body.checklist.length))
    const item0 = dA.body.checklist[0]
    const tick = await patch('marcel', `/activations/${A}/checklist/${item0.id}`, { done: true })
    check(tick.status === 200 && tick.body.doneAt, 'marcar item guarda quem e quando')
    const extra = await post('marcel', `/activations/${A}/checklist`, { text: 'E2E Combinar o credenciamento' })
    check(extra.status === 201 || extra.status === 200, 'item avulso é criado')
    const list1 = await get('marcel', '/activations')
    const rowA = list1.body.find((x) => x.id === A)
    check(rowA && rowA.checklist.total === 8 && rowA.checklist.done === 1, 'lista traz o progresso do checklist (1 de 8)', JSON.stringify(rowA?.checklist))

    // ════════════════════════════════════════════════════════════════════════
    section('V2: fotos pelo ticket e storage')
    const png1 = makePng(640, 420, [31, 111, 235], [226, 232, 240])
    const png2 = makePng(640, 420, [18, 183, 106], [254, 243, 199])
    const badMime = await post('marcel', `/activations/${A}/photos`, { name: 'nota.pdf', mimeType: 'application/pdf', size: 100 })
    check(badMime.status === 400, 'foto: PDF é recusado (400)', String(badMime.status))
    const viewerPhoto = await post('diretoria', `/activations/${A}/photos`, { name: 'a.png', mimeType: 'image/png', size: png1.length })
    check(viewerPhoto.status === 403, 'Visualizador não sobe foto (403)', String(viewerPhoto.status))
    const up1 = await uploadViaTicket('marcel', `/activations/${A}/photos`, 'e2e-estande.png', 'image/png', png1)
    const up2 = await uploadViaTicket('marcel', `/activations/${A}/photos`, 'e2e-equipe.png', 'image/png', png2)
    check(up1.ok && up2.ok, 'V2: duas fotos sobem (ticket, PUT, confirm)', JSON.stringify([up1.step, up2.step]))
    const dA2 = await get('marcel', `/activations/${A}`)
    check(dA2.body.photos.length === 2, 'V2: as fotos aparecem na ativação', String(dA2.body.photos.length))
    const photoUrl = dA2.body.photos[0].url
    const fetched = await fetch(photoUrl)
    const fetchedBytes = Buffer.from(await fetched.arrayBuffer())
    check(fetched.status === 200 && fetchedBytes.equals(png1), 'V2: a URL assinada devolve exatamente os bytes enviados', `${fetched.status}`)
    const listPhotos = (await get('marcel', '/activations')).body.find((x) => x.id === A)
    check(listPhotos.photoCount === 2, 'lista conta as fotos', String(listPhotos.photoCount))

    // Segunda ativação só para provar a limpeza do storage ao apagar.
    const actB = await post('marcel', '/activations', { companyId: PET, title: 'E2E Palestra na clínica', kind: 'TALK', startAt: isoAt(15, 19) })
    const B = actB.body.id
    const upB = await uploadViaTicket('marcel', `/activations/${B}/photos`, 'e2e-palestra.png', 'image/png', png2)
    const dB = await get('marcel', `/activations/${B}`)
    const urlB = dB.body.photos[0]?.url
    check(upB.ok && !!urlB && (await fetch(urlB)).status === 200, 'foto da outra ativação está no storage')
    // quem tem outra marca / só vê e não cria: freelancer da Pet também apaga o que não criou? (EDITOR só o que criou)
    const freelaDelete = await del('freela', `/activations/${B}`)
    check(freelaDelete.status === 403, 'Editor não apaga ativação que outra pessoa criou (403)', String(freelaDelete.status))
    const delB = await del('marcel', `/activations/${B}`)
    check(delB.status === 200, 'quem criou apaga a própria ativação', String(delB.status))
    const afterDel = await fetch(urlB)
    check(afterDel.status !== 200, 'V2: a foto some do storage ao apagar a ativação', `GET ${afterDel.status}`)
    check((await get('marcel', `/activations/${B}`)).status === 404, 'ativação apagada dá 404')
    const orphanRows = await db.query('SELECT count(*)::int AS n FROM "MarketingAsset" WHERE "activationId"=$1', [B])
    check(orphanRows.rows[0].n === 0, 'nenhuma linha de arquivo sobra no banco', String(orphanRows.rows[0].n))

    // ════════════════════════════════════════════════════════════════════════
    section('V3: custo da ativação e dinheiro escondido')
    const expIds = []
    for (const [desc, cents, status] of [['E2E Aluguel do estande', 120000, 'PAID'], ['E2E Brindes', 50000, 'PLANNED']]) {
      const r = await db.query(
        `INSERT INTO "MarketingExpense"(id,"groupId","companyId",date,description,"amountCents",category,status,"activationId","createdById","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,'Eventos e ativações',$7,$8,$9,now()) RETURNING id`,
        ['e2e' + Math.random().toString(36).slice(2, 12), G, PET, ymdOffset(-1), desc, cents, status, A, seed.users.marcel],
      )
      expIds.push(r.rows[0].id)
    }
    const costEditor = (await get('marcel', '/activations')).body.find((x) => x.id === A)
    check(costEditor.costCents === 170000 && costEditor.paidCents === 120000 && costEditor.plannedCents === 50000, 'V3: custo soma os lançamentos ligados (R$ 1.700,00)', JSON.stringify([costEditor.costCents, costEditor.paidCents, costEditor.plannedCents]))
    const detEditor = (await get('marcel', `/activations/${A}`)).body
    check(detEditor.expenses?.length === 2 && detEditor.costCents === 170000, 'V3: o detalhe traz os lançamentos para quem vê o financeiro')
    const viewerDefault = (await get('diretoria', '/activations')).body.find((x) => x.id === A)
    check(viewerDefault.costCents === 170000, 'Visualizador vê o custo por padrão (viewerSeesFinance = true)')

    // Orçamento de apoio para conferir o valor escondido
    const qHide = await post('marcel', '/quotes', { description: 'E2E Banners 3x1', amountCents: 38000, supplierName: 'Gráfica Expo', activationId: A, validUntil: ymdOffset(20) })
    check(qHide.status === 201 || qHide.status === 200, 'cria orçamento na ativação', String(qHide.status))
    const upQ = await uploadViaTicket('marcel', `/quotes/${qHide.body.id}/files`, 'e2e-orcamento.png', 'image/png', png1)
    check(upQ.ok, 'arquivo do orçamento sobe pelo ticket', JSON.stringify(upQ.step))

    await setGroupSettings({ viewerSeesFinance: false })
    const hiddenList = (await get('diretoria', '/activations')).body.find((x) => x.id === A)
    check(hiddenList.costCents === null && hiddenList.paidCents === null && hiddenList.plannedCents === null, 'V3: sem financeiro o custo vai null na lista', JSON.stringify([hiddenList.costCents]))
    const hiddenDet = (await get('diretoria', `/activations/${A}`)).body
    check(hiddenDet.expenses === null && hiddenDet.costCents === null, 'V3: sem financeiro o detalhe não traz lançamentos nem custo')
    check(hiddenDet.quotes.every((q) => q.amountCents === null), 'V3: sem financeiro os orçamentos do detalhe vão sem valor')
    const hiddenQuotes = (await get('diretoria', '/quotes')).body
    check(hiddenQuotes.length > 0 && hiddenQuotes.every((q) => q.amountCents === null && q.files.length === 0), 'V3: lista de orçamentos sem valor e sem arquivo')
    const stillEditor = (await get('marcel', '/activations')).body.find((x) => x.id === A)
    check(stillEditor.costCents === 170000, 'Editor continua vendo o custo')
    check(JSON.stringify(hiddenDet).includes('120000') === false && JSON.stringify(hiddenQuotes).includes('38000') === false, 'o valor não aparece em lugar nenhum do JSON escondido')
    await setGroupSettings({})

    // ════════════════════════════════════════════════════════════════════════
    section('P1: parceiro, telefone e WhatsApp')
    const badPhone = await post('marcel', '/partners', { companyId: PET, name: 'E2E Telefone ruim', phone: 'abc' })
    check(badPhone.status === 400, 'telefone inválido é 400', String(badPhone.status))
    const badMail = await post('marcel', '/partners', { companyId: PET, name: 'E2E E-mail ruim', email: 'sem-arroba' })
    check(badMail.status === 400, 'e-mail inválido é 400', String(badMail.status))
    const p1 = await post('marcel', '/partners', {
      companyId: PET, name: 'E2E Pet Shop Amigo', kind: 'PET_SHOP', contactName: 'Dona Marta', phone: '(67) 99999-8888',
      email: 'Contato@PetShopAmigo.com.br', instagram: 'https://instagram.com/petshop.amigo/', city: 'Dourados',
      nextStep: 'Enviar proposta de folders', nextStepAt: ymdOffset(-2),
    })
    check(p1.status === 201 || p1.status === 200, 'cria o parceiro', String(p1.status))
    const P = p1.body.id
    check(p1.body.phone === '5567999998888', 'P1: "(67) 99999-8888" vira 5567999998888', p1.body.phone)
    check(p1.body.whatsappUrl === 'https://wa.me/5567999998888', 'P1: a API devolve https://wa.me/5567999998888', p1.body.whatsappUrl)
    check(p1.body.email === 'contato@petshopamigo.com.br' && p1.body.instagram === 'petshop.amigo', 'e-mail minúsculo e Instagram sem link', `${p1.body.email} ${p1.body.instagram}`)
    const dueList = (await get('marcel', '/partners?nextStepDue=1')).body
    check(dueList.some((x) => x.id === P) && !dueList.some((x) => x.id === partnerId), 'filtro de próximo passo vencido acha só o vencido')
    const searched = (await get('marcel', '/partners?q=amigo')).body
    check(searched.length === 1 && searched[0].id === P, 'busca por nome')
    const byStatus = (await get('marcel', '/partners?status=NEGOTIATING')).body
    check(byStatus.some((x) => x.id === partnerId) && !byStatus.some((x) => x.id === P), 'filtro por situação')
    check((await get('marcel', '/partners?status=XYZ')).status === 400, 'situação fora da lista no filtro: 400')

    // ════════════════════════════════════════════════════════════════════════
    section('P2: último contato')
    const c1 = await post('marcel', `/partners/${P}/contacts`, { channel: 'WHATSAPP', note: 'E2E primeira conversa', at: isoAt(-20, 12) })
    const c2 = await post('marcel', `/partners/${P}/contacts`, { channel: 'CALL', note: 'E2E fechamos a feira', at: isoAt(-3, 12) })
    const c1b = await post('marcel', `/partners/${P}/contacts`, { channel: 'EMAIL', note: 'E2E contato antigo lançado depois', at: isoAt(-40, 12) })
    check(c1.status < 300 && c2.status < 300 && c1b.status < 300, 'três contatos registrados')
    let pp = (await get('marcel', `/partners/${P}`)).body
    check(new Date(pp.lastContactAt).getTime() === new Date(c2.body.at).getTime(), 'P2: o último contato é o mais recente (não o último lançado)', pp.lastContactAt)
    const future = await post('marcel', `/partners/${P}/contacts`, { channel: 'CALL', note: 'E2E futuro', at: isoAt(60, 12) })
    check(future.status === 400, 'contato no futuro é 400', String(future.status))
    const freelaDelContact = await del('freela', `/partners/${P}/contacts/${c2.body.id}`)
    check(freelaDelContact.status === 403, 'Editor que não registrou não apaga o contato (403)', String(freelaDelContact.status))
    check((await del('diretoria', `/partners/${P}/contacts/${c2.body.id}`)).status === 403, 'Visualizador não apaga contato (403)')
    const delC2 = await del('marcel', `/partners/${P}/contacts/${c2.body.id}`)
    check(delC2.status === 200, 'o autor apaga o contato')
    pp = (await get('marcel', `/partners/${P}`)).body
    check(new Date(pp.lastContactAt).getTime() === new Date(c1.body.at).getTime(), 'P2: apagar o mais recente volta para o anterior', pp.lastContactAt)
    check((await del('leticia', `/partners/${P}/contacts/${c1.body.id}`)).status === 200, 'Admin apaga contato de outra pessoa')
    check((await del('leticia', `/partners/${P}/contacts/${c1b.body.id}`)).status === 200, 'Admin apaga o terceiro contato')
    pp = (await get('marcel', `/partners/${P}`)).body
    check(pp.lastContactAt === null, 'sem contatos o último contato fica vazio')
    // devolve dois contatos para a tela
    await post('marcel', `/partners/${P}/contacts`, { channel: 'WHATSAPP', note: 'E2E conversa inicial pelo WhatsApp', at: isoAt(-12, 12) })
    await post('marcel', '/quotes', { description: 'E2E Folders do parceiro', amountCents: 64000, partnerId: P, validUntil: ymdOffset(15), notes: 'Entrega em 5 dias úteis' })

    // ════════════════════════════════════════════════════════════════════════
    section('Marcas: freelancer da Pet não vê a Emmitec')
    const actE = await post('marcel', '/activations', { companyId: EMMI, title: 'E2E Feira da Emmitec', startAt: isoAt(6, 9) })
    check(actE.status < 300, 'Editor com todas as marcas cria na Emmitec', String(actE.status))
    const freelaList = (await get('freela', '/activations')).body
    check(Array.isArray(freelaList) && !freelaList.some((x) => x.id === actE.body.id) && freelaList.some((x) => x.id === A), 'freelancer vê a ativação da Pet e não a da Emmitec')
    check((await get('freela', `/activations/${actE.body.id}`)).status === 404, 'ativação de outra marca por id: 404 (igual a "não existe")')
    check((await patch('freela', `/activations/${actE.body.id}`, { title: 'x' })).status === 404, 'PATCH em ativação de outra marca: 404')
    check((await post('freela', '/activations', { companyId: EMMI, title: 'E2E invasão', startAt: isoAt(6) })).status === 403, 'criar na marca de outro: 403')
    check((await get('freela', `/activations?companyId=${EMMI}`)).status === 403, 'filtrar por marca que não é sua: 403')
    const pE = await post('marcel', '/partners', { companyId: EMMI, name: 'E2E Parceiro só da Emmitec' })
    const fp = (await get('freela', '/partners')).body
    check(!fp.some((x) => x.id === pE.body.id), 'freelancer não vê parceiro da Emmitec')
    check((await get('freela', `/partners/${pE.body.id}`)).status === 404, 'parceiro de outra marca por id: 404')
    const pAll = await post('marcel', '/partners', { name: 'E2E Parceiro do grupo todo', kind: 'PRINTER' })
    check(pAll.status < 300 && pAll.body.companyId === null, 'parceiro sem marca é do grupo inteiro')
    check((await get('freela', '/partners')).body.some((x) => x.id === pAll.body.id), 'freelancer vê parceiro do grupo inteiro')
    check((await post('freela', '/quotes', { description: 'E2E invasão', amountCents: 100, supplierName: 'X', activationId: actE.body.id })).status === 400, 'orçamento em ativação de outra marca: 400')
    check((await post('freela', '/partners', { companyId: EMMI, name: 'E2E invasão' })).status === 403, 'cadastrar parceiro em marca de outro: 403')

    // ════════════════════════════════════════════════════════════════════════
    section('Q1: escolher orçamento')
    const actC = await post('marcel', '/activations', { companyId: PET, kind: 'EVENT', title: 'E2E Ação de adoção no shopping', startAt: isoAt(12, 10), partnerId: P })
    const C = actC.body.id
    const qa = await post('marcel', '/quotes', { description: 'E2E Estande padrão', amountCents: 450000, supplierName: 'Montagens Alfa', activationId: C })
    const qb = await post('marcel', '/quotes', { description: 'E2E Estande com iluminação', amountCents: 520000, partnerId: partnerId, activationId: C, validUntil: ymdOffset(10) })
    const qc = await post('marcel', '/quotes', { description: 'E2E Estande econômico', amountCents: 300000, supplierName: 'Beta Eventos', activationId: C })
    check(qa.status < 300 && qb.status < 300 && qc.status < 300, 'três orçamentos para a mesma ativação')
    const both = await post('marcel', '/quotes', { description: 'E2E ambíguo', amountCents: 1, partnerId, supplierName: 'Fulano', activationId: C })
    check(both.status === 400, 'parceiro E fornecedor avulso ao mesmo tempo: 400', String(both.status))
    const neither = await post('marcel', '/quotes', { description: 'E2E sem ninguém', amountCents: 1, activationId: C })
    check(neither.status === 400, 'sem parceiro nem fornecedor: 400', String(neither.status))
    const zero = await post('marcel', '/quotes', { description: 'E2E zero', amountCents: 0, supplierName: 'X', activationId: C })
    check(zero.status === 400, 'valor zero: 400', String(zero.status))
    const crossBrand = await post('marcel', '/quotes', { description: 'E2E marca errada', amountCents: 100, supplierName: 'X', activationId: C, companyId: EMMI })
    check(crossBrand.status === 400, 'marca diferente da ativação: 400', String(crossBrand.status))
    const noBrand = await post('marcel', '/quotes', { description: 'E2E sem marca', amountCents: 100, partnerId: pAll.body.id })
    check(noBrand.status === 400, 'parceiro do grupo inteiro sem marca informada: 400', String(noBrand.status))

    const editorChoose = await post('marcel', `/quotes/${qb.body.id}/choose`, {})
    check(editorChoose.status === 403, 'Q1: Editor tentando escolher leva 403', String(editorChoose.status))
    const viewerChoose = await post('diretoria', `/quotes/${qb.body.id}/choose`, {})
    check(viewerChoose.status === 403, 'Q1: Visualizador tentando escolher leva 403')
    const badCat = await post('leticia', `/quotes/${qb.body.id}/choose`, { createExpense: { date: ymdOffset(0), category: 'Categoria inventada' } })
    check(badCat.status === 400, 'categoria fora da lista do financeiro: 400', String(badCat.status))
    const badDate = await post('leticia', `/quotes/${qb.body.id}/choose`, { createExpense: { date: '31/12/2026', category: 'Eventos e ativações' } })
    check(badDate.status === 400, 'data do lançamento inválida: 400', String(badDate.status))
    const stillReceived = (await get('marcel', `/quotes?activationId=${C}`)).body
    check(stillReceived.every((q) => q.status === 'RECEIVED'), 'tentativas recusadas não mudaram nada')

    const chosen = await post('leticia', `/quotes/${qb.body.id}/choose`, { createExpense: { date: ymdOffset(5), category: 'Eventos e ativações' } })
    check(chosen.status === 200 || chosen.status === 201, 'Q1: Admin escolhe o orçamento', String(chosen.status))
    check(chosen.body.quote?.status === 'CHOSEN' && chosen.body.declinedIds?.length === 2, 'Q1: o escolhido vira CHOSEN e 2 são recusados', JSON.stringify(chosen.body?.declinedIds))
    const after = (await get('marcel', `/quotes?activationId=${C}`)).body
    const byDesc = Object.fromEntries(after.map((q) => [q.description, q.status]))
    check(byDesc['E2E Estande com iluminação'] === 'CHOSEN' && byDesc['E2E Estande padrão'] === 'DECLINED' && byDesc['E2E Estande econômico'] === 'DECLINED', 'Q1: os outros do mesmo card ou ativação ficaram DECLINED', JSON.stringify(byDesc))
    const exp = await db.query(`SELECT * FROM "MarketingExpense" WHERE id=$1`, [chosen.body.expenseId])
    const e = exp.rows[0]
    check(!!e && e.status === 'PLANNED' && e.amountCents === 520000 && e.activationId === C && e.partnerId === partnerId && e.category === 'Eventos e ativações' && e.date === ymdOffset(5), 'Q1: nasceu o lançamento PREVISTO ligado à ativação e ao parceiro', e ? `${e.status} ${e.amountCents} ${e.date}` : 'sem linha')
    const costC = (await get('marcel', '/activations')).body.find((x) => x.id === C)
    check(costC.plannedCents === 520000 && costC.costCents === 520000, 'o lançamento previsto já entra no custo da ativação', String(costC.costCents))
    const again = await post('leticia', `/quotes/${qb.body.id}/choose`, { createExpense: { date: ymdOffset(5), category: 'Eventos e ativações' } })
    check(again.status === 409, 'escolher de novo o escolhido: 409 (não duplica o lançamento)', String(again.status))
    const dupCount = await db.query(`SELECT count(*)::int AS n FROM "MarketingExpense" WHERE "activationId"=$1`, [C])
    check(dupCount.rows[0].n === 1, 'continua um lançamento só', String(dupCount.rows[0].n))

    // orçamento sem createExpense e orçamento isolado (só parceiro) não recusa ninguém
    const solo1 = await post('marcel', '/quotes', { description: 'E2E Folder A', amountCents: 10000, partnerId })
    const solo2 = await post('marcel', '/quotes', { description: 'E2E Folder B', amountCents: 12000, partnerId })
    const soloChoose = await post('leticia', `/quotes/${solo1.body.id}/choose`, {})
    check(soloChoose.body?.declinedIds?.length === 0 && soloChoose.body?.expenseId === null, 'sem createExpense não cria lançamento; sem card/ativação não recusa ninguém')
    check((await get('marcel', `/quotes?partnerId=${partnerId}`)).body.find((q) => q.id === solo2.body.id)?.status === 'RECEIVED', 'o outro orçamento do parceiro segue recebido')

    // arquivos do orçamento
    const qFiles = (await get('marcel', `/quotes?activationId=${A}`)).body.find((q) => q.id === qHide.body.id)
    check(qFiles.files.length === 1 && qFiles.files[0].url, 'arquivo do orçamento aparece com URL assinada')
    const qUrl = qFiles.files[0].url
    check((await fetch(qUrl)).status === 200, 'o arquivo do orçamento está no storage')
    check((await del('diretoria', `/quotes/${qHide.body.id}/files/${qFiles.files[0].id}`)).status === 403, 'Visualizador não apaga arquivo do orçamento')
    check((await del('marcel', `/quotes/${qHide.body.id}/files/${qFiles.files[0].id}`)).status === 200, 'Editor apaga o arquivo do orçamento')
    check((await fetch(qUrl)).status !== 200, 'o arquivo do orçamento some do storage')
    // apagar o orçamento limpa os arquivos
    const upQ2 = await uploadViaTicket('marcel', `/quotes/${solo2.body.id}/files`, 'e2e-proposta.png', 'image/png', png2)
    const q2url = (await get('marcel', `/quotes?partnerId=${partnerId}`)).body.find((q) => q.id === solo2.body.id).files[0]?.url
    check(upQ2.ok && !!q2url && (await fetch(q2url)).status === 200, 'segundo arquivo de orçamento sobe')
    check((await del('leticia', `/quotes/${solo2.body.id}`)).status === 200, 'Admin apaga o orçamento')
    check((await fetch(q2url)).status !== 200, 'apagar o orçamento tira os arquivos do storage')

    // ════════════════════════════════════════════════════════════════════════
    section('Q2: fonte do calendário')
    const monthStart = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` })()
    const monthEnd = (() => { const d = new Date(); const l = new Date(d.getFullYear(), d.getMonth() + 1, 0); return `${l.getFullYear()}-${String(l.getMonth() + 1).padStart(2, '0')}-${String(l.getDate()).padStart(2, '0')}` })()
    const wideFrom = ymdOffset(-1)
    const wideTo = ymdOffset(20)
    const cal = await get('marcel', `/activations/calendar?from=${wideFrom}&to=${wideTo}`)
    check(cal.status === 200 && cal.body.some((x) => x.id === A) && cal.body.some((x) => x.id === C), 'Q2: a API do calendário devolve as ativações do período', `${cal.status} ${cal.body?.length}`)
    const calNarrow = await get('marcel', `/activations/calendar?from=${ymdOffset(30)}&to=${ymdOffset(40)}`)
    check(calNarrow.body.length === 0, 'fora do período não volta nada')
    const calSpan = await get('marcel', `/activations/calendar?from=${ymdOffset(4)}&to=${ymdOffset(4)}`)
    check(calSpan.body.some((x) => x.id === A), 'ativação de vários dias aparece no segundo dia dela (faixa)')
    check((await get('marcel', '/activations/calendar')).status === 400, 'calendário sem from/to: 400')
    check((await get('marcel', '/activations/calendar?from=2026-02-30&to=2026-03-01')).status === 400, 'data que não existe: 400')
    const calFreela = (await get('freela', `/activations/calendar?from=${wideFrom}&to=${wideTo}`)).body
    check(calFreela.some((x) => x.id === A) && !calFreela.some((x) => x.id === actE.body.id), 'o calendário também respeita a marca do freelancer')
    const calBrand = (await get('marcel', `/activations/calendar?from=${wideFrom}&to=${wideTo}&companyId=${EMMI}`)).body
    check(calBrand.length >= 1 && calBrand.every((x) => x.companyId === EMMI), 'filtro de marca no calendário')

    // ════════════════════════════════════════════════════════════════════════
    section('Tela: Ativações (Editor, 1440)')
    {
      const badNet = []
      const { ctx, page } = await open(browser, 'marcel', '/marketing/ativacoes', desk, badNet)
      await page.screenshot({ path: path.join(out, 'ativacoes-lista-d1440.png') })
      check(await page.locator('.av__row', { hasText: 'E2E Feira Pet Show' }).count() === 1, 'a ativação aparece na lista de Próximas')
      check(await page.locator('.av__row', { hasText: 'E2E Palestra na clínica' }).count() === 0, 'a ativação apagada não aparece')
      const tabs = await page.locator('.av__tab').allInnerTexts()
      check(tabs.length === 2 && /Próximas/.test(tabs[0]) && /Passadas/.test(tabs[1]), 'abas Próximas e Passadas', tabs.join(' | '))
      check((await page.locator('.av__table th').allInnerTexts()).some((t) => /Custo/.test(t)), 'Editor vê a coluna de custo')

      await page.locator('.av__row', { hasText: 'E2E Feira Pet Show' }).click()
      await page.waitForSelector('.ap__title')
      await page.waitForTimeout(700)
      check(page.url().includes(`ativacao=${A}`), 'o painel abre pela URL ?ativacao=', page.url())
      check(await page.locator('.ap__check').count() === 8, 'painel: checklist com 8 itens', String(await page.locator('.ap__check').count()))
      await page.waitForFunction(() => [...document.querySelectorAll('.ap__tile img')].length === 2 && [...document.querySelectorAll('.ap__tile img')].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 8000 }).catch(() => {})
      const loaded = await page.evaluate(() => [...document.querySelectorAll('.ap__tile img')].map((i) => i.naturalWidth))
      check(loaded.length === 2 && loaded.every((w) => w > 0), 'painel: as 2 fotos carregam do storage', JSON.stringify(loaded))
      check(/R\$\s?1\.700,00/.test(await page.locator('.ap').innerText()), 'painel: custo R$ 1.700,00 e lançamentos para quem vê o financeiro')
      check((await page.locator('.ap textarea').inputValue()).startsWith('E2E Passaram'), 'painel: "Como foi" já vem preenchido')
      check(await page.locator('.qp__item', { hasText: 'E2E Banners 3x1' }).count() === 1, 'painel: QuotesPanel lista o orçamento da ativação')
      check(await page.locator('.qp__item .mk-btn--success').count() === 0, 'Editor não vê o botão Escolher')
      await page.screenshot({ path: path.join(out, 'ativacao-painel-d1440.png'), fullPage: true })

      // Foto pela tela
      const before = await page.locator('.ap__tile img').count()
      await page.setInputFiles('.ap__input', { name: 'e2e-tela.png', mimeType: 'image/png', buffer: makePng(800, 500, [217, 119, 6], [255, 247, 237]) })
      await page.waitForFunction((n) => document.querySelectorAll('.ap__tile img').length === n + 1, before, { timeout: 15000 }).catch(() => {})
      check(await page.locator('.ap__tile img').count() === before + 1, 'tela: subir uma foto pelo botão (fluxo de ticket) a coloca na grade')
      // Abrir a foto no visualizador
      await page.locator('.ap__tile-open').first().click()
      await page.waitForTimeout(500)
      check(await page.locator('.viewer img').count() > 0, 'tela: a foto abre no FileViewer')
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)

      // Checklist pela tela
      await page.locator('.ap__check').nth(1).click()
      await page.waitForTimeout(700)
      check(/2 de 8/.test(await page.locator('.ap').innerText()), 'tela: marcar um item atualiza o progresso (2 de 8)')

      // Fim antes do início: a tela avisa antes de chamar a API
      await page.getByRole('button', { name: 'Editar dados' }).click()
      await page.fill('#af-ed', ymdOffset(2))
      await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
      await page.waitForTimeout(400)
      check(/antes do início/.test(await page.getByRole('dialog').innerText()), 'tela: fim antes do início mostra o aviso no formulário')
      await page.screenshot({ path: path.join(out, 'ativacao-form-erro-d1440.png') })
      await page.keyboard.press('Escape')

      // Criar pela tela e usar o checklist padrão
      await page.getByRole('button', { name: 'Nova ativação' }).first().click()
      await page.fill('#af-title', 'E2E Palestra pela tela')
      await page.selectOption('#af-kind', 'TALK')
      await page.fill('#af-sd', ymdOffset(14))
      await page.fill('#af-st', '19:30')
      await page.fill('#af-loc', 'Auditório da clínica')
      await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
      await page.waitForSelector('.ap__title:has-text("E2E Palestra pela tela")')
      check(true, 'tela: criar uma ativação abre o painel dela')
      check(await page.locator('.ap__check').count() === 0, 'ativação nova nasce sem checklist')
      await page.getByRole('button', { name: 'Usar o checklist padrão de evento' }).click()
      await page.waitForFunction(() => document.querySelectorAll('.ap__check').length === 7, null, { timeout: 8000 }).catch(() => {})
      check(await page.locator('.ap__check').count() === 7, 'tela: o checklist padrão traz 7 itens')
      check(await page.getByRole('button', { name: 'Usar o checklist padrão de evento' }).count() === 0, 'e o botão some (uma vez só)')
      await page.screenshot({ path: path.join(out, 'ativacao-nova-d1440.png'), fullPage: true })

      // Q2 pela tela: a fonte do calendário no navegador
      const src = await page.evaluate(
        async ([g, from, to]) => {
          const m = await import('/src/features/marketing/activations/activations-calendar-source.ts')
          const items = await m.activationsCalendarSource(g, { from, to }, null)
          return items.map((i) => ({ id: i.id, source: i.source, title: i.title, draggable: i.draggable, to: i.to, allDay: i.allDay, tone: i.tone, kindLabel: i.kindLabel, end: i.end }))
        },
        [G, wideFrom, wideTo],
      )
      const itemA = src.find((i) => i.id === `activation:${A}`)
      check(!!itemA && itemA.source === 'activation' && itemA.draggable === false, 'Q2: activationsCalendarSource devolve a ativação (draggable: false)', itemA ? '' : JSON.stringify(src.map((s) => s.title)))
      check(itemA?.to?.name === 'marketing-activations' && itemA?.to?.query?.ativacao === A, 'Q2: o clique leva para marketing-activations?ativacao=<id>', JSON.stringify(itemA?.to))
      check(itemA?.kindLabel === 'Feira' && !!itemA?.end && itemA?.allDay === false, 'Q2: rótulo do tipo, faixa de vários dias e hora marcada', JSON.stringify([itemA?.kindLabel, itemA?.end, itemA?.allDay]))
      const itemNoHour = src.find((i) => i.title === 'E2E Ação de adoção no shopping')
      check(!!itemNoHour, 'Q2: as outras ativações do período também vêm')
      check(badNet.length === 0, 'Ativações 1440: nenhuma 401/5xx', badNet.join(', '))
      await ctx.close()
    }

    section('Tela: Ativações (Editor, 375)')
    {
      const badNet = []
      const { ctx, page } = await open(browser, 'marcel', '/marketing/ativacoes', phone, badNet)
      await page.screenshot({ path: path.join(out, 'ativacoes-lista-m375.png') })
      await noSideScroll(page, 'lista de ativações')
      await page.locator('.av__tab').first().waitFor()
      await touchTargets(page, '.av__list', 'lista de ativações')
      await page.locator('.av__row', { hasText: 'E2E Feira Pet Show' }).click()
      await page.waitForSelector('.ap__title')
      await page.waitForTimeout(900)
      check(await page.locator('.av__list').isHidden(), 'celular: com o painel aberto a lista sai (um de cada vez)')
      await page.screenshot({ path: path.join(out, 'ativacao-painel-m375.png') })
      await noSideScroll(page, 'painel da ativação')
      await touchTargets(page, '.ap', 'painel da ativação')
      await page.getByRole('button', { name: 'Voltar' }).click()
      await page.waitForTimeout(400)
      check(!page.url().includes('ativacao='), 'celular: Voltar fecha o painel')
      await page.getByRole('button', { name: 'Nova ativação' }).first().click()
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(out, 'ativacao-form-m375.png') })
      const dlg = await page.getByRole('dialog').boundingBox()
      check(!!dlg && dlg.x >= 0 && dlg.x + dlg.width <= 376, 'celular: o formulário cabe na largura', JSON.stringify(dlg))
      await page.keyboard.press('Escape')
      check(badNet.length === 0, 'Ativações 375: nenhuma 401/5xx', badNet.join(', '))
      await ctx.close()
    }

    // ════════════════════════════════════════════════════════════════════════
    section('Tela: painéis completos no celular (viewport alto para ver tudo)')
    {
      const badNet = []
      const tall = { width: 375, height: 2600, mobile: true }
      for (const [route, sel, file] of [
        [`/marketing/ativacoes?ativacao=${A}`, '.ap__title', 'ativacao-painel-completo-m375.png'],
        [`/marketing/parceiros?parceiro=${P}`, '.pp__title', 'parceiro-painel-completo-m375.png'],
      ]) {
        const { ctx, page } = await open(browser, 'marcel', route, tall, badNet)
        await page.waitForSelector(sel)
        await page.waitForTimeout(1200)
        await page.screenshot({ path: path.join(out, file) })
        await noSideScroll(page, file)
        await ctx.close()
      }
      check(badNet.length === 0, 'painéis altos: nenhuma 401/5xx', badNet.join(', '))
    }

    section('Tela: Parceiros (Editor, 1440)')
    {
      const badNet = []
      const { ctx, page } = await open(browser, 'marcel', '/marketing/parceiros', desk, badNet)
      await page.screenshot({ path: path.join(out, 'parceiros-lista-d1440.png') })
      const row = page.locator('.pv__row', { hasText: 'E2E Pet Shop Amigo' })
      check(await row.count() === 1, 'o parceiro aparece na tabela')
      const wa = row.locator('a.pv__wa')
      check((await wa.getAttribute('href')) === 'https://wa.me/5567999998888' && (await wa.getAttribute('target')) === '_blank', 'P1: o botão da tabela abre https://wa.me/5567999998888 em nova aba', await wa.getAttribute('href'))
      check(/rel/.test(await wa.evaluate((a) => a.outerHTML)) && (await wa.getAttribute('rel')).includes('noopener'), 'o link do WhatsApp tem rel=noopener')
      const stepCell = await row.locator('.pv__step small').getAttribute('class')
      check((stepCell ?? '').includes('mk-late'), 'próximo passo vencido aparece em vermelho (mk-late)')
      check(/nunca|há 12 dias/.test(await row.locator('.pv__since').innerText()), 'último contato aparece na tabela', await row.locator('.pv__since').innerText())

      await page.getByRole('button', { name: 'Próximo passo vencido' }).click()
      await page.waitForTimeout(600)
      check(page.url().includes('vencidos=1') && await page.locator('.pv__row').count() >= 1 && await page.locator('.pv__row', { hasText: 'Vida Felina' }).count() === 0, 'filtro "Próximo passo vencido" fica na URL e filtra')
      await page.getByRole('button', { name: 'Próximo passo vencido' }).click()
      await page.waitForTimeout(400)

      await row.click()
      await page.waitForSelector('.pp__title')
      await page.waitForTimeout(600)
      check(page.url().includes(`parceiro=${P}`), 'o painel abre pela URL ?parceiro=', page.url())
      const panelWa = page.locator('.pp a[data-test=whatsapp]')
      check((await panelWa.getAttribute('href')) === 'https://wa.me/5567999998888' && (await panelWa.getAttribute('target')) === '_blank', 'P1: o botão WhatsApp do painel abre https://wa.me/5567999998888')
      check(/\+55 \(67\) 99999-8888/.test(await page.locator('.pp').innerText()), 'telefone mostrado formatado')
      check(await page.locator('.pp a[href="https://instagram.com/petshop.amigo"]').count() === 1, 'link do Instagram')
      check(await page.locator('.pp a[href="mailto:contato@petshopamigo.com.br"]').count() === 1, 'link do e-mail')
      check(await page.locator('.pp__contact').count() === 1, 'histórico mostra o contato lançado')
      check((await page.locator('.pp__step input:not([type=date])').inputValue()) === 'E2E Enviar proposta de folders'.replace('E2E ', ''), 'painel: o próximo passo vem preenchido')
      check(await page.locator('.pp__act', { hasText: 'E2E Ação de adoção no shopping' }).count() === 1, 'ativações ligadas aparecem no painel do parceiro')

      // P2 pela tela
      const lastFact = () => page.locator('.pp__fact', { hasText: 'Último contato' }).innerText()
      check(/há 12 dias/.test(await lastFact()), 'último contato mostra "há 12 dias"', (await lastFact()).replace(/\n/g, ' '))
      await page.getByRole('button', { name: 'Registrar contato' }).click()
      await page.fill('#pp-c-note', 'E2E ligamos para fechar o espaço')
      await page.selectOption('#pp-c-channel', 'CALL')
      await page.getByRole('dialog').getByRole('button', { name: 'Registrar' }).click()
      await page.waitForFunction(() => document.querySelectorAll('.pp__contact').length === 2, null, { timeout: 8000 }).catch(() => {})
      check(await page.locator('.pp__contact').count() === 2, 'P2: registrar contato pela tela entra no histórico')
      check(/hoje/.test(await lastFact()), 'P2: o último contato passou para "hoje"', (await lastFact()).replace(/\n/g, ' '))
      await page.screenshot({ path: path.join(out, 'parceiro-painel-d1440.png'), fullPage: true })
      await page.locator('.pp__contact', { hasText: 'ligamos para fechar' }).getByRole('button', { name: 'Apagar este contato' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Apagar' }).click()
      await page.waitForFunction(() => document.querySelectorAll('.pp__contact').length === 1, null, { timeout: 8000 }).catch(() => {})
      check(/há 12 dias/.test(await lastFact()), 'P2: apagar o mais recente pela tela volta para "há 12 dias"', (await lastFact()).replace(/\n/g, ' '))

      // Próximo passo pela tela
      await page.fill('.pp__step input:not([type=date])', 'E2E Visitar a loja na sexta')
      await page.fill('.pp__step input[type=date]', ymdOffset(2))
      await page.getByRole('button', { name: 'Salvar próximo passo' }).click()
      await page.waitForTimeout(700)
      check(await page.locator('.pp__flag').count() === 0, 'próximo passo no futuro tira o aviso de vencido')

      // Orçamentos do parceiro
      check(await page.locator('.qp__item').count() === 1, 'painel do parceiro: QuotesPanel lista o orçamento dele', String(await page.locator('.qp__item').count()))
      check(await page.locator('.qp__item .mk-btn--success').count() === 0, 'Editor não vê Escolher no painel do parceiro')

      // Novo orçamento pela tela (fornecedor fixo = o parceiro)
      await page.locator('.qp').getByRole('button', { name: 'Novo orçamento' }).click()
      await page.fill('#qp-desc', 'E2E Cartões de visita')
      await page.fill('#qp-amount', '1.234,56')
      await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
      await page.waitForSelector('.qp__item:has-text("E2E Cartões de visita")')
      check(/R\$\s?1\.234,56/.test(await page.locator('.qp__item', { hasText: 'E2E Cartões de visita' }).innerText()), 'tela: orçamento novo mostra R$ 1.234,56')
      await page.screenshot({ path: path.join(out, 'parceiro-orcamentos-d1440.png'), fullPage: true })

      // Cadastro pela tela
      await page.getByRole('button', { name: 'Voltar' }).isVisible().catch(() => false)
      await page.goto(`${WEB}/marketing/parceiros`, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'Novo parceiro' }).first().click()
      await page.fill('#pf-name', 'E2E Parceiro pela tela')
      await page.fill('#pf-phone', '67 99888-7766')
      await page.fill('#pf-ig', '@parceiro.tela')
      await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
      await page.waitForSelector('.pp__title:has-text("E2E Parceiro pela tela")')
      check((await page.locator('.pp a[data-test=whatsapp]').getAttribute('href')) === 'https://wa.me/5567998887766', 'P1 (tela): telefone "67 99888-7766" vira https://wa.me/5567998887766')
      await page.getByRole('button', { name: 'Editar dados' }).click()
      await page.fill('#pf-phone', '123')
      await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
      await page.waitForTimeout(500)
      check(/Telefone inválido/.test(await page.getByRole('dialog').innerText()), 'tela: telefone inválido mostra a mensagem da API no formulário')
      await page.keyboard.press('Escape')
      check(badNet.length === 0, 'Parceiros 1440: nenhuma 401/5xx', badNet.join(', '))
      await ctx.close()
    }

    section('Tela: Parceiros (Editor, 375)')
    {
      const badNet = []
      const { ctx, page } = await open(browser, 'marcel', '/marketing/parceiros', phone, badNet)
      await page.screenshot({ path: path.join(out, 'parceiros-lista-m375.png') })
      await noSideScroll(page, 'lista de parceiros')
      await touchTargets(page, '.pv__list', 'lista de parceiros')
      await page.locator('.pv__row', { hasText: 'E2E Pet Shop Amigo' }).click()
      await page.waitForSelector('.pp__title')
      await page.waitForTimeout(900)
      await page.screenshot({ path: path.join(out, 'parceiro-painel-m375.png') })
      await noSideScroll(page, 'painel do parceiro')
      await touchTargets(page, '.pp', 'painel do parceiro')
      check(badNet.length === 0, 'Parceiros 375: nenhuma 401/5xx', badNet.join(', '))
      await ctx.close()
    }

    // ════════════════════════════════════════════════════════════════════════
    section('Tela: Admin escolhe o orçamento (Q1 pela tela)')
    {
      const badNet = []
      const actD = await post('marcel', '/activations', { companyId: PET, title: 'E2E Ação com orçamentos', startAt: isoAt(18, 10) })
      const D = actD.body.id
      await post('marcel', '/quotes', { description: 'E2E Opção barata', amountCents: 80000, supplierName: 'Fornecedor 1', activationId: D })
      await post('marcel', '/quotes', { description: 'E2E Opção completa', amountCents: 150000, supplierName: 'Fornecedor 2', activationId: D, validUntil: ymdOffset(-1) })
      const { ctx, page } = await open(browser, 'leticia', `/marketing/ativacoes?ativacao=${D}`, desk, badNet)
      await page.waitForSelector('.qp__item')
      check(await page.locator('.qp__item').count() === 2, 'Admin vê os 2 orçamentos')
      check(await page.locator('.qp__item .mk-late').count() === 1, 'validade vencida aparece em vermelho')
      await page.screenshot({ path: path.join(out, 'orcamentos-admin-d1440.png'), fullPage: true })
      await page.locator('.qp__item', { hasText: 'E2E Opção completa' }).getByRole('button', { name: 'Escolher' }).click()
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(out, 'orcamento-escolher-d1440.png') })
      const dialog = page.getByRole('dialog')
      check(/Lançar no financeiro como previsto/.test(await dialog.innerText()), 'a janela oferece lançar no financeiro')
      await dialog.getByRole('button', { name: 'Escolher' }).click()
      await page.waitForFunction(() => document.querySelectorAll('.qp__item.is-chosen').length === 1, null, { timeout: 8000 }).catch(() => {})
      check(await page.locator('.qp__item.is-chosen', { hasText: 'E2E Opção completa' }).count() === 1, 'Q1 (tela): o escolhido fica marcado')
      check(await page.locator('.qp__item.is-declined', { hasText: 'E2E Opção barata' }).count() === 1, 'Q1 (tela): o outro fica recusado')
      await page.waitForTimeout(700)
      check(/R\$\s?1\.500,00/.test(await page.locator('.ap').innerText()) && await page.locator('.ap__exp').count() === 1, 'Q1 (tela): o lançamento previsto entra no custo da ativação', await page.locator('.ap__exp').count().toString())
      await page.screenshot({ path: path.join(out, 'orcamento-escolhido-d1440.png'), fullPage: true })
      check(badNet.length === 0, 'Admin: nenhuma 401/5xx', badNet.join(', '))
      await ctx.close()
    }

    // ════════════════════════════════════════════════════════════════════════
    section('Tela: dinheiro escondido (Visualizador sem financeiro) e somente leitura')
    {
      await setGroupSettings({ viewerSeesFinance: false })
      const badNet = []
      const { ctx, page } = await open(browser, 'diretoria', `/marketing/ativacoes?ativacao=${A}`, desk, badNet)
      await page.waitForSelector('.ap__title', { timeout: 8000 }).catch(async () => {
        await page.screenshot({ path: path.join(out, 'debug-sem-financeiro.png') })
        console.log('   debug:', page.url(), JSON.stringify(page.errs), (await page.locator('body').innerText()).slice(0, 300).split(String.fromCharCode(10)).join(' | '))
      })
      await page.waitForTimeout(800)
      const text = await page.locator('body').innerText()
      check(!(await page.locator('.av__table th').allInnerTexts()).some((t) => /Custo/.test(t)), 'V3 (tela): a coluna de custo não existe')
      check(await page.locator('.ap__exp').count() === 0 && !/Custo/.test(await page.locator('.ap').innerText()), 'V3 (tela): o painel não tem a seção de custo')
      check(!/R\$/.test(text), 'V3 (tela): nenhum valor em reais em lugar nenhum da página', (text.match(/R\$\s?[\d.,]+/) ?? [''])[0])
      check(await page.locator('.qp__item').count() >= 1, 'V3 (tela): os orçamentos continuam listados, sem valor')
      check(await page.getByRole('button', { name: 'Novo orçamento' }).count() === 0 && await page.getByRole('button', { name: 'Nova ativação' }).count() === 0, 'Visualizador não vê botões de criar')
      check(await page.getByRole('button', { name: 'Editar dados' }).count() === 0 && await page.getByRole('button', { name: 'Apagar ativação' }).count() === 0, 'Visualizador não vê editar nem apagar')
      check(await page.locator('.ap__check input:enabled').count() === 0, 'Visualizador não marca checklist (campos desabilitados)')
      check(await page.locator('.ap__input').count() === 1 && await page.getByRole('button', { name: 'Adicionar fotos' }).count() === 0, 'Visualizador não vê o botão de fotos')
      await page.screenshot({ path: path.join(out, 'ativacao-sem-financeiro-d1440.png'), fullPage: true })
      await page.goto(`${WEB}/marketing/parceiros?parceiro=${P}`, { waitUntil: 'networkidle' })
      await page.waitForSelector('.pp__title')
      await page.waitForTimeout(700)
      check(!/R\$/.test(await page.locator('body').innerText()), 'V3 (tela): parceiro também sem nenhum valor em reais')
      check(await page.getByRole('button', { name: 'Registrar contato' }).count() === 0 && await page.getByRole('button', { name: 'Editar dados' }).count() === 0, 'Visualizador não registra contato nem edita parceiro')
      check(await page.locator('.pp a[data-test=whatsapp]').count() === 1, 'mas o botão do WhatsApp continua para quem só lê')
      await page.screenshot({ path: path.join(out, 'parceiro-visualizador-d1440.png'), fullPage: true })
      check(badNet.length === 0, 'Visualizador: nenhuma 401/5xx', badNet.join(', '))
      await ctx.close()
      await setGroupSettings({})
    }

    section('Tela: freelancer só da Pet')
    {
      const badNet = []
      const { ctx, page } = await open(browser, 'freela', '/marketing/ativacoes', desk, badNet)
      check(await page.locator('.av__row', { hasText: 'E2E Feira Pet Show' }).count() === 1, 'freelancer vê a ativação da Pet')
      check(await page.locator('.av__row', { hasText: 'E2E Feira da Emmitec' }).count() === 0, 'freelancer não vê a ativação da Emmitec')
      await page.goto(`${WEB}/marketing/ativacoes?ativacao=${actE.body.id}`, { waitUntil: 'networkidle' })
      // Espera o aviso aparecer em vez de um tempo fixo (na rodada com tudo junto, 700 ms não bastou).
      const avisoNaTela = await page
        .getByText('Não foi possível abrir esta ativação')
        .first()
        .waitFor({ timeout: 5000 })
        .then(() => true)
        .catch(() => false)
      check(avisoNaTela, 'abrir por link a ativação de outra marca mostra o aviso (404 da API)')
      await page.screenshot({ path: path.join(out, 'ativacao-outra-marca-d1440.png') })
      await ctx.close()
      // o 404 é esperado aqui; só 401/5xx contam
      check(badNet.length === 0, 'freelancer: nenhuma 401/5xx', badNet.join(', '))
    }

    await pagination(browser)

    check(apiBad.length === 0, 'chamadas diretas à API: nenhuma 5xx', apiBad.join(', '))
  } catch (error) {
    console.error(error)
    fails++
  } finally {
    try {
      await setGroupSettings({})
      await cleanupPrevious()
    } catch (e) {
      console.error('limpeza final falhou', e.message)
    }
    await browser.close()
    await db.end()
  }
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK')
  process.exit(fails ? 1 : 0)
})()
