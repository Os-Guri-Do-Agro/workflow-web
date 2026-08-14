<script setup lang="ts">
/**
 * Fechamento semanal e mensal (spec banco-de-horas, fase C).
 *
 * Existe para o gestor parar de montar planilha e para a pessoa conseguir
 * conferir dia a dia de onde saiu o próprio saldo. As duas leituras usam a
 * MESMA fonte (`/time/balance` e `/time/company-balance`), então o número que
 * a pessoa vê é exatamente o que o admin vê — divergência aqui destrói a
 * confiança na ferramenta inteira.
 *
 * A visão de equipe é só para quem administra: saldo não é dado de par para
 * par. Quem não é ADMIN nem vê a aba.
 */
import { computed, ref } from 'vue'
import { ChevronLeft, ChevronRight, Download, Users } from 'lucide-vue-next'
import {
  currentMonth,
  currentWeek,
  useBalance,
  useCompanyBalance,
  useToday,
} from '@/features/time/composables/useBalance'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { downloadBlob } from '@/service/export/export-service'
import { formatDurationLong } from '@/utils/duration'

const props = withDefaults(
  defineProps<{
    /** `team` exige ADMIN na empresa ativa; o servidor recusa o resto. */
    scope?: 'me' | 'team'
  }>(),
  { scope: 'me' },
)

const workspace = useWorkspaceStore()

type Periodo = 'week' | 'month'
const periodo = ref<Periodo>('month')
/** Deslocamento em semanas ou meses: 0 = atual, -1 = anterior. */
const offset = ref(0)

const hoje = useToday()

// Depende de `hoje` para a virada do dia recalcular o período: com a tela
// aberta na virada do mês, um computed sem essa dependência continuaria
// mostrando (e revalidando) o mês anterior.
const range = computed(() => {
  void hoje.value
  const base = new Date()
  if (periodo.value === 'week') {
    base.setDate(base.getDate() + offset.value * 7)
    return currentWeek(base)
  }
  base.setDate(1)
  base.setMonth(base.getMonth() + offset.value)
  return currentMonth(base)
})

const rotuloPeriodo = computed(() => {
  const [ano = '', mes = '', dia = ''] = range.value.from.split('-')
  if (periodo.value === 'month') {
    const nome = new Date(Number(ano), Number(mes) - 1, 1).toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    })
    return nome.charAt(0).toUpperCase() + nome.slice(1)
  }
  const [, mesFim = '', diaFim = ''] = range.value.to.split('-')
  return `${dia}/${mes} a ${diaFim}/${mesFim}`
})

// Cada instância consulta APENAS o que exibe: a instância de equipe pedindo o
// saldo pessoal seria uma requisição que nunca aparece na tela.
const meuSaldo = useBalance(range, computed(() => props.scope === 'me'))
const equipe = useCompanyBalance(
  range,
  computed(() => (props.scope === 'team' ? workspace.activeCompanyId : null)),
)

const abs = (sec: number) => formatDurationLong(Math.abs(sec))
const sinal = (sec: number) => (sec >= 0 ? '+' : '−')

/**
 * Só os dias que interessam: com registro OU com meta cobrada.
 *
 * O `targetSec` de `byDay` é a meta REAL do dia, inclusive no futuro (a pessoa
 * precisa ver o que a espera). Mas o saldo do período não cobra dia futuro,
 * então a linha do dia carrega uma marca de `futuro` — sem ela, o relatório
 * exibia a meta cheia como dívida em cada dia que ainda nem chegou, e a soma das linhas não
 * batia com o Saldo do topo.
 */
const diasVisiveis = computed(
  () =>
    meuSaldo.data.value?.byDay
      .filter((d) => d.workedSec > 0 || d.targetSec > 0)
      .map((d) => ({ ...d, futuro: d.day > hoje.value })) ?? [],
)

const diaLabel = (day: string) => {
  const [a = 0, m = 1, d = 1] = day.split('-').map(Number)
  const data = new Date(a, m - 1, d)
  const semana = data.toLocaleDateString('pt-BR', { weekday: 'short' })
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')} ${semana.replace('.', '')}`
}

/**
 * CSV do fechamento. Ponto e vírgula e vírgula decimal porque o Excel em
 * português abre assim; com vírgula separadora, o arquivo chega em uma coluna
 * só e alguém precisa reimportar à mão.
 */
function exportarCsv() {
  const linhas: string[] = []
  const dec = (sec: number) => (sec / 3600).toFixed(2).replace('.', ',')

  if (props.scope === 'team') {
    const dados = equipe.data.value
    if (!dados) return
    linhas.push('Pessoa;Email;Trabalhado (h);Meta (h);Saldo (h);Nesta empresa (h)')
    for (const p of dados.people) {
      linhas.push(
        [p.name, p.email, dec(p.workedSec), dec(p.targetSec), dec(p.balanceSec), dec(p.companySec)].join(';'),
      )
    }
  } else {
    const dados = meuSaldo.data.value
    if (!dados) return
    linhas.push('Dia;Trabalhado (h);Meta (h);Saldo (h);Feriado')
    for (const d of dados.byDay) {
      // Mesma regra da tela: dia futuro não fecha saldo, senão a coluna não
      // soma o total da última linha e a planilha vira discussão.
      const futuro = d.day > hoje.value
      linhas.push(
        [
          d.day,
          dec(d.workedSec),
          dec(d.targetSec),
          futuro ? '' : dec(d.workedSec - d.targetSec),
          d.holiday ?? '',
        ].join(';'),
      )
    }
    linhas.push('')
    linhas.push(`Total;${dec(dados.workedSec)};${dec(dados.targetSec)};${dec(dados.balanceSec)};`)
  }

  // BOM: sem ele o Excel lê os acentos errado e o nome das pessoas sai quebrado.
  const blob = new Blob([`﻿${linhas.join('\r\n')}`], {
    type: 'text/csv;charset=utf-8',
  })
  downloadBlob(blob, `fechamento-${props.scope}-${range.value.from}-a-${range.value.to}.csv`)
}
</script>

<template>
  <section class="rep">
    <header class="rep-head">
      <div class="rep-nav">
        <button class="rep-nav-btn" type="button" aria-label="Período anterior" @click="offset -= 1">
          <ChevronLeft :size="15" />
        </button>
        <span class="rep-period">{{ rotuloPeriodo }}</span>
        <button
          class="rep-nav-btn"
          type="button"
          aria-label="Próximo período"
          :disabled="offset >= 0"
          @click="offset += 1"
        >
          <ChevronRight :size="15" />
        </button>
      </div>

      <div class="rep-tools">
        <div class="rep-scope" role="group" aria-label="Semana ou mês">
          <button
            type="button"
            class="rep-scope-btn"
            :class="{ 'rep-scope-btn--on': periodo === 'week' }"
            @click="((periodo = 'week'), (offset = 0))"
          >
            Semana
          </button>
          <button
            type="button"
            class="rep-scope-btn"
            :class="{ 'rep-scope-btn--on': periodo === 'month' }"
            @click="((periodo = 'month'), (offset = 0))"
          >
            Mês
          </button>
        </div>
        <button class="rep-csv" type="button" @click="exportarCsv">
          <Download :size="12" /> CSV
        </button>
      </div>
    </header>

    <!-- ─── Fechamento individual ─────────────────────────────────────────── -->
    <template v-if="scope === 'me'">
      <p v-if="meuSaldo.isLoading.value" class="rep-loading">Calculando…</p>
      <template v-else-if="meuSaldo.data.value">
        <div class="rep-totals">
          <div class="rep-total">
            <span class="rep-total-label">Trabalhado</span>
            <span class="rep-total-value">
              {{ formatDurationLong(meuSaldo.data.value.workedSec) }}
            </span>
          </div>
          <div class="rep-total">
            <span class="rep-total-label">Meta</span>
            <span class="rep-total-value">
              {{ formatDurationLong(meuSaldo.data.value.targetSec) }}
            </span>
          </div>
          <div
            class="rep-total"
            :class="meuSaldo.data.value.balanceSec >= 0 ? 'rep-total--up' : 'rep-total--down'"
          >
            <span class="rep-total-label">Saldo</span>
            <span class="rep-total-value">
              {{ sinal(meuSaldo.data.value.balanceSec) }}{{ abs(meuSaldo.data.value.balanceSec) }}
            </span>
          </div>
        </div>

        <ul class="rep-days">
          <li
            v-for="d in diasVisiveis"
            :key="d.day"
            class="rep-day"
            :class="{ 'rep-day--today': d.day === hoje, 'rep-day--holiday': !!d.holiday }"
          >
            <span class="rep-day-date">{{ diaLabel(d.day) }}</span>
            <span v-if="d.holiday" class="rep-day-holiday">{{ d.holiday }}</span>
            <!-- Dia sem registro vira travessão: "0s" numa coluna de horas lê
                 como defeito, não como ausência. -->
            <span class="rep-day-worked" :class="{ 'rep-day-empty': d.workedSec === 0 }">
              {{ d.workedSec > 0 ? formatDurationLong(d.workedSec) : '—' }}
            </span>
            <span class="rep-day-target">
              {{ d.targetSec > 0 ? formatDurationLong(d.targetSec) : 'sem meta' }}
            </span>
            <!-- Dia futuro não fecha saldo: a meta dele aparece, mas cobrar
                 agora faria a soma das linhas divergir do total do topo. -->
            <span v-if="d.futuro" class="rep-day-diff rep-day-empty">a cumprir</span>
            <span
              v-else
              class="rep-day-diff"
              :class="d.workedSec - d.targetSec >= 0 ? 'rep-up' : 'rep-down'"
            >
              {{ sinal(d.workedSec - d.targetSec) }}{{ abs(d.workedSec - d.targetSec) }}
            </span>
          </li>
        </ul>
      </template>
    </template>

    <!-- ─── Fechamento da equipe (ADMIN) ──────────────────────────────────── -->
    <template v-else>
      <p v-if="equipe.isLoading.value" class="rep-loading">Calculando…</p>
      <p v-else-if="equipe.isError.value" class="rep-denied">
        <Users :size="14" />
        O fechamento da equipe é visível para quem administra a empresa.
      </p>
      <ul v-else-if="equipe.data.value" class="rep-people">
        <li v-for="p in equipe.data.value.people" :key="p.userId" class="rep-person">
          <span class="rep-person-name">{{ p.name }}</span>
          <span class="rep-person-worked">
            {{ formatDurationLong(p.workedSec) }}
            <span class="rep-person-here">({{ formatDurationLong(p.companySec) }} aqui)</span>
          </span>
          <span class="rep-person-target">{{ formatDurationLong(p.targetSec) }}</span>
          <span class="rep-person-bal" :class="p.balanceSec >= 0 ? 'rep-up' : 'rep-down'">
            {{ sinal(p.balanceSec) }}{{ abs(p.balanceSec) }}
          </span>
        </li>
      </ul>
      <p class="rep-note">
        O saldo é da pessoa e considera a jornada dela, somando todas as empresas em que
        atua. Entre parênteses, quanto desse tempo foi nesta empresa.
      </p>
    </template>
  </section>
</template>

<style scoped>
.rep {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.rep-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.rep-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.rep-nav-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  cursor: pointer;
}

.rep-nav-btn:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--text);
}

.rep-nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.rep-period {
  min-width: 132px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}

.rep-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rep-scope {
  display: flex;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.rep-scope-btn {
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

.rep-scope-btn--on {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.rep-csv {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  font-family: inherit;
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
}

.rep-csv:hover {
  background: var(--surface-3);
  color: var(--text);
}

.rep-totals {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.rep-total {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.rep-total-label {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-4);
}

.rep-total-value {
  font-size: 15px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

.rep-total--up .rep-total-value {
  color: var(--success);
}

.rep-total--down .rep-total-value {
  color: var(--warn);
}

.rep-days,
.rep-people {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.rep-day,
.rep-person {
  display: grid;
  align-items: center;
  gap: 8px;
  padding: 7px 4px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}

.rep-day {
  grid-template-columns: 92px 1fr auto auto 76px;
}

.rep-person {
  grid-template-columns: 1fr auto auto 84px;
}

.rep-day:last-child,
.rep-person:last-child {
  border-bottom: none;
}

.rep-day--today {
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}

.rep-day--holiday .rep-day-date {
  color: var(--text-3);
}

.rep-day-date {
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.rep-day-holiday {
  color: var(--text-4);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rep-day-worked,
.rep-person-worked {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.rep-day-empty {
  color: var(--text-4);
}

.rep-day-target,
.rep-person-target {
  color: var(--text-4);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.rep-day-diff,
.rep-person-bal {
  text-align: right;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.rep-up {
  color: var(--success);
}

.rep-down {
  color: var(--warn);
}

.rep-person-name {
  color: var(--text);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rep-person-here {
  color: var(--text-4);
  font-size: 11px;
}

.rep-loading,
.rep-note,
.rep-denied {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-3);
}

.rep-denied {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

@media (max-width: 640px) {
  .rep-totals {
    grid-template-columns: 1fr;
  }

  .rep-day {
    grid-template-columns: 78px 1fr 70px;
  }

  .rep-day-holiday,
  .rep-day-target {
    display: none;
  }
}
</style>
