/**
 * Manifesto do Nevo (a xícara mascote): sprites recortados da sheet mestre
 * `sprites-nevo.png` pelo pipeline de `scripts/sprites/` e servidos de
 * `public/brand/nevo/`.
 *
 * Os tamanhos são os do arquivo (2x do pixel da sheet). Servem para reservar a
 * proporção certa antes de a imagem chegar e para alinhar frames de flipbook
 * pelo pé (frames de uma mesma animação têm caixas diferentes).
 *
 * Nada aqui importa Vue: é seguro usar em qualquer lugar, inclusive na vitrine
 * 3D, que desenha os sprites numa textura.
 */
import type {
  StreakMe,
  StreakMilestoneKey,
  StreakMission,
  StreakTeamDay,
  StreakTierKey,
} from '@/service/streak/streak-service'

export const NEVO_BASE = '/brand/nevo'

export const NEVO_SPRITES = {
  // Poses principais
  idle: [290, 325],
  'walk-1': [251, 304],
  'walk-2': [267, 308],
  'run-1': [250, 327],
  'run-2': [252, 311],
  jump: [264, 347],
  happy: [273, 331],
  victory: [307, 325],
  thinking: [273, 332],
  sad: [222, 317],
  motivado: [265, 316],
  cansado: [219, 282],
  comemorando: [238, 290],
  'segurando-bebida': [251, 291],
  'dando-dica': [261, 313],
  'com-raiva': [238, 288],
  confuso: [205, 304],
  dormindo: [270, 225],
  'olhar-esquerda': [210, 293],
  'olhar-direita': [209, 294],
  // Chamas (3 frames de animação + variações)
  'fogo-normal': [147, 185],
  'fogo-animado-1': [128, 170],
  'fogo-animado-2': [136, 183],
  'fogo-animado-3': [140, 180],
  'fogo-brilho': [137, 211],
  'fogo-particulas': [160, 203],
  'fogo-grande': [168, 264],
  'fogo-aura': [166, 230],
  // Chamas de nível / marco (cristal no meio)
  'seq-basico': [138, 174],
  'seq-constancia': [139, 177],
  'seq-disciplina': [141, 176],
  'seq-avancado': [142, 180],
  'seq-lendario': [144, 192],
  // Expressões (só o rosto)
  'exp-sorriso': [164, 167],
  'exp-piscar': [160, 166],
  'exp-surpreso': [163, 167],
  'exp-triste': [160, 166],
  'exp-com-fome': [159, 175],
  'exp-bravo': [155, 168],
  // Extras
  'extra-respingo': [123, 131],
  'extra-confete': [114, 123],
  'extra-ideia': [67, 74],
  'extra-duvida': [72, 121],
  'extra-coracao': [91, 86],
  'extra-capa': [123, 127],
  // Ícones de UI
  'ui-estrela': [109, 109],
  'ui-alvo': [108, 106],
  'ui-xicara': [116, 106],
} as const satisfies Record<string, readonly [number, number]>

export type NevoSpriteName = keyof typeof NEVO_SPRITES

export function nevoSrc(name: NevoSpriteName): string {
  return `${NEVO_BASE}/${name}.webp`
}

export function nevoSize(name: NevoSpriteName): readonly [number, number] {
  return NEVO_SPRITES[name]
}

/** Animações por troca de frame (flipbook). */
export const NEVO_FLIPBOOKS = {
  walk: ['walk-1', 'walk-2'],
  run: ['run-1', 'run-2'],
  flame: ['fogo-animado-1', 'fogo-animado-2', 'fogo-animado-3'],
} as const satisfies Record<string, readonly NevoSpriteName[]>

export type NevoFlipbook = keyof typeof NEVO_FLIPBOOKS

// ─── Níveis do mascote (D8) ────────────────────────────────────────────────────

export interface NevoTier {
  key: Exclude<StreakTierKey, 'none'>
  label: string
  min: number
  max: number | null
  /** Pose que representa o nível na trilha de evolução. */
  pose: NevoSpriteName
  /** Animação do nível parado na home (quando não há humor mais forte). */
  motion: 'idle' | 'walk' | 'bounce'
  /** Chama de nível (cristal) usada no selo. */
  flame: NevoSpriteName
  blurb: string
}

export const NEVO_TIERS: readonly NevoTier[] = [
  {
    key: 'basico',
    label: 'Básico',
    min: 1,
    max: 3,
    pose: 'idle',
    motion: 'idle',
    flame: 'seq-basico',
    blurb: 'Ainda está começando, mas já mostrou compromisso!',
  },
  {
    key: 'progresso',
    label: 'Em progresso',
    min: 4,
    max: 7,
    pose: 'walk-1',
    motion: 'walk',
    flame: 'seq-disciplina',
    blurb: 'Mais confiante e motivado!',
  },
  {
    key: 'determinado',
    label: 'Determinado',
    min: 8,
    max: 14,
    pose: 'motivado',
    motion: 'bounce',
    flame: 'seq-constancia',
    blurb: 'Já virou rotina! Você está mandando bem.',
  },
  {
    key: 'especialista',
    label: 'Especialista',
    min: 15,
    max: 30,
    pose: 'happy',
    motion: 'bounce',
    flame: 'seq-avancado',
    blurb: 'Seu esforço te levou longe. Continue assim!',
  },
  {
    key: 'lendario',
    label: 'Lendário',
    min: 31,
    max: null,
    pose: 'victory',
    motion: 'bounce',
    flame: 'seq-lendario',
    blurb: 'Você é incrível! Essa sequência é coisa de outro nível.',
  },
]

export function tierOf(key: StreakTierKey): NevoTier | null {
  return NEVO_TIERS.find((t) => t.key === key) ?? null
}

export function tierForDays(days: number): NevoTier | null {
  if (days <= 0) return null
  return NEVO_TIERS.find((t) => days >= t.min && (t.max === null || days <= t.max)) ?? null
}

// ─── Marcos (D9) ───────────────────────────────────────────────────────────────

export interface NevoMilestone {
  days: number
  key: StreakMilestoneKey
  label: string
  blurb: string
  flame: NevoSpriteName
}

export const NEVO_MILESTONES: readonly NevoMilestone[] = [
  { days: 7, key: 'basico', label: 'Primeiro marco', blurb: 'Você já criou o hábito!', flame: 'seq-basico' },
  { days: 14, key: 'constancia', label: 'Constância', blurb: 'Você está no ritmo!', flame: 'seq-constancia' },
  { days: 30, key: 'disciplina', label: 'Disciplina', blurb: 'Isso já é impressionante!', flame: 'seq-disciplina' },
  { days: 60, key: 'avancado', label: 'Nível avançado', blurb: 'Você é um exemplo!', flame: 'seq-avancado' },
  { days: 100, key: 'lendario', label: 'Lendário', blurb: 'Poucos chegam aqui!', flame: 'seq-lendario' },
]

export function milestoneFlame(key: StreakMilestoneKey): NevoSpriteName {
  return NEVO_MILESTONES.find((m) => m.key === key)?.flame ?? 'seq-basico'
}

// ─── Humor do Nevo (o que ele diz e como aparece) ─────────────────────────────

export type NevoMoodKey =
  | 'perfect'
  | 'secured'
  | 'rest'
  | 'at-risk'
  | 'pending'
  | 'broken'
  | 'fresh'
  | 'loading'

export interface NevoMood {
  key: NevoMoodKey
  pose: NevoSpriteName
  motion: 'idle' | 'walk' | 'run' | 'bounce' | 'sleep' | 'still'
  title: string
  message: string
}

/**
 * Humor a partir do resumo e da hora local. Regras (copy sem em-dash):
 * garantido > descanso > quebrou > em risco (depois das 17h) > pendente > novo.
 */
export function moodFor(s: StreakMe | null | undefined, hour = new Date().getHours()): NevoMood {
  if (!s) {
    return { key: 'loading', pose: 'segurando-bebida', motion: 'idle', title: 'Passando um café...', message: 'Carregando sua sequência.' }
  }
  const tier = tierOf(s.tier.key)
  if (s.perfectToday) {
    return {
      key: 'perfect',
      pose: 'victory',
      motion: 'bounce',
      title: 'Dia perfeito!',
      message: 'As 3 missões de hoje foram cumpridas. Que ritmo!',
    }
  }
  if (s.securedToday) {
    return {
      key: 'secured',
      pose: 'comemorando',
      motion: 'bounce',
      title: 'Dia garantido!',
      message: s.current > 1 ? `São ${s.current} dias seguidos. Você está mandando bem!` : 'Primeiro dia garantido. Amanhã tem mais!',
    }
  }
  if (s.todayIsRest) {
    return {
      key: 'rest',
      pose: 'dormindo',
      motion: 'sleep',
      title: 'Dia de descanso',
      message: s.current > 0 ? `Sua sequência de ${s.current} dias fica guardada. Descanse!` : 'Hoje não tem meta. Aproveite o descanso!',
    }
  }
  if (s.current === 0 && s.previous > 0 && s.brokenOn) {
    return {
      key: 'broken',
      pose: 'sad',
      motion: 'still',
      title: 'Ops... que pena!',
      message: `A sequência de ${s.previous} ${s.previous === 1 ? 'dia' : 'dias'} quebrou. Recomece hoje e volte mais forte!`,
    }
  }
  if (s.current > 0 && hour >= 17) {
    return {
      key: 'at-risk',
      pose: 'thinking',
      motion: 'idle',
      title: 'Sua sequência está esperando',
      message: `Garanta o dia ${s.current + 1}: 30 min de foco ou 1 tarefa concluída.`,
    }
  }
  if (s.current > 0) {
    return {
      key: 'pending',
      pose: tier?.pose ?? 'idle',
      motion: tier?.motion ?? 'idle',
      title: 'Bora garantir o dia?',
      message: `Falta pouco para o dia ${s.current + 1}. Foque 30 min ou conclua 1 tarefa.`,
    }
  }
  return {
    key: 'fresh',
    pose: 'dando-dica',
    motion: 'idle',
    title: 'Comece sua sequência hoje',
    message: 'Foque 30 minutos ou conclua 1 tarefa e o Nevo acende a primeira chama.',
  }
}

/** Formata "12 dias" / "1 dia". */
export function daysLabel(n: number): string {
  return `${n} ${n === 1 ? 'dia' : 'dias'}`
}

/** Rótulos curtos da semana (segunda primeiro, como a API devolve). */
export const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const

// ─── Helpers de apresentação (T5) ─────────────────────────────────────────────
// Puros, sem Vue: os componentes do Nevo, o chip da topbar e o painel da equipe
// usam as mesmas regras de rótulo e cor, então elas moram aqui e não repetidas
// em cada .vue.

/** Nomes completos da semana, para `aria-label` ("Quarta: dia garantido"). */
export const WEEKDAY_LONG = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'] as const

/**
 * Chave YYYY-MM-DD do dia civil LOCAL. Mesmo formato do `date` da API; não use
 * `toISOString()` (é UTC: depois das 21h no Brasil já devolve amanhã).
 */
export function localDayKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Posição na semana (0 = segunda ... 6 = domingo) de uma data YYYY-MM-DD.
 * Meio-dia local evita que horário de verão empurre a data para o dia vizinho.
 */
export function weekdayIndex(date: string): number {
  const d = new Date(`${date}T12:00:00`)
  if (Number.isNaN(d.getTime())) return 0
  return (d.getDay() + 6) % 7
}

/** Cor chapada do nível (token por tema). `none` cai no cinza da chama apagada. */
export function tierTone(key: StreakTierKey): string {
  return key === 'none' ? 'var(--streak-off)' : `var(--tier-${key})`
}

/**
 * Cor do marco, casada com a chama-cristal dele (7 laranja, 14 azul,
 * 30 laranja-dourado, 60 roxo, 100 dourado).
 */
const MILESTONE_TONE: Record<StreakMilestoneKey, Exclude<StreakTierKey, 'none'>> = {
  basico: 'basico',
  constancia: 'determinado',
  disciplina: 'progresso',
  avancado: 'especialista',
  lendario: 'lendario',
}

export function milestoneTone(key: StreakMilestoneKey): string {
  return tierTone(MILESTONE_TONE[key])
}

/** Metadados locais do marco (chama e frase) a partir da chave da API. */
export function milestoneOf(key: StreakMilestoneKey): NevoMilestone | null {
  return NEVO_MILESTONES.find((m) => m.key === key) ?? null
}

/** "Falta 1 dia" / "Faltam 5 dias" (concordância no singular). */
export function remainingLabel(n: number): string {
  const days = Math.max(0, Math.ceil(n))
  return days === 1 ? 'Falta 1 dia' : `Faltam ${days} dias`
}

/** Faixa do nível sem travessão: "1 a 3 dias", "31+ dias". */
export function tierRangeLabel(tier: Pick<NevoTier, 'min' | 'max'>): string {
  if (tier.max === null) return `${tier.min}+ dias`
  return `${tier.min} a ${tier.max} dias`
}

/**
 * Estado visual de um dia da semana. `perfect` implica garantido; `today-*`
 * é o dia de hoje ainda aberto; `future` é o que ainda não chegou.
 */
export type StreakDayState =
  | 'perfect'
  | 'secured'
  | 'today-pending'
  | 'today-rest'
  | 'rest'
  | 'future-rest'
  | 'missed'
  | 'future'

type WeekDayLike = Pick<StreakTeamDay, 'date' | 'secured' | 'rest' | 'perfect' | 'isToday'>

/**
 * Classifica o dia. `isFuture` vem de quem conhece a posição de hoje na lista
 * (a API não marca futuro: dias que ainda não chegaram vêm com secured=false).
 */
export function streakDayState(day: WeekDayLike, isFuture: boolean): StreakDayState {
  if (day.perfect && day.secured) return 'perfect'
  if (day.secured) return 'secured'
  if (day.isToday) return day.rest ? 'today-rest' : 'today-pending'
  if (isFuture) return day.rest ? 'future-rest' : 'future'
  if (day.rest) return 'rest'
  return 'missed'
}

/** Texto para leitor de tela de cada estado (vai depois de "Quarta: "). */
export const STREAK_DAY_STATE_LABEL: Record<StreakDayState, string> = {
  perfect: 'dia perfeito, as 3 missões cumpridas',
  secured: 'dia garantido',
  'today-pending': 'hoje, ainda falta garantir',
  'today-rest': 'hoje é dia de descanso',
  rest: 'dia de descanso',
  'future-rest': 'dia de descanso, ainda não chegou',
  missed: 'dia sem meta cumprida',
  future: 'ainda não chegou',
}

/** "12 de 30 min", "0 de 1 tarefa", "2 de 1 ação" (o atual pode passar da meta). */
export function missionProgressLabel(m: Pick<StreakMission, 'key' | 'current' | 'target'>): string {
  const current = Math.max(0, Math.floor(m.current))
  if (m.key === 'focus') return `${current} de ${m.target} min`
  if (m.key === 'task') return `${current} de ${m.target} ${m.target === 1 ? 'tarefa' : 'tarefas'}`
  return `${current} de ${m.target} ${m.target === 1 ? 'ação' : 'ações'}`
}

/** Fração 0..1 da missão (para anel de progresso). */
export function missionRatio(m: Pick<StreakMission, 'current' | 'target' | 'done'>): number {
  if (m.done) return 1
  if (m.target <= 0) return 0
  return Math.max(0, Math.min(1, m.current / m.target))
}
