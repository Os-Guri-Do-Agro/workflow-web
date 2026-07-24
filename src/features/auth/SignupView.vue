<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  ArrowRight,
} from 'lucide-vue-next'
import authService from '@/service/auth/auth-service'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const name = ref('')
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const { error: showError, success: showSuccess } = useToast()

const submit = async () => {
  if (!name.value.trim() || !email.value.trim() || !password.value) {
    showError('Preencha todos os campos')
    return
  }
  if (password.value.length < 6) {
    showError('Senha precisa ter pelo menos 6 caracteres')
    return
  }
  loading.value = true
  try {
    await authService.signup({
      name: name.value.trim(),
      email: email.value.trim(),
      password: password.value,
    })
    // Auto-login após signup
    const loginRes = await authService.postLogin({
      email: email.value.trim(),
      password: password.value,
    })
    if (loginRes?.accessToken) {
      localStorage.setItem('token', loginRes.accessToken)
      showSuccess('Conta criada! Bem-vindo.')
      router.push('/')
    } else {
      showSuccess('Conta criada — faça login.')
      router.push('/login')
    }
  } catch (err: any) {
    showError(
      err?.response?.data?.message ||
        'Não foi possível criar a conta. Tente outro e-mail.',
    )
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="signup-root">
    <section class="form-side">
      <div class="form-inner">
        <header class="form-head">
          <div class="logo-wrap"><Sparkles :size="18" /></div>
          <h1 class="form-title">Criar conta</h1>
          <p class="form-sub">
            Acesso gratuito ao Nevo. Comece a organizar tarefas e bug reports.
          </p>
        </header>

        <form @submit.prevent="submit" class="form-body" novalidate>
          <div class="field">
            <label class="field-label" for="su-name">Nome</label>
            <div class="input-wrap">
              <UserIcon :size="15" class="input-icon" />
              <input
                id="su-name"
                v-model="name"
                type="text"
                autocomplete="name"
                placeholder="Seu nome"
                class="input"
                required
              />
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="su-email">E-mail</label>
            <div class="input-wrap">
              <Mail :size="15" class="input-icon" />
              <input
                id="su-email"
                v-model="email"
                type="email"
                autocomplete="email"
                placeholder="seu@email.com"
                class="input"
                required
              />
            </div>
          </div>
          <div class="field">
            <label class="field-label" for="su-password">Senha</label>
            <div class="input-wrap">
              <Lock :size="15" class="input-icon" />
              <input
                id="su-password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="Mínimo 6 caracteres"
                class="input input-has-action"
                required
              />
              <button
                type="button"
                class="input-action"
                :aria-label="showPassword ? 'Ocultar senha' : 'Mostrar senha'"
                @click="showPassword = !showPassword"
              >
                <component :is="showPassword ? EyeOff : Eye" :size="15" />
              </button>
            </div>
          </div>

          <button type="submit" class="btn-primary" :disabled="loading">
            <Loader2 v-if="loading" :size="15" class="spin" />
            <template v-else>
              <span>Criar conta gratuita</span>
              <ArrowRight :size="15" />
            </template>
          </button>

          <p class="form-foot">
            Já tem conta?
            <button type="button" class="link" @click="router.push('/login')">
              Entrar
            </button>
          </p>
        </form>
      </div>
    </section>
  </div>
</template>

<style scoped>
.signup-root {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(60rem 36rem at 50% -10%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%),
    var(--bg);
  color: var(--text);
  padding: 32px 24px;
}
.form-side {
  width: 100%;
  display: flex;
  justify-content: center;
}
.form-inner {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.form-head {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.logo-wrap {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--accent);
  margin-bottom: 6px;
}
.form-title {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
}
.form-sub {
  font-size: 13.5px;
  color: var(--text-3);
  margin: 0;
}
.form-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-3);
}
.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.input-icon {
  position: absolute;
  left: 12px;
  color: var(--text-3);
  pointer-events: none;
}
.input {
  width: 100%;
  padding: 10px 12px 10px 36px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color var(--motion-fast), box-shadow var(--motion-fast);
}
.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}
.input-has-action {
  padding-right: 38px;
}
.input-action {
  position: absolute;
  right: 6px;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-3);
  cursor: pointer;
}
.btn-primary {
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--accent);
  color: var(--accent-fg);
  border: 1px solid color-mix(in srgb, var(--accent) 80%, black);
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 6px;
}
.btn-primary:hover:not(:disabled) {
  filter: brightness(1.07);
}
.btn-primary:disabled {
  opacity: 0.6;
  cursor: progress;
}
.form-foot {
  text-align: center;
  font-size: 12.5px;
  color: var(--text-3);
  margin: 6px 0 0;
}
.link {
  background: transparent;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font: inherit;
  font-weight: 600;
}
.link:hover {
  text-decoration: underline;
}
.spin {
  animation: spin 0.85s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
