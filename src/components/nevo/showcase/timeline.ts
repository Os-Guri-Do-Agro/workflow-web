/**
 * Roteiro da vitrine: uma timeline gsap que anima um OBJETO DE ESTADO, nunca a
 * cena diretamente.
 *
 * Por que estado e não `gsap.to(camera.position)`: a cena lê este objeto a cada
 * quadro e decide o que fazer com ele (câmera em coordenadas esféricas, textura
 * do celular redesenhada só quando o número muda, flipbook do Nevo). Assim a
 * timeline fica pura (dá para pular para qualquer instante e o quadro sai igual)
 * e o three.js não precisa ser importado aqui.
 *
 * A timeline nasce PAUSADA e com `repeat: -1`: quem avança o tempo é o rAF único
 * da cena (`tl.totalTime(t)`), então não existe um segundo loop do ticker do
 * gsap rodando em paralelo. Todas as interpolações são `fromTo` com
 * `immediateRender: false`: em qualquer volta do loop, e depois de um `seek`
 * para trás, o valor de cada propriedade é função só do instante.
 */
import { gsap } from 'gsap'
import { SHOWCASE_CHAPTERS, SHOWCASE_DURATION } from './chapters'

/** Câmera em coordenadas esféricas em volta de um alvo (azimute 0 = de frente). */
export interface Shot {
  tx: number
  ty: number
  tz: number
  /** Azimute em radianos; negativo = câmera à esquerda. */
  az: number
  /** Elevação em radianos. */
  el: number
  dist: number
  /** FOV vertical de referência para 16:9 (a cena corrige para outras proporções). */
  fov: number
}

export interface ShowcaseState extends Shot {
  /** Inclinação do celular (capítulo 3). */
  phonePitch: number
  phoneYaw: number
  /** 0..1: contagem do número da sequência na tela do celular. */
  count: number
  /** 0..3: missões marcadas (a parte fracionária é o "pop" do check). */
  missions: number
  /** 0..1: chama de hoje acendendo na semana. */
  todayLit: number
  /** 0..1: card "Seu time" saindo da tela do notebook. */
  teamCard: number
  /** 0..1 por marco (escala com mola). */
  flame0: number
  flame1: number
  flame2: number
  flame3: number
  flame4: number
  /** 0..1: vida do confete (0 e 1 = invisível). */
  confetti: number
  nevoX: number
  nevoZ: number
  /** 0 parado, 1 correndo, 2 comemorando. */
  nevoMode: number
  /** 1 = indo para a direita, -1 = para a esquerda. */
  nevoFacing: number
  /** 0..1: altura do pulo. */
  nevoHop: number
}

export const FLAME_KEYS = ['flame0', 'flame1', 'flame2', 'flame3', 'flame4'] as const

// ─── Planos de câmera (keyframes) ──────────────────────────────────────────────
// O notebook fica na origem, de frente para +z; o celular à direita, em pé,
// girado para a câmera do plano herói. Valores achados olhando a cena, não
// calculados: mexa aqui para reenquadrar sem tocar no resto.

const HERO_A: Shot = { tx: 0.3, ty: 0.95, tz: 0.1, az: -0.42, el: 0.22, dist: 8.3, fov: 30 }
const HERO_B: Shot = { tx: 0.35, ty: 0.95, tz: 0.1, az: -0.14, el: 0.19, dist: 8.0, fov: 30 }
// Celular no terço direito do quadro: o alvo fica à esquerda dele, e a legenda
// (canto superior esquerdo) cai sobre o notebook desfocado, não sobre a tela.
const PHONE: Shot = { tx: 2.1, ty: 1.0, tz: 0.55, az: -0.36, el: 0.06, dist: 3.8, fov: 30 }
const PHONE_B: Shot = { tx: 2.15, ty: 1.02, tz: 0.55, az: -0.3, el: 0.08, dist: 3.5, fov: 30 }
const MISSIONS: Shot = { tx: 2.12, ty: 0.86, tz: 0.55, az: -0.06, el: 0.28, dist: 3.55, fov: 30 }
const MISSIONS_B: Shot = { tx: 2.14, ty: 0.83, tz: 0.55, az: 0.02, el: 0.3, dist: 3.4, fov: 30 }
const LAPTOP: Shot = { tx: 0.2, ty: 1.1, tz: -0.2, az: 0.22, el: 0.17, dist: 7.4, fov: 30 }
const LAPTOP_B: Shot = { tx: 0.25, ty: 1.1, tz: -0.1, az: 0.06, el: 0.15, dist: 7.0, fov: 30 }
const HERO_C: Shot = { tx: 0.3, ty: 1.0, tz: 0.1, az: -0.34, el: 0.24, dist: 8.9, fov: 30 }

/** Onde o Nevo espera no plano herói (à esquerda, na frente do notebook). */
export const NEVO_HOME = { x: -2.35, z: 1.15 }
const NEVO_PARTY = { x: 0.75, z: 1.35 }

/** Guinada base do celular: de frente para a câmera do plano herói. */
export const PHONE_BASE_YAW = -0.42

/** Estado em t = 0. Precisa bater com o "from" do primeiro tween de cada campo. */
export function initialState(): ShowcaseState {
  return {
    ...HERO_A,
    phonePitch: 0,
    phoneYaw: PHONE_BASE_YAW,
    count: 1,
    missions: 0,
    todayLit: 0,
    teamCard: 0,
    flame0: 0,
    flame1: 0,
    flame2: 0,
    flame3: 0,
    flame4: 0,
    confetti: 0,
    nevoX: NEVO_HOME.x,
    nevoZ: NEVO_HOME.z,
    nevoMode: 0,
    nevoFacing: 1,
    nevoHop: 0,
  }
}

export function buildTimeline(state: ShowcaseState): gsap.core.Timeline {
  const tl = gsap.timeline({ paused: true, repeat: -1, defaults: { immediateRender: false } })
  const [c1, c2, c3, c4, c5] = SHOWCASE_CHAPTERS.map((c) => c.start) as [
    number,
    number,
    number,
    number,
    number,
  ]

  /**
   * Um trecho de câmera. Todos os trechos são encadeados sem sobreposição e
   * com easing "inOut": a velocidade é zero em cada emenda, então não existe
   * corte seco nem tranco, nem na volta do loop (o último plano é o primeiro).
   */
  const cam = (from: Shot, to: Shot, at: number, dur: number, ease: string) =>
    tl.fromTo(state, { ...from }, { ...to, duration: dur, ease }, at)

  // 1. Seu dia começa aqui: plano aberto orbitando devagar.
  cam(HERO_A, HERO_B, c1, 4.4, 'sine.inOut')
  // 2. Sua sequência: dolly-in na tela do celular e um empurrão lento.
  cam(HERO_B, PHONE, c2, 1.6, 'power3.inOut')
  cam(PHONE, PHONE_B, c2 + 1.6, 2.8, 'sine.inOut')
  // 3. Missões do dia: câmera sobe para as missões enquanto o celular inclina.
  cam(PHONE_B, MISSIONS, c3, 1.2, 'power2.inOut')
  cam(MISSIONS, MISSIONS_B, c3 + 1.2, 3.2, 'sine.inOut')
  // 4. O time junto: viaja até o notebook e acompanha o Nevo correndo.
  cam(MISSIONS_B, LAPTOP, c4, 1.6, 'power3.inOut')
  cam(LAPTOP, LAPTOP_B, c4 + 1.6, 2.8, 'sine.inOut')
  // 5. Todo dia conta: recua para o herói e pousa exatamente no plano inicial.
  cam(LAPTOP_B, HERO_C, c5, 2.6, 'power3.inOut')
  cam(HERO_C, HERO_A, c5 + 2.6, SHOWCASE_DURATION - (c5 + 2.6), 'sine.inOut')

  // ── Capítulo 2: o número "rebobina" rapidinho e conta até o atual ──
  tl.fromTo(state, { count: 1 }, { count: 0, duration: 0.3, ease: 'power1.in' }, c2 + 0.2)
  tl.fromTo(state, { count: 0 }, { count: 1, duration: 2, ease: 'power2.out' }, c2 + 0.9)

  // ── Capítulo 3: celular inclina, missões ganham check uma a uma ──
  tl.fromTo(
    state,
    { phonePitch: 0, phoneYaw: PHONE_BASE_YAW },
    { phonePitch: -0.2, phoneYaw: -0.12, duration: 1.2, ease: 'power2.inOut' },
    c3,
  )
  for (let i = 0; i < 3; i++) {
    tl.fromTo(
      state,
      { missions: i },
      { missions: i + 1, duration: 0.45, ease: 'none' },
      c3 + 1.3 + i * 0.75,
    )
  }
  tl.fromTo(state, { todayLit: 0 }, { todayLit: 1, duration: 0.5, ease: 'none' }, c3 + 3.6)
  tl.fromTo(
    state,
    { phonePitch: -0.2, phoneYaw: -0.12 },
    { phonePitch: 0, phoneYaw: PHONE_BASE_YAW, duration: 1.4, ease: 'power2.inOut' },
    c4,
  )

  // ── Capítulo 4: card do time sai da tela, Nevo corre, marcos surgem com mola ──
  tl.fromTo(state, { teamCard: 0 }, { teamCard: 1, duration: 0.9, ease: 'back.out(1.6)' }, c4 + 0.7)
  tl.set(state, { nevoMode: 1, nevoFacing: 1 }, c4 + 1.1)
  tl.fromTo(
    state,
    { nevoX: NEVO_HOME.x, nevoZ: NEVO_HOME.z },
    { nevoX: NEVO_PARTY.x, nevoZ: NEVO_PARTY.z, duration: 2.5, ease: 'sine.inOut' },
    c4 + 1.1,
  )
  tl.set(state, { nevoMode: 2 }, c4 + 3.6)
  FLAME_KEYS.forEach((key, i) => {
    tl.fromTo(
      state,
      { [key]: 0 },
      { [key]: 1, duration: 1.1, ease: 'elastic.out(1, 0.55)' },
      c4 + 1.7 + i * 0.18,
    )
  })

  // ── Capítulo 5: confete, pulinhos, tudo volta para o começo ──
  tl.fromTo(state, { teamCard: 1 }, { teamCard: 0, duration: 0.6, ease: 'power2.in' }, c5 + 0.2)
  tl.fromTo(state, { confetti: 0 }, { confetti: 1, duration: 3.4, ease: 'none' }, c5 + 0.4)
  for (let i = 0; i < 2; i++) {
    const at = c5 + 0.45 + i * 0.62
    tl.fromTo(state, { nevoHop: 0 }, { nevoHop: 1, duration: 0.26, ease: 'power2.out' }, at)
    tl.fromTo(state, { nevoHop: 1 }, { nevoHop: 0, duration: 0.26, ease: 'power2.in' }, at + 0.26)
  }
  FLAME_KEYS.forEach((key, i) => {
    tl.fromTo(
      state,
      { [key]: 1 },
      { [key]: 0, duration: 0.45, ease: 'power2.in' },
      c5 + 1.5 + i * 0.08,
    )
  })
  // O Nevo volta correndo para o lugar dele enquanto a câmera recua.
  tl.set(state, { nevoMode: 1, nevoFacing: -1 }, c5 + 2.5)
  tl.fromTo(
    state,
    { nevoX: NEVO_PARTY.x, nevoZ: NEVO_PARTY.z },
    { nevoX: NEVO_HOME.x, nevoZ: NEVO_HOME.z, duration: 1.5, ease: 'sine.inOut' },
    c5 + 2.5,
  )
  tl.set(state, { nevoMode: 0, nevoFacing: 1 }, c5 + 4.05)
  // A tela do celular volta ao "dia pendente" com a câmera já longe.
  tl.fromTo(state, { missions: 3 }, { missions: 0, duration: 0.4, ease: 'none' }, c5 + 3.4)
  tl.fromTo(state, { todayLit: 1 }, { todayLit: 0, duration: 0.3, ease: 'none' }, c5 + 3.4)

  return tl
}
