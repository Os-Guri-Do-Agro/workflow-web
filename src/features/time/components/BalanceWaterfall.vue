<script setup lang="ts">
/**
 * A cascata do banco de horas (spec banco-de-horas-tela-explicavel).
 *
 * O pedido que originou esta tela: *"tenho 40 horas de banco, fechei um dia com
 * 7 em vez de 8, 39 horas — isso precisa ser MUITO melhor"*. O saldo já estava
 * certo e já tinha extrato; faltava o MECANISMO à vista.
 *
 * Por que cascata, e não barras do delta com uma linha do acumulado por cima:
 * duas escalas no mesmo plot é o pior anti-padrão de gráfico (o alinhamento dos
 * dois eixos é arbitrário e inventa correlação). Aqui a barra FLUTUA na altura
 * do saldo corrente e a altura dela é o que o dia mexeu — as duas leituras na
 * mesma unidade, num eixo só. É literalmente o "para lá e para cá" pedido.
 *
 * Cor nunca é o único canal: a barra sobe ou desce, o rótulo tem sinal e o
 * tooltip diz a palavra. O par verde/vermelho passa na checagem de daltonismo
 * raspando (ΔE 8,3 contra o piso de 8), e nessa faixa o encoding secundário não
 * é enfeite, é requisito.
 */
import { computed, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-vue-next'
// Import local, e não componente global: registrar o echarts globalmente faz os
// 536 KB dele entrarem no chunk de entrada e serem baixados por quem abre a
// tela de login (mesma razão documentada no OverviewChart).
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import {
  chartBalanceColors,
  chartFontFamily,
  chartThemeDep,
  chartTooltip,
  resolveCssColor,
  withAlpha,
} from '@/plugins/echarts-theme'
import { useBalance, useToday } from '@/features/time/composables/useBalance'
import {
  comSinal,
  montarCascata,
  type BarraDoSaldo,
} from '@/features/time/balance-waterfall'
import { optionCascata } from '@/features/time/balance-chart-options'
import type { StatementMonth } from '@/service/time/time-service'

// `MarkLineComponent` não é opcional: a linha do zero vem de `markLine`, e
// com o build modular do ECharts um componente não registrado é ignorado em
// silêncio — o gráfico renderiza sem a referência e ninguém vê erro nenhum.
use([CanvasRenderer, BarChart, GridComponent, MarkLineComponent, TooltipComponent])

const props = defineProps<{
  /** Os meses do extrato, do mais antigo para o mais novo. */
  months: StatementMonth[]
}>()

const hoje = useToday()

// ─── Mês em foco ─────────────────────────────────────────────────────────────
// Abre no mês mais recente, que é onde está a pergunta ("por que caiu ontem?").
const indice = ref(Math.max(0, props.months.length - 1))
watch(
  () => props.months.length,
  (n) => {
    if (indice.value > n - 1) indice.value = Math.max(0, n - 1)
  },
)

const mes = computed<StatementMonth | undefined>(() => props.months[indice.value])
const temAnterior = computed(() => indice.value > 0)
const temProximo = computed(() => indice.value < props.months.length - 1)

const nomeDoMes = computed(() => {
  const m = mes.value
  if (!m) return ''
  const [ano = '', num = ''] = m.month.split('-')
  const nome = new Date(Number(ano), Number(num) - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })
  return nome.charAt(0).toUpperCase() + nome.slice(1)
})

/**
 * O saldo que ENTROU neste mês: o acumulado do mês anterior.
 *
 * É esta linha que faz a leitura "eu tinha 40h" existir. Sem ela cada mês
 * começaria do zero e o gráfico contaria uma história diferente da do extrato.
 */
const saldoInicial = computed(() =>
  indice.value > 0 ? (props.months[indice.value - 1]?.cumulativeSec ?? 0) : 0,
)

// O dia a dia vem do endpoint de período que já existia — o extrato carrega só
// os meses, e inchá-lo com 365 linhas para desenhar 12 seria pior.
const range = computed(() => ({ from: mes.value?.from ?? '', to: mes.value?.to ?? '' }))
const detalhe = useBalance(
  range,
  computed(() => !!mes.value),
)

const cascata = computed(() =>
  montarCascata({
    saldoInicialSec: saldoInicial.value,
    dias: detalhe.data.value?.byDay ?? [],
    ajustes: mes.value?.adjustments ?? [],
    hoje: hoje.value,
  }),
)

const barras = computed(() => cascata.value.barras)

/** Quanto os DIAS moveram (sem os ajustes, que são declarados à parte). */
const movimentoDosDias = computed(() =>
  barras.value.reduce((total, b) => total + b.deltaSec, 0),
)

/** A barra que mais mexeu no saldo: é a única que ganha rótulo fixo. */
const maisRelevante = computed(() => {
  let alvo: BarraDoSaldo | null = null
  for (const b of barras.value) {
    if (!alvo || Math.abs(b.deltaSec) > Math.abs(alvo.deltaSec)) alvo = b
  }
  return alvo
})

// ─── A option ────────────────────────────────────────────────────────────────
// O componente resolve TOKEN; quem desenha é `balance-chart-options.ts`. A
// separação existe para o gráfico poder ser renderizado fora do navegador e
// conferido de verdade (`scripts/render-balance-charts.ts`) — `resolveCssColor`
// lê o DOM, então uma option montada aqui dentro só existe com browser.
const option = computed(() => {
  // Registra a dependência de tema: é isto que repinta o canvas quando o
  // usuário troca claro/escuro.
  void chartThemeDep()

  const cor = chartBalanceColors()

  return optionCascata({
    barras: barras.value,
    destaque: maisRelevante.value,
    tooltipBase: chartTooltip(),
    cores: {
      credito: cor.credito,
      divida: cor.divida,
      acento: resolveCssColor('var(--accent)'),
      grade: withAlpha('var(--border)', 0.9),
      texto: resolveCssColor('var(--text-3)'),
      textoForte: resolveCssColor('var(--text-2)'),
      superficie: resolveCssColor('var(--surface)'),
      neutro: withAlpha('var(--text-4)', 0.7),
      fonte: chartFontFamily(),
    },
  })
})

/** Largura mínima por barra: abaixo disso o card rola em vez de espremer. */
const larguraMinima = computed(() => Math.max(320, barras.value.length * 26))
</script>

<template>
  <section v-if="mes" class="wf">
    <header class="wf-head">
      <div class="wf-title">
        <TrendingUp :size="15" />
        <h4>Como seu saldo se moveu</h4>
      </div>
      <div class="wf-nav">
        <button
          type="button"
          class="wf-nav-btn"
          :disabled="!temAnterior"
          aria-label="Mês anterior"
          @click="indice--"
        >
          <ChevronLeft :size="15" />
        </button>
        <span class="wf-month">{{ nomeDoMes }}</span>
        <button
          type="button"
          class="wf-nav-btn"
          :disabled="!temProximo"
          aria-label="Próximo mês"
          @click="indice++"
        >
          <ChevronRight :size="15" />
        </button>
      </div>
    </header>

    <!-- A regra, escrita, com número concreto. Era a peça que faltava: o saldo
         aparecia pronto e ninguém sabia como ele se movia. -->
    <p class="wf-regra">
      Cada dia útil tem uma meta. Trabalhou menos, a diferença sai do banco;
      trabalhou mais, entra. Um dia de <strong>7h</strong> numa meta de
      <strong>8h</strong> tira <strong>1h</strong>. Fim de semana e feriado não
      têm meta, então ali tudo que você trabalha vira crédito.
    </p>

    <!-- A conta inteira, escrita. O gráfico mostra a parte do trabalho; esta
         linha garante que o número do fim bate com o do extrato, inclusive
         quando existe ajuste (que não entra no desenho). -->
    <div class="wf-entrada">
      <span>Começou com</span>
      <strong :class="cascata.saldoInicialSec >= 0 ? 'wf-up' : 'wf-down'">
        {{ comSinal(cascata.saldoInicialSec) }}
      </strong>
      <span class="wf-seta">·</span>
      <span>dias</span>
      <strong :class="movimentoDosDias >= 0 ? 'wf-up' : 'wf-down'">
        {{ comSinal(movimentoDosDias) }}
      </strong>
      <template v-if="cascata.ajustesSec !== 0">
        <span class="wf-seta">·</span>
        <span>ajustes</span>
        <strong :class="cascata.ajustesSec >= 0 ? 'wf-up' : 'wf-down'">
          {{ comSinal(cascata.ajustesSec) }}
        </strong>
      </template>
      <span class="wf-seta">=</span>
      <strong :class="cascata.saldoFinalSec >= 0 ? 'wf-up' : 'wf-down'">
        {{ comSinal(cascata.saldoFinalSec) }}
      </strong>
    </div>

    <!-- O ajuste fica FORA do gráfico de propósito: um acerto de +253h ao lado
         de dias de ±4h achata todos os dias em traços colados no zero. Ele
         também não é da mesma natureza — é lançamento, não trabalho medido. -->
    <ul v-if="cascata.ajustes.length" class="wf-ajustes">
      <li v-for="a in cascata.ajustes" :key="a.id" class="wf-ajuste">
        <strong :class="a.seconds >= 0 ? 'wf-up' : 'wf-down'">{{ comSinal(a.seconds) }}</strong>
        <span class="wf-ajuste-motivo">{{ a.reason }}</span>
        <span class="wf-ajuste-dia">{{ a.day.slice(8) }}/{{ a.day.slice(5, 7) }}</span>
      </li>
    </ul>

    <p v-if="detalhe.isLoading.value" class="wf-vazio">Carregando os dias…</p>
    <p v-else-if="!barras.length" class="wf-vazio">
      Nenhum dia com meta ou apontamento neste mês.
    </p>
    <!-- Enquanto o mês novo chega, o desenho do anterior fica no lugar, apagado.
         Trocar o gráfico por um texto de carregamento encolhia o card e fazia a
         página inteira pular a cada clique na seta. -->
    <div v-else class="wf-scroll" :class="{ 'wf-scroll--stale': detalhe.isFetching.value }">
      <VChart
        class="wf-chart"
        :option="option"
        :style="{ minWidth: `${larguraMinima}px` }"
        autoresize
      />
    </div>

    <!-- Legenda em HTML: o canvas não é lugar para texto que precisa ser
         selecionável e acessível. -->
    <ul class="wf-legenda">
      <li><i class="wf-dot wf-dot--up" aria-hidden="true" /> Barra para cima: entrou no banco</li>
      <li><i class="wf-dot wf-dot--down" aria-hidden="true" /> Barra para baixo: saiu do banco</li>
      <li><i class="wf-dot wf-dot--zero" aria-hidden="true" /> Traço cinza: cumpriu a meta exata</li>
    </ul>
  </section>
</template>

<style scoped>
.wf {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.wf-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.wf-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wf-title h4 {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 600;
}

.wf-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.wf-nav-btn {
  display: inline-flex;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 6px);
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.wf-nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.wf-month {
  font-size: 0.85rem;
  font-weight: 600;
  min-width: 130px;
  text-align: center;
}

.wf-regra,
.wf-vazio {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.5;
  opacity: 0.8;
}

.wf-entrada {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 0.82rem;
  padding: 8px 10px;
  border-radius: var(--radius-md, 8px);
  background: var(--surface-2, rgba(127, 127, 127, 0.06));
}

.wf-entrada strong {
  font-variant-numeric: tabular-nums;
}

.wf-seta {
  opacity: 0.5;
}

.wf-up {
  color: var(--success, #039855);
}

.wf-down {
  color: var(--err, #f04438);
}

/* Abaixo de ~720px o gráfico rola em vez de espremer 31 barras numa tela de
   celular: barra fina demais deixa de ser legível e o rótulo colide. */
.wf-ajustes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wf-ajuste {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 0.78rem;
  padding: 6px 10px;
  border-radius: var(--radius-md, 8px);
  border: 1px dashed var(--border-strong, var(--border));
}

.wf-ajuste-motivo {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wf-ajuste-dia {
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
}

.wf-scroll {
  overflow-x: auto;
  overflow-y: hidden;
}

.wf-chart {
  height: 260px;
  width: 100%;
}

.wf-scroll--stale {
  opacity: 0.55;
  transition: opacity 120ms ease;
}

.wf-legenda {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  font-size: 0.75rem;
  opacity: 0.8;
}

.wf-legenda li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.wf-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
}

.wf-dot--up {
  background: #039855;
}

.wf-dot--down {
  background: var(--err, #f04438);
}

.wf-dot--zero {
  background: var(--text-4, rgba(127, 127, 127, 0.5));
}
</style>
