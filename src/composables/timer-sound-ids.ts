/**
 * Ids dos timbres do cronômetro, isolados dos sons em si.
 *
 * Existe como módulo próprio para o `uiStores` poder validar o que veio do
 * `localStorage` sem importar `useTimerSounds` — que, por sua vez, lê o store.
 * Seria um ciclo de import por causa de uma lista de strings.
 */
export const TIMER_SOUND_IDS = ['nevo', 'sino', 'marimba', 'bolha', 'retro', 'suave'] as const

export type TimerSoundId = (typeof TIMER_SOUND_IDS)[number]

export function isTimerSoundId(value: string): value is TimerSoundId {
  return (TIMER_SOUND_IDS as readonly string[]).includes(value)
}
