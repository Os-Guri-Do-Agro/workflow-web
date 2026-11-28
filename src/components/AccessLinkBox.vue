<script setup lang="ts">
/**
 * O link de primeiro acesso pronto para copiar: campo só leitura, botão Copiar
 * e o aviso de validade. Usado depois de criar a pessoa (`CreateUserModal`) e
 * na lista de membros da empresa (`CompanyMembersDialog`).
 */
import { computed, onBeforeUnmount, ref, useId } from 'vue'
import { Check, Copy } from 'lucide-vue-next'

const props = defineProps<{
  link: string
  expiresAt: string
  emailed: boolean
  email: string
}>()

const inputId = useId()
const input = ref<HTMLInputElement | null>(null)
const copied = ref(false)
const failed = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

const validUntil = computed(() => {
  const d = new Date(props.expiresAt)
  if (Number.isNaN(d.getTime())) return '7 dias'
  const day = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${day} às ${time}`
})

async function copy() {
  failed.value = false
  try {
    await navigator.clipboard.writeText(props.link)
  } catch {
    // Sem permissão de área de transferência: seleciona o texto para o Ctrl+C.
    input.value?.select()
    failed.value = !document.execCommand?.('copy')
  }
  if (failed.value) return
  copied.value = true
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => (copied.value = false), 2000)
}

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <div class="alb">
    <label class="alb-label" :for="inputId">Link de primeiro acesso</label>
    <div class="alb-row">
      <input
        :id="inputId"
        ref="input"
        class="alb-input"
        :value="link"
        readonly
        spellcheck="false"
        @focus="($event.target as HTMLInputElement).select()"
      />
      <button class="alb-copy press" type="button" @click="copy">
        <Check v-if="copied" :size="14" />
        <Copy v-else :size="14" />
        <span>{{ copied ? 'Copiado' : 'Copiar' }}</span>
      </button>
    </div>
    <p class="alb-note">
      Vale até {{ validUntil }} e para de funcionar quando a pessoa criar a senha.
    </p>
    <p class="alb-note" :class="{ 'alb-note--ok': emailed }">
      <template v-if="emailed">Também mandamos para {{ email }}.</template>
      <template v-else>Mande para {{ email }} pelo WhatsApp ou outro canal.</template>
    </p>
    <p v-if="failed" class="alb-note alb-note--err" role="alert">
      Não deu para copiar sozinho. O link está selecionado: use Ctrl+C.
    </p>
  </div>
</template>

<style scoped>
.alb {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}

.alb-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.alb-row {
  display: flex;
  gap: 6px;
  min-width: 0;
}

/* `width: 0` + `flex: 1`: sem isso a largura intrínseca do input (~20
   caracteres) entra no min-content e empurra o dialog para fora da tela a 375. */
.alb-input {
  flex: 1;
  width: 0;
  min-width: 0;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 12px;
  outline: none;
  text-overflow: ellipsis;
}

.alb-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}

.alb-copy {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  min-width: 44px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 80%, black);
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-fg);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  transition: filter var(--motion-fast) var(--motion-ease);
}

.alb-copy:hover {
  filter: brightness(1.06);
}

.alb-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-3);
}

.alb-note--ok {
  color: var(--success);
}

.alb-note--err {
  color: var(--err);
}

@media (prefers-reduced-motion: reduce) {
  .alb-copy {
    transition-duration: 1ms;
  }
}
</style>
