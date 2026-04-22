<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Download,
  CheckCircle2,
  LineChart,
  Users2,
  Sparkles,
  ArrowRight,
} from 'lucide-vue-next'
import authService from '@/service/auth/auth-service'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const { error: showError } = useToast()

const login = async () => {
  if (!email.value || !password.value) {
    showError('Preencha e-mail e senha')
    return
  }
  loading.value = true
  try {
    const response = await authService.postLogin({
      email: email.value,
      password: password.value,
    })

    if (response.accessToken) {
      localStorage.setItem('token', response.accessToken)
    }
    router.push('/')
  } catch (error: any) {
    showError(error?.response?.data?.message || 'Erro ao fazer login. Verifique suas credenciais.')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  const token = localStorage.getItem('token')
  if (token) {
    router.push('/')
  }
})

const features = [
  { icon: CheckCircle2, label: 'Organização simples' },
  { icon: LineChart, label: 'Acompanhamento em tempo real' },
  { icon: Users2, label: 'Colaboração eficiente' },
]
</script>

<template>
  <div class="login-root">
    <!-- Form side -->
    <section class="form-side">
      <div class="form-inner">
        <header class="form-head">
          <div class="logo-wrap">
            <Sparkles :size="18" />
          </div>
          <h1 class="form-title">Bem-vindo de volta</h1>
          <p class="form-sub">Entre com suas credenciais para acessar sua conta.</p>
        </header>

        <form @submit.prevent="login" class="form-body" novalidate>
          <div class="field">
            <label class="field-label" for="login-email">E-mail</label>
            <div class="input-wrap">
              <Mail :size="15" class="input-icon" />
              <input
                id="login-email"
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
            <label class="field-label" for="login-password">Senha</label>
            <div class="input-wrap">
              <Lock :size="15" class="input-icon" />
              <input
                id="login-password"
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="••••••••"
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

          <button type="submit" class="btn-primary press" :disabled="loading">
            <Loader2 v-if="loading" :size="15" class="spin" />
            <template v-else>
              <span>Entrar</span>
              <ArrowRight :size="15" />
            </template>
          </button>

          <button
            type="button"
            class="btn-ghost"
            @click="router.push('/download')"
          >
            <Download :size="14" />
            Desktop App
          </button>
        </form>

        <footer class="form-foot">
          <span class="foot-meta">Stack Roads · Workflow</span>
        </footer>
      </div>
    </section>

    <!-- Hero side -->
    <aside class="hero-side" aria-hidden="true">
      <div class="hero-bg" />
      <div class="hero-grid" />
      <div class="hero-inner">
        <div class="hero-logo">
          <img src="/icone.png" alt="" />
        </div>
        <h2 class="hero-title">Stack Roads</h2>
        <p class="hero-sub">
          Gerencie suas tarefas de forma inteligente. Organize, priorize e acompanhe seu trabalho
          com a clareza que o time merece.
        </p>
        <ul class="hero-features">
          <li v-for="f in features" :key="f.label" class="hero-feature">
            <span class="hero-feature-icon">
              <component :is="f.icon" :size="14" />
            </span>
            <span>{{ f.label }}</span>
          </li>
        </ul>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.login-root {
  display: grid;
  grid-template-columns: 1fr;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
}

@media (min-width: 900px) {
  .login-root {
    grid-template-columns: minmax(440px, 1fr) 1.15fr;
  }
}

/* ---- FORM SIDE ---- */
.form-side {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  position: relative;
}

.form-inner {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 28px;
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
  font-size: 28px;
  line-height: 1.1;
  letter-spacing: -0.025em;
  font-weight: 700;
  color: var(--text);
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
  transition: color var(--motion-fast) var(--motion-ease);
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
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
  outline: none;
}

.input:hover {
  border-color: var(--border-strong);
}

.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}

.input:focus + .input-icon,
.input-wrap:focus-within .input-icon {
  color: var(--text);
}

.input::placeholder {
  color: var(--text-4);
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
  border-radius: 6px;
  color: var(--text-3);
  cursor: pointer;
  transition: color var(--motion-fast), background var(--motion-fast);
}

.input-action:hover {
  color: var(--text);
  background: var(--surface-2);
}

.btn-primary {
  margin-top: 4px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--accent);
  color: var(--accent-fg);
  border: 1px solid color-mix(in srgb, var(--accent) 80%, black);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    filter var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.btn-primary:hover:not(:disabled) {
  filter: brightness(1.06);
}

.btn-primary:disabled {
  opacity: 0.65;
  cursor: progress;
}

.btn-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  background: transparent;
  border: none;
  color: var(--text-3);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: color var(--motion-fast) var(--motion-ease);
}

.btn-ghost:hover {
  color: var(--text);
}

.form-foot {
  display: flex;
  justify-content: center;
  margin-top: 8px;
}

.foot-meta {
  font-size: 11px;
  color: var(--text-4);
  letter-spacing: 0.04em;
}

.spin {
  animation: spin 0.85s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---- HERO SIDE ---- */
.hero-side {
  display: none;
  position: relative;
  overflow: hidden;
  background: radial-gradient(
      120% 80% at 70% 20%,
      color-mix(in srgb, var(--accent) 18%, transparent) 0%,
      transparent 60%
    ),
    linear-gradient(180deg, var(--surface-2) 0%, var(--bg) 100%);
  border-left: 1px solid var(--border);
}

@media (min-width: 900px) {
  .hero-side {
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.hero-bg {
  position: absolute;
  inset: -20%;
  background:
    radial-gradient(
      36rem 22rem at 20% 110%,
      color-mix(in srgb, var(--accent) 32%, transparent),
      transparent 70%
    ),
    radial-gradient(
      28rem 20rem at 80% -10%,
      color-mix(in srgb, var(--accent) 24%, transparent),
      transparent 70%
    );
  filter: blur(40px);
  opacity: 0.9;
  pointer-events: none;
}

.hero-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, color-mix(in srgb, var(--border) 70%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--border) 70%, transparent) 1px, transparent 1px);
  background-size: 40px 40px;
  mask-image: radial-gradient(ellipse at center, #000 30%, transparent 75%);
  -webkit-mask-image: radial-gradient(ellipse at center, #000 30%, transparent 75%);
  opacity: 0.4;
  pointer-events: none;
}

.hero-inner {
  position: relative;
  z-index: 2;
  padding: 48px;
  max-width: 520px;
  text-align: center;
}

.hero-logo {
  width: 68px;
  height: 68px;
  margin: 0 auto 20px;
  padding: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-overlay);
}

.hero-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.25));
}

.hero-title {
  font-size: 36px;
  line-height: 1.05;
  letter-spacing: -0.03em;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 14px;
}

.hero-sub {
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-2);
  margin: 0 auto 34px;
  max-width: 420px;
}

.hero-features {
  display: flex;
  flex-direction: column;
  gap: 10px;
  list-style: none;
  padding: 0;
  margin: 0;
  max-width: 260px;
  margin-inline: auto;
}

.hero-feature {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-2);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: border-color var(--motion-fast), color var(--motion-fast);
}

.hero-feature:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.hero-feature-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
  flex-shrink: 0;
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation-duration: 1.8s;
  }
  .input,
  .btn-primary,
  .btn-ghost,
  .input-action,
  .hero-feature {
    transition-duration: 1ms;
  }
}
</style>
