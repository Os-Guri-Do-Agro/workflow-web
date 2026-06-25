<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Bell, CheckCheck, Inbox, Loader2, Trash2 } from 'lucide-vue-next'
import { useInbox } from '@/composables/useInbox'
import { useToast } from '@/composables/useToast'
import type { AppNotification } from '@/service/inbox/inbox-service'

const router = useRouter()
const { error: showError, success } = useToast()
const { notifications, unreadCount, markRead, markAllRead, dismiss } = useInbox()

const isOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const items = computed(() => notifications.data.value ?? [])
const count = computed(() => unreadCount.data.value?.count ?? 0)
const hasUnread = computed(() => count.value > 0)
const countLabel = computed(() => (count.value > 9 ? '9+' : String(count.value)))
const isLoading = computed(() => notifications.isLoading.value || unreadCount.isLoading.value)
const isMutating = computed(
  () => markRead.isPending.value || markAllRead.isPending.value || dismiss.isPending.value,
)

function toggleOpen() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    notifications.refetch()
    unreadCount.refetch()
  }
}

function close() {
  isOpen.value = false
}

async function handleOpenNotification(notification: AppNotification) {
  try {
    if (!notification.read) await markRead.mutateAsync(notification.id)
    close()
    if (notification.link) await router.push(notification.link)
  } catch {
    showError('Não foi possível abrir a notificação')
  }
}

async function handleMarkAllRead() {
  try {
    const result = await markAllRead.mutateAsync()
    if (result.updated > 0) success('Notificações marcadas como lidas')
  } catch {
    showError('Não foi possível marcar todas como lidas')
  }
}

async function handleDismiss(notification: AppNotification) {
  try {
    await dismiss.mutateAsync(notification.id)
  } catch {
    showError('Não foi possível dispensar a notificação')
  }
}

function onDocumentClick(event: MouseEvent) {
  if (!isOpen.value) return
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) close()
}

function formatDate(value: string) {
  const date = new Date(value)
  const now = Date.now()
  const diffMinutes = Math.max(0, Math.floor((now - date.getTime()) / 60000))

  if (diffMinutes < 1) return 'agora'
  if (diffMinutes < 60) return `${diffMinutes} min`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} h`

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

onMounted(() => document.addEventListener('mousedown', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick))
</script>

<template>
  <div ref="rootRef" class="inbox">
    <button
      class="inbox-trigger"
      :class="{ 'inbox-trigger--active': isOpen }"
      title="Notificações"
      type="button"
      @click="toggleOpen"
    >
      <Bell :size="15" />
      <span v-if="hasUnread" class="inbox-badge">{{ countLabel }}</span>
    </button>

    <Transition name="inbox-pop">
      <section v-if="isOpen" class="inbox-panel" aria-label="Notificações">
        <header class="inbox-header">
          <div>
            <p class="inbox-eyebrow">Inbox</p>
            <h2 class="inbox-title">Notificações</h2>
          </div>
          <button
            class="inbox-action"
            type="button"
            :disabled="!hasUnread || isMutating"
            @click="handleMarkAllRead"
          >
            <CheckCheck :size="13" />
            <span>Ler todas</span>
          </button>
        </header>

        <div v-if="isLoading" class="inbox-state">
          <Loader2 :size="18" class="inbox-spin" />
          <span>Carregando notificações...</span>
        </div>

        <div v-else-if="items.length === 0" class="inbox-state">
          <Inbox :size="22" />
          <span>Nada novo por aqui.</span>
        </div>

        <div v-else class="inbox-list">
          <article
            v-for="item in items"
            :key="item.id"
            class="inbox-item"
            :class="{ 'inbox-item--unread': !item.read }"
          >
            <button class="inbox-item-main" type="button" @click="handleOpenNotification(item)">
              <span class="inbox-dot" />
              <span class="inbox-copy">
                <span class="inbox-item-title">{{ item.title }}</span>
                <span v-if="item.body" class="inbox-item-body">{{ item.body }}</span>
                <span class="inbox-item-meta">{{ item.type }} · {{ formatDate(item.createdAt) }}</span>
              </span>
            </button>
            <button
              class="inbox-dismiss"
              type="button"
              title="Dispensar"
              :disabled="isMutating"
              @click.stop="handleDismiss(item)"
            >
              <Trash2 :size="13" />
            </button>
          </article>
        </div>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.inbox {
  position: relative;
  display: inline-flex;
}

.inbox-trigger {
  position: relative;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.inbox-trigger:hover,
.inbox-trigger--active {
  background: var(--surface-3);
  border-color: var(--border-strong);
  color: var(--text);
}

.inbox-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--err);
  color: var(--accent-fg);
  border: 2px solid var(--surface);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 800;
  line-height: 1;
}

.inbox-panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: min(360px, calc(100vw - 24px));
  max-height: min(520px, calc(100vh - 96px));
  overflow: hidden;
  z-index: 80;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-overlay);
  display: flex;
  flex-direction: column;
}

.inbox-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-bottom: 1px solid var(--border);
}

.inbox-eyebrow {
  margin: 0 0 2px;
  color: var(--text-4);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.inbox-title {
  margin: 0;
  color: var(--text);
  font-size: 14px;
  font-weight: 750;
}

.inbox-action {
  height: 28px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text-2);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.inbox-action:disabled,
.inbox-dismiss:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.inbox-state {
  min-height: 164px;
  padding: 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-3);
  font-size: 12.5px;
  text-align: center;
}

.inbox-spin {
  animation: inbox-spin 0.8s linear infinite;
}

.inbox-list {
  overflow-y: auto;
  padding: 6px;
}

.inbox-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px;
  border-radius: var(--radius);
  transition: background var(--motion-fast) var(--motion-ease);
}

.inbox-item:hover {
  background: var(--surface-2);
}

.inbox-item-main {
  min-width: 0;
  display: grid;
  grid-template-columns: 8px 1fr;
  gap: 9px;
  padding: 10px 8px 10px 10px;
  border: 0;
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.inbox-dot {
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border-radius: 999px;
  background: transparent;
}

.inbox-item--unread .inbox-dot {
  background: var(--accent);
}

.inbox-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.inbox-item-title {
  color: var(--text);
  font-size: 12.5px;
  font-weight: 680;
}

.inbox-item-body {
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.35;
}

.inbox-item-meta {
  color: var(--text-4);
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.inbox-dismiss {
  width: 28px;
  height: 28px;
  margin: 8px 8px 0 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-4);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.inbox-dismiss:hover {
  background: var(--surface-3);
  color: var(--err);
}

.inbox-pop-enter-active,
.inbox-pop-leave-active {
  transition:
    opacity var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.inbox-pop-enter-from,
.inbox-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

@keyframes inbox-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
