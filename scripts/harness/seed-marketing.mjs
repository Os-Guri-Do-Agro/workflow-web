// Seed sintético da ala Marketing (dados inventados, nada de produção).
// Uso: HARNESS_DB=wf node seed-marketing.mjs > seed-marketing-out.json
// Pré-requisito: seed.mjs já rodou no mesmo banco (usuários e empresas).
//
// Monta o "Grupo Fluvio" com PetJourney, Emmitec e Nevo Studio (a Sentia fica
// FORA de propósito: empresa sem grupo não pode ver nada da ala) e a equipe:
//   nicolas  OWNER (Dono, o cargo maior)       senha nevo1234
//   leticia  ADMIN (aprova)                    é WORKER em pet/sentia/nevo
//   marcel   EDITOR (produz, papel do Leonardo) é WORKER em pet/emmitec/nevo
//   freela   EDITOR só da PetJourney, SEM empresa nenhuma (freelancer)
//   diretoria VIEWER, SEM empresa nenhuma (o chefe)
//   luis e ana: NÃO são da ala (luis é WORKER da Emmitec, que é marca do grupo)
import pg from 'pg'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'

const require = createRequire(new URL('../../../workflow-api/package.json', import.meta.url))
const bcrypt = require('bcrypt')

const DB = process.env.HARNESS_DB ?? 'wf'
const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
await db.connect()
const id = () => 'c' + randomUUID().replace(/-/g, '').slice(0, 24)
const q = (sql, params) => db.query(sql, params)

const userId = async (email) => (await q('SELECT id FROM "User" WHERE email=$1', [email])).rows[0]?.id
const companyId = async (cnpj) => (await q('SELECT id FROM "Company" WHERE cnpj=$1', [cnpj])).rows[0]?.id

const U = {
  nicolas: await userId('nicolas@nevo.test'),
  leticia: await userId('leticia@nevo.test'),
  marcel: await userId('marcel@nevo.test'),
  luis: await userId('luis@nevo.test'),
  ana: await userId('ana@nevo.test'),
}
const C = {
  pet: await companyId('11111111000101'),
  sentia: await companyId('22222222000102'),
  emmitec: await companyId('33333333000103'),
  nevo: await companyId('44444444000104'),
}
if (!U.nicolas || !C.pet) throw new Error('Rode o seed.mjs antes (usuários e empresas não encontrados)')

// Recria do zero (idempotente): apagar o grupo leva tudo da ala em cascata.
await q('DELETE FROM "CompanyGroup" WHERE name=$1', ['Grupo Fluvio'])

const pass = await bcrypt.hash('nevo1234', 10)
async function ensureUser(key, name) {
  const email = `${key}@nevo.test`
  const found = await userId(email)
  if (found) return found
  const uid = id()
  await q('INSERT INTO "User"(id,name,email,password,"updatedAt") VALUES ($1,$2,$3,$4,now())', [uid, name, email, pass])
  return uid
}
U.freela = await ensureUser('freela', 'Rafa Souza')
U.diretoria = await ensureUser('diretoria', 'Carla Mendes')

const G = id()
await q('INSERT INTO "CompanyGroup"(id,name,"marketingEnabled",settings,"createdById","updatedAt") VALUES ($1,$2,true,$3,$4,now())', [
  G, 'Grupo Fluvio', JSON.stringify({}), U.nicolas,
])
const brands = [
  ['pet', 'teal'],
  ['emmitec', 'indigo'],
  ['nevo', 'amber'],
]
for (const [key, color] of brands) {
  await q('INSERT INTO "CompanyGroupCompany"("groupId","companyId","marketingEnabled",color,"addedById") VALUES ($1,$2,true,$3,$4)', [
    G, C[key], color, U.nicolas,
  ])
}
const members = [
  ['nicolas', 'OWNER', [], null],
  ['leticia', 'ADMIN', [], 'Marketing'],
  ['marcel', 'EDITOR', [], 'Conteúdo e dados'],
  ['freela', 'EDITOR', [C.pet], 'Freelancer'],
  ['diretoria', 'VIEWER', [], 'Diretoria'],
]
for (const [key, role, brandIds, title] of members) {
  await q('INSERT INTO "CompanyGroupMember"("groupId","userId",role,"brandIds",title,"invitedById","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now())', [
    G, U[key], role, brandIds, title, U.nicolas,
  ])
}

// Alguns cards para as telas não nascerem vazias (sem arquivo: o E2E de cada
// fase sobe os dele pelo fake-storage).
// Hora de BRASÍLIA (UTC-3, sem horário de verão desde 2019), não a da máquina:
// `setHours` local punha os cards em outra hora quando a máquina está em outro
// fuso (Cuiabá é -4), e o calendário mostrava 07:00 no lugar de 10:00.
const BR_OFFSET_H = 3
const brToday = new Date(Date.now() - BR_OFFSET_H * 3600_000)
const at = (days, h = 10) =>
  new Date(Date.UTC(brToday.getUTCFullYear(), brToday.getUTCMonth(), brToday.getUTCDate() + days, h + BR_OFFSET_H, 0, 0))
const cards = [
  ['pet', 'POST', 'Dicas de banho no inverno', 'IDEA', ['INSTAGRAM'], null, at(9), U.marcel],
  ['pet', 'REEL', 'Reel: rotina do tutor de primeira viagem', 'IN_PRODUCTION', ['INSTAGRAM', 'TIKTOK'], at(2), at(5, 18), U.marcel],
  ['pet', 'CAROUSEL', 'Carrossel: 5 sinais de que o pet está com dor', 'IN_PRODUCTION', ['INSTAGRAM'], at(-1), at(3, 12), U.freela],
  ['emmitec', 'POST', 'Post institucional EMMI', 'IDEA', ['LINKEDIN'], null, at(12), U.marcel],
  ['pet', 'PRINT', 'Placa de balcão para clínicas parceiras', 'IDEA', [], at(10), null, U.marcel],
]
const out = { groupId: G, users: U, companies: C, cards: [] }
let pos = 1024
for (const [brand, kind, title, status, networks, dueAt, publishAt, assignee] of cards) {
  const cid = id()
  await q(
    'INSERT INTO "MarketingCard"(id,"groupId","companyId",kind,title,status,networks,"dueAt","publishAt","assigneeId","createdById",position,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())',
    [cid, G, C[brand], kind, title, status, networks, dueAt, publishAt, assignee, U.leticia, pos],
  )
  pos += 1024
  out.cards.push({ id: cid, title, status })
}

console.log(JSON.stringify(out, null, 1))
await db.end()
