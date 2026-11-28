<script setup lang="ts">
/**
 * "Mandar para o acervo": copia um arquivo da ala (versão do card, foto da
 * ativação) para o Acervo, sem baixar nem subir de novo (cópia do lado do
 * servidor, mesmo sha256). Escolhe a pasta e o título. Já no Acervo: mostra
 * onde e oferece "Manter os dois".
 *
 * Destino: só a MARCA DO ARQUIVO ou a Geral do grupo (a API recusa outra
 * marca com 400). É o espelho do "Escolher do acervo", que só aceita item da
 * marca do card ou da Geral: a cópia numa marca B mostraria a arte da marca A
 * a quem só vê a B.
 *
 * Uso (no visualizador de versão ou na ativação):
 *   <SendToLibraryDialog v-model="sendOpen" :group-id="groupId" :asset-id="asset.id"
 *     :company-id="card.companyId" :default-title="asset.name" @sent="onSent" />
 */
import { computed, ref, watch } from 'vue'
import { Images, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import {
  duplicateFromError,
  isLibraryUnavailable,
  sendAssetToLibrary,
  type LibraryDuplicate,
  type LibraryItemDetail,
} from '@/service/marketing/marketing-library'
import LibraryFolderTree from './LibraryFolderTree.vue'
import { GERAL_PARAM, locationKey, placeLabel, type LibrarySelection } from './library-meta'
import { useLibraryRefresh, useLibraryTree } from './useLibrary'
import './library.css'

const props = defineProps<{
  modelValue: boolean
  groupId: string
  assetId: string
  /** Marca do arquivo (o card ou a ativação); é o destino sugerido */
  companyId: string | null
  defaultTitle: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  sent: [item: LibraryItemDetail]
}>()

const toast = useToast()
const refresh = useLibraryRefresh(() => props.groupId)
const treeQuery = useLibraryTree(() => (props.modelValue ? props.groupId : null))
/** Só os dois lugares que aceitam a cópia: a marca do arquivo e a Geral do grupo. */
const allowed = (companyId: string | null) => companyId === null || companyId === props.companyId
const locations = computed(() => (treeQuery.data.value?.locations ?? []).filter((l) => allowed(l.companyId)))
const folders = computed(() => (treeQuery.data.value?.folders ?? []).filter((f) => allowed(f.companyId)))
const brandName = computed(() => locations.value.find((l) => l.companyId !== null)?.name ?? null)

const place = ref<LibrarySelection>({ companyId: undefined, folderId: null })
const title = ref('')
const saving = ref(false)
const error = ref('')
const duplicate = ref<LibraryDuplicate | null>(null)

function cleanTitle(name: string) {
  return name.replace(/\.[a-z0-9]{1,8}$/i, '').trim() || name
}

function resetPlace() {
  const preferred = locations.value.find((l) => l.companyId === props.companyId && l.canWrite)
  const first = preferred ?? locations.value.find((l) => l.canWrite)
  place.value = { companyId: first ? first.companyId : undefined, folderId: null }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    title.value = cleanTitle(props.defaultTitle)
    error.value = ''
    duplicate.value = null
    resetPlace()
  },
  { immediate: true },
)
watch(locations, () => {
  if (props.modelValue && place.value.companyId === undefined) resetPlace()
})

const dest = computed(() => {
  if (place.value.companyId === undefined) return null
  const loc = locations.value.find((l) => l.companyId === place.value.companyId)
  if (!loc?.canWrite) return null
  const folder = place.value.folderId ? folders.value.find((f) => f.id === place.value.folderId) : undefined
  return { companyId: loc.companyId, folderId: folder?.id ?? null, label: placeLabel(loc, folder) }
})
const noWrite = computed(() => treeQuery.isSuccess.value && !locations.value.some((l) => l.canWrite))
const unavailable = computed(() => isLibraryUnavailable(treeQuery.error.value))

const libraryLink = computed(() => {
  const d = duplicate.value
  if (!d) return null
  return {
    name: 'marketing-library',
    query: { local: d.companyId === null ? GERAL_PARAM : locationKey(d.companyId), ...(d.folderId ? { pasta: d.folderId } : {}), item: d.itemId },
  }
})

async function send(keepBoth = false) {
  if (!dest.value || !title.value.trim()) return
  saving.value = true
  error.value = ''
  try {
    const item = await sendAssetToLibrary(props.groupId, {
      assetId: props.assetId,
      companyId: dest.value.companyId,
      folderId: dest.value.folderId,
      title: title.value.trim(),
      keepBoth: keepBoth || undefined,
    })
    refresh()
    toast.success(`Mandado para o acervo em ${dest.value.label}.`)
    emit('sent', item)
    emit('update:modelValue', false)
  } catch (err) {
    const dup = duplicateFromError(err)
    if (dup && !keepBoth) duplicate.value = dup
    else error.value = getApiErrorMessage(err, 'Não foi possível mandar para o acervo.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    label="Mandar para o acervo"
    size="md"
    :loading="saving"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <header class="lib-dlg__head">
      <div class="lib-dlg__title">
        <Images :size="16" aria-hidden="true" />
        <h2>Mandar para o acervo</h2>
      </div>
      <button type="button" class="mk-icon-btn" aria-label="Fechar" :disabled="saving" @click="emit('update:modelValue', false)">
        <X :size="15" aria-hidden="true" />
      </button>
    </header>
    <div class="lib-dlg__body" data-dialog="send-to-library">
      <p v-if="unavailable" class="lib-warn" role="status">O Acervo ainda não está disponível no servidor. Tente de novo em alguns minutos.</p>
      <p v-else-if="noWrite" class="lib-warn" role="status">Seu papel não envia arquivos para o Acervo.</p>
      <template v-else>
        <p class="lib-note">Vai uma cópia: o arquivo daqui continua como está, e apagar um não apaga o outro.</p>
        <p class="mk-hint" data-hint="places">
          {{ brandName ? `Vai para ${brandName} ou para a Geral do grupo.` : 'Vai para a Geral do grupo.' }}
          Outra marca não entra: lá o arquivo apareceria para quem não vê esta marca.
        </p>
        <label class="mk-field">
          <span class="mk-label">Título no acervo</span>
          <input v-model="title" class="mk-input" name="libraryTitle" maxlength="200" :disabled="saving" />
        </label>
        <div class="mk-field">
          <span class="mk-label">Pasta</span>
          <div class="lib-pick-box">
            <Skeleton v-if="treeQuery.isLoading.value" type="text" :lines="4" />
            <LibraryFolderTree
              v-else
              :locations="locations"
              :folders="folders"
              :selection="place"
              mode="pick"
              writable-only
              @select="place = $event"
            />
          </div>
        </div>
        <div v-if="duplicate" class="lib-warn" role="alert" data-duplicate>
          <span>
            Este arquivo já está no acervo em <strong>{{ duplicate.folderPath }}</strong>
            <template v-if="duplicate.title"> (como "{{ duplicate.title }}")</template>.
            <RouterLink v-if="libraryLink" class="stl__link" :to="libraryLink" @click="emit('update:modelValue', false)">Abrir no Acervo</RouterLink>
          </span>
        </div>
        <p v-if="error" class="mk-error" role="alert">{{ error }}</p>
      </template>
    </div>
    <footer class="lib-dlg__foot">
      <span class="lib-dlg__foot-note">{{ dest ? `Para: ${dest.label}` : 'Escolha uma pasta' }}</span>
      <button type="button" class="mk-btn mk-btn--ghost" :disabled="saving" @click="emit('update:modelValue', false)">Cancelar</button>
      <button
        v-if="duplicate"
        type="button"
        class="mk-btn mk-btn--primary"
        data-action="send-keep-both"
        :disabled="saving || !dest"
        @click="send(true)"
      >
        Manter os dois
      </button>
      <button
        v-else
        type="button"
        class="mk-btn mk-btn--primary"
        data-action="send-to-library"
        :disabled="saving || !dest || !title.trim() || noWrite || unavailable"
        @click="send()"
      >
        {{ saving ? 'Copiando...' : 'Mandar para o acervo' }}
      </button>
    </footer>
  </AppDialog>
</template>

<style scoped>
.stl__link {
  color: var(--accent-ink);
  font-weight: 600;
  text-decoration: none;
}

.stl__link:hover {
  text-decoration: underline;
}
</style>
