<script setup lang="ts">
/**
 * Modal de cadastro de empresa da tela de usuários (padrão AppDialog + tokens,
 * sem v-dialog). NÃO confundir com o CompanyCreateOverlay global (onboarding /
 * "começar outro projeto"): este aqui é o CRUD admin, com activator próprio
 * "Nova Empresa" e emit('created') para o pai recarregar a lista.
 */
import { ref } from 'vue'
import { Building2, Loader2, X } from 'lucide-vue-next'
import companieService from '@/service/companies/companies-services'
import { useToast } from '@/composables/useToast'
import AppDialog from '@/components/ui/AppDialog.vue'

const { success, error: showError } = useToast()

const emit = defineEmits(['created'])

const open = ref(false)
const loading = ref(false)
const formData = ref({ name: '', cnpj: '' })
const errors = ref({ name: '', cnpj: '' })

// Mesmas regras do form legado (required / CNPJ com 14 dígitos).
function validate(): boolean {
  const e = { name: '', cnpj: '' }
  if (!formData.value.name) e.name = 'Campo obrigatório'

  if (!formData.value.cnpj) {
    e.cnpj = 'Campo obrigatório'
  } else if (formData.value.cnpj.replace(/\D/g, '').length !== 14) {
    e.cnpj = 'CNPJ deve ter 14 dígitos'
  }

  errors.value = e
  return !e.name && !e.cnpj
}

// Máscara de CNPJ idêntica à do componente legado.
const applyCnpjMask = (e: Event) => {
  const input = (e.target as HTMLInputElement).value
  const cleaned = input.replace(/\D/g, '')
  let masked = cleaned
  if (cleaned.length <= 14) {
    masked = cleaned
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }
  formData.value.cnpj = masked
  errors.value.cnpj = ''
}

function close() {
  if (loading.value) return
  open.value = false
}

const handleSubmit = async () => {
  if (!validate()) return

  loading.value = true
  try {
    await companieService.postCompany(formData.value)
    open.value = false
    formData.value = { name: '', cnpj: '' }
    errors.value = { name: '', cnpj: '' }
    emit('created')
    success('Empresa criada com sucesso')
  } catch (error: any) {
    showError(error?.response?.data?.message || 'Erro ao criar empresa')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <button class="activator-btn press" type="button" @click="open = true">
    <Building2 :size="15" />
    Nova Empresa
  </button>

  <AppDialog v-model="open" label="Cadastrar Empresa" size="md" :loading="loading">
    <div class="ce-pad">
      <header class="ce-head">
        <span class="ce-icon">
          <Building2 :size="18" />
        </span>
        <button class="ce-close" type="button" aria-label="Fechar" :disabled="loading" @click="close">
          <X :size="16" />
        </button>
      </header>

      <div class="ce-intro">
        <h2>Cadastrar Empresa</h2>
      </div>

      <form class="ce-form" @submit.prevent="handleSubmit">
        <label class="ce-field">
          <span class="cc-label">Nome da Empresa</span>
          <input
            v-model="formData.name"
            class="cc-input"
            type="text"
            autocomplete="off"
            @input="errors.name = ''"
          />
          <span v-if="errors.name" class="cc-error">{{ errors.name }}</span>
        </label>

        <label class="ce-field">
          <span class="cc-label">CNPJ</span>
          <input
            :value="formData.cnpj"
            class="cc-input"
            type="text"
            inputmode="numeric"
            placeholder="00.000.000/0000-00"
            maxlength="18"
            autocomplete="off"
            @input="applyCnpjMask"
          />
          <span v-if="errors.cnpj" class="cc-error">{{ errors.cnpj }}</span>
        </label>

        <div class="ce-actions">
          <button class="ce-cancel press" type="button" :disabled="loading" @click="close">
            Cancelar
          </button>
          <button class="ce-submit press" type="submit" :disabled="loading">
            <Loader2 v-if="loading" :size="14" class="spin" />
            Salvar
          </button>
        </div>
      </form>
    </div>
  </AppDialog>
</template>

<style scoped>
/* Activator primário (mesmo visual dos botões primários do app). */
.activator-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  font-size: 12.5px;
  font-weight: 650;
  font-family: inherit;
  background: var(--accent);
  color: var(--accent-fg);
  padding: 0 14px;
  border-radius: var(--radius);
  border: 1px solid color-mix(in srgb, var(--accent) 60%, var(--border));
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: filter var(--motion-fast) var(--motion-ease);
  white-space: nowrap;
}

.activator-btn:hover {
  filter: brightness(1.06);
}

/* Conteúdo do dialog (a casca vem do AppDialog: só padding aqui). */
.ce-pad {
  padding: 18px;
  overflow-y: auto;
}

.ce-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.ce-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
  color: var(--accent);
}

.ce-close {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
  transition:
    color var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.ce-close:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.ce-close:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.ce-intro h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
}

.ce-form {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ce-field {
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
  width: 100%;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 14px;
  outline: none;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease);
}

.cc-input::placeholder {
  color: var(--text-4);
}

.cc-input:focus {
  border-color: color-mix(in srgb, var(--accent) 60%, var(--border-strong));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}

.cc-error {
  font-size: 11.5px;
  color: var(--err);
}

.ce-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.ce-cancel,
.ce-submit {
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

.ce-cancel {
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
}

.ce-submit {
  border: 1px solid color-mix(in srgb, var(--accent) 60%, var(--border));
  background: var(--accent);
  color: var(--accent-fg);
}

.ce-cancel:disabled,
.ce-submit:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
