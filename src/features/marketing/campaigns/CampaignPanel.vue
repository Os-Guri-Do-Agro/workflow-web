<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { ArrowLeft, Copy, Link2, Loader2, Pencil, Plus, Trash2, Unlink, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { useToast } from '@/composables/useToast'
import { hasSession } from '@/composables/useSession'
import { getApiErrorMessage } from '@/service/api'
import { getMarketingLog } from '@/service/marketing/marketing-core'
import type { CampaignResults, CampaignResultsInput, CampaignStatus } from '@/service/marketing/marketing-campaigns'
import { useMarketing } from '../composables/useMarketing'
import {
  brandTone,
  CARD_KIND_LABEL,
  CARD_STATUS_TONE,
  cardStatusLabel,
  formatCents,
  toneStyle,
  type CardKind,
  type CardStatus,
} from '../marketing-labels'
import { formatDayMonth, MARKETING_TIME_ZONE, spYmd } from '../calendar/calendar-time'
import {
  CAMPAIGN_ACTION_LABEL,
  CAMPAIGN_STATUS_LABEL,
  CAMPAIGN_STATUS_TONE,
  formatPeriod,
  formatYmd,
  nextCampaignStatuses,
  PACE_LABEL,
  PACE_TONE,
} from './campaign-labels'
import { useCampaignActions, useCampaignDetail, useLinkableCards } from './useCampaigns'

/**
 * Painel lateral da campanha, aberto por `?campanha=<id>`. Abas: Resumo,
 * Artes, UTMs, Resultados e Aprendizados. Os lançamentos do financeiro
 * aparecem só para leitura: quem lança é o Financeiro.
 */
const props = defineProps<{ campaignId: string }>()
const emit = defineEmits<{
  close: []
  edit: []
  deleted: []
}>()

const mk = useMarketing()
const { me } = useCurrentUser()
const { success, error: showError } = useToast()
const groupId = mk.groupId
const idRef = computed(() => props.campaignId)

const detail = useCampaignDetail(groupId, idRef)
const actions = useCampaignActions(groupId)
const c = computed(() => detail.data.value ?? null)

type TabKey = 'summary' | 'cards' | 'utms' | 'results' | 'learnings'
const tab = ref<TabKey>('summary')
watch(idRef, () => {
  tab.value = 'summary'
})

const canEdit = computed(() => mk.can('EDITOR'))
const needsApproval = computed(() => mk.settings.value?.campaignNeedsApproval ?? true)
const brand = computed(() => mk.brandById(c.value?.companyId))
/**
 * Passos para a frente primeiro (o principal em destaque); depois voltar para
 * Rascunho e, por último, cancelar, os dois em tom discreto.
 */
const moves = computed(() => {
  if (!c.value) return []
  const all = nextCampaignStatuses(c.value.status, mk.role.value, needsApproval.value)
  const forward = all.filter((s) => s !== 'DRAFT' && s !== 'CANCELED')
  return [...forward, ...all.filter((s) => s === 'DRAFT'), ...all.filter((s) => s === 'CANCELED')]
})

function actionLabel(to: CampaignStatus) {
  if (to === 'DRAFT' && c.value?.status === 'AWAITING_APPROVAL') {
    return mk.can('ADMIN') ? 'Devolver para Rascunho' : 'Retirar o pedido'
  }
  if (to === 'DRAFT' && c.value?.status === 'CANCELED') return 'Reabrir como Rascunho'
  return CAMPAIGN_ACTION_LABEL[to]
}

const canDelete = computed(() => {
  const camp = c.value
  if (!camp) return false
  if (mk.can('ADMIN')) return true
  if (!mk.can('EDITOR')) return false
  const loose = camp.status === 'DRAFT' || camp.status === 'CANCELED'
  return loose && (!!mk.settings.value?.editorCanDelete || camp.createdBy?.id === me.value?.id)
})

// ── Status ─────────────────────────────────────────────────────────────────
const pendingStatus = ref<CampaignStatus | null>(null)
const askCancel = ref(false)

async function applyStatus(status: CampaignStatus) {
  if (!c.value) return
  pendingStatus.value = status
  try {
    await actions.changeStatus.mutateAsync({ id: c.value.id, status })
    success(`Campanha: ${CAMPAIGN_STATUS_LABEL[status].toLowerCase()}.`)
  } catch (error) {
    showError(getApiErrorMessage(error, 'Não foi possível mudar o status.'))
  } finally {
    pendingStatus.value = null
    askCancel.value = false
  }
}

function onMove(status: CampaignStatus) {
  if (status === 'CANCELED') askCancel.value = true
  else void applyStatus(status)
}

const PRIMARY_MOVES: CampaignStatus[] = ['APPROVED', 'AWAITING_APPROVAL', 'ACTIVE']

function actionTone(status: CampaignStatus, index: number) {
  if (status === 'CANCELED') return 'mk-btn--ghost cp__danger'
  if (status === 'DRAFT') return 'mk-btn--ghost'
  return index === 0 && PRIMARY_MOVES.includes(status) ? 'mk-btn--primary' : ''
}

// ── Remover ────────────────────────────────────────────────────────────────
const askDelete = ref(false)
async function confirmDelete() {
  if (!c.value) return
  try {
    await actions.remove.mutateAsync(c.value.id)
    askDelete.value = false
    success('Campanha apagada.')
    emit('deleted')
  } catch (error) {
    showError(getApiErrorMessage(error, 'Não foi possível apagar a campanha.'))
  }
}

// ── Gasto e ritmo ──────────────────────────────────────────────────────────
const paid = computed(() => c.value?.spentPaidCents ?? 0)
const planned = computed(() => c.value?.spentPlannedCents ?? 0)
const budget = computed(() => c.value?.budgetCents ?? null)
const percent = (value: number) => (budget.value ? Math.min(100, (value / budget.value) * 100) : 0)
const expectedPercent = computed(() => {
  const expected = c.value?.pace?.expectedCents
  return expected !== null && expected !== undefined ? percent(expected) : null
})
const dailyLabel = computed(() => {
  const camp = c.value
  if (!camp) return ''
  if (camp.dailyBudgetCents !== null) return formatCents(camp.dailyBudgetCents)
  const calc = camp.pace?.dailyCents
  return calc !== null && calc !== undefined ? `${formatCents(calc)} (orçamento dividido por ${camp.pace?.totalDays} dias)` : ''
})

// ── Histórico ──────────────────────────────────────────────────────────────
const log = useQuery({
  queryKey: computed(() => ['marketing', groupId.value ?? '-', 'campaigns', 'log', props.campaignId] as const),
  queryFn: () => getMarketingLog(groupId.value!, { entityType: 'campaign', entityId: props.campaignId, take: 30 }),
  enabled: computed(() => hasSession.value && !!groupId.value && tab.value === 'summary'),
  staleTime: 10_000,
})

function when(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: MARKETING_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Artes (cards ligados) ──────────────────────────────────────────────────
const linkOpen = ref(false)
const linkSearch = ref('')
const linkable = useLinkableCards(groupId, idRef, linkSearch, linkOpen)

async function linkCard(cardId: string) {
  try {
    await actions.linkCard.mutateAsync({ id: props.campaignId, cardId })
    success('Card ligado à campanha.')
    linkOpen.value = false
  } catch (error) {
    showError(getApiErrorMessage(error, 'Não foi possível ligar o card.'))
  }
}

async function unlinkCard(cardId: string) {
  try {
    await actions.unlinkCard.mutateAsync({ id: props.campaignId, cardId })
    success('Card desligado da campanha.')
  } catch (error) {
    showError(getApiErrorMessage(error, 'Não foi possível desligar o card.'))
  }
}

// ── UTMs ───────────────────────────────────────────────────────────────────
async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    success(`${what} copiado.`)
  } catch {
    showError('Não foi possível copiar. Selecione e copie à mão.')
  }
}

// ── Resultados ─────────────────────────────────────────────────────────────
const RESULT_FIELDS: Array<{ key: Exclude<keyof CampaignResults, 'notes'>; label: string }> = [
  { key: 'impressions', label: 'Impressões' },
  { key: 'reach', label: 'Alcance' },
  { key: 'clicks', label: 'Cliques' },
  { key: 'leads', label: 'Leads' },
  { key: 'signups', label: 'Cadastros' },
  { key: 'sales', label: 'Vendas' },
]
const resultForm = ref<Record<string, string>>({})
const resultNotes = ref('')
const learnings = ref('')

/**
 * Valor de cada campo "em dia" com o servidor. Campo com valor local diferente
 * disso é edição pendente: a atualização do servidor (tempo real, o gasto que
 * o financeiro lançou, outra aba salva) não apaga o que a pessoa está digitando.
 */
interface FormText {
  results: Record<string, string>
  notes: string
  learnings: string
}
function serverForm(): FormText {
  const r = c.value?.results ?? {}
  return {
    results: Object.fromEntries(
      RESULT_FIELDS.map((f) => [f.key, r[f.key] !== undefined && r[f.key] !== null ? String(r[f.key]) : '']),
    ),
    notes: r.notes ?? '',
    learnings: c.value?.learnings ?? '',
  }
}
let synced: FormText = serverForm()

const trimmed = (s: string) => s.trim()
const plainNumber = (s: string) => s.trim().replace(/\./g, '')

/** Sem alteração local: recebe o novo. Já igual ao novo: em dia. Senão: pendente, fica o local. */
function mergeField(local: string, prev: string, next: string, norm: (s: string) => string) {
  if (local === prev) return { value: next, synced: next }
  if (norm(local) === norm(next)) return { value: local, synced: local }
  return { value: local, synced: next }
}

function loadAll() {
  synced = serverForm()
  resultForm.value = { ...synced.results }
  resultNotes.value = synced.notes
  learnings.value = synced.learnings
}

function loadClean() {
  const next = serverForm()
  const prev = synced
  const results: Record<string, string> = {}
  const resultsSynced: Record<string, string> = {}
  for (const f of RESULT_FIELDS) {
    const m = mergeField(resultForm.value[f.key] ?? '', prev.results[f.key] ?? '', next.results[f.key] ?? '', plainNumber)
    results[f.key] = m.value
    resultsSynced[f.key] = m.synced
  }
  const notes = mergeField(resultNotes.value, prev.notes, next.notes, trimmed)
  const learn = mergeField(learnings.value, prev.learnings, next.learnings, trimmed)
  resultForm.value = results
  resultNotes.value = notes.value
  learnings.value = learn.value
  synced = { results: resultsSynced, notes: notes.synced, learnings: learn.synced }
}

// Troca de campanha: carrega tudo. Mesma campanha atualizada: só o que não está pendente.
watch(
  () => [c.value?.id, c.value?.updatedAt] as const,
  ([id], old) => {
    if (!old || old[0] !== id) loadAll()
    else loadClean()
  },
  { immediate: true },
)

const resultsError = ref('')
async function saveResults() {
  resultsError.value = ''
  const input: Record<string, number | string | null> = {}
  for (const f of RESULT_FIELDS) {
    const text = (resultForm.value[f.key] ?? '').trim().replace(/\./g, '')
    if (!text) {
      input[f.key] = null
      continue
    }
    const n = Number(text)
    if (!Number.isInteger(n) || n < 0) {
      resultsError.value = `${f.label}: use um número inteiro, zero ou maior.`
      return
    }
    input[f.key] = n
  }
  input.notes = resultNotes.value.trim() || null
  try {
    await actions.saveResults.mutateAsync({ id: props.campaignId, input: input as CampaignResultsInput })
    success('Resultados salvos.')
  } catch (error) {
    showError(getApiErrorMessage(error, 'Não foi possível salvar os resultados.'))
  }
}

async function saveLearnings() {
  try {
    await actions.update.mutateAsync({ id: props.campaignId, input: { learnings: learnings.value.trim() || null } })
    success('Aprendizados salvos.')
  } catch (error) {
    showError(getApiErrorMessage(error, 'Não foi possível salvar os aprendizados.'))
  }
}

const unitCosts = computed(() => {
  const camp = c.value
  if (!camp || camp.spentPaidCents === null || camp.spentPaidCents <= 0) return []
  const out: Array<{ label: string; value: string }> = []
  const r = camp.results
  const per = (label: string, n: number | undefined) => {
    if (n && n > 0) out.push({ label, value: formatCents(Math.round(camp.spentPaidCents! / n)) })
  }
  per('Custo por clique', r.clicks)
  per('Custo por lead', r.leads)
  per('Custo por cadastro', r.signups)
  per('Custo por venda', r.sales)
  return out
})

const num = (n: number) => n.toLocaleString('pt-BR')
const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'summary', label: 'Resumo' },
  { key: 'cards', label: 'Artes' },
  { key: 'utms', label: 'UTMs' },
  { key: 'results', label: 'Resultados' },
  { key: 'learnings', label: 'Aprendizados' },
]
const tabCount = (key: TabKey) =>
  key === 'cards' ? c.value?.cardsCount : key === 'utms' ? c.value?.utmsCount : undefined

const notFound = computed(() => {
  const status = (detail.error.value as { response?: { status?: number } } | null)?.response?.status
  return status === 404 || status === 403
})
</script>

<template>
  <aside class="cp" aria-label="Campanha">
    <div v-if="detail.isLoading.value" class="cp__state"><Skeleton type="block" height="120px" /></div>

    <div v-else-if="detail.isError.value" class="cp__state">
      <EmptyState
        :title="notFound ? 'Campanha não encontrada' : 'Não foi possível carregar a campanha'"
        :description="notFound ? 'Ela foi apagada ou você não tem acesso a essa marca.' : 'Verifique a conexão e tente de novo.'"
      >
        <template #action>
          <button type="button" class="mk-btn" @click="notFound ? emit('close') : detail.refetch()">
            {{ notFound ? 'Voltar para a lista' : 'Tentar de novo' }}
          </button>
        </template>
      </EmptyState>
    </div>

    <template v-else-if="c">
      <header class="cp__head">
        <button type="button" class="mk-icon-btn cp__back" aria-label="Voltar para a lista" @click="emit('close')">
          <ArrowLeft :size="18" />
        </button>
        <div class="cp__title">
          <h2>{{ c.name }}</h2>
          <div class="cp__chips">
            <span class="mk-chip" data-tone :style="toneStyle(CAMPAIGN_STATUS_TONE[c.status])" data-testid="campaign-status">
              {{ CAMPAIGN_STATUS_LABEL[c.status] }}
            </span>
            <span v-if="brand" class="mk-chip">
              <span class="mk-dot" :style="toneStyle(brandTone(brand))" aria-hidden="true" />
              {{ brand.name }}
            </span>
          </div>
        </div>
        <button v-if="canEdit" type="button" class="mk-icon-btn" aria-label="Editar campanha" @click="emit('edit')">
          <Pencil :size="16" />
        </button>
        <button v-if="canDelete" type="button" class="mk-icon-btn" aria-label="Apagar campanha" @click="askDelete = true">
          <Trash2 :size="16" />
        </button>
        <button type="button" class="mk-icon-btn cp__x" aria-label="Fechar painel" @click="emit('close')">
          <X :size="16" />
        </button>
      </header>

      <div v-if="moves.length" class="cp__actions">
        <button
          v-for="(m, i) in moves"
          :key="m"
          type="button"
          class="mk-btn"
          :class="actionTone(m, i)"
          :disabled="actions.changeStatus.isPending.value"
          :data-status-action="m"
          @click="onMove(m)"
        >
          <Loader2 v-if="pendingStatus === m" :size="14" class="cp__spin" />
          {{ actionLabel(m) }}
        </button>
      </div>
      <p v-else-if="canEdit && c.status === 'AWAITING_APPROVAL'" class="cp__note">Aguardando um Admin aprovar.</p>

      <div class="cp__tabs" role="tablist" aria-label="Seções da campanha">
        <button
          v-for="t in tabs"
          :key="t.key"
          type="button"
          role="tab"
          class="cp__tab"
          :class="{ 'is-on': tab === t.key }"
          :aria-selected="tab === t.key"
          :data-tab="t.key"
          @click="tab = t.key"
        >
          {{ t.label }}<span v-if="tabCount(t.key)" class="cp__tab-n">{{ tabCount(t.key) }}</span>
        </button>
      </div>

      <div class="cp__body" role="tabpanel">
        <!-- Resumo -->
        <template v-if="tab === 'summary'">
          <dl class="cp__facts">
            <div>
              <dt>Período</dt>
              <dd>{{ formatPeriod(c.startDate, c.endDate) }}<span v-if="c.pace?.totalDays" class="cp__sub"> ({{ c.pace.totalDays }} dias)</span></dd>
            </div>
            <div>
              <dt>Orçamento</dt>
              <dd>{{ c.budgetCents !== null ? formatCents(c.budgetCents) : 'Não definido' }}</dd>
            </div>
            <div v-if="dailyLabel">
              <dt>Valor por dia</dt>
              <dd>{{ dailyLabel }}</dd>
            </div>
            <div v-if="c.channels.length">
              <dt>Canais</dt>
              <dd class="cp__channels"><span v-for="ch in c.channels" :key="ch" class="mk-chip">{{ ch }}</span></dd>
            </div>
            <div v-if="c.objective" class="cp__wide">
              <dt>Objetivo</dt>
              <dd class="cp__text">{{ c.objective }}</dd>
            </div>
            <div v-if="c.audience" class="cp__wide">
              <dt>Público</dt>
              <dd class="cp__text">{{ c.audience }}</dd>
            </div>
            <div>
              <dt>Criada por</dt>
              <dd>
                <span v-if="c.createdBy" class="cp__person">
                  <PersonAvatar :id="c.createdBy.id" :name="c.createdBy.name" :size="18" decorative />{{ c.createdBy.name }}
                </span>
                <span v-else>Não informado</span>
              </dd>
            </div>
            <div v-if="c.approvedBy">
              <dt>Aprovada por</dt>
              <dd>
                <span class="cp__person">
                  <PersonAvatar :id="c.approvedBy.id" :name="c.approvedBy.name" :size="18" decorative />{{ c.approvedBy.name }}
                </span>
                <span v-if="c.approvedAt" class="cp__sub"> em {{ formatYmd(spYmd(c.approvedAt)) }}</span>
              </dd>
            </div>
          </dl>

          <section class="cp__block" aria-label="Gasto">
            <h3>Gasto</h3>
            <template v-if="c.spentPaidCents !== null">
              <div class="cp__spend">
                <div>
                  <span class="cp__big" data-testid="spent-paid">{{ formatCents(paid) }}</span>
                  <span class="cp__sub"> pago</span>
                </div>
                <div>
                  <span class="cp__big cp__big--2" data-testid="spent-planned">{{ formatCents(planned) }}</span>
                  <span class="cp__sub"> previsto</span>
                </div>
              </div>
              <div v-if="budget" class="cp__bar" role="img" :aria-label="`Pago ${percent(paid).toFixed(0)}% e previsto ${percent(planned).toFixed(0)}% do orçamento`">
                <span class="cp__bar-paid" :style="{ width: percent(paid) + '%' }" />
                <span class="cp__bar-planned" :style="{ left: percent(paid) + '%', width: Math.min(percent(planned), 100 - percent(paid)) + '%' }" />
                <span v-if="expectedPercent !== null" class="cp__bar-expected" :style="{ left: expectedPercent + '%' }" title="Esperado até hoje" />
              </div>
              <p v-if="c.pace && c.pace.state !== 'none'" class="cp__pace">
                <span class="mk-chip" data-tone :style="toneStyle(PACE_TONE[c.pace.state])">{{ PACE_LABEL[c.pace.state] }}</span>
                <span v-if="c.pace.expectedCents !== null" class="cp__sub">
                  Esperado até hoje {{ formatCents(c.pace.expectedCents) }} ({{ c.pace.elapsedDays }} de {{ c.pace.totalDays }} dias)
                </span>
              </p>
              <p v-else-if="!budget" class="mk-hint">Defina o orçamento e o período para acompanhar o ritmo.</p>
            </template>
            <p v-else class="mk-hint">O financeiro não está liberado para o seu papel.</p>
          </section>

          <section class="cp__block" aria-label="Resultado rastreado">
            <h3>Rastreado pelas UTMs</h3>
            <div class="cp__spend">
              <div><span class="cp__big" data-testid="clicks">{{ num(c.clicks) }}</span><span class="cp__sub"> cliques</span></div>
              <div><span class="cp__big" data-testid="scans">{{ num(c.scans) }}</span><span class="cp__sub"> leituras de QR</span></div>
            </div>
          </section>

          <section v-if="c.expenses" class="cp__block" aria-label="Lançamentos">
            <h3>Lançamentos do financeiro</h3>
            <p v-if="!c.expenses.length" class="mk-hint">Nenhum lançamento ligado a esta campanha. Quem lança é o Financeiro.</p>
            <table v-else class="mk-table cp__table">
              <thead>
                <tr><th>Data</th><th>Descrição</th><th class="mk-num">Valor</th><th>Situação</th></tr>
              </thead>
              <tbody>
                <tr v-for="e in c.expenses" :key="e.id">
                  <td>{{ formatYmd(e.date) }}</td>
                  <td>{{ e.description }}<span class="cp__sub cp__block-sub">{{ e.category }}</span></td>
                  <td class="mk-num">{{ formatCents(e.amountCents) }}</td>
                  <td>{{ e.status === 'PAID' ? 'Pago' : 'Previsto' }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section class="cp__block" aria-label="Histórico">
            <h3>Histórico</h3>
            <p v-if="log.isLoading.value" class="mk-hint">Carregando...</p>
            <p v-else-if="!log.data.value?.length" class="mk-hint">Nada registrado ainda.</p>
            <ul v-else class="cp__log">
              <li v-for="entry in log.data.value" :key="entry.id">
                <span class="cp__sub">{{ when(entry.createdAt) }}</span>
                <span><strong>{{ entry.actor?.name ?? 'Alguém' }}</strong> {{ entry.summary }}</span>
              </li>
            </ul>
          </section>
        </template>

        <!-- Artes -->
        <template v-else-if="tab === 'cards'">
          <div class="cp__bar-row">
            <p class="mk-hint">Posts, vídeos e peças desta marca que fazem parte da campanha.</p>
            <button v-if="canEdit" type="button" class="mk-btn" data-action="link-card" @click="linkOpen = true">
              <Plus :size="14" />Ligar card
            </button>
          </div>
          <EmptyState v-if="!c.cards.length" title="Nenhum card ligado" description="Ligue os posts e peças que entram nesta campanha." />
          <ul v-else class="cp__list">
            <li v-for="card in c.cards" :key="card.id" class="cp__item" data-card-row>
              <div class="cp__item-main">
                <RouterLink :to="`/marketing/cards/${card.id}`" class="cp__item-title">{{ card.title }}</RouterLink>
                <div class="cp__item-meta">
                  <span class="mk-chip" data-tone :style="toneStyle(CARD_STATUS_TONE[card.status as CardStatus])">
                    {{ cardStatusLabel(card.status as CardStatus, card.kind) }}
                  </span>
                  <span>{{ CARD_KIND_LABEL[card.kind as CardKind] ?? card.kind }}</span>
                  <span v-if="card.publishAt">publica em {{ formatDayMonth(spYmd(card.publishAt)) }}</span>
                  <span v-if="card.assignee" class="cp__person">
                    <PersonAvatar :id="card.assignee.id" :name="card.assignee.name" :size="16" decorative />{{ card.assignee.name.split(' ')[0] }}
                  </span>
                </div>
              </div>
              <button v-if="canEdit" type="button" class="mk-icon-btn" :aria-label="`Desligar ${card.title} da campanha`" @click="unlinkCard(card.id)">
                <Unlink :size="15" />
              </button>
            </li>
          </ul>
        </template>

        <!-- UTMs -->
        <template v-else-if="tab === 'utms'">
          <div class="cp__bar-row">
            <p class="mk-hint">Links curtos e QR Codes ligados a esta campanha.</p>
            <RouterLink class="mk-btn" :to="{ name: 'marketing-utm', query: { campanha: c.id } }">
              <Link2 :size="14" />Abrir UTMs e QR
            </RouterLink>
          </div>
          <EmptyState v-if="!c.utms.length" title="Nenhuma UTM ligada" description="Crie a UTM em UTMs e QR e escolha esta campanha." />
          <ul v-else class="cp__list">
            <li v-for="u in c.utms" :key="u.id" class="cp__item" data-utm-row>
              <div class="cp__item-main">
                <span class="cp__item-title">{{ u.placement || 'Sem local definido' }}</span>
                <div class="cp__item-meta">
                  <span v-if="u.shortLink">{{ u.shortLink.utmSource }} / {{ u.shortLink.utmMedium }}</span>
                  <span v-if="u.shortLink">{{ num(u.shortLink.clickCount) }} cliques</span>
                  <span v-if="u.qr">{{ num(u.qr.scanCount) }} leituras</span>
                  <span v-if="u.shortLink && !u.shortLink.active" class="mk-chip">Desativada</span>
                </div>
                <span v-if="u.shortLink" class="cp__url">{{ u.shortLink.shortUrl }}</span>
              </div>
              <button v-if="u.shortLink" type="button" class="mk-icon-btn" aria-label="Copiar link curto" @click="copy(u.shortLink.shortUrl, 'Link')">
                <Copy :size="15" />
              </button>
            </li>
          </ul>
        </template>

        <!-- Resultados -->
        <template v-else-if="tab === 'results'">
          <p class="mk-hint">Números lançados à mão com o que as plataformas mostram. Cliques e leituras das UTMs já aparecem no Resumo.</p>
          <form class="cp__form" novalidate @submit.prevent="saveResults">
            <div class="cp__grid">
              <label v-for="f in RESULT_FIELDS" :key="f.key" class="mk-field">
                <span class="mk-label">{{ f.label }}</span>
                <input
                  v-model="resultForm[f.key]"
                  class="mk-input"
                  inputmode="numeric"
                  autocomplete="off"
                  :disabled="!canEdit"
                  :data-result="f.key"
                  @input="resultsError = ''"
                />
              </label>
            </div>
            <label class="mk-field">
              <span class="mk-label">Observações</span>
              <textarea v-model="resultNotes" class="mk-textarea" rows="3" maxlength="5000" :disabled="!canEdit" placeholder="Como foi, o que chamou atenção" />
            </label>
            <p v-if="resultsError" class="mk-error" role="alert">{{ resultsError }}</p>
            <div v-if="unitCosts.length" class="cp__unit">
              <span v-for="u in unitCosts" :key="u.label"><strong>{{ u.value }}</strong> {{ u.label.toLowerCase() }}</span>
            </div>
            <div v-if="canEdit" class="cp__form-foot">
              <button type="submit" class="mk-btn mk-btn--primary" :disabled="actions.saveResults.isPending.value">
                <Loader2 v-if="actions.saveResults.isPending.value" :size="14" class="cp__spin" />
                Salvar resultados
              </button>
            </div>
          </form>
        </template>

        <!-- Aprendizados -->
        <template v-else>
          <p class="mk-hint">O que a equipe aprendeu: o que funcionou, o que não e o que repetir na próxima.</p>
          <form class="cp__form" novalidate @submit.prevent="saveLearnings">
            <label class="mk-field">
              <span class="mk-label">Aprendizados</span>
              <textarea v-model="learnings" class="mk-textarea cp__learn" rows="9" maxlength="10000" :disabled="!canEdit" data-field="learnings" />
            </label>
            <div v-if="canEdit" class="cp__form-foot">
              <button type="submit" class="mk-btn mk-btn--primary" :disabled="actions.update.isPending.value">
                <Loader2 v-if="actions.update.isPending.value" :size="14" class="cp__spin" />
                Salvar aprendizados
              </button>
            </div>
          </form>
        </template>
      </div>

      <AppDialog v-model="linkOpen" label="Ligar card à campanha" size="md">
        <div class="cp__dlg">
          <header class="cp__dlg-head">
            <h2>Ligar card</h2>
            <button type="button" class="mk-icon-btn" aria-label="Fechar" @click="linkOpen = false"><X :size="16" /></button>
          </header>
          <div class="cp__dlg-body">
            <input v-model="linkSearch" class="mk-input" type="search" placeholder="Buscar pelo título" aria-label="Buscar card" autofocus />
            <p v-if="linkable.isLoading.value" class="mk-hint">Carregando...</p>
            <p v-else-if="!linkable.data.value?.length" class="mk-hint">
              Nenhum card disponível nesta marca{{ linkSearch ? ' com essa busca' : '' }}.
            </p>
            <ul v-else class="cp__list">
              <li v-for="card in linkable.data.value" :key="card.id" class="cp__item">
                <div class="cp__item-main">
                  <span class="cp__item-title">{{ card.title }}</span>
                  <div class="cp__item-meta">
                    <span>{{ CARD_KIND_LABEL[card.kind as CardKind] ?? card.kind }}</span>
                    <span>{{ cardStatusLabel(card.status as CardStatus, card.kind) }}</span>
                    <span v-if="card.campaignId">já está em outra campanha</span>
                  </div>
                </div>
                <button type="button" class="mk-btn" :disabled="actions.linkCard.isPending.value" :data-link-card="card.id" @click="linkCard(card.id)">
                  Ligar
                </button>
              </li>
            </ul>
          </div>
        </div>
      </AppDialog>

      <ConfirmDialog
        v-model="askCancel"
        title="Cancelar esta campanha?"
        message="A campanha sai do calendário e deixa de contar. Um Admin pode reabrir como Rascunho depois."
        confirm-label="Cancelar campanha"
        cancel-label="Voltar"
        danger
        :loading="actions.changeStatus.isPending.value"
        @confirm="applyStatus('CANCELED')"
      />
      <ConfirmDialog
        v-model="askDelete"
        title="Apagar esta campanha?"
        :message="`&quot;${c.name}&quot; será apagada. Os cards, as UTMs e os lançamentos continuam existindo, só perdem o vínculo.`"
        confirm-label="Apagar"
        danger
        :loading="actions.remove.isPending.value"
        @confirm="confirmDelete"
      />
    </template>
  </aside>
</template>

<style scoped>
.cp {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--surface);
}

.cp__state {
  padding: 16px;
}

.cp__head,
.cp__actions,
.cp__note,
.cp__tabs {
  flex-shrink: 0;
}

.cp__head {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 12px 12px 8px 14px;
}

.cp__back {
  display: none;
}

.cp__title {
  flex: 1;
  min-width: 0;
}

.cp__title h2 {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.cp__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.cp__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 14px 10px;
}

.cp__note {
  margin: 0;
  padding: 0 14px 10px;
  color: var(--text-3);
  font-size: 12.5px;
}

.cp__tabs {
  display: flex;
  gap: 2px;
  padding: 0 10px;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  scrollbar-width: none;
}

.cp__tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 8px 8px;
  margin-bottom: -1px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.cp__tab:hover {
  color: var(--text);
}

.cp__tab.is-on {
  border-bottom-color: var(--accent);
  color: var(--accent-ink);
}

.cp__tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.cp__tab-n {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--text-2);
  font-size: 11.5px;
  line-height: 18px;
  text-align: center;
}

.cp__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  padding: 14px;
  overflow-y: auto;
}

.cp__facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 14px;
  margin: 0;
}

.cp__facts dt {
  margin-bottom: 2px;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
}

.cp__facts dd {
  margin: 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.cp__wide {
  grid-column: 1 / -1;
}

.cp__text {
  white-space: pre-wrap;
}

.cp__channels {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.cp__person {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.cp__sub {
  color: var(--text-3);
  font-size: 12px;
}

.cp__block-sub {
  display: block;
}

.cp__danger {
  color: var(--err);
}

.cp__block {
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.cp__block h3 {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
}

.cp__spend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 24px;
}

.cp__big {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.cp__big--2 {
  color: var(--text-2);
}

.cp__bar {
  position: relative;
  height: 8px;
  margin: 10px 0 8px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: visible;
}

.cp__bar-paid,
.cp__bar-planned {
  position: absolute;
  top: 0;
  bottom: 0;
}

.cp__bar-paid {
  left: 0;
  border-radius: 999px 0 0 999px;
  background: var(--accent);
}

.cp__bar-planned {
  background: color-mix(in srgb, var(--accent) 35%, transparent);
}

.cp__bar-expected {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  margin-left: -1px;
  background: var(--text);
}

.cp__pace {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin: 0;
}

.cp__table th,
.cp__table td {
  padding: 6px 6px;
  font-size: 12.5px;
}

.cp__log {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12.5px;
}

.cp__log li {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.cp__bar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.cp__bar-row .mk-hint {
  flex: 1;
  min-width: 160px;
  margin: 0;
}

.cp__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.cp__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.cp__item-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.cp__item-title {
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  overflow-wrap: anywhere;
}

a.cp__item-title:hover {
  text-decoration: underline;
}

.cp__item-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 10px;
  color: var(--text-3);
  font-size: 12px;
}

.cp__url {
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 11.5px;
  overflow-wrap: anywhere;
}

.cp__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cp__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.cp__unit {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 18px;
  color: var(--text-2);
  font-size: 12.5px;
}

.cp__form-foot {
  display: flex;
  justify-content: flex-end;
}

.cp__learn {
  min-height: 180px;
}

.cp__dlg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 8px;
}

.cp__dlg-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.cp__dlg-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 60vh;
  padding: 4px 16px 16px;
  overflow-y: auto;
}

.cp__spin {
  animation: cp-spin 0.8s linear infinite;
}

@keyframes cp-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1099px) {
  .cp__back {
    display: inline-flex;
  }

  .cp__x {
    display: none;
  }
}

@media (max-width: 640px) {
  .cp__facts,
  .cp__grid {
    grid-template-columns: 1fr;
  }

  .cp__tab {
    min-height: 44px;
  }

  .cp__actions .mk-btn {
    flex: 1 1 auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cp__spin {
    animation: none;
  }
}
</style>
