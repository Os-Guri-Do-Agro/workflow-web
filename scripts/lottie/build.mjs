// Gera as animações Lottie do produto em public/lottie/ (spec v2-mobile-e-home, L1).
//
// Desenhadas aqui, em código, de propósito: zero licença de terceiro, poucos KB
// e cores como MARCADORES que o LottiePlayer troca pelos tokens do tema:
//   azul puro  [0,0,1]  -> cor principal (padrão: --success)
//   vermelho   [1,0,0]  -> fundo suave   (padrão: --success a 16% sobre --surface)
//   verde puro [0,1,0]  -> acento        (padrão: --accent)
//
// Uso: node scripts/lottie/build.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/lottie')
const MAIN = [0, 0, 1, 1]
const SOFT = [1, 0, 0, 1]
const ACCENT = [0, 1, 0, 1]

const FR = 60
const SIZE = 120

// Curvas: saída rápida e pouso suave (ease-out exponencial), e uma com leve
// passada do ponto para o "pulo" do círculo.
const EASE_OUT = { o: { x: [0.16], y: [1] }, i: { x: [0.3], y: [1] } }
const OVERSHOOT = { o: { x: [0.2], y: [0] }, i: { x: [0.3], y: [1.35] } }
const SETTLE = { o: { x: [0.4], y: [0] }, i: { x: [0.25], y: [1] } }

const still = (k) => ({ a: 0, k })
/** Keyframes: [[t, valor, curva?], ...]; a curva vale da chave até a próxima. */
const anim = (frames) => ({
  a: 1,
  k: frames.map(([t, s, ease]) => {
    const key = { t, s: Array.isArray(s) ? s : [s] }
    if (ease) {
      key.o = ease.o
      key.i = ease.i
    }
    return key
  }),
})

const transform = (extra = {}) => ({
  ty: 'tr',
  p: still([0, 0]),
  a: still([0, 0]),
  s: still([100, 100]),
  r: still(0),
  o: still(100),
  sk: still(0),
  sa: still(0),
  nm: 'Transform',
  ...extra,
})

const layerKs = (extra = {}) => ({
  o: still(100),
  r: still(0),
  p: still([SIZE / 2, SIZE / 2, 0]),
  a: still([0, 0, 0]),
  s: still([100, 100, 100]),
  ...extra,
})

const shapeLayer = (ind, nm, shapes, ks, op) => ({
  ddd: 0,
  ind,
  ty: 4,
  nm,
  sr: 1,
  ks,
  ao: 0,
  shapes,
  ip: 0,
  op,
  st: 0,
  bm: 0,
})

const stroke = (c, w) => ({ ty: 'st', c: still(c), o: still(100), w: still(w), lc: 2, lj: 2, ml: 4, nm: 'Stroke' })
const fill = (c) => ({ ty: 'fl', c: still(c), o: still(100), r: 1, nm: 'Fill' })
const ellipse = (d) => ({ ty: 'el', p: still([0, 0]), s: still([d, d]), d: 1, nm: 'Ellipse' })
const polyline = (pts, closed = false) => ({
  ty: 'sh',
  ks: still({ i: pts.map(() => [0, 0]), o: pts.map(() => [0, 0]), v: pts, c: closed }),
  nm: 'Path',
})
const trim = (endFrames) => ({ ty: 'tm', s: still(0), e: anim(endFrames), o: still(0), m: 1, nm: 'Trim' })

/** Seis faíscas que saem do círculo quando o símbolo termina de desenhar. */
function sparks(start, color) {
  const groups = []
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 - Math.PI / 2
    const from = [Math.cos(a) * 50, Math.sin(a) * 50]
    const to = [Math.cos(a) * 62, Math.sin(a) * 62]
    groups.push({
      ty: 'gr',
      nm: `spark-${i}`,
      it: [
        ellipse(6),
        fill(color),
        transform({
          p: anim([
            [start, from, EASE_OUT],
            [start + 22, to],
          ]),
          s: anim([
            [start, [100, 100], EASE_OUT],
            [start + 22, [40, 40]],
          ]),
          o: anim([
            [start, 0, EASE_OUT],
            [start + 4, 100, EASE_OUT],
            [start + 22, 0],
          ]),
        }),
      ],
    })
  }
  return groups
}

/**
 * Selo: disco suave que cresce, anel que se desenha, símbolo que se desenha
 * por cima e faíscas no fim. `symbol` são polilinhas em coordenadas do centro.
 */
function seal(name, symbol, { withSparks = true } = {}) {
  const op = 96
  const disc = shapeLayer(
    3,
    'disco',
    [{ ty: 'gr', nm: 'disco', it: [ellipse(88), fill(SOFT), transform()] }],
    layerKs({
      s: anim([
        [0, [0, 0, 100], OVERSHOOT],
        [20, [106, 106, 100], SETTLE],
        [32, [100, 100, 100]],
      ]),
    }),
    op,
  )
  const ring = shapeLayer(
    2,
    'anel',
    [
      {
        ty: 'gr',
        nm: 'anel',
        it: [
          ellipse(88),
          stroke(MAIN, 5),
          trim([
            [2, 0, EASE_OUT],
            [28, 100],
          ]),
          transform({ r: still(-90) }),
        ],
      },
    ],
    layerKs(),
    op,
  )
  const mark = shapeLayer(
    1,
    'simbolo',
    symbol.map((pts, i) => ({
      ty: 'gr',
      nm: `traco-${i}`,
      it: [
        polyline(pts),
        stroke(MAIN, 7),
        trim([
          [18 + i * 8, 0, EASE_OUT],
          [40 + i * 8, 100],
        ]),
        transform(),
      ],
    })),
    layerKs({
      s: anim([
        [36, [100, 100, 100], OVERSHOOT],
        [46, [108, 108, 100], SETTLE],
        [58, [100, 100, 100]],
      ]),
    }),
    op,
  )
  const layers = [mark, ring, disc]
  if (withSparks) layers.unshift(shapeLayer(4, 'faiscas', sparks(40, ACCENT), layerKs(), op))
  return { v: '5.7.4', fr: FR, ip: 0, op, w: SIZE, h: SIZE, nm: name, ddd: 0, assets: [], layers }
}

const CHECK = [
  [
    [-20, 2],
    [-6, 16],
    [22, -14],
  ],
]
const CROSS = [
  [
    [-15, -15],
    [15, 15],
  ],
  [
    [15, -15],
    [-15, 15],
  ],
]

mkdirSync(OUT, { recursive: true })
const files = {
  'tudo-em-dia.json': seal('tudo-em-dia', CHECK),
  'deploy-ok.json': seal('deploy-ok', CHECK),
  'deploy-falhou.json': seal('deploy-falhou', CROSS, { withSparks: false }),
}
for (const [file, data] of Object.entries(files)) {
  writeFileSync(path.join(OUT, file), JSON.stringify(data))
  console.log('lottie:', file, JSON.stringify(data).length, 'bytes')
}
