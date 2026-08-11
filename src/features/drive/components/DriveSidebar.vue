<script setup lang="ts">
/**
 * Navegação do Drive: dois espaços (Pessoal e a empresa ativa) com a árvore de
 * pastas de cada um. Anatomia herdada do `QrSidebar`; hierarquia por
 * indentação e peso tipográfico, sem `border-left` (convenção do projeto).
 *
 * Ações de pasta (subpasta/mover/renomear/excluir) aparecem no hover/foco e
 * respeitam a permissão do espaço: pessoal = sempre; empresa = só ADMIN.
 */
import { ref } from 'vue'
import { Building2, FolderPlus, User } from 'lucide-vue-next'
import DriveSidebarRow from './DriveSidebarRow.vue'
import type { DriveFolderNode, DriveScope } from '@/features/drive/types'

defineProps<{
  activeScope: DriveScope
  activeFolderId: string | null
  personalTree: DriveFolderNode[]
  companyTree: DriveFolderNode[]
  personalCount: number
  companyCount: number
  companyName: string | null
  /** Sem empresa ativa: o espaço da empresa aparece desabilitado. */
  hasCompany: boolean
  canManagePersonal: boolean
  canManageCompany: boolean
}>()

const emit = defineEmits<{
  select: [scope: DriveScope, folderId: string | null]
  'create-folder': [scope: DriveScope, parentId: string | null]
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
            'ds-item--active': activeScope === 'personal' && activeFolderId === null,
          }"
          @click="emit('select', 'personal', null)"
        >
          <User :size="14" class="ds-item-icon" />
          <span class="ds-item-label">Pessoal</span>
          <span class="ds-count">{{ personalCount }}</span>
        </button>
        <button
          v-if="canManagePersonal"
          type="button"
          class="ds-add press"
          aria-label="Nova pasta pessoal"
          title="Nova pasta"
          @click="emit('create-folder', 'personal', null)"
        >
          <FolderPlus :size="14" />
        </button>
      </div>

      <DriveSidebarRow
        v-for="node in personalTree"
        :key="node.id"
        :node="node"
        :active-folder-id="activeScope === 'personal' ? activeFolderId : null"
        :collapsed="collapsed"
        :can-manage="canManagePersonal"
        @select="(id) => emit('select', 'personal', id)"
        @toggle="toggle"
        @create="(id) => emit('create-folder', 'personal', id)"
        @rename="(f) => emit('rename-folder', f)"
        @move="(f) => emit('move-folder', f)"
        @remove="(f) => emit('delete-folder', f)"
      />
    </div>

    <!-- ─── Empresa ativa ───────────────────────────────────────────────── -->
    <div class="ds-group">
      <div class="ds-rootline">
        <button
          type="button"
          class="ds-item ds-item--root"
          :class="{
            'ds-item--active': activeScope === 'company' && activeFolderId === null,
          }"
          :disabled="!hasCompany"
          :title="hasCompany ? undefined : 'Selecione uma empresa para usar este espaço'"
          @click="emit('select', 'company', null)"
        >
          <Building2 :size="14" class="ds-item-icon" />
          <span class="ds-item-label">{{ companyName ?? 'Empresa' }}</span>
          <span v-if="hasCompany" class="ds-count">{{ companyCount }}</span>
        </button>
        <button
          v-if="hasCompany && canManageCompany"
          type="button"
          class="ds-add press"
          aria-label="Nova pasta da empresa"
          title="Nova pasta"
          @click="emit('create-folder', 'company', null)"
        >
          <FolderPlus :size="14" />
        </button>
      </div>

      <DriveSidebarRow
        v-for="node in companyTree"
        :key="node.id"
        :node="node"
        :active-folder-id="activeScope === 'company' ? activeFolderId : null"
        :collapsed="collapsed"
        :can-manage="canManageCompany"
        @select="(id) => emit('select', 'company', id)"
        @toggle="toggle"
        @create="(id) => emit('create-folder', 'company', id)"
        @rename="(f) => emit('rename-folder', f)"
        @move="(f) => emit('move-folder', f)"
        @remove="(f) => emit('delete-folder', f)"
      />
    </div>
  </aside>
</template>

<style scoped>
.ds {
  display: flex;
  flex-direction: column;
  gap: 18px;
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

.ds-item:hover:not(:disabled) {
  background: var(--surface-2);
}

.ds-item--active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--text);
}

.ds-item:disabled {
  opacity: 0.45;
  cursor: default;
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
