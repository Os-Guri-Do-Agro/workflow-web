<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Camera, Loader2, PartyPopper, Plus } from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import type {
  ActivationKind,
  ActivationListItem,
  ActivationStatus,
} from '@/service/marketing/marketing-activations'
import ActivationFormDialog from '../activations/ActivationFormDialog.vue'
import ActivationPanel from '../activations/ActivationPanel.vue'
import {
  ACTIVATION_KIND_LABEL,
  ACTIVATION_KINDS,
  ACTIVATION_STATUS_LABEL,
  ACTIVATION_STATUS_TONE,
  ACTIVATION_STATUSES,
  formatWhen,
} from '../activations/activation-meta'
import { useActivationsPages } from '../activations/useActivations'
import { useMarketing } from '../composables/useMarketing'
import { brandTone, formatCents, toneStyle } from '../marketing-labels'

/**
 * Ativações (feiras, palestras, ações com parceiro). Lista Próximas e Passadas
 * e painel pela URL `?ativacao=<id>`. Filtros na URL: `?quando=passadas`,
 * `?situacao=`, `?tipo=`; a marca vem do `?marca=` do layout.
 *
 * A lista é paginada na API (R1, D12): a aba aberta vem de 50 em 50 com
 * "Carregar mais", e o número de cada aba vem do servidor. Antes vinham até
 * 500 de uma vez e o resto sumia calado.
 */
const mk = useMarketing()
const route = useRoute()
const router = useRouter()

const groupId = computed(() => mk.groupId.value!)
const openId = computed(() => (typeof route.query.ativacao === 'string' ? route.query.ativacao : null))
const when = computed<'proximas' | 'passadas'>(() => (route.query.quando === 'passadas' ? 'passadas' : 'proximas'))
const status = computed(() => {
  const v = route.query.situacao
  return typeof v === 'string' && (ACTIVATION_STATUSES as string[]).includes(v) ? (v as ActivationStatus) : ''
})
const kind = computed(() => {
  const v = route.query.tipo
  return typeof v === 'string' && (ACTIVATION_KINDS as string[]).includes(v) ? (v as ActivationKind) : ''
})

function setQuery(patch: Record<string, string | null>) {
  const query = { ...route.query }
  for (const [key, value] of Object.entries(patch)) {
    if (value) query[key] = value
    else delete query[key]
  }
  void router.replace({ query })
}

const listQuery = useActivationsPages(
  () => mk.groupId.value,
  () => ({ companyId: mk.brandFilter.value, status: status.value, kind: kind.value }),
  when,
)

const pages = computed(() => listQuery.data.value?.pages ?? [])
const rows = computed<ActivationListItem[]>(() => pages.value.flatMap((p) => p.items))
/** Contagem da página mais nova (todas trazem; a última é a mais fresca). */
const counts = computed(() => pages.value[pages.value.length - 1]?.counts ?? null)
const upcomingCount = computed(() => counts.value?.upcoming ?? (when.value === 'proximas' ? rows.value.length : 0))
const pastCount = computed(() => counts.value?.past ?? (when.value === 'passadas' ? rows.value.length : 0))
const shownTotal = computed(() => (when.value === 'passadas' ? pastCount.value : upcomingCount.value))
const loadingMore = computed(() => listQuery.isFetchingNextPage.value)
function loadMore() {
  if (listQuery.hasNextPage.value && !loadingMore.value) void listQuery.fetchNextPage()
}

const statusItems = computed(() => [
  { label: 'Todas as situações', value: '' },
  ...ACTIVATION_STATUSES.map((s) => ({ label: ACTIVATION_STATUS_LABEL[s], value: s })),
])
const kindItems = computed(() => [
  { label: 'Todos os tipos', value: '' },
  ...ACTIVATION_KINDS.map((k) => ({ label: ACTIVATION_KIND_LABEL[k], value: k })),
])
const seesFinance = computed(() => mk.permissions.value?.seeFinance ?? false)
const multiBrand = computed(() => mk.brands.value.length > 1)

function open(id: string) {
  setQuery({ ativacao: id })
}
function close() {
  setQuery({ ativacao: null })
}

const formOpen = ref(false)
function onSaved(saved: { id: string }) {
  open(saved.id)
}

function checklistLabel(a: ActivationListItem) {
  return a.checklist.total ? `${a.checklist.done}/${a.checklist.total}` : ''
}
</script>

<template>
  <div class="mk-page av" :class="{ 'is-split': !!openId }">
    <div class="av__list">
      <div class="mk-toolbar">
        <div class="av__tabs" role="tablist" aria-label="Quando">
          <button
            type="button"
            role="tab"
            class="av__tab"
            :class="{ 'is-active': when === 'proximas' }"
            :aria-selected="when === 'proximas'"
            @click="setQuery({ quando: null })"
          >
            Próximas <span class="av__n" data-testid="av-count-upcoming">{{ upcomingCount }}</span>
          </button>
          <button
            type="button"
            role="tab"
            class="av__tab"
            :class="{ 'is-active': when === 'passadas' }"
            :aria-selected="when === 'passadas'"
            @click="setQuery({ quando: 'passadas' })"
          >
            Passadas <span class="av__n" data-testid="av-count-past">{{ pastCount }}</span>
          </button>
        </div>
        <div class="av__filter" data-testid="av-filter-status">
          <AppSelect
            :model-value="status"
            :items="statusItems"
            label="Filtrar por situação"
            density="compact"
            @update:model-value="setQuery({ situacao: (($event as string) || null) })"
          />
        </div>
        <div class="av__filter" data-testid="av-filter-kind">
          <AppSelect
            :model-value="kind"
            :items="kindItems"
            label="Filtrar por tipo"
            density="compact"
            @update:model-value="setQuery({ tipo: (($event as string) || null) })"
          />
        </div>
        <span class="mk-toolbar__spacer" />
        <button v-if="mk.can('EDITOR')" type="button" class="mk-btn mk-btn--primary" @click="formOpen = true">
          <Plus :size="14" aria-hidden="true" />
          Nova ativação
        </button>
      </div>

      <div v-if="listQuery.isLoading.value" class="av__loading"><Skeleton type="block" height="160px" /></div>
      <p v-else-if="listQuery.isError.value && !rows.length" class="mk-error" role="alert">Não foi possível carregar as ativações.</p>

      <EmptyState
        v-else-if="!rows.length"
        :icon="PartyPopper"
        :title="when === 'passadas' ? 'Nenhuma ativação passada' : 'Nenhuma ativação por vir'"
        :description="
          mk.can('EDITOR') && when === 'proximas'
            ? 'Cadastre feiras, palestras e ações com parceiros para acompanhar checklist, fotos e custo.'
            : 'Quando houver ativações elas aparecem aqui.'
        "
      >
        <template v-if="mk.can('EDITOR') && when === 'proximas'" #action>
          <button type="button" class="mk-btn mk-btn--primary" @click="formOpen = true">
            <Plus :size="14" aria-hidden="true" />
            Nova ativação
          </button>
        </template>
      </EmptyState>

      <div v-else class="mk-panel av__table-wrap">
        <table class="mk-table av__table">
          <thead>
            <tr>
              <th scope="col">Quando</th>
              <th scope="col">Ativação</th>
              <th scope="col" class="av__opt">Tipo</th>
              <th v-if="multiBrand" scope="col" class="av__opt">Marca</th>
              <th scope="col">Situação</th>
              <th scope="col" class="av__opt">Checklist</th>
              <th scope="col" class="av__opt">Fotos</th>
              <th v-if="seesFinance" scope="col" class="mk-num av__opt">Custo</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="a in rows"
              :key="a.id"
              class="av__row"
              :class="{ 'is-open': a.id === openId, 'is-canceled': a.status === 'CANCELED' }"
              @click="open(a.id)"
            >
              <td class="av__when">{{ formatWhen(a) }}</td>
              <td class="av__name">
                <div class="av__cell">
                  <RouterLink
                    class="av__link"
                    :to="{ query: { ...route.query, ativacao: a.id } }"
                    @click.stop
                  >
                    {{ a.title }}
                  </RouterLink>
                  <small v-if="a.location || a.partner" class="av__sub">
                    {{ [a.location, a.partner?.name].filter(Boolean).join(' · ') }}
                  </small>
                </div>
              </td>
              <td class="av__opt">{{ ACTIVATION_KIND_LABEL[a.kind] }}</td>
              <td v-if="multiBrand" class="av__opt">
                <span class="av__brand">
                  <span class="mk-dot" :style="toneStyle(brandTone(mk.brandById(a.companyId)))" aria-hidden="true" />
                  {{ mk.brandById(a.companyId)?.name }}
                </span>
              </td>
              <td class="av__status">
                <span class="mk-chip" data-tone :style="toneStyle(ACTIVATION_STATUS_TONE[a.status])">
                  {{ ACTIVATION_STATUS_LABEL[a.status] }}
                </span>
              </td>
              <td class="av__opt">{{ checklistLabel(a) }}</td>
              <td class="av__opt">
                <span v-if="a.photoCount" class="av__photos"><Camera :size="13" aria-hidden="true" />{{ a.photoCount }}</span>
              </td>
              <td v-if="seesFinance" class="mk-num av__opt">{{ a.costCents ? formatCents(a.costCents) : '' }}</td>
            </tr>
          </tbody>
        </table>
        <div class="av__more" data-testid="av-more">
          <span class="mk-hint">Mostrando {{ rows.length.toLocaleString('pt-BR') }} de {{ shownTotal.toLocaleString('pt-BR') }}</span>
          <button
            v-if="listQuery.hasNextPage.value"
            type="button"
            class="mk-btn"
            :disabled="loadingMore"
            @click="loadMore"
          >
            <Loader2 v-if="loadingMore" :size="14" class="av__spin" aria-hidden="true" />
            {{ loadingMore ? 'Carregando...' : 'Carregar mais' }}
          </button>
        </div>
      </div>
      <p v-if="listQuery.isFetchNextPageError.value" class="mk-error" role="alert">
        Não foi possível carregar mais ativações. Tente de novo.
      </p>
    </div>

    <ActivationPanel
      v-if="openId"
      :key="openId"
      class="av__panel"
      :group-id="groupId"
      :activation-id="openId"
      @close="close"
      @deleted="close"
    />

    <ActivationFormDialog v-model="formOpen" :group-id="groupId" @saved="onSaved" />
  </div>
</template>

<style scoped>
.av {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 14px;
}

.av.is-split {
  grid-template-columns: minmax(0, 1fr) minmax(420px, 520px);
}

.av__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.av__panel {
  position: sticky;
  top: 8px;
}

.av__tabs {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.av__tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 0;
  border-radius: calc(var(--radius-sm) - 2px);
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.av__tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.av__tab.is-active {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.av__n {
  color: var(--text-3);
  font-size: 12px;
}

.av__filter {
  width: 190px;
  max-width: 100%;
}

.av__more {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
}

.av__spin {
  animation: av-spin 0.9s linear infinite;
}

@keyframes av-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .av__spin {
    animation: none;
  }
}

.av__table-wrap {
  overflow-x: auto;
}

.av__row {
  cursor: pointer;
}

.av__row.is-open {
  background: var(--accent-soft);
}

.av__row.is-canceled .av__name,
.av__row.is-canceled .av__when {
  color: var(--text-3);
}

.av__when {
  white-space: nowrap;
  color: var(--text-2);
}

.av__name {
  min-width: 160px;
}

.av__cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.av__link {
  color: var(--text);
  font-weight: 600;
  text-decoration: none;
}

.av__link:hover {
  color: var(--accent-ink);
  text-decoration: underline;
}

.av__sub {
  color: var(--text-3);
  font-size: 12px;
}

.av__brand,
.av__photos {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

@media (max-width: 1100px) {
  .av.is-split {
    grid-template-columns: minmax(0, 1fr);
  }

  /* Com o painel aberto, ele ocupa o lugar da lista (nada de rolagem lateral). */
  .av.is-split .av__list {
    display: none;
  }

  .av__panel {
    position: static;
  }
}

.av.is-split .av__opt {
  display: none;
}

/* Celular: a tabela vira lista (nome e situação em cima, quando embaixo). */
@media (max-width: 760px) {
  .av__opt {
    display: none;
  }

  .av__table-wrap {
    overflow-x: visible;
  }

  .av__table,
  .av__table tbody {
    display: block;
  }

  .av__table thead {
    display: none;
  }

  .av__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'name status'
      'when when';
    gap: 0 10px;
    padding: 6px 12px 10px;
    border-bottom: 1px solid var(--border);
  }

  .av__row:last-child {
    border-bottom: 0;
  }

  .av__row td {
    display: block;
    padding: 0;
    border: 0;
  }

  .av__row td.av__opt {
    display: none;
  }

  .av__name {
    grid-area: name;
    min-width: 0;
  }

  .av__status {
    grid-area: status;
    align-self: center;
  }

  .av__when {
    grid-area: when;
    font-size: 12px;
  }

  .av__link {
    display: flex;
    align-items: center;
    min-height: 44px;
  }

  .av__tabs {
    width: 100%;
  }

  .av__tab {
    flex: 1;
    justify-content: center;
    min-height: 44px;
  }

  .av__filter {
    flex: 1 1 130px;
    min-width: 0;
  }

  .mk-toolbar__spacer {
    display: none;
  }

  .av__list .mk-btn--primary {
    flex: 1 1 100%;
  }
}

/* AppSelect compacto tem 36px; no celular o toque pede 44px. */
@media (max-width: 640px) {
  .av__filter :deep(.app-select__trigger) {
    min-height: 44px;
  }
}
</style>
