<script setup lang="ts">
/**
 * Navegação da tela de QR: busca no topo, projetos abaixo, pastas dentro do
 * projeto a que pertencem.
 *
 * ## Por que a pasta é filha do projeto aqui
 *
 * `QrFolder` já carrega `companyId` — o vínculo existe no dado. A versão
 * anterior achatava isso numa fileira de chips no meio do conteúdo, e com 8
 * pastas a fileira quebrava em duas linhas e a pessoa precisava saber de cabeça
 * que `prod-pets` era da PetJourney. Aninhar mostra o que já era verdade.
 *
 * ## Hierarquia sem `border-left`
 *
 * A leitura de nível vem de indentação, tamanho e peso. Régua vertical à
 * esquerda é ruído: some no tema claro, briga com o estado ativo e não sobrevive
 * a um nível a mais.
 */
import { computed, ref } from 'vue'
import {
  Building2,
  ChevronRight,
  Folder,
  FolderPlus,
  Layers,
  Search,
  Trash2,
  User,
  X,
} from 'lucide-vue-next'
import type { QrFolder, QrScopeCount } from '@/service/qr/qr-service'

const props = defineProps<{
  /** Projetos com a contagem TOTAL de cada um (não a da página). */
  scopes: QrScopeCount[]
  /** Total geral, para a entrada "Todos". */
  totalAll: number
  folders: QrFolder[]
  activeScope: string
  activeFolderId: string
  search: string
  /** Pode criar/excluir pasta no escopo ativo. */
  canManageFolders: boolean
  creatingFolder: boolean
  savingFolder: boolean
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  'update:activeScope': [value: string]
  'update:activeFolderId': [value: string]
  'create-folder': [name: string]
  'remove-folder': [folder: QrFolder]
  'toggle-create': [value: boolean]
}>()

const newFolderName = ref('')

/** Pastas de um projeto. `personal` casa por escopo; empresa, por id. */
function foldersOf(key: string): QrFolder[] {
  if (key === 'personal') return props.folders.filter((f) => f.scope === 'personal')
  return props.folders.filter((f) => f.companyId === key)
}

/**
 * Só o projeto selecionado abre. Manter todos abertos com 8 pastas cada
 * transformaria a coluna numa lista rolável sem hierarquia legível.
 */
const expanded = computed(() => props.activeScope)

function selectScope(key: string) {
  emit('update:activeScope', key)
  emit('update:activeFolderId', 'all')
}

function selectFolder(key: string, folderId: string) {
  if (props.activeScope !== key) emit('update:activeScope', key)
  emit('update:activeFolderId', folderId)
}

function submitFolder() {
  const name = newFolderName.value.trim()
  if (!name) return
  emit('create-folder', name)
  newFolderName.value = ''
}
</script>

<template>
  <aside class="qs" aria-label="Filtros de QR codes">
    <!-- Busca: primeira coisa da coluna porque com centenas de QRs é o caminho
         mais curto até um item específico. -->
    <div class="qs-search">
      <Search :size="15" class="qs-search-icon" aria-hidden="true" />
      <input
        :value="search"
        class="qs-search-input"
        type="search"
        placeholder="Buscar nome ou destino"
        aria-label="Buscar QR codes por nome ou destino"
        @input="emit('update:search', ($event.target as HTMLInputElement).value)"
      />
      <button
        v-if="search"
        type="button"
        class="qs-search-clear"
        aria-label="Limpar busca"
        @click="emit('update:search', '')"
      >
        <X :size="13" />
      </button>
    </div>

    <nav class="qs-nav">
      <!-- Todos -->
      <button
        type="button"
        class="qs-item qs-item--root"
        :class="{ 'qs-item--active': activeScope === 'all' }"
        :aria-current="activeScope === 'all' ? 'true' : undefined"
        @click="selectScope('all')"
      >
        <Layers :size="15" class="qs-item-icon" />
        <span class="qs-item-label">Todos</span>
        <span class="qs-count">{{ totalAll }}</span>
      </button>

      <!-- Um bloco por projeto, com as pastas dele dentro -->
      <div v-for="scope in scopes" :key="scope.key" class="qs-group">
        <button
          type="button"
          class="qs-item qs-item--root"
          :class="{ 'qs-item--active': activeScope === scope.key && activeFolderId === 'all' }"
          :aria-expanded="expanded === scope.key"
          @click="selectScope(scope.key)"
        >
          <ChevronRight
            :size="13"
            class="qs-chevron"
            :class="{ 'qs-chevron--open': expanded === scope.key }"
            aria-hidden="true"
          />
          <component
            :is="scope.key === 'personal' ? User : Building2"
            :size="14"
            class="qs-item-icon"
          />
          <span class="qs-item-label">{{ scope.label }}</span>
          <span class="qs-count">{{ scope.count }}</span>
        </button>

        <div v-if="expanded === scope.key" class="qs-children">
          <button
            v-for="folder in foldersOf(scope.key)"
            :key="folder.id"
            type="button"
            class="qs-item qs-item--child"
            :class="{ 'qs-item--active': activeFolderId === folder.id }"
            @click="selectFolder(scope.key, folder.id)"
          >
            <Folder :size="13" class="qs-item-icon" />
            <span class="qs-item-label">{{ folder.name }}</span>
            <span class="qs-count">{{ folder.qrCount }}</span>
            <span
              v-if="canManageFolders"
              class="qs-del"
              role="button"
              tabindex="0"
              :aria-label="`Excluir pasta ${folder.name}`"
              @click.stop="emit('remove-folder', folder)"
              @keydown.enter.stop="emit('remove-folder', folder)"
            >
              <Trash2 :size="12" />
            </span>
          </button>

          <button
            type="button"
            class="qs-item qs-item--child"
            :class="{ 'qs-item--active': activeFolderId === 'none' }"
            @click="selectFolder(scope.key, 'none')"
          >
            <Folder :size="13" class="qs-item-icon qs-item-icon--muted" />
            <span class="qs-item-label qs-item-label--muted">Sem pasta</span>
          </button>

          <!-- Criar pasta vive DENTRO do projeto: é o que define o escopo dela. -->
          <template v-if="canManageFolders">
            <form v-if="creatingFolder" class="qs-new" @submit.prevent="submitFolder">
              <input
                v-model="newFolderName"
                class="qs-new-input"
                placeholder="Nome da pasta"
                maxlength="80"
                aria-label="Nome da nova pasta"
                autofocus
              />
              <button
                type="submit"
                class="qs-new-ok"
                :disabled="!newFolderName.trim() || savingFolder"
              >
                Criar
              </button>
              <button
                type="button"
                class="qs-new-x"
                aria-label="Cancelar criação de pasta"
                @click="emit('toggle-create', false); newFolderName = ''"
              >
                <X :size="13" />
              </button>
            </form>
            <button
              v-else
              type="button"
              class="qs-item qs-item--child qs-item--add"
              @click="emit('toggle-create', true)"
            >
              <FolderPlus :size="13" class="qs-item-icon" />
              <span class="qs-item-label">Nova pasta</span>
            </button>
          </template>
        </div>
      </div>
    </nav>
  </aside>
</template>

<style scoped>
.qs {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

/* ─── Busca ─────────────────────────────────────────────────────────────── */
.qs-search {
  position: relative;
  display: flex;
  align-items: center;
}

.qs-search-icon {
  position: absolute;
  left: 10px;
  color: var(--text-4);
  pointer-events: none;
}

.qs-search-input {
  width: 100%;
  min-height: 38px;
  padding: 0 30px 0 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.qs-search-input::placeholder {
  color: var(--text-4);
}

.qs-search-input:focus {
  outline: none;
  background: var(--surface);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}

/* O X nativo do type=search some: some junto com o nosso e duplica o controle. */
.qs-search-input::-webkit-search-cancel-button {
  display: none;
}

.qs-search-clear {
  position: absolute;
  right: 8px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--text-3);
  cursor: pointer;
}

.qs-search-clear:hover {
  color: var(--text);
}

/* ─── Navegação ─────────────────────────────────────────────────────────── */
.qs-nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.qs-group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.qs-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.qs-item:hover {
  background: var(--surface-2);
  color: var(--text);
}

.qs-item--root {
  font-weight: 620;
}

/* Hierarquia por recuo e peso, não por régua vertical. */
.qs-item--child {
  padding-left: 30px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-3);
}

.qs-item--active {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  border-color: color-mix(in srgb, var(--accent) 38%, transparent);
  color: var(--accent);
  font-weight: 660;
}

.qs-item--add {
  color: var(--text-4);
}

.qs-item-icon {
  flex-shrink: 0;
}

.qs-item-icon--muted,
.qs-item-label--muted {
  opacity: 0.7;
}

.qs-item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qs-chevron {
  flex-shrink: 0;
  color: var(--text-4);
  transition: transform var(--motion-fast) var(--motion-ease);
}

.qs-chevron--open {
  transform: rotate(90deg);
}

/* O "Todos" não tem chevron; o recuo compensa para os rótulos alinharem. */
.qs-item--root:first-child .qs-item-icon {
  margin-left: 21px;
}

.qs-count {
  flex-shrink: 0;
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--text-3);
  font-size: 10.5px;
  font-weight: 700;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.qs-item--active .qs-count {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  color: var(--accent);
}

.qs-del {
  display: none;
  place-items: center;
  flex-shrink: 0;
  padding: 3px;
  border-radius: 999px;
  color: var(--text-4);
}

.qs-item:hover .qs-del,
.qs-item--active .qs-del {
  display: grid;
}

.qs-del:hover {
  color: var(--err);
  background: color-mix(in srgb, var(--err) 14%, transparent);
}

/* Some o contador quando a lixeira aparece: dois elementos na mesma borda
   direita empurram o nome da pasta e cortam o texto. */
.qs-item:hover .qs-count {
  display: none;
}

.qs-children {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-bottom: 4px;
}

/* ─── Criar pasta ───────────────────────────────────────────────────────── */
.qs-new {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0 2px 30px;
}

.qs-new-input {
  flex: 1;
  min-width: 0;
  min-height: 30px;
  padding: 0 8px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
}

.qs-new-input:focus {
  outline: none;
}

.qs-new-ok {
  min-height: 30px;
  padding: 0 9px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-fg);
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
}

.qs-new-ok:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.qs-new-x {
  display: grid;
  place-items: center;
  width: 26px;
  height: 30px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-4);
  cursor: pointer;
}

.qs-new-x:hover {
  color: var(--text);
}

@media (prefers-reduced-motion: reduce) {
  .qs-item,
  .qs-chevron,
  .qs-search-input {
    transition-duration: 1ms;
  }
}
</style>
