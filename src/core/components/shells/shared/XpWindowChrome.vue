<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useUiPreferences } from '@/composables/useUiPreferences'

/*
 * Title bar azul Luna do easter egg Windows XP.
 *
 * Transforma a área de conteúdo (a "janela") numa janela XP de verdade: uma
 * barra fixa sobre o topo do container de conteúdo, com o título da rota à
 * esquerda e os 3 botões clássicos à direita (minimizar, maximizar, fechar).
 *
 * Como o AppShell não consegue injetar markup DENTRO do .main de cada shell
 * (são componentes de terceiros aqui), a barra é `position: fixed` e se alinha
 * ao container de conteúdo medindo o retângulo dele em runtime (ResizeObserver
 * + resize). O container reserva espaço via `padding-top` (ver xp.css), então a
 * barra cobre o topo da janela sem esconder conteúdo.
 *
 * Fechar (✕) desliga o modo XP — "fechar a janela" sai do XP. Minimizar/maximizar
 * são decorativos (micro-animação).
 */

const route = useRoute()
const { shell, toggleXp } = useUiPreferences()

// Título da janela a partir do nome da rota (mapa simples). Reaproveita os
// mesmos rótulos PT-BR usados nos breadcrumbs dos shells.
const ROUTE_TITLES: Record<string, string> = {
  home: 'Dashboard',
  dashboard: 'Dashboard',
  board: 'Board',
  boards: 'Canvas',
  'board-canvas': 'Board',
  roadmap: 'Roadmap',
  tasks: 'Tarefas',
  'task-details': 'Tarefa',
  report: 'Relatório',
  settings: 'Configurações',
  variables: 'Variáveis',
  'company-users': 'Usuários',
  notes: 'Notas',
  'note-editor': 'Nota',
  calendar: 'Calendário',
  time: 'Meu tempo',
  qr: 'QR Codes',
  'repos-list': 'Repositórios',
  'repo-browser': 'Repositório',
  'bug-reports-list': 'Relatos de bug',
  'bug-report-detail': 'Relato de bug',
}

const title = computed(() => {
  const label = ROUTE_TITLES[String(route.name ?? '')] ?? 'Workflow'
  return `${label} - Workflow`
})

// A "janela" (container de scroll) muda por shell: Focus usa .main-scroll; os
// demais usam .main.
function windowSelector(): string {
  if (shell.value === 'focus') return '.focus-shell .main-scroll'
  if (shell.value === 'canvas') return '.canvas-shell .main'
  return '.command-shell .main'
}

const rect = ref({ top: 8, left: 72, width: 400 })
let winEl: HTMLElement | null = null
let ro: ResizeObserver | null = null
// Enquanto a animação de abertura roda, o transform: scale() distorce o
// getBoundingClientRect — então pausamos a remedição por ~240ms (a posição de
// layout não muda no período, só o transform visual).
let animUntil = 0

const ANIM_CLASS = 'xp-anim-open'

// Mede o retângulo da janela (sem transform ativo). Retorna false se a janela
// ainda não está no layout (largura 0) ou se a animação de abertura está em
// curso (o scale distorceria a medida).
function measure(): boolean {
  if (!winEl) return false
  if (performance.now() < animUntil) return false
  const r = winEl.getBoundingClientRect()
  if (r.width < 1) return false
  rect.value = { top: r.top, left: r.left, width: r.width }
  return true
}

function triggerOpenAnim(): void {
  if (!winEl) return
  animUntil = performance.now() + 240
  winEl.classList.remove(ANIM_CLASS)
  // Força reflow p/ reiniciar a animação em navegações consecutivas.
  void winEl.offsetWidth
  winEl.classList.add(ANIM_CLASS)
}

function attach(animate: boolean, retries = 5): void {
  const el = document.querySelector(windowSelector()) as HTMLElement | null
  if (el !== winEl) {
    if (ro && winEl) ro.unobserve(winEl)
    winEl?.classList.remove(ANIM_CLASS)
    winEl = el
    if (winEl && ro) ro.observe(winEl)
  }
  if (!winEl) {
    // Shell ainda não montou a janela: tenta de novo nos próximos frames.
    if (retries > 0) requestAnimationFrame(() => attach(animate, retries - 1))
    return
  }
  const ok = measure() // mede ANTES de animar (posição real, sem transform)
  if (!ok && retries > 0) {
    requestAnimationFrame(() => attach(animate, retries - 1))
    return
  }
  if (animate) triggerOpenAnim()
}

const onResize = () => measure()

onMounted(() => {
  ro = new ResizeObserver(() => measure())
  // Espera o layout do shell assentar antes da primeira medição.
  requestAnimationFrame(() => attach(true))
  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
  window.removeEventListener('resize', onResize)
  // Ao sair do XP não deixa resíduo de classe de animação na janela.
  winEl?.classList.remove(ANIM_CLASS)
})

// Troca de shell → re-localiza a janela (posição diferente).
watch(shell, () => requestAnimationFrame(() => attach(true)))

// Navegação → mesma janela, reposiciona e re-dispara a animação de abertura.
watch(
  () => route.fullPath,
  () => requestAnimationFrame(() => attach(true)),
)

const barStyle = computed(() => ({
  top: `${rect.value.top}px`,
  left: `${rect.value.left}px`,
  width: `${rect.value.width}px`,
}))

// Minimizar/maximizar: decorativos, só uma micro-animação de feedback.
const minimizing = ref(false)
const maximizing = ref(false)
function onMinimize(): void {
  minimizing.value = true
  window.setTimeout(() => (minimizing.value = false), 220)
}
function onMaximize(): void {
  maximizing.value = true
  window.setTimeout(() => (maximizing.value = false), 220)
}

// Fechar a janela = sair do modo XP (divertido e útil).
function onClose(): void {
  toggleXp()
}
</script>

<template>
  <div
    class="xp-titlebar"
    :class="{ 'xp-titlebar--min': minimizing, 'xp-titlebar--max': maximizing }"
    :style="barStyle"
    role="presentation"
  >
    <span class="xp-titlebar-title">{{ title }}</span>
    <div class="xp-titlebar-buttons">
      <button
        class="xp-winbtn xp-winbtn--min"
        type="button"
        aria-label="Minimizar"
        title="Minimizar"
        @click="onMinimize"
      >
        <span class="glyph-min" aria-hidden="true" />
      </button>
      <button
        class="xp-winbtn xp-winbtn--max"
        type="button"
        aria-label="Maximizar"
        title="Maximizar"
        @click="onMaximize"
      >
        <span class="glyph-max" aria-hidden="true" />
      </button>
      <button
        class="xp-winbtn xp-winbtn--close"
        type="button"
        aria-label="Fechar (sair do modo Windows XP)"
        title="Fechar — sai do modo Windows XP"
        @click="onClose"
      >
        <span class="glyph-close" aria-hidden="true">✕</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Barra fixa alinhada ao topo da janela de conteúdo (cores literais Luna). */
.xp-titlebar {
  position: fixed;
  z-index: 900;
  height: 28px;
  display: flex;
  align-items: center;
  padding: 0 3px 0 9px;
  box-sizing: border-box;
  border-radius: 4px 4px 0 0;
  font-family: Tahoma, 'Segoe UI', Verdana, sans-serif;
  user-select: none;
  background: linear-gradient(
    180deg,
    #0997ff 0%,
    #0053ee 8%,
    #0050ee 46%,
    #0055eb 62%,
    #2f7bff 86%,
    #0049b7 100%
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.45),
    inset 0 -1px 0 rgba(0, 0, 0, 0.18);
  transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* Feedback decorativo dos botões minimizar/maximizar. */
.xp-titlebar--min {
  transform: translateY(2px) scale(0.997);
}
.xp-titlebar--max {
  transform: scale(1.004);
}

.xp-titlebar-title {
  flex: 1;
  min-width: 0;
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
  text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.xp-titlebar-buttons {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

/* Botões quadrados 21x21 com brilho superior, estilo Luna. */
.xp-winbtn {
  width: 21px;
  height: 21px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  border-radius: 3px;
  border: 1px solid rgba(255, 255, 255, 0.55);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
  color: #ffffff;
  font-family: inherit;
  transition: filter 120ms ease;
}

.xp-winbtn--min,
.xp-winbtn--max {
  background: linear-gradient(180deg, #3f8cf3 0%, #1d5fd6 55%, #1748b0 100%);
}

.xp-winbtn--close {
  background: linear-gradient(180deg, #f08a5a 0%, #e0491f 45%, #b5300f 100%);
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.xp-winbtn:hover {
  filter: brightness(1.12);
}

.xp-winbtn:active {
  filter: brightness(0.9);
}

.xp-winbtn:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 1px;
}

.glyph-close {
  text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.45);
}

/* Traço do "minimizar" (— embaixo). */
.glyph-min {
  width: 7px;
  height: 2px;
  margin-top: 6px;
  background: #ffffff;
  box-shadow: 1px 1px 0 rgba(0, 0, 0, 0.35);
}

/* Quadrado do "maximizar" (▢). */
.glyph-max {
  width: 9px;
  height: 8px;
  border: 1px solid #ffffff;
  border-top-width: 2px;
  box-shadow: 1px 1px 0 rgba(0, 0, 0, 0.35);
}

@media (prefers-reduced-motion: reduce) {
  .xp-titlebar {
    transition: none;
  }
}
</style>
