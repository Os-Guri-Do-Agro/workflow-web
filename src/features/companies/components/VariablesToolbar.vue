<script setup lang="ts">
import { Search, X, Plus, Download, ListTree, LayoutGrid } from 'lucide-vue-next'

type VarType = 'TEXT' | 'URL' | 'SECRET'
type ViewMode = 'list' | 'grid'
type SortKey = 'name' | 'updated' | 'fields'

const props = defineProps<{
  search: string
  typeFilter: VarType | 'ALL'
  sort: SortKey
  view: ViewMode
  total: number
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  'update:typeFilter': [value: VarType | 'ALL']
  'update:sort': [value: SortKey]
  'update:view': [value: ViewMode]
  create: []
  'export-all': []
  'copy-all': []
}>()

const typeOptions: { value: VarType | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'TEXT', label: 'Texto' },
  { value: 'URL', label: 'URL' },
  { value: 'SECRET', label: 'Secreto' },
]

const sortOptions: { value: SortKey; label: string }[] = [
  { value: 'name', label: 'Nome' },
  { value: 'updated', label: 'Mais recente' },
  { value: 'fields', label: 'Mais campos' },
]

const clearSearch = () => emit('update:search', '')

const onSearchInput = (e: Event) => {
  emit('update:search', (e.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="vars-toolbar">
    <div class="search-wrap">
      <Search :size="14" class="search-icon" />
      <input
        :value="search"
        type="text"
        class="search-input"
        placeholder="Buscar variáveis e chaves…  /"
        @input="onSearchInput"
      />
      <button v-if="search" class="search-clear" @click="clearSearch">
        <X :size="12" />
      </button>
    </div>

    <div class="type-filter">
      <button
        v-for="opt in typeOptions"
        :key="opt.value"
        class="chip-btn"
        :class="{ 'chip-btn--active': typeFilter === opt.value }"
        @click="emit('update:typeFilter', opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>

    <div class="toolbar-spacer" />

    <div class="toolbar-right">
      <select
        class="sort-select"
        :value="sort"
        @change="emit('update:sort', ($event.target as HTMLSelectElement).value as SortKey)"
      >
        <option v-for="s in sortOptions" :key="s.value" :value="s.value">
          Ordenar: {{ s.label }}
        </option>
      </select>

      <div class="view-toggle">
        <button
          class="view-btn"
          :class="{ 'view-btn--active': view === 'list' }"
          title="Lista"
          @click="emit('update:view', 'list')"
        >
          <ListTree :size="14" />
        </button>
        <button
          class="view-btn"
          :class="{ 'view-btn--active': view === 'grid' }"
          title="Grid"
          @click="emit('update:view', 'grid')"
        >
          <LayoutGrid :size="14" />
        </button>
      </div>

      <v-menu location="bottom end">
        <template #activator="{ props: menuProps }">
          <button v-bind="menuProps" class="secondary-btn" :disabled="total === 0">
            <Download :size="14" />
            <span>Exportar</span>
          </button>
        </template>
        <v-card class="menu-card" rounded="lg" elevation="0">
          <v-list density="compact" class="py-1">
            <v-list-item density="compact" @click="emit('export-all')">
              <v-list-item-title class="menu-title">Baixar .env</v-list-item-title>
              <v-list-item-subtitle class="menu-sub">Arquivo com todas as variáveis</v-list-item-subtitle>
            </v-list-item>
            <v-list-item density="compact" @click="emit('copy-all')">
              <v-list-item-title class="menu-title">Copiar .env</v-list-item-title>
              <v-list-item-subtitle class="menu-sub">Para a área de transferência</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </v-card>
      </v-menu>

      <button class="primary-btn" @click="emit('create')">
        <Plus :size="14" />
        <span>Nova variável</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.vars-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 0;
  background: var(--bg);
  position: sticky;
  top: 0;
  z-index: 5;
}

.search-wrap {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 10px;
  min-width: 280px;
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.search-wrap:focus-within {
  border-color: var(--border-strong);
}

.search-icon {
  color: var(--text-3);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text);
  font-size: 12.5px;
  font-family: inherit;
}

.search-input::placeholder {
  color: var(--text-3);
}

.search-clear {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-3);
  padding: 2px;
  border-radius: 4px;
  display: inline-flex;
  transition: background var(--motion-fast) var(--motion-ease);
}

.search-clear:hover {
  background: var(--surface-2);
  color: var(--text);
}

.type-filter {
  display: inline-flex;
  gap: 4px;
  background: var(--surface);
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.chip-btn {
  padding: 4px 10px;
  background: transparent;
  border: none;
  border-radius: 5px;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-3);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.chip-btn:hover {
  color: var(--text-2);
}

.chip-btn--active {
  background: var(--surface-3);
  color: var(--text);
}

.toolbar-spacer {
  flex: 1;
}

.toolbar-right {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.sort-select {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 10px;
  font-family: inherit;
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
  outline: none;
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.sort-select:hover {
  border-color: var(--border-strong);
}

.view-toggle {
  display: inline-flex;
  gap: 2px;
  background: var(--surface);
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.view-btn {
  width: 28px;
  height: 26px;
  background: transparent;
  border: none;
  border-radius: 5px;
  color: var(--text-3);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.view-btn:hover {
  color: var(--text-2);
}

.view-btn--active {
  background: var(--surface-3);
  color: var(--text);
}

.secondary-btn,
.primary-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 32px;
  border-radius: 8px;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    opacity var(--motion-fast) var(--motion-ease);
}

.secondary-btn {
  background: var(--surface);
  color: var(--text-2);
  border: 1px solid var(--border);
}

.secondary-btn:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text);
  border-color: var(--border-strong);
}

.secondary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.primary-btn {
  background: var(--text);
  color: var(--bg);
  border: none;
}

.primary-btn:hover {
  opacity: 0.92;
}

.menu-card {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
  box-shadow: var(--shadow-overlay) !important;
}

.menu-title {
  font-size: 12.5px;
  color: var(--text);
}

.menu-sub {
  font-size: 11px;
  color: var(--text-3);
}
</style>
