<script setup lang="ts">
/**
 * A capa de um arquivo. Só desenha; quem decide o que existe é o
 * `useFileCover` (que roda apenas quando o card entra na viewport).
 *
 * Quatro modos, do mais informativo ao mais econômico:
 *  - `image`/`canvas`: pixel de verdade (foto, primeira página do PDF, frame)
 *  - `text`: as primeiras linhas do arquivo, em mono, com máscara no rodapé
 *  - `none`: capa tipográfica — extensão grande sobre a cor da família
 *
 * O ícone da família aparece em TODOS os modos, como selo no canto: é o que
 * mantém a leitura por tipo funcionando mesmo quando a capa é uma foto.
 */
import { computed, ref } from 'vue'
import { useElementVisibility } from '@vueuse/core'
import { iconOf, kindOf, labelOf } from '@/utils/file-kind'
import { coverLabelOf, paletteOf } from '@/features/drive/file-palette'
import { useFileCover } from '@/features/drive/composables/useFileCover'
import type { DriveFile } from '@/features/drive/types'

const props = withDefaults(
  defineProps<{
    file: DriveFile
    height?: number
    /**
     * `rich` deriva a capa dos bytes (PDF, vídeo, texto). `thumb` só usa o que
     * é barato — a imagem já assinada — e cai no glifo para o resto.
     *
     * A lista densa usa `thumb`: rasterizar a primeira página de um PDF a
     * 480px, com worker e data URL, para preencher um quadrado de 32px é gastar
     * CPU e banda do usuário em algo que ninguém consegue enxergar.
     */
    mode?: 'rich' | 'thumb'
  }>(),
  { mode: 'rich' },
)

const root = ref<HTMLElement | null>(null)
// Derivar capa de arquivo que não está na tela é gastar CPU do usuário à toa.
const elementVisible = useElementVisibility(root)
const visible = computed(() => elementVisible.value && props.mode === 'rich')

const target = computed(() => ({
  id: props.file.id,
  filename: props.file.name,
  mimeType: props.file.mimeType,
  previewUrl: props.file.previewUrl,
}))

const derived = useFileCover(target, visible)
const kind = computed(() => kindOf(target.value))
const palette = computed(() => paletteOf(kind.value))
const icon = computed(() => iconOf(target.value))
const label = computed(() => coverLabelOf(props.file.name, labelOf(target.value)))

/** Em `thumb`, a única capa possível é a imagem já assinada. */
const cover = computed(() => {
  if (props.mode === 'rich') return derived.value
  return props.file.previewUrl && kind.value === 'image'
    ? ({ kind: 'image', value: props.file.previewUrl } as const)
    : null
})

const isMedia = computed(
  () => cover.value?.kind === 'image' || cover.value?.kind === 'canvas',
)
const compact = computed(() => (props.height ?? 150) < 72)
</script>

<template>
  <div
    ref="root"
    class="fc"
    :style="{
      '--fc-accent': palette.accent,
      '--fc-wash': palette.wash,
      height: height ? `${height}px` : undefined,
    }"
  >
    <img
      v-if="isMedia"
      :src="cover!.value"
      :alt="file.name"
      class="fc-media"
      loading="lazy"
      decoding="async"
    />

    <pre v-else-if="cover?.kind === 'text'" class="fc-text">{{ cover.value }}</pre>

    <div v-else class="fc-glyph">
      <component
        :is="icon"
        :size="compact ? 16 : 34"
        class="fc-glyph-icon"
        aria-hidden="true"
      />
      <span v-if="!compact" class="fc-glyph-ext">{{ label }}</span>
    </div>

    <!-- Selo de tipo: sobrevive por cima de qualquer capa (exceto no thumb,
         que não tem área para ele sem cobrir a própria capa). -->
    <span
      v-if="!compact"
      class="fc-badge"
      :title="labelOf({ filename: file.name, mimeType: file.mimeType })"
    >
      <component :is="icon" :size="12" aria-hidden="true" />
      <span class="fc-badge-text">{{ label }}</span>
    </span>

    <!--
      Play só sobre FRAME de verdade: um frame de vídeo e uma foto são pixels
      iguais, e o play é o que separa os dois. Sem frame, a capa já é o ícone
      de vídeo com a extensão, e sobrepor o play esconderia justamente o texto.
    -->
    <span
      v-if="kind === 'video' && isMedia && !compact"
      class="fc-play"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
    </span>
  </div>
</template>

<style scoped>
.fc {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 150px;
  overflow: hidden;
  background: var(--fc-wash);
  isolation: isolate;
}

.fc-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.fc-text {
  margin: 0;
  padding: 14px 14px 26px;
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9.5px;
  line-height: 1.5;
  color: var(--text-2);
  white-space: pre-wrap;
  word-break: break-word;
  /* A prosa some no rodapé em vez de cortar no meio de uma letra. */
  mask-image: linear-gradient(to bottom, #000 62%, transparent 100%);
}

.fc-glyph {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--fc-accent);
}

.fc-glyph-icon {
  opacity: 0.9;
}

.fc-glyph-ext {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--fc-accent);
}

.fc-badge {
  position: absolute;
  left: 8px;
  bottom: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  backdrop-filter: blur(10px);
  color: var(--fc-accent);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1;
}

.fc-badge-text {
  color: var(--fc-accent);
}

.fc-play {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--surface) 78%, transparent);
  backdrop-filter: blur(8px);
  color: var(--text);
  padding-left: 3px;
}
</style>
