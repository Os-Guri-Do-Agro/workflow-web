<script setup lang="ts">
/**
 * "Seu perfil" nas Configurações (`/settings#perfil`): a foto de quem está
 * logado, com trocar e remover.
 *
 * Fluxo da troca: escolher (botão ou arrastar e soltar na área) → validar no
 * cliente (JPG, PNG ou WebP até 5 MB) → PRÉVIA no avatar grande → "Salvar foto"
 * envia (`POST /user/me/avatar`, multipart) → o cache do diretório de pessoas
 * recebe a URL nova na hora e é invalidado, então todo `PersonAvatar` da tela
 * troca junto. Nada sobe antes da pessoa ver como ficou.
 *
 * O servidor corta em quadrado de 512 px e converte para WebP; a validação
 * daqui só evita mandar o que ele vai recusar. Sem o banco preparado
 * (migration pendente) o POST volta 503 com a mensagem pronta em PT-BR, e é
 * ela que aparece.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { Camera, ImageUp, Loader2, Trash2 } from 'lucide-vue-next'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { applyMyAvatar, usePeopleDirectory } from '@/composables/usePeopleDirectory'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import userService, { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '@/service/user/user-service'
import { getUserToken } from '@/utils/authContent'

const queryClient = useQueryClient()
const { success: toastSuccess, error: toastError } = useToast()

const token = getUserToken()
const myId = token?.sub ?? null
const myName = token?.name?.trim() || 'Você'
const myEmail = token?.email ?? ''

const directory = usePeopleDirectory()
/** Só pelo id: pelo nome poderia achar outra pessoa homônima. */
const hasPhoto = computed(() => !!myId && !!directory.personFor({ id: myId })?.avatarUrl)

const fileInput = ref<HTMLInputElement | null>(null)
const pending = ref<{ file: File; url: string } | null>(null)
const uploading = ref(false)
const removing = ref(false)
const confirmOpen = ref(false)
const error = ref<string | null>(null)
const dragDepth = ref(0)
const dragging = computed(() => dragDepth.value > 0)

const busy = computed(() => uploading.value || removing.value)

const ACCEPT = AVATAR_MIME_TYPES.join(',')
const MAX_MB = Math.round(AVATAR_MAX_BYTES / (1024 * 1024))

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

/** Mensagem pronta para a tela, ou `null` quando o arquivo pode seguir. */
function validate(file: File): string | null {
  const byType = (AVATAR_MIME_TYPES as readonly string[]).includes(file.type)
  // Alguns sistemas não informam o tipo; aí vale a extensão.
  const byName = !file.type && /\.(jpe?g|png|webp)$/i.test(file.name)
  if (!byType && !byName) return 'Formato não aceito. Use uma imagem JPG, PNG ou WebP.'
  if (file.size === 0) return 'O arquivo está vazio. Escolha outra imagem.'
  if (file.size > AVATAR_MAX_BYTES) {
    return `A imagem tem ${formatMb(file.size)} e o limite é ${MAX_MB} MB. Escolha uma menor.`
  }
  return null
}

function clearPending() {
  if (pending.value) URL.revokeObjectURL(pending.value.url)
  pending.value = null
}

/** "Cancelar": descarta a prévia e o erro da tentativa (a foto atual continua). */
function cancel() {
  clearPending()
  error.value = null
}

function take(file: File | null | undefined) {
  if (!file || busy.value) return
  const problem = validate(file)
  if (problem) {
    error.value = problem
    return
  }
  error.value = null
  clearPending()
  pending.value = { file, url: URL.createObjectURL(file) }
}

function pickFile() {
  if (busy.value) return
  fileInput.value?.click()
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  take(input.files?.[0])
  // Escolher o MESMO arquivo de novo (depois de cancelar) precisa disparar o change.
  input.value = ''
}

// ── Arrastar e soltar: contador, porque o dragleave dispara ao passar por cima
// de cada filho da área e a borda piscaria.
function hasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function onDragEnter(event: DragEvent) {
  if (!hasFiles(event) || busy.value) return
  dragDepth.value++
}

function onDragOver(event: DragEvent) {
  if (!hasFiles(event) || busy.value) return
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

function onDragLeave(event: DragEvent) {
  if (!hasFiles(event)) return
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}

function onDrop(event: DragEvent) {
  dragDepth.value = 0
  take(event.dataTransfer?.files?.[0])
}

async function save() {
  if (!pending.value || busy.value) return
  uploading.value = true
  error.value = null
  try {
    const { avatarUrl } = await userService.uploadAvatar(pending.value.file)
    // Pinta a foto nova em todo avatar da tela antes do refetch confirmar.
    void applyMyAvatar(queryClient, myId, avatarUrl)
    clearPending()
    toastSuccess('Foto atualizada. Ela já aparece em todo o Nevo.')
  } catch (err) {
    // 503 (banco sem a coluna ainda), 413, 400: o servidor já manda o texto.
    const message = getApiErrorMessage(err, 'Não foi possível enviar a foto. Tente de novo.')
    error.value = message
    toastError(message)
  } finally {
    uploading.value = false
  }
}

async function remove() {
  if (busy.value) return
  removing.value = true
  error.value = null
  try {
    const { avatarUrl } = await userService.removeAvatar()
    void applyMyAvatar(queryClient, myId, avatarUrl ?? null)
    confirmOpen.value = false
    toastSuccess('Foto removida. Você volta a aparecer com as iniciais.')
  } catch (err) {
    const message = getApiErrorMessage(err, 'Não foi possível remover a foto. Tente de novo.')
    confirmOpen.value = false
    error.value = message
    toastError(message)
  } finally {
    removing.value = false
  }
}

onBeforeUnmount(clearPending)
</script>

<template>
  <div
    class="profile"
    :class="{ 'profile--drag': dragging }"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div class="profile-photo">
      <PersonAvatar
        :id="myId"
        :name="myName"
        :avatar-url="pending?.url ?? null"
        :size="96"
        decorative
      />
      <span v-if="pending" class="profile-badge">Prévia</span>
    </div>

    <div class="profile-body">
      <h2 class="profile-name">{{ myName }}</h2>
      <p v-if="myEmail" class="profile-email">{{ myEmail }}</p>

      <p class="profile-hint">
        <template v-if="pending">
          Assim você vai aparecer para o time. Salve para valer em todo o Nevo.
        </template>
        <template v-else>
          Sua foto aparece no board, nos comentários e na equipe. JPG, PNG ou WebP até
          {{ MAX_MB }} MB. Arraste a imagem para esta área ou escolha no computador.
        </template>
      </p>

      <div class="profile-actions">
        <template v-if="pending">
          <button type="button" class="p-btn p-btn--primary press" :disabled="busy" @click="save">
            <Loader2 v-if="uploading" :size="15" class="spin" aria-hidden="true" />
            <ImageUp v-else :size="15" aria-hidden="true" />
            {{ uploading ? 'Enviando…' : 'Salvar foto' }}
          </button>
          <button type="button" class="p-btn press" :disabled="busy" @click="pickFile">
            Escolher outra
          </button>
          <button type="button" class="p-btn p-btn--ghost press" :disabled="busy" @click="cancel">
            Cancelar
          </button>
        </template>
        <template v-else>
          <button type="button" class="p-btn p-btn--primary press" :disabled="busy" @click="pickFile">
            <Camera :size="15" aria-hidden="true" />
            Trocar foto
          </button>
          <button
            v-if="hasPhoto"
            type="button"
            class="p-btn p-btn--danger press"
            :disabled="busy"
            @click="confirmOpen = true"
          >
            <Trash2 :size="15" aria-hidden="true" />
            Remover foto
          </button>
        </template>
      </div>

      <p v-if="error" class="profile-error" role="alert">{{ error }}</p>
      <p class="profile-live" aria-live="polite">
        {{ uploading ? 'Enviando a foto' : pending ? `Prévia de ${pending.file.name} pronta para salvar` : '' }}
      </p>
    </div>

    <input
      ref="fileInput"
      class="profile-file"
      type="file"
      :accept="ACCEPT"
      tabindex="-1"
      aria-hidden="true"
      @change="onFileChange"
    />

    <div v-if="dragging" class="profile-drop" aria-hidden="true">
      <ImageUp :size="20" />
      Solte a imagem para ver a prévia
    </div>

    <ConfirmDialog
      v-model="confirmOpen"
      title="Remover sua foto?"
      message="Você volta a aparecer com as iniciais em todo o Nevo. Dá para subir outra foto quando quiser."
      confirm-label="Remover foto"
      :loading="removing"
      danger
      @confirm="remove"
    />
  </div>
</template>

<style scoped>
.profile {
  position: relative;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 6px 0 2px;
  border-radius: var(--radius);
}

.profile--drag {
  outline: 2px dashed var(--accent);
  outline-offset: 6px;
}

.profile-photo {
  position: relative;
  flex: none;
}

.profile-badge {
  position: absolute;
  left: 50%;
  bottom: -6px;
  transform: translateX(-50%);
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
  white-space: nowrap;
}

.profile-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-name {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.3;
  color: var(--text);
}

.profile-email {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-3);
}

.profile-hint {
  margin: 6px 0 0;
  max-width: 60ch;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-2);
}

.profile-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.p-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.p-btn:hover:not(:disabled) {
  background: var(--surface-3);
}

.p-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.p-btn:disabled {
  opacity: 0.6;
  cursor: progress;
}

.p-btn--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-fg);
}

.p-btn--primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 88%, var(--text));
}

.p-btn--ghost {
  border-color: transparent;
  background: transparent;
  color: var(--text-2);
}

.p-btn--danger {
  background: transparent;
  color: var(--err);
  border-color: color-mix(in srgb, var(--err) 40%, transparent);
}

.p-btn--danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--err) 10%, transparent);
}

.profile-error {
  margin: 8px 0 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--err);
}

.profile-file,
.profile-live {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* Aviso do arrastar por cima do card inteiro: a área de soltar é a seção. */
.profile-drop {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  pointer-events: none;
}

.spin {
  animation: profile-spin 0.85s linear infinite;
}

@keyframes profile-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }

  .p-btn {
    transition: none;
  }
}

@media (max-width: 560px) {
  .profile {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
