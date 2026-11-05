// Roadmap sintético para o harness: 3 meses da PetJourney com focos, entradas
// de todas as categorias e marcos do trimestre. Uso: PGPORT=55432 node seed-roadmap.mjs
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'

const port = process.env.PGPORT ?? '55432'
const seed = JSON.parse(readFileSync(new URL('./seed-out.json', import.meta.url)))
const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${port}/wf` })
await db.connect()
const id = () => 'c' + randomUUID().replace(/-/g, '').slice(0, 24)
const company = seed.companies.pet
const now = new Date()
const year = now.getFullYear()
const pad = (n) => String(n).padStart(2, '0')
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

await db.query('DELETE FROM "RoadmapMonth" WHERE "companyId"=$1', [company])
await db.query('DELETE FROM "RoadmapMilestone" WHERE "companyId"=$1', [company])

const plans = [
  {
    offset: -1,
    main: 'Lançar o cadastro do pet com foto e estabilizar o app nas lojas.',
    focus: ['Cadastro com foto na versão 1.4', 'Zerar crashes do Android 14', 'Revisar textos da App Store'],
    entries: [
      [3, 'Kickoff da versão 1.4', 'meeting'],
      [10, 'Cadastro com foto em homologação', 'delivery'],
      [18, 'Gravação do vídeo da loja', 'recording'],
      [24, 'Versão 1.4 publicada', 'milestone'],
      [27, 'Pico de crash no Android 14', 'risk'],
    ],
  },
  {
    offset: 0,
    main: 'Lembretes de vacina e pagamentos no app, com teste em iOS e Android antes de subir.',
    focus: ['Push de lembrete de vacina', 'Fluxo de pagamento no sandbox', 'Histórico de passeios na API'],
    entries: [
      [4, 'Review com a PetJourney', 'meeting'],
      [6, 'Tela de cadastro do pet com foto', 'delivery'],
      [12, 'Sandbox de pagamento liberado', 'delivery'],
      [14, 'Dependência do gateway de pagamento', 'risk'],
      [20, 'Gravar demo do lembrete de vacina', 'recording'],
      [28, 'Versão 1.5 nas lojas', 'milestone'],
      [9, 'Cliente pediu revisar a cor do botão principal', 'note'],
    ],
  },
  {
    offset: 1,
    main: 'Planejar 2027: assinatura premium e painel do veterinário.',
    focus: ['Pesquisa com tutores', 'Desenho da assinatura premium'],
    entries: [
      [5, 'Planejamento de 2027', 'meeting'],
      [15, 'Protótipo do painel do veterinário', 'delivery'],
      [19, 'Recesso de fim de ano', 'note'],
    ],
  },
]

for (const plan of plans) {
  const d = new Date(year, now.getMonth() + plan.offset, 1)
  const m = d.getMonth()
  const y = d.getFullYear()
  const monthId = id()
  await db.query(
    'INSERT INTO "RoadmapMonth"(id,"companyId",key,year,month,title,main,"order","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())',
    [monthId, company, `${y}-${pad(m + 1)}`, y, m, MONTHS[m], plan.main, plan.offset + 1],
  )
  for (const [i, text] of plan.focus.entries()) {
    await db.query('INSERT INTO "RoadmapFocus"(id,"monthId",text,"order","updatedAt") VALUES ($1,$2,$3,$4,now())', [id(), monthId, text, i])
  }
  for (const [day, title, category] of plan.entries) {
    await db.query(
      'INSERT INTO "RoadmapEntry"(id,"monthId",date,title,category,"updatedAt") VALUES ($1,$2,$3,$4,$5,now())',
      [id(), monthId, `${y}-${pad(m + 1)}-${pad(day)}`, title, category],
    )
  }
}

for (const [mOffset, day, title, type] of [[-1, 24, 'App 1.4 nas lojas', 'MILESTONE'], [0, 28, 'App 1.5 nas lojas', 'MILESTONE'], [1, 10, 'Revisão do trimestre', 'REVIEW']]) {
  const d = new Date(year, now.getMonth() + mOffset, day)
  await db.query(
    'INSERT INTO "RoadmapMilestone"(id,"companyId",title,date,type,"updatedAt") VALUES ($1,$2,$3,$4,$5,now())',
    [id(), company, title, `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, type],
  )
}
console.log('roadmap semeado na porta', port)
await db.end()
