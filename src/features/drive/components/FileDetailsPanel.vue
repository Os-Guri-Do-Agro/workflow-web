<script setup lang="ts">
/**
 * Painel lateral com o dossiê do arquivo: capa grande, metadados completos e
 * as ações principais. É onde mora a informação que não cabe no card sem
 * transformar a grade num formulário (data exata, pasta, autor, tipo MIME).
 */
import { computed } from 'vue'
import { Download, Eye, Share2, X } from 'lucide-vue-next'
import FileCover from './FileCover.vue'
import { formatBytes, labelOf } from '@/utils/file-kind'
import { coverLabelOf } from '@/features/drive/file-palette'
import { fullDate } from '@/features/drive/format'
import type { DriveFile } from '@/features/drive/types'

const props = defineProps<{
  file: DriveFile | null
  folderName: string | null
  canManage: boolean
}>()

const emit = defineEmits<{
  close: []
  open: []
  download: []
  share: []
}>()

const rows = computed(() => {
  const file = props.file
  if (!file) return []
  const family = labelOf({ filename: file.name, mimeType: file.mimeType })
  const ext = coverLabelOf(file.name, family)
  return [
    // Família + extensão numa linha só. O mime completo (que para um .xlsx tem
    // 66 caracteres) vira `title`: é informação de diagnóstico, não de produto,
    // e ocupava quatro linhas do painel dizendo o que "Planilha · XLSX" já diz.
    {
      label: 'Tipo',
      value: ext && ext !== family.toUpperCase() ? `${family} · ${ext}` : family,
      hint: file.mimeType,
    },
    { label: 'Tamanho', value: formatBytes(file.size) || 'desconhecido' },
    { label: 'Pasta', value: props.folderName ?? 'Raiz' },
    { label: 'Enviado por', value: file.owner?.name ?? 'desconhecido' },
    { label: 'Enviado em', value: fullDate(file.createdAt) },
  ]
})
</script>

<template>
  <aside v-if="file" class="fd" aria-label="Detalhes do arquivo">
    <header class="fd-head">
      <h2 class="fd-title">Detalhes</h2>
      <button type="button" class="fd-close press" aria-label="Fechar detalhes" @click="emit('close')">
        <X :size="16" />
      </button>
    </header>

    <div class="fd-cover">
      <FileCover :file="file" :height="180" />
    </div>

    <p class="fd-name">{{ file.name }}</p>

    <dl class="fd-rows">
      <div v-for="row in rows" :key="row.label" class="fd-row">
        <dt class="fd-key">{{ row.label }}</dt>
        <dd class="fd-val" :title="row.hint">{{ row.value }}</dd>
      </div>
    </dl>

    <div class="fd-acts">
      <button type="button" class="fd-btn press" @click="emit('open')">
        <Eye :size="15" />
        Visualizar
      </button>
      <button type="button" class="fd-btn press" @click="emit('download')">
        <Download :size="15" />
        Baixar
      </button>
      <button v-if="canManage" type="button" class="fd-btn fd-btn--accent press" @click="emit('share')">
        <Share2 :size="15" />
        Compartilhar
      </button>
    </div>
  </aside>
</template>

<style scoped>
.fd {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 300px;
  flex: none;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  align-self: flex-start;
  position: sticky;
  top: 8px;
}

.fd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.fd-title {
  margin: 0;
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.fd-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.fd-close:hover {
  background: var(--surface-2);
  color: var(--text);
}

.fd-cover {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.fd-name {
  margin: 0;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  word-break: break-word;
}

.fd-rows {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin: 0;
}

.fd-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.fd-key {
  flex: none;
  width: 92px;
  color: var(--text-3);
  font-size: 11px;
}

.fd-val {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: var(--text-2);
  font-size: 11.5px;
  word-break: break-word;
}

.fd-acts {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 2px;
}

.fd-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.fd-btn:hover {
  border-color: var(--border-strong);
}

.fd-btn--accent {
  background: var(--accent);
  border-color: transparent;
  color: var(--accent-fg);
}

@media (max-width: 1100px) {
  .fd {
    width: 100%;
    position: static;
  }
}
</style>
