<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Compass, Home } from 'lucide-vue-next'

const router = useRouter()
</script>

<template>
  <div class="nf-root">
    <div class="nf-card">
      <div class="nf-icon">
        <Compass :size="34" />
      </div>
      <p class="nf-code">404</p>
      <h1 class="nf-title">Página não encontrada</h1>
      <p class="nf-desc">
        O endereço que você tentou abrir não existe ou foi movido.
      </p>
      <button class="nf-home press" type="button" @click="router.replace('/')">
        <Home :size="14" />
        Ir para o início
      </button>
    </div>
  </div>
</template>

<style scoped>
.nf-root {
  min-height: 70vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.nf-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  max-width: 380px;
  text-align: center;
}

.nf-icon {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  margin-bottom: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  color: var(--text-3);
}

.nf-code {
  margin: 0;
  color: var(--text-4);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.nf-title {
  margin: 0;
  color: var(--text);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.nf-desc {
  margin: 0;
  color: var(--text-3);
  font-size: 13px;
  line-height: 1.5;
}

.nf-home {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  min-height: 40px;
  padding: 9px 18px;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--accent-fg);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}
</style>
