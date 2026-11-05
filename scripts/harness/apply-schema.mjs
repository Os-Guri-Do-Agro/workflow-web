// Cria o banco "wf" em UTF8 do zero e aplica o schema gerado offline.
// Uso: node apply-schema.mjs <schema.sql> [extra.sql...]
import pg from 'pg'
import { readFileSync } from 'node:fs'

const admin = new pg.Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55432/postgres' })
await admin.connect()
await admin.query('DROP DATABASE IF EXISTS wf WITH (FORCE)')
await admin.query("CREATE DATABASE wf ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0")
await admin.end()

const db = new pg.Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55432/wf' })
await db.connect()
for (const file of process.argv.slice(2)) {
  const sql = readFileSync(file, 'utf8')
  await db.query(sql)
  console.log('[schema] aplicado', file)
}
await db.end()
