<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { Plus, Printer } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import type { PrintCard } from '@/service/marketing/marketing-print'
import { useMarketing } from '../composables/useMarketing'
import { CARD_STATUS_TONE, brandTone, cardStatusLabel, toneStyle, type CardStatus } from '../marketing-labels'
import PrintNewDialog from '../print/PrintNewDialog.vue'
import PrintPanel from '../print/PrintPanel.vue'
import { PRINT_TRAIL, usePrintCards } from '../print/usePrint'
import { useWideViewport } from '../utm/useUtm'

/**
 * Gráfica (M2-A): peças impressas depois da aprovação. Lista com filtro por
 * status na URL (`?status=`) e painel da peça (`?peca=`). A aprovação é do card.
 */
const route = useRoute()
const router = useRouter()
const mk = useMarketing()
const wide = useWideViewport()

const one = (v: unknown) => (typeof v === 'string' ? v : '')
function setQuery(patch: Record<string, string | null>, replace = true) {
  const query: LocationQueryRaw = { ...route.query }
  for (const [k, v] of Object.entries(patch)) {
    if (v) query[k] = v
    else delete query[k]
  }
  void (replace ? router.replace({ query }) : router.push({ query }))
}

const status = computed(() => one(route.query.status))
const selectedId = computed(() => one(route.query.peca))

const list = usePrintCards(mk.groupId, mk.brandFilter)
const all = computed(() => list.data.value ?? [])
const rows = computed(() => (status.value ? all.value.filter((c) => c.status === status.value) : all.value))
const selected = computed(() => all.value.find((c) => c.id === selectedId.value) ?? null)
const canEdit = computed(() => mk.can('EDITOR'))
const multiBrand = computed(() => mk.brands.value.length > 1)

const counts = computed(() => {
  const m = new Map<string, number>()
  for (const c of all.value) m.set(c.status, (m.get(c.status) ?? 0) + 1)
  return m
})
// Trilha inteira sempre; Ideia e Ajustes pedidos só aparecem se houver peça neles.
const statusChips = computed<CardStatus[]>(() => {
  const extra: CardStatus[] = []
  for (const s of ['IDEA', 'CHANGES_REQUESTED'] as CardStatus[]) if (counts.value.get(s)) extra.push(s)
  return [...extra, ...PRINT_TRAIL]
})

watch([selectedId, all, () => list.isFetching.value], () => {
  if (selectedId.value && list.isSuccess.value && !list.isFetching.value && !selected.value) setQuery({ peca: null })
})

function select(id: string) {
  setQuery({ peca: id }, false)
}
function closePanel() {
  setQuery({ peca: null })
}
const panelOpenNarrow = computed({
  get: () => !wide.value && !!selected.value,
  set: (v) => {
    if (!v) closePanel()
  },
})

const newOpen = ref(false)
function onCreated(card: PrintCard) {
  setQuery({ peca: card.id, status: null })
}

function brandOf(id: string) {
  return mk.brandById(id)
}
function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '-'
}
function isLate(c: PrintCard) {
  return !!c.dueAt && new Date(c.dueAt) < new Date() && c.status !== 'DELIVERED'
}
function prepressPct(c: PrintCard) {
  return c.prepress.total ? Math.round((c.prepress.done / c.prepress.total) * 100) : 0
}
</script>

<template>
  <section class="mk-page mk-pr" :class="{ 'mk-pr--split': wide && selected }">
    <div class="mk-pr__main">
      <div class="mk-toolbar">
        <div class="mk-pr__chips" role="group" aria-label="Filtrar por etapa">
          <button type="button" class="mk-pr__chip" :class="{ 'is-active': !status }" :aria-pressed="!status" @click="setQuery({ status: null })">
            Todas<span class="mk-pr__count">{{ all.length }}</span>
          </button>
          <button
            v-for="s in statusChips"
            :key="s"
            type="button"
            class="mk-pr__chip"
            :class="{ 'is-active': status === s }"
            :aria-pressed="status === s"
            @click="setQuery({ status: s })"
          >
            {{ cardStatusLabel(s, 'PRINT') }}<span class="mk-pr__count">{{ counts.get(s) ?? 0 }}</span>
          </button>
        </div>
        <span class="mk-toolbar__spacer" />
        <button v-if="canEdit" type="button" class="mk-btn mk-btn--primary" @click="newOpen = true">
          <Plus :size="14" />Nova peça
        </button>
      </div>

      <div v-if="list.isLoading.value" class="mk-pr__loading"><Skeleton type="row" /><Skeleton type="row" /><Skeleton type="row" /></div>
      <p v-else-if="list.isError.value" class="mk-error" role="alert">Não foi possível carregar as peças. Tente de novo em instantes.</p>
      <EmptyState
        v-else-if="!rows.length"
        :icon="Printer"
        :title="status ? 'Nenhuma peça nesta etapa' : 'Nenhuma peça impressa ainda'"
        :description="
          status
            ? 'Escolha outra etapa ou volte para Todas.'
            : 'Placas, folders e cartões entram aqui para seguir até a gráfica com o arquivo original intacto.'
        "
      >
        <template v-if="canEdit && !status" #action>
          <button type="button" class="mk-btn mk-btn--primary" @click="newOpen = true"><Plus :size="14" />Nova peça</button>
        </template>
      </EmptyState>

      <div v-else class="mk-panel mk-pr-list">
        <table class="mk-table">
          <thead>
            <tr>
              <th>Peça</th>
              <th>Etapa</th>
              <th class="hide-md">Pré-gráfica</th>
              <th class="hide-md">Prazo</th>
              <th class="hide-sm mk-num">Orçamentos</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in rows"
              :key="c.id"
              class="mk-pr-row"
              :class="{ 'is-selected': c.id === selectedId }"
              tabindex="0"
              :aria-selected="c.id === selectedId"
              @click="select(c.id)"
              @keydown.enter.prevent="select(c.id)"
            >
              <td class="mk-pr__name-cell">
                <span class="mk-pr__name">{{ c.title }}</span>
                <span class="mk-pr__sub">
                  <span v-if="multiBrand" class="mk-pr__brand">
                    <span class="mk-dot" :style="toneStyle(brandTone(brandOf(c.companyId)))" aria-hidden="true" />{{ brandOf(c.companyId)?.name }}
                  </span>
                  <span v-if="c.versionNumber">V{{ c.versionNumber }}</span>
                  <span v-if="c.files.some((f) => f.colorSpace === 'cmyk')" class="mk-pr__tag">CMYK</span>
                  <span v-if="c.files.length === 0">sem arquivo</span>
                </span>
              </td>
              <td>
                <span class="mk-chip" data-tone :style="toneStyle(CARD_STATUS_TONE[c.status])">{{ cardStatusLabel(c.status, 'PRINT') }}</span>
              </td>
              <td class="hide-md">
                <div v-if="c.prepress.total" class="mk-pr__prog">
                  <span class="mk-pr__bar" aria-hidden="true"><span :style="{ width: prepressPct(c) + '%' }" /></span>
                  <span class="mk-num">{{ c.prepress.done }}/{{ c.prepress.total }}</span>
                </div>
                <span v-else class="mk-pr__sub">não aberto</span>
              </td>
              <td class="hide-md" :class="{ 'mk-late': isLate(c) }">{{ fmtDate(c.dueAt) }}</td>
              <td class="hide-sm mk-num">{{ c.quotesCount ?? '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <aside v-if="wide && selected" class="mk-panel mk-pr__aside" aria-label="Detalhe da peça">
      <PrintPanel
        :key="selected.id"
        :card="selected"
        :group-id="mk.groupId.value!"
        :brand-name="brandOf(selected.companyId)?.name ?? ''"
        :can-edit="canEdit"
        :can-force="mk.can('ADMIN')"
        closable
        @close="closePanel"
      />
    </aside>

    <AppDialog v-model="panelOpenNarrow" label="Detalhe da peça" size="lg">
      <div v-if="selected" class="mk-pr__sheet">
        <PrintPanel
          :key="selected.id"
          :card="selected"
          :group-id="mk.groupId.value!"
          :brand-name="brandOf(selected.companyId)?.name ?? ''"
          :can-edit="canEdit"
          :can-force="mk.can('ADMIN')"
          closable
          @close="closePanel"
        />
      </div>
    </AppDialog>

    <PrintNewDialog
      v-model="newOpen"
      :group-id="mk.groupId.value!"
      :brands="mk.brands.value"
      :default-brand-id="mk.brandFilter.value"
      @created="onCreated"
    />
  </section>
</template>

<style scoped>
.mk-pr {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.mk-pr--split {
  grid-template-columns: minmax(0, 1fr) 460px;
}

.mk-pr__main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.mk-pr__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1 1 0;
  min-width: 0;
}

.mk-pr__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  min-height: 30px;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.mk-pr__chip:hover {
  background: var(--surface-2);
}

.mk-pr__chip:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.mk-pr__chip.is-active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.mk-pr__count {
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
}

.is-active .mk-pr__count {
  color: var(--accent-ink);
}

.mk-pr__loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mk-pr-list {
  overflow: hidden;
}

.mk-pr-row {
  cursor: pointer;
}

.mk-pr-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.mk-pr-row.is-selected {
  background: var(--accent-soft);
}

.mk-pr__name-cell {
  min-width: 0;
}

.mk-pr__name {
  display: block;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.mk-pr__sub {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-3);
}

.mk-pr__brand {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.mk-pr__tag {
  padding: 0 6px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
  font-size: 11px;
  font-weight: 700;
  color: var(--text-2);
}

.mk-pr__prog {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mk-pr__bar {
  width: 64px;
  height: 4px;
  border-radius: 2px;
  background: var(--surface-3);
  overflow: hidden;
}

.mk-pr__bar span {
  display: block;
  height: 100%;
  background: var(--accent);
}

.mk-pr__aside {
  position: sticky;
  top: 12px;
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  padding: 14px;
}

.mk-pr__sheet {
  padding: 16px;
  overflow-y: auto;
  min-height: 0;
}

@media (max-width: 1100px) {
  .hide-md {
    display: none;
  }
}

@media (max-width: 640px) {
  .hide-sm {
    display: none;
  }

  .mk-pr__chips {
    flex: 1 1 100%;
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .mk-pr__chip {
    min-height: 44px;
  }

  .mk-pr-row td {
    padding-top: 12px;
    padding-bottom: 12px;
  }
}
</style>
