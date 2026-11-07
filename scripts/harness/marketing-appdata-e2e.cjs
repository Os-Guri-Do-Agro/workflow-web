// Roteiro de ponta a ponta da M4 (dados do app) e da parte B da R2.
// Uso: node marketing-appdata-e2e.cjs [saida]
// Env:
//   API (padrão http://127.0.0.1:3661), WEB (padrão http://localhost:5261),
//   HARNESS_SEED (padrão seed-marketing-out.wf_m4.json), HARNESS_DB (padrão wf_m4),
//   PJ_DIR (padrão C:/TRABALHO/PetJourney/petjourney-api), PJ_DB (Postgres LOCAL da PetJourney,
//   padrão postgresql://postgres:postgres@127.0.0.1:55432/pj_m4), PJ_WEB (o petjourney-web em dev,
//   padrão http://localhost:3091; sem ele o passo do site fica marcado como pulado).
//   ONLY=a,b,c,d,e,f roda só as partes pedidas.
//
// O que prova (criterios da M4 e da parte B, com o contrato de 07/11):
//   A. token por marca: criar mostra UMA vez, só o hash guardado, papéis (Dono cria e revoga,
//      Admin vê, Editor e Visualizador não), rota pública fechada (401, 400, 413), e o corpo
//      fora do contrato recusado inteiro (UTM no dia, semana fora da segunda, semana em curso,
//      estoque nulo, a métrica da semana dentro de days, envio vazio); a tupla da semana que
//      não é UTM viva da marca vira utm:outras ao gravar;
//   B. do clique no link curto ao cadastro contado no funil POR SEMANA FECHADA: o link curto do
//      post (API do Nevo) leva ao SITE de verdade (petjourney-web em dev) com a UTM, o site grava
//      o primeiro toque e manda no cadastro, o cadastro passa pelo pipe e pelo UsuarioService de
//      verdade (banco local da PetJourney), o JOB de verdade manda os dias e a semana, e a área
//      Dados mostra o post no funil: 1 cadastro na semana vai para "Outras UTMs", 5 aparecem;
//      as linhas "Outras UTMs" e "Sem UTM", a semana em curso; reenviar não duplica (o dia nem a
//      semana); parceiro pelo /r/<codigo> conta no ranking sem contar duas vezes; comparação com
//      o período anterior = soma dos dias; estoques "cerca de" (arredondados para cima);
//
// O relógio do app (simulado ou o job de verdade, com --agora) fica na segunda-feira depois da
// última semana fechada: o "ontem" do app é o domingo dela, e o cadastro cai numa semana que já
// fechou (o funil lê a semana). Os cliques e a leitura do QR vão para esse domingo.
//   C. token revogado: 401 no envio e "Revogado" na tela; atraso de 36 h vira alerta;
//   D. sem dado: a área explica como conectar e a ala segue;
//   E. celular 375 px (sem rolagem lateral) e claro/escuro;
//   F. CSV e Looker Studio.
// Prints em prints/marketing-appdata/. Nunca toca produção: o site do app é interceptado e
// levado ao dev local, e todo host fora de localhost é abortado no navegador.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFile, execFileSync } = require('node:child_process')
const pg = require('pg')
const { createFakeApp, ymdBr, addDays, lastClosedSunday, mondayOf } = require('./fake-app.cjs')

const API = process.env.API ?? 'http://127.0.0.1:3661'
const WEB = process.env.WEB ?? 'http://localhost:5261'
const PJ_DIR = process.env.PJ_DIR ?? 'C:/TRABALHO/PetJourney/petjourney-api'
const PJ_DB = process.env.PJ_DB ?? 'postgresql://postgres:postgres@127.0.0.1:55432/pj_m4'
const PJ_WEB = process.env.PJ_WEB ?? 'http://localhost:3091'
const DB = process.env.HARNESS_DB ?? 'wf_m4'
const seed = JSON.parse(
  fs.readFileSync(process.env.HARNESS_SEED ?? path.join(__dirname, `seed-marketing-out.${DB}.json`), 'utf8'),
)
const out = process.argv[2] ?? path.join(__dirname, 'prints', 'marketing-appdata')
fs.mkdirSync(out, { recursive: true })
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean)
const want = (p) => !ONLY.length || ONLY.includes(p)
const G = seed.groupId
const PET = seed.companies.pet
const EMMI = seed.companies.emmitec
const RUN = Date.now().toString(36)
// real (padrão): a PetJourney de verdade no harness (site em dev, UsuarioService e job no pj_m4).
// simulado: o app falso de fake-app.cjs faz o papel da PetJourney; prova só o lado do Nevo.
const SIM = (process.env.PJ_MODE ?? 'real') === 'simulado'
let fake = null
// O "ontem" do app: o domingo da última semana fechada; o "hoje" dele, a segunda seguinte.
const TODAY = ymdBr()
const APP_ONTEM = lastClosedSunday(TODAY)
const APP_HOJE = addDays(APP_ONTEM, 1)
const SEMANA = { from: mondayOf(APP_ONTEM), to: APP_ONTEM }
/** 03:15 de Brasília na segunda do app: o --agora do job de verdade (modo real). */
const PJ_AGORA = `${APP_HOJE}T06:15:00.000Z`
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
const ddmm = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`

let fails = 0
let oks = 0
const check = (cond, msg, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}${extra ? '  (' + extra + ')' : ''}`)
  if (cond) oks++
  else fails++
}

if (!/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):/.test(PJ_DB)) throw new Error('PJ_DB tem de ser o Postgres local do harness')

// ── Sessões (o /auth/login limita 10 por minuto: token em cache por grupo) ──
const TOKEN_CACHE = path.join(os.tmpdir(), `nevo-appdata-e2e-tokens-${G}.json`)
let tokens = {}
try {
  tokens = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'))
} catch {
  tokens = {}
}
const WHO_IP = { nicolas: 1, leticia: 2, marcel: 3, freela: 4, diretoria: 5 }
const xff = (who) => ({ 'x-forwarded-for': `10.61.0.${WHO_IP[who] ?? 20}` })
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
// Conexão parada (o roteiro espera o job da PetJourney por dezenas de segundos) pode ser
// fechada pela API no meio do reaproveitamento: tenta de novo uma vez (só erro de rede).
async function fetchRetry(url, init) {
  try {
    return await fetch(url, init)
  } catch (e) {
    if (!/fetch failed/.test(String(e?.message))) throw e
    await new Promise((r) => setTimeout(r, 300))
    return fetch(url, init)
  }
}
const apiBad = []
async function raw(who, method, route, body) {
  const t = await login(who)
  const r = await fetchRetry(`${API}${route}`, {
    method,
    headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json', ...xff(who) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (r.status >= 500) apiBad.push(`${r.status} ${method} ${route}`)
  let json = null
  const text = await r.text()
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: r.status, json }
}
const call = (who, method, route, body) => raw(who, method, `/marketing/g/${G}${route}`, body)

async function publicPost(token, body, extraHeaders = {}) {
  const r = await fetchRetry(`${API}/public/marketing/app-metrics`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'x-forwarded-for': `10.61.1.${Math.floor(Math.random() * 200) + 2}`,
      ...extraHeaders,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  let json = null
  try {
    json = await r.json()
  } catch {}
  return { status: r.status, json }
}

// ── A PetJourney do harness (job e cadastros de verdade, banco local) ──
let appToken = null
/**
 * Igual ao pj(), sem travar o processo. Dentro de um handler do Playwright o
 * execFileSync congela o próprio navegador, e o clique que disparou o handler estoura.
 */
function pjAsync(args) {
  const env = { ...process.env, PJ_HARNESS_DB_URL: PJ_DB, NEVO_API_URL: API, NEVO_API_TOKEN: appToken ?? '' }
  return new Promise((resolve, reject) => {
    execFile(
      'npx',
      ['tsx', 'scripts/nevo/harness-envio.ts', ...args],
      { cwd: PJ_DIR, env, encoding: 'utf8', shell: true, timeout: 240_000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`harness ${args.join(' ')}: ${stderr || err.message}`))
        resolve({ ok: true, json: JSON.parse(stdout.trim().split('\n').filter(Boolean).pop()) })
      },
    )
  })
}
function pj(args, { allowFail = false } = {}) {
  const env = {
    ...process.env,
    PJ_HARNESS_DB_URL: PJ_DB,
    NEVO_API_URL: API,
    NEVO_API_TOKEN: appToken ?? '',
  }
  try {
    const stdout = execFileSync('npx', ['tsx', 'scripts/nevo/harness-envio.ts', ...args], {
      cwd: PJ_DIR,
      env,
      encoding: 'utf8',
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 240_000,
    })
    const line = stdout.trim().split('\n').filter(Boolean).pop()
    return { ok: true, json: JSON.parse(line) }
  } catch (e) {
    if (!allowFail) throw new Error(`harness ${args.join(' ')}: ${e.stderr || e.message}`)
    return { ok: false, stderr: String(e.stderr ?? e.message) }
  }
}

const nevoDb = () => new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
async function nevoQuery(sql, params = []) {
  const c = nevoDb()
  await c.connect()
  try {
    return (await c.query(sql, params)).rows
  } finally {
    await c.end()
  }
}

const POST_UTM = {
  utmSource: 'instagram',
  utmMedium: 'organico',
  utmCampaign: `lancamento-app-${RUN}`,
  utmContent: 'carrossel-dor',
}
const TUPLE = `${POST_UTM.utmSource}|${POST_UTM.utmMedium}|${POST_UTM.utmCampaign}|${POST_UTM.utmContent}`
const ctx = {}

/** O envio diário: o job de verdade (real, com o relógio na segunda do app) ou o app simulado. */
async function appSend({ allowFail = false } = {}) {
  if (!SIM) return pj(['enviar', '--agora', PJ_AGORA], { allowFail })
  try {
    return { ok: true, json: await fake.send(appToken) }
  } catch (e) {
    if (!allowFail) throw e
    return { ok: false, stderr: String(e.message) }
  }
}

// ══ A. Token e rota pública ═══════════════════════════════════════════════
async function partA() {
  console.log('\n== A. Conexão com o app (token) e a rota pública ==')
  // Rodadas anteriores deixam tokens ativos; a marca aceita 5 (o 6o dá 400 com a frase).
  const old = await call('nicolas', 'GET', '/app-tokens')
  const active = (old.json ?? []).filter((t) => t.companyId === PET && !t.revoked)
  if (active.length >= 5) {
    const sixth = await call('nicolas', 'POST', '/app-tokens', { companyId: PET, name: 'sexto' })
    check(sixth.status === 400 && /5 tokens ativos/.test(sixth.json?.message ?? ''), 'A0 a marca não passa de 5 tokens ativos', sixth.json?.message)
  }
  for (const t of active) await call('nicolas', 'DELETE', `/app-tokens/${t.id}`)
  const created = await call('nicolas', 'POST', '/app-tokens', { companyId: PET, name: `Harness ${RUN}` })
  check(created.status === 201, 'A1 o Dono cria o token da PetJourney', `status ${created.status}`)
  appToken = created.json?.token
  ctx.tokenId = created.json?.id
  check(/^wfapp_[A-Za-z0-9_-]{40,}$/.test(appToken ?? ''), 'A1 o token completo vem na criação (wfapp_...)')
  check(created.json?.prefix === appToken?.slice(0, 12), 'A1 o prefixo é o começo do token', created.json?.prefix)
  const [row] = await nevoQuery('SELECT "tokenHash", prefix FROM "MarketingAppToken" WHERE id = $1', [ctx.tokenId])
  const sha = require('node:crypto').createHash('sha256').update(appToken).digest('hex')
  check(row?.tokenHash === sha, 'A1 o banco guarda SÓ o sha256 (nunca o token)')
  const listOwner = await call('nicolas', 'GET', '/app-tokens')
  const listText = JSON.stringify(listOwner.json)
  check(listOwner.status === 200 && !listText.includes(appToken) && !listText.includes(sha), 'A1 a lista nunca traz o token nem o hash')
  const admin = await call('leticia', 'GET', '/app-tokens')
  check(admin.status === 200, 'A2 o Admin vê a lista', `status ${admin.status}`)
  const adminCreate = await call('leticia', 'POST', '/app-tokens', { companyId: PET, name: 'x' })
  check(adminCreate.status === 403, 'A2 o Admin não cria token', `status ${adminCreate.status}`)
  const adminRevoke = await call('leticia', 'DELETE', `/app-tokens/${ctx.tokenId}`)
  check(adminRevoke.status === 403, 'A2 o Admin não revoga', `status ${adminRevoke.status}`)
  for (const who of ['marcel', 'diretoria']) {
    const r = await call(who, 'GET', '/app-tokens')
    check(r.status === 403, `A2 ${who === 'marcel' ? 'o Editor' : 'o Visualizador'} não vê os tokens`, `status ${r.status}`)
  }

  const valid = {
    payloadVersion: 1,
    generatedAt: new Date().toISOString(),
    timeZone: 'America/Sao_Paulo',
    days: [{ date: '2026-07-01', metrics: [{ metric: 'cadastros', dimension: '', value: 0 }] }],
  }
  const noAuth = await publicPost(null, valid)
  check(noAuth.status === 401 && /Authorization: Bearer wfapp_/.test(noAuth.json?.message ?? ''), 'A3 sem token: 401 com a frase de como mandar', noAuth.json?.message)
  const wrong = await publicPost('wfapp_naoexisteessetoken0000000000000000000', valid)
  check(wrong.status === 401 && /inválido/.test(wrong.json?.message ?? ''), 'A3 token errado: 401', wrong.json?.message)
  const qrToken = await publicPost('wfqr_' + appToken.slice(6), valid)
  check(qrToken.status === 401, 'A3 token de outra ferramenta (wfqr_) não entra', `status ${qrToken.status}`)
  const extra = await publicPost(appToken, { ...valid, usuarios: [{ email: 'a@b.co' }] })
  check(extra.status === 400, 'A3 chave a mais no corpo: 400 (DTO fechado)', JSON.stringify(extra.json?.message ?? '').slice(0, 120))
  const extraRow = await publicPost(appToken, {
    ...valid,
    days: [{ date: '2026-07-01', metrics: [{ metric: 'cadastros', dimension: '', value: 7, email: 'a@b.co' }] }],
  })
  check(extraRow.status === 400, 'A3 chave a mais dentro da linha: 400')
  const cell = await publicPost(appToken, {
    ...valid,
    days: [{ date: '2026-07-01', metrics: [{ metric: 'uso', dimension: 'funcao:vacina', value: 3 }] }],
  })
  check(cell.status === 400 && /1 a 4 precisa chegar nula/.test(JSON.stringify(cell.json?.message)), 'A3 célula de 1 a 4 com número: 400 (recorte)')
  const pii = await publicPost(appToken, {
    ...valid,
    days: [],
    weeks: [{ week: '2026-07-06', metrics: [{ metric: 'cadastros_semana', dimension: 'utm:a|b|ana@exemplo.com|d', value: 6 }] }],
  })
  check(pii.status === 400 && /dado pessoal/.test(JSON.stringify(pii.json?.message)), 'A3 e-mail numa dimensão: 400')

  // O corpo fora do contrato de 07/11 é recusado inteiro, com a frase do motivo.
  const W = '2026-07-06' // uma segunda-feira, semana fechada há tempo
  const weekOf = (week, rows) => ({ week, metrics: rows.map(([dimension, value]) => ({ metric: 'cadastros_semana', dimension, value })) })
  const goodWeek = weekOf(W, [['', 10], ['utm:sem_utm', 10], ['parceiro:sem_parceiro', 10]])
  const refusals = [
    ['A4 UTM por dia (saiu do dia: vai na semana)', { days: [{ date: '2026-07-01', metrics: [{ metric: 'cadastros', dimension: '', value: 10 }, { metric: 'cadastros', dimension: 'utm:sem_utm', value: 10 }] }] }, /"utm" não existe em cadastros/],
    ['A4 parceiro por dia', { days: [{ date: '2026-07-01', metrics: [{ metric: 'cadastros', dimension: '', value: 10 }, { metric: 'cadastros', dimension: 'parceiro:sem_parceiro', value: 10 }] }] }, /"parceiro" não existe em cadastros/],
    ['A4 a métrica da semana dentro de days', { days: [{ date: '2026-07-01', metrics: [{ metric: 'cadastros_semana', dimension: '', value: 10 }] }] }, /é da semana/],
    ['A4 semana que não começa na segunda', { days: [], weeks: [{ ...goodWeek, week: '2026-07-07' }] }, /não é segunda/],
    ['A4 semana em curso (ainda não fechou)', { days: [], weeks: [{ ...goodWeek, week: mondayOf(TODAY) }] }, /ainda não fechou/],
    ['A4 estoque nulo', { days: [{ date: '2026-07-01', metrics: [{ metric: 'pets', dimension: '', value: null }] }] }, /nunca chega nulo/],
    ['A4 estoque fora do 5 em 5', { days: [{ date: '2026-07-01', metrics: [{ metric: 'assinaturas_ativas', dimension: '', value: 33 }] }] }, /para cima, de 5 em 5/],
    ['A4 estoque por plano (saiu do contrato)', { days: [{ date: '2026-07-01', metrics: [{ metric: 'assinaturas_ativas', dimension: '', value: 35 }, { metric: 'assinaturas_ativas', dimension: 'plano:premium', value: 35 }] }] }, /"plano" não existe/],
    ['A4 envio vazio', { days: [], weeks: [] }, /envio vazio/],
  ]
  await nevoQuery('DELETE FROM "MarketingAppMetricDay" WHERE "companyId" = $1 AND date = ANY($2::text[])', [PET, [W, '2026-07-01']])
  for (const [label, body, msg] of refusals) {
    const r = await publicPost(appToken, { ...valid, ...body })
    const said = [].concat(r.json?.message ?? []).join(' | ')
    check(r.status === 400 && msg.test(said), `${label}: 400 com a frase`, said.slice(0, 160) || String(r.status))
  }
  const [noWeek] = await nevoQuery('SELECT count(*)::int AS n FROM "MarketingAppMetricDay" WHERE "companyId" = $1 AND date = ANY($2::text[])', [PET, [W, '2026-07-01']])
  // A tupla da semana que não é UTM viva da marca vira utm:outras ao gravar (o nome não fica no Nevo).
  const fold = await publicPost(appToken, {
    ...valid,
    days: [],
    weeks: [weekOf(W, [['', 10], ['utm:whatsapp|convite|convite-maria-oliveira|', 5], ['utm:sem_utm', 5], ['parceiro:sem_parceiro', 10]])],
  })
  const folded = await nevoQuery('SELECT metric, dimension, value FROM "MarketingAppMetricDay" WHERE "companyId" = $1 AND date = $2 ORDER BY 2', [PET, W])
  check(fold.status === 200 && fold.json?.weeks === 1, 'A5 a semana fechada entra (200, weeks: 1)', JSON.stringify(fold.json))
  check(
    folded.every((r) => r.metric === 'cadastros_semana') && folded.find((r) => r.dimension === 'utm:outras')?.value === 5 && !JSON.stringify(folded).includes('maria'),
    'A5 a semana vai na mesma tabela pela segunda-feira, e a tupla de fora vira utm:outras',
    JSON.stringify(folded.map((r) => [r.dimension, r.value])),
  )
  check(noWeek.n === 0, 'A4 os envios recusados não gravaram nada (nem o dia, nem a semana)', `${noWeek.n} linhas`)
  // Corpo de verdade com 1,1 MB (cabe no limite global de 2 MB; quem barra é a porta da rota,
  // antes de validar). Um content-length falso quebraria a conexão reaproveitada pelo fetch.
  const big = await publicPost(appToken, { ...valid, padding: 'x'.repeat(1_150_000) })
  check(big.status === 413 && /máximo é 1024 KB/.test(big.json?.message ?? ''), 'A3 corpo acima de 1 MB: 413 com a frase', big.json?.message)
  const [stillEmpty] = await nevoQuery('SELECT count(*)::int AS n FROM "MarketingAppMetricDay" WHERE "companyId" = $1 AND date = $2', [PET, '2026-07-01'])
  check(stillEmpty.n === 0, 'A3 nenhum envio recusado gravou nada')
}

// ══ B. Do clique ao funil ══════════════════════════════════════════════════
async function partB(browser) {
  console.log('\n== B. Do clique no link curto ao cadastro contado no funil ==')
  // A base falsa da PetJourney ("ontem" do app = domingo da última semana fechada): 30 cadastros,
  // parceiros com código, um link de fora da ala, pets, assinaturas.
  // O roteiro começa limpo do lado do Nevo (rodadas de outros dias deixam números na marca).
  await nevoQuery('DELETE FROM "MarketingAppMetricDay" WHERE "companyId" = $1 AND date >= $2', [PET, addDays(TODAY, -120)])
  let base
  if (SIM) {
    fake = createFakeApp(API)
    base = fake.base()
    // A semana ANTES da fechada (revisão B, Etapa 3): 1 cadastro com UTM de fora da ala e
    // parceiro com poucos, e 10 sem UTM nem indicação. O complemento é a única célula grande,
    // então o recorte o junta ao balde: vem utm:outras SEM utm:sem_utm (e parceiro:outros sem
    // parceiro:sem_parceiro), como no DEV de 07/11. A semana fechada segue com as duas linhas.
    const quarta = addDays(SEMANA.from, -5)
    fake.signup({ utm: 'tiktok|pago|fora-da-ala|video', parceiro: 'PJ-POUCO1|Pet Pouco', date: quarta })
    for (let i = 0; i < 10; i++) fake.signup({ date: quarta })
  } else {
    pj(['limpar'])
    base = pj(['semear', '--agora', PJ_AGORA]).json
  }
  ctx.ontem = base.ontem
  check(base.ontem === APP_ONTEM, 'B0 o "ontem" do app é o domingo da última semana fechada', `${base.ontem} (semana ${SEMANA.from} a ${SEMANA.to})`)
  check(base.cadastros === 30, SIM ? 'B0 base do app simulado (30 cadastros de ontem)' : 'B0 base falsa da PetJourney semeada no banco local', `ontem ${base.ontem}`)

  // O post e a UTM dele (Editor), com QR; o parceiro com a UTM que leva ao /r/ dele.
  const cardId = seed.cards.find((c) => /Carrossel/.test(c.title))?.id
  const utm = await call('marcel', 'POST', '/utm', {
    companyId: PET,
    targetUrl: 'https://petjourney.health/cadastro',
    ...POST_UTM,
    placement: `Post do carrossel ${RUN}`,
    cardId,
    withQr: true,
  })
  check(utm.status === 201, 'B1 o Editor cria a UTM do post (com QR)', `status ${utm.status} ${JSON.stringify(utm.json?.message ?? '')}`)
  ctx.utm = utm.json
  // O casado por NOME é reaproveitado de uma rodada anterior: dois com o mesmo nome deixariam o
  // casamento ambíguo (ele pega o primeiro), e o roteiro rodado de novo no mesmo banco falharia.
  // A clínica é nova a cada rodada (casa pela UTM da placa desta rodada, com os cliques dela).
  const partnerNamed = async (name, kind) => {
    const list = await call('marcel', 'GET', `/partners?companyId=${PET}&q=${encodeURIComponent(name)}`)
    const same = (Array.isArray(list.json) ? list.json : []).filter((p) => p.name === name && p.companyId === PET)
    if (same.length) return { status: 201, json: same.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0] }
    return call('marcel', 'POST', '/partners', { companyId: PET, name, kind })
  }
  const partner = await call('marcel', 'POST', '/partners', { companyId: PET, name: `Clínica Bicho Feliz`, kind: 'VET_CLINIC' })
  const partner2 = await partnerNamed('Pet Shop Amigo', 'PET_SHOP')
  check(partner.status === 201 && partner2.status === 201, 'B1 os parceiros existem no Nevo')
  ctx.partnerId = partner.json?.id
  ctx.partner2Id = partner2.json?.id
  const pUtm = await call('marcel', 'POST', '/utm', {
    companyId: PET,
    targetUrl: 'https://petjourney.health/r/PJ-CL1N1C',
    utmSource: 'parceiro',
    utmMedium: 'impresso',
    utmCampaign: 'clinicas',
    utmContent: 'bicho-feliz',
    placement: `Placa da clínica ${RUN}`,
    partnerId: ctx.partnerId,
    force: true,
  })
  check(pUtm.status === 201, 'B1 a UTM da placa da clínica aponta para o /r/PJ-CL1N1C dela', `status ${pUtm.status}`)

  // Cliques e uma leitura do QR (o QR passa pelo link curto).
  const code = ctx.utm.shortLink.code
  for (let i = 0; i < 7; i++) await fetchRetry(`${API}/l/${code}`, { redirect: 'manual', headers: { 'x-forwarded-for': `10.62.0.${i + 2}` } })
  const qr = await fetchRetry(`${API}/q/${ctx.utm.qr.code}`, { redirect: 'manual' })
  if (qr.headers.get('location')) await fetch(qr.headers.get('location'), { redirect: 'manual' })
  const pc = pUtm.json?.shortLink?.code
  for (let i = 0; i < 4; i++) await fetchRetry(`${API}/l/${pc}`, { redirect: 'manual', headers: { 'x-forwarded-for': `10.63.0.${i + 2}` } })

  // O clique de verdade, no navegador: link curto -> site do app (dev local) com a UTM.
  // (os cliques e a leitura voltam para o "ontem" do app no fim do passo: o funil conta a semana fechada)
  let corpoDoSite = null
  const email = `e2e-${RUN}@harness-m4.test`
  let siteOk = false
  try {
    const ping = await fetch(PJ_WEB, { redirect: 'manual' }).catch(() => null)
    siteOk = !!ping
  } catch {}
  if (SIM) {
    const hop = await fetchRetry(`${API}/l/${code}`, { redirect: 'manual', headers: { 'x-forwarded-for': '10.62.9.9' } })
    const destino = new URL(hop.headers.get('location') ?? 'http://x.invalid/')
    check(hop.status === 302 && destino.searchParams.get('utm_campaign') === POST_UTM.utmCampaign, 'B2 o link curto do post redireciona com a UTM do post', destino.toString())
    console.log('PULADO B2/B3 site e cadastro da PetJourney (modo simulado: o app falso conta o cadastro com essa UTM)')
    fake.signup({ utm: TUPLE, como: 'instagram' })
  } else if (!siteOk) {
    check(false, 'B2 o petjourney-web em dev está no ar (PJ_WEB)', `${PJ_WEB} fora do ar: o passo do site não rodou`)
  } else {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' })
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (!['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort()
      if (url.pathname === '/api/proxy/usuario/verificar') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ statusCode: 200, data: { emailDisponivel: true } }) })
      }
      if (url.pathname === '/api/proxy/usuario' && route.request().method() === 'POST') {
        corpoDoSite = JSON.parse(route.request().postData() ?? '{}')
        const file = path.join(os.tmpdir(), `appdata-e2e-corpo-${RUN}.json`)
        fs.writeFileSync(file, JSON.stringify(corpoDoSite))
        const r = await pjAsync(['cadastro', file])
        fs.rmSync(file, { force: true })
        ctx.cadastro = r.json
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ statusCode: 201, data: { id: r.json.id, email: r.json.email, access_token: 'harness-token' } }),
        })
      }
      if (url.pathname.startsWith('/api/proxy/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
      return route.continue()
    })
    const page = await context.newPage()
    // O clique no link curto sai daqui (conta no Nevo), sem seguir o 302: o Playwright NÃO
    // intercepta navegação redirecionada, e o navegador iria ao site de produção. O destino
    // que o Nevo devolveu é aberto no petjourney-web em dev, com o mesmo caminho e a mesma UTM.
    const hop = await fetchRetry(`${API}/l/${code}`, { redirect: 'manual', headers: { 'x-forwarded-for': '10.62.9.9' } })
    const destino = new URL(hop.headers.get('location') ?? 'http://x.invalid/')
    check(hop.status === 302 && destino.hostname === 'petjourney.health' && destino.pathname === '/cadastro', 'B2 o link curto do post redireciona para o cadastro do site', destino.toString())
    await page.goto(`${PJ_WEB}${destino.pathname}${destino.search}`, { waitUntil: 'load', timeout: 180_000 })
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
    await page.waitForTimeout(800)
    const landed = new URL(page.url())
    check(landed.origin === new URL(PJ_WEB).origin && landed.pathname === '/cadastro', 'B2 o site do app (dev) abre o cadastro', page.url())
    check(landed.searchParams.get('utm_campaign') === POST_UTM.utmCampaign && landed.searchParams.get('utm_content') === 'carrossel-dor', 'B2 com a UTM do post na URL')
    const cookie = (await context.cookies(PJ_WEB)).find((c) => c.name === 'pj_primeiro_toque')
    const valor = cookie ? JSON.parse(decodeURIComponent(cookie.value)) : null
    check(valor?.utmCampaign === POST_UTM.utmCampaign && valor?.paginaEntrada === '/cadastro', 'B2 o site grava o primeiro toque (cookie de 30 dias)', JSON.stringify(valor))
    check(!!cookie && cookie.expires > Date.now() / 1000 + 29 * 86400, 'B2 o cookie vale 30 dias')
    await page.locator('#nome').fill('Pessoa do Roteiro')
    await page.locator('#email').fill(email)
    await page.locator('#senha').fill('Senha@Teste1')
    await page.locator('#confirmarSenha').fill('Senha@Teste1')
    await page.locator('#comoNosConheceu').click()
    await page.getByRole('option', { name: 'Instagram', exact: true }).click()
    await page.locator('label:has(input[type=checkbox]) > span[aria-hidden]').first().click()
    await page.screenshot({ path: path.join(out, 'b2-site-cadastro.png'), fullPage: true })
    await page.getByRole('button', { name: 'Criar conta grátis' }).click({ timeout: 120_000 })
    await page.waitForURL(/\/baixar-app/, { timeout: 180_000 }).catch(() => {})
    check(!!corpoDoSite, 'B3 o site mandou o cadastro')
    check(corpoDoSite?.atribuicao?.utmCampaign === POST_UTM.utmCampaign && corpoDoSite?.comoNosConheceu === 'INSTAGRAM', 'B3 com a atribuição e o "como nos conheceu"', JSON.stringify(corpoDoSite?.atribuicao))
    check(ctx.cadastro?.atribuicaoCadastro?.utmCampaign === POST_UTM.utmCampaign && ctx.cadastro?.comoNosConheceu === 'INSTAGRAM', 'B3 o UsuarioService de verdade gravou a AtribuicaoCadastro', JSON.stringify(ctx.cadastro?.atribuicaoCadastro ?? null))
    await context.close()
  }

  // "Na semana que fechou": o cadastro, os cliques e a leitura do QR passam a ser do "ontem" do app
  // (o domingo da última semana fechada) e o job roda com o relógio na segunda seguinte.
  const back = daysBetween(APP_ONTEM, TODAY)
  await nevoQuery(`UPDATE "ShortLinkClick" SET "at" = "at" - make_interval(days => $3) WHERE "shortLinkId" IN ($1, $2)`, [ctx.utm.shortLink.id, pUtm.json?.shortLink?.id, back])
  await nevoQuery(`UPDATE "QrScan" SET "at" = "at" - make_interval(days => $2) WHERE "qrCodeId" = $1`, [ctx.utm.qr.id, back])
  if (ctx.cadastro && !SIM) pj(['ontem', email, '--agora', PJ_AGORA])
  const sent = (await appSend()).json
  check(sent.executou && sent.dias.includes(ctx.ontem), SIM ? 'B4 o app simulado mandou os 3 dias (ontem com estoque)' : 'B4 o job de verdade mandou os 3 dias (ontem com estoque)', JSON.stringify(sent))
  if (SIM) check(sent.semanas?.[0] === SEMANA.from && sent.utmsVivas >= 2, 'B4 no mesmo envio, a última semana fechada (com as UTMs vivas do GET app-utms)', JSON.stringify({ semanas: sent.semanas, utmsVivas: sent.utmsVivas }))
  check(!!sent.historico && sent.historico.dias === 90, 'B4 na primeira vez foi junto o histórico de 90 dias', JSON.stringify(sent.historico))
  const rowsAfter1 = await nevoQuery('SELECT count(*)::int AS n FROM "MarketingAppMetricDay" WHERE "companyId" = $1', [PET])
  const weekRows = await nevoQuery('SELECT dimension, value FROM "MarketingAppMetricDay" WHERE "companyId" = $1 AND date = $2 AND metric = $3 ORDER BY 1', [PET, SEMANA.from, 'cadastros_semana'])
  const dayUtm = await nevoQuery(`SELECT count(*)::int AS n FROM "MarketingAppMetricDay" WHERE "companyId" = $1 AND date >= $2 AND metric = 'cadastros' AND (dimension LIKE 'utm:%' OR dimension LIKE 'parceiro:%')`, [PET, addDays(TODAY, -120)])
  check(weekRows.find((r) => r.dimension === '')?.value === 31 && dayUtm[0].n === 0, 'B4 a UTM e o parceiro chegam na semana (segunda-feira, cadastros_semana), nunca no dia', JSON.stringify(weekRows.map((r) => [r.dimension, r.value])))

  const att1 = await call('diretoria', 'GET', `/app-data/attribution?companyId=${PET}&days=7`)
  const f1 = (att1.json?.funnel ?? []).find((f) => f.key === TUPLE)
  check(att1.status === 200, 'B5 o Visualizador lê o funil', `status ${att1.status}`)
  check(att1.json?.weeks?.from === SEMANA.from && att1.json?.weeks?.to === SEMANA.to && att1.json?.weeks?.count === 1, 'B5 o funil de 7 dias é a semana fechada inteira (segunda a domingo)', JSON.stringify(att1.json?.weeks))
  check(!!f1 && f1.inNevo && f1.links[0]?.card?.id === cardId, 'B5 o post aparece no funil, ligado ao card', JSON.stringify(f1?.links?.[0]?.card ?? null))
  check(f1?.clicks >= 9 && f1?.scans === 1, 'B5 com os cliques do link curto e a leitura do QR (no mesmo intervalo da semana)', `cliques ${f1?.clicks}, leituras ${f1?.scans}`)
  const t1 = att1.json?.totals
  check(
    f1?.signups?.cells === 0 && (SIM ? t1?.signupsOtherUtm?.min === 6 : t1?.signupsOtherUtm?.min >= 1),
    SIM ? 'B5 1 cadastro na semana vai para "Outras UTMs" (junto com os 5 do link de fora da ala)' : 'B5 1 cadastro na semana vai para "Outras UTMs"',
    JSON.stringify({ post: f1?.signups, outras: t1?.signupsOtherUtm }),
  )
  check(t1?.signups?.min === 31 && t1.signupsWithUtm.min + t1.signupsOtherUtm.min + t1.signupsWithoutUtm.min === 31, 'B5 com UTM + Outras UTMs + Sem UTM = os cadastros da semana', JSON.stringify({ com: t1?.signupsWithUtm?.min, outras: t1?.signupsOtherUtm?.min, sem: t1?.signupsWithoutUtm?.min }))

  // Mais 4 cadastros com a mesma UTM na semana: passa do recorte e o número aparece.
  if (SIM) for (let i = 0; i < 4; i++) fake.signup({ utm: TUPLE })
  else pj(['utm', POST_UTM.utmSource, POST_UTM.utmMedium, POST_UTM.utmCampaign, POST_UTM.utmContent, '4', '--agora', PJ_AGORA])
  const sent2 = (await appSend()).json
  const rowsAfter2 = await nevoQuery('SELECT count(*)::int AS n FROM "MarketingAppMetricDay" WHERE "companyId" = $1', [PET])
  check(sent2.executou && !sent2.historico, 'B6 o reenvio manda só os 3 dias e a semana (o histórico não repete)')
  const att2 = await call('diretoria', 'GET', `/app-data/attribution?companyId=${PET}&days=7`)
  const f2 = (att2.json?.funnel ?? []).find((f) => f.key === TUPLE)
  check(f2?.signups?.cut === 0 && f2?.signups?.min === 5, 'B6 com 5 cadastros na semana o post mostra 5 no funil', JSON.stringify(f2?.signups))
  check(f2?.conversion && f2.conversion.min > 0, 'B6 e a conversão sobre os cliques', JSON.stringify(f2?.conversion))
  const t2 = att2.json?.totals
  if (SIM) check(t2?.signupsOtherUtm?.min === 5 && t2?.signupsWithoutUtm?.min === 19, 'B6 "Outras UTMs" fica com os 5 do link de fora e "Sem UTM" com os 19', JSON.stringify({ outras: t2?.signupsOtherUtm, sem: t2?.signupsWithoutUtm }))
  check(t2?.signups?.min === t2?.signupsWithUtm?.min + t2?.signupsOtherUtm?.min + t2?.signupsWithoutUtm?.min, 'B6 a partição da UTM fecha com os cadastros da semana', JSON.stringify(t2 && { total: t2.signups.min, com: t2.signupsWithUtm.min, outras: t2.signupsOtherUtm.min, sem: t2.signupsWithoutUtm.min }))
  // O rótulo do balde (revisão B, Etapa 3): com o complemento separado, cada um na sua linha; sem a
  // linha do complemento, o balde levou os sem UTM (e os sem indicação) e vem à parte.
  if (SIM) {
    check(
      t2?.signupsWithoutUtmAndOther?.cells === 0 && t2?.partnersNoneAndOther?.cells === 0 && t2?.partnersNone?.min === 24,
      'B6b semana com o complemento separado: "Outras UTMs", "Sem UTM" e "Sem indicação" (24) em linhas próprias, nada no balde que junta',
      JSON.stringify(t2 && { semUtmEOutras: t2.signupsWithoutUtmAndOther, semIndicacao: t2.partnersNone, semIndicacaoEOutros: t2.partnersNoneAndOther }),
    )
    const prevSunday = addDays(SEMANA.from, -1)
    const attPrev = await call('diretoria', 'GET', `/app-data/attribution?companyId=${PET}&days=7&to=${prevSunday}`)
    const tp = attPrev.json?.totals
    check(
      attPrev.json?.weeks?.from === addDays(SEMANA.from, -7) && attPrev.json?.weeks?.count === 1 && tp?.signupsWithoutUtmAndOther?.min === 11 && tp?.signupsWithoutUtm?.cells === 0 && tp?.signupsOtherUtm?.cells === 0,
      'B6b semana sem a linha utm:sem_utm: o balde que levou os sem UTM vem à parte ("Sem UTM e outras", 11)',
      JSON.stringify({ semanas: attPrev.json?.weeks, outras: tp?.signupsOtherUtm, semUtm: tp?.signupsWithoutUtm, semUtmEOutras: tp?.signupsWithoutUtmAndOther }),
    )
    check(
      tp?.partnersNoneAndOther?.min === 11 && tp?.partnersNone?.cells === 0 && tp?.partnersOther?.cells === 0,
      'B6b o mesmo no parceiro: sem a linha parceiro:sem_parceiro, "Sem indicação e outros" (11)',
      JSON.stringify({ outros: tp?.partnersOther, semIndicacao: tp?.partnersNone, semIndicacaoEOutros: tp?.partnersNoneAndOther }),
    )
  }
  const dayAndWeek = 'SELECT date, metric, dimension, value FROM "MarketingAppMetricDay" WHERE "companyId" = $1 AND date IN ($2, $3) ORDER BY 1, 2, 3'
  const before = await nevoQuery(dayAndWeek, [PET, ctx.ontem, SEMANA.from])
  await appSend()
  const again = await nevoQuery(dayAndWeek, [PET, ctx.ontem, SEMANA.from])
  check(JSON.stringify(before) === JSON.stringify(again), 'B6 reenviar o mesmo dia e a mesma semana não duplica (ficam iguais)', `${again.length} linhas`)
  const dup = await nevoQuery(
    'SELECT count(*)::int AS n FROM "MarketingAppMetricDay" WHERE "companyId" = $1 AND date = $2 AND metric = $3 AND dimension = $4',
    [PET, SEMANA.from, 'cadastros_semana', `utm:${TUPLE}`],
  )
  check(dup[0].n === 1, 'B6 uma linha só para o post na semana (chave marca, segunda-feira, métrica, dimensão)')
  const rowsAfter3 = await nevoQuery('SELECT count(*)::int AS n FROM "MarketingAppMetricDay" WHERE "companyId" = $1', [PET])
  check(rowsAfter3[0].n === rowsAfter2[0].n, 'B6 o total de linhas da marca não cresce com o reenvio', `${rowsAfter1[0].n} (1o), ${rowsAfter2[0].n} (2o), ${rowsAfter3[0].n} (3o)`)
  const total = again.find((r) => r.date === ctx.ontem && r.metric === 'cadastros' && r.dimension === '')
  check(total?.value === 35, 'B6 o total de cadastros de ontem bate (30 da base + 1 do site + 4)', `total ${total?.value}`)
  const weekTotal = again.find((r) => r.date === SEMANA.from && r.metric === 'cadastros_semana' && r.dimension === '')
  check(weekTotal?.value === 35, 'B6 o total da semana é a soma dos dias exatos dela (35)', `semana ${weekTotal?.value}`)

  // A semana em curso: pedindo o período até hoje, ela aparece como a que ainda não fechou.
  const attOpen = await call('diretoria', 'GET', `/app-data/attribution?companyId=${PET}&days=7&to=${TODAY}`)
  const open = attOpen.json?.weeks?.open
  check(open?.from === mondayOf(TODAY) && open?.to === addDays(mondayOf(TODAY), 6), 'B6 a semana em curso vem como "ainda não fechou" (segunda a domingo de hoje)', JSON.stringify(attOpen.json?.weeks))
  ctx.openDefault = att2.json?.weeks?.open ?? null

  // Parceiros: código /r/ pela UTM da placa, nome do estabelecimento, sem contar duas vezes.
  const partners = att2.json?.rankings?.partners ?? []
  const clinica = partners.find((p) => p.partnerId === ctx.partnerId)
  // Por nome: em banco de rodadas antigas pode haver mais de um "Pet Shop Amigo" (o casamento pega um).
  const amigo = partners.find((p) => p.partnerId === ctx.partner2Id) ?? partners.find((p) => p.name === 'Pet Shop Amigo' && p.matchedBy === 'name')
  check(clinica?.matchedBy === 'code' && clinica?.viaCode?.min === 6 && clinica?.viaUtm?.cells === 0, 'B7 cadastro pelo /r/PJ-CL1N1C conta para a clínica no ranking (6), sem somar a UTM da placa de novo', JSON.stringify({ viaCode: clinica?.viaCode, viaUtm: clinica?.viaUtm }))
  check(clinica?.clicks === 4, 'B7 com os cliques da placa', `cliques ${clinica?.clicks}`)
  check(amigo?.matchedBy === 'name' && amigo?.signups?.min === 5, 'B7 parceiro sem UTM casa pelo nome do estabelecimento', JSON.stringify(amigo?.signups))
  const campaignsOrCards = att2.json?.rankings?.cards ?? []
  check(campaignsOrCards.some((c) => c.id === cardId && c.signups.min >= 5), 'B7 o post (card) aparece no ranking de posts')

  // Comparação com o período anterior = soma dos dias.
  const ov = await call('diretoria', 'GET', `/app-data/overview?companyId=${PET}&days=30`)
  const sum = (key) =>
    ov.json.series.reduce((s, d) => (d[key] ? { min: s.min + d[key].min, max: s.max + d[key].max } : s), { min: 0, max: 0 })
  const cur = ov.json.kpis.cadastros.current
  const prev = ov.json.kpis.cadastros.previous
  check(cur.min === sum('value').min && cur.max === sum('value').max, 'B8 o total do período = soma dos dias da série', `${cur.min} = ${sum('value').min}`)
  check(prev.min === sum('previous').min && prev.max === sum('previous').max, 'B8 o anterior = soma dos dias anteriores', `${prev.min} = ${sum('previous').min}`)
  check(ov.json.kpis.ativos_7d?.source === 'aparelho', 'B8 o ativo diz a fonte (aparelho, até o último acesso cobrir a janela)', ov.json.kpis.ativos_7d?.source)
  // Estoques só com o total, arredondados para cima de 5 em 5; espécie é a dos pets cadastrados.
  const k = ov.json.kpis
  check(k.assinaturas_ativas?.rounded && k.pets?.rounded && k.assinaturas_ativas.value?.min % 5 === 0 && k.pets.value?.min % 5 === 0, 'B8 assinaturas e pets ativos chegam arredondados de 5 em 5', JSON.stringify({ assinaturas: k.assinaturas_ativas?.value, pets: k.pets?.value }))
  if (SIM) check(k.assinaturas_ativas.value.min === 35 && k.pets.value.min === 65, 'B8 para cima: 33 assinaturas viram 35 e 61 pets viram 65', `${k.assinaturas_ativas.value.min} e ${k.pets.value.min}`)
  const bd = ov.json.breakdowns
  const especieSum = (bd.especie ?? []).reduce((s, r) => s + r.current.min, 0)
  check(!('plano' in bd) && !('tipo' in bd) && especieSum === k.pets_novos.current.min && especieSum > 0, 'B8 sem quadro de plano e tipo; espécie é a dos pets cadastrados e fecha com o total', JSON.stringify((bd.especie ?? []).map((r) => [r.dimension, r.current.min])))
  ctx.lastRows = again
}

// ══ Tela ═══════════════════════════════════════════════════════════════════
async function openUi(browser, who, route, vp, opts = {}) {
  const t = await login(who)
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.mobile ? 2 : 1,
    isMobile: !!vp.mobile,
    hasTouch: !!vp.mobile,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    reducedMotion: 'reduce',
    colorScheme: opts.dark ? 'dark' : 'light',
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  await context.addInitScript(
    ([tk, theme]) => {
      localStorage.setItem('token', tk)
      localStorage.setItem('onboarding.autoShown', '1')
      localStorage.setItem('onboarding.completed', '1')
      localStorage.setItem('ui.idlePermissionPrompt', 'done')
      if (theme) localStorage.setItem('ui.theme', theme)
    },
    [t, opts.dark ? 'dark' : 'light'],
  )
  const page = await context.newPage()
  const bad = []
  page.on('response', (res) => {
    const u = res.url()
    if (u.startsWith(API) && (res.status() === 401 || res.status() >= 500)) bad.push(`${res.status()} ${u.replace(API, '')}`)
  })
  page.on('pageerror', (e) => bad.push(`pageerror ${e.message}`))
  await page.goto(WEB + route, { waitUntil: 'load', timeout: 180_000 })
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
  await page.waitForTimeout(900)
  return { context, page, bad }
}
async function tallShot(page, name, vp) {
  const h = await page.evaluate(() => document.querySelector('main')?.scrollHeight ?? 900)
  await page.setViewportSize({ width: vp.width, height: Math.min(vp.mobile ? 1900 : 3400, Math.max(vp.height, h + 160)) })
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(out, `${name}.png`) })
  await page.setViewportSize({ width: vp.width, height: vp.height })
}
const noHScroll = async (page, label, w) => {
  const sw = await page.evaluate(() => document.documentElement.scrollWidth)
  check(sw <= w, `${label}: sem rolagem lateral`, `scrollWidth ${sw}`)
}
const DESK = { width: 1440, height: 900 }
const PHONE = { width: 375, height: 812, mobile: true }

async function partBui(browser) {
  console.log('\n== B (tela). A área Dados mostra o funil ==')
  const { context, page, bad } = await openUi(browser, 'diretoria', `/marketing/dados?marca=${PET}&periodo=7`, DESK)
  const nav = page.locator('a', { hasText: /^\s*Dados\s*$/ })
  check((await nav.count()) > 0, 'B9 a seção "Dados" está nas abas da ala (Visualizador vê)')
  const row = page.locator(`[data-testid="funnel-row"][data-key="${TUPLE}"]`)
  await row.waitFor({ timeout: 30_000 }).catch(() => {})
  check((await row.count()) === 1, 'B9 o post está no funil da tela')
  const rowText = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ')
  check(/Post do carrossel/.test(rowText) && /\b5\b/.test(rowText), 'B9 com onde é usado e os 5 cadastros', rowText.slice(0, 160))
  const text = async (sel) => (await page.locator(sel).innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
  const weeksText = await text('[data-testid="funnel-weeks"]')
  check(weeksText === `por semana fechada, de ${ddmm(SEMANA.from)} a ${ddmm(SEMANA.to)}`, 'B9 o funil diz que é por semana fechada, com o intervalo', weeksText)
  const otherText = await text('[data-testid="funnel-other"]')
  const noneText = await text('[data-testid="funnel-none"]')
  check(/^Outras UTMs Link montado fora da ala, ou UTM com menos de 5 cadastros na semana/.test(otherText) && (!SIM || /\b5\b/.test(otherText)), 'B9 a linha "Outras UTMs" (link de fora da ala ou abaixo de 5 na semana)', otherText)
  check(/^Sem UTM Cadastro que não veio de link com UTM/.test(noneText) && (!SIM || /\b19\b/.test(noneText)), 'B9 a linha "Sem UTM"', noneText)
  const openText = await text('[data-testid="funnel-open-week"]')
  if (ctx.openDefault) {
    const monday = ddmm(addDays(ctx.openDefault.to, 1))
    check(openText === `A semana de ${ddmm(ctx.openDefault.from)} a ${ddmm(ctx.openDefault.to)} ainda não fechou: entra na segunda-feira, ${monday}.`, 'B9 a semana em curso: "ainda não fechou: entra na segunda-feira, DD/MM"', openText)
  } else {
    check(openText === '', 'B9 hoje é segunda: a semana de ontem fechou e nenhuma fica em curso no período', openText)
  }
  const kpi = (await page.locator('[data-kpi="cadastros"]').innerText()).replace(/\s+/g, ' ')
  check(/Cadastros 35/.test(kpi), 'B9 o número de cadastros do período na tela', kpi)
  check((await page.locator('[data-kpi="ativos"]').innerText()).includes('pelo uso do aparelho'), 'B9 o ativo mostra a fonte')
  const subs = await text('[data-kpi="assinaturas_ativas"]')
  const petsKpi = await text('[data-kpi="pets"]')
  check(/cerca de (35|\d+)/.test(subs) && /cerca de (65|\d+)/.test(petsKpi) && (!SIM || (subs.includes('cerca de 35') && petsKpi.includes('cerca de 65'))), 'B9 estoques com "cerca de" (arredondados para cima)', `${subs} | ${petsKpi}`)
  const subsTitle = await page.locator('[data-kpi="assinaturas_ativas"] .mkd__kpi-value').getAttribute('title')
  check(!SIM || /arredondado para cima, de 5 em 5 .*entre 31 e 35/.test(subsTitle ?? ''), 'B9 o título do estoque diz a faixa de verdade (31 a 35)', subsTitle ?? '')
  check((await page.locator('[data-testid="bd-plano"], [data-testid="bd-tipo"]').count()) === 0, 'B9 os quadros de plano e tipo saíram (o estoque vem só com o total)')
  check(/^Pets cadastrados por espécie/.test(await text('[data-testid="bd-especie"]')), 'B9 o quadro de espécie é "Pets cadastrados por espécie"', (await text('[data-testid="bd-especie"]')).slice(0, 120))
  check(/por semana fechada, de segunda a domingo/.test(await text('[data-testid="app-data-foot"]')) && /arredondados para cima de 5 em 5/.test(await text('[data-testid="app-data-foot"]')), 'B9 o rodapé explica a semana fechada e o arredondamento para cima')
  check((await page.locator('[data-testid="app-data-view"]').innerText()).indexOf(String.fromCharCode(0x2014)) === -1, 'B9 nenhum travessão na tela')
  check((await page.locator('[data-testid="app-status"]').innerText()).includes('Último envio do app'), 'B9 "último envio do app" na tela')
  await tallShot(page, 'b9-dados-1440', DESK)
  await page.locator('[data-testid="app-funnel"]').screenshot({ path: path.join(out, 'b9-funil-semana.png') })
  await page.locator('[data-tab="partners"]').click()
  await page.waitForTimeout(300)
  const pRow = page.locator(`[data-testid="ranking-partners"] tr[data-partner="${ctx.partnerId}"]`)
  const pText = (await pRow.innerText().catch(() => '')).replace(/\s+/g, ' ')
  check(/Clínica Bicho Feliz/.test(pText) && /\b6\b/.test(pText), 'B9 a clínica no ranking de parceiros com 6', pText)
  check(/^Por semana fechada/.test(await text('[data-testid="partners-weekly"]')) && (await text('[data-testid="rankings-weeks"]')) === weeksText, 'B9 o ranking de parceiros diz que é por semana fechada (o mesmo intervalo do funil)')
  if (SIM) {
    const noneP = await text('[data-testid="partners-none"]')
    check(
      /^Sem indicação Cadastro que não veio por parceiro/.test(noneP) && /\b24\b/.test(noneP) && (await page.locator('[data-testid="partners-none-other"]').count()) === 0,
      'B9 semana com "Sem indicação" separada: a linha própria no ranking de parceiros, sem a do balde que junta',
      noneP,
    )
  }
  await page.locator('[data-testid="app-rankings"]').screenshot({ path: path.join(out, 'b9-ranking-parceiros.png') })
  // Período anterior: 30 dias, e o CSV dos números.
  await page.locator('[data-period="30"]').click()
  await page.waitForTimeout(800)
  check(new URL(page.url()).searchParams.get('periodo') === null, 'B9 30 dias é o padrão (some da URL)')
  const weeks30 = await text('[data-testid="funnel-weeks"]')
  check(new RegExp(`^por semana fechada, de \\d\\d/\\d\\d a ${ddmm(SEMANA.to)} \\([45] semanas\\)$`).test(weeks30), 'B9 em 30 dias o funil arredonda para as semanas inteiras (4 ou 5)', weeks30)
  if (SIM) {
    // 30 dias pegam as duas semanas: a fechada (complemento separado) e a anterior (balde levou os sem UTM).
    const noneOther = await text('[data-testid="funnel-none-other"]')
    check(
      /^Sem UTM e outras Cadastros sem UTM, links montados fora da ala ou UTM com menos de 5 cadastros na semana/.test(noneOther) && /\b11\b/.test(noneOther),
      'B9 em 30 dias, a semana sem a linha "Sem UTM" aparece como "Sem UTM e outras" (11)',
      noneOther,
    )
    check(
      /^Outras UTMs/.test(await text('[data-testid="funnel-other"]')) && /^Sem UTM Cadastro/.test(await text('[data-testid="funnel-none"]')),
      'B9 e a semana com o complemento separado segue com "Outras UTMs" e "Sem UTM"',
    )
    await page.locator('[data-tab="partners"]').click()
    await page.waitForTimeout(300)
    const pNoneOther = await text('[data-testid="partners-none-other"]')
    check(
      /^Sem indicação e outros Cadastros sem indicação ou parceiro com menos de 5 cadastros na semana/.test(pNoneOther) && /\b11\b/.test(pNoneOther) && /^Sem indicação Cadastro/.test(await text('[data-testid="partners-none"]')),
      'B9 o mesmo no ranking de parceiros: "Sem indicação e outros" (11) ao lado de "Sem indicação"',
      pNoneOther,
    )
    await page.locator('[data-testid="app-funnel"]').screenshot({ path: path.join(out, 'b9-funil-sem-utm-e-outras.png') })
    await page.locator('[data-testid="app-rankings"]').screenshot({ path: path.join(out, 'b9-parceiros-sem-indicacao-e-outros.png') })
  }
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.locator('[data-action="csv-daily"]').click()])
  const file = await download.path()
  const csv = fs.readFileSync(file, 'utf8')
  check(/^dados-do-app-\d{4}-\d{2}-\d{2}-a-\d{4}-\d{2}-\d{2}\.csv$/.test(download.suggestedFilename()), 'F1 o arquivo leva o per\u00EDodo no nome', download.suggestedFilename())
  check(/^\uFEFFData;Marca;Métrica;Recorte;Valor/.test(csv) && csv.includes(`${ctx.ontem};PetJourney;Cadastros;Total;35`), 'F1 o CSV dos números baixa com cabeçalho e o total do dia', download.suggestedFilename())
  check(csv.includes(`${SEMANA.from};PetJourney;Cadastros da semana (segunda ${SEMANA.from} a domingo ${SEMANA.to});Total;35`), 'F1 o CSV dos números leva a linha da semana com o rótulo claro')
  check(csv.includes(`${ctx.ontem};PetJourney;Assinaturas ativas (arredondado para cima, de 5 em 5);Total;`) && !/;(plano|tipo):/.test(csv), 'F1 o estoque no CSV diz que é para cima, de 5 em 5, e não tem plano nem tipo')
  const [download2] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.locator('[data-action="csv-funnel"]').click()])
  const csv2 = fs.readFileSync(await download2.path(), 'utf8')
  check(csv2.includes(POST_UTM.utmCampaign) && csv2.includes('Post do carrossel'), 'F1 o CSV do funil traz o post', download2.suggestedFilename())
  check(/^funil-utm-\d{4}-\d{2}-\d{2}-a-\d{4}-\d{2}-\d{2}\.csv$/.test(download2.suggestedFilename()) && csv2.includes('Cadastros nas semanas fechadas') && csv2.includes(';Outras UTMs (fora do Nevo ou abaixo de 5 na semana);') && csv2.includes(';Sem UTM;'), 'F1 o CSV do funil é por semana fechada, com Outras UTMs e Sem UTM', download2.suggestedFilename())
  if (SIM) check(csv2.includes(';Sem UTM e outras (sem UTM, fora do Nevo ou abaixo de 5 na semana);'), 'F1 o CSV do funil leva a linha "Sem UTM e outras" da semana em que o balde juntou os dois')
  check(!bad.length, 'B9 nenhuma resposta 401/5xx nem erro na tela', bad.join(', '))
  await context.close()

  // Painel inicial com os indicadores do app.
  const home = await openUi(browser, 'nicolas', `/marketing?marca=${PET}`, DESK)
  const ind = home.page.locator('[data-section="app"]')
  check((await ind.count()) === 1 && /Cadastros/.test(await ind.innerText()), 'B10 o painel inicial mostra os indicadores do app')
  const indSubs = (await home.page.locator('[data-indicator="assinaturas"]').innerText().catch(() => '')).replace(/\s+/g, ' ')
  check(/Assinaturas ativas cerca de \d+/.test(indSubs) && (!SIM || indSubs.includes('cerca de 35')), 'B10 o painel diz "cerca de" nas assinaturas ativas', indSubs)
  await ind.screenshot({ path: path.join(out, 'b10-painel-indicadores.png') })
  await home.context.close()

  // Celular e escuro.
  const m = await openUi(browser, 'diretoria', `/marketing/dados?marca=${PET}&periodo=7`, PHONE)
  await m.page.locator(`[data-testid="funnel-row"]`).first().waitFor({ timeout: 30_000 }).catch(() => {})
  await noHScroll(m.page, 'E1 Dados em 375 px', 375)
  const periodH = await m.page.locator('[data-period="7"]').boundingBox()
  check(periodH && periodH.height >= 36, 'E1 o seletor de período tem alvo de toque no celular', `${periodH?.height}px`)
  await tallShot(m.page, 'e1-dados-m375', PHONE)
  await m.context.close()
  const dark = await openUi(browser, 'diretoria', `/marketing/dados?marca=${PET}&periodo=7`, DESK, { dark: true })
  await tallShot(dark.page, 'e2-dados-escuro-1440', DESK)
  await dark.context.close()
}

// ══ C. Revogado e atraso ═══════════════════════════════════════════════════
async function partC(browser) {
  console.log('\n== C. Token revogado e atraso de 36 h ==')
  const { context, page, bad } = await openUi(browser, 'nicolas', '/marketing/configuracoes?aba=app', DESK)
  const row = page.locator(`tr[data-token="${ctx.tokenId}"]`)
  await row.waitFor({ timeout: 30_000 })
  check((await row.getAttribute('data-state')) === 'active', 'C1 o token aparece ativo, com o último uso')
  check(!/nunca usado/.test(await row.innerText()), 'C1 o último uso aparece depois do envio', (await row.innerText()).replace(/\s+/g, ' '))
  await page.screenshot({ path: path.join(out, 'c1-conexao-ativo.png') })
  await row.locator('[data-action="revoke-app-token"]').click()
  await page.getByRole('button', { name: 'Revogar', exact: true }).last().click()
  await page.waitForTimeout(1200)
  check((await row.getAttribute('data-state')) === 'revoked' && /Revogado/.test(await row.innerText()), 'C1 revogar pela tela: o token aparece como revogado')
  await page.screenshot({ path: path.join(out, 'c1-conexao-revogado.png') })
  const refused = await appSend({ allowFail: true })
  check(!refused.ok && /401/.test(refused.stderr) && /revogado/i.test(refused.stderr), 'C1 o próximo envio do app é recusado com 401 (token revogado)', refused.stderr?.trim().split('\n').pop())
  const direct = await publicPost(appToken, {
    payloadVersion: 1,
    generatedAt: new Date().toISOString(),
    timeZone: 'America/Sao_Paulo',
    days: [{ date: ctx.ontem ?? '2026-11-01', metrics: [{ metric: 'cadastros', dimension: '', value: 99 }] }],
  })
  check(direct.status === 401 && /revogado/.test(direct.json?.message ?? ''), 'C1 a rota pública responde 401 com a frase do revogado', direct.json?.message)

  // Criar um novo (o Dono) pela tela: o token aparece uma vez e some ao esconder.
  await page.locator('[data-testid="app-token-name"]').fill(`Novo ${RUN}`)
  await page.locator('[data-action="create-app-token"]').click()
  const shown = page.locator('[data-testid="app-token-value"]')
  await shown.waitFor({ timeout: 15_000 })
  const newToken = (await shown.innerText()).trim()
  check(/^wfapp_/.test(newToken), 'C2 criar pela tela mostra o token completo uma vez')
  check((await page.locator('[data-testid="app-token-env"]').innerText()).includes(`NEVO_API_TOKEN=${newToken}`), 'C2 e as duas variáveis prontas para colar na API do app')
  await page.screenshot({ path: path.join(out, 'c2-token-criado.png') })
  await page.getByRole('button', { name: 'Já copiei, esconder' }).click()
  await page.reload({ waitUntil: 'load' })
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
  check(!(await page.content()).includes(newToken), 'C2 depois de recarregar o token completo não existe mais na tela')
  appToken = newToken
  const resent = await appSend()
  check(resent.json.executou, 'C2 com o token novo o app volta a mandar')

  // Looker Studio: errado recusa com a frase; certo vira botão na área Dados.
  // (rodada anterior deixa o link salvo: começa limpo pela API e recarrega a tela)
  const cleared = await call('nicolas', 'PATCH', '/settings', { settings: { lookerStudioUrl: null } })
  check(cleared.status === 200 && cleared.json?.lookerStudioUrl === null, 'F2 vazio limpa o link do Looker Studio', `status ${cleared.status}`)
  await page.reload({ waitUntil: 'load' })
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {})
  const badApi = await call('leticia', 'PATCH', '/settings', { settings: { lookerStudioUrl: 'https://exemplo.com/relatorio' } })
  check(badApi.status === 400 && /Looker Studio/.test(badApi.json?.message ?? ''), 'F2 a API recusa link que não é do Looker Studio, com a frase', badApi.json?.message)
  await page.locator('[data-testid="looker-url"]').fill('https://exemplo.com/relatorio')
  await page.locator('[data-action="save-looker"]').click()
  await page.waitForTimeout(800)
  const settingsBad = await call('nicolas', 'GET', '')
  check(!settingsBad.json?.settings?.lookerStudioUrl, 'F2 link que não é do Looker Studio não é salvo pela tela')
  const lookerUrl = 'https://lookerstudio.google.com/reporting/harness-m4'
  await page.locator('[data-testid="looker-url"]').fill(lookerUrl)
  await page.locator('[data-action="save-looker"]').click()
  await page.waitForTimeout(1000)
  const settingsOk = await call('nicolas', 'GET', '')
  check(settingsOk.json?.settings?.lookerStudioUrl === lookerUrl, 'F2 o link do Looker Studio fica na configuração do grupo')
  check(!bad.filter((b) => !/\/settings/.test(b)).length, 'C1 nenhuma resposta 401/5xx na tela', bad.join(', '))
  await context.close()

  const dados = await openUi(browser, 'diretoria', `/marketing/dados?marca=${PET}`, DESK)
  const lk = dados.page.locator('[data-action="looker"]')
  check((await lk.getAttribute('href')) === lookerUrl, 'F2 o botão "Looker Studio" aparece na área Dados')
  await dados.context.close()

  // Atraso: o último envio passa de 36 h (o banco do harness volta 40 h no tempo).
  await nevoQuery(`UPDATE "MarketingAppMetricDay" SET "receivedAt" = now() - interval '40 hours' WHERE "companyId" = $1`, [PET])
  const st = await call('diretoria', 'GET', `/app-data/status?companyId=${PET}`)
  check(st.json?.stale === true, 'C3 sem envio há mais de 36 h a API marca atrasado')
  const late = await openUi(browser, 'diretoria', `/marketing/dados?marca=${PET}`, DESK)
  const alert = late.page.locator('[data-testid="app-status"]')
  check(/há mais de 36 h/.test(await alert.innerText()), 'C3 a tela avisa o atraso', (await alert.innerText()).replace(/\s+/g, ' ').slice(0, 120))
  await alert.screenshot({ path: path.join(out, 'c3-alerta-36h.png') })
  await late.context.close()
  const lateHome = await openUi(browser, 'nicolas', `/marketing?marca=${PET}`, DESK)
  check(/há mais de 36 h/.test(await lateHome.page.locator('[data-section="app"]').innerText()), 'C3 o painel inicial também avisa')
  await lateHome.context.close()
  await nevoQuery(`UPDATE "MarketingAppMetricDay" SET "receivedAt" = now() WHERE "companyId" = $1`, [PET])
}

// ══ D. Sem dado ════════════════════════════════════════════════════════════
async function partD(browser) {
  console.log('\n== D. Sem dado do app a área explica como conectar ==')
  const owner = await openUi(browser, 'nicolas', `/marketing/dados?marca=${EMMI}`, DESK)
  const empty = owner.page.locator('[data-testid="app-data-empty"]')
  await empty.waitFor({ timeout: 30_000 }).catch(() => {})
  check((await empty.count()) === 1, 'D1 marca sem dado: a área mostra como conectar')
  const text = (await empty.innerText()).replace(/\s+/g, ' ')
  check(/NEVO_API_TOKEN/.test(text) && /NEVO_API_URL/.test(text) && /menos de 5/.test(text), 'D1 com o passo a passo (token, envs, recorte)')
  check((await owner.page.locator('[data-action="go-connect"]').count()) === 1, 'D1 o Dono tem o botão para a conexão')
  await owner.page.screenshot({ path: path.join(out, 'd1-sem-dado-dono.png') })
  await owner.page.locator('[data-action="go-connect"]').click()
  await owner.page.waitForURL(/aba=app/, { timeout: 15_000 }).catch(() => {})
  check(/aba=app/.test(owner.page.url()), 'D1 o botão abre Configurações na aba "Conexão com o app"')
  check(!owner.bad.length, 'D1 a ala não quebra (nenhum 401/5xx)', owner.bad.join(', '))
  await owner.context.close()
  const viewer = await openUi(browser, 'diretoria', `/marketing/dados?marca=${EMMI}`, PHONE)
  const vt = (await viewer.page.locator('[data-testid="app-data-empty"]').innerText().catch(() => '')).replace(/\s+/g, ' ')
  check(/Peça ao Dono do grupo/.test(vt), 'D2 o Visualizador sem dado vê a quem pedir')
  await noHScroll(viewer.page, 'D2 sem dado em 375 px', 375)
  await viewer.page.screenshot({ path: path.join(out, 'd2-sem-dado-m375.png') })
  await viewer.context.close()
  const homeEmmi = await openUi(browser, 'nicolas', `/marketing?marca=${EMMI}`, DESK)
  check((await homeEmmi.page.locator('[data-section="app"]').count()) === 0, 'D3 o painel da marca sem app não mostra bloco vazio')
  for (const route of ['/marketing/utm', '/marketing/parceiros', '/marketing/campanhas']) {
    await homeEmmi.page.goto(WEB + route, { waitUntil: 'load' })
    await homeEmmi.page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
  }
  check(!homeEmmi.bad.length, 'D3 o resto da ala segue igual', homeEmmi.bad.join(', '))
  await homeEmmi.context.close()
  const conexaoPhone = await openUi(browser, 'nicolas', '/marketing/configuracoes?aba=app', PHONE)
  await noHScroll(conexaoPhone.page, 'E3 Conexão com o app em 375 px', 375)
  await conexaoPhone.page.screenshot({ path: path.join(out, 'e3-conexao-m375.png') })
  await conexaoPhone.context.close()
}

;(async () => {
  const { chromium } = require('playwright-core')
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    if (want('a') || want('b') || want('c')) await partA()
    if (want('b') || want('c')) {
      await partB(browser)
      await partBui(browser)
    }
    if (want('c')) await partC(browser)
    if (want('d')) await partD(browser)
  } catch (e) {
    check(false, 'o roteiro terminou sem exceção', e.stack ?? e.message)
  } finally {
    await browser.close()
  }
  check(!apiBad.length, 'nenhum 5xx da API nas chamadas diretas', apiBad.join(', '))
  console.log(`\n${oks} OK, ${fails} FAIL. Prints em ${out}`)
  process.exit(fails ? 1 : 0)
})()
