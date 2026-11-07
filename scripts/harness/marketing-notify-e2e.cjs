// Roteiro de ponta a ponta dos AVISOS da ala (rodada R2, parte C: C1 a C4):
// spec docs/specs/2026/q4/q4-2/ala-marketing/r2-publicacao-dados-avisos.md.
//
// - "Meus avisos" pela tela, em qualquer papel (Editor e Visualizador): push,
//   e-mail (Desligado, Na hora, Resumo diário) e tipos silenciados, gravados em
//   `MarketingNotifyPref`; padrão sem linha = push ligado e resumo diário; sem
//   VAPID e sem SendGrid a tela explica e nada quebra. Silenciar vai em delta
//   (`mute`/`unmute`): duas abas mexendo em tipos diferentes somam.
// - Entrega (C1, C2) pelo caminho de verdade (`MarketingLogService.notify`),
//   num contexto da API com o push e o SendGrid trocados por espiões: push
//   chega para quem ligou e não para quem silenciou; "Na hora" manda um e-mail
//   por aviso; o resumo diário junta os não lidos uma vez por dia.
// - Meta de cadência (C4): Admin define em Configurações, aba Cadência; meta de
//   3 no Instagram com 2 agendados avisa na quarta e não repete na semana; o
//   painel mostra "Cadência da semana: 2 de 3 no Instagram".
//
// Uso: API=http://127.0.0.1:3671 WEB=http://localhost:5271 HARNESS_DB=wf_r2c \
//      API_RUN_DIR=../../../.api-run-3671 node marketing-notify-e2e.cjs
// Env: SHOTS (prints/marketing-notify), ONLY=A,B,C,D,E.
const { chromium } = require('playwright-core')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const pg = require('pg')

const API = process.env.API ?? 'http://127.0.0.1:3671'
const WEB = process.env.WEB ?? 'http://localhost:5271'
const DB = process.env.HARNESS_DB ?? 'wf_r2c'
const seed = JSON.parse(fs.readFileSync(path.resolve(__dirname, process.env.HARNESS_SEED ?? `seed-marketing-out.${DB}.json`), 'utf8'))
const OUT = process.env.SHOTS ?? path.join(__dirname, 'prints', 'marketing-notify')
const RUN_DIR = path.resolve(__dirname, process.env.API_RUN_DIR ?? `../../../.api-run-${new URL(API).port}`)
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean)
fs.mkdirSync(OUT, { recursive: true })

const G = seed.groupId
const U = seed.users
const PET = seed.companies.pet
const RUN = Date.now().toString(36).slice(-5)
const TAG = `E2E Avisos ${RUN}`

let fails = 0
let oks = 0
const check = (part, cond, msg, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} [${part}] ${msg}${extra !== '' && extra !== undefined ? '  (' + String(extra).slice(0, 300) + ')' : ''}`)
  if (cond) oks++
  else fails++
}
const want = (p) => !ONLY.length || ONLY.includes(p)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, timeout = 10000, step = 150) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    try {
      last = await fn()
    } catch {
      last = undefined
    }
    if (last) return last
    await sleep(step)
  }
  return last
}

const db = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:55432/${DB}` })
const q = async (sql, params) => (await db.query(sql, params)).rows

const TOKEN_CACHE = path.join(os.tmpdir(), `nevo-harness-tokens-${DB}-${new URL(API).port}.json`)
const WHO_IP = { nicolas: 1, leticia: 2, marcel: 3, freela: 4, diretoria: 5 }
async function token(who) {
  const email = `${who}@nevo.test`
  let cache = {}
  try {
    cache = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'))
  } catch {}
  if (cache[email]) {
    const r = await fetch(`${API}/user/me`, { headers: { authorization: `Bearer ${cache[email]}` } })
    if (r.ok) return cache[email]
  }
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.62.0.${WHO_IP[who] ?? 9}` },
    body: JSON.stringify({ email, password: 'nevo1234' }),
  })
  if (!r.ok) throw new Error(`login ${who}: ${r.status}`)
  cache[email] = (await r.json()).accessToken
  fs.writeFileSync(TOKEN_CACHE, JSON.stringify(cache))
  return cache[email]
}
async function api(who, method, route, body) {
  const tok = await token(who)
  const r = await fetch(`${API}/marketing/g/${G}${route}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await r.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { status: r.status, data }
}

/**
 * Código num contexto da API (o mesmo `dist/` do harness), com o push e o
 * SendGrid trocados por espiões que só anotam (nada sai para a rede).
 */
function runInApi(code, { spies = true } = {}) {
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (/^DATABASE_URL|^SUPABASE|^JWT|^ENCRYPTION|^VAPID|^SENDGRID/.test(k)) delete env[k]
  const url = `postgresql://postgres:postgres@127.0.0.1:55432/${DB}?sslmode=disable`
  Object.assign(env, {
    NODE_ENV: 'development',
    DOTENV_CONFIG_PATH: 'C:/nao-existe/.env',
    DATABASE_URL_IPV6_FAST_CONNECTION: url,
    DATABASE_URL_IPV4_POOL_CONNECTION: url,
    JWT_SECRET: 'harness-jwt-secret-local-only',
    ENCRYPTION_KEY: 'harnesskey-32-bytes-local-only!!',
    SUPABASE_BUCKET_URL: 'http://127.0.0.1:54329',
    SUPABASE_SERVICE_ROLE_BUCKET_KEY: 'harness',
    TIMER_AUTO_STOP_ENABLED: 'false',
    FRONTEND_URL: WEB,
  })
  const wrapped = `
    const { NestFactory } = require('@nestjs/core');
    const { AppModule } = require('./dist/src/app.module');
    const { PushService } = require('./dist/src/push/push.service');
    const { MailService } = require('./dist/src/mail/mail.service');
    (async () => {
      const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
      const pushes = [];
      const mails = [];
      if (${spies ? 'true' : 'false'}) {
        const push = app.get(PushService);
        push.enabledFlag = true;
        push.sendToUser = async (userId, payload) => { pushes.push({ userId, payload }); return 1; };
        const mail = app.get(MailService);
        mail.isConfigured = () => true;
        mail.send = async (m) => { mails.push(m); return true; };
      }
      const out = await (async () => { ${code} })();
      console.log('RESULT ' + JSON.stringify({ out, pushes, mails }));
      await app.close();
      process.exit(0);
    })().catch((e) => { console.error(e); process.exit(1); });`
  const r = spawnSync(process.execPath, ['-e', wrapped], { cwd: RUN_DIR, env, encoding: 'utf8', timeout: 180000 })
  const line = (r.stdout ?? '').split(/\r?\n/).find((l) => l.startsWith('RESULT '))
  if (!line) return { error: `${r.status} ${(r.stderr ?? '').slice(-1500)}` }
  return JSON.parse(line.slice(7))
}

async function newPage(browser, who, vp = { width: 1440, height: 900 }, theme = 'light') {
  const t = await token(who)
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: !!vp.mobile,
    hasTouch: !!vp.mobile,
    deviceScaleFactor: vp.mobile ? 2 : 1,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    reducedMotion: 'reduce',
    colorScheme: theme,
  })
  await ctx.addInitScript(([tk, th]) => {
    localStorage.setItem('token', tk)
    localStorage.setItem('onboarding.autoShown', '1')
    localStorage.setItem('onboarding.completed', '1')
    localStorage.setItem('ui.idlePermissionPrompt', 'done')
    localStorage.setItem('ui.theme', th)
  }, [t, theme])
  const page = await ctx.newPage()
  const bad = []
  page.on('response', (res) => {
    if (res.url().startsWith(API) && (res.status() === 401 || res.status() >= 500)) bad.push(`${res.status()} ${res.url().replace(API, '')}`)
  })
  return { ctx, page, bad }
}

const prefRow = async (who) => (await q('SELECT push, email, muted, "lastDigestAt" FROM "MarketingNotifyPref" WHERE "groupId"=$1 AND "userId"=$2', [G, U[who]]))[0] ?? null

;(async () => {
  await db.connect()
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  for (const who of ['nicolas', 'leticia', 'marcel', 'freela', 'diretoria']) await token(who)
  // Começo limpo: ninguém com preferência gravada (vale o padrão).
  await q('DELETE FROM "MarketingNotifyPref" WHERE "groupId"=$1', [G])

  // ── A. "Meus avisos" pela tela ──────────────────────────────────────────
  if (want('A')) {
    const p = 'A'
    const { ctx, page, bad } = await newPage(browser, 'marcel')
    await page.goto(`${WEB}/marketing`, { waitUntil: 'networkidle' })
    await page.locator('[data-testid="header-link-notify"]').click()
    await page.waitForURL(/\/marketing\/avisos/)
    await page.locator('[data-section="email"]').waitFor()
    const pushBox = page.locator('[data-section="push"] [role="checkbox"]').first()
    check(p, (await pushBox.getAttribute('aria-checked')) === 'true', 'padrão sem linha: push ligado')
    check(p, (await page.locator('[data-email="DAILY"]').getAttribute('aria-checked')) === 'true', 'padrão sem linha: resumo diário')
    check(p, (await prefRow('marcel')) === null, 'abrir a tela não grava nada')
    const status = await page.locator('[data-testid="push-status"]').innerText()
    check(p, /não está ligado no servidor/.test(status), 'sem VAPID: a tela diz que o push não está ligado', status)
    check(p, /não está configurado no servidor/.test(await page.locator('[data-testid="email-status"]').innerText()), 'sem SendGrid: a tela diz que o e-mail não está configurado')
    await page.screenshot({ path: path.join(OUT, '01-meus-avisos-padrao.png'), fullPage: true })
    // E-mail na hora, silenciar menção, desligar e religar o push.
    await page.locator('[data-email="IMMEDIATE"]').click()
    await waitFor(async () => (await prefRow('marcel'))?.email === 'IMMEDIATE')
    await page.locator('[data-kind="MENTIONED"] [role="checkbox"]').click()
    await waitFor(async () => ((await prefRow('marcel'))?.muted ?? []).includes('MENTIONED'))
    await pushBox.click()
    await waitFor(async () => (await prefRow('marcel'))?.push === false)
    let row = await prefRow('marcel')
    check(p, row?.email === 'IMMEDIATE' && row?.muted.includes('MENTIONED') && row?.push === false, 'Na hora, menção silenciada e push desligado gravados', JSON.stringify(row))
    await pushBox.click()
    await waitFor(async () => (await prefRow('marcel'))?.push === true)
    row = await prefRow('marcel')
    check(p, row?.push === true, 'religar o push grava de novo')
    check(p, await page.locator('[data-kind="MENTIONED"] .is-muted').count() === 1, 'o tipo silenciado aparece riscado')
    // Recarregar mostra o gravado.
    await page.reload({ waitUntil: 'networkidle' })
    await page.locator('[data-section="email"]').waitFor()
    check(p, (await page.locator('[data-email="IMMEDIATE"]').getAttribute('aria-checked')) === 'true', 'recarregar mostra "Na hora"')
    await page.screenshot({ path: path.join(OUT, '02-meus-avisos-gravado.png'), fullPage: true })
    // API recusando: a escolha volta ao valor gravado.
    await page.route('**/notify/prefs', (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Recusado no teste.' }) })
        : route.continue(),
    )
    await page.locator('[data-email="OFF"]').click()
    await waitFor(async () => (await page.locator('[data-email="IMMEDIATE"]').getAttribute('aria-checked')) === 'true', 4000)
    check(p, (await page.locator('[data-email="IMMEDIATE"]').getAttribute('aria-checked')) === 'true', 'API recusou: a escolha volta para "Na hora"')
    check(p, (await prefRow('marcel'))?.email === 'IMMEDIATE', 'nada gravado na recusa')
    await page.unroute('**/notify/prefs')
    check(p, bad.length === 0, 'tela sem 401/5xx', bad.join(', '))
    await ctx.close()

    // Duas abas (revisão da parte C): cada uma silencia um tipo diferente a
    // partir do que leu; as duas escolhas ficam. A aba 2 não recarrega entre um
    // clique e outro (o clique chega antes do refetch do foco): a lista que ela
    // tem é a velha, e com a lista inteira ela apagaria o da aba 1.
    {
      const two = await newPage(browser, 'marcel')
      const tabA = two.page
      const tabB = await two.ctx.newPage()
      tabB.on('response', (res) => {
        if (res.url().startsWith(API) && (res.status() === 401 || res.status() >= 500)) two.bad.push(`B ${res.status()} ${res.url().replace(API, '')}`)
      })
      const puts = []
      for (const [name, tab] of [['A', tabA], ['B', tabB]]) {
        tab.on('request', (req) => {
          if (req.method() === 'PUT' && req.url().endsWith('/notify/prefs')) puts.push([name, JSON.parse(req.postData() || '{}')])
        })
      }
      let firstGet = null
      await tabB.route('**/notify/prefs', async (route) => {
        if (route.request().method() !== 'GET') return route.continue()
        if (!firstGet) {
          const res = await route.fetch()
          firstGet = await res.text()
          return route.fulfill({ response: res, body: firstGet })
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: firstGet })
      })
      for (const tab of [tabA, tabB]) {
        await tab.goto(`${WEB}/marketing/avisos`, { waitUntil: 'networkidle' })
        await tab.locator('[data-section="muted"]').waitFor()
      }
      const mutedOn = async (tab, kind) => (await tab.locator(`[data-kind="${kind}"] .is-muted`).count()) === 1
      await tabA.locator('[data-kind="PROOF_RECEIVED"] [role="checkbox"]').click()
      await waitFor(async () => ((await prefRow('marcel'))?.muted ?? []).includes('PROOF_RECEIVED'))
      check(p, !(await mutedOn(tabB, 'PROOF_RECEIVED')), 'duas abas: a aba 2 ainda mostra a lista velha (sem a prova da gráfica)')
      await tabB.locator('[data-kind="DEADLINE_TOMORROW"] [role="checkbox"]').click()
      await waitFor(async () => ((await prefRow('marcel'))?.muted ?? []).includes('DEADLINE_TOMORROW'))
      row = await prefRow('marcel')
      check(
        p,
        ['MENTIONED', 'PROOF_RECEIVED', 'DEADLINE_TOMORROW'].every((k) => row?.muted.includes(k)) && row?.muted.length === 3,
        'duas abas: as duas escolhas ficam (a da aba 1 não some)',
        JSON.stringify(row?.muted),
      )
      check(
        p,
        JSON.stringify(puts) === JSON.stringify([['A', { mute: ['PROOF_RECEIVED'] }], ['B', { mute: ['DEADLINE_TOMORROW'] }]]),
        'cada aba manda só o tipo que mudou (mute), sem a lista inteira',
        JSON.stringify(puts),
      )
      await waitFor(async () => mutedOn(tabB, 'PROOF_RECEIVED'), 4000)
      check(p, await mutedOn(tabB, 'PROOF_RECEIVED'), 'a resposta traz a lista do banco: a aba 2 passa a mostrar a escolha da aba 1')
      // Voltar a receber, cruzado: a aba 1 (que não sabe do prazo) libera a prova.
      await tabA.locator('[data-kind="PROOF_RECEIVED"] [role="checkbox"]').click()
      await waitFor(async () => !((await prefRow('marcel'))?.muted ?? []).includes('PROOF_RECEIVED'))
      await tabB.locator('[data-kind="DEADLINE_TOMORROW"] [role="checkbox"]').click()
      await waitFor(async () => !((await prefRow('marcel'))?.muted ?? []).includes('DEADLINE_TOMORROW'))
      row = await prefRow('marcel')
      check(p, JSON.stringify(row?.muted) === JSON.stringify(['MENTIONED']), 'duas abas: voltar a receber (unmute) tira só o tipo clicado', JSON.stringify(row?.muted))
      check(p, puts.slice(2).every(([, b]) => Array.isArray(b.unmute) && b.unmute.length === 1 && !('muted' in b)), 'voltar a receber manda unmute de um tipo', JSON.stringify(puts.slice(2)))
      // O formato antigo (lista inteira) segue aceito pela API.
      const old = await api('marcel', 'PUT', '/notify/prefs', { muted: ['MENTIONED'] })
      check(p, old.status === 200 && JSON.stringify(old.data?.muted) === JSON.stringify(['MENTIONED']), 'formato antigo (muted) segue valendo', old.status)
      const badDelta = await api('marcel', 'PUT', '/notify/prefs', { mute: 'MENTIONED' })
      check(p, badDelta.status === 400, 'mute que não é lista: 400', badDelta.status)
      check(p, two.bad.length === 0, 'duas abas sem 401/5xx', two.bad.join(', '))
      await two.ctx.close()
    }

    // Visualizador também escolhe (qualquer papel), e no celular cabe.
    const v = await newPage(browser, 'diretoria', { width: 375, height: 812, mobile: true })
    await v.page.goto(`${WEB}/marketing/avisos`, { waitUntil: 'networkidle' })
    await v.page.locator('[data-section="email"]').waitFor()
    await v.page.locator('[data-email="OFF"]').click()
    await waitFor(async () => (await prefRow('diretoria'))?.email === 'OFF')
    check(p, (await prefRow('diretoria'))?.email === 'OFF', 'Visualizador grava a própria preferência')
    const overflow = await v.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check(p, overflow <= 0, '"Meus avisos" sem rolagem lateral em 375px', overflow)
    const opt = await v.page.locator('[data-email="DAILY"]').boundingBox()
    check(p, (opt?.height ?? 0) >= 44, 'opção de e-mail com 44px no celular', opt?.height)
    await v.page.screenshot({ path: path.join(OUT, '03-meus-avisos-375.png'), fullPage: true })
    const texts = await v.page.locator('.mkn').innerText()
    check(p, !/—/.test(texts), 'nenhum em-dash na tela')
    await v.ctx.close()
    // A API não deixa mexer na preferência de outra pessoa: só existe a "minha".
    const leti = await api('leticia', 'GET', '/notify/prefs')
    check(p, leti.data?.email === 'DAILY' && leti.data?.push === true, 'a da Letícia continua no padrão (cada um a sua)')
    const badMode = await api('marcel', 'PUT', '/notify/prefs', { email: 'SEMPRE' })
    check(p, badMode.status === 400, 'modo de e-mail inválido: 400', badMode.status)
  }

  // ── B. Entrega: push e e-mail na hora pelo notify de verdade ────────────
  if (want('B')) {
    const p = 'B'
    // freela: padrão (push, resumo); leticia: push desligado; marcel: na hora + menção silenciada.
    await api('leticia', 'PUT', '/notify/prefs', { push: false })
    const res = runInApi(`
      const { MarketingAccessService } = require('./dist/src/marketing/core/marketing-access.service');
      const { MarketingLogService } = require('./dist/src/marketing/core/marketing-log.service');
      const access = app.get(MarketingAccessService);
      const log = app.get(MarketingLogService);
      const ctx = (await access.resolve('${U.nicolas}', '${G}')).ctx;
      const to = ['${U.leticia}', '${U.marcel}', '${U.freela}'];
      await log.notify(ctx, '${PET}', { userIds: to, kind: 'APPROVED', title: '${TAG}: aprovado', body: 'V2 aprovada', link: '/marketing/cards/abc' });
      await log.notify(ctx, '${PET}', { userIds: to, kind: 'MENTIONED', title: '${TAG}: menção', link: '/marketing/cards/abc' });
      await new Promise((r) => setTimeout(r, 2500));
      return true;`)
    check(p, !res.error, 'contexto da API sobe e manda dois avisos', res.error)
    const pushTo = (kind) => (res.pushes ?? []).filter((x) => x.payload.data?.marketingKind === kind).map((x) => x.userId).sort()
    check(p, JSON.stringify(pushTo('APPROVED')) === JSON.stringify([U.marcel, U.freela].sort()), 'push do "aprovado": Marcel e freela (Letícia desligou)', JSON.stringify(pushTo('APPROVED')))
    check(p, JSON.stringify(pushTo('MENTIONED')) === JSON.stringify([U.freela]), 'push da menção: só a freela (o Marcel silenciou)', JSON.stringify(pushTo('MENTIONED')))
    const approvedPush = (res.pushes ?? []).find((x) => x.payload.data?.marketingKind === 'APPROVED')
    check(p, approvedPush?.payload.title === `${TAG}: aprovado` && approvedPush?.payload.body === 'V2 aprovada' && approvedPush?.payload.data?.url === `/marketing/cards/abc?grupo=${G}`, 'push leva o mesmo título, texto e link com ?grupo=', JSON.stringify(approvedPush?.payload))
    const mails = res.mails ?? []
    check(p, mails.length === 1 && mails[0].to === 'marcel@nevo.test' && mails[0].subject === `${TAG}: aprovado`, 'e-mail na hora: um, para o Marcel, só do aviso que ele não silenciou', JSON.stringify(mails.map((m) => [m.to, m.subject])))
    check(p, (mails[0]?.html ?? '').includes(`${WEB}/marketing/cards/abc?grupo=${G}`) && (mails[0]?.text ?? '').includes('/marketing/avisos?grupo='), 'e-mail com o link completo e o "Mudar meus avisos"')
    check(p, !/—/.test(`${mails[0]?.html}${mails[0]?.text}`), 'e-mail sem em-dash')
    // O sino recebeu os dois para os três (preferência não mexe no sino).
    const bell = await q(`SELECT "userId", type FROM "Notification" WHERE title LIKE $1`, [`${TAG}%`])
    check(p, bell.length === 6, 'o sino recebe os dois avisos para os três', bell.length)
    // Sem VAPID e sem SendGrid (sem espiões): nada quebra e nada sai.
    const off = runInApi(`
      const { MarketingNotifyDeliveryService } = require('./dist/src/marketing/core/marketing-notify-delivery.service');
      return app.get(MarketingNotifyDeliveryService).deliver({ groupId: '${G}', userIds: ['${U.freela}'], kind: 'APPROVED', title: 'x' });`, { spies: false })
    check(p, !off.error && off.out?.push === 0 && off.out?.email === 0, 'sem VAPID e sem SendGrid: entrega inerte, sem erro', JSON.stringify(off.out ?? off.error))
  }

  // ── C. Resumo diário: os não lidos, uma vez por dia ─────────────────────
  if (want('C')) {
    const p = 'C'
    // Marca como lido tudo o que já existe e cria três avisos novos, de cards de
    // verdade da PetJourney. Auditoria da parte C: o resumo só manda o que a
    // pessoa AINDA vê. Vão junto dois que NÃO podem sair: o de um card que foi
    // para a lixeira e o de um card da Emmitec (o freela só vê a PetJourney).
    await q(`UPDATE "Notification" SET read = true WHERE "userId" = ANY($1) AND type LIKE 'MARKETING_%'`, [[U.freela, U.nicolas, U.leticia, U.marcel, U.diretoria]])
    const mkCard = async (companyId, title) => (await api('marcel', 'POST', '/cards', { companyId, title: `${TAG} ${title}`, kind: 'POST', networks: ['INSTAGRAM'] })).data?.id
    const r1 = await mkCard(PET, 'resumo 1')
    const r2 = await mkCard(PET, 'resumo 2')
    const r3 = await mkCard(PET, 'resumo 3')
    const rTrash = await mkCard(PET, 'resumo lixeira')
    const rEmmi = await mkCard(seed.companies.emmitec, 'resumo emmi')
    check(p, !!(r1 && r2 && r3 && rTrash && rEmmi), 'cards do resumo criados pela API')
    const res = runInApi(`
      const { MarketingAccessService } = require('./dist/src/marketing/core/marketing-access.service');
      const { MarketingLogService } = require('./dist/src/marketing/core/marketing-log.service');
      const { MarketingDigestService } = require('./dist/src/marketing/notify/notify-digest.service');
      const { SchedulerRegistry } = require('@nestjs/schedule');
      const ctx = (await app.get(MarketingAccessService).resolve('${U.leticia}', '${G}')).ctx;
      const log = app.get(MarketingLogService);
      await log.notify(ctx, '${PET}', { userIds: ['${U.freela}'], kind: 'APPROVED', title: '${TAG}: resumo 1', body: 'Primeiro', link: '/marketing/cards/${r1}' });
      await log.notify(ctx, '${PET}', { userIds: ['${U.freela}'], kind: 'CHANGES_REQUESTED', title: '${TAG}: resumo 2', link: '/marketing/cards/${r2}' });
      await log.notify(ctx, '${PET}', { userIds: ['${U.freela}', '${U.marcel}'], kind: 'MENTIONED', title: '${TAG}: resumo 3', link: '/marketing/cards/${r3}' });
      await log.notify(ctx, '${PET}', { userIds: ['${U.freela}'], kind: 'APPROVED', title: '${TAG}: resumo da lixeira', link: '/marketing/cards/${rTrash}' });
      await log.notify(ctx, '${seed.companies.emmitec}', { userIds: ['${U.freela}'], kind: 'APPROVED', title: '${TAG}: resumo de outra marca', link: '/marketing/cards/${rEmmi}' });
      await new Promise((r) => setTimeout(r, 1500));
      await app.get(require('./dist/src/prisma/prisma.service').PrismaService).marketingCard.update({ where: { id: '${rTrash}' }, data: { deletedAt: new Date() } });
      const digest = app.get(MarketingDigestService);
      const first = await digest.run(new Date());
      const second = await digest.run(new Date(Date.now() + 60000));
      let next = null;
      try { next = app.get(SchedulerRegistry).getCronJob('marketing-notify-digest').nextDate().toISO(); } catch (e) { next = 'erro: ' + e.message; }
      return { first, second, next };`)
    check(p, !res.error, 'resumo roda no contexto da API', res.error)
    const digests = (res.mails ?? []).filter((m) => /Resumo da ala Marketing/.test(m.subject))
    const toFreela = digests.find((m) => m.to === 'freela@nevo.test')
    check(p, !!toFreela && /3 avisos novos/.test(toFreela.subject), 'freela (padrão: resumo diário) recebe um resumo com os 3 não lidos', toFreela?.subject)
    check(p, ['resumo 1', 'resumo 2', 'resumo 3'].every((t) => toFreela?.text.includes(t)), 'o resumo lista os três avisos')
    check(p, !!toFreela && !/resumo da lixeira/.test(toFreela.text + toFreela.html), 'o aviso do card que foi para a lixeira não sai no resumo')
    check(p, !!toFreela && !/resumo de outra marca/.test(toFreela.text + toFreela.html), 'o aviso de card de marca que a pessoa não vê não sai no resumo')
    check(p, !digests.some((m) => m.to === 'marcel@nevo.test'), 'Marcel (Na hora) não entra no resumo')
    check(p, !digests.some((m) => m.to === 'diretoria@nevo.test'), 'Diretoria (e-mail desligado) não recebe resumo')
    check(p, res.out?.second?.sent === 0, 'rodar de novo no mesmo dia não manda nada', JSON.stringify(res.out?.second))
    check(p, typeof res.out?.next === 'string' && /T08:05|T11:05/.test(res.out.next), 'cron do resumo às 8h05 de Brasília', res.out?.next)
    check(p, !!(await prefRow('freela'))?.lastDigestAt, 'a reserva do dia gravou o último resumo (linha nasceu no padrão)')
    check(p, (await prefRow('freela'))?.email === 'DAILY' && (await prefRow('freela'))?.push === true, 'a linha nova ficou no padrão (push e resumo)')
    // Sem SendGrid: o resumo nem roda e o marcador não anda.
    await q(`UPDATE "MarketingNotifyPref" SET "lastDigestAt" = NULL WHERE "groupId"=$1 AND "userId"=$2`, [G, U.freela])
    const off = runInApi(`
      const { MarketingDigestService } = require('./dist/src/marketing/notify/notify-digest.service');
      return app.get(MarketingDigestService).run(new Date());`, { spies: false })
    check(p, !off.error && off.out?.mailConfigured === false && off.out?.sent === 0, 'sem SendGrid: resumo inerte', JSON.stringify(off.out ?? off.error))
    check(p, (await prefRow('freela'))?.lastDigestAt === null, 'sem SendGrid o marcador não anda (ninguém perde aviso)')
  }

  // ── D. Meta de cadência: Configurações, aviso de quarta, painel ─────────
  if (want('D')) {
    const p = 'D'
    await q(`DELETE FROM "MarketingCadenceGoal" WHERE "groupId"=$1`, [G])
    const { ctx, page, bad } = await newPage(browser, 'leticia')
    await page.goto(`${WEB}/marketing/configuracoes?aba=cadencia`, { waitUntil: 'networkidle' })
    await page.locator('[data-section="cadence"]').waitFor()
    check(p, (await page.locator('[data-testid="cadence-empty"]').count()) === 1, 'sem meta: "Nenhuma meta ainda"')
    const add = page.locator('[data-testid="cadence-add"]')
    await add.locator('input[type="number"]').fill('3')
    await add.getByRole('button', { name: 'Salvar meta' }).click()
    const goal = await waitFor(async () => (await q(`SELECT * FROM "MarketingCadenceGoal" WHERE "groupId"=$1 AND network='INSTAGRAM' AND "companyId"=$2`, [G, PET]))[0])
    check(p, goal?.perWeek === 3 && goal?.active === true, 'Admin grava a meta de 3 por semana no Instagram', JSON.stringify(goal && { perWeek: goal.perWeek, active: goal.active }))
    await page.locator(`[data-goal="${PET}:INSTAGRAM"]`).waitFor()
    await page.screenshot({ path: path.join(OUT, '04-cadencia-config.png'), fullPage: true })

    // Auditoria da parte C: o número salva depois de uma pausa (três cliques na
    // setinha eram três pedidos) e "Tirar a meta" pede confirmação.
    const puts = []
    page.on('request', (r) => {
      if (r.method() === 'PUT' && new URL(r.url()).pathname.endsWith('/cadence')) puts.push(r.postDataJSON())
    })
    const num = page.locator(`[data-goal="${PET}:INSTAGRAM"] [data-field="cadence-per-week"]`)
    await num.focus()
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp')
    await sleep(1500)
    const six = await waitFor(async () => (await q(`SELECT "perWeek" FROM "MarketingCadenceGoal" WHERE "groupId"=$1 AND network='INSTAGRAM' AND "companyId"=$2`, [G, PET]))[0]?.perWeek === 6)
    check(p, six && puts.length === 1 && puts[0]?.perWeek === 6, 'três cliques na setinha: um pedido só, com 6', JSON.stringify(puts))
    await page.locator(`[data-goal="${PET}:INSTAGRAM"] [data-action="remove-goal"]`).click()
    const dlg = page.getByRole('dialog').filter({ hasText: 'Tirar a meta?' })
    await dlg.waitFor({ timeout: 4000 }).catch(() => {})
    check(p, (await dlg.count()) === 1, '"Tirar a meta" pede confirmação', await dlg.innerText().catch(() => ''))
    await dlg.getByRole('button', { name: /Cancelar/ }).click()
    await sleep(400)
    const still = (await q(`SELECT id FROM "MarketingCadenceGoal" WHERE "groupId"=$1 AND network='INSTAGRAM' AND "companyId"=$2`, [G, PET])).length
    check(p, still === 1, 'cancelar a confirmação mantém a meta')
    // Volta para 3 (o resto da parte D conta "2 de 3").
    await api('leticia', 'PUT', '/cadence', { companyId: PET, network: 'INSTAGRAM', perWeek: 3, active: true })
    check(p, bad.length === 0, 'tela sem 401/5xx', bad.join(', '))
    await ctx.close()
    // Editor vê a meta, não muda.
    const e = await newPage(browser, 'marcel')
    await e.page.goto(`${WEB}/marketing/configuracoes?aba=cadencia`, { waitUntil: 'networkidle' })
    await e.page.locator('[data-section="cadence"]').waitFor()
    check(p, (await e.page.locator('[data-testid="cadence-add"]').count()) === 0, 'Editor não vê o formulário da meta')
    await e.ctx.close()
    const ed = await api('marcel', 'PUT', '/cadence', { companyId: PET, network: 'INSTAGRAM', perWeek: 9 })
    check(p, ed.status === 403, 'Editor não muda a meta pela API (403)', ed.status)

    // Dois agendados no Instagram nesta semana (segunda a domingo de Brasília).
    const brNow = new Date(Date.now() - 3 * 3600_000)
    const dow = (brNow.getUTCDay() + 6) % 7
    const monday = new Date(Date.UTC(brNow.getUTCFullYear(), brNow.getUTCMonth(), brNow.getUTCDate() - dow))
    const at = (d, h) => new Date(monday.getTime() + d * 86_400_000 + (h + 3) * 3600_000)
    await q(`UPDATE "MarketingCard" SET "deletedAt" = now() WHERE "groupId"=$1 AND title LIKE 'E2E Avisos %' AND "deletedAt" IS NULL`, [G])
    // Banco do harness já usado por outro roteiro (o da publicação deixa posts
    // do Instagram da PetJourney nesta semana): só os desta rodada contam.
    await q(
      `UPDATE "MarketingCard" SET "deletedAt" = now() WHERE "groupId"=$1 AND "companyId"=$2 AND 'INSTAGRAM' = ANY(networks)
         AND status IN ('SCHEDULED','PUBLISHED') AND "publishAt" >= $3 AND "publishAt" < $4 AND "deletedAt" IS NULL`,
      [G, PET, at(0, -3), at(7, -3)],
    )
    for (const [i, d] of [[1, 1], [2, 4]]) {
      const c = (await api('marcel', 'POST', '/cards', { companyId: PET, title: `${TAG} agendado ${i}`, kind: 'POST', networks: ['INSTAGRAM'] })).data
      await q(`UPDATE "MarketingCard" SET status='SCHEDULED', "publishAt"=$2 WHERE id=$1`, [c.id, at(d, 10)])
    }
    // Aprovado não conta; outra semana também não.
    const extra = (await api('marcel', 'POST', '/cards', { companyId: PET, title: `${TAG} aprovado`, kind: 'POST', networks: ['INSTAGRAM'] })).data
    await q(`UPDATE "MarketingCard" SET status='APPROVED', "publishAt"=$2 WHERE id=$1`, [extra.id, at(3, 10)])
    const wed = at(2, 9)
    const thu = at(3, 9)
    const tue = at(1, 9)
    const res = runInApi(`
      const { MarketingCadenceService } = require('./dist/src/marketing/cadence/cadence.service');
      const { SchedulerRegistry } = require('@nestjs/schedule');
      const s = app.get(MarketingCadenceService);
      const tuesday = await s.run(new Date('${tue.toISOString()}'));
      const wednesday = await s.run(new Date('${wed.toISOString()}'));
      const thursday = await s.run(new Date('${thu.toISOString()}'));
      let next = null;
      try { next = app.get(SchedulerRegistry).getCronJob('marketing-cadence-alert').nextDate().toISO(); } catch (e) { next = 'erro: ' + e.message; }
      return { tuesday, wednesday, thursday, next };`)
    check(p, !res.error, 'cron da cadência roda no contexto da API', res.error)
    check(p, res.out?.tuesday?.alerted === 0 && res.out?.tuesday?.alertDay === false, 'terça: não avisa (antes da quarta)', JSON.stringify(res.out?.tuesday))
    check(p, res.out?.wednesday?.alerted === 1, 'quarta: meta de 3 com 2 agendados avisa uma vez', JSON.stringify(res.out?.wednesday))
    check(p, res.out?.thursday?.alerted === 0 && res.out?.thursday?.alreadyAlerted >= 1, 'quinta: não repete na semana', JSON.stringify(res.out?.thursday))
    const bell = await q(`SELECT "userId", title, link FROM "Notification" WHERE type='MARKETING_CADENCE_BEHIND' AND "createdAt" > now() - interval '5 minutes'`)
    const who = new Set(bell.map((b) => b.userId))
    check(p, who.has(U.leticia) && who.has(U.marcel) && who.has(U.nicolas) && who.has(U.freela) && !who.has(U.diretoria), 'avisa os Admins e Editores da marca (a Diretoria só vê)', bell.length)
    check(p, bell.every((b) => b.title === 'Cadência da semana: 2 de 3 no Instagram (PetJourney)') && bell.every((b) => b.link.includes(`grupo=${G}`)), 'o aviso diz "2 de 3 no Instagram" e leva ao calendário da marca', bell[0]?.title)
    check(p, new Set(bell.map((b) => b.userId)).size === bell.length, 'uma linha por pessoa (sem repetir)')
    check(p, typeof res.out?.next === 'string', 'cron da cadência registrado', res.out?.next)
    // Painel inicial: "Cadência da semana: 2 de 3 no Instagram".
    const h = await newPage(browser, 'marcel')
    const homeCalls = []
    h.page.on('request', (r) => {
      if (r.url().startsWith(`${API}/marketing/g/`)) homeCalls.push(new URL(r.url()).pathname.replace(`/marketing/g/${G}`, ''))
    })
    await h.page.goto(`${WEB}/marketing`, { waitUntil: 'networkidle' })
    const strip = h.page.locator('[data-section="cadencia"]')
    await strip.waitFor()
    check(p, /Cadência da semana/.test(await strip.innerText()) && /2 de 3 no Instagram/.test(await strip.innerText()), 'painel mostra "Cadência da semana: 2 de 3 no Instagram"', await strip.innerText())
    check(p, !homeCalls.some((c) => c.startsWith('/cadence')), 'a cadência vem no próprio /home (sem requisição a mais)', homeCalls.join(' '))
    await h.page.screenshot({ path: path.join(OUT, '05-painel-cadencia.png') })
    await h.ctx.close()
    const m = await newPage(browser, 'marcel', { width: 375, height: 812, mobile: true })
    await m.page.goto(`${WEB}/marketing`, { waitUntil: 'networkidle' })
    await m.page.locator('[data-section="cadencia"]').waitFor()
    const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check(p, overflow <= 0, 'painel com a cadência sem rolagem lateral em 375px', overflow)
    await m.page.screenshot({ path: path.join(OUT, '06-painel-cadencia-375.png') })
    await m.ctx.close()
  }

  // ── E. Escuro e o atalho "Meus avisos" no cabeçalho ─────────────────────
  if (want('E')) {
    const p = 'E'
    const d = await newPage(browser, 'freela', { width: 1440, height: 900 }, 'dark')
    await d.page.goto(`${WEB}/marketing/avisos`, { waitUntil: 'networkidle' })
    await d.page.locator('[data-section="muted"]').waitFor()
    check(p, (await d.page.locator('[data-testid="header-link-notify"].is-active').count()) === 1, 'atalho "Meus avisos" ativo no cabeçalho')
    check(p, (await d.page.locator('[data-kind]').count()) >= 14, 'catálogo de tipos para silenciar', await d.page.locator('[data-kind]').count())
    await d.page.screenshot({ path: path.join(OUT, '07-meus-avisos-escuro.png'), fullPage: true })
    await d.ctx.close()
  }

  await browser.close()
  await db.end()
  console.log(`\n${oks} ok, ${fails} falha(s)`)
  process.exit(fails ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
