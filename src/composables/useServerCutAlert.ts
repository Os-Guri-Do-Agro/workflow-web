import { onScopeDispose } from 'vue'
import realtimeService from '@/service/realtime/realtime-service'
import { useSystemNotification } from '@/composables/useSystemNotification'
import { useTimerSounds } from '@/composables/useTimerSounds'
import type { TimeEntry } from '@/service/time/time-service'

/**
 * Aviso do corte decidido pelo SERVIDOR (spec timer-avisa-antes-de-parar).
 *
 * O buraco que isto fecha: `closeForgotten` no backend encerra a entrada, marca
 * `autoStopped` e emite `time:stopped`. O front recebia esse evento e fazia
 * apenas `setQueryData(current, null)` — o cronômetro sumia da tela sem uma
 * palavra. Era o "ele só para" relatado pelo time.
 *
 * Por que um composable separado do `useTimerIdleGuard`: o guard é a política de
 * OCIOSIDADE desta máquina, com carência, claim entre abas e recuperação. Isto
 * aqui é a chegada de uma decisão tomada em outro lugar, sem nada a negociar.
 * Misturar os dois faria o guard reagir ao próprio corte de volta.
 */

const CUT_TAG = 'nevo-server-cut'

/**
 * Motivos que valem aviso, e por que a lista não é "todos".
 *
 * `idle` é o corte do próprio `useTimerIdleGuard`: ele já toca o som e já sobe a
 * notificação. Avisar de novo aqui daria dois sons e dois toasts para o mesmo
 * evento, porque o backend marca `autoStopped` também no fechamento retroativo
 * que o guard pede. `user` e `resolved` são ações deliberadas da pessoa.
 *
 * Sobram os dois que ninguém pediu: o timer esquecido que o cron encerrou, e o
 * teto de 24h aplicado por cima de uma parada.
 */
const REASONS: ReadonlyArray<string> = ['forgotten', 'cap']

/** O backend manda o motivo do fechamento junto da entrada. */
type StoppedEntry = TimeEntry & { closeReason?: string | null }

function hhmm(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function message(entry: StoppedEntry): { title: string; body: string } {
  const desc = entry.description?.trim() || 'Sem descrição'
  const fim = hhmm(entry.endedAt)
  if (entry.closeReason === 'cap') {
    return {
      title: 'Timer encerrado no limite de 24h',
      body: `"${desc}" passou de 24 horas e foi fechado no teto. Confira o registro em Meu tempo.`,
    }
  }
  return {
    title: 'Timer encerrado por esquecimento',
    body: `"${desc}" ficou rodando e foi encerrado às ${fim}. Se o horário não confere, ajuste em Meu tempo.`,
  }
}

let installed = false

export function useServerCutAlert() {
  if (installed || typeof window === 'undefined') return
  installed = true

  const notification = useSystemNotification()
  const { playStop } = useTimerSounds()

  const unsubscribe = realtimeService.connect({
    timeStopped: (entry: StoppedEntry) => {
      // Sem `autoStopped` foi a pessoa que parou, e parar é o resultado
      // esperado de clicar em parar: notificar aí seria ruído.
      if (!entry?.autoStopped) return
      if (!REASONS.includes(entry.closeReason ?? '')) return

      playStop()
      const { title, body } = message(entry)
      void notification.notify({
        tag: CUT_TAG,
        title,
        body,
        data: { kind: 'idle-cut' as const },
      })
    },
  }) as (() => boolean) | null

  onScopeDispose(() => {
    unsubscribe?.()
    installed = false
  })
}
