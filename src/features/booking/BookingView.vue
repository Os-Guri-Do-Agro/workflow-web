<script setup lang="ts">
/**
 * Agendamentos — a página pública de agendamento do usuário (estilo Calendly).
 * Spec: docs/specs/2026/q4/agendamento-publico.md
 *
 * A agenda é PESSOAL (de uma pessoa, não da empresa): nada aqui depende da
 * empresa ativa. O Google conectado é o mesmo do /calendar.
 *
 * Organização da tela, de cima para baixo:
 * 1. Resumo: o link (com o estado: no ar, pausada, fora do ar), a próxima
 *    reunião e os números. É o que responde "está funcionando?" sem clicar.
 * 2. Abas na ordem do uso real: quem abre esta tela no dia a dia quer ver as
 *    reuniões marcadas; tipos, horários e página se configuram uma vez.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  CalendarCheck2,
  CalendarRange,
  Check,
  Clock4,
  Copy,
  ExternalLink,
  Loader2,
  PauseCircle,
  Settings2,
  TriangleAlert,
} from 'lucide-vue-next'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import type { BookingScope } from '@/service/booking/booking-service'
import GoogleConnectionCard from './components/host/GoogleConnectionCard.vue'
import PageSetup from './components/host/PageSetup.vue'
import BookingsPanel from './components/host/BookingsPanel.vue'
import EventTypesPanel from './components/host/EventTypesPanel.vue'
import AvailabilityPanel from './components/host/AvailabilityPanel.vue'
import PageSettingsPanel from './components/host/PageSettingsPanel.vue'
import { useBookingRealtime, useBookingSettings, useHostBookings } from './composables/useBookingSettings'
import { browserTimeZone, formatTime, relativeDayLabel } from './booking-time'
import './styles/booking.css'

type Tab = 'reunioes' | 'tipos' | 'horarios' | 'pagina'

const TABS: Array<{ key: Tab; label: string; short: string; icon: typeof CalendarCheck2 }> = [
  { key: 'reunioes', label: 'Reuniões', short: 'Reuniões', icon: CalendarCheck2 },
  { key: 'tipos', label: 'Tipos de reunião', short: 'Tipos', icon: CalendarRange },
  { key: 'horarios', label: 'Horários', short: 'Horários', icon: Clock4 },
  { key: 'pagina', label: 'Página', short: 'Página', icon: Settings2 },
]

const route = useRoute()
const router = useRouter()
const { success: showSuccess, error: showError } = useToast()

const { overview, recheckGoogle, savePage } = useBookingSettings()
useBookingRealtime()

const data = computed(() => overview.data.value)
const page = computed(() => data.value?.page ?? null)

const tab = computed<Tab>({
  get: () => {
    const q = String(route.query.tab ?? '')
    return (TABS.some((t) => t.key === q) ? q : 'reunioes') as Tab
  },
  set: (value) => {
    void router.replace({ query: { ...route.query, tab: value === 'reunioes' ? undefined : value } })
  },
})

const googleOk = computed(() => !!data.value?.google.connected && data.value.google.healthy)

// ─── Resumo ─────────────────────────────────────────────────────────────────

/** A mesma query da aba Reuniões (o Vue Query divide o cache): zero request a mais. */
const upcomingScope = ref<BookingScope>('upcoming')
const upcoming = useHostBookings(upcomingScope, computed(() => !!page.value))
const tz = browserTimeZone()

const upcomingList = computed(() => (upcoming.data.value ?? []).filter((b) => b.status === 'CONFIRMED'))
const nextBooking = computed(() => upcomingList.value[0] ?? null)
const nextIsLive = computed(
  () => !!nextBooking.value && Date.parse(nextBooking.value.startAt) <= Date.now(),
)

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

const activeTypes = computed(() => page.value?.eventTypes.filter((t) => t.active).length ?? 0)

const status = computed(() => {
  if (!page.value) return null
  if (!googleOk.value) return { tone: 'err', label: 'Fora do ar', hint: 'Google desconectado' }
  if (!page.value.active) return { tone: 'warn', label: 'Pausada', hint: 'Não aceita agendamentos' }
  if (!activeTypes.value) return { tone: 'warn', label: 'Sem tipos ativos', hint: 'Ninguém consegue marcar' }
  return { tone: 'success', label: 'No ar', hint: 'Aceitando agendamentos' }
})

const tabCount = (key: Tab) => {
  if (key === 'reunioes') return upcoming.data.value ? upcomingList.value.length : null
  if (key === 'tipos') return page.value?.eventTypes.length ?? null
  return null
}

// ─── Link público ───────────────────────────────────────────────────────────
const copied = ref(false)
async function copyLink() {
  if (!page.value) return
  try {
    await navigator.clipboard.writeText(page.value.publicUrl)
    copied.value = true
    setTimeout(() => (copied.value = false), 1600)
  } catch {
    showError('Não foi possível copiar. Selecione o link e copie manualmente.')
  }
}

const displayUrl = computed(() => page.value?.publicUrl.replace(/^https?:\/\//, '') ?? '')

async function resume() {
  try {
    await savePage.mutateAsync({ active: true })
    showSuccess('Página no ar de novo')
  } catch (e) {
    showError(getApiErrorMessage(e, 'Não foi possível ligar a página.'))
  }
}

// ─── Retorno do OAuth do Google ─────────────────────────────────────────────
onMounted(async () => {
  const sync = route.query.sync
  if (sync !== 'success' && sync !== 'error') return
  void router.replace({ query: { ...route.query, sync: undefined } })
  if (sync === 'success') {
    showSuccess('Google Calendar conectado')
    await recheckGoogle().catch(() => undefined)
  } else {
    showError('Não foi possível conectar o Google Calendar. Tente de novo.')
  }
})

async function onGoogleChanged() {
  await recheckGoogle().catch(() => undefined)
}
</script>

<template>
  <div class="bv">
    <header class="bv__head">
      <h1>Agendamentos</h1>
      <p>Sua página para clientes e parceiros marcarem reuniões com você, direto na sua agenda e com Google Meet.</p>
    </header>

    <div v-if="overview.isLoading.value" class="bv__loading">
      <Skeleton height="148px" />
      <Skeleton height="44px" />
      <Skeleton height="240px" />
    </div>

    <EmptyState
      v-else-if="overview.isError.value || !data"
      :icon="TriangleAlert"
      title="Não foi possível carregar seus agendamentos"
      description="Confira sua conexão e tente de novo."
    >
      <template #action>
        <button type="button" class="bk-btn" @click="overview.refetch()">Tentar de novo</button>
      </template>
    </EmptyState>

    <PageSetup
      v-else-if="!page"
      :suggested-slug="data.suggestedSlug"
      :public-base-url="data.publicBaseUrl"
      :google="data.google"
      @google-changed="onGoogleChanged"
    />

    <template v-else>
      <!-- Na aba Página o mesmo cartão já aparece no lugar dele. -->
      <GoogleConnectionCard v-if="!googleOk && tab !== 'pagina'" :google="data.google" @changed="onGoogleChanged" />

      <section class="bv-sum bk-card" aria-label="Resumo da sua página">
        <div class="bv-sum__top">
          <div class="bv-sum__link">
            <span v-if="status" class="bk-chip" :class="`bk-chip--${status.tone}`" :title="status.hint">
              <span class="bk-dot" aria-hidden="true" />
              {{ status.label }}
            </span>
            <a :href="page.publicUrl" target="_blank" rel="noopener" class="bv-sum__url" :title="page.publicUrl">
              {{ displayUrl }}
            </a>
          </div>
          <div class="bv-sum__actions">
            <button type="button" class="bk-btn bk-btn--primary" @click="copyLink">
              <component :is="copied ? Check : Copy" :size="14" />
              {{ copied ? 'Copiado' : 'Copiar link' }}
            </button>
            <a :href="page.publicUrl" target="_blank" rel="noopener" class="bk-btn">
              <ExternalLink :size="14" />
              Abrir página
            </a>
          </div>
        </div>

        <div class="bv-sum__stats">
          <button type="button" class="bv-stat bv-stat--next" @click="tab = 'reunioes'">
            <span class="bv-stat__label">Próxima reunião</span>
            <span v-if="upcoming.isLoading.value" class="bv-stat__value"><span class="bk-skel" style="width: 140px; height: 15px" /></span>
            <span v-else-if="nextBooking" class="bv-stat__value">
              <span class="bv-stat__main" :class="{ 'is-live': nextIsLive }">
                {{ nextIsLive ? 'Agora' : `${capitalize(relativeDayLabel(nextBooking.startAt, tz))}, ${formatTime(nextBooking.startAt, tz)}` }}
              </span>
              <span class="bv-stat__sub">{{ nextBooking.inviteeName }}</span>
            </span>
            <span v-else class="bv-stat__value">
              <span class="bv-stat__main bv-stat__main--muted">Nenhuma marcada</span>
              <span class="bv-stat__sub">Divulgue o link</span>
            </span>
          </button>
          <div class="bv-stat">
            <span class="bv-stat__label">Marcadas</span>
            <span class="bv-stat__value">
              <span class="bv-stat__main">{{ upcoming.data.value ? upcomingList.length : '–' }}</span>
              <span class="bv-stat__sub">{{ upcomingList.length === 1 ? 'reunião futura' : 'reuniões futuras' }}</span>
            </span>
          </div>
          <button type="button" class="bv-stat" @click="tab = 'tipos'">
            <span class="bv-stat__label">Tipos de reunião</span>
            <span class="bv-stat__value">
              <span class="bv-stat__main">{{ activeTypes }}</span>
              <span class="bv-stat__sub">
                {{ activeTypes === 1 ? 'ativo' : 'ativos' }}{{ page.eventTypes.length > activeTypes ? ` de ${page.eventTypes.length}` : '' }}
              </span>
            </span>
          </button>
          <button type="button" class="bv-stat" @click="tab = 'pagina'">
            <span class="bv-stat__label">Google Calendar</span>
            <span class="bv-stat__value">
              <span class="bv-stat__main bv-stat__google" :class="googleOk ? 'is-ok' : 'is-off'">
                <span class="bk-dot" aria-hidden="true" />
                {{ googleOk ? 'Conectado' : data.google.connected ? 'Precisa reconectar' : 'Desconectado' }}
              </span>
              <span class="bv-stat__sub bv-stat__ellipsis" :title="data.google.email ?? undefined">
                {{ data.google.email ?? 'Necessário para marcar' }}
              </span>
            </span>
          </button>
        </div>
      </section>

      <p v-if="!page.active" class="bk-alert bk-alert--warn bv__paused">
        <PauseCircle :size="16" />
        <span>Sua página está pausada: o link responde que a agenda não está recebendo agendamentos.</span>
        <button type="button" class="bk-btn bk-btn--sm" :disabled="savePage.isPending.value" @click="resume">
          <Loader2 v-if="savePage.isPending.value" :size="13" class="bk-spin" />
          Ligar agora
        </button>
      </p>

      <nav class="bv__tabs" role="tablist" aria-label="Seções de agendamento">
        <button
          v-for="t in TABS"
          :key="t.key"
          type="button"
          role="tab"
          class="bv__tab"
          :class="{ 'is-active': tab === t.key }"
          :aria-selected="tab === t.key"
          @click="tab = t.key"
        >
          <component :is="t.icon" :size="15" />
          <span class="bv__tab-label">{{ t.label }}</span>
          <span class="bv__tab-short" aria-hidden="true">{{ t.short }}</span>
          <span v-if="tabCount(t.key) !== null" class="bv__tab-count">{{ tabCount(t.key) }}</span>
        </button>
      </nav>

      <div class="bv__panel" role="tabpanel">
        <BookingsPanel v-if="tab === 'reunioes'" :public-url="page.publicUrl" />
        <EventTypesPanel v-else-if="tab === 'tipos'" :page="page" />
        <AvailabilityPanel v-else-if="tab === 'horarios'" :page="page" />
        <PageSettingsPanel v-else :page="page" :overview="data" @google-changed="onGoogleChanged" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.bv {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 1120px;
  margin: 0 auto;
  padding: 28px 24px 48px;
}

.bv__head h1 {
  margin: 0;
  color: var(--text);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.bv__head p {
  max-width: 620px;
  margin: 4px 0 0;
  color: var(--text-3);
  font-size: 13px;
  line-height: 1.5;
}

.bv__loading {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ─── Resumo ──────────────────────────────────────────────────────────────── */

.bv-sum {
  overflow: hidden;
}

.bv-sum__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 16px;
  padding: 16px 18px;
}

.bv-sum__link {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.bv-sum__url {
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  font-size: 15px;
  font-weight: 650;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bv-sum__url:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.bv-sum__actions {
  display: flex;
  gap: 8px;
}

.bv-sum__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
  border-top: 1px solid var(--border);
}

.bv-stat {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  margin: 0;
  padding: 14px 18px;
  border: none;
  border-left: 1px solid var(--border);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
}

.bv-stat:first-child {
  border-left: none;
}

button.bv-stat {
  cursor: pointer;
  transition: background var(--motion-fast) var(--motion-ease);
}

button.bv-stat:hover {
  background: var(--surface-2);
}

button.bv-stat:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.bv-stat__label {
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
}

.bv-stat__value {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  margin: 0;
}

.bv-stat__main {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text);
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.bv-stat__main--muted {
  color: var(--text-2);
  font-size: 14px;
}

.bv-stat__main.is-live {
  color: var(--accent-ink);
}

.bv-stat__google {
  font-size: 14px;
}

.bv-stat__google.is-ok .bk-dot {
  color: var(--success);
}

.bv-stat__google.is-off .bk-dot {
  color: var(--err);
}

.bv-stat__sub {
  overflow: hidden;
  color: var(--text-3);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ─── Aviso de pausa ──────────────────────────────────────────────────────── */

.bv__paused {
  align-items: center;
}

.bv__paused > span {
  flex: 1;
}

/* ─── Abas ────────────────────────────────────────────────────────────────── */

.bv__tabs {
  display: flex;
  gap: 4px;
  margin-top: 4px;
  overflow-x: auto;
  border-bottom: 1px solid var(--border);
  scrollbar-width: none;
}

.bv__tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-bottom: -1px;
  padding: 10px 14px;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--text-3);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.bv__tab:hover {
  color: var(--text);
}

.bv__tab.is-active {
  border-bottom-color: var(--accent);
  color: var(--text);
}

.bv__tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.bv__tab-count {
  min-width: 20px;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-3);
  font-size: 11px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.bv__tab.is-active .bv__tab-count {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.bv__tab-short {
  display: none;
}

.bv__panel {
  min-width: 0;
}

/* ─── Telas menores ───────────────────────────────────────────────────────── */

@media (max-width: 900px) {
  .bv-sum__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .bv-stat:nth-child(3) {
    border-left: none;
  }

  .bv-stat:nth-child(n + 3) {
    border-top: 1px solid var(--border);
  }
}

@media (max-width: 640px) {
  .bv {
    gap: 14px;
    padding: 18px 16px 32px;
  }

  .bv-sum__top {
    padding: 14px;
  }

  .bv-sum__link {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    width: 100%;
  }

  .bv-sum__url {
    max-width: 100%;
    font-size: 14px;
  }

  .bv-sum__actions {
    width: 100%;
  }

  .bv-sum__actions > * {
    flex: 1;
  }

  .bv-stat {
    padding: 12px 14px;
  }

  .bv__paused {
    flex-wrap: wrap;
  }

  .bv__tabs {
    gap: 0;
  }

  .bv__tab {
    flex: 1 1 0;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    padding: 8px 4px 10px;
    font-size: 12px;
  }

  .bv__tab-label {
    display: none;
  }

  .bv__tab-short {
    display: inline;
  }

  /* No celular o número vai como bolinha ao lado do ícone. */
  .bv__tab {
    position: relative;
  }

  .bv__tab-count {
    position: absolute;
    top: 3px;
    left: calc(50% + 6px);
    min-width: 17px;
    padding: 1px 4px;
    font-size: 10.5px;
  }
}
</style>
