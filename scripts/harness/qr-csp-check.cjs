// QR com logo sob a CSP aplicada (achado da revisão cruzada): a prévia precisa
// terminar de desenhar, sem violação de CSP.
const { chromium } = require('playwright-core')
const fs = require('fs')
;(async () => {
  const seed = JSON.parse(fs.readFileSync(__dirname + '/seed-out.json'))
  const t = (await (await fetch('http://127.0.0.1:3599/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'nicolas@nevo.test', password: 'nevo1234' }) })).json()).accessToken
  const b = await chromium.launch({ channel: 'msedge', headless: true })
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } })
  await c.addInitScript(([t, co]) => { localStorage.setItem('token', t); localStorage.setItem('activeCompany', co); localStorage.setItem('onboarding.completed', '1'); localStorage.setItem('onboarding.autoShown', '1'); localStorage.setItem('ui.idlePermissionPrompt', 'done') }, [t, seed.companies.pet])
  const p = await c.newPage()
  const problems = []
  p.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text().slice(0, 220)) })
  p.on('pageerror', (e) => problems.push('pageerror ' + e.message.slice(0, 160)))
  for (const route of ['/qr', '/public-access']) {
    await p.goto('http://localhost:5180' + route)
    await p.waitForTimeout(4000)
  }
  await p.goto('http://localhost:5180/qr')
  await p.waitForTimeout(3500)
  const opened = await p.locator('text=QR com logo').first().click().then(() => true).catch(() => false)
  await p.waitForTimeout(800)
  const edit = p.locator('button:has-text("Editar")').first()
  if (await edit.count()) await edit.click().catch(() => {})
  await p.waitForTimeout(4000)
  const drawn = await p.evaluate(() => [...document.querySelectorAll('canvas, svg image, img[src^="data:image"], img[src^="blob:"]')].filter((el) => el.getBoundingClientRect().width > 40).length)
  await p.screenshot({ path: __dirname + '/qr-csp.png' })
  console.log('abriu o QR:', opened, '| elementos de QR desenhados:', drawn)
  console.log(problems.length ? problems.join('\n') : 'nenhuma violacao de CSP em /qr e /public-access')
  await b.close()
})()
