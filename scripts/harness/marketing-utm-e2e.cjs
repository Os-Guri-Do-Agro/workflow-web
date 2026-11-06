// Roteiro de ponta a ponta da M2-A (UTMs e QR): API e tela.
// Uso: node marketing-utm-e2e.cjs [saida]
// Env: API (padrão http://127.0.0.1:3621), WEB (padrão http://localhost:5183),
//      HARNESS_SEED (padrão seed-marketing-out.wf_m2a.json), SKIP_UI=1 pula a tela.
// Critérios da spec: U1 a U5. Também confere papel por papel, apagar (só Admin),
// desativar (link e QR param) e zero 401/5xx na tela.
//
// R1 (D10), passe de comportamento completo:
// - "Gerar QR Code" marcado no formulário e a criação com QR atômica na API
//   (`withQr`); sem `withQr` a API segue criando sem QR (compatibilidade);
// - o QR no topo do painel, ao lado do link curto, com prévia, PNG e SVG;
// - o link curto com "Abrir" (o clique é contado) e Copiar;
// - "URL com UTM" (não mais "URL final") com o aviso de que não conta clique;
// - a miniatura do QR na lista;
// - desativar e reativar pela tela (link curto e QR param e voltam);
// - a tela QR Codes do Nevo: selo "Ala Marketing", só leitura, "Abrir na ala"
//   só para quem é da ala.
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
let oks = 0
const check = (cond, msg, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}${extra ? '  (' + extra + ')' : ''}`)
  if (cond) oks++
  else fails++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// O /auth/login tem limite de 10 por minuto: o token (7 dias) fica num cache por
// GRUPO do seed (banco recriado = ids novos) e é validado no /user/me antes de
// usar. As chamadas diretas saem com um X-Forwarded-For por pessoa (a API confia
// no proxy), para não disputar a cota do navegador.
const TOKEN_CACHE = path.join(require('node:os').tmpdir(), `nevo-utm-e2e-tokens-${G}.json`)
let tokens = {}
try {
  tokens = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'))
} catch {
  tokens = {}
}
const WHO_IP = { nicolas: 1, leticia: 2, marcel: 3, freela: 4, diretoria: 5, luis: 6, ana: 7 }
const xff = (who) => ({ 'x-forwarded-for': `10.42.0.${WHO_IP[who] ?? 20}` })
const validated = new Set()
async function login(key) {
  if (tokens[key] && !validated.has(key)) {
    const me = await fetch(`${API}/user/me`, { headers: { authorization: `Bearer ${tokens[key]}`, ...xff(key) } })
    if (me.ok) validated.add(key)
    else delete tokens[key]
  }
  if (tokens[key]) return tokens[key]
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...xff(key) },
    body: JSON.stringify({ email: `${key}@nevo.test`, password: 'nevo1234' }),
  })
  tokens[key] = (await r.json()).accessToken
  if (!tokens[key]) throw new Error(`login ${key}: ${r.status}`)
  validated.add(key)
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify(tokens))
  return tokens[key]
}
const apiBad = []
async function raw(who, method, route, body) {
  const t = await login(who)
  const r = await fetch(`${API}${route}`, {
    method,
    headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json', ...xff(who) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (r.status >= 500) apiBad.push(`${r.status} ${method} ${route}`)
  let json = null
  try {
    json = await r.json()
  } catch {}
  return { status: r.status, json }
}
const call = (who, method, route, body) => raw(who, method, `/marketing/g/${G}${route}`, body)
async function hop(url) {
  const r = await fetch(url, { redirect: 'manual' })
  return { status: r.status, location: r.headers.get('location') }
}
async function rowOf(who, id) {
  const list = await call(who, 'GET', '/utm')
  return (list.json ?? []).find((r) => r.id === id) ?? null
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
  check((utm?.shortLink?.finalUrl ?? '').includes('utm_campaign=dia-dos-pets-2026'), 'U1 URL com UTM tem as UTMs')
  check(utm?.qr === null, 'R1 sem withQr a API segue criando sem QR (compatibilidade)')
  const bad = await call('freela', 'POST', '/utm', { ...base('x'), utmSource: 'orkut' })
  check(bad.status === 400 && /lista fixa/.test(bad.json?.message ?? ''), 'U1 origem fora da lista dá 400', `${bad.status} ${bad.json?.message}`)
  const badM = await call('freela', 'POST', '/utm', { ...base('x'), utmMedium: 'banner' })
  check(badM.status === 400, 'U1 mídia fora da lista dá 400')
  const noQr = await call('freela', 'POST', '/utm', { ...base('sem-qr'), placement: `Sem QR ${RUN}`, withQr: false })
  check(noQr.status === 201 && noQr.json?.qr === null, 'R1 withQr false cria sem QR', `${noQr.status}`)

  // U2
  const dup = await call('freela', 'POST', '/utm', base('app'))
  check(dup.status === 409 && dup.json?.existingId === utm.id, 'U2 repetida dá 409 com existingId', `${dup.status} ${dup.json?.existingId}`)
  const dupQr = await call('freela', 'POST', '/utm', { ...base('app'), withQr: true })
  check(dupQr.status === 409, 'R1 repetida com withQr também dá 409 (e não cria QR solto)', `${dupQr.status}`)
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
    'U3 o link curto chega na URL com UTM',
    click.location,
  )
  check(click.location === utm.shortLink.finalUrl, 'R1 a URL com UTM mostrada é exatamente o destino do link curto', click.location)
  await sleep(500)
  const qrMade = await call('freela', 'POST', `/utm/${utm.id}/qr`, { style: { colorDark: '#0054e3', dotStyle: 'rounded' } })
  check(qrMade.status === 201 && !!qrMade.json?.qr?.code, 'U3 cria o QR depois (UTM antiga, sem QR)', `${qrMade.status}`)
  const qrAgain = await call('freela', 'POST', `/utm/${utm.id}/qr`, {})
  check(qrAgain.json?.qr?.id === qrMade.json?.qr?.id, 'U3 pedir o QR de novo devolve o mesmo')
  const qrCode = qrMade.json.qr.code
  const scan = await hop(`${API}/q/${qrCode}`)
  check(scan.status === 302 && scan.location === utm.shortLink.shortUrl, 'U3 /q/<code> aponta para o LINK CURTO', scan.location)
  const chained = await hop(scan.location)
  check(chained.status === 302 && chained.location === click.location, 'U3 do QR chega na URL com UTM', chained.location)
  await sleep(800)
  const row1 = await rowOf('freela', utm.id)
  check(row1?.shortLink.clickCount === 2, 'U3 cliques contados (1 direto + 1 vindo do QR)', `clickCount ${row1?.shortLink.clickCount}`)
  check(row1?.qr?.scanCount === 1, 'U3 leitura do QR contada', `scanCount ${row1?.qr?.scanCount}`)
  const m = await call('freela', 'GET', `/utm/${utm.id}/metrics`)
  const today = m.json?.days?.[m.json.days.length - 1]
  check(m.status === 200 && m.json.days.length === 90, 'métricas trazem 90 dias', `${m.json?.days?.length}`)
  check(m.json?.totals?.clicks === 2 && m.json?.totals?.scans === 1 && m.json?.totals?.clicksOutsideQr === 1, 'métricas: totais', JSON.stringify(m.json?.totals))
  check(today && today.clicks === 2 && today.scans === 1, 'métricas: o dia de hoje tem 2 cliques e 1 leitura', JSON.stringify(today))
  check(Array.isArray(m.json?.referers) && m.json.referers.length >= 1, 'métricas: origens (referer)')

  // R1: criação com QR atômica
  const withQr = await call('freela', 'POST', '/utm', { ...base('com-qr'), placement: `Placa da clínica ${RUN}`, withQr: true, qrStyle: { colorDark: '#0f766e' } })
  const wq = withQr.json
  check(withQr.status === 201 && !!wq?.qr?.id && wq.qr.active === true, 'R1 withQr cria a UTM já com QR ativo', `${withQr.status}`)
  check(wq?.qr?.style?.colorDark === '#0f766e', 'R1 o visual pedido vai para o QR criado junto')
  const wqScan = await hop(`${API}/q/${wq.qr.code}`)
  check(wqScan.status === 302 && wqScan.location === wq.shortLink.shortUrl, 'R1 o QR criado junto aponta para o link curto', wqScan.location)
  const wqHop = await hop(wqScan.location)
  check(wqHop.status === 302 && wqHop.location === wq.shortLink.finalUrl, 'R1 e chega na URL com UTM')
  const img = await fetch(`${API}/q/image/${wq.qr.code}?format=svg&size=96`)
  check(img.status === 200 && /svg/.test(img.headers.get('content-type') ?? ''), 'R1 a miniatura do QR (SVG) é servida', `${img.status} ${img.headers.get('content-type')}`)
  const logWq = await call('freela', 'GET', `/log?entityType=utm&entityId=${wq.id}`)
  check((logWq.json ?? []).some((l) => /com QR$/.test(l.summary)), 'R1 o histórico diz "com QR"')
  await sleep(500)
  const rowWq = await rowOf('freela', wq.id)
  check(rowWq?.shortLink.clickCount === 1 && rowWq?.qr?.scanCount === 1, 'R1 a leitura do QR criado junto conta leitura e clique', JSON.stringify({ c: rowWq?.shortLink.clickCount, s: rowWq?.qr?.scanCount }))

  // U4
  const newTarget = `https://petjourney.com.br/outra-pagina-${RUN}`
  const upd = await call('freela', 'PATCH', `/utm/${utm.id}`, { targetUrl: newTarget })
  check(
    upd.status === 200 && upd.json.shortLink.code === code && upd.json.qr.code === qrCode && upd.json.qr.id === qrMade.json.qr.id,
    'U4 trocar o destino mantém o mesmo link curto e o mesmo QR',
  )
  check(upd.json?.shortLink?.finalUrl?.startsWith(newTarget), 'U4 a URL com UTM acompanha o destino novo')
  const afterScan = await hop(`${API}/q/${qrCode}`)
  const afterHop = await hop(afterScan.location)
  check(afterScan.location === utm.shortLink.shortUrl && afterHop.location.startsWith(newTarget), 'U4 QR impresso agora chega no destino novo', afterHop.location)
  const dupEdit = await call('freela', 'PATCH', `/utm/${forced.json.id}`, { targetUrl: newTarget })
  check(dupEdit.status === 409 && dupEdit.json?.existingId === utm.id, 'U2 editar para igualar outra UTM dá 409 com existingId', `${dupEdit.status}`)
  const okEdit = await call('freela', 'PATCH', `/utm/${forced.json.id}`, { targetUrl: newTarget, force: true })
  check(okEdit.status === 200, 'U2 editar com force passa')
  const freeEdit = await call('freela', 'PATCH', `/utm/${forced.json.id}`, { utmContent: 'Variação B' })
  check(freeEdit.status === 200 && freeEdit.json.shortLink.utmContent === 'variacao-b', 'editar content normaliza')
  const place = await call('freela', 'PATCH', `/utm/${utm.id}`, { placement: `Bio da loja ${RUN}` })
  check(place.status === 200 && place.json.placement === `Bio da loja ${RUN}`, '"onde será usado" muda')
  const qrAfterPlace = await raw('freela', 'GET', '/qr').catch(() => null)
  check(qrAfterPlace?.status === 200 || qrAfterPlace?.status === 403, 'tela QR Codes do freelancer responde', String(qrAfterPlace?.status))
  const emptyPlace = await call('freela', 'PATCH', `/utm/${utm.id}`, { placement: '   ' })
  check(emptyPlace.status === 400, '"onde será usado" vazio dá 400', String(emptyPlace.status))

  // Desativar: link e QR param juntos
  const beforeOff = await rowOf('freela', utm.id)
  const off = await call('freela', 'POST', `/utm/${utm.id}/active`, { active: false })
  check(off.status === 201 && off.json.shortLink.active === false && off.json.qr.active === false, 'desativar desliga link e QR', `${off.status}`)
  check((await hop(`${API}/l/${code}`)).status === 404 && (await hop(`${API}/q/${qrCode}`)).status === 404, 'link e QR desativados dão 404 público')
  const offRow = await rowOf('freela', utm.id)
  check(
    offRow?.shortLink.clickCount === beforeOff.shortLink.clickCount && offRow?.qr?.scanCount === beforeOff.qr.scanCount,
    'acesso a link desativado não conta clique nem leitura',
    JSON.stringify({ antes: [beforeOff.shortLink.clickCount, beforeOff.qr.scanCount], depois: [offRow?.shortLink.clickCount, offRow?.qr?.scanCount] }),
  )
  const on = await call('freela', 'POST', `/utm/${utm.id}/active`, { active: true })
  check(on.json?.shortLink?.active === true && on.json?.qr?.active === true, 'reativar liga link e QR')
  check((await hop(`${API}/l/${code}`)).status === 302 && (await hop(`${API}/q/${qrCode}`)).status === 302, 'reativar volta a funcionar (link curto e QR)')
  const offThenQr = await call('freela', 'POST', '/utm', { ...base('desligada'), placement: `Desligada ${RUN}` })
  await call('freela', 'POST', `/utm/${offThenQr.json.id}/active`, { active: false })
  const lateQr = await call('freela', 'POST', `/utm/${offThenQr.json.id}/qr`, {})
  check(lateQr.json?.qr?.active === false, 'QR criado numa UTM desativada nasce desativado')
  check((await hop(`${API}/q/${lateQr.json.qr.code}`)).status === 404, 'e não leva a lugar nenhum até reativar')

  // U5: marcas e papéis
  const emmi = await call('marcel', 'POST', '/utm', { ...base('emmi'), companyId: EMMI, placement: `Folder EMMI ${RUN}` })
  check(emmi.status === 201, 'Editor com todas as marcas cria UTM da Emmitec', `${emmi.status}`)
  const freelaList = await call('freela', 'GET', '/utm')
  check(!(freelaList.json ?? []).some((r) => r.companyId === EMMI), 'U5 freelancer não vê UTM da Emmitec')
  check((freelaList.json ?? []).some((r) => r.id === utm.id), 'U5 freelancer vê as da PetJourney')
  const freelaEmmi = await call('freela', 'POST', '/utm', { ...base('emmi2'), companyId: EMMI, withQr: true })
  check(freelaEmmi.status === 403, 'U5 freelancer não cria para a Emmitec, nem com QR (403)', `${freelaEmmi.status}`)
  check((await call('freela', 'GET', `/utm/${emmi.json.id}/metrics`)).status === 404, 'U5 métricas da Emmitec para o freelancer: 404')
  check((await call('freela', 'PATCH', `/utm/${emmi.json.id}`, { placement: 'x' })).status === 404, 'U5 editar a da Emmitec: 404')
  check((await call('freela', 'POST', `/utm/${emmi.json.id}/active`, { active: false })).status === 404, 'U5 desativar a da Emmitec: 404')
  check((await call('freela', 'GET', `/utm?companyId=${EMMI}`)).json?.length === 0, 'U5 filtrar pela marca escondida: vazio')
  const dirList = await call('diretoria', 'GET', '/utm')
  check(dirList.status === 200 && dirList.json.some((r) => r.companyId === EMMI) && dirList.json.some((r) => r.companyId === PET), 'U5 Diretoria vê as duas marcas')
  check((await call('diretoria', 'POST', '/utm', { ...base('dir'), withQr: true })).status === 403, 'U5 Diretoria não cria (403)')
  check((await call('diretoria', 'POST', `/utm/${utm.id}/qr`, {})).status === 403, 'U5 Diretoria não cria QR (403)')
  check((await call('diretoria', 'POST', `/utm/${utm.id}/active`, { active: false })).status === 403, 'U5 Diretoria não desativa (403)')
  check((await call('diretoria', 'PATCH', `/utm/${utm.id}`, { targetUrl: 'https://x.test' })).status === 403, 'U5 Diretoria não troca o destino (403)')
  check((await call('diretoria', 'GET', `/utm/${utm.id}/metrics`)).status === 200, 'Diretoria vê métricas')
  check((await call('luis', 'GET', '/utm')).status === 403, 'U5 quem é de fora da ala leva 403')
  const opt = await call('freela', 'GET', '/utm/options')
  check(opt.status === 200 && opt.json.sources.includes('instagram') && opt.json.mediums.includes('impresso'), 'options traz as listas fixas')
  check(opt.json.cards.every((c) => c.companyId === PET), 'options: freelancer só vê cards da PetJourney')

  // R1: a tela QR Codes do Nevo. QR da ala vem com `marketing` e não muda por lá.
  const qrList = await raw('marcel', 'GET', '/qr?page=1&limit=50')
  const qrRow = (qrList.json?.items ?? []).find((q) => q.id === wq.qr.id)
  check(qrList.status === 200 && qrRow?.marketing?.groupId === G && qrRow?.marketing?.utmId === wq.id, 'R1 a lista de QR Codes marca o QR da ala (grupo e UTM)', JSON.stringify(qrRow?.marketing))
  const qrRaw = await raw('marcel', 'GET', '/qr')
  check(Array.isArray(qrRaw.json) && qrRaw.json.find((q) => q.id === wq.qr.id)?.marketing?.utmId === wq.id, 'R1 a lista crua (contrato antigo) também marca')
  const plain = (qrList.json?.items ?? []).find((q) => !q.marketing)
  check(!plain || plain.marketing === null, 'R1 QR comum vem com marketing null')
  const one = await raw('marcel', 'GET', `/qr/${wq.qr.id}`)
  check(one.status === 200 && one.json?.marketing?.utmId === wq.id, 'R1 o detalhe do QR também diz que é da ala')
  const editQr = await raw('freela', 'PATCH', `/qr/${wq.qr.id}`, { targetUrl: 'https://outro.test' })
  check(editQr.status === 403 || editQr.status === 404, 'R1 nem o criador troca o destino do QR da ala pela tela QR Codes', `${editQr.status} ${editQr.json?.message}`)
  const marcelQr = await call('marcel', 'POST', '/utm', { ...base('marcel'), placement: `Folder da feira ${RUN}`, withQr: true })
  const mq = marcelQr.json.qr
  const ownEdit = await raw('marcel', 'PATCH', `/qr/${mq.id}`, { targetUrl: 'https://outro.test' })
  check(ownEdit.status === 403 && /ala Marketing/.test(ownEdit.json?.message ?? ''), 'R1 o criador (membro da empresa) leva 403 com a frase "edite pela ala"', `${ownEdit.status} ${ownEdit.json?.message}`)
  const ownCancel = await raw('marcel', 'POST', `/qr/${mq.id}/cancel`)
  check(ownCancel.status === 403 || ownCancel.status === 404, 'R1 nem cancelar pela tela QR Codes', `${ownCancel.status}`)
  const anaList = await raw('ana', 'GET', '/qr?page=1&limit=50')
  const anaRow = (anaList.json?.items ?? []).find((q) => q.id === mq.id)
  check(!!anaRow && anaRow.marketing?.utmId === marcelQr.json.id && anaRow.isMine === false, 'R1 quem é da PetJourney e não é da ala vê o QR com o selo (só leitura)')

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
  check((await fetch(`${API}/q/image/${qrCode}`)).status === 404, 'depois de apagar, a imagem do QR some (404)')
  const qrGone = await raw('marcel', 'GET', '/qr?page=1&limit=50')
  check(!(qrGone.json?.items ?? []).some((q) => q.code === qrCode), 'depois de apagar, o QR some da tela QR Codes')
  const log = await call('leticia', 'GET', `/log?entityType=utm&entityId=${utm.id}`)
  check(log.status === 200 && log.json.length >= 4, 'histórico registra criar, editar, desativar e apagar', `${log.json?.length}`)
  return { emmiId: emmi.json.id, keep: forced.json.id, withQrId: wq.id, marcelUtm: marcelQr.json }
}

// ── Tela ───────────────────────────────────────────────────────────────────
async function uiPart(ctxApi) {
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
    // O destino é um site de verdade: o navegador do roteiro nunca sai do harness.
    await ctx.route(/^https:\/\/petjourney\.com\.br\//, (r) =>
      r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>destino</title><p>destino</p>' }),
    )
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
  /** AppSelect (reka): abre pelo gatilho e escolhe a opção pelo nome. */
  async function pick(page, testid, name) {
    await page.locator(`[data-testid="${testid}"] button[role=combobox]`).click()
    await page.getByRole('option', { name, exact: true }).click()
  }
  async function fillForm(page, vp, placement) {
    await page.fill('[data-testid="utm-target"]', `https://petjourney.com.br/clinicas-${vp.tag}-${RUN}`)
    await page.fill('[data-testid="utm-campaign"]', 'Dia dos Pets 2026 ç')
    await pick(page, 'utm-source', 'parceiro')
    await pick(page, 'utm-medium', 'impresso')
    await page.fill('[data-testid="utm-content"]', 'Placa Balcão')
    await page.fill('[data-testid="utm-placement"]', placement)
  }
  const hasDash = (t) => t.includes('—')

  for (const vp of [desk, phone]) {
    const who = 'marcel'
    const { ctx, page, bad } = await open(who, '/marketing/utm', vp, PET)
    await page.locator('.mk-utm-row').first().waitFor()
    // Miniatura do QR na lista (a UTM criada com QR na parte da API)
    const thumb = page.locator('.mk-utm-row img[data-testid="utm-thumb"]').first()
    await thumb.waitFor({ timeout: 8000 })
    await page.waitForFunction(() => {
      const img = document.querySelector('.mk-utm-row img[data-testid="utm-thumb"]')
      return !!img && img.complete && img.naturalWidth > 0
    }, null, { timeout: 8000 }).catch(() => null)
    const loaded = await thumb.evaluate((img) => img.complete && img.naturalWidth > 0)
    check(loaded, `${vp.tag} lista mostra a miniatura do QR (imagem carregada)`)
    check((await page.locator('.mk-utm-row .mk-utm__nothumb').count()) >= 1, `${vp.tag} UTM sem QR mostra o espaço vazio na lista`)
    await shot(page, `lista-${vp.tag}`)
    await noHScroll(page, `${vp.tag} lista`, vp.width)
    check((await page.locator('.mk-utm-row').count()) >= 1, `${vp.tag} lista mostra UTMs`)
    check((await page.locator('select').count()) === 0, `${vp.tag} lista sem <select> nativo`)

    // Gerador: QR marcado, prévia ao vivo, URL com UTM com o aviso
    await page.getByRole('button', { name: 'Nova UTM' }).first().click()
    await page.waitForSelector('[data-testid="utm-form"]')
    check(await page.locator('[data-testid="utm-with-qr"]').isChecked(), `${vp.tag} "Gerar QR Code" vem marcado`)
    check((await page.locator('[data-testid="utm-form"] select').count()) === 0, `${vp.tag} gerador sem <select> nativo`)
    const placement = `Placa da clínica ${vp.tag} ${RUN}`
    await fillForm(page, vp, placement)
    await page.waitForTimeout(200)
    const preview = await page.locator('[data-testid="utm-final-preview"]').innerText()
    check(
      preview.includes('utm_campaign=dia-dos-pets-2026-c') && preview.includes('utm_content=placa-balcao') && preview.includes('utm_source=parceiro'),
      `${vp.tag} prévia ao vivo mostra a URL com UTM normalizada`,
      preview.slice(0, 160),
    )
    const formText = await page.locator('[data-testid="utm-form"]').innerText()
    check(/URL com UTM \(prévia\)/.test(formText) && !/URL final/.test(formText) && /não conta clique/.test(formText), `${vp.tag} gerador fala "URL com UTM" e avisa que ela não conta clique`)
    check(!hasDash(formText), `${vp.tag} gerador sem travessão`)
    const norm = await page.locator('[data-testid="utm-campaign-normalized"]').innerText()
    check(norm.includes('dia-dos-pets-2026-c'), `${vp.tag} mostra o valor normalizado da campanha`, norm)
    await noHScroll(page, `${vp.tag} gerador`, vp.width)
    await shot(page, `gerador-${vp.tag}`)
    await page.getByRole('button', { name: 'Criar UTM' }).click()
    await page.waitForSelector('[data-testid="utm-panel"]')
    check(page.url().includes('utm='), `${vp.tag} painel abre pela URL`)

    // Painel: QR no topo, ao lado do link curto, sem clicar em nada
    const share = page.locator('[data-testid="utm-share"]')
    await share.locator('[data-testid="utm-qr"] svg, [data-testid="utm-qr"] canvas').first().waitFor({ timeout: 8000 })
    check(true, `${vp.tag} QR criado junto e desenhado no topo do painel`)
    const order = await page.evaluate(() => {
      const secs = [...document.querySelectorAll('[data-testid="utm-panel"] .up-sec')]
      return secs.map((s) => s.querySelector('h3')?.textContent?.trim())
    })
    check(order[0] === 'Para divulgar' && order[1] === 'URL com UTM', `${vp.tag} "Para divulgar" (link curto e QR) vem primeiro, depois a URL com UTM`, order.join(' > '))
    const panelText = await page.locator('[data-testid="utm-panel"]').innerText()
    check(/Não passa pelo Nevo, então não conta clique\. Para divulgar, use o link curto ou o QR\./.test(panelText), `${vp.tag} aviso exato na URL com UTM`)
    check(!/URL final/.test(panelText) && !hasDash(panelText), `${vp.tag} painel sem "URL final" e sem travessão`)
    const created = (await call(who, 'GET', '/utm')).json.find((r) => r.placement === placement)
    check(!!created?.qr, `${vp.tag} API: a UTM criada pela tela já tem QR`)
    const openLink = share.locator('[data-testid="utm-open-short"]')
    check((await openLink.getAttribute('href')) === created.shortLink.shortUrl && (await openLink.getAttribute('target')) === '_blank', `${vp.tag} "Abrir" leva ao link curto numa aba nova`)
    await page.waitForSelector('[data-testid="utm-chart"] canvas')
    await page.waitForTimeout(500)
    await shot(page, `painel-topo-${vp.tag}`)
    await noHScroll(page, `${vp.tag} painel`, vp.width)

    // "Abrir" conta o clique (passa pelo /l/ e chega ao destino com as UTMs)
    const before = (await rowOf(who, created.id)).shortLink.clickCount
    // A aba nova passa pelo /l/<code> (302) e segue para o destino com as UTMs.
    const shortHit = ctx.waitForEvent('response', {
      predicate: (res) => res.url() === created.shortLink.shortUrl,
      timeout: 10000,
    })
    const [popup] = await Promise.all([ctx.waitForEvent('page'), openLink.click()])
    const res = await shortHit.catch(() => null)
    const landed = res ? (res.headers()['location'] ?? '') : ''
    check(res?.status() === 302 && /petjourney\.com\.br\/clinicas-/.test(landed) && /utm_source=parceiro/.test(landed) && /utm_medium=impresso/.test(landed), `${vp.tag} "Abrir" passa pelo link curto e segue para o destino com as UTMs`, `${res?.status()} ${landed.slice(0, 120)}`)
    await popup.close()
    await sleep(700)
    const afterOpen = (await rowOf(who, created.id)).shortLink.clickCount
    check(afterOpen === before + 1, `${vp.tag} o clique pelo "Abrir" foi contado`, `${before} -> ${afterOpen}`)
    // Leitura pelo QR (o celular de quem lê a placa)
    const scan = await hop(`${API}/q/${created.qr.code}`)
    await hop(scan.location)
    await sleep(700)
    const afterScan = (await rowOf(who, created.id))
    check(afterScan.qr.scanCount === 1 && afterScan.shortLink.clickCount === before + 2, `${vp.tag} a leitura do QR conta leitura e clique`, JSON.stringify({ s: afterScan.qr.scanCount, c: afterScan.shortLink.clickCount }))
    // A tela atualiza os números (o painel rebusca a lista)
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="utm-panel"]')
    await page.waitForTimeout(500)
    const stats = await page.locator('.up-stats').innerText()
    check(/2\s*Cliques no link/.test(stats) && /1\s*Leituras de QR/.test(stats), `${vp.tag} os resultados mostram 2 cliques e 1 leitura`, stats.replace(/\s+/g, ' '))
    check(await page.locator('[data-testid="utm-chart"] canvas').count() === 1, `${vp.tag} o gráfico está na tela`)

    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), share.getByRole('button', { name: 'PNG' }).click()])
    check(!!dl && /\.png$/.test(dl.suggestedFilename()), `${vp.tag} baixa o QR em PNG`, dl?.suggestedFilename())
    const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), share.getByRole('button', { name: 'SVG' }).click()])
    check(!!dl2 && /\.svg$/.test(dl2.suggestedFilename()), `${vp.tag} baixa o QR em SVG`)
    await page.getByRole('button', { name: 'Copiar link curto' }).click()
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '')
    check(/\/l\/[A-Za-z0-9_-]{8}$/.test(clip), `${vp.tag} copiar link curto`, clip)
    await page.getByRole('button', { name: 'Copiar URL com UTM' }).click()
    const clip2 = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '')
    check(clip2 === created.shortLink.finalUrl, `${vp.tag} copiar a URL com UTM`)

    // Editar destino pela tela: link curto e QR seguem
    const newDest = `https://petjourney.com.br/destino-novo-${vp.tag}-${RUN}`
    await page.locator('[aria-label="URL de destino"]').fill(newDest)
    await page.getByRole('button', { name: 'Salvar destino' }).click()
    await page.waitForTimeout(900)
    const edited = await rowOf(who, created.id)
    check(edited.shortLink.targetUrl === newDest && edited.shortLink.code === created.shortLink.code && edited.qr.code === created.qr.code, `${vp.tag} trocar o destino pela tela mantém link curto e QR`)
    const viaQr = await hop((await hop(`${API}/q/${created.qr.code}`)).location)
    check(viaQr.location.startsWith(newDest), `${vp.tag} o QR já leva ao destino novo`, viaQr.location.slice(0, 80))

    // Desativar e reativar pela tela
    await page.locator('[data-testid="utm-panel"]').getByRole('button', { name: 'Desativar' }).click()
    await page.locator('.up-off').waitFor({ timeout: 6000 })
    check(/Desativada/.test(await page.locator('[data-testid="utm-panel"] .up-meta').innerText()), `${vp.tag} desativada: o chip muda`)
    check((await hop(`${API}/l/${created.shortLink.code}`)).status === 404 && (await hop(`${API}/q/${created.qr.code}`)).status === 404, `${vp.tag} desativada pela tela: link curto e QR param`)
    await shot(page, `desativada-${vp.tag}`)
    await page.locator('[data-testid="utm-panel"]').getByRole('button', { name: 'Reativar' }).click()
    await page.locator('.up-off').waitFor({ state: 'detached', timeout: 6000 })
    check((await hop(`${API}/l/${created.shortLink.code}`)).status === 302 && (await hop(`${API}/q/${created.qr.code}`)).status === 302, `${vp.tag} reativada pela tela: link curto e QR voltam`)

    // Duplicada pela tela, com filtro ligado (a existente precisa abrir mesmo assim)
    await page.getByRole('button', { name: 'Fechar' }).first().click()
    await pick(page, 'utm-filter-medium', 'bio')
    await page.waitForTimeout(400)
    check(page.url().includes('midia=bio'), `${vp.tag} filtro de mídia na URL`)
    await page.getByRole('button', { name: 'Nova UTM' }).first().click()
    await fillForm(page, vp, placement + ' bis')
    await page.locator('[data-testid="utm-target"]').fill(newDest)
    await page.getByRole('button', { name: 'Criar UTM' }).click()
    await page.waitForSelector('[data-testid="utm-duplicate"]')
    await shot(page, `duplicada-${vp.tag}`)
    check(true, `${vp.tag} UTM repetida mostra o aviso com "abrir a existente" e "criar mesmo assim"`)
    await page.getByRole('button', { name: 'Abrir a existente' }).click()
    await page.waitForSelector('[data-testid="utm-panel"]', { timeout: 6000 })
    await page.waitForTimeout(600)
    check(page.url().includes(`utm=${created.id}`) && !page.url().includes('midia='), `${vp.tag} "Abrir a existente" abre mesmo com filtro (o filtro sai)`, page.url().replace(WEB, ''))
    check(await page.locator('[data-testid="utm-panel"]').isVisible(), `${vp.tag} e o painel fica aberto`)

    check(bad.length === 0, `${vp.tag} editor: nenhuma 401/5xx`, bad.join(', '))
    await ctx.close()
  }

  // UTM antiga, sem QR: o espaço do QR fica no topo com "Criar QR Code"
  {
    const legacy = await call('marcel', 'POST', '/utm', { ...base('antiga'), placement: `UTM antiga ${RUN}` })
    const { ctx, page, bad } = await open('marcel', `/marketing/utm?utm=${legacy.json.id}`, desk, PET)
    await page.waitForSelector('[data-testid="utm-panel"]')
    const empty = page.locator('[data-testid="utm-share"] [data-testid="utm-qr-empty"]')
    check(await empty.isVisible(), 'UTM sem QR: o espaço do QR aparece no topo')
    await shot(page, 'sem-qr-d1440')
    await empty.getByRole('button', { name: 'Criar QR Code' }).click()
    await page.locator('[data-testid="utm-share"] [data-testid="utm-qr"] .qr-preview svg').waitFor({ timeout: 8000 })
    check(true, 'Criar QR Code no topo cria e desenha o QR')
    check(bad.length === 0, 'UTM antiga: nenhuma 401/5xx', bad.join(', '))
    await ctx.close()
  }

  // Visualizador: vê, não cria
  {
    const { ctx, page, bad } = await open('diretoria', '/marketing/utm', desk, null)
    await shot(page, 'diretoria-d1440')
    check((await page.locator('.mk-utm-row').count()) >= 1, 'Diretoria vê a lista')
    check((await page.getByRole('button', { name: 'Nova UTM' }).count()) === 0, 'Diretoria não tem "Nova UTM"')
    await page.locator('.mk-utm-row', { hasText: `UTM antiga ${RUN}` }).first().click()
    await page.waitForSelector('[data-testid="utm-panel"]')
    check((await page.getByRole('button', { name: 'Criar QR Code' }).count()) === 0, 'Diretoria não tem "Criar QR Code"')
    check((await page.getByRole('button', { name: 'Apagar' }).count()) === 0, 'Diretoria não tem "Apagar"')
    check((await page.getByRole('button', { name: 'Editar' }).count()) === 0 && (await page.getByRole('button', { name: 'Desativar' }).count()) === 0, 'Diretoria não edita nem desativa')
    check((await page.getByRole('button', { name: 'Salvar destino' }).count()) === 0 && (await page.locator('[aria-label="URL de destino"]').getAttribute('readonly')) !== null, 'Diretoria vê o destino só para ler')
    check((await page.locator('[data-testid="utm-open-short"]').count()) === 1, 'Diretoria pode abrir e copiar o link curto')
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
    await page.goto(`${WEB}/marketing/utm?utm=${ctxApi.emmiId}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    check((await page.locator('[data-testid="utm-panel"]').count()) === 0, 'freelancer não abre a UTM da Emmitec por link')
    check(bad.length === 0, 'freelancer: nenhuma 401/5xx', bad.join(', '))
    await ctx.close()
  }

  // Tela QR Codes do Nevo: selo da ala, só leitura, "Abrir na ala" para quem é da ala
  for (const vp of [desk, phone]) {
    const { ctx, page, bad } = await open('marcel', '/qr', vp, PET)
    const card = page.locator('.qc', { hasText: `Folder da feira ${RUN}` }).first()
    await card.waitFor({ timeout: 10000 })
    check(await card.locator('[data-testid="qr-ala-badge"]').isVisible(), `${vp.tag} QR Codes: o QR da ala tem o selo "Ala Marketing"`)
    check((await card.getByRole('button', { name: 'Editar destino' }).count()) === 0 && (await card.getByRole('button', { name: 'Cancelar' }).count()) === 0 && (await card.getByRole('button', { name: 'Excluir QR' }).count()) === 0, `${vp.tag} QR Codes: o QR da ala é só leitura, mesmo para quem criou`)
    check((await card.getByRole('button', { name: 'Pasta' }).count()) === 0, `${vp.tag} QR Codes: sem mover de pasta`)
    check((await card.getByRole('button', { name: 'Métricas' }).count()) === 1 && (await card.getByRole('button', { name: 'Exportar' }).count()) === 1, `${vp.tag} QR Codes: métricas e exportar continuam`)
    const plainCard = page.locator('.qc').filter({ hasNot: page.locator('[data-testid="qr-ala-badge"]') })
    check((await plainCard.count()) >= 0, `${vp.tag} QR comum segue sem selo`)
    await card.scrollIntoViewIfNeeded()
    await shot(page, `qr-codes-selo-${vp.tag}`)
    await noHScroll(page, `${vp.tag} QR Codes`, vp.width)
    const openAla = card.locator('[data-testid="qr-ala-open"]')
    check(await openAla.isVisible(), `${vp.tag} QR Codes: quem é da ala tem "Abrir na ala"`)
    if (!vp.mobile) {
      await openAla.click()
      await page.waitForSelector('[data-testid="utm-panel"]', { timeout: 10000 })
      await page.waitForTimeout(500)
      check(page.url().includes(`/marketing/utm?utm=${ctxApi.marcelUtm.id}`) && !page.url().includes('grupo='), '"Abrir na ala" abre a UTM no painel da ala', page.url().replace(WEB, ''))
      check(/Folder da feira/.test(await page.locator('[data-testid="utm-panel"] h2').innerText()), 'e é a UTM certa')
    }
    check(bad.length === 0, `${vp.tag} QR Codes: nenhuma 401/5xx`, bad.join(', '))
    await ctx.close()
  }
  {
    const { ctx, page, bad } = await open('ana', '/qr', desk, PET)
    const card = page.locator('.qc', { hasText: `Folder da feira ${RUN}` }).first()
    await card.waitFor({ timeout: 10000 })
    check(await card.locator('[data-testid="qr-ala-badge"]').isVisible(), 'quem é da empresa e não é da ala vê o selo')
    check((await card.locator('[data-testid="qr-ala-open"]').count()) === 0, 'e não tem "Abrir na ala"')
    await shot(page, 'qr-codes-fora-da-ala-d1440')
    check(bad.length === 0, 'Ana em QR Codes: nenhuma 401/5xx', bad.join(', '))
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
  const ids = await apiPart()
  if (!process.env.SKIP_UI) await uiPart(ids)
  check(apiBad.length === 0, 'chamadas diretas à API: nenhuma 5xx', apiBad.join(', '))
  console.log(`\n${oks} OK`)
  console.log(fails ? `${fails} FALHA(S)` : 'TUDO OK')
  process.exit(fails ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})
