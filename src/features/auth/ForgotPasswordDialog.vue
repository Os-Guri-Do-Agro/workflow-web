<script setup lang="ts">
/**
 * "Esqueci minha senha" do login. A API responde sempre a mesma coisa (não
 * conta se o e-mail tem conta), e a tela também: depois do envio mostra o
 * aviso neutro e o plano B, que é pedir o link para um admin. Sem SendGrid
 * configurado nenhum e-mail sai, e é por isso que o plano B fica à vista.
 */
import { ref, watch } from 'vue'
import { KeyRound, Loader2, Mail, MailCheck, X } from 'lucide-vue-next'
import axios from 'axios'
import AppDialog from '@/components/ui/AppDialog.vue'
import authService from '@/service/auth/auth-service'
import { getApiErrorMessage } from '@/service/api'

const props = defineProps<{ modelValue: boolean; initialEmail?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const email = ref('')
const loading = ref(false)
const done = ref(false)
const error = ref('')

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    email.value = props.initialEmail?.trim() ?? ''
    done.value = false
    error.value = ''
  },
)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function submit() {
  error.value = ''
  const value = email.value.trim()
  if (!EMAIL_RE.test(value)) {
    error.value = 'Digite o e-mail da sua conta.'
    return
  }
  loading.value = true
  try {
    await authService.forgotPassword(value)
    done.value = true
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 429) {
      error.value = 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'
    } else {
      error.value = getApiErrorMessage(err, 'Não deu para enviar agora. Tente de novo em instantes.')
    }
  } finally {
    loading.value = false
  }
}

function close() {
  if (loading.value) return
  emit('update:modelValue', false)
}
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    label="Esqueci minha senha"
    size="sm"
    :loading="loading"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <header class="fp-head">
      <span class="fp-icon">
        <MailCheck v-if="done" :size="18" />
        <KeyRound v-else :size="18" />
      </span>
      <h2 class="fp-title">{{ done ? 'Confira seu e-mail' : 'Esqueci minha senha' }}</h2>
      <button class="fp-close" type="button" aria-label="Fechar" :disabled="loading" @click="close">
        <X :size="16" />
      </button>
    </header>

    <div v-if="done" class="fp-body" aria-live="polite">
      <p class="fp-text">
        Se <strong>{{ email.trim() }}</strong> tiver conta no Nevo, mandamos um link para criar uma
        senha nova. Ele vale por 1 hora.
      </p>
      <p class="fp-hint">
        Não chegou em alguns minutos? Olhe o spam ou peça para um admin da sua empresa gerar um
        link de acesso para você.
      </p>
      <footer class="fp-foot">
        <button class="fp-primary press" type="button" @click="close">Voltar ao login</button>
      </footer>
    </div>

    <form v-else class="fp-body" novalidate @submit.prevent="submit">
      <p class="fp-text">Digite o e-mail da sua conta. Mandamos um link para você criar uma senha nova.</p>
      <div class="fp-field">
        <label class="fp-label" for="forgot-email">E-mail</label>
        <div class="fp-input-wrap">
          <Mail :size="15" class="fp-input-icon" />
          <input
            id="forgot-email"
            v-model="email"
            class="fp-input"
            type="email"
            autocomplete="email"
            placeholder="seu@email.com"
            :aria-invalid="!!error"
            aria-describedby="forgot-error"
            autofocus
            @input="error = ''"
          />
        </div>
        <span v-if="error" id="forgot-error" class="fp-error" role="alert">{{ error }}</span>
      </div>
      <footer class="fp-foot">
        <button class="fp-ghost press" type="button" :disabled="loading" @click="close">Cancelar</button>
        <button class="fp-primary press" type="submit" :disabled="loading">
          <Loader2 v-if="loading" :size="14" class="fp-spin" />
          Enviar link
        </button>
      </footer>
    </form>
  </AppDialog>
</template>

<style scoped>
.fp-head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 16px 18px 0;
}

.fp-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: var(--radius);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.fp-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text);
}

.fp-close {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
}

.fp-close:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border-strong);
}

.fp-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 18px 18px;
}

.fp-text {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--text-2);
}

.fp-text strong {
  color: var(--text);
  font-weight: 600;
  word-break: break-all;
}

.fp-hint {
  margin: 0;
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-2);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.fp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fp-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
}

.fp-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.fp-input-icon {
  position: absolute;
  left: 12px;
  color: var(--text-3);
  pointer-events: none;
}

.fp-input {
  width: 100%;
  height: 42px;
  padding: 0 12px 0 36px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 14px;
  outline: none;
}

.fp-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}

.fp-input[aria-invalid='true'] {
  border-color: var(--err);
}

.fp-error {
  font-size: 12px;
  color: var(--err);
}

.fp-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.fp-ghost,
.fp-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 40px;
  padding: 0 16px;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.fp-ghost {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-2);
}

.fp-ghost:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border-strong);
}

.fp-primary {
  background: var(--accent);
  color: var(--accent-fg);
  border: 1px solid color-mix(in srgb, var(--accent) 80%, black);
}

.fp-primary:hover:not(:disabled) {
  filter: brightness(1.06);
}

.fp-primary:disabled,
.fp-ghost:disabled {
  opacity: 0.6;
  cursor: progress;
}

.fp-spin {
  animation: fp-spin 0.85s linear infinite;
}

@keyframes fp-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fp-spin {
    animation-duration: 1.8s;
  }
}
</style>
