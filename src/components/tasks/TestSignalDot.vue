<script setup lang="ts">
/**
 * Sinal do teste (spec board-revisados-sinal-e-dialog, D3 a D5): a bolinha do
 * card em "Em teste", trocada SEM abrir a tarefa.
 *
 * - Azul: em teste (também quando ninguém marcou nada).
 * - Amarelo: precisa de ajuste ou tem sugestão.
 * - Vermelho: reprovada. Continua em "Em teste": quem corrige move a tarefa e,
 *   corrigido, troca o sinal de volta.
 *
 * O componente grava sozinho (o mesmo card vive no board do mês e no `/board`,
 * que mistura empresas): mostra o sinal novo na hora, chama a API com a
 * empresa do card e volta ao anterior se a gravação falhar. O dado que chega
 * depois (refetch, realtime) substitui o local.
 *
 * Ao marcar amarelo ou vermelho, um campo OPCIONAL "O que precisa mudar?" vira
 * comentário da tarefa: quem corrige sabe o motivo sem perguntar.
 *
 * Cor nunca é o único canal: o botão diz o estado no nome acessível e no
 * tooltip, com quem marcou e quando.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import activityService from '@/service/activities/activity-service'
import collaborationService from '@/service/collaboration/collaboration-service'
import { useToast } from '@/composables/useToast'
import type { TestSignal, TestSignalView } from '@/features/tasks/activity-types'

const props = withDefaults(
  defineProps<{
    taskId: string
    taskTitle?: string
    signal?: TestSignalView | null
    /** Empresa da tarefa. Obrigatória no `/board`; no board do mês vale a ativa. */
    companyId?: string | null
    readonly?: boolean
    /**
     * `dot`: só o disco (card). `field`: disco + nome do estado (linha de
     * propriedades do detalhe da tarefa).
     */
    variant?: 'dot' | 'field'
  }>(),
  { taskTitle: '', signal: null, companyId: null, readonly: false, variant: 'dot' },
)

const emit = defineEmits<{
  /** Gravado no servidor. Quem quiser atualiza o próprio cache. */
  changed: [view: TestSignalView]
}>()

const toast = useToast()

interface SignalOption {
  value: TestSignal
  label: string
  hint: string
}

const OPTIONS: readonly SignalOption[] = [
  { value: 'TESTING', label: 'Em teste', hint: 'Ainda sendo testada' },
  { value: 'NEEDS_ADJUSTMENT', label: 'Precisa de ajuste', hint: 'Funciona, mas pede mudança' },
  { value: 'REJECTED', label: 'Reprovado', hint: 'Não passou: volta para correção' },
]

// Sinal gravado aqui e ainda não refletido no dado que veio de cima.
const local = ref<TestSignalView | null>(null)
watch(
  () => props.signal,
  () => {
    local.value = null
  },
)

const current = computed<TestSignalView | null>(() => local.value ?? props.signal ?? null)
const kind = computed<TestSignal>(() => current.value?.signal ?? 'TESTING')
const option = computed(() => OPTIONS.find((o) => o.value === kind.value) ?? OPTIONS[0]!)

function quando(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(diff)) return ''
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const dias = Math.round(h / 24)
  if (dias < 30) return dias === 1 ? 'há 1 dia' : `há ${dias} dias`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const autoria = computed(() => {
  const view = current.value
  if (!view) return ''
  const quem = view.setBy?.name ?? 'alguém'
  return `${quem}, ${quando(view.updatedAt)}`
})

const description = computed(() =>
  autoria.value ? `Sinal do teste: ${option.value.label} (${autoria.value})` : `Sinal do teste: ${option.value.label}`,
)

// ── Popover ──
const open = ref(false)
const saving = ref(false)
const note = ref('')
const sendingNote = ref(false)
const askNote = ref(false)
const noteField = ref<HTMLTextAreaElement | null>(null)
const groupEl = ref<HTMLElement | null>(null)

/** ↑/↓ andam pelas opções sem gravar (gravar é clique, Enter ou Espaço). */
function moveFocus(delta: 1 | -1) {
  const items = [...(groupEl.value?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])]
  if (!items.length) return
  const at = items.indexOf(document.activeElement as HTMLElement)
  const next = items[(at + delta + items.length) % items.length]
  next?.focus()
}

watch(open, (isOpen) => {
  if (!isOpen) {
    askNote.value = false
    note.value = ''
  }
})

async function choose(next: TestSignal) {
  if (props.readonly || saving.value) return
  if (next === kind.value) {
    askNote.value = next !== 'TESTING'
    return
  }
  const previous = local.value
  // Otimista: o disco muda na hora; o autor e a hora reais vêm da resposta.
  local.value = { signal: next, setBy: current.value?.setBy ?? null, updatedAt: new Date().toISOString() }
  saving.value = true
  try {
    const saved = await activityService.setTestSignal(props.taskId, next, props.companyId)
    local.value = saved
    emit('changed', saved)
    askNote.value = next !== 'TESTING'
    if (askNote.value) {
      await nextTick()
      noteField.value?.focus()
    } else {
      open.value = false
    }
  } catch (error: unknown) {
    local.value = previous
    const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
    toast.error(message ?? 'Não foi possível trocar o sinal do teste')
  } finally {
    saving.value = false
  }
}

async function sendNote() {
  const body = note.value.trim()
  if (!body || sendingNote.value) return
  sendingNote.value = true
  try {
    await collaborationService.createComment(
      { entityType: 'ACTIVITY', entityId: props.taskId, body: `${option.value.label}: ${body}` },
      props.companyId,
    )
    toast.success('Comentário enviado na tarefa')
    open.value = false
  } catch {
    toast.error('Não foi possível enviar o comentário. O sinal já foi trocado.')
  } finally {
    sendingNote.value = false
  }
}
</script>

<template>
  <span v-if="readonly" class="tsd" :class="`tsd--${variant}`" role="img" :aria-label="description" :title="description">
    <span class="tsd__dot" :data-signal="kind" aria-hidden="true" />
    <span v-if="variant === 'field'" class="tsd__label">{{ option.label }}</span>
  </span>

  <PopoverRoot v-else v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="tsd tsd--button no-drag"
        :class="[`tsd--${variant}`, { 'tsd--saving': saving }]"
        :aria-label="`${description}. Trocar`"
        :title="description"
        @click.stop
        @dblclick.stop
        @keydown.enter.stop
        @keydown.space.stop
      >
        <span class="tsd__dot" :data-signal="kind" aria-hidden="true" />
        <span v-if="variant === 'field'" class="tsd__label">{{ option.label }}</span>
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        class="tsd-pop"
        side="bottom"
        align="start"
        :side-offset="6"
        :collision-padding="12"
        trap-focus
        @click.stop
      >
        <p :id="`test-signal-title-${taskId}`" class="tsd-pop__title">Sinal do teste</p>
        <!-- Botões, e não rádios nativos: nos rádios as setas MARCAM a opção, e
             cada seta gravava um sinal e notificava os responsáveis. Aqui as
             setas só levam o foco; clique, Enter ou Espaço gravam. -->
        <div
          ref="groupEl"
          class="tsd-pop__group"
          role="radiogroup"
          :aria-labelledby="`test-signal-title-${taskId}`"
          :aria-busy="saving || undefined"
          @keydown.down.prevent="moveFocus(1)"
          @keydown.up.prevent="moveFocus(-1)"
        >
          <button
            v-for="opt in OPTIONS"
            :key="opt.value"
            type="button"
            role="radio"
            class="tsd-pop__opt"
            :class="{ 'is-on': opt.value === kind }"
            :aria-checked="opt.value === kind"
            :disabled="saving"
            @click="choose(opt.value)"
          >
            <span class="tsd__dot tsd__dot--lg" :data-signal="opt.value" aria-hidden="true" />
            <span class="tsd-pop__text">
              <span class="tsd-pop__label">{{ opt.label }}</span>
              <span class="tsd-pop__hint">{{ opt.hint }}</span>
            </span>
          </button>
        </div>

        <form v-if="askNote" class="tsd-pop__note" @submit.prevent="sendNote">
          <label class="tsd-pop__note-label" :for="`test-signal-note-${taskId}`">
            O que precisa mudar? <span class="tsd-pop__opt-hint">(opcional, vira comentário)</span>
          </label>
          <textarea
            :id="`test-signal-note-${taskId}`"
            ref="noteField"
            v-model="note"
            class="tsd-pop__textarea"
            rows="3"
            maxlength="2000"
            placeholder="Ex.: o botão Enviar não responde no celular"
            @keydown.enter.exact.prevent="sendNote"
            @keydown.esc.stop="open = false"
          />
          <div class="tsd-pop__actions">
            <button type="button" class="tsd-pop__btn" @click="open = false">Pronto</button>
            <button type="submit" class="tsd-pop__btn tsd-pop__btn--primary" :disabled="!note.trim() || sendingNote">
              {{ sendingNote ? 'Enviando' : 'Comentar' }}
            </button>
          </div>
        </form>

        <p v-else-if="autoria" class="tsd-pop__who">Marcado por {{ autoria }}</p>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
.tsd {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.tsd--button {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
  border-radius: 999px;
}

/* No card a linha de meta tem 16px: o botão visível é o disco, e a área de
   toque cresce por fora (36px) sem empurrar a linha. */
.tsd--dot.tsd--button {
  width: 16px;
  height: 16px;
  justify-content: center;
}

.tsd--dot.tsd--button::after {
  content: '';
  position: absolute;
  inset: -10px;
}

.tsd--field.tsd--button {
  min-height: 32px;
  padding: 0 8px;
  margin-left: -8px;
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 13px;
}

.tsd--field.tsd--button:hover {
  background: var(--surface-2);
}

.tsd--button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.tsd--saving {
  cursor: progress;
}

.tsd__dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  flex: none;
  /* Cor chapada (sinal, não luz) e o anel fino que dá contraste ao amarelo no
     tema claro. */
  box-shadow: inset 0 0 0 1px var(--test-signal-ring);
}

.tsd__dot--lg {
  width: 12px;
  height: 12px;
}

.tsd__dot[data-signal='TESTING'] {
  background: var(--test-signal-testing);
}

.tsd__dot[data-signal='NEEDS_ADJUSTMENT'] {
  background: var(--test-signal-adjust);
}

.tsd__dot[data-signal='REJECTED'] {
  background: var(--test-signal-rejected);
}

.tsd__label {
  font-size: 13px;
  line-height: 18px;
  white-space: nowrap;
}
</style>

<!-- Global: o popover é portalado para o <body> e o scoped não viaja junto. -->
<style>
.tsd-pop {
  z-index: 3000;
  width: 280px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-overlay);
  color: var(--text);
}

.tsd-pop__group {
  display: grid;
  gap: 2px;
}

.tsd-pop__title {
  margin: 0;
  padding: 2px 6px 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.tsd-pop__opt {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 4px 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.tsd-pop__opt:disabled {
  cursor: progress;
}

.tsd-pop__opt:hover,
.tsd-pop__opt:focus-within {
  background: var(--surface-2);
}

.tsd-pop__opt.is-on {
  background: var(--surface-2);
}

.tsd-pop__opt:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.tsd-pop__text {
  display: grid;
  min-width: 0;
}

.tsd-pop__label {
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
}

.tsd-pop__hint {
  font-size: 12px;
  line-height: 16px;
  color: var(--text-3);
}

.tsd-pop__opt.is-on .tsd-pop__label::after {
  content: ' (atual)';
  font-weight: 400;
  color: var(--text-3);
}

.tsd-pop__note {
  display: grid;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.tsd-pop__note-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.tsd-pop__opt-hint {
  font-weight: 400;
  color: var(--text-3);
}

.tsd-pop__textarea {
  width: 100%;
  resize: vertical;
  min-height: 64px;
  padding: 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  line-height: 18px;
}

.tsd-pop__textarea:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}

.tsd-pop__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.tsd-pop__btn {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.tsd-pop__btn:hover:not(:disabled) {
  background: var(--surface-2);
}

.tsd-pop__btn--primary {
  border-color: transparent;
  background: var(--text);
  color: var(--surface);
}

.tsd-pop__btn--primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--text) 86%, var(--surface));
}

.tsd-pop__btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.tsd-pop__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.tsd-pop__who {
  margin: 8px 6px 2px;
  font-size: 12px;
  color: var(--text-3);
}
</style>
