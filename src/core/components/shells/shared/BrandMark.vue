<script setup lang="ts">
import { useRouter } from 'vue-router'

withDefaults(
  defineProps<{
    size?: number
    /** `selo` traz o fundo creme junto (legivel em qualquer tema). `caneca` usa a marca cheia. */
    variant?: 'selo' | 'caneca'
    to?: string
  }>(),
  { size: 30, variant: 'selo', to: '/' },
)

const router = useRouter()
</script>

<template>
  <button
    class="brand-mark press"
    type="button"
    aria-label="Ir para o Dashboard"
    title="Workflow"
    :style="{ width: `${size}px`, height: `${size}px` }"
    @click="router.push(to)"
  >
    <img
      :src="variant === 'caneca' ? '/brand/caneca-circulo.svg' : '/brand/marca.svg'"
      alt=""
      class="brand-art"
      draggable="false"
    />
  </button>
</template>

<style scoped>
/*
 * O rosto do mascote e feito de tracos marrom escuro: sem uma superficie clara
 * atras ele simplesmente some no tema escuro. Por isso a marca do app bar e o
 * selo, que carrega o proprio fundo creme e fica legivel nos dois temas.
 */
.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  padding: 0;
  border-radius: 9px;
  cursor: pointer;
  flex-shrink: 0;
  line-height: 0;
  transition: transform var(--motion) var(--motion-ease);
}

.brand-mark:hover {
  transform: translateY(-1px);
}

.brand-mark:hover .brand-art {
  transform: rotate(-6deg) scale(1.06);
}

.brand-mark:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.brand-art {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 8px;
  /* Anel sutil so no escuro, para o selo claro nao "flutuar" sobre a topbar. */
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--border) 60%, transparent);
  transition: transform var(--motion) var(--motion-ease);
}

@media (prefers-reduced-motion: reduce) {
  .brand-mark,
  .brand-art {
    transition-duration: 1ms;
  }
}
</style>
