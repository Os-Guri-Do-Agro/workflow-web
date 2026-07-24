<script setup lang="ts">
import { useAssistant } from '@/composables/useAssistant'

const { isOpen, open } = useAssistant()

const shortcutHint = navigator.platform.toLowerCase().includes('mac') ? '⌘ I' : 'Ctrl I'
</script>

<template>
  <Transition name="launcher">
    <button
      v-if="!isOpen"
      class="launcher"
      type="button"
      aria-label="Abrir assistente de IA"
      @click="open"
    >
      <span class="launcher-orb">
        <img src="/brand/marca.svg" alt="" class="launcher-face" draggable="false" />
      </span>
      <span class="launcher-tip">
        Assistente
        <kbd>{{ shortcutHint }}</kbd>
      </span>
    </button>
  </Transition>
</template>

<style scoped>
.launcher {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 9996;
  display: flex;
  align-items: center;
  gap: 0;
  height: 52px;
  width: 52px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
}

.launcher-orb {
  position: relative;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
  /* Fundo creme da marca: preenche os cantos do selo (squircle) que o circulo
     recorta, deixando um disco creme limpo sob a carinha nos dois temas. */
  background: var(--brand-body);
  box-shadow:
    var(--shadow),
    0 0 0 1px color-mix(in srgb, var(--brand-ink) 22%, transparent);
  animation: launcher-bob 4.5s var(--motion-ease) infinite;
  transition:
    transform var(--motion) var(--motion-ease),
    box-shadow var(--motion) var(--motion-ease);
}

.launcher-orb::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--brand-accent) 45%, transparent);
  animation: pulse 2.8s ease-out infinite;
}

/* A carinha do mascote (o mesmo selo do app bar). Levemente ampliada para
   respirar dentro do disco; "acorda" com uma balancada no hover. */
.launcher-face {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform: scale(1.12);
  transition: transform var(--motion-slow) var(--motion-ease);
}

@keyframes launcher-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-2px);
  }
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--brand-accent) 40%, transparent);
  }
  70%,
  100% {
    box-shadow: 0 0 0 14px transparent;
  }
}

/* Tooltip que expande no hover */
.launcher-tip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  opacity: 0;
  transition:
    max-width var(--motion-slow) var(--motion-ease),
    opacity var(--motion) var(--motion-ease),
    padding var(--motion-slow) var(--motion-ease);
}

.launcher:hover {
  width: auto;
  padding-right: 16px;
  background: var(--surface);
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}
.launcher:hover .launcher-orb {
  animation: none;
  transform: scale(0.94);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-ink) 22%, transparent);
}
.launcher:hover .launcher-face {
  transform: rotate(-7deg) scale(1.2);
}
.launcher:hover .launcher-tip {
  max-width: 160px;
  opacity: 1;
  padding-left: 4px;
}

.launcher:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
.launcher:active .launcher-orb {
  animation: none;
  transform: scale(0.88);
}

.launcher-tip kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 5px;
}

.launcher-enter-active {
  transition:
    transform var(--motion) var(--motion-ease),
    opacity var(--motion) var(--motion-ease);
}
.launcher-leave-active {
  transition:
    transform var(--motion-fast) var(--motion-ease),
    opacity var(--motion-fast) var(--motion-ease);
}
.launcher-enter-from,
.launcher-leave-to {
  transform: scale(0.6) translateY(8px);
  opacity: 0;
}

@media (max-width: 640px) {
  .launcher {
    right: 16px;
    bottom: 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .launcher-orb,
  .launcher-orb::after {
    animation: none;
  }
  .launcher,
  .launcher-orb,
  .launcher-face,
  .launcher-tip {
    transition: none;
  }
}
</style>
