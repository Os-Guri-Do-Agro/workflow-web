// Pessoas extras para estados da home: "bia" (tudo concluído) e "caio" (dia 1, nada atribuído).
import pg from 'pg'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const require = createRequire(new URL('../../../workflow-api/package.json', import.meta.url))
const bcrypt = require('bcrypt')
// SEED_OUT aponta o seed-out do banco certo (marketing-db.sh passa o dele).
const seed = JSON.parse(readFileSync(process.env.SEED_OUT ?? new URL('./seed-out.json', import.meta.url)))
const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${process.env.HARNESS_DB ?? 'wf'}` })
await db.connect()
const id = () => 'c' + randomUUID().replace(/-/g, '').slice(0, 24)
const pass = await bcrypt.hash('nevo1234', 10)

for (const [key, name] of [['bia', 'Beatriz Lima'], ['caio', 'Caio Prado']]) {
  const exists = await db.query('SELECT id FROM "User" WHERE email=$1', [`${key}@nevo.test`])
  if (exists.rowCount) continue
  const uid = id()
  await db.query('INSERT INTO "User"(id,name,email,password,"updatedAt") VALUES ($1,$2,$3,$4,now())', [uid, name, `${key}@nevo.test`, pass])
  await db.query('INSERT INTO "UserCompany"("userId","companyId",role) VALUES ($1,$2,$3)', [uid, seed.companies.pet, 'WORKER'])
  if (key === 'bia') {
    const month = await db.query(
      'SELECT m.id FROM "Month" m JOIN "Quarter" q ON q.id=m."quarterId" WHERE q."companyId"=$1 AND m.number=$2',
      [seed.companies.pet, new Date().getMonth() + 1],
    )
    const aid = id()
    await db.query('INSERT INTO "Activity"(id,title,status,"monthId","updatedAt") VALUES ($1,$2,$3,$4,now())', [aid, 'Revisar textos do onboarding', 'DONE', month.rows[0].id])
    await db.query('INSERT INTO "ActivityResponsible"("userId","activityId") VALUES ($1,$2)', [uid, aid])
  }
  console.log('criado', key)
}
await db.end()
