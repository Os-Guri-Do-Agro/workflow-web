import { reactive, ref, watch } from 'vue'
import { useTimeTracking } from '@/composables/useTimeTracking'
import type { SaveState } from '@/components/ui/save-state'

interface Options {
  /** Empresa dona de uma atividade — para desfazer vínculo inconsistente. */
  companyOf?: (activityId: string | null) => string | null
}

/**
 * T2 (spec time-tracking-v2) — edição ao vivo da entrada em andamento (paridade
 * Clockify).
 *
 * Descrição / empresa / tarefa / faturável passam a ser editáveis SEM parar o
 * timer, persistindo por `PATCH /time/entries/:id` parcial e debounced. Nunca
 * envia `endedAt` (o backend mantém o timer aberto). O form local é a verdade
 * enquanto o mesmo timer roda; só repovoa quando um timer NOVO começa (`id`
 * muda), para o refetch pós-PATCH não apagar o que o usuário acabou de digitar.
 *
 * Não usa deep-watch para autosave: cada campo chama `touch()`/`setCompany()`/
 * `setActivity()` explicitamente, então a hidratação nunca dispara um save falso.
 */
export function useRunningEntryEditor(opts: Options = {}) {
  const { running, updateEntry } = useTimeTracking()

  const form = reactive({
    description: '',
    companyId: null as string | null,
    activityId: null as string | null,
    billable: false,
  })
  const state = ref<SaveState>('idle')
  const savedAt = ref<number | null>(null)

  let debounce: number | null = null
  const syncedId = ref<string | null>(null)

  watch(
    running,
    (r) => {
      if (r && r.id !== syncedId.value) {
        syncedId.value = r.id
        form.description = r.description
        form.companyId = r.companyId
        form.activityId = r.activityId
        form.billable = r.billable
        state.value = 'idle'
      } else if (!r) {
        syncedId.value = null
      }
    },
    { immediate: true },
  )

  function scheduleSave() {
    if (!running.value) return
    if (debounce !== null) window.clearTimeout(debounce)
    debounce = window.setTimeout(flush, 600)
  }

  function flush() {
    const r = running.value
    if (!r) return
    if (debounce !== null) {
      window.clearTimeout(debounce)
      debounce = null
    }
    state.value = 'saving'
    updateEntry.mutate(
      {
        id: r.id,
        data: {
          description: form.description.trim(),
          companyId: form.companyId ?? '',
          // Sem empresa não há tarefa válida (o backend exige company p/ activity).
          activityId: form.companyId ? (form.activityId ?? '') : '',
          billable: form.billable,
        },
      },
      {
        onSuccess: () => {
          state.value = 'saved'
          savedAt.value = Date.now()
        },
        onError: () => {
          state.value = 'error'
        },
      },
    )
  }

  /** Digitação na descrição / toggle de faturável. */
  function touch() {
    scheduleSave()
  }

  // O AppSelect emite SelectValuePrimitive (string | number | boolean | null);
  // aqui os valores são sempre id (string) ou null ("Pessoal"/"Sem tarefa").
  const toId = (v: unknown): string | null => (typeof v === 'string' ? v : null)

  /** Troca de empresa: desfaz a tarefa que não pertence à nova empresa. */
  function setCompany(raw: unknown) {
    const id = toId(raw)
    form.companyId = id
    if (form.activityId && opts.companyOf?.(form.activityId) !== id) {
      form.activityId = null
    }
    scheduleSave()
  }

  /** Escolha de tarefa: preenche a empresa dela se ainda não houver. */
  function setActivity(raw: unknown) {
    const id = toId(raw)
    form.activityId = id
    if (id && !form.companyId) form.companyId = opts.companyOf?.(id) ?? null
    scheduleSave()
  }

  return { form, state, savedAt, touch, setCompany, setActivity, flush }
}
