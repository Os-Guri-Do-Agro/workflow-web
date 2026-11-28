// Navega as telas principais contra a API local e lista toda resposta >= 400
// da API (o que uma mudança de autorização quebraria). Uso: node api-smoke.cjs [email]
const { chromium } = require('playwright-core')
const fs = require('fs')

const API = 'http://127.0.0.1:3599'
const WEB = process.env.WEB ?? 'http://localhost:5174'
const email = process.argv[2] ?? 'nicolas@nevo.test'
const seed = JSON.parse(fs.readFileSync(__dirname + '/seed-out.json'))

;(async () => {
  const token = (await (await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'nevo1234' }) })).json()).accessToken
  const auth = { Authorization: 'Bearer ' + token, 'x-company-id': seed.companies.pet }
  const quarters = await (await fetch(`${API}/company/${seed.companies.pet}/quarters`, { headers: auth })).json()
  let monthId
  for (const q of quarters) for (const m of q.months ?? []) if (m.number === new Date().getMonth() + 1) monthId = m.id
  const ws = await (await fetch(`${API}/dashboard/workspace`, { headers: auth })).json()
  const own = (ws.activities ?? []).find((a) => a.companyId === seed.companies.pet)
  const other = (ws.activities ?? []).find((a) => a.companyId !== seed.companies.pet)
  const routes = [
    '/', '/board', `/tasks/${monthId}`,
    own && `/tasks/${monthId}/${own.id}`,
    other && `/board?task=${other.id}&company=${other.companyId}`,
    '/notes', '/roadmap', '/time', '/calendar', '/drive', '/settings#deploys', '/settings#notificacoes', '/company-users', '/variables',
  ].filter(Boolean)

  const b = await chromium.launch({ channel: 'msedge', headless: true })
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(([t, co]) => {
    localStorage.setItem('token', t); localStorage.setItem('activeCompany', co)
    localStorage.setItem('onboarding.completed', '1'); localStorage.setItem('onboarding.autoShown', '1')
    localStorage.setItem('ui.idlePermissionPrompt', 'done')
  }, [token, seed.companies.pet])
  const p = await ctx.newPage()
  const bad = []
  let current = ''
  p.on('response', (r) => {
    const u = r.url()
    if (u.startsWith(API) && r.status() >= 400) bad.push(`[${current}] ${r.status()} ${r.request().method()} ${u.replace(API, '').slice(0, 90)}`)
  })
  p.on('pageerror', (e) => bad.push(`[${current}] pageerror ${e.message.slice(0, 120)}`))
  for (const r of routes) {
    current = r
    await p.goto(WEB + r, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(3200)
  }
  console.log(`${email}: ${routes.length} rotas`)
  console.log(bad.length ? bad.join('\n') : 'nenhuma resposta >= 400')
  await b.close()
})()
