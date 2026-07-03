<script setup lang="ts">
import { ref, watch } from 'vue'
import { toSvgString } from '@/utils/qr-export'

/**
 * Preview reativo do QR: renderiza o SVG (vetorial, nítido em qualquer tamanho)
 * a partir do `text` — sempre o `redirectUrl` do backend. Regenera quando muda.
 */
const props = defineProps<{ text: string; size?: number }>()

const svg = ref('')
const failed = ref(false)

watch(
  () => props.text,
  async (text) => {
    failed.value = false
    if (!text) {
      svg.value = ''
      return
    }
    try {
      svg.value = await toSvgString(text)
    } catch {
      failed.value = true
      svg.value = ''
    }
  },
  { immediate: true },
)
</script>

<template>
  <div
    class="qr-preview"
    :style="{ width: (size ?? 128) + 'px', height: (size ?? 128) + 'px' }"
    role="img"
    aria-label="QR code"
  >
    <!-- SVG gerado localmente (conteúdo confiável do próprio qrcode). -->
    <div v-if="svg" class="qr-preview__svg" v-html="svg" />
    <span v-else-if="failed" class="qr-preview__err">erro</span>
  </div>
</template>

<style scoped>
.qr-preview {
  display: grid;
  place-items: center;
  background: #ffffff; /* QR precisa de fundo branco p/ leitura — não é cor de tema */
  border-radius: var(--radius-sm);
  padding: 6px;
  overflow: hidden;
}

.qr-preview__svg {
  width: 100%;
  height: 100%;
  display: flex;
}

.qr-preview__svg :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

.qr-preview__err {
  font-size: 11px;
  color: var(--err);
}
</style>
