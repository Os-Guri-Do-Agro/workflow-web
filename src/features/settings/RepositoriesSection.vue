<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  GitBranch,
  Plus,
  Loader2,
  Trash2,
  Eye,
  EyeOff,
  Github,
  RefreshCw,
  Check,
  X,
  ExternalLink,
} from 'lucide-vue-next'
import githubConnectionService from '@/service/github-connection/github-connection-service'
import { useToast } from '@/composables/useToast'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'

const { success: toastSuccess, error: toastError } = useToast()

type Connection = {
  id: string
  ownerLogin: string
  addedById: string
  lastSyncedAt: string | null
  createdAt: string
  repositoryCount: number
}

const connections = ref<Connection[]>([])
const loading = ref(false)
const syncingId = ref<string | null>(null)
const removingId = ref<string | null>(null)
const connectionPendingRemoval = ref<Connection | null>(null)

// Modal de criar
const showCreate = ref(false)
const draft = ref({ ownerLogin: '', token: '' })
const showToken = ref(false)
const creating = ref(false)

const formatDate = (date: string | null) => {
  if (!date) return 'nunca'
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const load = async () => {
  loading.value = true
  try {
    const list = await githubConnectionService.list()
    connections.value = Array.isArray(list) ? list : list?.data || []
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Erro ao listar conexões')
  } finally {
    loading.value = false
  }
}

const submitCreate = async () => {
  if (!draft.value.ownerLogin.trim() || !draft.value.token.trim()) {
    toastError('Preencha owner e PAT')
    return
  }
  creating.value = true
  try {
    const conn = await githubConnectionService.create({
      ownerLogin: draft.value.ownerLogin.trim(),
      token: draft.value.token.trim(),
    })
    toastSuccess('Conexão criada — sincronizando repositórios…')
    showCreate.value = false
    draft.value = { ownerLogin: '', token: '' }
    await load()
    // Auto-sync logo após criar
    if (conn?.id) await syncConnection(conn.id, true)
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Erro ao criar conexão')
  } finally {
    creating.value = false
  }
}

const syncConnection = async (id: string, silent = false) => {
  syncingId.value = id
  try {
    const r = await githubConnectionService.syncAll(id)
    if (!silent) {
      toastSuccess(
        `${r.total} repos sincronizados (${r.imported} novos, ${r.updated} atualizados)`,
      )
    } else {
      toastSuccess(`${r.total} repos importados`)
    }
    await load()
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Erro na sincronização')
  } finally {
    syncingId.value = null
  }
}

const requestRemoveConnection = (connection: Connection) => {
  connectionPendingRemoval.value = connection
}

const removeConnection = async () => {
  const connection = connectionPendingRemoval.value
  if (!connection) return
  const { id } = connection

  removingId.value = id
  try {
    await githubConnectionService.remove(id)
    toastSuccess('Conexão removida')
    connectionPendingRemoval.value = null
    await load()
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Erro ao remover')
  } finally {
    removingId.value = null
  }
}

onMounted(() => load())
</script>

<template>
  <div class="conns-root">
    <div class="conns-head">
      <div class="conns-head-left">
        <div class="conns-head-icon">
          <Github :size="18" />
        </div>
        <div class="conns-title-block">
          <span class="conns-title">GitHub</span>
          <span class="conns-sub">
            Conecte uma organização e todos os repos ficam disponíveis em
            <strong>Repos</strong> pra todo o time interno.
          </span>
        </div>
      </div>
      <button v-if="connections.length" class="conns-add" @click="showCreate = true">
        <Plus :size="13" />
        <span>Nova conexão</span>
      </button>
    </div>

    <div v-if="loading" class="conns-state">
      <Loader2 :size="16" class="spin" />
      <span>Carregando…</span>
    </div>

    <div v-else-if="!connections.length" class="conns-empty">
      <div class="conns-empty-icon">
        <Github :size="34" />
      </div>
      <h3 class="conns-empty-title">Nenhuma organização conectada</h3>
      <p class="conns-empty-sub">
        Conecte sua org do GitHub uma vez e o time inteiro passa a navegar nos
        repositórios pelo workflow — sem precisar abrir o GitHub.
      </p>
      <button class="conns-cta" @click="showCreate = true">
        <Github :size="14" />
        <span>Conectar GitHub</span>
      </button>
    </div>

    <ul v-else class="conns-list">
      <li v-for="c in connections" :key="c.id" class="conn-card">
        <div class="conn-card-head">
          <div class="conn-icon">
            <Github :size="20" />
          </div>
          <div class="conn-body">
            <div class="conn-name-row">
              <span class="conn-name">{{ c.ownerLogin }}</span>
              <span class="conn-count">
                <GitBranch :size="10" />
                {{ c.repositoryCount }}
              </span>
            </div>
            <div class="conn-meta">
              Sincronizado <strong>{{ formatDate(c.lastSyncedAt) }}</strong>
            </div>
          </div>
          <div class="conn-actions">
            <button
              class="conn-btn"
              :disabled="syncingId === c.id"
              @click="syncConnection(c.id)"
            >
              <Loader2 v-if="syncingId === c.id" :size="13" class="spin" />
              <RefreshCw v-else :size="13" />
              <span>Sincronizar</span>
            </button>
            <button
              class="conn-btn conn-btn--danger"
              :disabled="removingId === c.id"
              :aria-label="`Remover ${c.ownerLogin}`"
              @click="requestRemoveConnection(c)"
            >
              <Loader2 v-if="removingId === c.id" :size="13" class="spin" />
              <Trash2 v-else :size="13" />
            </button>
          </div>
        </div>
      </li>
    </ul>

    <!-- Modal criar -->
    <div v-if="showCreate" class="modal-bd" @click.self="showCreate = false">
      <div class="modal">
        <div class="modal-h">
          <div class="modal-h-left">
            <div class="modal-h-icon">
              <Github :size="16" />
            </div>
            <h3>Conectar GitHub</h3>
          </div>
          <button class="modal-x" @click="showCreate = false">
            <X :size="14" />
          </button>
        </div>
        <div class="modal-body">
          <ol class="steps">
            <li class="step">
              <span class="step-num">1</span>
              <div class="step-body">
                <p class="step-title">Gere um Personal Access Token</p>
                <p class="step-desc">
                  Abra
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo&description=workflow+stackroads"
                    target="_blank"
                    rel="noopener"
                    class="link"
                  >
                    github.com/settings/tokens
                    <ExternalLink :size="10" style="vertical-align: -1px" />
                  </a>
                  → <strong>"Tokens (classic)"</strong> → marque o scope
                  <code>repo</code>.
                </p>
                <p class="step-desc step-desc--note">
                  Se a org usa SSO, clique em <strong>Configure SSO</strong> ao
                  lado do token recém-criado e autorize a org.
                </p>
              </div>
            </li>
            <li class="step">
              <span class="step-num">2</span>
              <div class="step-body">
                <p class="step-title">Cole abaixo o owner e o token</p>

                <div class="ff">
                  <label>Owner / Organização</label>
                  <input
                    v-model="draft.ownerLogin"
                    class="fi"
                    placeholder="Os-Guri-Do-Agro"
                    maxlength="80"
                  />
                  <span class="hint">
                    Mesmo trecho que aparece em
                    <code>github.com/&lt;owner&gt;</code>
                  </span>
                </div>

                <div class="ff">
                  <label>Personal Access Token</label>
                  <div class="fi-wrap">
                    <input
                      v-model="draft.token"
                      :type="showToken ? 'text' : 'password'"
                      class="fi"
                      placeholder="ghp_… ou github_pat_…"
                      autocomplete="off"
                    />
                    <button type="button" class="fi-eye" @click="showToken = !showToken">
                      <component :is="showToken ? EyeOff : Eye" :size="13" />
                    </button>
                  </div>
                  <span class="hint">
                    Criptografado com AES-256-GCM antes de salvar. Não é
                    retornado pela API depois.
                  </span>
                </div>
              </div>
            </li>
          </ol>
        </div>
        <div class="modal-f">
          <button class="btn-cancel" @click="showCreate = false">Cancelar</button>
          <button class="btn-submit" :disabled="creating" @click="submitCreate">
            <Loader2 v-if="creating" :size="13" class="spin" />
            <Check v-else :size="13" />
            <span>{{ creating ? 'Conectando…' : 'Conectar e importar' }}</span>
          </button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      :model-value="!!connectionPendingRemoval"
      danger
      title="Remover conexão?"
      :message="`Isso apaga todos os repositórios importados de '${connectionPendingRemoval?.ownerLogin || ''}'. Não toca no GitHub.`"
      confirm-label="Remover"
      :loading="!!removingId"
      @update:model-value="(value) => { if (!value) connectionPendingRemoval = null }"
      @confirm="removeConnection"
    />
  </div>
</template>

<style scoped>
.conns-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.conns-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.conns-head-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.conns-head-icon {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  flex-shrink: 0;
}
.conns-title-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.conns-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.01em;
}
.conns-sub {
  font-size: 12.5px;
  color: var(--text-3);
  line-height: 1.5;
}
.conns-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--accent);
  color: var(--accent-fg);
  border: 1px solid color-mix(in srgb, var(--accent) 80%, black);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}
.conns-add:hover {
  filter: brightness(1.07);
}

.conns-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 16px;
  color: var(--text-3);
  font-size: 13px;
  text-align: center;
}

.conns-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 36px 24px;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  text-align: center;
}
.conns-empty-icon {
  width: 60px;
  height: 60px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 50%;
  color: var(--text);
  margin-bottom: 4px;
}
.conns-empty-title {
  font-size: 15px;
  font-weight: 700;
  margin: 0;
  color: var(--text);
  letter-spacing: -0.01em;
}
.conns-empty-sub {
  font-size: 12.5px;
  color: var(--text-3);
  line-height: 1.55;
  margin: 0;
  max-width: 380px;
}
.conns-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  background: var(--accent);
  color: var(--accent-fg);
  border: 1px solid color-mix(in srgb, var(--accent) 80%, black);
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 6px;
}
.conns-cta:hover {
  filter: brightness(1.07);
}

.conns-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.conn-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  transition: border-color var(--motion-fast);
}
.conn-card:hover {
  border-color: var(--border-strong);
}
.conn-card-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
}
.conn-icon {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text);
  flex-shrink: 0;
}
.conn-body {
  flex: 1;
  min-width: 0;
}
.conn-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.conn-name {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.01em;
}
.conn-count {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  padding: 2px 8px;
  border-radius: 999px;
}
.conn-meta {
  font-size: 11.5px;
  color: var(--text-3);
  margin-top: 4px;
}
.conn-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.conn-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.conn-btn:hover:not(:disabled) {
  border-color: var(--accent);
}
.conn-btn:disabled {
  opacity: 0.6;
  cursor: progress;
}
.conn-btn--danger {
  padding: 6px 8px;
}
.conn-btn--danger:hover:not(:disabled) {
  color: #ef4444;
  border-color: color-mix(in srgb, #ef4444 30%, var(--border));
}

/* Steps no modal */
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.step {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.step-num {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--accent) 18%, var(--surface-2));
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  border-radius: 50%;
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
}
.step-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.step-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
  letter-spacing: -0.005em;
}
.step-desc {
  font-size: 12.5px;
  color: var(--text-3);
  margin: 0;
  line-height: 1.55;
}
.step-desc--note {
  font-size: 11.5px;
  color: var(--text-4);
  padding: 6px 10px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}
.step-desc code {
  background: var(--surface-2);
  border: 1px solid var(--border);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.modal-h-left {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.modal-h-icon {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
}

/* Modal */
.modal-bd {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, black 60%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}
.modal {
  width: 100%;
  max-width: 540px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  max-height: 85vh;
  box-shadow: var(--shadow-overlay);
}
.modal-h {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.modal-h h3 {
  font-size: 15px;
  font-weight: 700;
  margin: 0;
}
.modal-x {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-3);
  cursor: pointer;
}
.modal-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  overflow-y: auto;
}
.ff {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.ff label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-3);
}
.fi {
  width: 100%;
  padding: 9px 11px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font: inherit;
  font-size: 13.5px;
  outline: none;
}
.fi:focus {
  border-color: var(--accent);
}
.fi-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.fi-wrap .fi {
  padding-right: 36px;
}
.fi-eye {
  position: absolute;
  right: 6px;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-3);
  cursor: pointer;
}
.hint {
  font-size: 11.5px;
  color: var(--text-3);
  line-height: 1.5;
}
.hint code {
  background: var(--surface-2);
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--border);
  font-size: 11px;
}
.link {
  color: var(--accent);
  text-decoration: none;
}
.link:hover {
  text-decoration: underline;
}

.modal-f {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}
.btn-cancel,
.btn-submit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.btn-cancel {
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-2);
}
.btn-submit {
  background: var(--accent);
  color: var(--accent-fg);
  border: 1px solid color-mix(in srgb, var(--accent) 80%, black);
}
.btn-submit:disabled {
  opacity: 0.6;
  cursor: progress;
}

.spin {
  animation: spin 0.85s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
