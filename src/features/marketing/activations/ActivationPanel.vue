<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { ArrowLeft, Camera, Film, ListChecks, MapPin, Pencil, Plus, Trash2, X } from 'lucide-vue-next'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import FileViewer, { type ViewerFile } from '@/components/ui/FileViewer.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import {
  addChecklistItem,
  applyChecklistTemplate,
  deleteActivation,
  deleteActivationPhoto,
  deleteChecklistItem,
  updateActivation,
  updateChecklistItem,
  uploadActivationPhoto,
  type ActivationDetail,
  type ActivationStatus,
} from '@/service/marketing/marketing-activations'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { useMarketing } from '../composables/useMarketing'
import { brandTone, formatCents, toneStyle } from '../marketing-labels'
import QuotesPanel from '../quotes/QuotesPanel.vue'
import ActivationFormDialog from './ActivationFormDialog.vue'
import {
  ACTIVATION_KIND_LABEL,
  ACTIVATION_STATUS_LABEL,
  ACTIVATION_STATUS_TONE,
  ACTIVATION_STATUSES,
  formatWhen,
} from './activation-meta'
import { useActivation } from './useActivations'

/**
 * Painel da ativação (URL `?ativacao=<id>`): dados, checklist, fotos, custo e
 * lançamentos (só com financeiro), orçamentos e "Como foi".
 */
const props = defineProps<{ groupId: string; activationId: string }>()
const emit = defineEmits<{ close: []; deleted: [] }>()

const mk = useMarketing()
const qc = useQueryClient()
const { success, error: toastError } = useToast()
const { me } = useCurrentUser()

const query = useActivation(
  () => props.groupId,
  () => props.activationId,
)
const a = computed<ActivationDetail | null>(() => query.data.value ?? null)
const canEdit = computed(() => mk.can('EDITOR'))
const brand = computed(() => mk.brandById(a.value?.companyId))
const canDelete = computed(() => {
  if (mk.can('ADMIN')) return true
  if (!mk.can('EDITOR')) return false
  return !!mk.settings.value?.editorCanDelete || a.value?.createdById === me.value?.id
})

function refresh() {
  void qc.invalidateQueries({ queryKey: ['marketing', props.groupId] })
}
function fail(error: unknown, fallback: string) {
  toastError(getApiErrorMessage(error, fallback))
}

// ── Situação e edição ──────────────────────────────────────────────────────

const statusMutation = useMutation({
  mutationFn: (status: ActivationStatus) => updateActivation(props.groupId, props.activationId, { status }),
  onSuccess: refresh,
  onError: (e) => fail(e, 'Não foi possível mudar a situação.'),
})
const editOpen = ref(false)

/*
 * Select e checkbox são `:value`/`:checked` (sem v-model): se a API recusa, o
 * valor do servidor não mudou e o Vue não redesenha, então o controle ficava
 * mostrando o que foi recusado. Na recusa ele volta ao que está gravado (o
 * toast do `fail` mostra a frase da API).
 */
function changeStatus(event: Event) {
  const select = event.target as HTMLSelectElement
  statusMutation.mutate(select.value as ActivationStatus, {
    onError: () => {
      if (a.value) select.value = a.value.status
    },
  })
}

// ── Checklist ──────────────────────────────────────────────────────────────

const newItem = ref('')
const toggleMutation = useMutation({
  mutationFn: (v: { id: string; done: boolean }) =>
    updateChecklistItem(props.groupId, props.activationId, v.id, { done: v.done }),
  onSuccess: refresh,
  onError: (e) => fail(e, 'Não foi possível marcar o item.'),
})
const addItemMutation = useMutation({
  mutationFn: (text: string) => addChecklistItem(props.groupId, props.activationId, text),
  onSuccess: () => {
    newItem.value = ''
    refresh()
  },
  onError: (e) => fail(e, 'Não foi possível adicionar o item.'),
})
const removeItemMutation = useMutation({
  mutationFn: (id: string) => deleteChecklistItem(props.groupId, props.activationId, id),
  onSuccess: refresh,
  onError: (e) => fail(e, 'Não foi possível apagar o item.'),
})
const templateMutation = useMutation({
  mutationFn: () => applyChecklistTemplate(props.groupId, props.activationId),
  onSuccess: (res) => {
    if (!res.created) success('Esta ativação já tem checklist.')
    refresh()
  },
  onError: (e) => fail(e, 'Não foi possível aplicar o checklist padrão.'),
})
function toggleItem(event: Event, id: string) {
  const box = event.target as HTMLInputElement
  toggleMutation.mutate(
    { id, done: box.checked },
    {
      onError: () => {
        const item = a.value?.checklist.find((i) => i.id === id)
        box.checked = item ? !!item.doneAt : !box.checked
      },
    },
  )
}
function submitItem() {
  const text = newItem.value.trim()
  if (text && !addItemMutation.isPending.value) addItemMutation.mutate(text)
}
const progress = computed(() => {
  const items = a.value?.checklist ?? []
  return { done: items.filter((i) => i.doneAt).length, total: items.length }
})

// ── Fotos ──────────────────────────────────────────────────────────────────

const photoInput = ref<HTMLInputElement | null>(null)
const uploading = ref<Record<string, number>>({})
const dragging = ref(false)

async function uploadFiles(files: File[]) {
  const accepted = files.filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))
  if (accepted.length < files.length) toastError('Só foto e vídeo entram na ativação.')
  for (const file of accepted) {
    const key = `${file.name}:${file.size}`
    uploading.value = { ...uploading.value, [key]: 0 }
    try {
      await uploadActivationPhoto(props.groupId, props.activationId, file, (p) => {
        uploading.value = { ...uploading.value, [key]: p }
      })
    } catch (e) {
      fail(e, `Não foi possível enviar "${file.name}".`)
    } finally {
      const { [key]: _done, ...rest } = uploading.value
      uploading.value = rest
    }
  }
  refresh()
}
function onPick(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (files.length) void uploadFiles(files)
}
function onDrop(event: DragEvent) {
  dragging.value = false
  if (!canEdit.value) return
  const files = [...(event.dataTransfer?.files ?? [])]
  if (files.length) void uploadFiles(files)
}

const viewer = ref<{ items: ViewerFile[]; start: number } | null>(null)
function openPhoto(index: number) {
  viewer.value = {
    start: index,
    items: (a.value?.photos ?? []).map((p) => ({
      filename: p.name,
      mimeType: p.mimeType,
      size: p.size,
      url: p.previewUrl ?? p.url ?? null,
    })),
  }
}

const photoRemove = ref<{ id: string; name: string } | null>(null)
const photoRemoveOpen = computed({
  get: () => !!photoRemove.value,
  set: (v) => {
    if (!v) photoRemove.value = null
  },
})
const photoRemoveMessage = computed(() => `"${photoRemove.value?.name ?? ''}" sai da ativação e do armazenamento.`)
const photoRemoveMutation = useMutation({
  mutationFn: () => deleteActivationPhoto(props.groupId, props.activationId, photoRemove.value!.id),
  onSuccess: () => {
    photoRemove.value = null
    refresh()
  },
  onError: (e) => fail(e, 'Não foi possível apagar a foto.'),
})

// ── Como foi ───────────────────────────────────────────────────────────────

const resultsDraft = ref('')
/** Último texto vindo do servidor: o rascunho só é trocado se a pessoa não mexeu nele. */
const resultsSynced = ref('')
const resultsDirty = computed(() => resultsDraft.value !== resultsSynced.value)
watch(
  () => a.value?.results ?? '',
  (value) => {
    if (resultsDraft.value === resultsSynced.value) resultsDraft.value = value
    resultsSynced.value = value
  },
  { immediate: true },
)
const resultsMutation = useMutation({
  mutationFn: () => updateActivation(props.groupId, props.activationId, { results: resultsDraft.value.trim() || null }),
  onSuccess: () => {
    success('Anotações salvas.')
    refresh()
  },
  onError: (e) => fail(e, 'Não foi possível salvar.'),
})

// ── Apagar ─────────────────────────────────────────────────────────────────

const deleteOpen = ref(false)
const deleteMessage = computed(
  () => `"${a.value?.title ?? ''}", o checklist e as ${a.value?.photos.length ?? 0} foto(s) saem do sistema. Lançamentos e orçamentos ligados continuam, sem a ativação.`,
)
const deleteMutation = useMutation({
  mutationFn: () => deleteActivation(props.groupId, props.activationId),
  onSuccess: () => {
    deleteOpen.value = false
    success('Ativação apagada.')
    refresh()
    emit('deleted')
  },
  onError: (e) => fail(e, 'Não foi possível apagar a ativação.'),
})

function ddmm(ymd: string) {
  const [, m, d] = ymd.split('-')
  return `${d}/${m}`
}
</script>

<template>
  <aside class="ap" aria-label="Detalhe da ativação">
    <header class="ap__head">
      <button type="button" class="mk-btn mk-btn--ghost ap__back" @click="emit('close')">
        <ArrowLeft :size="15" aria-hidden="true" />
        Voltar
      </button>
      <div class="ap__heading">
        <h2 class="ap__title">{{ a?.title ?? 'Ativação' }}</h2>
        <div v-if="a" class="ap__sub">
          <span class="mk-chip">{{ ACTIVATION_KIND_LABEL[a.kind] }}</span>
          <span v-if="brand && mk.brands.value.length > 1" class="ap__brand">
            <span class="mk-dot" :style="toneStyle(brandTone(brand))" aria-hidden="true" />
            {{ brand.name }}
          </span>
        </div>
      </div>
      <button type="button" class="mk-icon-btn ap__x" aria-label="Fechar painel" @click="emit('close')">
        <X :size="16" aria-hidden="true" />
      </button>
    </header>

    <div v-if="query.isLoading.value" class="ap__body"><Skeleton type="block" height="120px" /></div>
    <p v-else-if="query.isError.value || !a" class="ap__body mk-error">
      Não foi possível abrir esta ativação. Ela pode ter sido apagada ou ser de uma marca fora do seu acesso.
    </p>

    <div v-else class="ap__body">
      <!-- Dados -->
      <section class="ap__sec">
        <div class="ap__facts">
          <div class="ap__fact">
            <span class="ap__k">Quando</span>
            <span class="ap__v">{{ formatWhen(a, true) }}</span>
          </div>
          <div class="ap__fact">
            <span class="ap__k">Situação</span>
            <select
              v-if="canEdit"
              class="mk-select ap__status"
              :value="a.status"
              :style="toneStyle(ACTIVATION_STATUS_TONE[a.status])"
              aria-label="Situação da ativação"
              :disabled="statusMutation.isPending.value"
              @change="changeStatus"
            >
              <option v-for="s in ACTIVATION_STATUSES" :key="s" :value="s">{{ ACTIVATION_STATUS_LABEL[s] }}</option>
            </select>
            <span
              v-else
              class="mk-chip"
              data-tone
              :style="toneStyle(ACTIVATION_STATUS_TONE[a.status])"
            >
              {{ ACTIVATION_STATUS_LABEL[a.status] }}
            </span>
          </div>
          <div v-if="a.location" class="ap__fact">
            <span class="ap__k">Local</span>
            <span class="ap__v"><MapPin :size="13" aria-hidden="true" /> {{ a.location }}</span>
          </div>
          <div v-if="a.partner" class="ap__fact">
            <span class="ap__k">Parceiro</span>
            <RouterLink
              class="ap__v ap__link"
              :to="{ name: 'marketing-partners', query: { parceiro: a.partner.id } }"
            >
              {{ a.partner.name }}
            </RouterLink>
          </div>
        </div>
        <p v-if="a.notes" class="ap__notes">{{ a.notes }}</p>
        <div v-if="canEdit" class="ap__row-actions">
          <button type="button" class="mk-btn" @click="editOpen = true">
            <Pencil :size="14" aria-hidden="true" />
            Editar dados
          </button>
        </div>
      </section>

      <!-- Checklist -->
      <section class="ap__sec" aria-labelledby="ap-check">
        <h3 id="ap-check" class="ap__h">
          Checklist
          <span v-if="progress.total" class="ap__count">{{ progress.done }} de {{ progress.total }}</span>
        </h3>
        <div v-if="progress.total" class="ap__bar" role="progressbar" :aria-valuenow="progress.done" :aria-valuemax="progress.total" aria-label="Itens do checklist concluídos">
          <span :style="{ width: `${(progress.done / progress.total) * 100}%` }" />
        </div>
        <ul v-if="a.checklist.length" class="ap__list">
          <li v-for="item in a.checklist" :key="item.id" class="ap__item">
            <label class="ap__check" :class="{ 'is-done': !!item.doneAt }">
              <input
                type="checkbox"
                :checked="!!item.doneAt"
                :disabled="!canEdit || toggleMutation.isPending.value"
                @change="toggleItem($event, item.id)"
              />
              <span>{{ item.text }}</span>
            </label>
            <button
              v-if="canEdit"
              type="button"
              class="mk-icon-btn"
              :aria-label="`Apagar o item ${item.text}`"
              @click="removeItemMutation.mutate(item.id)"
            >
              <X :size="14" aria-hidden="true" />
            </button>
          </li>
        </ul>
        <p v-else class="mk-hint">Sem itens ainda.</p>
        <form v-if="canEdit" class="ap__add" @submit.prevent="submitItem">
          <input v-model="newItem" class="mk-input" maxlength="300" placeholder="Novo item" aria-label="Novo item do checklist" autocomplete="off" />
          <button type="submit" class="mk-btn" :disabled="!newItem.trim() || addItemMutation.isPending.value">
            <Plus :size="14" aria-hidden="true" />
            Adicionar
          </button>
        </form>
        <button
          v-if="canEdit && !a.checklist.length"
          type="button"
          class="mk-btn ap__template"
          :disabled="templateMutation.isPending.value"
          @click="templateMutation.mutate()"
        >
          <ListChecks :size="14" aria-hidden="true" />
          Usar o checklist padrão de evento
        </button>
      </section>

      <!-- Fotos -->
      <section
        class="ap__sec"
        :class="{ 'is-drag': dragging }"
        aria-labelledby="ap-photos"
        @dragover.prevent="canEdit && (dragging = true)"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <h3 id="ap-photos" class="ap__h">
          Fotos e vídeos
          <span v-if="a.photos.length" class="ap__count">{{ a.photos.length }}</span>
        </h3>
        <div v-if="a.photos.length || Object.keys(uploading).length" class="ap__grid">
          <div v-for="(p, i) in a.photos" :key="p.id" class="ap__tile">
            <button type="button" class="ap__tile-open" :aria-label="`Abrir ${p.name}`" @click="openPhoto(i)">
              <img v-if="p.mimeType.startsWith('image/') && (p.previewUrl || p.url)" :src="p.previewUrl ?? p.url ?? ''" :alt="p.name" loading="lazy" />
              <span v-else class="ap__tile-ph"><Film :size="22" aria-hidden="true" /></span>
            </button>
            <button
              v-if="canEdit"
              type="button"
              class="ap__tile-x"
              :aria-label="`Apagar ${p.name}`"
              @click="photoRemove = { id: p.id, name: p.name }"
            >
              <Trash2 :size="13" aria-hidden="true" />
            </button>
          </div>
          <div v-for="(pct, key) in uploading" :key="key" class="ap__tile ap__tile--busy">{{ pct }}%</div>
        </div>
        <p v-else class="mk-hint">Nenhuma foto ainda.{{ canEdit ? ' Arraste aqui ou escolha os arquivos.' : '' }}</p>
        <div v-if="canEdit" class="ap__row-actions">
          <button type="button" class="mk-btn" @click="photoInput?.click()">
            <Camera :size="14" aria-hidden="true" />
            Adicionar fotos
          </button>
        </div>
        <input ref="photoInput" type="file" accept="image/*,video/*" multiple class="ap__input" tabindex="-1" aria-hidden="true" @change="onPick" />
      </section>

      <!-- Custo -->
      <section v-if="a.expenses !== null" class="ap__sec" aria-labelledby="ap-cost">
        <h3 id="ap-cost" class="ap__h">
          Custo
          <span class="ap__count">{{ formatCents(a.costCents) }}</span>
        </h3>
        <p v-if="!a.expenses.length" class="mk-hint">Nenhum lançamento ligado a esta ativação. Lance no Financeiro escolhendo esta ativação.</p>
        <template v-else>
          <p class="mk-hint">Pago {{ formatCents(a.paidCents) }} · Previsto {{ formatCents(a.plannedCents) }}</p>
          <ul class="ap__list">
            <li v-for="e in a.expenses" :key="e.id" class="ap__exp">
              <span class="ap__exp-date">{{ ddmm(e.date) }}</span>
              <span class="ap__exp-desc">{{ e.description }}<small>{{ e.category }}</small></span>
              <span class="mk-chip" data-tone :style="toneStyle(e.status === 'PAID' ? 'green' : 'amber')">
                {{ e.status === 'PAID' ? 'Pago' : 'Previsto' }}
              </span>
              <span class="mk-num ap__exp-val">{{ formatCents(e.amountCents) }}</span>
            </li>
          </ul>
        </template>
      </section>

      <!-- Orçamentos -->
      <section class="ap__sec">
        <QuotesPanel :group-id="groupId" :company-id="a.companyId" :activation-id="a.id" />
      </section>

      <!-- Como foi -->
      <section class="ap__sec" aria-labelledby="ap-results">
        <h3 id="ap-results" class="ap__h">Como foi</h3>
        <textarea
          v-model="resultsDraft"
          class="mk-textarea"
          rows="4"
          maxlength="5000"
          :readonly="!canEdit"
          placeholder="Público, contatos feitos, o que funcionou e o que mudar na próxima"
          aria-labelledby="ap-results"
        />
        <div v-if="canEdit && resultsDirty" class="ap__row-actions">
          <button type="button" class="mk-btn mk-btn--primary" :disabled="resultsMutation.isPending.value" @click="resultsMutation.mutate()">
            Salvar anotações
          </button>
          <button type="button" class="mk-btn mk-btn--ghost" @click="resultsDraft = a.results ?? ''">Descartar</button>
        </div>
      </section>

      <section v-if="canDelete" class="ap__sec ap__danger">
        <button type="button" class="mk-btn mk-btn--danger" @click="deleteOpen = true">
          <Trash2 :size="14" aria-hidden="true" />
          Apagar ativação
        </button>
      </section>
    </div>

    <ActivationFormDialog v-model="editOpen" :group-id="groupId" :activation="a" />

    <ConfirmDialog
      v-model="photoRemoveOpen"
      title="Apagar esta foto?"
      :message="photoRemoveMessage"
      confirm-label="Apagar"
      danger
      :loading="photoRemoveMutation.isPending.value"
      @confirm="photoRemoveMutation.mutate()"
    />
    <ConfirmDialog
      v-model="deleteOpen"
      title="Apagar esta ativação?"
      :message="deleteMessage"
      confirm-label="Apagar"
      danger
      :loading="deleteMutation.isPending.value"
      @confirm="deleteMutation.mutate()"
    />
    <FileViewer v-if="viewer" :items="viewer.items" :start-index="viewer.start" @close="viewer = null" />
  </aside>
</template>

<style scoped>
.ap {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.ap__head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.ap__back {
  display: none;
}

.ap__heading {
  flex: 1;
  min-width: 0;
}

.ap__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  overflow-wrap: anywhere;
}

.ap__sub {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}

.ap__brand {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
}

.ap__body {
  display: flex;
  flex-direction: column;
}

.ap__sec {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.ap__sec:last-child {
  border-bottom: 0;
}

.ap__sec.is-drag {
  background: var(--accent-soft);
}

.ap__h {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.ap__count {
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
}

.ap__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
}

.ap__fact {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-width: 0;
}

.ap__k {
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
}

.ap__v {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  overflow-wrap: anywhere;
}

.ap__link {
  color: var(--accent-ink);
  font-weight: 600;
  text-decoration: none;
}

.ap__link:hover {
  text-decoration: underline;
}

.ap__status {
  width: auto;
  min-height: 28px;
  padding: 2px 8px;
  color: var(--mk-tone);
  font-weight: 600;
  border-color: color-mix(in srgb, var(--mk-tone) 40%, var(--border));
}

.ap__notes {
  margin: 0;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.ap__row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ap__bar {
  height: 4px;
  border-radius: 2px;
  background: var(--surface-3);
  overflow: hidden;
}

.ap__bar span {
  display: block;
  height: 100%;
  background: var(--success);
}

.ap__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ap__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ap__check {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  min-height: 34px;
  font-size: 13px;
  cursor: pointer;
}

.ap__check input {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  accent-color: var(--accent);
}

.ap__check.is-done span {
  color: var(--text-3);
  text-decoration: line-through;
}

.ap__add {
  display: flex;
  gap: 8px;
}

.ap__template {
  align-self: flex-start;
}

.ap__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 8px;
}

.ap__tile {
  position: relative;
  aspect-ratio: 1;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  overflow: hidden;
}

.ap__tile--busy {
  display: grid;
  place-items: center;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
}

.ap__tile-open {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}

.ap__tile-open img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ap__tile-ph {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--text-3);
}

.ap__tile-x {
  position: absolute;
  top: 0;
  right: 0;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
}

/* O quadradinho visível é menor que a área de toque (34px no mouse, 44px no celular). */
.ap__tile-x::before {
  content: '';
  position: absolute;
  top: 4px;
  right: 4px;
  width: 26px;
  height: 26px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  background: var(--surface);
}

.ap__tile-x svg {
  position: relative;
  top: -1px;
  left: 2px;
}

.ap__tile-x:hover {
  color: var(--err);
}

.ap__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.ap__exp {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.ap__exp:last-child {
  border-bottom: 0;
}

.ap__exp-date {
  color: var(--text-3);
}

.ap__exp-desc {
  display: flex;
  flex-direction: column;
  overflow-wrap: anywhere;
}

.ap__exp-desc small {
  color: var(--text-3);
  font-size: 12px;
}

.ap__exp-val {
  font-weight: 600;
}

.ap__danger {
  align-items: flex-start;
}

@media (max-width: 1100px) {
  .ap__back {
    display: inline-flex;
    flex-shrink: 0;
  }

  .ap__x {
    display: none;
  }
}

@media (max-width: 640px) {
  .ap__facts {
    grid-template-columns: 1fr;
  }

  .ap__check {
    min-height: 44px;
  }

  .ap__add {
    flex-direction: column;
  }

  .ap__tile-x {
    width: 44px;
    height: 44px;
  }

  .ap__tile-x::before {
    top: 6px;
    right: 6px;
  }

  .ap__tile-x svg {
    top: 0;
    left: 0;
  }

  .ap__link {
    min-height: 44px;
  }

  .ap__status {
    min-height: 44px;
  }

  .ap__tile-open,
  .ap__grid {
    touch-action: manipulation;
  }

  .ap__exp {
    grid-template-columns: 40px minmax(0, 1fr) auto;
  }

  .ap__exp .mk-chip {
    display: none;
  }
}
</style>
