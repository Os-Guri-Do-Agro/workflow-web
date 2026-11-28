// Abre uma rota logado e avalia uma expressão JS na página.
// Uso: node probe.mjs <rota|@tasks> <largura> "<expressão JS>" [email]
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'

const [route, width, expr, email = 'nicolas@nevo.test'] = process.argv.slice(2)
const API = 'http://127.0.0.1:3599'
const WEB = 'http://localhost:5174'
const seed = JSON.parse(readFileSync(new URL('./seed-out.json', import.meta.url)))
const token = (await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'nevo1234' }) }).then((r) => r.json())).accessToken
let path = route
if (route === '@tasks') {
  const quarters = await fetch(`${API}/company/${seed.companies.pet}/quarters`, { headers: { Authorization: 'Bearer ' + token, 'x-company-id': seed.companies.pet } }).then((r) => r.json())
  const n = new Date().getMonth() + 1
  for (const q of quarters) for (const m of q.months ?? []) if (m.number === n) path = `/tasks/${m.id}`
}
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const w = Number(width)
const ctx = await browser.newContext({ viewport: { width: w, height: w < 900 ? 812 : 900 }, isMobile: w < 900, hasTouch: w < 900, deviceScaleFactor: 1 })
await ctx.addInitScript(([t, c]) => {
  localStorage.setItem('token', t)
  localStorage.setItem('activeCompany', c)
  localStorage.setItem('onboarding.autoShown', '1')
  localStorage.setItem('onboarding.completed', '1')
  localStorage.setItem('ui.idlePermissionPrompt', 'done')
}, [token, seed.companies.pet])
const page = await ctx.newPage()
const logs = []
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') logs.push('console: ' + m.text().slice(0, 200)) })
await page.goto(WEB + path, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3500)
const out = await page.evaluate(expr)
console.log(JSON.stringify(out, null, 1))
if (logs.length) console.log(logs.slice(0, 10).join('\n'))
await browser.close()
