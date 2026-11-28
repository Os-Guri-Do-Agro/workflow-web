// Ponta a ponta da tela de Deploys (spec v2-mobile-e-home W2) contra a API
// local do harness: cria pela tela, lê o token uma vez, manda eventos do
// EventBridge do Amplify, confere histórico, "Autorizar este app", teste,
// rotação de token, permissão de WORKER e o aviso no feed/inbox.
const { chromium } = require('playwright-core')
const fs = require('fs')
const { randomUUID } = require('crypto')

const API = 'http://127.0.0.1:3599'
const WEB = 'http://localhost:5174'
const seed = JSON.parse(fs.readFileSync(__dirname + '/seed-out.json'))
const results = []
const check = (name, ok, extra = '') => results.push(`${ok ? 'OK  ' : 'FALHA'} ${name}${extra ? ' :: ' + extra : ''}`)

const login = async (email) =>
  (await (await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'nevo1234' }) })).json()).accessToken

function amplifyEvent(appId, status, id = randomUUID()) {
  return {
    version: '0',
    id,
    'detail-type': 'Amplify Deployment Status Change',
    source: 'aws.amplify',
    account: '123456789012',
    time: new Date().toISOString(),
    region: 'us-east-1',
    resources: [`arn:aws:amplify:us-east-1:123456789012:apps/${appId}/branches/main/jobs/0000000042`],
    detail: { appId, branchName: 'main', jobId: '42', jobStatus: status },
  }
}

async function ingest(url, token, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-nevo-token': token }, body: JSON.stringify(body) })
  let json = null
  try { json = await r.json() } catch {}
  return { status: r.status, json }
}

;(async () => {
  const adminToken = await login('nicolas@nevo.test')
  const b = await chromium.launch({ channel: 'msedge', headless: true })
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } })
  await ctx.addInitScript(([t, co]) => {
    localStorage.setItem('token', t); localStorage.setItem('activeCompany', co)
    localStorage.setItem('onboarding.completed', '1'); localStorage.setItem('onboarding.autoShown', '1')
    localStorage.setItem('ui.idlePermissionPrompt', 'done'); localStorage.setItem('ui.theme', 'light')
  }, [adminToken, seed.companies.pet])
  const p = await ctx.newPage()
  const pageErrors = []
  p.on('pageerror', (e) => pageErrors.push(e.message))
  await p.goto(WEB + '/settings#deploys')
  await p.addStyleTag({ content: '#__vue-devtools-container__{display:none!important}' })
  await p.waitForTimeout(3000)

  // 1. criar pela tela
  await p.click('button:has-text("Nova integração")')
  await p.fill('input[placeholder^="Ex.: App PetJourney"]', 'App PetJourney (produção)')
  await p.fill('textarea.dep-textarea', 'd1petjourney PetJourney App')
  await p.click('button:has-text("Criar integração")')
  await p.waitForTimeout(1500)
  const token = (await p.locator('code.dep-token').textContent().catch(() => ''))?.trim()
  const ingestUrl = (await p.locator('.dep-kv dd code').first().textContent().catch(() => ''))?.trim()
  check('cria pela tela e mostra o token uma vez', !!token && !!ingestUrl, `${ingestUrl}`)
  await p.screenshot({ path: __dirname + '/deploy-1-token.png' })

  // 2. evento real do Amplify
  const evId = randomUUID()
  const r1 = await ingest(ingestUrl, token, amplifyEvent('d1petjourney', 'FAILED', evId))
  check('FAILED autorizado -> 200', r1.status === 200, JSON.stringify(r1.json))
  const r2 = await ingest(ingestUrl, token, amplifyEvent('d1petjourney', 'FAILED', evId))
  check('mesmo evento de novo -> 200 idempotente', r2.status === 200, JSON.stringify(r2.json))
  const r3 = await ingest(ingestUrl, 'token-errado', amplifyEvent('d1petjourney', 'FAILED'))
  check('token errado -> 401', r3.status === 401)
  const r4 = await ingest(ingestUrl, token, amplifyEvent('d9outroapp', 'SUCCEEDED'))
  check('app fora da lista -> 403', r4.status === 403)

  // 3. histórico e "Autorizar este app"
  await p.click('button:has-text("Fechar")').catch(() => p.click('button[aria-label="Fechar"]'))
  await p.click('button:has-text("Histórico")')
  await p.waitForTimeout(1500)
  const logText = await p.locator('.dep-log').innerText().catch(() => '')
  check('histórico mostra recebido e recusado', /Recebido/.test(logText) && /Recusado/.test(logText))
  const authBtn = p.locator('button:has-text("Autorizar este app")')
  check('oferece "Autorizar este app" na recusa por fonte', (await authBtn.count()) > 0)
  if (await authBtn.count()) {
    await authBtn.first().click()
    await p.waitForTimeout(1200)
    const r5 = await ingest(ingestUrl, token, amplifyEvent('d9outroapp', 'SUCCEEDED'))
    check('depois de autorizar, o mesmo app -> 200', r5.status === 200, JSON.stringify(r5.json))
  }
  await p.screenshot({ path: __dirname + '/deploy-2-historico.png' })

  // 4. evento de teste pela tela
  await p.click('button:has-text("Enviar teste")')
  await p.waitForTimeout(1500)
  check('enviar teste mostra confirmação', (await p.locator('.dep-test').count()) > 0)

  // 5. aviso chegou: feed e inbox
  const auth = { Authorization: 'Bearer ' + adminToken, 'x-company-id': seed.companies.pet }
  const feed = await (await fetch(API + '/feed?take=20', { headers: auth })).json()
  const feedDeploy = (Array.isArray(feed) ? feed : feed.items ?? []).filter((e) => String(e.verb).startsWith('deploy_'))
  check('feed recebeu eventos de deploy', feedDeploy.length > 0, feedDeploy.map((e) => `${e.verb}: ${e.summary}`).slice(0, 3).join(' | '))
  const inbox = await (await fetch(API + '/inbox', { headers: auth })).json()
  const inboxDeploy = (Array.isArray(inbox) ? inbox : inbox.items ?? inbox.data ?? []).filter((n) => n.type === 'DEPLOY_FAILED')
  check('inbox do ADMIN recebeu a falha', inboxDeploy.length > 0, inboxDeploy[0]?.title)

  // 6. girar token: o antigo morre
  await p.click('button:has-text("Novo token")')
  await p.click('.confirm-dialog button:has-text("Gerar outro"), [role=dialog] button:has-text("Gerar outro")')
  await p.waitForTimeout(1500)
  const newToken = (await p.locator('code.dep-token').textContent().catch(() => ''))?.trim()
  const r6 = await ingest(ingestUrl, token, amplifyEvent('d1petjourney', 'FAILED'))
  const r7 = await ingest(ingestUrl, newToken, amplifyEvent('d1petjourney', 'SUCCEEDED'))
  check('token antigo -> 401 depois de girar', r6.status === 401)
  check('token novo -> 200', r7.status === 200)

  // 7. WORKER
  const workerToken = await login('ana@nevo.test')
  const wctx = await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await wctx.addInitScript(([t, co]) => {
    localStorage.setItem('token', t); localStorage.setItem('activeCompany', co)
    localStorage.setItem('onboarding.completed', '1'); localStorage.setItem('onboarding.autoShown', '1')
    localStorage.setItem('ui.idlePermissionPrompt', 'done'); localStorage.setItem('ui.theme', 'light')
  }, [workerToken, seed.companies.pet])
  const wp = await wctx.newPage()
  await wp.goto(WEB + '/settings#deploys')
  await wp.addStyleTag({ content: '#__vue-devtools-container__{display:none!important}' })
  await wp.waitForTimeout(3000)
  check('WORKER vê o aviso de só ADMIN', (await wp.locator('text=Só quem administra').count()) > 0)
  await wp.screenshot({ path: __dirname + '/deploy-3-worker-m375.png' })
  const wList = await fetch(API + '/deploy-integrations', { headers: { Authorization: 'Bearer ' + workerToken, 'x-company-id': seed.companies.pet } })
  check('WORKER na API -> 403', wList.status === 403)
  const otherAdmin = await fetch(API + '/deploy-integrations', { headers: { Authorization: 'Bearer ' + workerToken, 'x-company-id': seed.companies.sentia } })
  check('quem não é da empresa -> 403', otherAdmin.status === 403)

  // 8. celular do ADMIN
  const mctx = await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await mctx.addInitScript(([t, co]) => {
    localStorage.setItem('token', t); localStorage.setItem('activeCompany', co)
    localStorage.setItem('onboarding.completed', '1'); localStorage.setItem('onboarding.autoShown', '1')
    localStorage.setItem('ui.idlePermissionPrompt', 'done'); localStorage.setItem('ui.theme', 'light')
  }, [adminToken, seed.companies.pet])
  const mp = await mctx.newPage()
  await mp.goto(WEB + '/settings#deploys')
  await mp.addStyleTag({ content: '#__vue-devtools-container__{display:none!important}' })
  await mp.waitForTimeout(3000)
  await mp.screenshot({ path: __dirname + '/deploy-4-admin-m375.png', fullPage: false })
  const hScroll = await mp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  check('celular sem rolagem horizontal', !hScroll)

  check('sem erro de página', pageErrors.length === 0, pageErrors.join(' | '))
  console.log(results.join('\n'))
  await b.close()
})().catch((e) => { console.log(results.join('\n')); console.error('ERRO', e.message); process.exit(1) })
