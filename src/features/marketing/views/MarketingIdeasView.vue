<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Lightbulb, Loader2, Plus, Search, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import type { IdeaInput, IdeaKind, MarketingIdea } from '@/service/marketing/marketing-ideas'
import { useMarketing } from '../composables/useMarketing'
import { CARD_KIND_LABEL } from '../marketing-labels'
import { asText, selectItems } from '../select-items'
import IdeaDialog from '../ideas/IdeaDialog.vue'
import IdeaTile from '../ideas/IdeaTile.vue'
import { IDEA_KIND_LABEL, IDEA_KIND_PLURAL, referenceDomain } from '../ideas/idea-labels'
import { useIdeaActions, useIdeaFilters, useIdeasQuery, type IdeaStatusTab } from '../ideas/useIdeas'
import { TRASH_CONFIRM_LABEL, trashConfirmMessage, useTrashUndo } from '../trash/useTrashUndo'

/**
 * Ideias e trends (spec m2-rastreio-estrategia.md, "M2-B: Ideias e trends").
 * Mural em grade densa: criar rápido no topo, filtros na URL, ordenar por
 * curtidas ou recentes, "Transformar em post" leva ao card.
 */
const router = useRouter()
const mk = useMarketing()
const { success, error: showError } = useToast()
const trashUndo = useTrashUndo()

const filters = useIdeaFilters(() => mk.brandFilter.value)
const query = useIdeasQuery(mk.groupId, filters.apiFilters)
const actions = useIdeaActions(mk.groupId)

const ideas = computed(() => query.data.value ?? [])
const canWrite = computed(() => mk.can('EDITOR'))
const brandsById = computed(() => new Map(mk.brands.value.map((b) => [b.companyId, b])))

// ── Criar rápido ───────────────────────────────────────────────────────────
const quickKind = ref<IdeaKind>('IDEA')
const quickText = ref('')

function quickInput(): IdeaInput | null {
  const text = quickText.value.trim()
  if (!text) return null
  const isLink = /^https?:\/\/\S+$/i.test(text)
  return {
    title: isLink ? (referenceDomain(text) ?? text) : text,
    referenceUrl: isLink ? text : null,
    kind: quickKind.value,
    companyId: mk.brandFilter.value,
  }
}

async function quickAdd() {
  const input = quickInput()
  if (!input) return
  try {
    await actions.create.mutateAsync(input)
    quickText.value = ''
    success('Ideia guardada.')
  } catch (error) {
    showError(getApiErrorMessage(error, 'Não foi possível guardar a ideia.'))
  }
}

// ── Detalhes (criar com todos os campos, editar ou ler) ─────────────────────
const editing = ref<MarketingIdea | null>(null)
const dialogOpen = ref(false)

function openNew() {
  editing.value = null
  dialogOpen.value = true
}

function openIdea(idea: MarketingIdea) {
  editing.value = idea
  dialogOpen.value = true
}

async function saveIdea(input: IdeaInput) {
  try {
    if (editing.value) {
      await actions.update.mutateAsync({ id: editing.value.id, input })
      success('Ideia salva.')
    } else {
      await actions.create.mutateAsync(input)
      success('Ideia guardada.')
    }
    dialogOpen.value = false
  } catch (error) {
    showError(getApiErrorMessage(error, 'Não foi possível salvar a ideia.'))
  }
}

const dialogSaving = computed(() => actions.create.isPending.value || actions.update.isPending.value)
const dialogReadonly = computed(() => !canWrite.value || (!!editing.value && !editing.value.canEdit))

// ── Curtir, arquivar, apagar ───────────────────────────────────────────────
function like(idea: MarketingIdea, liked: boolean) {
  actions.like.mutate(
    { id: idea.id, liked },
    { onError: (error) => showError(getApiErrorMessage(error, 'Não foi possível curtir.')) },
  )
}

async function archive(idea: MarketingIdea, archived: boolean) {
  try {
    await actions.archive.mutateAsync({ id: idea.id, archived })
    success(archived ? 'Ideia arquivada.' : 'Ideia fora do arquivo.')
  } catch (error) {
    showError(getApiErrorMessage(error, 'Não foi possível arquivar.'))
  }
}

const toDelete = ref<MarketingIdea | null>(null)
const confirmOpen = computed({
  get: () => !!toDelete.value,
  set: (open) => {
    if (!open) toDelete.value = null
  },
})

async function confirmDelete() {
  const idea = toDelete.value
  if (!idea) return
  try {
    const res = await actions.remove.mutateAsync(idea.id)
    toDelete.value = null
    // R2 (C6): foi para a lixeira, com "Desfazer".
    trashUndo.announce(res?.trashed, `A ideia "${idea.title}"`)
  } catch (error) {
    showError(getApiErrorMessage(error, 'Não foi possível mandar para a lixeira.'))
  }
}

// ── Transformar em post ────────────────────────────────────────────────────
const converting = ref<MarketingIdea | null>(null)
const convertOpen = computed({
  get: () => !!converting.value,
  set: (open) => {
    if (!open) converting.value = null
  },
})
const convertTitle = ref('')
const convertKind = ref('POST')
const convertBrand = ref('')
const ideaKindItems = Object.entries(IDEA_KIND_LABEL).map(([value, label]) => ({ label, value }))
const sortItems = [
  { label: 'Mais curtidas', value: 'likes' },
  { label: 'Mais recentes', value: 'recent' },
]
const convertKindItems = Object.entries(CARD_KIND_LABEL).map(([value, label]) => ({ label, value }))
const convertBrandItems = computed(() => selectItems(mk.brands.value, (b) => b.companyId, (b) => b.name))
const convertError = ref('')

function openConvert(idea: MarketingIdea) {
  converting.value = idea
  convertTitle.value = idea.title
  convertKind.value = 'POST'
  convertBrand.value = idea.companyId ?? mk.brandFilter.value ?? (mk.brands.value.length === 1 ? mk.brands.value[0]!.companyId : '')
  convertError.value = ''
}

async function confirmConvert() {
  const idea = converting.value
  if (!idea) return
  if (!convertBrand.value) {
    convertError.value = 'Escolha a marca do post.'
    return
  }
  if (!convertTitle.value.trim()) {
    convertError.value = 'Dê um título para o post.'
    return
  }
  convertError.value = ''
  try {
    const result = await actions.convert.mutateAsync({
      id: idea.id,
      input: { companyId: convertBrand.value, kind: convertKind.value, title: convertTitle.value.trim() },
    })
    converting.value = null
    success('Post criado a partir da ideia.')
    void router.push(`/marketing/cards/${result.card.id}`)
  } catch (error) {
    // 409: alguém já transformou. A lista recarrega e o botão vira "Ver post".
    convertError.value = getApiErrorMessage(error, 'Não foi possível criar o post.')
    showError(convertError.value)
  }
}

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

const kindTabs: Array<{ value: IdeaKind | null; label: string }> = [
  { value: null, label: 'Tudo' },
  { value: 'IDEA', label: IDEA_KIND_PLURAL.IDEA },
  { value: 'TREND', label: IDEA_KIND_PLURAL.TREND },
  { value: 'REFERENCE', label: IDEA_KIND_PLURAL.REFERENCE },
]
const statusTabs: Array<{ value: IdeaStatusTab; label: string }> = [
  { value: 'abertas', label: 'Abertas' },
  { value: 'viraram', label: 'Viraram post' },
  { value: 'arquivadas', label: 'Arquivadas' },
]

/** Tags que aparecem nas ideias carregadas, da mais usada para a menos. */
const topTags = computed(() => {
  const counts = new Map<string, number>()
  for (const idea of ideas.value) for (const t of idea.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 14)
})

const hasFilters = computed(() => !!(filters.q.value || filters.tag.value || filters.kind.value || mk.brandFilter.value))
const countLabel = computed(() => {
  const n = ideas.value.length
  return `${n} ${n === 1 ? 'item' : 'itens'}`
})
const emptyText = computed(() => {
  if (hasFilters.value) return 'Nada com esses filtros. Limpe a busca ou troque o tipo.'
  if (filters.tab.value === 'viraram') return 'Quando uma ideia virar post, ela aparece aqui.'
  if (filters.tab.value === 'arquivadas') return 'Nenhuma ideia arquivada.'
  return canWrite.value
    ? 'Guarde a primeira ideia, trend ou referência no campo acima.'
    : 'A equipe ainda não guardou nenhuma ideia.'
})
</script>

<template>
  <div class="mk-page iv">
    <form v-if="canWrite" class="iv-quick" @submit.prevent="quickAdd">
      <div class="iv-quick__kind" data-testid="idea-quick-kind">
        <AppSelect :model-value="quickKind" :items="ideaKindItems" label="Tipo" density="compact" @update:model-value="quickKind = $event as IdeaKind" />
      </div>
      <input
        v-model="quickText"
        class="mk-input iv-quick__text"
        maxlength="300"
        autocomplete="off"
        placeholder="Guarde uma ideia, uma trend ou cole um link"
        aria-label="Nova ideia"
      />
      <button type="submit" class="mk-btn mk-btn--primary" :disabled="!quickText.trim() || actions.create.isPending.value">
        <Loader2 v-if="actions.create.isPending.value" :size="14" class="iv-spin" aria-hidden="true" />
        <Plus v-else :size="14" aria-hidden="true" />
        Guardar
      </button>
      <button type="button" class="mk-btn" @click="openNew">Com mais detalhes</button>
    </form>

    <div class="mk-toolbar iv-filters">
      <label class="iv-search">
        <Search :size="14" aria-hidden="true" />
        <input v-model="searchText" type="search" placeholder="Buscar por título, texto ou tag" aria-label="Buscar ideias" />
      </label>

      <div class="iv-seg" role="group" aria-label="Tipo">
        <button
          v-for="t in kindTabs"
          :key="t.label"
          type="button"
          :class="{ 'is-on': filters.kind.value === t.value }"
          :aria-pressed="filters.kind.value === t.value"
          @click="filters.setKind(t.value)"
        >
          {{ t.label }}
        </button>
      </div>

      <div class="iv-seg" role="group" aria-label="Situação">
        <button
          v-for="t in statusTabs"
          :key="t.value"
          type="button"
          :class="{ 'is-on': filters.tab.value === t.value }"
          :aria-pressed="filters.tab.value === t.value"
          @click="filters.setTab(t.value)"
        >
          {{ t.label }}
        </button>
      </div>

      <div class="iv-sort" data-testid="idea-sort">
        <AppSelect
          :model-value="filters.sort.value"
          :items="sortItems"
          label="Ordenar"
          density="compact"
          @update:model-value="filters.setSort($event as 'likes' | 'recent')"
        />
      </div>

      <span class="iv-count" aria-live="polite">{{ countLabel }}</span>
    </div>

    <div v-if="topTags.length || filters.tag.value" class="iv-tags" aria-label="Filtrar por tag">
      <button v-if="filters.tag.value" type="button" class="iv-tag is-on" @click="filters.setTag(null)">
        #{{ filters.tag.value }}
        <X :size="12" aria-hidden="true" />
      </button>
      <template v-for="[tag, n] in topTags" :key="tag">
        <button v-if="tag !== filters.tag.value" type="button" class="iv-tag" @click="filters.setTag(tag)">
          #{{ tag }} <span>{{ n }}</span>
        </button>
      </template>
    </div>

    <div v-if="query.isLoading.value" class="iv-grid" aria-busy="true">
      <Skeleton v-for="n in 6" :key="n" type="block" height="112px" />
    </div>

    <EmptyState
      v-else-if="query.isError.value"
      :icon="Lightbulb"
      title="Não foi possível carregar as ideias"
      description="Verifique a conexão e tente de novo."
    >
      <template #action>
        <button type="button" class="mk-btn" @click="query.refetch()">Tentar de novo</button>
      </template>
    </EmptyState>

    <EmptyState v-else-if="!ideas.length" :icon="Lightbulb" title="Nenhuma ideia por aqui" :description="emptyText">
      <template v-if="hasFilters" #action>
        <button type="button" class="mk-btn" @click="filters.clear()">Limpar filtros</button>
      </template>
    </EmptyState>

    <div v-else class="iv-grid">
      <IdeaTile
        v-for="idea in ideas"
        :key="idea.id"
        :idea="idea"
        :brand="idea.companyId ? brandsById.get(idea.companyId) : undefined"
        :can-write="canWrite"
        @open="openIdea(idea)"
        @like="like(idea, $event)"
        @convert="openConvert(idea)"
        @archive="archive(idea, $event)"
        @remove="toDelete = idea"
      />
    </div>

    <IdeaDialog
      v-model="dialogOpen"
      :idea="editing"
      :brands="mk.brands.value"
      :default-brand-id="mk.brandFilter.value"
      :saving="dialogSaving"
      :readonly="dialogReadonly"
      @save="saveIdea"
    />

    <ConfirmDialog
      v-model="confirmOpen"
      title="Mandar esta ideia para a lixeira?"
      :message="`${trashConfirmMessage(`&quot;${toDelete?.title ?? ''}&quot;`)} Um post que já saiu dela continua existindo.`"
      :confirm-label="TRASH_CONFIRM_LABEL"
      danger
      :loading="actions.remove.isPending.value"
      @confirm="confirmDelete"
    />

    <AppDialog v-model="convertOpen" label="Transformar em post" size="sm" :loading="actions.convert.isPending.value">
      <form class="iv-conv" novalidate @submit.prevent="confirmConvert">
        <header class="iv-conv__head">
          <h2>Transformar em post</h2>
          <button type="button" class="mk-icon-btn" aria-label="Fechar" @click="convertOpen = false">
            <X :size="16" />
          </button>
        </header>
        <div class="iv-conv__body">
          <label class="mk-field">
            <span class="mk-label">Título do post</span>
            <input v-model="convertTitle" class="mk-input" maxlength="200" autocomplete="off" autofocus />
          </label>
          <div class="iv-conv__row">
            <div class="mk-field" data-field="convert-kind">
              <span class="mk-label">Tipo</span>
              <AppSelect :model-value="convertKind" :items="convertKindItems" label="Tipo" density="compact" @update:model-value="convertKind = asText($event)" />
            </div>
            <div class="mk-field" data-field="convert-brand">
              <span class="mk-label">Marca</span>
              <AppSelect :model-value="convertBrand" :items="convertBrandItems" label="Marca" placeholder="Escolha" density="compact" @update:model-value="convertBrand = asText($event)" />
            </div>
          </div>
          <p class="mk-hint">O post nasce como Ideia no quadro de aprovação, com o link e a descrição no briefing.</p>
          <p v-if="convertError" class="mk-error" role="alert">{{ convertError }}</p>
        </div>
        <footer class="iv-conv__foot">
          <button type="button" class="mk-btn mk-btn--ghost" :disabled="actions.convert.isPending.value" @click="convertOpen = false">
            Cancelar
          </button>
          <button type="submit" class="mk-btn mk-btn--primary" :disabled="actions.convert.isPending.value">
            <Loader2 v-if="actions.convert.isPending.value" :size="14" class="iv-spin" aria-hidden="true" />
            Criar post
          </button>
        </footer>
      </form>
    </AppDialog>
  </div>
</template>

<style scoped>
.iv {
  gap: 10px;
}

.iv-quick {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.iv-quick__kind {
  width: 120px;
  flex-shrink: 0;
}

.iv-quick__text {
  flex: 1;
  min-width: 200px;
}

.iv-filters {
  gap: 8px;
}

.iv-search {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 180px;
  max-width: 320px;
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-3);
}

.iv-search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.iv-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  outline: none;
}

.iv-seg {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.iv-seg button {
  padding: 4px 10px;
  border: 0;
  border-radius: calc(var(--radius-sm) - 2px);
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.iv-seg button:hover {
  color: var(--text);
}

.iv-seg button.is-on {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.iv-seg button:focus-visible,
.iv-tag:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.iv-sort {
  min-width: 160px;
}

.iv-count {
  margin-left: auto;
  color: var(--text-3);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}

.iv-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.iv-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.iv-tag span {
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.iv-tag:hover {
  background: var(--surface-2);
}

.iv-tag.is-on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.iv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: 10px;
  align-items: stretch;
}

.iv-conv {
  display: flex;
  flex-direction: column;
}

.iv-conv__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 8px;
}

.iv-conv__head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.iv-conv__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 16px 12px;
}

.iv-conv__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.iv-conv__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px 14px;
  border-top: 1px solid var(--border);
}

.iv-spin {
  animation: iv-spin 0.8s linear infinite;
}

@keyframes iv-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .iv-quick {
    gap: 6px;
  }

  .iv-quick__kind {
    flex: none;
    width: 112px;
  }

  .iv-quick__text {
    flex: 1 1 160px;
    min-width: 160px;
  }

  .iv-quick .mk-btn {
    flex: 1 1 calc(50% - 3px);
  }

  .iv-search {
    max-width: none;
    flex-basis: 100%;
  }

  .iv-search input {
    min-height: 44px;
  }

  .iv-seg {
    flex-basis: 100%;
    max-width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .iv-seg button {
    flex: 1;
    min-height: 44px;
  }

  .iv-sort {
    flex: 1;
    min-width: 0;
  }

  .iv-tags {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .iv-tag {
    flex-shrink: 0;
    min-height: 44px;
    padding-inline: 12px;
  }

  .iv-conv__row {
    grid-template-columns: 1fr;
  }

  .iv-count {
    margin-left: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .iv-spin {
    animation: none;
  }
}
</style>
