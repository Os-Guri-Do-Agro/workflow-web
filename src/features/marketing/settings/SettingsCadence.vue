<script setup lang="ts">
/**
 * Meta de cadência (spec R2, C4): quantos posts por semana cada marca precisa
 * ter Agendados ou Publicados em cada rede. Da quarta em diante, se a semana
 * não bate, os Admins e Editores da marca recebem um aviso (uma vez por
 * semana). O painel inicial mostra "Cadência da semana: 2 de 3 no Instagram".
 *
 * Admin e Dono mudam; os outros papéis veem a leitura.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { Gauge, Trash2 } from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useToast } from '@/composables/useToast'
import type { MarketingBrand } from '@/service/marketing/marketing-core'
import {
  getCadence,
  removeCadenceGoal,
  saveCadenceGoal,
  type CadenceGoal,
} from '@/service/marketing/marketing-notify'
import { apiErrorMessage } from '../calendar/api-error'
import LibraryCheck from '../library/LibraryCheck.vue'
import { brandTone, CARD_NETWORK_LABEL, toneStyle } from '../marketing-labels'
import { asText, selectItems } from '../select-items'

const props = defineProps<{ groupId: string; brands: MarketingBrand[]; canEdit: boolean }>()
const qc = useQueryClient()
const toast = useToast()

const key = computed(() => ['marketing', props.groupId, 'cadence'] as const)
const cadence = useQuery({ queryKey: key, queryFn: () => getCadence(props.groupId) })
const goals = computed(() => cadence.data.value?.goals ?? [])
const week = computed(() => cadence.data.value?.week ?? null)

const NETWORKS = Object.keys(CARD_NETWORK_LABEL) as Array<keyof typeof CARD_NETWORK_LABEL>
const brandItems = computed(() => selectItems(props.brands, (b) => b.companyId, (b) => b.name))
const networkItems = selectItems(NETWORKS, (n) => n, (n) => CARD_NETWORK_LABEL[n])
const brandOf = (id: string) => props.brands.find((b) => b.companyId === id)

const newBrand = ref(props.brands[0]?.companyId ?? '')
const newNetwork = ref<string>('INSTAGRAM')
const newPerWeek = ref(3)

const refresh = () => qc.invalidateQueries({ queryKey: ['marketing', props.groupId] })
const save = useMutation({
  mutationFn: (body: { companyId: string; network: string; perWeek: number; active?: boolean }) =>
    saveCadenceGoal(props.groupId, body),
  onSuccess: async () => {
    toast.success('Meta salva.')
    await refresh()
  },
  onError: async (err) => {
    toast.error(apiErrorMessage(err, 'Não deu para salvar a meta.'))
    await refresh()
  },
})
/** "Tirar a meta" pede confirmação (auditoria da parte C: um clique sumia com ela). */
const toRemove = ref<CadenceGoal | null>(null)
const remove = useMutation({
  mutationFn: (goal: CadenceGoal) => removeCadenceGoal(props.groupId, goal.id),
  onSuccess: async () => {
    toast.success('Meta tirada.')
    toRemove.value = null
    await refresh()
  },
  onError: (err) => toast.error(apiErrorMessage(err, 'Não deu para tirar a meta.')),
})
const removeMessage = computed(() => {
  const g = toRemove.value
  if (!g) return ''
  return `A meta de ${g.perWeek} por semana no ${g.networkName} da ${brandOf(g.companyId)?.name ?? 'marca'} sai: o painel deixa de mostrar a cadência e o aviso de quarta para de sair. Dá para criar de novo depois.`
})

function addGoal() {
  const perWeek = Math.floor(Number(newPerWeek.value))
  if (!newBrand.value || !newNetwork.value || !perWeek) return
  save.mutate({ companyId: newBrand.value, network: newNetwork.value, perWeek, active: true })
}
function setPerWeek(goal: CadenceGoal, raw: string) {
  const perWeek = Math.floor(Number(raw))
  if (!perWeek || perWeek === goal.perWeek) return
  save.mutate({ companyId: goal.companyId, network: goal.network, perWeek, active: goal.active })
}

/**
 * O número salva depois de uma pausa (auditoria da parte C): a setinha do
 * campo dispara um `change` a cada clique, e subir de 3 para 6 mandava três
 * pedidos (e três "Meta salva."). Enter ou sair do campo salva na hora.
 */
const PER_WEEK_DEBOUNCE_MS = 700
const pendingPerWeek = new Map<string, { timer: ReturnType<typeof setTimeout>; goal: CadenceGoal; raw: string }>()
function queuePerWeek(goal: CadenceGoal, raw: string) {
  const prev = pendingPerWeek.get(goal.id)
  if (prev) clearTimeout(prev.timer)
  const timer = setTimeout(() => flushPerWeek(goal.id), PER_WEEK_DEBOUNCE_MS)
  pendingPerWeek.set(goal.id, { timer, goal, raw })
}
function flushPerWeek(goalId: string) {
  const p = pendingPerWeek.get(goalId)
  if (!p) return
  clearTimeout(p.timer)
  pendingPerWeek.delete(goalId)
  setPerWeek(p.goal, p.raw)
}
// Saiu da tela com um número esperando: salva o que foi digitado.
onBeforeUnmount(() => {
  for (const id of [...pendingPerWeek.keys()]) flushPerWeek(id)
})
function toggleActive(goal: CadenceGoal) {
  save.mutate({ companyId: goal.companyId, network: goal.network, perWeek: goal.perWeek, active: !goal.active })
}
const weekLabel = computed(() => {
  const w = week.value
  if (!w) return ''
  const br = (ymd: string) => ymd.split('-').reverse().slice(0, 2).join('/')
  return `${br(w.monday)} a ${br(w.sunday)}`
})
</script>

<template>
  <section class="mk-panel" data-section="cadence">
    <header class="mk-panel__head sc__head">
      <Gauge :size="15" aria-hidden="true" /> Meta de cadência
      <span v-if="weekLabel" class="sc__week">Semana de {{ weekLabel }}</span>
    </header>
    <div class="mk-panel__body sc">
      <p class="mk-hint">
        Quantos posts por semana cada marca precisa ter agendados ou publicados em cada rede. Da quarta-feira em diante,
        se a semana não bate, os Admins e Editores da marca recebem um aviso, uma vez por semana.
      </p>

      <div v-if="cadence.isLoading.value" class="sc__loading"><Skeleton type="row" /><Skeleton type="row" /></div>
      <div v-else-if="cadence.isError.value" class="mk-load-error" role="alert">
        {{ apiErrorMessage(cadence.error.value, 'Não deu para abrir as metas.') }}
        <button type="button" class="mk-btn mk-btn--ghost" @click="cadence.refetch()">Tentar de novo</button>
      </div>
      <template v-else>
        <div v-if="goals.length" class="sc__scroll">
          <table class="mk-table sc__table" data-testid="cadence-table">
            <thead>
              <tr>
                <th>Marca</th>
                <th>Rede</th>
                <th class="mk-num">Por semana</th>
                <th class="mk-num">Esta semana</th>
                <th>Ativa</th>
                <th v-if="canEdit"><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="g in goals" :key="g.id" :data-goal="`${g.companyId}:${g.network}`" :class="{ 'is-off': !g.active }">
                <td>
                  <span class="sc__brand">
                    <span class="mk-dot" :style="toneStyle(brandTone(brandOf(g.companyId)))" aria-hidden="true" />
                    {{ brandOf(g.companyId)?.name ?? 'Marca' }}
                  </span>
                </td>
                <td>{{ g.networkName }}</td>
                <td class="mk-num">
                  <input
                    v-if="canEdit"
                    class="mk-input sc__num"
                    type="number"
                    min="1"
                    max="50"
                    :value="g.perWeek"
                    :aria-label="`Meta por semana no ${g.networkName}`"
                    data-field="cadence-per-week"
                    @input="queuePerWeek(g, ($event.target as HTMLInputElement).value)"
                    @keydown.enter.prevent="flushPerWeek(g.id)"
                    @blur="flushPerWeek(g.id)"
                  />
                  <span v-else>{{ g.perWeek }}</span>
                </td>
                <td class="mk-num">
                  <span class="mk-chip" :data-tone="g.met ? 'green' : 'amber'" :style="toneStyle(g.met ? 'green' : 'amber')">
                    {{ g.done }} de {{ g.perWeek }}
                  </span>
                </td>
                <td>
                  <LibraryCheck
                    v-if="canEdit"
                    :checked="g.active"
                    :label="g.active ? `Pausar a meta do ${g.networkName}` : `Ligar a meta do ${g.networkName}`"
                    @toggle="toggleActive(g)"
                  />
                  <span v-else>{{ g.active ? 'Sim' : 'Pausada' }}</span>
                </td>
                <td v-if="canEdit" class="sc__actions">
                  <button
                    type="button"
                    class="mk-icon-btn"
                    :aria-label="`Tirar a meta do ${g.networkName}`"
                    title="Tirar a meta"
                    data-action="remove-goal"
                    @click="toRemove = g"
                  >
                    <Trash2 :size="14" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="mk-hint" data-testid="cadence-empty">Nenhuma meta ainda.</p>

        <form v-if="canEdit && brands.length" class="sc__add" data-testid="cadence-add" @submit.prevent="addGoal">
          <div class="sc__field">
            <span class="mk-label">Marca</span>
            <AppSelect
              :model-value="newBrand"
              :items="brandItems"
              label="Marca da meta"
              density="compact"
              @update:model-value="newBrand = asText($event)"
            />
          </div>
          <div class="sc__field">
            <span class="mk-label">Rede</span>
            <AppSelect
              :model-value="newNetwork"
              :items="networkItems"
              label="Rede da meta"
              density="compact"
              @update:model-value="newNetwork = asText($event)"
            />
          </div>
          <label class="sc__field sc__field--num">
            <span class="mk-label">Por semana</span>
            <input v-model.number="newPerWeek" class="mk-input" type="number" min="1" max="50" aria-label="Posts por semana" />
          </label>
          <button type="submit" class="mk-btn mk-btn--primary" :disabled="save.isPending.value">Salvar meta</button>
        </form>
        <p v-else-if="!canEdit" class="mk-hint">Só Admin e Dono mudam as metas.</p>
      </template>
    </div>
    <ConfirmDialog
      :model-value="!!toRemove"
      title="Tirar a meta?"
      :message="removeMessage"
      confirm-label="Tirar a meta"
      danger
      :loading="remove.isPending.value"
      @update:model-value="!$event && (toRemove = null)"
      @confirm="toRemove && remove.mutate(toRemove)"
    />
  </section>
</template>

<style scoped>
.sc {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sc__head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sc__week {
  margin-left: auto;
  font-weight: 500;
  font-size: 12px;
  color: var(--text-3);
}
.sc__loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sc__scroll {
  overflow-x: auto;
}
.sc__table .is-off td {
  color: var(--text-3);
}
.sc__brand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.sc__num {
  width: 70px;
  text-align: right;
}
.sc__actions {
  text-align: right;
}
.sc__add {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}
.sc__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 170px;
}
.sc__field--num {
  min-width: 90px;
  width: 110px;
}
@media (max-width: 640px) {
  .sc__field,
  .sc__field--num {
    width: 100%;
    min-width: 0;
  }
  .sc__add .mk-btn {
    min-height: 44px;
    width: 100%;
  }
}
</style>
