// Captura e confere a moldura da ala Marketing (fundação) contra o harness.
// Uso: node marketing-shot.cjs [saida] ; env API, WEB, HARNESS_SEED (seed-marketing-out.json)
// Confere: menu "Marketing" para membro e não para quem é de fora, abas da ala,
// freelancer sem empresa cai na moldura própria e em /marketing, 401/5xx zero.
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const path = require('node:path')

const out = process.argv[2] ?? path.join(__dirname, 'prints', 'marketing-fundacao')
const API = process.env.API ?? 'http://127.0.0.1:3599'
const WEB = process.env.WEB ?? 'http://localhost:5174'
const seedPath = process.env.HARNESS_SEED ?? path.join(__dirname, 'seed-marketing-out.json')
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
fs.mkdirSync(out, { recursive: true })

let fails = 0
const check = (cond, msg, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}${extra ? '  (' + extra + ')' : ''}`)
  if (!cond) fails++
}

async function token(email) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'nevo1234' }),
  })
  return (await r.json()).accessToken
}

async function open(browser, email, route, vp, activeCompany) {
  const t = await token(email)
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.mobile ? 2 : 1,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    reducedMotion: 'reduce',
  })
  await ctx.addInitScript(([tk, c]) => {
    localStorage.setItem('token', tk)
    if (c) localStorage.setItem('activeCompany', c)
    localStorage.setItem('onboarding.autoShown', '1')
    localStorage.setItem('onboarding.completed', '1')
    localStorage.setItem('ui.idlePermissionPrompt', 'done')
  }, [t, activeCompany ?? null])
  const page = await ctx.newPage()
  const bad = []
  page.on('response', (res) => {
    const u = res.url()
    if (u.startsWith(API) && (res.status() === 401 || res.status() >= 500)) bad.push(`${res.status()} ${u.replace(API, '')}`)
  })
  await page.goto(WEB + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  return { ctx, page, bad }
}

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const desk = { width: 1440, height: 900, mobile: false }
  const phone = { width: 375, height: 812, mobile: true }

  // Dono, desktop
  {
    const { ctx, page, bad } = await open(browser, 'nicolas@nevo.test', '/marketing', desk, seed.companies.pet)
    await page.screenshot({ path: path.join(out, 'dono-d1440.png') })
    const tabs = await page.locator('.mk-tab').allInnerTexts()
    check(tabs.length === 12, 'Dono vê as 12 abas da ala', tabs.join(' | '))
    check(await page.getByRole('link', { name: 'Marketing' }).count() > 0, 'menu lateral tem Marketing')
    const brands = await page.locator('.mk-layout__brand').allInnerTexts()
    check(brands.length === 4, 'filtro de marca: Todas + 3', brands.join(' | '))
    await page.locator('.mk-layout__brand', { hasText: 'Emmitec' }).click()
    await page.waitForTimeout(300)
    check(page.url().includes('marca='), 'filtro de marca vai para a URL', page.url())
    await page.locator('.mk-tab', { hasText: 'Calendário' }).click()
    await page.waitForTimeout(400)
    check(page.url().includes('/marketing/calendario') && page.url().includes('marca='), 'troca de aba preserva a marca', page.url())
    check(bad.length === 0, 'Dono: nenhuma 401/5xx', bad.join(', '))
    await ctx.close()
  }
  // Dono, celular
  {
    const { ctx, page, bad } = await open(browser, 'nicolas@nevo.test', '/marketing/aprovacoes', phone, seed.companies.pet)
    await page.screenshot({ path: path.join(out, 'dono-m375.png') })
    const sw = await page.evaluate(() => document.documentElement.scrollWidth)
    check(sw <= 375, 'celular: sem rolagem lateral', `scrollWidth ${sw}`)
    check(bad.length === 0, 'Dono celular: nenhuma 401/5xx', bad.join(', '))
    await ctx.close()
  }
  // Freelancer sem empresa: moldura própria e só a PetJourney
  {
    const { ctx, page, bad } = await open(browser, 'freela@nevo.test', '/board', desk, null)
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(out, 'freela-d1440.png') })
    check(page.url().endsWith('/marketing'), 'freelancer em /board volta para /marketing', page.url())
    check(await page.locator('.mo-shell').count() === 1, 'freelancer usa a moldura só da ala')
    check(await page.getByText('Crie sua primeira empresa').count() === 0, 'freelancer não vê "crie sua empresa"')
    check(await page.locator('.mk-layout__brand').count() === 0, 'freelancer com 1 marca não tem filtro de marca')
    const tabs = await page.locator('.mk-tab').allInnerTexts()
    check(tabs.length === 12, 'freelancer (Editor) vê as abas', tabs.join(' | '))
    check(bad.length === 0, 'freelancer: nenhuma 401/5xx', bad.join(', '))
    await ctx.close()
  }
  // Fora da ala: sem menu e com aviso
  {
    const { ctx, page, bad } = await open(browser, 'luis@nevo.test', '/marketing', desk, seed.companies.emmitec)
    await page.screenshot({ path: path.join(out, 'fora-d1440.png') })
    check(await page.getByRole('link', { name: 'Marketing' }).count() === 0, 'quem é de fora não tem Marketing no menu')
    check(await page.getByText('Você não está na ala Marketing').count() === 1, 'quem é de fora vê o aviso')
    check(bad.length === 0, 'fora: nenhuma 401/5xx', bad.join(', '))
    await ctx.close()
  }
  await browser.close()
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK')
  process.exit(fails ? 1 : 0)
})()
