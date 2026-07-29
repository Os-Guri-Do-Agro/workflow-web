<script setup lang="ts">
/**
 * Troféu (1º) e medalhas (2º e 3º) do ranking, em SVG.
 *
 * Volume de verdade, sem asset externo e sem brilho ao redor: o relevo vem de
 * um gradiente diagonal com três paradas (luz, corpo, sombra), de um realce
 * elíptico no alto e de uma sombra própria na base. Nada de `box-shadow`
 * colorido (aquilo lê como neon, que é o oposto de metal).
 *
 * Os `id` de gradiente são gerados por instância: dois troféus na mesma tela
 * com o mesmo id fariam o segundo herdar o gradiente do primeiro.
 */
import { computed, useId } from 'vue'

const props = withDefaults(defineProps<{ place: 1 | 2 | 3; size?: number }>(), { size: 28 })

const uid = useId()
const bodyId = computed(() => `medal-body-${uid}-${props.place}`)
const shineId = computed(() => `medal-shine-${uid}-${props.place}`)

const metal = computed(() => {
  if (props.place === 1) return { hi: 'var(--metal-gold-hi)', mid: 'var(--metal-gold)', lo: 'var(--metal-gold-lo)' }
  if (props.place === 2)
    return { hi: 'var(--metal-silver-hi)', mid: 'var(--metal-silver)', lo: 'var(--metal-silver-lo)' }
  return { hi: 'var(--metal-bronze-hi)', mid: 'var(--metal-bronze)', lo: 'var(--metal-bronze-lo)' }
})

const label = computed(() => (props.place === 1 ? 'Primeiro lugar' : `${props.place}º lugar`))
</script>

<template>
  <svg
    class="medal"
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    role="img"
    :aria-label="label"
  >
    <defs>
      <linearGradient :id="bodyId" x1="0.15" y1="0" x2="0.85" y2="1">
        <stop offset="0" :stop-color="metal.hi" />
        <stop offset="0.45" :stop-color="metal.mid" />
        <stop offset="1" :stop-color="metal.lo" />
      </linearGradient>
      <linearGradient :id="shineId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.55" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </linearGradient>
    </defs>

    <!-- ── 1º lugar: taça ── -->
    <template v-if="place === 1">
      <!-- alças -->
      <path
        d="M15 13H11.5a5.5 5.5 0 0 0 5.5 5.5"
        fill="none"
        :stroke="metal.lo"
        stroke-width="2.6"
        stroke-linecap="round"
      />
      <path
        d="M33 13h3.5a5.5 5.5 0 0 1-5.5 5.5"
        fill="none"
        :stroke="metal.lo"
        stroke-width="2.6"
        stroke-linecap="round"
      />
      <!-- copo -->
      <path d="M14 8h20v9c0 5.6-4.4 10-10 10S14 22.6 14 17V8Z" :fill="`url(#${bodyId})`" />
      <!-- realce do copo -->
      <path d="M17 10.5h5.5v6.5c0 2.4-1.3 4.4-3 5.2-1.6-1.4-2.5-3.6-2.5-6V10.5Z" :fill="`url(#${shineId})`" />
      <!-- haste -->
      <path d="M22 27h4v5h-4z" :fill="metal.mid" />
      <path d="M24 27h2v5h-2z" :fill="metal.lo" opacity="0.55" />
      <!-- base -->
      <path d="M18 32h12l1.5 4h-15L18 32Z" :fill="`url(#${bodyId})`" />
      <rect x="14.5" y="36" width="19" height="4.5" rx="2.25" :fill="`url(#${bodyId})`" />
      <rect x="14.5" y="38.6" width="19" height="1.9" rx="0.95" :fill="metal.lo" opacity="0.5" />
    </template>

    <!-- ── 2º e 3º: medalha com fita ── -->
    <template v-else>
      <path d="M15 6h6l6 12h-6L15 6Z" :fill="metal.lo" opacity="0.75" />
      <path d="M33 6h-6l-6 12h6l6-12Z" :fill="metal.mid" opacity="0.75" />
      <circle cx="24" cy="30" r="12" :fill="`url(#${bodyId})`" />
      <circle cx="24" cy="30" r="8.5" fill="none" :stroke="metal.lo" stroke-width="1.4" opacity="0.55" />
      <path d="M24 18.4a11.6 11.6 0 0 0-8.2 3.4c2-1.1 4.6-1.8 8.2-1.8s6.2.7 8.2 1.8A11.6 11.6 0 0 0 24 18.4Z" :fill="`url(#${shineId})`" />
      <text
        x="24"
        y="34.6"
        text-anchor="middle"
        :fill="metal.lo"
        font-size="12"
        font-weight="800"
        font-family="inherit"
      >
        {{ place }}
      </text>
    </template>
  </svg>
</template>

<style scoped>
.medal {
  display: block;
  flex-shrink: 0;
  /* Sombra NEUTRA (preta), nunca na cor do metal: cor como luz é o que lê como
     neon. Aqui ela só assenta a peça na superfície. */
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.28));
}
</style>
