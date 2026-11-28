<script setup lang="ts">
/**
 * Painel "Publicação" do card (R2, A3 a A8).
 *
 * - Card Aprovado com data: "Agendar publicação" (diálogo com uma linha por rede).
 * - Uma linha por rede agendada: status, conta, hora, motivo da falha com
 *   "Tentar de novo", e os números do post quando sai.
 * - À mão (WAITING_MANUAL) e rascunho do TikTok (DRAFT_SENT): "Baixar arte",
 *   "Copiar legenda", "Abrir <rede>" e "Marquei como publicado" (com o link).
 * - "Desagendar" volta o card para Aprovado (o servidor cancela e avisa).
 * - Visualizador vê só o status de cada rede.
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import axios from 'axios'
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CalendarX,
  CheckCheck,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCw,
  Send,
  X,
} from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import { getAssetDownload } from '@/service/marketing/marketing-core'
import { moveCard } from '@/service/marketing/marketing-cards'
import {
  cancelPublication,
  getCardPublications,
  markPublicationPublished,
  refreshCardMetrics,
  retryPublication,
  type CardPublication,
  type CardPublications,
} from '@/service/marketing/marketing-social'
import { CARD_NETWORK_LABEL, toneStyle, type CardNetwork } from '../marketing-labels'
import { cardKeys, formatDayTime } from '../approvals/approvals-meta'
import { ACCOUNT_STATUS_LABEL, METRIC_LABELS, MODE_SHORT, PLACEMENT_LABEL, PUBLICATION_STATUS_TONE, fmtNum, safeHref, socialKeys } from './social-meta'
import { networkIcon } from './network-icons'
import PublishScheduleDialog from './PublishScheduleDialog.vue'

const props = defineProps<{
  groupId: string
  cardId: string
  /** Muda a lista quando o card muda (status, data, versão). */
  cardUpdatedAt: string
  cardKind: string
}>()

const toast = useToast()
const queryClient = useQueryClient()
const route = useRoute()
const router = useRouter()
const key = computed(() => socialKeys.card(props.groupId, props.cardId))
const query = useQuery({
  queryKey: key,
  queryFn: () => getCardPublications(props.groupId, props.cardId),
  enabled: computed(() => !!props.groupId && !!props.cardId && props.cardKind !== 'PRINT'),
  retry: (count, err) => !(axios.isAxiosError(err) && [403, 404, 503].includes(err.response?.status ?? 0)) && count < 2,
})
watch(
  () => props.cardUpdatedAt,
  (next, prev) => {
    if (prev && next !== prev) void queryClient.invalidateQueries({ queryKey: key.value })
  },
)

/** Sem a migration da R2 (503) ou sem acesso: a seção some. */
const hidden = computed(() => {
  if (props.cardKind === 'PRINT') return true
  const err = query.error.value
  return axios.isAxiosError(err) && [403, 404, 503].includes(err.response?.status ?? 0)
})
const data = computed(() => query.data.value ?? null)
const pubs = computed(() => data.value?.publications ?? [])
const live = computed(() => pubs.value.filter((p) => p.status !== 'CANCELED'))
const canceled = computed(() => pubs.value.filter((p) => p.status === 'CANCELED'))
const showCanceled = ref(false)

function apply(next: CardPublications) {
  queryClient.setQueryData(key.value, next)
  void queryClient.invalidateQueries({ queryKey: cardKeys.detail(props.groupId, props.cardId) })
  void queryClient.invalidateQueries({ queryKey: ['marketing', props.groupId, 'cards', 'list'] })
  void queryClient.invalidateQueries({ queryKey: cardKeys.history(props.groupId, props.cardId) })
}

function netLabel(network: string) {
  return CARD_NETWORK_LABEL[network as CardNetwork] ?? network
}

/** O Visualizador não recebe o plano: o rótulo vem pronto da API (nunca "CAROUSEL"). */
function placementLabel(p: CardPublication) {
  if (p.placementLabel) return p.placementLabel
  const row = data.value?.plan?.find((r) => r.network === p.network)
  return row?.placements.find((x) => x.value === p.placement)?.label ?? (p.placement ? (PLACEMENT_LABEL[p.placement] ?? '') : '')
}

// ── Agendar e desagendar ────────────────────────────────────────────────────
const scheduleOpen = ref(false)
// Soltar o card em Agendado no board abre este diálogo (`?agendar=1`): agendar é
// por aqui, onde a pessoa escolhe como sai em cada rede (auditoria da parte A, achado 7).
watch(
  () => [route.query.agendar, data.value?.canSchedule] as const,
  ([want, can]) => {
    if (want !== '1' || can === undefined) return
    if (can) scheduleOpen.value = true
    else if (data.value?.scheduleBlock) toast.warning(data.value.scheduleBlock)
    const q = { ...route.query }
    delete q.agendar
    void router.replace({ query: q })
  },
  { immediate: true },
)
function onScheduled(result: CardPublications) {
  apply(result)
  toast.success('Publicação agendada. O card foi para Agendado.')
}

const unscheduleOpen = ref(false)
const unscheduling = ref(false)
async function unschedule() {
  unscheduling.value = true
  try {
    await moveCard(props.groupId, props.cardId, 'APPROVED')
    unscheduleOpen.value = false
    toast.success('Desagendado. O card voltou para Aprovado, e o que ainda não tinha saído nas redes foi cancelado.')
    await queryClient.invalidateQueries({ queryKey: ['marketing', props.groupId] })
  } catch (err) {
    toast.error(getApiErrorMessage(err, 'Não deu para desagendar.'))
  } finally {
    unscheduling.value = false
  }
}

// ── Ações por rede ──────────────────────────────────────────────────────────
const busy = ref<string | null>(null)
async function run(id: string, fn: () => Promise<CardPublications>, ok: string, fallback: string) {
  // Os botões ficam travados enquanto uma ação roda; se mesmo assim chegar aqui, avisa.
  if (busy.value) {
    toast.info('Espere a ação anterior terminar.')
    return
  }
  busy.value = id
  try {
    apply(await fn())
    toast.success(ok)
  } catch (err) {
    toast.error(getApiErrorMessage(err, fallback))
    void query.refetch()
  } finally {
    busy.value = null
  }
}

function retryNow(p: CardPublication) {
  void run(p.id, () => retryPublication(props.groupId, props.cardId, p.id), `${netLabel(p.network)}: vai tentar de novo agora.`, 'Não deu para tentar de novo.')
}

/**
 * A rede não confirmou o envio anterior: o post pode ter saído. Antes de
 * publicar de novo, a pessoa confere na rede (revisão B da parte A).
 */
const retryTarget = ref<CardPublication | null>(null)
function retry(p: CardPublication) {
  if (p.ambiguous) retryTarget.value = p
  else retryNow(p)
}
function confirmRetry() {
  const p = retryTarget.value
  if (!p) return
  retryTarget.value = null
  retryNow(p)
}

const cancelTarget = ref<CardPublication | null>(null)
function confirmCancel() {
  const p = cancelTarget.value
  if (!p) return
  cancelTarget.value = null
  void run(p.id, () => cancelPublication(props.groupId, props.cardId, p.id), `${netLabel(p.network)} saiu desta publicação.`, 'Não deu para tirar a rede.')
}

const markTarget = ref<CardPublication | null>(null)
const markUrl = ref('')
const markError = ref('')
function openMark(p: CardPublication) {
  markTarget.value = p
  markUrl.value = ''
  markError.value = ''
}
async function confirmMark() {
  const p = markTarget.value
  if (!p) return
  const url = markUrl.value.trim()
  if (url && !/^https?:\/\//i.test(url)) {
    markError.value = 'Use um endereço que começa com http ou https.'
    return
  }
  busy.value = p.id
  try {
    apply(await markPublicationPublished(props.groupId, props.cardId, p.id, url || null))
    markTarget.value = null
    toast.success(`${netLabel(p.network)}: marcado como publicado.`)
  } catch (err) {
    markError.value = getApiErrorMessage(err, 'Não deu para marcar.')
  } finally {
    busy.value = null
  }
}

async function copyCaption(p: CardPublication) {
  try {
    await navigator.clipboard.writeText(p.caption ?? '')
    toast.success('Legenda copiada.')
  } catch {
    toast.error('Não deu para copiar. Selecione o texto no card e copie à mão.')
  }
}

const downloading = ref(false)
async function downloadArt() {
  const assets = data.value?.approvedAssets ?? []
  if (!assets.length) {
    toast.error('A versão aprovada não tem arquivo (é um post só de texto).')
    return
  }
  downloading.value = true
  try {
    for (const a of assets) {
      const d = await getAssetDownload(props.groupId, a.id)
      const link = document.createElement('a')
      link.href = d.url
      link.download = d.name
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      link.remove()
      if (assets.length > 1) await new Promise((r) => setTimeout(r, 450))
    }
  } catch (err) {
    toast.error(getApiErrorMessage(err, 'Não deu para baixar a arte.'))
  } finally {
    downloading.value = false
  }
}

const refreshing = ref(false)
async function refreshNumbers() {
  refreshing.value = true
  try {
    const res = await refreshCardMetrics(props.groupId, props.cardId)
    queryClient.setQueryData(key.value, res.publication)
    // Falha da rede não é "nada novo": mostra o erro (auditoria da parte A).
    if (res.failed && !res.updated) {
      toast.error('Não deu para atualizar: a rede não respondeu ou a conta precisa ser reconectada (Configurações, aba Redes).')
    } else if (res.failed) {
      toast.warning(`${res.updated} post(s) atualizado(s); ${res.failed} não respondeu(ram). Tente de novo mais tarde.`)
    } else {
      toast.success(res.updated ? 'Números atualizados.' : 'Nenhum número novo das redes ainda.')
    }
  } catch (err) {
    toast.error(getApiErrorMessage(err, 'Não deu para atualizar os números.'))
  } finally {
    refreshing.value = false
  }
}

const isManualPending = (p: CardPublication) => p.status === 'WAITING_MANUAL' || p.status === 'DRAFT_SENT' || (p.status === 'SCHEDULED' && p.mode !== 'AUTO')
const hasAutoPublished = computed(() => pubs.value.some((p) => p.status === 'PUBLISHED' && p.mode === 'AUTO'))
const lastFetch = computed(() => {
  const dates = pubs.value.map((p) => p.metrics?.fetchedAt).filter((d): d is string => !!d).sort()
  return dates[dates.length - 1] ?? null
})
const canUnschedule = computed(() => !!data.value?.canManage && data.value.card.status === 'SCHEDULED')
/** Saindo agora: Desagendar espera (a API recusa com 409, e o post sai de qualquer jeito). */
const publishingNow = computed(() => !!data.value?.publishing || pubs.value.some((p) => p.status === 'PUBLISHING'))
const alreadyOut = computed(() => pubs.value.some((p) => p.status === 'PUBLISHED'))
/** Já tem agendamento pendente: o botão edita em vez de criar. */
const editing = computed(() => data.value?.card.status === 'SCHEDULED' && live.value.some((p) => p.status !== 'PUBLISHED'))

function metricsOf(p: CardPublication) {
  const m = p.metrics
  if (!m) return []
  return METRIC_LABELS.filter((x) => typeof m[x.key] === 'number').map((x) => ({ label: x.label, value: fmtNum(m[x.key]) }))
}
</script>

<template>
  <section v-if="!hidden" class="mk-panel mcp" aria-labelledby="mcp-title" data-testid="card-publish">
    <header class="mk-panel__head mcp__head">
      <Send :size="15" aria-hidden="true" />
      <h2 id="mcp-title" class="mcp__title">Publicação</h2>
      <span class="mk-toolbar__spacer" />
      <button
        v-if="canUnschedule"
        type="button"
        class="mk-btn mk-btn--ghost mcp__cta"
        :disabled="publishingNow"
        :title="publishingNow ? 'Uma rede está publicando agora: espere terminar para desagendar.' : undefined"
        data-action="unschedule"
        @click="unscheduleOpen = true"
      >
        <CalendarX :size="14" aria-hidden="true" /> Desagendar
      </button>
      <button
        v-if="data?.canSchedule"
        type="button"
        class="mk-btn mcp__cta"
        :class="{ 'mk-btn--primary': !editing }"
        :title="editing ? 'Editar agendamento' : undefined"
        :aria-label="editing ? 'Editar agendamento' : undefined"
        data-action="open-schedule"
        @click="scheduleOpen = true"
      >
        <CalendarClock :size="14" aria-hidden="true" /> {{ editing ? 'Editar' : 'Agendar publicação' }}
      </button>
    </header>

    <div v-if="query.isLoading.value" class="mcp__body"><Skeleton type="row" /></div>
    <div v-else-if="query.isError.value" class="mcp__body">
      <div class="mk-load-error" role="alert">
        <p>{{ getApiErrorMessage(query.error.value, 'Não deu para carregar a publicação.') }}</p>
        <button type="button" class="mk-btn" @click="query.refetch()">Tentar de novo</button>
      </div>
    </div>

    <template v-else-if="data">
      <p v-if="canUnschedule && publishingNow" class="mcp__note" data-testid="publishing-now">
        Saindo agora em uma rede. Desagendar, mandar para a lixeira e subir versão nova esperam o envio terminar.
      </p>
      <p v-if="!live.length" class="mcp__empty" data-testid="publish-empty">
        <template v-if="data.canSchedule">Nada agendado. Escolha como o post sai em cada rede: sozinho, como rascunho no app ou com lembrete à mão.</template>
        <template v-else-if="data.scheduleBlock && data.canManage">{{ data.scheduleBlock }}</template>
        <template v-else>Nada agendado para as redes.</template>
      </p>

      <ul v-else class="mcp__list" role="list">
        <li
          v-for="p in live"
          :key="p.id"
          class="mcp__item"
          :data-network="p.network"
          :data-status="p.status"
          data-testid="publication-row"
        >
          <component :is="networkIcon(p.network)" :size="16" class="mcp__icon" aria-hidden="true" />
          <div class="mcp__main">
            <div class="mcp__line">
              <strong class="mcp__net">{{ netLabel(p.network) }}</strong>
              <span v-if="p.mode !== 'MANUAL' && p.placement" class="mcp__muted">{{ placementLabel(p) }}</span>
              <span class="mcp__muted">{{ MODE_SHORT[p.mode] }}</span>
              <span class="mk-chip" data-tone :style="toneStyle(PUBLICATION_STATUS_TONE[p.status])" data-testid="publication-status">
                <Loader2 v-if="p.status === 'PUBLISHING'" :size="12" class="mcp__spin" aria-hidden="true" />
                {{ p.statusLabel }}
              </span>
            </div>
            <div class="mcp__meta">
              <span v-if="p.status === 'PUBLISHED' && p.publishedAt">Saiu em {{ formatDayTime(p.publishedAt) }}</span>
              <span v-else>Para {{ formatDayTime(p.scheduledAt) }}</span>
              <span v-if="p.account">{{ p.account.username ? `@${p.account.username.replace(/^@/, '')}` : p.account.name }}</span>
              <span v-if="p.account && p.account.status !== 'ACTIVE'" class="mk-late" data-testid="publication-account-status">
                Conta: {{ ACCOUNT_STATUS_LABEL[p.account.status] ?? p.account.status }}
              </span>
              <span v-if="p.attempts > 1 && p.status !== 'PUBLISHED'">{{ p.attempts }} tentativas</span>
            </div>
            <p v-if="p.status === 'WAITING_MANUAL'" class="mcp__note">Chegou a hora: publique à mão e marque como publicado.</p>
            <p v-if="p.status === 'DRAFT_SENT'" class="mcp__note">O vídeo está na caixa de entrada do {{ netLabel(p.network) }}. Abra o app para publicar.</p>
            <p v-if="p.lastError" class="mcp__fail" :class="{ 'is-retry': p.status === 'SCHEDULED' }" role="alert" data-testid="publication-error">
              <AlertTriangle :size="13" aria-hidden="true" /> <span>{{ p.lastError }}</span>
            </p>
            <p v-if="p.retryHint" class="mcp__note" data-testid="publication-retry-hint">{{ p.retryHint }}</p>
            <dl v-if="metricsOf(p).length" class="mcp__metrics" data-testid="publication-metrics">
              <div v-for="m in metricsOf(p)" :key="m.label">
                <dt>{{ m.label }}</dt>
                <dd>{{ m.value }}</dd>
              </div>
            </dl>
            <div v-if="data.canManage || p.permalink" class="mcp__actions">
              <a v-if="safeHref(p.permalink)" :href="safeHref(p.permalink)!" target="_blank" rel="noopener noreferrer" class="mk-btn mk-btn--ghost mcp__act" data-action="open-post">
                <ExternalLink :size="13" aria-hidden="true" /> Ver post
              </a>
              <button v-if="p.can.retry" type="button" class="mk-btn mcp__act" :disabled="!!busy" data-action="retry-publication" @click="retry(p)">
                <Loader2 v-if="busy === p.id" :size="13" class="mcp__spin" aria-hidden="true" />
                <RotateCw v-else :size="13" aria-hidden="true" />
                Tentar de novo
              </button>
              <button v-if="p.can.markPublished" type="button" class="mk-btn mcp__act" :disabled="!!busy" data-action="mark-published" @click="openMark(p)">
                <CheckCheck :size="13" aria-hidden="true" /> Marquei como publicado
              </button>
              <template v-if="data.canManage && (isManualPending(p) || p.status === 'FAILED')">
                <button type="button" class="mk-btn mk-btn--ghost mcp__act" :disabled="downloading" data-action="download-art" @click="downloadArt">
                  <Download :size="13" aria-hidden="true" /> Baixar arte
                </button>
                <button v-if="p.caption" type="button" class="mk-btn mk-btn--ghost mcp__act" data-action="copy-caption" @click="copyCaption(p)">
                  <Copy :size="13" aria-hidden="true" /> Copiar legenda
                </button>
                <a v-if="p.openUrl" :href="p.openUrl" target="_blank" rel="noopener noreferrer" class="mk-btn mk-btn--ghost mcp__act" data-action="open-network">
                  <ExternalLink :size="13" aria-hidden="true" /> Abrir {{ netLabel(p.network) }}
                </a>
              </template>
              <button v-if="p.can.cancel" type="button" class="mk-btn mk-btn--ghost mcp__act mcp__danger" :disabled="!!busy" data-action="cancel-publication" @click="cancelTarget = p">
                <X :size="13" aria-hidden="true" /> Não publicar aqui
              </button>
            </div>
          </div>
        </li>
      </ul>

      <div v-if="hasAutoPublished || canceled.length" class="mcp__foot">
        <button v-if="hasAutoPublished && data.canManage" type="button" class="mk-btn mk-btn--ghost mcp__act" :disabled="refreshing" data-action="refresh-metrics" @click="refreshNumbers">
          <Loader2 v-if="refreshing" :size="13" class="mcp__spin" aria-hidden="true" />
          <RefreshCw v-else :size="13" aria-hidden="true" />
          Atualizar números
        </button>
        <span v-if="hasAutoPublished" class="mcp__muted">
          <BarChart3 :size="12" aria-hidden="true" />
          {{ lastFetch ? `Números de ${formatDayTime(lastFetch)}` : data.canManage ? 'Os números chegam no dia seguinte (ou em Atualizar números).' : 'Os números chegam no dia seguinte.' }}
        </span>
        <button v-if="canceled.length" type="button" class="mk-btn mk-btn--ghost mcp__act" :aria-expanded="showCanceled" @click="showCanceled = !showCanceled">
          {{ showCanceled ? 'Esconder' : 'Ver' }} {{ canceled.length }} cancelada{{ canceled.length > 1 ? 's' : '' }}
        </button>
      </div>
      <ul v-if="showCanceled" class="mcp__list mcp__list--muted" role="list">
        <li v-for="p in canceled" :key="p.id" class="mcp__item" :data-network="p.network" data-status="CANCELED">
          <component :is="networkIcon(p.network)" :size="16" class="mcp__icon" aria-hidden="true" />
          <div class="mcp__main">
            <div class="mcp__line">
              <strong class="mcp__net">{{ netLabel(p.network) }}</strong>
              <span class="mk-chip">Cancelada</span>
            </div>
            <p v-if="p.lastError" class="mcp__muted mcp__reason">{{ p.lastError }}</p>
          </div>
        </li>
      </ul>
    </template>

    <PublishScheduleDialog
      v-if="data?.plan && data.canSchedule"
      v-model="scheduleOpen"
      :group-id="groupId"
      :card-id="cardId"
      :publish-at="data.card.publishAt"
      :plan="data.plan"
      @done="onScheduled"
    />
    <ConfirmDialog
      v-model="unscheduleOpen"
      title="Desagendar a publicação?"
      :message="alreadyOut ? 'O card volta para Aprovado e o que ainda não saiu é cancelado. O que já saiu nas redes continua no ar. Quem é responsável e quem agendou recebem o aviso.' : 'O card volta para Aprovado e nada do que estava agendado sai nas redes. Quem é responsável e quem agendou recebem o aviso.'"
      confirm-label="Desagendar"
      :loading="unscheduling"
      @confirm="unschedule"
    />
    <ConfirmDialog
      :model-value="!!cancelTarget"
      title="Não publicar nesta rede?"
      :message="`O post não sai no ${cancelTarget ? netLabel(cancelTarget.network) : ''}. As outras redes do card seguem como estão.`"
      confirm-label="Não publicar aqui"
      danger
      @update:model-value="(v) => { if (!v) cancelTarget = null }"
      @confirm="confirmCancel"
    />
    <ConfirmDialog
      :model-value="!!retryTarget"
      title="Confira na rede antes"
      :message="`O ${retryTarget ? netLabel(retryTarget.network) : ''} não confirmou o envio anterior: o post pode ter saído. Confira na rede antes. Se já saiu, use Marquei como publicado; se não saiu, publique de novo.`"
      confirm-label="Não saiu, publicar de novo"
      @update:model-value="(v) => { if (!v) retryTarget = null }"
      @confirm="confirmRetry"
    />
    <AppDialog :model-value="!!markTarget" label="Marquei como publicado" size="sm" :loading="busy === markTarget?.id" @update:model-value="(v) => { if (!v) markTarget = null }">
      <form class="mcp__mark" data-testid="mark-dialog" novalidate @submit.prevent="confirmMark">
        <h2>Publicado no {{ markTarget ? netLabel(markTarget.network) : '' }}</h2>
        <label class="mk-field">
          <span class="mk-label">Link do post (opcional)</span>
          <input v-model="markUrl" class="mk-input" type="url" inputmode="url" placeholder="https://" name="published-url" @input="markError = ''" />
        </label>
        <p class="mk-hint">Com o link, o card mostra "Ver post" e a campanha conta o post.</p>
        <p v-if="markError" class="mk-error" role="alert">{{ markError }}</p>
        <div class="mcp__mark-foot">
          <button type="button" class="mk-btn mk-btn--ghost" :disabled="busy === markTarget?.id" @click="markTarget = null">Cancelar</button>
          <button type="submit" class="mk-btn mk-btn--primary" :disabled="busy === markTarget?.id" data-action="confirm-mark">Marcar como publicado</button>
        </div>
      </form>
    </AppDialog>
  </section>
</template>

<style scoped>
.mcp {
  min-width: 0;
}

.mcp__head {
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 6px;
  padding-bottom: 6px;
  min-height: 44px;
}

.mcp__title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.mcp__cta {
  padding: 4px 10px;
  min-height: 30px;
}

.mcp__body {
  padding: 10px 14px;
}

.mcp__empty {
  margin: 0;
  padding: 12px 14px;
  font-size: 12.5px;
  color: var(--text-2);
}

.mcp__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.mcp__list--muted {
  opacity: 0.8;
  border-top: 1px solid var(--border);
}

.mcp__item {
  display: flex;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.mcp__item:last-child {
  border-bottom: 0;
}

.mcp__icon {
  flex: none;
  margin-top: 2px;
  color: var(--text-2);
}

.mcp__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mcp__line {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 13px;
}

.mcp__net {
  font-weight: 700;
}

.mcp__muted {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-3);
  font-size: 12px;
}

.mcp__meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-2);
}

.mcp__note {
  margin: 0;
  font-size: 12.5px;
  color: var(--text);
}

.mcp__fail {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin: 0;
  font-size: 12px;
  color: var(--err);
  overflow-wrap: anywhere;
}

.mcp__fail.is-retry {
  color: var(--due-soon, var(--text-2));
}

.mcp__metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 2px 0 0;
}

.mcp__metrics div {
  display: flex;
  flex-direction: column;
}

.mcp__metrics dt {
  font-size: 11px;
  color: var(--text-3);
}

.mcp__metrics dd {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.mcp__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.mcp__act {
  min-height: 28px;
  padding: 3px 8px;
  font-size: 12.5px;
  text-decoration: none;
}

.mcp__danger:hover {
  color: var(--err);
}

.mcp__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 14px;
  border-top: 1px solid var(--border);
}

.mcp__reason {
  margin: 0;
}

.mcp__mark {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
}

.mcp__mark h2 {
  margin: 0;
  font-size: 15px;
}

.mcp__mark-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.mcp__spin {
  animation: mcp-spin 0.9s linear infinite;
}

@keyframes mcp-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .mcp__act,
  .mcp__cta,
  .mcp__mark-foot .mk-btn {
    min-height: 44px;
  }
}
</style>
