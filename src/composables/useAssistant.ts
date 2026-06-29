import { computed, ref } from 'vue'
import aiService, { type SearchHit } from '@/service/ai/ai-service'
import collaborationService from '@/service/collaboration/collaboration-service'
import { getApiErrorMessage } from '@/service/api'

/**
 * Estado global (singleton de módulo) do Assistente de IA.
 *
 * Vive fora de qualquer componente para que a Command Palette, o atalho global,
 * o launcher flutuante e o próprio painel compartilhem a MESMA conversa e o
 * mesmo estado de abertura. Padrão alinhado a `useUiPreferences` (composable
 * com refs em escopo de módulo) — ver src/CLAUDE.md.
 */

export type AssistantRole = 'user' | 'assistant'

export interface AssistantMessage {
  id: string
  role: AssistantRole
  content: string
  sources?: SearchHit[]
  /** true enquanto a resposta da IA não chegou */
  pending?: boolean
  /** preenchido quando a chamada falhou — guarda o texto digitado p/ retry */
  error?: string
  retryOf?: string
}

export interface AssistantSuggestion {
  label: string
  prompt: string
}

const WIDTH_KEY = 'assistant.width'
const MIN_WIDTH = 360
const MAX_WIDTH = 680
const DEFAULT_WIDTH = 420

function clampWidth(v: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(v)))
}

function loadWidth(): number {
  const raw = Number(localStorage.getItem(WIDTH_KEY))
  return raw ? clampWidth(raw) : DEFAULT_WIDTH
}

let seq = 0
function nextId(): string {
  seq += 1
  return `m${Date.now()}_${seq}`
}

// ─── Estado de módulo (compartilhado) ────────────────────────────────────────
const isOpen = ref(false)
const messages = ref<AssistantMessage[]>([])
const pending = ref(false)
const width = ref(loadWidth())

const suggestions: AssistantSuggestion[] = [
  { label: 'O que está bloqueado?', prompt: 'Quais atividades ou entregas estão bloqueadas agora e por quê?' },
  { label: 'Resumo da semana', prompt: '__digest__' },
  { label: 'Entregas do mês', prompt: 'Resuma as principais entregas e atividades em andamento neste mês.' },
  { label: 'O que mudou?', prompt: 'O que mudou no workspace nos últimos dias? Destaque o mais relevante.' },
]

const hasConversation = computed(() => messages.value.length > 0)

function setWidth(v: number) {
  width.value = clampWidth(v)
  localStorage.setItem(WIDTH_KEY, String(width.value))
}

function open() {
  isOpen.value = true
}
function close() {
  isOpen.value = false
}
function toggle() {
  isOpen.value = !isOpen.value
}

function clear() {
  if (pending.value) return
  messages.value = []
}

/** Pergunta semântica ao workspace (copilot/ask → answer + sources). */
async function send(text: string) {
  const question = text.trim()
  if (!question || pending.value) return

  if (question === '__digest__') {
    await runDigest()
    return
  }

  const userMsg: AssistantMessage = { id: nextId(), role: 'user', content: question }
  const aiMsg: AssistantMessage = { id: nextId(), role: 'assistant', content: '', pending: true }
  messages.value.push(userMsg, aiMsg)
  pending.value = true

  try {
    const res = await aiService.ask(question)
    aiMsg.content = res.answer
    aiMsg.sources = res.sources
  } catch (err) {
    aiMsg.error = getApiErrorMessage(err, 'Não consegui responder agora.')
    aiMsg.retryOf = question
    aiMsg.content = ''
  } finally {
    aiMsg.pending = false
    pending.value = false
  }
}

/** Digest IA da timeline da empresa (copilot/digest). */
async function runDigest() {
  if (pending.value) return
  const userMsg: AssistantMessage = { id: nextId(), role: 'user', content: 'Resumo da semana' }
  const aiMsg: AssistantMessage = { id: nextId(), role: 'assistant', content: '', pending: true }
  messages.value.push(userMsg, aiMsg)
  pending.value = true

  try {
    const res = await collaborationService.digest(7)
    aiMsg.content =
      res.summary || (res.events === 0 ? 'Sem atividade relevante nos últimos 7 dias.' : 'Resumo indisponível.')
  } catch (err) {
    aiMsg.error = getApiErrorMessage(err, 'Não consegui gerar o resumo agora.')
    aiMsg.retryOf = '__digest__'
    aiMsg.content = ''
  } finally {
    aiMsg.pending = false
    pending.value = false
  }
}

/** Reenvia a última pergunta que falhou (remove a bolha de erro e refaz). */
async function retry(msg: AssistantMessage) {
  if (!msg.retryOf || pending.value) return
  const idx = messages.value.findIndex((m) => m.id === msg.id)
  if (idx >= 0) {
    // remove a bolha de erro da IA e a pergunta do usuário que a antecede
    const removeFrom = idx > 0 && messages.value[idx - 1]?.role === 'user' ? idx - 1 : idx
    messages.value.splice(removeFrom)
  }
  await send(msg.retryOf)
}

/** Abre o painel e já dispara uma pergunta (usado pela Command Palette). */
function ask(prompt: string) {
  open()
  void send(prompt)
}

export function useAssistant() {
  return {
    // state
    isOpen,
    messages,
    pending,
    width,
    suggestions,
    hasConversation,
    // bounds
    MIN_WIDTH,
    MAX_WIDTH,
    // actions
    open,
    close,
    toggle,
    clear,
    send,
    ask,
    runDigest,
    retry,
    setWidth,
  }
}
