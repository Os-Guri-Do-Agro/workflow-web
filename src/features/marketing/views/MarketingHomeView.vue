<script setup lang="ts">
/**
 * Painel inicial da ala (spec M1-B): o que cada pessoa tem para fazer hoje.
 * Para aprovar (Admin; os outros veem os seus aguardando), Ajustes pedidos
 * para você, Atrasados, Prazo nos próximos 3 dias, Esta semana e Atividade
 * recente. Denso, uma chamada só (`GET /home`), cada linha leva ao card.
 */
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { RefreshCw } from 'lucide-vue-next'
import Skeleton from '@/components/ui/Skeleton.vue'
import { hasSession } from '@/composables/useSession'
import { listCards } from '@/service/marketing/marketing-cards'
import type { CalendarCard } from '@/service/marketing/marketing-calendar-api'
import { useMarketing } from '../composables/useMarketing'
import { CARD_STATUS_TONE, brandTone, cardStatusLabel, statusesFor, toneStyle, type CardStatus } from '../marketing-labels'
import { cardKeys } from '../approvals/approvals-meta'
import { useMarketingHome } from '../home/composables/useMarketingHome'
import HomeActivity from '../home/components/HomeActivity.vue'
import HomeCardList from '../home/components/HomeCardList.vue'
import HomeWeekStrip from '../home/components/HomeWeekStrip.vue'

const mk = useMarketing()
const home = useMarketingHome({ groupId: mk.groupId, brandId: mk.brandFilter })
const data = computed(() => home.data.value)

const multiBrand = computed(() => mk.brands.value.length > 1)
function brandNameOf(companyId: string | null) {
  if (!multiBrand.value) return ''
  return companyId ? (mk.brandById(companyId)?.name ?? '') : ''
}
function brandToneOf(companyId: string | null) {
  return companyId ? brandTone(mk.brandById(companyId)) : 'slate'
}

const brandQuery = computed(() => (mk.brandFilter.value ? { marca: mk.brandFilter.value } : {}))
const approvalsList = (extra: Record<string, string>) => ({
  name: 'marketing-approvals',
  query: { ...brandQuery.value, vista: 'lista', ...extra },
})

/**
 * O `/home` conta por status sem separar a trilha, e a lista de Aprovações é
 * sempre de UMA trilha (a Digital esconde peça impressa). Para cada contagem
 * levar aonde os cards estão, as peças impressas vêm da lista da trilha Gráfica
 * (mesma chave da aba Gráfica de Aprovações, então o cache é um só) e saem da
 * contagem digital. Sem essa lista (carregando ou erro) conta tudo como antes.
 */
const printFilters = computed(() => ({ track: 'print' as const, companyId: mk.brandFilter.value ?? undefined }))
const printCards = useQuery({
  queryKey: computed(() => cardKeys.list(mk.groupId.value ?? '-', printFilters.value)),
  queryFn: () => listCards(mk.groupId.value!, printFilters.value),
  enabled: computed(() => hasSession.value && !!mk.groupId.value),
  staleTime: 15_000,
})

interface CountChip {
  status: CardStatus
  count: number
  label: string
  to: RouteLocationRaw
}

const PRINT_ONLY = new Set<CardStatus>(['SENT_TO_PRINTER', 'PROOF_RECEIVED', 'DELIVERED'])
const ORDER: CardStatus[] = [...statusesFor('POST'), 'SENT_TO_PRINTER', 'PROOF_RECEIVED', 'DELIVERED']
const counts = computed(() => {
  const by = data.value?.countsByStatus ?? {}
  const printList = printCards.data.value
  const printBy: Partial<Record<CardStatus, number>> = {}
  for (const c of printList ?? []) printBy[c.status] = (printBy[c.status] ?? 0) + 1

  const digital: CountChip[] = []
  const print: CountChip[] = []
  const printChip = (status: CardStatus, count: number) =>
    print.push({ status, count, label: cardStatusLabel(status, 'PRINT'), to: approvalsList({ status, trilha: 'grafica' }) })
  for (const status of ORDER) {
    const all = by[status] ?? 0
    if (!all) continue
    if (PRINT_ONLY.has(status)) {
      printChip(status, all)
      continue
    }
    const inPrint = Math.min(all, printBy[status] ?? 0)
    if (all - inPrint > 0) {
      digital.push({ status, count: all - inPrint, label: cardStatusLabel(status), to: approvalsList({ status }) })
    }
    if (inPrint > 0) printChip(status, inPrint)
  }
  return { digital, print }
})
const total = computed(() => [...counts.value.digital, ...counts.value.print].reduce((sum, c) => sum + c.count, 0))

/** "Ver na lista" de uma seção: a trilha dos cards dela (as duas, se misturar). */
function moreLinks(cards: CalendarCard[], extra: Record<string, string>) {
  const hasPrint = cards.some((c) => c.kind === 'PRINT')
  const hasDigital = cards.some((c) => c.kind !== 'PRINT')
  if (hasPrint && hasDigital) {
    return [
      { label: 'Lista digital', to: approvalsList(extra) },
      { label: 'Lista da gráfica', to: approvalsList({ ...extra, trilha: 'grafica' }) },
    ]
  }
  return [{ label: 'Ver na lista', to: approvalsList(hasPrint ? { ...extra, trilha: 'grafica' } : extra) }]
}

const awaitingTitle = computed(() => (data.value?.isAdmin ? 'Para aprovar' : 'Seus cards aguardando aprovação'))
const awaitingEmpty = computed(() =>
  data.value?.isAdmin ? 'Nada para aprovar agora.' : 'Nenhum card seu esperando aprovação.',
)
</script>

<template>
  <div class="mk-page mkh">
    <div v-if="home.isLoading.value" class="mkh__loading">
      <Skeleton type="row" />
      <Skeleton type="block" />
      <Skeleton type="block" />
    </div>

    <div v-else-if="home.isError.value && !data" class="mk-panel mkh__error">
      <p>Não deu para carregar o painel.</p>
      <button type="button" class="mk-btn" @click="home.refetch()">
        <RefreshCw :size="14" aria-hidden="true" />
        Tentar de novo
      </button>
    </div>

    <template v-else-if="data">
      <div class="mkh__counts" aria-label="Cards por status" data-section="contagem">
        <span class="mkh__total">{{ total }} {{ total === 1 ? 'card ativo' : 'cards ativos' }}</span>
        <RouterLink
          v-for="c in counts.digital"
          :key="c.status"
          :to="c.to"
          class="mkh__count"
          :data-status="c.status"
        >
          <span class="mk-dot" :style="toneStyle(CARD_STATUS_TONE[c.status])" aria-hidden="true" />
          {{ c.label }}
          <b>{{ c.count }}</b>
        </RouterLink>
        <template v-if="counts.print.length">
          <span class="mkh__track">Gráfica</span>
          <RouterLink
            v-for="c in counts.print"
            :key="`print-${c.status}`"
            :to="c.to"
            class="mkh__count"
            :data-status="c.status"
            data-track="grafica"
            :aria-label="`Gráfica: ${c.label}, ${c.count}`"
          >
            <span class="mk-dot" :style="toneStyle(CARD_STATUS_TONE[c.status])" aria-hidden="true" />
            {{ c.label }}
            <b>{{ c.count }}</b>
          </RouterLink>
        </template>
      </div>

      <HomeWeekStrip
        :week-start="data.weekStart"
        :today="data.today"
        :cards="data.week"
        :brand-tone-of="brandToneOf"
        :calendar-to="{ name: 'marketing-calendar', query: { ...brandQuery, vista: 'semana' } }"
      />

      <div class="mkh__grid">
        <div class="mkh__col">
          <HomeCardList
            section="para-aprovar"
            :title="awaitingTitle"
            :cards="data.awaitingApproval"
            :empty-text="awaitingEmpty"
            :more="moreLinks(data.awaitingApproval, { status: 'AWAITING_APPROVAL' })"
            :brand-name-of="brandNameOf"
            :brand-tone-of="brandToneOf"
          />
          <HomeCardList
            section="ajustes"
            title="Ajustes pedidos para você"
            :cards="data.changesRequested"
            empty-text="Nenhum ajuste pedido para você."
            :brand-name-of="brandNameOf"
            :brand-tone-of="brandToneOf"
          />
          <HomeCardList
            section="atrasados"
            title="Atrasados"
            tone="late"
            :cards="data.overdue"
            empty-text="Nada atrasado."
            :more="moreLinks(data.overdue, { atrasados: '1' })"
            :brand-name-of="brandNameOf"
            :brand-tone-of="brandToneOf"
          />
          <HomeCardList
            section="prazo-proximo"
            title="Prazo nos próximos 3 dias"
            :cards="data.dueSoon"
            empty-text="Nenhum prazo nos próximos 3 dias."
            :brand-name-of="brandNameOf"
            :brand-tone-of="brandToneOf"
          />
        </div>
        <div class="mkh__col">
          <HomeActivity :items="data.recent" :today="data.today" :now="data.now" />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.mkh {
  gap: 12px;
}

.mkh__loading {
  display: grid;
  gap: 10px;
}

.mkh__error {
  display: grid;
  justify-items: start;
  gap: 8px;
  padding: 14px 16px;
}

.mkh__error p {
  margin: 0;
  font-size: 13px;
}

.mkh__counts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
}

.mkh__total {
  margin-right: 6px;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 700;
}

.mkh__track {
  margin: 0 2px 0 8px;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 700;
}

.mkh__count {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 2px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
}

.mkh__count:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.mkh__count b {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.mkh__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.mkh__col {
  display: grid;
  gap: 12px;
  min-width: 0;
}

@media (max-width: 1100px) {
  .mkh__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .mkh__count {
    min-height: 36px;
  }
}
</style>
