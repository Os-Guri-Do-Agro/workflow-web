<script setup lang="ts">
/**
 * Jornada de trabalho (spec banco-de-horas).
 *
 * Configurar é OPCIONAL: sem nada aqui vale 8h48 por dia útil, que fecha as 44h
 * semanais com sábado livre. A tela existe para quem tem escala diferente, e
 * por isso ela mostra o padrão em vigor antes de pedir qualquer coisa — quem
 * não precisa mexer descobre isso sem clicar.
 *
 * Por dia da semana, e não um número só, porque jornada real não é uniforme:
 * sexta curta é comum, e a média esconderia a dívida de toda sexta-feira.
 */
import { computed, ref, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { CalendarClock, RotateCcw } from 'lucide-vue-next'
import timeService from '@/service/time/time-service'
import { useToast } from '@/composables/useToast'
import { timeKeys } from '@/composables/useTimeTracking'
import { localDay } from '@/features/time/composables/useBalance'

const { success, error: showError } = useToast()
const queryClient = useQueryClient()

const { data, isLoading } = useQuery({
  queryKey: ['time', 'schedule'],
  queryFn: () => timeService.getSchedule(),
  staleTime: 5 * 60_000,
})

const DIAS = [
  { key: 'monSec', label: 'Seg' },
  { key: 'tueSec', label: 'Ter' },
  { key: 'wedSec', label: 'Qua' },
  { key: 'thuSec', label: 'Qui' },
  { key: 'friSec', label: 'Sex' },
  { key: 'satSec', label: 'Sáb' },
  { key: 'sunSec', label: 'Dom' },
] as const

type DiaKey = (typeof DIAS)[number]['key']

/** Os campos são editados em HH:MM, que é como as pessoas pensam jornada. */
const form = ref<Record<DiaKey, string>>({
  monSec: '08:48',
  tueSec: '08:48',
  wedSec: '08:48',
  thuSec: '08:48',
  friSec: '08:48',
  satSec: '00:00',
  sunSec: '00:00',
})

const salvando = ref(false)
const editando = ref(false)

function toHHMM(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function toSec(hhmm: string): number {
  const [h = NaN, m = NaN] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  // Mesmo teto do DTO (16h): erro de digitação não pode criar dívida absurda.
  return Math.max(0, Math.min(16 * 3600, h * 3600 + m * 60))
}

// Carrega a jornada gravada quando ela chega; sem nada gravado, o formulário já
// nasce com o padrão da casa.
watch(
  data,
  (d) => {
    if (!d?.current) return
    for (const { key } of DIAS) form.value[key] = toHHMM(d.current[key])
  },
  { immediate: true },
)

const semanaSec = computed(() =>
  DIAS.reduce((total, { key }) => total + toSec(form.value[key]), 0),
)

const semanaLabel = computed(() => {
  const sec = semanaSec.value
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
})

const usandoPadrao = computed(() => !data.value?.current)

async function salvar() {
  salvando.value = true
  try {
    await timeService.setSchedule({
      // Explícito, no dia LOCAL: deixar o servidor decidir "hoje" faria a
      // jornada valer só amanhã para quem salva à noite em UTC−3.
      validFrom: localDay(new Date()),
      monSec: toSec(form.value.monSec),
      tueSec: toSec(form.value.tueSec),
      wedSec: toSec(form.value.wedSec),
      thuSec: toSec(form.value.thuSec),
      friSec: toSec(form.value.friSec),
      satSec: toSec(form.value.satSec),
      sunSec: toSec(form.value.sunSec),
    })
    // O saldo depende da jornada: sem invalidar, a tela do Meu tempo continuaria
    // mostrando o cálculo antigo até o cache expirar.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['time', 'schedule'] }),
      queryClient.invalidateQueries({ queryKey: timeKeys.balance }),
      queryClient.invalidateQueries({ queryKey: timeKeys.companyBalance }),
    ])
    editando.value = false
    success('Jornada salva. O banco de horas já usa ela.')
  } catch {
    showError('Não foi possível salvar a jornada')
  } finally {
    salvando.value = false
  }
}

function restaurarPadrao() {
  form.value = {
    monSec: '08:48',
    tueSec: '08:48',
    wedSec: '08:48',
    thuSec: '08:48',
    friSec: '08:48',
    satSec: '00:00',
    sunSec: '00:00',
  }
}
</script>

<template>
  <div class="ws">
    <div class="setting-row">
      <div class="setting-info">
        <span class="setting-label">Minha jornada</span>
        <span class="setting-desc">
          <template v-if="usandoPadrao">
            Você está no padrão: <strong>8h48 por dia útil</strong>, que fecha 44h por semana
            com o sábado livre. Fim de semana e feriado nacional não cobram meta.
          </template>
          <template v-else>
            Sua jornada é de <strong>{{ semanaLabel }}</strong> por semana. Feriado nacional
            continua zerando a meta do dia.
          </template>
        </span>
      </div>
      <button v-if="!editando" class="ws-btn" type="button" @click="editando = true">
        <CalendarClock :size="13" />
        {{ usandoPadrao ? 'Definir a minha' : 'Alterar' }}
      </button>
    </div>

    <div v-if="editando" class="ws-editor">
      <p v-if="isLoading" class="ws-loading">Carregando…</p>
      <template v-else>
        <div class="ws-days">
          <label v-for="dia in DIAS" :key="dia.key" class="ws-day">
            <span class="ws-day-label">{{ dia.label }}</span>
            <input
              v-model="form[dia.key]"
              class="ws-day-input"
              type="time"
              step="60"
              :aria-label="`Meta de ${dia.label}`"
            />
          </label>
        </div>

        <div class="ws-foot">
          <span class="ws-total">
            Total da semana: <strong>{{ semanaLabel }}</strong>
          </span>
          <div class="ws-actions">
            <button class="ws-btn ws-btn--ghost" type="button" @click="restaurarPadrao">
              <RotateCcw :size="12" /> Padrão
            </button>
            <button class="ws-btn ws-btn--ghost" type="button" @click="editando = false">
              Cancelar
            </button>
            <button class="ws-btn ws-btn--primary" type="button" :disabled="salvando" @click="salvar">
              Salvar
            </button>
          </div>
        </div>

        <p class="ws-note">
          Vale a partir de hoje. O saldo dos dias anteriores continua calculado com a jornada
          que valia neles, então alterar aqui não reescreve mês fechado.
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ws {
  display: contents;
}

.ws-editor {
  padding: 12px 0 4px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ws-days {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
  gap: 8px;
}

.ws-day {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ws-day-label {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-4);
}

.ws-day-input {
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
}

.ws-day-input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.ws-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.ws-total {
  font-size: 12px;
  color: var(--text-3);
}

.ws-actions {
  display: flex;
  gap: 6px;
}

.ws-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  padding: 0 11px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 650;
  cursor: pointer;
}

.ws-btn:hover:not(:disabled) {
  background: var(--surface-3);
}

.ws-btn--ghost {
  border-color: var(--border);
  color: var(--text-3);
}

.ws-btn--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-fg);
}

.ws-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ws-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-4);
}

.ws-loading {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}
</style>
