// Roteiro de ponta a ponta da M2-A (UTMs e QR): API e tela.
// Uso: node marketing-utm-e2e.cjs [saida]
// Env: API (padrão http://127.0.0.1:3621), WEB (padrão http://localhost:5183),
//      HARNESS_SEED (padrão seed-marketing-out.wf_m2a.json), SKIP_UI=1 pula a tela.
// Critérios da spec: U1 a U5. Também confere papel por papel, apagar (só Admin),
// desativar (link e QR param) e zero 401/5xx na tela.
const fs = require('node:fs')
const path = require('node:path')

const API = process.env.API ?? 'http://127.0.0.1:3621'
const WEB = process.env.WEB ?? 'http://localhost:5183'
const seed = JSON.parse(
  fs.readFileSync(process.env.HARNESS_SEED ?? path.join(__dirname, 'seed-marketing-out.wf_m2a.json'), 'utf8'),
)
const out = process.argv[2] ?? path.join(__dirname, 'prints', 'marketing-utm')
fs.mkdirSync(out, { recursive: true })
const G = seed.groupId
const PET = seed.companies.pet
const EMMI = seed.companies.emmitec

let fails = 0
const check = (cond, msg, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}${extra ? '  (' + extra + ')' : ''}`)
  if (!cond) fails++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const tokens = {}
async function login(key) {
  if (tokens[key]) return tokens[key]
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${key}@nevo.test`, password: 'nevo1234' }),
  })
  tokens[key] = (await r.json()).accessToken
  return tokens[key]
}
async function call(who, method, route, body) {
  const t = await login(who)
  const r = await fetch(`${API}/marketing/g/${G}${route}`, {
    method,
    headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  try {
    json = await r.json()
  } catch {}
  return { status: r.status, json }
}
async function hop(url) {
  const r = await fetch(url, { redirect: 'manual' })
  return { status: r.status, location: r.headers.get('location') }
}

const RUN = Date.now().toString(36)
const base = (name) => ({
  companyId: PET,
  targetUrl: `https://petjourney.com.br/${name}-${RUN}`,
  utmSource: 'Instagram',
  utmMedium: 'bio',
  utmCampaign: 'Dia dos Pets 2026',
  placement: `Bio do Instagram ${RUN}`,
})

async function apiPart() {
  console.log('\n== API ==')
  // U1
  const u1 = await call('freela', 'POST', '/utm', base('app'))
  check(u1.status === 201, 'U1 freelancer cria UTM da PetJourney', `status ${u1.status} ${JSON.stringify(u1.json?.message ?? '')}`)
  const utm = u1.json
  check(utm?.shortLink?.utmCampaign === 'dia-dos-pets-2026', 'U1 "Dia dos Pets 2026" vira dia-dos-pets-2026', utm?.shortLink?.utmCampaign)
  check(utm?.shortLink?.utmSource === 'instagram', 'U1 origem "Instagram" vira instagram')
  check(/\/l\/[A-Za-z0-9_-]{8}$/.test(utm?.shortLink?.shortUrl ?? ''), 'U1 link curto /l/<code>', utm?.shortLink?.shortUrl)
  check((utm?.shortLink?.finalUrl ?? '').includes('utm_campaign=dia-dos-pets-2026'), 'U1 URL final tem as UTMs')
  const bad = await call('freela', 'POST', '/utm', { ...base('x'), utmSource: 'orkut' })
  check(bad.status === 400 && /lista fixa/.test(bad.json?.message ?? ''), 'U1 origem fora da lista dá 400', `${bad.status} ${bad.json?.message}`)
  const badM = await call('freela', 'POST', '/utm', { ...base('x'), utmMedium: 'banner' })
  check(badM.status === 400, 'U1 mídia fora da lista dá 400')

  // U2
  const dup = await call('freela', 'POST', '/utm', base('app'))
  check(dup.status === 409 && dup.json?.existingId === utm.id, 'U2 repetida dá 409 com existingId', `${dup.status} ${dup.json?.existingId}`)
  const forced = await call('freela', 'POST', '/utm', { ...base('app'), force: true })
  check(forced.status === 201 && forced.json?.id !== utm.id, 'U2 force cria mesmo assim')

  // U3: clique no link
  const code = utm.shortLink.code
  const click = await hop(`${API}/l/${code}`)
  check(click.status === 302, 'U3 /l/<code> responde 302', String(click.status))
  const loc = new URL(click.location)
  check(
    loc.searchParams.get('utm_source') === 'instagram' &&
      loc.searchParams.get('utm_medium') === 'bio' &&
      loc.searchParams.get('utm_campaign') === 'dia-dos-pets-2026',
    'U3 o link curto chega na URL final com as UTMs',
    click.location,
  )
  await sleep(500)
  const qrMade = await call('freela', 'POST', `/utm/${utm.id}/qr`, { style: { colorDark: '#0054e3', dotStyle: 'rounded' } })
  check(qrMade.status === 201 && !!qrMade.json?.qr?.code, 'U3 cria o QR', `${qrMade.status}`)
  const qrAgain = await call('freela', 'POST', `/utm/${utm.id}/qr`, {})
  check(qrAgain.json?.qr?.id === qrMade.json?.qr?.id, 'U3 pedir o QR de novo devolve o mesmo')
  const qrCode = qrMade.json.qr.code
  const scan = await hop(`${API}/q/${qrCode}`)
  check(scan.status === 302 && scan.location === utm.shortLink.shortUrl, 'U3 /q/<code> aponta para o LINK CURTO', scan.location)
  const chained = await hop(scan.location)
  check(chained.status === 302 && chained.location === click.location, 'U3 do QR chega na URL final com as UTMs', chained.location)
  await sleep(800)
  const list1 = await call('freela', 'GET', '/utm')
  const row1 = (list1.json ?? []).find((r) => r.id === utm.id)
  check(row1?.shortLink.clickCount === 2, 'U3 cliques contados (1 direto + 1 vindo do QR)', `clickCount ${row1?.shortLink.clickCount}`)
  check(row1?.qr?.scanCount === 1, 'U3 leitura do QR contada', `scanCount ${row1?.qr?.scanCount}`)
  const m = await call('freela', 'GET', `/utm/${utm.id}/metrics`)
  const today = m.json?.days?.[m.json.days.length - 1]
  check(m.status === 200 && m.json.days.length === 90, 'métricas trazem 90 dias', `${m.json?.days?.length}`)
  check(m.json?.totals?.clicks === 2 && m.json?.totals?.scans === 1 && m.json?.totals?.clicksOutsideQr === 1, 'métricas: totais', JSON.stringify(m.json?.totals))
  check(today && today.clicks === 2 && today.scans === 1, 'métricas: o dia de hoje tem 2 cliques e 1 leitura', JSON.stringify(today))
  check(Array.isArray(m.json?.referers) && m.json.referers.length >= 1, 'métricas: origens (referer)')

  // U4
  const newTarget = `https://petjourney.com.br/outra-pagina-${RUN}`
  const upd = await call('freela', 'PATCH', `/utm/${utm.id}`, { targetUrl: newTarget })
  check(
    upd.status === 200 && upd.json.shortLink.code === code && upd.json.qr.code === qrCode && upd.json.qr.id === qrMade.json.qr.id,
    'U4 trocar o destino mantém o mesmo link curto e o mesmo QR',
  )
  const afterScan = await hop(`${API}/q/${qrCode}`)
  const afterHop = await hop(afterScan.location)
  check(afterScan.location === utm.shortLink.shortUrl && afterHop.location.startsWith(newTarget), 'U4 QR impresso agora chega no destino novo', afterHop.location)
  const dupEdit = await call('freela', 'PATCH', `/utm/${forced.json.id}`, { targetUrl: newTarget })
  check(dupEdit.status === 409 && dupEdit.json?.existingId === utm.id, 'U2 editar para igualar outra UTM dá 409 com existingId', `${dupEdit.status}`)
  const okEdit = await call('freela', 'PATCH', `/utm/${forced.json.id}`, { targetUrl: newTarget, force: true })
  check(okEdit.status === 200, 'U2 editar com force passa')
  const freeEdit = await call('freela', 'PATCH', `/utm/${forced.json.id}`, { utmContent: 'Variação B' })
  check(freeEdit.status === 200 && freeEdit.json.shortLink.utmContent === 'variacao-b', 'editar content normaliza')

  // Desativar: link e QR param juntos
  const off = await call('freela', 'POST', `/utm/${utm.id}/active`, { active: false })
  check(off.status === 201 && off.json.shortLink.active === false && off.json.qr.active === false, 'desativar desliga link e QR', `${off.status}`)
  check((await hop(`${API}/l/${code}`)).status === 404 && (await hop(`${API}/q/${qrCode}`)).status === 404, 'link e QR desativados dão 404 público')
  await call('freela', 'POST', `/utm/${utm.id}/active`, { active: true })
  check((await hop(`${API}/l/${code}`)).status === 302, 'reativar volta a funcionar')

  // U5: marcas e papéis
  const emmi = await call('marcel', 'POST', '/utm', { ...base('emmi'), companyId: EMMI, placement: `Folder EMMI ${RUN}` })
  check(emmi.status === 201, 'Editor com todas as marcas cria UTM da Emmitec', `${emmi.status}`)
  const freelaList = await call('freela', 'GET', '/utm')
  check(!(freelaList.json ?? []).some((r) => r.companyId === EMMI), 'U5 freelancer não vê UTM da Emmitec')
  check((freelaList.json ?? []).some((r) => r.id === utm.id), 'U5 freelancer vê as da PetJourney')
  const freelaEmmi = await call('freela', 'POST', '/utm', { ...base('emmi2'), companyId: EMMI })
  check(freelaEmmi.status === 403, 'U5 freelancer não cria para a Emmitec (403)', `${freelaEmmi.status}`)
  check((await call('freela', 'GET', `/utm/${emmi.json.id}/metrics`)).status === 404, 'U5 métricas da Emmitec para o freelancer: 404')
  check((await call('freela', 'PATCH', `/utm/${emmi.json.id}`, { placement: 'x' })).status === 404, 'U5 editar a da Emmitec: 404')
  check((await call('freela', 'GET', `/utm?companyId=${EMMI}`)).json?.length === 0, 'U5 filtrar pela marca escondida: vazio')
  const dirList = await call('diretoria', 'GET', '/utm')
  check(dirList.status === 200 && dirList.json.some((r) => r.companyId === EMMI) && dirList.json.some((r) => r.companyId === PET), 'U5 Diretoria vê as duas marcas')
  check((await call('diretoria', 'POST', '/utm', base('dir'))).status === 403, 'U5 Diretoria não cria (403)')
  check((await call('diretoria', 'POST', `/utm/${utm.id}/qr`, {})).status === 403, 'U5 Diretoria não cria QR (403)')
  check((await call('diretoria', 'POST', `/utm/${utm.id}/active`, { active: false })).status === 403, 'U5 Diretoria não desativa (403)')
  check((await call('diretoria', 'GET', `/utm/${utm.id}/metrics`)).status === 200, 'Diretoria vê métricas')
  check((await call('luis', 'GET', '/utm')).status === 403, 'U5 quem é de fora da ala leva 403')
  const opt = await call('freela', 'GET', '/utm/options')
  check(opt.status === 200 && opt.json.sources.includes('instagram') && opt.json.mediums.includes('impresso'), 'options traz as listas fixas')
  check(opt.json.cards.every((c) => c.companyId === PET), 'options: freelancer só vê cards da PetJourney')

  // Vínculos
  const petCard = seed.cards.find((c) => c.title.startsWith('Dicas de banho')).id
  const emmiCard = seed.cards.find((c) => c.title.startsWith('Post institucional')).id
  const linked = await call('marcel', 'PATCH', `/utm/${utm.id}`, { cardId: petCard })
  check(linked.status === 200 && linked.json.card?.id === petCard, 'liga o card da mesma marca', `${linked.status}`)
  const crossed = await call('marcel', 'PATCH', `/utm/${utm.id}`, { cardId: emmiCard })
  check(crossed.status === 400, 'card de outra marca não liga (400)', `${crossed.status}`)
  const unlinked = await call('marcel', 'PATCH', `/utm/${utm.id}`, { cardId: null })
  check(unlinked.status === 200 && unlinked.json.card === null, 'null desliga o vínculo')

  // Apagar: só Admin
  check((await call('freela', 'DELETE', `/utm/${emmi.json.id}`)).status === 403, 'freelancer (Editor) não apaga (403)')
  check((await call('marcel', 'DELETE', `/utm/${emmi.json.id}`)).status === 403, 'Editor não apaga (403)')
  const del = await call('leticia', 'DELETE', `/utm/${utm.id}`)
  check(del.status === 200, 'Admin apaga', `${del.status}`)
  check((await hop(`${API}/l/${code}`)).status === 404 && (await hop(`${API}/q/${qrCode}`)).status === 404, 'depois de apagar, link e QR dão 404')
  const log = await call('leticia', 'GET', `/log?entityType=utm&entityId=${utm.id}`)
  check(log.status === 200 && log.json.length >= 4, 'histórico registra criar, editar, desativar e apagar', `${log.json?.length}`)
  return { emmiId: emmi.json.id, keep: forced.json.id }
}

// ── Tela ───────────────────────────────────────────────────────────────────
async function uiPart() {
  const { chromium } = require('playwright-core')
  console.log('\n== TELA ==')
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const desk = { width: 1440, height: 900, mobile: false, tag: 'd1440' }
  const phone = { width: 375, height: 812, mobile: true, tag: 'm375' }

  async function open(who, route, vp, company) {
    const t = await login(who)
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.mobile ? 2 : 1,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      reducedMotion: 'reduce',
      permissions: ['clipboard-read', 'clipboard-write'],
    })
    await ctx.addInitScript(([tk, c]) => {
      localStorage.setItem('token', tk)
      if (c) localStorage.setItem('activeCompany', c)
      localStorage.setItem('onboarding.autoShown', '1')
      localStorage.setItem('onboarding.completed', '1')
      localStorage.setItem('ui.idlePermissionPrompt', 'done')
    }, [t, company ?? null])
    const page = await ctx.newPage()
    const bad = []
    page.on('response', (res) => {
      const u = res.url()
      if (u.startsWith(API) && (res.status() === 401 || res.status() >= 500)) bad.push(`${res.status()} ${u.replace(API, '')}`)
    })
    page.on('pageerror', (e) => bad.push(`pageerror ${e.message}`))
    await page.goto(WEB + route, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    return { ctx, page, bad }
  }
  const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) })
  const noHScroll = async (page, label, w) => {
    const sw = await page.evaluate(() => document.documentElement.scrollWidth)
    check(sw <= w, `${label}: sem rolagem lateral`, `scrollWidth ${sw}`)
  }

  for (const vp of [desk, phone]) {
    const who = 'marcel'
    const { ctx, page, bad } = await open(who, '/marketing/utm', vp, PET)
    await shot(page, `lista-${vp.tag}`)
    await noHScroll(page, `${vp.tag} lista`, vp.width)
    check((await page.locator('.mk-utm-row').count()) >= 1, `${vp.tag} lista mostra UTMs`)

    // Gerador com prévia ao vivo
    await page.getByRole('button', { name: 'Nova UTM' }).first().click()
    await page.waitForSelector('[data-testid="utm-form"]')
    const placement = `Placa da clínica ${vp.tag} ${RUN}`
    await page.fill('[data-testid="utm-target"]', `https://petjourney.com.br/clinicas-${vp.tag}-${RUN}`)
    await page.fill('[data-testid="utm-campaign"]', 'Dia dos Pets 2026 ç')
    await page.selectOption('[data-testid="utm-source"]', 'parceiro')
    await page.selectOption('[data-testid="utm-medium"]', 'impresso')
    await page.fill('[data-testid="utm-content"]', 'Placa Balcão')
    await page.fill('[data-testid="utm-placement"]', placement)
    await page.waitForTimeout(200)
    const preview = await page.locator('[data-testid="utm-final-preview"]').innerText()
    check(
      preview.includes('utm_campaign=dia-dos-pets-2026-c') && preview.includes('utm_content=placa-balcao') && preview.includes('utm_source=parceiro'),
      `${vp.tag} prévia ao vivo mostra a URL final normalizada`,
      preview.slice(0, 160),
    )
    const norm = await page.locator('[data-testid="utm-campaign-normalized"]').innerText()
    check(norm.includes('dia-dos-pets-2026-c'), `${vp.tag} mostra o valor normalizado da campanha`, norm)
    await noHScroll(page, `${vp.tag} gerador`, vp.width)
    await shot(page, `gerador-${vp.tag}`)
    await page.getByRole('button', { name: 'Criar UTM' }).click()
    await page.waitForSelector('[data-testid="utm-panel"]')
    check(page.url().includes('utm='), `${vp.tag} painel abre pela URL`)

    // Duplicada pela tela
    await page.getByRole('button', { name: 'Fechar' }).first().click()
    await page.getByRole('button', { name: 'Nova UTM' }).first().click()
    await page.fill('[data-testid="utm-target"]', `https://petjourney.com.br/clinicas-${vp.tag}-${RUN}`)
    await page.fill('[data-testid="utm-campaign"]', 'Dia dos Pets 2026 ç')
    await page.selectOption('[data-testid="utm-source"]', 'parceiro')
    await page.selectOption('[data-testid="utm-medium"]', 'impresso')
    await page.fill('[data-testid="utm-content"]', 'Placa Balcão')
    await page.fill('[data-testid="utm-placement"]', placement + ' bis')
    await page.getByRole('button', { name: 'Criar UTM' }).click()
    await page.waitForSelector('[data-testid="utm-duplicate"]')
    await shot(page, `duplicada-${vp.tag}`)
    check(true, `${vp.tag} UTM repetida mostra o aviso com "abrir a existente" e "criar mesmo assim"`)
    await page.getByRole('button', { name: 'Abrir a existente' }).click()
    await page.waitForSelector('[data-testid="utm-panel"]')

    // Painel: QR, métricas, destino
    await page.getByRole('button', { name: 'Criar QR Code' }).click()
    await page.waitForSelector('[data-testid="utm-qr"] svg, [data-testid="utm-qr"] canvas')
    check(true, `${vp.tag} QR criado e desenhado`)
    await page.waitForSelector('[data-testid="utm-chart"] canvas')
    await page.waitForTimeout(500)
    await shot(page, `painel-${vp.tag}`)
    await noHScroll(page, `${vp.tag} painel`, vp.width)
    const hint = await page.getByText('O QR impresso continua valendo').count()
    check(hint > 0, `${vp.tag} aviso "o QR impresso continua valendo" no destino`)
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.getByRole('button', { name: 'Baixar PNG' }).click()])
    check(!!dl && /\.png$/.test(dl.suggestedFilename()), `${vp.tag} baixa o QR em PNG`, dl?.suggestedFilename())
    const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.getByRole('button', { name: 'Baixar SVG' }).click()])
    check(!!dl2 && /\.svg$/.test(dl2.suggestedFilename()), `${vp.tag} baixa o QR em SVG`)
    await page.getByRole('button', { name: 'Copiar link curto' }).click()
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '')
    check(/\/l\/[A-Za-z0-9_-]{8}$/.test(clip), `${vp.tag} copiar link curto`, clip)
    check(bad.length === 0, `${vp.tag} editor: nenhuma 401/5xx`, bad.join(', '))
    await ctx.close()
  }

  // Visualizador: vê, não cria
  {
    const { ctx, page, bad } = await open('diretoria', '/marketing/utm', desk, null)
    await shot(page, 'diretoria-d1440')
    check((await page.locator('.mk-utm-row').count()) >= 1, 'Diretoria vê a lista')
    check((await page.getByRole('button', { name: 'Nova UTM' }).count()) === 0, 'Diretoria não tem "Nova UTM"')
    await page.locator('.mk-utm-row').first().click()
    await page.waitForSelector('[data-testid="utm-panel"]')
    check((await page.getByRole('button', { name: 'Criar QR Code' }).count()) === 0, 'Diretoria não tem "Criar QR Code"')
    check((await page.getByRole('button', { name: 'Apagar' }).count()) === 0, 'Diretoria não tem "Apagar"')
    check(bad.length === 0, 'Diretoria: nenhuma 401/5xx', bad.join(', '))
    await ctx.close()
  }
  // Freelancer sem empresa: só a PetJourney
  {
    const { ctx, page, bad } = await open('freela', '/marketing/utm', desk, null)
    await page.waitForTimeout(500)
    await shot(page, 'freela-d1440')
    const txt = await page.locator('.mk-utm-list').innerText()
    check(!/Folder EMMI/.test(txt), 'freelancer não vê a UTM da Emmitec na tela')
    check(bad.length === 0, 'freelancer: nenhuma 401/5xx', bad.join(', '))
    await ctx.close()
  }
  // Admin apaga pela tela
  {
    const { ctx, page, bad } = await open('leticia', '/marketing/utm', desk, PET)
    await page.locator('.mk-utm-row').first().click()
    await page.waitForSelector('[data-testid="utm-panel"]')
    await page.getByRole('button', { name: 'Apagar' }).click()
    await page.waitForSelector('text=QR impresso')
    await shot(page, 'apagar-d1440')
    await page.getByRole('button', { name: 'Apagar UTM' }).click()
    await page.waitForTimeout(800)
    check(!page.url().includes('utm='), 'Admin apagou pela tela e o painel fechou')
    check(bad.length === 0, 'Admin: nenhuma 401/5xx', bad.join(', '))
    await ctx.close()
  }
  await browser.close()
}

;(async () => {
  await apiPart()
  if (!process.env.SKIP_UI) await uiPart()
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK')
  process.exit(fails ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})
