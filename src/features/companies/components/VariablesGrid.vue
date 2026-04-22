<script setup lang="ts">
import { computed } from 'vue'
import { MoreHorizontal, Pencil, Trash2, Download, Copy, KeyRound } from 'lucide-vue-next'
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
}

defineProps<{
  variables: Variable[]
}>()

const emit = defineEmits<{
  open: [variable: Variable]
  edit: [variable: Variable]
  delete: [id: string]
  export: [variable: Variable]
  copy: [variable: Variable]
}>()

const typeCountsOf = (v: Variable) => {
  const counts: Record<VarType, number> = { TEXT: 0, URL: 0, SECRET: 0 }
  for (const f of v.fields || []) {
    if (f.type in counts) counts[f.type]++
  }
  return (['SECRET', 'URL', 'TEXT'] as const)
    .map((t) => ({ type: t, count: counts[t] }))
    .filter((x) => x.count > 0)
}

const initialsOf = (v: Variable) => v.name.slice(0, 2).toUpperCase()
</script>

<template>
  <div class="grid">
    <article v-for="v in variables" :key="v.id" class="var-card" @click="emit('open', v)">
      <header class="card-head">
        <div class="card-icon">
          <img v-if="v.imageUrl" :src="v.imageUrl" alt="" class="card-img" />
          <div v-else class="card-avatar">{{ initialsOf(v) }}</div>
        </div>
        <div class="card-info">
          <h3 class="card-name">{{ v.name }}</h3>
          <p v-if="v.description" class="card-desc">{{ v.description }}</p>
        </div>
        <div class="card-menu" @click.stop>
          <v-menu location="bottom end">
            <template #activator="{ props: menuProps }">
              <button v-bind="menuProps" class="menu-btn">
                <MoreHorizontal :size="14" />
              </button>
            </template>
            <v-card class="card-menu-popover" rounded="lg" elevation="0">
              <v-list density="compact" class="py-1">
                <v-list-item density="compact" @click="emit('edit', v)">
                  <template #prepend>
                    <Pencil :size="14" class="pop-icon" />
                  </template>
                  <v-list-item-title class="pop-title">Editar</v-list-item-title>
                </v-list-item>
                <v-list-item density="compact" @click="emit('copy', v)">
                  <template #prepend>
                    <Copy :size="14" class="pop-icon" />
                  </template>
                  <v-list-item-title class="pop-title">Copiar .env</v-list-item-title>
                </v-list-item>
                <v-list-item density="compact" @click="emit('export', v)">
                  <template #prepend>
                    <Download :size="14" class="pop-icon" />
                  </template>
                  <v-list-item-title class="pop-title">Baixar .env</v-list-item-title>
                </v-list-item>
                <v-divider class="my-1" />
                <v-list-item
                  density="compact"
                  :disabled="!v.id"
                  @click="v.id && emit('delete', v.id)"
                >
                  <template #prepend>
                    <Trash2 :size="14" class="pop-icon pop-icon--danger" />
                  </template>
                  <v-list-item-title class="pop-title pop-title--danger">Excluir</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-card>
          </v-menu>
        </div>
      </header>

      <div class="card-fields">
        <div v-if="!v.fields?.length" class="card-empty">
          <KeyRound :size="13" />
          <span>Sem campos</span>
        </div>
        <template v-else>
          <div v-for="(field, idx) in v.fields.slice(0, 3)" :key="idx" class="card-field">
            <span class="field-key">{{ field.key }}</span>
            <VariableTypeChip :type="field.type" :show-label="false" />
          </div>
          <div v-if="v.fields.length > 3" class="card-more">+{{ v.fields.length - 3 }} campos</div>
        </template>
      </div>

      <footer class="card-foot">
        <VariableTypeChip
          v-for="t in typeCountsOf(v)"
          :key="t.type"
          :type="t.type"
          :count="t.count"
          :show-label="false"
        />
      </footer>
    </article>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}

.var-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.var-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-1px);
}

.card-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px;
  border-bottom: 1px solid var(--border);
}

.card-icon {
  flex-shrink: 0;
}

.card-img {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  object-fit: cover;
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.card-avatar {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
  color: var(--text);
}

.card-info {
  flex: 1;
  min-width: 0;
}

.card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-desc {
  font-size: 11.5px;
  color: var(--text-3);
  margin: 2px 0 0;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.menu-btn {
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-3);
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  transition: background var(--motion-fast) var(--motion-ease);
}

.menu-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.card-fields {
  flex: 1;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.card-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.field-key {
  font-family: var(--font-mono);
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-more {
  font-size: 11px;
  color: var(--text-4);
  margin-top: 2px;
}

.card-empty {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-4);
  font-size: 11.5px;
  padding: 4px 0;
}

.card-foot {
  display: flex;
  gap: 4px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}

.card-menu-popover {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
  box-shadow: var(--shadow-overlay) !important;
}

.pop-icon {
  color: var(--text-3);
  margin-right: 4px;
}

.pop-icon--danger {
  color: var(--err);
}

.pop-title {
  font-size: 12.5px;
  color: var(--text);
}

.pop-title--danger {
  color: var(--err);
}
</style>
