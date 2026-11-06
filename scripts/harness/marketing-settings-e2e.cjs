// Configurações da ala Marketing de ponta a ponta: regras do Dono (cargo maior)
// e do Admin pela API e a tela Configurações (1440 e 375).
// Uso: node marketing-settings-e2e.cjs   (env API, WEB, HARNESS_SEED, HARNESS_DB, SHOTS)
// Deixa o banco como estava: desfaz o que cria (empresa ligada, convidado, chaves).
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const path = require('node:path')
const { Client } = require('pg')

const API = process.env.API ?? 'http://127.0.0.1:3599'
const WEB = process.env.WEB ?? 'http://localhost:5174'
const DB = process.env.HARNESS_DB ?? 'wf'
const seed = JSON.parse(fs.readFileSync(process.env.HARNESS_SEED ?? path.join(__dirname, 'seed-marketing-out.json'), 'utf8'))
const SHOTS = process.env.SHOTS ?? path.join(__dirname, 'prints', 'marketing-settings')
const ONLY = process.env.ONLY // api | ui
fs.mkdirSync(SHOTS, { recursive: true })
const G = seed.groupId
const C = seed.companies

let fails = 0
const check = (cond, msg, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}${extra ? '  (' + extra + ')' : ''}`)
  if (!cond) fails++
}
const tokens = {}
async function token(key) {
  if (tokens[key]) return tokens[key]
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${key}@nevo.test`, password: 'nevo1234' }),
  })
  const j = await r.json()
  if (!j.accessToken) throw new Error(`login ${key}: ${r.status} ${JSON.stringify(j).slice(0, 120)}`)
  return (tokens[key] = j.accessToken)
}
async function call(key, method, route, body) {
  const r = await fetch(`${API}${route}`, {
    method,
    headers: { authorization: `Bearer ${await token(key)}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try { data = await r.json() } catch {}
  return { status: r.status, data }
}
const g = (s = '') => `/marketing/g/${G}${s}`

async function apiPart() {
  // Configurações: Admin mexe em lista, não em chave severa
  let r = await call('leticia', 'PATCH', g('/settings'), { settings: { viewerSeesFinance: false } })
  check(r.status === 403, 'Admin não muda chave severa (viewerSeesFinance)', `status ${r.status}`)
  r = await call('leticia', 'PATCH', g('/settings'), { settings: { utmSources: ['instagram', 'tiktok', 'feira'] } })
  check(r.status === 200 && r.data.utmSources.includes('feira'), 'Admin muda lista de trabalho', `status ${r.status}`)
  r = await call('nicolas', 'PATCH', g('/settings'), { settings: { viewerSeesFinance: false } })
  check(r.status === 200 && r.data.viewerSeesFinance === false, 'Dono desliga o financeiro do Visualizador')
  r = await call('diretoria', 'GET', '/marketing/me')
  check(r.data.groups[0].permissions.seeFinance === false, 'Visualizador perde o financeiro na hora')
  await call('nicolas', 'PATCH', g('/settings'), {
    settings: { viewerSeesFinance: true, utmSources: seed.defaults?.utmSources ?? ['instagram', 'tiktok', 'facebook', 'google', 'youtube', 'whatsapp', 'email', 'site', 'parceiro', 'qrcode'] },
  })

  // Empresas: só o Dono, e só empresa que ele administra
  r = await call('leticia', 'POST', g('/companies'), { companyId: C.sentia })
  check(r.status === 403, 'Admin não liga empresa (só o Dono)', `status ${r.status}`)
  r = await call('nicolas', 'GET', g('/companies/available'))
  check(r.status === 200 && r.data.some((c) => c.id === C.sentia) && !r.data.some((c) => c.id === C.pet), 'disponíveis: Sentia sim, PetJourney (já no grupo) não', JSON.stringify(r.data?.map((c) => c.name)))
  r = await call('nicolas', 'POST', g('/companies'), { companyId: C.sentia, color: 'pink' })
  check(r.status === 201, 'Dono liga a Sentia', `status ${r.status}`)
  r = await call('nicolas', 'POST', g('/companies'), { companyId: C.sentia })
  check(r.status === 409, 'ligar de novo dá 409', `status ${r.status}`)
  r = await call('nicolas', 'GET', '/marketing/me')
  check(r.data.groups[0].brands.some((b) => b.companyId === C.sentia), 'a Sentia vira marca na hora')
  r = await call('nicolas', 'PATCH', g(`/companies/${C.sentia}`), { marketingEnabled: false })
  check(r.status === 200, 'Dono desliga a marca')
  r = await call('marcel', 'GET', '/marketing/me')
  check(!r.data.groups[0].brands.some((b) => b.companyId === C.sentia), 'marca desligada some para a equipe')
  r = await call('nicolas', 'DELETE', g(`/companies/${C.sentia}`))
  check(r.status === 200, 'Dono tira a Sentia do grupo', `status ${r.status}`)

  // Criar grupo
  r = await call('luis', 'POST', '/marketing/groups', { name: 'Grupo do Luis', companyIds: [C.emmitec] })
  check(r.status === 403, 'WORKER não cria grupo com empresa que não administra', `status ${r.status}`)
  r = await call('nicolas', 'POST', '/marketing/groups', { name: 'Outro', companyIds: [C.pet] })
  check(r.status === 409, 'empresa já em grupo não entra em outro', `status ${r.status}`)

  // Equipe
  r = await call('leticia', 'POST', g('/members'), { email: 'freela2@nevo.test', name: 'Bruno Freela', role: 'ADMIN' })
  check(r.status === 403, 'Admin não dá papel Admin', `status ${r.status}`)
  r = await call('leticia', 'POST', g('/members'), { email: 'freela2@nevo.test', name: 'Bruno Freela', role: 'EDITOR', brandIds: [C.sentia] })
  check(r.status === 400, 'marca fora do grupo dá 400', `status ${r.status}`)
  r = await call('leticia', 'POST', g('/members'), { email: 'freela2@nevo.test', name: 'Bruno Freela', role: 'EDITOR', brandIds: [C.pet], title: 'Freelancer' })
  check(r.status === 201 && r.data.created === true && /redefinir-senha/.test(r.data.accessLink?.link ?? ''), 'Admin convida freelancer novo e recebe o link', `status ${r.status} link=${!!r.data?.accessLink}`)
  const freela2 = r.data?.member?.userId
  r = await call('leticia', 'POST', g('/members'), { email: 'FREELA2@nevo.test', role: 'EDITOR' })
  check(r.status === 409, 'mesmo e-mail (outra caixa) dá 409', `status ${r.status}`)
  r = await call('leticia', 'POST', g(`/members/${seed.users.marcel}/access-link`))
  check(r.status === 400, 'link pela ala não vale para quem tem empresa', `status ${r.status}`)
  r = await call('leticia', 'POST', g(`/members/${seed.users.freela}/access-link`))
  check(r.status === 201 && !!r.data.link, 'Admin gera link do freelancer sem empresa', `status ${r.status}`)
  r = await call('leticia', 'PATCH', g(`/members/${seed.users.nicolas}`), { title: 'x' })
  check(r.status === 403, 'Admin não mexe no Dono', `status ${r.status}`)
  r = await call('nicolas', 'PATCH', g(`/members/${seed.users.nicolas}`), { role: 'ADMIN' })
  check(r.status === 400, 'último Dono não se rebaixa', `status ${r.status}`)
  r = await call('marcel', 'PATCH', g(`/members/${freela2}`), { role: 'VIEWER' })
  check(r.status === 403, 'Editor não muda equipe', `status ${r.status}`)
  r = await call('leticia', 'DELETE', g(`/members/${freela2}`))
  check(r.status === 200, 'Admin tira o convidado', `status ${r.status}`)

  // Auditoria de 06/11: Admin restrito a uma marca não concede as outras
  {
    const db = new Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
    await db.connect()
    await db.query('UPDATE "CompanyGroupMember" SET role=$1, "brandIds"=$2 WHERE "groupId"=$3 AND "userId"=$4', ['ADMIN', [C.pet], G, seed.users.marcel])
    r = await call('marcel', 'POST', g('/members'), { email: 'restrito1@nevo.test', name: 'Teste Restrito', role: 'EDITOR', brandIds: [] })
    check(r.status === 403, 'Admin só da Pet não concede "todas as marcas"', `status ${r.status}`)
    r = await call('marcel', 'POST', g('/members'), { email: 'restrito1@nevo.test', name: 'Teste Restrito', role: 'EDITOR', brandIds: [C.emmitec] })
    check(r.status === 403, 'Admin só da Pet não concede a Emmitec', `status ${r.status}`)
    r = await call('marcel', 'PATCH', g(`/members/${seed.users.diretoria}`), { title: 'x' })
    check(r.status === 403, 'Admin só da Pet não mexe em quem vê todas as marcas', `status ${r.status}`)
    r = await call('marcel', 'POST', g('/members'), { email: 'restrito1@nevo.test', name: 'Teste Restrito', role: 'EDITOR', brandIds: [C.pet] })
    check(r.status === 201, 'Admin só da Pet concede a Pet', `status ${r.status}`)
    await db.query('UPDATE "CompanyGroupMember" SET role=$1, "brandIds"=$2 WHERE "groupId"=$3 AND "userId"=$4', ['EDITOR', [], G, seed.users.marcel])
    await db.query('DELETE FROM "User" WHERE email=$1', ['restrito1@nevo.test'])

    // Conta que JÁ EXISTIA (sem empresa e sem grupo) não sai com link de senha
    const orfaId = 'c' + Date.now().toString(36) + 'orfa000000000'.slice(0, 12)
    await db.query('DELETE FROM "User" WHERE email=$1', ['orfa@nevo.test'])
    await db.query(`INSERT INTO "User"(id,name,email,password,"createdAt","updatedAt") VALUES ($1,'Conta Antiga','orfa@nevo.test','x', now() - interval '30 days', now())`, [orfaId])
    r = await call('leticia', 'POST', g('/members'), { email: 'orfa@nevo.test', role: 'VIEWER' })
    check(r.status === 201 && r.data.created === false && r.data.accessLink === null, 'conta antiga entra na ala SEM link de senha', `status ${r.status} link=${!!r.data?.accessLink}`)
    r = await call('leticia', 'POST', g(`/members/${orfaId}/access-link`))
    check(r.status === 400, 'link de senha de conta antiga dá 400', `status ${r.status}`)
    await db.query('DELETE FROM "User" WHERE email=$1', ['orfa@nevo.test'])
    await db.end()
  }

  // Ala desligada
  r = await call('nicolas', 'PATCH', g(), { marketingEnabled: false })
  check(r.status === 200, 'Dono desliga a ala')
  r = await call('marcel', 'GET', g('/members'))
  check(r.status === 403, 'com a ala desligada a equipe leva 403', `status ${r.status}`)
  r = await call('nicolas', 'GET', g())
  check(r.status === 200, 'Dono ainda abre o grupo para religar', `status ${r.status}`)
  r = await call('nicolas', 'PATCH', g(), { marketingEnabled: true })
  check(r.status === 200 && r.data.marketingEnabled === true, 'Dono religa a ala')

  // limpa a conta criada (o e-mail fica livre para a próxima rodada)
  const db = new Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
  await db.connect()
  await db.query('DELETE FROM "User" WHERE email=$1', ['freela2@nevo.test'])
  await db.end()
}

async function uiPart() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  for (const vp of [
    { name: 'd1440', width: 1440, height: 1000, mobile: false },
    { name: 'm375', width: 375, height: 812, mobile: true },
  ]) {
    for (const who of ['nicolas', 'leticia', 'diretoria']) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.mobile ? 2 : 1, isMobile: vp.mobile, hasTouch: vp.mobile, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', reducedMotion: 'reduce' })
      const tk = await token(who)
      await ctx.addInitScript(([t, c]) => {
        localStorage.setItem('token', t)
        if (c) localStorage.setItem('activeCompany', c)
        localStorage.setItem('onboarding.autoShown', '1')
        localStorage.setItem('onboarding.completed', '1')
        localStorage.setItem('ui.idlePermissionPrompt', 'done')
      }, [tk, who === 'diretoria' ? null : C.pet])
      const page = await ctx.newPage()
      const bad = []
      page.on('response', (res) => {
        if (res.url().startsWith(API) && (res.status() === 401 || res.status() >= 500)) bad.push(`${res.status()} ${res.url().replace(API, '')}`)
      })
      await page.goto(`${WEB}/marketing/configuracoes`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(500)
      await page.screenshot({ path: path.join(SHOTS, `${who}-${vp.name}.png`), fullPage: false })
      const text = await page.locator('.mk-layout__body').innerText()
      if (who === 'nicolas') {
        check(/Empresas do grupo/.test(text) && /Configurações do Dono/.test(text), `${vp.name} Dono vê empresas e configurações do Dono`)
      }
      if (who === 'leticia') {
        check(/Equipe/.test(text) && !/Configurações do Dono/.test(text), `${vp.name} Admin vê equipe, não as do Dono`)
        check(await page.getByRole('button', { name: 'Convidar' }).count() > 0, `${vp.name} Admin tem Convidar`)
      }
      if (who === 'diretoria') {
        check(await page.getByRole('button', { name: 'Convidar' }).count() === 0, `${vp.name} Visualizador não convida`)
      }
      if (vp.mobile) {
        const sw = await page.evaluate(() => document.documentElement.scrollWidth)
        check(sw <= vp.width, `${vp.name} ${who} sem rolagem lateral`, `scrollWidth ${sw}`)
      }
      check(bad.length === 0, `${vp.name} ${who}: nenhuma 401/5xx`, bad.join(', '))
      await ctx.close()
    }
  }
  // Convite pela tela (Admin, desktop): abre o diálogo, convida, vê o link, desfaz
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' })
    const tk = await token('leticia')
    await ctx.addInitScript(([t, c]) => {
      localStorage.setItem('token', t)
      localStorage.setItem('activeCompany', c)
      localStorage.setItem('onboarding.autoShown', '1')
      localStorage.setItem('onboarding.completed', '1')
      localStorage.setItem('ui.idlePermissionPrompt', 'done')
    }, [tk, C.pet])
    const page = await ctx.newPage()
    await page.goto(`${WEB}/marketing/configuracoes`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Convidar' }).click()
    await page.getByLabel('E-mail').fill('freela3@nevo.test')
    await page.getByLabel('Nome').fill('Duda Freela')
    await page.locator('[role=dialog] button', { hasText: 'Convidar' }).click()
    await page.waitForTimeout(800)
    // O link fica num campo só leitura (innerText não pega valor de input).
    const linkValue = await page.locator('[role=dialog] input[readonly]').inputValue().catch(() => '')
    await page.screenshot({ path: path.join(SHOTS, 'convite-link-d1440.png') })
    check(/redefinir-senha\?token=/.test(linkValue), 'tela mostra o link de primeiro acesso do convidado', linkValue.slice(0, 48))
    await ctx.close()
    const db = new Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
    await db.connect()
    await db.query('DELETE FROM "User" WHERE email=$1', ['freela3@nevo.test'])
    await db.end()
  }
  await browser.close()
}

;(async () => {
  if (ONLY !== 'ui') await apiPart()
  if (ONLY !== 'api') await uiPart()
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK')
  process.exit(fails ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
