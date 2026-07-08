<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Building2,
  FolderPlus,
  Folder,
  KeyRound,
  Plus,
  QrCode as QrCodeIcon,
  RotateCw,
  Trash2,
  User,
  X,
} from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import PasswordConfirmDialog from '@/components/ui/PasswordConfirmDialog.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import QrCard from './components/QrCard.vue'
import QrEditDialog from './components/QrEditDialog.vue'
import QrMetricsDialog from './components/QrMetricsDialog.vue'
import QrApiTokensDialog from './components/QrApiTokensDialog.vue'
import { useQrList, useQrMutations } from '@/composables/useQrCodes'
import { useQrFolders, useQrFolderMutations } from '@/composables/useQrFolders'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import type { QrCode, QrFolder, QrStyle } from '@/service/qr/qr-service'

const list = useQrList()
const { create, update, cancel, remove } = useQrMutations()
const foldersQuery = useQrFolders()
const { create: createFolder, remove: removeFolder } = useQrFolderMutations()
const workspace = useWorkspaceStore()

const qrs = computed<QrCode[]>(() => list.data.value ?? [])
const allFolders = computed<QrFolder[]>(() => foldersQuery.data.value ?? [])

// ─── Agrupamento por escopo ────────────────────────────────────────────────────
// Sempre agrupamos: "Pessoais" primeiro e depois UMA seção por empresa distinta.
// Assim quem só tem QRs de empresa (ou só pessoais) também vê um header nomeado —
// resolve o "cadê a listagem da empresa?".
type QrGroup = { key: string; label: string; icon: Component; items: QrCode[] }

const groups = computed<QrGroup[]>(() => {
  const result: QrGroup[] = []

  const personal = qrs.value.filter((q) => q.scope === 'personal')
  if (personal.length) {
    result.push({ key: 'personal', label: 'Pessoais', icon: User, items: personal })
  }

  // Uma entrada por companyId distinto (preservando a ordem de chegada).
  const seen = new Set<string>()
  for (const q of qrs.value) {
    if (q.scope !== 'company' || !q.companyId || seen.has(q.companyId)) continue
    seen.add(q.companyId)
    const items = qrs.value.filter((x) => x.companyId === q.companyId)
    // Nome vem do backend; fallback = nome no workspace store; senão "Empresa".
    const label =
      q.companyName ||
      workspace.companies.find((c) => c.id === q.companyId)?.name ||
      'Empresa'
    result.push({ key: q.companyId, label, icon: Building2, items })
  }

  return result
})

// ─── Segmented control (abas): Todos | Pessoais | <Empresa A> | … ──────────────
const route = useRoute()
const router = useRouter()
const activeScope = ref<string>(
  typeof route.query.scope === 'string' ? route.query.scope : 'all',
)

const tabs = computed(() => [
  { key: 'all', label: 'Todos', count: qrs.value.length },
  ...groups.value.map((g) => ({ key: g.key, label: g.label, count: g.items.length })),
])

// ─── Contexto da empresa da aba ativa (p/ pastas + tokens) ─────────────────────
// activeScope vira um companyId quando a aba de uma empresa está selecionada.
const activeCompany = computed(() => {
  if (activeScope.value === 'all' || activeScope.value === 'personal') return null
  const c = workspace.companies.find((x) => x.id === activeScope.value)
  if (!c) return null
  return { id: c.id, name: c.name, role: c.myRole }
})
const isAdminOfActive = computed(() => activeCompany.value?.role === 'ADMIN')

// ─── Pastas ────────────────────────────────────────────────────────────────────
// Pastas relevantes à aba: empresa → pastas daquela empresa; pessoal → pessoais;
// "Todos" → todas (só p/ filtrar; criar/excluir exige entrar num escopo).
const scopeFolders = computed<QrFolder[]>(() => {
  if (activeScope.value === 'personal') {
    return allFolders.value.filter((f) => f.scope === 'personal')
  }
  if (activeCompany.value) {
    return allFolders.value.filter((f) => f.companyId === activeCompany.value!.id)
  }
  return allFolders.value // aba "Todos": mostra todas para filtrar
})

// Filtro de pasta: 'all' | 'none' (sem pasta) | <folderId>.
const activeFolderId = ref<string>('all')
// Trocar de aba reseta o filtro de pasta (as pastas mudam de escopo).
watch(activeScope, () => {
  activeFolderId.value = 'all'
})

// Grupos visíveis conforme a aba ativa (em "Todos", todos; senão, só o escolhido),
// já aplicando o filtro de pasta.
const shownGroups = computed<QrGroup[]>(() => {
  const base =
    activeScope.value === 'all'
      ? groups.value
      : groups.value.filter((g) => g.key === activeScope.value)
  if (activeFolderId.value === 'all') return base
  return base
    .map((g) => ({
      ...g,
      items: g.items.filter((q) =>
        activeFolderId.value === 'none'
          ? !q.folderId
          : q.folderId === activeFolderId.value,
      ),
    }))
    .filter((g) => g.items.length)
})

// Se a aba ativa deixou de existir (ex.: excluí o último QR daquela empresa), volta p/ "Todos".
watch(groups, (g) => {
  if (activeScope.value !== 'all' && !g.some((x) => x.key === activeScope.value)) {
    activeScope.value = 'all'
  }
})

// Persiste a aba em ?scope= (compartilhar/recarregar mantém o filtro).
watch(activeScope, (scope) => {
  const query = { ...route.query }
  if (scope === 'all') delete query.scope
  else query.scope = scope
  router.replace({ query })
})

// ─── Criar / editar ───────────────────────────────────────────────────────────
const editOpen = ref(false)
const editing = ref<QrCode | null>(null)
const saving = computed(() => create.isPending.value || update.isPending.value)

function openCreate() {
  editing.value = null
  editOpen.value = true
}

function openEdit(qr: QrCode) {
  editing.value = qr
  editOpen.value = true
}

async function handleSubmit(payload: {
  targetUrl: string
  label: string
  active: boolean
  companyId: string | null
  folderId: string | null
  style: QrStyle
}) {
  try {
    if (editing.value) {
      await update.mutateAsync({
        id: editing.value.id,
        data: {
          targetUrl: payload.targetUrl,
          label: payload.label,
          active: payload.active,
          companyId: payload.companyId,
          folderId: payload.folderId,
          style: payload.style,
        },
      })
    } else {
      await create.mutateAsync({
        targetUrl: payload.targetUrl,
        label: payload.label || undefined,
        active: payload.active,
        companyId: payload.companyId,
        folderId: payload.folderId,
        style: payload.style,
      })
    }
    editOpen.value = false
  } catch {
    // Toast já é disparado pelas mutations; mantém o dialog aberto p/ correção.
  }
}

// ─── Métricas ─────────────────────────────────────────────────────────────────
const metricsFor = ref<QrCode | null>(null)

// ─── Cancelar ─────────────────────────────────────────────────────────────────
const cancelTarget = ref<QrCode | null>(null)
async function confirmCancel() {
  if (!cancelTarget.value) return
  try {
    await cancel.mutateAsync(cancelTarget.value.id)
    cancelTarget.value = null
  } catch {
    /* toast já disparado */
  }
}

// ─── Excluir QR (exige senha) ──────────────────────────────────────────────────
const removeTarget = ref<QrCode | null>(null)
async function confirmRemove(password: string) {
  if (!removeTarget.value) return
  try {
    await remove.mutateAsync({ id: removeTarget.value.id, password })
    removeTarget.value = null
  } catch {
    /* toast já disparado — mantém o dialog aberto p/ nova tentativa */
  }
}

// ─── Criar pasta ────────────────────────────────────────────────────────────────
// Escopo da nova pasta = empresa da aba ativa (só ADMIN) ou pessoal.
const creatingFolder = ref(false)
const newFolderName = ref('')
async function submitFolder() {
  const name = newFolderName.value.trim()
  if (!name) return
  try {
    await createFolder.mutateAsync({
      name,
      companyId: activeCompany.value?.id ?? null,
    })
    newFolderName.value = ''
    creatingFolder.value = false
  } catch {
    /* toast já disparado */
  }
}

// ─── Excluir pasta (exige senha) ────────────────────────────────────────────────
const folderRemoveTarget = ref<QrFolder | null>(null)
async function confirmFolderRemove(password: string) {
  if (!folderRemoveTarget.value) return
  try {
    await removeFolder.mutateAsync({ id: folderRemoveTarget.value.id, password })
    if (activeFolderId.value === folderRemoveTarget.value.id) {
      activeFolderId.value = 'all'
    }
    folderRemoveTarget.value = null
  } catch {
    /* toast já disparado */
  }
}
// Pessoal: dono gerencia. Empresa: só ADMIN pode excluir pasta.
const canManageFolders = computed(
  () => activeScope.value === 'personal' || isAdminOfActive.value,
)

// ─── Mover QR para pasta (ação direta no card) ──────────────────────────────────
// Pastas do MESMO escopo do QR (empresa dele, ou pessoais se for pessoal).
function foldersForQr(qr: QrCode): QrFolder[] {
  return qr.companyId
    ? allFolders.value.filter((f) => f.companyId === qr.companyId)
    : allFolders.value.filter((f) => f.scope === 'personal')
}
async function moveQr(qr: QrCode, folderId: string | null) {
  try {
    await update.mutateAsync({ id: qr.id, data: { folderId } })
  } catch {
    /* toast já disparado */
  }
}

// ─── Tokens de API (microserviço) ────────────────────────────────────────────
const tokensOpen = ref(false)
// Se a empresa ativa some (troca de aba / empresa saiu do store), fecha o dialog
// para ele não "reabrir sozinho" quando outra empresa virar ativa.
watch(activeCompany, (c) => {
  if (!c) tokensOpen.value = false
})
</script>

<template>
  <div class="qr-view">
    <header class="qr-head">
      <div>
        <p class="qr-eyebrow">Ferramentas</p>
        <h1 class="qr-title">QR Codes</h1>
        <p class="qr-sub">Imprima uma vez e troque o destino quando quiser — com métricas de leitura.</p>
      </div>
      <div class="qr-head-actions">
        <button
          v-if="activeCompany && isAdminOfActive"
          class="qr-secondary"
          type="button"
          @click="tokensOpen = true"
        >
          <KeyRound :size="15" />
          <span>Tokens de API</span>
        </button>
        <button class="qr-new" type="button" @click="openCreate">
          <Plus :size="16" />
          <span>Novo QR</span>
        </button>
      </div>
    </header>

    <!-- Loading -->
    <div v-if="list.isLoading.value" class="qr-grid">
      <div v-for="i in 3" :key="i" class="qr-skel">
        <Skeleton type="card" />
        <Skeleton type="text" :lines="2" />
      </div>
    </div>

    <!-- Erro -->
    <div v-else-if="list.isError.value" class="qr-state">
      <p class="qr-state-msg">Não foi possível carregar seus QR codes.</p>
      <button class="qr-retry" type="button" @click="() => list.refetch()">
        <RotateCw :size="15" />
        <span>Tentar de novo</span>
      </button>
    </div>

    <!-- Vazio -->
    <EmptyState
      v-else-if="!qrs.length"
      :icon="QrCodeIcon"
      title="Nenhum QR ainda"
      description="Crie um QR dinâmico: você imprime uma vez e pode trocar para onde ele aponta a qualquer momento, sem reimprimir."
    >
      <template #action>
        <button class="qr-new" type="button" @click="openCreate">
          <Plus :size="16" />
          <span>Criar primeiro QR</span>
        </button>
      </template>
    </EmptyState>

    <!-- Conteúdo: segmented control + seções por escopo (SEMPRE com header) -->
    <template v-else>
      <!-- Abas: Todos | Pessoais | <Empresa A> | … com contador em cada uma -->
      <div class="qr-tabs" role="tablist" aria-label="Filtrar QR codes por escopo">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          role="tab"
          class="qr-tab"
          :class="{ 'qr-tab--active': activeScope === tab.key }"
          :aria-selected="activeScope === tab.key"
          @click="activeScope = tab.key"
        >
          <span class="qr-tab-label">{{ tab.label }}</span>
          <span class="qr-tab-count">{{ tab.count }}</span>
        </button>
      </div>

      <!-- Barra de pastas: filtra em qualquer aba; criar/excluir só num escopo -->
      <div v-if="scopeFolders.length || canManageFolders" class="qr-folders">
        <span class="qr-folders-label"><Folder :size="13" /> Pastas:</span>
        <button
          type="button"
          class="qr-fchip"
          :class="{ 'qr-fchip--active': activeFolderId === 'all' }"
          @click="activeFolderId = 'all'"
        >
          Todas
        </button>
        <button
          v-for="folder in scopeFolders"
          :key="folder.id"
          type="button"
          class="qr-fchip"
          :class="{ 'qr-fchip--active': activeFolderId === folder.id }"
          @click="activeFolderId = folder.id"
        >
          <Folder :size="13" />
          <span>{{ folder.name }}</span>
          <span class="qr-fchip-count">{{ folder.qrCount }}</span>
          <span
            v-if="canManageFolders"
            class="qr-fchip-del"
            role="button"
            aria-label="Excluir pasta"
            @click.stop="folderRemoveTarget = folder"
          >
            <Trash2 :size="12" />
          </span>
        </button>
        <button
          type="button"
          class="qr-fchip"
          :class="{ 'qr-fchip--active': activeFolderId === 'none' }"
          @click="activeFolderId = 'none'"
        >
          Sem pasta
        </button>

        <!-- Criar pasta (empresa exige ADMIN — backend valida; front esconde) -->
        <template v-if="canManageFolders">
          <form v-if="creatingFolder" class="qr-fnew" @submit.prevent="submitFolder">
            <input
              v-model="newFolderName"
              class="qr-fnew-input"
              placeholder="Nome da pasta"
              maxlength="80"
              autofocus
            />
            <button type="submit" class="qr-fnew-ok" :disabled="!newFolderName.trim() || createFolder.isPending.value">
              Criar
            </button>
            <button type="button" class="qr-fnew-x" aria-label="Cancelar" @click="creatingFolder = false; newFolderName = ''">
              <X :size="14" />
            </button>
          </form>
          <button v-else type="button" class="qr-fchip qr-fchip--add" @click="creatingFolder = true">
            <FolderPlus :size="13" />
            <span>Nova pasta</span>
          </button>
        </template>
      </div>

      <section v-for="group in shownGroups" :key="group.key" class="qr-group">
        <div class="qr-group-head">
          <component :is="group.icon" :size="15" />
          <h2 class="qr-group-title">{{ group.label }}</h2>
          <span class="qr-group-count">{{ group.items.length }}</span>
        </div>
        <div class="qr-grid">
          <QrCard
            v-for="qr in group.items"
            :key="qr.id"
            :qr="qr"
            :folders="foldersForQr(qr)"
            @edit="openEdit(qr)"
            @metrics="metricsFor = qr"
            @cancel="cancelTarget = qr"
            @remove="removeTarget = qr"
            @move="(folderId) => moveQr(qr, folderId)"
          />
        </div>
      </section>
    </template>

    <!-- Dialogs -->
    <QrEditDialog
      v-model="editOpen"
      :editing="editing"
      :loading="saving"
      :folders="allFolders"
      @submit="handleSubmit"
    />

    <QrMetricsDialog
      v-if="metricsFor"
      :id="metricsFor.id"
      :label="metricsFor.label"
      @close="metricsFor = null"
    />

    <ConfirmDialog
      :model-value="!!cancelTarget"
      title="Cancelar este QR?"
      message="O link vai parar de redirecionar (responde como inativo). O QR não é apagado e as métricas continuam disponíveis — você pode reativá-lo editando."
      confirm-label="Cancelar QR"
      cancel-label="Voltar"
      :loading="cancel.isPending.value"
      @update:model-value="(v) => { if (!v) cancelTarget = null }"
      @confirm="confirmCancel"
    />

    <PasswordConfirmDialog
      :model-value="!!removeTarget"
      title="Excluir este QR?"
      message="Esta ação apaga o QR e todas as suas métricas de leitura. Não dá para desfazer. Confirme com sua senha."
      confirm-label="Excluir QR"
      :loading="remove.isPending.value"
      @update:model-value="(v) => { if (!v) removeTarget = null }"
      @confirm="confirmRemove"
    />

    <PasswordConfirmDialog
      :model-value="!!folderRemoveTarget"
      title="Excluir esta pasta?"
      message="Os QR codes NÃO são apagados — eles apenas saem da pasta. Confirme com sua senha."
      confirm-label="Excluir pasta"
      :loading="removeFolder.isPending.value"
      @update:model-value="(v) => { if (!v) folderRemoveTarget = null }"
      @confirm="confirmFolderRemove"
    />

    <QrApiTokensDialog
      v-if="tokensOpen && activeCompany"
      :company-id="activeCompany.id"
      :company-name="activeCompany.name"
      @close="tokensOpen = false"
    />
  </div>
</template>

<style scoped>
.qr-view {
  max-width: 1080px;
  margin: 0 auto;
  padding: 24px 20px 60px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.qr-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.qr-eyebrow {
  margin: 0 0 2px;
  color: var(--text-4);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.qr-title {
  margin: 0;
  font-size: var(--text-title-large, 24px);
  font-weight: 780;
  letter-spacing: -0.02em;
  color: var(--text);
}

.qr-sub {
  margin: 4px 0 0;
  color: var(--text-3);
  font-size: 13px;
  max-width: 520px;
}

.qr-new {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--accent-fg);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: filter var(--motion-fast) var(--motion-ease);
}

.qr-new:hover {
  filter: brightness(1.05);
}

.qr-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.qr-secondary {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.qr-secondary:hover {
  border-color: var(--border-strong);
}

/* Barra de pastas */
.qr-folders {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.qr-folders-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-right: 4px;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 700;
}

.qr-fchip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 11px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.qr-fchip:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.qr-fchip--active {
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  color: var(--accent);
}

.qr-fchip--add {
  border-style: dashed;
  color: var(--text-3);
}

.qr-fchip-count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--text-3);
  font-size: 10.5px;
  font-weight: 700;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.qr-fchip-del {
  display: inline-flex;
  align-items: center;
  margin-left: 2px;
  padding: 2px;
  border-radius: 999px;
  color: var(--text-4);
}

.qr-fchip-del:hover {
  color: var(--err);
  background: color-mix(in srgb, var(--err) 12%, transparent);
}

.qr-fnew {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.qr-fnew-input {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 12px;
}

.qr-fnew-input:focus {
  outline: none;
  border-color: var(--accent);
}

.qr-fnew-ok {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--accent);
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-fg);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.qr-fnew-ok:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.qr-fnew-x {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
}

/* Segmented control (abas por escopo) */
.qr-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.qr-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  padding: 0 13px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  font: inherit;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
  transition: background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.qr-tab:hover {
  color: var(--text-2);
  background: color-mix(in srgb, var(--surface) 60%, transparent);
}

.qr-tab--active {
  background: var(--surface);
  border-color: var(--border);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.qr-tab-count {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--text-3);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.qr-tab--active .qr-tab-count {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}

.qr-group {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.qr-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-3);
}

.qr-group-title {
  margin: 0;
  font-size: 13px;
  font-weight: 750;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.qr-group-count {
  min-width: 22px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-3);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.qr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.qr-skel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.qr-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 60px 24px;
  text-align: center;
}

.qr-state-msg {
  margin: 0;
  color: var(--text-2);
  font-size: 14px;
}

.qr-retry {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.qr-retry:hover {
  border-color: var(--border-strong);
}

@media (max-width: 560px) {
  .qr-grid {
    grid-template-columns: 1fr;
  }
}
</style>
