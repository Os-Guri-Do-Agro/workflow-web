<script setup lang="ts">
/**
 * `/agendar/:slug` — a página de uma pessoa, com os tipos de reunião dela.
 * Com UM tipo só, vai direto para o calendário: a lista com um item seria um
 * clique a mais sem escolha nenhuma.
 */
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CalendarOff, ChevronRight, Globe, Video } from 'lucide-vue-next'
import { bookingErrorMessage } from '../booking-errors'
import { publicBookingService, type PublicPage } from '@/service/booking/booking-service'
import PublicBookingFrame from '../components/PublicBookingFrame.vue'
import { browserTimeZone, durationBadge as badge, formatDuration, zoneLabel } from '../booking-time'

const route = useRoute()
const router = useRouter()
const slug = String(route.params.slug ?? '')

const page = ref<PublicPage | null>(null)
const error = ref<string | null>(null)
const loading = ref(true)
const visitorZone = zoneLabel(browserTimeZone())

onMounted(async () => {
  try {
    const data = await publicBookingService.page(slug)
    if (data.eventTypes.length === 1 && data.accepting) {
      await router.replace({
        name: 'public-booking-event',
        params: { slug: data.slug, eventSlug: data.eventTypes[0]!.slug },
      })
      return
    }
    page.value = data
    document.title = `Agendar com ${data.host.name}`
  } catch (e) {
    error.value = bookingErrorMessage(e, 'Não foi possível abrir esta página agora.')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <PublicBookingFrame v-if="loading" loading />

  <PublicBookingFrame v-else-if="error || !page" compact>
    <div class="pb-state">
      <span class="pb-state__icon"><CalendarOff :size="22" /></span>
      <h1>Agenda indisponível</h1>
      <p>{{ error }}</p>
    </div>
  </PublicBookingFrame>

  <PublicBookingFrame
    v-else
    :host-name="page.host.name"
    :headline="page.host.headline"
    :avatar-url="page.host.avatarUrl"
  >
    <template #aside>
      <div class="pb-intro">
        <p class="pb-intro__lead">
          Escolha o tipo de reunião e um horário livre na agenda de {{ page.host.name }}.
        </p>
        <ul class="bk-facts">
          <li class="bk-fact">
            <Video :size="16" />
            <span>Google Meet <span class="bk-fact__sub">O link chega no convite, por e-mail</span></span>
          </li>
          <li class="bk-fact">
            <Globe :size="16" />
            <span>Horários no seu fuso <span class="bk-fact__sub">{{ visitorZone }}</span></span>
          </li>
        </ul>
      </div>
    </template>

    <div v-if="!page.accepting" class="pb-state">
      <span class="pb-state__icon"><CalendarOff :size="22" /></span>
      <h2>Agenda temporariamente indisponível</h2>
      <p>
        {{ page.host.name }} não está recebendo agendamentos por aqui no momento. Tente de novo mais
        tarde.
      </p>
    </div>

    <div v-else-if="!page.eventTypes.length" class="pb-state">
      <span class="pb-state__icon"><CalendarOff :size="22" /></span>
      <h2>Nenhum tipo de reunião disponível</h2>
      <p>Volte mais tarde ou fale direto com {{ page.host.name }}.</p>
    </div>

    <template v-else>
      <header class="pb-head">
        <h2>Escolha o tipo de reunião</h2>
        <p>{{ page.eventTypes.length }} opções. Os horários livres aparecem no próximo passo.</p>
      </header>

      <ul class="pb-types">
        <li v-for="type in page.eventTypes" :key="type.slug">
          <RouterLink
            class="pb-type"
            :to="{ name: 'public-booking-event', params: { slug: page.slug, eventSlug: type.slug } }"
          >
            <span class="pb-type__dur" aria-hidden="true">
              <strong>{{ badge(type.durationMin).value }}</strong>
              <small v-if="badge(type.durationMin).unit">{{ badge(type.durationMin).unit }}</small>
            </span>
            <span class="pb-type__body">
              <span class="pb-type__title">{{ type.title }}</span>
              <span class="pb-type__meta">{{ formatDuration(type.durationMin) }} · Google Meet</span>
              <span v-if="type.description" class="pb-type__desc">{{ type.description }}</span>
            </span>
            <ChevronRight :size="18" class="pb-type__go" />
          </RouterLink>
        </li>
      </ul>
    </template>
  </PublicBookingFrame>
</template>

<style scoped>
.pb-intro {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 18px;
  border-top: 1px solid var(--border);
}

.pb-intro__lead {
  margin: 0;
  color: var(--text-2);
  font-size: 13.5px;
  line-height: 1.6;
}

.pb-head {
  margin-bottom: 18px;
}

.pb-head h2 {
  margin: 0;
  color: var(--text);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.pb-head p {
  margin: 4px 0 0;
  color: var(--text-3);
  font-size: 13px;
}

.pb-types {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pb-type {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 16px 16px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: inherit;
  text-decoration: none;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease);
}

.pb-type:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 3%, var(--surface));
  box-shadow: var(--shadow-sm);
}

.pb-type:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Duração em destaque: é o que mais diferencia um tipo do outro. */
.pb-type__dur {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 54px;
  height: 54px;
  border-radius: var(--radius);
  background: var(--accent-soft);
  color: var(--accent-ink);
  line-height: 1;
}

.pb-type__dur strong {
  font-size: 17px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}

.pb-type__dur small {
  margin-top: 2px;
  font-size: 11px;
  font-weight: 650;
}

.pb-type__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.pb-type__title {
  color: var(--text);
  font-size: 15px;
  font-weight: 650;
}

.pb-type__meta {
  color: var(--text-3);
  font-size: 12.5px;
}

.pb-type__desc {
  display: -webkit-box;
  margin-top: 3px;
  overflow: hidden;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.5;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.pb-type__go {
  flex-shrink: 0;
  color: var(--text-3);
  transition:
    color var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.pb-type:hover .pb-type__go {
  color: var(--accent-ink);
  transform: translateX(2px);
}

.pb-state {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 8px;
  text-align: center;
}

.pb-state__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  margin-bottom: 6px;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--text-3);
}

.pb-state h1,
.pb-state h2 {
  margin: 0;
  color: var(--text);
  font-size: 17px;
  font-weight: 700;
}

.pb-state p {
  max-width: 380px;
  margin: 0;
  color: var(--text-3);
  font-size: 13.5px;
  line-height: 1.55;
}

@media (prefers-reduced-motion: reduce) {
  .pb-type:hover .pb-type__go {
    transform: none;
  }
}
</style>
