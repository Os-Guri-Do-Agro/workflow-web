<script setup lang="ts">
/**
 * "Último envio do app" (M4, risco "o job falhar em silêncio"): quando chegou o
 * último número e, depois de 36 h sem envio, o alerta. Usado na área Dados e
 * no painel inicial.
 */
import { computed } from 'vue'
import { TriangleAlert } from 'lucide-vue-next'
import type { AppDataStatus } from '@/service/marketing/marketing-app-data'
import { fmtAgo, fmtDateTime, fmtDay } from './app-data-format'

const props = defineProps<{ status: AppDataStatus; brandName?: (id: string) => string; compact?: boolean }>()

const last = computed(() => {
  let best: { at: string; date: string | null } | null = null
  for (const b of props.status.brands) {
    if (b.lastReceivedAt && (!best || b.lastReceivedAt > best.at)) best = { at: b.lastReceivedAt, date: b.lastDate }
  }
  return best
})
const staleBrands = computed(() => props.status.brands.filter((b) => b.stale))
</script>

<template>
  <div class="asl" :class="{ 'asl--stale': status.stale, 'asl--compact': compact }" data-testid="app-status">
    <template v-if="status.stale">
      <TriangleAlert :size="14" aria-hidden="true" />
      <span role="status">
        <b>O app não manda números há mais de {{ status.staleHours }} h.</b>
        <template v-if="last"> Último envio {{ fmtAgo(last.at) }} ({{ fmtDateTime(last.at) }}).</template>
        <template v-else> Nenhum envio chegou desde que o token foi criado.</template>
        <template v-if="brandName && staleBrands.length && status.brands.length > 1">
          Marca: {{ staleBrands.map((b) => brandName!(b.companyId)).join(', ') }}.
        </template>
        <template v-if="!compact"> Confira o job diário da PetJourney (monitor no Sentry) e se o token não foi revogado.</template>
      </span>
    </template>
    <span v-else-if="last" class="asl__ok">
      Último envio do app {{ fmtAgo(last.at) }}<template v-if="last.date">, com os números até {{ fmtDay(last.date) }}</template>.
    </span>
  </div>
</template>

<style scoped>
.asl {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-2);
}

.asl--stale {
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--border));
  border-radius: 6px;
  background: color-mix(in srgb, var(--warn) 9%, var(--surface));
  color: var(--text);
}

.asl--stale svg {
  flex: none;
  margin-top: 2px;
  color: var(--warn);
}

.asl--compact.asl--stale {
  padding: 6px 8px;
}

.asl__ok {
  color: var(--text-3);
}
</style>
