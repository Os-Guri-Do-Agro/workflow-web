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

  // Painel inicial (R1, D12): uma chamada só. Antes o painel pedia também a
  // lista inteira da Gráfica (`/cards?track=print`) só para separar a contagem.
  {
    const t = await token('nicolas@nevo.test')
    const ctx = await browser.newContext({ viewport: { width: desk.width, height: desk.height }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', reducedMotion: 'reduce' })
    await ctx.addInitScript(([tk, c]) => {
      localStorage.setItem('token', tk)
      localStorage.setItem('activeCompany', c)
      localStorage.setItem('onboarding.autoShown', '1')
      localStorage.setItem('onboarding.completed', '1')
      localStorage.setItem('ui.idlePermissionPrompt', 'done')
    }, [t, seed.companies.pet])
    const page = await ctx.newPage()
    const calls = []
    page.on('request', (req) => {
      const u = req.url()
      if (u.startsWith(API) && u.includes(`/marketing/g/${seed.groupId}/`)) calls.push(u.replace(API, '').split('?')[0])
    })
    await page.goto(WEB + '/marketing', { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-section="contagem"]', { timeout: 10000 })
    await page.waitForTimeout(600)
    const home = calls.filter((c) => c.endsWith('/home')).length
    const cards = calls.filter((c) => c.endsWith('/cards')).length
    check(home === 1 && cards === 0, 'painel: uma chamada ao /home e nenhuma à lista de cards', calls.join(', '))
    const grafica = await page.locator('[data-section="contagem"] [data-track="grafica"]').count()
    check(grafica >= 1, 'painel: a contagem da Gráfica sai do próprio /home (chip da trilha)', `${grafica} chip(s)`)
    await page.screenshot({ path: path.join(out, 'painel-uma-chamada-d1440.png') })
    await ctx.close()
  }

  // Dono, desktop
  {
    const { ctx, page, bad } = await open(browser, 'nicolas@nevo.test', '/marketing', desk, seed.companies.pet)
    await page.screenshot({ path: path.join(out, 'dono-d1440.png') })
    const tabs = await page.locator('.mk-tab').allInnerTexts()
    // 13 desde a R1 (Acervo, entre Ideias e Campanhas). A R2 trouxe Dados (B) e
    // Lixeira (C): com 15 a fita não cabia em 1440 px, então Lixeira e
    // Configurações foram para o cabeçalho (`placement: 'header'`) e a fita
    // voltou a 13, sem rolar.
    check(tabs.length === 13 && tabs.includes('Acervo') && tabs.includes('Dados'), 'Dono vê as 13 abas da ala (com o Acervo e os Dados)', tabs.join(' | '))
    check(!tabs.includes('Lixeira') && !tabs.includes('Configurações'), 'Lixeira e Configurações não estão mais na fita')
    const strip = await page.locator('.mk-layout__tabs').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, cut: el.className }))
    check(strip.sw <= strip.cw && !/is-cut/.test(strip.cut), 'as 13 abas cabem em 1440 px sem rolar (nem esmaecido de corte)', `${strip.sw} <= ${strip.cw}`)
    const tools = await page.locator('.mk-layout__tools .mk-layout__tool').evaluateAll((els) =>
      els.map((e) => ({ id: e.dataset.testid, text: e.innerText.trim(), aria: e.getAttribute('aria-label'), title: e.getAttribute('title'), href: e.getAttribute('href') })),
    )
    check(
      JSON.stringify(tools.map((t) => [t.id, t.text, t.aria])) ===
        JSON.stringify([
          ['header-link-notify', 'Meus avisos', 'Meus avisos'],
          ['header-link-trash', 'Lixeira', 'Lixeira'],
          ['header-link-settings', 'Configurações', 'Configurações'],
        ]),
      'cabeçalho: Meus avisos, Lixeira e Configurações, com ícone, rótulo e aria-label',
      JSON.stringify(tools),
    )
    check(tools.every((t) => t.title && t.title.length > t.aria.length && !/—/.test(t.title)), 'cada atalho com title (dica), sem em-dash', tools.map((t) => t.title).join(' | '))
    check(tools.every((t) => !/marca=/.test(t.href)), 'atalhos sem filtro de marca ainda', tools.map((t) => t.href).join(' '))
    // Atalho do cabeçalho leva à tela, fica ativo e o breadcrumb diz o nome.
    await page.locator('[data-testid="header-link-trash"]').click()
    await page.waitForURL(/\/marketing\/lixeira/)
    await page.waitForTimeout(400)
    check((await page.locator('[data-testid="header-link-trash"].is-active[aria-current="page"]').count()) === 1, 'Lixeira aberta pelo cabeçalho: atalho ativo (aria-current)')
    check((await page.locator('.mk-tab.is-active').count()) === 0, 'nenhuma aba da fita fica ativa na Lixeira')
    const crumb = (await page.locator('nav.breadcrumbs').innerText().catch(() => '')).replace(/\s+/g, ' ')
    check(/Marketing \/ Lixeira/.test(crumb), 'breadcrumb da moldura mostra "Marketing / Lixeira"', crumb)
    await page.screenshot({ path: path.join(out, 'dono-lixeira-d1440.png') })
    await page.locator('[data-testid="header-link-settings"]').click()
    await page.waitForURL(/\/marketing\/configuracoes/)
    await page.waitForTimeout(400)
    check((await page.locator('[data-testid="header-link-settings"].is-active').count()) === 1, 'Configurações aberta pelo cabeçalho: atalho ativo')
    const crumbCfg = (await page.locator('nav.breadcrumbs').innerText().catch(() => '')).replace(/\s+/g, ' ')
    check(/Marketing \/ Configurações/.test(crumbCfg), 'breadcrumb mostra "Marketing / Configurações"', crumbCfg)
    // Ctrl+K acha as duas (mesma lista de seções).
    await page.keyboard.press('Control+k')
    const input = page.locator('.palette-input')
    await input.waitFor({ timeout: 4000 })
    await input.fill('lixeira')
    await page.waitForTimeout(300)
    const hit = page.locator('.palette-results').getByText('Ala Marketing').first()
    check((await hit.count()) === 1, 'Ctrl+K: "lixeira" acha a Lixeira da ala')
    await page.screenshot({ path: path.join(out, 'ctrlk-lixeira-d1440.png') })
    await page.keyboard.press('Enter')
    await page.waitForURL(/\/marketing\/lixeira/, { timeout: 5000 }).catch(() => {})
    check(page.url().includes('/marketing/lixeira'), 'Ctrl+K: Enter abre a Lixeira', page.url())
    await page.keyboard.press('Control+k')
    await input.waitFor({ timeout: 4000 })
    await input.fill('configura')
    await page.waitForTimeout(300)
    const cfg = await page.locator('.palette-results').innerText()
    check(/Configurações[\s\S]*Ala Marketing|Ala Marketing[\s\S]*Configurações/.test(cfg), 'Ctrl+K: "configura" acha as Configurações da ala', cfg.replace(/\s+/g, ' ').slice(0, 200))
    await page.keyboard.press('Escape')
    await page.goto(WEB + '/marketing', { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)
    check(await page.getByRole('link', { name: 'Marketing' }).count() > 0, 'menu lateral tem Marketing')
    const brands = await page.locator('.mk-layout__brand').allInnerTexts()
    check(brands.length === 4, 'filtro de marca: Todas + 3', brands.join(' | '))
    await page.locator('.mk-layout__brand', { hasText: 'Emmitec' }).click()
    await page.waitForTimeout(300)
    check(page.url().includes('marca='), 'filtro de marca vai para a URL', page.url())
    check((await page.locator('[data-testid="header-link-trash"]').getAttribute('href'))?.includes('marca='), 'atalho do cabeçalho preserva a marca, como as abas')
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
    // Cabeçalho a 375: atalhos só com o ícone (44px), dentro da tela, e nada
    // cortado (nome do grupo, papel e atalhos inteiros).
    const head = await page.evaluate(() => {
      const r = (el) => el && el.getBoundingClientRect()
      const clipped = (el) => !!el && el.scrollWidth > el.clientWidth + 1
      const tools = [...document.querySelectorAll('.mk-layout__tool')].map((e) => {
        const b = r(e)
        const label = e.querySelector('.mk-layout__tool-label')
        return { id: e.dataset.testid, w: b.width, h: b.height, left: b.left, right: b.right, label: label ? getComputedStyle(label).display : null, aria: e.getAttribute('aria-label'), title: e.getAttribute('title') }
      })
      const name = document.querySelector('.mk-layout__group-name')
      const chip = document.querySelector('.mk-layout__title .mk-chip')
      const h1 = document.querySelector('.mk-layout__title h1')
      return { tools, nameClipped: clipped(name), chipClipped: clipped(chip), h1Clipped: clipped(h1), vw: document.documentElement.clientWidth, name: name?.textContent, chip: chip?.textContent?.trim() }
    })
    check(head.tools.length === 3 && head.tools.every((t) => t.label === 'none' && t.aria && t.title), 'celular: os 3 atalhos só com o ícone, com aria-label e title', JSON.stringify(head.tools.map((t) => [t.id, t.label, t.aria])))
    check(head.tools.every((t) => t.w >= 44 && t.h >= 44), 'celular: atalhos com alvo de 44px', head.tools.map((t) => `${Math.round(t.w)}x${Math.round(t.h)}`).join(' '))
    check(head.tools.every((t) => t.left >= 0 && t.right <= head.vw), 'celular: atalhos dentro da tela', head.tools.map((t) => `${Math.round(t.left)}-${Math.round(t.right)}`).join(' '))
    check(!head.nameClipped && !head.chipClipped && !head.h1Clipped, 'celular: título, grupo e papel inteiros (nada cortado)', `${head.name} / ${head.chip}`)
    await page.locator('[data-testid="header-link-settings"]').tap()
    await page.waitForURL(/\/marketing\/configuracoes/)
    await page.waitForTimeout(400)
    check((await page.locator('[data-testid="header-link-settings"].is-active').count()) === 1, 'celular: tocar no ícone abre Configurações (ativo)')
    await page.screenshot({ path: path.join(out, 'dono-configuracoes-m375.png') })
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
    check(tabs.length === 13 && tabs.includes('Acervo') && !tabs.includes('Lixeira'), 'freelancer (Editor) vê as 13 abas (com o Acervo)', tabs.join(' | '))
    const fTools = await page.locator('.mk-layout__tool').evaluateAll((els) => els.map((e) => e.dataset.testid))
    check(JSON.stringify(fTools) === JSON.stringify(['header-link-notify', 'header-link-trash', 'header-link-settings']), 'freelancer (Editor): Lixeira e Configurações no cabeçalho', fTools.join(' '))
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
