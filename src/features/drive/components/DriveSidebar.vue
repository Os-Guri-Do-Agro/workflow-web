<script setup lang="ts">
/**
 * Navegação do Drive, modelo QR: Pessoal + TODAS as empresas do usuário, cada
 * uma com contador; clicar numa empresa mostra os arquivos dela sem tocar na
 * empresa ativa do topo. Só o espaço selecionado expande a árvore de pastas
 * (todas abertas viraria uma coluna rolável sem hierarquia legível).
 *
 * Hierarquia por indentação e peso tipográfico, sem `border-left` (convenção
 * do projeto). Ações de pasta no hover/foco, gateadas por permissão do espaço:
 * pessoal = sempre; empresa = só ADMIN daquela empresa.
 */
import { ref } from 'vue'
import { Building2, ChevronRight, FolderPlus, User } from 'lucide-vue-next'
import DriveSidebarRow from './DriveSidebarRow.vue'
import type {
  DriveCompanySection,
  DriveFolderNode,
  DriveScope,
} from '@/features/drive/types'

defineProps<{
  /** 'personal' ou o id da empresa selecionada. */
  activeKey: string
  activeFolderId: string | null
  personalTree: DriveFolderNode[]
  personalCount: number
  companies: DriveCompanySection[]
}>()

const emit = defineEmits<{
  /** scope + companyId (null = pessoal) + pasta. */
  select: [scope: DriveScope, companyId: string | null, folderId: string | null]
  'create-folder': [companyId: string | null, parentId: string | null]
  'rename-folder': [folder: DriveFolderNode]
  'move-folder': [folder: DriveFolderNode]
  'delete-folder': [folder: DriveFolderNode]
}>()

/** Pastas recolhidas (default é aberto: árvore rasa na prática). */
const collapsed = ref(new Set<string>())

function toggle(id: string) {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
}
</script>

<template>
  <aside class="ds" aria-label="Espaços do Drive">
    <!-- ─── Pessoal ─────────────────────────────────────────────────────── -->
    <div class="ds-group">
      <div class="ds-rootline">
        <button
          type="button"
          class="ds-item ds-item--root"
          :class="{
            'ds-item--active': activeKey === 'personal' && activeFolderId === null,
          }"
          :aria-expanded="activeKey === 'personal'"
          @click="emit('select', 'personal', null, null)"
        >
          <User :size="14" class="ds-item-icon" />
          <span class="ds-item-label">Pessoal</span>
          <span class="ds-count">{{ personalCount }}</span>
        </button>
        <button
          type="button"
          class="ds-add press"
          aria-label="Nova pasta pessoal"
          title="Nova pasta"
          @click="emit('create-folder', null, null)"
        >
          <FolderPlus :size="14" />
        </button>
      </div>

      <template v-if="activeKey === 'personal'">
        <DriveSidebarRow
          v-for="node in personalTree"
          :key="node.id"
          :node="node"
          :active-folder-id="activeFolderId"
          :collapsed="collapsed"
          :can-manage="true"
          @select="(id) => emit('select', 'personal', null, id)"
          @toggle="toggle"
          @create="(id) => emit('create-folder', null, id)"
          @rename="(f) => emit('rename-folder', f)"
          @move="(f) => emit('move-folder', f)"
          @remove="(f) => emit('delete-folder', f)"
        />
      </template>
    </div>

    <!-- ─── Uma seção por empresa do usuário ────────────────────────────── -->
    <div v-for="company in companies" :key="company.id" class="ds-group">
      <div class="ds-rootline">
        <button
          type="button"
          class="ds-item ds-item--root"
          :class="{
            'ds-item--active': activeKey === company.id && activeFolderId === null,
          }"
          :aria-expanded="activeKey === company.id"
          @click="emit('select', 'company', company.id, null)"
        >
          <ChevronRight
            :size="13"
            class="ds-chevron"
            :class="{ 'ds-chevron--open': activeKey === company.id }"
            aria-hidden="true"
          />
          <Building2 :size="14" class="ds-item-icon" />
          <span class="ds-item-label">{{ company.name }}</span>
          <span class="ds-count">{{ company.count }}</span>
        </button>
        <button
          v-if="company.canManage"
          type="button"
          class="ds-add press"
          :aria-label="`Nova pasta em ${company.name}`"
          title="Nova pasta"
          @click="emit('create-folder', company.id, null)"
        >
          <FolderPlus :size="14" />
        </button>
      </div>

      <template v-if="activeKey === company.id">
        <DriveSidebarRow
          v-for="node in company.tree"
          :key="node.id"
          :node="node"
          :active-folder-id="activeFolderId"
          :collapsed="collapsed"
          :can-manage="company.canManage"
          @select="(id) => emit('select', 'company', company.id, id)"
          @toggle="toggle"
          @create="(id) => emit('create-folder', company.id, id)"
          @rename="(f) => emit('rename-folder', f)"
          @move="(f) => emit('move-folder', f)"
          @remove="(f) => emit('delete-folder', f)"
        />
      </template>
    </div>
  </aside>
</template>

<style scoped>
.ds {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 240px;
  flex: none;
  padding-right: 14px;
}

.ds-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ds-rootline {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ds-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  padding: 7px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font-size: 12.5px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.ds-item--root {
  font-weight: 600;
  color: var(--text);
}

.ds-item:hover {
  background: var(--surface-2);
}

.ds-item--active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--text);
}

.ds-item-icon {
  flex: none;
  color: var(--text-3);
}

.ds-item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ds-count {
  flex: none;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--surface-2);
  border-radius: 999px;
  padding: 1px 7px;
}

.ds-chevron {
  flex: none;
  color: var(--text-3);
  transition: transform var(--motion-fast) var(--motion-ease);
}

.ds-chevron--open {
  transform: rotate(90deg);
}

.ds-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  flex: none;
}

.ds-add:hover {
  background: var(--surface-2);
  color: var(--text);
}

@media (max-width: 900px) {
  .ds {
    width: 100%;
    padding-right: 0;
  }
}
</style>
