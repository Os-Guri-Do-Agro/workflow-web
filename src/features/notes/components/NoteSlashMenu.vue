<script setup lang="ts">
/**
 * Lista de blocos do menu "/". A extensão só publica o estado; toda a
 * renderização e o posicionamento ficam aqui, o que evita instanciar Vue dentro
 * de um plugin do ProseMirror.
 *
 * A navegação por teclado é tratada na extensão (`onKeyDown` roda antes do
 * ProseMirror); aqui só sobra o clique e o scroll do item ativo para a área
 * visível.
 */
import { computed, nextTick, ref, watch } from 'vue'
import type { SlashState } from '../extensions/slash-command'

const props = defineProps<{ state: SlashState }>()

/** O índice ativo pertence a quem criou o estado; aqui só sinalizamos o hover. */
const emit = defineEmits<{ hover: [number] }>()

const list = ref<HTMLElement | null>(null)

/** Abre para cima quando não há espaço abaixo do cursor. */
const position = computed(() => {
  const rect = props.state.rect
  if (!rect) return { display: 'none' }

  const menuHeight = 320
  const gap = 8
  const openUp = rect.bottom + menuHeight + gap > window.innerHeight
  const left = Math.min(rect.left, window.innerWidth - 300)

  return openUp
    ? { left: `${Math.max(8, left)}px`, bottom: `${window.innerHeight - rect.top + gap}px` }
    : { left: `${Math.max(8, left)}px`, top: `${rect.bottom + gap}px` }
})

watch(
  () => props.state.index,
  async () => {
    await nextTick()
    list.value?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  },
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="state.open && state.items.length"
      ref="list"
      class="slash-menu"
      :style="position"
      role="listbox"
      aria-label="Inserir bloco"
    >
      <button
        v-for="(item, i) in state.items"
        :key="item.id"
        type="button"
        class="slash-item"
        :class="{ 'slash-item--active': i === state.index }"
        :data-active="i === state.index"
        role="option"
        :aria-selected="i === state.index"
        @mouseenter="emit('hover', i)"
        @mousedown.prevent="state.select(item)"
      >
        <span class="slash-item__icon">
          <component :is="item.icon" :size="16" />
        </span>
        <span class="slash-item__text">
          <span class="slash-item__title">{{ item.title }}</span>
          <span class="slash-item__desc">{{ item.description }}</span>
        </span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.slash-menu {
  position: fixed;
  z-index: 2600;
  width: 292px;
  max-height: 320px;
  padding: 6px;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-overlay);
  backdrop-filter: blur(20px) saturate(140%);
}

.slash-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 8px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.slash-item--active {
  background: var(--surface-3);
}

.slash-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-2);
}

.slash-item--active .slash-item__icon {
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
  color: var(--accent);
}

.slash-item__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.slash-item__title {
  font-size: 13px;
  font-weight: 550;
  line-height: 1.2;
}

.slash-item__desc {
  color: var(--text-3);
  font-size: 11.5px;
  line-height: 1.2;
}
</style>
