<script setup lang="ts">
/**
 * Modal global de criação de empresa (Teleport + tokens, padrão ConfirmDialog —
 * nada de v-dialog em código novo). Controlado pelo singleton
 * `useCompanyCreation`, montado UMA vez no AppShell. Serve o fluxo de onboarding
 * (usuário sem empresa) e o "começar outro projeto" da sidebar.
 *
 * Backend (company.service.create): usuário sem nenhum vínculo cria a primeira
 * empresa e vira ADMIN dela; ADMIN pode criar outras. O create já vincula o
 * criador como ADMIN e devolve a empresa com id, então aqui a gente ativa a
 * empresa nova e leva pro dashboard dela.
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Building2, Loader2, X } from 'lucide-vue-next'
import companieService from '@/service/companies/companies-services'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { useCompanyCreation } from '@/composables/useCompanyCreation'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'

const { isOpen, closeCreateCompany } = useCompanyCreation()
const workspace = useWorkspaceStore()
const router = useRouter()
const { success, error: showError } = useToast()

const name = ref('')
const cnpj = ref('')
const loading = ref(false)
const nameEl = ref<HTMLInputElement | null>(null)

// Onboarding = ainda não tem nenhuma empresa. Muda só a copy, não o fluxo.
const isFirst = computed(() => workspace.companies.length === 0)
const title = computed(() => (isFirst.value ? 'Crie sua empresa' : 'Começar outro projeto'))
const subtitle = computed(() =>
  isFirst.value
    ? 'Uma empresa é o seu espaço para organizar tarefas, tempo e ideias. Leva 10 segundos.'
    : 'Um novo espaço, separado, para organizar outro conjunto de ideias.',
)

const cnpjDigits = computed(() => cnpj.value.replace(/\D/g, ''))
const canSubmit = computed(() => name.value.trim().length > 0 && cnpjDigits.value.length === 14)

function maskCnpj(raw: string): string {
  const cleaned = raw.replace(/\D/g, '').slice(0, 14)
  return cleaned
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

function onCnpjInput(e: Event) {
  cnpj.value = maskCnpj((e.target as HTMLInputElement).value)
}

function reset() {
  name.value = ''
  cnpj.value = ''
  loading.value = false
}

function close() {
  if (loading.value) return
  closeCreateCompany()
}

// Foca o nome ao abrir e limpa ao fechar.
watch(isOpen, (open) => {
  if (open) {
    reset()
    requestAnimationFrame(() => nameEl.value?.focus())
  }
})

async function submit() {
  if (!canSubmit.value || loading.value) return
  loading.value = true
  try {
    const created = await companieService.postCompany({
      name: name.value.trim(),
      cnpj: cnpj.value,
    })
    // O create devolve a empresa (com id) e já vincula o criador como ADMIN.
    await workspace.fetchCompanies()
    const newId: string | undefined =
      created?.id ??
      created?.company?.id ??
      [...workspace.companies]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.id
    if (newId) workspace.setActiveCompany(newId)

    success('Empresa criada. Bora organizar.')
    closeCreateCompany()
    reset()
    await router.push('/')
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não foi possível criar a empresa agora.'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="cc-fade">
      <div v-if="isOpen" class="cc-overlay" @mousedown.self="close">
        <section class="cc-dialog" role="dialog" aria-modal="true" :aria-label="title">
          <header class="cc-head">
            <span class="cc-icon">
              <Building2 :size="18" />
            </span>
            <button class="cc-close" type="button" aria-label="Fechar" :disabled="loading" @click="close">
              <X :size="16" />
            </button>
          </header>

          <div class="cc-intro">
            <h2>{{ title }}</h2>
            <p>{{ subtitle }}</p>
          </div>

          <form class="cc-form" @submit.prevent="submit">
            <label class="cc-field">
              <span class="cc-label">Nome</span>
              <input
                ref="nameEl"
                v-model="name"
                class="cc-input"
                type="text"
                placeholder="Ex.: Minhas ideias, Estúdio, Loja..."
                maxlength="80"
                autocomplete="off"
              />
            </label>

            <label class="cc-field">
              <span class="cc-label">CNPJ</span>
              <input
                :value="cnpj"
                class="cc-input"
                type="text"
                inputmode="numeric"
                placeholder="00.000.000/0000-00"
                maxlength="18"
                autocomplete="off"
                @input="onCnpjInput"
              />
              <span class="cc-hint">Obrigatório para criar a empresa.</span>
            </label>

            <div class="cc-actions">
              <button class="cc-cancel press" type="button" :disabled="loading" @click="close">
                Cancelar
              </button>
              <button class="cc-submit press" type="submit" :disabled="!canSubmit || loading">
                <Loader2 v-if="loading" :size="14" class="cc-spin" />
                {{ isFirst ? 'Criar e começar' : 'Criar projeto' }}
              </button>
            </div>
          </form>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cc-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(10px);
}

.cc-dialog {
  width: min(440px, 100%);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-overlay);
  padding: 18px;
}

.cc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.cc-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
  color: var(--accent);
}

.cc-close {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
  transition: color var(--motion-fast) var(--motion-ease), border-color var(--motion-fast) var(--motion-ease);
}

.cc-close:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.cc-close:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.cc-intro h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.cc-intro p {
  margin: 7px 0 0;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.5;
}

.cc-form {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cc-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cc-label {
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-3);
}

.cc-input {
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 14px;
  outline: none;
  transition: border-color var(--motion-fast) var(--motion-ease), box-shadow var(--motion-fast) var(--motion-ease);
}

.cc-input::placeholder {
  color: var(--text-4);
}

.cc-input:focus {
  border-color: color-mix(in srgb, var(--accent) 60%, var(--border-strong));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}

.cc-hint {
  font-size: 11.5px;
  color: var(--text-4);
}

.cc-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.cc-cancel,
.cc-submit {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: var(--radius);
  padding: 8px 16px;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.cc-cancel {
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
}

.cc-submit {
  border: 1px solid color-mix(in srgb, var(--accent) 60%, var(--border));
  background: var(--accent);
  color: var(--accent-fg);
}

.cc-submit:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.cc-spin {
  animation: cc-spin 0.8s linear infinite;
}

.cc-fade-enter-active,
.cc-fade-leave-active {
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.cc-fade-enter-from,
.cc-fade-leave-to {
  opacity: 0;
}

@keyframes cc-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
