<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import authService from '@/service/auth/auth-service'

const router = useRouter()
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const snackbar = ref(false)
const errorMessage = ref('')

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
    errorMessage.value =
      error?.response?.data?.message || 'Erro ao fazer login. Verifique suas credenciais.'
    snackbar.value = true
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
  <v-row no-gutters class="fill-height">
    <v-col cols="12" md="5" class="bg-white d-flex align-center justify-center pa-8">
      <div class="login-form">
        <div class="mb-10">
          <div class="logo-badge mb-6">
            <v-icon size="32" color="secundary">mdi-clipboard-check</v-icon>
          </div>
          <h1 style="font-size: 30px" class="font-weight-bold mb-3 text-black">
            Bem-vindo de volta
          </h1>
          <p style="font-size: 14px" class="text-grey-darken-1">
            Entre com suas credenciais para acessar sua conta
          </p>
        </div>

        <v-form @submit.prevent="login">
          <div class="mb-4">
            <label
              style="font-size: 12px"
              class="font-weight-medium text-grey-darken-2 mb-2 d-block"
              >E-mail</label
            >
            <v-text-field
              v-model="email"
              type="email"
              placeholder="seu@email.com"
              prepend-inner-icon="mdi-email-outline"
              variant="outlined"
              density="comfortable"
              required
              hide-details
            />
          </div>

          <div class="mb-2">
            <label
              style="font-size: 12px"
              class="font-weight-medium text-grey-darken-2 mb-2 d-block"
              >Senha</label
            >
            <v-text-field
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="••••••••"
              prepend-inner-icon="mdi-lock-outline"
              :append-inner-icon="showPassword ? 'mdi-eye-outline' : 'mdi-eye-off-outline'"
              variant="outlined"
              density="comfortable"
              required
              hide-details
              @click:append-inner="showPassword = !showPassword"
            />
          </div>

          <v-btn
            type="submit"
            color="primary"
            block
            size="x-large"
            :loading="loading"
            elevation="0"
            class="text-none font-weight-medium mt-5"
          >
            Entrar
          </v-btn>

          <v-btn
            variant="text"
            block
            class="text-none mt-4 text-grey-darken-1"
            append-icon="mdi-download"
            @click="router.push('/download')"
            elevation="0"
          >
            Desktop App
          </v-btn>
        </v-form>
      </div>
    </v-col>

    <v-col
      cols="12"
      md="7"
      class="bg-black d-none d-md-flex align-center justify-center position-relative"
    >
      <div class="hero-content text-center pa-12">
        <div class="icon-wrapper mb-8 d-flex align-center justify-center">
          <v-img width="100" height="100" contain src="/icone.png"></v-img>
        </div>
        <h2 style="font-size: 34px" class="font-weight-bold mb-6 text-white">Stack Roads</h2>
        <p
          class="font-weight-regular mb-8 text-grey-lighten-1"
          style="font-size: 19px; max-width: 500px; margin: 0 auto"
        >
          Gerencie suas tarefas de forma inteligente. Organize, priorize e acompanhe seu trabalho
          com eficiência.
        </p>
        <div class="features-grid">
          <div class="feature-item">
            <v-icon color="secundary" size="20" class="mb-2">mdi-check-circle</v-icon>
            <p style="font-size: 11px" class="text-grey-lighten-1">Organização simples</p>
          </div>
          <div class="feature-item">
            <v-icon color="secundary" size="20" class="mb-2">mdi-chart-line</v-icon>
            <p style="font-size: 11px" class="text-grey-lighten-1">Acompanhamento em tempo real</p>
          </div>
          <div class="feature-item">
            <v-icon color="secundary" size="20" class="mb-2">mdi-account-group</v-icon>
            <p style="font-size: 11px" class="text-grey-lighten-1">Colaboração eficiente</p>
          </div>
        </div>
      </div>
      <div class="gradient-overlay"></div>
    </v-col>
  </v-row>

  <v-snackbar v-model="snackbar" color="error" :timeout="3000">
    {{ errorMessage }}
  </v-snackbar>
</template>

<style scoped>
.fill-height {
  height: 100vh;
}

.login-form {
  width: 100%;
  max-width: 420px;
}

.logo-badge {
  width: 56px;
  height: 56px;
  background: rgba(var(--v-theme-primary), 0.1);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero-content {
  position: relative;
  z-index: 2;
}

.icon-wrapper {
  position: relative;
}

.floating-icon {
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-10px);
  }
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  margin-top: 48px;
}

.feature-item {
  text-align: center;
}

.gradient-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: radial-gradient(
    circle at 30% 50%,
    rgba(var(--v-theme-primary), 0.15) 0%,
    transparent 50%
  );
  pointer-events: none;
}

.position-relative {
  position: relative;
}
</style>
