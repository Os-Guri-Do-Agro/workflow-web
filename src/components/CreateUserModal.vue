<script setup lang="ts">
/**
 * Cadastro de pessoa no padrão do design system (AppDialog + tokens, sem
 * v-dialog). O activator "Novo Usuário" é renderizado pelo próprio componente.
 *
 * Desde nov/2026 são dois passos:
 * 1. Nome, e-mail e função. A senha é OPCIONAL: em branco, a conta nasce com
 *    uma senha sorteada que ninguém conhece.
 * 2. A pessoa entra na empresa ativa com a função escolhida (antes a função era
 *    pedida e ignorada pelo servidor) e o modal oferece o link de primeiro
 *    acesso para copiar e mandar. Sem senha digitada, o link sai sozinho:
 *    é o único jeito de a pessoa entrar.
 */
import { computed, ref } from 'vue'
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, TriangleAlert, UserPlus, X } from 'lucide-vue-next'
import userService from '@/service/user/user-service'
import companieService, { type AccessLinkResult } from '@/service/companies/companies-services'
import { getApiErrorMessage } from '@/service/api'
import { useToast } from '@/composables/useToast'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AccessLinkBox from '@/components/AccessLinkBox.vue'

const { success, error: showError } = useToast()
const workspace = useWorkspaceStore()

const emit = defineEmits(['created'])

const open = ref(false)
const loading = ref(false)
const showPassword = ref(false)
const formData = ref({ name: '', email: '', password: '', role: 'WORKER' })
const errors = ref({ name: '', email: '', password: '', role: '' })

/** Passo 2: quem foi criado, se entrou na empresa e o link (quando gerado). */
const created = ref<{ id: string; name: string; email: string; role: string } | null>(null)
const memberError = ref('')
const link = ref<AccessLinkResult | null>(null)
const linkError = ref('')
const linkLoading = ref(false)

const roles = [
  { label: 'Membro', value: 'WORKER' },
  { label: 'Admin', value: 'ADMIN' },
]
const roleLabel = (value: string) => roles.find((r) => r.value === value)?.label ?? value

const companyId = computed(() => workspace.activeCompanyId ?? localStorage.getItem('activeCompany'))
const companyName = computed(() => workspace.activeCompany?.name ?? 'a empresa ativa')

const onRoleChange = (value: string) => {
  formData.value.role = value
  if (value) errors.value.role = ''
}

// Mesmas regras do form legado quando há senha; vazia agora é válida.
function validate(): boolean {
  const e = { name: '', email: '', password: '', role: '' }
  if (!formData.value.name.trim()) e.name = 'Campo obrigatório'

  if (!formData.value.email.trim()) {
    e.email = 'Campo obrigatório'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.value.email.trim())) {
    e.email = 'Email inválido'
  }

  const pwd = formData.value.password
  if (pwd) {
    if (pwd.length < 6) {
      e.password = 'Senha deve ter no mínimo 6 caracteres'
    } else if (!/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) {
      e.password = 'Senha deve conter pelo menos 1 caractere especial'
    }
  }

  if (!formData.value.role) e.role = 'Campo obrigatório'

  errors.value = e
  return !e.name && !e.email && !e.password && !e.role
}

function resetAll() {
  formData.value = { name: '', email: '', password: '', role: 'WORKER' }
  errors.value = { name: '', email: '', password: '', role: '' }
  showPassword.value = false
  created.value = null
  memberError.value = ''
  link.value = null
  linkError.value = ''
}

function openModal() {
  resetAll()
  open.value = true
}

function close() {
  if (loading.value || linkLoading.value) return
  open.value = false
}

async function generateLink() {
  if (!created.value || !companyId.value) return
  linkLoading.value = true
  linkError.value = ''
  try {
    link.value = await companieService.createAccessLink(companyId.value, created.value.id)
  } catch (err) {
    linkError.value = getApiErrorMessage(err, 'Não deu para gerar o link agora. Tente de novo.')
  } finally {
    linkLoading.value = false
  }
}

const handleSubmit = async () => {
  if (!validate()) return

  loading.value = true
  const typedPassword = !!formData.value.password
  try {
    const user = await userService.postUser({
      name: formData.value.name.trim(),
      email: formData.value.email.trim(),
      ...(typedPassword ? { password: formData.value.password } : {}),
    })
    created.value = { id: user.id, name: user.name, email: user.email, role: formData.value.role }
    emit('created')
  } catch (error: any) {
    showError(getApiErrorMessage(error, 'Erro ao criar usuário'))
    loading.value = false
    return
  }

  // A conta existe. Daqui em diante, falha não desfaz nada: só avisa.
  try {
    if (!companyId.value) throw new Error('Sem empresa ativa')
    await companieService.postUserCompany(companyId.value, {
      userId: created.value.id,
      role: created.value.role,
    })
  } catch (error) {
    memberError.value = getApiErrorMessage(error, 'erro ao falar com o servidor')
  } finally {
    loading.value = false
  }

  if (!memberError.value) {
    success('Pessoa cadastrada')
    if (!typedPassword) await generateLink()
  }
}
</script>

<template>
  <button class="activator-btn press" type="button" @click="openModal">
    <UserPlus :size="15" />
    Novo Usuário
  </button>

  <AppDialog
    v-model="open"
    label="Cadastrar Usuário"
    size="md"
    :loading="loading || linkLoading"
    :persistent="!!created"
  >
    <div class="cu-pad">
      <header class="cu-head">
        <span class="cu-icon" :class="{ 'cu-icon--ok': created && !memberError }">
          <CheckCircle2 v-if="created && !memberError" :size="18" />
          <TriangleAlert v-else-if="created" :size="18" />
          <UserPlus v-else :size="18" />
        </span>
        <button
          class="cu-close"
          type="button"
          aria-label="Fechar"
          :disabled="loading || linkLoading"
          @click="close"
        >
          <X :size="16" />
        </button>
      </header>

      <!-- Passo 2: pessoa criada -->
      <div v-if="created" class="cu-done" aria-live="polite">
        <h2 class="cu-title">Conta criada para {{ created.name }}</h2>

        <p v-if="memberError" class="cu-warn" role="alert">
          A conta foi criada, mas a pessoa não entrou na empresa ({{ memberError }}). Coloque a
          pessoa pelo botão "Adicionar usuário" e gere o link em "Pessoas e acessos".
        </p>
        <template v-else>
          <p class="cu-text">
            Já está em {{ companyName }} como {{ roleLabel(created.role) }}.
            <template v-if="!link && !linkLoading">
              Para a pessoa entrar sem você passar a senha, mande o link de primeiro acesso.
            </template>
          </p>

          <AccessLinkBox
            v-if="link"
            :link="link.link"
            :expires-at="link.expiresAt"
            :emailed="link.emailed"
            :email="link.user.email"
          />
          <p v-else-if="linkLoading" class="cu-text cu-text--muted">
            <Loader2 :size="14" class="spin" /> Gerando o link
          </p>
          <p v-if="linkError" class="cc-error" role="alert">{{ linkError }}</p>
        </template>

        <div class="cu-actions">
          <button class="cu-cancel press" type="button" :disabled="linkLoading" @click="resetAll">
            Cadastrar outra pessoa
          </button>
          <button
            v-if="!memberError && !link"
            class="cu-submit press"
            type="button"
            :disabled="linkLoading"
            @click="generateLink"
          >
            <Loader2 v-if="linkLoading" :size="14" class="spin" />
            <KeyRound v-else :size="14" />
            Gerar link de acesso
          </button>
          <button v-else class="cu-submit press" type="button" @click="close">Concluir</button>
        </div>
      </div>

      <!-- Passo 1: formulário -->
      <template v-else>
        <div class="cu-intro">
          <h2>Cadastrar Usuário</h2>
          <p>Entra em {{ companyName }}.</p>
        </div>

        <form class="cu-form" novalidate @submit.prevent="handleSubmit">
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
            <span class="cc-label">Senha (opcional)</span>
            <div class="cu-password">
              <input
                v-model="formData.password"
                class="cc-input"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="new-password"
                aria-describedby="cu-password-help"
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
            <span v-else id="cu-password-help" class="cc-help">
              Deixe em branco e a pessoa cria a dela pelo link de primeiro acesso.
            </span>
          </label>

          <div class="cu-field">
            <span class="cc-label">Função na empresa</span>
            <AppSelect
              :model-value="formData.role"
              :items="roles"
              label="Função na empresa"
              placeholder="Selecione a função"
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
      </template>
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

.cu-icon--ok {
  background: color-mix(in srgb, var(--success) 14%, var(--surface-2));
  color: var(--success);
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

.cu-intro h2,
.cu-title {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
  overflow-wrap: anywhere;
}

.cu-intro p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-3);
}

.cu-done {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cu-text {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--text-2);
}

.cu-text--muted {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-3);
}

.cu-warn {
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text);
  background: color-mix(in srgb, var(--warn) 12%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--warn) 40%, var(--border));
  border-radius: var(--radius-sm);
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
  font-size: 12px;
  font-weight: 700;
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
  margin: 0;
  font-size: 12px;
  color: var(--err);
}

.cc-help {
  font-size: 12px;
  color: var(--text-3);
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
  flex-wrap: wrap;
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

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation-duration: 1.6s;
  }
}
</style>
