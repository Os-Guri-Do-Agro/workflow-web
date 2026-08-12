<script setup lang="ts">
/**
 * Faixa "Recentes": os últimos arquivos do espaço, sempre à mão.
 *
 * É a peça que todo drive de nuvem tem e que faltava aqui: quem volta ao Drive
 * quase sempre quer o que mexeu por último, e não navegar a árvore de pastas
 * até achar. Vem da visão geral (não da listagem), então continua mostrando os
 * últimos do ESPAÇO mesmo com o usuário dentro de uma pasta ou com filtro de
 * tipo ativo.
 *
 * Rolagem horizontal com `scroll-snap`, sem setas: a faixa tem no máximo seis
 * itens e em tela larga eles cabem sem rolar.
 */
import FileCover from './FileCover.vue'
import { formatBytes } from '@/utils/file-kind'
import { shortDate } from '@/features/drive/format'
import type { DriveFile } from '@/features/drive/types'

defineProps<{ files: DriveFile[] }>()

const emit = defineEmits<{ open: [file: DriveFile] }>()
</script>

<template>
  <section v-if="files.length" v-reveal="2" class="rec" aria-label="Arquivos recentes">
    <h2 class="rec-title">Recentes</h2>

    <div class="rec-track">
      <button
        v-for="file in files"
        :key="file.id"
        type="button"
        class="bento-cell rec-card hover-lift press"
        @click="emit('open', file)"
      >
        <FileCover class="rec-cover" :file="file" :height="96" />
        <span class="rec-info">
          <span class="rec-name" :title="file.name">{{ file.name }}</span>
          <span class="rec-meta">
            {{ formatBytes(file.size) }} · {{ shortDate(file.createdAt) }}
          </span>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
@import '@/features/dashboard/components/dashboard-shared.css';

.rec {
  margin-bottom: 22px;
}

.rec-title {
  margin: 0 0 10px;
  color: var(--text-3);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.rec-track {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(184px, 1fr);
  gap: 12px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  padding-bottom: 4px;
  /* A faixa sangra até a borda ao rolar, sem cortar a sombra dos cards. */
  margin: 0 -4px;
  padding-left: 4px;
  padding-right: 4px;
  /* Barra fina e discreta: a de sistema é grossa e rouba a atenção das capas. */
  scrollbar-width: thin;
  scrollbar-color: var(--border-strong) transparent;
}

.rec-track::-webkit-scrollbar {
  height: 6px;
}

.rec-track::-webkit-scrollbar-track {
  background: transparent;
}

.rec-track::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: 999px;
}

.rec-card {
  scroll-snap-align: start;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.rec-card:hover {
  border-color: var(--border-strong);
}

.rec-cover {
  height: 96px;
  border-bottom: 1px solid var(--border);
}

.rec-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 11px 11px;
  min-width: 0;
}

.rec-name {
  color: var(--text);
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rec-meta {
  color: var(--text-3);
  font-size: 11px;
}

@media (max-width: 720px) {
  .rec-track {
    grid-auto-columns: 150px;
  }
}
</style>
