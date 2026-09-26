/**
 * Mockups 3D da vitrine: notebook e celular modelados com primitivas (sem
 * arquivo .glb para baixar), no espírito dos vídeos de produto do Rotato.
 *
 * Unidades: 1 = ~10 cm. O notebook fica na origem, de frente para +z, apoiado
 * no chão (y = 0). O celular é montado aqui e posicionado pela cena.
 *
 * Cores de material: são propriedades físicas (alumínio, vidro preto), iguais
 * em qualquer tema, então não viram token de tema. O alumínio sai dos metais
 * já existentes em `plugins/tokens.ts` (`--metal-silver*`, os mesmos do pódio)
 * e os pretos/cinzas são escalares via `gray()`, sem hex.
 */
import {
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  type BufferGeometry,
  type Texture,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { themeTokens } from '@/plugins/tokens'

/** Registra algo com `dispose()` para ser liberado no desmonte. */
export type Track = <T extends { dispose(): void }>(resource: T) => T

/**
 * Coletor de recursos da GPU. Cada fábrica registra o que cria; o desmonte da
 * vitrine libera tudo de uma vez, inclusive texturas que não estão presas a
 * nenhum material naquele momento (frames do flipbook fora de uso).
 */
export function createDisposer(): { track: Track; disposeAll: () => void } {
  const owned = new Set<{ dispose(): void }>()
  return {
    track: (resource) => {
      owned.add(resource)
      return resource
    },
    disposeAll: () => {
      owned.forEach((r) => r.dispose())
      owned.clear()
    },
  }
}

/** Cinza neutro a partir de um escalar sRGB (0 = preto, 1 = branco). */
export function gray(v: number): Color {
  return new Color().setRGB(v, v, v, SRGBColorSpace)
}

const METAL = themeTokens.dark['--metal-silver'] ?? 'silver'
const METAL_LO = themeTokens.dark['--metal-silver-lo'] ?? 'gray'

// ─── Helpers de forma ──────────────────────────────────────────────────────────

function roundedRectShape(w: number, h: number, r: number): Shape {
  const x = -w / 2
  const y = -h / 2
  const s = new Shape()
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

/**
 * Plano de cantos arredondados com UV normalizado 0..1. O `ShapeGeometry` gera
 * UV nas coordenadas da forma (em unidades da cena), o que esticaria a textura
 * da tela; aqui ela ocupa o retângulo inteiro, como num display de verdade.
 */
function roundedPlane(w: number, h: number, r: number): BufferGeometry {
  const g = new ShapeGeometry(roundedRectShape(w, h, r), 12)
  const pos = g.attributes.position!
  const uv = g.attributes.uv!
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h)
  }
  uv.needsUpdate = true
  return g
}

function canvasRoundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/**
 * Sombra de contato: mancha radial PRETA com alfa (neutra, nunca colorida).
 * Complementa a sombra do sol, que sozinha deixa objeto "flutuando" sem o
 * escurecido de onde ele encosta no chão.
 */
export function createContactShadowTexture(track: Track): Texture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(0,0,0,1)')
  grad.addColorStop(0.45, 'rgba(0,0,0,0.55)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return track(new CanvasTexture(c))
}

/** Teclas sugeridas: poço escuro com fileiras de teclas, desenhadas uma vez. */
function keyboardTexture(track: Track, anisotropy: number): CanvasTexture {
  const W = 1024
  const H = 368
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = 'rgb(18,19,22)'
  canvasRoundRect(g, 0, 0, W, H, 18)
  g.fill()

  // Larguras relativas por fileira (fn, números, tab, caps, shift, espaço).
  const rows: { widths: number[]; h: number }[] = [
    { widths: Array(14).fill(1), h: 0.6 },
    { widths: [...Array(13).fill(1), 1.5], h: 1 },
    { widths: [1.5, ...Array(13).fill(1)], h: 1 },
    { widths: [1.8, ...Array(11).fill(1), 1.7], h: 1 },
    { widths: [2.3, ...Array(10).fill(1), 2.2], h: 1 },
    { widths: [1, 1, 1, 1.25, 5.3, 1.25, 1, 1, 1, 1], h: 1 },
  ]
  const pad = 14
  const gap = 8
  const unitH = (H - pad * 2 - gap * (rows.length - 1)) / rows.reduce((a, r) => a + r.h, 0)
  let y = pad
  for (const row of rows) {
    const total = row.widths.reduce((a, b) => a + b, 0)
    const unitW = (W - pad * 2 - gap * (row.widths.length - 1)) / total
    let x = pad
    const h = row.h * unitH
    for (const wk of row.widths) {
      const w = wk * unitW
      g.fillStyle = 'rgb(38,40,45)'
      canvasRoundRect(g, x, y, w, h, 6)
      g.fill()
      // Fio de luz na borda de cima: dá volume à tecla sem sombra colorida.
      g.fillStyle = 'rgba(255,255,255,0.06)'
      g.fillRect(x + 4, y + 1, w - 8, 2)
      x += w + gap
    }
    y += h + gap
  }
  const tex = track(new CanvasTexture(c))
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = anisotropy
  return tex
}

// ─── Materiais compartilhados ─────────────────────────────────────────────────

interface DeviceMaterials {
  aluminum: MeshPhysicalMaterial
  aluminumSoft: MeshPhysicalMaterial
  darkMetal: MeshStandardMaterial
  blackGlass: MeshPhysicalMaterial
  screenGlass: MeshPhysicalMaterial
  frame: MeshPhysicalMaterial
}

export function createDeviceMaterials(track: Track): DeviceMaterials {
  return {
    // Alumínio anodizado: metal quase puro, levemente escovado.
    aluminum: track(
      new MeshPhysicalMaterial({
        color: new Color(METAL).multiplyScalar(0.86),
        metalness: 0.9,
        roughness: 0.35,
      }),
    ),
    // Trackpad: um tom abaixo e mais liso, para o recorte aparecer.
    aluminumSoft: track(
      new MeshPhysicalMaterial({
        color: new Color(METAL).multiplyScalar(0.78),
        metalness: 0.85,
        roughness: 0.22,
      }),
    ),
    darkMetal: track(
      new MeshStandardMaterial({ color: gray(0.16), metalness: 0.8, roughness: 0.4 }),
    ),
    // Moldura da tela e verso: vidro preto com verniz (pega o reflexo do estúdio).
    blackGlass: track(
      new MeshPhysicalMaterial({
        color: gray(0.02),
        metalness: 0,
        roughness: 0.2,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
      }),
    ),
    // Película de vidro por cima das telas: quase invisível, só o reflexo.
    screenGlass: track(
      new MeshPhysicalMaterial({
        color: gray(1),
        metalness: 1,
        roughness: 0.06,
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
      }),
    ),
    // Aro do celular: metal grafite, mais polido que o alumínio do notebook.
    frame: track(
      new MeshPhysicalMaterial({ color: new Color(METAL_LO), metalness: 0.95, roughness: 0.28 }),
    ),
  }
}

// ─── Notebook ──────────────────────────────────────────────────────────────────

export interface Laptop {
  group: Group
  /** Tampa (pivô na dobradiça). Filhos dela acompanham a inclinação da tela. */
  lid: Group
  /** Troca a imagem da tela quando o print do dashboard chega. */
  setScreen(tex: Texture): void
}

/** Abertura da tampa em graus (90 = em pé). */
const LID_OPEN_DEG = 105

export const LAPTOP_SCREEN = { w: 2.9, h: 2.9 / (16 / 9), y: 1.12 }

export function createLaptop(track: Track, mats: DeviceMaterials, anisotropy: number): Laptop {
  const group = new Group()

  const base = new Mesh(track(new RoundedBoxGeometry(3.2, 0.1, 2.2, 4, 0.045)), mats.aluminum)
  base.position.y = 0.05
  base.castShadow = true
  base.receiveShadow = true
  group.add(base)

  const keyboard = new Mesh(
    track(new PlaneGeometry(2.72, 0.98)),
    track(
      new MeshStandardMaterial({
        map: keyboardTexture(track, anisotropy),
        roughness: 0.75,
        metalness: 0.05,
      }),
    ),
  )
  keyboard.rotation.x = -Math.PI / 2
  keyboard.position.set(0, 0.1012, -0.38)
  keyboard.receiveShadow = true
  group.add(keyboard)

  const trackpad = new Mesh(track(roundedPlane(1.2, 0.74, 0.06)), mats.aluminumSoft)
  trackpad.rotation.x = -Math.PI / 2
  trackpad.position.set(0, 0.1008, 0.58)
  trackpad.receiveShadow = true
  group.add(trackpad)

  const hinge = new Mesh(track(new CylinderGeometry(0.05, 0.05, 2.7, 24)), mats.darkMetal)
  hinge.rotation.z = Math.PI / 2
  hinge.position.set(0, 0.1, -1.06)
  group.add(hinge)

  // Tampa: pivô na dobradiça. Rotação negativa em x inclina o topo para trás.
  const lid = new Group()
  lid.position.set(0, 0.1, -1.06)
  lid.rotation.x = -((LID_OPEN_DEG - 90) * Math.PI) / 180
  group.add(lid)

  const shell = new Mesh(track(new RoundedBoxGeometry(3.2, 2.1, 0.05, 4, 0.024)), mats.aluminum)
  shell.position.set(0, 1.05, -0.025)
  shell.castShadow = true
  lid.add(shell)

  const bezel = new Mesh(track(roundedPlane(3.1, 2.0, 0.07)), mats.blackGlass)
  bezel.position.set(0, 1.07, 0.0015)
  lid.add(bezel)

  // Tela: sem luz nem tone mapping, a cor do print sai exata como no app.
  const screenMat = track(new MeshBasicMaterial({ color: gray(0.03), toneMapped: false }))
  const screen = new Mesh(track(new PlaneGeometry(LAPTOP_SCREEN.w, LAPTOP_SCREEN.h)), screenMat)
  screen.position.set(0, LAPTOP_SCREEN.y, 0.003)
  lid.add(screen)

  const cam = new Mesh(track(new CircleGeometry(0.014, 16)), mats.darkMetal)
  cam.position.set(0, 2.0, 0.003)
  lid.add(cam)

  const glass = new Mesh(track(roundedPlane(3.1, 2.0, 0.07)), mats.screenGlass)
  glass.position.set(0, 1.07, 0.006)
  lid.add(glass)

  return {
    group,
    lid,
    setScreen(tex) {
      tex.colorSpace = SRGBColorSpace
      tex.anisotropy = anisotropy
      screenMat.map = tex
      screenMat.color.set(gray(1))
      screenMat.needsUpdate = true
    },
  }
}

// ─── Celular ───────────────────────────────────────────────────────────────────

export interface Phone {
  group: Group
}

const PHONE = { w: 0.78, h: 1.62, r: 0.13, depth: 0.045, bevel: 0.02 }
/** Tela 720x1560 (proporção 0,4615) dentro do aro. */
export const PHONE_SCREEN = { w: 0.72, h: 1.56, r: 0.1 }

export function createPhone(track: Track, mats: DeviceMaterials, screenTex: Texture): Phone {
  const group = new Group()
  // Guinada antes da inclinação: o celular gira para a câmera e depois deita.
  group.rotation.order = 'YXZ'

  const inner = roundedRectShape(
    PHONE.w - PHONE.bevel * 2,
    PHONE.h - PHONE.bevel * 2,
    PHONE.r - PHONE.bevel,
  )
  const bodyGeo = track(
    new ExtrudeGeometry(inner, {
      depth: PHONE.depth,
      bevelEnabled: true,
      bevelThickness: PHONE.bevel,
      bevelSize: PHONE.bevel,
      bevelSegments: 5,
      curveSegments: 18,
    }),
  )
  bodyGeo.translate(0, 0, -PHONE.depth / 2)
  // Grupo 0 = frente e verso (vidro preto); grupo 1 = laterais e chanfro (aro).
  const body = new Mesh(bodyGeo, [mats.blackGlass, mats.frame])
  body.castShadow = true
  group.add(body)

  const front = PHONE.depth / 2 + PHONE.bevel
  const screen = new Mesh(
    track(roundedPlane(PHONE_SCREEN.w, PHONE_SCREEN.h, PHONE_SCREEN.r)),
    track(new MeshBasicMaterial({ map: screenTex, toneMapped: false })),
  )
  screen.position.z = front + 0.0008
  group.add(screen)

  const glass = new Mesh(
    track(roundedPlane(PHONE_SCREEN.w, PHONE_SCREEN.h, PHONE_SCREEN.r)),
    mats.screenGlass,
  )
  glass.position.z = front + 0.0018
  group.add(glass)

  // Botões laterais: volume à esquerda, liga/desliga à direita.
  const btnGeo = track(new RoundedBoxGeometry(0.014, 0.15, 0.028, 2, 0.006))
  const addButton = (x: number, y: number, len = 1) => {
    const b = new Mesh(btnGeo, mats.frame)
    b.position.set(x, y, 0)
    b.scale.y = len
    group.add(b)
  }
  addButton(-PHONE.w / 2 - 0.004, 0.42)
  addButton(-PHONE.w / 2 - 0.004, 0.24)
  addButton(PHONE.w / 2 + 0.004, 0.33, 1.4)

  return { group }
}
