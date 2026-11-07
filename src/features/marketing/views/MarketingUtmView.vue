<script setup lang="ts">
import { refDebounced } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { Link2, Plus, QrCode, Search } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useToast } from '@/composables/useToast'
import { isUtmNotFound, type MarketingUtm } from '@/service/marketing/marketing-utm'
import { useMarketing } from '../composables/useMarketing'
import { brandTone, toneStyle } from '../marketing-labels'
import UtmFormDialog from '../utm/UtmFormDialog.vue'
import UtmPanel from '../utm/UtmPanel.vue'
import { useUtmLookup, useUtmOptions, useUtmPages, useWideViewport } from '../utm/useUtm'

/**
 * UTMs e QR (M2-A): lista densa com filtros na URL e painel do item (`?utm=`).
 * A UTM é um link do encurtador; o QR aponta para o link curto. A lista mostra
 * a miniatura do QR (R1, D10): é o jeito de ver de relance qual tem QR.
 */
const route = useRoute()
const router = useRouter()
const mk = useMarketing()
const toast = useToast()
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

// R2 (C7): em páginas, com "Carregar mais" (a lista antiga cortava em 500 calada).
const list = useUtmPages(mk.groupId, filters)
const options = useUtmOptions(mk.groupId)
const rows = computed(() => list.data.value?.pages.flatMap((p) => p.items) ?? [])
const total = computed(() => list.data.value?.pages[0]?.total ?? rows.value.length)
const inList = computed(() => rows.value.find((r) => r.id === selectedId.value) ?? null)
// `?utm=` que a lista (filtrada, 500 no máximo) não trouxe: procura a UTM fora do filtro.
const lookup = useUtmLookup(
  mk.groupId,
  selectedId,
  computed(() => !!selectedId.value && list.isSuccess.value && !list.isFetching.value && !inList.value),
)
const selected = computed(() => inList.value ?? (selectedId.value ? (lookup.data.value?.utm ?? null) : null))
const canEdit = computed(() => mk.can('EDITOR'))
const canDelete = computed(() => mk.can('ADMIN'))
const multiBrand = computed(() => mk.brands.value.length > 1)

// A UTM aberta não existe mais (apagada aqui ou em outra aba, ou link velho):
// fecha o painel, senão a URL fica com um `?utm=` que não aponta para nada.
// Fora da lista filtrada, a busca por id decide antes de fechar.
let closedFor = ''
watch(
  [selectedId, rows, () => list.isFetching.value, () => lookup.status.value, () => lookup.isFetching.value],
  () => {
    const id = selectedId.value
    if (!id || !list.isSuccess.value || list.isFetching.value || inList.value) return
    if (lookup.isFetching.value || lookup.status.value === 'pending') return
    if (lookup.status.value === 'success' && lookup.data.value?.utm) return
    if (closedFor === id) return
    closedFor = id
    if (isUtmNotFound(lookup.error.value)) {
      toast.info('Essa UTM não existe mais ou você não tem acesso a ela.')
    } else {
      toast.error('Não foi possível abrir essa UTM. Tente de novo em instantes.')
    }
    closePanel()
  },
)
watch(selectedId, (id) => {
  if (!id) closedFor = ''
})

function select(id: string) {
  setQuery({ utm: id }, false)
}

/**
 * "Abrir a existente" (duplicata, 409). A duplicata é conferida no grupo
 * inteiro, então a existente pode ser de outra marca ou estar fora dos
 * filtros da lista: sem limpar os filtros, o painel não achava a linha e
 * fechava sozinho, e parecia que o botão não fazia nada (achado do passe de
 * comportamento da R1).
 */
function openExisting(id: string) {
  search.value = ''
  setQuery({ utm: id, origem: null, midia: null, campanha: null, q: null, marca: null }, false)
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
/**
 * Criada ou editada fora do filtro ativo: sem limpar os filtros o painel não
 * achava a linha e fechava sozinho (mesmo caso do `openExisting`). Só limpa se
 * ela ficaria de fora; com a UTM dentro do filtro, a lista continua como está.
 */
function onSaved(utm: MarketingUtm) {
  if (hasFilters.value && !matchesFilters(utm)) openExisting(utm.id)
  else setQuery({ utm: utm.id })
}
function matchesFilters(utm: MarketingUtm) {
  const f = filters.value as { companyId?: string; source?: string; medium?: string; campaignId?: string; q?: string }
  if (f.companyId && utm.companyId !== f.companyId) return false
  if (f.campaignId && utm.campaign?.id !== f.campaignId) return false
  if (f.source && utm.shortLink.utmSource !== f.source) return false
  if (f.medium && utm.shortLink.utmMedium !== f.medium) return false
  if (f.q) {
    const q = f.q.toLowerCase()
    const l = utm.shortLink
    const hay = [utm.placement, l.code, l.targetUrl, l.utmCampaign, l.utmContent].map((v) => (v ?? '').toLowerCase())
    if (!hay.some((v) => v.includes(q))) return false
  }
  return true
}

const campaignOptions = computed(() => {
  const all = options.data.value?.campaigns ?? []
  return mk.brandFilter.value ? all.filter((c) => c.companyId === mk.brandFilter.value) : all
})
const sourceFilterItems = computed(() => [
  { label: 'Todas as origens', value: '' },
  ...(options.data.value?.sources ?? []).map((v) => ({ label: v, value: v })),
])
const mediumFilterItems = computed(() => [
  { label: 'Todas as mídias', value: '' },
  ...(options.data.value?.mediums ?? []).map((v) => ({ label: v, value: v })),
])
const campaignFilterItems = computed(() => [
  { label: 'Todas as campanhas', value: '' },
  ...campaignOptions.value.map((c) => ({ label: c.name, value: c.id })),
])
const asText = (v: unknown) => (typeof v === 'string' && v ? v : null)

/** Miniatura servida pela API (SVG pequeno, com o visual do QR). */
function qrThumb(imageUrl: string) {
  return `${imageUrl}?format=svg&size=96`
}

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
        <div class="mk-utm__filter" data-testid="utm-filter-source">
          <AppSelect
            :model-value="source"
            :items="sourceFilterItems"
            label="Filtrar por origem"
            density="compact"
            @update:model-value="setQuery({ origem: asText($event) })"
          />
        </div>
        <div class="mk-utm__filter" data-testid="utm-filter-medium">
          <AppSelect
            :model-value="medium"
            :items="mediumFilterItems"
            label="Filtrar por mídia"
            density="compact"
            @update:model-value="setQuery({ midia: asText($event) })"
          />
        </div>
        <div v-if="campaignOptions.length" class="mk-utm__filter" data-testid="utm-filter-campaign">
          <AppSelect
            :model-value="campaignId"
            :items="campaignFilterItems"
            label="Filtrar por campanha"
            density="compact"
            @update:model-value="setQuery({ campanha: asText($event) })"
          />
        </div>
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
              <th class="mk-utm__qrcol"><span class="sr-only">QR</span></th>
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
              <td class="mk-utm__qrcol">
                <img
                  v-if="r.qr"
                  class="mk-utm__thumb"
                  :class="{ 'is-off': !r.qr.active }"
                  :src="qrThumb(r.qr.imageUrl)"
                  width="32"
                  height="32"
                  loading="lazy"
                  decoding="async"
                  alt="QR"
                  data-testid="utm-thumb"
                />
                <span v-else class="mk-utm__nothumb" title="Sem QR" aria-label="Sem QR"><QrCode :size="14" /></span>
              </td>
              <td class="mk-utm__place">
                <span class="mk-utm__name">{{ r.placement }}</span>
                <span class="mk-utm__sub">
                  <span v-if="multiBrand" class="mk-utm__brand">
                    <span class="mk-dot" :style="toneStyle(brandTone(brandOf(r.companyId)))" aria-hidden="true" />{{ brandOf(r.companyId)?.name }}
                  </span>
                  <code>/l/{{ r.shortLink.code }}</code>
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
                  {{ r.shortLink.active ? 'Ativa' : 'Desativada' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="rows.length" class="mk-utm__more" data-testid="utm-more">
        <span class="mk-hint">
          {{ rows.length.toLocaleString('pt-BR') }} de {{ total.toLocaleString('pt-BR') }}
          {{ total === 1 ? 'UTM' : 'UTMs' }}
        </span>
        <button
          v-if="list.hasNextPage.value"
          type="button"
          class="mk-btn"
          data-action="utm-load-more"
          :disabled="list.isFetchingNextPage.value"
          @click="list.fetchNextPage()"
        >
          {{ list.isFetchingNextPage.value ? 'Carregando...' : 'Carregar mais' }}
        </button>
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
      @open-existing="openExisting"
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
  flex: 1 1 220px;
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
  width: 150px;
  max-width: 190px;
}

.mk-utm__qrcol {
  width: 1%;
  padding-right: 0 !important;
}

.mk-utm__thumb {
  display: block;
  width: 32px;
  height: 32px;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  /* QR precisa de fundo claro para ler e para a miniatura não sumir no tema escuro. */
  background: var(--surface);
  object-fit: contain;
}

.mk-utm__thumb.is-off {
  opacity: 0.45;
}

.mk-utm__nothumb {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-xs);
  color: var(--text-4);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.mk-utm__loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mk-utm-list {
  overflow: hidden;
}

.mk-utm__more {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 2px;
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

/* AppSelect compacto tem 36px; no celular o toque pede 44px. */
@media (max-width: 640px) {
  .mk-utm__filter :deep(.app-select__trigger) {
    min-height: 44px;
  }
}
</style>
