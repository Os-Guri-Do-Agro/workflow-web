<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type QRCodeStyling from 'qr-code-styling'
import { buildQrOptions, renderInto } from '@/utils/qr-styled'
import type { QrStyle } from '@/service/qr/qr-service'

/**
 * Preview reativo do QR usando `qr-code-styling`, honrando o `style` (cor,
 * formato dos pontos/cantos, logo). O `text` é sempre o `redirectUrl` do backend.
 * Reusa a instância via `.update()` pra trocar cor/estilo sem flicker.
 */
const props = defineProps<{
  text: string
  style?: QrStyle | null
  size?: number
}>()

const container = ref<HTMLElement | null>(null)
const failed = ref(false)
let qr: QRCodeStyling | null = null

function draw() {
  const el = container.value
  if (!el || !props.text) {
    failed.value = false
    if (el) el.innerHTML = ''
    qr = null
    return
  }
  const size = props.size ?? 128
  try {
    failed.value = false
    if (qr) {
      qr.update(buildQrOptions(props.text, props.style, size))
    } else {
      qr = renderInto(el, props.text, props.style, size)
    }
  } catch {
    failed.value = true
    qr = null
    el.innerHTML = ''
  }
}

onMounted(draw)

// Redesenha quando texto, tamanho ou qualquer campo do estilo muda.
watch(
  () => [props.text, props.size, JSON.stringify(props.style ?? null)],
  draw,
)

onBeforeUnmount(() => {
  qr = null
})
</script>

<template>
  <div
    class="qr-preview"
    :style="{ width: (size ?? 128) + 'px', height: (size ?? 128) + 'px' }"
    role="img"
    aria-label="QR code"
  >
    <!-- Container onde a lib injeta o SVG do QR. -->
    <div ref="container" class="qr-preview__canvas" />
    <span v-if="failed" class="qr-preview__err">erro</span>
  </div>
</template>

<style scoped>
.qr-preview {
  position: relative;
  display: grid;
  place-items: center;
  background: #ffffff; /* QR precisa de fundo branco p/ leitura — não é cor de tema */
  border-radius: var(--radius-sm);
  padding: 6px;
  overflow: hidden;
}

.qr-preview__canvas {
  width: 100%;
  height: 100%;
  display: flex;
}

.qr-preview__canvas :deep(svg),
.qr-preview__canvas :deep(canvas) {
  width: 100%;
  height: 100%;
  display: block;
}

.qr-preview__err {
  position: absolute;
  font-size: 11px;
  color: var(--err);
}
</style>
