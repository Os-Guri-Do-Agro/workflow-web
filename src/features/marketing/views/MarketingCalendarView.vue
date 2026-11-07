<script setup lang="ts">
/**
 * Calendário editorial da ala (spec m1-aprovacao-calendario.md, M1-B).
 *
 * Mês, Semana e Lista sobre as MESMAS fontes (`calendar/calendar-sources.ts`):
 * cards pela data de publicação e, na junção, campanhas e ativações. Tudo no
 * fuso de Brasília. Estado na URL (`?vista=semana|lista`, `?dia=`, `?rede=`,
 * e a `?marca=` do layout), por `replace`, para o link colado abrir igual.
 *
 * Teclado: ← → navegam, T volta para hoje, M S L trocam a visão, N cria.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { usePhoneViewport } from '@/composables/usePhoneViewport'
import { useMarketing } from '../composables/useMarketing'
import type { MarketingCalendarRange } from '../marketing-calendar'
import { CARD_NETWORK_LABEL, CARD_STATUS_LABEL, CARD_STATUS_TONE, brandTone, toneStyle, type CardNetwork, type CardStatus } from '../marketing-labels'
import { asText, labelItems } from '../select-items'
import { placeItems, type CalendarItemView } from '../calendar/calendar-layout'
import {
  addDays,
  daysInMonth,
  dayKey,
  isYmd,
  mondayOf,
  monthGrid,
  monthTitle,
  shiftMonth,
  todaySp,
  weekDays,
  weekTitle,
} from '../calendar/calendar-time'
import { useMarketingCalendar } from '../calendar/composables/useMarketingCalendar'
import CalendarAgenda from '../calendar/components/CalendarAgenda.vue'
import CalendarMonth from '../calendar/components/CalendarMonth.vue'
import CalendarQuickCreate from '../calendar/components/CalendarQuickCreate.vue'
import CalendarWeek from '../calendar/components/CalendarWeek.vue'
import CalendarFeed from '../calendar/components/CalendarFeed.vue'

type View = 'mes' | 'semana' | 'lista' | 'feed'
const VIEWS: { key: View; label: string; hint: string }[] = [
  { key: 'mes', label: 'Mês', hint: 'M' },
  { key: 'semana', label: 'Semana', hint: 'S' },
  { key: 'lista', label: 'Lista', hint: 'L' },
  // R2 (C5): prévia do feed do Instagram (grade de 3 colunas por marca).
  { key: 'feed', label: 'Feed', hint: 'F' },
]
const NETWORKS = Object.keys(CARD_NETWORK_LABEL) as CardNetwork[]
const networkItems = labelItems(NETWORKS, CARD_NETWORK_LABEL, 'Todas as redes')

const route = useRoute()
const router = useRouter()
const mk = useMarketing()
const phone = usePhoneViewport()

// "Hoje" de Brasília, revisto a cada minuto (a tela pode ficar aberta na virada).
const today = ref(todaySp())
let clock: ReturnType<typeof setInterval> | null = null

// ── Estado na URL ─────────────────────────────────────────────────────────
const view = computed<View>(() => {
  const v = route.query.vista
  return v === 'semana' || v === 'lista' || v === 'feed' ? v : 'mes'
})
const isFeed = computed(() => view.value === 'feed')
const anchor = computed(() => {
  const d = route.query.dia
  return isYmd(d) ? d : today.value
})
const network = computed<CardNetwork | null>(() => {
  const r = route.query.rede
  return typeof r === 'string' && (NETWORKS as string[]).includes(r) ? (r as CardNetwork) : null
})

function setQuery(patch: Record<string, string | null>) {
  const query = { ...route.query }
  for (const [k, v] of Object.entries(patch)) {
    if (v) query[k] = v
    else delete query[k]
  }
  void router.replace({ query })
}
const setView = (v: View) => setQuery({ vista: v === 'mes' ? null : v })
const setAnchor = (d: string) => setQuery({ dia: d === today.value ? null : d })
const setNetwork = (n: string) => setQuery({ rede: n || null })

// ── Intervalo ─────────────────────────────────────────────────────────────
const weeks = computed(() => monthGrid(anchor.value))
const monday = computed(() => mondayOf(anchor.value))
const monthDays = computed(() => {
  const y = Number(anchor.value.slice(0, 4))
  const m0 = Number(anchor.value.slice(5, 7)) - 1
  return Array.from({ length: daysInMonth(y, m0) }, (_, i) => dayKey(y, m0, i + 1))
})
const range = computed<MarketingCalendarRange>(() => {
  if (view.value === 'semana') return { from: monday.value, to: addDays(monday.value, 6) }
  if (view.value === 'lista') return { from: monthDays.value[0]!, to: monthDays.value[monthDays.value.length - 1]! }
  return { from: weeks.value[0]![0]!.date, to: weeks.value[weeks.value.length - 1]![6]!.date }
})
const title = computed(() => (view.value === 'semana' ? weekTitle(monday.value) : monthTitle(anchor.value)))
const unit = computed(() => (view.value === 'semana' ? 'Semana' : 'Mês'))

function step(delta: number) {
  if (view.value === 'semana') return setAnchor(addDays(anchor.value, delta * 7))
  const target = shiftMonth(anchor.value, delta)
  setAnchor(target.slice(0, 7) === today.value.slice(0, 7) ? today.value : target)
}
const goToday = () => setAnchor(today.value)

// ── Dados ─────────────────────────────────────────────────────────────────
const calendar = useMarketingCalendar({ groupId: mk.groupId, range, brandId: mk.brandFilter })
const data = computed(() => calendar.query.data.value)
const loading = computed(() => calendar.query.isLoading.value)
const loadFailed = computed(() => calendar.query.isError.value && !data.value)

const items = computed<CalendarItemView[]>(() => {
  const all = data.value?.items ?? []
  const n = network.value
  // Rede filtra os cards; faixa de campanha e ativação continua (é contexto).
  return n ? all.filter((i) => i.source !== 'card' || (i.networks ?? []).includes(n)) : all
})
const placed = computed(() => placeItems(items.value))

/** Status presentes no período, para a legenda. */
const legend = computed(() => {
  const counts = new Map<CardStatus, number>()
  for (const i of items.value) {
    if (i.source !== 'card' || !i.status) continue
    const s = i.status as CardStatus
    counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  return [...counts.entries()].map(([status, count]) => ({ status, count }))
})

const canEdit = computed(() => mk.can('EDITOR'))
function canDrag(item: CalendarItemView) {
  return canEdit.value && item.source === 'card' && item.draggable && !calendar.query.isPlaceholderData.value
}

const multiBrand = computed(() => mk.brands.value.length > 1)
function brandToneOf(companyId: string | null) {
  return companyId ? brandTone(mk.brandById(companyId)) : 'slate'
}
function brandNameOf(companyId: string | null) {
  if (!multiBrand.value) return ''
  return companyId ? (mk.brandById(companyId)?.name ?? '') : 'Grupo'
}

// ── Ações ─────────────────────────────────────────────────────────────────
function openItem(item: CalendarItemView) {
  void router.push(item.to)
}

function moveItem(item: CalendarItemView, day: string) {
  void calendar.moveItem(item, day)
}

const createOpen = ref(false)
const createDay = ref(today.value)
const createTime = ref('10:00')
function openCreate(day: string, time = '10:00') {
  if (!canEdit.value) return
  createDay.value = day
  createTime.value = time
  createOpen.value = true
}

// ── Teclado ─────────────────────────────────────────────────────────────
function modalOpen() {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')].some(
    (el) => el.offsetParent !== null || el.getClientRects().length > 0,
  )
}
function onKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
  const target = event.target as HTMLElement | null
  // Também o AppSelect (botão combobox e a lista aberta): setas e letras são dele.
  if (target?.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"]')) return
  if (createOpen.value || modalOpen()) return
  const key = event.key.toLowerCase()
  if (event.key === 'ArrowLeft') step(-1)
  else if (event.key === 'ArrowRight') step(1)
  else if (key === 't') goToday()
  else if (key === 'm') setView('mes')
  else if (key === 's') setView('semana')
  else if (key === 'l') setView('lista')
  else if (key === 'f') setView('feed')
  else if (key === 'n' && canEdit.value) openCreate(anchor.value)
  else return
  event.preventDefault()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  clock = setInterval(() => (today.value = todaySp()), 60_000)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  if (clock) clearInterval(clock)
})

const approvalsLink = computed(() => ({
  name: 'marketing-approvals',
  query: mk.brandFilter.value ? { marca: mk.brandFilter.value } : {},
}))
</script>

<template>
  <div class="mk-page mkcal" :class="{ 'is-phone': phone }">
    <div class="mk-toolbar mkcal__bar">
      <div v-if="!isFeed" class="mkcal__nav">
        <button type="button" class="mk-icon-btn" :aria-label="`${unit} anterior (seta para a esquerda)`" :title="`${unit} anterior (←)`" @click="step(-1)">
          <ChevronLeft :size="17" />
        </button>
        <button type="button" class="mk-icon-btn" :aria-label="`Próximo ${unit.toLowerCase()} (seta para a direita)`" :title="`Próximo (→)`" @click="step(1)">
          <ChevronRight :size="17" />
        </button>
        <button type="button" class="mk-btn mkcal__today" title="Hoje (T)" :disabled="anchor === today" @click="goToday">Hoje</button>
        <h2 class="mkcal__title" aria-live="polite">{{ title }}</h2>
      </div>

      <span class="mk-toolbar__spacer" />

      <div v-if="!isFeed" class="mkcal__net" data-testid="calendar-network">
        <AppSelect
          :model-value="network ?? ''"
          :items="networkItems"
          label="Filtrar por rede"
          density="compact"
          @update:model-value="setNetwork(asText($event))"
        />
      </div>

      <div class="mkcal__views" role="tablist" aria-label="Visão do calendário">
        <button
          v-for="v in VIEWS"
          :key="v.key"
          type="button"
          role="tab"
          class="mkcal__view"
          :class="{ 'is-active': view === v.key }"
          :aria-selected="view === v.key"
          :title="`${v.label} (${v.hint})`"
          :data-view="v.key"
          @click="setView(v.key)"
        >
          {{ v.label }}
        </button>
      </div>

      <button
        v-if="canEdit"
        type="button"
        class="mk-btn mk-btn--primary mkcal__new"
        title="Novo card (N)"
        aria-label="Novo card"
        data-action="new-card"
        @click="openCreate(anchor)"
      >
        <Plus :size="15" aria-hidden="true" />
        <span>Novo card</span>
      </button>
    </div>

    <!-- R2 (C5): prévia do feed do Instagram (tem dados próprios: `GET calendar/feed`) -->
    <CalendarFeed
      v-if="isFeed && mk.groupId.value"
      :group-id="mk.groupId.value"
      :brands="mk.brands.value"
      :brand-filter="mk.brandFilter.value"
    />

    <div v-if="!isFeed" class="mkcal__meta">
      <div v-if="legend.length" class="mkcal__legend" aria-label="Status no período">
        <span v-for="l in legend" :key="l.status" class="mkcal__leg">
          <span class="mk-dot" :style="toneStyle(CARD_STATUS_TONE[l.status])" aria-hidden="true" />
          {{ CARD_STATUS_LABEL[l.status] }}
          <b>{{ l.count }}</b>
        </span>
      </div>
      <RouterLink v-if="data?.undated" :to="approvalsLink" class="mkcal__undated" data-undated>
        <CalendarClock :size="14" aria-hidden="true" />
        {{ data.undated }} {{ data.undated === 1 ? 'card aberto' : 'cards abertos' }} sem data de publicação
      </RouterLink>
      <span v-if="!canEdit" class="mkcal__ro">Você vê o calendário; criar e mudar datas é com Editor ou Admin.</span>
    </div>

    <p v-if="!isFeed && data?.failed" class="mkcal__warn" role="status">
      <AlertTriangle :size="14" aria-hidden="true" />
      Parte do calendário não carregou agora. O que apareceu está certo; tente atualizar daqui a pouco.
    </p>

    <template v-if="isFeed" />
    <div v-else-if="loading" class="mkcal__loading">
      <Skeleton type="block" />
    </div>

    <div v-else-if="loadFailed" class="mkcal__error mk-panel">
      <p>Não deu para carregar o calendário.</p>
      <button type="button" class="mk-btn" @click="calendar.query.refetch()">
        <RefreshCw :size="14" aria-hidden="true" />
        Tentar de novo
      </button>
    </div>

    <template v-else>
      <!-- Mês -->
      <template v-if="view === 'mes'">
        <CalendarMonth
          :weeks="weeks"
          :placed="placed"
          :today="today"
          :selected-day="anchor"
          :can-create="canEdit"
          :can-drag="canDrag"
          :phone="phone"
          :brand-tone-of="brandToneOf"
          :brand-name-of="brandNameOf"
          @create="openCreate"
          @open="openItem"
          @move="moveItem"
          @select="setAnchor"
        />
        <CalendarAgenda
          v-if="phone"
          :days="[anchor]"
          :placed="placed"
          :today="today"
          show-empty-days
          :can-create="canEdit"
          :brand-tone-of="brandToneOf"
          :brand-name-of="brandNameOf"
          @open="openItem"
          @create="openCreate"
        />
      </template>

      <!-- Semana: grade pela hora no computador, agenda dos 7 dias no celular -->
      <template v-else-if="view === 'semana'">
        <CalendarAgenda
          v-if="phone"
          :days="weekDays(monday)"
          :placed="placed"
          :today="today"
          show-empty-days
          :can-create="canEdit"
          :brand-tone-of="brandToneOf"
          :brand-name-of="brandNameOf"
          @open="openItem"
          @create="openCreate"
        />
        <CalendarWeek
          v-else
          :days="weekDays(monday)"
          :placed="placed"
          :today="today"
          :can-create="canEdit"
          :can-drag="canDrag"
          :brand-tone-of="brandToneOf"
          :brand-name-of="brandNameOf"
          @create="openCreate"
          @open="openItem"
          @move="moveItem"
        />
      </template>

      <!-- Lista -->
      <CalendarAgenda
        v-else
        :days="monthDays"
        :placed="placed"
        :today="today"
        :brand-tone-of="brandToneOf"
        :brand-name-of="brandNameOf"
        :empty-text="canEdit ? 'Nada com data de publicação neste mês. No Mês, clique em um dia para criar.' : 'Nada com data de publicação neste mês.'"
        @open="openItem"
      />
    </template>

    <CalendarQuickCreate
      v-model="createOpen"
      :day="createDay"
      :time="createTime"
      :brands="mk.brands.value"
      :default-brand="mk.brandFilter.value"
      :submit="calendar.createCard"
    />
  </div>
</template>

<style scoped>
.mkcal {
  gap: 10px;
}

.mkcal__nav {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.mkcal__today {
  margin-left: 2px;
}

.mkcal__title {
  margin: 0 0 0 8px;
  font-size: 16px;
  font-weight: 700;
  white-space: nowrap;
}

.mkcal__net {
  min-width: 160px;
}

.mkcal__views {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.mkcal__view {
  min-height: 28px;
  padding: 3px 12px;
  border: 0;
  border-radius: calc(var(--radius-sm) - 2px);
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.mkcal__view.is-active {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.mkcal__view:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.mkcal__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 16px;
  min-height: 20px;
  font-size: 12.5px;
}

.mkcal__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  color: var(--text-2);
}

.mkcal__leg {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 600;
}

.mkcal__leg b {
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.mkcal__undated {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--accent-ink);
  font-weight: 650;
  text-decoration: none;
}

.mkcal__undated:hover {
  text-decoration: underline;
}

.mkcal__ro {
  color: var(--text-3);
}

.mkcal__warn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--warn) 12%, var(--surface));
  color: var(--text);
  font-size: 12.5px;
}

.mkcal__loading :deep(*) {
  min-height: 420px;
}

.mkcal__error {
  display: grid;
  justify-items: start;
  gap: 8px;
  padding: 16px;
}

.mkcal__error p {
  margin: 0;
  font-size: 13px;
}

@media (max-width: 640px) {
  .mkcal__bar {
    gap: 6px;
  }

  .mkcal__nav {
    order: 2;
    width: 100%;
  }

  .mkcal__title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    margin-left: 4px;
    font-size: 15px;
    text-overflow: ellipsis;
  }

  .mkcal__views {
    order: 1;
    flex: 1;
  }

  .mkcal__view {
    flex: 1;
    min-height: 40px;
  }

  .mkcal__new {
    order: 1;
    padding: 6px 12px;
  }

  .mkcal__new span {
    display: none;
  }

  .mkcal__net {
    order: 3;
    width: 100%;
  }

  .mk-toolbar__spacer {
    display: none;
  }

  .mkcal__ro {
    display: none;
  }
}
</style>
