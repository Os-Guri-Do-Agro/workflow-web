<script setup lang="ts">
/**
 * Toolbar do board do mês (spec board-tarefas-redesign, D8), SEMPRE à vista:
 * busca `/` por título e chave, pessoas, os quatro filtros rápidos com
 * contagem, menus de Tags e Prioridade, "Limpar filtros" e "Lembrar filtro".
 *
 * Substitui o painel "Filtros" escondido atrás de um botão: filtro que a pessoa
 * não vê ligado é o "o board está vazio, o time parou de trabalhar".
 *
 * O estado mora em `useBoardFilters` (URL + memória); aqui só se desenha e se
 * chamam as ações dele. Os botões têm 32px de desenho e 44px de alvo (a área
 * de clique passa 6px para cima e para baixo, sem empurrar o board para baixo).
 */
import { computed, ref } from 'vue'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemIndicator,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { Bookmark, Check, ChevronDown, Search, X } from 'lucide-vue-next'
import { tagColorVar } from '@/components/ui/tag-palette'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import { ACTIVITY_PRIORITIES } from '../task-meta'
import type { BoardFilters, BoardPerson, QuickFilterName } from '../composables/useBoardFilters'

const props = defineProps<{ filters: BoardFilters }>()

/**
 * Rostos à vista; o resto cabe no "+N". Cinco é o que deixa a toolbar numa
 * linha só em 1440 mesmo com "Limpar filtros" à vista (a coluna de 1144px é
 * a largura exata das quatro colunas do board).
 */
const MAX_FACES = 5

const search = ref<HTMLInputElement | null>(null)

const shownPeople = computed(() => props.filters.peopleList.value.slice(0, MAX_FACES))
const hiddenPeople = computed(() => props.filters.peopleList.value.slice(MAX_FACES))
const hiddenOn = computed(() => hiddenPeople.value.filter((p) => props.filters.isPersonOn(p)).length)

const quickChips = computed<{ name: QuickFilterName; label: string; count: number; on: boolean }[]>(() => {
  const f = props.filters
  return [
    { name: 'mine', label: 'Só minhas', count: f.counts.value.mine, on: f.mine.value },
    { name: 'late', label: 'Atrasadas', count: f.counts.value.late, on: f.late.value },
    { name: 'recent', label: 'Atualizadas 24h', count: f.counts.value.recent, on: f.recent.value },
    { name: 'nobody', label: 'Sem responsável', count: f.counts.value.nobody, on: f.nobody.value },
  ]
})

// Prioridade do maior para o menor: é o que se procura primeiro.
const priorityItems = computed(() =>
  [...ACTIVITY_PRIORITIES].reverse().map((p) => ({
    ...p,
    count: props.filters.priorityCounts.value[p.value] ?? 0,
    on: props.filters.priorities.value.includes(p.value),
  })),
)

const personLabel = (p: BoardPerson) =>
  `${p.name}, ${p.count} ${p.count === 1 ? 'tarefa' : 'tarefas'}`

function onSearchInput(event: Event) {
  props.filters.setQuery((event.target as HTMLInputElement).value)
}

/** Esc na busca: limpa o texto; com o campo já vazio, devolve o foco ao board. */
function onSearchEscape(event: KeyboardEvent) {
  event.stopPropagation()
  if (props.filters.q.value) props.filters.setQuery('')
  else search.value?.blur()
}

/** O menu fica aberto entre um clique e outro: marcar três tags é um gesto só. */
function keepOpen(event: Event) {
  event.preventDefault()
}

defineExpose({
  focusSearch: () => {
    search.value?.focus()
    search.value?.select()
  },
})
</script>

<template>
  <div class="toolbar" role="toolbar" aria-label="Filtros do board">
    <label class="find hit">
      <Search :size="14" :stroke-width="1.8" class="find__icon" aria-hidden="true" />
      <input
        ref="search"
        type="search"
        class="find__input"
        placeholder="Título ou chave"
        aria-label="Filtrar tarefas por título ou chave"
        aria-keyshortcuts="/"
        :value="filters.q.value"
        @input="onSearchInput"
        @keydown.esc="onSearchEscape"
      />
      <kbd v-if="!filters.q.value" class="kbd" aria-hidden="true">/</kbd>
      <button
        v-else
        type="button"
        class="find__clear"
        aria-label="Limpar a busca"
        @click="filters.setQuery('')"
      >
        <X :size="14" :stroke-width="1.8" />
      </button>
    </label>

    <div v-if="filters.peopleList.value.length" class="faces" role="group" aria-label="Filtrar por pessoa">
      <button
        v-for="person in shownPeople"
        :key="person.key"
        type="button"
        class="face hit"
        :class="{ 'face--on': filters.isPersonOn(person) }"
        :aria-pressed="filters.isPersonOn(person)"
        :aria-label="`Filtrar por ${personLabel(person)}`"
        :title="personLabel(person)"
        @click="filters.togglePerson(person)"
      >
        <PersonAvatar :id="person.key" :name="person.name" :size="28" decorative />
      </button>

      <DropdownMenuRoot v-if="hiddenPeople.length">
        <DropdownMenuTrigger as-child>
          <button
            type="button"
            class="face face--more hit"
            :class="{ 'face--on': hiddenOn > 0 }"
            :aria-label="`Mais ${hiddenPeople.length} ${hiddenPeople.length === 1 ? 'pessoa' : 'pessoas'}`"
            :title="hiddenPeople.map((p) => p.name).join(', ')"
          >
            +{{ hiddenPeople.length }}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent class="dd-menu board-filter-menu" :side-offset="6" align="start">
            <DropdownMenuCheckboxItem
              v-for="person in hiddenPeople"
              :key="person.key"
              class="dd-item filter-item"
              :model-value="filters.isPersonOn(person)"
              @select="(e: Event) => { keepOpen(e); filters.togglePerson(person) }"
            >
              <span class="filter-item__check">
                <DropdownMenuItemIndicator><Check :size="14" :stroke-width="2" /></DropdownMenuItemIndicator>
              </span>
              <PersonAvatar :id="person.key" :name="person.name" :size="20" decorative />
              <span class="filter-item__label">{{ person.name }}</span>
              <span class="filter-item__count">{{ person.count }}</span>
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>
    </div>

    <span class="sep" aria-hidden="true" />

    <button
      v-for="chip in quickChips"
      :key="chip.name"
      type="button"
      class="chip hit"
      :class="{ 'chip--on': chip.on }"
      :aria-pressed="chip.on"
      @click="filters.toggleQuick(chip.name)"
    >
      {{ chip.label }}
      <span class="chip__count">{{ chip.count }}</span>
    </button>

    <DropdownMenuRoot>
      <DropdownMenuTrigger as-child>
        <button
          type="button"
          class="chip hit"
          :class="{ 'chip--on': filters.tags.value.length > 0 }"
          :disabled="!filters.tagList.value.length && !filters.tags.value.length"
          :aria-label="filters.tags.value.length ? `Tags, ${filters.tags.value.length} marcadas` : 'Tags'"
        >
          Tags
          <span v-if="filters.tags.value.length" class="chip__count">{{ filters.tags.value.length }}</span>
          <ChevronDown :size="14" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent class="dd-menu board-filter-menu" :side-offset="6" align="start">
          <p class="filter-menu__hint">Mostra o que tem todas as tags marcadas</p>
          <DropdownMenuCheckboxItem
            v-for="tag in filters.tagList.value"
            :key="tag.slug"
            class="dd-item filter-item"
            :model-value="filters.tags.value.includes(tag.slug)"
            @select="(e: Event) => { keepOpen(e); filters.toggleTag(tag.slug) }"
          >
            <span class="filter-item__check">
              <DropdownMenuItemIndicator><Check :size="14" :stroke-width="2" /></DropdownMenuItemIndicator>
            </span>
            <span class="tag-dot" :style="{ '--tc': tagColorVar(tag) }" aria-hidden="true" />
            <span class="filter-item__label">{{ tag.name }}</span>
            <span class="filter-item__count">{{ tag.count }}</span>
          </DropdownMenuCheckboxItem>
          <template v-if="filters.tags.value.length">
            <DropdownMenuSeparator class="dd-sep" />
            <DropdownMenuItem class="dd-item filter-item" @select="filters.clearTags()">
              <span class="filter-item__check" />
              <span class="filter-item__label">Desmarcar tags</span>
            </DropdownMenuItem>
          </template>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>

    <DropdownMenuRoot>
      <DropdownMenuTrigger as-child>
        <button
          type="button"
          class="chip hit"
          :class="{ 'chip--on': filters.priorities.value.length > 0 }"
          :aria-label="
            filters.priorities.value.length
              ? `Prioridade, ${filters.priorities.value.length} marcadas`
              : 'Prioridade'
          "
        >
          Prioridade
          <span v-if="filters.priorities.value.length" class="chip__count">
            {{ filters.priorities.value.length }}
          </span>
          <ChevronDown :size="14" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent class="dd-menu board-filter-menu" :side-offset="6" align="start">
          <DropdownMenuCheckboxItem
            v-for="p in priorityItems"
            :key="p.value"
            class="dd-item filter-item"
            :model-value="p.on"
            @select="(e: Event) => { keepOpen(e); filters.togglePriority(p.value) }"
          >
            <span class="filter-item__check">
              <DropdownMenuItemIndicator><Check :size="14" :stroke-width="2" /></DropdownMenuItemIndicator>
            </span>
            <component :is="p.icon" :size="14" />
            <span class="filter-item__label">{{ p.label }}</span>
            <span class="filter-item__count">{{ p.count }}</span>
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>

    <span class="spacer" />

    <button
      v-if="filters.activeCount.value > 0"
      type="button"
      class="ghost hit"
      @click="filters.clear()"
    >
      Limpar filtros
    </button>

    <!-- Memória do recorte. Fica à vista na toolbar, e não em Configurações:
         filtro que persiste sem a pessoa lembrar que ligou vira "o board está
         vazio". Ligado, os chips marcados já mostram o que foi restaurado. -->
    <button
      type="button"
      class="icon-toggle hit"
      :class="{ 'icon-toggle--on': filters.remember.value }"
      :aria-pressed="filters.remember.value"
      aria-label="Lembrar filtro"
      :title="
        filters.remember.value
          ? 'Lembrar filtro: ligado. Este recorte volta na próxima vez. Desligar limpa o filtro.'
          : 'Lembrar filtro: guardar este recorte para não refazê-lo toda vez'
      "
      @click="filters.toggleRemember()"
    >
      <Bookmark
        :size="15"
        :stroke-width="1.8"
        :fill="filters.remember.value ? 'currentColor' : 'none'"
        aria-hidden="true"
      />
    </button>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 6px;
  min-width: 0;
}

/* 32px de desenho, 44px de alvo: a área de clique cresce 6px para cima e para
   baixo da borda sem ocupar altura no layout (spec, acessibilidade 50+). O
   ::after se mede pela caixa de padding, então com borda de 1px são 7px. */
.hit {
  position: relative;
}

.hit::after {
  content: '';
  position: absolute;
  inset: -7px 0;
}

/* ── Busca ── */
.find {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 160px;
  height: 32px;
  padding: 0 6px 0 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-3);
  cursor: text;
  flex: none;
}

.find:hover {
  border-color: var(--border-strong);
}

.find:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
}

.find__icon {
  flex: none;
}

.find__input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
}

.find__input::placeholder {
  color: var(--text-3);
}

/* O "x" nativo do type=search some: o nosso tem alvo e rótulo. */
.find__input::-webkit-search-cancel-button {
  display: none;
}

.find__clear {
  position: relative;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  flex: none;
}

.find__clear::after {
  content: '';
  position: absolute;
  inset: -10px;
}

.find__clear:hover {
  color: var(--text);
  background: var(--surface-2);
}

.kbd {
  flex: none;
  min-width: 18px;
  padding: 0 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 16px;
  text-align: center;
  color: var(--text-3);
}

/* ── Pessoas: discos sobrepostos, anel na cor do fundo ── */
.faces {
  display: flex;
  align-items: center;
  padding-left: 4px;
  flex: none;
}

/* O botão é o alvo e o anel; quem pinta o rosto (foto ou iniciais de 12px no
   tom) é o PersonAvatar de 28px dentro dele. */
.face {
  width: 28px;
  height: 28px;
  margin-left: -4px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  box-shadow: 0 0 0 2px var(--bg);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}

/* Disco de 28px: a área de clique cresce 8px para fechar a faixa de 44px. */
.face.hit::after {
  inset: -8px 0;
}

.face:hover {
  z-index: 1;
}

.face--on {
  z-index: 2;
  box-shadow:
    0 0 0 2px var(--bg),
    0 0 0 4px var(--accent);
}

.face--more {
  background: var(--surface-3);
  color: var(--text-2);
}

.face:focus-visible {
  z-index: 3;
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.sep {
  width: 1px;
  height: 20px;
  margin: 0 2px;
  background: var(--border);
  flex: none;
}

/* ── Chips e gatilhos de menu ── */
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-2);
  font: inherit;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
  flex: none;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.chip:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text);
}

.chip:disabled {
  cursor: default;
  opacity: 0.6;
}

.chip__count {
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

/* Ligado: seleção = fundo accent a 10% + borda accent (princípios da spec). */
.chip--on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  color: var(--text);
}

.chip:focus-visible,
.ghost:focus-visible,
.icon-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.spacer {
  flex: 1 1 0;
  min-width: 0;
}

.ghost {
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  font: inherit;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
  flex: none;
}

/* Sem borda: 6px já fecham os 44px. */
.ghost.hit::after {
  inset: -6px 0;
}

.ghost:hover {
  color: var(--text);
  background: var(--surface-2);
}

.icon-toggle {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  flex: none;
}

.icon-toggle::after {
  inset: -7px;
}

.icon-toggle:hover {
  color: var(--text);
  background: var(--surface-2);
}

.icon-toggle--on,
.icon-toggle--on:hover {
  color: var(--accent);
}

@media (prefers-reduced-motion: reduce) {
  .chip {
    transition: none;
  }
}
</style>

<!-- Global: o menu é portalado para o <body>. O skin vem de styles/menus.css;
     aqui só a largura e a anatomia da linha (check, marca, nome, contagem). -->
<style>
.board-filter-menu {
  min-width: 220px;
  max-height: min(420px, 70vh);
  overflow-y: auto;
}

.board-filter-menu .filter-item {
  min-height: 32px;
  padding: 6px 10px 6px 6px;
  font-size: 13px;
}

.board-filter-menu .filter-item__check {
  display: grid;
  place-items: center;
  width: 16px;
  flex: none;
  color: var(--accent);
}

.board-filter-menu .filter-item__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board-filter-menu .filter-item__count {
  color: var(--text-3);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.board-filter-menu .tag-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--tc);
  flex: none;
}

.board-filter-menu .filter-menu__hint {
  margin: 2px 6px 4px;
  font-size: 12px;
  line-height: 16px;
  color: var(--text-3);
}
</style>
