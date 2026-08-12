<script setup lang="ts">
/**
 * Linha de abertura do dashboard bento: saudação + data à esquerda, modo e
 * ação primária à direita. Fina de propósito — o protagonismo é dos módulos.
 * (Extraída do antigo HeroSection, que virou o módulo de progresso.)
 */
import { Sparkles, Plus, Building2, Globe2 } from 'lucide-vue-next'
import type { DashboardMode } from '@/composables/useDashboardOrchestration'

defineProps<{
  greeting: string
  todayLabel: string
  mode: DashboardMode
  canCreateTask: boolean
}>()

const emit = defineEmits<{
  (e: 'set-mode', mode: DashboardMode): void
  (e: 'new-task'): void
}>()
</script>

<template>
  <header class="dh">
    <div class="dh-copy">
      <span class="eyebrow">
        <Sparkles :size="12" />
        {{ todayLabel }}
      </span>
      <h1 class="dh-title">{{ greeting }}</h1>
    </div>

    <div class="dh-actions">
      <div class="mode-toggle">
        <button
          class="mode-btn press"
          :class="{ 'mode-btn--active': mode === 'company' }"
          @click="emit('set-mode', 'company')"
        >
          <Building2 :size="12" />
          <span>Empresa</span>
        </button>
        <button
          class="mode-btn press"
          :class="{ 'mode-btn--active': mode === 'workspace' }"
          @click="emit('set-mode', 'workspace')"
        >
          <Globe2 :size="12" />
          <span>Workspace</span>
        </button>
      </div>
      <button
        class="ghost-btn press"
        :disabled="!canCreateTask"
        :title="canCreateTask ? 'Criar nova tarefa' : 'Nenhum mês disponível'"
        @click="emit('new-task')"
      >
        <Plus :size="14" />
        <span>Nova tarefa</span>
      </button>
    </div>
  </header>
</template>

<style scoped>
@import './dashboard-shared.css';

.dh {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.dh-title {
  margin: 0;
  font-size: 30px;
  font-weight: 750;
  letter-spacing: -0.028em;
  line-height: 1.05;
  color: var(--text);
}

.dh-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.mode-toggle {
  display: inline-flex;
  padding: 2px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  gap: 2px;
}

.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  min-height: 36px;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-family: inherit;
  font-size: 12px;
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

.mode-btn--active {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

@media (max-width: 768px) {
  .dh {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
