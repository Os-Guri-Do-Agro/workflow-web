// Captura telas do work-flow contra a API local do harness.
// Uso: node shot.mjs <saida-dir> [email] [tema] [rotas separadas por virgula]
// Rotas especiais: @tasks (mês corrente da PetJourney), @task (detalhe da 1a tarefa), @note (1a nota)
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const out = process.argv[2] ?? 'shots'
const email = process.argv[3] ?? 'nicolas@nevo.test'
const theme = process.argv[4] ?? 'light'
const only = process.argv[5] ? process.argv[5].split(',') : null
const API = 'http://127.0.0.1:3599'
const WEB = process.env.WEB ?? 'http://localhost:5174'
mkdirSync(out, { recursive: true })

const seed = JSON.parse(readFileSync(new URL('./seed-out.json', import.meta.url)))
const login = await fetch(API + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'nevo1234' }) }).then((r) => r.json())
const token = login.accessToken
const auth = { Authorization: 'Bearer ' + token, 'x-company-id': seed.companies.pet }
const quarters = await fetch(`${API}/company/${seed.companies.pet}/quarters`, { headers: auth }).then((r) => r.json())
const nowMonth = new Date().getMonth() + 1
let monthId = null
for (const qt of quarters) for (const m of qt.months ?? []) if (m.number === nowMonth) monthId = m.id
const board = monthId ? await fetch(`${API}/month/${monthId}/board`, { headers: auth }).then((r) => r.json()).catch(() => null) : null
const firstTask = JSON.stringify(board ?? {}).match(/"id":"(c[a-z0-9]{24})","title":"Tela de cadastro/)?.[1]
const notes = await fetch(`${API}/notes`, { headers: auth }).then((r) => r.json()).catch(() => [])
const noteId = (Array.isArray(notes) ? notes : notes.items ?? notes.data ?? [])[0]?.id

const ROUTES = {
  home: '/',
  board: '/board',
  tasks: monthId ? `/tasks/${monthId}` : '/board',
  task: monthId && firstTask ? `/tasks/${monthId}/${firstTask}` : null,
  roadmap: '/roadmap',
  notes: '/notes',
  note: noteId ? `/notes/${noteId}` : null,
  time: '/time',
  settings: '/settings',
}
const ALL_WIDTHS = [
  { name: 'm375', width: 375, height: 812, mobile: true },
  { name: 't768', width: 768, height: 1024, mobile: true },
  { name: 'd1440', width: 1440, height: 900, mobile: false },
]
const WIDTHS = process.env.VP ? ALL_WIDTHS.filter((w) => process.env.VP.split(',').includes(w.name)) : ALL_WIDTHS

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const report = []
for (const vp of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.mobile ? 2 : 1, isMobile: vp.mobile, hasTouch: vp.mobile, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', reducedMotion: 'reduce' })
  await ctx.addInitScript(([t, c, th]) => {
    localStorage.setItem('token', t)
    localStorage.setItem('activeCompany', c)
    localStorage.setItem('ui.theme', th)
    localStorage.setItem('onboarding.autoShown', '1')
    localStorage.setItem('onboarding.completed', '1')
    localStorage.setItem('ui.idlePermissionPrompt', 'done')
  }, [token, seed.companies.pet, theme])
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)))
  for (const [key, route] of Object.entries(ROUTES)) {
    if (!route || (only && !only.includes(key))) continue
    errors.length = 0
    await page.goto(WEB + route, { waitUntil: 'domcontentloaded' })
    await page.addStyleTag({ content: '#__vue-devtools-container__,.vue-devtools__anchor{display:none!important}' }).catch(() => {})
    await page.waitForTimeout(3500)
    if (process.env.TALL) {
      // O conteúdo rola dentro do <main>: cresce o viewport até caber tudo (teto 4000px).
      const extra = await page.evaluate(() => {
        const main = document.querySelector('.m-main, .main')
        return main ? Math.max(0, main.scrollHeight - main.clientHeight) : 0
      })
      if (extra > 0) {
        await page.setViewportSize({ width: vp.width, height: Math.min(vp.mobile ? 1900 : 4000, vp.height + extra) })
        await page.waitForTimeout(600)
      }
    }
    const metrics = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      scrollH: document.documentElement.scrollHeight,
      smallTargets: [...document.querySelectorAll('button, a, [role=button], input, select')].filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && (r.width < 32 || r.height < 32)
      }).length,
    }))
    const file = path.join(out, `${key}-${vp.name}-${theme}.png`)
    await page.screenshot({ path: file, fullPage: true })
    report.push({ key, vp: vp.name, ...metrics, hScroll: metrics.scrollW > metrics.clientW + 1, errors: [...errors] })
    if (process.env.TALL) await page.setViewportSize({ width: vp.width, height: vp.height })
  }
  await ctx.close()
}
await browser.close()
console.log(JSON.stringify(report, null, 1))
