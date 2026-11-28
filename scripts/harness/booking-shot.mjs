// Capturas do agendamento (painel /agendamentos e páginas públicas) com a API
// de agendamento SIMULADA no navegador (page.route): cobre os estados que o
// Google real não deixa montar sob demanda (reunião acontecendo agora, Google
// recusando a autorização, página pausada, horário tomado na hora de marcar).
// O resto do app (login, moldura, empresa) fala com a API local do harness.
//
// Uso:
//   node booking-shot.mjs <saida> [tema] [cenarios,separados]
//   VP=d1440,m375 node booking-shot.mjs prints/booking dark
// Env: WEB (Vite, padrão 5199), API (padrão 3671), HARNESS_DB (seed-out.<db>.json).
import { chromium } from 'playwright-core'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const out = process.argv[2] ?? 'prints/booking'
const theme = process.argv[3] ?? 'dark'
const only = process.argv[4] ? process.argv[4].split(',') : null
const WEB = process.env.WEB ?? 'http://localhost:5199'
const API = process.env.API ?? 'http://127.0.0.1:3671'
const DB = process.env.HARNESS_DB ?? 'wf_bk'
mkdirSync(out, { recursive: true })

const seed = JSON.parse(readFileSync(new URL(`./seed-out.${DB}.json`, import.meta.url)))
const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'nicolas@nevo.test', password: 'nevo1234' }),
}).then((r) => r.json())
const token = login.accessToken
if (!token) throw new Error(`login falhou: ${JSON.stringify(login)}`)

// ─── Dados simulados ─────────────────────────────────────────────────────────

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const SP_OFFSET = 3 * HOUR // São Paulo, sem horário de verão

/** Seg-sex, 09-12 e 13-18 em São Paulo, de 30 em 30, a partir de agora + 4 h. */
function slots(start, end, durationMin = 30) {
  const list = []
  const from = Date.now() + 4 * HOUR
  for (let t = Math.ceil(start / (30 * MIN)) * 30 * MIN; t < end; t += 30 * MIN) {
    const local = new Date(t - SP_OFFSET)
    const wd = local.getUTCDay()
    const min = local.getUTCHours() * 60 + local.getUTCMinutes()
    const fits = (a, b) => min >= a && min + durationMin <= b
    const open = fits(540, 720) || fits(780, 1080)
    const busy = local.getUTCDate() % 4 === 0 && min >= 600 && min < 720
    if (wd >= 1 && wd <= 5 && open && !busy && t > from) list.push(new Date(t).toISOString())
  }
  return list
}

/** Instante "dia + hh:mm" em São Paulo. */
function at(dayOffset, hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const now = new Date(Date.now() - SP_OFFSET)
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset, h, m)
  return new Date(base + SP_OFFSET).toISOString()
}

const BASE = `${WEB}/agendar`

function eventType(over) {
  return {
    id: over.slug,
    description: null,
    durationMin: 30,
    slotStepMin: 30,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    minNoticeMin: 240,
    maxDaysAhead: 60,
    dailyLimit: null,
    active: true,
    position: 0,
    upcomingCount: 0,
    publicUrl: `${BASE}/nicolas/${over.slug}`,
    ...over,
  }
}

function freshState() {
  const nowLive = Date.now() - 10 * MIN
  return {
    google: { connected: true, email: 'nicolas.castela@gmail.com', healthy: true },
    page: {
      id: 'p1',
      slug: 'nicolas',
      timezone: 'America/Sao_Paulo',
      displayName: null,
      headline: 'Diretor de produto · Nevo',
      active: true,
      weeklyHours: [1, 2, 3, 4, 5].flatMap((day) => [
        { day, start: '09:00', end: '12:00' },
        { day, start: '13:00', end: '18:00' },
      ]),
      dateOverrides: [
        { date: at(9, '12:00').slice(0, 10), intervals: [] },
        { date: at(16, '12:00').slice(0, 10), intervals: [{ start: '14:00', end: '17:00' }] },
      ],
      publicUrl: `${BASE}/nicolas`,
      eventTypes: [
        eventType({ slug: '30min', title: 'Conversa de 30 minutos', upcomingCount: 4, description: 'Uma conversa rápida para entender o seu caso e ver se o Nevo faz sentido para o time.' }),
        eventType({ slug: 'demo', title: 'Demonstração do Nevo', durationMin: 60, slotStepMin: 60, minNoticeMin: 1440, dailyLimit: 3, bufferAfterMin: 15, upcomingCount: 1, position: 1, description: 'Apresentação guiada do produto, com espaço para perguntas.' }),
        eventType({ slug: 'consultoria', title: 'Consultoria técnica', durationMin: 90, active: false, position: 2 }),
      ],
    },
    bookings: [
      booking('b0', nowLive, 30, 'Mariana Lopes', 'mariana@fluviotec.com.br', 'America/Sao_Paulo', '30min', { notes: 'Quero entender como funciona a integração com o Google Agenda para o time comercial.' }),
      booking('b1', Date.parse(at(0, '16:00')), 30, 'João Pereira', 'joao@petjourney.com', 'Europe/Lisbon', '30min'),
      booking('b2', Date.parse(at(1, '09:30')), 60, 'Emílio Ávila', 'emilio@fluviotec.com.br', 'America/Sao_Paulo', 'demo', { rescheduleCount: 1, notes: 'Demonstração para a diretoria. Seremos 4 pessoas.' }),
      booking('b3', Date.parse(at(1, '14:00')), 30, 'Sophie Martin', 'sophie@atelier.fr', 'Europe/Paris', '30min'),
      booking('b4', Date.parse(at(3, '10:00')), 30, 'Carlos Henrique Albuquerque de Souza', 'carlos.henrique@empresa-com-nome-longo.com.br', 'America/Manaus', '30min'),
      booking('p1', Date.parse(at(-1, '10:00')), 30, 'Rafaela Nunes', 'rafaela@cliente.com', 'America/Sao_Paulo', '30min', { past: true }),
      booking('p2', Date.parse(at(-2, '15:00')), 60, 'Bruno Teixeira', 'bruno@agencia.io', 'America/New_York', 'demo', { past: true }),
      booking('c1', Date.parse(at(2, '11:00')), 30, 'Pedro Alves', 'pedro@exemplo.com', 'America/Sao_Paulo', '30min', { canceled: 'INVITEE', reason: 'Surgiu uma viagem, remarco semana que vem.' }),
      booking('c2', Date.parse(at(4, '15:30')), 60, 'Lia Campos', 'lia@estudio.com', 'America/Sao_Paulo', 'demo', { canceled: 'HOST', reason: '' }),
    ],
  }
}

function booking(id, start, duration, name, email, tz, typeSlug, extra = {}) {
  const titles = { '30min': 'Conversa de 30 minutos', demo: 'Demonstração do Nevo' }
  return {
    id,
    status: extra.canceled ? 'CANCELED' : 'CONFIRMED',
    startAt: new Date(start).toISOString(),
    endAt: new Date(start + duration * MIN).toISOString(),
    inviteeName: name,
    inviteeEmail: email,
    inviteeTimezone: tz,
    notes: extra.notes ?? null,
    meetLink: 'https://meet.google.com/abc-defg-hij',
    rescheduleCount: extra.rescheduleCount ?? 0,
    canceledAt: extra.canceled ? new Date().toISOString() : null,
    canceledBy: extra.canceled ?? null,
    cancelReason: extra.reason || null,
    createdAt: new Date(Date.now() - 3 * DAY).toISOString(),
    eventType: { id: typeSlug, title: titles[typeSlug], slug: typeSlug, durationMin: duration },
    _past: !!extra.past,
  }
}

const host = { name: 'Nicolas Castela', headline: 'Diretor de produto · Nevo', avatarUrl: '/avatars/nicolas.webp' }

function publicBooking(state, b, status = 'CONFIRMED') {
  return {
    status,
    startAt: b.startAt,
    endAt: b.endAt,
    meetLink: 'https://meet.google.com/abc-defg-hij',
    inviteeName: b.inviteeName,
    inviteeEmail: b.inviteeEmail,
    inviteeTimezone: 'America/Sao_Paulo',
    notes: null,
    manageToken: 'tok',
    canceledAt: status === 'CANCELED' ? new Date().toISOString() : null,
    canceledBy: status === 'CANCELED' ? 'INVITEE' : null,
    cancelReason: status === 'CANCELED' ? 'Surgiu uma viagem.' : null,
    canModify: status === 'CONFIRMED',
    host: { ...host, timezone: 'America/Sao_Paulo' },
    page: { slug: 'nicolas' },
    eventType: publicType(state.page.eventTypes[0]),
  }
}

function publicType(t) {
  return { slug: t.slug, title: t.title, description: t.description, durationMin: t.durationMin, maxDaysAhead: t.maxDaysAhead }
}

function overview(state) {
  return { page: state.page, google: state.google, suggestedSlug: 'nicolas-castela', publicBaseUrl: BASE }
}

// ─── Rotas simuladas ─────────────────────────────────────────────────────────

async function mockBooking(page, state, opts = {}) {
  await page.route(/\/(public\/)?booking\//, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (!url.href.startsWith(API)) return route.continue()
    const p = url.pathname
    const method = req.method()
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    const body = () => { try { return JSON.parse(req.postData() || '{}') } catch { return {} } }
    if (opts.delay) await new Promise((r) => setTimeout(r, opts.delay))

    // Painel
    if (p === '/booking/page' && method === 'GET') return json(overview(state))
    if (p === '/booking/page' && method === 'PUT') {
      const input = body()
      if (!state.page) {
        const fresh = freshState().page
        state.page = { ...fresh, slug: input.slug, timezone: input.timezone, publicUrl: `${BASE}/${input.slug}`, eventTypes: [fresh.eventTypes[0]] }
      } else {
        Object.assign(state.page, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)))
        state.page.publicUrl = `${BASE}/${state.page.slug}`
      }
      return json(overview(state))
    }
    if (p === '/booking/page/slug-check') {
      const slug = url.searchParams.get('slug')
      const taken = ['admin', 'nevo', 'ana'].includes(slug)
      return json({ slug, available: !taken && slug.length >= 3, reason: taken ? 'Esse endereço já está em uso.' : slug.length < 3 ? 'Use pelo menos 3 caracteres.' : null })
    }
    if (p === '/booking/event-types' && method === 'POST') {
      const input = body()
      state.page.eventTypes.push(eventType({ ...input, slug: input.slug || 'novo', id: `t${Date.now()}`, position: state.page.eventTypes.length }))
      return json(overview(state))
    }
    if (p.startsWith('/booking/event-types/')) {
      const id = decodeURIComponent(p.split('/').pop())
      const t = state.page.eventTypes.find((x) => x.id === id)
      if (method === 'DELETE') state.page.eventTypes = state.page.eventTypes.filter((x) => x.id !== id)
      else if (t) Object.assign(t, body())
      return json(overview(state))
    }
    if (p === '/booking/bookings') {
      const scope = url.searchParams.get('scope')
      const now = Date.now()
      const list = state.bookings.filter((b) =>
        scope === 'canceled' ? b.status === 'CANCELED' : b.status === 'CONFIRMED' && (scope === 'past' ? Date.parse(b.endAt) <= now : Date.parse(b.endAt) > now),
      )
      list.sort((a, b) => (scope === 'past' ? b.startAt.localeCompare(a.startAt) : a.startAt.localeCompare(b.startAt)))
      return json(list.map(({ _past, ...b }) => b))
    }
    if (/^\/booking\/bookings\/[^/]+\/cancel$/.test(p)) {
      const b = state.bookings.find((x) => x.id === p.split('/')[3])
      if (b) Object.assign(b, { status: 'CANCELED', canceledBy: 'HOST', cancelReason: body().reason ?? null })
      return json(b)
    }

    // Público
    const types = state.page.eventTypes.filter((t) => t.active)
    if (p === '/public/booking/pages/nicolas') return json({ slug: 'nicolas', host, timezone: 'America/Sao_Paulo', accepting: state.google.healthy, eventTypes: types.map(publicType) })
    if (p === '/public/booking/pages/um-tipo') return json({ slug: 'um-tipo', host, timezone: 'America/Sao_Paulo', accepting: true, eventTypes: [publicType(types[0])] })
    const m = p.match(/^\/public\/booking\/pages\/(nicolas|pausada|um-tipo)\/([^/]+)(\/slots|\/book)?$/)
    if (m) {
      const t = state.page.eventTypes.find((x) => x.slug === m[2]) ?? state.page.eventTypes[0]
      if (m[3] === '/slots') return json({ slots: slots(Date.parse(url.searchParams.get('start')), Date.parse(url.searchParams.get('end')), t.durationMin) })
      if (m[3] === '/book') {
        if (opts.takenOnce && !state.tookOnce) { state.tookOnce = true; return json({ statusCode: 409, message: 'Esse horário acabou de ser reservado. Escolha outro.' }, 409) }
        const input = body()
        return json(publicBooking(state, { startAt: input.startAt, endAt: new Date(Date.parse(input.startAt) + t.durationMin * MIN).toISOString(), inviteeName: input.name, inviteeEmail: input.email }))
      }
      return json({ slug: m[1], host, timezone: 'America/Sao_Paulo', accepting: m[1] !== 'pausada', eventType: publicType(t) })
    }
    if (p.startsWith('/public/booking/manage/')) {
      const [, , , , tok, action] = p.split('/')
      const b = { startAt: at(2, '10:00'), endAt: at(2, '10:30'), inviteeName: 'Mariana Lopes', inviteeEmail: 'mariana@fluviotec.com.br' }
      if (action === 'slots') return json({ slots: slots(Date.parse(url.searchParams.get('start')), Date.parse(url.searchParams.get('end'))) })
      if (action === 'cancel') return json(publicBooking(state, b, 'CANCELED'))
      if (action === 'reschedule') return json(publicBooking(state, { ...b, startAt: body().startAt, endAt: new Date(Date.parse(body().startAt) + 30 * MIN).toISOString() }))
      if (tok === 'cancelada') return json(publicBooking(state, b, 'CANCELED'))
      if (tok === 'passada') return json({ ...publicBooking(state, { ...b, startAt: at(-1, '10:00'), endAt: at(-1, '10:30') }), canModify: false })
      return json(publicBooking(state, b))
    }
    return json({ statusCode: 404, message: 'Página de agendamento não encontrada.' }, 404)
  })
}

// ─── Cenários ────────────────────────────────────────────────────────────────

const wait = (page, ms = 500) => page.waitForTimeout(ms)
const pickFirstSlot = async (page) => {
  await page.locator('.sp__slot').first().waitFor()
  await page.locator('.sp__slot').nth(2).click()
}

const SCENARIOS = {
  // Públicas
  'pub-lista': { url: '/agendar/nicolas' },
  'pub-horario': { url: '/agendar/nicolas/30min', run: async (p) => { await pickFirstSlot(p) } },
  'pub-dados': { url: '/agendar/nicolas/30min', run: async (p) => { await pickFirstSlot(p); await p.locator('.sp__confirm:visible, .sp__mobile-confirm:visible').first().click(); await p.fill('input[autocomplete=name]', 'Mariana Lopes'); await p.fill('input[type=email]', 'mariana@fluviotec.com.br') } },
  'pub-confirmada': { url: '/agendar/nicolas/30min', run: async (p) => { await pickFirstSlot(p); await p.locator('.sp__confirm:visible, .sp__mobile-confirm:visible').first().click(); await p.fill('input[autocomplete=name]', 'Mariana Lopes'); await p.fill('input[type=email]', 'mariana@fluviotec.com.br'); await p.click('button[type=submit]'); await p.locator('.ev-done').waitFor() } },
  'pub-tomado': { url: '/agendar/nicolas/30min', opts: { takenOnce: true }, run: async (p) => { await pickFirstSlot(p); await p.locator('.sp__confirm:visible, .sp__mobile-confirm:visible').first().click(); await p.fill('input[autocomplete=name]', 'Mariana Lopes'); await p.fill('input[type=email]', 'mariana@fluviotec.com.br'); await p.click('button[type=submit]'); await p.locator('.ev-notice').waitFor() } },
  'pub-gerenciar': { url: '/reuniao/tok' },
  'pub-remarcar': { url: '/reuniao/tok', run: async (p) => { await p.getByRole('button', { name: 'Remarcar' }).click(); await pickFirstSlot(p) } },
  'pub-cancelar': { url: '/reuniao/tok', run: async (p) => { await p.getByRole('button', { name: 'Cancelar', exact: true }).click() } },
  'pub-remarcou': { url: '/reuniao/tok', run: async (p) => { await p.getByRole('button', { name: 'Remarcar' }).click(); await pickFirstSlot(p); await p.locator('.sp__confirm:visible, .sp__mobile-confirm:visible').first().click(); await p.getByText('Reunião remarcada.').waitFor() } },
  'pub-cancelou': { url: '/reuniao/tok', run: async (p) => { await p.getByRole('button', { name: 'Cancelar', exact: true }).click(); await p.fill('textarea', 'Mudou a agenda.'); await p.getByRole('button', { name: 'Cancelar reunião' }).click(); await p.getByText('Esta reunião foi cancelada').waitFor() } },
  'pub-cancelada': { url: '/reuniao/cancelada' },
  'pub-passada': { url: '/reuniao/passada' },
  'pub-pausada': { url: '/agendar/pausada/30min' },
  'pub-404': { url: '/agendar/nao-existe' },
  'pub-carregando': { url: '/agendar/nicolas/30min', opts: { delay: 4000 }, settle: 900 },
  // Painel
  'host-reunioes': { url: '/agendamentos', host: true },
  'host-passadas': { url: '/agendamentos', host: true, run: async (p) => { await p.getByRole('tab', { name: /Passadas/ }).click() } },
  'host-canceladas': { url: '/agendamentos', host: true, run: async (p) => { await p.getByRole('tab', { name: /Canceladas/ }).click() } },
  'host-assunto': { url: '/agendamentos', host: true, run: async (p) => { await p.locator('.bp__notes').first().click() } },
  'host-cancelar': { url: '/agendamentos', host: true, run: async (p) => { await p.locator('[data-cancel]').first().click() } },
  'host-tipos': { url: '/agendamentos?tab=tipos', host: true },
  'host-novo-tipo': { url: '/agendamentos?tab=tipos', host: true, run: async (p) => { await p.getByRole('button', { name: /Novo tipo/ }).first().click(); await p.fill('.bk-dialog input.bk-input', 'Mentoria de carreira') } },
  'host-horarios': { url: '/agendamentos?tab=horarios', host: true },
  'host-horarios-sujo': { url: '/agendamentos?tab=horarios', host: true, run: async (p) => { await p.locator('.av__day input[type=checkbox]').nth(5).check({ force: true }) } },
  'host-pagina': { url: '/agendamentos?tab=pagina', host: true },
  'host-primeiro-acesso': { url: '/agendamentos', host: true, state: (s) => { s.page = null; s.google = { connected: false, email: null, healthy: false } } },
  'host-primeiro-acesso-google': { url: '/agendamentos', host: true, state: (s) => { s.page = null } },
  'host-google-caiu': { url: '/agendamentos', host: true, state: (s) => { s.google.healthy = false } },
  'host-pausada': { url: '/agendamentos', host: true, state: (s) => { s.page.active = false } },
  'host-vazia': { url: '/agendamentos', host: true, state: (s) => { s.bookings = [] } },
}

const ALL_WIDTHS = [
  { name: 'm375', width: 375, height: 812, mobile: true },
  { name: 't768', width: 768, height: 1024, mobile: true },
  { name: 'd1440', width: 1440, height: 900, mobile: false },
  { name: 'd1280', width: 1280, height: 800, mobile: false },
]
const WIDTHS = ALL_WIDTHS.filter((w) => (process.env.VP ?? 'd1440,m375').split(',').includes(w.name))

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const report = []
for (const vp of WIDTHS) {
  for (const [key, sc] of Object.entries(SCENARIOS)) {
    if (only && !only.some((o) => key === o || (o.endsWith('*') && key.startsWith(o.slice(0, -1))))) continue
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.mobile ? 2 : 1,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      reducedMotion: 'reduce',
      colorScheme: theme === 'light' ? 'light' : 'dark',
    })
    await ctx.addInitScript(([t, c, th, isHost]) => {
      if (isHost) {
        localStorage.setItem('token', t)
        localStorage.setItem('activeCompany', c)
        localStorage.setItem('ui.theme', th)
      }
      localStorage.setItem('onboarding.autoShown', '1')
      localStorage.setItem('onboarding.completed', '1')
      localStorage.setItem('ui.idlePermissionPrompt', 'done')
    }, [token, seed.companies.pet, theme, !!sc.host])
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|404|401/.test(m.text())) errors.push(m.text().slice(0, 200)) })
    const state = freshState()
    sc.state?.(state)
    await mockBooking(page, state, sc.opts)
    try {
      await page.goto(WEB + sc.url, { waitUntil: 'domcontentloaded' })
      await page.addStyleTag({ content: '#__vue-devtools-container__,.vue-devtools__anchor{display:none!important}' }).catch(() => {})
      await wait(page, sc.settle ?? 1800)
      if (sc.run) await sc.run(page)
      await wait(page, 600)
      const metrics = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
        nativeSelects: document.querySelectorAll('select').length,
      }))
      if (process.env.TALL) {
        // O painel rola dentro do <main> da moldura (e a página pública, no
        // documento): cresce o viewport até caber tudo (teto 4000px).
        const extra = await page.evaluate(() => {
          const main = document.querySelector('.m-main, .main, main')
          const inner = main ? Math.max(0, main.scrollHeight - main.clientHeight) : 0
          return Math.max(inner, document.documentElement.scrollHeight - innerHeight)
        })
        if (extra > 0) {
          await page.setViewportSize({ width: vp.width, height: Math.min(4000, vp.height + extra) })
          await wait(page, 500)
        }
      }
      const file = path.join(out, `${key}-${vp.name}-${theme}.png`)
      await page.screenshot({ path: file, fullPage: true })
      report.push({ key, vp: vp.name, hScroll: metrics.scrollW > metrics.clientW + 1, selects: metrics.nativeSelects, errors: [...errors] })
    } catch (e) {
      report.push({ key, vp: vp.name, fail: String(e.message).split('\n')[0].slice(0, 200), errors: [...errors] })
    }
    await ctx.close()
  }
}
await browser.close()
for (const r of report) {
  const flags = [r.fail ? `FALHA ${r.fail}` : 'ok', r.hScroll ? 'ROLAGEM-LATERAL' : '', r.selects ? `select=${r.selects}` : '', r.errors?.length ? `erros=${JSON.stringify(r.errors)}` : ''].filter(Boolean).join(' ')
  console.log(`${r.key.padEnd(28)} ${r.vp.padEnd(6)} ${flags}`)
}
