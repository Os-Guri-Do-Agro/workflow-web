<script setup lang="ts">
/**
 * `/agendar/:slug` — a página de uma pessoa, com os tipos de reunião dela.
 * Com UM tipo só, vai direto para o calendário: a lista com um item seria um
 * clique a mais sem escolha nenhuma.
 */
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, CalendarOff, Clock3 } from 'lucide-vue-next'
import { bookingErrorMessage } from '../booking-errors'
import { publicBookingService, type PublicPage } from '@/service/booking/booking-service'
import PublicBookingFrame from '../components/PublicBookingFrame.vue'
import { formatDuration } from '../booking-time'

const route = useRoute()
const router = useRouter()
const slug = String(route.params.slug ?? '')

const page = ref<PublicPage | null>(null)
const error = ref<string | null>(null)
const loading = ref(true)

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
  <PublicBookingFrame v-if="loading || error || !page" compact>
    <div class="pb-state">
      <p v-if="loading" class="pb-state__muted">Carregando agenda...</p>
      <template v-else>
        <CalendarOff :size="28" class="pb-state__icon" />
        <h1>Agenda indisponível</h1>
        <p class="pb-state__muted">{{ error }}</p>
      </template>
    </div>
  </PublicBookingFrame>

  <PublicBookingFrame v-else :host-name="page.host.name" :headline="page.host.headline">
    <template #aside>
      <h1 class="pb-welcome">Escolha o tipo de reunião</h1>
      <p class="pb-welcome-sub">
        Os horários aparecem no seu fuso, e o convite chega no seu e-mail com o link do Google Meet.
      </p>
    </template>

    <div v-if="!page.accepting" class="pb-state">
      <CalendarOff :size="28" class="pb-state__icon" />
      <h2>Agenda temporariamente indisponível</h2>
      <p class="pb-state__muted">
        {{ page.host.name }} não está recebendo agendamentos por aqui no momento. Tente de novo mais
        tarde.
      </p>
    </div>

    <div v-else-if="!page.eventTypes.length" class="pb-state">
      <CalendarOff :size="28" class="pb-state__icon" />
      <h2>Nenhum tipo de reunião disponível</h2>
      <p class="pb-state__muted">Volte mais tarde ou fale direto com {{ page.host.name }}.</p>
    </div>

    <ul v-else class="pb-types">
      <li v-for="type in page.eventTypes" :key="type.slug">
        <RouterLink
          class="pb-type"
          :to="{ name: 'public-booking-event', params: { slug: page.slug, eventSlug: type.slug } }"
        >
          <span class="pb-type__bar" aria-hidden="true" />
          <span class="pb-type__body">
            <span class="pb-type__title">{{ type.title }}</span>
            <span class="pb-type__meta">
              <Clock3 :size="13" />
              {{ formatDuration(type.durationMin) }} · Google Meet
            </span>
            <span v-if="type.description" class="pb-type__desc">{{ type.description }}</span>
          </span>
          <ArrowRight :size="17" class="pb-type__go" />
        </RouterLink>
      </li>
    </ul>
  </PublicBookingFrame>
</template>

<style scoped>
.pb-welcome {
  margin: 8px 0 0;
  color: var(--text);
  font-size: 19px;
  font-weight: 700;
  line-height: 1.3;
}

.pb-welcome-sub {
  margin: 0;
  color: var(--text-3);
  font-size: 12.5px;
  line-height: 1.55;
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
  align-items: stretch;
  gap: 14px;
  padding: 16px 18px 16px 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: inherit;
  text-decoration: none;
  overflow: hidden;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.pb-type:hover {
  border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}

.pb-type:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.pb-type__bar {
  flex-shrink: 0;
  width: 4px;
  margin: -16px 0;
  background: var(--accent);
}

.pb-type__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.pb-type__title {
  color: var(--text);
  font-size: 15px;
  font-weight: 650;
}

.pb-type__meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-3);
  font-size: 12.5px;
}

.pb-type__desc {
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pb-type__go {
  align-self: center;
  flex-shrink: 0;
  color: var(--text-3);
}

.pb-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 8px;
  text-align: center;
}

.pb-state h1,
.pb-state h2 {
  margin: 0;
  color: var(--text);
  font-size: 17px;
  font-weight: 700;
}

.pb-state__icon {
  color: var(--text-3);
}

.pb-state__muted {
  max-width: 360px;
  margin: 0;
  color: var(--text-3);
  font-size: 13px;
  line-height: 1.55;
}

@media (prefers-reduced-motion: reduce) {
  .pb-type:hover {
    transform: none;
  }
}
</style>
