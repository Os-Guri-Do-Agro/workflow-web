<script setup lang="ts">
/**
 * "Agendar publicação" (R2, A3 e A4): uma linha por rede do card, com a conta
 * da marca, o modo (sozinho, rascunho no app ou à mão) e o formato. A cada
 * mudança o servidor confere a versão aprovada contra a regra da rede e do
 * formato e devolve o que falta em frase clara; com problema, o botão Agendar
 * fica travado. A hora é a "Publicação" do card (fonte única).
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { AlertTriangle, CalendarClock, Info, Loader2, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import { getApiErrorMessage } from '@/service/api'
import {
  checkSchedule,
  schedulePublications,
  type CardPublications,
  type Placement,
  type PublishMode,
  type PublishPlanRow,
  type ScheduleCheck,
  type ScheduleItem,
} from '@/service/marketing/marketing-social'
import { formatDayTime } from '../approvals/approvals-meta'
import { asText } from '../select-items'
import { networkIcon } from './network-icons'

const props = defineProps<{
  modelValue: boolean
  groupId: string
  cardId: string
  publishAt: string | null
  plan: PublishPlanRow[]
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  done: [result: CardPublications]
}>()

const rows = ref<ScheduleItem[]>([])
const check = ref<ScheduleCheck | null>(null)
const checking = ref(false)
const saving = ref(false)
/** Erro ao agendar (o POST) */
const error = ref('')
/** Erro da conferência: some quando a próxima dá certo, com "Conferir de novo" */
const checkError = ref('')

function reset() {
  rows.value = props.plan.map((p) => ({
    network: p.network,
    mode: p.defaultMode,
    placement: p.defaultPlacement,
    accountId: p.defaultMode === 'MANUAL' ? null : p.defaultAccountId,
  }))
  check.value = null
  error.value = ''
  checkError.value = ''
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      reset()
      void runCheck()
    }
  },
  { immediate: true },
)

let timer: ReturnType<typeof setTimeout> | null = null
let seq = 0
function scheduleCheck() {
  // Mudou algo: a conferência anterior não vale até a nova chegar.
  check.value = null
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void runCheck(), 250)
}
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})

async function runCheck() {
  const mine = ++seq
  checking.value = true
  try {
    const res = await checkSchedule(props.groupId, props.cardId, rows.value)
    if (mine === seq) {
      check.value = res
      checkError.value = ''
    }
  } catch (err) {
    if (mine === seq) {
      // Conferência velha não vale: sem ela, o Agendar fica travado.
      check.value = null
      checkError.value = getApiErrorMessage(err, 'Não deu para conferir agora.')
    }
  } finally {
    if (mine === seq) checking.value = false
  }
}

function planOf(network: string) {
  return props.plan.find((p) => p.network === network)!
}

function modeItems(p: PublishPlanRow) {
  return p.modes.filter((m) => m.available).map((m) => ({ label: m.label, value: m.value }))
}
function accountItems(p: PublishPlanRow) {
  return p.accounts
    .filter((a) => a.status === 'ACTIVE')
    .map((a) => ({ label: a.username ? `${a.name} (@${a.username.replace(/^@/, '')})` : a.name, value: a.id }))
}
function placementItems(p: PublishPlanRow) {
  return p.placements.map((x) => ({ label: x.label, value: x.value }))
}

function setMode(row: ScheduleItem, value: unknown) {
  const mode = asText(value) as PublishMode
  if (!mode || mode === row.mode) return
  row.mode = mode
  const p = planOf(row.network)
  row.accountId = mode === 'MANUAL' ? null : (row.accountId ?? p.defaultAccountId)
  scheduleCheck()
}
function setAccount(row: ScheduleItem, value: unknown) {
  row.accountId = asText(value) || null
  scheduleCheck()
}
function setPlacement(row: ScheduleItem, value: unknown) {
  const v = asText(value) as Placement
  if (!v || v === row.placement) return
  row.placement = v
  scheduleCheck()
}

function resultOf(network: string) {
  return check.value?.items.find((i) => i.network === network) ?? null
}

const blocked = computed(
  () => !check.value || !check.value.ok || checking.value || saving.value,
)

async function save() {
  if (blocked.value) return
  saving.value = true
  error.value = ''
  try {
    const result = await schedulePublications(props.groupId, props.cardId, rows.value)
    emit('done', result)
    emit('update:modelValue', false)
  } catch (err) {
    error.value = getApiErrorMessage(err, 'Não deu para agendar.')
    void runCheck()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppDialog :model-value="modelValue" label="Agendar publicação" size="lg" :loading="saving" @update:model-value="emit('update:modelValue', $event)">
    <div class="psd" data-testid="publish-dialog">
      <header class="psd__head">
        <h2>Agendar publicação</h2>
        <button type="button" class="mk-icon-btn" aria-label="Fechar" :disabled="saving" @click="emit('update:modelValue', false)">
          <X :size="16" />
        </button>
      </header>
      <div class="psd__body">
        <p class="psd__when">
          <CalendarClock :size="14" aria-hidden="true" />
          <span v-if="publishAt">Sai em <strong>{{ formatDayTime(publishAt) }}</strong> (Brasília). Para mudar a hora, mude a Publicação no card: o agendado acompanha.</span>
          <span v-else>O card ainda não tem data de publicação.</span>
        </p>

        <ul v-if="check?.global.length" class="psd__global" role="alert" data-testid="publish-global">
          <li v-for="(g, i) in check.global" :key="i"><AlertTriangle :size="14" aria-hidden="true" /> {{ g }}</li>
        </ul>

        <ul class="psd__rows" role="list">
          <li v-for="row in rows" :key="row.network" class="psd__row" :data-network="row.network">
            <div class="psd__row-head">
              <component :is="networkIcon(row.network)" :size="16" aria-hidden="true" />
              <strong>{{ planOf(row.network).label }}</strong>
              <span v-if="planOf(row.network).alreadyPublished" class="mk-chip">Já publicado</span>
            </div>
            <div class="psd__fields">
              <div class="mk-field" data-field="mode">
                <span class="mk-label">Como sai</span>
                <AppSelect
                  :model-value="row.mode"
                  :items="modeItems(planOf(row.network))"
                  :label="`Como sai no ${planOf(row.network).label}`"
                  density="compact"
                  :disabled="saving"
                  @update:model-value="setMode(row, $event)"
                />
              </div>
              <div v-if="row.mode !== 'MANUAL'" class="mk-field" data-field="account">
                <span class="mk-label">Conta</span>
                <AppSelect
                  :model-value="row.accountId ?? ''"
                  :items="accountItems(planOf(row.network))"
                  :label="`Conta do ${planOf(row.network).label}`"
                  placeholder="Escolha a conta"
                  density="compact"
                  :disabled="saving"
                  @update:model-value="setAccount(row, $event)"
                />
              </div>
              <div v-if="row.mode !== 'MANUAL'" class="mk-field" data-field="placement">
                <span class="mk-label">Formato</span>
                <AppSelect
                  :model-value="row.placement"
                  :items="placementItems(planOf(row.network))"
                  :label="`Formato no ${planOf(row.network).label}`"
                  density="compact"
                  :disabled="saving"
                  @update:model-value="setPlacement(row, $event)"
                />
              </div>
            </div>
            <p v-if="row.mode !== 'MANUAL' && !row.accountId && planOf(row.network).accountRequired" class="psd__hint" data-testid="account-required">
              <Info :size="13" aria-hidden="true" /> Esta marca tem mais de uma conta nesta rede: escolha qual publica.
            </p>
            <p v-if="planOf(row.network).hint && row.mode === 'MANUAL'" class="psd__hint">
              <Info :size="13" aria-hidden="true" /> {{ planOf(row.network).hint }}
            </p>
            <p v-else-if="row.mode === 'MANUAL'" class="psd__hint">
              <Info :size="13" aria-hidden="true" /> Na hora, chega o aviso "Hora de publicar" para o responsável, com a arte e a legenda prontas no card.
            </p>
            <p v-else-if="row.mode === 'DRAFT'" class="psd__hint">
              <Info :size="13" aria-hidden="true" /> O vídeo vai para a caixa de entrada do app; quem é da conta abre o app e publica.
            </p>
            <ul v-if="resultOf(row.network)?.problems.length" class="psd__problems" role="alert" data-testid="publish-problems">
              <li v-for="(p, i) in resultOf(row.network)!.problems" :key="i">{{ p }}</li>
            </ul>
            <ul v-if="resultOf(row.network)?.warnings.length" class="psd__warnings">
              <li v-for="(w, i) in resultOf(row.network)!.warnings" :key="i">{{ w }}</li>
            </ul>
          </li>
        </ul>
        <div v-if="checkError" class="psd__check-error" role="alert" data-testid="check-error">
          <span>{{ checkError }}</span>
          <button type="button" class="mk-btn mk-btn--ghost" :disabled="checking" data-action="recheck" @click="runCheck">Conferir de novo</button>
        </div>
        <p v-if="error" class="mk-error" role="alert">{{ error }}</p>
      </div>
      <footer class="psd__foot">
        <span class="psd__status" aria-live="polite">
          <template v-if="checking"><Loader2 :size="13" class="psd__spin" aria-hidden="true" /> Conferindo a mídia</template>
          <template v-else-if="checkError">Sem conferência, o Agendar fica travado.</template>
          <template v-else-if="check && check.ok">Tudo certo para agendar.</template>
          <template v-else-if="check">Corrija o que está em vermelho para agendar.</template>
        </span>
        <button type="button" class="mk-btn mk-btn--ghost" :disabled="saving" @click="emit('update:modelValue', false)">Cancelar</button>
        <button type="button" class="mk-btn mk-btn--primary" :disabled="blocked" data-action="confirm-schedule" @click="save">
          <Loader2 v-if="saving" :size="14" class="psd__spin" aria-hidden="true" />
          Agendar
        </button>
      </footer>
    </div>
  </AppDialog>
</template>

<style scoped>
.psd {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  max-height: calc(100vh - 40px);
  max-height: calc(100dvh - 40px);
}

.psd__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px 8px;
}

.psd__head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.psd__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 16px 14px;
}

.psd__when {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 13px;
  color: var(--text-2);
}

.psd__global,
.psd__problems,
.psd__warnings {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12.5px;
}

.psd__global li {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--err) 35%, var(--border));
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--err) 6%, var(--surface));
  color: var(--text);
}

.psd__problems li {
  color: var(--err);
}

.psd__check-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--err) 35%, var(--border));
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  color: var(--err);
}

.psd__problems li::before,
.psd__warnings li::before {
  content: '';
  display: inline-block;
  width: 5px;
  height: 5px;
  margin: 0 7px 2px 0;
  border-radius: 50%;
  background: currentColor;
}

.psd__warnings li {
  color: var(--due-soon, var(--text-2));
}

.psd__rows {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.psd__row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

.psd__row:last-child {
  border-bottom: 0;
}

.psd__row-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.psd__fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.psd__hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
}

.psd__foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

.psd__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: auto;
  font-size: 12px;
  color: var(--text-3);
}

.psd__spin {
  animation: psd-spin 0.9s linear infinite;
}

@keyframes psd-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .psd__fields {
    grid-template-columns: minmax(0, 1fr);
  }

  .psd__fields :deep(.app-select__trigger) {
    min-height: 44px;
  }

  .psd__foot {
    flex-wrap: wrap;
  }

  .psd__status {
    flex-basis: 100%;
  }

  .psd__foot .mk-btn {
    flex: 1;
    min-height: 44px;
  }
}
</style>
