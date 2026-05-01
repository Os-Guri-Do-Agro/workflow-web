<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  GitBranch,
  Plus,
  Loader2,
  Trash2,
  Lock,
  Users,
  X,
  Check,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
} from 'lucide-vue-next'
import repositoryService from '@/service/repository/repository-service'
import companieService from '@/service/companies/companies-services'
import userService from '@/service/user/user-service'
import { useToast } from '@/composables/useToast'

const { success: toastSuccess, error: toastError } = useToast()

type Repo = {
  id: string
  companyId: string
  owner: string
  name: string
  defaultBranch: string
  visibility: 'TEAM' | 'RESTRICTED'
  hasToken: boolean
  company?: { id: string; name: string }
  access: Array<{
    id: string
    userId: string
    level: 'READ' | 'WRITE' | 'ADMIN'
    user: { id: string; name: string; email: string }
  }>
}

const repos = ref<Repo[]>([])
const loading = ref(false)
const expandedId = ref<string | null>(null)
const savingId = ref<string | null>(null)

// Modal de criar
const showCreate = ref(false)
const companies = ref<any[]>([])
const allUsers = ref<any[]>([])
const draft = ref({
  companyId: '',
  owner: '',
  name: '',
  defaultBranch: 'main',
  token: '',
  visibility: 'TEAM' as 'TEAM' | 'RESTRICTED',
})
const showToken = ref(false)
const creating = ref(false)

const load = async () => {
  loading.value = true
  try {
    const list = await repositoryService.list()
    repos.value = Array.isArray(list) ? list : list?.data || []
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Erro ao listar repositórios')
  } finally {
    loading.value = false
  }
}

const loadAuxData = async () => {
  try {
    const [c, u] = await Promise.all([
      companieService.getCompanyAll().catch(() => companieService.getCompany()),
      userService.getAllUsers().catch(() => []),
    ])
    companies.value = (Array.isArray(c) ? c : c?.data || []).map((x: any) => ({
      id: x.id,
      name: x.name,
    }))
    allUsers.value = Array.isArray(u) ? u : u?.data || []
  } catch (e: any) {
    console.error('Aux data load failed', e)
  }
}

const openCreate = () => {
  draft.value = {
    companyId: companies.value[0]?.id || '',
    owner: '',
    name: '',
    defaultBranch: 'main',
    token: '',
    visibility: 'TEAM',
  }
  showToken.value = false
  showCreate.value = true
}

const submitCreate = async () => {
  if (!draft.value.companyId || !draft.value.owner.trim() || !draft.value.name.trim()) {
    toastError('Preencha empresa, owner e nome do repositório')
    return
  }
  creating.value = true
  try {
    await repositoryService.create({
      companyId: draft.value.companyId,
      owner: draft.value.owner.trim(),
      name: draft.value.name.trim(),
      defaultBranch: draft.value.defaultBranch.trim() || 'main',
      token: draft.value.token.trim() || undefined,
      visibility: draft.value.visibility,
    })
    toastSuccess('Repositório adicionado')
    showCreate.value = false
    await load()
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Erro ao criar')
  } finally {
    creating.value = false
  }
}

const removeRepo = async (id: string) => {
  if (!confirm('Remover esse repositório do workflow? (não toca no GitHub)')) return
  savingId.value = id
  try {
    await repositoryService.remove(id)
    toastSuccess('Repositório removido')
    await load()
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Erro ao remover')
  } finally {
    savingId.value = null
  }
}

const toggleVisibility = async (repo: Repo) => {
  const next = repo.visibility === 'TEAM' ? 'RESTRICTED' : 'TEAM'
  savingId.value = repo.id
  try {
    await repositoryService.update(repo.id, { visibility: next })
    await load()
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Erro ao alterar visibilidade')
  } finally {
    savingId.value = null
  }
}

const toggleExpanded = (id: string) => {
  expandedId.value = expandedId.value === id ? null : id
}

// Lista de members da company de um repo (intersect com allUsers)
const companyMembers = computed(() => {
  const map: Record<string, any[]> = {}
  // Pra simplificar, usamos allUsers; back-end já valida que o user concedido é membro.
  for (const r of repos.value) {
    map[r.id] = allUsers.value
  }
  return map
})

const userHasAccess = (repo: Repo, userId: string) =>
  repo.access.some((a) => a.userId === userId)

const toggleAccess = async (repo: Repo, userId: string) => {
  savingId.value = repo.id
  try {
    if (userHasAccess(repo, userId)) {
      await repositoryService.revokeAccess(repo.id, userId)
    } else {
      await repositoryService.grantAccess(repo.id, { userId, level: 'READ' })
    }
    await load()
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Erro no acesso')
  } finally {
    savingId.value = null
  }
}

onMounted(async () => {
  await Promise.all([load(), loadAuxData()])
})
</script>

<template>
  <div class="repos-root">
    <div class="repos-head">
      <div class="repos-title-block">
        <span class="repos-title">
          <GitBranch :size="13" style="vertical-align: -2px; margin-right: 4px" />
          Repositórios
        </span>
        <span class="repos-sub">
          GitHub vinculado às empresas. Permissão TEAM (todo o time vê) ou RESTRICTED (whitelist).
        </span>
      </div>
      <button class="repos-add" @click="openCreate">
        <Plus :size="13" />
        <span>Adicionar</span>
      </button>
    </div>

    <div v-if="loading" class="repos-state">
      <Loader2 :size="16" class="spin" />
      <span>Carregando…</span>
    </div>

    <div v-else-if="!repos.length" class="repos-state">
      <span>
        Nenhum repositório vinculado ainda. Adicione um pra liberar features de
        leitura de código e PR automático.
      </span>
    </div>

    <ul v-else class="repos-list">
      <li v-for="r in repos" :key="r.id" class="repo-item">
        <div class="repo-row">
          <button class="repo-expand" @click="toggleExpanded(r.id)">
            <ChevronDown v-if="expandedId === r.id" :size="13" />
            <ChevronRight v-else :size="13" />
          </button>
          <div class="repo-info">
            <div class="repo-name-row">
              <span class="repo-fullname">{{ r.owner }}/{{ r.name }}</span>
              <span class="repo-branch">{{ r.defaultBranch }}</span>
            </div>
            <div class="repo-meta-row">
              <span class="repo-company">{{ r.company?.name || '—' }}</span>
              <span class="meta-sep">·</span>
              <button
                class="repo-vis"
                :class="{ 'repo-vis--restricted': r.visibility === 'RESTRICTED' }"
                @click="toggleVisibility(r)"
                :disabled="savingId === r.id"
              >
                <Users v-if="r.visibility === 'TEAM'" :size="11" />
                <Lock v-else :size="11" />
                {{ r.visibility === 'TEAM' ? 'Team' : 'Restrito' }}
              </button>
              <span class="meta-sep">·</span>
              <span :class="r.hasToken ? 'token-yes' : 'token-no'">
                {{ r.hasToken ? '🔒 token salvo' : 'sem token' }}
              </span>
            </div>
          </div>
          <button
            class="repo-delete"
            :disabled="savingId === r.id"
            aria-label="Remover"
            @click="removeRepo(r.id)"
          >
            <Loader2 v-if="savingId === r.id" :size="13" class="spin" />
            <Trash2 v-else :size="13" />
          </button>
        </div>

        <div v-if="expandedId === r.id" class="repo-expand-body">
          <div class="repo-access-head">
            <span class="repo-access-label">Acesso</span>
            <span class="repo-access-hint">
              {{
                r.visibility === 'TEAM'
                  ? 'Todos os membros (WORKER+) da empresa veem este repo.'
                  : 'Apenas usuários marcados abaixo veem este repo.'
              }}
            </span>
          </div>

          <ul v-if="(companyMembers[r.id] || []).length" class="repo-users">
            <li
              v-for="u in companyMembers[r.id]"
              :key="u.id"
              class="repo-user-row"
            >
              <div class="repo-user-info">
                <span class="repo-user-name">{{ u.name }}</span>
                <span class="repo-user-email">{{ u.email }}</span>
              </div>
              <button
                type="button"
                class="repo-user-toggle"
                :class="{ 'repo-user-toggle--on': userHasAccess(r, u.id) }"
                :disabled="savingId === r.id || r.visibility === 'TEAM'"
                @click="toggleAccess(r, u.id)"
              >
                <Check v-if="userHasAccess(r, u.id)" :size="12" />
                <X v-else :size="12" />
                <span>{{ userHasAccess(r, u.id) ? 'Tem acesso' : 'Sem acesso' }}</span>
              </button>
            </li>
          </ul>
          <p v-else class="repo-users-empty">Nenhum usuário cadastrado.</p>

          <p v-if="r.visibility === 'TEAM'" class="repo-team-note">
            Visibilidade está em <strong>TEAM</strong> — toggles de acesso ficam desativados.
            Mude pra <strong>Restrito</strong> pra controlar usuário a usuário.
          </p>
        </div>
      </li>
    </ul>

    <!-- Modal criar -->
    <div v-if="showCreate" class="modal-backdrop" @click.self="showCreate = false">
      <div class="modal">
        <div class="modal-head">
          <h3 class="modal-title">Adicionar repositório</h3>
          <button class="modal-close" @click="showCreate = false">
            <X :size="14" />
          </button>
        </div>
        <div class="modal-body">
          <div class="form-field">
            <label>Empresa</label>
            <select v-model="draft.companyId" class="form-input">
              <option v-for="c in companies" :key="c.id" :value="c.id">
                {{ c.name }}
              </option>
            </select>
          </div>
          <div class="form-row">
            <div class="form-field">
              <label>Owner / Org</label>
              <input
                v-model="draft.owner"
                class="form-input"
                placeholder="Os-Guri-Do-Agro"
                maxlength="80"
              />
            </div>
            <div class="form-field">
              <label>Repositório</label>
              <input
                v-model="draft.name"
                class="form-input"
                placeholder="workflow-api"
                maxlength="120"
              />
            </div>
          </div>
          <div class="form-field">
            <label>Branch padrão</label>
            <input v-model="draft.defaultBranch" class="form-input" maxlength="80" />
          </div>
          <div class="form-field">
            <label>GitHub PAT (será criptografado)</label>
            <div class="form-input-wrap">
              <input
                v-model="draft.token"
                :type="showToken ? 'text' : 'password'"
                class="form-input"
                placeholder="ghp_… ou github_pat_…"
                autocomplete="off"
              />
              <button
                type="button"
                class="form-eye"
                @click="showToken = !showToken"
                :aria-label="showToken ? 'Ocultar' : 'Mostrar'"
              >
                <component :is="showToken ? EyeOff : Eye" :size="13" />
              </button>
            </div>
            <span class="form-hint">
              Opcional agora. Pode adicionar depois quando for ativar leitura de código.
            </span>
          </div>
          <div class="form-field">
            <label>Visibilidade</label>
            <div class="form-vis-row">
              <button
                type="button"
                class="form-vis"
                :class="{ 'form-vis--active': draft.visibility === 'TEAM' }"
                @click="draft.visibility = 'TEAM'"
              >
                <Users :size="12" />
                <span>Team — todos da empresa</span>
              </button>
              <button
                type="button"
                class="form-vis"
                :class="{ 'form-vis--active': draft.visibility === 'RESTRICTED' }"
                @click="draft.visibility = 'RESTRICTED'"
              >
                <Lock :size="12" />
                <span>Restrito — só whitelist</span>
              </button>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-cancel" @click="showCreate = false">Cancelar</button>
          <button class="btn-submit" :disabled="creating" @click="submitCreate">
            <Loader2 v-if="creating" :size="13" class="spin" />
            <span>{{ creating ? 'Salvando…' : 'Adicionar' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.repos-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.repos-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.repos-title-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.repos-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
}

.repos-sub {
  font-size: 12.5px;
  color: var(--text-3);
}

.repos-add {
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

.repos-add:hover {
  filter: brightness(1.07);
}

.repos-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
  color: var(--text-3);
  font-size: 13px;
  justify-content: center;
  text-align: center;
}

.repos-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.repo-item {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.repo-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
}

.repo-expand {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-3);
  cursor: pointer;
  flex-shrink: 0;
}

.repo-info {
  flex: 1;
  min-width: 0;
}

.repo-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.repo-fullname {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.repo-branch {
  font-size: 11px;
  color: var(--text-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  padding: 1px 6px;
  border-radius: 999px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.repo-meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-3);
  margin-top: 3px;
}

.meta-sep {
  opacity: 0.5;
}

.repo-company {
  color: var(--text-2);
}

.repo-vis {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-2);
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
}

.repo-vis:hover:not(:disabled) {
  border-color: var(--accent);
}

.repo-vis--restricted {
  color: #f59e0b;
  border-color: color-mix(in srgb, #f59e0b 30%, var(--border));
  background: color-mix(in srgb, #f59e0b 10%, var(--surface-2));
}

.token-yes {
  color: #10b981;
}

.token-no {
  color: var(--text-4);
}

.repo-delete {
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
  flex-shrink: 0;
}

.repo-delete:hover:not(:disabled) {
  color: #ef4444;
  border-color: color-mix(in srgb, #ef4444 30%, var(--border));
}

.repo-expand-body {
  padding: 12px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.repo-access-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.repo-access-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-3);
}

.repo-access-hint {
  font-size: 12px;
  color: var(--text-3);
}

.repo-users {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.repo-user-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}

.repo-user-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.repo-user-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
}

.repo-user-email {
  font-size: 11px;
  color: var(--text-3);
}

.repo-user-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-3);
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  flex-shrink: 0;
}

.repo-user-toggle:hover:not(:disabled) {
  border-color: var(--accent);
}

.repo-user-toggle--on {
  color: #10b981;
  border-color: color-mix(in srgb, #10b981 30%, var(--border));
  background: color-mix(in srgb, #10b981 10%, var(--surface));
}

.repo-user-toggle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.repo-users-empty {
  font-size: 12px;
  color: var(--text-4);
  text-align: center;
  padding: 12px 0;
  margin: 0;
}

.repo-team-note {
  font-size: 11.5px;
  color: var(--text-3);
  margin: 0;
  padding: 6px 8px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
}

/* Modal */
.modal-backdrop {
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
  max-width: 520px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  max-height: 85vh;
  box-shadow: var(--shadow-overlay);
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}

.modal-title {
  font-size: 15px;
  font-weight: 700;
  margin: 0;
}

.modal-close {
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
  gap: 12px;
  padding: 14px 16px;
  overflow-y: auto;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-field label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-3);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-input,
.form-input-wrap {
  width: 100%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 13px;
  font-family: inherit;
  outline: none;
}

.form-input {
  padding: 8px 10px;
}

.form-input-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 4px 0 0;
}

.form-input-wrap .form-input {
  border: none;
  background: transparent;
  padding: 8px 10px;
}

.form-input:focus,
.form-input-wrap:focus-within {
  border-color: var(--accent);
}

.form-eye {
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

.form-hint {
  font-size: 11px;
  color: var(--text-4);
}

.form-vis-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.form-vis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.form-vis--active {
  background: color-mix(in srgb, var(--accent) 14%, var(--surface-2));
  border-color: var(--accent);
  color: var(--text);
}

.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

.btn-cancel,
.btn-submit {
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.btn-cancel {
  background: var(--surface-2);
  color: var(--text-2);
  border: 1px solid var(--border);
}

.btn-submit {
  background: var(--accent);
  color: var(--accent-fg);
  border: 1px solid color-mix(in srgb, var(--accent) 80%, black);
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
