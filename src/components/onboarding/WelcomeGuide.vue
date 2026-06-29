<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Sparkles,
  X,
  Check,
  ArrowRight,
  LayoutDashboard,
  Milestone,
  Paintbrush,
  KeyRound,
  Settings,
  PartyPopper,
  type LucideIcon,
} from 'lucide-vue-next'
import { useOnboarding } from '@/composables/useOnboarding'
import { useAssistant } from '@/composables/useAssistant'

interface Step {
  id: string
  icon: LucideIcon
  title: string
  desc: string
  cta: string
  to?: string
  action?: 'assistant'
}

const router = useRouter()
const onboarding = useOnboarding()
const assistant = useAssistant()
const { isOpen, completedCount } = onboarding

const dialogRef = ref<HTMLElement | null>(null)

const steps: Step[] = [
  { id: 'dashboard', icon: LayoutDashboard, title: 'Veja o panorama', desc: 'Métricas, feed da empresa e o que precisa de atenção.', cta: 'Abrir Dashboard', to: '/' },
  { id: 'roadmap', icon: Milestone, title: 'Planeje o ano', desc: 'Monte o roadmap mensal e acompanhe as entregas.', cta: 'Abrir Roadmap', to: '/roadmap' },
  { id: 'canvas', icon: Paintbrush, title: 'Desenhe e colabore', desc: 'Boards de canvas em tempo real com o seu time.', cta: 'Abrir Canvas', to: '/boards' },
  { id: 'ai', icon: Sparkles, title: 'Pergunte à IA', desc: 'Tire dúvidas sobre o workspace — atalho Ctrl/Cmd + I.', cta: 'Abrir assistente', action: 'assistant' },
  { id: 'variables', icon: KeyRound, title: 'Centralize credenciais', desc: 'Guarde URLs, chaves e secrets por empresa.', cta: 'Abrir Variáveis', to: '/variables' },
  { id: 'settings', icon: Settings, title: 'Deixe com a sua cara', desc: 'Tema, cor de destaque, densidade e shell.', cta: 'Abrir Configurações', to: '/settings' },
]

const total = steps.length
const progress = computed(() => Math.round((completedCount.value / total) * 100))
const allDone = computed(() => completedCount.value >= total)

function runStep(step: Step) {
  onboarding.complete(step.id)
  onboarding.close()
  if (step.action === 'assistant') assistant.open()
  else if (step.to) router.push(step.to)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') onboarding.close()
}

watch(isOpen, (open) => {
  if (open) {
    requestAnimationFrame(() => dialogRef.value?.focus())
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="guide">
      <div
        v-if="isOpen"
        class="guide-overlay"
        @mousedown.self="onboarding.close()"
        @keydown="onKeydown"
      >
        <section
          ref="dialogRef"
          class="guide glass-strong"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guide-title"
          tabindex="-1"
        >
          <button class="guide-close icon-btn press" type="button" aria-label="Fechar" @click="onboarding.close()">
            <X :size="16" />
          </button>

          <header class="guide-head">
            <span class="guide-eyebrow">
              <Sparkles :size="12" /> Primeiros passos
            </span>
            <h2 id="guide-title" class="guide-title">Bem-vindo ao Workflow</h2>
            <p class="guide-sub">
              Um tour rápido pelo que dá pra fazer aqui. Clique pra ir direto — marcamos o que você já explorou.
            </p>
          </header>

          <div class="guide-progress">
            <div class="bar"><span class="bar-fill" :style="{ width: `${progress}%` }" /></div>
            <span class="bar-label">{{ completedCount }} de {{ total }}</span>
          </div>

          <!-- Success state -->
          <div v-if="allDone" class="guide-done">
            <span class="done-orb"><PartyPopper :size="24" /></span>
            <p class="done-title">Tudo explorado! 🎉</p>
            <p class="done-desc">Você pode reabrir este guia quando quiser pela paleta de comandos (Cmd/Ctrl + K → "Primeiros passos").</p>
            <button class="guide-primary press" type="button" @click="onboarding.close()">Começar a usar</button>
          </div>

          <!-- Steps -->
          <ul v-else class="guide-steps">
            <li v-for="step in steps" :key="step.id">
              <button
                class="step press"
                :class="{ 'step--done': onboarding.isDone(step.id) }"
                type="button"
                @click="runStep(step)"
              >
                <span class="step-orb">
                  <Check v-if="onboarding.isDone(step.id)" :size="15" />
                  <component :is="step.icon" v-else :size="15" />
                </span>
                <span class="step-body">
                  <span class="step-title">{{ step.title }}</span>
                  <span class="step-desc">{{ step.desc }}</span>
                </span>
                <span class="step-cta">
                  {{ onboarding.isDone(step.id) ? 'Revisitar' : step.cta }}
                  <ArrowRight :size="14" />
                </span>
              </button>
            </li>
          </ul>

          <footer v-if="!allDone" class="guide-foot">
            <span class="foot-hint">Reabra em <kbd>Cmd/Ctrl</kbd>+<kbd>K</kbd> → Primeiros passos</span>
            <button class="guide-ghost press" type="button" @click="onboarding.close()">Pular por agora</button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.guide-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: color-mix(in srgb, #000 52%, transparent);
  backdrop-filter: blur(8px);
}

.guide {
  position: relative;
  width: 540px;
  max-width: 100%;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  padding: 28px;
  border-radius: var(--radius-xl);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  box-shadow: var(--shadow-overlay);
}
.guide:focus {
  outline: none;
}

.guide-close {
  position: absolute;
  top: 16px;
  right: 16px;
}
.icon-btn {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}
.icon-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}
.icon-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.guide-head {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding-right: 36px;
  margin-bottom: 18px;
}
.guide-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  align-self: flex-start;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.guide-title {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text);
  margin: 0;
}
.guide-sub {
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-3);
  margin: 0;
}

.guide-progress {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}
.bar {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}
.bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #fff));
  transition: width var(--motion-slow) var(--motion-ease);
}
.bar-label {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.guide-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.step {
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  padding: 13px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface-2);
  text-align: left;
  font-family: inherit;
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}
.step:hover {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  background: var(--surface-3);
  transform: translateX(2px);
}
.step:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.step--done {
  background: transparent;
}
.step--done .step-title {
  color: var(--text-2);
}

.step-orb {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: var(--radius);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  transition:
    color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}
.step--done .step-orb {
  color: var(--accent-fg);
  background: var(--accent);
}

.step-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.step-title {
  font-size: 13.5px;
  font-weight: 650;
  color: var(--text);
}
.step-desc {
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-3);
}

.step-cta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
  opacity: 0;
  transform: translateX(-4px);
  transition:
    opacity var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}
.step:hover .step-cta {
  opacity: 1;
  transform: translateX(0);
  color: var(--accent);
}

.guide-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.foot-hint {
  font-size: 11px;
  color: var(--text-4);
}
.foot-hint kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0 4px;
}
.guide-ghost {
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}
.guide-ghost:hover {
  background: var(--surface-2);
  color: var(--text);
}

/* Success */
.guide-done {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  padding: 18px 8px 6px;
}
.done-orb {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  box-shadow: 0 0 0 8px color-mix(in srgb, var(--accent) 6%, transparent);
}
.done-title {
  font-size: 17px;
  font-weight: 750;
  color: var(--text);
  margin: 4px 0 0;
}
.done-desc {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-3);
  margin: 0;
  max-width: 360px;
}
.guide-primary {
  margin-top: 8px;
  padding: 10px 22px;
  border-radius: var(--radius);
  border: none;
  background: var(--accent);
  color: var(--accent-fg);
  font-size: 13px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: transform var(--motion-fast) var(--motion-ease);
}
.guide-primary:hover {
  transform: translateY(-1px);
}
.guide-primary:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Transitions */
.guide-enter-active {
  transition: opacity var(--motion) var(--motion-ease);
}
.guide-enter-active .guide {
  transition:
    transform var(--motion) var(--motion-ease),
    opacity var(--motion) var(--motion-ease);
}
.guide-leave-active {
  transition: opacity var(--motion-fast) var(--motion-ease);
}
.guide-enter-from {
  opacity: 0;
}
.guide-enter-from .guide {
  transform: scale(0.96) translateY(12px);
  opacity: 0;
}
.guide-leave-to {
  opacity: 0;
}

@media (max-width: 560px) {
  .guide {
    padding: 22px 18px;
  }
  .guide-title {
    font-size: 19px;
  }
  .step-cta {
    display: none;
  }
  .guide-foot {
    flex-direction: column-reverse;
    align-items: stretch;
  }
  .guide-ghost {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .guide-enter-active,
  .guide-enter-active .guide,
  .guide-leave-active,
  .bar-fill,
  .step {
    transition: none;
  }
}
</style>
