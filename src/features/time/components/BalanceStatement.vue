<script setup lang="ts">
/**
 * Extrato do banco de horas (spec banco-de-horas-extrato-acumulado).
 *
 * O que esta tela responde, e que nenhuma outra respondia: "qual é o meu saldo
 * HOJE, e de onde ele veio?". O card de saldo mostra o período corrente; o
 * fechamento mostra um período escolhido. Nenhum dos dois atravessava o mês, e
 * era isso que fazia o crédito de julho sumir em agosto.
 *
 * A leitura é a de um extrato bancário: uma linha por mês, com o saldo do mês e
 * o acumulado depois dele. Clicar no mês abre o dia a dia — que vem do endpoint
 * de período que já existia, em vez de inchar o payload do extrato com 365
 * linhas para mostrar 12.
 */
import { computed, ref } from 'vue'
import { ChevronDown, ChevronRight, Plus, Scale, Trash2 } from 'lucide-vue-next'
import {
  useAdjustmentMutations,
  useBalance,
  useStatement,
} from '@/features/time/composables/useBalance'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { formatDurationLong } from '@/utils/duration'
import BalanceAdjustDialog from './BalanceAdjustDialog.vue'

const workspace = useWorkspaceStore()
const extrato = useStatement()

/** Duração sempre positiva: o sinal é dito em palavra, não escondido no número. */
const abs = (sec: number) => formatDurationLong(Math.abs(sec))
const sinal = (sec: number) => (sec >= 0 ? '+' : '−')

const saldo = computed(() => extrato.data.value?.cumulativeSec ?? 0)
const credito = computed(() => saldo.value >= 0)

const nomeDoMes = (mes: string) => {
  const [ano = '', m = ''] = mes.split('-')
  const nome = new Date(Number(ano), Number(m) - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}

/**
 * O mês aberto. Um por vez: abrir vários transforma o extrato numa lista de
 * dias, que é exatamente a leitura que ele existe para evitar.
 */
const aberto = ref<string | null>(null)
const mesAberto = computed(() => {
  const linha = extrato.data.value?.months.find((m) => m.month === aberto.value)
  return linha ? { from: linha.from, to: linha.to } : { from: '', to: '' }
})
const detalhe = useBalance(
  mesAberto,
  computed(() => !!aberto.value),
)

function alternar(mes: string) {
  aberto.value = aberto.value === mes ? null : mes
}

const diaLabel = (day: string) => {
  const [a = 0, m = 1, d = 1] = day.split('-').map(Number)
  const data = new Date(a, m - 1, d)
  const semana = data.toLocaleDateString('pt-BR', { weekday: 'short' })
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')} ${semana.replace('.', '')}`
}

/** Só os dias que dizem algo: com registro OU com meta cobrada. */
const diasDoMes = computed(
  () =>
    detalhe.data.value?.byDay.filter((d) => d.workedSec > 0 || d.targetSec > 0) ?? [],
)

// ─── Ajuste (ADMIN) ──────────────────────────────────────────────────────────
const ajusteAberto = ref(false)
const { remover } = useAdjustmentMutations(
  computed(() => workspace.activeCompanyId),
)

function removerAjuste(id: string) {
  remover.mutate(id)
}
</script>

<template>
  <section class="stm">
    <header class="stm-head">
      <div class="stm-title">
        <Scale :size="16" />
        <h3>Extrato do banco de horas</h3>
      </div>
      <button
        v-if="workspace.isAdmin"
        type="button"
        class="stm-adjust-btn"
        @click="ajusteAberto = true"
      >
        <Plus :size="14" />
        <span>Lançar ajuste</span>
      </button>
    </header>

    <p v-if="extrato.isLoading.value" class="stm-loading">Calculando…</p>

    <p v-else-if="!extrato.data.value?.months.length" class="stm-empty">
      Seu extrato começa no primeiro apontamento. Ligue o cronômetro uma vez e
      ele aparece aqui.
    </p>

    <template v-else>
      <!-- O número que a tela existe para mostrar: o saldo que atravessa os
           meses. Sinal em palavra, nunca só em cor. -->
      <div class="stm-saldo" :class="credito ? 'stm-saldo--up' : 'stm-saldo--down'">
        <span class="stm-saldo-label">Saldo hoje</span>
        <strong class="stm-saldo-value">{{ abs(saldo) }}</strong>
        <span class="stm-saldo-word">{{ credito ? 'de crédito' : 'devendo' }}</span>
      </div>

      <ul class="stm-months">
        <li v-for="m in extrato.data.value.months" :key="m.month" class="stm-month">
          <button
            type="button"
            class="stm-row"
            :aria-expanded="aberto === m.month"
            @click="alternar(m.month)"
          >
            <span class="stm-chevron">
              <ChevronDown v-if="aberto === m.month" :size="14" />
              <ChevronRight v-else :size="14" />
            </span>
            <span class="stm-month-name">{{ nomeDoMes(m.month) }}</span>
            <span class="stm-cell">
              <span class="stm-cell-label">Trabalhado</span>
              {{ formatDurationLong(m.workedSec) }}
            </span>
            <span class="stm-cell">
              <span class="stm-cell-label">Meta</span>
              {{ formatDurationLong(m.targetSec) }}
            </span>
            <span v-if="m.adjustmentSec !== 0" class="stm-cell">
              <span class="stm-cell-label">Ajuste</span>
              <span :class="m.adjustmentSec >= 0 ? 'stm-up' : 'stm-down'">
                {{ sinal(m.adjustmentSec) }}{{ abs(m.adjustmentSec) }}
              </span>
            </span>
            <span class="stm-cell">
              <span class="stm-cell-label">No mês</span>
              <span :class="m.balanceSec >= 0 ? 'stm-up' : 'stm-down'">
                {{ sinal(m.balanceSec) }}{{ abs(m.balanceSec) }}
              </span>
            </span>
            <!-- O acumulado é o que diferencia extrato de relatório mensal. -->
            <span class="stm-cell stm-cell--strong">
              <span class="stm-cell-label">Acumulado</span>
              <span :class="m.cumulativeSec >= 0 ? 'stm-up' : 'stm-down'">
                {{ sinal(m.cumulativeSec) }}{{ abs(m.cumulativeSec) }}
              </span>
            </span>
          </button>

          <div v-if="aberto === m.month" class="stm-detail">
            <!-- Os ajustes vêm primeiro: eles explicam a diferença entre o que
                 foi apontado e o saldo do mês. Sem o motivo à vista, o número
                 fica indefensável. -->
            <ul v-if="m.adjustments.length" class="stm-adjustments">
              <li v-for="a in m.adjustments" :key="a.id" class="stm-adjustment">
                <span class="stm-adj-day">{{ diaLabel(a.day) }}</span>
                <span :class="a.seconds >= 0 ? 'stm-up' : 'stm-down'">
                  {{ sinal(a.seconds) }}{{ abs(a.seconds) }}
                </span>
                <span class="stm-adj-reason">{{ a.reason }}</span>
                <span v-if="a.by" class="stm-adj-by">por {{ a.by }}</span>
                <button
                  v-if="workspace.isAdmin"
                  type="button"
                  class="stm-adj-remove"
                  :aria-label="`Remover ajuste de ${a.reason}`"
                  :disabled="remover.isPending.value"
                  @click="removerAjuste(a.id)"
                >
                  <Trash2 :size="13" />
                </button>
              </li>
            </ul>

            <p v-if="detalhe.isLoading.value" class="stm-loading">Carregando os dias…</p>
            <ul v-else class="stm-days">
              <li
                v-for="d in diasDoMes"
                :key="d.day"
                class="stm-day"
                :class="{ 'stm-day--holiday': !!d.holiday }"
              >
                <span class="stm-day-date">{{ diaLabel(d.day) }}</span>
                <span v-if="d.holiday" class="stm-day-holiday">{{ d.holiday }}</span>
                <!-- Dia sem registro vira travessão: "0s" numa coluna de horas
                     lê como defeito, não como ausência. -->
                <span class="stm-day-worked" :class="{ 'stm-day-empty': d.workedSec === 0 }">
                  {{ d.workedSec > 0 ? formatDurationLong(d.workedSec) : '—' }}
                </span>
                <span class="stm-day-target">
                  {{ d.targetSec > 0 ? formatDurationLong(d.targetSec) : 'sem meta' }}
                </span>
                <span
                  class="stm-day-diff"
                  :class="d.workedSec - d.targetSec >= 0 ? 'stm-up' : 'stm-down'"
                >
                  {{ sinal(d.workedSec - d.targetSec) }}{{ abs(d.workedSec - d.targetSec) }}
                </span>
              </li>
            </ul>
          </div>
        </li>
      </ul>

      <p class="stm-note">
        A contagem começa no seu primeiro apontamento
        <template v-if="extrato.data.value.startedOn">
          ({{ diaLabel(extrato.data.value.startedOn) }})
        </template>
        e o saldo atravessa os meses, para cima ou para baixo. Dia útil sem
        registro conta como meta não cumprida; para corrigir o que o cronômetro
        não viu, quem administra lança um ajuste.
      </p>
    </template>

    <BalanceAdjustDialog v-model="ajusteAberto" />
  </section>
</template>

<style scoped>
.stm {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.stm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.stm-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.stm-title h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.stm-adjust-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 0.8rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 8px);
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.stm-adjust-btn:hover {
  background: var(--surface-2, rgba(127, 127, 127, 0.08));
}

.stm-loading,
.stm-empty,
.stm-note {
  margin: 0;
  font-size: 0.8rem;
  opacity: 0.75;
}

.stm-saldo {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid var(--border);
}

.stm-saldo--up {
  border-color: color-mix(in srgb, var(--success, #16a34a) 40%, var(--border));
}

.stm-saldo--down {
  border-color: color-mix(in srgb, var(--danger, #dc2626) 40%, var(--border));
}

.stm-saldo-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.7;
}

.stm-saldo-value {
  font-size: 1.4rem;
  font-weight: 700;
}

.stm-saldo-word {
  font-size: 0.85rem;
  opacity: 0.85;
}

.stm-months {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stm-row {
  width: 100%;
  display: grid;
  grid-template-columns: 20px minmax(120px, 1.4fr) repeat(4, minmax(90px, 1fr));
  align-items: center;
  gap: 8px;
  padding: 10px 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-md, 8px);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.stm-row:hover {
  background: var(--surface-2, rgba(127, 127, 127, 0.08));
}

.stm-chevron {
  display: inline-flex;
  opacity: 0.7;
}

.stm-month-name {
  font-weight: 600;
  font-size: 0.9rem;
}

.stm-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.stm-cell-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  opacity: 0.6;
}

.stm-cell--strong {
  font-weight: 700;
}

.stm-up {
  color: var(--success, #16a34a);
}

.stm-down {
  color: var(--danger, #dc2626);
}

.stm-detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 8px 12px 28px;
}

.stm-adjustments,
.stm-days {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stm-adjustment {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  font-size: 0.82rem;
  border-radius: var(--radius-sm, 6px);
  background: var(--surface-2, rgba(127, 127, 127, 0.06));
}

.stm-adj-day {
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}

.stm-adj-reason {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stm-adj-by {
  font-size: 0.75rem;
  opacity: 0.65;
}

.stm-adj-remove {
  display: inline-flex;
  padding: 4px;
  border: none;
  border-radius: var(--radius-sm, 6px);
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.7;
}

.stm-adj-remove:hover:not(:disabled) {
  opacity: 1;
  color: var(--danger, #dc2626);
}

.stm-day {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) minmax(0, 1.2fr) repeat(3, minmax(70px, 0.8fr));
  gap: 8px;
  padding: 4px 8px;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}

.stm-day--holiday {
  opacity: 0.85;
}

.stm-day-holiday {
  font-size: 0.75rem;
  opacity: 0.7;
}

.stm-day-empty {
  opacity: 0.5;
}

@media (max-width: 720px) {
  .stm-row {
    grid-template-columns: 20px 1fr 1fr;
    row-gap: 6px;
  }

  .stm-day {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
