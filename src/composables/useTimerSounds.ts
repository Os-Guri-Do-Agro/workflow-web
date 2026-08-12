import { useUiStore } from '@/stores/uiStores'

/**
 * Sons do cronômetro (spec time-selecao-de-tarefa-e-som).
 *
 * Mesmo molde dos sons do modo XP (`useXpSounds`): sintetizados na hora com Web
 * Audio, sem arquivo binário, volume baixo. A diferença é o propósito — aqui o
 * som marca os dois gestos que valem no Meu tempo, começar e terminar, e é
 * desenhado para dar vontade de repetir:
 *
 * - **Início:** arpejo ASCENDENTE resolvendo na oitava, com um sopro curto por
 *   baixo. Lê-se como impulso, "vai".
 * - **Parada:** a mesma tríade DESCENDO até a tônica, fechada por um toque seco.
 *   Lê-se como fecho, "feito" — é a metade que dá a sensação de recompensa.
 *
 * Cada execução varia o afinamento em ±5 cents. Repetição idêntica é o que
 * transforma um som agradável em irritante depois da vigésima vez; a variação
 * mínima mantém o som "vivo" sem que ninguém perceba o truque.
 *
 * Toca só em gesto do usuário (o corte por ociosidade é silencioso de
 * propósito: não há ninguém na frente do computador) e obedece
 * `ui.timerSounds`.
 */

let ctx: AudioContext | null = null

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
  // O contexto nasce suspenso até o primeiro gesto; como só tocamos em clique,
  // o resume sempre acontece dentro de um.
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** ±5 cents: o suficiente para o ouvido não catalogar como "o mesmo bipe". */
function detuned(freq: number): number {
  return freq * Math.pow(2, (Math.random() * 10 - 5) / 1200)
}

interface NoteOptions {
  at: number
  duration: number
  peak: number
  type?: OscillatorType
}

function note(audio: AudioContext, dest: AudioNode, freq: number, opts: NoteOptions): void {
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = opts.type ?? 'triangle'
  osc.frequency.value = detuned(freq)
  const t0 = audio.currentTime + opts.at
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(opts.peak, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration)
  osc.connect(gain)
  gain.connect(dest)
  osc.start(t0)
  osc.stop(t0 + opts.duration + 0.04)
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

/** Toque seco que fecha a parada (o "clique" de coisa concluída). */
function thock(audio: AudioContext, dest: AudioNode, at: number): void {
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  const t0 = audio.currentTime + at
  osc.type = 'sine'
  osc.frequency.setValueAtTime(320, t0)
  osc.frequency.exponentialRampToValueAtTime(120, t0 + 0.09)
  gain.gain.setValueAtTime(0.05, t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11)
  osc.connect(gain)
  gain.connect(dest)
  osc.start(t0)
  osc.stop(t0 + 0.13)
}

function master(audio: AudioContext, peak: number): GainNode {
  const gain = audio.createGain()
  gain.gain.value = peak
  gain.connect(audio.destination)
  return gain
}

export function useTimerSounds() {
  const ui = useUiStore()

  /** Arpejo ascendente: C5 → G5 → C6, com sopro subindo por baixo. */
  function playStart(): void {
    if (!ui.timerSounds) return
    const audio = getCtx()
    if (!audio) return
    const out = master(audio, 0.55)
    note(audio, out, 523.25, { at: 0, duration: 0.16, peak: 0.05 })
    note(audio, out, 783.99, { at: 0.075, duration: 0.17, peak: 0.05 })
    note(audio, out, 1046.5, { at: 0.15, duration: 0.3, peak: 0.055 })
    // Brilho discreto uma oitava acima só na última, para "abrir" o final.
    note(audio, out, 2093, { at: 0.15, duration: 0.22, peak: 0.012, type: 'sine' })
    breath(audio, out, 700, 2400)
  }

  /** A mesma tríade descendo (C6 → G5 → C5) e o toque seco de fecho. */
  function playStop(): void {
    if (!ui.timerSounds) return
    const audio = getCtx()
    if (!audio) return
    const out = master(audio, 0.55)
    note(audio, out, 1046.5, { at: 0, duration: 0.14, peak: 0.045 })
    note(audio, out, 783.99, { at: 0.07, duration: 0.16, peak: 0.045 })
    note(audio, out, 523.25, { at: 0.14, duration: 0.34, peak: 0.055 })
    note(audio, out, 261.63, { at: 0.14, duration: 0.36, peak: 0.02, type: 'sine' })
    thock(audio, out, 0.14)
  }

  return { playStart, playStop }
}
