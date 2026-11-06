// Financeiro da ala Marketing (M3-A) de ponta a ponta: API e tela.
// Spec: docs/specs/2026/q4/q4-2/ala-marketing/m3-dinheiro-eventos.md (F1 a F7).
//
// Uso: node marketing-finance-e2e.cjs [pasta-das-capturas]
//   env API (http://127.0.0.1:3631), WEB (http://localhost:5185), HARNESS_DB (wf_m3a),
//   HARNESS_SEED (seed-marketing-out.<db>.json), ONLY=api|ui
//
// O roteiro apaga e recria os dados do financeiro do grupo do seed (lançamentos,
// regras, orçamentos) e insere campanha, ativação e parceiro "E2E ..." direto no
// banco do harness (as rotas delas são de outras fases). Nunca toca produção.
//
// Conferências independentes do código da API: o .xlsx é aberto pelo openpyxl
// (Python) e o zip das notas pelo System.IO.Compression do .NET, além do leitor
// de zip deste arquivo (CRC pelo zlib.crc32 do Node).
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const zlib = require('node:zlib')
const { execFileSync } = require('node:child_process')
const pg = require('pg')

const API = process.env.API ?? 'http://127.0.0.1:3631'
const WEB = process.env.WEB ?? 'http://localhost:5185'
const DB = process.env.HARNESS_DB ?? 'wf_m3a'
const ONLY = process.env.ONLY ?? ''
const seedPath = process.env.HARNESS_SEED ?? path.join(__dirname, `seed-marketing-out.${DB}.json`)
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'))
const OUT = process.argv[2] ?? path.join(__dirname, 'prints', 'marketing-finance')
// Arquivos baixados (xlsx, pdf, zip) e o cache de tokens ficam no temporário
// do sistema: não são capturas e não devem cair no git.
const FILES = process.env.FIN_E2E_FILES ?? path.join(require('node:os').tmpdir(), `nevo-finance-e2e-${DB}`)
fs.mkdirSync(OUT, { recursive: true })
fs.mkdirSync(FILES, { recursive: true })

const G = seed.groupId
const C = seed.companies
const PASS = 'nevo1234'

let fails = 0
let oks = 0
const check = (cond, msg, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}${extra ? '  (' + extra + ')' : ''}`)
  if (cond) oks++
  else fails++
}
const section = (t) => console.log(`\n== ${t} ==`)

// Mês corrente em São Paulo (o mesmo "hoje" da API)
const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())
const MONTH = TODAY.slice(0, 7)
const F4_MONTH = '2027-03'

// ── API ─────────────────────────────────────────────────────────────────────
const tok = {}
const apiBad = []

// O /auth/login tem limite por minuto: o token (7 dias) é reaproveitado entre
// rodadas, e só se faz login de novo quando o /marketing/me recusa o guardado.
// Por GRUPO do seed: banco recriado tem ids novos e o token antigo não é de ninguém.
const TOKEN_CACHE = path.join(FILES, `tokens-${seed.groupId}.json`)
let cachedTokens = {}
try {
  cachedTokens = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'))
} catch {
  cachedTokens = {}
}

// A API conta o limite por IP (300/min geral, 10/min no login) e confia no
// X-Forwarded-For (trust proxy). As chamadas DIRETAS deste roteiro saem com um
// IP de harness por pessoa, para não disputar a cota com o navegador (127.0.0.1).
const WHO_IP = { nicolas: 1, leticia: 2, marcel: 3, freela: 4, diretoria: 5, luis: 6 }
const xff = (who) => ({ 'x-forwarded-for': `10.31.0.${WHO_IP[who] ?? 9}` })

async function login(key) {
  const cached = cachedTokens[`${API}|${key}`]
  if (cached) {
    const probe = await fetch(`${API}/marketing/me`, { headers: { authorization: `Bearer ${cached}`, ...xff(key) } })
    if (probe.ok) {
      tok[key] = cached
      return
    }
  }
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...xff(key) },
    body: JSON.stringify({ email: `${key}@nevo.test`, password: PASS }),
  })
  const j = await r.json()
  if (!j.accessToken) throw new Error(`login ${key} falhou: ${JSON.stringify(j)}`)
  tok[key] = j.accessToken
  cachedTokens[`${API}|${key}`] = j.accessToken
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify(cachedTokens))
}

async function call(who, method, route, body, opts = {}) {
  const url = API + (route.startsWith('/') && route.startsWith('/marketing') ? route : `/marketing/g/${G}/finance${route}`)
  const r = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${tok[who]}`,
      ...xff(who),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (r.status === 401 || r.status >= 500) apiBad.push(`${r.status} ${method} ${url.replace(API, '')}`)
  const ct = r.headers.get('content-type') ?? ''
  let data
  if (opts.raw && r.ok) data = Buffer.from(await r.arrayBuffer())
  else if (ct.includes('json')) data = await r.json()
  else data = await r.text()
  return { status: r.status, data, headers: r.headers }
}

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

/** Mesmo caminho do front (uploadMarketingFile): ticket, PUT direto, confirm. */
async function uploadInvoice(who, expenseId, name, buf, mimeType) {
  const t = await call(who, 'POST', `/expenses/${expenseId}/invoices`, {
    name,
    mimeType,
    size: buf.length,
    sha256: sha(buf),
  })
  if (t.status !== 201) return { status: t.status, data: t.data }
  const put = await fetch(t.data.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': mimeType, authorization: `Bearer ${t.data.token}` },
    body: buf,
  })
  if (!put.ok) return { status: put.status, data: await put.text() }
  const c = await call(who, 'POST', `/marketing/g/${G}/assets/${t.data.asset.id}/confirm`, {})
  return c
}

/** PDF mínimo válido e diferente a cada chamada (bytes conferidos no zip). */
function fakePdf(label) {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\n% ${label} ${crypto.randomBytes(24).toString('hex')}\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
    'latin1',
  )
}

/** Leitor de zip deste roteiro (independente do da API). */
function readZip(buf) {
  let end = -1
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break }
  if (end < 0) throw new Error('sem registro final')
  const count = buf.readUInt16LE(end + 10)
  let p = buf.readUInt32LE(end + 16)
  const out = []
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('central inválido')
    const method = buf.readUInt16LE(p + 10)
    const crc = buf.readUInt32LE(p + 16)
    const csize = buf.readUInt32LE(p + 20)
    const size = buf.readUInt32LE(p + 24)
    const nl = buf.readUInt16LE(p + 28)
    const el = buf.readUInt16LE(p + 30)
    const cl = buf.readUInt16LE(p + 32)
    const off = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nl).toString('utf8')
    p += 46 + nl + el + cl
    const at = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28)
    const raw = buf.subarray(at, at + csize)
    const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw)
    out.push({ name, size, crcOk: (zlib.crc32(data) >>> 0) === crc && data.length === size, data })
  }
  return out
}

function python(code, ...args) {
  return execFileSync('python', ['-I', '-c', code, ...args], { encoding: 'utf8' })
}

const OPENPYXL = `
import sys, json, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
out = {'sheets': wb.sheetnames, 'data': {}}
for name in wb.sheetnames:
    ws = wb[name]
    out['data'][name] = [[(v.isoformat() if hasattr(v, 'isoformat') else v) for v in r] for r in ws.iter_rows(values_only=True)]
print(json.dumps(out, default=str))
`

function dotnetZip(file) {
  const ps =
    "Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead($args[0]); " +
    "$z.Entries | ForEach-Object { $_.FullName + '|' + $_.Length }; $z.Dispose()"
  return execFileSync('powershell', ['-NoProfile', '-Command', `& { ${ps} }`, file], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
}

// ── Banco do harness ────────────────────────────────────────────────────────
const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
const rid = () => 'c' + crypto.randomUUID().replace(/-/g, '').slice(0, 24)
const X = {} // ids inseridos

async function setViewerSeesFinance(value) {
  await db.query(
    `UPDATE "CompanyGroup" SET settings = COALESCE(settings,'{}'::jsonb) || jsonb_build_object('viewerSeesFinance', $2::boolean) WHERE id=$1`,
    [G, value],
  )
}

async function resetData() {
  await db.query('DELETE FROM "MarketingAsset" WHERE "groupId"=$1 AND "expenseId" IS NOT NULL', [G])
  await db.query('DELETE FROM "MarketingExpense" WHERE "groupId"=$1', [G])
  await db.query('DELETE FROM "MarketingRecurringExpense" WHERE "groupId"=$1', [G])
  await db.query('DELETE FROM "MarketingBudget" WHERE "groupId"=$1', [G])
  await db.query(`DELETE FROM "MarketingCampaign" WHERE "groupId"=$1 AND name LIKE 'E2E %'`, [G])
  await db.query(`DELETE FROM "MarketingActivation" WHERE "groupId"=$1 AND title LIKE 'E2E %'`, [G])
  await db.query(`DELETE FROM "MarketingPartner" WHERE "groupId"=$1 AND name LIKE 'E2E %'`, [G])
  await db.query(`UPDATE "CompanyGroup" SET settings='{}'::jsonb WHERE id=$1`, [G])
  X.campPet = rid()
  X.campEmmi = rid()
  X.atvPet = rid()
  X.partner = rid()
  const ins = (sql, p) => db.query(sql, p)
  await ins(
    `INSERT INTO "MarketingCampaign"(id,"groupId","companyId",name,status,"updatedAt") VALUES ($1,$2,$3,$4,'ACTIVE',now())`,
    [X.campPet, G, C.pet, 'E2E Dia dos Pets'],
  )
  await ins(
    `INSERT INTO "MarketingCampaign"(id,"groupId","companyId",name,status,"updatedAt") VALUES ($1,$2,$3,$4,'ACTIVE',now())`,
    [X.campEmmi, G, C.emmitec, 'E2E Lançamento EMMI'],
  )
  await ins(
    `INSERT INTO "MarketingActivation"(id,"groupId","companyId",kind,title,"startAt","updatedAt") VALUES ($1,$2,$3,'FAIR',$4,now(),now())`,
    [X.atvPet, G, C.pet, 'E2E Feira Pet Campo Grande'],
  )
  await ins(
    `INSERT INTO "MarketingPartner"(id,"groupId","companyId",name,kind,status,"updatedAt") VALUES ($1,$2,NULL,$3,'PRINTER','ACTIVE',now())`,
    [X.partner, G, 'E2E Gráfica Rápida MS'],
  )
}

// ── Roteiro da API ──────────────────────────────────────────────────────────
const E = {} // lançamentos criados
const files = {} // notas subidas (bytes)

async function apiPart() {
  const exp = (who, body) => call(who, 'POST', '/expenses', body)
  const base = { companyId: C.pet, date: `${MONTH}-05`, description: 'x', amountCents: 1000, category: 'Gráfica' }

  section('F1: vínculo de outra marca e categoria fora da lista')
  let r = await exp('marcel', { ...base, description: 'E2E campanha errada', campaignId: X.campEmmi })
  check(r.status === 400 && /outra marca/.test(r.data.message), 'campanha da Emmitec num lançamento da PetJourney: 400', `${r.status} ${r.data.message}`)
  r = await exp('marcel', { ...base, description: 'E2E categoria errada', category: 'Viagem' })
  check(r.status === 400 && /não está na lista/.test(r.data.message), 'categoria fora da lista: 400', `${r.status} ${r.data.message}`)
  r = await exp('marcel', { ...base, description: 'E2E sem valor', amountCents: 'abc' })
  const msg = Array.isArray(r.data.message) ? r.data.message.join(' ') : r.data.message
  check(r.status === 400 && /centavos/.test(msg), 'valor inválido: 400 com a frase em PT-BR', msg)
  r = await exp('marcel', { ...base, date: '2026-02-30', description: 'E2E data' })
  check(r.status === 400 && /Data/.test(r.data.message), 'data que não existe: 400', r.data.message)
  r = await exp('marcel', { ...base, description: 'E2E vínculo de outro grupo', activationId: 'nao-existe' })
  check(r.status === 400, 'ativação inexistente: 400 (mesma resposta de outra marca)')

  section('Lançamentos do mês (dados das telas)')
  const mk = async (who, body, key) => {
    const res = await exp(who, body)
    if (res.status !== 201) console.log('   criar falhou', res.status, res.data)
    E[key] = res.data
    return res
  }
  r = await mk('marcel', {
    companyId: C.pet, date: `${MONTH}-03`, description: 'Meta Ads: campanha Dia dos Pets', amountCents: 120000,
    category: 'Tráfego pago', status: 'PAID', paymentMethod: 'Cartão de crédito', supplier: 'Meta', campaignId: X.campPet,
  }, 'meta')
  check(r.status === 201 && r.data.campaignName === 'E2E Dia dos Pets', 'lança com campanha da mesma marca (201) e devolve o nome', r.data.campaignName)
  await mk('marcel', {
    companyId: C.pet, date: `${MONTH}-04`, description: 'Folders da Feira Pet (500 un.)', amountCents: 48000,
    category: 'Gráfica', status: 'PAID', partnerId: X.partner, activationId: X.atvPet,
  }, 'folders')
  await mk('marcel', {
    companyId: C.pet, date: `${MONTH}-06`, description: 'Placas de balcão das clínicas', amountCents: 26050,
    category: 'Gráfica', status: 'PAID', partnerId: X.partner,
  }, 'placas')
  await mk('leticia', {
    companyId: C.pet, date: `${MONTH}-12`, description: 'Brindes da palestra no CRMV', amountCents: 35000,
    category: 'Brindes', status: 'PLANNED',
  }, 'brindes')
  await mk('marcel', {
    companyId: C.pet, date: `${MONTH}-02`, description: 'CapCut Pro', amountCents: 3290,
    category: 'Ferramentas e assinaturas', status: 'PAID', noInvoiceNeeded: true, paymentMethod: 'Cartão de crédito',
  }, 'capcut')
  await mk('marcel', {
    companyId: C.pet, date: `${MONTH}-08`, description: 'Fotógrafo da sessão de outubro', amountCents: 90000,
    category: 'Produção de conteúdo', status: 'PAID', supplier: 'Estúdio Luz',
  }, 'foto')
  await mk('marcel', {
    companyId: C.emmitec, date: `${MONTH}-07`, description: 'E2E Anúncio LinkedIn EMMI', amountCents: 75000,
    category: 'Tráfego pago', status: 'PAID', campaignId: X.campEmmi,
  }, 'emmi')
  await mk('leticia', {
    companyId: C.nevo, date: `${MONTH}-09`, description: 'Camisetas do time Nevo', amountCents: 64000,
    category: 'Brindes', status: 'PLANNED',
  }, 'nevo')
  check(Object.keys(E).length === 8 && Object.values(E).every((e) => e?.id), '8 lançamentos criados')

  section('F2: pago sem nota, subir nota, "não precisa"')
  let list = await call('marcel', 'GET', `/expenses?month=${MONTH}&companyId=${C.pet}`)
  const byId = (l, id) => l.data.items.find((i) => i.id === id)
  check(byId(list, E.folders.id)?.missingInvoice === true, 'pago sem nota vem com missingInvoice')
  check(byId(list, E.brindes.id)?.missingInvoice === false, 'previsto não cobra nota')
  check(byId(list, E.capcut.id)?.missingInvoice === false, 'noInvoiceNeeded tira o aviso')
  let missing = await call('marcel', 'GET', `/expenses?month=${MONTH}&companyId=${C.pet}&missingInvoice=1`)
  const missIds = missing.data.items.map((i) => i.id)
  check(missIds.includes(E.folders.id) && missIds.includes(E.meta.id) && !missIds.includes(E.capcut.id), 'filtro missingInvoice=1 lista só os sem nota', `${missIds.length}`)
  let sum = await call('marcel', 'GET', `/summary?month=${MONTH}&companyId=${C.pet}`)
  const before = sum.data.missingInvoiceCount
  check(before === missIds.length, 'contador do topo = filtro', `${before}`)

  files.meta = fakePdf('meta')
  r = await uploadInvoice('marcel', E.meta.id, 'NF Meta outubro.pdf', files.meta, 'application/pdf')
  check(r.status === 201 && r.data.status === 'READY', 'nota sobe por ticket + PUT + confirm', `${r.status}`)
  files.metaAsset = r.data
  files.folders = fakePdf('folders')
  r = await uploadInvoice('marcel', E.folders.id, 'nf-123-grafica.pdf', files.folders, 'application/pdf')
  files.foldersAsset = r.data
  files.foldersXml = Buffer.from('<?xml version="1.0"?><nfeProc><NFe>123</NFe></nfeProc>')
  r = await uploadInvoice('marcel', E.folders.id, 'nf-123-grafica.xml', files.foldersXml, 'text/xml')
  check(r.status === 201, 'XML da NF-e também sobe')
  r = await call('marcel', 'POST', `/expenses/${E.foto.id}/invoices`, { name: 'virus.exe', mimeType: 'application/x-msdownload', size: 10 })
  check(r.status === 400 && /PDF, XML ou imagem/.test(r.data.message), 'arquivo que não é nota: 400', r.data.message)
  list = await call('marcel', 'GET', `/expenses?month=${MONTH}&companyId=${C.pet}`)
  check(byId(list, E.meta.id)?.missingInvoice === false && byId(list, E.meta.id)?.invoices.length === 1, 'subir a nota tira o aviso')
  check(!!byId(list, E.meta.id)?.invoices[0]?.url, 'nota vem com URL assinada')
  check(byId(list, E.folders.id)?.invoices.length === 2, 'duas notas no mesmo lançamento')
  r = await call('marcel', 'PATCH', `/expenses/${E.placas.id}`, { noInvoiceNeeded: true })
  check(r.status === 200 && r.data.missingInvoice === false, 'PATCH noInvoiceNeeded tira o aviso')
  sum = await call('marcel', 'GET', `/summary?month=${MONTH}&companyId=${C.pet}`)
  check(sum.data.missingInvoiceCount === before - 3, 'contador caiu 3 (2 notas + 1 não precisa)', `${before} -> ${sum.data.missingInvoiceCount}`)
  missing = await call('marcel', 'GET', `/expenses?month=${MONTH}&companyId=${C.pet}&missingInvoice=1`)
  check(!missing.data.items.some((i) => [E.meta.id, E.folders.id, E.placas.id].includes(i.id)), 'filtro não mostra mais os resolvidos')
  r = await call('marcel', 'PATCH', `/expenses/${E.placas.id}`, { campaignId: X.campEmmi })
  check(r.status === 400, 'PATCH com campanha de outra marca: 400')
  r = await call('marcel', 'PATCH', `/expenses/${E.placas.id}`, { campaignId: X.campPet })
  check(r.status === 200 && r.data.campaignId === X.campPet, 'PATCH com campanha da marca: 200')
  r = await call('marcel', 'PATCH', `/expenses/${E.placas.id}`, { campaignId: null })
  check(r.status === 200 && r.data.campaignId === null, 'PATCH com null limpa o vínculo')

  section('F3: recorrente (dia 31 em fevereiro, idempotência)')
  r = await call('marcel', 'POST', '/recurring', {
    companyId: C.pet, description: 'Canva Pro', amountCents: 3490, category: 'Ferramentas e assinaturas',
    supplier: 'Canva', dayOfMonth: 31, startMonth: '2026-01',
  })
  check(r.status === 201, 'regra do dia 31 criada', `${r.status}`)
  X.ruleCanva = r.data.id
  r = await call('leticia', 'POST', '/recurring', {
    companyId: C.pet, description: 'Agência de tráfego', amountCents: 150000, category: 'Tráfego pago',
    dayOfMonth: 10, startMonth: '2026-01', endMonth: '2026-06',
  })
  X.ruleAgencia = r.data.id
  r = await call('marcel', 'POST', '/recurring', {
    companyId: C.pet, description: 'E2E período errado', amountCents: 1, category: 'Gráfica', dayOfMonth: 1, startMonth: '2026-05', endMonth: '2026-04',
  })
  check(r.status === 400, 'último mês antes do primeiro: 400')
  r = await call('marcel', 'POST', '/recurring', {
    companyId: C.pet, description: 'E2E dia 32', amountCents: 1, category: 'Gráfica', dayOfMonth: 32, startMonth: '2026-05',
  })
  check(r.status === 400, 'dia 32: 400')
  sum = await call('marcel', 'GET', `/summary?month=2026-02&companyId=${C.pet}`)
  const pend = sum.data.recurringPending
  check(pend.count === 2 && pend.items.some((i) => i.date === '2026-02-28'), 'resumo de fev/2026: 2 pendentes, Canva no dia 28', JSON.stringify(pend.items.map((i) => i.date)))
  list = await call('marcel', 'GET', '/expenses?month=2026-02')
  check(list.data.items.length === 0, 'GET nunca escreve: fevereiro continua vazio')
  r = await call('marcel', 'POST', '/recurring/generate', { month: '2026-02' })
  check(r.status === 201 && r.data.created === 2 && r.data.skipped === 0, 'gerar fevereiro: 2 criados', JSON.stringify(r.data))
  r = await call('marcel', 'POST', '/recurring/generate', { month: '2026-02' })
  check(r.data.created === 0 && r.data.skipped === 2, 'gerar de novo: 0 criados, 2 pulados (idempotente)', JSON.stringify(r.data))
  const [g1, g2] = await Promise.all([
    call('marcel', 'POST', '/recurring/generate', { month: '2026-03' }),
    call('leticia', 'POST', '/recurring/generate', { month: '2026-03' }),
  ])
  check(g1.status === 201 && g2.status === 201 && g1.data.created + g2.data.created === 2, 'duas pessoas ao mesmo tempo: 2 no total, sem erro', `${g1.data.created}+${g2.data.created}`)
  list = await call('marcel', 'GET', '/expenses?month=2026-02')
  const feb = list.data.items
  check(feb.length === 2 && feb.some((e) => e.date === '2026-02-28' && e.description === 'Canva Pro'), 'fevereiro tem 2 lançamentos, Canva em 28/02', feb.map((e) => e.date).join(','))
  check(feb.every((e) => e.recurringId && e.status === 'PAID'), 'lançado como pago (a data já passou) e ligado à regra')
  r = await call('marcel', 'POST', '/recurring/generate', { month: '2028-02' })
  list = await call('marcel', 'GET', '/expenses?month=2028-02')
  check(r.data.created === 1 && list.data.items[0]?.date === '2028-02-29', '2028 é bissexto: 29/02 (agência já acabou)', list.data.items[0]?.date)
  check(list.data.items[0]?.status === 'PLANNED', 'data futura entra como previsto')
  r = await call('marcel', 'PATCH', `/recurring/${X.ruleCanva}`, { dayOfMonth: 15 })
  r = await call('marcel', 'POST', '/recurring/generate', { month: '2026-02' })
  check(r.data.created === 0, 'mudar o dia da regra não duplica o mês já lançado')
  r = await call('marcel', 'PATCH', `/recurring/${X.ruleCanva}`, { dayOfMonth: 31 })
  r = await call('marcel', 'DELETE', `/recurring/${X.ruleAgencia}`)
  check(r.status === 403, 'Editor não apaga regra (só Admin)')
  const rec = await call('diretoria', 'GET', `/recurring?month=${MONTH}`)
  check(rec.status === 200 && rec.data.items.some((i) => i.id === X.ruleCanva && i.monthState === 'PENDING'), 'Visualizador lê as regras; Canva pendente no mês atual')

  section('F4: resumo do mês x soma dos lançamentos, estouro do orçamento')
  const f4 = [
    ['Tráfego pago', 'PAID', 80000], ['Tráfego pago', 'PLANNED', 30000],
    ['Gráfica', 'PAID', 45050], ['Gráfica', 'PAID', 12000], ['Gráfica', 'PLANNED', 9900],
    ['Brindes', 'PAID', 7000], ['Brindes', 'PLANNED', 15000],
  ]
  for (const [category, status, amountCents] of f4) {
    await exp('marcel', { companyId: C.pet, date: `${F4_MONTH}-10`, description: `E2E F4 ${category} ${status}`, amountCents, category, status })
  }
  r = await call('marcel', 'PUT', '/budgets', { companyId: C.pet, month: F4_MONTH, category: 'Gráfica', amountCents: 50000 })
  check(r.status === 403, 'Editor não define orçamento (403)')
  r = await call('leticia', 'PUT', '/budgets', { companyId: C.pet, month: F4_MONTH, category: 'Gráfica', amountCents: 50000 })
  check(r.status === 200 && r.data.amountCents === 50000, 'Admin define orçamento (PUT faz upsert)', `${r.status}`)
  await call('leticia', 'PUT', '/budgets', { companyId: C.pet, month: F4_MONTH, category: 'Gráfica', amountCents: 60000 })
  await call('leticia', 'PUT', '/budgets', { companyId: C.pet, month: F4_MONTH, category: 'Gráfica', amountCents: 50000 })
  await call('leticia', 'PUT', '/budgets', { companyId: C.pet, month: F4_MONTH, category: 'Tráfego pago', amountCents: 150000 })
  r = await call('leticia', 'PUT', '/budgets', { companyId: C.pet, month: F4_MONTH, category: 'Viagem', amountCents: 1 })
  check(r.status === 400, 'orçamento de categoria fora da lista: 400')
  const budgets = await call('diretoria', 'GET', `/budgets?year=2027&companyId=${C.pet}`)
  check(budgets.status === 200 && budgets.data.filter((b) => b.month === F4_MONTH).length === 2, 'upsert não duplica: 2 orçamentos no mês', `${budgets.data.length}`)
  sum = await call('diretoria', 'GET', `/summary?month=${F4_MONTH}&companyId=${C.pet}`)
  list = await call('diretoria', 'GET', `/expenses?month=${F4_MONTH}&companyId=${C.pet}`)
  const items = list.data.items
  const add = (f) => items.filter(f).reduce((s, e) => s + e.amountCents, 0)
  let all = true
  for (const cat of ['Tráfego pago', 'Gráfica', 'Brindes']) {
    const line = sum.data.categories.find((l) => l.category === cat)
    const paid = add((e) => e.category === cat && e.status === 'PAID')
    const planned = add((e) => e.category === cat && e.status === 'PLANNED')
    const ok = line.paidCents === paid && line.plannedCents === planned
    all &&= ok
    check(ok, `${cat}: pago ${paid} e previsto ${planned} batem com os lançamentos`)
  }
  check(sum.data.total.paidCents === add((e) => e.status === 'PAID') && sum.data.total.plannedCents === add((e) => e.status === 'PLANNED'), 'total do mês bate com a soma da lista')
  const graf = sum.data.categories.find((l) => l.category === 'Gráfica')
  check(graf.over === true && graf.diffCents === 50000 - 66950, 'Gráfica estourou: saldo -169,50', `${graf.diffCents}`)
  const traf = sum.data.categories.find((l) => l.category === 'Tráfego pago')
  check(traf.over === false && traf.diffCents === 40000, 'Tráfego dentro: saldo 400,00')
  check(sum.data.total.budgetCents === 200000 && sum.data.total.budgetSource === 'categories', 'total orçado = soma das categorias (sem total do mês)')
  await call('leticia', 'PUT', '/budgets', { companyId: C.pet, month: F4_MONTH, category: '', amountCents: 180000 })
  sum = await call('diretoria', 'GET', `/summary?month=${F4_MONTH}&companyId=${C.pet}`)
  check(sum.data.total.budgetCents === 180000 && sum.data.total.over === true, 'orçamento total do mês vence a soma e mostra o estouro geral', `${sum.data.total.diffCents}`)
  const year = await call('diretoria', 'GET', `/year?year=2027&companyId=${C.pet}`)
  const yGraf = year.data.rows.find((x) => x.category === 'Gráfica')
  check(year.status === 200 && yGraf.months[2].paidCents === 57050 && yGraf.months[2].budgetCents === 50000, 'visão do ano: março de 2027 na coluna certa')
  check(year.data.totals[2].budgetCents === 180000, 'visão do ano: total orçado do mês pela mesma regra')

  // Orçamento do mês atual (telas)
  for (const [category, amountCents] of [['Tráfego pago', 150000], ['Gráfica', 60000], ['Produção de conteúdo', 100000]]) {
    await call('leticia', 'PUT', '/budgets', { companyId: C.pet, month: MONTH, category, amountCents })
  }
  await call('leticia', 'PUT', '/budgets', { companyId: C.emmitec, month: MONTH, category: 'Tráfego pago', amountCents: 50000 })

  section('F5: Excel, PDF e zip das notas')
  r = await call('diretoria', 'GET', `/export.xlsx?month=${F4_MONTH}&companyId=${C.pet}`, undefined, { raw: true })
  const cd = r.headers.get('content-disposition') ?? ''
  check(r.status === 200 && r.data.subarray(0, 2).toString() === 'PK', '.xlsx do mês: 200 e é zip', `${r.status}`)
  check(/filename="Financeiro-PetJourney-2027-03\.xlsx"/.test(cd) && /filename\*=UTF-8''Financeiro%20PetJourney%202027-03\.xlsx/.test(cd), 'Content-Disposition com filename ASCII e filename* UTF-8', cd)
  check((r.headers.get('access-control-expose-headers') ?? '').includes('Content-Disposition'), 'Content-Disposition exposto no CORS')
  const xlsxPath = path.join(FILES, `financeiro-${F4_MONTH}.xlsx`)
  fs.writeFileSync(xlsxPath, r.data)
  const parts = readZip(r.data)
  const names = parts.map((p) => p.name)
  check(['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/styles.xml', 'xl/sharedStrings.xml'].every((n) => names.includes(n)), 'partes do OOXML presentes', names.join(', '))
  check(parts.every((p) => p.crcOk), 'CRC de todas as partes confere (zlib do Node)')
  check(parts.find((p) => p.name === 'xl/workbook.xml').data.toString().includes('name="Lançamentos"'), 'workbook com a aba Lançamentos')
  try {
    const wb = JSON.parse(python(OPENPYXL, xlsxPath))
    check(wb.sheets.join('|') === 'Lançamentos|Resumo', 'openpyxl abre o .xlsx: abas Lançamentos e Resumo', wb.sheets.join('|'))
    const rows = wb.data['Lançamentos']
    const header = rows[0]
    const iDesc = header.indexOf('Descrição')
    const iVal = header.indexOf('Valor')
    const iDate = header.indexOf('Data')
    const row = rows.find((x) => x[iDesc] === 'E2E F4 Gráfica PAID' && x[iVal] === 450.5)
    check(!!row, 'linha do lançamento com o valor em reais (450,50)', JSON.stringify(rows[1]))
    check(String(row?.[iDate]).startsWith(`${F4_MONTH}-10`), 'data sai como data de verdade', String(row?.[iDate]))
    const totalPaid = rows.find((x) => x.includes('Total pago'))
    check(totalPaid && totalPaid[iVal] === (80000 + 45050 + 12000 + 7000) / 100, 'total pago (fórmula com valor em cache) = 1.440,50', JSON.stringify(totalPaid))
    const resumo = wb.data.Resumo.find((x) => x[0] === 'Gráfica')
    check(resumo && resumo[1] === 500 && resumo[5] === -169.5, 'Resumo: Gráfica orçado 500, saldo -169,50', JSON.stringify(resumo))
  } catch (e) {
    check(false, 'openpyxl abre o .xlsx', String(e.message).slice(0, 200))
  }
  r = await call('diretoria', 'GET', `/export.xlsx?year=2027&companyId=${C.pet}`, undefined, { raw: true })
  const xlsxYear = path.join(FILES, 'financeiro-2027.xlsx')
  fs.writeFileSync(xlsxYear, r.data)
  try {
    const wb = JSON.parse(python(OPENPYXL, xlsxYear))
    check(wb.sheets.join('|') === 'Pago 2027|Previsto 2027|Orçamento 2027|Lançamentos 2027', '.xlsx do ano: 4 abas', wb.sheets.join('|'))
    const g = wb.data['Pago 2027'].find((x) => x[0] === 'Gráfica')
    check(g && g[3] === 570.5 && g[13] === 570.5, 'matriz do ano: Gráfica em março = 570,50', JSON.stringify(g))
  } catch (e) {
    check(false, 'openpyxl abre o .xlsx do ano', String(e.message).slice(0, 200))
  }
  r = await call('diretoria', 'GET', `/export.pdf?month=${MONTH}`, undefined, { raw: true })
  check(r.status === 200 && r.data.subarray(0, 5).toString() === '%PDF-', 'PDF do mês começa com %PDF', `${r.status}`)
  check((r.headers.get('content-disposition') ?? '').includes("filename*=UTF-8''Relat%C3%B3rio%20financeiro"), 'nome do PDF com acento no filename*')
  fs.writeFileSync(path.join(FILES, `financeiro-${MONTH}.pdf`), r.data)
  r = await call('diretoria', 'GET', `/invoices.zip?month=${MONTH}&companyId=${C.pet}`, undefined, { raw: true })
  check(r.status === 200 && r.data.subarray(0, 2).toString() === 'PK', 'zip das notas: 200', `${r.status}`)
  const zipPath = path.join(FILES, `notas-${MONTH}.zip`)
  fs.writeFileSync(zipPath, r.data)
  const zip = readZip(r.data)
  check(zip.length === 3, 'zip tem as 3 notas do mês', zip.map((z) => z.name).join(', '))
  check(zip.every((z) => z.crcOk), 'CRC e tamanho de cada nota conferem')
  const want = [files.meta, files.folders, files.foldersXml].map(sha).sort()
  check(JSON.stringify(zip.map((z) => sha(z.data)).sort()) === JSON.stringify(want), 'bytes das notas no zip = bytes enviados (sha256)')
  check(zip.some((z) => /^\d{4}-\d{2}-03_meta-ads-campanha-dia-dos-pets_NF Meta outubro\.pdf$/.test(z.name)), 'nome da entrada: data_descricao_arquivo, sem acento', zip.map((z) => z.name).join(' | '))
  try {
    const entries = dotnetZip(zipPath)
    check(entries.length === 3 && entries.every((e) => Number(e.split('|')[1]) > 0), '.NET (System.IO.Compression) abre o zip', entries.join(' ; '))
  } catch (e) {
    check(false, '.NET abre o zip', String(e.message).slice(0, 160))
  }
  files.emmi = fakePdf('emmi')
  await uploadInvoice('marcel', E.emmi.id, 'NF LinkedIn.pdf', files.emmi, 'application/pdf')
  r = await call('diretoria', 'GET', `/invoices.zip?month=${MONTH}`, undefined, { raw: true })
  const allZip = r.status === 200 ? readZip(r.data) : []
  check(
    allZip.length === 4 &&
      allZip.filter((z) => z.name.startsWith('PetJourney/')).length === 3 &&
      allZip.some((z) => z.name.startsWith('Emmitec/')),
    'zip de todas as marcas separa por pasta da marca',
    allZip.map((z) => z.name).join(' | '),
  )
  r = await call('diretoria', 'GET', '/invoices.zip?month=2026-01')
  check(r.status === 404 && /Nenhuma nota/.test(r.data.message), 'mês sem nota: 404 com a frase')
  // Teto de 300 MB: um arquivo de 301 MB só no banco (o plano confere ANTES de ler o storage)
  const bigId = rid()
  await db.query(
    `INSERT INTO "MarketingAsset"(id,"groupId","companyId","expenseId",name,"storagePath","mimeType",size,status) VALUES ($1,$2,$3,$4,'grande.pdf',$5,'application/pdf',$6,'READY')`,
    [bigId, G, C.pet, E.foto.id, `marketing/${G}/nao-existe.pdf`, 301 * 1024 * 1024],
  )
  r = await call('diretoria', 'GET', `/invoices.zip?month=${MONTH}&companyId=${C.pet}`)
  check(r.status === 400 && /300 MB/.test(r.data.message), 'acima de 300 MB: 400 com a frase', r.data.message)
  await db.query('DELETE FROM "MarketingAsset" WHERE id=$1', [bigId])

  section('F7: freelancer (só PetJourney) não vê a Emmitec')
  list = await call('freela', 'GET', `/expenses?month=${MONTH}`)
  check(list.status === 200 && list.data.items.length > 0 && list.data.items.every((i) => i.companyId === C.pet), 'lista do freelancer só tem PetJourney', `${list.data.items.length}`)
  check(!list.data.items.some((i) => i.id === E.emmi.id), 'lançamento da Emmitec não aparece')
  for (const [m, route, body] of [
    ['GET', `/expenses?month=${MONTH}&companyId=${C.emmitec}`],
    ['GET', `/summary?month=${MONTH}&companyId=${C.emmitec}`],
    ['GET', `/year?year=2026&companyId=${C.emmitec}`],
    ['GET', `/export.xlsx?month=${MONTH}&companyId=${C.emmitec}`],
    ['GET', `/invoices.zip?month=${MONTH}&companyId=${C.emmitec}`],
    ['POST', '/expenses', { ...base, companyId: C.emmitec, description: 'E2E freela' }],
  ]) {
    r = await call('freela', m, route, body)
    check(r.status === 403, `freelancer ${m} ${route.split('?')[0]} da Emmitec: 403`, `${r.status}`)
  }
  r = await call('freela', 'GET', `/expenses/${E.emmi.id}`)
  check(r.status === 404, 'freelancer abrindo o id da Emmitec: 404 (mesma resposta de "não existe")')
  r = await call('freela', 'PATCH', `/expenses/${E.emmi.id}`, { amountCents: 1 })
  check(r.status === 404, 'freelancer editando o id da Emmitec: 404')
  r = await call('freela', 'POST', `/expenses/${E.emmi.id}/invoices`, { name: 'a.pdf', mimeType: 'application/pdf', size: 10 })
  check(r.status === 404, 'freelancer subindo nota na Emmitec: 404')
  sum = await call('freela', 'GET', `/summary?month=${MONTH}`)
  check(sum.data.total.paidCents === list.data.totals.paidCents, 'resumo do freelancer só soma a PetJourney')
  r = await call('freela', 'GET', '/options')
  check(!r.data.campaigns.some((c) => c.id === X.campEmmi), 'opções do freelancer sem a campanha da Emmitec')

  section('Papéis: quem é de fora, Visualizador, apagar')
  r = await call('luis', 'GET', `/expenses?month=${MONTH}`)
  check(r.status === 403, 'quem é de fora da ala: 403')
  r = await call('diretoria', 'GET', `/expenses?month=${MONTH}`)
  check(r.status === 200, 'Visualizador lê (viewerSeesFinance padrão = true)')
  for (const [m, route, body] of [
    ['POST', '/expenses', { ...base, description: 'E2E viewer' }],
    ['PATCH', `/expenses/${E.meta.id}`, { amountCents: 1 }],
    ['DELETE', `/expenses/${E.meta.id}`],
    ['POST', `/expenses/${E.meta.id}/invoices`, { name: 'a.pdf', mimeType: 'application/pdf', size: 10 }],
    ['POST', '/recurring/generate', { month: MONTH }],
    ['PUT', '/budgets', { companyId: C.pet, month: MONTH, category: '', amountCents: 1 }],
  ]) {
    r = await call('diretoria', m, route, body)
    check(r.status === 403, `Visualizador ${m} ${route}: 403`, `${r.status}`)
  }
  r = await call('marcel', 'DELETE', `/expenses/${E.brindes.id}`)
  check(r.status === 403 && /só apaga o que você criou/.test(r.data.message), 'Editor não apaga o lançamento da Letícia', r.data.message)
  // Apagar leva a nota do storage junto
  const tmp = await exp('marcel', { ...base, description: 'E2E apagar com nota', date: `${MONTH}-20` })
  const tmpPdf = fakePdf('apagar')
  const up = await uploadInvoice('marcel', tmp.data.id, 'apagar.pdf', tmpPdf, 'application/pdf')
  const dl = await call('marcel', 'GET', `/marketing/g/${G}/assets/${up.data.id}/download`)
  const before404 = await fetch(dl.data.url)
  r = await call('marcel', 'DELETE', `/expenses/${tmp.data.id}`)
  check(r.status === 200 && r.data.removedInvoices === 1, 'Editor apaga o que criou, com a nota', JSON.stringify(r.data))
  const after = await fetch(dl.data.url)
  check(before404.ok && !after.ok, 'objeto da nota sumiu do storage', `${before404.status} -> ${after.status}`)
  r = await call('marcel', 'GET', `/marketing/g/${G}/assets/${up.data.id}/download`)
  check(r.status === 404, 'download da nota apagada: 404')
  r = await call('marcel', 'DELETE', `/expenses/${E.folders.id}/invoices/${files.foldersAsset.id}`)
  check(r.status === 200, 'Editor tira uma nota do lançamento')
  r = await call('marcel', 'GET', `/expenses?month=${MONTH}&companyId=${C.pet}`)
  check(byId(r, E.folders.id).invoices.length === 1, 'sobrou só o XML no lançamento dos folders')
  // volta a nota em PDF para o zip e as telas
  await uploadInvoice('marcel', E.folders.id, 'nf-123-grafica.pdf', files.folders, 'application/pdf')

  section('F6: viewerSeesFinance = false no banco')
  await setViewerSeesFinance(false)
  const me = await call('diretoria', 'GET', '/marketing/me')
  check(me.data.groups[0].permissions.seeFinance === false, '/marketing/me manda seeFinance = false (o menu esconde a aba)')
  const routes = [
    `/expenses?month=${MONTH}`, `/expenses/${E.meta.id}`, `/summary?month=${MONTH}`, '/year?year=2026', '/budgets?year=2026',
    `/recurring?month=${MONTH}`, '/options', `/export.xlsx?month=${MONTH}`, '/export.xlsx?year=2026',
    `/export.pdf?month=${MONTH}`, `/invoices.zip?month=${MONTH}`,
  ]
  let all403 = true
  for (const route of routes) {
    r = await call('diretoria', 'GET', route)
    const ok = r.status === 403 && /financeiro não está liberado/.test(r.data.message)
    all403 &&= ok
    if (!ok) console.log('   ', route, r.status, r.data.message)
  }
  check(all403, `Diretoria leva 403 com a frase nas ${routes.length} leituras do financeiro`)
  r = await call('marcel', 'GET', `/expenses?month=${MONTH}`)
  check(r.status === 200, 'Editor segue vendo com a chave desligada')
  await setViewerSeesFinance(true)
  r = await call('diretoria', 'GET', `/summary?month=${MONTH}`)
  check(r.status === 200, 'religada a chave, a Diretoria volta a ver')
}

// ── Tela ────────────────────────────────────────────────────────────────────
async function open(browser, who, route, vp, activeCompany) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.mobile ? 2 : 1,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    reducedMotion: 'reduce',
    acceptDownloads: true,
  })
  await ctx.addInitScript(([tk, c]) => {
    localStorage.setItem('token', tk)
    if (c) localStorage.setItem('activeCompany', c)
    localStorage.setItem('onboarding.autoShown', '1')
    localStorage.setItem('onboarding.completed', '1')
    localStorage.setItem('ui.idlePermissionPrompt', 'done')
  }, [tok[who], activeCompany ?? null])
  const page = await ctx.newPage()
  const bad = []
  page.on('response', (res) => {
    const u = res.url()
    if (u.startsWith(API) && (res.status() === 401 || res.status() >= 500)) bad.push(`${res.status()} ${u.replace(API, '')}`)
  })
  await page.goto(WEB + route, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  return { ctx, page, bad }
}

const desk = { width: 1440, height: 900, mobile: false }
const phone = { width: 375, height: 812, mobile: true }
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })
/** innerText sem o NBSP que o Intl põe em "R$ 1,00" */
const txt = async (loc) => (await loc.innerText()).replace(/\u00a0/g, ' ')
const fin = (q) => `/marketing/financeiro?${new URLSearchParams(q).toString()}`

async function noSideScroll(page) {
  return page.evaluate(() => {
    const doc = document.documentElement.scrollWidth
    const main = document.querySelector('main')
    return { doc, main: main ? main.scrollWidth - main.clientWidth : 0, w: window.innerWidth }
  })
}

async function uiPart() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const pdfBuf = fakePdf('tela')

  section('Tela: Admin (Letícia), 1440')
  {
    const { ctx, page, bad } = await open(browser, 'leticia', fin({ mes: MONTH }), desk, C.pet)
    await page.waitForSelector('.fe-table')
    await shot(page, 'admin-lancamentos-todas-d1440')
    const tabs = await page.locator('.mk-tab').allInnerTexts()
    check(tabs.some((t) => t.includes('Financeiro')), 'Admin vê a aba Financeiro no menu da ala')
    check(await page.locator('.fe-col-brand').count() > 0, 'com "Todas as marcas" a tabela mostra a coluna Marca')
    check(await page.locator('.fin-strip').count() === 1, 'faixa com pago, previsto, orçado, saldo e sem nota')
    const missingChip = await page.locator('tr.fe-row', { hasText: 'Fotógrafo da sessão' }).locator('.fe-chip-missing').count()
    check(missingChip === 1, 'chip "Sem nota" na linha paga sem nota')
    // Filtro sem nota pela URL
    await page.getByRole('button', { name: 'Sem nota', exact: true }).click()
    await page.waitForTimeout(500)
    check(page.url().includes('semNota=1'), 'filtro sem nota vai para a URL')
    const rowsMissing = await page.locator('tr.fe-row').count()
    const withChip = await page.locator('tr.fe-row .fe-chip-missing').count()
    check(rowsMissing > 0 && rowsMissing === withChip, 'com o filtro, só linhas sem nota', `${rowsMissing}/${withChip}`)
    await page.goto(WEB + fin({ mes: MONTH, marca: C.pet }), { waitUntil: 'networkidle' })
    await page.waitForSelector('.fe-table')
    await shot(page, 'admin-lancamentos-pet-d1440')
    // Diálogo completo
    await page.locator('tr.fe-row', { hasText: 'Folders da Feira' }).click()
    await page.waitForSelector('[role=dialog]')
    await page.waitForTimeout(250)
    check(await page.locator('[role=dialog] .fx-file').count() === 2, 'diálogo mostra as 2 notas (PDF e XML)')
    await shot(page, 'admin-dialogo-lancamento-d1440')
    await page.locator('[role=dialog]').getByRole('button', { name: 'Cancelar' }).click()
    // Orçamento: editar na célula
    await page.locator('.fin-tab', { hasText: 'Orçamento' }).click()
    await page.waitForSelector('.fb-table')
    const overRow = page.locator('.fb-table tbody tr', { hasText: 'Gráfica' })
    check(await overRow.locator('.fin-neg').count() === 1, 'Orçamento: saldo da Gráfica em vermelho (estourou)')
    await page.getByRole('button', { name: 'Editar orçado de Brindes' }).click()
    await page.keyboard.type('300')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
    const b = await call('leticia', 'GET', `/budgets?year=${MONTH.slice(0, 4)}&companyId=${C.pet}`)
    check(b.data.some((x) => x.month === MONTH && x.category === 'Brindes' && x.amountCents === 30000), 'Admin edita o orçado na célula (Enter grava R$ 300,00)')
    check((await txt(page.locator('.fb-table tbody tr', { hasText: 'Brindes' }))).includes('R$ 300,00'), 'célula mostra o valor novo')
    await shot(page, 'admin-orcamento-d1440')
    // Ano
    await page.locator('.fin-tab', { hasText: 'Ano' }).click()
    await page.waitForSelector('.fy-table')
    check(await page.locator('.fy-table thead th').count() === 14, 'Ano: categoria + 12 meses + total')
    const totalBox = await page.locator('.fy-table thead th.fy-total').boundingBox()
    check(totalBox && totalBox.x + totalBox.width <= 1440, 'Ano: coluna Total inteira à vista em 1440', JSON.stringify(totalBox))
    check(await page.locator('.fin-files').getByRole('button', { name: 'PDF' }).count() === 0, 'Ano: sem PDF e zip (são do mês), só o Excel do ano')
    await shot(page, 'admin-ano-d1440')
    // Recorrentes: aviso e Lançar
    await page.locator('.fin-tab', { hasText: 'Recorrentes' }).click()
    await page.waitForSelector('.frt-table')
    const notice = page.locator('.fin-notice')
    check(await notice.count() === 1 && (await notice.innerText()).includes('Canva Pro'), 'aviso "recorrente ainda não lançado" com o Canva')
    await shot(page, 'admin-recorrentes-d1440')
    await notice.getByRole('button', { name: 'Lançar' }).click()
    await page.waitForTimeout(900)
    check(await page.locator('.fin-notice').count() === 0, 'Lançar some com o aviso')
    check((await page.locator('.frt-table tbody tr', { hasText: 'Canva Pro' }).innerText()).includes('Lançado'), 'regra passa a "Lançado" no mês')
    const again = await call('leticia', 'POST', '/recurring/generate', { month: MONTH })
    check(again.data.created === 0, 'gerar de novo pela API depois da tela: nada novo')
    // Exportar pela tela (o front lê o nome do Content-Disposition)
    await page.locator('.fin-tab', { hasText: 'Lançamentos' }).click()
    await page.waitForSelector('.fe-table')
    for (const [label, expected] of [
      ['Excel', `Financeiro PetJourney ${MONTH}.xlsx`],
      ['PDF', `Relatório financeiro PetJourney ${MONTH}.pdf`],
      ['Notas do mês (.zip)', `Notas fiscais PetJourney ${MONTH}.zip`],
    ]) {
      const [dl] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }),
        page.locator('.fin-files').getByRole('button', { name: label }).click(),
      ])
      const name = dl.suggestedFilename()
      const p = path.join(FILES, `tela-${name}`)
      await dl.saveAs(p)
      const head = fs.readFileSync(p).subarray(0, 4).toString('latin1')
      check(name === expected && (head.startsWith('PK') || head.startsWith('%PDF')), `tela baixa "${expected}"`, `${name} ${head}`)
    }
    check(bad.length === 0, 'Admin 1440: nenhuma 401/5xx', bad.join(', '))
    await ctx.close()
  }

  section('Tela: Editor (Marcel), lançar rápido e anexar nota, 1440')
  {
    const { ctx, page, bad } = await open(browser, 'marcel', fin({ mes: MONTH, marca: C.pet }), desk, C.pet)
    await page.waitForSelector('.fe-quick')
    await page.locator('.fe-quick input[aria-label="Descrição do lançamento"]').fill('E2E Impulsionar reels da semana')
    await page.locator('.fe-quick select[aria-label="Categoria do lançamento"]').selectOption('Tráfego pago')
    await page.locator('.fe-quick input[aria-label="Valor do lançamento"]').fill('250,90')
    await page.locator('.fe-quick input[aria-label="Valor do lançamento"]').press('Enter')
    await page.waitForSelector('tr.fe-row:has-text("E2E Impulsionar reels")')
    const row = page.locator('tr.fe-row', { hasText: 'E2E Impulsionar reels' })
    check((await txt(row)).includes('R$ 250,90'), 'linha rápida lança com Enter (R$ 250,90)')
    check(await row.locator('.fe-chip-missing').count() === 1, 'lançado pago sem nota aparece com o chip')
    const desc = await page.locator('.fe-quick input[aria-label="Descrição do lançamento"]').inputValue()
    check(desc === '', 'linha rápida limpa a descrição para o próximo')
    let list = await call('marcel', 'GET', `/expenses?month=${MONTH}&companyId=${C.pet}&q=Impulsionar`)
    check(list.data.items.length === 1 && list.data.items[0].amountCents === 25090, 'gravado em centavos (25090)')
    const quickId = list.data.items[0].id
    // Anexar pelo botão da linha (seletor de arquivo)
    await row.hover()
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      row.getByRole('button', { name: /Anexar nota em/ }).click(),
    ])
    await chooser.setFiles({ name: 'nf-reels.pdf', mimeType: 'application/pdf', buffer: pdfBuf })
    await page.waitForFunction(() => {
      const r = [...document.querySelectorAll('tr.fe-row')].find((t) => t.textContent.includes('E2E Impulsionar reels'))
      return r && r.textContent.includes('1 nota')
    }, null, { timeout: 15000 })
    check(await row.locator('.fe-chip-missing').count() === 0, 'anexar pela linha tira o chip "Sem nota"')
    // Soltar a nota em cima da linha
    const dropRow = page.locator('tr.fe-row', { hasText: 'Fotógrafo da sessão' })
    await dropRow.evaluate((el) => {
      const dt = new DataTransfer()
      dt.items.add(new File([new TextEncoder().encode('%PDF-1.4\n% nota solta na linha\n%%EOF\n')], 'nf-fotografo.pdf', { type: 'application/pdf' }))
      el.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }))
      el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }))
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
    })
    await page.waitForFunction(() => {
      const r = [...document.querySelectorAll('tr.fe-row')].find((t) => t.textContent.includes('Fotógrafo da sessão'))
      return r && r.textContent.includes('1 nota')
    }, null, { timeout: 15000 })
    list = await call('marcel', 'GET', `/expenses?month=${MONTH}&companyId=${C.pet}&q=Fot`)
    check(list.data.items[0]?.invoices[0]?.name === 'nf-fotografo.pdf', 'soltar a nota na linha sobe e liga ao lançamento')
    // Diálogo completo: novo com nota na fila
    await page.getByRole('button', { name: 'Lançamento completo' }).click()
    await page.waitForSelector('[role=dialog]')
    const dlg = page.locator('[role=dialog]')
    await dlg.locator('input[placeholder^="Ex.: Folders"]').fill('E2E Banner para o estande')
    await dlg.locator('#fx-amount').fill('189,00')
    await dlg.locator('select').filter({ has: page.locator('option', { hasText: 'Eventos e ativações' }) }).first().selectOption('Eventos e ativações')
    await dlg.locator('select').filter({ has: page.locator('option', { hasText: 'E2E Feira Pet Campo Grande' }) }).selectOption({ label: 'E2E Feira Pet Campo Grande' })
    const [ch2] = await Promise.all([page.waitForEvent('filechooser'), dlg.getByRole('button', { name: 'Anexar nota' }).click()])
    await ch2.setFiles({ name: 'banner.pdf', mimeType: 'application/pdf', buffer: pdfBuf })
    check(await dlg.locator('.fx-file.is-queued').count() === 1, 'novo lançamento: nota na fila até salvar')
    await shot(page, 'editor-novo-lancamento-d1440')
    await dlg.getByRole('button', { name: 'Lançar' }).click()
    await page.waitForSelector('tr.fe-row:has-text("E2E Banner para o estande")', { timeout: 15000 })
    list = await call('marcel', 'GET', `/expenses?month=${MONTH}&companyId=${C.pet}&q=Banner`)
    const banner = list.data.items[0]
    check(banner?.activationId === X.atvPet && banner?.invoices.length === 1 && banner.amountCents === 18900, 'diálogo grava ativação, valor e sobe a nota da fila')
    // Validação aparece no diálogo (e nada é gravado)
    await page.locator('tr.fe-row', { hasText: 'E2E Banner para o estande' }).click()
    await page.waitForSelector('[role=dialog]')
    await page.locator('[role=dialog] input[placeholder^="Ex.: Folders"]').fill('')
    await page.locator('[role=dialog]').getByRole('button', { name: 'Salvar' }).click()
    await page.waitForTimeout(300)
    const errText = await page.locator('[role=dialog] .mk-error').innerText().catch(() => '')
    check(errText.includes('Descreva o lançamento'), 'validação aparece no diálogo', errText)
    await page.locator('[role=dialog]').getByRole('button', { name: 'Cancelar' }).click()
    check(bad.length === 0, 'Editor 1440: nenhuma 401/5xx', bad.join(', '))
    await call('marcel', 'DELETE', `/expenses/${quickId}`)
    await ctx.close()
  }

  section('Tela: Editor no celular (375)')
  {
    const { ctx, page, bad } = await open(browser, 'marcel', fin({ mes: MONTH }), phone, C.pet)
    await page.waitForSelector('.fe-cards')
    await shot(page, 'editor-lancamentos-m375')
    let sw = await noSideScroll(page)
    check(sw.doc <= 375 && sw.main <= 1, 'celular: sem rolagem lateral da página', JSON.stringify(sw))
    const tabH = await page.locator('.fin-tab').first().boundingBox()
    check(tabH && tabH.height >= 44, 'aba com 44px de toque', `${tabH?.height}`)
    const cardH = await page.locator('.fe-card__main').first().boundingBox()
    check(cardH && cardH.height >= 44, 'item da lista com 44px de toque', `${cardH?.height}`)
    const attach = await page.locator('.fe-card .mk-icon-btn').first().boundingBox()
    check(attach && attach.width >= 44 && attach.height >= 44, 'botão de anexar com 44px', `${attach?.width}x${attach?.height}`)
    const newBtn = await page.locator('.fe-new-phone').boundingBox()
    check(newBtn && newBtn.height >= 44 && (await page.locator('.fe-quick').count()) === 0, 'celular: "Novo lançamento" com 44px no lugar da linha de planilha', `${newBtn?.height}`)
    check(await page.locator('select.fe-filter').count() === 0, 'celular: filtros recolhidos atrás de "Filtros"')
    await page.getByRole('button', { name: /^Filtros/ }).click()
    check(await page.locator('select.fe-filter').count() >= 2, 'tocar em Filtros abre os selects')
    await page.getByRole('button', { name: /^Filtros/ }).click()
    // Lançar pelo formulário no celular
    await page.locator('.fe-new-phone').click()
    await page.waitForSelector('[role=dialog]')
    const mdlg = page.locator('[role=dialog]')
    await mdlg.locator('input[placeholder^="Ex.: Folders"]').fill('E2E Lançado pelo celular')
    await mdlg.locator('#fx-amount').fill('42,10')
    await mdlg.getByRole('button', { name: 'Lançar' }).click()
    await page.waitForSelector('.fe-card:has-text("E2E Lançado pelo celular")', { timeout: 15000 })
    check((await txt(page.locator('.fe-card', { hasText: 'E2E Lançado pelo celular' }))).includes('R$ 42,10'), 'celular: lança pelo formulário e aparece na lista')
    const mob = await call('marcel', 'GET', `/expenses?month=${MONTH}&q=${encodeURIComponent('pelo celular')}`)
    if (mob.data.items[0]) await call('marcel', 'DELETE', `/expenses/${mob.data.items[0].id}`)
    await page.locator('.fe-card__main', { hasText: 'Folders da Feira' }).click()
    await page.waitForSelector('[role=dialog]')
    await page.waitForTimeout(250)
    await shot(page, 'editor-dialogo-m375')
    sw = await noSideScroll(page)
    check(sw.doc <= 375, 'diálogo no celular sem rolagem lateral', JSON.stringify(sw))
    await page.locator('[role=dialog]').getByRole('button', { name: 'Cancelar' }).click()
    await page.locator('.fin-tab', { hasText: 'Orçamento' }).click()
    await page.waitForSelector('.fb-table')
    await shot(page, 'editor-orcamento-m375')
    sw = await noSideScroll(page)
    const inner = await page.locator('.fin-scroll').evaluate((el) => el.scrollWidth > el.clientWidth)
    check(sw.doc <= 375 && sw.main <= 1 && inner, 'tabela larga rola dentro do contêiner, a página não', JSON.stringify(sw))
    await page.locator('.fin-tab', { hasText: 'Ano' }).click()
    await page.waitForSelector('.fy-table')
    await shot(page, 'editor-ano-m375')
    sw = await noSideScroll(page)
    check(sw.doc <= 375 && sw.main <= 1, 'Ano no celular sem rolagem lateral da página', JSON.stringify(sw))
    await page.locator('.fin-tab', { hasText: 'Recorrentes' }).click()
    await page.waitForSelector('.frt-table')
    await shot(page, 'editor-recorrentes-m375')
    check(bad.length === 0, 'Editor 375: nenhuma 401/5xx', bad.join(', '))
    await ctx.close()
  }

  section('Tela: freelancer (375) e Visualizador (1440)')
  {
    const { ctx, page, bad } = await open(browser, 'freela', fin({ mes: MONTH }), phone, null)
    await page.waitForSelector('.fe-cards')
    await shot(page, 'freela-lancamentos-m375')
    const text = await page.locator('.fe-cards').innerText()
    check(!text.includes('Anúncio LinkedIn EMMI') && !text.includes('Camisetas do time Nevo'), 'F7 na tela: freelancer não vê Emmitec nem Nevo Studio')
    check(text.includes('Folders da Feira'), 'freelancer vê a PetJourney')
    const sw = await noSideScroll(page)
    check(sw.doc <= 375 && sw.main <= 1, 'freelancer 375: sem rolagem lateral', JSON.stringify(sw))
    check(bad.length === 0, 'freelancer: nenhuma 401/5xx', bad.join(', '))
    await ctx.close()
  }
  {
    const { ctx, page, bad } = await open(browser, 'diretoria', fin({ mes: MONTH }), desk, null)
    await page.waitForSelector('.fe-table')
    check(await page.locator('.fe-quick').count() === 0, 'Visualizador: sem linha de lançamento rápido')
    check(await page.getByRole('button', { name: 'Lançamento completo' }).count() === 0, 'Visualizador: sem "Lançamento completo"')
    check(await page.locator('.fe-attach').count() === 0, 'Visualizador: sem botão de anexar')
    await page.locator('tr.fe-row', { hasText: 'Folders da Feira' }).click()
    await page.waitForSelector('[role=dialog]')
    check(await page.locator('[role=dialog] input:not([type=checkbox])').first().isDisabled(), 'Visualizador abre o lançamento só para ler')
    check(await page.locator('[role=dialog]').getByRole('button', { name: 'Salvar' }).count() === 0, 'sem botão Salvar')
    await shot(page, 'viewer-dialogo-d1440')
    await page.locator('[role=dialog]').getByRole('button', { name: 'Fechar' }).last().click()
    await page.locator('.fin-tab', { hasText: 'Orçamento' }).click()
    await page.waitForSelector('.fb-table')
    check(await page.locator('.fb-cell').count() === 0, 'Visualizador não edita o orçado')
    await shot(page, 'viewer-orcamento-d1440')
    check(bad.length === 0, 'Visualizador: nenhuma 401/5xx', bad.join(', '))
    await ctx.close()
  }

  section('Tela F6: viewerSeesFinance = false')
  await setViewerSeesFinance(false)
  {
    const { ctx, page, bad } = await open(browser, 'diretoria', '/marketing', desk, null)
    await page.waitForSelector('.mk-tab')
    const tabs = await page.locator('.mk-tab').allInnerTexts()
    check(!tabs.some((t) => t.includes('Financeiro')), 'aba Financeiro some do menu da ala', tabs.join(' | '))
    await page.goto(WEB + fin({ mes: MONTH }), { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)
    check(await page.getByText('O financeiro não está liberado para o seu papel').count() === 1, 'entrar direto na rota mostra o aviso')
    await shot(page, 'viewer-sem-financeiro-d1440')
    check(bad.length === 0, 'F6 tela: nenhuma 401/5xx', bad.join(', '))
    await ctx.close()
  }
  {
    // Tela aberta com o /me antigo (cache) e a chave desligada no meio: a API dá 403 e a tela troca pelo aviso
    await setViewerSeesFinance(true)
    const { ctx, page, bad } = await open(browser, 'diretoria', fin({ mes: MONTH }), desk, null)
    await page.waitForSelector('.fe-table')
    await setViewerSeesFinance(false)
    // Se um aviso de tempo real chegar antes (outra ação do roteiro), a tela já
    // rebusca, leva o 403 e troca pelo aviso sozinha: as abas somem e não há o
    // que clicar. Os dois caminhos são certos; o que importa é o aviso no fim.
    const anoTab = page.locator('.fin-tab', { hasText: 'Ano' })
    if (await anoTab.count()) {
      await anoTab.click({ timeout: 5000 }).catch(() => {})
      await page.locator('.fin-nav').getByRole('button', { name: 'Ano anterior' }).click({ timeout: 5000 }).catch(() => {})
    }
    await page.getByText('O financeiro não está liberado para o seu papel').first().waitFor({ timeout: 8000 }).catch(() => {})
    check(await page.getByText('O financeiro não está liberado para o seu papel').count() === 1, 'chave desligada com a tela aberta: o 403 vira o aviso')
    check(bad.length === 0, 'F6 tela aberta: nenhuma 401/5xx', bad.join(', '))
    await ctx.close()
  }
  await setViewerSeesFinance(true)

  section('Tela: Dono no celular, todas as marcas')
  {
    const { ctx, page, bad } = await open(browser, 'nicolas', fin({ mes: MONTH }), phone, C.pet)
    await page.waitForSelector('.fe-cards')
    await shot(page, 'dono-lancamentos-m375')
    const sw = await noSideScroll(page)
    check(sw.doc <= 375 && sw.main <= 1, 'Dono 375 com marcas: sem rolagem lateral', JSON.stringify(sw))
    check(bad.length === 0, 'Dono 375: nenhuma 401/5xx', bad.join(', '))
    await ctx.close()
  }

  await browser.close()
}

;(async () => {
  await db.connect()
  for (const k of ['nicolas', 'leticia', 'marcel', 'freela', 'diretoria', 'luis']) await login(k)
  try {
    if (ONLY !== 'ui') {
      await resetData()
      await apiPart()
    } else {
      // ONLY=ui reaproveita o que o último roteiro criou
      const ids = await db.query(`SELECT id, title FROM "MarketingActivation" WHERE "groupId"=$1 AND title LIKE 'E2E %'`, [G])
      X.atvPet = ids.rows[0]?.id
    }
    if (ONLY !== 'api') await uiPart()
  } catch (e) {
    check(false, 'roteiro rodou até o fim', e.stack)
  } finally {
    await setViewerSeesFinance(true).catch(() => undefined)
    await db.end()
  }
  check(apiBad.length === 0, 'chamadas diretas à API: nenhuma 401/5xx', apiBad.join(', '))
  console.log(`\n${oks} OK, ${fails} falha(s)`)
  console.log(fails ? `${fails} FALHA(S)` : 'TUDO OK')
  process.exit(fails ? 1 : 0)
})()
