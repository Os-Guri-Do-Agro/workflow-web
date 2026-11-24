// Postgres embutido para o harness local (nunca toca produção).
// Uso: node pg.mjs  -> sobe em 127.0.0.1:55432, user/senha postgres/postgres, db "workflow".
// PGPORT troca a porta (ex.: quando outro Postgres, como um contêiner Docker, já está na 55432).
import EmbeddedPostgres from 'embedded-postgres'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PGPORT ?? 55432)
const dataDir = path.join(here, 'pgdata')
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: true,
})

const fresh = !existsSync(path.join(dataDir, 'PG_VERSION'))
if (fresh) await pg.initialise()
await pg.start()
if (fresh) await pg.createDatabase('workflow')
console.log(`[pg] pronto em 127.0.0.1:${PORT}/workflow`, fresh ? '(novo)' : '(reaproveitado)')

const stop = async () => { await pg.stop(); process.exit(0) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
setInterval(() => {}, 1 << 30)
