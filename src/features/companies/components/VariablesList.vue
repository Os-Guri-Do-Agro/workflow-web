<script setup lang="ts">
import VariableRow from './VariableRow.vue'

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

defineProps<{
  variables: Variable[]
  selectedId?: string | null
}>()

const emit = defineEmits<{
  open: [variable: Variable]
  edit: [variable: Variable]
  delete: [id: string]
  export: [variable: Variable]
  copy: [variable: Variable]
}>()
</script>

<template>
  <div class="vars-list">
    <div class="list-header">
      <div />
      <div class="col-label">Nome</div>
      <div class="col-label">Tipos</div>
      <div class="col-label">Campos</div>
      <div class="col-label">Atualizado</div>
      <div />
    </div>
    <VariableRow
      v-for="v in variables"
      :key="v.id"
      :variable="v"
      :selected="selectedId === v.id"
      @open="emit('open', $event)"
      @edit="emit('edit', $event)"
      @delete="emit('delete', $event)"
      @export="emit('export', $event)"
      @copy="emit('copy', $event)"
    />
  </div>
</template>

<style scoped>
.vars-list {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.list-header {
  display: grid;
  grid-template-columns: 40px 1fr 160px 90px 140px 36px;
  align-items: center;
  gap: 14px;
  padding: 9px 14px;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
}

.col-label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-4);
}
</style>
