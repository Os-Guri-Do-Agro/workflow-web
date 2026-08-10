<script setup lang="ts">
/**
 * Chip de tag da atividade.
 *
 * Não é o `Pill`: o Pill pinta a partir de uma cor recebida por prop, e aqui a
 * cor vem da paleta por chave, resolvida para `var(--tag-*)` para acompanhar o
 * tema. A tinta de fundo é uma mistura com a superfície (não transparência
 * pura) para o chip não desaparecer sobre `--surface-2`.
 */
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import { tagColorVar, type TagLike } from './tag-palette'

const props = withDefaults(
  defineProps<{
    tag: TagLike
    /** Mostra o X. Só faz sentido onde a tag pode ser desvinculada. */
    removable?: boolean
    size?: 'sm' | 'md'
    /** Vira botão (filtro do board). Sem isso, é texto e não rouba o clique do card. */
    interactive?: boolean
    active?: boolean
  }>(),
  { removable: false, size: 'sm', interactive: false, active: false },
)

const emit = defineEmits<{ remove: []; select: [] }>()

const color = computed(() => tagColorVar(props.tag))
</script>

<template>
  <component
    :is="interactive ? 'button' : 'span'"
    class="tag"
    :class="[`tag--${size}`, { 'tag--interactive': interactive, 'tag--active': active }]"
    :style="{ '--tag-c': color }"
    :type="interactive ? 'button' : undefined"
    :aria-pressed="interactive ? active : undefined"
    :title="tag.name"
    @click="interactive ? emit('select') : undefined"
  >
    <span class="tag__dot" aria-hidden="true" />
    <span class="tag__label">{{ tag.name }}</span>
    <button
      v-if="removable"
      type="button"
      class="tag__remove press"
      :aria-label="`Remover tag ${tag.name}`"
      @click.stop="emit('remove')"
    >
      <X :size="11" />
    </button>
  </component>
</template>

<style scoped>
.tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 999px;
  white-space: nowrap;
  font-weight: 600;
  max-width: 160px;
  /* A mistura é com a superfície, não com transparente: sobre `--surface-2` o
     chip com alfa puro some, e o card do board vive em cima de superfície. */
  background: color-mix(in srgb, var(--tag-c) 16%, var(--surface));
  color: var(--tag-c);
  border: 1px solid color-mix(in srgb, var(--tag-c) 28%, transparent);
}

.tag--sm {
  height: 20px;
  padding: 0 7px;
  font-size: 10.5px;
}

.tag--md {
  height: 24px;
  padding: 0 9px;
  font-size: 11.5px;
}

.tag__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tag-c);
  flex: none;
}

.tag__label {
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tag--interactive {
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.tag--interactive:hover {
  background: color-mix(in srgb, var(--tag-c) 26%, var(--surface));
}

.tag--active {
  background: color-mix(in srgb, var(--tag-c) 32%, var(--surface));
  border-color: color-mix(in srgb, var(--tag-c) 60%, transparent);
}

.tag--interactive:focus-visible {
  outline: 2px solid var(--tag-c);
  outline-offset: 2px;
}

.tag__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-right: -2px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.65;
}

.tag__remove:hover {
  opacity: 1;
  background: color-mix(in srgb, var(--tag-c) 24%, transparent);
}

.tag__remove:focus-visible {
  outline: 2px solid var(--tag-c);
  outline-offset: 1px;
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .tag--interactive {
    transition: none;
  }
}
</style>
