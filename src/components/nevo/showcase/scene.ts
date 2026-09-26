/**
 * Cena da vitrine 3D (spec sequencia-diaria-nevo, T8): estúdio com notebook e
 * celular, o Nevo e uma câmera com keyframes, tudo tocando em loop.
 *
 * ÚNICO ponto de entrada do three.js no app. `NevoShowcase.vue` importa este
 * módulo por `import()` e só depois de confirmar que existe WebGL2, então o
 * three (~600 KB) fica num chunk próprio que só baixa quando a vitrine entra
 * na tela. Nenhum arquivo fora de `components/nevo/showcase/` pode importar
 * `three`, senão ele volta para o chunk de alguma rota.
 *
 * Um único requestAnimationFrame: roda em loop só enquanto está tocando. Parado,
 * cada mudança (textura que chegou, resize, pulo de capítulo) agenda UM quadro
 * e o laço morre de novo. A timeline gsap não usa o ticker dela: o tempo é
 * empurrado daqui com `tl.totalTime()`.
 */
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  Color,
  DirectionalLight,
  HemisphereLight,
  LoadingManager,
  Mesh,
  MeshBasicMaterial,
  PCFShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  ShadowMaterial,
  TextureLoader,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
  type Texture,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { StreakMe, StreakTeam } from '@/service/streak/streak-service'
import { readToken } from '@/plugins/tokens'
import { SHOWCASE_CHAPTERS, SHOWCASE_DURATION, chapterAt } from './chapters'
import {
  createContactShadowTexture,
  createDeviceMaterials,
  createDisposer,
  createLaptop,
  createPhone,
  gray,
  LAPTOP_SCREEN,
} from './devices'
import { billboardMaterial, createNevoActors } from './nevo-actors'
import { createPhoneScreen, createTeamCard, TEAM_H, TEAM_W } from './phone-screen'
import { buildTimeline, initialState } from './timeline'

export interface ShowcaseOptions {
  /** Primeiro quadro com as texturas principais carregadas. */
  onReady?: () => void
  /** O navegador derrubou o contexto WebGL (GPU reiniciou, aba em segundo plano demais). */
  onContextLost?: () => void
}

export interface ShowcaseHandle {
  play(): void
  pause(): void
  /** Pula para o capítulo: no início dele se tocando, no quadro "pôster" se parado. */
  seek(chapter: number): void
  setData(streak: StreakMe | null | undefined, team: StreakTeam | null | undefined): void
  resize(width: number, height: number): void
  /** Relê os tokens do tema (confete, sombra do chão) depois de trocar tema. */
  refreshTheme(): void
  dispose(): void
  onChapter(cb: (index: number) => void): () => void
  onProgress(cb: (index: number, progress: number) => void): () => void
}

const REF_ASPECT = 16 / 9
const PHONE_POS = new Vector3(2.5, 1.0, 0.55)
/** Onde o card do time nasce (na tela) e onde termina (fora dela), no espaço da tampa. */
const TEAM_FROM = new Vector3(0.62, LAPTOP_SCREEN.y, 0.01)
const TEAM_TO = new Vector3(0.78, LAPTOP_SCREEN.y + 0.04, 0.62)
const TEAM_SIZE = 1.5

/**
 * `high-performance` pede a GPU dedicada quando existe. Alguns drivers recusam
 * o contexto com esse pedido; aí tenta de novo sem preferência. Se falhar de
 * novo, a exceção sobe e o componente mostra o pôster em CSS.
 */
function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const params = { canvas, antialias: true, alpha: true }
  try {
    return new WebGLRenderer({ ...params, powerPreference: 'high-performance' })
  } catch {
    return new WebGLRenderer(params)
  }
}

/** Alfa de uma cor `rgba(...)` (o token `--nevo-floor`). */
function alphaOf(css: string, fallback: number): number {
  const m = /rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(css)
  const v = m ? Number(m[1]) : NaN
  return Number.isFinite(v) ? v : fallback
}

/**
 * FOV vertical que mantém o enquadramento horizontal de 16:9 quando o
 * contêiner fica mais estreito (celular, coluna do dashboard): sem isso, no
 * mobile o notebook e o celular saem cortados pelas laterais.
 */
function fitFov(baseDeg: number, aspect: number): number {
  if (aspect >= REF_ASPECT) return baseDeg
  const half = (baseDeg * Math.PI) / 360
  const fov = (2 * Math.atan((Math.tan(half) * REF_ASPECT) / aspect) * 180) / Math.PI
  return Math.min(fov, 62)
}

function disposeMaterial(m: Material) {
  for (const value of Object.values(m)) {
    if (value && typeof value === 'object' && (value as Texture).isTexture) {
      ;(value as Texture).dispose()
    }
  }
  m.dispose()
}

export function createShowcase(
  canvas: HTMLCanvasElement,
  opts: ShowcaseOptions = {},
): ShowcaseHandle {
  const renderer = createRenderer(canvas)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearAlpha(0)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1
  renderer.shadowMap.enabled = true
  // A task pedia PCFSoftShadowMap, mas ele foi REMOVIDO do three (r18x avisa e
  // cai para PCF). PCF com `shadow.radius` é o substituto oficial e dá a mesma
  // sombra macia de estúdio.
  renderer.shadowMap.type = PCFShadowMap

  // Estado do laço declarado ANTES de qualquer fábrica: texturas e fontes que
  // chegam chamam `invalidate()`, e ela não pode tocar variável ainda não criada.
  let raf = 0
  let playing = false
  let last = 0
  let chapter = -1
  let ready = false
  let disposed = false
  let aspect = REF_ASPECT
  let lastFov = 0
  const chapterCbs = new Set<(i: number) => void>()
  const progressCbs = new Set<(i: number, p: number) => void>()

  const { track, disposeAll } = createDisposer()
  const scene = new Scene()

  // Reflexos de estúdio: o alumínio e o vidro precisam de algo para refletir,
  // senão metal vira cinza chapado. RoomEnvironment é procedural (zero download).
  const pmrem = new PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const envTarget = track(pmrem.fromScene(room, 0.04))
  room.dispose()
  pmrem.dispose()
  scene.environment = envTarget.texture
  scene.environmentIntensity = 0.6

  const camera = new PerspectiveCamera(30, REF_ASPECT, 0.1, 60)
  const target = new Vector3()

  // ── Luzes: sol com sombra, céu fraco e contraluz BRANCA (nada de luz colorida) ──
  const white = gray(1)
  const key = new DirectionalLight(white, 2.0)
  key.position.set(-4.5, 8, 5.5)
  key.target.position.set(0.5, 0, 0)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.radius = 5
  key.shadow.bias = -0.0005
  key.shadow.normalBias = 0.02
  Object.assign(key.shadow.camera, { left: -5.5, right: 5.5, top: 5, bottom: -5, near: 1, far: 25 })
  key.shadow.camera.updateProjectionMatrix()
  scene.add(key, key.target)
  scene.add(new HemisphereLight(white, gray(0.3), 0.35))
  const rim = new DirectionalLight(white, 1.3)
  rim.position.set(5, 4, -6)
  scene.add(rim)

  // ── Chão invisível que só recebe sombra (o fundo é o card, via --surface) ──
  const floorMat = track(new ShadowMaterial({ opacity: 0.3 }))
  const floor = new Mesh(track(new PlaneGeometry(30, 30)), floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const blob = createContactShadowTexture(track)
  const contactMat = track(
    new MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, opacity: 0.3 }),
  )
  const contactGeo = track(new PlaneGeometry(1, 1))
  const addContact = (x: number, z: number, w: number, d: number, strength: number) => {
    const m = new Mesh(contactGeo, contactMat.clone())
    track(m.material)
    m.rotation.x = -Math.PI / 2
    m.position.set(x, 0.002, z)
    m.scale.set(w, d, 1)
    m.userData.strength = strength
    scene.add(m)
    return m
  }
  const contacts = [
    addContact(0, 0, 4.2, 3.2, 0.9),
    addContact(PHONE_POS.x, PHONE_POS.z, 1.1, 0.5, 0.45),
  ]

  // ── Carregamento ──
  const manager = new LoadingManager()
  const loader = new TextureLoader(manager)
  const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())

  // ── Aparelhos ──
  const mats = createDeviceMaterials(track)
  const laptop = createLaptop(track, mats, anisotropy)
  scene.add(laptop.group)
  track(
    loader.load('/showcase/dashboard.webp', (tex) => {
      if (disposed) return
      laptop.setScreen(tex)
      invalidate()
    }),
  )

  const phoneScreen = createPhoneScreen(() => invalidate())
  const phoneTex = track(new CanvasTexture(phoneScreen.canvas))
  phoneTex.colorSpace = SRGBColorSpace
  phoneTex.anisotropy = anisotropy
  const phone = createPhone(track, mats, phoneTex)
  phone.group.position.copy(PHONE_POS)
  scene.add(phone.group)

  // Card "Seu time": filho da tampa, então sai da tela acompanhando a inclinação dela.
  const teamCard = createTeamCard(() => {
    teamTex.needsUpdate = true
    invalidate()
  })
  const teamTex = track(new CanvasTexture(teamCard.canvas))
  teamTex.colorSpace = SRGBColorSpace
  teamTex.premultiplyAlpha = true
  teamTex.anisotropy = anisotropy
  const teamMesh = new Mesh(
    track(new PlaneGeometry(TEAM_SIZE, (TEAM_SIZE * TEAM_H) / TEAM_W)),
    track(billboardMaterial(teamTex)),
  )
  teamMesh.visible = false
  teamMesh.renderOrder = 4
  laptop.lid.add(teamMesh)

  const actors = createNevoActors({ loader, track, anisotropy, blob })
  scene.add(actors.group)

  // ── Timeline ──
  const state = initialState()
  const tl = buildTimeline(state)
  let total = SHOWCASE_CHAPTERS[0]!.poster
  tl.totalTime(total)

  // ── Tema ──
  function refreshTheme() {
    const floorAlpha = alphaOf(readToken('--nevo-floor', 'rgba(0,0,0,0.3)'), 0.3)
    floorMat.opacity = Math.min(0.6, floorAlpha * 1.1)
    for (const c of contacts) {
      ;(c.material as MeshBasicMaterial).opacity = floorAlpha * (c.userData.strength as number)
    }
    actors.setFloorAlpha(floorAlpha * 0.9)
    const names = [
      '--accent',
      '--streak-flame',
      '--tier-lendario',
      '--tier-determinado',
      '--tier-especialista',
      '--status-done',
      '--status-todo',
      '--brand-body',
    ]
    const colors = names
      .map((n) => readToken(n))
      .filter(Boolean)
      .map((css) => {
        try {
          return new Color(css)
        } catch {
          return null
        }
      })
      .filter((c): c is Color => c !== null)
    actors.setConfettiColors(colors.length ? colors : [gray(0.85)])
    invalidate()
  }
  refreshTheme()

  // ── Laço ──
  function applyState(t: number) {
    // Câmera em esféricas + um "respiro" de câmera na mão. Os períodos dividem
    // o loop de 22 s, então a emenda final -> início continua sem salto.
    const az = state.az + 0.012 * Math.sin((2 * Math.PI * t) / (SHOWCASE_DURATION / 2))
    const el = state.el + 0.006 * Math.sin((2 * Math.PI * t) / (SHOWCASE_DURATION / 3))
    target.set(state.tx, state.ty, state.tz)
    camera.position.set(
      target.x + state.dist * Math.sin(az) * Math.cos(el),
      target.y + state.dist * Math.sin(el),
      target.z + state.dist * Math.cos(az) * Math.cos(el),
    )
    const fov = fitFov(state.fov, aspect)
    if (fov !== lastFov || camera.aspect !== aspect) {
      lastFov = fov
      camera.fov = fov
      camera.aspect = aspect
      camera.updateProjectionMatrix()
    }
    camera.lookAt(target)

    phone.group.rotation.set(state.phonePitch, state.phoneYaw, 0)
    phone.group.position.y =
      PHONE_POS.y + 0.035 * Math.sin((2 * Math.PI * t) / (SHOWCASE_DURATION / 4))
    if (
      phoneScreen.drawFrame({
        count: state.count,
        missions: state.missions,
        todayLit: state.todayLit,
      })
    ) {
      phoneTex.needsUpdate = true
    }

    const k = state.teamCard
    teamMesh.visible = k > 0.002
    if (teamMesh.visible) {
      teamMesh.position.lerpVectors(TEAM_FROM, TEAM_TO, Math.min(1, k))
      teamMesh.scale.setScalar(Math.max(0.001, 0.25 + 0.75 * k))
      teamMesh.rotation.set(0, -0.12 * k, 0)
    }

    actors.update(state, t, camera)
  }

  function emit(t: number) {
    const idx = chapterAt(t)
    if (idx !== chapter) {
      chapter = idx
      chapterCbs.forEach((cb) => cb(idx))
    }
    const ch = SHOWCASE_CHAPTERS[idx]!
    const p = Math.min(1, Math.max(0, (t - ch.start) / (ch.end - ch.start)))
    progressCbs.forEach((cb) => cb(idx, p))
  }

  function frame(now: number) {
    raf = 0
    if (disposed) return
    if (playing) {
      // Teto de 50 ms por quadro: voltar de outra aba não pula meio capítulo.
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0
      last = now
      total += dt
      tl.totalTime(total)
    }
    const t = tl.time()
    applyState(t)
    renderer.render(scene, camera)
    emit(t)
    if (playing) raf = requestAnimationFrame(frame)
  }

  function invalidate() {
    if (!raf && !disposed) raf = requestAnimationFrame(frame)
  }

  function markReady() {
    if (ready || disposed) return
    ready = true
    invalidate()
    // Um quadro depois do render, para o pôster em CSS sair só com a cena na tela.
    requestAnimationFrame(() => {
      if (!disposed) opts.onReady?.()
    })
  }
  manager.onLoad = markReady
  // Rede de segurança: se algum sprite demorar, a cena aparece mesmo assim.
  const readyTimer = window.setTimeout(markReady, 6000)

  const onLost = () => {
    playing = false
    opts.onContextLost?.()
  }
  canvas.addEventListener('webglcontextlost', onLost)

  let lastSig = ''

  return {
    play() {
      if (playing || disposed) return
      playing = true
      last = 0
      invalidate()
    },
    pause() {
      playing = false
      // O quadro já agendado (se houver) desenha uma última vez e o laço para.
    },
    seek(index) {
      const ch = SHOWCASE_CHAPTERS[index]
      if (!ch || disposed) return
      const iterationStart = total - tl.time()
      total = iterationStart + ch.start + (playing ? 0 : ch.poster)
      tl.totalTime(total)
      last = 0
      invalidate()
    },
    setData(streak, team) {
      // Refetch do Vue Query devolve objeto novo com os mesmos valores: só
      // redesenha as telas (e sobe textura) quando algo visível mudou.
      const sig = JSON.stringify([
        streak?.current,
        streak?.securedToday,
        streak?.points?.week,
        streak?.week?.map((d) => [d.secured, d.rest, d.perfect, d.isToday]),
        streak?.missions?.map((m) => [m.label, m.hint, m.current, m.done]),
        team?.summary,
        team?.members
          ?.slice(0, 4)
          .map((m) => [
            m.user.id,
            m.user.name,
            m.isMe,
            m.current,
            m.securedToday,
            m.todayIsRest,
            m.points.week,
          ]),
      ])
      if (sig === lastSig) return
      lastSig = sig
      phoneScreen.setData(streak)
      teamCard.setData(team, streak)
      invalidate()
    },
    resize(width, height) {
      if (disposed || width <= 0 || height <= 0) return
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(width, height, false)
      aspect = width / height
      invalidate()
    },
    refreshTheme,
    dispose() {
      if (disposed) return
      disposed = true
      playing = false
      // O listener sai ANTES de tudo: `forceContextLoss` (lá embaixo) dispara
      // `webglcontextlost`, e isso não pode virar "a GPU caiu, mostre o
      // pôster" num componente que está desmontando.
      canvas.removeEventListener('webglcontextlost', onLost)
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      window.clearTimeout(readyTimer)
      manager.onLoad = () => {}
      tl.kill()
      chapterCbs.clear()
      progressCbs.clear()
      phoneScreen.dispose()
      teamCard.dispose()
      actors.dispose()
      scene.traverse((obj: Object3D) => {
        const mesh = obj as Mesh
        if (!mesh.isMesh) return
        mesh.geometry?.dispose()
        const mat = mesh.material
        if (Array.isArray(mat)) mat.forEach(disposeMaterial)
        else if (mat) disposeMaterial(mat)
      })
      disposeAll()
      scene.environment = null
      scene.clear()
      // Libera o contexto na hora (o navegador limita ~16 vivos por aba e a home
      // é revisitada muito). Se ele já caiu sozinho, não há o que derrubar.
      const lostAlready = renderer.getContext().isContextLost()
      renderer.dispose()
      if (!lostAlready) renderer.forceContextLoss()
    },
    onChapter(cb) {
      chapterCbs.add(cb)
      if (chapter !== -1) cb(chapter)
      return () => chapterCbs.delete(cb)
    },
    onProgress(cb) {
      progressCbs.add(cb)
      return () => progressCbs.delete(cb)
    },
  }
}
