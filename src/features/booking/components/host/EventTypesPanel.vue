<script setup lang="ts">
import { ref } from 'vue'
import { Check, Clock3, Copy, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import type { BookingEventType, BookingPage } from '@/service/booking/booking-service'
import EventTypeDialog from './EventTypeDialog.vue'
import { useBookingSettings } from '../../composables/useBookingSettings'
import { formatDuration } from '../../booking-time'

defineProps<{ page: BookingPage }>()

const { updateEventType, archiveEventType } = useBookingSettings()
const { success: showSuccess, error: showError } = useToast()

const dialogOpen = ref(false)
const editing = ref<BookingEventType | null>(null)
const archiving = ref<BookingEventType | null>(null)
const copiedId = ref<string | null>(null)
const togglingId = ref<string | null>(null)

function openNew() {
  editing.value = null
  dialogOpen.value = true
}

function openEdit(type: BookingEventType) {
  editing.value = type
  dialogOpen.value = true
}

async function copy(type: BookingEventType) {
  try {
    await navigator.clipboard.writeText(type.publicUrl)
    copiedId.value = type.id
    setTimeout(() => (copiedId.value = null), 1600)
  } catch {
    showError('Não foi possível copiar. Selecione o link e copie manualmente.')
  }
}

async function toggle(type: BookingEventType) {
  togglingId.value = type.id
  try {
    await updateEventType.mutateAsync({ id: type.id, input: { active: !type.active } })
  } catch (e) {
    showError(getApiErrorMessage(e, 'Não foi possível alterar.'))
  } finally {
    togglingId.value = null
  }
}

async function confirmArchive() {
  if (!archiving.value) return
  try {
    await archiveEventType.mutateAsync(archiving.value.id)
    showSuccess('Tipo de reunião removido')
    archiving.value = null
  } catch (e) {
    showError(getApiErrorMessage(e, 'Não foi possível remover.'))
  }
}

function rulesSummary(type: BookingEventType) {
  const parts: string[] = []
  if (type.minNoticeMin) {
    parts.push(
      type.minNoticeMin < 1440
        ? `${type.minNoticeMin / 60} h de antecedência`
        : `${type.minNoticeMin / 1440} d de antecedência`,
    )
  }
  if (type.bufferBeforeMin || type.bufferAfterMin) parts.push('com folga')
  if (type.dailyLimit) parts.push(`máx. ${type.dailyLimit}/dia`)
  parts.push(`até ${type.maxDaysAhead} dias`)
  return parts.join(' · ')
}

defineExpose({ openNew })
</script>

<template>
  <div class="etp">
    <ul class="etp__list">
      <li v-for="type in page.eventTypes" :key="type.id" class="etp__item bk-card" :class="{ 'is-off': !type.active }">
        <span class="etp__bar" aria-hidden="true" />
        <div class="etp__main">
          <div class="etp__top">
            <h3>{{ type.title }}</h3>
            <label class="bk-switch" :title="type.active ? 'Desativar' : 'Ativar'">
              <input
                type="checkbox"
                :checked="type.active"
                :disabled="togglingId === type.id"
                :aria-label="type.active ? `Desativar ${type.title}` : `Ativar ${type.title}`"
                @change="toggle(type)"
              />
              <span />
            </label>
          </div>
          <p class="etp__meta">
            <Clock3 :size="13" />
            {{ formatDuration(type.durationMin) }} · {{ rulesSummary(type) }}
          </p>
          <p v-if="type.upcomingCount" class="etp__count">
            {{ type.upcomingCount }} {{ type.upcomingCount === 1 ? 'reunião marcada' : 'reuniões marcadas' }}
          </p>
          <p v-if="!type.active" class="etp__off">Desativado: não aparece na sua página.</p>
        </div>
        <footer class="etp__foot">
          <button type="button" class="bk-btn bk-btn--sm etp__copy" :disabled="!type.active" @click="copy(type)">
            <component :is="copiedId === type.id ? Check : Copy" :size="13" />
            {{ copiedId === type.id ? 'Copiado' : 'Copiar link' }}
          </button>
          <a
            class="bk-icon-btn"
            :href="type.publicUrl"
            target="_blank"
            rel="noopener"
            :aria-label="`Abrir a página de ${type.title}`"
            title="Ver como o convidado vê"
          >
            <ExternalLink :size="15" />
          </a>
          <button type="button" class="bk-icon-btn" :aria-label="`Editar ${type.title}`" title="Editar" @click="openEdit(type)">
            <Pencil :size="15" />
          </button>
          <button
            type="button"
            class="bk-icon-btn"
            :aria-label="`Remover ${type.title}`"
            title="Remover"
            @click="archiving = type"
          >
            <Trash2 :size="15" />
          </button>
        </footer>
      </li>

      <li>
        <button type="button" class="etp__new" @click="openNew">
          <Plus :size="18" />
          Novo tipo de reunião
        </button>
      </li>
    </ul>

    <EventTypeDialog v-model="dialogOpen" :event-type="editing" :page-slug="page.slug" />

    <ConfirmDialog
      :model-value="!!archiving"
      title="Remover este tipo de reunião?"
      :message="
        archiving?.upcomingCount
          ? `O link deixa de funcionar. As ${archiving.upcomingCount} reuniões já marcadas com ele continuam de pé.`
          : 'O link deixa de funcionar. Reuniões que já aconteceram continuam no histórico.'
      "
      confirm-label="Remover"
      danger
      :loading="archiveEventType.isPending.value"
      @update:model-value="!$event && (archiving = null)"
      @confirm="confirmArchive"
    />
  </div>
</template>

<style scoped>
.etp__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.etp__item {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.etp__item.is-off {
  opacity: 0.72;
}

.etp__bar {
  height: 4px;
  background: var(--accent);
}

.is-off .etp__bar {
  background: var(--surface-3);
}

.etp__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px 10px;
}

.etp__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.etp__top h3 {
  margin: 0;
  color: var(--text);
  font-size: 14.5px;
  font-weight: 650;
  line-height: 1.35;
}

.etp__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--text-3);
  font-size: 12px;
}

.etp__count {
  margin: 0;
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
}

.etp__off {
  margin: 0;
  color: var(--text-3);
  font-size: 11.5px;
}

.etp__foot {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 12px;
  border-top: 1px solid var(--border);
}

.etp__copy {
  margin-right: auto;
}

.etp__new {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  min-height: 150px;
  border: 1.5px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    color var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.etp__new:hover {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
