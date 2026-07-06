/*
 * Sons do easter egg Windows XP — sintetizados via Web Audio API.
 *
 * Sem arquivos binários nem material de terceiros: geramos tudo na hora com
 * osciladores e ruído filtrado. Sons "inspirados" no XP, não cópias. Volume
 * baixo. O clique do mouse toca a cada clique no modo XP (como no Windows
 * clássico); os demais em eventos específicos (ligar XP, menu, min/max, erro).
 */

// AudioContext único e preguiçoso: criado no primeiro uso (sempre após um gesto
// do usuário, então o autoplay do navegador permite o áudio).
let ctx: AudioContext | null = null
// Buffer de ruído reutilizado para o clique (barato).
let noiseBuffer: AudioBuffer | null = null

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
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Master gain com teto — mantém tudo discreto. */
function out(audio: AudioContext, peak: number): GainNode {
  const g = audio.createGain()
  g.gain.value = peak
  g.connect(audio.destination)
  return g
}

/** Nota com envelope suave. */
function tone(
  audio: AudioContext,
  dest: AudioNode,
  freq: number,
  startAt: number,
  duration: number,
  peak: number,
  type: OscillatorType = 'sine',
): void {
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = type
  osc.frequency.value = freq
  const t0 = audio.currentTime + startAt
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain)
  gain.connect(dest)
  osc.start(t0)
  osc.stop(t0 + duration + 0.05)
}

/** Buffer curto de ruído branco (~120ms), gerado uma vez. */
function getNoise(audio: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer
  const len = Math.floor(audio.sampleRate * 0.12)
  const buf = audio.createBuffer(1, len, audio.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  noiseBuffer = buf
  return buf
}

export function useXpSounds() {
  /**
   * Clique do mouse: dois estalos secos (pressionar + soltar) feitos de ruído
   * filtrado com ataque instantâneo e decaimento rápido — o "tec-tec" clássico.
   */
  function playClick(): void {
    const audio = getCtx()
    if (!audio) return

    const burst = (at: number, peak: number, cutoff: number) => {
      const src = audio.createBufferSource()
      src.buffer = getNoise(audio)
      const bp = audio.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = cutoff
      bp.Q.value = 0.9
      const hp = audio.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 1400
      const g = audio.createGain()
      const t0 = audio.currentTime + at
      g.gain.setValueAtTime(peak, t0)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.028)
      src.connect(bp)
      bp.connect(hp)
      hp.connect(g)
      g.connect(audio.destination)
      src.start(t0)
      src.stop(t0 + 0.05)
    }
    // "tec" (down) mais forte + "tec" (up) mais leve e um tom acima.
    burst(0, 0.14, 2600)
    burst(0.045, 0.08, 3200)
  }

  /** Sino ascendente agradável ao LIGAR o modo XP (tipo "tada", sem copiar). */
  function playStartup(): void {
    const audio = getCtx()
    if (!audio) return
    const master = out(audio, 0.5)
    const notes: Array<[number, number, number]> = [
      [392.0, 0.0, 0.34], // G4
      [523.25, 0.14, 0.34], // C5
      [659.25, 0.28, 0.36], // E5
      [783.99, 0.42, 0.75], // G5 (sustenta)
    ]
    for (const [f, at, dur] of notes) {
      tone(audio, master, f, at, dur, 0.09, 'triangle')
      tone(audio, master, f * 2, at, dur * 0.8, 0.025, 'sine') // brilho de sino
    }
    tone(audio, master, 1046.5, 0.42, 0.7, 0.05, 'sine') // C6 no acorde final
  }

  /** Blip curto ao abrir o menu Iniciar. */
  function playMenuOpen(): void {
    const audio = getCtx()
    if (!audio) return
    const master = out(audio, 0.6)
    tone(audio, master, 880, 0, 0.09, 0.07, 'sine')
    tone(audio, master, 1174.66, 0.05, 0.11, 0.05, 'sine')
  }

  /** Swoop curto pra minimizar (desce) / maximizar/restaurar (sobe). */
  function playMinimize(): void {
    const audio = getCtx()
    if (!audio) return
    const osc = audio.createOscillator()
    const g = audio.createGain()
    const t0 = audio.currentTime
    osc.type = 'sine'
    osc.frequency.setValueAtTime(700, t0)
    osc.frequency.exponentialRampToValueAtTime(240, t0 + 0.16)
    g.gain.setValueAtTime(0.07, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18)
    osc.connect(g)
    g.connect(audio.destination)
    osc.start(t0)
    osc.stop(t0 + 0.2)
  }

  function playMaximize(): void {
    const audio = getCtx()
    if (!audio) return
    const osc = audio.createOscillator()
    const g = audio.createGain()
    const t0 = audio.currentTime
    osc.type = 'sine'
    osc.frequency.setValueAtTime(240, t0)
    osc.frequency.exponentialRampToValueAtTime(760, t0 + 0.16)
    g.gain.setValueAtTime(0.07, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18)
    osc.connect(g)
    g.connect(audio.destination)
    osc.start(t0)
    osc.stop(t0 + 0.2)
  }

  /** "Dong" grave de erro/aviso (duas notas). */
  function playError(): void {
    const audio = getCtx()
    if (!audio) return
    const master = out(audio, 0.6)
    tone(audio, master, 311.13, 0, 0.32, 0.08, 'sine') // Eb4
    tone(audio, master, 233.08, 0.16, 0.4, 0.08, 'sine') // Bb3
  }

  return { playClick, playStartup, playMenuOpen, playMinimize, playMaximize, playError }
}
