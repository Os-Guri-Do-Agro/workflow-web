<script setup lang="ts">
/**
 * Quebra de um fluxo do período (canal, plataforma, "como nos conheceu", uso
 * das funções, pets cadastrados por espécie). Tabela densa: rótulo, barra fina
 * de participação, o número do período e, quando há, o anterior. "Outros"
 * junta o que veio abaixo de 5 (o app agrupa para ninguém ser deduzido).
 *
 * Só fluxo: desde 07/11 os estoques (assinaturas e pets ativos) vêm só com o
 * total, arredondado para cima de 5 em 5, e aparecem nos cartões do topo com o
 * `fmtStock`. Não há mais quebra de estoque para este quadro mostrar.
 */
import { computed } from 'vue'
import type { AppBreakdownRow, CellSum } from '@/service/marketing/marketing-app-data'
import { cutHint, fmtSum, midValue } from './app-data-format'

const props = defineProps<{
  title: string
  rows: AppBreakdownRow[]
  /** Mostra a coluna do período anterior */
  compare?: boolean
  emptyText?: string
  testid?: string
  /** O período (atual/anterior) teve envio do app: valor que não veio é 0, não "sem dado" */
  hasCurrent?: boolean
  hasPrevious?: boolean
}>()

const max = computed(() => Math.max(1, ...props.rows.map((r) => midValue(r.current))))
const show = (s: CellSum, has?: boolean) => (s.cells === 0 && has ? '0' : fmtSum(s))
const share = (r: AppBreakdownRow) => `${Math.round((midValue(r.current) / max.value) * 100)}%`
</script>

<template>
  <section class="mk-panel adb" :data-testid="testid" :aria-label="title">
    <header class="mk-panel__head adb__head">
      <h3>{{ title }}</h3>
    </header>
    <p v-if="!rows.length" class="adb__empty">{{ emptyText ?? 'Sem número neste período.' }}</p>
    <table v-else class="mk-table adb__table">
      <thead>
        <tr>
          <th>Valor</th>
          <th class="mk-num">Período</th>
          <th v-if="compare" class="mk-num hide-sm">Anterior</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.dimension">
          <td><div class="adb__label">
            <span class="adb__name" :class="{ 'is-others': r.dimension.endsWith(':outros') }">{{ r.label }}</span>
            <span class="adb__bar" aria-hidden="true"><span :style="{ width: share(r) }" /></span>
          </div></td>
          <td class="mk-num" :title="cutHint(r.current)">{{ show(r.current, hasCurrent) }}</td>
          <td v-if="compare" class="mk-num hide-sm adb__prev" :title="cutHint(r.previous)">
            {{ show(r.previous, hasPrevious) }}
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.adb {
  min-width: 0;
}

.adb__head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.adb__empty {
  margin: 0;
  padding: 10px 12px;
  font-size: 12.5px;
  color: var(--text-3);
}

.adb__table td {
  padding-top: 5px;
  padding-bottom: 5px;
}

.adb__label {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.adb__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.adb__name.is-others {
  color: var(--text-3);
}

.adb__bar {
  display: block;
  height: 3px;
  border-radius: 2px;
  background: var(--surface-2);
}

.adb__bar > span {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--tag-teal);
}

.adb__prev {
  color: var(--text-3);
}

@media (max-width: 640px) {
  .hide-sm {
    display: none;
  }
}
</style>
