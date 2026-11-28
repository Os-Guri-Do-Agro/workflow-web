<script setup lang="ts">
/**
 * Resumo da reunião (confirmação e página de gerenciar). Mostra a hora no fuso
 * de quem está olhando e, quando o anfitrião está em outro fuso, a hora dele
 * também: "10:00 para você, 14:00 para o Emílio" é o que evita o "achei que
 * era no seu horário".
 */
import { computed, ref } from 'vue'
import { CalendarDays, Check, Copy, Globe, User, Video } from 'lucide-vue-next'
import { formatRange, formatTime, gmtOffset, zoneLabel } from '../booking-time'

const props = defineProps<{
  startAt: string
  endAt: string
  timezone: string
  hostName: string
  hostTimezone: string
  inviteeName?: string
  inviteeEmail?: string
  meetLink?: string | null
  canceled?: boolean
}>()

const otherZone = computed(
  () =>
    props.hostTimezone !== props.timezone &&
    gmtOffset(props.hostTimezone, Date.parse(props.startAt)) !==
      gmtOffset(props.timezone, Date.parse(props.startAt)),
)

const copied = ref(false)
async function copyMeet() {
  if (!props.meetLink) return
  try {
    await navigator.clipboard.writeText(props.meetLink)
    copied.value = true
    setTimeout(() => (copied.value = false), 1800)
  } catch {
    /* clipboard bloqueado: o link continua clicável */
  }
}
</script>

<template>
  <dl class="bs" :class="{ 'bs--canceled': canceled }">
    <div class="bs__row">
      <dt><CalendarDays :size="15" /><span class="sr-only">Quando</span></dt>
      <dd>
        <span class="bs__when">{{ formatRange(startAt, endAt, timezone) }}</span>
        <span v-if="otherZone" class="bs__note">
          {{ formatTime(startAt, hostTimezone) }} para {{ hostName }} ({{ gmtOffset(hostTimezone, Date.parse(startAt)) }})
        </span>
      </dd>
    </div>
    <div class="bs__row">
      <dt><Globe :size="15" /><span class="sr-only">Fuso</span></dt>
      <dd>{{ zoneLabel(timezone, Date.parse(startAt)) }}</dd>
    </div>
    <div v-if="inviteeName" class="bs__row">
      <dt><User :size="15" /><span class="sr-only">Convidado</span></dt>
      <dd>
        {{ inviteeName }}
        <span v-if="inviteeEmail" class="bs__note">{{ inviteeEmail }}</span>
      </dd>
    </div>
    <div v-if="meetLink && !canceled" class="bs__row">
      <dt><Video :size="15" /><span class="sr-only">Google Meet</span></dt>
      <dd class="bs__meet">
        <a :href="meetLink" target="_blank" rel="noopener noreferrer">{{ meetLink.replace(/^https?:\/\//, '') }}</a>
        <button type="button" class="bs__copy" :aria-label="copied ? 'Copiado' : 'Copiar link do Meet'" @click="copyMeet">
          <component :is="copied ? Check : Copy" :size="13" />
        </button>
      </dd>
    </div>
  </dl>
</template>

<style scoped>
.bs {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
}

.bs__row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.bs dt {
  padding-top: 2px;
  color: var(--text-3);
}

.bs dd {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  min-width: 0;
  color: var(--text);
  font-size: 13.5px;
  line-height: 1.45;
}

.bs__when::first-letter {
  text-transform: uppercase;
}

.bs--canceled .bs__when {
  text-decoration: line-through;
  color: var(--text-3);
}

.bs__note {
  color: var(--text-3);
  font-size: 12px;
}

.bs__meet {
  flex-direction: row !important;
  align-items: center;
  gap: 8px !important;
}

.bs__meet a {
  min-width: 0;
  overflow: hidden;
  color: var(--accent);
  font-weight: 600;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bs__meet a:hover {
  text-decoration: underline;
}

.bs__copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-3);
  cursor: pointer;
}

.bs__copy:hover {
  color: var(--text);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
