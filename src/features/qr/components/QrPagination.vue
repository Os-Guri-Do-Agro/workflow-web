<script setup lang="ts">
/**
 * Paginador da listagem.
 *
 * Mostra uma janela de páginas em volta da atual, com a primeira e a última
 * sempre visíveis. Com 441 QRs em páginas de 24 são 19 páginas: listar todas
 * viraria uma régua de números que ninguém lê, e mostrar só "anterior/próxima"
 * esconderia o tamanho do conjunto, que é a informação que faz a pessoa decidir
 * entre paginar e buscar.
 */
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

const props = defineProps<{
  page: number
  limit: number
  total: number
  /** Trava os controles enquanto a próxima página está vindo. */
  loading?: boolean
}>()

const emit = defineEmits<{ 'update:page': [value: number] }>()

const lastPage = computed(() => Math.max(1, Math.ceil(props.total / props.limit)))

/** Índices exibidos: primeira, última, e uma janela de 1 em volta da atual. */
const pages = computed<Array<number | 'gap'>>(() => {
  const last = lastPage.value
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1)

  const atual = props.page
  const perto = new Set([1, last, atual - 1, atual, atual + 1])
  // Sem isto, a janela nas pontas fica menor que no meio e a barra "encolhe"
  // conforme se navega, o que dá a impressão de que algo sumiu.
  if (atual <= 3) [2, 3, 4].forEach((p) => perto.add(p))
  if (atual >= last - 2) [last - 3, last - 2, last - 1].forEach((p) => perto.add(p))

  const ordenadas = [...perto].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b)

  const saida: Array<number | 'gap'> = []
  let anterior = 0
  for (const p of ordenadas) {
    if (anterior && p - anterior > 1) saida.push('gap')
    saida.push(p)
    anterior = p
  }
  return saida
})

const primeiroItem = computed(() => (props.page - 1) * props.limit + 1)
const ultimoItem = computed(() => Math.min(props.page * props.limit, props.total))

function ir(p: number) {
  if (p < 1 || p > lastPage.value || p === props.page) return
  emit('update:page', p)
}
</script>

<template>
  <nav v-if="total > limit" class="qp" aria-label="Paginação dos QR codes">
    <p class="qp-range" aria-live="polite">
      {{ primeiroItem }}–{{ ultimoItem }} de {{ total }}
    </p>

    <div class="qp-controls">
      <button
        type="button"
        class="qp-btn qp-btn--arrow"
        :disabled="page <= 1 || loading"
        aria-label="Página anterior"
        @click="ir(page - 1)"
      >
        <ChevronLeft :size="15" />
      </button>

      <template v-for="(p, i) in pages" :key="`${p}-${i}`">
        <span v-if="p === 'gap'" class="qp-gap" aria-hidden="true">…</span>
        <button
          v-else
          type="button"
          class="qp-btn"
          :class="{ 'qp-btn--active': p === page }"
          :disabled="loading"
          :aria-label="`Página ${p}`"
          :aria-current="p === page ? 'page' : undefined"
          @click="ir(p)"
        >
          {{ p }}
        </button>
      </template>

      <button
        type="button"
        class="qp-btn qp-btn--arrow"
        :disabled="page >= lastPage || loading"
        aria-label="Próxima página"
        @click="ir(page + 1)"
      >
        <ChevronRight :size="15" />
      </button>
    </div>
  </nav>
</template>

<style scoped>
.qp {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding-top: 8px;
}

.qp-range {
  margin: 0;
  color: var(--text-3);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}

.qp-controls {
  display: flex;
  align-items: center;
  gap: 3px;
}

.qp-btn {
  min-width: 34px;
  height: 34px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.qp-btn:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text);
}

.qp-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.qp-btn--active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
}

.qp-btn--active:hover:not(:disabled) {
  background: var(--accent);
  color: var(--accent-fg);
}

.qp-btn--arrow {
  min-width: 34px;
  padding: 0;
  border-color: var(--border);
}

.qp-gap {
  padding: 0 2px;
  color: var(--text-4);
  font-size: 12.5px;
}

@media (prefers-reduced-motion: reduce) {
  .qp-btn {
    transition-duration: 1ms;
  }
}
</style>
