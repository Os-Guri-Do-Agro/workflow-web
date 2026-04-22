<script setup lang="ts">
import { computed } from 'vue'
import { MoreHorizontal, Pencil, Trash2, Download, Copy, Image as ImageIcon } from 'lucide-vue-next'
import VariableTypeChip from './VariableTypeChip.vue'

type VarType = 'TEXT' | 'URL' | 'SECRET'

interface VariableField {
  key: string
  value: string
  type: VarType
}

interface Variable {
  id?: string
  name: string
  description?: string
  imageUrl?: string
  fields: VariableField[]
  updatedAt?: string
  updatedBy?: { id?: string; name?: string }
}

const props = defineProps<{
  variable: Variable
  selected?: boolean
}>()

const emit = defineEmits<{
  open: [variable: Variable]
  edit: [variable: Variable]
  delete: [id: string]
  export: [variable: Variable]
  copy: [variable: Variable]
}>()

const typeCounts = computed(() => {
  const counts: Record<VarType, number> = { TEXT: 0, URL: 0, SECRET: 0 }
  for (const f of props.variable.fields || []) {
    if (f.type in counts) counts[f.type]++
  }
  return (['SECRET', 'URL', 'TEXT'] as const)
    .map((t) => ({ type: t, count: counts[t] }))
    .filter((x) => x.count > 0)
})

const totalFields = computed(() => props.variable.fields?.length || 0)

const initials = computed(() => props.variable.name.slice(0, 2).toUpperCase())

const updatedRelative = computed(() => {
  const at = props.variable.updatedAt
  if (!at) return '—'
  const diff = Date.now() - new Date(at).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}m atrás`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h atrás`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d atrás`
  return new Date(at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
})

const editorInitials = computed(() => {
  const name = props.variable.updatedBy?.name || ''
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
})
</script>

<template>
  <div class="var-row" :class="{ 'var-row--selected': selected }" @click="emit('open', variable)">
    <div class="row-icon">
      <img v-if="variable.imageUrl" :src="variable.imageUrl" class="row-img" alt="" />
      <div v-else class="row-avatar">
        <ImageIcon :size="14" class="row-avatar-fallback" />
        <span class="row-avatar-initials">{{ initials }}</span>
      </div>
    </div>

    <div class="row-main">
      <div class="row-name">{{ variable.name }}</div>
      <div v-if="variable.description" class="row-desc">{{ variable.description }}</div>
    </div>

    <div class="row-types">
      <VariableTypeChip
        v-for="t in typeCounts"
        :key="t.type"
        :type="t.type"
        :count="t.count"
        :show-label="false"
      />
    </div>

    <div class="row-fields">
      <span class="row-fields-count">{{ totalFields }}</span>
      <span class="row-fields-label">{{ totalFields === 1 ? 'campo' : 'campos' }}</span>
    </div>

    <div class="row-updated">
      <div v-if="editorInitials" class="row-avatar-small">{{ editorInitials }}</div>
      <span class="row-updated-text">{{ updatedRelative }}</span>
    </div>

    <div class="row-actions" @click.stop>
      <v-menu location="bottom end">
        <template #activator="{ props: menuProps }">
          <button v-bind="menuProps" class="row-action-btn">
            <MoreHorizontal :size="15" />
          </button>
        </template>
        <v-card class="row-menu" rounded="lg" elevation="0">
          <v-list density="compact" class="py-1">
            <v-list-item density="compact" @click="emit('edit', variable)">
              <template #prepend>
                <Pencil :size="14" class="menu-icon" />
              </template>
              <v-list-item-title class="menu-title">Editar</v-list-item-title>
            </v-list-item>
            <v-list-item density="compact" @click="emit('copy', variable)">
              <template #prepend>
                <Copy :size="14" class="menu-icon" />
              </template>
              <v-list-item-title class="menu-title">Copiar como .env</v-list-item-title>
            </v-list-item>
            <v-list-item density="compact" @click="emit('export', variable)">
              <template #prepend>
                <Download :size="14" class="menu-icon" />
              </template>
              <v-list-item-title class="menu-title">Baixar .env</v-list-item-title>
            </v-list-item>
            <v-divider class="my-1" />
            <v-list-item
              density="compact"
              :disabled="!variable.id"
              @click="variable.id && emit('delete', variable.id)"
            >
              <template #prepend>
                <Trash2 :size="14" class="menu-icon menu-icon--danger" />
              </template>
              <v-list-item-title class="menu-title menu-title--danger">Excluir</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card>
      </v-menu>
    </div>
  </div>
</template>

<style scoped>
.var-row {
  display: grid;
  grid-template-columns: 40px 1fr 160px 90px 140px 36px;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background var(--motion-fast) var(--motion-ease);
  min-height: 56px;
}

.var-row:hover {
  background: var(--surface-2);
}

.var-row:last-child {
  border-bottom: none;
}

.var-row--selected {
  background: var(--surface-2);
}

.row-icon {
  position: relative;
}

.row-img {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.row-avatar {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
  position: relative;
  overflow: hidden;
}

.row-avatar-fallback {
  position: absolute;
  opacity: 0.25;
}

.row-avatar-initials {
  font-size: 11px;
  font-weight: 700;
  color: var(--text);
  z-index: 1;
}

.row-main {
  min-width: 0;
}

.row-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-desc {
  font-size: 11.5px;
  color: var(--text-3);
  line-height: 1.35;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-types {
  display: inline-flex;
  gap: 4px;
  flex-wrap: nowrap;
}

.row-fields {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  color: var(--text-2);
}

.row-fields-count {
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

.row-fields-label {
  font-size: 11px;
  color: var(--text-3);
}

.row-updated {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.row-avatar-small {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--surface-3);
  border: 1px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9.5px;
  font-weight: 700;
  color: var(--text);
}

.row-updated-text {
  font-size: 11.5px;
  color: var(--text-3);
}

.row-action-btn {
  width: 30px;
  height: 30px;
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: 6px;
  color: var(--text-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.row-action-btn:hover {
  background: var(--surface-3);
  color: var(--text);
}

.row-menu {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
  box-shadow: var(--shadow-overlay) !important;
}

.menu-icon {
  color: var(--text-3);
  margin-right: 4px;
}

.menu-icon--danger {
  color: var(--err);
}

.menu-title {
  font-size: 12.5px;
  color: var(--text);
}

.menu-title--danger {
  color: var(--err);
}
</style>
