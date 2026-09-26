/**
 * O Nevo e companhia dentro da cena 3D: o mascote correndo sobre a mesa, as
 * chamas dos marcos surgindo em arco e o confete do final.
 *
 * Os sprites são arte 2D já sombreada no render, então viram BILLBOARDS
 * (planos que olham para a câmera) com material sem luz: iluminar de novo uma
 * arte que já tem luz pintada deixaria o mascote com cara de recorte. O Nevo
 * gira só no eixo vertical (fica em pé na mesa); as chamas flutuam e encaram a
 * câmera por inteiro.
 *
 * Alfa: as texturas sobem PRÉ-MULTIPLICADAS e o blend é ONE / ONE_MINUS_SRC_ALPHA.
 * Com alfa "reto" o filtro bilinear e o mipmap misturam a cor dos pixels
 * transparentes na borda e o recorte ganha um contorno claro ou escuro.
 * `depthWrite: false` porque são planos translúcidos: eles não devem tapar uns
 * aos outros pelo retângulo, só pelo desenho.
 *
 * Tudo aqui é função do estado da timeline e do instante do loop (nada de
 * física acumulada quadro a quadro): pular capítulo ou voltar ao início
 * reproduz exatamente o mesmo quadro.
 */
import {
  Color,
  CustomBlending,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Camera,
  type Texture,
  type TextureLoader,
} from 'three'
import {
  NEVO_MILESTONES,
  nevoSize,
  nevoSrc,
  type NevoSpriteName,
} from '@/components/nevo/nevo-assets'
import type { Track } from './devices'
import { FLAME_KEYS, type ShowcaseState } from './timeline'

/** Altura do Nevo parado, em unidades da cena (o notebook tem 3,2 de largura). */
const NEVO_HEIGHT = 0.85
const NEVO_PX = NEVO_HEIGHT / nevoSize('idle')[1]
/** Altura de cada chama de marco. */
const FLAME_HEIGHT = 0.52
/**
 * Os frames de corrida da sheet olham para a ESQUERDA (a xícara inclina para
 * esse lado). Correndo para a direita, o sprite é espelhado.
 */
const RUN_FACES_LEFT = true
/** Troca de frame da corrida (s). */
const RUN_FRAME = 0.12

const RUNNER_POSES = [
  'idle',
  'run-1',
  'run-2',
  'victory',
  'jump',
] as const satisfies readonly NevoSpriteName[]
type RunnerPose = (typeof RUNNER_POSES)[number]

/** Arco dos marcos em volta da tela do notebook (centro, raios, ângulos em graus). */
const ARC = { cx: 0, cy: 1.15, z: -1.05, rx: 2.0, ry: 1.12, from: 162, to: 18 }

const CONFETTI_COUNT = 260
/** Duração da chuva de confete; bate com o tween `confetti` da timeline. */
const CONFETTI_SECONDS = 3.4
const CONFETTI_ORIGIN = new Vector3(0.7, 1.35, -0.6)
/** Arrasto linear e gravidade "de papel": sobe rápido, desce flutuando. */
const DRAG = 1.8
const GRAVITY = 3.2

export interface NevoActors {
  group: Group
  update(state: ShowcaseState, time: number, camera: Camera): void
  setConfettiColors(colors: Color[]): void
  setFloorAlpha(alpha: number): void
  dispose(): void
}

/** Material de billboard com alfa pré-multiplicado (ver comentário do arquivo). */
export function billboardMaterial(map: Texture | null): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: DoubleSide,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
  })
}

/** Gerador pseudoaleatório com semente: o confete cai igual em toda volta. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Piece {
  vx: number
  vy: number
  vz: number
  rx: number
  ry: number
  rz: number
  wx: number
  wy: number
  wz: number
  delay: number
  phase: number
  color: number
  size: number
}

export function createNevoActors(opts: {
  loader: TextureLoader
  track: Track
  anisotropy: number
  blob: Texture
}): NevoActors {
  const { loader, track, anisotropy, blob } = opts
  const group = new Group()

  const load = (name: NevoSpriteName): Texture => {
    const tex = track(loader.load(nevoSrc(name)))
    tex.colorSpace = SRGBColorSpace
    tex.premultiplyAlpha = true
    tex.anisotropy = anisotropy
    return tex
  }

  // ── Nevo (pés na origem do plano, para "pisar" na mesa) ──
  const poseTex = Object.fromEntries(RUNNER_POSES.map((p) => [p, load(p)])) as Record<
    RunnerPose,
    Texture
  >
  const footGeo = track(new PlaneGeometry(1, 1))
  footGeo.translate(0, 0.5, 0)
  const runnerMat = track(billboardMaterial(poseTex.idle))
  const runner = new Mesh(footGeo, runnerMat)
  runner.renderOrder = 2
  group.add(runner)

  const shadowMat = track(
    new MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, opacity: 0.3 }),
  )
  const shadowGeo = track(new PlaneGeometry(1, 1))
  const runnerShadow = new Mesh(shadowGeo, shadowMat)
  runnerShadow.rotation.x = -Math.PI / 2
  runnerShadow.renderOrder = 1
  group.add(runnerShadow)
  let floorAlpha = 0.3

  // ── Chamas dos marcos, na ordem 7/14/30/60/100 ──
  const centerGeo = track(new PlaneGeometry(1, 1))
  const flames = NEVO_MILESTONES.map((m, i) => {
    const mesh = new Mesh(centerGeo, track(billboardMaterial(load(m.flame))))
    const [w, h] = nevoSize(m.flame)
    const a =
      ((ARC.from + ((ARC.to - ARC.from) * i) / (NEVO_MILESTONES.length - 1)) * Math.PI) / 180
    const home = new Vector3(ARC.cx + ARC.rx * Math.cos(a), ARC.cy + ARC.ry * Math.sin(a), ARC.z)
    mesh.visible = false
    mesh.renderOrder = 3
    group.add(mesh)
    return { mesh, home, w: (FLAME_HEIGHT * w) / h, h: FLAME_HEIGHT }
  })

  // ── Confete (uma draw call para centenas de pedaços) ──
  const confettiMat = track(
    new MeshStandardMaterial({ side: DoubleSide, roughness: 0.45, metalness: 0.15 }),
  )
  const confetti = new InstancedMesh(
    track(new PlaneGeometry(0.08, 0.045)),
    confettiMat,
    CONFETTI_COUNT,
  )
  // As instâncias se espalham pela cena inteira: a esfera de colisão calculada
  // com a pose do primeiro quadro cortaria pedaços que ainda estão no ar.
  confetti.frustumCulled = false
  confetti.visible = false
  group.add(confetti)

  const rand = mulberry32(20260925)
  const pieces: Piece[] = Array.from({ length: CONFETTI_COUNT }, () => ({
    vx: (rand() * 2 - 1) * 4.2,
    vy: 3.4 + rand() * 3.4,
    vz: 0.9 + rand() * 2.4,
    rx: rand() * Math.PI * 2,
    ry: rand() * Math.PI * 2,
    rz: rand() * Math.PI * 2,
    wx: (rand() * 2 - 1) * 9,
    wy: (rand() * 2 - 1) * 7,
    wz: (rand() * 2 - 1) * 9,
    delay: rand() * 0.28,
    phase: rand() * Math.PI * 2,
    color: Math.floor(rand() * 1000),
    size: 0.75 + rand() * 0.55,
  }))

  const m4 = new Matrix4()
  const q = new Quaternion()
  const e = new Euler()
  const p = new Vector3()
  const s = new Vector3()

  function updateConfetti(progress: number) {
    if (progress <= 0 || progress >= 1) {
      confetti.visible = false
      return
    }
    confetti.visible = true
    const T = progress * CONFETTI_SECONDS
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const c = pieces[i]!
      const t = Math.max(0, T - c.delay)
      // Arrasto linear em forma fechada: posição exata em qualquer instante.
      const k = (1 - Math.exp(-DRAG * t)) / DRAG
      const wobble = 0.14 * Math.sin(t * 5.5 + c.phase)
      p.set(
        CONFETTI_ORIGIN.x + c.vx * k + wobble,
        Math.max(0.012, CONFETTI_ORIGIN.y + (c.vy + GRAVITY / DRAG) * k - (GRAVITY / DRAG) * t),
        CONFETTI_ORIGIN.z + c.vz * k + wobble * 0.5,
      )
      e.set(c.rx + c.wx * t, c.ry + c.wy * t, c.rz + c.wz * t)
      q.setFromEuler(e)
      // Nasce com um "pop" e some encolhendo no último meio segundo.
      const life = Math.min(1, t / 0.08) * Math.min(1, Math.max(0, (CONFETTI_SECONDS - T) / 0.55))
      const k2 = t <= 0 ? 0 : life * c.size
      s.set(k2, k2, k2)
      m4.compose(p, q, s)
      confetti.setMatrixAt(i, m4)
    }
    confetti.instanceMatrix.needsUpdate = true
  }

  function setPose(pose: RunnerPose) {
    const map = poseTex[pose]
    if (runnerMat.map !== map) runnerMat.map = map
    const [w, h] = nevoSize(pose)
    return { w: w * NEVO_PX, h: h * NEVO_PX }
  }

  return {
    group,
    update(state, time, camera) {
      // Nevo
      const mode = Math.round(state.nevoMode)
      let pose: RunnerPose = 'idle'
      let lift = 0
      if (mode === 1) {
        pose = Math.floor(time / RUN_FRAME) % 2 === 0 ? 'run-1' : 'run-2'
        lift = Math.abs(Math.sin((Math.PI * time) / RUN_FRAME)) * 0.045
      } else if (mode === 2) {
        pose = state.nevoHop > 0.04 ? 'jump' : 'victory'
        lift = state.nevoHop * 0.55
      }
      const size = setPose(pose)
      const faceRight = state.nevoFacing >= 0
      const mirror = mode === 1 && faceRight === RUN_FACES_LEFT ? -1 : 1
      // Respiração do parado: período que divide o loop de 22 s (sem salto na emenda).
      const breathe = mode === 0 ? 1 + 0.014 * Math.sin((2 * Math.PI * time) / 2.2) : 1
      runner.scale.set(size.w * mirror, size.h * breathe, 1)
      runner.position.set(state.nevoX, lift, state.nevoZ)
      runner.rotation.y = Math.atan2(
        camera.position.x - state.nevoX,
        camera.position.z - state.nevoZ,
      )
      const shrink = 1 - Math.min(0.45, lift * 0.8)
      runnerShadow.position.set(state.nevoX, 0.003, state.nevoZ)
      runnerShadow.scale.set(0.64 * shrink, 0.24 * shrink, 1)
      shadowMat.opacity = floorAlpha * (1 - Math.min(0.5, lift))

      // Chamas dos marcos
      flames.forEach((f, i) => {
        const k = state[FLAME_KEYS[i]!]
        f.mesh.visible = k > 0.002
        if (!f.mesh.visible) return
        const bob = 0.04 * Math.sin((2 * Math.PI * time) / 2.75 + i * 1.3)
        f.mesh.position.set(f.home.x, f.home.y - 0.25 * (1 - Math.min(1, k)) + bob, f.home.z)
        f.mesh.scale.set(f.w * k, f.h * k, 1)
        f.mesh.quaternion.copy(camera.quaternion)
      })

      updateConfetti(state.confetti)
    },
    setConfettiColors(colors) {
      if (!colors.length) return
      for (let i = 0; i < CONFETTI_COUNT; i++) {
        confetti.setColorAt(i, colors[pieces[i]!.color % colors.length]!)
      }
      if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true
    },
    setFloorAlpha(alpha) {
      floorAlpha = alpha
    },
    dispose() {
      confetti.dispose()
    },
  }
}
