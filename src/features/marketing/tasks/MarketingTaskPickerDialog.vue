<script setup lang="ts">
/**
 * "Ligar tarefa": escolhe uma tarefa Em andamento do board do Nevo para seguir
 * o card (R1, P3; D6 e D8 da spec r1-acervo-tarefas-convite.md).
 *
 * Só aparecem tarefas Em andamento das empresas ativas do grupo em que a
 * pessoa tem empresa; a marca do card vem primeiro (no filtro e na lista). A
 * busca é no servidor (até 50), com espera curta enquanto digita.
 */
import { computed, ref, watch } from 'vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { Link2, Loader2, Search, SearchX, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import {
  getTaskCandidates,
  linkCardTask,
  type CardTasks,
  type SyncOutcome,
  type TaskCandidate,
} from '@/service/marketing/marketing-tasks'
import { statusSpec } from '@/features/tasks/task-meta'
import { brandTone, toneStyle } from '../marketing-labels'
import { monthLabel, taskKeys } from './task-links'

const props = defineProps<{
  modelValue: boolean
  groupId: string
  cardId: string
  /** Quantas tarefas o card já tem e o teto (5). */
  used: number
  max: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  linked: [result: CardTasks & { sync: SyncOutcome }]
}>()

const toast = useToast()

const ALL = 'all'
const company = ref<string>(ALL)
const search = ref('')
const q = ref('')
let timer: number | null = null
watch(search, (value) => {
  if (timer !== null) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    q.value = value.replace(/\s+/g, ' ').trim()
  }, 250)
})

// Abriu de novo: começa do zero (outra tarefa, outro momento).
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    company.value = ALL
    search.value = ''
    q.value = ''
    error.value = ''
  },
)

const filter = computed(() => ({
  cardId: props.cardId,
  companyId: company.value === ALL ? null : company.value,
  q: q.value,
}))

const query = useQuery({
  queryKey: computed(() => taskKeys.candidates(props.groupId, filter.value)),
  queryFn: () => getTaskCandidates(props.groupId, filter.value),
  enabled: computed(() => props.modelValue && !!props.groupId && !!props.cardId),
  placeholderData: keepPreviousData,
  staleTime: 15_000,
})

const companies = computed(() => query.data.value?.companies ?? [])

/** Frase curta para leitor de tela: só ela é anunciada, não a lista inteira. */
const statusText = computed(() => {
  if (query.isLoading.value) return 'Carregando tarefas.'
  if (query.isError.value) return 'Não deu para carregar as tarefas.'
  const n = items.value.length
  if (!n) return 'Nenhuma tarefa encontrada.'
  return n === 1 ? '1 tarefa encontrada.' : `${n} tarefas encontradas.`
})
const companyItems = computed(() => [
  { label: 'Todas as empresas', value: ALL },
  ...companies.value.map((c) => ({ label: c.name, value: c.companyId })),
])
const items = computed(() => query.data.value?.items ?? [])
const full = computed(() => props.used >= props.max)
const noCompany = computed(() => !!query.data.value && companies.value.length === 0)

const linking = ref<string | null>(null)
const error = ref('')

async function pick(task: TaskCandidate) {
  if (task.linked || linking.value || full.value) return
  linking.value = task.id
  error.value = ''
  try {
    const result = await linkCardTask(props.groupId, props.cardId, task.id)
    emit('linked', result)
    emit('update:modelValue', false)
  } catch (err) {
    error.value = getApiErrorMessage(err, 'Não deu para ligar a tarefa.')
    toast.error(error.value)
    void query.refetch()
  } finally {
    linking.value = null
  }
}

function close() {
  emit('update:modelValue', false)
}

const MAX_FACES = 3
</script>

<template>
  <AppDialog :model-value="modelValue" label="Ligar tarefa do Nevo" size="lg" :loading="!!linking" @update:model-value="close">
    <div class="mtp">
      <header class="mtp__head">
        <span class="mtp__icon" aria-hidden="true"><Link2 :size="16" /></span>
        <h2 class="mtp__title">Ligar tarefa do Nevo</h2>
        <button type="button" class="mk-icon-btn" aria-label="Fechar" :disabled="!!linking" @click="close">
          <X :size="16" />
        </button>
      </header>

      <div class="mtp__tools">
        <label class="mtp__search">
          <Search :size="14" aria-hidden="true" />
          <input
            v-model="search"
            type="search"
            class="mk-input"
            name="task-search"
            placeholder="Buscar pelo título"
            aria-label="Buscar tarefa pelo título"
            autocomplete="off"
            maxlength="200"
          />
        </label>
        <div class="mtp__company" data-testid="task-company-filter">
          <AppSelect
            v-model="company"
            :items="companyItems"
            label="Empresa"
            density="compact"
            :disabled="!companies.length"
          />
        </div>
      </div>

      <p class="mtp__hint">
        A tarefa passa a seguir o card: Aguardando aprovação leva para Em teste, Aprovado para Concluído e
        Ajustes pedidos de volta para Em andamento.
      </p>
      <p v-if="full" class="mk-error" role="alert">Este card já tem {{ max }} tarefas. Desligue uma para ligar outra.</p>
      <p v-else-if="error" class="mk-error" role="alert" data-testid="task-link-error">{{ error }}</p>

      <p class="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="task-picker-status">{{ statusText }}</p>

      <div class="mtp__body">
        <div v-if="query.isLoading.value" class="mtp__loading">
          <Skeleton v-for="i in 4" :key="i" type="row" />
        </div>

        <div v-else-if="query.isError.value" class="mk-load-error" role="alert">
          <p>{{ getApiErrorMessage(query.error.value, 'Não deu para carregar as tarefas.') }}</p>
          <button type="button" class="mk-btn" @click="query.refetch()">Tentar de novo</button>
        </div>

        <EmptyState
          v-else-if="!items.length"
          :icon="SearchX"
          :title="noCompany ? 'Você não está em nenhuma empresa do grupo' : q ? 'Nenhuma tarefa com esse título' : 'Nenhuma tarefa Em andamento'"
          description="Só aparecem tarefas Em andamento das empresas do grupo em que você está."
          data-testid="task-picker-empty"
        />

        <ul v-else class="mtp__list" role="list" data-testid="task-candidates">
          <li
            v-for="task in items"
            :key="task.id"
            class="mtp__row"
            :class="{ 'is-linked': task.linked }"
            :data-task="task.id"
          >
            <component :is="statusSpec(task.status).icon" :size="16" class="mtp__status" />
            <div class="mtp__main">
              <span class="mtp__name" :title="task.title">{{ task.title }}</span>
              <span class="mtp__meta">
                <span class="mtp__brand">
                  <span class="mk-dot" :style="toneStyle(brandTone({ companyId: task.companyId, color: task.company.color }))" aria-hidden="true" />
                  {{ task.company.name }}
                </span>
                <span class="mtp__sep" aria-hidden="true">·</span>
                <span>{{ monthLabel(task.month) }}</span>
              </span>
            </div>
            <span v-if="task.responsibles.length" class="mtp__faces" :title="task.responsibles.map((p) => p.name).join(', ')">
              <PersonAvatar
                v-for="p in task.responsibles.slice(0, MAX_FACES)"
                :id="p.id"
                :key="p.id"
                :name="p.name"
                :avatar-url="p.avatarUrl"
                :size="22"
                ring
                decorative
              />
              <span v-if="task.responsibles.length > MAX_FACES" class="mtp__more">+{{ task.responsibles.length - MAX_FACES }}</span>
            </span>
            <span v-else class="mtp__nobody">Sem responsável</span>
            <span v-if="task.linked" class="mtp__done">Já ligada</span>
            <button
              v-else
              type="button"
              class="mk-btn mtp__pick"
              :disabled="!!linking || full"
              :aria-label="`Ligar “${task.title}”`"
              data-action="pick-task"
              @click="pick(task)"
            >
              <Loader2 v-if="linking === task.id" :size="14" class="mtp__spin" aria-hidden="true" />
              Ligar
            </button>
          </li>
        </ul>

        <p v-if="query.data.value?.truncated" class="mk-hint mtp__cut">
          Mostrando as {{ query.data.value.limit }} mais recentes. Busque pelo título para achar outra.
        </p>
      </div>
    </div>
  </AppDialog>
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.mtp {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.mtp__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 10px;
}

.mtp__icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.mtp__title {
  flex: 1;
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.mtp__tools {
  display: flex;
  gap: 8px;
  padding: 0 16px;
}

.mtp__search {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  color: var(--text-3);
}

.mtp__search svg {
  position: absolute;
  left: 10px;
  pointer-events: none;
}

.mtp__search .mk-input {
  padding-left: 30px;
}

.mtp__company {
  flex: 0 0 200px;
  min-width: 0;
}

.mtp__hint {
  margin: 8px 16px 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-3);
}

.mtp > .mk-error {
  margin: 6px 16px 0;
}

.mtp__body {
  flex: 1 1 auto;
  min-height: 120px;
  max-height: min(56vh, 460px);
  overflow-y: auto;
  padding: 10px 16px 16px;
}

.mtp__loading {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mtp__body :deep(.empty-state) {
  padding: 32px 16px;
}

.mtp__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.mtp__row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 6px 8px 6px 10px;
  border-bottom: 1px solid var(--border);
}

.mtp__row:last-child {
  border-bottom: 0;
}

.mtp__row:hover {
  background: var(--surface-2);
}

.mtp__row.is-linked {
  color: var(--text-3);
}

.mtp__status {
  flex-shrink: 0;
}

.mtp__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.mtp__name {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mtp__meta {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  line-height: 16px;
  color: var(--text-3);
  white-space: nowrap;
}

.mtp__brand {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mtp__faces {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  --pa-ring-color: var(--surface);
}

/* Mesmo empilhamento do card do board (TaskCard): -4px com anel. */
.mtp__faces > :not(:first-child) {
  margin-left: -4px;
}

.mtp__more,
.mtp__nobody {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
}

.mtp__more {
  margin-left: 4px;
}

.mtp__done {
  flex-shrink: 0;
  min-width: 64px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
  text-align: center;
}

.mtp__pick {
  flex-shrink: 0;
  min-width: 64px;
}

.mtp__spin {
  animation: mtp-spin 0.8s linear infinite;
}

@keyframes mtp-spin {
  to {
    transform: rotate(360deg);
  }
}

.mtp__cut {
  margin: 8px 0 0;
}

@media (max-width: 640px) {
  .mtp__tools {
    flex-direction: column;
  }

  /* AppSelect compacto tem 36px; no celular o toque pede 44px. */
  .mtp__company :deep(.app-select__trigger) {
    min-height: 44px;
  }

  .mtp__company {
    flex-basis: auto;
  }

  /* Celular: título e empresa em cima, pessoas embaixo, Ligar à direita nas
     duas linhas (o alvo de 44px não empurra a linha para baixo). */
  .mtp__row {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    column-gap: 10px;
    row-gap: 4px;
    padding: 8px 10px;
  }

  .mtp__status {
    grid-column: 1;
    grid-row: 1;
    align-self: start;
    margin-top: 1px;
  }

  .mtp__main {
    grid-column: 2;
    grid-row: 1;
  }

  .mtp__name {
    display: -webkit-box;
    white-space: normal;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .mtp__faces,
  .mtp__nobody {
    grid-column: 2;
    grid-row: 2;
    justify-self: start;
  }

  .mtp__pick,
  .mtp__done {
    grid-column: 3;
    grid-row: 1 / span 2;
    min-height: 44px;
  }

  .mtp__done {
    display: grid;
    place-items: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mtp__spin {
    animation-duration: 2s;
  }
}
</style>
