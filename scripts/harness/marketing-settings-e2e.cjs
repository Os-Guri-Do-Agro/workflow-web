// Configurações da ala Marketing de ponta a ponta: regras do Dono (cargo maior)
// e do Admin pela API e a tela Configurações (1440 e 375).
// Uso: node marketing-settings-e2e.cjs   (env API, WEB, HARNESS_SEED, HARNESS_DB, SHOTS)
// Deixa o banco como estava: desfaz o que cria (empresa ligada, convidado, chaves).
//
// R1 (D9), convite "Do Nevo": candidatos (só quem trabalha nas empresas do
// grupo, sem quem já está na ala), lote de 3 colegas, aviso no sino de quem
// entrou, userId de fora dando 403 (sem enumerar o Nevo), Admin restrito vendo
// só as empresas das marcas dele e o caminho por e-mail continuando igual.
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const path = require('node:path')
const { Client } = require('pg')

const API = process.env.API ?? 'http://127.0.0.1:3599'
const WEB = process.env.WEB ?? 'http://localhost:5174'
const DB = process.env.HARNESS_DB ?? 'wf'
const seed = JSON.parse(fs.readFileSync(process.env.HARNESS_SEED ?? path.join(__dirname, 'seed-marketing-out.json'), 'utf8'))
const SHOTS = process.env.SHOTS ?? path.join(__dirname, 'prints', 'marketing-settings')
const ONLY = process.env.ONLY // api | ui
fs.mkdirSync(SHOTS, { recursive: true })
const G = seed.groupId
const C = seed.companies

let fails = 0
const check = (cond, msg, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}${extra ? '  (' + extra + ')' : ''}`)
  if (!cond) fails++
}
// O /auth/login tem limite de 10 por minuto: o token (7 dias) fica num cache
// por GRUPO do seed (banco recriado = ids novos) e é validado no /user/me antes
// de usar. As chamadas diretas saem com um X-Forwarded-For por pessoa (a API
// confia no proxy), para não disputar a cota do navegador (127.0.0.1).
const TOKEN_CACHE = path.join(require('node:os').tmpdir(), `nevo-settings-e2e-tokens-${G}.json`)
let tokens = {}
try {
  tokens = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'))
} catch {
  tokens = {}
}
const WHO_IP = { nicolas: 1, leticia: 2, marcel: 3, freela: 4, diretoria: 5, luis: 6, ana: 7, bia: 8, caio: 9, sofia: 10 }
const xff = (who) => ({ 'x-forwarded-for': `10.41.0.${WHO_IP[who] ?? 20}` })
const checked = new Set()
async function token(key) {
  if (tokens[key] && !checked.has(key)) {
    const me = await fetch(`${API}/user/me`, { headers: { authorization: `Bearer ${tokens[key]}`, ...xff(key) } })
    if (me.ok) checked.add(key)
    else delete tokens[key]
  }
  if (tokens[key]) return tokens[key]
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...xff(key) },
    body: JSON.stringify({ email: `${key}@nevo.test`, password: 'nevo1234' }),
  })
  const j = await r.json()
  if (!j.accessToken) throw new Error(`login ${key}: ${r.status} ${JSON.stringify(j).slice(0, 120)}`)
  tokens[key] = j.accessToken
  checked.add(key)
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify(tokens))
  return tokens[key]
}
async function call(key, method, route, body) {
  const r = await fetch(`${API}${route}`, {
    method,
    headers: { authorization: `Bearer ${await token(key)}`, 'content-type': 'application/json', ...xff(key) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try { data = await r.json() } catch {}
  return { status: r.status, data }
}
const g = (s = '') => `/marketing/g/${G}${s}`

async function apiPart() {
  // Configurações: Admin mexe em lista, não em chave severa
  let r = await call('leticia', 'PATCH', g('/settings'), { settings: { viewerSeesFinance: false } })
  check(r.status === 403, 'Admin não muda chave severa (viewerSeesFinance)', `status ${r.status}`)
  r = await call('leticia', 'PATCH', g('/settings'), { settings: { utmSources: ['instagram', 'tiktok', 'feira'] } })
  check(r.status === 200 && r.data.utmSources.includes('feira'), 'Admin muda lista de trabalho', `status ${r.status}`)
  r = await call('nicolas', 'PATCH', g('/settings'), { settings: { viewerSeesFinance: false } })
  check(r.status === 200 && r.data.viewerSeesFinance === false, 'Dono desliga o financeiro do Visualizador')
  r = await call('diretoria', 'GET', '/marketing/me')
  check(r.data.groups[0].permissions.seeFinance === false, 'Visualizador perde o financeiro na hora')
  await call('nicolas', 'PATCH', g('/settings'), {
    settings: { viewerSeesFinance: true, utmSources: seed.defaults?.utmSources ?? ['instagram', 'tiktok', 'facebook', 'google', 'youtube', 'whatsapp', 'email', 'site', 'parceiro', 'qrcode'] },
  })

  // Empresas: só o Dono, e só empresa que ele administra
  r = await call('leticia', 'POST', g('/companies'), { companyId: C.sentia })
  check(r.status === 403, 'Admin não liga empresa (só o Dono)', `status ${r.status}`)
  r = await call('nicolas', 'GET', g('/companies/available'))
  check(r.status === 200 && r.data.some((c) => c.id === C.sentia) && !r.data.some((c) => c.id === C.pet), 'disponíveis: Sentia sim, PetJourney (já no grupo) não', JSON.stringify(r.data?.map((c) => c.name)))
  r = await call('nicolas', 'POST', g('/companies'), { companyId: C.sentia, color: 'pink' })
  check(r.status === 201, 'Dono liga a Sentia', `status ${r.status}`)
  r = await call('nicolas', 'POST', g('/companies'), { companyId: C.sentia })
  check(r.status === 409, 'ligar de novo dá 409', `status ${r.status}`)
  r = await call('nicolas', 'GET', '/marketing/me')
  check(r.data.groups[0].brands.some((b) => b.companyId === C.sentia), 'a Sentia vira marca na hora')
  r = await call('nicolas', 'PATCH', g(`/companies/${C.sentia}`), { marketingEnabled: false })
  check(r.status === 200, 'Dono desliga a marca')
  r = await call('marcel', 'GET', '/marketing/me')
  check(!r.data.groups[0].brands.some((b) => b.companyId === C.sentia), 'marca desligada some para a equipe')
  r = await call('nicolas', 'DELETE', g(`/companies/${C.sentia}`))
  check(r.status === 200, 'Dono tira a Sentia do grupo', `status ${r.status}`)

  // Criar grupo
  r = await call('luis', 'POST', '/marketing/groups', { name: 'Grupo do Luis', companyIds: [C.emmitec] })
  check(r.status === 403, 'WORKER não cria grupo com empresa que não administra', `status ${r.status}`)
  r = await call('nicolas', 'POST', '/marketing/groups', { name: 'Outro', companyIds: [C.pet] })
  check(r.status === 409, 'empresa já em grupo não entra em outro', `status ${r.status}`)

  // Equipe
  r = await call('leticia', 'POST', g('/members'), { email: 'freela2@nevo.test', name: 'Bruno Freela', role: 'ADMIN' })
  check(r.status === 403, 'Admin não dá papel Admin', `status ${r.status}`)
  r = await call('leticia', 'POST', g('/members'), { email: 'freela2@nevo.test', name: 'Bruno Freela', role: 'EDITOR', brandIds: [C.sentia] })
  check(r.status === 400, 'marca fora do grupo dá 400', `status ${r.status}`)
  r = await call('leticia', 'POST', g('/members'), { email: 'freela2@nevo.test', name: 'Bruno Freela', role: 'EDITOR', brandIds: [C.pet], title: 'Freelancer' })
  check(r.status === 201 && r.data.created === true && /redefinir-senha/.test(r.data.accessLink?.link ?? ''), 'Admin convida freelancer novo e recebe o link', `status ${r.status} link=${!!r.data?.accessLink}`)
  const freela2 = r.data?.member?.userId
  r = await call('leticia', 'POST', g('/members'), { email: 'FREELA2@nevo.test', role: 'EDITOR' })
  check(r.status === 409, 'mesmo e-mail (outra caixa) dá 409', `status ${r.status}`)
  r = await call('leticia', 'POST', g(`/members/${seed.users.marcel}/access-link`))
  check(r.status === 400, 'link pela ala não vale para quem tem empresa', `status ${r.status}`)
  r = await call('leticia', 'POST', g(`/members/${seed.users.freela}/access-link`))
  check(r.status === 201 && !!r.data.link, 'Admin gera link do freelancer sem empresa', `status ${r.status}`)
  r = await call('leticia', 'PATCH', g(`/members/${seed.users.nicolas}`), { title: 'x' })
  check(r.status === 403, 'Admin não mexe no Dono', `status ${r.status}`)
  r = await call('nicolas', 'PATCH', g(`/members/${seed.users.nicolas}`), { role: 'ADMIN' })
  check(r.status === 400, 'último Dono não se rebaixa', `status ${r.status}`)
  r = await call('marcel', 'PATCH', g(`/members/${freela2}`), { role: 'VIEWER' })
  check(r.status === 403, 'Editor não muda equipe', `status ${r.status}`)
  r = await call('leticia', 'DELETE', g(`/members/${freela2}`))
  check(r.status === 200, 'Admin tira o convidado', `status ${r.status}`)

  // Auditoria de 06/11: Admin restrito a uma marca não concede as outras
  {
    const db = new Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
    await db.connect()
    await db.query('UPDATE "CompanyGroupMember" SET role=$1, "brandIds"=$2 WHERE "groupId"=$3 AND "userId"=$4', ['ADMIN', [C.pet], G, seed.users.marcel])
    r = await call('marcel', 'POST', g('/members'), { email: 'restrito1@nevo.test', name: 'Teste Restrito', role: 'EDITOR', brandIds: [] })
    check(r.status === 403, 'Admin só da Pet não concede "todas as marcas"', `status ${r.status}`)
    r = await call('marcel', 'POST', g('/members'), { email: 'restrito1@nevo.test', name: 'Teste Restrito', role: 'EDITOR', brandIds: [C.emmitec] })
    check(r.status === 403, 'Admin só da Pet não concede a Emmitec', `status ${r.status}`)
    r = await call('marcel', 'PATCH', g(`/members/${seed.users.diretoria}`), { title: 'x' })
    check(r.status === 403, 'Admin só da Pet não mexe em quem vê todas as marcas', `status ${r.status}`)
    r = await call('marcel', 'POST', g('/members'), { email: 'restrito1@nevo.test', name: 'Teste Restrito', role: 'EDITOR', brandIds: [C.pet] })
    check(r.status === 201, 'Admin só da Pet concede a Pet', `status ${r.status}`)
    await db.query('UPDATE "CompanyGroupMember" SET role=$1, "brandIds"=$2 WHERE "groupId"=$3 AND "userId"=$4', ['EDITOR', [], G, seed.users.marcel])
    await db.query('DELETE FROM "User" WHERE email=$1', ['restrito1@nevo.test'])

    // Conta que JÁ EXISTIA (sem empresa e sem grupo) não sai com link de senha
    const orfaId = 'c' + Date.now().toString(36) + 'orfa000000000'.slice(0, 12)
    await db.query('DELETE FROM "User" WHERE email=$1', ['orfa@nevo.test'])
    await db.query(`INSERT INTO "User"(id,name,email,password,"createdAt","updatedAt") VALUES ($1,'Conta Antiga','orfa@nevo.test','x', now() - interval '30 days', now())`, [orfaId])
    r = await call('leticia', 'POST', g('/members'), { email: 'orfa@nevo.test', role: 'VIEWER' })
    check(r.status === 201 && r.data.created === false && r.data.accessLink === null, 'conta antiga entra na ala SEM link de senha', `status ${r.status} link=${!!r.data?.accessLink}`)
    r = await call('leticia', 'POST', g(`/members/${orfaId}/access-link`))
    check(r.status === 400, 'link de senha de conta antiga dá 400', `status ${r.status}`)
    await db.query('DELETE FROM "User" WHERE email=$1', ['orfa@nevo.test'])
    await db.end()
  }

  await apiDoNevo()

  // Ala desligada
  r = await call('nicolas', 'PATCH', g(), { marketingEnabled: false })
  check(r.status === 200, 'Dono desliga a ala')
  r = await call('marcel', 'GET', g('/members'))
  check(r.status === 403, 'com a ala desligada a equipe leva 403', `status ${r.status}`)
  r = await call('nicolas', 'GET', g())
  check(r.status === 200, 'Dono ainda abre o grupo para religar', `status ${r.status}`)
  r = await call('nicolas', 'PATCH', g(), { marketingEnabled: true })
  check(r.status === 200 && r.data.marketingEnabled === true, 'Dono religa a ala')

  // limpa a conta criada (o e-mail fica livre para a próxima rodada)
  const db = new Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
  await db.connect()
  await db.query('DELETE FROM "User" WHERE email=$1', ['freela2@nevo.test'])
  await db.end()
}

// ── R1 (D9): convite "Do Nevo" pela API ───────────────────────────────────────
const pgClient = () => new Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
const COLLEAGUES = ['ana', 'bia', 'caio']
async function userIdOf(db, key) {
  return (await db.query('SELECT id FROM "User" WHERE email=$1', [`${key}@nevo.test`])).rows[0]?.id ?? null
}
/** Sofia trabalha só na Sentia (fora do grupo): a pessoa que a lista NUNCA pode mostrar. */
async function ensureOutsider(db) {
  let id = await userIdOf(db, 'sofia')
  if (!id) {
    id = 'c' + Date.now().toString(36) + 'sofia0000000'.slice(0, 12)
    const hash = (await db.query('SELECT password FROM "User" WHERE email=$1', ['luis@nevo.test'])).rows[0].password
    await db.query(`INSERT INTO "User"(id,name,email,password,"updatedAt") VALUES ($1,'Sofia Andrade','sofia@nevo.test',$2,now())`, [id, hash])
    await db.query(`INSERT INTO "UserCompany"("userId","companyId",role) VALUES ($1,$2,'WORKER')`, [id, C.sentia])
  }
  return id
}
async function resetColleagues(db) {
  const ids = []
  for (const k of COLLEAGUES) ids.push(await userIdOf(db, k))
  await db.query('DELETE FROM "CompanyGroupMember" WHERE "groupId"=$1 AND "userId" = ANY($2)', [G, ids])
  await db.query(`DELETE FROM "Notification" WHERE "userId" = ANY($1) AND type='MARKETING_MEMBER_ADDED'`, [ids])
  return ids
}

async function apiDoNevo() {
  console.log('\n== R1: convite Do Nevo (API) ==')
  const db = pgClient()
  await db.connect()
  try {
    const [ana, bia, caio] = await resetColleagues(db)
    const sofia = await ensureOutsider(db)
    const luis = seed.users.luis
    const cand = (who, q) => call(who, 'GET', g(`/members/candidates${q ? `?q=${encodeURIComponent(q)}` : ''}`))

    let r = await cand('marcel')
    check(r.status === 403, 'Editor não vê candidatos (403)', `status ${r.status}`)
    r = await cand('diretoria')
    check(r.status === 403, 'Visualizador não vê candidatos (403)', `status ${r.status}`)
    r = await cand('luis')
    check(r.status === 403, 'quem é de fora da ala leva 403 nos candidatos', `status ${r.status}`)

    r = await cand('nicolas')
    const ids = (r.data ?? []).map((c) => c.userId)
    check(r.status === 200 && [ana, bia, caio, luis].every((id) => ids.includes(id)), 'Dono vê os colegas das empresas do grupo (Ana, Bia, Caio, Luis)', `status ${r.status} ${ids.length}`)
    check(![seed.users.nicolas, seed.users.leticia, seed.users.marcel, seed.users.freela, seed.users.diretoria].some((id) => ids.includes(id)), 'quem já está na ala não aparece')
    check(!ids.includes(sofia), 'quem é só da Sentia (fora do grupo) não aparece')
    const luisRow = (r.data ?? []).find((c) => c.userId === luis)
    check(!!luisRow && luisRow.companies.every((c) => c.companyId !== C.sentia) && luisRow.companies.length === 2, 'as empresas mostradas são só as do grupo (a Sentia do Luis não aparece)', JSON.stringify(luisRow?.companies?.map((c) => c.name)))
    const anaRow = (r.data ?? []).find((c) => c.userId === ana)
    check(!!anaRow && anaRow.email === 'ana@nevo.test' && 'avatarUrl' in anaRow && anaRow.name === 'Ana Beatriz Ramos', 'cada candidato traz nome, e-mail, foto e empresas', JSON.stringify(anaRow).slice(0, 120))

    // Busca: estreita, nunca alarga (não vira enumeração de usuários do Nevo)
    r = await cand('nicolas', 'bia')
    check(r.status === 200 && r.data.length === 1 && r.data[0].userId === bia, 'busca por nome acha a pessoa certa', JSON.stringify(r.data?.map((c) => c.name)))
    r = await cand('nicolas', 'caio@nevo')
    check(r.status === 200 && r.data.length === 1 && r.data[0].userId === caio, 'busca por e-mail também')
    r = await cand('nicolas', 'sofia')
    const r2 = await cand('nicolas', 'sofia@nevo.test')
    const r3 = await cand('nicolas', 'ninguem-existe-zz')
    check(r.data?.length === 0 && r2.data?.length === 0 && r3.data?.length === 0, 'buscar alguém de fora dá a mesma lista vazia de quem não existe (sem enumerar)')
    r = await cand('nicolas', 'nevo.test')
    check(r.data.every((c) => c.userId !== sofia), 'buscar pelo domínio de e-mail não traz quem é de fora')
    r = await cand('nicolas', 'x'.repeat(101))
    check(r.status === 400, 'busca longa demais é 400 do DTO', `status ${r.status}`)

    // Lote de 3 colegas
    r = await call('leticia', 'POST', g('/members'), { userIds: [ana, bia, caio], role: 'EDITOR', brandIds: [C.pet], title: 'Produção' })
    check(r.status === 201 && r.data.members?.length === 3, 'Admin inclui 3 colegas de uma vez', `status ${r.status} ${JSON.stringify(r.data?.message ?? '')}`)
    check(r.data?.accessLink === null && r.data?.created === false, 'conta que já existe nunca ganha link de senha')
    const rows = (await db.query('SELECT "userId", role, "brandIds", title, "invitedById" FROM "CompanyGroupMember" WHERE "groupId"=$1 AND "userId" = ANY($2)', [G, [ana, bia, caio]])).rows
    check(rows.length === 3 && rows.every((x) => x.role === 'EDITOR' && x.brandIds.length === 1 && x.brandIds[0] === C.pet && x.title === 'Produção' && x.invitedById === seed.users.leticia), 'no banco: os 3 com papel, marca e rótulo do lote', JSON.stringify(rows.map((x) => x.role)))
    r = await call('ana', 'GET', '/inbox')
    const aviso = (r.data ?? []).find((n) => n.type === 'MARKETING_MEMBER_ADDED')
    check(!!aviso && /Grupo Fluvio/.test(aviso.title) && aviso.link === `/marketing?grupo=${encodeURIComponent(G)}`, 'quem entrou recebe o aviso no sino com o link da ala', JSON.stringify({ t: aviso?.title, l: aviso?.link }))
    r = await call('bia', 'GET', '/inbox/unread-count')
    check(r.status === 200 && r.data.count >= 1, 'o contador do sino da Bia sobe', JSON.stringify(r.data))
    r = await call('ana', 'GET', '/marketing/me')
    check(r.data?.groups?.[0]?.role === 'EDITOR' && r.data.groups[0].brands.length === 1, 'a Ana já vê a ala como Editora da PetJourney')
    r = await cand('nicolas')
    check(![ana, bia, caio].some((id) => r.data.some((c) => c.userId === id)), 'quem entrou some da lista de candidatos')
    r = await call('leticia', 'GET', g('/log?entityType=member&take=20'))
    check([ana, bia, caio].every((id) => r.data.some((l) => l.entityId === id && l.verb === 'member_added')), 'o histórico registra cada inclusão')

    // Recusas
    r = await call('leticia', 'POST', g('/members'), { userIds: [ana], role: 'EDITOR' })
    check(r.status === 409 && /já está na equipe/.test(r.data?.message ?? ''), 'quem já está na equipe dá 409', `status ${r.status} ${r.data?.message}`)
    const outside = await call('leticia', 'POST', g('/members'), { userIds: [sofia], role: 'EDITOR' })
    const ghost = await call('leticia', 'POST', g('/members'), { userIds: ['cnaoexiste000000000000000'], role: 'EDITOR' })
    check(outside.status === 403 && ghost.status === 403 && outside.data?.message === ghost.data?.message, 'userId de fora (Sentia) e id inventado dão o mesmo 403', `${outside.status}/${ghost.status}`)
    const mixed = await call('leticia', 'POST', g('/members'), { userIds: [luis, sofia], role: 'VIEWER' })
    const luisIn = (await db.query('SELECT 1 FROM "CompanyGroupMember" WHERE "groupId"=$1 AND "userId"=$2', [G, luis])).rowCount
    check(mixed.status === 403 && luisIn === 0, 'lote com um de fora não inclui ninguém (tudo ou nada)', `status ${mixed.status} luis=${luisIn}`)
    r = await call('leticia', 'POST', g('/members'), { userIds: [luis], role: 'ADMIN' })
    check(r.status === 403, 'Admin não dá papel Admin pelo lote', `status ${r.status}`)
    r = await call('marcel', 'POST', g('/members'), { userIds: [luis], role: 'VIEWER' })
    check(r.status === 403, 'Editor não inclui pelo lote', `status ${r.status}`)
    r = await call('leticia', 'POST', g('/members'), { userIds: [luis], email: 'x@nevo.test', role: 'VIEWER' })
    check(r.status === 400, 'e-mail e userIds juntos dão 400', `status ${r.status}`)
    r = await call('leticia', 'POST', g('/members'), { userIds: Array.from({ length: 21 }, (_, i) => `c${i}`), role: 'VIEWER' })
    check(r.status === 400, 'mais de 20 de uma vez dá 400', `status ${r.status}`)
    r = await call('leticia', 'POST', g('/members'), { userIds: [], role: 'VIEWER' })
    check(r.status === 400, 'lista vazia dá 400', `status ${r.status}`)

    // Admin restrito à PetJourney: só as pessoas e as empresas dessa marca
    await db.query('DELETE FROM "CompanyGroupMember" WHERE "groupId"=$1 AND "userId" = ANY($2)', [G, [ana, bia, caio]])
    await db.query('UPDATE "CompanyGroupMember" SET role=$1, "brandIds"=$2 WHERE "groupId"=$3 AND "userId"=$4', ['ADMIN', [C.pet], G, seed.users.marcel])
    try {
      r = await cand('marcel')
      const mine = r.data ?? []
      check(r.status === 200 && mine.some((c) => c.userId === ana) && !mine.some((c) => c.userId === luis), 'Admin só da Pet vê quem é da Pet e não o Luis (Emmitec e Nevo)', JSON.stringify(mine.map((c) => c.name)))
      check(mine.every((c) => c.companies.every((co) => co.companyId === C.pet)), 'Admin só da Pet vê só a empresa PetJourney de cada um', JSON.stringify(mine.find((c) => c.userId === ana)?.companies))
      r = await call('marcel', 'POST', g('/members'), { userIds: [luis], role: 'VIEWER', brandIds: [C.pet] })
      check(r.status === 403, 'Admin só da Pet não inclui o Luis (fora das marcas dele): 403', `status ${r.status}`)
      r = await call('marcel', 'POST', g('/members'), { userIds: [ana], role: 'VIEWER', brandIds: [] })
      check(r.status === 403, 'Admin só da Pet não concede "todas as marcas" pelo lote', `status ${r.status}`)
      r = await call('marcel', 'POST', g('/members'), { userIds: [ana], role: 'VIEWER', brandIds: [C.pet] })
      check(r.status === 201, 'Admin só da Pet inclui a Ana na Pet', `status ${r.status}`)
    } finally {
      await db.query('UPDATE "CompanyGroupMember" SET role=$1, "brandIds"=$2 WHERE "groupId"=$3 AND "userId"=$4', ['EDITOR', [], G, seed.users.marcel])
      await resetColleagues(db)
    }
  } finally {
    await db.end()
  }
}

async function uiPart() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  for (const vp of [
    { name: 'd1440', width: 1440, height: 1000, mobile: false },
    { name: 'm375', width: 375, height: 812, mobile: true },
  ]) {
    for (const who of ['nicolas', 'leticia', 'diretoria']) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.mobile ? 2 : 1, isMobile: vp.mobile, hasTouch: vp.mobile, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', reducedMotion: 'reduce' })
      const tk = await token(who)
      await ctx.addInitScript(([t, c]) => {
        localStorage.setItem('token', t)
        if (c) localStorage.setItem('activeCompany', c)
        localStorage.setItem('onboarding.autoShown', '1')
        localStorage.setItem('onboarding.completed', '1')
        localStorage.setItem('ui.idlePermissionPrompt', 'done')
      }, [tk, who === 'diretoria' ? null : C.pet])
      const page = await ctx.newPage()
      const bad = []
      page.on('response', (res) => {
        if (res.url().startsWith(API) && (res.status() === 401 || res.status() >= 500)) bad.push(`${res.status()} ${res.url().replace(API, '')}`)
      })
      await page.goto(`${WEB}/marketing/configuracoes`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(500)
      await page.screenshot({ path: path.join(SHOTS, `${who}-${vp.name}.png`), fullPage: false })
      const text = await page.locator('.mk-layout__body').innerText()
      if (who === 'nicolas') {
        check(/Empresas do grupo/.test(text) && /Configurações do Dono/.test(text), `${vp.name} Dono vê empresas e configurações do Dono`)
      }
      if (who === 'leticia') {
        check(/Equipe/.test(text) && !/Configurações do Dono/.test(text), `${vp.name} Admin vê equipe, não as do Dono`)
        check(await page.getByRole('button', { name: 'Convidar' }).count() > 0, `${vp.name} Admin tem Convidar`)
      }
      if (who === 'diretoria') {
        check(await page.getByRole('button', { name: 'Convidar' }).count() === 0, `${vp.name} Visualizador não convida`)
      }
      if (vp.mobile) {
        const sw = await page.evaluate(() => document.documentElement.scrollWidth)
        check(sw <= vp.width, `${vp.name} ${who} sem rolagem lateral`, `scrollWidth ${sw}`)
      }
      check(bad.length === 0, `${vp.name} ${who}: nenhuma 401/5xx`, bad.join(', '))
      await ctx.close()
    }
  }
  // Convite pela tela (Admin, desktop): abre o diálogo, convida, vê o link, desfaz
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' })
    const tk = await token('leticia')
    await ctx.addInitScript(([t, c]) => {
      localStorage.setItem('token', t)
      localStorage.setItem('activeCompany', c)
      localStorage.setItem('onboarding.autoShown', '1')
      localStorage.setItem('onboarding.completed', '1')
      localStorage.setItem('ui.idlePermissionPrompt', 'done')
    }, [tk, C.pet])
    const page = await ctx.newPage()
    await page.goto(`${WEB}/marketing/configuracoes`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Convidar' }).click()
    await page.getByRole('tab', { name: 'Por e-mail' }).click()
    await page.getByLabel('E-mail').fill('freela3@nevo.test')
    await page.getByLabel('Nome').fill('Duda Freela')
    await page.locator('[role=dialog] button', { hasText: 'Convidar' }).click()
    await page.waitForTimeout(800)
    // O link fica num campo só leitura (innerText não pega valor de input).
    const linkValue = await page.locator('[role=dialog] input[readonly]').inputValue().catch(() => '')
    await page.screenshot({ path: path.join(SHOTS, 'convite-link-d1440.png') })
    check(/redefinir-senha\?token=/.test(linkValue), 'tela mostra o link de primeiro acesso do convidado', linkValue.slice(0, 48))
    await ctx.close()
    const db = new Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
    await db.connect()
    await db.query('DELETE FROM "User" WHERE email=$1', ['freela3@nevo.test'])
    await db.end()
  }
  await uiDoNevo(browser)
  await browser.close()
}

// ── R1 (D9): aba "Do Nevo" pela tela ──────────────────────────────────────────
async function openAs(browser, who, vp, company) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.mobile ? 2 : 1, isMobile: vp.mobile, hasTouch: vp.mobile, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', reducedMotion: 'reduce' })
  const tk = await token(who)
  await ctx.addInitScript(([t, c]) => {
    localStorage.setItem('token', t)
    if (c) localStorage.setItem('activeCompany', c)
    localStorage.setItem('onboarding.autoShown', '1')
    localStorage.setItem('onboarding.completed', '1')
    localStorage.setItem('ui.idlePermissionPrompt', 'done')
  }, [tk, company])
  const page = await ctx.newPage()
  const bad = []
  page.on('response', (res) => {
    if (res.url().startsWith(API) && (res.status() === 401 || res.status() >= 500)) bad.push(`${res.status()} ${res.url().replace(API, '')}`)
  })
  page.on('pageerror', (e) => bad.push(`pageerror ${e.message}`))
  return { ctx, page, bad }
}
const hasDash = (t) => t.includes('\u2014')

async function uiDoNevo(browser) {
  console.log('\n== R1: convite Do Nevo (tela) ==')
  const db = pgClient()
  await db.connect()
  try {
    const [ana, bia, caio] = await resetColleagues(db)
    await ensureOutsider(db)
    // 375 primeiro: o desktop inclui os 3 colegas no fim (e o sino da Ana usa isso).
    for (const vp of [
      { name: 'm375', width: 375, height: 812, mobile: true },
      { name: 'd1440', width: 1440, height: 1000, mobile: false },
    ]) {
      const { ctx, page, bad } = await openAs(browser, 'leticia', vp, C.pet)
      await page.goto(`${WEB}/marketing/configuracoes`, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'Convidar' }).click()
      const dialog = page.locator('[role=dialog]')
      await dialog.locator('[data-testid="inv-list"] .inv__row').first().waitFor({ timeout: 8000 })
      check(await page.getByRole('tab', { name: 'Do Nevo' }).getAttribute('aria-selected') === 'true', `${vp.name} a aba "Do Nevo" abre primeiro`)
      const listText = await dialog.locator('[data-testid="inv-list"]').innerText()
      check(/Ana Beatriz Ramos/.test(listText) && /ana@nevo\.test/.test(listText) && /PetJourney/.test(listText), `${vp.name} lista mostra nome, e-mail e empresas`)
      check(!/Sofia/.test(listText) && !/Marcel Duarte/.test(listText), `${vp.name} nem quem é de fora nem quem já está na ala aparece`)
      check(await dialog.locator('[data-testid="inv-list"] .inv__row img, [data-testid="inv-list"] .inv__row .person-avatar, [data-testid="inv-list"] .inv__row [class*=avatar]').count() > 0, `${vp.name} cada linha tem a foto ou as iniciais`)
      check(!hasDash(await dialog.innerText()), `${vp.name} diálogo sem travessão`)
      await page.screenshot({ path: path.join(SHOTS, `do-nevo-lista-${vp.name}.png`) })
      if (vp.mobile) {
        const sw = await page.evaluate(() => document.documentElement.scrollWidth)
        check(sw <= vp.width, `${vp.name} diálogo sem rolagem lateral`, `scrollWidth ${sw}`)
      }
      // Vazio explicando quem aparece
      await dialog.locator('[data-testid="inv-search"]').fill('sofia')
      await dialog.locator('[data-testid="inv-empty"]').waitFor({ timeout: 6000 })
      const empty = await dialog.locator('[data-testid="inv-empty"]').innerText()
      check(/só as pessoas que já trabalham nas? /.test(empty) && /Por e-mail/.test(empty), `${vp.name} vazio explica quem aparece e manda para Por e-mail`, empty.slice(0, 120))
      await page.screenshot({ path: path.join(SHOTS, `do-nevo-vazio-${vp.name}.png`) })
      await dialog.locator('[data-testid="inv-search"]').fill('')
      await dialog.locator('[data-testid="inv-list"] .inv__row').first().waitFor()

      if (!vp.mobile) {
        // Busca, marca 3 (uma pela busca), papel do lote e inclui
        await dialog.locator('[data-testid="inv-search"]').fill('caio')
        await dialog.locator(`.inv__row[data-user="${caio}"]`).waitFor()
        await dialog.locator(`.inv__row[data-user="${caio}"] [role="checkbox"]`).click()
        await dialog.locator('[data-testid="inv-search"]').fill('')
        await dialog.locator(`.inv__row[data-user="${ana}"]`).waitFor()
        await dialog.locator(`.inv__row[data-user="${ana}"] [role="checkbox"]`).click()
        await dialog.locator(`.inv__row[data-user="${bia}"] [role="checkbox"]`).click()
        check(/3 escolhidas/.test(await dialog.locator('.inv__picked').innerText()), 'a escolha sobrevive à busca (3 escolhidas)')
        await dialog.locator('[data-testid="inv-role"] button').click()
        await page.getByRole('option', { name: 'Visualizador' }).click()
        await dialog.getByLabel('Rótulo na equipe').fill('Time da loja')
        await page.screenshot({ path: path.join(SHOTS, `do-nevo-escolhidas-${vp.name}.png`) })
        await dialog.locator('[data-testid="inv-submit"]').click()
        await dialog.locator('[data-testid="inv-done"]').waitFor({ timeout: 8000 })
        const done = await dialog.locator('[data-testid="inv-done"]').innerText()
        check(/entraram na ala como Visualizador/.test(done) && /Ana Beatriz Ramos/.test(done), 'tela confirma quem entrou e com qual papel', done)
        await page.screenshot({ path: path.join(SHOTS, `do-nevo-pronto-${vp.name}.png`) })
        await dialog.getByRole('button', { name: 'Pronto' }).click()
        await page.waitForTimeout(600)
        const team = await page.locator('.st__table').innerText()
        check(/Ana Beatriz Ramos/.test(team) && /Beatriz Lima/.test(team), 'a equipe já mostra quem entrou')
        const rows = (await db.query('SELECT role, title FROM "CompanyGroupMember" WHERE "groupId"=$1 AND "userId" = ANY($2)', [G, [ana, bia, caio]])).rows
        check(rows.length === 3 && rows.every((x) => x.role === 'VIEWER' && x.title === 'Time da loja'), 'no banco: os 3 com o papel e o rótulo escolhidos na tela')
      }
      check(bad.length === 0, `${vp.name} Do Nevo: nenhuma 401/5xx`, bad.join(', '))
      await ctx.close()
    }

    // O sino de quem entrou
    {
      const { ctx, page, bad } = await openAs(browser, 'ana', { width: 1440, height: 900, mobile: false }, C.pet)
      await page.goto(`${WEB}/`, { waitUntil: 'networkidle' })
      await page.locator('button[title="Notificações"]').first().click()
      const panel = page.locator('.inbox-panel')
      await panel.waitFor()
      await page.waitForTimeout(400)
      const txt = await panel.innerText()
      check(/Você entrou na ala Marketing \(Grupo Fluvio\)/.test(txt) && /Ala Marketing/.test(txt), 'o sino da Ana mostra o aviso "Você entrou na ala Marketing"', txt.slice(0, 160))
      await page.screenshot({ path: path.join(SHOTS, 'do-nevo-sino-ana-d1440.png') })
      await panel.getByText('Você entrou na ala Marketing').first().click()
      await page.waitForURL(/\/marketing/, { timeout: 8000 })
      await page.waitForTimeout(600)
      check(/\/marketing/.test(page.url()) && !/grupo=/.test(page.url()), 'clicar no aviso abre a ala (e o grupo sai da URL)', page.url())
      check(bad.length === 0, 'Ana: nenhuma 401/5xx', bad.join(', '))
      await ctx.close()
    }
  } finally {
    await resetColleagues(db)
    await db.end()
  }
}

;(async () => {
  if (ONLY !== 'ui') await apiPart()
  if (ONLY !== 'api') await uiPart()
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK')
  process.exit(fails ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
