<script setup lang="ts">
/**
 * Agendamentos — a página pública de agendamento do usuário (estilo Calendly).
 * Spec: docs/specs/2026/q4/agendamento-publico.md
 *
 * A agenda é PESSOAL (de uma pessoa, não da empresa): nada aqui depende da
 * empresa ativa. O Google conectado é o mesmo do /calendar.
 *
 * Ordem das abas pensada no uso real: quem abre esta tela no dia a dia quer
 * ver as reuniões marcadas; tipos e horários se configuram uma vez.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CalendarCheck2, CalendarRange, Check, Clock4, Copy, ExternalLink, Settings2, TriangleAlert } from 'lucide-vue-next'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useToast } from '@/composables/useToast'
import GoogleConnectionCard from './components/host/GoogleConnectionCard.vue'
import PageSetup from './components/host/PageSetup.vue'
import BookingsPanel from './components/host/BookingsPanel.vue'
import EventTypesPanel from './components/host/EventTypesPanel.vue'
import AvailabilityPanel from './components/host/AvailabilityPanel.vue'
import PageSettingsPanel from './components/host/PageSettingsPanel.vue'
import { useBookingRealtime, useBookingSettings } from './composables/useBookingSettings'
import './styles/booking-host.css'

type Tab = 'reunioes' | 'tipos' | 'horarios' | 'pagina'

const TABS: Array<{ key: Tab; label: string; icon: typeof CalendarCheck2 }> = [
  { key: 'reunioes', label: 'Reuniões', icon: CalendarCheck2 },
  { key: 'tipos', label: 'Tipos de reunião', icon: CalendarRange },
  { key: 'horarios', label: 'Horários', icon: Clock4 },
  { key: 'pagina', label: 'Página', icon: Settings2 },
]

const route = useRoute()
const router = useRouter()
const { success: showSuccess, error: showError } = useToast()

const { overview, recheckGoogle } = useBookingSettings()
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
      <div class="bv__title">
        <h1>Agendamentos</h1>
        <p>Sua página para clientes e parceiros marcarem reuniões com você, direto na sua agenda e com Google Meet.</p>
      </div>

      <div v-if="page" class="bv__link" :class="{ 'is-off': !page.active || !googleOk }">
        <span class="bv__link-dot" aria-hidden="true" />
        <a :href="page.publicUrl" target="_blank" rel="noopener" class="bv__link-url" :title="page.publicUrl">
          {{ displayUrl }}
        </a>
        <button type="button" class="bk-btn bk-btn--sm bk-btn--primary" @click="copyLink">
          <component :is="copied ? Check : Copy" :size="13" />
          {{ copied ? 'Copiado' : 'Copiar link' }}
        </button>
        <a :href="page.publicUrl" target="_blank" rel="noopener" class="bk-icon-btn" aria-label="Abrir página pública">
          <ExternalLink :size="15" />
        </a>
      </div>
    </header>

    <div v-if="overview.isLoading.value" class="bv__loading">
      <Skeleton height="56px" />
      <Skeleton height="220px" />
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

    <template v-else>
      <!-- Na aba Página o mesmo cartão já aparece no lugar dele. -->
      <GoogleConnectionCard
        v-if="!googleOk && !(page && tab === 'pagina')"
        :google="data.google"
        @changed="onGoogleChanged"
      />

      <PageSetup v-if="!page" :suggested-slug="data.suggestedSlug" :public-base-url="data.publicBaseUrl" />

      <template v-else>
        <p v-if="!page.active" class="bk-alert bk-alert--warn bv__paused">
          <TriangleAlert :size="15" />
          Sua página está desligada: o link responde que a agenda não está recebendo agendamentos.
          <button type="button" class="bv__inline-link" @click="tab = 'pagina'">Ligar</button>
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
            {{ t.label }}
          </button>
        </nav>

        <BookingsPanel v-if="tab === 'reunioes'" />
        <EventTypesPanel v-else-if="tab === 'tipos'" :page="page" />
        <AvailabilityPanel v-else-if="tab === 'horarios'" :page="page" />
        <PageSettingsPanel v-else :page="page" :overview="data" @google-changed="onGoogleChanged" />
      </template>
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
  padding: 28px 24px 40px;
}

.bv__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.bv__title h1 {
  margin: 0;
  color: var(--text);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.bv__title p {
  max-width: 560px;
  margin: 4px 0 0;
  color: var(--text-3);
  font-size: 13px;
  line-height: 1.5;
}

.bv__link {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 6px 6px 6px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.bv__link-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--success) 20%, transparent);
}

.bv__link.is-off .bv__link-dot {
  background: var(--warn);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--warn) 20%, transparent);
}

.bv__link-url {
  min-width: 0;
  max-width: 340px;
  overflow: hidden;
  color: var(--text);
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bv__link-url:hover {
  text-decoration: underline;
}

.bv__loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bv__paused {
  align-items: center;
  margin: 0;
}

.bv__paused :deep(svg) {
  flex-shrink: 0;
  color: var(--warn);
}

.bv__inline-link {
  margin-left: auto;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}

.bv__tabs {
  display: flex;
  gap: 4px;
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

@media (max-width: 640px) {
  .bv {
    padding: 18px 16px 32px;
  }

  .bv__link {
    width: 100%;
  }

  .bv__link-url {
    flex: 1;
    max-width: none;
  }
}
</style>
