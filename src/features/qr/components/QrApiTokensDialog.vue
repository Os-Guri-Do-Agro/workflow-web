<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  KeyRound,
  Loader2,
  Plus,
  Copy,
  Check,
  X,
  Trash2,
  ShieldCheck,
  BookOpen,
} from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'
import { apiBaseUrl } from '@/service/api'
import { useQrFolders } from '@/composables/useQrFolders'
import {
  useQrApiTokens,
  useQrApiTokenMutations,
} from '@/composables/useQrApiTokens'
import { useToast } from '@/composables/useToast'
import type { QrApiTokenCreated } from '@/service/qr/qr-service'

const props = defineProps<{
  companyId: string
  companyName: string
}>()

const emit = defineEmits<{ close: [] }>()

const { success } = useToast()

const companyIdRef = computed(() => props.companyId)
const tokensQuery = useQrApiTokens(companyIdRef)
const foldersQuery = useQrFolders(companyIdRef)
const { create, revoke } = useQrApiTokenMutations(companyIdRef)

const tokens = computed(() => tokensQuery.data.value ?? [])

// Só pastas da empresa podem ser pasta padrão do token.
const folderItems = computed(() => [
  { label: 'Nenhuma (sem pasta padrão)', value: '' },
  ...(foldersQuery.data.value ?? [])
    .filter((f) => f.scope === 'company')
    .map((f) => ({ label: f.name, value: f.id })),
])

// ─── Criar ──────────────────────────────────────────────────────────────────
const newName = ref('')
const newFolderId = ref('')
// Token recém-criado (valor cru) — mostrado UMA vez para copiar.
const justCreated = ref<QrApiTokenCreated | null>(null)

async function handleCreate() {
  if (!newName.value.trim()) return
  try {
    const created = await create.mutateAsync({
      name: newName.value.trim(),
      defaultFolderId: newFolderId.value || null,
    })
    justCreated.value = created
    newName.value = ''
    newFolderId.value = ''
  } catch {
    /* toast já disparado */
  }
}

// ─── Revogar ──────────────────────────────────────────────────────────────────
const revokingId = ref<string | null>(null)
async function handleRevoke(id: string) {
  revokingId.value = id
  try {
    await revoke.mutateAsync(id)
  } finally {
    revokingId.value = null
  }
}

// ─── Copiar ───────────────────────────────────────────────────────────────────
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
    /* clipboard indisponível — ignora */
  }
}

// Exemplo de chamada do microserviço (endpoint fixo /api/v1/qr).
const endpoint = computed(() => `${apiBaseUrl()}/api/v1/qr`)
// Página de docs dedicada (Scalar) — abre em outra aba.
const docsUrl = computed(() => `${apiBaseUrl()}/qr-docs`)
const curlExample = computed(
  () =>
    `curl -X POST ${endpoint.value} \\\n` +
    `  -H "Authorization: Bearer ${justCreated.value?.token ?? 'SEU_TOKEN'}" \\\n` +
    `  -H "Content-Type: application/json" \\\n` +
    `  -d '{"targetUrl":"https://exemplo.com","label":"Campanha"}'`,
)
</script>

<template>
  <Teleport to="body">
    <div class="tok-overlay" @mousedown.self="emit('close')">
      <section class="tok-dialog" role="dialog" aria-modal="true" aria-label="Tokens de API">
        <header class="tok-head">
          <span class="tok-head-icon"><KeyRound :size="18" /></span>
          <div class="tok-head-txt">
            <h2>Tokens de API: {{ companyName }}</h2>
            <p>Gere QRs por webhook/integração usando 1 token. O valor completo aparece só na criação.</p>
            <a class="tok-docs-link" :href="docsUrl" target="_blank" rel="noopener">
              <BookOpen :size="13" />
              <span>Ver documentação da API</span>
            </a>
          </div>
          <button class="tok-x" type="button" aria-label="Fechar" @click="emit('close')">
            <X :size="16" />
          </button>
        </header>

        <div class="tok-body">
          <!-- Token recém-criado: revelar 1x -->
          <div v-if="justCreated" class="tok-reveal">
            <div class="tok-reveal-top">
              <ShieldCheck :size="15" />
              <span>Copie agora, não será exibido de novo.</span>
            </div>
            <div class="tok-reveal-value">
              <code>{{ justCreated.token }}</code>
              <button type="button" class="tok-copy" @click="copy(justCreated.token, 'raw')">
                <Check v-if="copied === 'raw'" :size="14" />
                <Copy v-else :size="14" />
              </button>
            </div>
            <details class="tok-example">
              <summary>Como usar (exemplo curl)</summary>
              <pre>{{ curlExample }}</pre>
              <button type="button" class="tok-copy-inline" @click="copy(curlExample, 'curl')">
                <Check v-if="copied === 'curl'" :size="13" />
                <Copy v-else :size="13" />
                <span>Copiar exemplo</span>
              </button>
            </details>
            <button type="button" class="tok-dismiss" @click="justCreated = null">Ok, guardei</button>
          </div>

          <!-- Criar novo -->
          <div class="tok-create">
            <div class="tok-create-row">
              <input
                v-model="newName"
                class="tok-input"
                placeholder="Nome do token (ex.: n8n webhook)"
                maxlength="80"
                @keydown.enter.prevent="handleCreate"
              />
              <div class="tok-folder">
                <AppSelect
                  v-model="newFolderId"
                  :items="folderItems"
                  label="Pasta padrão"
                />
              </div>
            </div>
            <button
              class="tok-create-btn"
              type="button"
              :disabled="!newName.trim() || create.isPending.value"
              @click="handleCreate"
            >
              <Loader2 v-if="create.isPending.value" :size="14" class="spin" />
              <Plus v-else :size="15" />
              <span>Criar token</span>
            </button>
          </div>

          <!-- Lista -->
          <div v-if="tokensQuery.isLoading.value" class="tok-empty">Carregando…</div>
          <div v-else-if="!tokens.length" class="tok-empty">Nenhum token ainda.</div>
          <ul v-else class="tok-list">
            <li v-for="t in tokens" :key="t.id" class="tok-item" :class="{ 'tok-item--revoked': t.revoked }">
              <div class="tok-item-main">
                <span class="tok-item-name">{{ t.name }}</span>
                <code class="tok-item-prefix">{{ t.tokenPrefix }}…</code>
              </div>
              <div class="tok-item-meta">
                <span v-if="t.revoked" class="tok-badge tok-badge--revoked">revogado</span>
                <span v-else class="tok-badge tok-badge--active">ativo</span>
                <span class="tok-item-used">
                  {{ t.lastUsedAt ? 'usado' : 'nunca usado' }}
                </span>
              </div>
              <button
                v-if="!t.revoked"
                class="tok-revoke"
                type="button"
                :disabled="revokingId === t.id"
                title="Revogar token"
                @click="handleRevoke(t.id)"
              >
                <Loader2 v-if="revokingId === t.id" :size="14" class="spin" />
                <Trash2 v-else :size="14" />
              </button>
            </li>
          </ul>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.tok-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(10px);
}

.tok-dialog {
  width: min(560px, 100%);
  max-height: 88vh;
  overflow-y: auto;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-overlay);
  padding: 18px;
}

.tok-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}

.tok-head-icon {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
  color: var(--accent);
}

.tok-head-txt {
  flex: 1;
}

.tok-head-txt h2 {
  margin: 0;
  font-size: 17px;
  letter-spacing: -0.02em;
}

.tok-head-txt p {
  margin: 4px 0 0;
  color: var(--text-3);
  font-size: 12.5px;
  line-height: 1.5;
}

.tok-docs-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 7px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 650;
  text-decoration: none;
}

.tok-docs-link:hover {
  text-decoration: underline;
}

.tok-x {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
}

.tok-x:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.tok-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tok-reveal {
  border: 1px solid color-mix(in srgb, var(--success) 45%, var(--border));
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--success) 8%, var(--surface-2));
  padding: 12px;
}

.tok-reveal-top {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--success);
  font-size: 12px;
  font-weight: 700;
}

.tok-reveal-value {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.tok-reveal-value code {
  flex: 1;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  font-family: var(--font-mono);
  font-size: 12.5px;
  word-break: break-all;
}

.tok-copy {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text-2);
  cursor: pointer;
}

.tok-copy:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.tok-example {
  margin-top: 10px;
  font-size: 12px;
}

.tok-example summary {
  cursor: pointer;
  color: var(--text-2);
  font-weight: 600;
}

.tok-example pre {
  margin: 8px 0 6px;
  padding: 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-3);
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 11.5px;
  overflow-x: auto;
  white-space: pre;
}

.tok-copy-inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-2);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.tok-dismiss {
  margin-top: 10px;
  width: 100%;
  min-height: 36px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
}

.tok-create {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.tok-create-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.tok-input {
  flex: 1;
  min-width: 200px;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 13.5px;
}

.tok-input:focus {
  outline: none;
  border-color: var(--accent);
}

.tok-folder {
  min-width: 190px;
}

.tok-create-btn {
  align-self: flex-start;
  min-height: 40px;
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
}

.tok-create-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.tok-empty {
  padding: 18px;
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
}

.tok-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tok-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}

.tok-item--revoked {
  opacity: 0.6;
}

.tok-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tok-item-name {
  font-size: 13.5px;
  font-weight: 650;
  color: var(--text);
}

.tok-item-prefix {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-3);
}

.tok-item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tok-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.tok-badge--active {
  background: color-mix(in srgb, var(--success) 16%, transparent);
  color: var(--success);
}

.tok-badge--revoked {
  background: color-mix(in srgb, var(--err) 16%, transparent);
  color: var(--err);
}

.tok-item-used {
  font-size: 11px;
  color: var(--text-4);
}

.tok-revoke {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--err);
  cursor: pointer;
}

.tok-revoke:hover {
  border-color: color-mix(in srgb, var(--err) 55%, var(--border));
  background: color-mix(in srgb, var(--err) 10%, var(--surface-2));
}

.tok-revoke:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
