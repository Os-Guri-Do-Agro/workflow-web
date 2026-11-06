<script setup lang="ts">
import { refDebounced } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { Link2, Plus, Search } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import type { MarketingUtm } from '@/service/marketing/marketing-utm'
import { useMarketing } from '../composables/useMarketing'
import { brandTone, toneStyle } from '../marketing-labels'
import UtmFormDialog from '../utm/UtmFormDialog.vue'
import UtmPanel from '../utm/UtmPanel.vue'
import { useUtmList, useUtmOptions, useWideViewport } from '../utm/useUtm'

/**
 * UTMs e QR (M2-A): lista densa com filtros na URL e painel do item (`?utm=`).
 * A UTM é um link do encurtador; o QR aponta para o link curto.
 */
const route = useRoute()
const router = useRouter()
const mk = useMarketing()
const wide = useWideViewport()

const one = (v: unknown) => (typeof v === 'string' ? v : '')
const search = ref(one(route.query.q))
const searchDebounced = refDebounced(search, 300)

function setQuery(patch: Record<string, string | null>, replace = true) {
  const query: LocationQueryRaw = { ...route.query }
  for (const [k, v] of Object.entries(patch)) {
    if (v) query[k] = v
    else delete query[k]
  }
  void (replace ? router.replace({ query }) : router.push({ query }))
}

watch(searchDebounced, (v) => {
  if (v !== one(route.query.q)) setQuery({ q: v.trim() || null })
})

const source = computed(() => one(route.query.origem))
const medium = computed(() => one(route.query.midia))
const campaignId = computed(() => one(route.query.campanha))
const selectedId = computed(() => one(route.query.utm))

const filters = computed(() => ({
  ...(mk.brandFilter.value ? { companyId: mk.brandFilter.value } : {}),
  ...(source.value ? { source: source.value } : {}),
  ...(medium.value ? { medium: medium.value } : {}),
  ...(campaignId.value ? { campaignId: campaignId.value } : {}),
  ...(one(route.query.q).trim() ? { q: one(route.query.q).trim() } : {}),
}))
const hasFilters = computed(() => Object.keys(filters.value).some((k) => k !== 'companyId') || !!mk.brandFilter.value)

const list = useUtmList(mk.groupId, filters)
const options = useUtmOptions(mk.groupId)
const rows = computed(() => list.data.value ?? [])
const selected = computed(() => rows.value.find((r) => r.id === selectedId.value) ?? null)
const canEdit = computed(() => mk.can('EDITOR'))
const canDelete = computed(() => mk.can('ADMIN'))
const multiBrand = computed(() => mk.brands.value.length > 1)

// A UTM aberta sumiu da lista (apagada aqui ou em outra aba): fecha o painel,
// senão a URL fica com um `?utm=` que não aponta para nada.
watch([selectedId, rows, () => list.isFetching.value], () => {
  if (selectedId.value && list.isSuccess.value && !list.isFetching.value && !selected.value) closePanel()
})

function select(id: string) {
  setQuery({ utm: id }, false)
}
function closePanel() {
  setQuery({ utm: null })
}

const formOpen = ref(false)
const editing = ref<MarketingUtm | null>(null)
function openCreate() {
  editing.value = null
  formOpen.value = true
}
function openEdit() {
  editing.value = selected.value
  formOpen.value = true
}
function onSaved(utm: MarketingUtm) {
  setQuery({ utm: utm.id })
}

const campaignOptions = computed(() => {
  const all = options.data.value?.campaigns ?? []
  return mk.brandFilter.value ? all.filter((c) => c.companyId === mk.brandFilter.value) : all
})

const panelOpenNarrow = computed({
  get: () => !wide.value && !!selected.value,
  set: (v) => {
    if (!v) closePanel()
  },
})

function brandOf(id: string) {
  return mk.brandById(id)
}
</script>

<template>
  <section class="mk-page mk-utm" :class="{ 'mk-utm--split': wide && selected }">
    <div class="mk-utm__main">
      <div class="mk-toolbar">
        <div class="mk-utm__search">
          <Search :size="14" aria-hidden="true" />
          <input
            v-model="search"
            class="mk-input"
            type="search"
            placeholder="Buscar por onde é usado, campanha, código ou destino"
            aria-label="Buscar UTM"
          />
        </div>
        <select
          class="mk-select mk-utm__filter"
          :value="source"
          aria-label="Filtrar por origem"
          @change="setQuery({ origem: ($event.target as HTMLSelectElement).value || null })"
        >
          <option value="">Todas as origens</option>
          <option v-for="s in options.data.value?.sources ?? []" :key="s" :value="s">{{ s }}</option>
        </select>
        <select
          class="mk-select mk-utm__filter"
          :value="medium"
          aria-label="Filtrar por mídia"
          @change="setQuery({ midia: ($event.target as HTMLSelectElement).value || null })"
        >
          <option value="">Todas as mídias</option>
          <option v-for="m in options.data.value?.mediums ?? []" :key="m" :value="m">{{ m }}</option>
        </select>
        <select
          v-if="campaignOptions.length"
          class="mk-select mk-utm__filter"
          :value="campaignId"
          aria-label="Filtrar por campanha"
          @change="setQuery({ campanha: ($event.target as HTMLSelectElement).value || null })"
        >
          <option value="">Todas as campanhas</option>
          <option v-for="c in campaignOptions" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <span class="mk-toolbar__spacer" />
        <button v-if="canEdit" type="button" class="mk-btn mk-btn--primary" @click="openCreate">
          <Plus :size="14" />Nova UTM
        </button>
      </div>

      <div v-if="list.isLoading.value" class="mk-utm__loading"><Skeleton type="row" /><Skeleton type="row" /><Skeleton type="row" /></div>
      <p v-else-if="list.isError.value" class="mk-error" role="alert">Não foi possível carregar as UTMs. Tente de novo em instantes.</p>

      <EmptyState
        v-else-if="!rows.length"
        :icon="Link2"
        :title="hasFilters ? 'Nenhuma UTM com esses filtros' : 'Nenhuma UTM ainda'"
        :description="
          hasFilters
            ? 'Tire um filtro para ver mais.'
            : 'Crie a primeira para saber de onde vem cada clique e cada leitura de QR.'
        "
      >
        <template v-if="canEdit && !hasFilters" #action>
          <button type="button" class="mk-btn mk-btn--primary" @click="openCreate"><Plus :size="14" />Nova UTM</button>
        </template>
      </EmptyState>

      <div v-else class="mk-panel mk-utm-list">
        <table class="mk-table">
          <thead>
            <tr>
              <th>Onde será usado</th>
              <th class="hide-md">Origem e mídia</th>
              <th class="hide-md">Campanha</th>
              <th class="mk-num">Cliques</th>
              <th class="mk-num">Leituras</th>
              <th class="mk-utm__state">Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in rows"
              :key="r.id"
              class="mk-utm-row"
              :class="{ 'is-selected': r.id === selectedId }"
              tabindex="0"
              :aria-selected="r.id === selectedId"
              @click="select(r.id)"
              @keydown.enter.prevent="select(r.id)"
            >
              <td class="mk-utm__place">
                <span class="mk-utm__name">{{ r.placement }}</span>
                <span class="mk-utm__sub">
                  <span v-if="multiBrand" class="mk-utm__brand">
                    <span class="mk-dot" :style="toneStyle(brandTone(brandOf(r.companyId)))" aria-hidden="true" />{{ brandOf(r.companyId)?.name }}
                  </span>
                  <code>/l/{{ r.shortLink.code }}</code>
                  <span v-if="r.qr" class="mk-utm__qrtag">com QR</span>
                </span>
              </td>
              <td class="hide-md">{{ r.shortLink.utmSource }} <span class="mk-utm__sep">/</span> {{ r.shortLink.utmMedium }}</td>
              <td class="hide-md">
                <span class="mk-utm__camp">{{ r.shortLink.utmCampaign }}</span>
                <span v-if="r.campaign" class="mk-utm__sub">{{ r.campaign.name }}</span>
              </td>
              <td class="mk-num">{{ r.shortLink.clickCount.toLocaleString('pt-BR') }}</td>
              <td class="mk-num">{{ r.qr ? r.qr.scanCount.toLocaleString('pt-BR') : '-' }}</td>
              <td class="mk-utm__state">
                <span
                  class="mk-chip"
                  data-tone
                  :style="{ '--mk-tone': r.shortLink.active ? 'var(--success)' : 'var(--text-3)' }"
                >
                  {{ r.shortLink.active ? 'Ativa' : 'Pausada' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <aside v-if="wide && selected" class="mk-panel mk-utm__aside" aria-label="Detalhe da UTM">
      <UtmPanel
        :key="selected.id"
        :utm="selected"
        :group-id="mk.groupId.value!"
        :can-edit="canEdit"
        :can-delete="canDelete"
        :brand-name="brandOf(selected.companyId)?.name ?? ''"
        closable
        @close="closePanel"
        @edit="openEdit"
        @deleted="closePanel"
      />
    </aside>

    <AppDialog v-model="panelOpenNarrow" label="Detalhe da UTM" size="lg">
      <div v-if="selected" class="mk-utm__sheet">
        <UtmPanel
          :key="selected.id"
          :utm="selected"
          :group-id="mk.groupId.value!"
          :can-edit="canEdit"
          :can-delete="canDelete"
          :brand-name="brandOf(selected.companyId)?.name ?? ''"
          closable
          @close="closePanel"
          @edit="openEdit"
          @deleted="closePanel"
        />
      </div>
    </AppDialog>

    <UtmFormDialog
      v-model="formOpen"
      :group-id="mk.groupId.value!"
      :brands="mk.brands.value"
      :default-brand-id="mk.brandFilter.value"
      :options="options.data.value"
      :utm="editing"
      @saved="onSaved"
      @open-existing="select"
    />
  </section>
</template>

<style scoped>
.mk-utm {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.mk-utm--split {
  grid-template-columns: minmax(0, 1fr) 440px;
}

.mk-utm__main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.mk-utm__search {
  position: relative;
  flex: 1 1 260px;
  max-width: 420px;
  min-width: 180px;
}

.mk-utm__search svg {
  position: absolute;
  top: 50%;
  left: 10px;
  transform: translateY(-50%);
  color: var(--text-3);
  pointer-events: none;
}

.mk-utm__search .mk-input {
  padding-left: 30px;
}

.mk-utm__filter {
  width: auto;
  max-width: 190px;
}

.mk-utm__loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mk-utm-list {
  overflow: hidden;
}

.mk-utm-row {
  cursor: pointer;
}

.mk-utm-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.mk-utm-row.is-selected {
  background: var(--accent-soft);
}

.mk-utm__place {
  min-width: 0;
}

.mk-utm__name {
  display: block;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.mk-utm__sub {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-3);
}

.mk-utm__sub code {
  font-family: var(--font-mono);
}

.mk-utm__brand {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.mk-utm__qrtag {
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-2);
}

.mk-utm__sep {
  color: var(--text-4);
}

.mk-utm__camp {
  display: block;
}

.mk-utm__state {
  white-space: nowrap;
}

.mk-utm__aside {
  position: sticky;
  top: 12px;
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  padding: 14px;
}

.mk-utm__sheet {
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
  .mk-utm__filter {
    flex: 1 1 140px;
    max-width: none;
  }

  .mk-utm__state {
    display: none;
  }

  .mk-utm-row td {
    padding-top: 12px;
    padding-bottom: 12px;
  }
}
</style>
