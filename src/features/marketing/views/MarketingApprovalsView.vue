<script setup lang="ts">
/**
 * Aprovações (M1-A): board e lista dos cards de marketing, com os filtros na
 * URL (link colado abre igual). O board é por status da trilha (Digital ou
 * Gráfica); arrastar grava pelo `/move` com otimismo e, se o servidor recusar,
 * o card volta e a frase dele aparece.
 *
 * URL: `?vista=lista&trilha=grafica&status=&tipo=&rede=&resp=&atrasados=1&q=&ordem=prazo&dir=desc`
 * (e o `?marca=` do layout). Tudo por `replace`.
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useDebounceFn } from '@vueuse/core'
import { Archive, ClipboardCheck, Filter, LayoutGrid, List, Plus, Search, TriangleAlert, X } from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useToast } from '@/composables/useToast'
import { usePhoneViewport } from '@/composables/usePhoneViewport'
import { getApiErrorMessage } from '@/service/api'
import { hasMarketingRole } from '@/service/marketing/marketing-core'
import { listCards, moveCard, type MarketingCardSummary } from '@/service/marketing/marketing-cards'
import { useMarketing, useMarketingMembers } from '../composables/useMarketing'
import {
  CARD_KIND_LABEL,
  CARD_NETWORK_LABEL,
  cardStatusLabel,
  type CardKind,
  type CardNetwork,
  type CardStatus,
} from '../marketing-labels'
import MarketingBoard from '../approvals/components/MarketingBoard.vue'
import MarketingCardList, { type ListSort } from '../approvals/components/MarketingCardList.vue'
import MarketingCardCreateDialog from '../approvals/components/MarketingCardCreateDialog.vue'
import { cardKeys, trackStatuses, type Track } from '../approvals/approvals-meta'
import { asText, labelItems, selectItems } from '../select-items'

const route = useRoute()
const router = useRouter()
const mk = useMarketing()
const members = useMarketingMembers(mk.groupId)
const queryClient = useQueryClient()
const { error: toastError } = useToast()
const phone = usePhoneViewport()

// ── Filtros na URL ───────────────────────────────────────────────────────
const q = (key: string) => (typeof route.query[key] === 'string' ? (route.query[key] as string) : '')

const view = computed<'board' | 'lista'>(() => (q('vista') === 'lista' ? 'lista' : 'board'))
const track = computed<Track>(() => (q('trilha') === 'grafica' ? 'print' : 'digital'))
const statuses = computed(() => trackStatuses(track.value))
const statusFilter = computed(() => {
  const s = q('status') as CardStatus
  return statuses.value.includes(s) ? s : ''
})
const KINDS = Object.keys(CARD_KIND_LABEL) as CardKind[]
const kindsOfTrack = computed(() => KINDS.filter((k) => (track.value === 'print' ? k === 'PRINT' : k !== 'PRINT')))
const kindFilter = computed(() => {
  const k = q('tipo') as CardKind
  return kindsOfTrack.value.includes(k) ? k : ''
})
const NETWORKS = Object.keys(CARD_NETWORK_LABEL) as CardNetwork[]
const networkFilter = computed(() => {
  const n = q('rede') as CardNetwork
  return NETWORKS.includes(n) ? n : ''
})
const assigneeFilter = computed(() => q('resp'))
const overdueFilter = computed(() => q('atrasados') === '1')
const archivedFilter = computed(() => q('arquivados') === '1')
const searchFilter = computed(() => q('q'))
const sort = computed<ListSort | null>(() => (q('ordem') === 'prazo' || q('ordem') === 'publicacao' ? (q('ordem') as ListSort) : null))
const dir = computed<'asc' | 'desc'>(() => (q('dir') === 'desc' ? 'desc' : 'asc'))

function setQuery(patch: Record<string, string | null>) {
  const query = { ...route.query }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '') delete query[k]
    else query[k] = v
  }
  void router.replace({ query })
}

const activeFilters = computed(
  () =>
    [
      statusFilter.value,
      kindFilter.value,
      networkFilter.value,
      assigneeFilter.value,
      overdueFilter.value ? '1' : '',
      archivedFilter.value ? '1' : '',
      searchFilter.value,
    ].filter(
      Boolean,
    ).length,
)

function clearFilters() {
  search.value = ''
  setQuery({ status: null, tipo: null, rede: null, resp: null, atrasados: null, arquivados: null, q: null })
}

function setTrack(next: Track) {
  setQuery({ trilha: next === 'print' ? 'grafica' : null, status: null, tipo: null })
}

const search = ref(searchFilter.value)
const pushSearch = useDebounceFn((value: string) => setQuery({ q: value.trim() || null }), 250)
watch(search, (v) => void pushSearch(v))
watch(searchFilter, (v) => {
  if (v !== search.value.trim()) search.value = v
})

const filtersOpen = ref(false)

// ── Dados ────────────────────────────────────────────────────────────────
const filters = computed(() => ({
  track: track.value,
  status: view.value === 'lista' ? statusFilter.value || undefined : undefined,
  kind: kindFilter.value || undefined,
  network: networkFilter.value || undefined,
  assigneeId: assigneeFilter.value || undefined,
  overdue: overdueFilter.value || undefined,
  archived: archivedFilter.value || undefined,
  q: searchFilter.value || undefined,
  companyId: mk.brandFilter.value ?? undefined,
}))

const groupId = computed(() => mk.groupId.value ?? '')
const cardsQuery = useQuery({
  queryKey: computed(() => cardKeys.list(groupId.value, filters.value)),
  queryFn: () => listCards(groupId.value, filters.value),
  enabled: computed(() => !!groupId.value),
  staleTime: 15_000,
})

/** Mover com otimismo: o card já aparece na coluna nova; recusa desfaz. */
const overrides = ref(new Map<string, { status: CardStatus; position: number }>())
const pending = ref(new Set<string>())

const cards = computed<MarketingCardSummary[]>(() =>
  (cardsQuery.data.value ?? []).map((c) => {
    const o = overrides.value.get(c.id)
    return o ? { ...c, status: o.status, position: o.position } : c
  }),
)

const boardColumns = computed(() => (statusFilter.value ? [statusFilter.value] : statuses.value))
const canEdit = computed(() => mk.can('EDITOR'))

async function onMove(id: string, status: CardStatus, position: number | undefined) {
  const card = cards.value.find((c) => c.id === id)
  if (!card || pending.value.has(id)) return
  const optimistic = position ?? Math.max(0, ...cards.value.filter((c) => c.status === status).map((c) => c.position)) + 1024
  overrides.value = new Map(overrides.value).set(id, { status, position: optimistic })
  pending.value = new Set(pending.value).add(id)
  try {
    await moveCard(groupId.value, id, status, position)
    await queryClient.invalidateQueries({ queryKey: cardKeys.all(groupId.value) })
  } catch (err) {
    toastError(getApiErrorMessage(err, 'Não deu para mover o card.'))
  } finally {
    const nextOverrides = new Map(overrides.value)
    nextOverrides.delete(id)
    overrides.value = nextOverrides
    const nextPending = new Set(pending.value)
    nextPending.delete(id)
    pending.value = nextPending
  }
}

function openCard(id: string) {
  void router.push({ name: 'marketing-card', params: { cardId: id }, query: mk.brandFilter.value ? { marca: mk.brandFilter.value } : {} })
}

function onSort(key: ListSort) {
  if (sort.value !== key) setQuery({ ordem: key, dir: null })
  else if (dir.value === 'asc') setQuery({ dir: 'desc' })
  else setQuery({ ordem: null, dir: null })
}

/** Responsável no filtro: quem pode ser responsável (Editor+). */
const assigneeOptions = computed(() => (members.data.value ?? []).filter((m) => hasMarketingRole(m.role, 'EDITOR')))

const statusItems = computed(() =>
  selectItems(statuses.value, (s) => s, (s) => cardStatusLabel(s, track.value === 'print' ? 'PRINT' : 'POST'), 'Todos os status'),
)
const kindItems = computed(() => labelItems(kindsOfTrack.value, CARD_KIND_LABEL, 'Todos os tipos'))
const networkItems = labelItems(NETWORKS, CARD_NETWORK_LABEL, 'Todas as redes')
const assigneeItems = computed(() => [
  { label: 'Qualquer responsável', value: '' },
  { label: 'Sem responsável', value: 'none' },
  ...selectItems(assigneeOptions.value, (m) => m.userId, (m) => m.name),
])

const createOpen = ref(false)
function onCreated(card: { id: string }) {
  openCard(card.id)
}
</script>

<template>
  <div class="mk-page mka">
    <div class="mka__bar">
      <div class="mka__seg" role="group" aria-label="Vista">
        <button
          type="button"
          class="mka__seg-btn"
          :class="{ 'is-on': view === 'board' }"
          :aria-pressed="view === 'board'"
          data-view="board"
          @click="setQuery({ vista: null })"
        >
          <LayoutGrid :size="14" aria-hidden="true" /> Board
        </button>
        <button
          type="button"
          class="mka__seg-btn"
          :class="{ 'is-on': view === 'lista' }"
          :aria-pressed="view === 'lista'"
          data-view="lista"
          @click="setQuery({ vista: 'lista' })"
        >
          <List :size="14" aria-hidden="true" /> Lista
        </button>
      </div>
      <div class="mka__seg" role="group" aria-label="Trilha">
        <button
          type="button"
          class="mka__seg-btn"
          :class="{ 'is-on': track === 'digital' }"
          :aria-pressed="track === 'digital'"
          data-track="digital"
          @click="setTrack('digital')"
        >
          Digital
        </button>
        <button
          type="button"
          class="mka__seg-btn"
          :class="{ 'is-on': track === 'print' }"
          :aria-pressed="track === 'print'"
          data-track="print"
          @click="setTrack('print')"
        >
          Gráfica
        </button>
      </div>

      <label class="mka__search">
        <Search :size="14" aria-hidden="true" />
        <input v-model="search" type="search" placeholder="Buscar card" aria-label="Buscar card pelo título" />
      </label>

      <button
        v-if="phone"
        type="button"
        class="mk-btn"
        :aria-expanded="filtersOpen"
        aria-controls="mka-filters"
        @click="filtersOpen = !filtersOpen"
      >
        <Filter :size="14" aria-hidden="true" />
        Filtros<template v-if="activeFilters"> ({{ activeFilters }})</template>
      </button>

      <span class="mk-toolbar__spacer" />
      <button v-if="canEdit" type="button" class="mk-btn mk-btn--primary" data-action="new-card" @click="createOpen = true">
        <Plus :size="15" aria-hidden="true" /> Novo card
      </button>
    </div>

    <div v-show="!phone || filtersOpen" id="mka-filters" class="mka__filters">
      <div v-if="view === 'lista' || !phone" class="mka__sel" data-sel="status">
        <AppSelect
          :model-value="statusFilter"
          :items="statusItems"
          label="Status"
          density="compact"
          @update:model-value="setQuery({ status: asText($event) || null })"
        />
      </div>
      <div v-if="kindsOfTrack.length > 1" class="mka__sel" data-sel="tipo">
        <AppSelect
          :model-value="kindFilter"
          :items="kindItems"
          label="Tipo"
          density="compact"
          @update:model-value="setQuery({ tipo: asText($event) || null })"
        />
      </div>
      <div v-if="track === 'digital'" class="mka__sel" data-sel="rede">
        <AppSelect
          :model-value="networkFilter"
          :items="networkItems"
          label="Rede"
          density="compact"
          @update:model-value="setQuery({ rede: asText($event) || null })"
        />
      </div>
      <div class="mka__sel" data-sel="resp">
        <AppSelect
          :model-value="assigneeFilter"
          :items="assigneeItems"
          label="Responsável"
          density="compact"
          @update:model-value="setQuery({ resp: asText($event) || null })"
        />
      </div>
      <button
        type="button"
        class="mk-btn mka__late"
        :class="{ 'is-on': overdueFilter }"
        :aria-pressed="overdueFilter"
        data-filter="atrasados"
        @click="setQuery({ atrasados: overdueFilter ? null : '1' })"
      >
        <TriangleAlert :size="14" aria-hidden="true" /> Atrasados
      </button>
      <button
        type="button"
        class="mk-btn mka__toggle"
        :class="{ 'is-on': archivedFilter }"
        :aria-pressed="archivedFilter"
        data-filter="arquivados"
        title="Mostrar só os cards arquivados"
        @click="setQuery({ arquivados: archivedFilter ? null : '1' })"
      >
        <Archive :size="14" aria-hidden="true" /> Arquivados
      </button>
      <button v-if="activeFilters" type="button" class="mk-btn mk-btn--ghost" @click="clearFilters">
        <X :size="14" aria-hidden="true" /> Limpar
      </button>
    </div>

    <div v-if="cardsQuery.isLoading.value" class="mka__loading">
      <Skeleton type="row" />
      <Skeleton type="block" />
    </div>

    <div v-else-if="cardsQuery.isError.value" class="mk-panel mka__error" role="alert">
      <p>{{ getApiErrorMessage(cardsQuery.error.value, 'Não deu para carregar os cards.') }}</p>
      <button type="button" class="mk-btn" @click="cardsQuery.refetch()">Tentar de novo</button>
    </div>

    <EmptyState
      v-else-if="!cards.length"
      :icon="ClipboardCheck"
      :title="activeFilters ? 'Nenhum card com esses filtros' : track === 'print' ? 'Nenhuma peça impressa ainda' : 'Nenhum card ainda'"
      :description="activeFilters ? 'Tire algum filtro para ver mais.' : 'Crie um card, suba a arte e mande para aprovação.'"
    >
      <template #action>
        <button v-if="activeFilters" type="button" class="mk-btn" @click="clearFilters">Limpar filtros</button>
        <button v-else-if="canEdit" type="button" class="mk-btn mk-btn--primary" @click="createOpen = true">
          <Plus :size="15" aria-hidden="true" /> Novo card
        </button>
      </template>
    </EmptyState>

    <MarketingBoard
      v-else-if="view === 'board'"
      :cards="cards"
      :statuses="boardColumns"
      :brands="mk.brands.value"
      :can-move="canEdit"
      :role="mk.role.value"
      :print-track="track === 'print'"
      :pending-ids="pending"
      @open="openCard"
      @move="onMove"
    />

    <MarketingCardList
      v-else
      :cards="cards"
      :brands="mk.brands.value"
      :sort="sort"
      :dir="dir"
      @open="openCard"
      @sort="onSort"
    />

    <MarketingCardCreateDialog
      v-if="canEdit"
      v-model="createOpen"
      :default-kind="track === 'print' ? 'PRINT' : undefined"
      @created="onCreated"
    />
  </div>
</template>

<style scoped>
.mka__bar,
.mka__filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.mka__seg {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.mka__seg-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 3px 10px;
  border: 0;
  border-radius: calc(var(--radius-sm) - 2px);
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.mka__seg-btn.is-on {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.mka__seg-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.mka__search {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  width: 220px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-3);
}

.mka__search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.mka__search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
}

.mka__sel {
  min-width: 150px;
  max-width: 230px;
}

.mka__sel :deep(.app-select__trigger) {
  min-height: 32px;
}

.mka__late.is-on {
  border-color: color-mix(in srgb, var(--due-late) 45%, var(--border));
  background: color-mix(in srgb, var(--due-late) 10%, var(--surface));
  color: var(--due-late);
}

.mka__toggle.is-on {
  border-color: transparent;
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.mka__loading {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mka__error {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  color: var(--text-2);
  font-size: 13px;
}

.mka__error p {
  flex: 1;
  margin: 0;
}

@media (max-width: 640px) {
  .mka__seg-btn {
    min-height: 40px;
    padding: 3px 12px;
  }

  .mka__search {
    order: 5;
    width: 100%;
    min-height: 44px;
  }

  .mka__filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .mka__sel {
    min-width: 0;
    max-width: none;
  }

  .mka__sel :deep(.app-select__trigger) {
    min-height: 44px;
  }
}
</style>
