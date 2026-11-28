// Painel de agendamento de ponta a ponta contra a API REAL do harness (sem
// simulação): primeiro acesso, tipo de reunião, horários, data específica,
// página (frase, pausar, ligar de novo) e a página pública. O Google não existe
// no harness, então a página nasce "fora do ar": é o estado que o roteiro
// confere do lado público. Apaga a página no fim (o banco volta como estava).
//
// Uso: node booking-real-e2e.mjs   (env: WEB, API, HARNESS_DB, SHOTS)
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync } from 'node:fs'
import pg from 'pg'

const WEB = process.env.WEB ?? 'http://localhost:5199'
const API = process.env.API ?? 'http://127.0.0.1:3671'
const DB = process.env.HARNESS_DB ?? 'wf_bk'
const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const SLUG = `teste-${String(Date.now()).slice(-6)}`

let ok = 0
let fail = 0
const check = (label, cond, extra) => {
  if (cond) {
    ok++
    console.log(`  OK    ${label}`)
  } else {
    fail++
    console.log(`  FALHA ${label}`, extra ?? '')
  }
}

const seed = JSON.parse(readFileSync(new URL(`./seed-out.${DB}.json`, import.meta.url)))
const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
await db.connect()
const userId = seed.users.nicolas
await db.query('DELETE FROM "BookingPage" WHERE "userId" = $1', [userId])

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'nicolas@nevo.test', password: 'nevo1234' }),
}).then((r) => r.json())

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
await ctx.addInitScript(([t, c]) => {
  localStorage.setItem('token', t)
  localStorage.setItem('activeCompany', c)
  localStorage.setItem('ui.theme', 'dark')
  localStorage.setItem('onboarding.autoShown', '1')
  localStorage.setItem('onboarding.completed', '1')
  localStorage.setItem('ui.idlePermissionPrompt', 'done')
}, [login.accessToken, seed.companies.pet])
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const bad = []
page.on('response', (r) => {
  if (r.url().startsWith(API) && r.url().includes('/booking') && r.status() >= 400) bad.push(`${r.status()} ${r.url()}`)
})
const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` })
const dbPage = async () => (await db.query('SELECT * FROM "BookingPage" WHERE "userId" = $1', [userId])).rows[0]

try {
  console.log('\n── Primeiro acesso')
  await page.goto(`${WEB}/agendamentos`)
  await page.getByRole('heading', { name: 'Crie sua página de agendamento' }).waitFor()
  check('mostra os dois passos', (await page.locator('.ps__step').count()) === 2)
  check('passo do Google com o botão de conectar', await page.getByRole('button', { name: 'Conectar Google Calendar' }).isVisible())
  const slugInput = page.locator('.ps__form .bk-affix input')
  await slugInput.fill(SLUG)
  await page.locator('.ps__form .bk-hint--ok').waitFor()
  await page.getByRole('button', { name: 'Criar minha página' }).click()
  await page.locator('.bv-sum').waitFor()
  check('página criada no banco', (await dbPage())?.slug === SLUG)
  check('resumo diz "Fora do ar" sem Google', (await page.locator('.bv-sum .bk-chip').innerText()).includes('Fora do ar'))
  check('aviso do Google aparece', await page.getByText('Conecte seu Google Calendar').isVisible())
  check('link mostra o endereço novo', (await page.locator('.bv-sum__url').innerText()).endsWith(`/agendar/${SLUG}`))
  await shot('1-criada')

  console.log('\n── Tipo de reunião')
  await page.getByRole('tab', { name: /Tipos de reunião/ }).click()
  await page.getByRole('button', { name: 'Novo tipo' }).click()
  await page.locator('.bk-dialog input.bk-input').first().fill('Mentoria de produto')
  await page.getByRole('radio', { name: '45 min' }).click()
  await page.getByRole('button', { name: 'Criar' }).click()
  await page.locator('.etp__item', { hasText: 'Mentoria de produto' }).waitFor()
  // O diálogo sai com transição: clicar antes cai no fundo escurecido.
  await page.locator('.bk-dialog').waitFor({ state: 'detached' })
  const card = page.locator('.etp__item', { hasText: 'Mentoria de produto' })
  check('cartão novo com o selo de 45 min', (await card.locator('.etp__dur').innerText()).replace(/\s+/g, ' ').trim() === '45 min')
  const types = (await db.query('SELECT t.* FROM "BookingEventType" t JOIN "BookingPage" p ON p.id = t."pageId" WHERE p."userId" = $1 AND t."archivedAt" IS NULL', [userId])).rows
  check('dois tipos no banco (o padrão e o novo)', types.length === 2, types.map((t) => t.title))
  check('o novo tem 45 min', types.find((t) => t.title === 'Mentoria de produto')?.durationMin === 45)
  await card.locator('.bk-switch input').click({ force: true })
  await card.getByText('Desligado, fora da sua página').waitFor()
  const off = (await db.query('SELECT active FROM "BookingEventType" WHERE title = $1', ['Mentoria de produto'])).rows[0]
  check('desligar grava no banco', off?.active === false)
  check('aba mostra 2 tipos', (await page.getByRole('tab', { name: /Tipos de reunião/ }).innerText()).includes('2'))
  await shot('2-tipos')

  console.log('\n── Horários')
  await page.getByRole('tab', { name: /Horários/ }).click()
  check('resumo da semana', (await page.locator('.av__total').innerText()).includes('40 h por semana'))
  await page.locator('.av__day', { hasText: 'Sábado' }).locator('input[type=checkbox]').check({ force: true })
  await page.locator('.av__bar').waitFor()
  check('resumo muda com o sábado', (await page.locator('.av__total').innerText()).includes('48 h por semana · 6 dias'))
  const future = new Date(Date.now() + 10 * 86400e3).toISOString().slice(0, 10)
  await page.locator('.av__date').fill(future)
  await page.getByRole('radio', { name: 'Dia livre' }).click()
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click()
  check('data específica na lista', (await page.locator('.av__override').count()) === 1)
  await page.getByRole('button', { name: 'Salvar horários' }).click()
  await page.locator('.av__bar').waitFor({ state: 'detached' })
  const saved = await dbPage()
  check('sábado gravado', saved.weeklyHours.some((r) => r.day === 6))
  check('data específica gravada como dia livre', saved.dateOverrides.some((o) => o.date === future && o.intervals.length === 0))
  await page.reload()
  await page.locator('.av__day').first().waitFor()
  check('depois de recarregar, sem alteração pendente', !(await page.locator('.av__bar').isVisible()))
  check('sábado continua ligado', await page.locator('.av__day', { hasText: 'Sábado' }).locator('input[type=checkbox]').isChecked())
  await shot('3-horarios')

  console.log('\n── Página')
  await page.getByRole('tab', { name: /Página/ }).click()
  const headline = page.locator('input[placeholder="Ex.: CEO da Fluviotec"]')
  await headline.fill('Diretor de produto · Nevo')
  check('prévia acompanha a frase', (await page.locator('.pv__headline').innerText()) === 'Diretor de produto · Nevo')
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.pset__actions .bk-btn--primary')?.disabled === true)
  check('frase gravada', (await dbPage()).headline === 'Diretor de produto · Nevo')
  await page.locator('.pset__live input').uncheck({ force: true })
  check('prévia mostra "Pausada"', await page.locator('.pv__paused').isVisible())
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await page.locator('.bv__paused').waitFor()
  check('pausar grava no banco', (await dbPage()).active === false)
  check('resumo diz "Fora do ar" (Google pesa mais que a pausa)', (await page.locator('.bv-sum .bk-chip').innerText()).includes('Fora do ar'))
  await shot('4-pausada')
  await page.getByRole('button', { name: 'Ligar agora' }).click()
  await page.locator('.bv__paused').waitFor({ state: 'detached' })
  check('"Ligar agora" religa no banco', (await dbPage()).active === true)

  console.log('\n── Página pública (API real)')
  const pub = await fetch(`${API}/public/booking/pages/${SLUG}`).then((r) => r.json())
  check('API pública manda avatarUrl', 'avatarUrl' in (pub.host ?? {}), pub.host)
  check('API pública manda a frase', pub.host?.headline === 'Diretor de produto · Nevo')
  check('só o tipo ativo aparece', pub.eventTypes?.length === 1, pub.eventTypes)
  check('sem Google não aceita', pub.accepting === false)
  const visitor = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await visitor.goto(`${WEB}/agendar/${SLUG}`)
  await visitor.getByText('Agenda temporariamente indisponível').waitFor()
  check('visitante vê o nome do anfitrião', await visitor.getByText('Nicolas Castela').first().isVisible())
  check('visitante vê a frase', await visitor.getByText('Diretor de produto · Nevo').isVisible())
  if (SHOTS) await visitor.screenshot({ path: `${SHOTS}/5-publica.png` })
  await visitor.close()

  check('nenhuma resposta 4xx/5xx do agendamento', bad.length === 0, bad)
  check('nenhum erro de JS', errors.length === 0, errors)
} catch (e) {
  fail++
  console.log('  FALHA (exceção)', e.message.split('\n')[0])
  await shot('erro')
} finally {
  await db.query('DELETE FROM "BookingPage" WHERE "userId" = $1', [userId])
  const left = (await db.query('SELECT count(*)::int AS n FROM "BookingPage" WHERE "userId" = $1', [userId])).rows[0].n
  console.log(`\n  limpeza: ${left === 0 ? 'página apagada' : `SOBROU ${left}`}`)
  await db.end()
  await browser.close()
}
console.log(`\n${ok} ok, ${fail} falha(s)`)
process.exit(fail ? 1 : 0)
