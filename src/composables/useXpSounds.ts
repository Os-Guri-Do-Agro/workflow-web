/*
 * Sons do easter egg Windows XP — sintetizados via Web Audio API.
 *
 * Sem arquivos binários: geramos os sons na hora com osciladores, então nada
 * de assets extras nem dependência de rede. Volume baixo e discreto. Tocam SÓ
 * nos eventos citados (ligar o modo XP / abrir o menu Iniciar), nunca a cada
 * clique. Os sons são "inspirados" no XP, não cópias dos originais.
 */

// AudioContext único e preguiçoso: criado só no primeiro uso (após um gesto do
// usuário — ligar o XP / abrir o menu é sempre um clique, então o autoplay do
// navegador permite o áudio).
let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) {
    try {
      ctx = new Ctor()
    } catch {
      return null
    }
  }
  // Se o contexto foi suspenso (política de autoplay), tenta retomar — funciona
  // porque a chamada acontece logo após o gesto do usuário.
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/**
 * Toca uma nota simples com envelope suave (ataque/decay curtos) para não
 * estourar. `peak` mantém o volume baixo (~0.06 por padrão).
 */
function playTone(
  audio: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  peak = 0.06,
  type: OscillatorType = 'sine',
): void {
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = type
  osc.frequency.value = freq

  const t0 = audio.currentTime + startAt
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)

  osc.connect(gain)
  gain.connect(audio.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.05)
}

export function useXpSounds() {
  /** Acorde/sino ascendente agradável ao LIGAR o modo XP (tipo "tada", sem copiar). */
  function playStartup(): void {
    const audio = getCtx()
    if (!audio) return
    // Arpejo ascendente + acorde final (Fá maior deslocado), bem suave.
    const notes: Array<[freq: number, at: number, dur: number]> = [
      [523.25, 0.0, 0.28], // C5
      [659.25, 0.12, 0.3], // E5
      [783.99, 0.24, 0.34], // G5
      [1046.5, 0.36, 0.6], // C6 (sustenta)
    ]
    for (const [freq, at, dur] of notes) playTone(audio, freq, at, dur, 0.05, 'triangle')
    // Camada de "sino" leve por cima da última nota.
    playTone(audio, 1567.98, 0.36, 0.5, 0.02, 'sine')
  }

  /** Blip curtinho ao abrir o menu Iniciar. */
  function playMenuOpen(): void {
    const audio = getCtx()
    if (!audio) return
    playTone(audio, 880, 0, 0.09, 0.045, 'sine')
    playTone(audio, 1174.66, 0.05, 0.1, 0.03, 'sine')
  }

  return { playStartup, playMenuOpen }
}
