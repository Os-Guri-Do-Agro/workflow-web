// Ponta a ponta das melhorias "úteis" (spec v2-uteis): Ctrl+K por chave e por
// título, ações do Meu dia (Começar, Adiar, timer), timer no painel da tarefa e
// "Nova tarefa" no mês atual. Confere no banco do harness e devolve o estado no
// fim, passe ou falhe (status, posição e prazo das tarefas do mês, e apaga os
// registros de tempo que criou): roda antes ou depois do celular-e2e no mesmo banco.
// Uso: PGPORT=55433 node uteis-e2e.cjs
const { chromium } = require('playwright-core')
const pg = require('pg')
const fs = require('fs')

const API = process.env.API ?? 'http://127.0.0.1:3599'
const WEB = process.env.WEB ?? 'http://localhost:5174'
const PGPORT = process.env.PGPORT ?? '55432'
const results = []
const check = (name, ok, extra = '') => results.push(`${ok ? 'OK   ' : 'FALHA'} ${name}${extra ? ' :: ' + extra : ''}`)
// Devolve o banco como estava (passe ou falhe). Definida depois de ler o estado.
let restore = async () => {}

;(async () => {
  const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${PGPORT}/wf` })
  await db.connect()
  const company = (await db.query(`SELECT id FROM "Company" WHERE name='PetJourney'`)).rows[0].id
  const nicolas = (await db.query(`SELECT id FROM "User" WHERE email='nicolas@nevo.test'`)).rows[0].id
  // Tarefa aberta do Nicolas, devolvida para A fazer sem prazo (a rodada anterior
  // já pode ter dado Começar nela): assim o roteiro roda quantas vezes precisar.
  const todo = (
    await db.query(
      `SELECT a.id, a.title FROM "Activity" a JOIN "ActivityResponsible" r ON r."activityId"=a.id
       JOIN "Month" m ON m.id=a."monthId" JOIN "Quarter" q ON q.id=m."quarterId"
       WHERE r."userId"=$1 AND q."companyId"=$2 AND a.status IN ('TODO','IN_PROGRESS') AND a."parentId" IS NULL
       ORDER BY a.id LIMIT 1`,
      [nicolas, company],
    )
  ).rows[0]
  if (!todo) throw new Error('harness sem tarefa aberta do Nicolas na PetJourney')
  // Estado antes de tudo, que volta no fim: status, posição, prazo e `updatedAt` das
  // tarefas do mês da tarefa usada, e os registros de tempo que o roteiro cria saem.
  // Sem isso o "Começar" deixava a tarefa em Em andamento e com outro prazo, e quem
  // rodasse depois no mesmo banco (o celular-e2e, que espera o seed) quebrava.
  const monthOfTodo = (await db.query(`SELECT "monthId" FROM "Activity" WHERE id=$1`, [todo.id])).rows[0].monthId
  const snapshot = (
    await db.query(`SELECT id, status, position, "dueDate", "updatedAt" FROM "Activity" WHERE "monthId"=$1`, [monthOfTodo])
  ).rows
  const entriesBefore = (await db.query(`SELECT id FROM "TimeEntry" WHERE "userId"=$1`, [nicolas])).rows.map((r) => r.id)
  restore = async () => {
    for (const r of snapshot) {
      await db.query(`UPDATE "Activity" SET status=$2, position=$3, "dueDate"=$4, "updatedAt"=$5 WHERE id=$1`, [
        r.id,
        r.status,
        r.position,
        r.dueDate,
        r.updatedAt,
      ])
    }
    await db.query(`DELETE FROM "TimeEntry" WHERE "userId"=$1 AND NOT (id = ANY($2))`, [nicolas, entriesBefore])
    const now = (await db.query(`SELECT id, status, position, "dueDate" FROM "Activity" WHERE "monthId"=$1`, [monthOfTodo])).rows
    const same = snapshot.every((s) => {
      const n = now.find((x) => x.id === s.id)
      return n && n.status === s.status && n.position === s.position && String(n.dueDate) === String(s.dueDate)
    })
    return same
  }
  await db.query(`UPDATE "Activity" SET status='TODO', "dueDate"=NULL WHERE id=$1`, [todo.id])
  const key = `PJ-${todo.id.slice(-6).toUpperCase()}`
  await db.query(`UPDATE "TimeEntry" SET "endedAt"=now(), "durationSec"=60 WHERE "userId"=$1 AND "endedAt" IS NULL`, [nicolas])

  const token = (await (await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'nicolas@nevo.test', password: 'nevo1234' }) })).json()).accessToken
  const b = await chromium.launch({ channel: 'msedge', headless: true })
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(([t, co]) => {
    localStorage.setItem('token', t); localStorage.setItem('activeCompany', co)
    localStorage.setItem('onboarding.completed', '1'); localStorage.setItem('onboarding.autoShown', '1')
    localStorage.setItem('ui.idlePermissionPrompt', 'done'); localStorage.setItem('ui.theme', 'light'); localStorage.setItem('dashboard.tab', 'today')
    localStorage.setItem('ui.timerSounds', 'false')
    localStorage.setItem('nevo.idle.protectionSnoozedUntil', String(Date.now() + 864e5))
  }, [token, company])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.goto(WEB + '/')
  await p.addStyleTag({ content: '#__vue-devtools-container__{display:none!important}' })
  await p.waitForTimeout(3500)

  // 1. Ctrl+K pela chave
  await p.keyboard.press('Control+k')
  await p.waitForTimeout(400)
  await p.keyboard.type(key)
  // Dentro da paleta: o Meu dia atrás dela também mostra o título.
  const found = await p
    .locator(`.cmd-item:has-text(${JSON.stringify(todo.title)})`)
    .first()
    .waitFor({ timeout: 8000 })
    .then(() => true, () => false)
  check('Ctrl+K acha a tarefa pela chave', found, key)
  const selected = (await p.locator('.cmd-item.selected').first().innerText().catch(() => '')) || ''
  check('a tarefa da chave vem primeiro e selecionada', selected.includes(todo.title), selected.split('\n')[0])
  await p.keyboard.press('Enter')
  await p.waitForTimeout(2500)
  check('Enter abre o painel da tarefa no /board', p.url().includes(`/board?task=${todo.id}`), p.url().replace(WEB, ''))

  // 2. Ctrl+K pelo título
  await p.keyboard.press('Escape')
  await p.waitForTimeout(300)
  await p.keyboard.press('Control+k')
  await p.waitForTimeout(300)
  await p.keyboard.type('cadastro do pet')
  await p.waitForTimeout(900)
  check('Ctrl+K acha pelo título sem acento/caixa', (await p.locator('.cmd-item:has-text("cadastro do pet")').count()) > 0)
  await p.keyboard.press('Escape')

  // 3. Timer no painel da tarefa
  await p.goto(`${WEB}/board?task=${todo.id}&company=${company}`)
  await p.waitForTimeout(3000)
  await p.click('.task-timer')
  await p.waitForTimeout(1500)
  let running = (await db.query(`SELECT "activityId" FROM "TimeEntry" WHERE "userId"=$1 AND "endedAt" IS NULL`, [nicolas])).rows
  check('painel: liga o timer nesta tarefa', running.length === 1 && running[0].activityId === todo.id)
  check('painel: botão mostra o relógio', /\d+:\d{2}/.test((await p.locator('.task-timer').innerText()) || ''))
  await p.click('.task-timer')
  await p.waitForTimeout(1500)
  running = (await db.query(`SELECT 1 FROM "TimeEntry" WHERE "userId"=$1 AND "endedAt" IS NULL`, [nicolas])).rows
  check('painel: para o timer', running.length === 0)

  // 4. Meu dia: Começar, Adiar e timer
  await p.goto(WEB + '/')
  await p.waitForTimeout(3500)
  const row = p.locator('.row-wrap', { hasText: todo.title }).first()
  await row.hover()
  await row.locator('button:has-text("Começar")').click()
  await p.waitForTimeout(1500)
  const st = (await db.query(`SELECT status FROM "Activity" WHERE id=$1`, [todo.id])).rows[0].status
  check('Meu dia: Começar manda para Em andamento', st === 'IN_PROGRESS', st)

  const row2 = p.locator('.row-wrap', { hasText: todo.title }).first()
  await row2.hover()
  await row2.locator('button[aria-label^="Adiar"]').click()
  await p.waitForTimeout(400)
  await p.locator('.dd-item:has-text("Amanhã")').click()
  await p.waitForTimeout(1500)
  const due = (await db.query(`SELECT "dueDate" FROM "Activity" WHERE id=$1`, [todo.id])).rows[0].dueDate
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const dueDay = due ? new Date(due).toISOString().slice(0, 10) : null
  const want = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`
  check('Meu dia: Adiar para amanhã grava o prazo', dueDay === want, `${dueDay} (esperado ${want})`)

  const row3 = p.locator('.row-wrap', { hasText: todo.title }).first()
  await row3.hover()
  await row3.locator('button[aria-label^="Ligar o timer"]').click()
  await p.waitForTimeout(1500)
  running = (await db.query(`SELECT "activityId" FROM "TimeEntry" WHERE "userId"=$1 AND "endedAt" IS NULL`, [nicolas])).rows
  check('Meu dia: timer liga na própria linha', running.length === 1 && running[0].activityId === todo.id)
  check('Meu dia: linha com timer fica destacada', (await p.locator('.row-wrap--live').count()) === 1)
  await p.screenshot({ path: __dirname + '/uteis-meu-dia.png' })
  await p.locator('.row-wrap--live button[aria-label^="Parar o timer"]').click()
  await p.waitForTimeout(1500)
  running = (await db.query(`SELECT 1 FROM "TimeEntry" WHERE "userId"=$1 AND "endedAt" IS NULL`, [nicolas])).rows
  check('Meu dia: para o timer', running.length === 0)

  // 5. Nova tarefa da home vai para o mês atual
  const monthNow = (await db.query(
    `SELECT m.id FROM "Month" m JOIN "Quarter" q ON q.id=m."quarterId" WHERE q."companyId"=$1 AND m.number=$2`,
    [company, new Date().getMonth() + 1],
  )).rows[0].id
  await p.click('.new-btn')
  await p.waitForTimeout(2000)
  check('Nova tarefa da home abre no mês atual', p.url().includes(`/tasks/${monthNow}`), p.url().replace(WEB, ''))

  // 6. Celular: ações visíveis sem hover
  const m = await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await m.addInitScript(([t, co]) => {
    localStorage.setItem('token', t); localStorage.setItem('activeCompany', co)
    localStorage.setItem('onboarding.completed', '1'); localStorage.setItem('onboarding.autoShown', '1')
    localStorage.setItem('ui.idlePermissionPrompt', 'done'); localStorage.setItem('ui.theme', 'light'); localStorage.setItem('dashboard.tab', 'today')
  }, [token, company])
  const mp = await m.newPage()
  await mp.goto(WEB + '/')
  await mp.addStyleTag({ content: '#__vue-devtools-container__{display:none!important}' })
  await mp.waitForTimeout(3500)
  const opacity = await mp.evaluate(() => getComputedStyle(document.querySelector('.row-actions')).opacity)
  check('celular: ações visíveis sem hover', opacity === '1', opacity)
  // As ações dividem a fileira com empresa e prazo (uma linha só de botões por
  // tarefa deixava a lista três vezes mais alta).
  const geo = await mp.evaluate(() => {
    const w = document.querySelector('.row-wrap')
    const meta = w.querySelector('.row-meta').getBoundingClientRect()
    const act = w.querySelector('.row-actions').getBoundingClientRect()
    return { metaMid: Math.round(meta.top + meta.height / 2), actMid: Math.round(act.top + act.height / 2), alturaLinha: Math.round(w.getBoundingClientRect().height) }
  })
  check('celular: ações na fileira da empresa e prazo', Math.abs(geo.metaMid - geo.actMid) < 4, JSON.stringify(geo))
  await mp.screenshot({ path: __dirname + '/uteis-meu-dia-m375.png' })
  await mp.locator('.row-wrap .row-meta').first().click()
  await mp.waitForTimeout(1500)
  check('celular: tocar na empresa/prazo abre a tarefa', mp.url().includes('/board?task='), mp.url().replace(WEB, ''))

  // Desktop: o vão entre o título e a meta também abre (link esticado).
  await p.goto(WEB + '/')
  await p.waitForTimeout(3000)
  const box = await p.locator('.row-wrap').first().boundingBox()
  const metaBox = await p.locator('.row-wrap .row-meta').first().boundingBox()
  await p.mouse.click(metaBox.x - 6, box.y + box.height / 2)
  await p.waitForTimeout(1500)
  check('desktop: clicar no vão da linha abre a tarefa', p.url().includes('/board?task='), p.url().replace(WEB, ''))

  check('sem erro de página', errs.length === 0, errs.join(' | '))
  await b.close()
  check('devolve o estado do mês (status, posição e prazo) e apaga os tempos que criou', await restore())
  console.log(results.join('\n'))
  await db.end()
  // Sai com 1 quando alguma checagem falhou, como o celular-e2e: quem roda em
  // lote não precisa ler as linhas FALHA para saber.
  process.exitCode = results.some((r) => r.startsWith('FALHA')) ? 1 : 0
})().catch(async (e) => {
  await restore().catch(() => {})
  console.log(results.join('\n'))
  console.error('ERRO', e.message)
  process.exit(1)
})
