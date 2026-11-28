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

// ── Nevo animado (camadas de imagem com os sprites do mascote) ──────────────
//
// O Lottie aceita camada de imagem: os sprites WebP de `public/brand/nevo/`
// (os mesmos da sequência) entram como assets e ganham movimento de verdade,
// com antecipação, squash/stretch e pouso. Carregam do próprio domínio
// (`img-src 'self'` da CSP).

const NEVO = '/brand/nevo/'
const STAGE = 200
const EASE_IN = { o: { x: [0.55], y: [0] }, i: { x: [1], y: [0.45] } }
const EASE_IO = { o: { x: [0.45], y: [0] }, i: { x: [0.55], y: [1] } }

const SPRITE_SIZE = {
  'comemorando.webp': [238, 290],
  'victory.webp': [307, 325],
  'confuso.webp': [205, 304],
  'sad.webp': [222, 317],
  'extra-confete.webp': [114, 123],
  'ui-estrela.webp': [109, 109],
  'extra-duvida.webp': [72, 121],
}

function imageAsset(file, idx) {
  const [w, h] = SPRITE_SIZE[file]
  return { id: `img_${idx}`, w, h, u: NEVO, p: file, e: 0 }
}

/** Camada de imagem com âncora no pé (bottom center) ou no centro. */
function imageLayer(ind, asset, { p, s, r = still(0), o = still(100), anchor = 'bottom', ip = 0, op }) {
  const a = anchor === 'bottom' ? [asset.w / 2, asset.h, 0] : [asset.w / 2, asset.h / 2, 0]
  return {
    ddd: 0,
    ind,
    ty: 2,
    nm: asset.p,
    refId: asset.id,
    sr: 1,
    ks: { o, r, p, a: still(a), s },
    ao: 0,
    ip,
    op,
    st: 0,
    bm: 0,
  }
}

/** Brilho que aparece, cresce e some num ponto (estrela ou confete). */
function twinkle(ind, asset, at, [x, y], size, op, spin = 0) {
  return imageLayer(ind, asset, {
    anchor: 'center',
    op,
    p: still([x, y, 0]),
    s: anim([
      [at, [0, 0, 100], OVERSHOOT],
      [at + 10, [size, size, 100], SETTLE],
      [at + 22, [size * 0.8, size * 0.8, 100], EASE_IN],
      [at + 34, [0, 0, 100]],
    ]),
    r: anim([
      [at, spin * -1, EASE_OUT],
      [at + 34, spin],
    ]),
    o: anim([
      [at, 0, EASE_OUT],
      [at + 4, 100],
      [at + 26, 100, EASE_IN],
      [at + 34, 0],
    ]),
  })
}

/** "Tudo em dia": antecipa, pula esticado, pousa amassado, assenta. */
function nevoCelebrate(name, sprite) {
  const op = 120
  const assets = [imageAsset(sprite, 0), imageAsset('extra-confete.webp', 1), imageAsset('ui-estrela.webp', 2)]
  const S = 50
  const ground = 188
  const nevo = imageLayer(1, assets[0], {
    op,
    p: anim([
      [0, [100, ground, 0], EASE_IO],
      [8, [100, ground, 0], EASE_OUT],
      [24, [100, ground - 44, 0], EASE_IN],
      [42, [100, ground, 0], EASE_OUT],
      [54, [100, ground - 6, 0], EASE_IN],
      [64, [100, ground, 0]],
    ]),
    s: anim([
      [0, [S, S, 100], EASE_IO],
      [8, [S * 1.12, S * 0.86, 100], EASE_OUT],
      [18, [S * 0.92, S * 1.1, 100], EASE_IO],
      [30, [S, S, 100], EASE_IN],
      [42, [S * 1.14, S * 0.84, 100], EASE_OUT],
      [54, [S * 0.96, S * 1.04, 100], SETTLE],
      [64, [S, S, 100]],
    ]),
  })
  const layers = [
    twinkle(2, assets[2], 26, [42, 58], 22, op, 30),
    twinkle(3, assets[2], 40, [160, 46], 18, op, -30),
    twinkle(4, assets[2], 58, [150, 112], 14, op, 20),
    twinkle(5, assets[1], 28, [56, 104], 34, op, -25),
    twinkle(6, assets[1], 34, [146, 86], 30, op, 25),
    nevo,
  ]
  return { v: '5.7.4', fr: FR, ip: 0, op, w: STAGE, h: STAGE, nm: name, ddd: 0, assets, layers }
}

/** Estado vazio: o Nevo confuso balança e o "?" sobe e boia (em loop). */
function nevoEmpty(name) {
  const op = 180
  const assets = [imageAsset('confuso.webp', 0), imageAsset('extra-duvida.webp', 1)]
  const S = 46
  const nevo = imageLayer(1, assets[0], {
    op,
    p: still([100, 192, 0]),
    s: anim([
      [0, [S, S, 100], EASE_IO],
      [90, [S * 1.02, S * 0.98, 100], EASE_IO],
      [180, [S, S, 100]],
    ]),
    r: anim([
      [0, -4, EASE_IO],
      [90, 4, EASE_IO],
      [180, -4],
    ]),
  })
  const question = imageLayer(2, assets[1], {
    anchor: 'center',
    op,
    p: anim([
      [0, [150, 54, 0], EASE_IO],
      [90, [150, 44, 0], EASE_IO],
      [180, [150, 54, 0]],
    ]),
    s: anim([
      [0, [34, 34, 100], EASE_IO],
      [90, [38, 38, 100], EASE_IO],
      [180, [34, 34, 100]],
    ]),
    r: anim([
      [0, 8, EASE_IO],
      [90, -6, EASE_IO],
      [180, 8],
    ]),
  })
  return { v: '5.7.4', fr: FR, ip: 0, op, w: STAGE, h: STAGE, nm: name, ddd: 0, assets, layers: [question, nevo] }
}

/** Deploy que falhou: entra com pop e dá uma tremidinha de "ops". */
function nevoFail(name) {
  const op = 90
  const assets = [imageAsset('sad.webp', 0)]
  const S = 48
  const nevo = imageLayer(1, assets[0], {
    op,
    p: anim([
      [0, [100, 190, 0], EASE_IO],
      [26, [100, 190, 0], EASE_IO],
      [30, [94, 190, 0], EASE_IO],
      [34, [106, 190, 0], EASE_IO],
      [38, [96, 190, 0], EASE_IO],
      [42, [104, 190, 0], EASE_IO],
      [46, [100, 190, 0]],
    ]),
    s: anim([
      [0, [0, 0, 100], OVERSHOOT],
      [16, [S * 1.06, S * 1.06, 100], SETTLE],
      [26, [S, S, 100]],
    ]),
  })
  return { v: '5.7.4', fr: FR, ip: 0, op, w: STAGE, h: STAGE, nm: name, ddd: 0, assets, layers: [nevo] }
}

mkdirSync(OUT, { recursive: true })
const files = {
  'tudo-em-dia.json': seal('tudo-em-dia', CHECK),
  'deploy-ok.json': seal('deploy-ok', CHECK),
  'deploy-falhou.json': seal('deploy-falhou', CROSS, { withSparks: false }),
  'nevo-tudo-em-dia.json': nevoCelebrate('nevo-tudo-em-dia', 'comemorando.webp'),
  'nevo-deploy-ok.json': nevoCelebrate('nevo-deploy-ok', 'victory.webp'),
  'nevo-deploy-falhou.json': nevoFail('nevo-deploy-falhou'),
  'nevo-vazio.json': nevoEmpty('nevo-vazio'),
}
for (const [file, data] of Object.entries(files)) {
  writeFileSync(path.join(OUT, file), JSON.stringify(data))
  console.log('lottie:', file, JSON.stringify(data).length, 'bytes')
}
