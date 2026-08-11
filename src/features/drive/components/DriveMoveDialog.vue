<script setup lang="ts">
/**
 * Mover arquivo/pasta para outra pasta DO MESMO espaço (trocar de espaço é
 * recusado pelo backend na P1 — a opção nem aparece aqui).
 *
 * Lista achatada da árvore com indentação por profundidade (hierarquia sem
 * `border-left`, convenção herdada do QR). `disabledIds` recebe a própria
 * pasta + descendentes quando o alvo é uma pasta — mover para dentro de si
 * mesma é recusado pelo backend, e aqui a opção já nasce desabilitada.
 */
import { computed, ref, watch } from 'vue'
import { Check, Folder, FolderInput, House, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import type { DriveFolderNode } from '@/features/drive/types'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    /** Raízes da árvore do espaço atual. */
    tree: DriveFolderNode[]
    /** Nome do item sendo movido (título do dialog). */
    itemName: string
    /** Pasta atual do item (pré-selecionada). */
    currentId: string | null
    /** Pastas que não podem ser destino (a própria + descendentes). */
    disabledIds?: string[]
    loading?: boolean
  }>(),
  { disabledIds: () => [], loading: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [folderId: string | null]
}>()

const selected = ref<string | null>(props.currentId)

watch(
  () => props.modelValue,
  (open) => {
    if (open) selected.value = props.currentId
  },
)

interface FlatRow {
  id: string
  name: string
  depth: number
  disabled: boolean
}

const rows = computed<FlatRow[]>(() => {
  const blocked = new Set(props.disabledIds)
  const out: FlatRow[] = []
  const walk = (nodes: DriveFolderNode[]) => {
    for (const node of nodes) {
      out.push({
        id: node.id,
        name: node.name,
        depth: node.depth,
        disabled: blocked.has(node.id),
      })
      walk(node.children)
    }
  }
  walk(props.tree)
  return out
})

function submit() {
  if (props.loading) return
  emit('submit', selected.value)
}
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    :label="`Mover ${itemName}`"
    size="sm"
    :loading="loading"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <header class="dmv__head">
      <div class="dmv__title">
        <FolderInput :size="16" />
        <h2>Mover "{{ itemName }}"</h2>
      </div>
      <button
        type="button"
        class="dmv__x press"
        aria-label="Fechar"
        :disabled="loading"
        @click="emit('update:modelValue', false)"
      >
        <X :size="15" />
      </button>
    </header>

    <div class="dmv__body">
      <div class="dmv__list" role="listbox" aria-label="Pasta de destino">
        <button
          type="button"
          class="dmv__row"
          role="option"
          :aria-selected="selected === null"
          :class="{ 'dmv__row--active': selected === null }"
          @click="selected = null"
        >
          <House :size="14" class="dmv__row-icon" />
          <span class="dmv__row-name">Raiz</span>
          <Check v-if="selected === null" :size="14" class="dmv__row-check" />
        </button>

        <button
          v-for="row in rows"
          :key="row.id"
          type="button"
          class="dmv__row"
          role="option"
          :aria-selected="selected === row.id"
          :class="{ 'dmv__row--active': selected === row.id }"
          :disabled="row.disabled"
          :style="{ paddingLeft: `${12 + row.depth * 16}px` }"
          @click="selected = row.id"
        >
          <Folder :size="14" class="dmv__row-icon" />
          <span class="dmv__row-name">{{ row.name }}</span>
          <Check v-if="selected === row.id" :size="14" class="dmv__row-check" />
        </button>
      </div>

      <footer class="dmv__foot">
        <button
          type="button"
          class="dmv__btn dmv__btn--ghost press"
          :disabled="loading"
          @click="emit('update:modelValue', false)"
        >
          Cancelar
        </button>
        <button
          type="button"
          class="dmv__btn dmv__btn--primary press"
          :disabled="loading || selected === currentId"
          @click="submit"
        >
          {{ loading ? 'Movendo…' : 'Mover' }}
        </button>
      </footer>
    </div>
  </AppDialog>
</template>

<style scoped>
.dmv__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border);
}

.dmv__title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
  min-width: 0;
}

.dmv__title h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dmv__x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  flex: none;
}

.dmv__x:hover {
  background: var(--surface-2);
  color: var(--text);
}

.dmv__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px 16px;
  min-height: 0;
}

.dmv__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 6px;
  background: var(--surface-2);
}

.dmv__row {
  display: flex;
  align-items: center;
  gap: 8px;
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

.dmv__row:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--text);
}

.dmv__row--active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--text);
}

.dmv__row:disabled {
  opacity: 0.4;
  cursor: default;
}

.dmv__row-icon {
  flex: none;
  color: var(--text-3);
}

.dmv__row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dmv__row-check {
  flex: none;
  color: var(--accent);
}

.dmv__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.dmv__btn {
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}

.dmv__btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.dmv__btn--ghost {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-2);
}

.dmv__btn--ghost:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border-strong);
}

.dmv__btn--primary {
  border: none;
  background: var(--accent);
  color: var(--accent-fg);
}
</style>
