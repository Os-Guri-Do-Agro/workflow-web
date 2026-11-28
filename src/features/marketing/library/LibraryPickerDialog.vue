<script setup lang="ts">
/**
 * "Escolher do acervo": escolhe itens do Acervo para a versão do card. Mostra
 * a marca do card e a Geral do grupo (o servidor só aceita esses dois lugares
 * em `versions/from-library`), favoritos primeiro, seleção múltipla na ordem
 * do clique (é a ordem do carrossel). Emite `picked(itemIds)`; quem abriu
 * chama `createVersionFromLibrary`.
 *
 * Uso (no diálogo de versão do card):
 *   <LibraryPickerDialog v-model="pickerOpen" :group-id="groupId" :company-id="card.companyId"
 *     @picked="(ids) => createVersionFromLibrary(groupId, card.id, { itemIds: ids, note })" />
 */
import { computed, ref, watch } from 'vue'
import { Check, Images, Search, Star, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { isLibraryUnavailable, type LibraryFilters, type LibraryItem, type LibraryKind } from '@/service/marketing/marketing-library'
import LibraryFolderTree from './LibraryFolderTree.vue'
import { itemMeta, KIND_ICON, KIND_OPTIONS, thumbOf, type LibrarySelection } from './library-meta'
import { useLibraryItems, useLibraryTree } from './useLibrary'
import './library.css'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    groupId: string
    /** Marca do card */
    companyId: string
    /** Teto por versão (o da API é 30) */
    max?: number
    confirmLabel?: string
    loading?: boolean
    error?: string
  }>(),
  { max: 30, confirmLabel: '', loading: false, error: '' },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  picked: [itemIds: string[]]
}>()

const open = computed(() => props.modelValue)
const treeQuery = useLibraryTree(() => (open.value ? props.groupId : null))
const locations = computed(() =>
  (treeQuery.data.value?.locations ?? []).filter((l) => l.companyId === props.companyId || l.companyId === null),
)
const folders = computed(() =>
  (treeQuery.data.value?.folders ?? []).filter((f) => f.companyId === props.companyId || f.companyId === null),
)

const place = ref<LibrarySelection>({ companyId: props.companyId, folderId: null })
const q = ref('')
const qDebounced = ref('')
const kind = ref<LibraryKind | ''>('')
const chosen = ref<LibraryItem[]>([])
let timer: ReturnType<typeof setTimeout> | undefined
watch(q, (v) => {
  clearTimeout(timer)
  timer = setTimeout(() => (qDebounced.value = v.trim()), 250)
})

watch(
  () => props.modelValue,
  (isOpen) => {
    if (!isOpen) return
    place.value = { companyId: props.companyId, folderId: null }
    q.value = ''
    qDebounced.value = ''
    kind.value = ''
    chosen.value = []
  },
)

const filters = computed<LibraryFilters>(() => ({
  companyId: place.value.companyId === undefined ? props.companyId : place.value.companyId,
  folderId: place.value.folderId ?? 'raiz',
  subpastas: true,
  q: qDebounced.value || undefined,
  tipo: kind.value || undefined,
  ordem: 'favoritos',
  limit: 60,
}))
const itemsQuery = useLibraryItems(() => (open.value ? props.groupId : null), filters, open)
const items = computed(() => itemsQuery.data.value?.pages.flatMap((p) => p.items) ?? [])
const unavailable = computed(() => isLibraryUnavailable(treeQuery.error.value) || isLibraryUnavailable(itemsQuery.error.value))

const kindItems = [{ label: 'Todos os tipos', value: '' }, ...KIND_OPTIONS]
const kindModel = computed({
  get: () => kind.value,
  set: (v: string | number | null | (string | number | null)[]) => {
    kind.value = (typeof v === 'string' ? v : '') as LibraryKind | ''
  },
})

function orderOf(id: string) {
  const i = chosen.value.findIndex((c) => c.id === id)
  return i >= 0 ? i + 1 : 0
}

function toggle(item: LibraryItem) {
  const i = chosen.value.findIndex((c) => c.id === item.id)
  if (i >= 0) chosen.value = chosen.value.filter((c) => c.id !== item.id)
  else if (chosen.value.length < props.max) chosen.value = [...chosen.value, item]
}

function confirm() {
  if (chosen.value.length) emit('picked', chosen.value.map((c) => c.id))
}

const label = computed(
  () => props.confirmLabel || (chosen.value.length > 1 ? `Usar ${chosen.value.length} arquivos` : 'Usar arquivo'),
)
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    label="Escolher do acervo"
    size="xl"
    :loading="loading"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <header class="lib-dlg__head">
      <div class="lib-dlg__title">
        <Images :size="16" aria-hidden="true" />
        <h2>Escolher do acervo</h2>
      </div>
      <button type="button" class="mk-icon-btn" aria-label="Fechar" :disabled="loading" @click="emit('update:modelValue', false)">
        <X :size="15" aria-hidden="true" />
      </button>
    </header>

    <div class="lpk" data-dialog="library-picker">
      <EmptyState
        v-if="unavailable"
        :icon="Images"
        title="O Acervo ainda não está disponível"
        description="Estamos terminando de instalar o Acervo no servidor. Suba o arquivo do computador por enquanto."
      />
      <template v-else>
        <aside class="lpk__side">
          <Skeleton v-if="treeQuery.isLoading.value" type="text" :lines="4" />
          <LibraryFolderTree
            v-else
            :locations="locations"
            :folders="folders"
            :selection="place"
            mode="pick"
            @select="place = $event"
          />
        </aside>
        <section class="lpk__main">
          <div class="lpk__filters">
            <label class="lpk__search">
              <Search :size="14" class="lpk__search-icon" aria-hidden="true" />
              <input v-model="q" class="mk-input" type="search" placeholder="Buscar no acervo" aria-label="Buscar no acervo" />
            </label>
            <div class="lpk__kind">
              <AppSelect v-model="kindModel" :items="kindItems" label="Tipo" density="compact" />
            </div>
          </div>
          <div v-if="itemsQuery.isLoading.value" class="lpk__grid">
            <Skeleton v-for="n in 8" :key="n" type="block" height="140px" />
          </div>
          <div v-else-if="itemsQuery.isError.value" class="mk-load-error" role="alert">
            <p>Não foi possível carregar o acervo.</p>
            <button type="button" class="mk-btn" @click="itemsQuery.refetch()">Tentar de novo</button>
          </div>
          <p v-else-if="!items.length" class="mk-hint lpk__empty">
            {{ qDebounced || kind ? 'Nada com essa busca.' : 'Nada aqui ainda. Envie o material da marca pela tela Acervo.' }}
          </p>
          <ul v-else class="lpk__grid" aria-label="Arquivos do acervo">
            <li v-for="item in items" :key="item.id">
              <button
                type="button"
                class="lpk__tile"
                :class="{ 'is-on': orderOf(item.id) > 0 }"
                :aria-pressed="orderOf(item.id) > 0"
                :data-pick-item="item.id"
                :disabled="!orderOf(item.id) && chosen.length >= max"
                @click="toggle(item)"
              >
                <span class="lpk__thumb">
                  <img v-if="thumbOf(item)" :src="thumbOf(item)!" alt="" loading="lazy" />
                  <component :is="KIND_ICON[item.kind]" v-else :size="26" aria-hidden="true" />
                  <span v-if="orderOf(item.id)" class="lpk__order" aria-hidden="true">{{ orderOf(item.id) }}</span>
                  <Star v-if="item.starred" :size="13" class="lpk__star" aria-label="Favorito" />
                </span>
                <span class="lpk__name" :title="item.title">{{ item.title }}</span>
                <span class="lpk__meta">{{ itemMeta(item) }}</span>
              </button>
            </li>
          </ul>
          <div v-if="itemsQuery.hasNextPage.value" class="lpk__more">
            <button type="button" class="mk-btn" :disabled="itemsQuery.isFetchingNextPage.value" @click="itemsQuery.fetchNextPage()">
              Carregar mais
            </button>
          </div>
        </section>
      </template>
    </div>

    <footer class="lib-dlg__foot">
      <span class="lib-dlg__foot-note lpk__chosen">
        <template v-if="chosen.length">
          <span class="lpk__strip" aria-hidden="true">
            <span v-for="(c, i) in chosen.slice(0, 8)" :key="c.id" class="lpk__mini" :title="c.title">
              <img v-if="thumbOf(c)" :src="thumbOf(c)!" alt="" />
              <component :is="KIND_ICON[c.kind]" v-else :size="12" />
              <span class="lpk__mini-n">{{ i + 1 }}</span>
            </span>
            <span v-if="chosen.length > 8" class="lpk__more-n">+{{ chosen.length - 8 }}</span>
          </span>
          <Check :size="13" aria-hidden="true" />
          {{ chosen.length === 1 ? '1 escolhido' : `${chosen.length} escolhidos, nesta ordem no carrossel` }}
        </template>
        <template v-else>Clique nos arquivos na ordem em que devem entrar.</template>
      </span>
      <p v-if="error" class="mk-error" role="alert">{{ error }}</p>
      <button type="button" class="mk-btn mk-btn--ghost" :disabled="loading" @click="emit('update:modelValue', false)">Cancelar</button>
      <button
        type="button"
        class="mk-btn mk-btn--primary"
        data-action="use-picked"
        :disabled="loading || !chosen.length"
        @click="confirm"
      >
        {{ loading ? 'Criando a versão...' : label }}
      </button>
    </footer>
  </AppDialog>
</template>

<style scoped>
.lpk {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
  height: min(62vh, 560px);
  padding: 12px 16px;
}

.lpk__side {
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow-y: auto;
}

.lpk__main {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}

.lpk__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.lpk__search {
  position: relative;
  flex: 1 1 200px;
}

.lpk__search-icon {
  position: absolute;
  top: 50%;
  left: 10px;
  color: var(--text-3);
  transform: translateY(-50%);
  pointer-events: none;
}

.lpk__search input {
  padding-left: 30px;
}

.lpk__kind {
  width: 160px;
}

.lpk__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.lpk__tile {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  text-align: left;
  overflow: hidden;
  cursor: pointer;
}

.lpk__tile:hover:not(:disabled) {
  border-color: var(--border-strong);
}

.lpk__tile:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.lpk__tile.is-on {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.lpk__tile:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.lpk__thumb {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 1 / 1;
  background: var(--surface-2);
  color: var(--text-3);
  overflow: hidden;
}

.lpk__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.lpk__order {
  position: absolute;
  top: 6px;
  left: 6px;
  display: grid;
  place-items: center;
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-fg);
  font-size: 12px;
  font-weight: 700;
}

.lpk__star {
  position: absolute;
  top: 8px;
  right: 8px;
  color: var(--due-soon);
  fill: currentColor;
}

.lpk__name {
  padding: 6px 8px 0;
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lpk__meta {
  padding: 0 8px 7px;
  overflow: hidden;
  color: var(--text-3);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lpk__empty {
  padding: 24px 0;
  text-align: center;
}

.lpk__more {
  display: flex;
  justify-content: center;
}

.lpk__chosen {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.lpk__strip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: none;
}

.lpk__mini {
  position: relative;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-xs, 4px);
  background: var(--surface-2);
  color: var(--text-3);
  overflow: hidden;
}

.lpk__mini img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.lpk__mini-n {
  position: absolute;
  right: 1px;
  bottom: 1px;
  min-width: 13px;
  height: 13px;
  padding: 0 2px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-fg);
  font-size: 9px;
  font-weight: 700;
  line-height: 13px;
  text-align: center;
}

.lpk__more-n {
  color: var(--text-3);
  font-size: 11.5px;
}

@media (max-width: 640px) {
  .lpk {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    height: 70dvh;
    padding: 10px 12px;
  }

  .lpk__side {
    max-height: 132px;
  }

  .lpk__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }

  .lpk__kind {
    width: 100%;
  }
}
</style>
