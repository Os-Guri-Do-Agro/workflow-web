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

const removeConnection = async (id: string, ownerLogin: string) => {
  if (
    !confirm(
      `Remover conexão "${ownerLogin}"?\n\nIsso apaga TODOS os repositórios importados desta org. (não toca no GitHub)`,
    )
  )
    return
  removingId.value = id
  try {
    await githubConnectionService.remove(id)
    toastSuccess('Conexão removida')
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
      <div class="conns-title-block">
        <span class="conns-title">
          <GitBranch :size="13" style="vertical-align: -2px; margin-right: 4px" />
          Repositórios
        </span>
        <span class="conns-sub">
          Conecte uma organização do GitHub e todos os repos ficam visíveis em
          <strong>Repos</strong> na sidebar.
        </span>
      </div>
      <button class="conns-add" @click="showCreate = true">
        <Plus :size="13" />
        <span>Conectar org</span>
      </button>
    </div>

    <div v-if="loading" class="conns-state">
      <Loader2 :size="16" class="spin" />
      <span>Carregando…</span>
    </div>

    <div v-else-if="!connections.length" class="conns-state">
      <Github :size="28" />
      <p>
        Nenhuma org conectada. Clique em <strong>Conectar org</strong> e cole um
        PAT pra importar todos os repositórios de uma vez.
      </p>
    </div>

    <ul v-else class="conns-list">
      <li v-for="c in connections" :key="c.id" class="conn-card">
        <div class="conn-icon"><Github :size="18" /></div>
        <div class="conn-body">
          <div class="conn-name-row">
            <span class="conn-name">{{ c.ownerLogin }}</span>
            <span class="conn-count">{{ c.repositoryCount }} repos</span>
          </div>
          <div class="conn-meta">
            <span>Última sync: <strong>{{ formatDate(c.lastSyncedAt) }}</strong></span>
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
            @click="removeConnection(c.id, c.ownerLogin)"
          >
            <Loader2 v-if="removingId === c.id" :size="13" class="spin" />
            <Trash2 v-else :size="13" />
          </button>
        </div>
      </li>
    </ul>

    <!-- Modal criar -->
    <div v-if="showCreate" class="modal-bd" @click.self="showCreate = false">
      <div class="modal">
        <div class="modal-h">
          <h3>Conectar organização do GitHub</h3>
          <button class="modal-x" @click="showCreate = false">
            <X :size="14" />
          </button>
        </div>
        <div class="modal-body">
          <div class="ff">
            <label>Owner / Organização</label>
            <input
              v-model="draft.ownerLogin"
              class="fi"
              placeholder="Os-Guri-Do-Agro"
              maxlength="80"
            />
            <span class="hint">
              Mesmo login que aparece em
              <code>github.com/&lt;owner&gt;</code>
            </span>
          </div>
          <div class="ff">
            <label>GitHub PAT (criptografado antes de salvar)</label>
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
              Vai em
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener"
                class="link"
              >
                github.com/settings/tokens
                <ExternalLink :size="10" style="vertical-align: -1px" />
              </a>
              → "Generate new token (classic)" → marque scope <code>repo</code>.
              Se a org tem SSO, autorize o token na lista após gerar.
            </span>
          </div>
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
.conns-title-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.conns-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
}
.conns-sub {
  font-size: 12.5px;
  color: var(--text-3);
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
.conns-state p {
  margin: 0;
  max-width: 360px;
  line-height: 1.5;
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
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.conn-icon {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--surface-2);
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
  gap: 8px;
}
.conn-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.conn-count {
  font-size: 11px;
  color: var(--text-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  padding: 1px 8px;
  border-radius: 999px;
}
.conn-meta {
  font-size: 11.5px;
  color: var(--text-3);
  margin-top: 3px;
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
