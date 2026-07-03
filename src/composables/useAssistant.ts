import { computed, ref } from 'vue'
import aiService, { type SearchHit, type AgentHistoryTurn } from '@/service/ai/ai-service'
import collaborationService from '@/service/collaboration/collaboration-service'
import realtimeService from '@/service/realtime/realtime-service'
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
  /** id do stream do agente (correlaciona os eventos de socket a esta bolha) */
  runId?: string
  /** label amigável da ferramenta em execução ("Buscando tarefas…") */
  toolLabel?: string
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

// ─── Streaming do agente via socket ──────────────────────────────────────────
const RUN_TIMEOUT = 60_000
const HISTORY_TURNS = 8
const runTimers = new Map<string, ReturnType<typeof setTimeout>>()
let realtimeReady = false

function msgByRun(runId: string) {
  return messages.value.find((m) => m.runId === runId)
}

/** Encerra um run: limpa timeout e libera o pending global. */
function finishRun(runId: string) {
  const t = runTimers.get(runId)
  if (t) {
    clearTimeout(t)
    runTimers.delete(runId)
  }
  pending.value = false
}

/** Assina os eventos assistant:* uma única vez (reusa o socket singleton). */
function ensureRealtime() {
  if (realtimeReady) return
  realtimeReady = true
  realtimeService.connect({
    assistantDelta: ({ runId, text }) => {
      const m = msgByRun(runId)
      if (!m) return
      m.content += text
      m.toolLabel = undefined // já começou a responder
    },
    assistantTool: ({ runId, label }) => {
      const m = msgByRun(runId)
      if (m) m.toolLabel = label
    },
    assistantDone: ({ runId, sources }) => {
      const m = msgByRun(runId)
      if (m) {
        m.sources = sources
        m.pending = false
        m.toolLabel = undefined
      }
      finishRun(runId)
    },
    assistantError: ({ runId, message }) => {
      const m = msgByRun(runId)
      if (m) {
        m.error = message
        m.content = ''
        m.pending = false
        m.toolLabel = undefined
      }
      finishRun(runId)
    },
  })
}

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

/**
 * Pergunta ao copiloto AGENTE (copilot/agent). O POST só dispara o run e retorna
 * { runId }; a resposta real (deltas, ferramentas, fontes) chega via socket.
 */
async function send(text: string) {
  const question = text.trim()
  if (!question || pending.value) return

  if (question === '__digest__') {
    await runDigest()
    return
  }

  ensureRealtime()

  // Histórico: últimos ~8 turnos finalizados (sem pending/error), antes desta pergunta.
  const history: AgentHistoryTurn[] = messages.value
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && !!m.content && !m.pending && !m.error)
    .slice(-HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content }))

  const runId = `run_${Date.now()}_${(seq += 1)}`
  const userMsg: AssistantMessage = { id: nextId(), role: 'user', content: question }
  const aiMsg: AssistantMessage = {
    id: nextId(),
    role: 'assistant',
    content: '',
    pending: true,
    runId,
    retryOf: question,
  }
  messages.value.push(userMsg, aiMsg)
  pending.value = true

  // Timeout de segurança: se o socket não fechar o run em 60s, marca erro.
  runTimers.set(
    runId,
    setTimeout(() => {
      const m = msgByRun(runId)
      if (m?.pending) {
        m.error = 'A resposta demorou demais. Tente de novo.'
        m.pending = false
        m.toolLabel = undefined
      }
      finishRun(runId)
    }, RUN_TIMEOUT),
  )

  try {
    await aiService.askAgent(question, runId, history)
    // Sucesso do POST NÃO finaliza o run — aguardamos assistant:done/error via socket.
  } catch (err) {
    aiMsg.error = getApiErrorMessage(err, 'Não consegui iniciar a resposta agora.')
    aiMsg.content = ''
    aiMsg.pending = false
    finishRun(runId)
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
