const { chromium } = require('playwright-core')
const pg = require('pg')
;(async () => {
  const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.PGPORT ?? '55432'}/wf` }); await db.connect()
  const company = (await db.query(`SELECT id FROM "Company" WHERE name='PetJourney'`)).rows[0].id; await db.end()
  const t = (await (await fetch('http://127.0.0.1:3599/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'nicolas@nevo.test', password: 'nevo1234' }) })).json()).accessToken
  const b = await chromium.launch({ channel: 'msedge', headless: true }); const c = await b.newContext({ viewport: { width: 1440, height: 900 } })
  await c.addInitScript(([t, co]) => { localStorage.setItem('token', t); localStorage.setItem('activeCompany', co); localStorage.setItem('onboarding.completed', '1'); localStorage.setItem('onboarding.autoShown', '1'); localStorage.setItem('ui.idlePermissionPrompt', 'done'); localStorage.setItem('ui.theme', 'light') }, [t, company])
  const p = await c.newPage(); await p.goto('http://localhost:5174/board'); await p.addStyleTag({ content: '#__vue-devtools-container__{display:none!important}' }); await p.waitForTimeout(3000)
  await p.keyboard.press('Control+k'); await p.waitForTimeout(300); await p.keyboard.type('pj-'); await p.waitForTimeout(1200)
  await p.screenshot({ path: __dirname + '/prints/16-ctrlk-chave.png' }); await b.close()
})()
