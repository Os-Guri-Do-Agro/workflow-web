<script setup lang="ts">
/**
 * Lixeira da ala (spec R2, C6). Apagar em qualquer módulo manda para cá: o
 * item some de todas as telas e totais e volta pelo "Restaurar" em até 30
 * dias; depois disso o expurgo apaga de vez (storage junto).
 *
 * Admin (e Dono) vê tudo e restaura; Editor vê e restaura o que ELE mandou;
 * "Apagar de vez" é só do Admin. Visualizador não chega aqui (a aba some e a
 * API responde 403).
 */
import { computed, ref } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { Lock, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useToast } from '@/composables/useToast'
import { getTrash, purgeTrash, restoreTrash, type TrashEntry } from '@/service/marketing/marketing-trash'
import { apiErrorMessage } from '../calendar/api-error'
import { useMarketing } from '../composables/useMarketing'
import { brandTone, formatCents, toneStyle } from '../marketing-labels'
import { asText } from '../select-items'
import { TRASH_TYPES, TRASH_TYPE_META, agoLabel, contentsLabel, deletedWord, purgeLabel } from '../trash/trash-meta'
import { refreshAfterTrash } from '../trash/useTrashUndo'

const mk = useMarketing()
const qc = useQueryClient()
const toast = useToast()

const isAdmin = computed(() => mk.can('ADMIN'))
/** Visualizador não vê a lixeira (a API responde 403): a tela diz isso. */
const canSee = computed(() => mk.can('EDITOR'))
const seesFinance = computed(() => !!mk.permissions.value?.seeFinance)
const type = ref('')
const q = ref('')

const typeItems = computed(() => [
  { label: 'Todos os tipos', value: '' },
  ...TRASH_TYPES.filter((t) => seesFinance.value || !TRASH_TYPE_META[t].finance).map((t) => ({
    label: TRASH_TYPE_META[t].label,
    value: t,
  })),
])

const queryKey = computed(() => ['marketing', mk.groupId.value, 'trash', mk.brandFilter.value ?? '', type.value] as const)
const trash = useQuery({
  queryKey,
  enabled: computed(() => !!mk.groupId.value && canSee.value),
  queryFn: () =>
    getTrash(mk.groupId.value!, {
      type: type.value || undefined,
      companyId: mk.brandFilter.value ?? undefined,
    }),
  staleTime: 15_000,
})

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const items = computed<TrashEntry[]>(() => {
  const term = norm(q.value.trim())
  const all = trash.data.value?.items ?? []
  return term ? all.filter((i) => norm(`${i.title} ${i.typeLabel}`).includes(term)) : all
})

function brandName(companyId: string | null) {
  if (!companyId) return 'Geral do grupo'
  return mk.brandById(companyId)?.name ?? 'Marca'
}
function brandToneOf(companyId: string | null) {
  return companyId ? brandTone(mk.brandById(companyId)) : 'slate'
}

/**
 * Os que estão restaurando agora (um conjunto, não um só): com dois cliques
 * seguidos, o primeiro que terminava liberava o botão do segundo no meio, e o
 * clique a mais dava "não está na lixeira" (auditoria da parte C).
 */
const busy = ref(new Set<string>())
const keyOf = (e: Pick<TrashEntry, 'type' | 'id'>) => `${e.type}:${e.id}`
const restore = useMutation({
  mutationFn: (entry: TrashEntry) => restoreTrash(mk.groupId.value!, { type: entry.type, id: entry.id }),
  onMutate: (entry) => {
    busy.value.add(keyOf(entry))
  },
  onSuccess: async (res, entry) => {
    const note = res.restored.find((r) => r.note)?.note
    toast.success(note ? `"${entry.title}" voltou (${note}).` : `"${entry.title}" voltou para o lugar.`)
    await refreshAfterTrash(qc, mk.groupId.value!, entry.type)
  },
  onError: async (err) => {
    toast.error(apiErrorMessage(err, 'Não deu para restaurar.'))
    // A frase pode ser "foi apagado de vez agora há pouco": a lista se acerta.
    await qc.invalidateQueries({ queryKey: ['marketing', mk.groupId.value, 'trash'] })
  },
  onSettled: (_res, _err, entry) => {
    busy.value.delete(keyOf(entry))
  },
})
function onRestore(entry: TrashEntry) {
  if (busy.value.has(keyOf(entry))) return
  restore.mutate(entry)
}

const toPurge = ref<TrashEntry | null>(null)
const purge = useMutation({
  mutationFn: (entry: TrashEntry) => purgeTrash(mk.groupId.value!, entry.type, entry.id),
  onSuccess: async (_res, entry) => {
    toast.success(`"${entry.title}" foi ${deletedWord(entry.type)} de vez.`)
    toPurge.value = null
    await refreshAfterTrash(qc, mk.groupId.value!, entry.type)
  },
  onError: async (err) => {
    toast.error(apiErrorMessage(err, 'Não deu para apagar de vez.'))
    toPurge.value = null
    await qc.invalidateQueries({ queryKey: ['marketing', mk.groupId.value, 'trash'] })
  },
})
const purgeMessage = computed(() => {
  const e = toPurge.value
  if (!e) return ''
  const extra = e.contents ? ` ${contentsLabel(e.contents)}` : ''
  return `"${e.title}"${extra} sai do Nevo agora, com os arquivos no storage. Não dá para desfazer.`
})
</script>

<template>
  <div class="mk-page mkt">
    <div v-if="canSee" class="mk-toolbar mkt__bar">
      <label class="mkt__search">
        <Search :size="15" aria-hidden="true" />
        <input
          v-model="q"
          type="search"
          class="mk-input"
          placeholder="Buscar na lixeira"
          aria-label="Buscar na lixeira"
          data-field="trash-search"
        />
      </label>
      <div class="mkt__type" data-field="trash-type">
        <AppSelect
          :model-value="type"
          :items="typeItems"
          label="Filtrar por tipo"
          density="compact"
          @update:model-value="type = asText($event)"
        />
      </div>
      <span class="mk-toolbar__spacer" />
      <span class="mkt__count" data-testid="trash-count">
        {{ items.length }} {{ items.length === 1 ? 'item' : 'itens' }}
      </span>
      <button
        type="button"
        class="mk-icon-btn"
        aria-label="Atualizar"
        title="Atualizar"
        :disabled="trash.isFetching.value"
        @click="trash.refetch()"
      >
        <RefreshCw :size="15" aria-hidden="true" />
      </button>
    </div>

    <p v-if="canSee" class="mkt__note">
      {{
        isAdmin
          ? 'Tudo que foi apagado na ala fica aqui por 30 dias. Depois disso o Nevo apaga de vez, com os arquivos.'
          : 'Aqui ficam os itens que você mandou para a lixeira, por 30 dias. Peça para um Admin se precisar de algo que outra pessoa apagou.'
      }}
    </p>

    <!-- Visualizador pela URL: sem acesso (a consulta nem sai), não "lixeira vazia". -->
    <EmptyState
      v-if="!canSee"
      :icon="Lock"
      title="A Lixeira é de quem edita na ala"
      description="Seu papel neste grupo é Visualizador. Se precisar de algo que foi apagado, peça para um Editor ou Admin."
      data-testid="trash-no-access"
    />
    <div v-else-if="trash.isLoading.value" class="mkt__loading">
      <Skeleton type="row" />
      <Skeleton type="row" />
      <Skeleton type="row" />
    </div>
    <div v-else-if="trash.isError.value" class="mk-load-error" role="alert">
      {{ apiErrorMessage(trash.error.value, 'Não deu para abrir a lixeira.') }}
      <button type="button" class="mk-btn mk-btn--ghost" @click="trash.refetch()">Tentar de novo</button>
    </div>
    <EmptyState
      v-else-if="!items.length"
      :icon="Trash2"
      :title="q || type ? 'Nada na lixeira com esse filtro' : 'A lixeira está vazia'"
      description="O que for apagado na ala aparece aqui, com quem apagou e até quando dá para restaurar."
    />
    <ul v-else class="mkt__list" data-testid="trash-list">
      <li
        v-for="e in items"
        :key="`${e.type}:${e.id}`"
        class="mkt__row"
        :data-type="e.type"
        :data-id="e.id"
      >
        <span class="mkt__kind" :title="e.typeLabel">
          <component :is="TRASH_TYPE_META[e.type]?.icon ?? Trash2" :size="15" aria-hidden="true" />
          <span>{{ e.typeLabel }}</span>
        </span>
        <span class="mkt__main">
          <span class="mkt__title">{{ e.title }}</span>
          <span class="mkt__meta">
            <span class="mkt__brand">
              <span class="mk-dot" :style="toneStyle(brandToneOf(e.companyId))" aria-hidden="true" />
              {{ brandName(e.companyId) }}
            </span>
            <span v-if="e.contents && contentsLabel(e.contents)">{{ contentsLabel(e.contents) }}</span>
            <span v-if="e.amountCents !== null" class="mk-num">{{ formatCents(e.amountCents) }}</span>
            <span>
              {{ deletedWord(e.type) }} {{ agoLabel(e.deletedAt) }}<template v-if="e.deletedBy"> por {{ e.deletedBy.name }}</template>
            </span>
          </span>
        </span>
        <span
          class="mkt__purge"
          :title="`${deletedWord(e.type) === 'apagada' ? 'Apagada' : 'Apagado'} de vez em ${new Date(e.purgeAt).toLocaleDateString('pt-BR')}`"
        >
          {{ purgeLabel(e.purgeAt) }}
        </span>
        <span class="mkt__actions">
          <button
            v-if="e.canRestore"
            type="button"
            class="mk-btn"
            data-action="restore"
            :disabled="busy.has(keyOf(e))"
            @click="onRestore(e)"
          >
            <RotateCcw :size="14" aria-hidden="true" /> Restaurar
          </button>
          <button
            v-if="e.canPurge"
            type="button"
            class="mk-btn mk-btn--ghost mkt__danger"
            data-action="purge"
            @click="toPurge = e"
          >
            Apagar de vez
          </button>
        </span>
      </li>
    </ul>
    <p v-if="trash.data.value?.truncated" class="mk-hint">
      A lista mostra os 300 mais recentes de cada tipo. Filtre por tipo ou por marca para ver o resto.
    </p>

    <ConfirmDialog
      :model-value="!!toPurge"
      title="Apagar de vez?"
      :message="purgeMessage"
      confirm-label="Apagar de vez"
      danger
      :loading="purge.isPending.value"
      @update:model-value="!$event && (toPurge = null)"
      @confirm="toPurge && purge.mutate(toPurge)"
    />
  </div>
</template>

<style scoped>
.mkt__bar {
  flex-wrap: wrap;
  gap: 8px;
}
.mkt__search {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 220px;
  flex: 1 1 260px;
  max-width: 380px;
  color: var(--text-3);
}
.mkt__search .mk-input {
  flex: 1;
}
.mkt__type {
  min-width: 190px;
}
.mkt__count {
  color: var(--text-3);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}
.mkt__note {
  margin: 0;
  color: var(--text-3);
  font-size: 12.5px;
}
.mkt__loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.mkt__list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.mkt__row {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border-top: 1px solid var(--border);
  font-size: 13px;
}
.mkt__row:first-child {
  border-top: 0;
}
.mkt__kind {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
  font-size: 12.5px;
}
.mkt__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.mkt__title {
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mkt__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  color: var(--text-3);
  font-size: 12px;
}
.mkt__brand {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.mkt__purge {
  color: var(--text-3);
  font-size: 12px;
  white-space: nowrap;
}
.mkt__actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
.mkt__danger {
  color: var(--err);
}

@media (max-width: 720px) {
  .mkt__row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'kind purge'
      'main main'
      'actions actions';
    gap: 6px 10px;
  }
  .mkt__kind {
    grid-area: kind;
  }
  .mkt__main {
    grid-area: main;
  }
  .mkt__title {
    white-space: normal;
  }
  .mkt__purge {
    grid-area: purge;
  }
  .mkt__actions {
    grid-area: actions;
    justify-content: flex-start;
  }
  .mkt__actions .mk-btn {
    min-height: 40px;
  }
  .mkt__search {
    max-width: none;
    min-width: 0;
    flex-basis: 100%;
  }
  .mkt__type {
    flex: 1 1 auto;
  }
}
</style>
