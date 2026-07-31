<script setup lang="ts">
/**
 * Acessos Públicos: o lugar único dos tokens de API (spec
 * docs/specs/acessos-publicos.md).
 *
 * A listagem é AGREGADA — todas as empresas onde o usuário é ADMIN, sem
 * depender da empresa ativa do topo. Cada token declara a qual ferramenta dá
 * acesso (QR, OCR ou total) e quem o criou; revogar é privilégio exclusivo do
 * criador (`mine`), regra aplicada no backend e refletida no botão.
 */
import { computed, ref, watch } from 'vue'
import {
  BookOpen,
  Check,
  Copy,
  Loader2,
  Plug,
  Plus,
  QrCode,
  RefreshCw,
  ScanText,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Pill from '@/components/ui/Pill.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { apiBaseUrl } from '@/service/api'
import { useToast } from '@/composables/useToast'
import { useQrFolders } from '@/composables/useQrFolders'
import {
  usePublicAccessMutations,
  usePublicAccessTokens,
} from './composables/usePublicAccess'
import type {
  ApiTokenScope,
  PublicAccessToken,
  PublicAccessTokenCreated,
} from '@/service/public-access/public-access-service'

const { success, error: showError } = useToast()

const list = usePublicAccessTokens()
const { create, revoke } = usePublicAccessMutations()

const companies = computed(() => list.data.value?.companies ?? [])
const tokens = computed(() => list.data.value?.tokens ?? [])

// ─── Filtros ─────────────────────────────────────────────────────────────────
const filterCompany = ref('all')
const filterState = ref<'all' | 'active' | 'revoked'>('active')

const companyFilterItems = computed(() => [
  { label: 'Todas as empresas', value: 'all' },
  ...companies.value.map((c) => ({ label: c.name, value: c.id })),
])

const companyName = (id: string) =>
  companies.value.find((c) => c.id === id)?.name ?? 'Empresa'

const visibleTokens = computed(() =>
  tokens.value.filter((t) => {
    if (filterCompany.value !== 'all' && t.companyId !== filterCompany.value) {
      return false
    }
    if (filterState.value === 'active' && t.revoked) return false
    if (filterState.value === 'revoked' && !t.revoked) return false
    return true
  }),
)

const activeCount = computed(() => tokens.value.filter((t) => !t.revoked).length)

// ─── Criação ─────────────────────────────────────────────────────────────────
const createOpen = ref(false)
const newName = ref('')
const newCompanyId = ref('')
const newScope = ref<'total' | ApiTokenScope>('total')
const newFolderId = ref('')
// Token recém-criado: o valor cru aparece UMA vez, aqui.
const justCreated = ref<PublicAccessTokenCreated | null>(null)

// Pastas da empresa ESCOLHIDA no formulário (não da empresa ativa do topo).
const folderCompanyId = computed(() =>
  // Só busca pastas com o dialog aberto e escopo que use QR: sem isto a página
  // disparava um GET /qr/folders inútil a cada visita.
  createOpen.value && newScope.value !== 'ocr' ? newCompanyId.value || null : null,
)
const foldersQuery = useQrFolders(folderCompanyId)
const folderItems = computed(() => [
  { label: 'Nenhuma (sem pasta padrão)', value: '' },
  ...(foldersQuery.data.value ?? [])
    .filter((f) => f.scope === 'company')
    .map((f) => ({ label: f.name, value: f.id })),
])

const scopeItems = [
  { label: 'QR Codes e OCR Digital', value: 'total' },
  { label: 'Só QR Codes', value: 'qr' },
  { label: 'Só OCR Digital', value: 'ocr' },
]

function openCreate() {
  newName.value = ''
  newCompanyId.value = companies.value[0]?.id ?? ''
  newScope.value = 'total'
  newFolderId.value = ''
  createOpen.value = true
}

// Trocar de empresa invalida a pasta padrão escolhida (ela era da outra).
watch(newCompanyId, () => {
  newFolderId.value = ''
})
watch(newScope, (s) => {
  if (s === 'ocr') newFolderId.value = ''
})

const canCreate = computed(
  () => !!newName.value.trim() && !!newCompanyId.value && !create.isPending.value,
)

async function handleCreate() {
  if (!canCreate.value) return
  try {
    const created = await create.mutateAsync({
      companyId: newCompanyId.value,
      name: newName.value.trim(),
      scope: newScope.value === 'total' ? null : newScope.value,
      defaultFolderId: newFolderId.value || null,
    })
    createOpen.value = false
    justCreated.value = created
  } catch {
    /* toast já disparado pela mutation */
  }
}

// ─── Revogação ───────────────────────────────────────────────────────────────
const revoking = ref<PublicAccessToken | null>(null)

/**
 * Token alheio usa `aria-disabled`, não `disabled`: o botão continua focável e
 * clicável para PODER explicar o motivo (botão `disabled` não dispara tooltip
 * nem entra na ordem de tab, deixando o usuário sem resposta nenhuma).
 */
function onRevokeClick(t: PublicAccessToken) {
  if (!t.mine) {
    showError(`Só quem criou revoga. Este token é de ${t.createdByName}.`)
    return
  }
  revoking.value = t
}

async function confirmRevoke() {
  const t = revoking.value
  if (!t) return
  try {
    await revoke.mutateAsync({ companyId: t.companyId, id: t.id })
  } catch {
    /* toast já disparado pela mutation; sem catch a promise rejeitava solta */
  } finally {
    revoking.value = null
  }
}

// ─── Copiar ──────────────────────────────────────────────────────────────────
const copied = ref<string | null>(null)
async function copy(text: string, key: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = key
    success('Copiado')
    setTimeout(() => {
      if (copied.value === key) copied.value = null
    }, 1600)
  } catch {
    /* clipboard indisponível */
  }
}

// ─── Apresentação ────────────────────────────────────────────────────────────
const qrDocsUrl = `${apiBaseUrl()}/qr-docs`
const ocrDocsUrl = `${apiBaseUrl()}/ocr-docs`

const curlExample = computed(() => {
  const t = justCreated.value
  const token = t?.token ?? 'SEU_TOKEN'
  if (t?.scope === 'ocr') {
    return (
      `curl -X POST ${apiBaseUrl()}/api/v1/ocr/read \\\n` +
      `  -H "Authorization: Bearer ${token}" \\\n` +
      `  -F "file=@contrato.pdf"`
    )
  }
  return (
    `curl -X POST ${apiBaseUrl()}/api/v1/qr \\\n` +
    `  -H "Authorization: Bearer ${token}" \\\n` +
    `  -H "Content-Type: application/json" \\\n` +
    `  -d '{"targetUrl":"https://exemplo.com","label":"Campanha"}'`
  )
})

function scopeLabel(scope: ApiTokenScope | null): string {
  if (scope === 'qr') return 'QR Codes'
  if (scope === 'ocr') return 'OCR Digital'
  return 'QR + OCR'
}

function fmtWhen(iso: string | null): string {
  if (!iso) return 'nunca usado'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="pa-view">
    <header class="pa-head">
      <div>
        <p class="pa-eyebrow">Ferramentas</p>
        <div class="pa-title-row">
          <h1 class="pa-title">Acessos Públicos</h1>
          <Pill :icon="Plug" color="var(--accent)" variant="soft">
            {{ activeCount }} {{ activeCount === 1 ? 'token ativo' : 'tokens ativos' }}
          </Pill>
        </div>
        <p class="pa-sub">
          As chaves que os sistemas de fora usam para falar com o workflow. Cada token
          pertence a uma empresa, vale para as ferramentas que você escolher, e só quem
          criou pode revogar.
        </p>
      </div>
      <div class="pa-head-actions">
        <a class="pa-secondary" :href="qrDocsUrl" target="_blank" rel="noopener noreferrer">
          <BookOpen :size="15" />
          <span>Docs QR</span>
        </a>
        <a class="pa-secondary" :href="ocrDocsUrl" target="_blank" rel="noopener noreferrer">
          <BookOpen :size="15" />
          <span>Docs OCR</span>
        </a>
        <button
          class="pa-primary"
          type="button"
          :disabled="!companies.length"
          @click="openCreate"
        >
          <Plus :size="15" />
          <span>Novo token</span>
        </button>
      </div>
    </header>

    <!-- Token recém-criado: revelar uma única vez -->
    <section v-if="justCreated" class="pa-reveal" role="status">
      <div class="pa-reveal-top">
        <ShieldCheck :size="15" />
        <span>Copie agora. Este valor não aparece de novo.</span>
      </div>
      <div class="pa-reveal-value">
        <code>{{ justCreated.token }}</code>
        <button
          class="pa-icon-btn"
          type="button"
          :aria-label="copied === 'raw' ? 'Copiado' : 'Copiar token'"
          @click="copy(justCreated.token, 'raw')"
        >
          <Check v-if="copied === 'raw'" :size="14" />
          <Copy v-else :size="14" />
        </button>
      </div>
      <details class="pa-example">
        <summary>Como usar (exemplo curl)</summary>
        <pre>{{ curlExample }}</pre>
        <button class="pa-inline-btn" type="button" @click="copy(curlExample, 'curl')">
          <Check v-if="copied === 'curl'" :size="13" />
          <Copy v-else :size="13" />
          <span>Copiar exemplo</span>
        </button>
      </details>
      <button class="pa-secondary pa-secondary--sm" type="button" @click="justCreated = null">
        Ok, guardei
      </button>
    </section>

    <!-- Falha de rede/servidor vem ANTES do vazio: sem isto, um ADMIN legítimo
         leria "você não administra nenhuma empresa" quando a API caiu. -->
    <section v-if="list.isError.value" class="pa-error">
      <div>
        <h2 class="pa-error-title">Não foi possível carregar os acessos</h2>
        <p class="pa-error-text">
          A lista não chegou do servidor. Isso não diz nada sobre seus tokens: eles
          continuam valendo.
        </p>
      </div>
      <button class="pa-secondary pa-secondary--sm" type="button" @click="() => list.refetch()">
        <RefreshCw :size="14" />
        <span>Tentar de novo</span>
      </button>
    </section>

    <!-- Sem nenhuma empresa como ADMIN -->
    <EmptyState
      v-else-if="!list.isLoading.value && !companies.length"
      :icon="Plug"
      title="Você não administra nenhuma empresa"
      description="Tokens de API são criados por ADMIN da empresa. Peça a um administrador para promover seu acesso."
    />

    <template v-else>
      <div class="pa-filters">
        <AppSelect
          v-model="filterCompany"
          :items="companyFilterItems"
          label="Filtrar por empresa"
          class="pa-filter-select"
        />
        <div class="pa-segmented" role="group" aria-label="Filtrar por estado">
          <button
            v-for="opt in [
              { v: 'active', label: 'Ativos' },
              { v: 'revoked', label: 'Revogados' },
              { v: 'all', label: 'Todos' },
            ]"
            :key="opt.v"
            type="button"
            class="pa-seg"
            :aria-pressed="filterState === opt.v"
            :class="{ 'pa-seg--on': filterState === opt.v }"
            @click="filterState = opt.v as 'all' | 'active' | 'revoked'"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <div v-if="list.isLoading.value" class="pa-loading">
        <Skeleton type="row" />
        <Skeleton type="row" />
        <Skeleton type="row" />
      </div>

      <EmptyState
        v-else-if="!visibleTokens.length"
        :icon="Plug"
        title="Nenhum token por aqui"
        description="Crie um token para liberar o QR Codes ou o OCR Digital ao sistema de uma empresa."
      />

      <ul v-else class="pa-list">
        <li v-for="t in visibleTokens" :key="t.id" class="pa-row" :class="{ 'pa-row--off': t.revoked }">
          <div class="pa-row-main">
            <div class="pa-row-title">
              <span class="pa-name">{{ t.name }}</span>
              <code class="pa-prefix">{{ t.tokenPrefix }}…</code>
              <Pill
                :icon="t.scope === 'ocr' ? ScanText : QrCode"
                :color="t.revoked ? 'var(--text-4)' : 'var(--accent)'"
                variant="soft"
              >
                {{ scopeLabel(t.scope) }}
              </Pill>
              <Pill v-if="t.revoked" color="var(--err)" variant="soft">Revogado</Pill>
            </div>
            <p class="pa-row-meta">
              {{ companyName(t.companyId) }}
              <span class="pa-sep">·</span>
              criado por {{ t.mine ? 'você' : t.createdByName }}
              <span class="pa-sep">·</span>
              {{ fmtWhen(t.lastUsedAt) }}
            </p>
          </div>
          <button
            v-if="!t.revoked"
            class="pa-icon-btn pa-icon-btn--danger"
            :class="{ 'pa-icon-btn--muted': !t.mine }"
            type="button"
            :aria-disabled="!t.mine"
            :title="
              t.mine
                ? 'Revogar este token'
                : `Só quem criou revoga: este token é de ${t.createdByName}`
            "
            :aria-label="t.mine ? `Revogar ${t.name}` : `Revogar bloqueado: token de ${t.createdByName}`"
            @click="onRevokeClick(t)"
          >
            <Trash2 :size="14" />
          </button>
        </li>
      </ul>
    </template>

    <!-- Criação -->
    <AppDialog v-model="createOpen" label="Novo token de acesso" size="md" persistent>
      <header class="pa-dialog-head">
        <span class="pa-dialog-icon"><Plug :size="17" /></span>
        <div class="pa-dialog-head-txt">
          <h2 class="pa-dialog-title">Novo token</h2>
          <p class="pa-dialog-sub">O valor completo aparece uma única vez, logo após criar.</p>
        </div>
        <button class="pa-icon-btn" type="button" aria-label="Fechar" @click="createOpen = false">
          <X :size="15" />
        </button>
      </header>

      <div class="pa-form">
        <label class="pa-field">
          <span class="pa-label">Nome</span>
          <input
            v-model="newName"
            class="pa-input"
            type="text"
            placeholder="ex.: integração Sentia, n8n webhook"
            maxlength="80"
            @keyup.enter="handleCreate"
          />
        </label>

        <!-- <div>, não <label>: o controle do AppSelect é um <button>, que não
             recebe nome de <label> envolvente e ainda abriria o dropdown ao
             clicar no texto de ajuda. O nome acessível vem da prop `label`. -->
        <div class="pa-field">
          <span class="pa-label">Empresa</span>
          <AppSelect
            v-model="newCompanyId"
            :items="companies.map((c) => ({ label: c.name, value: c.id }))"
            label="Empresa do token"
          />
          <span class="pa-hint">Só aparecem empresas onde você é ADMIN.</span>
        </div>

        <div class="pa-field">
          <span class="pa-label">Acesso a</span>
          <AppSelect v-model="newScope" :items="scopeItems" label="Escopo do token" />
          <span class="pa-hint">
            Um token de OCR não cria QR codes, e vice-versa. Na dúvida, deixe nas duas.
          </span>
        </div>

        <div v-if="newScope !== 'ocr'" class="pa-field">
          <span class="pa-label">Pasta padrão dos QRs (opcional)</span>
          <AppSelect
            v-model="newFolderId"
            :items="folderItems"
            label="Pasta padrão dos QR codes"
          />
        </div>
      </div>

      <footer class="pa-dialog-foot">
        <button class="pa-secondary pa-secondary--sm" type="button" @click="createOpen = false">
          Cancelar
        </button>
        <button class="pa-primary pa-primary--sm" type="button" :disabled="!canCreate" @click="handleCreate">
          <Loader2 v-if="create.isPending.value" :size="14" class="spin" />
          <Plus v-else :size="14" />
          <span>Criar token</span>
        </button>
      </footer>
    </AppDialog>

    <ConfirmDialog
      :model-value="!!revoking"
      title="Revogar este token?"
      :message="`O sistema que usa ${revoking?.name ?? 'este token'} perde o acesso imediatamente. Não dá para desfazer: crie um novo se precisar.`"
      confirm-label="Revogar"
      cancel-label="Voltar"
      :loading="revoke.isPending.value"
      @update:model-value="(v) => { if (!v) revoking = null }"
      @confirm="confirmRevoke"
    />
  </div>
</template>

<style scoped>
.pa-view {
  max-width: 1080px;
  margin: 0 auto;
  padding: 24px 24px 60px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.spin {
  animation: pa-spin 0.9s linear infinite;
}

@keyframes pa-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ─── Header ─────────────────────────────────────────────────────────────── */
.pa-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.pa-eyebrow {
  margin: 0 0 2px;
  color: var(--text-4);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pa-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.pa-title {
  margin: 0;
  font-size: var(--text-title-large, 24px);
  font-weight: 780;
  letter-spacing: -0.02em;
  color: var(--text);
}

.pa-sub {
  margin: 6px 0 0;
  color: var(--text-3);
  font-size: 13.5px;
  max-width: 620px;
  line-height: 1.55;
}

.pa-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.pa-primary {
  min-height: 42px;
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

.pa-primary:hover:not(:disabled) {
  filter: brightness(1.05);
}

.pa-primary:disabled,
.pa-secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.pa-primary--sm,
.pa-secondary--sm {
  min-height: 34px;
  padding: 0 12px;
  font-size: 12.5px;
}

.pa-secondary {
  min-height: 42px;
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
  text-decoration: none;
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.pa-secondary:hover:not(:disabled) {
  border-color: var(--border-strong);
}

.pa-icon-btn {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
}

.pa-icon-btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border-strong);
}

.pa-icon-btn--muted {
  /* Contraste preservado: 0.4 sobre --text-3 sumia. Aqui o ícone continua
     legível e o cursor sinaliza que a ação existe mas não é sua. */
  color: var(--text-4);
  cursor: not-allowed;
}

.pa-icon-btn--danger:hover:not(:disabled) {
  color: var(--err);
  border-color: color-mix(in srgb, var(--err) 45%, var(--border));
}

/* ─── Reveal do token ────────────────────────────────────────────────────── */
.pa-reveal {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 16px 18px;
  border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--border));
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--warn) 8%, var(--surface));
}

.pa-reveal-top {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 650;
}

.pa-reveal-value {
  align-self: stretch;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.pa-reveal-value code {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text);
}

.pa-example {
  align-self: stretch;
  font-size: 12.5px;
  color: var(--text-3);
}

.pa-example summary {
  cursor: pointer;
  padding: 2px 0;
}

.pa-example pre {
  margin: 8px 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.6;
  overflow-x: auto;
}

.pa-inline-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

/* ─── Filtros ────────────────────────────────────────────────────────────── */
.pa-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.pa-filter-select {
  min-width: 220px;
}

.pa-segmented {
  display: inline-flex;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  gap: 2px;
}

.pa-seg {
  min-height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  font: inherit;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
}

.pa-seg--on {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.pa-loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pa-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 16px 18px;
  border: 1px solid color-mix(in srgb, var(--err) 40%, var(--border));
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--err) 7%, var(--surface));
}

.pa-error-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}

.pa-error-text {
  margin: 0;
  color: var(--text-3);
  font-size: 12.5px;
  max-width: 560px;
  line-height: 1.5;
}

/* ─── Lista ──────────────────────────────────────────────────────────────── */
.pa-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pa-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.pa-row--off {
  opacity: 0.62;
}

.pa-row-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pa-row-title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.pa-name {
  color: var(--text);
  font-size: 13.5px;
  font-weight: 680;
}

.pa-prefix {
  padding: 2px 7px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 11.5px;
}

.pa-row-meta {
  margin: 0;
  color: var(--text-4);
  font-size: 11.5px;
}

.pa-sep {
  opacity: 0.6;
  margin: 0 4px;
}

/* ─── Dialog ─────────────────────────────────────────────────────────────── */
.pa-dialog-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 18px;
}

.pa-dialog-head-txt {
  flex: 1;
  min-width: 0;
}

.pa-dialog-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  color: var(--accent);
}

.pa-dialog-title {
  margin: 0;
  font-size: 15px;
  font-weight: 720;
  color: var(--text);
}

.pa-dialog-sub {
  margin: 3px 0 0;
  color: var(--text-3);
  font-size: 12.5px;
}

.pa-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pa-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pa-label {
  color: var(--text-2);
  font-size: 12px;
  font-weight: 650;
}

.pa-hint {
  color: var(--text-4);
  font-size: 11.5px;
  line-height: 1.45;
}

.pa-input {
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 13px;
}

.pa-input:focus {
  outline: none;
  border-color: var(--accent);
}

.pa-dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

@media (max-width: 700px) {
  .pa-row {
    align-items: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation-duration: 2s;
  }
}
</style>
