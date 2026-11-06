<script setup lang="ts">
/**
 * Checklist do card. Cada pedido de ajuste vira itens `ADJUSTMENT` (quem
 * produziu marca como feito; a tela mostra quem marcou). Editor inclui itens
 * próprios; tira o item quem criou ou Admin.
 */
import { computed, ref } from 'vue'
import { ListChecks, Plus, Trash2 } from 'lucide-vue-next'
import type { MarketingChecklistItem } from '@/service/marketing/marketing-cards'
import { formatDayTime } from '../approvals-meta'

const props = defineProps<{
  items: MarketingChecklistItem[]
  canEdit: boolean
  isAdmin: boolean
  meId: string | null
  busyIds?: ReadonlySet<string>
}>()

const emit = defineEmits<{
  toggle: [id: string, done: boolean]
  add: [text: string]
  remove: [id: string]
}>()

const text = ref('')
const done = computed(() => props.items.filter((i) => i.doneAt).length)

function add() {
  const t = text.value.trim()
  if (!t) return
  emit('add', t)
  text.value = ''
}

const KIND_LABEL: Record<string, string> = { ADJUSTMENT: 'Ajuste', PREPRESS: 'Pré-gráfica', TASK: '' }
</script>

<template>
  <section class="mk-panel mkck" aria-labelledby="mkck-title">
    <header class="mk-panel__head">
      <ListChecks :size="15" aria-hidden="true" />
      <h2 id="mkck-title" class="mkck__title">Checklist</h2>
      <span v-if="items.length" class="mkck__count">{{ done }} de {{ items.length }}</span>
    </header>
    <ul v-if="items.length" class="mkck__list">
      <li v-for="i in items" :key="i.id" class="mkck__item" :class="{ 'is-done': !!i.doneAt }" :data-item="i.id">
        <label class="mkck__check">
          <input
            type="checkbox"
            :checked="!!i.doneAt"
            :disabled="!canEdit || busyIds?.has(i.id)"
            :aria-label="i.text"
            @change="emit('toggle', i.id, ($event.target as HTMLInputElement).checked)"
          />
          <span class="mkck__text">
            <span v-if="KIND_LABEL[i.kind]" class="mkck__kind">{{ KIND_LABEL[i.kind] }}</span>
            {{ i.text }}
          </span>
        </label>
        <span v-if="i.doneAt" class="mkck__by">
          {{ i.doneBy?.name ?? 'Alguém' }}, {{ formatDayTime(i.doneAt) }}
        </span>
        <button
          v-if="canEdit && (isAdmin || i.createdBy?.id === meId)"
          type="button"
          class="mk-icon-btn mkck__del"
          :aria-label="`Tirar o item ${i.text}`"
          @click="emit('remove', i.id)"
        >
          <Trash2 :size="14" />
        </button>
      </li>
    </ul>
    <p v-else class="mkck__empty">Sem itens. Os pedidos de ajuste aparecem aqui.</p>
    <form v-if="canEdit" class="mkck__add" @submit.prevent="add">
      <input v-model="text" class="mk-input" maxlength="500" placeholder="Novo item" aria-label="Novo item do checklist" />
      <button type="submit" class="mk-btn" :disabled="!text.trim()" aria-label="Incluir item">
        <Plus :size="14" aria-hidden="true" />
      </button>
    </form>
  </section>
</template>

<style scoped>
.mkck__title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.mkck__count {
  margin-left: auto;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.mkck__list {
  margin: 0;
  padding: 4px 0;
  list-style: none;
}

.mkck__item {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 2px 8px;
  padding: 4px 8px 4px 14px;
}

.mkck__check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  min-height: 30px;
  padding-top: 5px;
  font-size: 13px;
  cursor: pointer;
}

.mkck__check input {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 1px 0 0;
  accent-color: var(--accent);
}

.mkck__text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.mkck__kind {
  margin-right: 4px;
  padding: 0 5px;
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--due-soon) 14%, transparent);
  color: var(--due-soon);
  font-size: 11px;
  font-weight: 700;
}

.mkck__item.is-done .mkck__text {
  color: var(--text-3);
  text-decoration: line-through;
}

.mkck__by {
  grid-column: 1;
  padding-left: 24px;
  font-size: 11.5px;
  color: var(--text-3);
}

.mkck__del {
  grid-row: 1;
  grid-column: 2;
}

.mkck__empty {
  margin: 0;
  padding: 12px 14px;
  font-size: 12.5px;
  color: var(--text-3);
}

.mkck__add {
  display: flex;
  gap: 6px;
  padding: 8px 14px 12px;
  border-top: 1px solid var(--border);
}

@media (max-width: 640px) {
  .mkck__check {
    min-height: 44px;
    padding-top: 12px;
  }

  .mkck__check input {
    width: 20px;
    height: 20px;
  }
}
</style>
