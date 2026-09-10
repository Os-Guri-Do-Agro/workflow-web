<script setup lang="ts">
/**
 * Lançar ajuste no banco de horas (spec banco-de-horas-extrato-acumulado, D6).
 *
 * Por que existe: o saldo é calculado dos apontamentos, e dia útil sem
 * apontamento é dívida. Isso é correto para quem faltou e injusto para quem
 * trabalhou com o cronômetro desligado, tirou férias ou já estava na empresa
 * antes de o time adotar o timer — nos dados reais, isso significava centenas
 * de horas de dívida em quem quase não usava o cronômetro.
 *
 * O ajuste é um LANÇAMENTO, não uma exceção no cálculo: tem dia, valor, motivo
 * e autor, e aparece como linha no extrato. Por isso o motivo é obrigatório
 * aqui — um saldo corrigido que ninguém consegue explicar é pior que um saldo
 * errado.
 */
import { computed, ref, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { Loader2, X } from 'lucide-vue-next'
import companiesService from '@/service/companies/companies-services'
import { useAdjustmentMutations } from '@/features/time/composables/useBalance'
import { localDay } from '@/features/time/composables/useBalance'
import { useWorkspaceStore } from '@/stores/workspaceStores'

const modelValue = defineModel<boolean>({ required: true })

const workspace = useWorkspaceStore()
const empresa = computed(() => workspace.activeCompanyId)

type Membro = { role: string; user: { id: string; name: string; email: string } }

const membros = useQuery({
  queryKey: computed(() => ['company', 'members', empresa.value]),
  queryFn: async () => {
    const dados = (await companiesService.getCompanyMembers(
      empresa.value as string,
    )) as Membro[]
    return dados
  },
  enabled: computed(() => !!empresa.value && modelValue.value),
  staleTime: 300_000,
})

const userId = ref('')
const day = ref(localDay(new Date()))
/** Em HORAS, com sinal: é como a pessoa pensa ("dar 40h para o Fulano"). */
const horas = ref<number | null>(null)
const reason = ref('')

const { criar } = useAdjustmentMutations(empresa)

const podeSalvar = computed(
  () =>
    !!userId.value &&
    !!day.value &&
    !!horas.value &&
    reason.value.trim().length >= 3 &&
    !criar.isPending.value,
)

const previa = computed(() => {
  if (!horas.value) return null
  const sinal = horas.value >= 0 ? 'crédito de' : 'débito de'
  return `${sinal} ${Math.abs(horas.value)}h`
})

function fechar() {
  modelValue.value = false
}

// Reabrir com o formulário sujo faria o próximo lançamento herdar o motivo do
// anterior — e motivo errado num ajuste é pior que ajuste nenhum.
watch(modelValue, (aberto) => {
  if (!aberto) return
  userId.value = ''
  day.value = localDay(new Date())
  horas.value = null
  reason.value = ''
})

async function salvar() {
  if (!podeSalvar.value || horas.value === null) return
  await criar.mutateAsync({
    userId: userId.value,
    day: day.value,
    // O backend trabalha em segundos; a tela fala em horas.
    seconds: Math.round(horas.value * 3600),
    reason: reason.value.trim(),
  })
  fechar()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="adj-fade">
      <div v-if="modelValue" class="adj-overlay" @mousedown.self="fechar">
        <section class="adj" role="dialog" aria-modal="true" aria-label="Lançar ajuste">
          <header class="adj-head">
            <h2>Lançar ajuste de saldo</h2>
            <button type="button" class="adj-close" aria-label="Fechar" @click="fechar">
              <X :size="16" />
            </button>
          </header>

          <form class="adj-body" @submit.prevent="salvar">
            <label class="adj-field">
              <span>Pessoa</span>
              <select v-model="userId" required>
                <option value="" disabled>Selecione</option>
                <option v-for="m in membros.data.value ?? []" :key="m.user.id" :value="m.user.id">
                  {{ m.user.name }}
                </option>
              </select>
            </label>

            <label class="adj-field">
              <span>Dia</span>
              <input v-model="day" type="date" required />
              <small>O ajuste entra no mês deste dia.</small>
            </label>

            <label class="adj-field">
              <span>Horas</span>
              <input
                v-model.number="horas"
                type="number"
                step="0.25"
                placeholder="Ex.: 40 para creditar, -8 para debitar"
                required
              />
              <small v-if="previa">Vai lançar um {{ previa }}.</small>
              <small v-else>Positivo credita, negativo debita.</small>
            </label>

            <label class="adj-field">
              <span>Motivo</span>
              <input
                v-model="reason"
                type="text"
                maxlength="280"
                placeholder="Ex.: acerto de julho, trabalho feito sem o cronômetro"
                required
              />
              <small>Aparece no extrato, junto do valor.</small>
            </label>

            <p v-if="criar.isError.value" class="adj-error">
              Não foi possível lançar. Só quem administra a empresa pode fazer isto.
            </p>

            <footer class="adj-actions">
              <button type="button" class="adj-btn" @click="fechar">Cancelar</button>
              <button type="submit" class="adj-btn adj-btn--primary" :disabled="!podeSalvar">
                <Loader2 v-if="criar.isPending.value" :size="14" class="adj-spin" />
                <span>Lançar</span>
              </button>
            </footer>
          </form>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.adj-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.45);
}

.adj {
  width: min(460px, 100%);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  overflow: hidden;
}

.adj-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}

.adj-head h2 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.adj-close {
  display: inline-flex;
  padding: 4px;
  border: none;
  border-radius: var(--radius-sm, 6px);
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.adj-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.adj-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
}

.adj-field > span {
  font-weight: 600;
}

.adj-field input,
.adj-field select {
  padding: 8px 10px;
  font: inherit;
  color: inherit;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 8px);
  background: var(--surface-2, transparent);
}

.adj-field small {
  font-size: 0.75rem;
  opacity: 0.7;
}

.adj-error {
  margin: 0;
  font-size: 0.8rem;
  color: var(--danger, #dc2626);
}

.adj-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}

.adj-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  font: inherit;
  font-size: 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 8px);
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.adj-btn--primary {
  background: var(--primary, #2563eb);
  border-color: transparent;
  color: #fff;
}

.adj-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.adj-spin {
  animation: adj-rotate 1s linear infinite;
}

@keyframes adj-rotate {
  to {
    transform: rotate(360deg);
  }
}

.adj-fade-enter-active,
.adj-fade-leave-active {
  transition: opacity 0.15s ease;
}

.adj-fade-enter-from,
.adj-fade-leave-to {
  opacity: 0;
}
</style>
