<script setup lang="ts">
/**
 * Banco de horas na tela (spec banco-de-horas).
 *
 * O objetivo não é mostrar um número: é responder "estou devendo ou sobrando, e
 * como termino se seguir assim?". Por isso a conta aparece ABERTA (trabalhado
 * contra meta) e a projeção declara em cima de qual ritmo foi feita — saldo sem
 * a conta atrás vira um número em que ninguém confia, e projeção sem premissa
 * vira promessa.
 *
 * O sinal nunca é comunicado só por cor: crédito e dívida vêm com palavra.
 */
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { Scale, SlidersHorizontal, TrendingDown, TrendingUp } from 'lucide-vue-next'
import timeService from '@/service/time/time-service'
import {
  currentMonth,
  currentWeek,
  useBalance,
  useToday,
} from '@/features/time/composables/useBalance'
import { formatDurationLong } from '@/utils/duration'

type Escopo = 'week' | 'month'
const escopo = ref<Escopo>('month')

// Depende de `hoje` para virar de período sozinho: a tela fica aberta a noite
// inteira em muita máquina, e sem isso a virada do mês passava despercebida.
const hoje = useToday()
const range = computed(() => {
  void hoje.value
  return escopo.value === 'week' ? currentWeek() : currentMonth()
})
const { data, isLoading } = useBalance(range)

const saldo = computed(() => data.value?.balanceSec ?? 0)
const credito = computed(() => saldo.value >= 0)

/** Duração sempre positiva: o sinal é dito em palavra, não no número. */
const abs = (sec: number) => formatDurationLong(Math.abs(sec))

const palavra = computed(() => (credito.value ? 'de crédito' : 'devendo'))

const projecao = computed(() => data.value?.projectedBalanceSec ?? null)
const projecaoCredito = computed(() => (projecao.value ?? 0) >= 0)

/**
 * A frase da projeção, com a premissa embutida. Sem "no ritmo destes N dias" a
 * pessoa lê o número como certeza e planeja a semana em cima dele.
 */
const fraseProjecao = computed(() => {
  const p = projecao.value
  const pace = data.value?.paceSec
  if (p === null || !pace) return null
  const fim = escopo.value === 'week' ? 'a semana' : 'o mês'
  const ritmo = formatDurationLong(pace)
  return projecaoCredito.value
    ? `No seu ritmo de ${ritmo} por dia, você fecha ${fim} com ${abs(p)} de crédito.`
    : `No seu ritmo de ${ritmo} por dia, você fecha ${fim} devendo ${abs(p)}. Dá tempo de ajustar.`
})

/**
 * Jornada vigente, só para o rótulo do atalho. Mesma chave de cache da tela de
 * configuração, então abrir as duas não gera duas requisições.
 */
const { data: jornada } = useQuery({
  queryKey: ['time', 'schedule'],
  queryFn: () => timeService.getSchedule(),
  staleTime: 5 * 60_000,
})

/** Rótulo curto da meta de um dia útil comum (a segunda representa a semana). */
const metaDiariaLabel = computed(() => {
  const sec = jornada.value?.current?.monSec ?? jornada.value?.defaultDaySec
  if (!sec) return 'definir'
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return m === 0 ? `${h}h por dia` : `${h}h${String(m).padStart(2, '0')} por dia`
})

/** Quanto da meta do período já foi cumprido (limitado a 100% na barra). */
const progresso = computed(() => {
  const d = data.value
  if (!d || d.targetSec <= 0) return d && d.workedSec > 0 ? 100 : 0
  return Math.min(100, Math.round((d.workedSec / d.targetSec) * 100))
})
</script>

<template>
  <section class="bal">
    <header class="bal-head">
      <span class="bal-title"><Scale :size="13" /> Banco de horas</span>
      <div class="bal-scope" role="group" aria-label="Período do banco de horas">
        <button
          type="button"
          class="bal-scope-btn"
          :class="{ 'bal-scope-btn--on': escopo === 'week' }"
          @click="escopo = 'week'"
        >
          Semana
        </button>
        <button
          type="button"
          class="bal-scope-btn"
          :class="{ 'bal-scope-btn--on': escopo === 'month' }"
          @click="escopo = 'month'"
        >
          Mês
        </button>
      </div>
    </header>

    <p v-if="isLoading" class="bal-loading">Calculando…</p>

    <template v-else-if="data">
      <div class="bal-main" :class="credito ? 'bal-main--up' : 'bal-main--down'">
        <component :is="credito ? TrendingUp : TrendingDown" :size="18" />
        <span class="bal-value">{{ credito ? '+' : '−' }}{{ abs(saldo) }}</span>
        <span class="bal-word">{{ palavra }}</span>
      </div>

      <!-- A conta aberta. Um saldo sem a conta atrás é um número em que
           ninguém confia, e a primeira dúvida vira chamado. -->
      <!--
        A contagem é de dias JÁ COBRADOS, e não do período inteiro: a meta não
        cobra dia futuro, e mostrar "21 dias úteis" ao lado de uma meta de 10
        dias faria a conta não fechar para quem conferisse.
      -->
      <p class="bal-math">
        {{ formatDurationLong(data.workedSec) }} trabalhadas · meta
        {{ formatDurationLong(data.targetSec) }}
        <span v-if="data.businessDaysElapsed > 0" class="bal-math-days">
          ({{ data.businessDaysElapsed }}
          {{ data.businessDaysElapsed === 1 ? 'dia útil' : 'dias úteis' }} até hoje)
        </span>
      </p>

      <div
        class="bal-bar"
        role="progressbar"
        :aria-valuenow="progresso"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <span class="bal-bar-fill" :style="{ width: `${progresso}%` }" />
      </div>

      <p v-if="fraseProjecao" class="bal-projection">{{ fraseProjecao }}</p>
      <p v-else class="bal-projection bal-projection--muted">
        Registre mais alguns dias para eu projetar como o período termina.
      </p>

      <!--
        Atalho para a jornada AQUI, e não só em Configurações: a dúvida "de onde
        saiu essa meta?" nasce olhando o saldo. Quem tem escala diferente do
        padrão não vai adivinhar sozinho que precisa procurar em outra tela.
      -->
      <RouterLink class="bal-schedule" :to="{ name: 'settings' }">
        <SlidersHorizontal :size="12" />
        Minha jornada: {{ metaDiariaLabel }}
      </RouterLink>
    </template>
  </section>
</template>

<style scoped>
.bal {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 13px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.bal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.bal-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-3);
}

.bal-scope {
  display: flex;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.bal-scope-btn {
  padding: 3px 9px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
}

.bal-scope-btn--on {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.bal-loading {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}

.bal-main {
  display: flex;
  align-items: baseline;
  gap: 7px;
}

.bal-main--up {
  color: var(--success);
}

.bal-main--down {
  color: var(--warn);
}

.bal-value {
  font-size: 26px;
  font-weight: 780;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.bal-word {
  font-size: 12px;
  font-weight: 650;
  color: var(--text-3);
}

.bal-math {
  margin: 0;
  font-size: 11.5px;
  color: var(--text-3);
}

.bal-math-days {
  color: var(--text-4);
}

.bal-bar {
  height: 5px;
  border-radius: 3px;
  background: var(--surface-3);
  overflow: hidden;
}

.bal-bar-fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--accent);
  transition: width var(--motion-slow) var(--motion-ease);
}

@media (prefers-reduced-motion: reduce) {
  .bal-bar-fill {
    transition: none;
  }
}

.bal-projection {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-2);
}

.bal-projection--muted {
  color: var(--text-4);
}

.bal-schedule {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  align-self: flex-start;
  margin-top: 1px;
  padding: 3px 8px 3px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-3);
  font-size: 11px;
  font-weight: 600;
  text-decoration: none;
}

.bal-schedule:hover {
  background: var(--surface-3);
  color: var(--text);
  border-color: var(--border-strong);
}
</style>
