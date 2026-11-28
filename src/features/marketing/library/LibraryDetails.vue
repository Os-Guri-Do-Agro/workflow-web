<script setup lang="ts">
/**
 * Detalhes do arquivo do Acervo: prévia, dados técnicos (dimensões, espaço de
 * cor, tamanho; o código de conferência, o sha256, fica em "Mais detalhes"),
 * quem enviou e quando, etiquetas e nota editáveis
 * e o "Usado em" com link para o card. Salva campo a campo; se a API recusar,
 * o campo volta ao valor anterior e a frase aparece.
 */
import { computed, reactive, ref, watch } from 'vue'
import {
  Copy,
  Download,
  FolderInput,
  Maximize2,
  Star,
  Trash2,
  X,
} from 'lucide-vue-next'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import {
  downloadLibraryItem,
  updateLibraryItem,
  type LibraryItem,
  type LibraryItemDetail,
} from '@/service/marketing/marketing-library'
import { cardStatusLabel, CARD_STATUS_TONE, formatBytes, toneStyle, type CardStatus } from '../marketing-labels'
import LibraryTagInput from './LibraryTagInput.vue'
import {
  formatColorSpace,
  formatDateTime,
  formatDimensions,
  formatDuration,
  itemPlace,
  KIND_ICON,
  KIND_LABEL,
  shortHash,
  viewUrlOf,
} from './library-meta'
import { useLibraryItem, useLibraryRefresh } from './useLibrary'

const props = defineProps<{
  groupId: string
  item: LibraryItem
  tagSuggestions: Array<{ tag: string; count: number }>
  /** Dentro da folha do celular: a folha já tem título e o botão de fechar */
  inSheet?: boolean
}>()

const emit = defineEmits<{
  close: []
  view: [item: LibraryItem]
  move: [item: LibraryItem]
  remove: [item: LibraryItem]
}>()

const toast = useToast()
const refresh = useLibraryRefresh(() => props.groupId)
const detailQuery = useLibraryItem(
  () => props.groupId,
  () => props.item.id,
)
/** O detalhe completo (com "Usado em") quando chegar; até lá, o da lista. */
const it = computed<LibraryItem | LibraryItemDetail>(() => detailQuery.data.value ?? props.item)
const usages = computed(() => detailQuery.data.value?.usages ?? null)
const canEdit = computed(() => it.value.me.canEdit)

const title = ref('')
const note = ref('')
const tags = ref<string[]>([])
const saving = ref(false)
/**
 * Etiquetas salvam a cada mudança, e duas mudanças seguidas podem estar no ar
 * juntas. Só a ÚLTIMA decide o que fica na tela: se ela falhar, volta ao
 * último valor que o servidor aceitou (não ao de antes da primeira mudança), e
 * o refetch do meio não pisa no que ainda está indo.
 */
let tagSeq = 0
let tagsConfirmedSeq = 0
let tagsInFlight = 0
let confirmedTags: string[] = []
/**
 * Campo com o foco não é sobrescrito pelo que chega do servidor (o detalhe
 * completo, o tempo real de outra pessoa, o refetch depois de salvar outro
 * campo): quem está digitando não perde o texto no meio.
 */
const editing = reactive({ title: false, note: false })

watch(
  it,
  (v) => {
    if (!editing.title) title.value = v.title
    if (!editing.note) note.value = v.note ?? ''
    if (!tagsInFlight) {
      tags.value = [...v.tags]
      confirmedTags = [...v.tags]
    }
  },
  { immediate: true },
)

async function save(patch: Parameters<typeof updateLibraryItem>[2], revert: () => void) {
  saving.value = true
  try {
    await updateLibraryItem(props.groupId, props.item.id, patch)
    refresh()
  } catch (error) {
    revert()
    toast.error(getApiErrorMessage(error, 'Não foi possível salvar. Tente de novo.'))
  } finally {
    saving.value = false
  }
}

function saveTitle() {
  editing.title = false
  const v = title.value.trim()
  const before = it.value.title
  if (!v) {
    title.value = before
    return
  }
  if (v === before) return
  void save({ title: v }, () => (title.value = before))
}

function saveNote() {
  editing.note = false
  const v = note.value.trim()
  const before = it.value.note ?? ''
  if (v === before.trim()) return
  void save({ note: v || null }, () => (note.value = before))
}

function onTags(next: string[]) {
  const seq = ++tagSeq
  const sent = [...next]
  tags.value = sent
  tagsInFlight++
  updateLibraryItem(props.groupId, props.item.id, { tags: sent })
    .then(() => {
      if (seq > tagsConfirmedSeq) {
        tagsConfirmedSeq = seq
        confirmedTags = sent
      }
    })
    .catch((error) => {
      if (seq !== tagSeq) return
      tags.value = [...confirmedTags]
      toast.error(getApiErrorMessage(error, 'Não foi possível salvar as etiquetas. Tente de novo.'))
    })
    .finally(() => {
      tagsInFlight--
      if (!tagsInFlight) refresh()
    })
}

function toggleStar() {
  void save({ starred: !it.value.starred }, () => undefined)
}

async function download() {
  try {
    await downloadLibraryItem(props.groupId, props.item.id)
  } catch (error) {
    toast.error(getApiErrorMessage(error, 'Não foi possível baixar o arquivo.'))
  }
}

async function copyHash() {
  const sha = it.value.asset.sha256
  if (!sha) return
  try {
    await navigator.clipboard.writeText(sha)
    toast.success('Código de conferência copiado.')
  } catch {
    toast.error('Não deu para copiar. Selecione e copie à mão.')
  }
}

const preview = computed(() => viewUrlOf(it.value))
const dims = computed(() => formatDimensions(it.value))
const duration = computed(() => formatDuration(it.value.asset.durationSec))
const colorSpace = computed(() => formatColorSpace(it.value.asset.colorSpace))
</script>

<template>
  <aside class="ldt" aria-label="Detalhes do arquivo" data-panel="details">
    <header class="ldt__head">
      <span class="ldt__kind">
        <component :is="KIND_ICON[it.kind]" :size="14" aria-hidden="true" />
        {{ KIND_LABEL[it.kind] }}
      </span>
      <span class="mk-toolbar__spacer" />
      <button
        v-if="canEdit"
        type="button"
        class="mk-icon-btn"
        :class="{ 'is-starred': it.starred }"
        :aria-pressed="it.starred"
        :aria-label="it.starred ? 'Tirar dos favoritos' : 'Marcar como favorito'"
        :title="it.starred ? 'Tirar dos favoritos' : 'Favorito do time'"
        data-action="star"
        @click="toggleStar"
      >
        <Star :size="16" aria-hidden="true" />
      </button>
      <button v-if="!inSheet" type="button" class="mk-icon-btn" aria-label="Fechar detalhes" @click="emit('close')">
        <X :size="16" aria-hidden="true" />
      </button>
    </header>

    <!-- Vídeo tem os próprios controles: fica fora de botão (controle dentro de
         controle não funciona no teclado nem no leitor de tela). Tela cheia
         pelo botão da barra de ações. -->
    <div v-if="it.kind === 'video' && it.url" class="ldt__preview is-video">
      <video :src="it.url" controls preload="metadata" playsinline :aria-label="`Vídeo ${it.title}`" />
    </div>
    <button v-else type="button" class="ldt__preview" :aria-label="`Ver ${it.title} em tela cheia`" @click="emit('view', it)">
      <img v-if="it.kind === 'imagem' && preview" :src="preview" alt="" />
      <component :is="KIND_ICON[it.kind]" v-else :size="40" class="ldt__preview-icon" aria-hidden="true" />
    </button>
    <p v-if="it.asset.hasPreview" class="mk-hint ldt__rgb">Prévia aproximada em RGB; o original em {{ colorSpace ?? 'CMYK' }} segue intacto.</p>

    <div class="ldt__actions">
      <button type="button" class="mk-btn" data-action="download" @click="download">
        <Download :size="14" aria-hidden="true" />
        Baixar
      </button>
      <button v-if="canEdit" type="button" class="mk-btn" data-action="move-one" @click="emit('move', it)">
        <FolderInput :size="14" aria-hidden="true" />
        Mover
      </button>
      <span class="mk-toolbar__spacer" />
      <button
        type="button"
        class="mk-icon-btn"
        aria-label="Tela cheia"
        title="Tela cheia"
        @click="emit('view', it)"
      >
        <Maximize2 :size="16" aria-hidden="true" />
      </button>
      <button
        v-if="it.me.canDelete"
        type="button"
        class="mk-icon-btn ldt__danger"
        aria-label="Mandar para a lixeira"
        title="Mandar para a lixeira"
        data-action="delete-one"
        @click="emit('remove', it)"
      >
        <Trash2 :size="16" aria-hidden="true" />
      </button>
    </div>

    <div class="ldt__body">
      <label class="mk-field">
        <span class="mk-label">Título</span>
        <input
          v-if="canEdit"
          v-model="title"
          class="mk-input"
          name="itemTitle"
          maxlength="200"
          @focus="editing.title = true"
          @blur="saveTitle"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />
        <span v-else class="ldt__title">{{ it.title }}</span>
      </label>

      <dl class="ldt__facts">
        <div>
          <dt>Lugar</dt>
          <dd>{{ itemPlace(it) }}</dd>
        </div>
        <div v-if="dims">
          <dt>Dimensões</dt>
          <dd>{{ dims }}</dd>
        </div>
        <div v-if="duration">
          <dt>Duração</dt>
          <dd>{{ duration }}</dd>
        </div>
        <div v-if="colorSpace">
          <dt>Espaço de cor</dt>
          <dd>{{ colorSpace }}</dd>
        </div>
        <div>
          <dt>Tamanho</dt>
          <dd>{{ formatBytes(it.asset.size) }}</dd>
        </div>
        <div>
          <dt>Arquivo</dt>
          <dd class="ldt__mono" :title="it.asset.name">{{ it.asset.name }}</dd>
        </div>
        <div>
          <dt>Enviado por</dt>
          <dd class="ldt__person">
            <template v-if="it.createdBy">
              <PersonAvatar :id="it.createdBy.id" :name="it.createdBy.name" :size="20" decorative />
              {{ it.createdBy.name }}
            </template>
            <span v-else>Ex-membro</span>
            <span class="ldt__when">{{ formatDateTime(it.createdAt) }}</span>
          </dd>
        </div>
      </dl>

      <details v-if="it.asset.sha256" class="ldt__more" data-section="more">
        <summary>Mais detalhes</summary>
        <dl class="ldt__facts">
          <div>
            <dt>Código de conferência</dt>
            <dd class="ldt__hash">
              <code :title="it.asset.sha256">{{ shortHash(it.asset.sha256) }}</code>
              <button
                type="button"
                class="mk-icon-btn ldt__copy"
                aria-label="Copiar o código de conferência completo"
                title="Copiar o código completo"
                @click="copyHash"
              >
                <Copy :size="13" aria-hidden="true" />
              </button>
            </dd>
          </div>
        </dl>
        <p class="mk-hint ldt__more-hint">
          É a impressão digital do arquivo: se o código de quem recebeu for igual a este, o arquivo chegou sem nenhuma mudança.
        </p>
      </details>

      <div class="mk-field">
        <span class="mk-label">Etiquetas</span>
        <LibraryTagInput
          :model-value="tags"
          :suggestions="tagSuggestions"
          :disabled="!canEdit"
          label="Etiquetas do arquivo"
          @update:model-value="onTags"
        />
      </div>

      <label class="mk-field">
        <span class="mk-label">Nota</span>
        <textarea
          v-if="canEdit"
          v-model="note"
          class="mk-textarea ldt__note"
          name="itemNote"
          maxlength="2000"
          placeholder="Para que serve, de onde veio, direitos de uso..."
          @focus="editing.note = true"
          @blur="saveNote"
        />
        <span v-else class="ldt__note-read">{{ it.note || 'Sem nota.' }}</span>
      </label>

      <section class="ldt__used" aria-label="Usado em" data-section="usages">
        <h3 class="mk-label">Usado em</h3>
        <Skeleton v-if="usages === null" type="text" :lines="2" />
        <p v-else-if="!usages.length" class="mk-hint">Ainda não foi usado em nenhum card.</p>
        <ul v-else class="ldt__used-list">
          <li v-for="u in usages" :key="u.id">
            <RouterLink
              class="ldt__used-link"
              :to="{ name: 'marketing-card', params: { cardId: u.cardId } }"
              :data-usage-card="u.cardId"
            >
              <span class="ldt__used-title">{{ u.versionNumber ? `V${u.versionNumber} de ` : '' }}{{ u.cardTitle }}</span>
              <span
                class="mk-chip"
                data-tone
                :style="toneStyle(CARD_STATUS_TONE[u.cardStatus as CardStatus])"
              >
                {{ cardStatusLabel(u.cardStatus as CardStatus) }}
              </span>
            </RouterLink>
            <span class="ldt__used-when">{{ formatDateTime(u.usedAt) }}{{ u.usedBy ? `, por ${u.usedBy.name}` : '' }}</span>
          </li>
        </ul>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.ldt {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--surface);
}

.ldt__head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 6px 6px 12px;
  border-bottom: 1px solid var(--border);
}

.ldt__kind {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
}

.mk-icon-btn.is-starred {
  color: var(--due-soon);
}

.mk-icon-btn.is-starred :deep(svg) {
  fill: currentColor;
}

.ldt__preview {
  display: grid;
  place-items: center;
  width: 100%;
  min-height: 160px;
  max-height: 280px;
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  cursor: zoom-in;
  overflow: hidden;
}

.ldt__preview.is-video {
  cursor: default;
}

.ldt__preview img,
.ldt__preview video {
  display: block;
  max-width: 100%;
  max-height: 280px;
  object-fit: contain;
}

.ldt__preview-icon {
  color: var(--text-3);
}

.ldt__rgb {
  margin: 6px 12px 0;
}

.ldt__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px 0;
}

.ldt__danger:hover {
  background: color-mix(in srgb, var(--err) 10%, transparent);
  color: var(--err);
}

.ldt__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px;
  overflow-y: auto;
}

.ldt__title {
  font-size: 14px;
  font-weight: 650;
  overflow-wrap: anywhere;
}

.ldt__facts {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
  margin: 0;
}

.ldt__facts > div {
  display: grid;
  grid-template-columns: 104px 1fr;
  gap: 8px;
  align-items: baseline;
  font-size: 12.5px;
}

.ldt__facts dt {
  color: var(--text-3);
}

.ldt__facts dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--text);
}

.ldt__mono {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ldt__hash {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ldt__hash code {
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: 12px;
}

.ldt__copy {
  width: 24px;
  height: 24px;
}

.ldt__more {
  font-size: 12.5px;
}

.ldt__more > summary {
  width: fit-content;
  padding: 2px 0;
  color: var(--text-2);
  font-weight: 600;
  cursor: pointer;
}

.ldt__more > summary:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 4px;
}

.ldt__more .ldt__facts {
  margin-top: 6px;
}

.ldt__more .ldt__facts > div {
  grid-template-columns: 150px 1fr;
}

.ldt__more-hint {
  margin: 6px 0 0;
}

.ldt__person {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.ldt__when {
  color: var(--text-3);
}

.ldt__note {
  min-height: 72px;
}

.ldt__note-read {
  color: var(--text-2);
  font-size: 13px;
  white-space: pre-wrap;
}

.ldt__used {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ldt__used h3 {
  margin: 0;
}

.ldt__used-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ldt__used-list li {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ldt__used-link {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--accent-ink);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.ldt__used-link:hover .ldt__used-title {
  text-decoration: underline;
}

.ldt__used-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ldt__used-when {
  color: var(--text-3);
  font-size: 11.5px;
}

@media (max-width: 640px) {
  .ldt__preview {
    min-height: 200px;
  }

  .ldt__more > summary {
    display: flex;
    align-items: center;
    min-height: 44px;
  }

  .ldt__copy {
    width: 40px;
    height: 40px;
  }
}
</style>
