<script setup lang="ts">
/**
 * "Tarefa no Nevo" no card (R1, P3; D6 a D8 da spec
 * docs/specs/2026/q4/q4-2/ala-marketing/r1-acervo-tarefas-convite.md).
 *
 * - Lista as tarefas ligadas com o status do board do Nevo (mesmo ícone e
 *   rótulo do board), a empresa, o mês e quem faz.
 * - "Abrir no board" usa o link do aviso da tarefa (`?company=` troca a
 *   empresa ativa). Quem não é da empresa (o freelancer) vê só o título, o
 *   status e a empresa, sem link: a API nem manda o id.
 * - Falha ao mover aparece no próprio item, com "Tentar de novo".
 * - Sem a migration da R1 a API responde 503 e a seção some (nada de erro).
 */
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import axios from 'axios'
import { AlertTriangle, ExternalLink, Link2, Loader2, Lock, Plus, RotateCw, X } from 'lucide-vue-next'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import {
  listCardTasks,
  retryCardTask,
  unlinkCardTask,
  type CardTaskItem,
  type CardTasks,
} from '@/service/marketing/marketing-tasks'
import { statusSpec } from '@/features/tasks/task-meta'
import { brandTone, toneStyle } from '../marketing-labels'
import MarketingTaskPickerDialog from './MarketingTaskPickerDialog.vue'
import { boardLinkFor, monthLabel, taskKeys } from './task-links'

const props = withDefaults(
  defineProps<{
    groupId: string
    cardId: string
    /** Status do card: mudou, a lista rebusca (a tarefa andou no servidor). */
    cardStatus: string
    /** Versão enxuta para o painel lateral (Gráfica). */
    compact?: boolean
  }>(),
  { compact: false },
)

const toast = useToast()
const queryClient = useQueryClient()

const key = computed(() => taskKeys.card(props.groupId, props.cardId))
const query = useQuery({
  queryKey: key,
  queryFn: () => listCardTasks(props.groupId, props.cardId),
  enabled: computed(() => !!props.groupId && !!props.cardId),
  // 503 (migration pendente), 403 e 404 não melhoram tentando de novo.
  retry: (count, err) =>
    !(axios.isAxiosError(err) && [403, 404, 503].includes(err.response?.status ?? 0)) && count < 2,
})

watch(
  () => props.cardStatus,
  (next, prev) => {
    if (prev && next !== prev) void queryClient.invalidateQueries({ queryKey: key.value })
  },
)

/** Sem a tabela da R1 (ou sem acesso): a seção não aparece. */
const hidden = computed(() => {
  const err = query.error.value
  return axios.isAxiosError(err) && [403, 404, 503].includes(err.response?.status ?? 0)
})
const data = computed(() => query.data.value ?? null)
const items = computed(() => data.value?.items ?? [])
const max = computed(() => data.value?.max ?? 5)
const canLink = computed(() => !!data.value?.canLink && items.value.length < max.value)

function apply(next: CardTasks) {
  queryClient.setQueryData(key.value, next)
}

// ── Ligar ──────────────────────────────────────────────────────────────────
const pickerOpen = ref(false)
function onLinked(result: CardTasks & { sync: { ok: boolean; error?: string } }) {
  apply(result)
  void queryClient.invalidateQueries({ queryKey: ['marketing', props.groupId, 'cards', 'history', props.cardId] })
  if (result.sync.ok) toast.success('Tarefa ligada. Ela segue o status do card no board.')
  else toast.error(result.sync.error ?? 'A tarefa foi ligada, mas não andou no board.')
}

// ── Desligar ───────────────────────────────────────────────────────────────
const unlinkTarget = ref<CardTaskItem | null>(null)
const unlinking = ref(false)
async function confirmUnlink() {
  const target = unlinkTarget.value
  if (!target) return
  unlinking.value = true
  try {
    apply(await unlinkCardTask(props.groupId, props.cardId, target.id))
    unlinkTarget.value = null
    toast.success('Tarefa desligada do card.')
  } catch (err) {
    toast.error(getApiErrorMessage(err, 'Não deu para desligar a tarefa.'))
  } finally {
    unlinking.value = false
  }
}

// ── Tentar de novo ─────────────────────────────────────────────────────────
const retrying = ref<string | null>(null)
async function retry(item: CardTaskItem) {
  if (retrying.value) return
  retrying.value = item.id
  try {
    const result = await retryCardTask(props.groupId, props.cardId, item.id)
    apply(result)
    if (result.sync.ok) toast.success('Pronto: a tarefa andou no board.')
    else toast.error(result.sync.error ?? 'Ainda não deu para mover a tarefa.')
  } catch (err) {
    toast.error(getApiErrorMessage(err, 'Não deu para tentar de novo.'))
  } finally {
    retrying.value = null
  }
}

const MAX_FACES = 3
</script>

<template>
  <section
    v-if="!hidden"
    class="mk-panel mct"
    :class="{ 'mct--compact': compact }"
    aria-labelledby="mct-title"
    data-testid="card-tasks"
  >
    <header class="mk-panel__head mct__head">
      <Link2 :size="15" aria-hidden="true" />
      <h2 id="mct-title" class="mct__title">Tarefa no Nevo</h2>
      <span v-if="items.length" class="mct__count">{{ items.length }} de {{ max }}</span>
      <button
        v-if="canLink"
        type="button"
        class="mk-btn mk-btn--ghost mct__add"
        data-action="link-task"
        @click="pickerOpen = true"
      >
        <Plus :size="14" aria-hidden="true" /> Ligar tarefa
      </button>
    </header>

    <div v-if="query.isLoading.value" class="mct__body">
      <Skeleton type="row" />
    </div>

    <div v-else-if="query.isError.value" class="mct__body">
      <div class="mk-load-error" role="alert">
        <p>{{ getApiErrorMessage(query.error.value, 'Não deu para carregar as tarefas ligadas.') }}</p>
        <button type="button" class="mk-btn" @click="query.refetch()">Tentar de novo</button>
      </div>
    </div>

    <p v-else-if="!items.length" class="mct__empty">
      Nenhuma tarefa ligada. Ligue uma tarefa Em andamento e ela anda no board quando o card andar.
    </p>

    <ul v-else class="mct__list" role="list">
      <li v-for="item in items" :key="item.id" class="mct__item" :data-link="item.id" :data-open="item.canOpen ? '1' : '0'">
        <component :is="statusSpec(item.status).icon" :size="16" class="mct__status" />
        <div class="mct__main">
          <div class="mct__line">
            <RouterLink
              v-if="boardLinkFor(item)"
              :to="boardLinkFor(item)!"
              class="mct__name mct__name--link"
              :title="`Abrir “${item.title}” no board`"
            >
              {{ item.title }}
            </RouterLink>
            <span v-else class="mct__name" :title="item.title">{{ item.title }}</span>
            <Lock
              v-if="!item.canOpen"
              :size="12"
              class="mct__lock"
              aria-label="Só quem é da empresa da tarefa abre no board"
              role="img"
            />
          </div>
          <div class="mct__meta">
            <span class="mct__state" data-testid="task-status">{{ statusSpec(item.status).label }}</span>
            <span class="mct__sep" aria-hidden="true">·</span>
            <span class="mct__brand">
              <span class="mk-dot" :style="toneStyle(brandTone({ companyId: item.companyId ?? item.id, color: item.company.color }))" aria-hidden="true" />
              {{ item.company.name }}
            </span>
            <template v-if="item.month">
              <span class="mct__sep" aria-hidden="true">·</span>
              <span>{{ monthLabel(item.month) }}</span>
            </template>
            <span
              v-if="item.responsibles?.length"
              class="mct__faces"
              :title="item.responsibles.map((p) => p.name).join(', ')"
            >
              <PersonAvatar
                v-for="p in item.responsibles.slice(0, MAX_FACES)"
                :id="p.id"
                :key="p.id"
                :name="p.name"
                :avatar-url="p.avatarUrl"
                :size="18"
                ring
                decorative
              />
              <span v-if="item.responsibles.length > MAX_FACES" class="mct__more">+{{ item.responsibles.length - MAX_FACES }}</span>
            </span>
          </div>
          <div v-if="item.lastSyncError" class="mct__fail" role="alert" data-testid="task-sync-error">
            <AlertTriangle :size="13" aria-hidden="true" />
            <span class="mct__fail-text">{{ item.lastSyncError }}</span>
            <button
              v-if="data?.canRetry"
              type="button"
              class="mk-btn mct__retry"
              :disabled="retrying === item.id"
              data-action="retry-task"
              @click="retry(item)"
            >
              <Loader2 v-if="retrying === item.id" :size="13" class="mct__spin" aria-hidden="true" />
              <RotateCw v-else :size="13" aria-hidden="true" />
              Tentar de novo
            </button>
          </div>
        </div>
        <div class="mct__actions">
          <RouterLink
            v-if="boardLinkFor(item)"
            :to="boardLinkFor(item)!"
            class="mk-btn mk-btn--ghost mct__open"
            data-action="open-task"
          >
            <ExternalLink :size="13" aria-hidden="true" />
            <span class="mct__open-text">Abrir no board</span>
          </RouterLink>
          <button
            v-if="item.canUnlink"
            type="button"
            class="mk-icon-btn"
            :aria-label="`Desligar “${item.title}” do card`"
            :title="'Desligar do card'"
            data-action="unlink-task"
            @click="unlinkTarget = item"
          >
            <X :size="15" />
          </button>
        </div>
      </li>
    </ul>

    <MarketingTaskPickerDialog
      v-if="data?.canLink"
      v-model="pickerOpen"
      :group-id="groupId"
      :card-id="cardId"
      :used="items.length"
      :max="max"
      @linked="onLinked"
    />
    <ConfirmDialog
      :model-value="!!unlinkTarget"
      title="Desligar a tarefa?"
      :message="`&quot;${unlinkTarget?.title ?? ''}&quot; deixa de seguir este card. A tarefa continua no board do Nevo, no status em que está.`"
      confirm-label="Desligar"
      danger
      :loading="unlinking"
      @update:model-value="!$event && (unlinkTarget = null)"
      @confirm="confirmUnlink"
    />
  </section>
</template>

<style scoped>
.mct {
  min-width: 0;
}

.mct__head {
  gap: 6px;
  padding-top: 6px;
  padding-bottom: 6px;
  min-height: 44px;
}

.mct__title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.mct__count {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.mct__add {
  margin-left: auto;
  padding: 4px 8px;
  color: var(--accent-ink);
}

.mct__body {
  padding: 10px 14px;
}

.mct__empty {
  margin: 0;
  padding: 10px 14px 12px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-3);
}

.mct__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.mct__item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 8px 8px 14px;
  border-bottom: 1px solid var(--border);
}

.mct__item:last-child {
  border-bottom: 0;
}

.mct__status {
  flex-shrink: 0;
  margin-top: 2px;
}

.mct__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mct__line {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  min-width: 0;
}

/* Título em até 2 linhas: na coluna de 380px o corte em 1 linha escondia o nome. */
.mct__name {
  display: -webkit-box;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  color: var(--text);
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.mct__name--link {
  text-decoration: none;
}

.mct__name--link:hover {
  color: var(--accent-ink);
  text-decoration: underline;
}

.mct__lock {
  flex-shrink: 0;
  margin-top: 3px;
  color: var(--text-3);
}

.mct__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 5px;
  min-width: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--text-3);
}

.mct__state {
  color: var(--text-2);
  font-weight: 600;
}

.mct__brand {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.mct__faces {
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
  --pa-ring-color: var(--surface);
}

.mct__faces > :not(:first-child) {
  margin-left: -4px;
}

.mct__more {
  margin-left: 3px;
}

.mct__fail {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  padding: 5px 6px 5px 8px;
  border: 1px solid color-mix(in srgb, var(--warn) 40%, var(--border));
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--warn) 9%, var(--surface));
  color: var(--text);
  font-size: 12px;
  line-height: 16px;
}

.mct__fail > svg {
  flex-shrink: 0;
  color: var(--warn);
}

.mct__fail-text {
  flex: 1 1 140px;
  min-width: 0;
}

.mct__retry {
  min-height: 26px;
  padding: 2px 8px;
  font-size: 12px;
}

.mct__spin {
  animation: mct-spin 0.8s linear infinite;
}

@keyframes mct-spin {
  to {
    transform: rotate(360deg);
  }
}

.mct__actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 2px;
}

.mct__open {
  min-height: 28px;
  padding: 2px 8px;
  font-size: 12px;
  color: var(--accent-ink);
  text-decoration: none;
}

/* Painel lateral estreito (Gráfica): o "Abrir no board" vira só o ícone. */
.mct--compact .mct__open-text {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (max-width: 640px) {
  .mct__item {
    flex-wrap: wrap;
    padding-right: 10px;
  }

  .mct__main {
    flex-basis: calc(100% - 26px);
  }

  .mct__actions {
    width: 100%;
    justify-content: flex-end;
    gap: 6px;
  }

  .mct__open,
  .mct__retry,
  .mct__add {
    min-height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mct__spin {
    animation-duration: 2s;
  }
}
</style>
