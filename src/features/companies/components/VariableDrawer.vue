<script setup lang="ts">
/**
 * Drawer da variável: edição dos campos e o Histórico.
 *
 * Segredo (nov/2026): a API devolve SECRET mascarado (`value: null`). Revelar e
 * copiar um segredo pedem o valor ao `POST /company-variable/:id/reveal`, que
 * registra quem viu. O valor revelado fica só na memória desta tela, some em
 * 30 s ou ao fechar o drawer, e NUNCA vai no PATCH: salvar manda só o que
 * mudou, e um SECRET que ninguém digitou vai sem `value` (a API mantém o
 * guardado). É o que impede a edição de apagar a senha só porque a tela
 * recebeu `null`.
 */
import { ref, watch, computed, nextTick, onBeforeUnmount } from 'vue'
import {
  X,
  Plus,
  Download,
  Copy,
  Trash2,
  Camera,
  Save,
  KeyRound,
  Eye,
  Pencil,
  PlusCircle,
  History,
  Loader2,
} from 'lucide-vue-next'
import VariableFieldInput from './VariableFieldInput.vue'
import { useEnvExport, type VariableField } from './useEnvExport'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import companyVariableService, {
  type VariableHistoryEvent,
} from '@/service/companies/variables/variables-services'
import { getApiErrorMessage } from '@/service/api'
import { copyText } from '@/utils/clipboard'
import { useToast } from '@/composables/useToast'

type VarType = 'TEXT' | 'URL' | 'SECRET'

interface Variable {
  id?: string
  name: string
  description?: string
  imageUrl?: string
  fields: VariableField[]
  updatedAt?: string
}

/** Campo do rascunho: guarda de onde veio para o PATCH saber o que mudou. */
interface DraftField extends VariableField {
  uid: number
  originalType?: VarType
  /** O valor foi digitado nesta edição (só importa para SECRET). */
  edited: boolean
}

interface Draft {
  id?: string
  name: string
  description: string
  imageUrl?: string
  fields: DraftField[]
}

const REVEAL_MS = 30_000

const props = defineProps<{
  modelValue: boolean
  variable: Variable | null
  saving?: boolean
  uploadingImage?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [id: string, patch: Record<string, unknown>]
  delete: [id: string]
  'upload-image': [file: File]
  copied: [message: string]
}>()

const { error: showError } = useToast()
const { copyEnv, downloadEnv } = useEnvExport()

const activeTab = ref<'fields' | 'history'>('fields')
const draft = ref<Draft>(emptyDraft())
const fileInput = ref<HTMLInputElement | null>(null)
let nextUid = 1

/** Segredos à vista agora (por `uid`) e o texto que a API revelou. */
const visible = ref(new Set<number>())
const revealedValues = ref<Record<number, string>>({})
const revealingUid = ref<number | null>(null)
const timers = new Map<number, ReturnType<typeof setTimeout>>()

const history = ref<VariableHistoryEvent[]>([])
const historyLoading = ref(false)
const historyError = ref('')
const historyStale = ref(true)

function emptyDraft(): Draft {
  return { name: '', description: '', imageUrl: '', fields: [] }
}

function toDraftField(f: VariableField): DraftField {
  return {
    ...f,
    uid: nextUid++,
    originalKey: f.key,
    originalType: f.type,
    edited: false,
  }
}

function hideAll() {
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
  visible.value = new Set()
  revealedValues.value = {}
}

function hide(uid: number) {
  const t = timers.get(uid)
  if (t) clearTimeout(t)
  timers.delete(uid)
  const next = new Set(visible.value)
  next.delete(uid)
  visible.value = next
  const { [uid]: _drop, ...rest } = revealedValues.value
  revealedValues.value = rest
}

function show(uid: number) {
  visible.value = new Set(visible.value).add(uid)
  const old = timers.get(uid)
  if (old) clearTimeout(old)
  timers.set(
    uid,
    setTimeout(() => hide(uid), REVEAL_MS),
  )
}

watch(
  () => props.variable,
  (v) => {
    hideAll()
    draft.value = v
      ? {
          id: v.id,
          name: v.name,
          description: v.description ?? '',
          imageUrl: v.imageUrl,
          fields: (v.fields ?? []).map(toDraftField),
        }
      : emptyDraft()
    activeTab.value = 'fields'
    history.value = []
    historyStale.value = true
  },
  { immediate: true },
)

// Fechou o drawer: todo segredo revelado sai da tela e da memória. O foco entra
// no painel ao abrir (Esc funciona sem clique) e volta para quem abriu.
const panel = ref<HTMLElement | null>(null)
let lastFocus: HTMLElement | null = null
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      lastFocus = document.activeElement as HTMLElement | null
      void nextTick(() => panel.value?.focus())
    } else {
      hideAll()
      lastFocus?.focus?.()
      lastFocus = null
    }
  },
)

onBeforeUnmount(hideAll)

const findField = (uid: number) => draft.value.fields.find((f) => f.uid === uid)

/** Segredo guardado que a tela não conhece: o PATCH manda sem `value`. */
const keepsStored = (f: DraftField) =>
  f.type === 'SECRET' && f.originalType === 'SECRET' && !!f.originalKey && f.value == null

/** Como o campo se compara para saber se mudou (segredo intacto = null). */
const signature = (f: { key: string; type: VarType; value: string | null }) => ({
  k: f.key.trim(),
  t: f.type,
  v: f.value,
})

const patch = computed<Record<string, unknown>>(() => {
  const v = props.variable
  if (!v) return {}
  const out: Record<string, unknown> = {}
  const name = draft.value.name.trim()
  if (name && name !== v.name) out.name = name
  if ((draft.value.description ?? '') !== (v.description ?? '')) {
    out.description = draft.value.description
  }
  const current = draft.value.fields.filter((f) => f.key.trim())
  const before = JSON.stringify((v.fields ?? []).map(signature))
  const after = JSON.stringify(current.map(signature))
  if (before !== after) {
    out.fields = current.map((f) => {
      const field: Record<string, unknown> = { key: f.key.trim(), type: f.type }
      if (f.originalKey) field.originalKey = f.originalKey
      if (f.value != null) field.value = f.value
      return field
    })
  }
  return out
})

const hasChanges = computed(() => Object.keys(patch.value).length > 0)

/** Revela pela API (fica no Histórico). Devolve o valor do campo. */
async function fetchSecret(f: DraftField): Promise<string> {
  if (!draft.value.id || !f.originalKey) throw new Error('Salve a variável antes de revelar')
  const res = await companyVariableService.revealVariable(draft.value.id, f.originalKey)
  historyStale.value = true
  // Mesma chave repetida: a ordem é a de quem tem essa chave no rascunho.
  const sameKey = draft.value.fields.filter((x) => keepsStored(x) && x.originalKey === f.originalKey)
  const pos = Math.max(0, sameKey.findIndex((x) => x.uid === f.uid))
  const values = res.fields.filter((x) => x.key === f.originalKey).map((x) => x.value)
  const value = values[pos] ?? values[0]
  if (value === undefined) throw new Error('Segredo não encontrado')
  return value
}

const toggleReveal = async (uid: number) => {
  const f = findField(uid)
  if (!f) return
  if (visible.value.has(uid)) {
    hide(uid)
    return
  }
  // Valor digitado agora (ou campo novo): já está na tela, só mostra.
  if (f.value != null) {
    show(uid)
    return
  }
  revealingUid.value = uid
  try {
    const value = await fetchSecret(f)
    revealedValues.value = { ...revealedValues.value, [uid]: value }
    show(uid)
    if (activeTab.value === 'history') void loadHistory()
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não deu para revelar o segredo'))
  } finally {
    revealingUid.value = null
  }
}

const copySecret = async (uid: number) => {
  const f = findField(uid)
  if (!f) return
  revealingUid.value = uid
  try {
    const known = revealedValues.value[uid]
    await copyText(known !== undefined ? known : fetchSecret(f))
    emit('copied', 'Valor copiado')
    if (activeTab.value === 'history') void loadHistory()
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não deu para copiar o segredo'))
  } finally {
    revealingUid.value = null
  }
}

const addField = () => {
  draft.value.fields.push({ key: '', value: '', type: 'TEXT', uid: nextUid++, edited: true })
}

const removeField = (uid: number) => {
  hide(uid)
  draft.value.fields = draft.value.fields.filter((f) => f.uid !== uid)
}

const updateFieldKey = (uid: number, value: string) => {
  const f = findField(uid)
  if (f) f.key = value
}

const updateFieldValue = (uid: number, value: string) => {
  const f = findField(uid)
  if (!f) return
  // Apagou tudo num segredo guardado que não estava à vista: volta a "manter".
  if (
    value === '' &&
    f.type === 'SECRET' &&
    f.originalType === 'SECRET' &&
    !visible.value.has(uid)
  ) {
    f.value = null
    f.edited = false
    return
  }
  f.value = value
  f.edited = true
}

const updateFieldType = (uid: number, type: VarType) => {
  const f = findField(uid)
  if (!f || f.type === type) return
  // Deixar de ser segredo exige o valor na tela: o revelado, se houver, ou vazio
  // para a pessoa digitar. Mandar sem valor faria a API recusar.
  if (f.type === 'SECRET' && f.value == null) {
    f.value = revealedValues.value[uid] ?? ''
    f.edited = true
  }
  f.type = type
}

const save = () => {
  if (!draft.value.id || !draft.value.name.trim()) return
  const missing = draft.value.fields.find(
    (f) => f.key.trim() && !keepsStored(f) && !(f.value ?? '').length,
  )
  if (missing) {
    showError(`Preencha o valor de "${missing.key.trim()}".`)
    return
  }
  if (!hasChanges.value) {
    emit('copied', 'Nada mudou')
    return
  }
  emit('save', draft.value.id, patch.value)
}

const close = () => emit('update:modelValue', false)

const triggerUpload = () => fileInput.value?.click()

const onFileChange = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) emit('upload-image', file)
}

const envSource = () => ({
  id: draft.value.id,
  name: draft.value.name,
  description: draft.value.description,
  fields: draft.value.fields,
})

const copyAsEnv = async () => {
  if (!draft.value.name) return
  try {
    await copyEnv([envSource()])
    historyStale.value = true
    emit('copied', 'Variável copiada como .env')
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não foi possível copiar'))
  }
}

const downloadAsEnv = async () => {
  if (!draft.value.name) return
  try {
    await downloadEnv([envSource()], `${draft.value.name}.env`)
    historyStale.value = true
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não foi possível baixar o .env'))
  }
}

// ─── Histórico ──────────────────────────────────────────────────────────────

async function loadHistory() {
  if (!draft.value.id) return
  historyLoading.value = true
  historyError.value = ''
  try {
    history.value = await companyVariableService.getVariableHistory(draft.value.id)
    historyStale.value = false
  } catch (err) {
    historyError.value = getApiErrorMessage(err, 'Não deu para carregar o histórico.')
  } finally {
    historyLoading.value = false
  }
}

watch(activeTab, (tab) => {
  if (tab === 'history' && historyStale.value) void loadHistory()
})

const VERB_ICON: Record<string, typeof Eye> = {
  secret_revealed: Eye,
  updated: Pencil,
  created: PlusCircle,
}

const relative = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `há ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `há ${days} ${days === 1 ? 'dia' : 'dias'}`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

const absolute = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
</script>

<template>
  <!-- Teleport para o body: dentro do <main> do shell o drawer ficava ATRÁS
       da topbar (o nome e o fechar sumiam) e, no celular, da tab bar (o Salvar
       sumia). Regra do src/CLAUDE.md para overlay de tela cheia. -->
  <Teleport to="body">
    <Transition name="vd">
      <div v-if="modelValue" class="vd-overlay" @mousedown.self="close" @keydown.esc.stop="close">
        <aside
          ref="panel"
          class="var-drawer"
          role="dialog"
          aria-modal="true"
          :aria-label="draft.name ? `Variável ${draft.name}` : 'Variável'"
          tabindex="-1"
        >
    <div class="drawer-body">
      <!-- Header -->
      <header class="drawer-header">
        <div class="header-icon">
          <img v-if="draft.imageUrl" :src="draft.imageUrl" class="header-img" alt="" />
          <div v-else class="header-avatar">
            <KeyRound :size="18" />
          </div>
          <button class="upload-btn" aria-label="Trocar imagem" @click="triggerUpload" :disabled="uploadingImage">
            <Camera :size="12" />
          </button>
          <input ref="fileInput" type="file" accept="image/*" class="file-hidden" @change="onFileChange" />
        </div>
        <div class="header-info">
          <input v-model="draft.name" class="header-name" placeholder="Nome da variável" aria-label="Nome da variável" />
          <input v-model="draft.description" class="header-desc" placeholder="Descrição (opcional)" aria-label="Descrição" />
        </div>
        <button class="close-btn" aria-label="Fechar" @click="close"><X :size="16" /></button>
      </header>

      <!-- Tabs -->
      <div class="drawer-tabs" role="tablist">
        <button
          class="tab-btn"
          role="tab"
          :aria-selected="activeTab === 'fields'"
          :class="{ 'tab-btn--active': activeTab === 'fields' }"
          @click="activeTab = 'fields'"
        >
          Campos
          <span class="tab-count">{{ draft.fields.length }}</span>
        </button>
        <button
          class="tab-btn"
          role="tab"
          :aria-selected="activeTab === 'history'"
          :class="{ 'tab-btn--active': activeTab === 'history' }"
          @click="activeTab = 'history'"
        >
          Histórico
        </button>
        <div class="tab-actions">
          <button class="tab-action-btn" title="Copiar como .env" aria-label="Copiar como .env" @click="copyAsEnv">
            <Copy :size="13" />
          </button>
          <button class="tab-action-btn" title="Baixar .env" aria-label="Baixar .env" @click="downloadAsEnv">
            <Download :size="13" />
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="drawer-content">
        <div v-if="activeTab === 'fields'" class="fields-content">
          <VariableFieldInput
            v-for="field in draft.fields"
            :key="field.uid"
            :field="field"
            :reveal="visible.has(field.uid)"
            :revealed-value="revealedValues[field.uid] ?? null"
            :revealing="revealingUid === field.uid"
            :editable="true"
            @update:key="updateFieldKey(field.uid, $event)"
            @update:value="updateFieldValue(field.uid, $event)"
            @update:type="updateFieldType(field.uid, $event)"
            @toggle-reveal="toggleReveal(field.uid)"
            @copy="emit('copied', 'Valor copiado')"
            @copy-secret="copySecret(field.uid)"
            @remove="removeField(field.uid)"
          />
          <p v-if="draft.fields.some((f) => f.type === 'SECRET')" class="fields-note">
            Segredo fica oculto. Revelar e copiar ficam no Histórico, e o valor some da tela em 30
            segundos.
          </p>
          <button class="add-field-btn" @click="addField">
            <Plus :size="13" />
            <span>Adicionar campo</span>
          </button>
        </div>

        <div v-else class="history-content" aria-live="polite">
          <div v-if="historyLoading && !history.length" class="history-state">
            <Loader2 :size="15" class="history-spin" />
            Carregando histórico
          </div>
          <div v-else-if="historyError" class="history-state history-state--err" role="alert">
            {{ historyError }}
            <button class="ghost-btn" type="button" @click="loadHistory">Tentar de novo</button>
          </div>
          <div v-else-if="!history.length" class="history-empty">
            <History :size="18" class="history-empty-icon" />
            <p class="history-title">Nada registrado ainda</p>
            <p class="history-desc">
              Quem criar, editar ou revelar um segredo desta variável aparece aqui, com dia e hora.
            </p>
          </div>
          <ol v-else class="history-list">
            <li v-for="event in history" :key="event.id" class="history-item">
              <PersonAvatar
                :id="event.actor?.id ?? event.actorId"
                :name="event.actor?.name ?? 'Alguém'"
                :size="24"
                variant="soft"
                decorative
              />
              <div class="history-text">
                <p class="history-line">
                  <strong>{{ event.actor?.name ?? 'Alguém' }}</strong>
                  {{ event.summary }}
                </p>
                <time class="history-time" :datetime="event.createdAt" :title="absolute(event.createdAt)">
                  {{ relative(event.createdAt) }}
                </time>
              </div>
              <component :is="VERB_ICON[event.verb] ?? Pencil" :size="13" class="history-verb" />
            </li>
          </ol>
        </div>
      </div>

      <!-- Footer -->
      <footer class="drawer-footer">
        <button
          v-if="variable?.id"
          class="danger-btn"
          @click="variable && variable.id && emit('delete', variable.id)"
        >
          <Trash2 :size="13" />
          <span>Excluir</span>
        </button>
        <div class="footer-spacer" />
        <button class="ghost-btn" @click="close">Cancelar</button>
        <button class="save-btn" :disabled="!draft.name.trim() || saving" @click="save">
          <Save :size="13" />
          <span>{{ saving ? 'Salvando…' : hasChanges ? 'Salvar alterações' : 'Salvar' }}</span>
        </button>
      </footer>
    </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Abaixo do AppDialog (5000: o confirmar exclusão abre por cima) e acima do
   shell e da comemoração do Nevo (4000). */
.vd-overlay {
  position: fixed;
  inset: 0;
  z-index: 4500;
  display: flex;
  justify-content: flex-end;
  background: var(--scrim);
}

.var-drawer {
  width: min(480px, 100vw);
  height: 100%;
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow-overlay);
  outline: none;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  box-sizing: border-box;
}

.vd-enter-active,
.vd-leave-active {
  transition: opacity var(--motion) var(--motion-ease);
}
.vd-enter-active .var-drawer,
.vd-leave-active .var-drawer {
  transition: transform var(--motion) var(--motion-ease);
}
.vd-enter-from,
.vd-leave-to {
  opacity: 0;
}
.vd-enter-from .var-drawer,
.vd-leave-to .var-drawer {
  transform: translateX(24px);
}

.drawer-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface);
  color: var(--text);
}

.drawer-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 16px 16px;
  border-bottom: 1px solid var(--border);
}

.header-icon {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.header-img {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  object-fit: cover;
  background: var(--surface-2);
}

.header-avatar {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
}

.upload-btn {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--text);
  color: var(--bg);
  border: 2px solid var(--surface);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  transition: transform var(--motion-fast) var(--motion-ease);
}

.upload-btn:hover {
  transform: scale(1.08);
}

.upload-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.file-hidden {
  display: none;
}

.header-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.header-name,
.header-desc {
  background: transparent;
  border: none;
  outline: none;
  font-family: inherit;
  color: var(--text);
  width: 100%;
  padding: 2px 0;
  border-bottom: 1px solid transparent;
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.header-name {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.header-name:focus,
.header-desc:focus {
  border-color: var(--border-strong);
}

.header-desc {
  font-size: 12px;
  color: var(--text-3);
}

.close-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-3);
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  transition: background var(--motion-fast) var(--motion-ease);
}

.close-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.drawer-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
}

.tab-btn {
  background: transparent;
  border: none;
  padding: 10px 4px;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-3);
  cursor: pointer;
  position: relative;
  transition: color var(--motion-fast) var(--motion-ease);
}

.tab-btn:hover {
  color: var(--text-2);
}

.tab-btn--active {
  color: var(--text);
}

.tab-btn--active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--accent);
  border-radius: 2px;
}

.tab-count {
  display: inline-block;
  margin-left: 6px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-4);
  background: var(--surface-2);
  padding: 1px 6px;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
}

.tab-actions {
  margin-left: auto;
  display: inline-flex;
  gap: 2px;
}

.tab-action-btn {
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-3);
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.tab-action-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
}

.fields-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fields-note {
  margin: 2px 2px 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-3);
}

.add-field-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 9px;
  background: var(--surface-2);
  border: 1px dashed var(--border-strong);
  color: var(--text-2);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  margin-top: 6px;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.add-field-btn:hover {
  background: var(--surface-3);
  border-color: var(--text-3);
  color: var(--text);
}

/* ---- Histórico ---- */
.history-content {
  display: flex;
  flex-direction: column;
}

.history-state {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 16px 0;
  font-size: 13px;
  color: var(--text-3);
}

.history-state--err {
  color: var(--err);
}

.history-spin {
  animation: history-spin 0.85s linear infinite;
}

@keyframes history-spin {
  to {
    transform: rotate(360deg);
  }
}

.history-empty {
  max-width: 360px;
  margin: 32px auto 0;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.history-empty-icon {
  color: var(--text-3);
}

.history-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.history-desc {
  font-size: 12px;
  color: var(--text-3);
  margin: 0;
  line-height: 1.5;
}

.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.history-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  padding: 10px 2px;
  border-bottom: 1px solid var(--border);
}

.history-item:last-child {
  border-bottom: none;
}

.history-text {
  min-width: 0;
}

.history-line {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.history-line strong {
  color: var(--text);
  font-weight: 600;
}

.history-time {
  font-size: 12px;
  color: var(--text-3);
}

.history-verb {
  margin-top: 3px;
  color: var(--text-3);
}

.drawer-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

.footer-spacer {
  flex: 1;
}

/* No desktop o botão do assistente (fixo, 52px a 22px do canto, z 9996) fica
   por cima de qualquer overlay: o Salvar não pode morar embaixo dele. No
   celular o botão não existe. */
@media (min-width: 900px) {
  .drawer-footer {
    padding-right: 90px;
  }
}

.danger-btn,
.ghost-btn,
.save-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 30px;
  border-radius: 7px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    opacity var(--motion-fast) var(--motion-ease);
}

.danger-btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--err);
}

.danger-btn:hover {
  background: color-mix(in srgb, var(--err) 14%, transparent);
}

.ghost-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-2);
}

.ghost-btn:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.save-btn {
  background: var(--text);
  color: var(--bg);
  border: none;
}

.save-btn:hover:not(:disabled) {
  opacity: 0.92;
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .history-spin {
    animation-duration: 1.8s;
  }
  .vd-enter-active,
  .vd-leave-active,
  .vd-enter-active .var-drawer,
  .vd-leave-active .var-drawer {
    transition-duration: 1ms;
  }
}
</style>
