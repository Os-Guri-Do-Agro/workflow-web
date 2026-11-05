<script setup lang="ts">
/**
 * Abertura da home (spec v2-mobile-e-home, H3): saudação com a data embaixo, as
 * abas da home e a ação primária. Sem o rótulo em caixa alta com ícone acima do
 * título: era o tique visual que fazia a tela parecer gerada por IA, e a data
 * lê melhor como linha comum.
 *
 * O seletor Empresa/Workspace só existe na aba Painel, que é a única que ele
 * muda: no "Meu dia" as tarefas já vêm de todas as empresas.
 */
import { Plus, Building2, Globe2 } from 'lucide-vue-next'
import type { DashboardMode } from '@/composables/useDashboardOrchestration'
import type { HomeTab } from '../home-tabs'

withDefaults(
  defineProps<{
    greeting: string
    /** Primeiro nome da pessoa logada; vazio = só a saudação ("Boa tarde"). */
    firstName?: string
    todayLabel: string
    mode: DashboardMode
    tab: HomeTab
    canCreateTask: boolean
    /** Aba Jornada só aparece quando a API tem a sequência. */
    journeyAvailable?: boolean
  }>(),
  { firstName: '', journeyAvailable: true },
)

const emit = defineEmits<{
  (e: 'set-mode', mode: DashboardMode): void
  (e: 'set-tab', tab: HomeTab): void
  (e: 'new-task'): void
}>()

const TABS: { key: HomeTab; label: string }[] = [
  { key: 'today', label: 'Meu dia' },
  { key: 'journey', label: 'Jornada' },
  { key: 'panel', label: 'Painel' },
]

/** Setas trocam de aba (padrão WAI-ARIA de tablist com ativação automática). */
function onTabKey(e: KeyboardEvent, tabs: { key: HomeTab }[], current: HomeTab) {
  const i = tabs.findIndex((t) => t.key === current)
  let next = i
  if (e.key === 'ArrowRight') next = (i + 1) % tabs.length
  else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = tabs.length - 1
  else return
  e.preventDefault()
  const key = tabs[next]!.key
  emit('set-tab', key)
  const el = (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-tab="${key}"]`)
  el?.focus()
}
</script>

<template>
  <header class="dh">
    <div class="dh-row">
      <div class="dh-copy">
        <h1 class="dh-title">{{ firstName ? `${greeting}, ${firstName}` : greeting }}</h1>
        <p class="dh-date">{{ todayLabel }}</p>
      </div>
      <button
        class="new-btn press"
        type="button"
        :disabled="!canCreateTask"
        :title="canCreateTask ? 'Criar nova tarefa' : 'Nenhum mês disponível'"
        @click="emit('new-task')"
      >
        <Plus :size="16" aria-hidden="true" />
        <span>Nova tarefa</span>
      </button>
    </div>

    <div class="dh-row dh-row--tabs">
      <div
        class="tabs"
        role="tablist"
        aria-label="Seções da home"
        @keydown="onTabKey($event, TABS.filter((t) => t.key !== 'journey' || journeyAvailable), tab)"
      >
        <template v-for="t in TABS" :key="t.key">
          <button
            v-if="t.key !== 'journey' || journeyAvailable"
            :id="`home-tab-${t.key}`"
            :data-tab="t.key"
            class="tab"
            :class="{ 'tab--active': tab === t.key }"
            type="button"
            role="tab"
            :aria-selected="tab === t.key"
            :aria-controls="`home-panel-${t.key}`"
            :tabindex="tab === t.key ? 0 : -1"
            @click="emit('set-tab', t.key)"
          >
            {{ t.label }}
          </button>
        </template>
      </div>

      <div v-if="tab === 'panel'" class="mode-toggle" role="group" aria-label="Escopo do painel">
        <button
          class="mode-btn press"
          :class="{ 'mode-btn--active': mode === 'company' }"
          type="button"
          :aria-pressed="mode === 'company'"
          @click="emit('set-mode', 'company')"
        >
          <Building2 :size="13" aria-hidden="true" />
          <span>Empresa</span>
        </button>
        <button
          class="mode-btn press"
          :class="{ 'mode-btn--active': mode === 'workspace' }"
          type="button"
          :aria-pressed="mode === 'workspace'"
          @click="emit('set-mode', 'workspace')"
        >
          <Globe2 :size="13" aria-hidden="true" />
          <span>Todas</span>
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.dh {
  display: grid;
  gap: 14px;
}

.dh-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.dh-row--tabs {
  align-items: center;
  border-bottom: 1px solid var(--border);
}

.dh-copy {
  min-width: 0;
}

.dh-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.015em;
  line-height: 1.2;
  color: var(--text);
  text-wrap: balance;
}

.dh-date {
  margin: 4px 0 0;
  font-size: 13.5px;
  color: var(--text-3);
}

.dh-date::first-letter {
  text-transform: uppercase;
}

.new-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-fg);
  font: inherit;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
}

.new-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 88%, var(--text));
}

.new-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.new-btn:focus-visible,
.tab:focus-visible,
.mode-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: -1px;
}

.tab {
  position: relative;
  min-height: 40px;
  padding: 0 12px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-3);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: color var(--motion-fast) var(--motion-ease);
}

.tab:hover {
  color: var(--text);
}

.tab--active {
  color: var(--accent-ink);
  border-bottom-color: var(--accent);
}

.mode-toggle {
  display: inline-flex;
  padding: 2px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  gap: 2px;
  margin-bottom: 6px;
}

.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  min-height: 32px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-3);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.mode-btn:hover {
  color: var(--text-2);
}

/* Modo ativo na cor escolhida em Configurações, como as vistas do board. */
.mode-btn--active {
  background: var(--surface);
  color: var(--accent-ink);
  box-shadow: var(--shadow-sm), inset 0 0 0 999px var(--accent-soft);
}

@media (max-width: 640px) {
  .dh-title {
    font-size: 21px;
  }

  .new-btn span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .new-btn {
    width: 44px;
    min-height: 44px;
    justify-content: center;
    padding: 0;
  }

  .tab {
    flex: 1;
    min-height: 44px;
  }

  .tabs {
    flex: 1;
  }

  .dh-row--tabs {
    gap: 8px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tab,
  .mode-btn {
    transition: none;
  }
}
</style>
