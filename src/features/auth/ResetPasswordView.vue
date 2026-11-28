<script setup lang="ts">
/**
 * `/redefinir-senha?token=...`: rota pública (sem shell) onde a pessoa cria a
 * senha. Serve aos dois links da API: primeiro acesso (o ADMIN gera, vale 7
 * dias) e esqueci a senha (por e-mail, 1 hora). Os dois são de uso único.
 *
 * O payload do token é lido aqui só para escolher o texto (primeiro acesso ou
 * senha nova) e avisar antes se o prazo já passou. Quem decide se o link vale
 * é a API.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { jwtDecode } from 'jwt-decode'
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock } from 'lucide-vue-next'
import axios from 'axios'
import authService from '@/service/auth/auth-service'
import { clearSession, getApiErrorMessage } from '@/service/api'
import { safeStorage } from '@/utils/safe-storage'
import ForgotPasswordDialog from './ForgotPasswordDialog.vue'

const MIN = 8
const MAX = 72

const route = useRoute()
const router = useRouter()

const raw = route.query.token
const token = (Array.isArray(raw) ? raw[0] : raw) ?? ''

interface LinkPayload {
  kind?: 'reset' | 'invite'
  purpose?: string
  exp?: number
}

function readPayload(value: string): LinkPayload | null {
  if (!value) return null
  try {
    const p = jwtDecode<LinkPayload>(value)
    return p.purpose === 'password-set' ? p : null
  } catch {
    return null
  }
}

const payload = readPayload(token)
const isInvite = payload?.kind === 'invite'

type Stage = 'form' | 'done' | 'broken'
const stage = ref<Stage>(
  !payload ? 'broken' : payload.exp && payload.exp * 1000 <= Date.now() ? 'broken' : 'form',
)
const brokenMessage = ref(
  !payload
    ? 'Este link está incompleto. Confira se copiou o endereço inteiro ou peça um novo.'
    : 'Este link expirou. Peça um novo.',
)

const password = ref('')
const confirm = ref('')
const show = ref(false)
const loading = ref(false)
const error = ref('')
const confirmError = ref('')
const doneEmail = ref('')
const forgotOpen = ref(false)

const title = computed(() => (isInvite ? 'Crie sua senha' : 'Crie uma senha nova'))
const subtitle = computed(() =>
  isInvite
    ? 'É o seu primeiro acesso ao Nevo. Escolha a senha que você vai usar para entrar.'
    : 'Escolha a senha nova da sua conta. A antiga para de valer.',
)

const tooShort = computed(() => password.value.length > 0 && password.value.length < MIN)

async function submit() {
  error.value = ''
  confirmError.value = ''
  if (password.value.length < MIN) {
    error.value = `A senha precisa ter pelo menos ${MIN} caracteres.`
    return
  }
  if (password.value.length > MAX) {
    error.value = `A senha pode ter no máximo ${MAX} caracteres.`
    return
  }
  if (confirm.value !== password.value) {
    confirmError.value = 'As duas senhas não são iguais.'
    return
  }
  loading.value = true
  try {
    const result = await authService.resetPassword(token, password.value)
    doneEmail.value = result.email
    // Quem abriu o link é a dona da conta. Uma sessão de outra pessoa neste
    // navegador (o admin testando o link) faria o login pular direto para ela.
    if (safeStorage.getItem('token')) clearSession()
    stage.value = 'done'
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 400) {
      // Senha fora da regra volta como lista do validador; link ruim, como texto.
      const message = err.response.data?.message
      if (Array.isArray(message)) {
        error.value = message.join(' ')
      } else {
        brokenMessage.value = message || 'Este link não vale mais. Peça um novo.'
        stage.value = 'broken'
      }
    } else if (axios.isAxiosError(err) && err.response?.status === 429) {
      error.value = 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'
    } else {
      error.value = getApiErrorMessage(err, 'Não deu para salvar agora. Tente de novo em instantes.')
    }
  } finally {
    loading.value = false
  }
}

function goToLogin() {
  router.push({
    name: 'login',
    query: doneEmail.value ? { email: doneEmail.value, senha: 'criada' } : {},
  })
}
</script>

<template>
  <main class="rp-root">
    <section class="rp-card">
      <img src="/brand/marca.svg" alt="Nevo" class="rp-logo" draggable="false" />

      <!-- Criar a senha -->
      <template v-if="stage === 'form'">
        <header class="rp-head">
          <h1 class="rp-title">{{ title }}</h1>
          <p class="rp-sub">{{ subtitle }}</p>
        </header>

        <form class="rp-form" novalidate @submit.prevent="submit">
          <div class="rp-field">
            <div class="rp-field-head">
              <label class="rp-label" for="rp-password">Nova senha</label>
              <button
                type="button"
                class="rp-toggle"
                :aria-pressed="show"
                @click="show = !show"
              >
                <component :is="show ? EyeOff : Eye" :size="14" />
                {{ show ? 'Ocultar' : 'Mostrar' }}
              </button>
            </div>
            <div class="rp-input-wrap">
              <Lock :size="15" class="rp-input-icon" />
              <input
                id="rp-password"
                v-model="password"
                class="rp-input"
                :type="show ? 'text' : 'password'"
                autocomplete="new-password"
                :maxlength="MAX"
                :aria-invalid="!!error"
                aria-describedby="rp-password-help"
                autofocus
                @input="error = ''"
              />
            </div>
            <span v-if="error" id="rp-password-help" class="rp-error" role="alert">{{ error }}</span>
            <span
              v-else
              id="rp-password-help"
              class="rp-help"
              :class="{ 'rp-help--warn': tooShort }"
            >
              Pelo menos {{ MIN }} caracteres.
              <template v-if="tooShort">Faltam {{ MIN - password.length }}.</template>
            </span>
          </div>

          <div class="rp-field">
            <label class="rp-label" for="rp-confirm">Repita a senha</label>
            <div class="rp-input-wrap">
              <Lock :size="15" class="rp-input-icon" />
              <input
                id="rp-confirm"
                v-model="confirm"
                class="rp-input"
                :type="show ? 'text' : 'password'"
                autocomplete="new-password"
                :maxlength="MAX"
                :aria-invalid="!!confirmError"
                aria-describedby="rp-confirm-error"
                @input="confirmError = ''"
              />
            </div>
            <span v-if="confirmError" id="rp-confirm-error" class="rp-error" role="alert">
              {{ confirmError }}
            </span>
          </div>

          <button type="submit" class="rp-primary press" :disabled="loading">
            <Loader2 v-if="loading" :size="15" class="rp-spin" />
            <span>{{ isInvite ? 'Criar senha' : 'Salvar senha nova' }}</span>
          </button>
        </form>
      </template>

      <!-- Pronto -->
      <div v-else-if="stage === 'done'" class="rp-state" aria-live="polite">
        <span class="rp-state-icon rp-state-icon--ok"><CheckCircle2 :size="22" /></span>
        <h1 class="rp-title">Senha criada</h1>
        <p class="rp-sub">
          Agora é só entrar<template v-if="doneEmail"> com {{ doneEmail }}</template> e a senha que
          você acabou de escolher.
        </p>
        <button type="button" class="rp-primary press" @click="goToLogin">
          <span>Ir para o login</span>
          <ArrowRight :size="15" />
        </button>
      </div>

      <!-- Link que não serve -->
      <div v-else class="rp-state" role="alert">
        <span class="rp-state-icon rp-state-icon--err"><AlertCircle :size="22" /></span>
        <h1 class="rp-title">Este link não vale mais</h1>
        <p class="rp-sub">{{ brokenMessage }}</p>
        <p class="rp-hint">
          Recebeu o link de alguém da empresa? Peça um novo para essa pessoa. Esqueceu a senha?
          Peça um link por e-mail.
        </p>
        <div class="rp-actions">
          <button type="button" class="rp-ghost press" @click="forgotOpen = true">
            Pedir link por e-mail
          </button>
          <button type="button" class="rp-primary press" @click="goToLogin">Ir para o login</button>
        </div>
      </div>
    </section>

    <ForgotPasswordDialog v-model="forgotOpen" />
  </main>
</template>

<style scoped>
.rp-root {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: max(24px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom));
  background: var(--bg);
  color: var(--text);
}

.rp-card {
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 28px 24px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.rp-logo {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--border) 70%, transparent);
}

.rp-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rp-title {
  margin: 0;
  font-size: 22px;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
}

.rp-sub {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--text-2);
}

.rp-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.rp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rp-field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rp-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
}

.rp-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  background: none;
  border: none;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-ink);
  cursor: pointer;
}

/* Alvo de 44px sem empurrar a linha do rótulo. */
.rp-toggle::after {
  content: '';
  position: absolute;
  inset: -14px -8px;
}

.rp-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
}

.rp-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.rp-input-icon {
  position: absolute;
  left: 12px;
  color: var(--text-3);
  pointer-events: none;
}

.rp-input {
  width: 100%;
  height: 44px;
  padding: 0 12px 0 36px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font: inherit;
  font-size: 15px;
  outline: none;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease);
}

.rp-input:hover {
  border-color: var(--border-strong);
}

.rp-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}

.rp-input[aria-invalid='true'] {
  border-color: var(--err);
}

.rp-help {
  font-size: 12px;
  color: var(--text-3);
}

.rp-help--warn {
  color: var(--warn);
}

.rp-error {
  font-size: 12px;
  color: var(--err);
}

.rp-primary,
.rp-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 44px;
  padding: 0 16px;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: filter var(--motion-fast) var(--motion-ease);
}

.rp-primary {
  background: var(--accent);
  color: var(--accent-fg);
  border: 1px solid color-mix(in srgb, var(--accent) 80%, black);
}

.rp-primary:hover:not(:disabled) {
  filter: brightness(1.06);
}

.rp-primary:disabled {
  opacity: 0.65;
  cursor: progress;
}

.rp-ghost {
  background: transparent;
  color: var(--text-2);
  border: 1px solid var(--border);
}

.rp-ghost:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.rp-state {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rp-state-icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: var(--radius);
}

.rp-state-icon--ok {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 14%, transparent);
}

.rp-state-icon--err {
  color: var(--err);
  background: color-mix(in srgb, var(--err) 12%, transparent);
}

.rp-hint {
  margin: 0;
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-2);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.rp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.rp-actions > * {
  flex: 1 1 140px;
}

.rp-spin {
  animation: rp-spin 0.85s linear infinite;
}

@keyframes rp-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .rp-spin {
    animation-duration: 1.8s;
  }
  .rp-input,
  .rp-primary,
  .rp-ghost {
    transition-duration: 1ms;
  }
}
</style>
