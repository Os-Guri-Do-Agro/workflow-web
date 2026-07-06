<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/*
 * Barra de tarefas do Windows XP (easter egg — tema Luna).
 * Componente AUTOCONTIDO: não é montado aqui; o AppShell monta quando xp está ligado.
 * As cores são literais do tema Luna (exceção permitida aos tokens do design system).
 */

// Relógio ao vivo HH:MM na bandeja (atualiza a cada 1s; limpa no unmount).
const now = ref('')
let timer: ReturnType<typeof setInterval> | null = null

function tick() {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  now.value = `${hh}:${mm}`
}

onMounted(() => {
  tick()
  timer = setInterval(tick, 1000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <footer class="xp-taskbar" aria-label="Barra de tarefas do Windows XP">
    <!-- Botão Start: pílula verde Luna + bandeirinha 4 cores -->
    <button class="xp-start" type="button">
      <svg class="xp-start-flag" viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
        <path d="M4 11 C10 6.5 16 5.5 22 7.5 L22 21.5 C16 19.5 10 20.5 4 25 Z" fill="#F35325" />
        <path d="M26 8.5 C32 10 38 9.5 44 6.5 L44 20.5 C38 23.5 32 24 26 22.5 Z" fill="#81BC06" />
        <path d="M4 29 C10 24.5 16 23.5 22 25.5 L22 39.5 C16 37.5 10 38.5 4 43 Z" fill="#05A6F0" />
        <path d="M26 26.5 C32 28 38 27.5 44 24.5 L44 38.5 C38 41.5 32 42 26 40.5 Z" fill="#FFBA08" />
      </svg>
      <span class="xp-start-text">start</span>
    </button>

    <!-- Espaço vazio da barra (onde ficariam as janelas abertas) -->
    <div class="xp-taskbar-fill" />

    <!-- Bandeja do sistema com relógio -->
    <div class="xp-tray">
      <span class="xp-clock">{{ now }}</span>
    </div>
  </footer>
</template>

<style scoped>
.xp-taskbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 30px;
  z-index: 1000;
  display: flex;
  align-items: stretch;
  font-family: Tahoma, 'Segoe UI', Verdana, sans-serif;
  /* Gradiente azul Luna da taskbar */
  background: linear-gradient(
    180deg,
    #245edb 0%,
    #3f8cf3 9%,
    #2c66d8 16%,
    #2358cf 45%,
    #2a6bde 90%,
    #1941a5 100%
  );
  box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.3);
  user-select: none;
}

/* Faixa de brilho ~2px mais clara no topo da barra */
.xp-taskbar::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, #5a97ff, #86b6ff);
  opacity: 0.85;
}

/* Botão Start: pílula verde com cantos direitos arredondados */
.xp-start {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  padding: 0 26px 0 11px;
  border: none;
  border-radius: 0 13px 13px 0;
  background: linear-gradient(
    180deg,
    #4aa93f 0%,
    #379e35 20%,
    #2f8f2c 58%,
    #217a1e 100%
  );
  box-shadow:
    inset 0 2px 0 rgba(255, 255, 255, 0.4),
    inset -3px 0 8px rgba(0, 0, 0, 0.28);
  color: #ffffff;
  cursor: pointer;
  font-family: inherit;
  transition: filter 120ms ease;
}

.xp-start:hover {
  filter: brightness(1.08);
}

.xp-start:active {
  filter: brightness(0.94);
}

.xp-start-flag {
  flex-shrink: 0;
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35));
}

.xp-start-text {
  font-style: italic;
  font-weight: 700;
  font-size: 15px;
  color: #ffffff;
  text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.4);
  letter-spacing: 0.01em;
}

.xp-taskbar-fill {
  flex: 1;
}

/* Bandeja: entalhe azul mais escuro à direita */
.xp-tray {
  display: inline-flex;
  align-items: center;
  height: 100%;
  padding: 0 14px;
  background: linear-gradient(
    180deg,
    #1e9fe0 0%,
    #157bd6 8%,
    #0f68c4 50%,
    #0d59b4 100%
  );
  border-left: 1px solid #0a3aa0;
  box-shadow: inset 2px 0 5px rgba(0, 0, 0, 0.35);
}

.xp-clock {
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3);
  font-variant-numeric: tabular-nums;
}
</style>
