<script setup lang="ts">
/**
 * Área "Dados" da ala (M4: dados do app, D9). Números por dia do app com a
 * comparação ao período anterior (7, 30 ou 90 dias), o funil por UTM (cliques,
 * leituras de QR, cadastros, conversão) e quem trouxe os cadastros (campanha,
 * post, parceiro, QR) por semana fechada, as quebras (canal, plataforma, "como
 * nos conheceu", uso das funções, pets cadastrados por espécie), o CSV e o
 * Looker Studio do grupo.
 *
 * Desde 07/11 os estoques (assinaturas e pets ativos) vêm só com o total: os
 * quadros por plano e por tipo saíram da tela em vez de ficar "não disponível"
 * para sempre (o contrato não traz mais essa quebra).
 *
 * Visualizador vê (decisão de 06/11). Sem número do app, explica como conectar
 * e o resto da ala segue igual. Tudo que vem do app é agregado com recorte: um
 * número de 1 a 4 chega "menos de 5", e a soma vira intervalo ("32 a 38").
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Download, ExternalLink, RefreshCw } from 'lucide-vue-next'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useToast } from '@/composables/useToast'
import { downloadAppDataCsv, type AppPeriod, type AppStockKpi } from '@/service/marketing/marketing-app-data'
import { useMarketing } from '../composables/useMarketing'
import AppBreakdown from '../app-data/AppBreakdown.vue'
import AppDataChart from '../app-data/AppDataChart.vue'
import AppDataEmpty from '../app-data/AppDataEmpty.vue'
import AppFunnel from '../app-data/AppFunnel.vue'
import AppRankings from '../app-data/AppRankings.vue'
import AppStatusLine from '../app-data/AppStatusLine.vue'
import {
  cutHint,
  deltaTone,
  fmtChange,
  fmtDelta,
  fmtRange,
  fmtStock,
  fmtSum,
  SOURCE_LABEL,
  stockHint,
} from '../app-data/app-data-format'
import { useAppAttribution, useAppDataOverview } from '../app-data/useAppData'

const mk = useMarketing()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const PERIODS: AppPeriod[] = [7, 30, 90]
const period = computed<AppPeriod>(() => {
  const n = Number(route.query.periodo)
  return (PERIODS as number[]).includes(n) ? (n as AppPeriod) : 30
})
function setPeriod(p: AppPeriod) {
  void router.replace({ query: { ...route.query, periodo: p === 30 ? undefined : String(p) } })
}

const filter = computed(() => ({ companyId: mk.brandFilter.value, days: period.value }))
const overview = useAppDataOverview(mk.groupId, filter)
const data = computed(() => overview.data.value)
const hasData = computed(() => !!data.value?.hasData)
const attribution = useAppAttribution(mk.groupId, filter, hasData)

/** O período teve envio do app: valor que não veio numa quebra é 0, e não 'sem dado'. */
const curHas = computed(() => !!data.value?.series.some((p) => p.value))
const prevHas = computed(() => !!data.value?.series.some((p) => p.previous))

const multiBrand = computed(() => mk.brands.value.length > 1 && !mk.brandFilter.value)
const brandName = (id: string) => mk.brandById(id)?.name ?? 'Marca'
const looker = computed(() => data.value?.lookerStudioUrl ?? mk.settings.value?.lookerStudioUrl ?? null)

const kpis = computed(() => {
  const k = data.value?.kpis
  if (!k) return []
  return [
    { key: 'cadastros', label: 'Cadastros', value: k.cadastros.current, previous: k.cadastros.previous, delta: k.cadastros.delta },
    { key: 'assinaturas_novas', label: 'Assinaturas novas', value: k.assinaturas_novas.current, previous: k.assinaturas_novas.previous, delta: k.assinaturas_novas.delta },
    { key: 'pets_novos', label: 'Pets cadastrados', value: k.pets_novos.current, previous: k.pets_novos.previous, delta: k.pets_novos.delta },
  ]
})

const stocks = computed(() => {
  const k = data.value?.kpis
  if (!k) return []
  const s = (key: string, label: string, kpi: AppStockKpi) => ({ key, label, kpi })
  return [s('assinaturas_ativas', 'Assinaturas ativas', k.assinaturas_ativas), s('pets', 'Pets ativos', k.pets)]
})

const actives = computed(() => {
  const k = data.value?.kpis
  if (!k) return []
  return [
    { key: 'ativos_1d', label: 'no dia', kpi: k.ativos_1d },
    { key: 'ativos_7d', label: 'em 7 dias', kpi: k.ativos_7d },
    { key: 'ativos_30d', label: 'em 30 dias', kpi: k.ativos_30d },
  ]
})
const activeSources = computed(() => {
  const set = new Set(actives.value.map((a) => a.kpi.source).filter((s): s is string => !!s))
  return [...set].map((s) => SOURCE_LABEL[s] ?? s).join(' e ')
})

const exporting = ref<'' | 'daily' | 'funnel'>('')
async function exportCsv(kind: 'daily' | 'funnel') {
  if (!mk.groupId.value || exporting.value) return
  exporting.value = kind
  try {
    // O funil vai pelas semanas fechadas (o mesmo nome que a API dá); os números, pelo período.
    const p = kind === 'funnel' ? (attribution.data.value?.weeks ?? data.value?.period.current) : data.value?.period.current
    const range = p ? `${p.from}-a-${p.to}` : String(period.value)
    const fallback = kind === 'daily' ? `dados-do-app-${range}.csv` : `funil-utm-${range}.csv`
    const name = await downloadAppDataCsv(mk.groupId.value, { ...filter.value, kind }, fallback)
    toast.success(`Baixado: ${name}`)
  } catch {
    toast.error('Não deu para gerar o CSV. Tente de novo em instantes.')
  } finally {
    exporting.value = ''
  }
}
</script>

<template>
  <div class="mk-page mkd" data-testid="app-data-view">
    <div class="mk-toolbar mkd__toolbar">
      <div v-if="!data || data.hasData" class="mkd__periods" role="radiogroup" aria-label="Período">
        <button
          v-for="p in PERIODS"
          :key="p"
          type="button"
          role="radio"
          class="mkd__period"
          :class="{ 'is-active': period === p }"
          :aria-checked="period === p"
          :data-period="p"
          @click="setPeriod(p)"
        >
          {{ p }} dias
        </button>
      </div>
      <span v-if="data?.hasData" class="mkd__range">
        {{ fmtRange(data.period.current.from, data.period.current.to) }}
        <span class="mkd__vs">contra {{ fmtRange(data.period.previous.from, data.period.previous.to) }}</span>
      </span>
      <span class="mk-toolbar__spacer" />
      <template v-if="hasData">
        <button type="button" class="mk-btn" data-action="csv-daily" :disabled="!!exporting" @click="exportCsv('daily')">
          <Download :size="14" aria-hidden="true" />{{ exporting === 'daily' ? 'Gerando...' : 'CSV dos números' }}
        </button>
        <button type="button" class="mk-btn" data-action="csv-funnel" :disabled="!!exporting" @click="exportCsv('funnel')">
          <Download :size="14" aria-hidden="true" />{{ exporting === 'funnel' ? 'Gerando...' : 'CSV do funil' }}
        </button>
      </template>
      <a v-if="looker" class="mk-btn" :href="looker" target="_blank" rel="noopener noreferrer" data-action="looker">
        <ExternalLink :size="14" aria-hidden="true" />Looker Studio
      </a>
    </div>

    <div v-if="overview.isLoading.value" class="mkd__loading">
      <Skeleton type="row" />
      <Skeleton type="block" />
      <Skeleton type="block" />
    </div>

    <div v-else-if="overview.isError.value && !data" class="mk-load-error" role="alert">
      <p>Não deu para carregar os números do app.</p>
      <button type="button" class="mk-btn" @click="overview.refetch()">
        <RefreshCw :size="14" aria-hidden="true" />Tentar de novo
      </button>
    </div>

    <template v-else-if="data">
      <AppStatusLine :status="data.status" :brand-name="brandName" />

      <AppDataEmpty
        v-if="!data.hasData"
        :connected="data.status.connected"
        :is-owner="mk.role.value === 'OWNER'"
        :can-see-settings="mk.can('ADMIN')"
      />

      <template v-else>
        <section class="mkd__kpis" aria-label="Números do período">
          <div v-for="k in kpis" :key="k.key" class="mk-panel mkd__kpi" :data-kpi="k.key">
            <span class="mkd__kpi-label">{{ k.label }}</span>
            <span class="mkd__kpi-value" :title="cutHint(k.value)">{{ fmtSum(k.value) }}</span>
            <span class="mkd__kpi-prev">
              <span v-if="fmtDelta(k.delta)" class="mkd__delta" :data-tone="deltaTone(k.delta)">{{ fmtDelta(k.delta) }}</span>
              antes: <span :title="cutHint(k.previous)">{{ fmtSum(k.previous) }}</span>
            </span>
          </div>
          <div class="mk-panel mkd__kpi mkd__kpi--actives" data-kpi="ativos">
            <span class="mkd__kpi-label">Ativos</span>
            <div class="mkd__actives">
              <span v-for="a in actives" :key="a.key" class="mkd__active" :data-active="a.key">
                <span class="mkd__kpi-value mkd__kpi-value--sm" :title="cutHint(a.kpi.value)">{{ fmtSum(a.kpi.value) }}</span>
                <span class="mkd__kpi-prev">{{ a.label }}</span>
              </span>
            </div>
            <span v-if="activeSources" class="mkd__kpi-prev">pelo {{ activeSources }}</span>
          </div>
          <div v-for="s in stocks" :key="s.key" class="mk-panel mkd__kpi" :data-kpi="s.key">
            <span class="mkd__kpi-label">{{ s.label }}</span>
            <span class="mkd__kpi-value" :title="stockHint(s.kpi.value, s.kpi.rounded)">{{ fmtStock(s.kpi.value, s.kpi.rounded) }}</span>
            <span v-if="fmtChange(s.kpi.change, s.kpi.rounded)" class="mkd__kpi-prev" data-change>
              no período:
              <span class="mkd__delta" :data-tone="deltaTone(s.kpi.change)">{{ fmtChange(s.kpi.change, s.kpi.rounded) }}</span>
            </span>
            <span class="mkd__kpi-prev">
              <template v-if="s.kpi.previous">no fim do anterior: {{ fmtStock(s.kpi.previous, s.kpi.rounded) }}</template>
              <template v-else>sem foto do período anterior</template>
            </span>
          </div>
        </section>

        <section class="mk-panel mkd__chart" aria-label="Cadastros por dia">
          <header class="mk-panel__head"><h3>Cadastros por dia</h3></header>
          <div class="mk-panel__body">
            <AppDataChart :series="data.series" />
          </div>
        </section>

        <div v-if="attribution.isLoading.value" class="mkd__loading"><Skeleton type="block" /></div>
        <p v-else-if="attribution.isError.value" class="mk-error" role="alert">
          Não deu para montar o funil por UTM. Os outros números seguem certos.
        </p>
        <template v-else-if="attribution.data.value">
          <AppFunnel
            :rows="attribution.data.value.funnel"
            :totals="attribution.data.value.totals"
            :weeks="attribution.data.value.weeks"
            :brand-name="brandName"
            :multi-brand="multiBrand"
          />
          <AppRankings
            :rankings="attribution.data.value.rankings"
            :weeks="attribution.data.value.weeks"
            :totals="attribution.data.value.totals"
          />
        </template>

        <div class="mkd__grid">
          <AppBreakdown testid="bd-canal" title="Cadastros por canal" :rows="data.breakdowns.canal" compare :has-current="curHas" :has-previous="prevHas" />
          <AppBreakdown testid="bd-plataforma" title="Cadastros por plataforma" :rows="data.breakdowns.plataforma" compare :has-current="curHas" :has-previous="prevHas" />
          <AppBreakdown testid="bd-como" title="Como nos conheceu" :rows="data.breakdowns.comoConheceu" compare :has-current="curHas" :has-previous="prevHas" />
          <AppBreakdown testid="bd-uso" title="Uso das funções (registros criados)" :rows="data.breakdowns.uso" compare :has-current="curHas" :has-previous="prevHas" />
          <AppBreakdown testid="bd-especie" title="Pets cadastrados por espécie" :rows="data.breakdowns.especie" compare :has-current="curHas" :has-previous="prevHas" />
        </div>

        <p class="mkd__foot" data-testid="app-data-foot">
          Números do app somados por dia de Brasília; o dia mais recente é o de ontem. Qualquer número de 1 a 4 vem
          como "menos de 5" e, nas quebras, os valores pequenos vêm juntos em "Outros", para ninguém ser reconhecido.
          Assinaturas e pets ativos vêm só com o total, arredondados para cima de 5 em 5: "até 5" quer dizer de 1 a 5,
          e "cerca de 35", de 31 a 35. Os cancelamentos não vêm do app: a variação das assinaturas ativas no período
          mostra o saldo. O funil por UTM e o ranking contam por semana fechada, de segunda a domingo: a semana em
          curso entra na segunda-feira seguinte. A origem do cadastro vem do site e do app: é estimativa, não prova.
        </p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.mkd {
  gap: 12px;
}

.mkd__toolbar {
  flex-wrap: wrap;
  row-gap: 8px;
}

.mkd__toolbar a.mk-btn {
  text-decoration: none;
}

.mkd__periods {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-2);
}

.mkd__period {
  min-height: 30px;
  padding: 2px 12px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.mkd__period.is-active {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.mkd__period:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.mkd__range {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.mkd__vs {
  margin-left: 4px;
  font-weight: 500;
  color: var(--text-3);
}

.mkd__loading {
  display: grid;
  gap: 10px;
}

.mkd__kpis {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 8px;
}

.mkd__kpi {
  display: grid;
  align-content: start;
  gap: 2px;
  padding: 10px 12px;
}

.mkd__kpi--actives {
  grid-column: span 2;
}

.mkd__kpi-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-2);
}

.mkd__kpi-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.mkd__kpi-value--sm {
  font-size: 18px;
}

.mkd__kpi-prev {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.mkd__actives {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.mkd__active {
  display: grid;
  gap: 0;
}

.mkd__delta {
  margin-right: 4px;
  font-weight: 700;
}

.mkd__delta[data-tone='up'] {
  color: var(--success);
}

.mkd__delta[data-tone='down'] {
  color: var(--err);
}

.mkd__chart h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.mkd__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
  align-items: start;
}

.mkd__foot {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
}

@media (max-width: 640px) {
  .mkd__kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .mkd__kpi--actives {
    grid-column: span 2;
  }

  .mkd__kpi-value {
    font-size: 19px;
  }

  .mkd__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .mkd__period {
    min-height: 36px;
  }
}
</style>
