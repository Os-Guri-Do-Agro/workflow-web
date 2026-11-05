// Navega pelo build de produção com CSP aplicada e lista toda violação.
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'

const API = 'http://127.0.0.1:3599'
const WEB = process.env.WEB ?? 'http://localhost:5180'
const seed = JSON.parse(readFileSync(new URL('./seed-out.json', import.meta.url)))
const token = (await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.EMAIL ?? 'nicolas@nevo.test', password: 'nevo1234' }) }).then((r) => r.json())).accessToken
const auth = { Authorization: 'Bearer ' + token, 'x-company-id': seed.companies.pet }
const quarters = await fetch(`${API}/company/${seed.companies.pet}/quarters`, { headers: auth }).then((r) => r.json())
let monthId
for (const q of quarters) for (const m of q.months ?? []) if (m.number === new Date().getMonth() + 1) monthId = m.id
const notes = await fetch(`${API}/notes`, { headers: auth }).then((r) => r.json())
const noteId = (Array.isArray(notes) ? notes : notes.items ?? notes.data ?? [])[0]?.id

const routes = process.env.ROUTES ? process.env.ROUTES.split(',') : ['/', '/?tab=journey', '/board', `/tasks/${monthId}`, '/notes', `/notes/${noteId}`, '/roadmap', '/time', '/settings#deploys', '/drive', '/calendar', '/recursos', `/report/${seed.companies.pet}`]
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript(([t, c]) => {
  localStorage.setItem('token', t)
  localStorage.setItem('activeCompany', c)
  localStorage.setItem('onboarding.autoShown', '1')
  localStorage.setItem('onboarding.completed', '1')
  localStorage.setItem('ui.idlePermissionPrompt', 'done')
}, [token, seed.companies.pet])
const page = await ctx.newPage()
const problems = []
let current = ''
page.on('console', (m) => {
  const t = m.text()
  if (/Content Security Policy|Refused to/i.test(t)) problems.push(`[${current}] ${t.slice(0, 260)}`)
})
page.on('pageerror', (e) => problems.push(`[${current}] pageerror ${e.message.slice(0, 200)}`))
for (const r of routes) {
  current = r
  if (r === '/?tab=journey') {
    await page.goto(WEB + '/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    await page.click('#home-tab-journey').catch(() => problems.push('[journey] sem aba'))
    await page.waitForTimeout(4000)
    continue
  }
  await page.goto(WEB + r, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
}
console.log(problems.length ? problems.join('\n') : 'nenhuma violacao de CSP')
await browser.close()
