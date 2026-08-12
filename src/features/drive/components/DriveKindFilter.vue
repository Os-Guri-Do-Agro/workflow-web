<script setup lang="ts">
/**
 * Facetas por família de arquivo. É a navegação que um drive precisa ter além
 * de pastas: quem procura "aquela imagem" não lembra a pasta, lembra que era
 * uma imagem.
 *
 * As contagens vêm da visão geral e NÃO reagem ao filtro ativo (padrão da
 * sidebar do QR): um chip que zera a si mesmo ao ser clicado é um beco sem
 * saída visual. Família com zero arquivos simplesmente não aparece — chip
 * morto só ocupa espaço.
 *
 * O filtro varre o espaço inteiro e ignora a pasta atual, por decisão do
 * backend: filtrar "Imagens" dentro da pasta atual esconderia justamente o que
 * se procura.
 */
import { computed } from 'vue'
import {
  Archive,
  FileAudio,
  FileText,
  FileVideo,
  ImageIcon,
  Layers,
  type LucideIcon,
} from 'lucide-vue-next'
import type { DriveKind } from '@/service/drive/drive-service'

const props = defineProps<{
  counts: Record<DriveKind, number>
  total: number
  active: DriveKind | null
}>()

const emit = defineEmits<{ select: [kind: DriveKind | null] }>()

const CHIPS: Array<{ kind: DriveKind; label: string; icon: LucideIcon }> = [
  { kind: 'image', label: 'Imagens', icon: ImageIcon },
  { kind: 'document', label: 'Documentos', icon: FileText },
  { kind: 'video', label: 'Vídeos', icon: FileVideo },
  { kind: 'audio', label: 'Áudios', icon: FileAudio },
  { kind: 'archive', label: 'Compactados', icon: Archive },
  { kind: 'other', label: 'Outros', icon: Layers },
]

const visible = computed(() =>
  CHIPS.filter((chip) => (props.counts[chip.kind] ?? 0) > 0),
)
</script>

<template>
  <!-- Um tipo só no espaço: a faceta não divide nada, então não aparece. -->
  <div v-if="visible.length > 1" class="kf" role="group" aria-label="Filtrar por tipo">
    <button
      type="button"
      class="kf-chip press"
      :class="{ 'kf-chip--on': active === null }"
      :aria-pressed="active === null"
      @click="emit('select', null)"
    >
      Todos
      <span class="kf-count">{{ total }}</span>
    </button>

    <button
      v-for="chip in visible"
      :key="chip.kind"
      type="button"
      class="kf-chip press"
      :class="{ 'kf-chip--on': active === chip.kind }"
      :aria-pressed="active === chip.kind"
      @click="emit('select', active === chip.kind ? null : chip.kind)"
    >
      <component :is="chip.icon" :size="13" />
      {{ chip.label }}
      <span class="kf-count">{{ counts[chip.kind] }}</span>
    </button>
  </div>
</template>

<style scoped>
.kf {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.kf-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 11px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.kf-chip:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.kf-chip--on {
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  color: var(--text);
}

.kf-count {
  color: var(--text-3);
  font-size: 11px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.kf-chip--on .kf-count {
  color: var(--accent);
}
</style>
