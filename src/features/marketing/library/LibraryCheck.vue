<script setup lang="ts">
/**
 * Caixa de seleção do Acervo, no padrão das listas do Nevo (botão com
 * `role="checkbox"`, como a lista de tarefas), não o checkbox cru do
 * navegador. O clique passa o evento (shift-clique seleciona o intervalo).
 * Enter e espaço marcam a caixa e param aqui: não abrem o que está por trás
 * (o cartão da grade abre a tela cheia no Enter).
 */
defineProps<{ checked: boolean; label: string; indeterminate?: boolean }>()
const emit = defineEmits<{ toggle: [event: MouseEvent] }>()
</script>

<template>
  <button
    type="button"
    class="lck"
    :class="{ 'is-on': checked || indeterminate }"
    role="checkbox"
    :aria-checked="indeterminate ? 'mixed' : checked"
    :aria-label="label"
    @click.stop="emit('toggle', $event)"
    @keydown.enter.stop
    @keydown.space.stop
  >
    <span class="lck__box" aria-hidden="true">
      <svg v-if="indeterminate" width="10" height="10" viewBox="0 0 16 16" fill="none">
        <path d="M3.5 8h9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
      </svg>
      <svg v-else-if="checked" width="10" height="10" viewBox="0 0 16 16" fill="none">
        <path d="m3 8.5 3.2 3.2L13 4.8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
  </button>
</template>

<style scoped>
.lck {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.lck__box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: 1.5px solid var(--border-strong);
  border-radius: 4px;
  background: var(--surface);
  color: var(--accent-fg);
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.lck:hover .lck__box {
  border-color: var(--accent);
}

.lck.is-on .lck__box {
  border-color: var(--accent);
  background: var(--accent);
}

.lck:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 0;
  border-radius: 6px;
}

/* Toque: alvo de 44 px (a caixa desenhada continua pequena). */
@media (max-width: 640px), (hover: none) {
  .lck {
    width: 44px;
    height: 44px;
  }

  .lck__box {
    width: 18px;
    height: 18px;
  }
}
</style>
