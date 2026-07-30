<script setup lang="ts">
/**
 * Tela de QR codes.
 *
 * ## Paginada no servidor, e por quê
 *
 * A versão anterior pedia TODOS os QRs e desenhava todos os previews de uma vez.
 * Cada card monta ~340 nós de SVG; com 441 QRs em produção isso era ~150 mil nós
 * numa montagem só, e a aba congelava por segundos. O custo era linear no número
 * de QRs, ou seja, piorava a cada QR criado.
 *
 * Agora a lista pede uma página por vez, e busca, projeto e pasta viram filtro de
 * consulta em vez de filtro em memória.
 *
 * ## O que a paginação obrigou a tratar
 *
 * Criar um QR joga ele no topo da PÁGINA 1 (o backend ordena por `createdAt`
 * desc). Quem estava na página 3, ou com busca ativa, criaria e não veria nada
 * mudar — parece que falhou. Por isso criar volta pra primeira página e limpa a
 * busca. Pelo mesmo motivo, esvaziar a última página recua uma.
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BookOpen, KeyRound, Plus, QrCode as QrCodeIcon, RotateCw, SearchX, SlidersHorizontal, X } from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import PasswordConfirmDialog from '@/components/ui/PasswordConfirmDialog.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import QrCard from './components/QrCard.vue'
import QrEditDialog from './components/QrEditDialog.vue'
import QrMetricsDialog from './components/QrMetricsDialog.vue'
import QrApiTokensDialog from './components/QrApiTokensDialog.vue'
import QrSidebar from './components/QrSidebar.vue'
import QrPagination from './components/QrPagination.vue'
import { useQrList, useQrMutations } from '@/composables/useQrCodes'
import { useQrFolders, useQrFolderMutations } from '@/composables/useQrFolders'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { apiBaseUrl } from '@/service/api'
import type { QrCode, QrFolder, QrStyle } from '@/service/qr/qr-service'

/**
 * Docs do integrador (Scalar, servida pela API). Antes esse link só existia
 * DENTRO do diálogo de tokens, ou seja: quem não sabia que a API existia nunca
 * descobria. No header, a porta de entrada da integração fica à vista.
 */
const integratorDocsUrl = `${apiBaseUrl()}/qr-docs`

const route = useRoute()
const router = useRouter()
const workspace = useWorkspaceStore()

// ─── Estado dos filtros ────────────────────────────────────────────────────────
const PAGE_SIZE = 24

const activeScope = ref<string>(
  typeof route.query.scope === 'string' ? route.query.scope : 'all',
)
const activeFolderId = ref<string>('all')
const page = ref(1)
/** O que está no campo. Vai pro servidor só depois da pausa (ver watcher). */
const searchInput = ref('')
/** O que já virou consulta. */
const search = ref('')

let searchTimer: number | null = null
watch(searchInput, (value) => {
  if (searchTimer !== null) window.clearTimeout(searchTimer)
  // Sem debounce, cada tecla vira uma consulta paginada no banco.
  searchTimer = window.setTimeout(() => {
    search.value = value.trim()
    page.value = 1
  }, 350)
})

const listParams = computed(() => ({
  page: page.value,
  limit: PAGE_SIZE,
  ...(search.value ? { search: search.value } : {}),
  ...(activeScope.value !== 'all' ? { scope: activeScope.value } : {}),
  ...(activeFolderId.value !== 'all' ? { folderId: activeFolderId.value } : {}),
}))

const list = useQrList(listParams)
const { create, update, cancel, remove } = useQrMutations()
const foldersQuery = useQrFolders()
const { create: createFolder, remove: removeFolder } = useQrFolderMutations()

const pageData = computed(() => list.data.value)
const items = computed<QrCode[]>(() => pageData.value?.items ?? [])
const total = computed(() => pageData.value?.total ?? 0)
const totalAll = computed(() => pageData.value?.totalAll ?? 0)
const scopes = computed(() => pageData.value?.scopes ?? [])
const allFolders = computed<QrFolder[]>(() => foldersQuery.data.value ?? [])

/** Nenhum QR existe (diferente de "o filtro não achou nada"). */
const vazioDeVerdade = computed(
  () => !list.isLoading.value && totalAll.value === 0 && !search.value,
)

// Trocar de projeto ou de pasta sempre reinicia a paginação: manter a página 7
// ao entrar num projeto com 2 páginas mostraria uma lista vazia.
watch([activeScope, activeFolderId], () => {
  page.value = 1
})

// Persiste o projeto em ?scope= (recarregar/compartilhar mantém o filtro).
watch(activeScope, (scope) => {
  const query = { ...route.query }
  if (scope === 'all') delete query.scope
  else query.scope = scope
  void router.replace({ query })
})

/**
 * Página que ficou vazia depois de excluir/mover o último item dela.
 * Sem isto a pessoa fica olhando um vazio que não é vazio de verdade.
 */
watch([items, total], ([lista, count]) => {
  if (!list.isFetching.value && lista.length === 0 && count > 0 && page.value > 1) {
    page.value = Math.min(page.value - 1, Math.ceil(count / PAGE_SIZE))
  }
})

// ─── Contexto do projeto ativo (p/ pastas + tokens) ────────────────────────────
const activeCompany = computed(() => {
  if (activeScope.value === 'all' || activeScope.value === 'personal') return null
  const c = workspace.companies.find((x) => x.id === activeScope.value)
  if (!c) return null
  return { id: c.id, name: c.name, role: c.myRole }
})
const isAdminOfActive = computed(() => activeCompany.value?.role === 'ADMIN')
// Pessoal: o dono gerencia. Empresa: só ADMIN. O backend valida de novo.
const canManageFolders = computed(
  () => activeScope.value === 'personal' || isAdminOfActive.value,
)

// ─── Criar / editar QR ─────────────────────────────────────────────────────────
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
      // O QR novo nasce no topo da página 1. Sem voltar pra lá (e sem limpar a
      // busca) a pessoa cria e não vê nada acontecer.
      page.value = 1
      searchInput.value = ''
      search.value = ''
    }
    editOpen.value = false
  } catch {
    // Toast já disparado pelas mutations; mantém o dialog aberto p/ correção.
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

// ─── Pastas ────────────────────────────────────────────────────────────────────
const creatingFolder = ref(false)
async function submitFolder(name: string) {
  try {
    await createFolder.mutateAsync({
      name,
      companyId: activeCompany.value?.id ?? null,
    })
    creatingFolder.value = false
  } catch {
    /* toast já disparado */
  }
}

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

// ─── Mover QR para pasta ───────────────────────────────────────────────────────
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

// ─── Tokens de API ─────────────────────────────────────────────────────────────
const tokensOpen = ref(false)
watch(activeCompany, (c) => {
  if (!c) tokensOpen.value = false
})

// ─── Navegação em tela estreita ────────────────────────────────────────────────
// Abaixo de 900px a coluna sai do fluxo e vira gaveta; sem isso ela roubaria
// metade da largura de um celular.
const navOpen = ref(false)
watch([activeScope, activeFolderId], () => {
  navOpen.value = false
})

function limparBusca() {
  searchInput.value = ''
  search.value = ''
  page.value = 1
}
</script>

<template>
  <div class="qr-view">
    <!-- Coluna de navegação -->
    <div class="qr-nav" :class="{ 'qr-nav--open': navOpen }">
      <QrSidebar
        :scopes="scopes"
        :total-all="totalAll"
        :folders="allFolders"
        :active-scope="activeScope"
        :active-folder-id="activeFolderId"
        :search="searchInput"
        :can-manage-folders="canManageFolders"
        :creating-folder="creatingFolder"
        :saving-folder="createFolder.isPending.value"
        @update:search="searchInput = $event"
        @update:active-scope="activeScope = $event"
        @update:active-folder-id="activeFolderId = $event"
        @create-folder="submitFolder"
        @remove-folder="folderRemoveTarget = $event"
        @toggle-create="creatingFolder = $event"
      />
    </div>

    <!-- Fundo que fecha a gaveta no mobile -->
    <button
      v-if="navOpen"
      type="button"
      class="qr-nav-scrim"
      aria-label="Fechar filtros"
      @click="navOpen = false"
    />

    <!-- Conteúdo -->
    <div class="qr-main">
      <header class="qr-head">
        <div class="qr-head-title">
          <button
            type="button"
            class="qr-nav-toggle"
            aria-label="Abrir filtros"
            @click="navOpen = true"
          >
            <SlidersHorizontal :size="16" />
          </button>
          <div>
            <p class="qr-eyebrow">Ferramentas</p>
            <h1 class="qr-title">QR Codes</h1>
          </div>
        </div>
        <div class="qr-head-actions">
          <a
            class="qr-secondary"
            :href="integratorDocsUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <BookOpen :size="15" />
            <span>Docs da API</span>
          </a>
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
        <div v-for="i in 6" :key="i" class="qr-skel">
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

      <!-- Nenhum QR existe -->
      <EmptyState
        v-else-if="vazioDeVerdade"
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

      <!-- O filtro não achou nada (distinto de não ter nenhum QR) -->
      <EmptyState
        v-else-if="!items.length"
        :icon="SearchX"
        title="Nada encontrado"
        :description="
          search
            ? `Nenhum QR com “${search}” no nome ou no destino, dentro deste filtro.`
            : 'Nenhum QR neste projeto ou pasta.'
        "
      >
        <template #action>
          <button v-if="search" class="qr-secondary" type="button" @click="limparBusca">
            <X :size="15" />
            <span>Limpar busca</span>
          </button>
        </template>
      </EmptyState>

      <template v-else>
        <div class="qr-grid" :class="{ 'qr-grid--loading': list.isFetching.value }">
          <QrCard
            v-for="qr in items"
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

        <QrPagination
          :page="page"
          :limit="PAGE_SIZE"
          :total="total"
          :loading="list.isFetching.value"
          @update:page="page = $event"
        />
      </template>
    </div>

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
      message="O link vai parar de redirecionar (responde como inativo). O QR não é apagado e as métricas continuam disponíveis. Você pode reativá-lo editando."
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
      message="Os QR codes NÃO são apagados, eles apenas saem da pasta. Confirme com sua senha."
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
/* Duas colunas. A anterior era uma coluna centralizada de 1080px, o que deixava
   duas faixas mortas nas laterais em tela cheia e empurrava a navegação pro meio
   do conteúdo, competindo espaço com os próprios cards. */
.qr-view {
  display: grid;
  /* 220px é o mínimo em que "prod-parceiros" + contador cabem sem cortar. A
     coluna não pode crescer além disso: ela já divide a largura com a navegação
     do próprio app, e cada pixel a mais aqui sai de uma coluna de cards. */
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 24px;
  max-width: 1520px;
  margin: 0 auto;
  padding: 24px 24px 60px;
  align-items: start;
}

.qr-nav {
  position: sticky;
  /* Acompanha o scroll: com 8 pastas a navegação some antes da lista acabar. */
  top: 24px;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  min-width: 0;
}

.qr-nav-scrim {
  display: none;
}

.qr-nav-toggle {
  display: none;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text-2);
  cursor: pointer;
}

.qr-main {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

.qr-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.qr-head-title {
  display: flex;
  align-items: center;
  gap: 12px;
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

.qr-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
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
  text-decoration: none; /* a mesma classe veste <button> e <a> (Docs da API) */
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.qr-secondary:hover {
  border-color: var(--border-strong);
}

/* 264px e não 300: a coluna de navegação come largura, e com 300 a grade caía
   para 2 colunas num monitor de 1440 — menos cards visíveis do que na versão
   centralizada que esta tela veio substituir, o que anularia o ganho. */
.qr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(264px, 1fr));
  gap: 16px;
  transition: opacity var(--motion) var(--motion-ease);
}

/* Página trocando: esmaece em vez de sumir. A grade sumindo a cada clique é o
   que faz uma paginação rápida PARECER lenta. */
.qr-grid--loading {
  opacity: 0.55;
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

/* ─── Tela estreita: a navegação vira gaveta ──────────────────────────────── */
@media (max-width: 900px) {
  .qr-view {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
    padding: 20px 16px 48px;
  }

  .qr-nav {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 40;
    width: min(292px, 86vw);
    max-height: none;
    padding: 20px 16px;
    background: var(--surface);
    box-shadow: var(--shadow-overlay);
    transform: translateX(-100%);
    transition: transform var(--motion) var(--motion-ease);
  }

  .qr-nav--open {
    transform: translateX(0);
  }

  .qr-nav-scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 39;
    border: none;
    background: var(--scrim, rgb(0 0 0 / 45%));
    cursor: pointer;
  }

  .qr-nav-toggle {
    display: grid;
  }

  .qr-grid {
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }
}

@media (max-width: 560px) {
  .qr-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .qr-nav,
  .qr-grid {
    transition-duration: 1ms;
  }
}
</style>
