<script setup lang="ts">
import { Sparkles, MessageSquare, Search } from 'lucide-vue-next'

defineProps<{
  searchStatus: { indexed: boolean; lastIndexedAt: string | null } | null
  workspaceAnswer: string
  digestSummary: string
  formatFeedDate: (value: string) => string
}>()

const emit = defineEmits<{
  (e: 'open-ai', tool: 'ask' | 'digest'): void
  (e: 'open-search'): void
}>()
</script>

<template>
  <section class="copilot-section">
    <header class="section-head">
      <div>
        <h2 class="section-title">
          <Sparkles :size="15" class="section-icon" />
          Assistentes de IA
        </h2>
        <p class="section-subtitle">
          Use IA quando precisar investigar, resumir ou encontrar contexto no workspace.
        </p>
      </div>
      <div class="copilot-status">
        <span>{{ searchStatus?.indexed ? 'Indexado' : 'Índice pendente' }}</span>
        <small v-if="searchStatus?.lastIndexedAt">{{ formatFeedDate(searchStatus.lastIndexedAt) }}</small>
      </div>
    </header>

    <div class="ai-actions-grid">
      <article class="ai-action-card">
        <div class="ai-card-icon"><Sparkles :size="16" /></div>
        <div class="ai-card-body">
          <strong>Pergunte ao workspace</strong>
          <span>Faça perguntas sobre tarefas, roadmap, eventos e bloqueios usando as fontes indexadas.</span>
        </div>
        <button class="ghost-btn press" type="button" @click="emit('open-ai', 'ask')">Abrir</button>
      </article>

      <article class="ai-action-card">
        <div class="ai-card-icon"><MessageSquare :size="16" /></div>
        <div class="ai-card-body">
          <strong>Resumo da semana</strong>
          <span>Transforma a timeline recente em um digest executivo para alinhamentos rápidos.</span>
        </div>
        <button class="ghost-btn press" type="button" @click="emit('open-ai', 'digest')">Abrir</button>
      </article>

      <article class="ai-action-card ai-action-card--muted">
        <div class="ai-card-icon"><Search :size="16" /></div>
        <div class="ai-card-body">
          <strong>Busca inteligente</strong>
          <span>Pressione Ctrl+K e digite qualquer termo para localizar itens do workspace.</span>
        </div>
        <button class="ghost-btn press" type="button" @click="emit('open-search')">Buscar</button>
      </article>
    </div>

    <article v-if="workspaceAnswer || digestSummary" class="ai-result-strip">
      <div>
        <span class="eyebrow">Última saída da IA</span>
        <p>{{ workspaceAnswer || digestSummary }}</p>
      </div>
      <button
        class="ghost-btn press"
        type="button"
        @click="emit('open-ai', workspaceAnswer ? 'ask' : 'digest')"
      >
        Ver detalhes
      </button>
    </article>
  </section>
</template>

<style scoped>
@import './dashboard-shared.css';

.copilot-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: 16px;
}

.copilot-section .section-head {
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 2px;
}

.copilot-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-3);
  font-size: 12px;
  flex-wrap: wrap;
}

.copilot-status > span {
  color: var(--success);
  font-weight: 700;
}

.copilot-status small {
  color: var(--text-4);
}

.ai-actions-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.ai-action-card {
  display: grid;
  grid-template-columns: 34px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  min-width: 0;
}

.ai-action-card--muted {
  background: color-mix(in srgb, var(--surface-2) 72%, transparent);
}

.ai-card-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
}

.ai-card-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.ai-card-body strong {
  font-size: 13px;
  color: var(--text);
}

.ai-card-body span {
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.45;
}

.ai-result-strip {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--accent) 7%, var(--surface-2));
}

.ai-result-strip p {
  margin: 0;
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@media (max-width: 960px) {
  .ai-actions-grid {
    grid-template-columns: 1fr;
  }
  .ai-action-card {
    grid-template-columns: 34px 1fr;
  }
  .ai-action-card .ghost-btn {
    grid-column: 1 / -1;
    justify-content: center;
  }
}
</style>
