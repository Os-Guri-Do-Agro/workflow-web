<script setup lang="ts">
/**
 * Página do card (`/marketing/cards/:cardId`): é o link dos avisos do sino e a
 * tela de aprovar no celular (M1-A).
 *
 * Esquerda: a versão (abas V1, V2... e Comparar) com os pinos e as marcas do
 * vídeo. Direita: detalhes, texto do post, checklist, comentários e histórico.
 * Barra de ação: o Admin em Aguardando vê Aprovar e Pedir ajuste; quem produz
 * vê Enviar para aprovação e Subir nova versão. O Visualizador não vê botão.
 *
 * Celular: tudo numa coluna (versão em cima, comentários logo abaixo) e a barra
 * de ação presa embaixo, acima da tab bar (`--shell-bottom-inset`).
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import axios from 'axios'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Check,
  CheckCircle2,
  Columns2,
  SearchX,
  Send,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-vue-next'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { usePhoneViewport } from '@/composables/usePhoneViewport'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import { hasMarketingRole } from '@/service/marketing/marketing-core'
import {
  addChecklistItem,
  archiveCard,
  createComment,
  deleteCard,
  deleteChecklistItem,
  deleteComment,
  getCard,
  listComments,
  moveCard,
  resolveComment,
  updateCard,
  updateChecklistItem,
  updateComment,
  type CreateCommentInput,
  type MarketingCardComment,
  type MarketingCardDetail,
  type UpdateCardInput,
} from '@/service/marketing/marketing-cards'
import { useMarketing, useMarketingMembers } from '../composables/useMarketing'
import {
  CARD_KIND_LABEL,
  CARD_STATUS_TONE,
  brandTone,
  cardStatusLabel,
  toneStyle,
  type CardStatus,
} from '../marketing-labels'
import MarketingCardFields from '../approvals/components/MarketingCardFields.vue'
import MarketingCardHistory from '../approvals/components/MarketingCardHistory.vue'
import MarketingChecklist from '../approvals/components/MarketingChecklist.vue'
import MarketingCommentsPanel from '../approvals/components/MarketingCommentsPanel.vue'
import MarketingReviewDialog from '../approvals/components/MarketingReviewDialog.vue'
import MarketingUploadVersionDialog from '../approvals/components/MarketingUploadVersionDialog.vue'
import MarketingVersionCompare from '../approvals/components/MarketingVersionCompare.vue'
import MarketingVersionViewer, { type DraftAnchor } from '../approvals/components/MarketingVersionViewer.vue'
import { cardKeys } from '../approvals/approvals-meta'

const route = useRoute()
const router = useRouter()
const mk = useMarketing()
const members = useMarketingMembers(mk.groupId)
const queryClient = useQueryClient()
const { success, error: toastError } = useToast()
const phone = usePhoneViewport()
const { me } = useCurrentUser()

const groupId = computed(() => mk.groupId.value ?? '')
const cardId = computed(() => String(route.params.cardId ?? ''))

const detailQuery = useQuery({
  queryKey: computed(() => cardKeys.detail(groupId.value, cardId.value)),
  queryFn: () => getCard(groupId.value, cardId.value),
  enabled: computed(() => !!groupId.value && !!cardId.value),
  retry: (count, err) => !(axios.isAxiosError(err) && [403, 404].includes(err.response?.status ?? 0)) && count < 2,
})
const commentsQuery = useQuery({
  queryKey: computed(() => cardKeys.comments(groupId.value, cardId.value)),
  queryFn: () => listComments(groupId.value, cardId.value),
  enabled: computed(() => !!groupId.value && !!cardId.value && !!detailQuery.data.value),
})

const card = computed(() => detailQuery.data.value ?? null)
const comments = computed(() => commentsQuery.data.value ?? [])
const notFound = computed(
  () => axios.isAxiosError(detailQuery.error.value) && [403, 404].includes(detailQuery.error.value.response?.status ?? 0),
)
const brand = computed(() => (card.value ? mk.brandById(card.value.companyId) : undefined))
const isAdmin = computed(() => mk.can('ADMIN'))
const canEdit = computed(() => !!card.value?.me.canEdit)
const meId = computed(() => me.value?.id ?? null)

/** Quem pode ser mencionado: membro que vê a marca do card, menos eu. */
const mentionable = computed(() =>
  (members.data.value ?? []).filter(
    (m) =>
      m.userId !== meId.value &&
      (m.brandIds.length === 0 || (card.value && m.brandIds.includes(card.value.companyId))),
  ),
)

// ── Versões ──────────────────────────────────────────────────────────────
const selectedVersionId = ref<string | null>(null)
const draft = ref<DraftAnchor | null>(null)
const highlightId = ref<string | null>(null)
const comparing = ref(false)

let shownCardId = ''
watch(
  () => [cardId.value, card.value?.currentVersionId ?? null] as const,
  ([id, current]) => {
    if (!card.value) return
    const switched = shownCardId !== id
    shownCardId = id
    // Outro card, ou a versão escolhida sumiu: mostra a atual.
    if (switched || !card.value.versions.some((v) => v.id === selectedVersionId.value)) {
      selectedVersionId.value = current ?? card.value.versions[card.value.versions.length - 1]?.id ?? null
      comparing.value = false
      draft.value = null
      highlightId.value = null
    } else if (current) {
      // Versão nova chegou (daqui ou de outra pessoa): vai para ela.
      selectedVersionId.value = current
    }
  },
  { immediate: true },
)

const selectedVersion = computed(() => card.value?.versions.find((v) => v.id === selectedVersionId.value) ?? null)
const currentVersion = computed(() => card.value?.versions.find((v) => v.id === card.value?.currentVersionId) ?? null)
const versionComments = computed(() => comments.value.filter((c) => c.versionId === selectedVersionId.value))

function selectVersion(id: string) {
  comparing.value = false
  selectedVersionId.value = id
  draft.value = null
}

// ── Comentários no ponto ────────────────────────────────────────────────
const viewerRef = ref<InstanceType<typeof MarketingVersionViewer> | null>(null)
const commentsRef = ref<InstanceType<typeof MarketingCommentsPanel> | null>(null)
const commentBusy = ref(false)

function onDraft(anchor: DraftAnchor) {
  draft.value = anchor
  if (phone.value) {
    void nextTick(() => document.querySelector('.mkcm__composer')?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
  }
}

async function onFocusComment(c: MarketingCardComment) {
  highlightId.value = c.id
  if (c.versionId && c.versionId !== selectedVersionId.value) selectVersion(c.versionId)
  comparing.value = false
  await nextTick()
  if (c.assetId) viewerRef.value?.showAsset(c.assetId)
  await nextTick()
  if (c.anchorTime !== null) void viewerRef.value?.seek(c.anchorTime)
  if (phone.value) document.querySelector('.mkcv__viewer')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

function onSelectPin(id: string) {
  highlightId.value = id
  commentsRef.value?.scrollTo(id)
}

async function refreshComments() {
  await queryClient.invalidateQueries({ queryKey: cardKeys.comments(groupId.value, cardId.value) })
}

async function onCreateComment(input: CreateCommentInput) {
  commentBusy.value = true
  try {
    const created = await createComment(groupId.value, cardId.value, input)
    commentsRef.value?.reset()
    draft.value = null
    highlightId.value = created.id
    await refreshComments()
    void queryClient.invalidateQueries({ queryKey: cardKeys.all(groupId.value) })
  } catch (err) {
    toastError(getApiErrorMessage(err, 'Não deu para comentar.'))
  } finally {
    commentBusy.value = false
  }
}

async function guarded(fn: () => Promise<unknown>, fallback: string) {
  try {
    await fn()
    return true
  } catch (err) {
    toastError(getApiErrorMessage(err, fallback))
    return false
  }
}

async function onEditComment(id: string, body: string) {
  if (await guarded(() => updateComment(groupId.value, cardId.value, id, body), 'Não deu para salvar o comentário.')) await refreshComments()
}

const removeCommentId = ref<string | null>(null)
async function confirmRemoveComment() {
  const id = removeCommentId.value
  if (!id) return
  removeCommentId.value = null
  if (await guarded(() => deleteComment(groupId.value, cardId.value, id), 'Não deu para apagar o comentário.')) await refreshComments()
}

async function onResolve(id: string, resolved: boolean) {
  if (await guarded(() => resolveComment(groupId.value, cardId.value, id, resolved), 'Não deu para marcar o comentário.')) await refreshComments()
}

// ── Gravações do card ───────────────────────────────────────────────────
function applyDetail(detail: MarketingCardDetail) {
  queryClient.setQueryData(cardKeys.detail(groupId.value, detail.id), detail)
  void queryClient.invalidateQueries({ queryKey: ['marketing', groupId.value, 'cards', 'list'] })
  void queryClient.invalidateQueries({ queryKey: cardKeys.history(groupId.value, detail.id) })
}

async function onPatch(input: UpdateCardInput) {
  try {
    applyDetail(await updateCard(groupId.value, cardId.value, input))
  } catch (err) {
    toastError(getApiErrorMessage(err, 'Não deu para salvar.'))
    void detailQuery.refetch()
  }
}

const titleDraft = ref('')
watch(
  () => card.value?.title,
  (t) => {
    titleDraft.value = t ?? ''
  },
  { immediate: true },
)
function saveTitle() {
  const t = titleDraft.value.replace(/\s+/g, ' ').trim()
  if (!card.value) return
  if (!t) {
    titleDraft.value = card.value.title
    return
  }
  if (t !== card.value.title) void onPatch({ title: t })
}

const moving = ref(false)
async function onMove(status: CardStatus) {
  if (moving.value) return
  moving.value = true
  try {
    applyDetail(await moveCard(groupId.value, cardId.value, status))
    if (status === 'AWAITING_APPROVAL') success('Enviado para aprovação.')
  } catch (err) {
    toastError(getApiErrorMessage(err, 'Não deu para mudar o status.'))
  } finally {
    moving.value = false
  }
}

const otherMoves = computed(() => (card.value?.me.allowedMoves ?? []).filter((s) => s !== 'AWAITING_APPROVAL'))
const canSend = computed(() => !!card.value?.me.allowedMoves.includes('AWAITING_APPROVAL'))
const canReview = computed(() => !!card.value?.me.canApprove)
const canUpload = computed(() => !!card.value?.me.canUploadVersion)
const hasPrimary = computed(() => canReview.value || canSend.value || canUpload.value)

function moveLabel(s: CardStatus) {
  if (!card.value) return s
  if (s === 'IN_PRODUCTION' && ['APPROVED', 'SCHEDULED', 'PUBLISHED', 'SENT_TO_PRINTER', 'PROOF_RECEIVED', 'DELIVERED'].includes(card.value.status)) {
    return 'Reabrir para produção'
  }
  return cardStatusLabel(s, card.value.kind)
}

// ── Diálogos ────────────────────────────────────────────────────────────
const uploadOpen = ref(false)
const reviewOpen = ref(false)
const reviewMode = ref<'approve' | 'changes'>('approve')

function openReview(mode: 'approve' | 'changes') {
  reviewMode.value = mode
  reviewOpen.value = true
}

/** Comentários com ponto ainda abertos da versão atual: viram as linhas do ajuste. */
const prefillLines = computed(() =>
  comments.value
    .filter(
      (c) =>
        c.kind === 'COMMENT' &&
        !c.resolvedAt &&
        c.versionId === card.value?.currentVersionId &&
        (c.anchorX !== null || c.anchorTime !== null),
    )
    .map((c) => c.body.replace(/\s+/g, ' ').slice(0, 500)),
)

function onReviewed(detail: MarketingCardDetail) {
  applyDetail(detail)
  void refreshComments()
  success(reviewMode.value === 'approve' ? 'Aprovado.' : 'Ajuste pedido. Quem produz foi avisado.')
}

function onVersionDone(detail: MarketingCardDetail) {
  applyDetail(detail)
  selectedVersionId.value = detail.currentVersionId
  const v = detail.versions.find((x) => x.id === detail.currentVersionId)
  success(
    detail.status === 'AWAITING_APPROVAL' && card.value?.status !== 'AWAITING_APPROVAL'
      ? `V${v?.number ?? ''} fechada. O card voltou para Aguardando aprovação.`
      : `V${v?.number ?? ''} fechada.`,
  )
}

// ── Checklist ───────────────────────────────────────────────────────────
const checklistBusy = ref(new Set<string>())
async function refreshDetail() {
  await queryClient.invalidateQueries({ queryKey: cardKeys.detail(groupId.value, cardId.value) })
  void queryClient.invalidateQueries({ queryKey: ['marketing', groupId.value, 'cards', 'list'] })
}

async function onToggleItem(id: string, done: boolean) {
  checklistBusy.value = new Set(checklistBusy.value).add(id)
  await guarded(() => updateChecklistItem(groupId.value, cardId.value, id, { done }), 'Não deu para marcar o item.')
  await refreshDetail()
  const next = new Set(checklistBusy.value)
  next.delete(id)
  checklistBusy.value = next
}

async function onAddItem(text: string) {
  if (await guarded(() => addChecklistItem(groupId.value, cardId.value, text), 'Não deu para incluir o item.')) await refreshDetail()
}

async function onRemoveItem(id: string) {
  if (await guarded(() => deleteChecklistItem(groupId.value, cardId.value, id), 'Não deu para tirar o item.')) await refreshDetail()
}

// ── Arquivar e apagar ───────────────────────────────────────────────────
async function onArchive() {
  if (!card.value) return
  const archived = !card.value.archivedAt
  try {
    applyDetail(await archiveCard(groupId.value, cardId.value, archived))
    success(archived ? 'Card arquivado.' : 'Card de volta ao board.')
  } catch (err) {
    toastError(getApiErrorMessage(err, 'Não deu para arquivar.'))
  }
}

const deleteOpen = ref(false)
const deleting = ref(false)
async function onDelete() {
  deleting.value = true
  // Antes de tirar o card do cache: a volta depende do tipo (trilha Gráfica).
  const back = backTo.value
  try {
    await deleteCard(groupId.value, cardId.value)
    deleteOpen.value = false
    queryClient.removeQueries({ queryKey: cardKeys.detail(groupId.value, cardId.value) })
    void queryClient.invalidateQueries({ queryKey: cardKeys.all(groupId.value) })
    success('Card apagado, com os arquivos.')
    void router.replace(back)
  } catch (err) {
    toastError(getApiErrorMessage(err, 'Não deu para apagar o card.'))
  } finally {
    deleting.value = false
  }
}

/** Peça impressa volta para a trilha Gráfica (a Digital nem mostra o card). */
const backTo = computed(() => ({
  name: 'marketing-approvals',
  query: {
    ...(mk.brandFilter.value ? { marca: mk.brandFilter.value } : {}),
    ...(card.value?.kind === 'PRINT' ? { trilha: 'grafica' } : {}),
  },
}))

const reviewVersionNumber = computed(() => currentVersion.value?.number ?? 0)
const isMember = computed(() => hasMarketingRole(mk.role.value, 'VIEWER'))
</script>

<template>
  <div class="mk-page mkcv" :class="{ 'mkcv--bar': phone && hasPrimary }">
    <RouterLink :to="backTo" class="mkcv__back">
      <ArrowLeft :size="14" aria-hidden="true" /> Aprovações
    </RouterLink>

    <div v-if="detailQuery.isLoading.value" class="mkcv__loading">
      <Skeleton type="row" />
      <Skeleton type="block" />
    </div>

    <EmptyState
      v-else-if="notFound || !isMember"
      :icon="SearchX"
      title="Card não encontrado"
      description="Ele pode ter sido apagado, ou é de uma marca que você não vê nesta ala."
    >
      <template #action>
        <RouterLink :to="backTo" class="mk-btn">Voltar para Aprovações</RouterLink>
      </template>
    </EmptyState>

    <div v-else-if="detailQuery.isError.value" class="mk-panel mkcv__error" role="alert">
      <p>{{ getApiErrorMessage(detailQuery.error.value, 'Não deu para abrir o card.') }}</p>
      <button type="button" class="mk-btn" @click="detailQuery.refetch()">Tentar de novo</button>
    </div>

    <template v-else-if="card">
      <header class="mkcv__head">
        <div class="mkcv__title-wrap">
          <textarea
            v-if="canEdit"
            v-model="titleDraft"
            rows="1"
            class="mkcv__title mkcv__title--input"
            aria-label="Título do card"
            maxlength="200"
            @blur="saveTitle"
            @keydown.enter.prevent="($event.target as HTMLTextAreaElement).blur()"
          />
          <h1 v-else class="mkcv__title">{{ card.title }}</h1>
          <div class="mkcv__sub">
            <span class="mk-chip" data-tone :style="toneStyle(CARD_STATUS_TONE[card.status])" data-testid="head-status">
              {{ cardStatusLabel(card.status, card.kind) }}
            </span>
            <span class="mkcv__brand">
              <span class="mk-dot" :style="toneStyle(brandTone(brand))" aria-hidden="true" />
              {{ brand?.name }}
            </span>
            <span>{{ CARD_KIND_LABEL[card.kind] }}</span>
            <span v-if="card.approvalValid" class="mkcv__ok"><CheckCircle2 :size="13" aria-hidden="true" /> V{{ currentVersion?.number }} aprovada</span>
            <span v-if="card.overdue" class="mk-late">Prazo vencido</span>
            <span v-if="card.archivedAt" class="mk-chip">Arquivado</span>
          </div>
        </div>

        <div class="mkcv__tools">
          <select
            v-if="canEdit && otherMoves.length"
            class="mk-select mkcv__status"
            aria-label="Mudar status"
            :disabled="moving"
            value=""
            data-testid="status-select"
            @change="onMove(($event.target as HTMLSelectElement).value as CardStatus); ($event.target as HTMLSelectElement).value = ''"
          >
            <option value="" disabled>Mudar status</option>
            <option v-for="s in otherMoves" :key="s" :value="s">{{ moveLabel(s) }}</option>
          </select>
          <button
            v-if="canEdit"
            type="button"
            class="mk-icon-btn"
            :aria-label="card.archivedAt ? 'Desarquivar' : 'Arquivar'"
            :title="card.archivedAt ? 'Desarquivar' : 'Arquivar'"
            @click="onArchive"
          >
            <component :is="card.archivedAt ? ArchiveRestore : Archive" :size="16" />
          </button>
          <button
            v-if="card.me.canDelete"
            type="button"
            class="mk-icon-btn mkcv__danger"
            aria-label="Apagar card"
            title="Apagar card"
            data-action="delete-card"
            @click="deleteOpen = true"
          >
            <Trash2 :size="16" />
          </button>
        </div>

        <Teleport to="body" :disabled="!phone">
          <div v-if="hasPrimary" class="mkcv__actions" :class="{ 'mkcv__actions--bar': phone }" role="group" aria-label="Ações do card">
            <template v-if="canReview">
              <button type="button" class="mk-btn mkcv__changes" data-action="request-changes" @click="openReview('changes')">
                <Undo2 :size="15" aria-hidden="true" /> Pedir ajuste
              </button>
              <button type="button" class="mk-btn mk-btn--success" data-action="approve" @click="openReview('approve')">
                <Check :size="15" aria-hidden="true" /> Aprovar
              </button>
            </template>
            <template v-else>
              <button v-if="canUpload" type="button" class="mk-btn" data-action="upload-version" @click="uploadOpen = true">
                <Upload :size="15" aria-hidden="true" /> {{ card.versions.length ? 'Subir nova versão' : 'Subir a V1' }}
              </button>
              <button
                v-if="canSend"
                type="button"
                class="mk-btn mk-btn--primary"
                :disabled="moving"
                data-action="send-approval"
                @click="onMove('AWAITING_APPROVAL')"
              >
                <Send :size="15" aria-hidden="true" /> Enviar para aprovação
              </button>
            </template>
          </div>
        </Teleport>
      </header>

      <div class="mkcv__grid">
        <section class="mkcv__viewer" aria-label="Versões do card">
          <div v-if="card.versions.length" class="mkcv__tabs" role="tablist" aria-label="Versões">
            <button
              v-for="v in card.versions"
              :key="v.id"
              type="button"
              role="tab"
              class="mkcv__tab"
              :class="{ 'is-on': !comparing && v.id === selectedVersionId }"
              :aria-selected="!comparing && v.id === selectedVersionId"
              :data-version="v.number"
              @click="selectVersion(v.id)"
            >
              V{{ v.number }}
              <span v-if="v.id === card.currentVersionId" class="mkcv__tab-tag">atual</span>
              <CheckCircle2 v-if="v.id === card.approvedVersionId" :size="13" class="mkcv__tab-ok" aria-label="aprovada" />
            </button>
            <button
              v-if="card.versions.length > 1"
              type="button"
              role="tab"
              class="mkcv__tab"
              :class="{ 'is-on': comparing }"
              :aria-selected="comparing"
              data-version="compare"
              @click="comparing = true"
            >
              <Columns2 :size="14" aria-hidden="true" /> Comparar
            </button>
          </div>

          <MarketingVersionCompare
            v-if="comparing"
            :group-id="groupId"
            :versions="card.versions"
            :current-version-id="card.currentVersionId"
            :approved-version-id="card.approvedVersionId"
          />
          <template v-else-if="selectedVersion">
            <MarketingVersionViewer
              ref="viewerRef"
              :group-id="groupId"
              :version="selectedVersion"
              :comments="versionComments"
              :can-comment="card.me.canComment"
              :phone="phone"
              :draft="draft"
              :highlight-id="highlightId"
              @draft="onDraft"
              @cancel-draft="draft = null"
              @select-comment="onSelectPin"
            />
            <p v-if="selectedVersion.note" class="mkcv__vnote">
              <strong>Nota da V{{ selectedVersion.number }}:</strong> {{ selectedVersion.note }}
              <span v-if="selectedVersion.createdBy" class="mkcv__vby">({{ selectedVersion.createdBy.name }})</span>
            </p>
          </template>
          <div v-else class="mkcv__novers">
            <p>Ainda não há versão. Suba a arte (ou escreva a legenda) e feche a V1 para mandar para aprovação.</p>
            <button v-if="canUpload" type="button" class="mk-btn mk-btn--primary" @click="uploadOpen = true">
              <Upload :size="15" aria-hidden="true" /> Subir a V1
            </button>
          </div>
        </section>

        <div class="mkcv__fields">
          <MarketingCardFields
            :card="card"
            :brand="brand"
            :members="members.data.value ?? []"
            :can-edit="canEdit"
            @patch="onPatch"
          />
        </div>

        <div class="mkcv__checklist">
          <MarketingChecklist
            :items="card.checklist"
            :can-edit="canEdit"
            :is-admin="isAdmin"
            :me-id="meId"
            :busy-ids="checklistBusy"
            @toggle="onToggleItem"
            @add="onAddItem"
            @remove="onRemoveItem"
          />
        </div>

        <div class="mkcv__comments">
          <!-- :key = card: a página é reaproveitada de um card para outro, e o
               rascunho (texto e menções) não pode ir junto. -->
          <MarketingCommentsPanel
            :key="card.id"
            ref="commentsRef"
            :comments="comments"
            :version-id="selectedVersionId"
            :version-number="selectedVersion?.number ?? null"
            :can-comment="card.me.canComment"
            :is-admin="isAdmin"
            :me-id="meId"
            :mentionable="mentionable"
            :draft="draft"
            :highlight-id="highlightId"
            :busy="commentBusy"
            @create="onCreateComment"
            @edit="onEditComment"
            @remove="removeCommentId = $event"
            @resolve="onResolve"
            @focus="onFocusComment"
            @cancel-draft="draft = null"
          />
        </div>

        <div class="mkcv__history">
          <MarketingCardHistory :group-id="groupId" :card-id="card.id" />
        </div>
      </div>

      <MarketingUploadVersionDialog v-if="canUpload" v-model="uploadOpen" :group-id="groupId" :card="card" @done="onVersionDone" />
      <MarketingReviewDialog
        v-if="isAdmin"
        v-model="reviewOpen"
        :mode="reviewMode"
        :group-id="groupId"
        :card-id="card.id"
        :version-number="reviewVersionNumber"
        :prefill="prefillLines"
        @done="onReviewed"
      />
      <ConfirmDialog
        v-model="deleteOpen"
        title="Apagar o card?"
        :message="`&quot;${card.title}&quot; some do board com todas as versões, comentários e arquivos. Não dá para desfazer.`"
        confirm-label="Apagar"
        danger
        :loading="deleting"
        @confirm="onDelete"
      />
      <ConfirmDialog
        :model-value="!!removeCommentId"
        title="Apagar o comentário?"
        message="O comentário some para todo mundo."
        confirm-label="Apagar"
        danger
        @update:model-value="removeCommentId = null"
        @confirm="confirmRemoveComment"
      />
    </template>
  </div>
</template>

<style scoped>
.mkcv {
  gap: 12px;
}

.mkcv--bar {
  padding-bottom: 76px;
}

.mkcv__back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  min-height: 28px;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.mkcv__back:hover {
  color: var(--text);
}

.mkcv__loading {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mkcv__error {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  font-size: 13px;
}

.mkcv__error p {
  flex: 1;
  margin: 0;
}

.mkcv__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.mkcv__title-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mkcv__title {
  margin: 0;
  width: 100%;
  font-size: 20px;
  line-height: 28px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text);
  overflow-wrap: anywhere;
}

.mkcv__title--input {
  display: block;
  padding: 0 6px;
  margin-left: -6px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  font: inherit;
  font-size: 20px;
  font-weight: 700;
  resize: none;
  overflow: hidden;
  /* Cresce com o texto (título longo quebra em vez de sumir no corte). */
  field-sizing: content;
  min-height: 30px;
}

.mkcv__title--input:hover {
  border-color: var(--border);
}

.mkcv__title--input:focus {
  outline: none;
  border-color: var(--accent);
  background: var(--surface);
}

.mkcv__sub {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12.5px;
  color: var(--text-2);
}

.mkcv__brand,
.mkcv__ok {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.mkcv__ok {
  color: var(--success);
  font-weight: 600;
}

.mkcv__tools {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mkcv__status {
  width: auto;
  min-height: 32px;
}

.mkcv__danger:hover {
  color: var(--err);
}

.mkcv__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mkcv__changes {
  color: var(--due-late);
  border-color: color-mix(in srgb, var(--due-late) 40%, var(--border));
}

/* Celular: barra de ação presa embaixo, acima da tab bar. */
.mkcv__actions--bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--shell-bottom-inset, 0px);
  z-index: 40;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  background: var(--surface);
  box-shadow: var(--shadow-overlay);
}

.mkcv__actions--bar > .mk-btn {
  flex: 1;
  min-height: 44px;
}

.mkcv__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  grid-template-rows: auto auto auto 1fr;
  grid-template-areas:
    'viewer fields'
    'viewer checklist'
    'viewer comments'
    'viewer history';
  gap: 12px 16px;
  align-items: start;
}

.mkcv__viewer {
  grid-area: viewer;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  position: sticky;
  top: 8px;
}

.mkcv__fields {
  grid-area: fields;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.mkcv__checklist {
  grid-area: checklist;
  min-width: 0;
}

.mkcv__comments {
  grid-area: comments;
  min-width: 0;
}

.mkcv__history {
  grid-area: history;
  min-width: 0;
}

.mkcv__tabs {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid var(--border);
}

.mkcv__tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  min-height: 34px;
  padding: 4px 10px;
  margin-bottom: -1px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.mkcv__tab.is-on {
  border-bottom-color: var(--accent);
  color: var(--accent-ink);
}

.mkcv__tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.mkcv__tab-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
}

.mkcv__tab-ok {
  color: var(--success);
}

.mkcv__vnote {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-2);
  white-space: pre-wrap;
}

.mkcv__vby {
  color: var(--text-3);
}

.mkcv__novers {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 36px 16px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  text-align: center;
  color: var(--text-2);
  font-size: 13px;
}

.mkcv__novers p {
  margin: 0;
  max-width: 360px;
}

@media (max-width: 1100px) {
  .mkcv__grid {
    grid-template-columns: minmax(0, 1fr) 320px;
  }
}

@media (max-width: 900px) {
  .mkcv__grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
    grid-template-areas:
      'viewer'
      'comments'
      'fields'
      'checklist'
      'history';
  }

  .mkcv__viewer {
    position: static;
  }
}

@media (max-width: 640px) {
  .mkcv__title,
  .mkcv__title--input {
    font-size: 18px;
    line-height: 26px;
  }

  /* Título na largura toda; status e ícones descem para a linha de baixo. */
  .mkcv__title-wrap {
    flex-basis: 100%;
  }


  .mkcv__tab {
    min-height: 44px;
  }

  .mkcv__status {
    min-height: 44px;
  }

  .mkcv__back {
    min-height: 44px;
  }
}
</style>
