<script setup lang="ts">
/**
 * Links de trabalho da ala (spec M1-B): o cofre do time de marketing. Lista por
 * categoria (as do grupo, em `settings.linkCategories`), favoritos no topo,
 * busca na hora (sem acento, sem caixa). Copiar link e usuário; a senha só
 * por "Revelar" (registrado) e some sozinha em 30 s.
 *
 * Atalhos: `/` foca a busca, N abre um link novo.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { KeyRound, Plus, RefreshCw, Search, Star } from 'lucide-vue-next'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useToast } from '@/composables/useToast'
import type { LinkInput, MarketingLink } from '@/service/marketing/marketing-links'
import { useMarketing } from '../composables/useMarketing'
import { brandTone } from '../marketing-labels'
import { apiErrorMessage } from '../calendar/api-error'
import { useMarketingLinks } from '../links/composables/useMarketingLinks'
import LinkDialog from '../links/components/LinkDialog.vue'
import LinkRow from '../links/components/LinkRow.vue'

const route = useRoute()
const router = useRouter()
const mk = useMarketing()
const toast = useToast()
const links = useMarketingLinks({ groupId: mk.groupId, brandId: mk.brandFilter })

const canEdit = computed(() => mk.can('EDITOR'))
const canReveal = computed(() => !!mk.permissions.value?.revealSecrets)
const categories = computed(() => mk.settings.value?.linkCategories ?? [])

// ── Busca e categoria (na URL) ──────────────────────────────────────────
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const category = computed(() => (typeof route.query.categoria === 'string' ? route.query.categoria : ''))
function setCategory(value: string) {
  const query = { ...route.query }
  if (value) query.categoria = value
  else delete query.categoria
  void router.replace({ query })
}
let qTimer: ReturnType<typeof setTimeout> | null = null
function onSearch(value: string) {
  q.value = value
  if (qTimer) clearTimeout(qTimer)
  qTimer = setTimeout(() => {
    const query = { ...route.query }
    if (value.trim()) query.q = value.trim()
    else delete query.q
    void router.replace({ query })
  }, 250)
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const all = computed<MarketingLink[]>(() => links.query.data.value ?? [])
const filtered = computed(() => {
  const term = norm(q.value.trim())
  return all.value.filter((l) => {
    if (category.value && l.category !== category.value) return false
    if (!term) return true
    return [l.title, l.url, l.username ?? '', l.notes ?? '', l.category, brandName(l.companyId)].some((v) => norm(v).includes(term))
  })
})

const favorites = computed(() => filtered.value.filter((l) => l.isFavorite))
const sections = computed(() => {
  const rest = filtered.value.filter((l) => !l.isFavorite)
  const order = [...categories.value]
  for (const l of rest) if (!order.includes(l.category)) order.push(l.category)
  return order.map((name) => ({ name, items: rest.filter((l) => l.category === name) })).filter((s) => s.items.length)
})

/** Contagem por categoria (sobre a busca), para o seletor. */
const countByCategory = computed(() => {
  const map = new Map<string, number>()
  for (const l of all.value) map.set(l.category, (map.get(l.category) ?? 0) + 1)
  return map
})

const multiBrand = computed(() => mk.brands.value.length > 1)
function brandName(companyId: string | null): string {
  if (!multiBrand.value) return ''
  return companyId ? (mk.brandById(companyId)?.name ?? '') : 'Todas as marcas'
}
function brandToneOf(companyId: string | null): string {
  return companyId ? brandTone(mk.brandById(companyId)) : 'slate'
}

// ── Criar, editar, apagar, favoritar ────────────────────────────────────
const dialogOpen = ref(false)
const editing = ref<MarketingLink | null>(null)
function openCreate() {
  if (!canEdit.value) return
  editing.value = null
  dialogOpen.value = true
}
function openEdit(link: MarketingLink) {
  editing.value = link
  dialogOpen.value = true
}
async function submit(input: LinkInput, linkId: string | null) {
  if (linkId) {
    await links.update(linkId, input)
    toast.success('Link salvo.')
  } else {
    await links.create(input)
    toast.success('Link criado.')
  }
}

const toDelete = ref<MarketingLink | null>(null)
const deleting = ref(false)
async function confirmDelete() {
  const link = toDelete.value
  if (!link) return
  deleting.value = true
  try {
    await links.remove(link.id)
    toast.success('Link apagado.')
    toDelete.value = null
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Não deu para apagar o link.'))
  } finally {
    deleting.value = false
  }
}

async function onFavorite(link: MarketingLink) {
  try {
    await links.toggleFavorite(link)
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Não deu para mudar o favorito.'))
  }
}

// ── Atalhos ─────────────────────────────────────────────────────────────
const searchInput = ref<HTMLInputElement | null>(null)
function onKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
  if (dialogOpen.value || toDelete.value || document.querySelector('[role="dialog"][aria-modal="true"]')) return
  if (event.key === '/') {
    event.preventDefault()
    searchInput.value?.focus()
  } else if (event.key.toLowerCase() === 'n' && canEdit.value) {
    event.preventDefault()
    openCreate()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (qTimer) clearTimeout(qTimer)
})
</script>

<template>
  <div class="mk-page mkl">
    <div class="mk-toolbar mkl__bar">
      <label class="mkl__search">
        <Search :size="15" aria-hidden="true" />
        <input
          ref="searchInput"
          :value="q"
          type="search"
          class="mk-input"
          placeholder="Buscar link, usuário ou nota"
          title="Buscar (/)"
          aria-label="Buscar nos links"
          data-field="search"
          @input="onSearch(($event.target as HTMLInputElement).value)"
        />
      </label>
      <select
        class="mk-select mkl__cat"
        :value="category"
        aria-label="Filtrar por categoria"
        data-field="category-filter"
        @change="setCategory(($event.target as HTMLSelectElement).value)"
      >
        <option value="">Todas as categorias</option>
        <option v-for="c in categories" :key="c" :value="c">{{ c }} ({{ countByCategory.get(c) ?? 0 }})</option>
      </select>
      <span class="mk-toolbar__spacer" />
      <button
        v-if="canEdit"
        type="button"
        class="mk-btn mk-btn--primary"
        title="Novo link (N)"
        data-action="new-link"
        @click="openCreate"
      >
        <Plus :size="15" aria-hidden="true" />
        Novo link
      </button>
    </div>

    <p v-if="!canReveal" class="mkl__note">
      <KeyRound :size="13" aria-hidden="true" />
      As senhas ficam escondidas para o seu papel. Peça a um Admin quando precisar.
    </p>

    <div v-if="links.query.isLoading.value" class="mkl__loading">
      <Skeleton type="row" />
      <Skeleton type="row" />
      <Skeleton type="row" />
    </div>

    <div v-else-if="links.query.isError.value && !links.query.data.value" class="mk-panel mkl__error">
      <p>Não deu para carregar os links.</p>
      <button type="button" class="mk-btn" @click="links.query.refetch()">
        <RefreshCw :size="14" aria-hidden="true" />
        Tentar de novo
      </button>
    </div>

    <template v-else>
      <div v-if="!all.length" class="mk-panel mkl__empty">
        <p><strong>Nenhum link ainda.</strong> Guarde aqui o login das redes, as pastas e as ferramentas do time, com a senha no cofre.</p>
        <button v-if="canEdit" type="button" class="mk-btn" @click="openCreate">
          <Plus :size="14" aria-hidden="true" />
          Criar o primeiro link
        </button>
      </div>
      <p v-else-if="!filtered.length" class="mkl__none">Nada encontrado para essa busca.</p>

      <section v-if="favorites.length" class="mk-panel mkl__sec" data-section="favoritos">
        <header class="mk-panel__head">
          <Star :size="14" class="mkl__star" aria-hidden="true" />
          Favoritos
          <span class="mkl__count">{{ favorites.length }}</span>
        </header>
        <ul class="mkl__list">
          <LinkRow
            v-for="l in favorites"
            :key="l.id"
            :link="l"
            :brand-name="brandName(l.companyId)"
            :brand-tone="brandToneOf(l.companyId)"
            :can-edit="canEdit"
            :can-reveal="canReveal"
            :reveal="links.reveal"
            @favorite="onFavorite"
            @edit="openEdit"
            @delete="toDelete = $event"
          />
        </ul>
      </section>

      <section v-for="s in sections" :key="s.name" class="mk-panel mkl__sec" :data-section="s.name">
        <header class="mk-panel__head">
          {{ s.name }}
          <span class="mkl__count">{{ s.items.length }}</span>
        </header>
        <ul class="mkl__list">
          <LinkRow
            v-for="l in s.items"
            :key="l.id"
            :link="l"
            :brand-name="brandName(l.companyId)"
            :brand-tone="brandToneOf(l.companyId)"
            :can-edit="canEdit"
            :can-reveal="canReveal"
            :reveal="links.reveal"
            @favorite="onFavorite"
            @edit="openEdit"
            @delete="toDelete = $event"
          />
        </ul>
      </section>
    </template>

    <LinkDialog
      v-model="dialogOpen"
      :link="editing"
      :categories="categories"
      :brands="mk.brands.value"
      :default-brand="mk.brandFilter.value"
      :default-category="category || null"
      :submit="submit"
    />

    <ConfirmDialog
      :model-value="!!toDelete"
      title="Apagar link"
      :message="toDelete ? `Apagar “${toDelete.title}”? A senha guardada vai junto e não tem como desfazer.` : ''"
      confirm-label="Apagar"
      danger
      :loading="deleting"
      @update:model-value="!$event && (toDelete = null)"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>
.mkl {
  gap: 12px;
}

.mkl__search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 280px;
  max-width: 420px;
}

.mkl__search svg {
  position: absolute;
  left: 10px;
  color: var(--text-3);
  pointer-events: none;
}

.mkl__search .mk-input {
  padding-left: 32px;
}

.mkl__cat {
  width: auto;
  min-width: 190px;
}

.mkl__note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--text-3);
  font-size: 12.5px;
}

.mkl__loading {
  display: grid;
  gap: 8px;
}

.mkl__error,
.mkl__empty {
  display: grid;
  justify-items: start;
  gap: 10px;
  padding: 14px 16px;
}

.mkl__error p,
.mkl__empty p {
  margin: 0;
  color: var(--text-2);
  font-size: 13px;
}

.mkl__none {
  margin: 0;
  color: var(--text-3);
  font-size: 13px;
}

.mkl__sec {
  overflow: hidden;
}

.mkl__star {
  color: var(--warn);
}

.mkl__count {
  color: var(--text-3);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.mkl__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (max-width: 640px) {
  .mkl__search {
    max-width: none;
    flex-basis: 100%;
  }

  .mkl__cat {
    flex: 1;
    min-width: 0;
  }

  .mkl__bar .mk-toolbar__spacer {
    display: none;
  }
}
</style>
