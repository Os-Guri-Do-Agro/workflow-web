<script setup lang="ts">
import { computed, nextTick, ref, watch, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import {
  Sparkles,
  X,
  Plus,
  ArrowUp,
  RotateCcw,
  CornerDownLeft,
  FileText,
  CalendarDays,
  Milestone,
  Bug,
  Paintbrush,
  Activity,
  type LucideIcon,
} from 'lucide-vue-next'
import { useAssistant, type AssistantMessage } from '@/composables/useAssistant'
import { renderMarkdown } from '@/composables/useMarkdownRenderer'
import type { EntityType, SearchHit } from '@/service/ai/ai-service'

const router = useRouter()
const {
  isOpen,
  messages,
  pending,
  width,
  suggestions,
  hasConversation,
  MIN_WIDTH,
  MAX_WIDTH,
  close,
  send,
  runDigest,
  clear,
  retry,
  setWidth,
} = useAssistant()

const draft = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)

const entityIcon: Record<EntityType, LucideIcon> = {
  ACTIVITY: Activity,
  ROADMAP_MONTH: Milestone,
  ROADMAP_ENTRY: Milestone,
  EVENT: CalendarDays,
  BOARD: Paintbrush,
  BUG_REPORT: Bug,
}

function iconFor(hit: SearchHit): LucideIcon {
  return entityIcon[hit.entityType] ?? FileText
}

function submit() {
  const text = draft.value.trim()
  if (!text || pending.value) return
  draft.value = ''
  void send(text)
  autosize()
}

function onSuggestion(prompt: string) {
  if (pending.value) return
  if (prompt === '__digest__') void runDigest()
  else void send(prompt)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
}

function openSource(hit: SearchHit) {
  if (!hit.link) return
  router.push(hit.link)
}

/** Auto-grow do textarea (até 6 linhas). */
function autosize() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 150)}px`
}

function scrollToBottom() {
  nextTick(() => {
    const el = scrollRef.value
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  })
}

watch(
  () => messages.value.length,
  () => scrollToBottom(),
)
watch(
  () => messages.value[messages.value.length - 1]?.pending,
  () => scrollToBottom(),
)

watch(isOpen, (open) => {
  if (open) nextTick(() => inputRef.value?.focus())
})

function onPanelKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
  }
}

// ─── Resize (arrasta a borda esquerda do painel) ──────────────────────────────
const resizing = ref(false)
function startResize(e: PointerEvent) {
  resizing.value = true
  const startX = e.clientX
  const startW = width.value
  const move = (ev: PointerEvent) => setWidth(startW + (startX - ev.clientX))
  const up = () => {
    resizing.value = false
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
onBeforeUnmount(() => {
  resizing.value = false
})

const panelStyle = computed(() => ({ '--panel-w': `${width.value}px` }))

function isUser(m: AssistantMessage) {
  return m.role === 'user'
}
</script>

<template>
  <Teleport to="body">
    <!-- Scrim só no mobile (no desktop o painel coexiste com o conteúdo, estilo Claude) -->
    <Transition name="assist-scrim">
      <div v-if="isOpen" class="assist-scrim" @click="close" />
    </Transition>

    <Transition name="assist-panel">
      <aside
        v-if="isOpen"
        class="assist glass-strong"
        :style="panelStyle"
        role="complementary"
        aria-label="Assistente de IA"
        @keydown="onPanelKeydown"
      >
        <div class="assist-resize" :class="{ active: resizing }" @pointerdown="startResize" />

        <header class="assist-head">
          <span class="assist-brand">
            <span class="assist-spark"><Sparkles :size="15" /></span>
            <span class="assist-titles">
              <strong class="assist-title">Assistente</strong>
              <span class="assist-sub">Pergunte sobre o seu workspace</span>
            </span>
          </span>
          <div class="assist-head-actions">
            <button
              v-if="hasConversation"
              class="icon-btn press"
              type="button"
              :disabled="pending"
              aria-label="Nova conversa"
              title="Nova conversa"
              @click="clear"
            >
              <Plus :size="16" />
            </button>
            <button
              class="icon-btn press"
              type="button"
              aria-label="Fechar assistente"
              title="Fechar (Esc)"
              @click="close"
            >
              <X :size="16" />
            </button>
          </div>
        </header>

        <div ref="scrollRef" class="assist-scroll">
          <!-- Empty state -->
          <div v-if="!hasConversation" class="assist-empty">
            <div class="assist-hero">
              <span class="assist-hero-orb"><Sparkles :size="22" /></span>
              <h2 class="assist-hero-title">Como posso ajudar?</h2>
              <p class="assist-hero-desc">
                Pergunto sobre tarefas, roadmap, eventos, bugs e boards da empresa —
                com as fontes de onde tirei a resposta.
              </p>
            </div>
            <div class="assist-suggestions">
              <button
                v-for="s in suggestions"
                :key="s.label"
                class="suggestion press"
                type="button"
                @click="onSuggestion(s.prompt)"
              >
                <Sparkles :size="13" class="suggestion-ic" />
                <span>{{ s.label }}</span>
              </button>
            </div>
          </div>

          <!-- Conversa -->
          <ul v-else class="assist-thread">
            <li
              v-for="m in messages"
              :key="m.id"
              class="msg"
              :class="isUser(m) ? 'msg--user' : 'msg--ai'"
            >
              <div v-if="isUser(m)" class="bubble bubble--user">{{ m.content }}</div>

              <div v-else class="ai-row">
                <span class="ai-avatar"><Sparkles :size="13" /></span>
                <div class="ai-body">
                  <!-- pending -->
                  <div v-if="m.pending" class="typing" aria-label="Gerando resposta">
                    <span /><span /><span />
                  </div>

                  <!-- error -->
                  <div v-else-if="m.error" class="ai-error">
                    <p>{{ m.error }}</p>
                    <button class="retry press" type="button" @click="retry(m)">
                      <RotateCcw :size="13" /> Tentar de novo
                    </button>
                  </div>

                  <!-- answer -->
                  <template v-else>
                    <!-- eslint-disable-next-line vue/no-v-html -->
                    <div class="ai-md" v-html="renderMarkdown(String(m.content ?? ''))" />
                    <div v-if="m.sources?.length" class="sources">
                      <span class="sources-label">Fontes</span>
                      <div class="sources-list">
                        <button
                          v-for="src in m.sources"
                          :key="`${src.entityType}-${src.entityId}`"
                          class="source press"
                          type="button"
                          :title="src.snippet"
                          @click="openSource(src)"
                        >
                          <component :is="iconFor(src)" :size="12" class="source-ic" />
                          <span class="source-title">{{ src.title }}</span>
                        </button>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
            </li>
          </ul>
        </div>

        <footer class="assist-foot">
          <form class="composer" :class="{ disabled: pending }" @submit.prevent="submit">
            <textarea
              ref="inputRef"
              v-model="draft"
              class="composer-input"
              rows="1"
              :placeholder="pending ? 'Pensando…' : 'Pergunte qualquer coisa…'"
              :disabled="pending"
              @input="autosize"
              @keydown="onKeydown"
            />
            <button
              class="send press"
              type="submit"
              :disabled="!draft.trim() || pending"
              aria-label="Enviar"
            >
              <ArrowUp :size="16" />
            </button>
          </form>
          <p class="composer-hint">
            <CornerDownLeft :size="11" /> enviar
            <span class="dot">·</span>
            <kbd>Shift</kbd>+<kbd>Enter</kbd> quebra linha
          </p>
        </footer>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.assist {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 9998;
  width: min(var(--panel-w, 420px), 100vw);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-left: 1px solid var(--border-strong);
  box-shadow: var(--shadow-overlay);
}

.assist-resize {
  position: absolute;
  left: -3px;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  z-index: 2;
}
.assist-resize::after {
  content: '';
  position: absolute;
  left: 2px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: transparent;
  transition: background var(--motion-fast) var(--motion-ease);
}
.assist-resize:hover::after,
.assist-resize.active::after {
  background: var(--accent);
}

/* Header */
.assist-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 12px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.assist-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.assist-spark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius);
  color: var(--accent-fg);
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #fff));
  flex-shrink: 0;
}
.assist-titles {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}
.assist-title {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text);
}
.assist-sub {
  font-size: 11px;
  color: var(--text-3);
}
.assist-head-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.icon-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}
.icon-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}
.icon-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Scroll area */
.assist-scroll {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px;
}

/* Empty */
.assist-empty {
  display: flex;
  flex-direction: column;
  gap: 18px;
  height: 100%;
  justify-content: center;
}
.assist-hero {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.assist-hero-orb {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  box-shadow: 0 0 0 6px color-mix(in srgb, var(--accent) 6%, transparent);
}
.assist-hero-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.assist-hero-desc {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-3);
  margin: 0;
  max-width: 300px;
}
.assist-suggestions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.suggestion {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 11px 13px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 500;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}
.suggestion:hover {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  background: var(--surface-3);
  color: var(--text);
}
.suggestion:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.suggestion-ic {
  color: var(--accent);
  flex-shrink: 0;
}

/* Thread */
.assist-thread {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.msg {
  display: flex;
}
.msg--user {
  justify-content: flex-end;
}
.bubble--user {
  max-width: 88%;
  padding: 9px 13px;
  border-radius: var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface-2));
  border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
  color: var(--text);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.ai-row {
  display: flex;
  gap: 10px;
  max-width: 100%;
}
.ai-avatar {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  flex-shrink: 0;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  margin-top: 2px;
}
.ai-body {
  min-width: 0;
  flex: 1;
  font-size: 13px;
  color: var(--text);
}

/* Markdown */
.ai-md :deep(p) {
  margin: 0 0 8px;
  line-height: 1.6;
}
.ai-md :deep(p:last-child) {
  margin-bottom: 0;
}
.ai-md :deep(ul) {
  margin: 4px 0 8px;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.ai-md :deep(li) {
  line-height: 1.5;
}
.ai-md :deep(strong) {
  font-weight: 700;
}
.ai-md :deep(code) {
  font-family: var(--font-mono);
  font-size: 11.5px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 5px;
}
.ai-md :deep(a) {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* Typing indicator */
.typing {
  display: inline-flex;
  gap: 4px;
  padding: 6px 2px;
}
.typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-4);
  animation: blink 1.3s ease infinite;
}
.typing span:nth-child(2) {
  animation-delay: 0.18s;
}
.typing span:nth-child(3) {
  animation-delay: 0.36s;
}
@keyframes blink {
  0%,
  60%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

/* Error */
.ai-error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--err) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--err) 24%, transparent);
}
.ai-error p {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-2);
}
.retry {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong);
  background: var(--surface-2);
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}
.retry:hover {
  background: var(--surface-3);
}

/* Sources */
.sources {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
}
.sources-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-4);
  margin-bottom: 7px;
}
.sources-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.source {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 5px 9px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 11.5px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}
.source:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  color: var(--text);
}
.source:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.source-ic {
  color: var(--accent);
  flex-shrink: 0;
}
.source-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

/* Footer / composer */
.assist-foot {
  flex-shrink: 0;
  padding: 12px 14px 14px;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-2) 60%, transparent);
}
.composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 8px 8px 12px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-strong);
  background: var(--surface);
  transition: border-color var(--motion-fast) var(--motion-ease);
}
.composer:focus-within {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border-strong));
}
.composer.disabled {
  opacity: 0.7;
}
.composer-input {
  flex: 1;
  resize: none;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  max-height: 150px;
  caret-color: var(--accent);
}
.composer-input::placeholder {
  color: var(--text-4);
}
.send {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: var(--radius);
  border: none;
  background: var(--accent);
  color: var(--accent-fg);
  cursor: pointer;
  transition:
    opacity var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}
.send:disabled {
  background: var(--surface-3);
  color: var(--text-4);
  cursor: not-allowed;
}
.send:not(:disabled):hover {
  transform: translateY(-1px);
}
.send:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.composer-hint {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 8px 2px 0;
  font-size: 10.5px;
  color: var(--text-4);
}
.composer-hint .dot {
  opacity: 0.6;
}
.composer-hint kbd {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 600;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0 4px;
}

/* Scrim (mobile) */
.assist-scrim {
  position: fixed;
  inset: 0;
  z-index: 9997;
  background: color-mix(in srgb, #000 45%, transparent);
  backdrop-filter: blur(2px);
  display: none;
}

/* Transitions */
.assist-panel-enter-active {
  transition: transform var(--motion) var(--motion-ease);
}
.assist-panel-leave-active {
  transition: transform var(--motion-fast) var(--motion-ease);
}
.assist-panel-enter-from,
.assist-panel-leave-to {
  transform: translateX(100%);
}
.assist-scrim-enter-active,
.assist-scrim-leave-active {
  transition: opacity var(--motion) var(--motion-ease);
}
.assist-scrim-enter-from,
.assist-scrim-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .assist {
    width: 100vw;
    border-left: none;
  }
  .assist-resize {
    display: none;
  }
  .assist-scrim {
    display: block;
  }
}

@media (prefers-reduced-motion: reduce) {
  .assist-panel-enter-active,
  .assist-panel-leave-active,
  .assist-scrim-enter-active,
  .assist-scrim-leave-active {
    transition: none;
  }
  .typing span {
    animation: none;
  }
}
</style>
