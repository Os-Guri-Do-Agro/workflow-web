// Ponta a ponta do roadmap novo (spec v2-celular-roadmap-notas, R1 a R3):
// visão Mês e Ano, item do tipo Teste, editar e mover de mês, excluir, marco
// com janela de teste, "Em teste agora" com as plataformas, objetivo e foco,
// PDF local, link público sem tarefa e a API sem a coluna nova (503 e leitura
// de pé). Confere tudo no banco do harness e devolve o estado no fim.
// Uso: node roadmap-e2e.cjs   (API em 3599, Vite em 5174, Postgres em 55432)
// Rodar de novo: espere 1 minuto. O passo 14 remove a coluna `testStart` e a
// API passa a gravar sem ela por até 60 s depois que ela volta (é o mesmo
// intervalo com que ela percebe a migration aplicada em produção).
const { chromium } = require('playwright-core')
const pg = require('pg')
const fs = require('fs')
const os = require('os')
const path = require('path')

const API = process.env.API ?? 'http://127.0.0.1:3599'
const WEB = process.env.WEB ?? 'http://localhost:5174'
const PGPORT = process.env.PGPORT ?? '55432'
const results = []
const check = (name, ok, extra = '') => results.push(`${ok ? 'OK   ' : 'FALHA'} ${name}${extra ? ' :: ' + extra : ''}`)
const pad = (n) => String(n).padStart(2, '0')
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// Login com cache: o limite é 10/min por IP e o harness roda vários roteiros.
async function tokenFor(email) {
  const file = path.join(os.tmpdir(), 'nevo-harness-roadmap-tokens.json')
  const cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
  const hit = cache[email]
  if (hit && hit.exp > Date.now() && hit.token) return hit.token
  const r = await (await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'nevo1234' }) })).json()
  if (!r.accessToken) throw new Error('login falhou: ' + JSON.stringify(r))
  cache[email] = { token: r.accessToken, exp: Date.now() + 6 * 3600e3 }
  fs.writeFileSync(file, JSON.stringify(cache))
  return r.accessToken
}

;(async () => {
  const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${PGPORT}/wf` })
  await db.connect()
  const company = (await db.query(`SELECT id FROM "Company" WHERE name='PetJourney'`)).rows[0].id
  const now = new Date()
  const today = keyOf(now)
  const monthKey = today.slice(0, 7)
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 3)
  const nextKey = keyOf(next).slice(0, 7)
  const TITLE = 'Rodada de teste iOS (e2e)'
  const FOCUS = 'Foco do roteiro e2e'

  // Estado limpo: sobra de rodada anterior sai; marco de referência sem janela.
  await db.query(`DELETE FROM "RoadmapEntry" WHERE title=$1`, [TITLE])
  await db.query(`DELETE FROM "RoadmapFocus" WHERE text=$1`, [FOCUS])
  const ms = (await db.query(`SELECT id, title, date FROM "RoadmapMilestone" WHERE "companyId"=$1 AND type='MILESTONE' AND date >= $2 ORDER BY date LIMIT 1`, [company, today])).rows[0]
  if (!ms) throw new Error('harness sem marco futuro (rode seed-roadmap.mjs)')
  await db.query(`UPDATE "RoadmapMilestone" SET "testStart"=NULL WHERE id=$1`, [ms.id])
  const monthRow = (await db.query(`SELECT id, main FROM "RoadmapMonth" WHERE "companyId"=$1 AND key=$2`, [company, monthKey])).rows[0]
  const originalMain = monthRow?.main ?? ''
  const testing = (await db.query(
    `SELECT a.id, a.title FROM "Activity" a JOIN "Month" m ON m.id=a."monthId" JOIN "Quarter" q ON q.id=m."quarterId"
     WHERE q."companyId"=$1 AND a.status='IN_TESTING' AND a."parentId" IS NULL ORDER BY a.id LIMIT 1`, [company])).rows[0]
  if (testing) await db.query(`DELETE FROM "ActivityTestCheck" WHERE "activityId"=$1`, [testing.id])

  const token = await tokenFor('nicolas@nevo.test')
  const b = await chromium.launch({ channel: 'msedge', headless: true })
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  await ctx.addInitScript(([t, co]) => {
    localStorage.setItem('token', t); localStorage.setItem('activeCompany', co)
    localStorage.setItem('onboarding.completed', '1'); localStorage.setItem('onboarding.autoShown', '1')
    localStorage.setItem('ui.idlePermissionPrompt', 'done'); localStorage.setItem('ui.theme', 'light')
    localStorage.setItem('roadmap.view', 'month'); localStorage.removeItem('roadmap.hidden')
    localStorage.setItem('nevo.idle.protectionSnoozedUntil', String(Date.now() + 864e5))
  }, [token, company])
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error' && !/401|favicon/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)) })
  await p.goto(WEB + '/roadmap')
  await p.addStyleTag({ content: '#__vue-devtools-container__{display:none!important}' })
  await p.waitForSelector('.rmv-cal', { timeout: 15000 })

  // 1. Mês atual aberto, hoje marcado
  const title = (await p.locator('.rv-title').innerText()).replace(/\s+/g, ' ')
  check('abre no mês atual', title.includes(String(now.getFullYear())), title)
  check('hoje marcado no calendário', (await p.locator('.rmv-day--today').count()) === 1)

  // 2. Adicionar item do tipo Teste pelo + do dia
  const addDay = keyOf(new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate() + 2, 27)))
  await p.locator('.rv-add').click()
  await p.locator('.rid-cat:has-text("Teste")').click()
  await p.locator('.rid input[type=text]').fill(TITLE)
  await p.locator('.rid input[type=date]').first().fill(addDay)
  await p.locator('.rid-btn--primary').click()
  await p.waitForTimeout(900)
  let row = (await db.query(`SELECT e.id, e.category, e.date, m.key FROM "RoadmapEntry" e JOIN "RoadmapMonth" m ON m.id=e."monthId" WHERE e.title=$1`, [TITLE])).rows[0]
  check('item Teste gravado com category=test', row?.category === 'test' && row?.date === addDay, JSON.stringify(row))
  check('item aparece no calendário', (await p.locator(`.rmv-item:has-text(${JSON.stringify(TITLE)})`).count()) === 1)

  // 3. Editar: mudar a data para o mês seguinte leva o item junto
  await p.locator(`.rmv-item:has-text(${JSON.stringify(TITLE)})`).click()
  await p.locator('.rid input[type=date]').first().fill(keyOf(next))
  await p.locator('.rid-btn--primary').click()
  await p.waitForTimeout(1000)
  row = (await db.query(`SELECT e.id, e.date, m.key FROM "RoadmapEntry" e JOIN "RoadmapMonth" m ON m.id=e."monthId" WHERE e.title=$1`, [TITLE])).rows[0]
  check('item mudou de mês no banco', row?.key === nextKey && row?.date === keyOf(next), JSON.stringify(row))
  const titleNext = (await p.locator('.rv-title').innerText()).replace(/\s+/g, ' ')
  check('tela foi para o mês do item', (await p.locator(`.rmv-item:has-text(${JSON.stringify(TITLE)})`).count()) === 1, titleNext)

  // 4. Excluir (dois toques)
  await p.locator(`.rmv-item:has-text(${JSON.stringify(TITLE)})`).click()
  await p.locator('.rid-btn--danger').click()
  await p.locator('.rid-btn--danger').click()
  await p.waitForTimeout(800)
  check('item excluído', (await db.query(`SELECT 1 FROM "RoadmapEntry" WHERE title=$1`, [TITLE])).rowCount === 0)
  await p.keyboard.press('t')
  await p.waitForTimeout(400)
  check('tecla T volta para hoje', (await p.locator('.rmv-day--today').count()) === 1)

  // 5. Marco com janela de teste (pelo chip do próximo marco)
  const testStart = keyOf(new Date(new Date(ms.date + 'T12:00:00').getTime() - 7 * 864e5))
  await p.locator('.rv-next').click()
  await p.locator('.rid-check input').check()
  await p.locator('.rid-test input[type=date]').fill(testStart)
  await p.locator('.rid-btn--primary').click()
  await p.waitForTimeout(900)
  const msRow = (await db.query(`SELECT "testStart" FROM "RoadmapMilestone" WHERE id=$1`, [ms.id])).rows[0]
  check('janela de teste gravada', msRow?.testStart === testStart, JSON.stringify(msRow))
  if (ms.date.slice(0, 7) !== monthKey) {
    await p.locator('.rv-nav button[aria-label="Próximo mês"]').click()
    await p.waitForTimeout(400)
  }
  const band = p.locator(`.rmv-band:has-text(${JSON.stringify(ms.title)})`)
  check('faixa de teste no calendário', (await band.count()) >= 1)
  await p.screenshot({ path: path.join(__dirname, 'prints', 'roadmap-mes-teste.png') }).catch(() => {})

  // 6. Em teste agora com as plataformas
  if (testing) {
    await db.query(`INSERT INTO "ActivityTestCheck" ("activityId", platform) VALUES ($1, 'WEB') ON CONFLICT DO NOTHING`, [testing.id])
    await p.reload()
    await p.waitForSelector('.rmv-cal')
    const item = p.locator(`.rmv-testing li:has-text(${JSON.stringify(testing.title)})`)
    check('"Em teste agora" lista a tarefa', (await item.count()) === 1)
    check('Web marcado, iOS e Android não', (await item.locator('.rmv-platform--on').count()) === 1)
    await db.query(`DELETE FROM "ActivityTestCheck" WHERE "activityId"=$1`, [testing.id])
  } else check('"Em teste agora" (sem tarefa em teste no seed)', false)

  // 7. Objetivo do mês editável
  await p.keyboard.press('t')
  await p.locator('.rmv-goal-text').click()
  await p.locator('.rmv-goal-input').fill('Objetivo do roteiro e2e')
  await p.keyboard.press('Enter')
  await p.waitForTimeout(800)
  const mainNow = (await db.query(`SELECT main FROM "RoadmapMonth" WHERE "companyId"=$1 AND key=$2`, [company, monthKey])).rows[0]?.main
  check('objetivo gravado', mainNow === 'Objetivo do roteiro e2e', mainNow)
  await db.query(`UPDATE "RoadmapMonth" SET main=$3 WHERE "companyId"=$1 AND key=$2`, [company, monthKey, originalMain])

  // 8. Foco: adicionar e remover
  await p.locator('.rmv-focus-add input').fill(FOCUS)
  await p.locator('.rmv-focus-add button').click()
  await p.waitForTimeout(700)
  check('foco gravado', (await db.query(`SELECT 1 FROM "RoadmapFocus" WHERE text=$1`, [FOCUS])).rowCount === 1)
  await p.locator(`.rmv-focus li:has-text(${JSON.stringify(FOCUS)})`).hover()
  await p.locator(`.rmv-focus li:has-text(${JSON.stringify(FOCUS)}) button`).click()
  await p.waitForTimeout(700)
  check('foco removido', (await db.query(`SELECT 1 FROM "RoadmapFocus" WHERE text=$1`, [FOCUS])).rowCount === 0)

  // 9. Dia escolhido mostra o painel do dia
  await p.locator('.rmv-day--today .rmv-daynum').click()
  check('clique no dia abre o painel do dia', (await p.locator('.rmv-panel--day').count()) === 1)

  // 10. PDF local do mês: relatório montado e print chamado
  await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++ } })
  await p.locator('.rv-actions button:has-text("Exportar")').click()
  await p.locator('.dd-item:has-text("PDF de")').click()
  await p.waitForTimeout(500)
  const printed = await p.evaluate(() => ({ n: window.__printed, text: document.querySelector('.roadmap-print-root')?.textContent ?? '' }))
  check('PDF do mês monta o relatório e chama a impressão', printed.n === 1 && printed.text.includes('Agenda'), `print=${printed.n}`)

  // 11. Visão Ano: faixa de teste no marco e entrega abre a tarefa
  await p.locator('.rv-seg-btn:has-text("Ano")').click()
  await p.waitForSelector('.ryv-board')
  check('ano abre no trimestre atual', (await p.locator('.ryv-zoom-btn--on').innerText()).trim().startsWith('Q'))
  check('faixa de teste na linha do tempo', (await p.locator('.ryv-band').count()) >= 1)
  const pinsOverlap = await p.evaluate(() => {
    const r = [...document.querySelectorAll('.ryv-pin, .ryv-dot')].map((e) => e.getBoundingClientRect())
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
      const a = r[i], c = r[j]
      if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) return true
    }
    return false
  })
  check('rótulos da linha do tempo não se sobrepõem', !pinsOverlap)
  await p.screenshot({ path: path.join(__dirname, 'prints', 'roadmap-ano-teste.png') }).catch(() => {})

  // 11b. Novo marco pela visão Ano e excluir pelo pino
  const MS = 'Marco do roteiro e2e'
  await db.query(`DELETE FROM "RoadmapMilestone" WHERE title=$1`, [MS])
  await p.locator('.ryv-add').click()
  await p.locator('.rid input[type=text]').fill(MS)
  await p.locator('.rid input[type=date]').first().fill(keyOf(new Date(now.getTime() + 10 * 864e5)))
  await p.locator('.rid-btn--primary').click()
  await p.waitForTimeout(900)
  check('novo marco gravado', (await db.query(`SELECT 1 FROM "RoadmapMilestone" WHERE title=$1 AND "companyId"=$2`, [MS, company])).rowCount === 1)
  await p.locator(`.ryv-pin:has-text(${JSON.stringify(MS)})`).click()
  await p.locator('.rid-btn--danger').click()
  await p.locator('.rid-btn--danger').click()
  await p.waitForTimeout(800)
  check('marco excluído pelo pino', (await db.query(`SELECT 1 FROM "RoadmapMilestone" WHERE title=$1`, [MS])).rowCount === 0)

  await p.locator('.ryv-dot').first().click()
  await p.waitForTimeout(800)
  check('entrega abre a tarefa no painel do board', /\/tasks\/[^/?]+\?.*task=/.test(p.url()), p.url())

  // 12. Celular: sem rolagem lateral, dia filtra, ano vira lista
  const m = await b.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'pt-BR' })
  await m.addInitScript(([t, co]) => {
    localStorage.setItem('token', t); localStorage.setItem('activeCompany', co)
    localStorage.setItem('onboarding.completed', '1'); localStorage.setItem('onboarding.autoShown', '1')
    localStorage.setItem('ui.idlePermissionPrompt', 'done'); localStorage.setItem('roadmap.view', 'month')
  }, [token, company])
  const mp = await m.newPage()
  await mp.goto(WEB + '/roadmap')
  await mp.waitForSelector('.rmv-cal')
  const sw = await mp.evaluate(() => Math.max(document.documentElement.scrollWidth, document.querySelector('main')?.scrollWidth ?? 0))
  check('375px sem rolagem lateral', sw <= 375, `scrollWidth=${sw}`)
  await mp.locator('.rmv-day--today .rmv-daynum').tap()
  check('375px: tocar no dia abre o dia', (await mp.locator('.rmv-panel--day').count()) === 1)
  await mp.locator('.rv-seg-btn:has-text("Ano")').tap()
  await mp.waitForSelector('.ryv-list')
  const firstMonth = await mp.locator('.ryv-lmonth').first().getAttribute('data-current')
  check('375px: ano em lista começando no mês atual', firstMonth === 'true')
  await m.close()

  // 13. Link público: sem tarefa e sem "Em teste agora"
  const auth = { Authorization: 'Bearer ' + token, 'x-company-id': company }
  const link = await (await fetch(`${API}/share/roadmap/${now.getFullYear()}`, { method: 'POST', headers: auth })).json()
  const tokenPub = (link.path ?? '').split('/').pop()
  const pub = await (await fetch(`${API}/public/roadmap/${tokenPub}`)).json()
  const leaks = JSON.stringify(pub).includes('"deliveries":[{') || 'inTesting' in pub
  check('link público não leva tarefa nem Em teste', Boolean(tokenPub) && !leaks)

  // 14. API sem a coluna nova (deploy antes da migration): lê e recusa a janela
  await db.query(`ALTER TABLE "RoadmapMilestone" DROP COLUMN "testStart"`)
  try {
    const read = await fetch(`${API}/company/${company}/roadmap`, { headers: auth })
    const body = await read.json()
    check('sem a coluna: timeline lê (200, testStart null)', read.status === 200 && (body.milestones ?? []).every((x) => x.testStart === null), `status=${read.status}`)
    const w = await fetch(`${API}/company/${company}/roadmap/milestones/${ms.id}`, { method: 'PATCH', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ testStart: testStart }) })
    const wb = await w.json()
    check('sem a coluna: pedir janela dá 503 em PT-BR', w.status === 503 && /migration/.test(wb.message ?? ''), `status=${w.status}`)
    const t2 = await fetch(`${API}/company/${company}/roadmap/milestones/${ms.id}`, { method: 'PATCH', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ title: ms.title }) })
    check('sem a coluna: editar título segue 200', t2.status === 200, `status=${t2.status}`)
  } finally {
    await db.query(`ALTER TABLE "RoadmapMilestone" ADD COLUMN IF NOT EXISTS "testStart" TEXT`)
  }

  // Devolve o marco sem janela (o processo da API volta a ler a coluna no restart).
  await db.query(`UPDATE "RoadmapMilestone" SET "testStart"=NULL WHERE id=$1`, [ms.id])
  check('sem erro de página', errs.length === 0, errs.join(' | '))
  await b.close()
  await db.end()
  console.log(results.join('\n'))
  const fails = results.filter((r) => r.startsWith('FALHA')).length
  console.log(`\n${results.length - fails}/${results.length} OK`)
  process.exit(fails ? 1 : 0)
})().catch((e) => { console.error('ERRO', e); process.exit(1) })
