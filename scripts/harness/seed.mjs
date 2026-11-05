// Seed sintético do harness (dados inventados, nada de produção).
// Uso: node seed.mjs   (banco wf em 127.0.0.1:55432)
import pg from 'pg'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'

const require = createRequire(new URL('../../../workflow-api/package.json', import.meta.url))
const bcrypt = require('bcrypt')

const db = new pg.Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55432/wf' })
await db.connect()
const id = () => 'c' + randomUUID().replace(/-/g, '').slice(0, 24)
const q = (sql, params) => db.query(sql, params)
const now = new Date()
const day = (offset, h = 10, m = 0) => {
  const d = new Date(now)
  d.setDate(d.getDate() + offset)
  d.setHours(h, m, 0, 0)
  return d
}

const pass = await bcrypt.hash('nevo1234', 10)
const people = [
  { key: 'nicolas', name: 'Nicolas Castela', email: 'nicolas@nevo.test' },
  { key: 'leticia', name: 'Letícia Moraes', email: 'leticia@nevo.test' },
  { key: 'marcel', name: 'Marcel Duarte', email: 'marcel@nevo.test' },
  { key: 'luis', name: 'Luis Gustavo Nascimento', email: 'luis@nevo.test' },
  { key: 'ana', name: 'Ana Beatriz Ramos', email: 'ana@nevo.test' }, // a pessoa nova do time
]
const U = {}
for (const p of people) {
  U[p.key] = id()
  await q('INSERT INTO "User"(id,name,email,password,"updatedAt",  "createdAt") VALUES ($1,$2,$3,$4,now(), $5)', [
    U[p.key], p.name, p.email, pass, p.key === 'ana' ? day(-1) : day(-200),
  ])
}

const companies = [
  { key: 'pet', name: 'PetJourney', cnpj: '11111111000101' },
  { key: 'sentia', name: 'Sentia', cnpj: '22222222000102' },
  { key: 'emmitec', name: 'Emmitec', cnpj: '33333333000103' },
  { key: 'nevo', name: 'Nevo Studio', cnpj: '44444444000104' },
]
const C = {}
for (const c of companies) {
  C[c.key] = id()
  await q('INSERT INTO "Company"(id,name,cnpj,"updatedAt") VALUES ($1,$2,$3,now())', [C[c.key], c.name, c.cnpj])
}
const member = async (u, c, role) =>
  q('INSERT INTO "UserCompany"("userId","companyId",role,"joinedAt") VALUES ($1,$2,$3,$4)', [U[u], C[c], role, u === 'ana' ? day(-1) : day(-180)])
for (const c of ['pet', 'sentia', 'emmitec', 'nevo']) await member('nicolas', c, 'ADMIN')
for (const c of ['pet', 'sentia', 'nevo']) await member('leticia', c, 'WORKER')
for (const c of ['pet', 'emmitec', 'nevo']) await member('marcel', c, 'WORKER')
for (const c of ['sentia', 'emmitec', 'nevo']) await member('luis', c, 'WORKER')
await member('ana', 'pet', 'WORKER')
await member('ana', 'nevo', 'WORKER')

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const M = {} // M[company][number]
for (const c of Object.keys(C)) {
  M[c] = {}
  for (let qi = 1; qi <= 4; qi++) {
    const qid = id()
    await q('INSERT INTO "Quarter"(id,label,"companyId") VALUES ($1,$2,$3)', [qid, 'Q' + qi, C[c]])
    for (let k = 0; k < 3; k++) {
      const n = (qi - 1) * 3 + k + 1
      const mid = id()
      M[c][n] = mid
      await q('INSERT INTO "Month"(id,name,number,"quarterId") VALUES ($1,$2,$3,$4)', [mid, MONTHS[n - 1], n, qid])
    }
  }
}

const tags = {}
for (const [c, list] of Object.entries({ pet: ['App', 'Bug', 'Design', 'API'], sentia: ['Site', 'SEO', 'Bug'], emmitec: ['Infra', 'Painel'], nevo: ['Interno'] })) {
  for (const [i, name] of list.entries()) {
    const tid = id()
    tags[c + ':' + name] = tid
    const colors = ['blue', 'red', 'purple', 'teal', 'amber']
    await q('INSERT INTO "Tag"(id,name,slug,color,"companyId","updatedAt") VALUES ($1,$2,$3,$4,$5,now())', [tid, name, name.toLowerCase(), colors[i % 5], C[c]])
  }
}

const cur = now.getMonth() + 1
const prev = cur === 1 ? 12 : cur - 1
const acts = []
const act = async (c, month, title, status, who, opts = {}) => {
  const aid = id()
  const created = opts.created ?? day(-(opts.age ?? 6))
  await q(
    'INSERT INTO "Activity"(id,title,description,"priorityNumber",status,position,"dueDate","monthId","parentId","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [aid, title, opts.desc ?? null, opts.prio ?? 2, status, opts.pos ?? acts.length, opts.due ?? null, M[c][month], opts.parent ?? null, created, opts.updated ?? created],
  )
  for (const u of who) await q('INSERT INTO "ActivityResponsible"("userId","activityId") VALUES ($1,$2)', [U[u], aid])
  for (const t of opts.tags ?? []) await q('INSERT INTO "ActivityTag"("activityId","tagId") VALUES ($1,$2)', [aid, tags[c + ':' + t]]).catch(() => {})
  if (status === 'DONE') {
    await q('INSERT INTO "ActivityLog"(id,"activityId","activityTitle","previousStatus","newStatus","changedById","changedAt") VALUES ($1,$2,$3,$4,$5,$6,$7)', [
      id(), aid, title, 'IN_TESTING', 'DONE', U[who[0] ?? 'nicolas'], opts.doneAt ?? day(-(opts.doneAgo ?? 2), 16),
    ])
  }
  acts.push({ id: aid, c, title, status, who })
  return aid
}

const desc = '<p>Contexto: o cliente pediu ajuste no fluxo de cadastro do pet.</p><ul><li><p>Validar no iOS e no Android</p></li><li><p>Conferir textos com o time de conteúdo</p></li></ul>'
// PetJourney, mês atual
const a1 = await act('pet', cur, 'Tela de cadastro do pet com foto', 'IN_PROGRESS', ['nicolas', 'marcel'], { prio: 1, due: day(1, 18), tags: ['App', 'Design'], desc })
await act('pet', cur, 'Validar CPF no cadastro do tutor', 'TODO', ['marcel'], { prio: 2, due: day(3, 18), tags: ['App'] })
await act('pet', cur, 'Push de lembrete de vacina', 'IN_TESTING', ['leticia'], { prio: 1, due: day(0, 18), tags: ['App', 'API'] })
await act('pet', cur, 'Crash ao abrir galeria no Android 14', 'TODO', ['nicolas'], { prio: 0, due: day(-1, 18), tags: ['Bug'] })
await act('pet', cur, 'Endpoint de histórico de passeios', 'REVIEWED', ['marcel'], { prio: 2, tags: ['API'] })
await act('pet', cur, 'Ícones da tab bar novos', 'DONE', ['leticia'], { prio: 3, tags: ['Design'], doneAgo: 0 })
await act('pet', cur, 'Onboarding em 3 passos', 'DONE', ['nicolas'], { prio: 2, tags: ['App'], doneAgo: 1 })
await act('pet', cur, 'Ajustar textos da loja (App Store)', 'TODO', ['ana'], { prio: 3, due: day(5, 18) })
await act('pet', cur, 'Testar fluxo de pagamento no sandbox', 'TODO', [], { prio: 2, due: day(7, 18), tags: ['API'] })
await act('pet', cur, 'Subtarefa: foto com recorte quadrado', 'DONE', ['marcel'], { parent: a1, doneAgo: 1 })
await act('pet', cur, 'Subtarefa: permissão de câmera', 'TODO', ['marcel'], { parent: a1 })
// Sentia
await act('sentia', cur, 'Landing da campanha de dezembro', 'IN_PROGRESS', ['leticia', 'luis'], { prio: 1, due: day(2, 18), tags: ['Site'] })
await act('sentia', cur, 'Meta tags e sitemap', 'TODO', ['luis'], { prio: 2, due: day(4, 18), tags: ['SEO'] })
await act('sentia', cur, 'Formulário de contato não envia no Safari', 'IN_TESTING', ['luis'], { prio: 0, due: day(-2, 18), tags: ['Bug'] })
await act('sentia', cur, 'Blog: migração dos posts antigos', 'DONE', ['leticia'], { doneAgo: 3, tags: ['Site'] })
await act('sentia', cur, 'Banner do Black Friday', 'DONE', ['leticia'], { doneAgo: 0 })
// Emmitec
await act('emmitec', cur, 'Painel de faturamento: filtro por período', 'IN_PROGRESS', ['luis'], { prio: 1, due: day(6, 18), tags: ['Painel'] })
await act('emmitec', cur, 'Backup diário do banco', 'TODO', ['marcel'], { prio: 1, due: day(2, 18), tags: ['Infra'] })
await act('emmitec', cur, 'Atualizar Node para 22 no servidor', 'REVIEWED', ['marcel'], { prio: 2, tags: ['Infra'] })
await act('emmitec', cur, 'Exportar relatório em PDF', 'DONE', ['luis'], { doneAgo: 4, tags: ['Painel'] })
// Nevo
await act('nevo', cur, 'Organizar o Drive do time', 'TODO', ['ana', 'nicolas'], { prio: 3, due: day(8, 18), tags: ['Interno'] })
await act('nevo', cur, 'Planejar sprint de dezembro', 'TODO', ['nicolas'], { prio: 2, due: day(3, 18), tags: ['Interno'] })
// mês anterior concluído (histórico do dashboard)
for (const [c, who] of [['pet', 'nicolas'], ['pet', 'marcel'], ['sentia', 'leticia'], ['emmitec', 'luis'], ['pet', 'leticia']]) {
  for (let i = 0; i < 4; i++) await act(c, prev, `Entrega de ${MONTHS[prev - 1].slice(0, 3)} #${i + 1}`, 'DONE', [who], { age: 30 + i, doneAgo: 8 + i * 3 })
}

// tempo (sequência e meu tempo)
for (const [u, days] of [['nicolas', 9], ['leticia', 14], ['marcel', 4], ['luis', 21]]) {
  for (let i = days; i >= 1; i--) {
    const start = day(-i, 9)
    const end = day(-i, 11, 30)
    if ([0, 6].includes(start.getDay())) continue
    await q('INSERT INTO "TimeEntry"(id,"userId",description,"startedAt","endedAt","durationSec","companyId","activityId",billable,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())', [
      id(), U[u], 'Trabalho', start, end, 9000, C.pet, a1, true,
    ]).catch((e) => { throw new Error('TimeEntry: ' + e.message) })
  }
}

// feed
const feed = [
  ['leticia', 'pet', 'status_changed', 'moveu "Ícones da tab bar novos" para Concluído', 0.1],
  ['marcel', 'pet', 'commented', 'comentou em "Tela de cadastro do pet com foto"', 0.3],
  ['luis', 'sentia', 'status_changed', 'moveu "Formulário de contato não envia no Safari" para Em teste', 1],
  ['nicolas', 'pet', 'created', 'criou "Crash ao abrir galeria no Android 14"', 2],
  ['leticia', 'sentia', 'status_changed', 'moveu "Banner do Black Friday" para Concluído', 3],
]
for (const [u, c, verb, summary, hoursAgo] of feed) {
  const t = new Date(now.getTime() - hoursAgo * 3600e3)
  await q('INSERT INTO "FeedEvent"(id,"companyId","actorId",verb,"entityType","entityId",summary,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id(), C[c], U[u], verb, 'activity', acts[0].id, summary, t])
}

// inbox
for (const [title, body, h] of [['Marcel comentou na sua tarefa', '"Tela de cadastro do pet com foto"', 0.3], ['Letícia te mencionou', '@Nicolas dá uma olhada no push de vacina', 2]]) {
  await q('INSERT INTO "Notification"(id,"userId","companyId",type,title,body,link,read,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8)', [id(), U.nicolas, C.pet, 'COMMENT', title, body, '/tasks', new Date(now.getTime() - h * 3600e3)])
}

// agenda
for (const [title, off, h, type] of [['Daily do time', 0, 9, 'MEETING'], ['Review com a PetJourney', 1, 15, 'MEETING'], ['Entrega da landing Sentia', 2, 18, 'DEADLINE']]) {
  await q('INSERT INTO "Event"(id,title,"startDate","endDate",type,"createdById","companyId",attendees,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())', [id(), title, day(off, h), day(off, h + 1), type, U.nicolas, C.pet, []])
}

// notas
const folder = id()
await q('INSERT INTO "NoteFolder"(id,name,"userId","updatedAt") VALUES ($1,$2,$3,now())', [folder, 'Clientes', U.nicolas])
for (const [title, content, pin, emoji] of [
  ['Reunião PetJourney 04/11', '<h2>Decisões</h2><ul><li><p>Cadastro com foto entra na versão 1.4</p></li><li><p>Push de vacina só depois do teste no iOS</p></li></ul><p>Próxima conversa na sexta.</p>', true, '🐶'],
  ['Ideias para o Nevo', '<p>Webhook de deploy do Amplify avisando no feed.</p><p>App de celular mais gostoso.</p>', false, '💡'],
  ['Checklist de publicação', '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Build no EAS</p></li><li data-type="taskItem" data-checked="false"><p>Screenshots da loja</p></li></ul>', false, null],
]) {
  await q('INSERT INTO "Note"(id,title,content,"createdById","folderId",tags,"isPinned",emoji,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())', [id(), title, content, U.nicolas, folder, [], pin, emoji])
}

console.log(JSON.stringify({ users: U, companies: C }, null, 1))
await db.end()
