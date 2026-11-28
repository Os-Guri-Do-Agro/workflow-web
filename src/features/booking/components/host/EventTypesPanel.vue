<script setup lang="ts">
/**
 * Tipos de reunião da página. Cada um é um cartão com o que a outra pessoa vê
 * (nome, duração, link) em cima e as regras de agenda em chips, para comparar
 * os tipos de relance sem abrir nenhum.
 */
import { ref } from 'vue'
import { CalendarPlus, Check, Copy, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import type { BookingEventType, BookingPage } from '@/service/booking/booking-service'
import EventTypeDialog from './EventTypeDialog.vue'
import { useBookingSettings } from '../../composables/useBookingSettings'
import { durationBadge as badge, formatDuration } from '../../booking-time'

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

/** Regras de agenda em frases curtas, só as que fogem do "sem restrição". */
function rules(type: BookingEventType): string[] {
  const list: string[] = []
  if (type.minNoticeMin) {
    list.push(
      type.minNoticeMin < 1440
        ? `${type.minNoticeMin / 60} h de antecedência`
        : `${type.minNoticeMin / 1440} ${type.minNoticeMin === 1440 ? 'dia' : 'dias'} de antecedência`,
    )
  }
  list.push(`Até ${type.maxDaysAhead} dias à frente`)
  if (type.slotStepMin !== type.durationMin) list.push(`Horários a cada ${formatDuration(type.slotStepMin)}`)
  const buffer = Math.max(type.bufferBeforeMin, type.bufferAfterMin)
  if (buffer) list.push(`Folga de ${formatDuration(buffer)}`)
  if (type.dailyLimit) list.push(`Máx. ${type.dailyLimit} por dia`)
  return list
}

const linkPath = (url: string) => url.replace(/^https?:\/\/[^/]+/, '')

defineExpose({ openNew })
</script>

<template>
  <div class="etp">
    <div class="etp__bar">
      <p class="etp__intro">Cada tipo tem o próprio link. Desligado, ele some da sua página, mas as reuniões já marcadas continuam.</p>
      <button type="button" class="bk-btn bk-btn--primary" @click="openNew">
        <Plus :size="15" />
        Novo tipo
      </button>
    </div>

    <div v-if="!page.eventTypes.length" class="etp__empty bk-card">
      <EmptyState
        :icon="CalendarPlus"
        title="Nenhum tipo de reunião"
        description="Crie um tipo (ex.: conversa de 30 minutos) para a sua página aceitar agendamentos."
      >
        <template #action>
          <button type="button" class="bk-btn bk-btn--primary" @click="openNew">
            <Plus :size="15" />
            Criar tipo de reunião
          </button>
        </template>
      </EmptyState>
    </div>

    <ul v-else class="etp__list">
      <li v-for="type in page.eventTypes" :key="type.id" class="etp__item bk-card" :class="{ 'is-off': !type.active }">
        <div class="etp__main">
          <div class="etp__top">
            <span class="etp__dur" aria-hidden="true">
              <strong>{{ badge(type.durationMin).value }}</strong>
              <small v-if="badge(type.durationMin).unit">{{ badge(type.durationMin).unit }}</small>
            </span>
            <div class="etp__heading">
              <h3>{{ type.title }}</h3>
              <a class="etp__path" :href="type.publicUrl" target="_blank" rel="noopener" :title="type.publicUrl">
                {{ linkPath(type.publicUrl) }}
              </a>
            </div>
            <label class="bk-switch" :title="type.active ? 'Desligar' : 'Ligar'">
              <input
                type="checkbox"
                :checked="type.active"
                :disabled="togglingId === type.id"
                :aria-label="type.active ? `Desligar ${type.title}` : `Ligar ${type.title}`"
                @change="toggle(type)"
              />
              <span />
            </label>
          </div>

          <p v-if="type.description" class="etp__desc">{{ type.description }}</p>

          <ul class="etp__rules" aria-label="Regras de agenda">
            <li v-for="rule in rules(type)" :key="rule" class="bk-chip">{{ rule }}</li>
          </ul>
        </div>

        <footer class="etp__foot">
          <span v-if="!type.active" class="etp__state etp__state--off">Desligado, fora da sua página</span>
          <span v-else-if="type.upcomingCount" class="etp__state etp__state--count">
            {{ type.upcomingCount }} {{ type.upcomingCount === 1 ? 'reunião marcada' : 'reuniões marcadas' }}
          </span>
          <span v-else class="etp__state">Nenhuma reunião marcada</span>

          <div class="etp__actions">
            <button
              type="button"
              class="bk-icon-btn"
              :disabled="!type.active"
              :aria-label="copiedId === type.id ? 'Link copiado' : `Copiar o link de ${type.title}`"
              :title="copiedId === type.id ? 'Copiado' : 'Copiar link'"
              @click="copy(type)"
            >
              <component :is="copiedId === type.id ? Check : Copy" :size="15" />
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
              class="bk-icon-btn bk-icon-btn--danger"
              :aria-label="`Remover ${type.title}`"
              title="Remover"
              @click="archiving = type"
            >
              <Trash2 :size="15" />
            </button>
          </div>
        </footer>
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
.etp {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 4px;
}

.etp__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.etp__intro {
  max-width: 560px;
  margin: 0;
  color: var(--text-3);
  font-size: 12.5px;
  line-height: 1.5;
}

.etp__empty {
  border-style: dashed;
}

.etp__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.etp__item {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease);
}

.etp__item:hover {
  border-color: var(--border-strong);
}

.etp__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.etp__top {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.etp__dur {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  border-radius: var(--radius);
  background: var(--accent-soft);
  color: var(--accent-ink);
  line-height: 1;
}

.etp__dur strong {
  font-size: 15px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}

.etp__dur small {
  margin-top: 2px;
  font-size: 10.5px;
  font-weight: 650;
}

.is-off .etp__dur {
  background: var(--surface-2);
  color: var(--text-3);
}

.etp__heading {
  flex: 1;
  min-width: 0;
}

.etp__heading h3 {
  margin: 1px 0 0;
  color: var(--text);
  font-size: 14.5px;
  font-weight: 650;
  line-height: 1.35;
}

.is-off .etp__heading h3 {
  color: var(--text-2);
}

.etp__path {
  display: block;
  margin-top: 2px;
  overflow: hidden;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 11.5px;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.etp__path:hover {
  color: var(--text-2);
  text-decoration: underline;
}

.etp__desc {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.5;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.etp__rules {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.etp__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px 8px 16px;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-2) 35%, var(--surface));
}

.etp__state {
  min-width: 0;
  overflow: hidden;
  color: var(--text-3);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.etp__state--count {
  color: var(--accent-ink);
  font-weight: 650;
}

.etp__state--off {
  color: var(--text-3);
  font-style: italic;
}

.etp__actions {
  display: flex;
  gap: 2px;
}

@media (max-width: 640px) {
  .etp__bar {
    flex-direction: column;
    align-items: stretch;
  }

  .etp__list {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
