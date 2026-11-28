// Testes da ordem do board do mês (src/features/tasks/board-order.ts): a ordem
// de entrega ("Ordem: Entrega", o padrão) e o índice que o `PATCH /move` recebe.
//
// O front não tem vitest. Este roteiro compila o MÓDULO DE VERDADE com o
// esbuild do próprio projeto (alias `@` -> src, Vue junto no pacote) e roda
// com o `node:test`. Nada de cópia da regra aqui dentro: se a função mudar,
// é ela que estes testes exercitam.
//
// Uso (de qualquer pasta):
//   node scripts/harness/board-order.test.mjs
// Também confere que a ordem não muda com o fuso: roda a mesma conta em
// processos filhos com TZ de São Paulo, UTC, Tóquio, Kiritimati (+14) e
// Pago Pago (-11) e compara.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const require = createRequire(path.join(ROOT, 'package.json'))
const esbuild = require('esbuild')

async function loadBoardOrder() {
  const out = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/features/tasks/board-order.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    alias: { '@': path.join(ROOT, 'src') },
    define: {
      'process.env.NODE_ENV': '"production"',
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
    logLevel: 'silent',
  })
  const code = out.outputFiles[0].text
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
}

const { sortByDue, dueInsertIndex, compareByDue, dueDayNumber, resolveDropIndex } =
  await loadBoardOrder()

// ── Dados ───────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0')
/** Dia LOCAL de hoje + `offset`, gravado como a API grava (meio-dia UTC). */
function due(offset) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T12:00:00.000Z`
}
const card = (id, dueDate, priorityNumber = 0, extra = {}) => ({ id, dueDate, priorityNumber, ...extra })
const ids = (list) => list.map((t) => t.id)

/** Mesma conta com datas fixas: é o que os processos filhos comparam entre fusos. */
function fingerprint() {
  const fixed = [
    card('futura', '2026-11-20T12:00:00.000Z', 1),
    card('sem-data', null, 4),
    card('hoje-baixa', '2026-11-06T12:00:00.000Z', 1),
    card('meia-noite-utc', '2026-11-06T00:00:00.000Z', 3),
    card('atrasada', '2026-11-03T12:00:00.000Z', 0),
    card('so-dia', '2026-11-06', 2),
    card('fim-do-dia-utc', '2026-11-06T23:59:59.000Z', 4),
    card('virada', '2026-11-07T02:00:00.000Z', 0),
  ]
  return JSON.stringify({
    order: ids(sortByDue(fixed)),
    days: fixed.map((t) => dueDayNumber(t.dueDate)),
    insert: dueInsertIndex(sortByDue(fixed), card('x', '2026-11-06T12:00:00.000Z', 2)),
  })
}

if (process.argv.includes('--fingerprint')) {
  process.stdout.write(fingerprint())
} else {
  // ── Ordem de entrega ──────────────────────────────────────────────────────
  test('atrasada, hoje e futura no topo, nessa ordem; sem data no fim', () => {
    const column = [
      card('futura', due(10), 1),
      card('sem-data', null, 3),
      card('hoje', due(0), 1),
      card('atrasada', due(-3), 0),
      card('amanha', due(1), 0),
    ]
    assert.deepEqual(ids(sortByDue(column)), ['atrasada', 'hoje', 'amanha', 'futura', 'sem-data'])
  })

  test('no mesmo dia, a prioridade mais alta primeiro (escala do task-meta: 4 e 5 são Urgente)', () => {
    const column = [
      card('baixa', due(0), 1),
      card('urgente-5', due(0), 5),
      card('alta', due(0), 3),
      card('urgente-4', due(0), 4),
      card('sem-prioridade', due(0), 0),
    ]
    // 5 e 4 empatam (mesmo nível): fica a ordem da lista, que é a manual.
    assert.deepEqual(ids(sortByDue(column)), ['urgente-5', 'urgente-4', 'alta', 'baixa', 'sem-prioridade'])
  })

  test('prioridade fora da escala vira o nível do task-meta (7 é Urgente, -1 e lixo são Sem)', () => {
    const column = [card('lixo', due(0), 'abc'), card('negativa', due(0), -1), card('sete', due(0), 7), card('media', due(0), 2)]
    assert.deepEqual(ids(sortByDue(column)), ['sete', 'media', 'lixo', 'negativa'])
  })

  test('a prioridade só desempata o dia: Urgente de amanhã vem depois de Baixa de hoje', () => {
    const column = [card('urgente-amanha', due(1), 4), card('baixa-hoje', due(0), 1)]
    assert.deepEqual(ids(sortByDue(column)), ['baixa-hoje', 'urgente-amanha'])
  })

  test('empate de dia e prioridade fica na ordem manual (a da lista recebida)', () => {
    const column = [card('a', due(2), 2), card('b', due(2), 2), card('c', due(2), 2)]
    assert.deepEqual(ids(sortByDue(column)), ['a', 'b', 'c'])
    assert.deepEqual(ids(sortByDue([...column].reverse())), ['c', 'b', 'a'])
  })

  test('o desempate manual é o índice da lista, não o campo position (que fica velho no otimismo)', () => {
    const column = [
      card('primeiro', due(1), 2, { position: 9 }),
      card('segundo', due(1), 2, { position: 0 }),
    ]
    assert.deepEqual(ids(sortByDue(column)), ['primeiro', 'segundo'])
  })

  test('sem data: entre si, a prioridade mais alta primeiro, depois a ordem manual', () => {
    const column = [card('s0', null, 0), card('s3', undefined, 3), card('d', due(30), 0), card('s0b', null, 0)]
    assert.deepEqual(ids(sortByDue(column)), ['d', 's3', 's0', 's0b'])
  })

  test('data inválida conta como sem data', () => {
    const column = [card('invalida', 'não é data', 4), card('ok', due(5), 0)]
    assert.equal(dueDayNumber('não é data'), null)
    assert.deepEqual(ids(sortByDue(column)), ['ok', 'invalida'])
  })

  test('o dia é o que o card mostra (componente UTC): meia-noite, meio-dia e só o dia empatam', () => {
    const a = card('meia-noite', '2026-11-06T00:00:00.000Z', 1)
    const b = card('meio-dia', '2026-11-06T12:00:00.000Z', 1)
    const c = card('so-dia', '2026-11-06', 1)
    assert.equal(compareByDue(a, b), 0)
    assert.equal(compareByDue(b, c), 0)
    assert.equal(dueDayNumber(b.dueDate), Date.UTC(2026, 10, 6) / 86_400_000)
  })

  test('rotina virtual (rec:*) e card otimista (tmp:*) entram pela data deles', () => {
    // Na lista do board eles vêm DEPOIS dos reais; a data é que decide.
    const column = [
      card('real-futura', due(9), 2),
      card('real-sem-data', null, 0),
      card('tmp:1', null, 0),
      card('rec:regra:2026-11-06', due(0), 2),
      card('rec:outra:2026-11-08', due(2), 0),
    ]
    assert.deepEqual(ids(sortByDue(column)), [
      'rec:regra:2026-11-06',
      'rec:outra:2026-11-08',
      'real-futura',
      'real-sem-data',
      'tmp:1',
    ])
  })

  test('não muda a lista recebida', () => {
    const column = [card('b', due(2)), card('a', due(1))]
    sortByDue(column)
    assert.deepEqual(ids(column), ['b', 'a'])
  })

  test('a ordem não depende do fuso de quem abre (São Paulo, UTC, Tóquio, +14, -11)', () => {
    const here = fingerprint()
    for (const tz of ['America/Sao_Paulo', 'UTC', 'Asia/Tokyo', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--fingerprint'], {
        env: { ...process.env, TZ: tz },
        encoding: 'utf8',
      })
      assert.equal(run.status, 0, `${tz}: ${run.stderr}`)
      assert.equal(run.stdout, here, `fuso ${tz}`)
    }
  })

  // ── Índice do PATCH /move ─────────────────────────────────────────────────
  test('índice: entra depois dos que vêm antes e dos empatados, antes dos que vêm depois', () => {
    const column = sortByDue([
      card('atrasada', due(-2), 0),
      card('hoje-urgente', due(0), 4),
      card('hoje-media', due(0), 2),
      card('amanha', due(1), 0),
      card('sem-data', null, 0),
    ])
    assert.equal(dueInsertIndex(column, card('x', due(0), 2)), 3) // depois de hoje-media (empate)
    assert.equal(dueInsertIndex(column, card('x', due(0), 3)), 2) // entre urgente e média
    assert.equal(dueInsertIndex(column, card('x', due(-5), 0)), 0) // mais atrasada de todas: topo
    assert.equal(dueInsertIndex(column, card('x', due(40), 4)), 4) // antes dos sem data
    assert.equal(dueInsertIndex(column, card('x', null, 0)), 5) // sem data e sem prioridade: fim
    assert.equal(dueInsertIndex(column, card('x', null, 3)), 4) // sem data, mas antes do sem prioridade
    assert.equal(dueInsertIndex([], card('x', due(1), 1)), 0)
  })

  test('índice: conta a coluna INTEIRA (é o que vale com filtro ligado)', () => {
    // A tela filtrada mostra 2 cards; a coluna tem 5. O índice é o da coluna.
    const full = sortByDue([
      card('a', due(-1), 0),
      card('escondido-1', due(0), 0),
      card('b', due(1), 0),
      card('escondido-2', due(2), 0),
      card('escondido-3', due(3), 0),
    ])
    assert.equal(dueInsertIndex(full, card('x', due(2), 0)), 4)
  })

  test('índice: tarefa criada inline (sem prazo, sem prioridade) sempre no fim', () => {
    const column = [card('a', null, 0), card('b', due(1), 4), card('c', null, 2), card('d', due(-9), 0)]
    assert.equal(dueInsertIndex(column, card('nova', null, 0)), column.length)
  })

  // Gerador determinístico: falha reproduz.
  function rng(seed) {
    let s = seed >>> 0
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 2 ** 32
    }
  }
  function randomCard(rand, id) {
    const r = rand()
    const dueDate = r < 0.15 ? null : due(Math.floor(rand() * 21) - 10)
    return card(id, dueDate, Math.floor(rand() * 6))
  }

  test('propriedade: numa coluna em ordem de entrega, inserir no índice mantém a ordem (2000 casos)', () => {
    const rand = rng(20261106)
    for (let n = 0; n < 2000; n++) {
      const size = Math.floor(rand() * 12)
      const column = sortByDue(Array.from({ length: size }, (_, i) => randomCard(rand, `c${i}`)))
      const moved = randomCard(rand, 'x')
      const at = dueInsertIndex(column, moved)
      const after = [...column]
      after.splice(at, 0, moved)
      // A lista com o card no índice já É a ordem de entrega: a tela (que ordena)
      // e o "Manual" (que mostra a lista) mostram o mesmo.
      assert.deepEqual(ids(sortByDue(after)), ids(after), `caso ${n}`)
      // E ele fica depois dos empatados que já estavam (quem chega vai atrás).
      for (let i = at + 1; i < after.length; i++) assert.ok(compareByDue(after[i], moved) > 0, `caso ${n}`)
    }
  })

  test('propriedade: o índice é sempre o número de cards que vêm antes ou empatam (2000 casos)', () => {
    const rand = rng(42)
    for (let n = 0; n < 2000; n++) {
      const column = Array.from({ length: Math.floor(rand() * 12) }, (_, i) => randomCard(rand, `c${i}`))
      const moved = randomCard(rand, 'x')
      const expected = column.filter((t) => compareByDue(t, moved) <= 0).length
      assert.equal(dueInsertIndex(column, moved), expected, `caso ${n}`)
    }
  })

  // ── resolveDropIndex (o arraste na ordem Manual) continua igual ───────────
  test('resolveDropIndex: os exemplos documentados seguem valendo', () => {
    assert.equal(resolveDropIndex(['A', 'B', 'C', 'D'], ['B', 'X', 'D'], 'X', 1), 2)
    assert.equal(resolveDropIndex(['A', 'B', 'C', 'D'], ['X', 'B', 'D'], 'X', 0), 1)
    assert.equal(resolveDropIndex(['A', 'B'], ['X'], 'X', 0), 0)
    assert.equal(resolveDropIndex(['A', 'B'], ['B', 'rec:1', 'X'], 'X', 2), 2)
    assert.equal(resolveDropIndex(['A', 'B'], ['A', 'B', 'X'], 'X', 2), 2)
  })
}
