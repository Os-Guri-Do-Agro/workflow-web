// O "app" simulado do harness para a área Dados (M4): faz o papel da PetJourney sem o
// código dela. Guarda os cadastros por dia, aplica o recorte do contrato v1 (revisão de
// 07/11, docs/specs/2026/q4/q4-2/ala-marketing/m4-contrato-dados-do-app.md) e manda para
// a rota pública do Nevo como o job diário mandaria: UM envio por dia, com os 3 últimos
// dias (ontem com estoque) e a última semana fechada; na primeira vez, também o histórico
// de 90 dias em lotes de 30, cada lote com as semanas fechadas dele.
//
// O que vai em cada lugar (o mesmo do nevo-contrato.ts da PetJourney):
// - no dia: cadastros (total, canal, plataforma, "como nos conheceu"), ativos, assinaturas
//   novas, pets novos por espécie, uso, e os estoques SÓ com o total, arredondados para
//   cima de 5 em 5 (nunca nulos);
// - na semana (segunda a domingo, só fechada): cadastros_semana com a UTM e o parceiro. O
//   total soma só os dias que saíram exatos (o dia de 1 a 4 fica de fora, e as pessoas dele
//   também), e as duas partições fecham com ele.
//
// O RELÓGIO do app fica na segunda-feira logo depois da última semana fechada (hoje, se
// hoje é segunda). O "ontem" do app é o domingo dessa semana: o cadastro de "ontem" cai
// numa semana que já fechou, e o funil (que lê a semana) mostra o número sem esperar.
//
// Uso (pelo marketing-appdata-e2e.cjs com PJ_MODE=simulado, o padrão):
//   const app = createFakeApp(API)
//   app.base(); app.signup({ utm: [...], como: 'instagram' }); await app.send(token)

const crypto = require('node:crypto')

const FUSO = 'America/Sao_Paulo'
const MIN = 5
/** Segredo da ordem do balde (na PetJourney fica em ConfiguracaoSistema; aqui é fixo). */
const SEGREDO = 'harness-segredo-do-recorte'

function ymdBr(date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  )
  return `${p.year}-${p.month}-${p.day}`
}
function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
/** 0 = domingo ... 6 = sábado */
const weekday = (ymd) => new Date(`${ymd}T12:00:00Z`).getUTCDay()
const mondayOf = (ymd) => addDays(ymd, -((weekday(ymd) + 6) % 7))
/** O domingo da última semana fechada (segunda a domingo) antes de `today`. */
function lastClosedSunday(today) {
  const y = addDays(today, -1)
  return addDays(y, -weekday(y))
}

/** Célula solta (total, uso, ativo): 0 fica 0; de 1 a 4 sai null. */
const cell = (n) => (n > 0 && n < MIN ? null : n)
/** Estoque: só o total, para cima de 5 em 5 (0 fica 0; de 1 a 5 vira 5). Nunca null. */
const stockUp = (n) => Math.ceil(n / MIN) * MIN
const bucketOf = (family) => (family === 'utm' ? 'utm:outras' : `${family}:outros`)
const secretOrder = (date, metric, family) => (dimension) =>
  crypto.createHmac('sha256', SEGREDO).update(`${date}|${metric}|${family}|${dimension}`).digest().readUInt32BE(0)

/**
 * Recorte COMPLEMENTAR de uma partição: a mesma regra do lado que envia
 * (petjourney-api src/nevo/nevo-contrato.ts, recortarParticao). As células de 1 a 4
 * e o próprio balde vão para o balde; se ele tem célula pequena e menos de 2 células,
 * ou soma menos de 5, uma grande vai junto, escolhida pela ordem secreta. Nada sai null.
 */
function cutPartition(family, counts, order) {
  const bucket = bucketOf(family)
  const rows = [...counts.entries()].filter(([, n]) => n > 0)
  const total = rows.reduce((s, [, n]) => s + n, 0)
  if (total < MIN) return []
  const inBucket = rows.filter(([d, n]) => d === bucket || n < MIN)
  const big = rows
    .filter(([d, n]) => d !== bucket && n >= MIN)
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
  const sum = () => inBucket.reduce((s, [, n]) => s + n, 0)
  const hasSmall = () => inBucket.some(([, n]) => n < MIN)
  while (hasSmall() && (inBucket.length < 2 || sum() < MIN) && big.length) inBucket.push(big.shift())
  const out = big.map(([dimension, value]) => ({ dimension, value }))
  if (inBucket.length) out.push({ dimension: bucket, value: sum() })
  return out.sort((a, b) => a.dimension.localeCompare(b.dimension))
}

/** Células soltas (uso): cada uma com o próprio recorte. */
const looseCells = (counts) =>
  [...counts.entries()]
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dimension, n]) => ({ dimension, value: cell(n) }))

function countBy(list, key) {
  const m = new Map()
  for (const item of list) {
    const k = key(item)
    if (k) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

function createFakeApp(api) {
  const realToday = ymdBr()
  /** O "ontem" do app: o domingo da última semana fechada (o "hoje" do app é a segunda seguinte). */
  const ontem = lastClosedSunday(realToday)
  const hoje = addDays(ontem, 1)
  /** A semana fechada em que o "ontem" cai. */
  const semana = { from: mondayOf(ontem), to: ontem }
  let historySent = false
  /** Cadastros, um item por pessoa falsa (só as características que viram dimensão), com o dia. */
  let people = []
  const flows = { assinaturasNovas: 0, petsNovos: new Map(), uso: new Map() }
  let stock = null

  function base() {
    people = []
    for (let i = 0; i < 30; i++) {
      const app = i >= 12
      people.push({
        date: ontem,
        canal: app ? 'app' : 'web',
        // A plataforma reparte os cadastros do APP (o site não tem plataforma).
        plataforma: app ? (i < 22 ? 'ios' : 'android') : null,
        como: i < 8 ? 'instagram' : i < 14 ? 'tiktok' : 'nao_informado',
        // 6 pela placa da clínica (UTM viva no Nevo) e 5 por um link montado fora da ala.
        utm: i >= 24 ? 'parceiro|impresso|clinicas|bicho-feliz' : i >= 19 ? 'whatsapp|grupo|indicacao-tutores|' : null,
        parceiro: i >= 24 ? 'PJ-CL1N1C|Clinica Bicho Feliz' : i >= 19 ? 'PJ-AMIGO1|Pet Shop Amigo' : null,
      })
    }
    flows.assinaturasNovas = 6
    // 21 cachorros, 8 gatos e 1 réptil: o réptil vai para o balde com uma grande junto.
    flows.petsNovos = new Map([
      ['cachorro', 21],
      ['gato', 8],
      ['reptil', 1],
    ])
    flows.uso = new Map([['vacina', 7]])
    // Estoques de verdade; saem arredondados para cima (33 vira 35, 61 vira 65).
    stock = { ativos: { 1: 18, 7: 18, 30: 18 }, assinaturas: 33, pets: 61 }
    return { ontem, hoje, semana, cadastros: people.length }
  }

  /**
   * Um cadastro de "ontem" como o site mandaria (UTM do primeiro toque e "como nos conheceu").
   * `parceiro`: `CODIGO|Nome` de quem indicou (o /r/ do parceiro), ou null.
   */
  function signup({ utm = null, como = 'nao_informado', canal = 'web', date = ontem, parceiro = null } = {}) {
    people.push({ date, canal, plataforma: canal === 'app' ? 'ios' : null, como, utm, parceiro })
  }

  const isExact = (n) => n === 0 || n >= MIN

  function dayRows(date) {
    const isOntem = date === ontem
    const ps = people.filter((p) => p.date === date)
    const metrics = [{ metric: 'cadastros', dimension: '', value: cell(ps.length) }]
    const push = (metric, rows) => {
      for (const r of rows) metrics.push({ metric, ...r })
    }
    const canal = cutPartition('canal', countBy(ps, (p) => `canal:${p.canal}`), secretOrder(date, 'cadastros', 'canal'))
    push('cadastros', canal)
    // A plataforma só sai com o canal:app exato (o balde do canal pode ter levado o app junto).
    if (canal.some((r) => r.dimension === 'canal:app')) {
      const appPeople = ps.filter((p) => p.canal === 'app')
      push('cadastros', cutPartition('plataforma', countBy(appPeople, (p) => p.plataforma && `plataforma:${p.plataforma}`), secretOrder(date, 'cadastros', 'plataforma')))
    }
    push('cadastros', cutPartition('como_conheceu', countBy(ps, (p) => `como_conheceu:${p.como}`), secretOrder(date, 'cadastros', 'como_conheceu')))
    metrics.push({ metric: 'assinaturas_novas', dimension: '', value: cell(isOntem ? flows.assinaturasNovas : 0) })
    const pets = isOntem ? flows.petsNovos : new Map()
    const petsTotal = [...pets.values()].reduce((s, n) => s + n, 0)
    metrics.push({ metric: 'pets_novos', dimension: '', value: cell(petsTotal) })
    push('pets_novos', cutPartition('especie', new Map([...pets].map(([e, n]) => [`especie:${e}`, n])), secretOrder(date, 'pets_novos', 'especie')))
    if (isOntem) {
      push('uso', looseCells(new Map([...flows.uso].map(([f, n]) => [`funcao:${f}`, n]))))
      for (const j of [1, 7, 30]) metrics.push({ metric: `ativos_${j}d`, dimension: 'fonte:aparelho', value: cell(stock.ativos[j]) })
      metrics.push({ metric: 'assinaturas_ativas', dimension: '', value: stockUp(stock.assinaturas) })
      metrics.push({ metric: 'pets', dimension: '', value: stockUp(stock.pets) })
    }
    return { date, metrics }
  }

  /**
   * A semana fechada que começa em `monday`: o total soma só os dias exatos (0 ou 5+),
   * e a UTM e o parceiro são das pessoas desses dias. Tupla que não é UTM viva da marca
   * no Nevo (`live`, do GET app-utms) vai como utm:outras, como na PetJourney.
   */
  function weekRows(monday, live) {
    const days = Array.from({ length: 7 }, (_, k) => addDays(monday, k))
    const exact = new Set(days.filter((d) => isExact(people.filter((p) => p.date === d).length)))
    const ps = people.filter((p) => exact.has(p.date))
    const metrics = [{ metric: 'cadastros_semana', dimension: '', value: ps.length }]
    const utmOf = (p) => (!p.utm ? 'utm:sem_utm' : live && live.has(p.utm) ? `utm:${p.utm}` : 'utm:outras')
    const partnerOf = (p) => (p.parceiro ? `parceiro:${p.parceiro}` : 'parceiro:sem_parceiro')
    for (const [family, key] of [
      ['utm', utmOf],
      ['parceiro', partnerOf],
    ]) {
      for (const r of cutPartition(family, countBy(ps, key), secretOrder(monday, 'cadastros_semana', family))) {
        metrics.push({ metric: 'cadastros_semana', ...r })
      }
    }
    return { week: monday, metrics }
  }

  const payload = (dates, mondays, live) => ({
    payloadVersion: 1,
    generatedAt: new Date().toISOString(),
    timeZone: FUSO,
    days: dates.map(dayRows),
    weeks: mondays.map((m) => weekRows(m, live)),
  })

  /** As UTMs vivas da marca no Nevo (GET app-utms). Falhou: null, e toda tupla vai como utm:outras. */
  async function liveUtms(token) {
    try {
      const r = await fetch(`${api}/public/marketing/app-utms`, {
        headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': '10.64.0.3' },
      })
      if (!r.ok) return null
      return new Set((await r.json()).tuples ?? [])
    } catch {
      return null
    }
  }

  async function post(token, body) {
    const r = await fetch(`${api}/public/marketing/app-metrics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-forwarded-for': '10.64.0.2' },
      body: JSON.stringify(body),
    })
    let json = null
    try {
      json = await r.json()
    } catch {}
    if (!r.ok) {
      const msg = Array.isArray(json?.message) ? json.message.join('; ') : json?.message
      throw new Error(`Nevo respondeu ${r.status}: ${msg ?? ''}`)
    }
    return json
  }

  /**
   * Como o `NevoEnvioCron.rodar`: UM envio com os 3 dias e a última semana fechada, e o
   * histórico de 90 dias só na primeira vez que der certo (cada lote de 30 leva as semanas
   * fechadas que começam nele).
   */
  async function send(token) {
    const live = await liveUtms(token)
    const dias = [addDays(ontem, -2), addDays(ontem, -1), ontem]
    const main = await post(token, payload(dias, [semana.from], live))
    let historico = null
    if (!historySent) {
      const todos = []
      for (let i = 89; i >= 0; i--) todos.push(addDays(dias[0], -1 - i))
      let envios = 0
      let semanas = 0
      for (let i = 0; i < todos.length; i += 30) {
        const lote = todos.slice(i, i + 30)
        const mondays = lote.filter((d) => weekday(d) === 1 && d < semana.from)
        await post(token, payload(lote, mondays, live))
        envios++
        semanas += mondays.length
      }
      historySent = true
      historico = { dias: todos.length, semanas, envios }
    }
    return { executou: true, dias, semanas: [semana.from], linhas: main.rows, historico, utmsVivas: live ? live.size : null }
  }

  /** O corpo que o app mandaria agora (para o roteiro conferir ou estragar de propósito). */
  const preview = async (token) => payload([addDays(ontem, -2), addDays(ontem, -1), ontem], [semana.from], await liveUtms(token))

  return { ontem, hoje, semana, base, signup, send, preview }
}

module.exports = { createFakeApp, ymdBr, addDays, lastClosedSunday, mondayOf }
