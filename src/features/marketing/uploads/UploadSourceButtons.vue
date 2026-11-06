<script setup lang="ts">
/**
 * "Tirar foto" e "Galeria" no celular (abaixo de 640 px). A câmera usa
 * `capture="environment"` (traseira); a galeria abre o seletor do sistema com
 * vários arquivos. No computador não aparece: lá o caminho é arrastar, colar
 * ou "Escolher arquivos".
 */
import { ref } from 'vue'
import { Camera, Images } from 'lucide-vue-next'
import { usePhoneViewport } from '@/composables/usePhoneViewport'
import { filesFromInput } from './file-sources'
import type { UploadEntry } from './upload-queue'

const props = withDefaults(
  defineProps<{
    /** O que a galeria aceita (a câmera é sempre foto) */
    accept?: string
    multiple?: boolean
    disabled?: boolean
    cameraLabel?: string
    galleryLabel?: string
    /** Mostra também fora do celular (raro: tablet em paisagem) */
    always?: boolean
  }>(),
  {
    accept: 'image/*,video/*',
    multiple: true,
    disabled: false,
    cameraLabel: 'Tirar foto',
    galleryLabel: 'Galeria',
    always: false,
  },
)

const emit = defineEmits<{ files: [entries: UploadEntry[]] }>()

const isPhone = usePhoneViewport()
const camera = ref<HTMLInputElement | null>(null)
const gallery = ref<HTMLInputElement | null>(null)

function onPick(event: Event) {
  const entries = filesFromInput(event)
  if (entries.length) emit('files', entries)
}
</script>

<template>
  <div v-if="isPhone || props.always" class="mkus" role="group" aria-label="Enviar do celular">
    <button type="button" class="mk-btn mkus__btn" :disabled="disabled" data-source="camera" @click="camera?.click()">
      <Camera :size="16" aria-hidden="true" />
      {{ cameraLabel }}
    </button>
    <button type="button" class="mk-btn mkus__btn" :disabled="disabled" data-source="gallery" @click="gallery?.click()">
      <Images :size="16" aria-hidden="true" />
      {{ galleryLabel }}
    </button>
    <input
      ref="camera"
      class="mkus__input"
      type="file"
      accept="image/*"
      capture="environment"
      tabindex="-1"
      aria-hidden="true"
      @change="onPick"
    />
    <input
      ref="gallery"
      class="mkus__input"
      type="file"
      :accept="accept"
      :multiple="multiple"
      tabindex="-1"
      aria-hidden="true"
      @change="onPick"
    />
  </div>
</template>

<style scoped>
.mkus {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.mkus__btn {
  min-height: 44px;
}

.mkus__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>
