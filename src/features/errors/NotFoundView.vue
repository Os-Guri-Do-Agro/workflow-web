<script setup lang="ts">
/**
 * 404 amigável (rota inexistente, ex.: /tickets removido).
 *
 * O Nevo aparece `confuso` (o sprite já traz o "?" amarelo sobre a cabeça) e
 * uma dúvida azul (`extra-duvida`) flutua do outro lado: o gesto de "cadê?"
 * sem precisar de ilustração nova. Tudo CSS; com movimento reduzido fica
 * parado. As duas imagens são decorativas: quem usa leitor de tela ouve o
 * título e a explicação.
 */
import { useRouter } from 'vue-router'
import { ArrowLeft, Home } from 'lucide-vue-next'
import NevoSprite from '@/components/nevo/NevoSprite.vue'
import { nevoSize, nevoSrc } from '@/components/nevo/nevo-assets'

const router = useRouter()

/** Só oferece "Voltar" quando existe página anterior nesta aba. */
const canGoBack = typeof window !== 'undefined' && window.history.length > 1

const NEVO_SIZE = 168
const [doubtW, doubtH] = nevoSize('extra-duvida')
const DOUBT_H = 52
const doubt = {
  src: nevoSrc('extra-duvida'),
  height: DOUBT_H,
  width: Math.round((doubtW / doubtH) * DOUBT_H),
}
</script>

<template>
  <div class="nf-root">
    <div class="nf-card">
      <div class="nf-stage" aria-hidden="true">
        <span class="nf-disc" />
        <img
          class="nf-doubt"
          :src="doubt.src"
          :width="doubt.width"
          :height="doubt.height"
          alt=""
          draggable="false"
          decoding="async"
        />
        <NevoSprite class="nf-nevo" pose="confuso" motion="idle" :size="NEVO_SIZE" floor />
      </div>

      <p class="nf-code">Erro 404</p>
      <h1 class="nf-title">Opa, essa página não existe</h1>
      <p class="nf-desc">
        O Nevo procurou em todo canto e não achou nada nesse endereço. O link pode ter mudado
        ou ter um errinho de digitação.
      </p>

      <div class="nf-actions">
        <button class="nf-btn nf-btn--primary press" type="button" @click="router.replace('/')">
          <Home :size="16" aria-hidden="true" />
          Ir para o início
        </button>
        <button v-if="canGoBack" class="nf-btn press" type="button" @click="router.back()">
          <ArrowLeft :size="16" aria-hidden="true" />
          Voltar
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nf-root {
  min-height: 70vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
}

.nf-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 440px;
  text-align: center;
}

/* ─── Palco ──────────────────────────────────────────────────────────────── */
.nf-stage {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 240px;
  height: 200px;
  margin-bottom: 12px;
}

/* Disco chapado e neutro atrás do Nevo: profundidade sem halo. */
.nf-disc {
  position: absolute;
  left: 50%;
  bottom: 10px;
  width: 188px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  transform: translateX(-50%);
}

.nf-nevo {
  position: relative;
}

/* A dúvida flutua à esquerda da cabeça (o "?" do sprite fica à direita). */
.nf-doubt {
  position: absolute;
  top: 16px;
  left: 42px;
  z-index: 1;
  max-width: none;
  pointer-events: none;
  user-select: none;
  transform-origin: 50% 100%;
  animation: nf-float 3.4s ease-in-out infinite;
}

/* ─── Texto ──────────────────────────────────────────────────────────────── */
.nf-code {
  margin: 0;
  color: var(--text-3);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.nf-title {
  margin: 0;
  color: var(--text);
  font-size: 1.5rem;
  font-weight: 750;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.nf-desc {
  margin: 0;
  max-width: 40ch;
  color: var(--text-2);
  font-size: 0.9375rem;
  line-height: 1.5;
}

/* ─── Ações ──────────────────────────────────────────────────────────────── */
.nf-actions {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}

.nf-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  /* Alvo >= 44px (acessibilidade 50+). */
  min-height: 44px;
  padding: 0 18px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    filter var(--motion-fast) var(--motion-ease);
}

.nf-btn:hover {
  background: var(--surface-3);
}

.nf-btn--primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--accent-fg);
}

.nf-btn--primary:hover {
  background: var(--accent);
  filter: brightness(1.06);
}

.nf-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* 100% é o repouso: com movimento reduzido a chave global roda 1 iteração e
   para aqui, e o bloco abaixo desliga de vez. */
@keyframes nf-float {
  0%,
  100% {
    transform: translateY(0) rotate(-8deg);
  }
  50% {
    transform: translateY(-10px) rotate(4deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nf-doubt {
    animation: none;
  }
}
</style>
