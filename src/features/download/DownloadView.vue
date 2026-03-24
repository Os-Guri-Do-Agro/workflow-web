<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const downloadUrl = 'https://github.com/Os-Guri-Do-Agro/workflow-web/actions/runs/23516157147/artifacts/6091474965'

const downloadApp = () => {
  window.location.href = downloadUrl
}

const goBack = () => {
  router.push('/login')
}
</script>

<template>
  <div class="download-container bg-black fill-height d-flex flex-column">
    <!-- Header with Back Button -->
    <div class="pa-6 d-flex align-center cursor-pointer" style="position: absolute; top: 0; left: 0; z-index: 10;" @click="goBack">
      <v-icon color="grey-lighten-1" size="24" class="mr-2">mdi-arrow-left</v-icon>
      <span class="text-grey-lighten-1 font-weight-medium">Voltar ao Login</span>
    </div>

    <!-- Main Content -->
    <div class="flex-grow-1 d-flex align-center justify-center position-relative">
      <div class="content-wrapper text-center">
        <!-- Icon -->
        <div class="icon-glow-wrapper mb-8 mx-auto">
          <div class="icon-glow"></div>
          <v-icon size="64" color="white" class="main-icon">mdi-laptop</v-icon>
        </div>

        <!-- Typography -->
        <h1 class="text-white font-weight-bold mb-4 display-title">
          Baixe o App Desktop
        </h1>
        <p class="text-grey-lighten-1 mb-10 subtitle">
          A experiência completa do sistema, otimizada para o seu computador.<br />
          Mais rápido, nativo e focado na sua produtividade.
        </p>

        <!-- Download Action -->
        <v-btn
          color="white"
          size="x-large"
          class="download-btn text-black font-weight-bold px-8"
          elevation="0"
          rounded="pill"
          append-icon="mdi-download"
          @click="downloadApp"
        >
          Download para Windows
        </v-btn>
        
        <p class="text-grey-darken-1 mt-6 text-caption">
          Versão para Windows (x64)
        </p>
      </div>
      
      <!-- Decorative Elements -->
      <div class="gradient-spot top-spot"></div>
      <div class="gradient-spot bottom-spot"></div>
    </div>
  </div>
</template>

<style scoped>
.fill-height {
  min-height: 100vh;
}

.download-container {
  overflow: hidden;
  background-color: #000000;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

.content-wrapper {
  position: relative;
  z-index: 2;
  max-width: 600px;
  padding: 0 24px;
}

.display-title {
  font-size: 3.5rem;
  line-height: 1.1;
  letter-spacing: -0.02em;
  background: linear-gradient(180deg, #FFFFFF 0%, rgba(255, 255, 255, 0.7) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

@media (max-width: 600px) {
  .display-title {
    font-size: 2.5rem;
  }
}

.subtitle {
  font-size: 1.125rem;
  line-height: 1.6;
}

.icon-glow-wrapper {
  position: relative;
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.main-icon {
  position: relative;
  z-index: 2;
  filter: drop-shadow(0 0 20px rgba(255, 255, 255, 0.2));
}

.icon-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100px;
  height: 100px;
  background: radial-gradient(circle, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 70%);
  border-radius: 50%;
  z-index: 1;
  animation: pulse 3s infinite ease-in-out;
}

@keyframes pulse {
  0% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.8; }
  50% { transform: translate(-50%, -50%) scale(1.1); opacity: 0.4; }
  100% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.8; }
}

.download-btn {
  letter-spacing: -0.01em;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  height: 56px !important;
}

.download-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 30px rgba(255, 255, 255, 0.2);
}

.gradient-spot {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  z-index: 1;
  opacity: 0.4;
  pointer-events: none;
}

.top-spot {
  top: -20%;
  right: -10%;
  width: 60vw;
  height: 60vw;
  background: radial-gradient(circle, rgba(60,60,60,0.4) 0%, rgba(0,0,0,0) 60%);
}

.bottom-spot {
  bottom: -20%;
  left: -10%;
  width: 50vw;
  height: 50vw;
  background: radial-gradient(circle, rgba(40,40,40,0.5) 0%, rgba(0,0,0,0) 60%);
}
</style>
