<script setup lang="ts">
/**
 * "Conexão com o app" (M4, D7): o Dono cria o token de uma marca e copia UMA
 * vez (o Nevo guarda só o hash); a lista mostra o prefixo, quem criou, o último
 * uso e o estado; o Dono revoga. O Admin vê a lista, sem criar nem revogar.
 * Aqui também fica o link do relatório do Looker Studio do grupo (Admin edita),
 * que vira o botão da área Dados.
 */
import { computed, ref, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { Check, Copy, KeyRound, PlugZap } from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useToast } from '@/composables/useToast'
import { apiBaseUrl, getApiErrorMessage } from '@/service/api'
import type { CreatedAppToken } from '@/service/marketing/marketing-app-data'
import type { MarketingBrand, MarketingSettings } from '@/service/marketing/marketing-core'
import { updateGroupSettings } from '@/service/marketing/marketing-settings'
import { fmtAgo, fmtDateTime } from '../app-data/app-data-format'
import { useAppTokenMutations, useAppTokens } from '../app-data/useAppData'

const props = defineProps<{
  groupId: string
  brands: MarketingBrand[]
  settings: MarketingSettings
  isOwner: boolean
  canEdit: boolean
}>()

const toast = useToast()
const queryClient = useQueryClient()
const tokens = useAppTokens(() => props.groupId, () => props.canEdit)
const { create, revoke } = useAppTokenMutations(() => props.groupId)

const brandItems = computed(() => props.brands.map((b) => ({ label: b.name, value: b.companyId })))
const brandId = ref<string | null>(props.brands[0]?.companyId ?? null)
const name = ref('')
const created = ref<CreatedAppToken | null>(null)
const copied = ref<'' | 'token' | 'env'>('')

const brandName = (id: string) => props.brands.find((b) => b.companyId === id)?.name ?? 'Marca'
const apiUrl = computed(() => apiBaseUrl() || window.location.origin)
const envText = computed(() =>
  created.value ? `NEVO_API_URL=${apiUrl.value}\nNEVO_API_TOKEN=${created.value.token}` : '',
)

async function submit() {
  if (!brandId.value || !name.value.trim() || create.isPending.value) return
  try {
    created.value = await create.mutateAsync({ companyId: brandId.value, name: name.value.trim() })
    name.value = ''
    copied.value = ''
  } catch (error) {
    toast.error(getApiErrorMessage(error, 'Não deu para criar o token.'))
  }
}

async function copy(what: 'token' | 'env') {
  if (!created.value) return
  const text = what === 'token' ? created.value.token : envText.value
  try {
    await navigator.clipboard.writeText(text)
    copied.value = what
    toast.success(what === 'token' ? 'Token copiado' : 'Variáveis copiadas')
  } catch {
    toast.error('Não deu para copiar. Selecione o texto e copie com Ctrl+C.')
  }
}

const toRevoke = ref<{ id: string; name: string } | null>(null)
const confirmOpen = computed({
  get: () => !!toRevoke.value,
  set: (v) => {
    if (!v) toRevoke.value = null
  },
})
const revokeMessage = computed(
  () =>
    `O app que usa o token "${toRevoke.value?.name ?? ''}" passa a ser recusado (401) no próximo envio. Para voltar a receber, crie outro token e troque no app.`,
)
async function confirmRevoke() {
  if (!toRevoke.value) return
  try {
    await revoke.mutateAsync(toRevoke.value.id)
    toast.success('Token revogado. O app passa a ser recusado com 401.')
    if (created.value?.id === toRevoke.value.id) created.value = null
    toRevoke.value = null
  } catch (error) {
    toast.error(getApiErrorMessage(error, 'Não deu para revogar.'))
  }
}

// ── Looker Studio ──
const looker = ref(props.settings.lookerStudioUrl ?? '')
watch(
  () => props.settings.lookerStudioUrl,
  (v) => {
    looker.value = v ?? ''
  },
)
const lookerDirty = computed(() => looker.value.trim() !== (props.settings.lookerStudioUrl ?? ''))
const savingLooker = ref(false)
async function saveLooker() {
  savingLooker.value = true
  try {
    await updateGroupSettings(props.groupId, { lookerStudioUrl: looker.value.trim() || null })
    toast.success(looker.value.trim() ? 'Link do Looker Studio salvo' : 'Link do Looker Studio removido')
    await queryClient.invalidateQueries({ queryKey: ['marketing'] })
  } catch (error) {
    toast.error(getApiErrorMessage(error, 'Não deu para salvar o link.'))
  } finally {
    savingLooker.value = false
  }
}
</script>

<template>
  <section id="conexao-app" class="mk-panel sac" data-testid="settings-app-connection" aria-labelledby="sac-title">
    <header class="mk-panel__head sac__head">
      <PlugZap :size="15" aria-hidden="true" />
      <span id="sac-title">Conexão com o app</span>
    </header>
    <div class="mk-panel__body sac__body">
      <p class="mk-hint">
        O app da marca manda, uma vez por dia, só números somados (cadastros, ativos, assinaturas, pets e uso) para a
        área Dados. Cada marca usa o próprio token. Revogar faz o app ser recusado na hora.
      </p>

      <form v-if="isOwner" class="sac__form" data-testid="app-token-form" @submit.prevent="submit">
        <div v-if="brands.length > 1" class="mk-field sac__brand">
          <span class="mk-label">Marca</span>
          <AppSelect v-model="brandId" :items="brandItems" label="Marca do token" density="compact" />
        </div>
        <label class="mk-field sac__name">
          <span class="mk-label">Nome do token</span>
          <input
            v-model="name"
            class="mk-input"
            maxlength="80"
            placeholder="Ex.: PetJourney produção"
            data-testid="app-token-name"
          />
        </label>
        <button
          type="submit"
          class="mk-btn mk-btn--primary"
          :disabled="!brandId || !name.trim() || create.isPending.value"
          data-action="create-app-token"
        >
          <KeyRound :size="14" aria-hidden="true" />{{ create.isPending.value ? 'Criando...' : 'Criar token' }}
        </button>
      </form>

      <div v-if="created" class="sac__created" role="status" data-testid="app-token-created">
        <p class="sac__warn"><b>Copie agora:</b> o token completo aparece só esta vez. Depois o Nevo mostra só o começo.</p>
        <div class="sac__secret">
          <code data-testid="app-token-value">{{ created.token }}</code>
          <button type="button" class="mk-btn" data-action="copy-app-token" @click="copy('token')">
            <component :is="copied === 'token' ? Check : Copy" :size="14" aria-hidden="true" />
            {{ copied === 'token' ? 'Copiado' : 'Copiar' }}
          </button>
        </div>
        <p class="mk-hint">Para a API do app (variáveis de ambiente):</p>
        <div class="sac__secret">
          <pre data-testid="app-token-env">{{ envText }}</pre>
          <button type="button" class="mk-btn" data-action="copy-app-env" @click="copy('env')">
            <component :is="copied === 'env' ? Check : Copy" :size="14" aria-hidden="true" />
            {{ copied === 'env' ? 'Copiado' : 'Copiar' }}
          </button>
        </div>
        <button type="button" class="mk-btn mk-btn--ghost" @click="created = null">Já copiei, esconder</button>
      </div>

      <p v-if="!canEdit" class="mk-hint" data-testid="app-token-restricted">
        Só o Dono e os Admins veem os tokens. Os números chegam na área Dados para todo mundo da ala.
      </p>
      <p v-else-if="tokens.isError.value" class="mk-error" role="alert">Não deu para carregar os tokens.</p>
      <p v-else-if="tokens.data.value && !tokens.data.value.length" class="mk-hint" data-testid="app-token-none">
        Nenhum token ainda. {{ isOwner ? 'Crie o primeiro acima.' : 'Só o Dono do grupo cria o token.' }}
      </p>
      <div v-else-if="tokens.data.value" class="sac__scroll">
        <table class="mk-table sac__table" data-testid="app-token-list">
          <thead>
            <tr>
              <th>Token</th>
              <th v-if="brands.length > 1" class="hide-sm">Marca</th>
              <th class="hide-sm">Criado</th>
              <th>Último uso</th>
              <th>Estado</th>
              <th v-if="isOwner" aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in tokens.data.value" :key="t.id" :data-token="t.id" :data-state="t.revoked ? 'revoked' : 'active'">
              <td>
                <div class="sac__tname">
                  <span>{{ t.name }}</span>
                  <code>{{ t.prefix }}...</code>
                </div>
              </td>
              <td v-if="brands.length > 1" class="hide-sm">{{ brandName(t.companyId) }}</td>
              <td class="hide-sm sac__muted">
                {{ fmtDateTime(t.createdAt) }}<template v-if="t.createdBy"> por {{ t.createdBy.name }}</template>
              </td>
              <td :title="t.lastUsedAt ? fmtDateTime(t.lastUsedAt) : ''">{{ t.lastUsedAt ? fmtAgo(t.lastUsedAt) : 'nunca usado' }}</td>
              <td>
                <span
                  class="mk-chip"
                  data-tone
                  :style="{ '--mk-tone': t.revoked ? 'var(--err)' : 'var(--success)' }"
                  :title="t.revoked && t.revokedAt ? `Revogado em ${fmtDateTime(t.revokedAt)}` : ''"
                >
                  {{ t.revoked ? 'Revogado' : 'Ativo' }}
                </span>
              </td>
              <td v-if="isOwner" class="sac__actions">
                <button
                  v-if="!t.revoked"
                  type="button"
                  class="mk-btn mk-btn--danger"
                  data-action="revoke-app-token"
                  @click="toRevoke = { id: t.id, name: t.name }"
                >
                  Revogar
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="sac__looker">
        <label class="mk-field sac__looker-field">
          <span class="mk-label">Relatório no Looker Studio (opcional)</span>
          <input
            v-model="looker"
            class="mk-input"
            type="url"
            inputmode="url"
            placeholder="https://lookerstudio.google.com/reporting/..."
            :disabled="!canEdit"
            data-testid="looker-url"
          />
        </label>
        <button
          v-if="canEdit"
          type="button"
          class="mk-btn"
          :disabled="!lookerDirty || savingLooker"
          data-action="save-looker"
          @click="saveLooker"
        >
          {{ savingLooker ? 'Salvando...' : 'Salvar link' }}
        </button>
      </div>
      <p class="mk-hint sac__looker-hint">Vira o botão "Looker Studio" na área Dados, para quem quiser o relatório montado lá.</p>
    </div>

    <ConfirmDialog
      v-model="confirmOpen"
      danger
      title="Revogar o token?"
      :message="revokeMessage"
      confirm-label="Revogar"
      :loading="revoke.isPending.value"
      @confirm="confirmRevoke"
    />
  </section>
</template>

<style scoped>
.sac__head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sac__body {
  display: grid;
  gap: 12px;
}

.sac__form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px;
}

.sac__brand {
  min-width: 200px;
}

.sac__name {
  flex: 1 1 220px;
  min-width: 0;
}

.sac__created {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--border));
  border-radius: 6px;
  background: color-mix(in srgb, var(--warn) 7%, var(--surface));
}

.sac__warn {
  margin: 0;
  font-size: 13px;
}

.sac__secret {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.sac__secret code,
.sac__secret pre {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface-2);
  font-size: 12px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  user-select: all;
}

.sac__scroll {
  overflow-x: auto;
}

.sac__tname {
  display: grid;
  gap: 2px;
}

.sac__tname code {
  font-size: 11.5px;
  color: var(--text-3);
}

.sac__muted {
  font-size: 12px;
  color: var(--text-3);
}

.sac__actions {
  text-align: right;
}

.sac__looker {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.sac__looker-hint {
  margin: -6px 0 0;
}

.sac__looker-field {
  flex: 1 1 320px;
  min-width: 0;
}

@media (max-width: 640px) {
  .hide-sm {
    display: none;
  }

  .sac__secret {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
