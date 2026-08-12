<script setup lang="ts">
/**
 * Compartilhar arquivo por link público.
 *
 * O que a tela precisa deixar claro, porque é o que o usuário arrisca ao
 * clicar: o link abre SEM login para quem tiver o endereço. Por isso o aviso é
 * texto de primeira classe e não tooltip, e a lista de links ativos fica na
 * mesma tela que os cria (link esquecido é o risco real, não link criado).
 */
import { computed, ref, watch } from 'vue'
import { Check, Copy, Link2, Share2, ShieldAlert, Trash2, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import driveService, { type DriveShareLink } from '@/service/drive/drive-service'
import { fullDate } from '@/features/drive/format'
import type { DriveFile } from '@/features/drive/types'

const props = defineProps<{ file: DriveFile | null }>()
const emit = defineEmits<{ close: [] }>()

const { success, error: showError } = useToast()

const links = ref<DriveShareLink[]>([])
const loading = ref(false)
const creating = ref(false)
const copiedId = ref<string | null>(null)
const EXPIRY_OPTIONS = [
  { label: 'Sem prazo', value: 'never' },
  { label: 'Expira em 7 dias', value: '7d' },
  { label: 'Expira em 30 dias', value: '30d' },
] as const

const expiryChoice = ref<'never' | '7d' | '30d'>('never')

const open = computed({
  get: () => props.file !== null,
  set: (value: boolean) => {
    if (!value) emit('close')
  },
})

const activeLinks = computed(() => links.value.filter((l) => !l.revoked))

function absoluteUrl(link: DriveShareLink): string {
  return `${window.location.origin}${link.path}`
}

/**
 * Sequência da requisição em voo. Sem isto, abrir o compartilhamento de A
 * (resposta lenta), fechar e abrir o de B faz a resposta de A chegar depois e
 * pintar a tela de B com os links de A — e copiar dali distribui o link
 * público do arquivo errado.
 */
let requestSeq = 0

watch(
  () => props.file?.id,
  async (id) => {
    const seq = ++requestSeq
    links.value = []
    copiedId.value = null
    expiryChoice.value = 'never'
    if (!id) return
    loading.value = true
    try {
      const result = await driveService.listShares(id)
      if (seq !== requestSeq) return
      links.value = result
    } catch (error) {
      if (seq !== requestSeq) return
      showError(getApiErrorMessage(error, 'Não foi possível carregar os links'))
    } finally {
      if (seq === requestSeq) loading.value = false
    }
  },
  { immediate: true },
)

function expiresAtIso(): string | null {
  if (expiryChoice.value === 'never') return null
  const days = expiryChoice.value === '7d' ? 7 : 30
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

async function createLink() {
  if (!props.file) return
  creating.value = true
  try {
    const link = await driveService.createShare(props.file.id, {
      expiresAt: expiresAtIso(),
    })
    links.value = [link, ...links.value]
    await copy(link)
    success('Link criado e copiado')
  } catch (error) {
    showError(getApiErrorMessage(error, 'Não foi possível criar o link'))
  } finally {
    creating.value = false
  }
}

async function copy(link: DriveShareLink) {
  try {
    await navigator.clipboard.writeText(absoluteUrl(link))
    copiedId.value = link.id
    window.setTimeout(() => {
      if (copiedId.value === link.id) copiedId.value = null
    }, 2000)
  } catch {
    showError('Não foi possível copiar. Selecione o endereço e copie à mão.')
  }
}

async function revoke(link: DriveShareLink) {
  if (!props.file) return
  try {
    await driveService.revokeShare(props.file.id, link.id)
    links.value = links.value.map((l) =>
      l.id === link.id ? { ...l, revoked: true } : l,
    )
    success('Link revogado. Quem tiver o endereço não consegue mais baixar.')
  } catch (error) {
    showError(getApiErrorMessage(error, 'Não foi possível revogar o link'))
  }
}
</script>

<template>
  <AppDialog v-model="open" label="Compartilhar arquivo" size="lg">
    <template v-if="file">
      <header class="sf-head">
        <div class="sf-head-title">
          <Share2 :size="16" />
          <h2>Compartilhar por link</h2>
        </div>
        <button
          type="button"
          class="sf-x press"
          aria-label="Fechar"
          @click="emit('close')"
        >
          <X :size="15" />
        </button>
      </header>

      <div class="sf">
        <p class="sf-file" :title="file.name">{{ file.name }}</p>

        <div class="sf-warn">
          <ShieldAlert :size="16" class="sf-warn-icon" />
          <p class="sf-warn-text">
            Quem receber o link baixa o arquivo sem precisar de conta no sistema.
            Você pode revogar a qualquer momento.
          </p>
        </div>

        <div class="sf-create">
          <span class="sf-label">Validade</span>
          <div class="sf-row">
            <AppSelect
              v-model="expiryChoice"
              class="sf-select"
              density="compact"
              :items="EXPIRY_OPTIONS"
              label="Validade do link"
            />
            <button
              type="button"
              class="sf-btn sf-btn--primary press"
              :disabled="creating"
              @click="createLink"
            >
              <Link2 :size="15" />
              {{ creating ? 'Gerando...' : 'Gerar link' }}
            </button>
          </div>
        </div>

        <div class="sf-list">
        <p v-if="loading" class="sf-empty">Carregando links...</p>
        <p v-else-if="!activeLinks.length" class="sf-empty">
          Nenhum link ativo. Gere um acima para compartilhar este arquivo.
        </p>

        <div v-for="link in activeLinks" :key="link.id" class="sf-link">
          <div class="sf-link-main">
            <code class="sf-link-url">{{ absoluteUrl(link) }}</code>
            <p class="sf-link-meta">
              <template v-if="link.expiresAt">
                Expira em {{ fullDate(link.expiresAt) }}
              </template>
              <template v-else>Sem prazo</template>
              <span aria-hidden="true"> · </span>
              {{ link.downloadCount }}
              {{ link.downloadCount === 1 ? 'download' : 'downloads' }}
            </p>
          </div>
          <div class="sf-link-acts">
            <button
              type="button"
              class="sf-icon press"
              :aria-label="copiedId === link.id ? 'Copiado' : 'Copiar link'"
              :title="copiedId === link.id ? 'Copiado' : 'Copiar'"
              @click="copy(link)"
            >
              <Check v-if="copiedId === link.id" :size="15" class="sf-ok" />
              <Copy v-else :size="15" />
            </button>
            <button
              type="button"
              class="sf-icon sf-icon--danger press"
              aria-label="Revogar link"
              title="Revogar"
              @click="revoke(link)"
            >
              <Trash2 :size="15" />
            </button>
          </div>
        </div>
        </div>
      </div>
    </template>
  </AppDialog>
</template>

<style scoped>
/* Cabeçalho no padrão dos demais diálogos do Drive (DriveNameDialog). */
.sf-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border);
}

.sf-head-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
}

.sf-head-title h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.sf-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.sf-x:hover {
  background: var(--surface-2);
  color: var(--text);
}

/*
 * O AppDialog é uma casca sem padding (conteúdo 100% slot), então o respiro é
 * responsabilidade daqui — sem isto o conteúdo encosta na borda do card.
 */
.sf {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  overflow-y: auto;
}

.sf-file {
  margin: 0;
  color: var(--text);
  font-size: 13.5px;
  font-weight: 600;
  word-break: break-word;
}

.sf-warn {
  display: flex;
  gap: 10px;
  padding: 11px 13px;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--warn) 10%, transparent);
}

.sf-warn-icon {
  flex: none;
  color: var(--warn);
  margin-top: 1px;
}

.sf-warn-text {
  margin: 0;
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.5;
}

.sf-create {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.sf-label {
  color: var(--text-3);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sf-row {
  display: flex;
  gap: 8px;
}

.sf-select {
  flex: 1;
  min-width: 0;
}

.sf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  flex: none;
  padding: 9px 15px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  /* Sem isto o rótulo quebra em "Gerar / link" quando o select cresce. */
  white-space: nowrap;
  cursor: pointer;
}

.sf-btn--primary {
  background: var(--accent);
  color: var(--accent-fg);
}

.sf-btn--primary:disabled {
  opacity: 0.6;
  cursor: default;
}

.sf-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sf-empty {
  margin: 0;
  padding: 14px;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  color: var(--text-3);
  font-size: 12px;
  text-align: center;
}

.sf-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.sf-link-main {
  flex: 1;
  min-width: 0;
}

.sf-link-url {
  display: block;
  color: var(--text);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sf-link-meta {
  margin: 4px 0 0;
  color: var(--text-3);
  font-size: 10.5px;
}

.sf-link-acts {
  display: flex;
  gap: 4px;
  flex: none;
}

.sf-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
}

.sf-icon:hover {
  background: var(--surface-3);
  color: var(--text);
}

.sf-icon--danger:hover {
  color: var(--err);
}

.sf-ok {
  color: var(--success);
}
</style>
