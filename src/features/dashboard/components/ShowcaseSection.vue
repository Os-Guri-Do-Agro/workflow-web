<script setup lang="ts">
/**
 * Casca da vitrine 3D na home (spec sequencia-diaria-nevo, T7): card "O
 * Nevo em movimento" que monta o `NevoShowcase` (three.js + GSAP, T8). O nome
 * do produto que a pessoa vê é "Nevo" (aba, login, logo).
 *
 * O peso fica fora do caminho crítico em dois degraus:
 * 1. `defineAsyncComponent`: o componente da vitrine (e, por dentro dele, o
 *    three) é outro chunk; nada disso entra no chunk da home nem no de entrada.
 * 2. `useLazyLoad`: esse chunk só é pedido quando o card chega perto da tela
 *    (padrão das seções lazy do DashboardView).
 * Até lá, e enquanto o chunk baixa, fica um placeholder 16:9 com a mesma
 * geometria da vitrine, então nada pula quando ela chega.
 *
 * A vitrine é acessória: se falhar (chunk que não baixa, WebGL que quebra no
 * setup), a `ErrorBoundary` segura e o resto da home segue normal.
 *
 * `hidden` (v-model): a pessoa pode ocultar a vitrine. Oculta, sobra só uma
 * linha discreta com "Mostrar vitrine". Quem lembra a escolha é a home (ela
 * precisa do valor para reorganizar a grade); aqui só se pede a troca.
 */
import { computed, defineAsyncComponent, nextTick, ref } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'
import ErrorBoundary from '@/components/ui/ErrorBoundary.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import NevoSprite from '@/components/nevo/NevoSprite.vue'
import { useLazyLoad } from '@/composables/useLazyLoad'
import { useStreak, useStreakTeam } from '@/composables/useStreak'

defineProps<{ hidden: boolean }>()
const emit = defineEmits<{ (e: 'update:hidden', value: boolean): void }>()

/**
 * Estado do chunk, para o placeholder sair na mesma renderização em que a
 * vitrine entra (os dois `then` resolvem antes do próximo flush). Se o chunk
 * falhar, o placeholder também sai: senão ele cobriria o aviso da
 * ErrorBoundary com um brilho de "carregando" que nunca termina.
 */
const chunk = ref<'idle' | 'ready' | 'failed'>('idle')
const NevoShowcase = defineAsyncComponent(() =>
  import('@/components/nevo/showcase/NevoShowcase.vue').then(
    (mod) => {
      chunk.value = 'ready'
      return mod
    },
    (err: unknown) => {
      chunk.value = 'failed'
      throw err
    },
  ),
)

const { target, isVisible } = useLazyLoad()

/**
 * O observador do `useLazyLoad` só liga no `onMounted`. Se a home abriu com a
 * vitrine oculta, o palco não existia naquela hora e nada seria observado:
 * "Mostrar vitrine" deixaria o placeholder para sempre. Quem clicou em
 * mostrar está olhando para ela, então o clique já conta como "visível".
 */
const shownByUser = ref(false)
const mountShowcase = computed(() => isVisible.value || shownByUser.value)

// O botão acionado some junto com o ramo do v-if: sem levar o foco para o
// botão que aparece no lugar, ele caía no <body> e o anel de foco sumia.
const hideBtn = ref<HTMLButtonElement | null>(null)
const showBtn = ref<HTMLButtonElement | null>(null)

function hide() {
  emit('update:hidden', true)
  void nextTick(() => showBtn.value?.focus())
}

function show() {
  shownByUser.value = true
  emit('update:hidden', false)
  void nextTick(() => hideBtn.value?.focus())
}

// Mesmas consultas do hero e do painel do time (o Vue Query deduplica): a
// vitrine usa os números reais da pessoa nas legendas.
const { streak } = useStreak()
const { team } = useStreakTeam()
</script>

<template>
  <section v-if="!hidden" v-reveal="2" class="bento-cell ss" aria-labelledby="ss-title">
    <header class="ss-head">
      <div class="ss-copy">
        <h2 id="ss-title" class="ss-title">O Nevo em movimento</h2>
        <p class="ss-sub">Um passeio rápido pelo produto, com o Nevo de guia.</p>
      </div>
      <button ref="hideBtn" class="ghost-btn press ss-toggle" type="button" @click="hide">
        <EyeOff :size="15" aria-hidden="true" />
        <span>Ocultar vitrine</span>
      </button>
    </header>

    <div ref="target" class="ss-stage">
      <!-- Até o chunk chegar: mesma caixa 16:9 da vitrine, nada pula depois. -->
      <div v-if="chunk === 'idle'" class="ss-placeholder" aria-hidden="true">
        <Skeleton type="block" height="100%" />
        <NevoSprite class="ss-placeholder-nevo" pose="segurando-bebida" motion="idle" :size="96" floor />
      </div>
      <ErrorBoundary v-if="mountShowcase" label="a vitrine">
        <NevoShowcase class="ss-showcase" :streak="streak ?? null" :team="team ?? null" />
      </ErrorBoundary>
    </div>
  </section>

  <div v-else class="ss-collapsed">
    <span class="ss-collapsed-text">Vitrine animada oculta</span>
    <button ref="showBtn" class="ghost-btn press" type="button" @click="show">
      <Eye :size="15" aria-hidden="true" />
      <span>Mostrar vitrine</span>
    </button>
  </div>
</template>

<style scoped>
@import './dashboard-shared.css';

.ss {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px 20px;
  min-width: 0;
}

.ss-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 16px;
}

.ss-copy {
  min-width: 0;
}

.ss-title {
  margin: 0;
  font-size: var(--text-body-large);
  font-weight: 700;
  color: var(--text);
}

.ss-sub {
  margin: 2px 0 0;
  font-size: 0.8125rem;
  color: var(--text-3);
}

.ss-toggle {
  flex: none;
  color: var(--text-2);
}

/*
 * O palco não tem altura própria: quem dá a caixa é o placeholder (antes) ou a
 * própria vitrine (depois), as duas em 16:9 de 280 a 460px. Se a vitrine
 * falhar, sobra só o aviso compacto da ErrorBoundary, sem um buraco 16:9.
 */
.ss-stage {
  position: relative;
  width: 100%;
  min-width: 0;
}

.ss-placeholder {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  min-height: 280px;
  max-height: 460px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
}

.ss-placeholder > :first-child {
  position: absolute;
  inset: 0;
}

.ss-placeholder-nevo {
  position: relative;
  opacity: 0.85;
}

/* Mesma altura mínima que a vitrine ganha no celular (NevoShowcase.vue): sem
   isto o placeholder media 280px e a vitrine 380px, e a página pulava 100px
   quando o chunk chegava. */
@media (max-width: 640px) {
  .ss-placeholder {
    min-height: 380px;
  }
}

/*
 * A vitrine é um card por conta própria (borda, sombra, raio grande). Aqui ela
 * vive DENTRO de um card, então vira palco embutido: raio do nível de dentro
 * e sem a sombra de fora, que empilhada ficava pesada. O `.ss-stage` na frente
 * é de propósito: o CSS da vitrine chega DEPOIS (chunk lazy) com a mesma
 * especificidade e ganharia pela ordem.
 */
.ss-stage .ss-showcase {
  border-radius: var(--radius-lg);
  box-shadow: none;
}

/* ─── Oculta ─────────────────────────────────────────────────────────────── */
.ss-collapsed {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px 12px;
  min-width: 0;
}

.ss-collapsed-text {
  font-size: 0.8125rem;
  color: var(--text-3);
}
</style>
