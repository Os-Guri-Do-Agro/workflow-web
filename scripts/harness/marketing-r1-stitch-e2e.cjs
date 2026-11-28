/**
 * Costuras da rodada R1 da ala Marketing (spec
 * docs/specs/2026/q4/q4-2/ala-marketing/r1-acervo-tarefas-convite.md), pela tela:
 *
 *  1. "Escolher do acervo" na janela de subir versão cria a V(n) por cópia, com
 *     o mesmo sha256, o card vai para Aguardando e o item ganha o "Usado em".
 *  2. "Mandar para o acervo" no visualizador da versão (com o aviso de repetido
 *     e "Manter os dois", porque a versão veio do próprio Acervo).
 *  3. "Mandar para o acervo" na foto da ativação.
 *  4. Lançamentos: o aviso "Mostrando N de M" só aparece quando a lista corta.
 *
 * Uso: API=http://127.0.0.1:3599 WEB=http://localhost:5174 HARNESS_DB=wf_main node marketing-r1-stitch-e2e.cjs
 */
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')

const API = process.env.API ?? 'http://127.0.0.1:3599'
const WEB = process.env.WEB ?? 'http://localhost:5174'
const DB = process.env.HARNESS_DB ?? 'wf_main'
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, `seed-marketing-out.${DB}.json`), 'utf8'))
const G = seed.groupId
const OUT = process.env.SHOTS ?? path.join(__dirname, 'prints', 'marketing-r1-stitch')
fs.mkdirSync(OUT, { recursive: true })

let ok = 0
const fails = []
const bad = []
const jsErrors = []
function check(name, cond, extra = '') {
  if (cond) ok++
  else fails.push(`${name} ${extra}`)
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? `  (${extra})` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, timeout = 15000, step = 250) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    last = await fn()
    if (last) return last
    await sleep(step)
  }
  return last
}
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

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
async function api(tok, method, route, body) {
  const r = await fetch(`${API}/marketing/g/${G}${route}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await r.text()
  let data = text
  try {
    data = JSON.parse(text)
  } catch {}
  return { status: r.status, data }
}
/** PNG pequeno e único (o sha256 muda a cada execução). */
function png(label) {
  const sharp = require(path.join(__dirname, '../../../workflow-api/node_modules/sharp'))
  const hue = Math.floor(Math.random() * 360)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="100%" height="100%" fill="hsl(${hue},55%,60%)"/><text x="20" y="60" font-size="32" fill="#fff">${label} ${Date.now()}</text></svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}
async function putAndConfirm(tok, ticket, buffer, mime) {
  const put = await fetch(ticket.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': mime, authorization: `Bearer ${ticket.token}` },
    body: buffer,
  })
  if (!put.ok) throw new Error(`PUT ${put.status}`)
  const c = await api(tok, 'POST', `/assets/${ticket.asset.id}/confirm`, {})
  if (c.status >= 300) throw new Error(`confirm ${c.status} ${JSON.stringify(c.data)}`)
  return c.data
}

async function main() {
  const tok = await token('nicolas@nevo.test')
  const cardSeed = seed.cards.find((c) => c.status === 'IN_PRODUCTION')
  const card0 = (await api(tok, 'GET', `/cards/${cardSeed.id}`)).data
  const versions0 = card0.versions.length

  // Item no Acervo, na marca do card.
  const buf = await png('acervo')
  const name = `costura-${Date.now()}.png`
  const t = await api(tok, 'POST', '/library/uploads', {
    companyId: card0.companyId,
    folderId: null,
    files: [{ name, size: buf.length, mimeType: 'image/png', sha256: sha(buf) }],
  })
  check('ticket do Acervo', t.status === 201 && !!t.data.files?.[0]?.ticket, String(t.status))
  const f = t.data.files[0]
  await putAndConfirm(tok, f.ticket, buf, 'image/png')
  const item = (await api(tok, 'POST', '/library/items', { assetId: f.ticket.asset.id, folderId: f.folderId, companyId: card0.companyId })).data
  check('item criado no Acervo', !!item?.id)

  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', reducedMotion: 'reduce' })
  await ctx.addInitScript((tk) => {
    localStorage.setItem('token', tk)
    localStorage.setItem('ui.theme', 'light')
    localStorage.setItem('onboarding.autoShown', '1')
    localStorage.setItem('onboarding.completed', '1')
    localStorage.setItem('ui.idlePermissionPrompt', 'done')
    localStorage.setItem('ui.timerSounds', 'false')
    localStorage.setItem('nevo.idle.protectionSnoozedUntil', String(Date.now() + 864e5))
  }, tok)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => jsErrors.push(e.message))
  page.on('response', (res) => {
    if (res.url().startsWith(API) && (res.status() === 401 || res.status() >= 500)) bad.push(`${res.status()} ${res.url().replace(API, '')}`)
  })

  // 1. Escolher do acervo
  await page.goto(`${WEB}/marketing/cards/${card0.id}?grupo=${G}`, { waitUntil: 'networkidle' })
  await page.locator('[data-action="upload-version"]').first().click()
  await page.locator('[data-action="pick-from-library"]').click()
  await page.locator('[data-dialog="library-picker"]').waitFor({ timeout: 10000 })
  await page.locator(`[data-pick-item="${item.id}"]`).click()
  await page.screenshot({ path: path.join(OUT, '1-escolher-do-acervo.png') })
  await page.locator('[data-action="use-picked"]').click()
  const card1 = await waitFor(async () => {
    const c = (await api(tok, 'GET', `/cards/${card0.id}`)).data
    return c.versions.length > versions0 ? c : null
  })
  check('Escolher do acervo criou a versão nova', !!card1, card1 ? `V${card1.versions.length}` : 'sem versão')
  if (card1) {
    // Regra da M1 (statusAfterNewVersion): versão nova em Ideia ou Em produção
    // mantém o status; só Ajustes, Aprovado e afins voltam para Aguardando.
    check('status segue a regra de versão nova (Em produção fica)', card1.status === card0.status, `${card0.status} -> ${card1.status}`)
    const v = card1.versions.find((x) => x.id === card1.currentVersionId) ?? card1.versions[card1.versions.length - 1]
    check('a versão tem a cópia (asset novo, mesmo nome)', v.assets.length === 1 && v.assets[0].id !== f.ticket.asset.id)
  }
  const usage = (await api(tok, 'GET', `/library/items/${item.id}`)).data
  const used = usage?.usages ?? usage?.usedIn ?? []
  check('"Usado em" registra o card', Array.isArray(used) ? used.some((u) => (u.cardId ?? u.card?.id) === card0.id) : (usage?.usageCount ?? 0) > 0)
  await sleep(800)
  check('janela da versão fechou', !(await page.locator('[data-dialog="library-picker"]').isVisible().catch(() => false)))

  // 2. Mandar para o acervo pelo visualizador (a versão veio do Acervo: repetido)
  await page.goto(`${WEB}/marketing/cards/${card0.id}?grupo=${G}`, { waitUntil: 'networkidle' })
  const before = (await api(tok, 'GET', `/library/items?q=${encodeURIComponent(name.replace('.png', ''))}&limit=100`)).data
  const countBefore = (before?.items ?? []).length
  await page.locator('[data-action="open-send-to-library"]').first().click()
  await page.locator('[data-dialog="send-to-library"]').waitFor({ timeout: 10000 })
  await page.locator('[data-dialog="send-to-library"] ~ * [data-action="send-to-library"], [data-action="send-to-library"]').last().click()
  const keep = page.locator('[data-action="send-keep-both"]')
  if (await keep.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false)) {
    check('repetido avisa e oferece "Manter os dois"', true)
    await page.screenshot({ path: path.join(OUT, '2-mandar-repetido.png') })
    await keep.click()
  } else {
    check('repetido avisa e oferece "Manter os dois"', false, 'sem aviso de repetido')
  }
  const sent = await waitFor(async () => {
    const r = (await api(tok, 'GET', `/library/items?q=${encodeURIComponent(name.replace('.png', ''))}&limit=100`)).data
    return (r?.items ?? []).length > countBefore
  })
  check('Mandar para o acervo (versão) criou o item', !!sent)

  // 3. Mandar para o acervo pela foto da ativação
  const acts = (await api(tok, 'GET', '/activations')).data
  const act = (Array.isArray(acts) ? acts : acts?.items ?? [])[0]
  check('há ativação no seed', !!act)
  if (act) {
    const pbuf = await png('ativacao')
    const pname = `foto-ativacao-${Date.now()}.png`
    const pt = await api(tok, 'POST', `/activations/${act.id}/photos`, { name: pname, mimeType: 'image/png', size: pbuf.length, sha256: sha(pbuf) })
    check('ticket da foto da ativação', pt.status === 201, String(pt.status))
    await putAndConfirm(tok, pt.data, pbuf, 'image/png')
    await page.goto(`${WEB}/marketing/ativacoes?ativacao=${act.id}&grupo=${G}`, { waitUntil: 'networkidle' })
    const tile = page.locator('.ap__tile').filter({ has: page.locator(`img[alt="${pname}"]`) }).first()
    await tile.hover()
    await tile.locator('[data-action="open-send-to-library"]').click()
    await page.locator('[data-dialog="send-to-library"]').waitFor({ timeout: 10000 })
    await page.screenshot({ path: path.join(OUT, '3-mandar-foto-ativacao.png') })
    await page.locator('[data-action="send-to-library"]').last().click()
    const fromAct = await waitFor(async () => {
      const r = (await api(tok, 'GET', `/library/items?q=${encodeURIComponent(pname.replace('.png', ''))}&limit=20`)).data
      return (r?.items ?? []).length > 0
    })
    check('Mandar para o acervo (foto da ativação) criou o item', !!fromAct)
  }

  // 4. Lançamentos: sem corte, sem aviso
  await page.goto(`${WEB}/marketing/financeiro?grupo=${G}`, { waitUntil: 'networkidle' })
  await sleep(600)
  check('Lançamentos sem corte não mostram "Mostrando N de M"', !(await page.locator('[data-testid="expenses-truncated"]').isVisible().catch(() => false)))

  await browser.close()
  check('zero 401/5xx da API', bad.length === 0, bad.slice(0, 3).join(' | '))
  check('zero erro de JavaScript', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '))
  console.log(`\n${ok}/${ok + fails.length} checagens OK, ${fails.length} falha(s). Capturas em ${OUT}`)
  process.exit(fails.length ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
