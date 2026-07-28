<script setup lang="ts">
/**
 * Modal de cadastro de usuário no padrão do design system (AppDialog + tokens,
 * sem v-dialog). O activator "Novo Usuário" é renderizado pelo próprio
 * componente, no mesmo lugar de antes. Mesmas validações e toasts do legado.
 */
import { ref } from 'vue'
import { Eye, EyeOff, Loader2, UserPlus, X } from 'lucide-vue-next'
import userService from '@/service/user/user-service'
import { useToast } from '@/composables/useToast'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppSelect from '@/components/ui/AppSelect.vue'

const { success, error: showError } = useToast()

const emit = defineEmits(['created'])

const open = ref(false)
const loading = ref(false)
const showPassword = ref(false)
const formData = ref({ name: '', email: '', password: '', role: '' })
const errors = ref({ name: '', email: '', password: '', role: '' })

const roles = [
  { label: 'Trabalhador', value: 'WORKER' },
  { label: 'Admin', value: 'ADMIN' },
]

const onRoleChange = (value: string) => {
  formData.value.role = value
  if (value) errors.value.role = ''
}

// Mesmas regras do form legado (required / email / senha), aplicadas à mão
// agora que o v-form saiu de cena. Mensagens idênticas.
function validate(): boolean {
  const e = { name: '', email: '', password: '', role: '' }
  if (!formData.value.name) e.name = 'Campo obrigatório'

  if (!formData.value.email) {
    e.email = 'Campo obrigatório'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.value.email)) {
    e.email = 'Email inválido'
  }

  if (!formData.value.password) {
    e.password = 'Campo obrigatório'
  } else if (formData.value.password.length < 6) {
    e.password = 'Senha deve ter no mínimo 6 caracteres'
  } else if (!/[!@#$%^&*(),.?":{}|<>]/.test(formData.value.password)) {
    e.password = 'Senha deve conter pelo menos 1 caractere especial'
  }

  if (!formData.value.role) e.role = 'Campo obrigatório'

  errors.value = e
  return !e.name && !e.email && !e.password && !e.role
}

function close() {
  if (loading.value) return
  open.value = false
}

const handleSubmit = async () => {
  if (!validate()) return

  loading.value = true
  try {
    await userService.postUser(formData.value)
    open.value = false
    formData.value = { name: '', email: '', password: '', role: '' }
    errors.value = { name: '', email: '', password: '', role: '' }
    showPassword.value = false
    emit('created')
    success('Usuário criado com sucesso')
  } catch (error: any) {
    showError(error?.response?.data?.message || 'Erro ao criar usuário')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <button class="activator-btn press" type="button" @click="open = true">
    <UserPlus :size="15" />
    Novo Usuário
  </button>

  <AppDialog v-model="open" label="Cadastrar Usuário" size="md" :loading="loading">
    <div class="cu-pad">
      <header class="cu-head">
        <span class="cu-icon">
          <UserPlus :size="18" />
        </span>
        <button class="cu-close" type="button" aria-label="Fechar" :disabled="loading" @click="close">
          <X :size="16" />
        </button>
      </header>

      <div class="cu-intro">
        <h2>Cadastrar Usuário</h2>
      </div>

      <form class="cu-form" @submit.prevent="handleSubmit">
        <label class="cu-field">
          <span class="cc-label">Nome</span>
          <input
            v-model="formData.name"
            class="cc-input"
            type="text"
            autocomplete="off"
            @input="errors.name = ''"
          />
          <span v-if="errors.name" class="cc-error">{{ errors.name }}</span>
        </label>

        <label class="cu-field">
          <span class="cc-label">Email</span>
          <input
            v-model="formData.email"
            class="cc-input"
            type="email"
            autocomplete="off"
            @input="errors.email = ''"
          />
          <span v-if="errors.email" class="cc-error">{{ errors.email }}</span>
        </label>

        <label class="cu-field">
          <span class="cc-label">Senha</span>
          <div class="cu-password">
            <input
              v-model="formData.password"
              class="cc-input"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              @input="errors.password = ''"
            />
            <button
              class="cu-eye"
              type="button"
              :aria-label="showPassword ? 'Ocultar senha' : 'Mostrar senha'"
              @click="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" :size="15" />
              <Eye v-else :size="15" />
            </button>
          </div>
          <span v-if="errors.password" class="cc-error">{{ errors.password }}</span>
        </label>

        <div class="cu-field">
          <span class="cc-label">Tipo de Usuário</span>
          <AppSelect
            :model-value="formData.role"
            :items="roles"
            label="Tipo de Usuário"
            placeholder="Selecione o tipo"
            @update:model-value="onRoleChange(String($event))"
          />
          <span v-if="errors.role" class="cc-error">{{ errors.role }}</span>
        </div>

        <div class="cu-actions">
          <button class="cu-cancel press" type="button" :disabled="loading" @click="close">
            Cancelar
          </button>
          <button class="cu-submit press" type="submit" :disabled="loading">
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
.cu-pad {
  padding: 18px;
  overflow-y: auto;
}

.cu-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.cu-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
  color: var(--accent);
}

.cu-close {
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

.cu-close:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.cu-close:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.cu-intro h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
}

.cu-form {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cu-field {
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

/* Campo de senha com toggle de visibilidade dentro do input. */
.cu-password {
  position: relative;
  display: flex;
}

.cu-password .cc-input {
  padding-right: 42px;
}

.cu-eye {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  transition:
    color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.cu-eye:hover {
  color: var(--text);
  background: var(--surface-3);
}

.cu-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.cu-cancel,
.cu-submit {
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

.cu-cancel {
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
}

.cu-submit {
  border: 1px solid color-mix(in srgb, var(--accent) 60%, var(--border));
  background: var(--accent);
  color: var(--accent-fg);
}

.cu-cancel:disabled,
.cu-submit:disabled {
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
