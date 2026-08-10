import { computed, ref, watch, type Ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import activityService from '@/service/activities/activity-service'
import { getApiErrorMessage } from '@/service/api'
import { useToast } from '@/composables/useToast'
import type { SaveState } from '@/components/ui/save-state'
import type { ActivityDoc, ActivityDocMeta } from '../activity-types'

/**
 * Documentos markdown de uma atividade.
 *
 * A lista de metadados chega junto com a atividade (`activity.docs`), então
 * aqui só cuidamos do CONTEÚDO, que é carregado um por vez. Isso é o que
 * mantém o payload da tarefa e do board pequeno: markdown de spec não trafega
 * em listagem.
 *
 * O autosave segue a mesma regra honesta do resto do app: só diz "salvo"
 * quando o servidor confirma.
 */
export function useActivityDocs(
  activityId: Ref<string | null>,
  companyId: Ref<string | null | undefined>,
  docs: Ref<ActivityDocMeta[]>,
  /** Recarrega a atividade: a lista de docs vive nela, não aqui. */
  onListChanged: () => void,
) {
  const queryClient = useQueryClient()
  const { error: showError } = useToast()

  const selectedId = ref<string | null>(null)

  /** Documento principal, ou o primeiro. É por onde a pessoa começa a ler. */
  const defaultDocId = computed(
    () => docs.value.find((d) => d.isPrimary)?.id ?? docs.value[0]?.id ?? null,
  )

  // Seleciona sozinho, e recupera quando o selecionado deixa de existir
  // (apagado aqui ou por outra aba via realtime).
  watch(
    [docs, defaultDocId],
    () => {
      const stillThere = docs.value.some((d) => d.id === selectedId.value)
      if (!stillThere) selectedId.value = defaultDocId.value
    },
    { immediate: true },
  )

  const contentQuery = useQuery<ActivityDoc>({
    queryKey: computed(() => ['activity-doc', selectedId.value]),
    queryFn: () =>
      activityService.getDoc(selectedId.value!, companyId.value ?? undefined),
    enabled: computed(() => !!selectedId.value),
    staleTime: 30_000,
  })

  // ─── Autosave ──────────────────────────────────────────────────────────────

  const draft = ref('')
  const saveState = ref<SaveState>('idle')
  const savedAt = ref<number | null>(null)
  const saveError = ref('')
  /** Sujo = o rascunho na tela ainda não bateu com o que o servidor confirmou. */
  const dirty = ref(false)
  const focused = ref(false)
  let debounce: number | undefined
  let lastSaved = ''

  /**
   * Espelha o conteúdo do servidor no rascunho, MAS nunca por cima do que a
   * pessoa está escrevendo.
   *
   * Sem as três condições isto vira um laço: grava, a resposta entra no cache,
   * o watcher reescreve o textarea, o cursor pula para o fim e o `input`
   * dispara outra gravação. Mesma guarda do `InlineEditText` e do editor de
   * descrição da R1.
   */
  watch(
    () => contentQuery.data.value,
    (doc) => {
      if (!doc) return
      if (focused.value || dirty.value) return
      if (doc.content === draft.value) return
      draft.value = doc.content
      lastSaved = doc.content
    },
    { immediate: true },
  )

  // Trocar de documento descarta o estado do anterior, inclusive o erro: herdar
  // "erro ao salvar" de outro documento seria mentira.
  watch(selectedId, () => {
    window.clearTimeout(debounce)
    draft.value = ''
    lastSaved = ''
    dirty.value = false
    saveState.value = 'idle'
    saveError.value = ''
    savedAt.value = null
  })

  async function persist(): Promise<void> {
    const docId = selectedId.value
    if (!docId) return
    const value = draft.value
    if (value === lastSaved) {
      dirty.value = false
      return
    }

    saveState.value = 'saving'
    saveError.value = ''
    try {
      await activityService.patchDoc(
        docId,
        { content: value },
        companyId.value ?? undefined,
      )
      lastSaved = value
      // Só limpa o "sujo" se nada foi digitado durante a request; senão o
      // watcher acima poderia sobrescrever o que a pessoa acabou de escrever.
      if (draft.value === value) dirty.value = false
      saveState.value = 'saved'
      savedAt.value = Date.now()
      queryClient.setQueryData<ActivityDoc>(['activity-doc', docId], (old) =>
        old ? { ...old, content: value } : old,
      )
    } catch (err) {
      const message = getApiErrorMessage(err, 'Não foi possível salvar o documento')
      saveState.value = 'error'
      saveError.value = message
      showError(message)
    }
  }

  function onInput(value: string): void {
    draft.value = value
    dirty.value = true
    window.clearTimeout(debounce)
    debounce = window.setTimeout(() => void persist(), 800)
  }

  /** Grava agora (blur, fechar o painel). */
  function flush(): Promise<void> {
    window.clearTimeout(debounce)
    return persist()
  }

  function retry(): Promise<void> {
    return persist()
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async function createDoc(input: {
    title: string
    filename?: string
    content?: string
    isPrimary?: boolean
  }): Promise<void> {
    if (!activityId.value) return
    try {
      const created = await activityService.postDoc(
        activityId.value,
        input,
        companyId.value ?? undefined,
      )
      onListChanged()
      selectedId.value = created.id
    } catch (err) {
      showError(getApiErrorMessage(err, 'Não foi possível criar o documento'))
    }
  }

  async function patchMeta(
    docId: string,
    data: { title?: string; filename?: string; isPrimary?: boolean },
  ): Promise<void> {
    try {
      await activityService.patchDoc(docId, data, companyId.value ?? undefined)
      onListChanged()
    } catch (err) {
      showError(getApiErrorMessage(err, 'Não foi possível atualizar o documento'))
    }
  }

  async function removeDoc(docId: string): Promise<void> {
    try {
      await activityService.deleteDoc(docId, companyId.value ?? undefined)
      void queryClient.removeQueries({ queryKey: ['activity-doc', docId] })
      onListChanged()
    } catch (err) {
      showError(getApiErrorMessage(err, 'Não foi possível remover o documento'))
    }
  }

  async function reorder(docIds: string[]): Promise<void> {
    if (!activityId.value) return
    try {
      await activityService.reorderDocs(
        activityId.value,
        docIds,
        companyId.value ?? undefined,
      )
      onListChanged()
    } catch (err) {
      showError(getApiErrorMessage(err, 'Não foi possível reordenar os documentos'))
    }
  }

  return {
    selectedId,
    selected: computed(() => docs.value.find((d) => d.id === selectedId.value) ?? null),
    content: contentQuery.data,
    isLoadingContent: contentQuery.isLoading,
    draft,
    saveState,
    savedAt,
    saveError,
    dirty,
    focused,
    onInput,
    flush,
    retry,
    createDoc,
    patchMeta,
    removeDoc,
    reorder,
  }
}
