<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import authService from '@/service/auth/auth-service'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const { error: showError } = useToast()

const login = async () => {
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
</script>

<template>
  <div class="win-desktop">
    <!-- Win2000 Login Dialog Window -->
    <div class="win-dialog">
      <!-- Title bar -->
      <div class="win-titlebar">
        <div class="win-titlebar-left">
          <v-icon size="16" color="white">mdi-key</v-icon>
          <span>Entrar no Windows</span>
        </div>
        <div class="win-titlebar-buttons">
          <button class="win-chrome-btn win-close" title="Fechar">x</button>
        </div>
      </div>

      <!-- Dialog body -->
      <div class="win-dialog-body">
        <div class="win-dialog-left">
          <img src="/icone.png" class="win-login-icon" alt="Logo" />
        </div>
        <div class="win-dialog-right">
          <p class="win-login-text">
            Digite seu nome de usuario e senha para entrar no sistema Forge.
          </p>

          <form @submit.prevent="login" class="win-form">
            <div class="win-form-row">
              <label class="win-label">Usuario:</label>
              <input
                v-model="email"
                type="email"
                class="win-input"
                placeholder="seu@email.com"
              />
            </div>
            <div class="win-form-row">
              <label class="win-label">Senha:</label>
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                class="win-input"
                placeholder=""
              />
            </div>
            <div class="win-form-check">
              <input type="checkbox" id="show-pass" v-model="showPassword" />
              <label for="show-pass">Mostrar senha</label>
            </div>
          </form>
        </div>
      </div>

      <!-- Dialog buttons -->
      <div class="win-dialog-footer">
        <button class="win-btn" @click="login" :disabled="loading">
          <span v-if="loading">Aguarde...</span>
          <span v-else>OK</span>
        </button>
        <button class="win-btn" @click="router.push('/download')">
          Baixar App
        </button>
      </div>
    </div>

    <!-- Win2000 Info Window (side) -->
    <div class="win-info-window">
      <div class="win-titlebar">
        <div class="win-titlebar-left">
          <v-icon size="16" color="white">mdi-information</v-icon>
          <span>Sobre o Forge 2000</span>
        </div>
        <div class="win-titlebar-buttons">
          <button class="win-chrome-btn">_</button>
        </div>
      </div>
      <div class="win-info-body">
        <div class="win-info-logo">
          <img src="/icone.png" width="64" height="64" alt="Forge" />
        </div>
        <h2 class="win-info-title">Stack Roads</h2>
        <p class="win-info-desc">
          Gerencie suas tarefas de forma inteligente. Organize, priorize e acompanhe seu trabalho com eficiencia.
        </p>
        <div class="win-features">
          <div class="win-feature">
            <v-icon size="16" color="#008000">mdi-check-circle</v-icon>
            <span>Organizacao simples</span>
          </div>
          <div class="win-feature">
            <v-icon size="16" color="#008000">mdi-chart-line</v-icon>
            <span>Acompanhamento em tempo real</span>
          </div>
          <div class="win-feature">
            <v-icon size="16" color="#008000">mdi-account-group</v-icon>
            <span>Colaboracao eficiente</span>
          </div>
        </div>
        <div class="win-copyright">
          Microsoft Forge 2000<br />
          (C) 2000 Microsoft Corporation
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Win2000 Desktop ── */
.win-desktop {
  min-height: 100vh;
  background: #008080;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 20px;
  font-family: 'MS Sans Serif', Tahoma, Arial, sans-serif;
  font-size: 11px;
  color: #000;
}

/* ── Dialog window ── */
.win-dialog {
  background: #D4D0C8;
  border-top: 2px solid #FFFFFF;
  border-left: 2px solid #FFFFFF;
  border-right: 2px solid #404040;
  border-bottom: 2px solid #404040;
  box-shadow: 2px 2px 0 #808080;
  width: 420px;
}
.win-info-window {
  background: #D4D0C8;
  border-top: 2px solid #FFFFFF;
  border-left: 2px solid #FFFFFF;
  border-right: 2px solid #404040;
  border-bottom: 2px solid #404040;
  box-shadow: 2px 2px 0 #808080;
  width: 300px;
  display: none;
}
@media (min-width: 900px) {
  .win-info-window {
    display: block;
  }
}

/* ── Title bar ── */
.win-titlebar {
  background: linear-gradient(to right, #000080, #1084D0);
  color: #FFFFFF;
  font-size: 11px;
  font-weight: bold;
  padding: 3px 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  user-select: none;
}
.win-titlebar-left {
  display: flex;
  align-items: center;
  gap: 5px;
}
.win-titlebar-buttons {
  display: flex;
  gap: 2px;
}
.win-chrome-btn {
  width: 16px;
  height: 14px;
  font-size: 9px;
  line-height: 1;
  border-top: 1px solid #FFFFFF;
  border-left: 1px solid #FFFFFF;
  border-right: 1px solid #404040;
  border-bottom: 1px solid #404040;
  background: #D4D0C8;
  color: #000;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  padding: 0;
}

/* ── Dialog body ── */
.win-dialog-body {
  display: flex;
  gap: 16px;
  padding: 16px;
}
.win-dialog-left {
  flex-shrink: 0;
}
.win-login-icon {
  width: 48px;
  height: 48px;
  image-rendering: pixelated;
}
.win-dialog-right {
  flex: 1;
}
.win-login-text {
  font-size: 11px;
  line-height: 1.5;
  margin-bottom: 14px;
}

/* ── Form ── */
.win-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.win-form-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.win-label {
  width: 60px;
  text-align: right;
  font-size: 11px;
}
.win-input {
  flex: 1;
  padding: 3px 6px;
  font-size: 11px;
  font-family: inherit;
  background: #FFFFFF;
  border-top: 1px solid #808080;
  border-left: 1px solid #808080;
  border-right: 1px solid #FFFFFF;
  border-bottom: 1px solid #FFFFFF;
  outline: none;
}
.win-input:focus {
  outline: 1px dotted #000080;
}
.win-form-check {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-left: 68px;
  font-size: 11px;
}

/* ── Dialog footer ── */
.win-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding: 8px 16px 14px;
  border-top: 1px solid #808080;
}
.win-btn {
  min-width: 80px;
  padding: 4px 16px;
  font-size: 11px;
  font-family: inherit;
  background: #D4D0C8;
  border-top: 2px solid #FFFFFF;
  border-left: 2px solid #FFFFFF;
  border-right: 2px solid #404040;
  border-bottom: 2px solid #404040;
  cursor: pointer;
}
.win-btn:hover {
  background: #E8E4DC;
}
.win-btn:active {
  border-top: 2px solid #404040;
  border-left: 2px solid #404040;
  border-right: 2px solid #FFFFFF;
  border-bottom: 2px solid #FFFFFF;
}
.win-btn:disabled {
  color: #808080;
  cursor: not-allowed;
}

/* ── Info window body ── */
.win-info-body {
  padding: 16px;
  text-align: center;
}
.win-info-logo {
  margin-bottom: 12px;
}
.win-info-logo img {
  image-rendering: pixelated;
}
.win-info-title {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 10px;
}
.win-info-desc {
  font-size: 11px;
  line-height: 1.5;
  margin-bottom: 16px;
  color: #333;
}
.win-features {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}
.win-feature {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}
.win-copyright {
  font-size: 10px;
  color: #555;
  border-top: 1px solid #808080;
  padding-top: 10px;
  margin-top: 10px;
}
</style>
