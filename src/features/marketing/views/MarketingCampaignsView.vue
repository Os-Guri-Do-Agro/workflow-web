<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Plus, Search, Target } from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import type { CampaignInput, CampaignListItem, CampaignStatus } from '@/service/marketing/marketing-campaigns'
import { useMarketing } from '../composables/useMarketing'
import { brandTone, formatCents, toneStyle } from '../marketing-labels'
import { asText, labelItems } from '../select-items'
import CampaignDialog from '../campaigns/CampaignDialog.vue'
import CampaignPanel from '../campaigns/CampaignPanel.vue'
import {
  CAMPAIGN_STATUS_LABEL,
  CAMPAIGN_STATUS_ORDER,
  CAMPAIGN_STATUS_TONE,
  formatPeriod,
} from '../campaigns/campaign-labels'
import {
  useCampaignActions,
  useCampaignDetail,
  useCampaignFilters,
  useCampaignsQuery,
} from '../campaigns/useCampaigns'

/**
 * Campanhas (spec m2-rastreio-estrategia.md, "M2-B: Campanhas"). Lista densa e
 * painel lateral pela URL (`?campanha=<id>`). No celular o painel ocupa a tela
 * toda e o botão de voltar leva à lista.
 */
const mk = useMarketing()
const { success, error: showError } = useToast()

const filters = useCampaignFilters(() => mk.brandFilter.value)
const query = useCampaignsQuery(mk.groupId, filters.apiFilters)
const actions = useCampaignActions(mk.groupId)
const openDetail = useCampaignDetail(mk.groupId, filters.openId)

const canWrite = computed(() => mk.can('EDITOR'))
const brandsById = computed(() => new Map(mk.brands.value.map((b) => [b.companyId, b])))

/** Em andamento primeiro; dentro do mesmo status, a mais nova em cima. */
const PRIORITY: CampaignStatus[] = ['ACTIVE', 'AWAITING_APPROVAL', 'APPROVED', 'PAUSED', 'DRAFT', 'ENDED', 'CANCELED']
const campaigns = computed(() =>
  [...(query.data.value ?? [])].sort(
    (a, b) =>
      PRIORITY.indexOf(a.status) - PRIORITY.indexOf(b.status) || b.createdAt.localeCompare(a.createdAt),
  ),
)

const showFinance = computed(() => campaigns.value.some((c) => c.spentPaidCents !== null) || query.isLoading.value)

function spentPercent(c: CampaignListItem) {
  if (!c.budgetCents || c.spentPaidCents === null) return 0
  return Math.min(100, (c.spentPaidCents / c.budgetCents) * 100)
}
function plannedPercent(c: CampaignListItem) {
  if (!c.budgetCents || c.spentPlannedCents === null) return 0
  return Math.min(100 - spentPercent(c), (c.spentPlannedCents / c.budgetCents) * 100)
}

// ── Criar e editar ─────────────────────────────────────────────────────────
const dialogOpen = ref(false)
const editingExisting = ref(false)

function openNew() {
  editingExisting.value = false
  dialogOpen.value = true
}

function openEdit() {
  editingExisting.value = true
  dialogOpen.value = true
}

async function save(input: CampaignInput) {
  try {
    if (editingExisting.value && filters.openId.value) {
      const { companyId: _brand, ...patch } = input
      await actions.update.mutateAsync({ id: filters.openId.value, input: patch })
      success('Campanha salva.')
    } else {
      const created = await actions.create.mutateAsync(input)
      success('Campanha criada como Rascunho.')
      filters.open(created.id)
    }
    dialogOpen.value = false
  } catch (error) {
    showError(getApiErrorMessage(error, 'Não foi possível salvar a campanha.'))
  }
}

const saving = computed(() => actions.create.isPending.value || actions.update.isPending.value)

// ── Filtros ────────────────────────────────────────────────────────────────
const searchText = ref(filters.q.value)
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchText, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => filters.setQ(value), 300)
})
watch(filters.q, (value) => {
  if (value !== searchText.value.trim()) searchText.value = value
})
onBeforeUnmount(() => clearTimeout(searchTimer))

const hasFilters = computed(() => !!(filters.q.value || filters.status.value || mk.brandFilter.value))
const panelOpen = computed(() => !!filters.openId.value)

/**
 * Abaixo de 1100px o painel vira uma tela por cima de tudo. Ele vai para o
 * `body` (Teleport): dentro do conteúdo do shell o `position: fixed` fica
 * preso ao contêiner da rota e a barra do topo do celular passa por cima dele.
 */
const narrow = ref(false)
let narrowQuery: MediaQueryList | null = null
const onNarrow = (event: MediaQueryListEvent | MediaQueryList) => {
  narrow.value = event.matches
}
onMounted(() => {
  narrowQuery = window.matchMedia('(max-width: 1099px)')
  onNarrow(narrowQuery)
  narrowQuery.addEventListener('change', onNarrow)
})
onBeforeUnmount(() => narrowQuery?.removeEventListener('change', onNarrow))

const statusItems = labelItems(CAMPAIGN_STATUS_ORDER, CAMPAIGN_STATUS_LABEL, 'Todos os status')

function onKeyOpen(event: KeyboardEvent, id: string) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    filters.open(id)
  }
}
</script>

<template>
  <div class="mk-page cv" :class="{ 'cv--open': panelOpen }">
    <section class="cv__list">
      <div class="mk-toolbar cv__bar">
        <label class="cv__search">
          <Search :size="14" aria-hidden="true" />
          <input v-model="searchText" type="search" placeholder="Buscar campanha" aria-label="Buscar campanha" />
        </label>
        <div class="cv__status" data-testid="campaign-status-filter">
          <AppSelect
            :model-value="filters.status.value ?? ''"
            :items="statusItems"
            label="Filtrar por status"
            density="compact"
            @update:model-value="filters.setStatus((asText($event) || null) as CampaignStatus | null)"
          />
        </div>
        <span class="mk-toolbar__spacer" />
        <button v-if="canWrite" type="button" class="mk-btn mk-btn--primary" data-action="new-campaign" @click="openNew">
          <Plus :size="14" aria-hidden="true" />Nova campanha
        </button>
      </div>

      <div v-if="query.isLoading.value" class="cv__loading" aria-busy="true">
        <Skeleton v-for="n in 5" :key="n" type="block" height="40px" />
      </div>

      <EmptyState
        v-else-if="query.isError.value"
        :icon="Target"
        title="Não foi possível carregar as campanhas"
        description="Verifique a conexão e tente de novo."
      >
        <template #action>
          <button type="button" class="mk-btn" @click="query.refetch()">Tentar de novo</button>
        </template>
      </EmptyState>

      <EmptyState
        v-else-if="!campaigns.length"
        :icon="Target"
        :title="hasFilters ? 'Nenhuma campanha com esses filtros' : 'Nenhuma campanha ainda'"
        :description="
          hasFilters
            ? 'Limpe a busca ou troque o status.'
            : canWrite
              ? 'Crie a primeira campanha com período, orçamento e público.'
              : 'A equipe ainda não criou campanhas.'
        "
      >
        <template v-if="hasFilters" #action>
          <button type="button" class="mk-btn" @click="filters.clear()">Limpar filtros</button>
        </template>
      </EmptyState>

      <div v-else class="cv__scroll">
        <table class="mk-table cv__table">
          <caption class="cv__caption">Campanhas</caption>
          <thead>
            <tr>
              <th scope="col">Campanha</th>
              <th scope="col" class="cv__status-col">Status</th>
              <th scope="col" class="cv__opt">Período</th>
              <th scope="col" class="mk-num cv__opt">Orçamento</th>
              <th v-if="showFinance" scope="col" class="cv__spent-col">Gasto</th>
              <th scope="col" class="mk-num cv__opt">Cliques</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in campaigns"
              :key="c.id"
              class="cv__row"
              :class="{ 'is-open': filters.openId.value === c.id }"
              :data-campaign-id="c.id"
              tabindex="0"
              :aria-current="filters.openId.value === c.id ? 'true' : undefined"
              @click="filters.open(c.id)"
              @keydown="onKeyOpen($event, c.id)"
            >
              <td class="cv__name">
                <span class="cv__title">{{ c.name }}</span>
                <span v-if="brandsById.get(c.companyId)" class="cv__brand">
                  <span class="mk-dot" :style="toneStyle(brandTone(brandsById.get(c.companyId)))" aria-hidden="true" />
                  {{ brandsById.get(c.companyId)!.name }}
                </span>
                <span class="mk-chip cv__chip-m" data-tone :style="toneStyle(CAMPAIGN_STATUS_TONE[c.status])">{{ CAMPAIGN_STATUS_LABEL[c.status] }}</span>
              </td>
              <td class="cv__status-col">
                <span class="mk-chip" data-tone :style="toneStyle(CAMPAIGN_STATUS_TONE[c.status])">{{ CAMPAIGN_STATUS_LABEL[c.status] }}</span>
              </td>
              <td class="cv__opt cv__period">{{ formatPeriod(c.startDate, c.endDate) }}</td>
              <td class="mk-num cv__opt">{{ c.budgetCents !== null ? formatCents(c.budgetCents) : '' }}</td>
              <td v-if="showFinance" class="cv__spent-col">
                <template v-if="c.spentPaidCents !== null">
                  <span class="cv__spent">{{ formatCents(c.spentPaidCents) }}</span>
                  <span v-if="c.budgetCents" class="cv__track" aria-hidden="true">
                    <span class="cv__fill" :style="{ width: spentPercent(c) + '%' }" />
                    <span class="cv__plan" :style="{ left: spentPercent(c) + '%', width: plannedPercent(c) + '%' }" />
                  </span>
                </template>
                <span v-else class="cv__none">sem acesso</span>
              </td>
              <td class="mk-num cv__opt">{{ c.clicks.toLocaleString('pt-BR') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <Teleport to="body" :disabled="!narrow">
      <section v-if="panelOpen" class="cv__panel">
        <CampaignPanel
          :key="filters.openId.value!"
          :campaign-id="filters.openId.value!"
          @close="filters.close()"
          @edit="openEdit"
          @deleted="filters.close()"
        />
      </section>
    </Teleport>

    <CampaignDialog
      v-model="dialogOpen"
      :campaign="editingExisting ? (openDetail.data.value ?? null) : null"
      :brands="mk.brands.value"
      :default-brand-id="mk.brandFilter.value"
      :saving="saving"
      @save="save"
    />
  </div>
</template>

<style scoped>
.cv {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 14px;
}

.cv__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.cv__bar {
  gap: 8px;
}

.cv__search {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 160px;
  max-width: 300px;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-3);
}

.cv__search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.cv__search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  outline: none;
}

.cv__status {
  min-width: 170px;
}

.cv__loading {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cv__scroll {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  overflow-x: auto;
}

.cv__caption {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

.cv__table th:first-child,
.cv__table td:first-child {
  padding-left: 14px;
}

.cv__row {
  cursor: pointer;
}

.cv__row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.cv__row.is-open,
.cv__row.is-open:hover {
  background: var(--accent-soft);
}

.cv__name {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 160px;
}

.cv__title {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.cv__brand {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-3);
  font-size: 12px;
}

.cv__period {
  white-space: nowrap;
}

.cv__chip-m {
  display: none;
}

.cv__spent-col {
  min-width: 120px;
}

.cv__spent {
  display: block;
  font-variant-numeric: tabular-nums;
}

.cv__track {
  position: relative;
  display: block;
  height: 4px;
  margin-top: 4px;
  border-radius: 999px;
  background: var(--surface-3);
}

.cv__fill,
.cv__plan {
  position: absolute;
  top: 0;
  bottom: 0;
}

.cv__fill {
  left: 0;
  border-radius: 999px;
  background: var(--accent);
}

.cv__plan {
  background: color-mix(in srgb, var(--accent) 35%, transparent);
}

.cv__none {
  color: var(--text-3);
  font-size: 12px;
}

.cv__panel {
  min-width: 0;
}

/* Painel ao lado da lista em tela larga; a lista perde as colunas opcionais. */
@media (min-width: 1100px) {
  .cv--open {
    grid-template-columns: minmax(0, 1fr) 500px;
  }

  .cv--open .cv__opt {
    display: none;
  }

  .cv__panel {
    position: sticky;
    top: 12px;
    max-height: calc(100vh - 24px);
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    overflow: hidden;
  }

  .cv__panel :deep(.cp) {
    flex: 1;
    min-height: 0;
  }
}

/* Telas menores: o painel vira uma tela por cima, com o botão de voltar. */
@media (max-width: 1099px) {
  .cv__panel {
    position: fixed;
    inset: 0;
    bottom: var(--shell-bottom-inset, 0px);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    padding-top: env(safe-area-inset-top, 0px);
  }

  .cv__panel :deep(.cp) {
    flex: 1;
    min-height: 0;
  }
}

@media (max-width: 640px) {
  .cv__search {
    max-width: none;
    flex-basis: 100%;
  }

  .cv__search input {
    min-height: 44px;
  }

  .cv__status {
    flex: 1;
    min-width: 0;
  }

  .cv__opt,
  .cv__status-col {
    display: none;
  }

  .cv__chip-m {
    display: inline-flex;
    align-self: flex-start;
    margin-top: 2px;
  }

  .cv__spent-col {
    min-width: 0;
    width: 110px;
  }

  .cv__row td {
    padding-top: 12px;
    padding-bottom: 12px;
  }
}
</style>
