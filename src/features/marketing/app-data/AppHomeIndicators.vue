<script setup lang="ts">
/**
 * Indicadores do app no painel inicial (M4, D9): cadastros dos últimos 7 dias
 * contra os 7 anteriores, ativos em 7 dias e assinaturas ativas (arredondadas
 * para cima, de 5 em 5: "até 5" ou "cerca de"), com o aviso de atraso do envio.
 * Sem app conectado não ocupa espaço no painel.
 *
 * O dado vem DENTRO do `GET /home` (`home.app`): o painel faz uma chamada só
 * (regra da auditoria do front da R1, conferida pelo `marketing-shot.cjs`).
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { BarChart3 } from 'lucide-vue-next'
import type { AppDataHome } from '@/service/marketing/marketing-app-data'
import { useMarketing } from '../composables/useMarketing'
import AppStatusLine from './AppStatusLine.vue'
import { cutHint, deltaTone, fmtDelta, fmtStock, fmtSum, stockHint } from './app-data-format'

const props = defineProps<{ app: AppDataHome | null | undefined }>()

const mk = useMarketing()
const data = computed(() => props.app ?? null)
const show = computed(() => !!data.value && (data.value.status.connected || data.value.status.hasData))
const brandName = (id: string) => mk.brandById(id)?.name ?? 'Marca'
const query = computed(() => (mk.brandFilter.value ? { marca: mk.brandFilter.value } : {}))
</script>

<template>
  <section v-if="show && data" class="mkhi" data-section="app" aria-label="Números do app">
    <div class="mkhi__row">
      <span class="mkhi__title"><BarChart3 :size="14" aria-hidden="true" /> App, últimos 7 dias</span>
      <RouterLink class="mkhi__item" :to="{ name: 'marketing-app-data', query: { ...query, periodo: '7' } }" data-indicator="cadastros">
        Cadastros
        <b :title="cutHint(data.signups.current)">{{ fmtSum(data.signups.current) }}</b>
        <span v-if="fmtDelta(data.signups.delta)" class="mkhi__delta" :data-tone="deltaTone(data.signups.delta)">{{ fmtDelta(data.signups.delta) }}</span>
      </RouterLink>
      <RouterLink v-if="data.active7.value" class="mkhi__item" :to="{ name: 'marketing-app-data', query }" data-indicator="ativos">
        Ativos em 7 dias <b :title="cutHint(data.active7.value)">{{ fmtSum(data.active7.value) }}</b>
      </RouterLink>
      <RouterLink v-if="data.subscriptions.value" class="mkhi__item" :to="{ name: 'marketing-app-data', query }" data-indicator="assinaturas">
        Assinaturas ativas
        <b :title="stockHint(data.subscriptions.value, data.subscriptions.rounded)">{{ fmtStock(data.subscriptions.value, data.subscriptions.rounded) }}</b>
      </RouterLink>
      <span v-if="!data.status.hasData" class="mkhi__wait">O app ainda não mandou o primeiro dia.</span>
    </div>
    <AppStatusLine v-if="data.status.stale" :status="data.status" :brand-name="brandName" compact />
  </section>
</template>

<style scoped>
.mkhi {
  display: grid;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.mkhi__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}

.mkhi__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 4px;
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 700;
}

.mkhi__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 2px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-size: 12.5px;
  text-decoration: none;
}

.mkhi__item:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.mkhi__item b {
  color: var(--text);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.mkhi__delta {
  font-size: 12px;
  font-weight: 700;
}

.mkhi__delta[data-tone='up'] {
  color: var(--success);
}

.mkhi__delta[data-tone='down'] {
  color: var(--err);
}

.mkhi__wait {
  font-size: 12.5px;
  color: var(--text-3);
}

@media (max-width: 640px) {
  .mkhi__item {
    min-height: 36px;
  }
}
</style>
