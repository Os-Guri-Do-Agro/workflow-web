import { useUiStore } from '@/stores/uiStores'
import { onScopeDispose } from 'vue'
import type { TimerSoundId } from '@/composables/timer-sound-ids'

/**
 * Sons do cronômetro (spec time-selecao-de-tarefa-e-som).
 *
 * Mesmo molde dos sons do modo XP (`useXpSounds`): sintetizados na hora com Web
 * Audio, sem arquivo binário. A diferença é o propósito — aqui o som marca os
 * dois gestos que valem no Meu tempo, começar e terminar.
 *
 * São SEIS timbres à escolha (`ui.timerSoundPack`), porque som é gosto: o que
 * um acha satisfatório o outro acha irritante depois da vigésima vez. Todos
 * seguem a mesma gramática, e é ela que faz o par soar como par:
 *
 *   - **início** sobe (movimento, "vai");
 *   - **parada** desce e resolve na tônica (fecho, "feito").
 *
 * Duas regras valem para todos: duração abaixo de meio segundo e afinação
 * variando ±5 cents por execução. Repetição idêntica é o que transforma um som
 * agradável em irritante; a variação mínima mantém o som vivo sem que ninguém
 * perceba o truque.
 */

export type { TimerSoundId } from '@/composables/timer-sound-ids'

export interface TimerSoundPack {
  id: TimerSoundId
  label: string
  /** Uma linha na galeria de `/settings`. */
  hint: string
  start: (audio: AudioContext, out: GainNode) => void
  stop: (audio: AudioContext, out: GainNode) => void
}

let ctx: AudioContext | null = null
/** Segunda metade da prévia agendada (ver `preview`). */
let previewTimer: number | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) {
    try {
      ctx = new Ctor()
    } catch {
      return null
    }
  }
  // O contexto nasce suspenso até o primeiro gesto. Tentar o resume aqui cobre
  // o caso do clique; fora de gesto o navegador recusa, e é por isso que existe
  // `unlockTimerAudio` (chamado ao iniciar o timer). Ver o comentário dele.
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/**
 * Destrava o áudio DENTRO de um gesto do usuário, para que os sons que NÃO
 * nascem de clique consigam tocar depois.
 *
 * Esta função existe por causa de um bug concreto: o aviso e o corte por
 * ociosidade acontecem sem clique nenhum, às vezes horas depois da última
 * interação. Nesse instante o `AudioContext` ainda está suspenso, `resume()`
 * fora de ativação transitória é recusado pelo navegador, e o alerta sai mudo.
 * Chamada no clique de iniciar o timer, ela deixa o contexto em `running`, e aí
 * o alerta automático encontra um contexto pronto.
 */
export function unlockTimerAudio(): void {
  getCtx()
}

/** ±5 cents: o suficiente para o ouvido não catalogar como "o mesmo bipe". */
function detuned(freq: number): number {
  return freq * Math.pow(2, (Math.random() * 10 - 5) / 1200)
}

interface NoteOptions {
  at?: number
  duration?: number
  peak?: number
  type?: OscillatorType
  /** Ataque em segundos: 0.01 = percussivo, 0.08 = suave. */
  attack?: number
}

/** Nota com envelope exponencial (o decaimento natural de corpo que vibra). */
function note(
  audio: AudioContext,
  dest: AudioNode,
  freq: number,
  { at = 0, duration = 0.2, peak = 0.05, type = 'triangle', attack = 0.012 }: NoteOptions = {},
): void {
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = type
  osc.frequency.value = detuned(freq)
  const t0 = audio.currentTime + at
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain)
  gain.connect(dest)
  osc.start(t0)
  osc.stop(t0 + duration + 0.04)
}

/** Deslize de altura: a base do "pop" e dos sopros. */
function sweep(
  audio: AudioContext,
  dest: AudioNode,
  from: number,
  to: number,
  { at = 0, duration = 0.14, peak = 0.06, type = 'sine' }: NoteOptions = {},
): void {
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  const t0 = audio.currentTime + at
  osc.type = type
  osc.frequency.setValueAtTime(detuned(from), t0)
  osc.frequency.exponentialRampToValueAtTime(detuned(to), t0 + duration)
  gain.gain.setValueAtTime(peak, t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + 0.02)
  osc.connect(gain)
  gain.connect(dest)
  osc.start(t0)
  osc.stop(t0 + duration + 0.05)
}

/**
 * Parciais inarmônicas: é o que separa "sino" de "flauta". Um sino real vibra
 * em razões que não são múltiplos inteiros da fundamental, e é justamente isso
 * que o ouvido reconhece como metal.
 */
function bell(audio: AudioContext, dest: AudioNode, freq: number, at: number, peak: number): void {
  const partials: Array<[number, number, number]> = [
    [1, peak, 1.1],
    [2.76, peak * 0.45, 0.7],
    [5.4, peak * 0.22, 0.45],
    [8.9, peak * 0.1, 0.3],
  ]
  for (const [ratio, level, decay] of partials) {
    note(audio, dest, freq * ratio, {
      at,
      duration: decay,
      peak: level,
      type: 'sine',
      attack: 0.005,
    })
  }
}

/** Madeira: fundamental curta + oitava e décima segunda ainda mais curtas. */
function wood(audio: AudioContext, dest: AudioNode, freq: number, at: number, peak: number): void {
  note(audio, dest, freq, { at, duration: 0.34, peak, type: 'sine', attack: 0.004 })
  note(audio, dest, freq * 4, { at, duration: 0.1, peak: peak * 0.3, type: 'sine', attack: 0.003 })
  note(audio, dest, freq * 9.2, { at, duration: 0.05, peak: peak * 0.12, type: 'sine', attack: 0.002 })
}

/** Sopro curto de ruído filtrado: dá corpo ao ataque sem virar percussão. */
function breath(audio: AudioContext, dest: AudioNode, from: number, to: number): void {
  const len = Math.floor(audio.sampleRate * 0.22)
  const buffer = audio.createBuffer(1, len, audio.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)

  const src = audio.createBufferSource()
  src.buffer = buffer
  const filter = audio.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 1.1
  const gain = audio.createGain()
  const t0 = audio.currentTime

  filter.frequency.setValueAtTime(from, t0)
  filter.frequency.exponentialRampToValueAtTime(to, t0 + 0.2)
  gain.gain.setValueAtTime(0.03, t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22)

  src.connect(filter)
  filter.connect(gain)
  gain.connect(dest)
  src.start(t0)
  src.stop(t0 + 0.24)
}

/**
 * Motivo de atenção do aviso de ociosidade.
 *
 * Não é um sétimo pack, e não foi adicionado aos seis existentes, de propósito.
 * Os packs existem porque som é gosto NO GESTO COTIDIANO de começar e parar.
 * Um alarme tem outra função: precisa ser reconhecível e cortar o ambiente. Seis
 * variações de alarme diluiriam justamente o que o torna útil.
 *
 * Três repetições curtas subindo: o ouvido lê repetição ascendente como chamado,
 * e nota única descendente como confirmação. Aqui queremos chamado.
 */
function attention(audio: AudioContext, dest: AudioNode): void {
  for (let i = 0; i < 3; i++) {
    const at = i * 0.19
    note(audio, dest, 880, { at, duration: 0.1, peak: 0.075, attack: 0.005 })
    note(audio, dest, 1174.66, { at: at + 0.065, duration: 0.13, peak: 0.06, attack: 0.005 })
  }
}

/** Toque seco que fecha uma parada (o "clique" de coisa concluída). */
function thock(audio: AudioContext, dest: AudioNode, at: number): void {
  sweep(audio, dest, 320, 120, { at, duration: 0.09, peak: 0.05 })
}

// ─── Os seis timbres ──────────────────────────────────────────────────────────

export const TIMER_SOUND_PACKS: TimerSoundPack[] = [
  {
    id: 'nevo',
    label: 'Nevo',
    hint: 'Arpejo limpo com um sopro por baixo. O padrão da casa.',
    start(audio, out) {
      note(audio, out, 523.25, { at: 0, duration: 0.16, peak: 0.05 })
      note(audio, out, 783.99, { at: 0.075, duration: 0.17, peak: 0.05 })
      note(audio, out, 1046.5, { at: 0.15, duration: 0.3, peak: 0.055 })
      note(audio, out, 2093, { at: 0.15, duration: 0.22, peak: 0.012, type: 'sine' })
      breath(audio, out, 700, 2400)
    },
    stop(audio, out) {
      note(audio, out, 1046.5, { at: 0, duration: 0.14, peak: 0.045 })
      note(audio, out, 783.99, { at: 0.07, duration: 0.16, peak: 0.045 })
      note(audio, out, 523.25, { at: 0.14, duration: 0.34, peak: 0.055 })
      note(audio, out, 261.63, { at: 0.14, duration: 0.36, peak: 0.02, type: 'sine' })
      thock(audio, out, 0.14)
    },
  },
  {
    id: 'sino',
    label: 'Sino',
    hint: 'Cristalino, com cauda longa. Some no ambiente, mas você ouve.',
    start(audio, out) {
      bell(audio, out, 659.25, 0, 0.045)
      bell(audio, out, 987.77, 0.11, 0.05)
    },
    stop(audio, out) {
      bell(audio, out, 987.77, 0, 0.042)
      bell(audio, out, 493.88, 0.1, 0.05)
    },
  },
  {
    id: 'marimba',
    label: 'Marimba',
    hint: 'Madeira quente e curta. O mais discreto para usar de fone o dia todo.',
    start(audio, out) {
      wood(audio, out, 587.33, 0, 0.055)
      wood(audio, out, 880, 0.085, 0.06)
    },
    stop(audio, out) {
      wood(audio, out, 880, 0, 0.05)
      wood(audio, out, 440, 0.085, 0.06)
    },
  },
  {
    id: 'bolha',
    label: 'Bolha',
    hint: 'Um "plop" curtinho, tipo aplicativo de mensagem. O mais divertido.',
    start(audio, out) {
      sweep(audio, out, 420, 1180, { duration: 0.11, peak: 0.07 })
      note(audio, out, 1318.51, { at: 0.09, duration: 0.12, peak: 0.03, type: 'sine' })
    },
    stop(audio, out) {
      sweep(audio, out, 1180, 380, { duration: 0.13, peak: 0.07 })
      note(audio, out, 329.63, { at: 0.1, duration: 0.16, peak: 0.03, type: 'sine' })
    },
  },
  {
    id: 'retro',
    label: 'Retrô',
    hint: 'Onda quadrada de videogame antigo. Combina com o modo XP.',
    start(audio, out) {
      const notes = [523.25, 659.25, 783.99, 1046.5]
      notes.forEach((f, i) =>
        note(audio, out, f, { at: i * 0.05, duration: 0.07, peak: 0.035, type: 'square', attack: 0.003 }),
      )
    },
    stop(audio, out) {
      const notes = [1046.5, 783.99, 659.25, 523.25]
      notes.forEach((f, i) =>
        note(audio, out, f, { at: i * 0.05, duration: 0.07, peak: 0.035, type: 'square', attack: 0.003 }),
      )
      note(audio, out, 261.63, { at: 0.2, duration: 0.2, peak: 0.03, type: 'square', attack: 0.004 })
    },
  },
  {
    id: 'suave',
    label: 'Suave',
    hint: 'Quase um respiro: entra e sai devagar, sem ataque.',
    start(audio, out) {
      note(audio, out, 440, { duration: 0.5, peak: 0.035, type: 'sine', attack: 0.09 })
      note(audio, out, 659.25, { at: 0.06, duration: 0.5, peak: 0.028, type: 'sine', attack: 0.11 })
    },
    stop(audio, out) {
      note(audio, out, 659.25, { duration: 0.5, peak: 0.03, type: 'sine', attack: 0.09 })
      note(audio, out, 329.63, { at: 0.06, duration: 0.55, peak: 0.035, type: 'sine', attack: 0.11 })
    },
  },
]

const PACK_BY_ID = new Map(TIMER_SOUND_PACKS.map((pack) => [pack.id, pack]))

export function timerSoundPack(id: string): TimerSoundPack {
  return PACK_BY_ID.get(id as TimerSoundId) ?? TIMER_SOUND_PACKS[0]!
}

/** Volume em três degraus; o teto máximo continua discreto de propósito. */
export const TIMER_VOLUMES = [
  { value: 0.35, label: 'Baixo' },
  { value: 0.6, label: 'Médio' },
  { value: 1, label: 'Alto' },
] as const

export function useTimerSounds() {
  const ui = useUiStore()

  function master(audio: AudioContext, level: number): GainNode {
    const gain = audio.createGain()
    gain.gain.value = level
    gain.connect(audio.destination)
    return gain
  }

  /**
   * Toca um lado do par. `forcePack`/`force` existem para a prévia da galeria:
   * ela precisa tocar um timbre que ainda não é o escolhido, e com o som
   * desligado (quem está decidindo tem que ouvir antes de ligar).
   */
  function play(
    side: 'start' | 'stop',
    opts: { packId?: string; force?: boolean } = {},
  ): void {
    if (!ui.timerSounds && !opts.force) return
    const audio = getCtx()
    if (!audio) return
    const pack = timerSoundPack(opts.packId ?? ui.timerSoundPack)
    const out = master(audio, 0.55 * ui.timerVolume)
    pack[side](audio, out)
  }

  const playStart = () => play('start')
  const playStop = () => play('stop')

  /**
   * Alerta do aviso de ociosidade. Respeita `timerSounds` e `timerVolume` como
   * qualquer outro som: alarme que ignora a preferência de quem está em reunião
   * é pior do que alarme nenhum. O ganho é mais alto que o do par start/stop
   * porque este precisa ser ouvido por cima do que a pessoa estiver fazendo.
   */
  function playAlert(): void {
    if (!ui.timerSounds) return
    const audio = getCtx()
    if (!audio) return
    attention(audio, master(audio, 0.8 * ui.timerVolume))
  }

  /**
   * Prévia da galeria: início e, logo depois, a parada correspondente. O handle
   * é guardado e cancelado a cada nova prévia — clicar rápido pelos seis cards
   * empilhava seis paradas, e sair da tela no meio fazia o som tocar em outra.
   */
  function preview(packId: string): void {
    if (previewTimer !== null) window.clearTimeout(previewTimer)
    play('start', { packId, force: true })
    previewTimer = window.setTimeout(() => {
      previewTimer = null
      play('stop', { packId, force: true })
    }, 620)
  }

  onScopeDispose(() => {
    if (previewTimer !== null) window.clearTimeout(previewTimer)
    previewTimer = null
  })

  return { playStart, playStop, playAlert, preview, packs: TIMER_SOUND_PACKS }
}
