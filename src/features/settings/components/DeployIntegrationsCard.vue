<script setup lang="ts">
/**
 * Deploys (spec v2-mobile-e-home, W1; contrato na spec da API
 * webhook-deploy-amplify-railway): liga o build do Amplify ou do Railway ao
 * Nevo. Quando um deploy falha, quem está no projeto recebe aviso no app (e no
 * Discord da empresa, se ligado); sucesso vai para a timeline.
 *
 * Só ADMIN da empresa ativa configura (a API recusa com 403 qualquer outro).
 * O token aparece uma vez, logo depois de criar ou gerar outro: o servidor só
 * guarda o hash. Por isso o painel de "copie agora" fica aberto até a pessoa
 * fechar, e não some sozinho.
 */
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  Check,
  ChevronDown,
  Copy,
  KeyRound,
  Plus,
  Rocket,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import LottiePlayer from '@/components/ui/LottiePlayer.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import companiesServices from '@/service/companies/companies-services'
import { relativeTime } from '@/utils/relative-time'
import deployService, {
  type DeliveryOutcome,
  type DeployDeliveryView,
  type DeployIntegrationSecret,
  type DeployIntegrationView,
  type DeployProvider,
} from '@/service/deploy/deploy-integrations-service'

const workspace = useWorkspaceStore()
const queryClient = useQueryClient()
const { success, error: toastError } = useToast()

const companyId = computed(() => workspace.activeCompanyId)
const companyName = computed(() => workspace.activeCompany?.name ?? 'empresa ativa')
const isAdmin = computed(() => workspace.isAdmin)
const listKey = computed(() => ['deploy-integrations', companyId.value])

const { data: integrations, isLoading, isError, error: listError, refetch } = useQuery({
  queryKey: listKey,
  queryFn: () => deployService.list(),
  enabled: computed(() => !!companyId.value && isAdmin.value),
})

const { data: membersRaw } = useQuery({
  queryKey: computed(() => ['company-members', companyId.value]),
  queryFn: () => companiesServices.getCompanyMembers(companyId.value!),
  enabled: computed(() => !!companyId.value && isAdmin.value),
  staleTime: 5 * 60 * 1000,
})
const memberItems = computed(() =>
  ((membersRaw.value as { user: { id: string; name: string } }[] | undefined) ?? []).map((m) => ({
    label: m.user.name,
    value: m.user.id,
  })),
)

const PROVIDER_LABEL: Record<DeployProvider, string> = { AMPLIFY: 'AWS Amplify', RAILWAY: 'Railway' }
const SOURCE_HINT: Record<DeployProvider, string> = {
  AMPLIFY: 'App ID do Amplify (ex.: d1a2b3c4e5f6g7)',
  RAILWAY: 'Project ID do Railway (Project Settings, General)',
}

// ─── Criar ────────────────────────────────────────────────────────────────────
const creating = ref(false)
const form = ref({
  provider: 'AMPLIFY' as DeployProvider,
  name: '',
  sources: '',
  notifyUserIds: [] as string[],
  notifyOnStarted: false,
  notifyDiscord: true,
})

function resetForm() {
  form.value = { provider: 'AMPLIFY', name: '', sources: '', notifyUserIds: [], notifyOnStarted: false, notifyDiscord: true }
}

/** "d1abc PetJourney, d2xyz" vira [{id:'d1abc',label:'PetJourney'},{id:'d2xyz'}]: um app por linha ou vírgula. */
function parseSources(text: string) {
  return text
    .split(/[\n,]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((chunk) => {
      const [id, ...rest] = chunk.split(/\s+/)
      const label = rest.join(' ').trim()
      return label ? { id: id!.slice(0, 128), label: label.slice(0, 80) } : { id: id!.slice(0, 128) }
    })
}

const secret = ref<DeployIntegrationSecret | null>(null)

const createMutation = useMutation({
  mutationFn: () =>
    deployService.create({
      provider: form.value.provider,
      name: form.value.name.trim(),
      allowedSources: parseSources(form.value.sources),
      notifyUserIds: form.value.notifyUserIds,
      notifyOnStarted: form.value.notifyOnStarted,
      notifyDiscord: form.value.notifyDiscord,
    }),
  onSuccess: (data) => {
    secret.value = data
    creating.value = false
    resetForm()
    void queryClient.invalidateQueries({ queryKey: ['deploy-integrations'] })
  },
  onError: (e) => toastError(getApiErrorMessage(e, 'Não deu para criar a integração')),
})

const canCreate = computed(() => form.value.name.trim().length > 0 && !createMutation.isPending.value)

// ─── Editar (nome, apps, quem recebe, opções) ────────────────────────────────
// O provedor não muda: Amplify e Railway mandam formatos diferentes, e trocar
// exigiria reconfigurar o outro lado. Para isso, crie outra integração.
const editing = ref<DeployIntegrationView | null>(null)
function startEdit(it: DeployIntegrationView) {
  creating.value = false
  editing.value = it
  form.value = {
    provider: it.provider,
    name: it.name,
    sources: it.allowedSources.map((s) => (s.label ? `${s.id} ${s.label}` : s.id)).join('\n'),
    notifyUserIds: [...it.notifyUserIds],
    notifyOnStarted: it.notifyOnStarted,
    notifyDiscord: it.notifyDiscord,
  }
}
function cancelForm() {
  creating.value = false
  editing.value = null
  resetForm()
}
function submitForm() {
  if (!canCreate.value) return
  if (!editing.value) {
    createMutation.mutate()
    return
  }
  const id = editing.value.id
  updateMutation.mutate(
    {
      id,
      patch: {
        name: form.value.name.trim(),
        allowedSources: parseSources(form.value.sources),
        notifyUserIds: form.value.notifyUserIds,
        notifyOnStarted: form.value.notifyOnStarted,
        notifyDiscord: form.value.notifyDiscord,
      },
    },
    {
      onSuccess: () => {
        success('Integração salva')
        cancelForm()
      },
    },
  )
}

/** WORKER (ou ADMIN rebaixado com a tela aberta) recebe 403: diz isso, não "erro". */
function isForbidden(err: unknown): boolean {
  return (err as { response?: { status?: number } } | null)?.response?.status === 403
}

// ─── Editar, testar, girar token, excluir ────────────────────────────────────
const updateMutation = useMutation({
  mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof deployService.update>[1] }) =>
    deployService.update(id, patch),
  // `onSettled` e não `onSuccess`: no erro o interruptor já mudou na tela e
  // só a releitura da lista devolve o estado verdadeiro.
  onSettled: () => void queryClient.invalidateQueries({ queryKey: ['deploy-integrations'] }),
  onError: (e) => toastError(getApiErrorMessage(e, 'Não deu para salvar')),
})

const testResult = ref<{ id: string; status: 'FAILED' | 'SUCCEEDED'; dispatchError: string | null } | null>(null)
const testMutation = useMutation({
  mutationFn: ({ id, status }: { id: string; status: 'FAILED' | 'SUCCEEDED' }) => deployService.test(id, status),
  onSuccess: (data, vars) => {
    // `dispatchError`: o evento entrou, mas algum aviso (Discord, push) falhou.
    testResult.value = { id: vars.id, status: vars.status, dispatchError: data.delivery?.dispatchError ?? null }
    void queryClient.invalidateQueries({ queryKey: ['deploy-deliveries', vars.id] })
  },
  onError: (e) => toastError(getApiErrorMessage(e, 'O evento de teste não foi entregue')),
})

const confirmRotate = ref<DeployIntegrationView | null>(null)
const rotateMutation = useMutation({
  mutationFn: (id: string) => deployService.rotateToken(id),
  onSuccess: (data) => {
    secret.value = data
    confirmRotate.value = null
    void queryClient.invalidateQueries({ queryKey: ['deploy-integrations'] })
  },
  onError: (e) => toastError(getApiErrorMessage(e, 'Não deu para gerar outro token')),
})

const confirmDelete = ref<DeployIntegrationView | null>(null)
const deleteMutation = useMutation({
  mutationFn: (id: string) => deployService.remove(id),
  onSuccess: () => {
    confirmDelete.value = null
    success('Integração removida')
    void queryClient.invalidateQueries({ queryKey: ['deploy-integrations'] })
  },
  onError: (e) => toastError(getApiErrorMessage(e, 'Não deu para remover')),
})

// ─── Entregas ────────────────────────────────────────────────────────────────
const openLog = ref<string | null>(null)
const { data: deliveries, isLoading: deliveriesLoading } = useQuery({
  queryKey: computed(() => ['deploy-deliveries', openLog.value]),
  queryFn: () => deployService.deliveries(openLog.value!, 30),
  enabled: computed(() => !!openLog.value),
  refetchInterval: 15_000,
})

const OUTCOME_LABEL: Record<DeliveryOutcome, string> = {
  ACCEPTED: 'Recebido',
  IGNORED: 'Ignorado',
  REJECTED: 'Recusado',
  TEST: 'Teste',
}
const STATUS_LABEL: Record<string, string> = {
  STARTED: 'começou',
  SUCCEEDED: 'deu certo',
  FAILED: 'falhou',
  CANCELLED: 'cancelado',
}

function deliveryLine(d: DeployDeliveryView): string {
  const parts: string[] = []
  if (d.sourceLabel || d.sourceId) parts.push(d.sourceLabel || d.sourceId!)
  if (d.branch) parts.push(d.branch)
  if (d.status) parts.push(STATUS_LABEL[d.status] ?? d.status.toLowerCase())
  return parts.join(' · ') || '(sem dados do deploy)'
}

/** Recusado por fonte fora da lista: oferece autorizar aquele app. */
function canAuthorize(d: DeployDeliveryView, integration: DeployIntegrationView) {
  if (d.outcome !== 'REJECTED' || d.httpStatus !== 403 || !d.sourceId) return false
  // Já autorizado (o histórico ainda mostra a recusa antiga até recarregar).
  return !integration.allowedSources.some((s) => s.id === d.sourceId)
}
function authorize(integration: DeployIntegrationView, sourceId: string) {
  const next = [...integration.allowedSources.filter((s) => s.id !== sourceId), { id: sourceId }]
  updateMutation.mutate({ id: integration.id, patch: { allowedSources: next } }, { onSuccess: () => success('App autorizado') })
}

// ─── Copiar ──────────────────────────────────────────────────────────────────
const copied = ref<string | null>(null)
async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = what
    window.setTimeout(() => {
      if (copied.value === what) copied.value = null
    }, 1800)
  } catch {
    toastError('O navegador não deixou copiar. Selecione o texto e copie à mão.')
  }
}

watch(companyId, () => {
  secret.value = null
  openLog.value = null
  testResult.value = null
  creating.value = false
})
</script>

<template>
  <div class="dep">
    <div class="dep-head">
      <h2 class="dep-title">
        <Rocket :size="16" aria-hidden="true" />
        Deploys
      </h2>
      <p class="dep-sub">
        Ligue o build do AWS Amplify ou do Railway à {{ companyName }}. Deploy que falha avisa quem está no projeto na
        hora; deploy que dá certo entra na timeline da empresa.
      </p>
    </div>

    <p v-if="!isAdmin" class="dep-note">
      <ShieldCheck :size="16" aria-hidden="true" />
      Só quem administra a {{ companyName }} configura integrações de deploy.
    </p>

    <template v-else>
      <!-- Token recém-gerado: aparece uma vez. -->
      <section v-if="secret" class="dep-secret" aria-labelledby="dep-secret-title" role="status">
        <div class="dep-secret-head">
          <KeyRound :size="16" aria-hidden="true" />
          <h3 id="dep-secret-title">Copie agora: o token não aparece de novo</h3>
          <button type="button" class="dep-icon-btn" aria-label="Fechar" @click="secret = null">
            <X :size="16" aria-hidden="true" />
          </button>
        </div>
        <dl class="dep-kv">
          <div>
            <dt>URL de entrada</dt>
            <dd>
              <code>{{ secret.ingestUrl }}</code>
              <button type="button" class="dep-copy" @click="copy(secret.ingestUrl, 'url')">
                <Check v-if="copied === 'url'" :size="14" aria-hidden="true" />
                <Copy v-else :size="14" aria-hidden="true" />
                {{ copied === 'url' ? 'Copiado' : 'Copiar' }}
              </button>
            </dd>
          </div>
          <div>
            <dt>Cabeçalho</dt>
            <dd>
              <code>{{ secret.header }}</code>
            </dd>
          </div>
          <div>
            <dt>Token</dt>
            <dd>
              <code class="dep-token">{{ secret.token }}</code>
              <button type="button" class="dep-copy" @click="copy(secret.token, 'token')">
                <Check v-if="copied === 'token'" :size="14" aria-hidden="true" />
                <Copy v-else :size="14" aria-hidden="true" />
                {{ copied === 'token' ? 'Copiado' : 'Copiar' }}
              </button>
            </dd>
          </div>
        </dl>
        <details class="dep-howto">
          <summary>Como ligar no {{ PROVIDER_LABEL[secret.integration.provider] }}</summary>
          <ol v-if="secret.integration.provider === 'AMPLIFY'">
            <li>No console da AWS, abra o EventBridge e crie uma <strong>conexão</strong> do tipo API key com o cabeçalho <code>{{ secret.header }}</code> e o token acima.</li>
            <li>Crie um <strong>destino de API</strong> com a URL de entrada, método POST, usando essa conexão.</li>
            <li>Crie uma <strong>regra</strong> com origem <code>aws.amplify</code> e tipo de detalhe <code>Amplify Deployment Status Change</code>, apontando para o destino.</li>
            <li>Na regra, <strong>não</strong> use input transformer (o Nevo precisa do evento inteiro) e crie tudo na <strong>mesma região</strong> do app no Amplify.</li>
            <li>Rode um deploy e veja a entrega no Histórico daqui. O "Enviar teste" confere só o lado do Nevo (sino, timeline e Discord); a ligação com a AWS se confere no primeiro deploy real.</li>
          </ol>
          <ol v-else>
            <li>No projeto do Railway, abra <strong>Settings &gt; Webhooks</strong> e cole a URL de entrada.</li>
            <li>Em cabeçalho customizado, use o nome <code>{{ secret.header }}</code> com o token acima como valor e salve.</li>
            <li>Clique em <strong>Test Webhook</strong> no Railway e confira a entrega no histórico daqui.</li>
          </ol>
        </details>
      </section>

      <div v-if="isLoading" class="dep-skel" aria-busy="true">
        <Skeleton v-for="n in 2" :key="n" type="row" height="44px" />
      </div>

      <p v-else-if="isError && isForbidden(listError)" class="dep-note">
        <ShieldCheck :size="16" aria-hidden="true" />
        Seu acesso na {{ companyName }} mudou: só quem administra configura integrações de deploy.
      </p>

      <div v-else-if="isError" class="dep-error" role="alert">
        <p>Não deu para carregar as integrações.</p>
        <button type="button" class="dep-btn" @click="refetch()">Tentar de novo</button>
      </div>

      <template v-else>
        <p v-if="!integrations?.length && !creating" class="dep-empty">
          Nenhuma integração ainda. Crie uma para cada projeto do Amplify ou do Railway.
        </p>

        <ul v-if="integrations?.length" class="dep-list">
          <li v-for="it in integrations" :key="it.id" class="dep-item">
            <div class="dep-item-main">
              <span class="dep-provider">{{ PROVIDER_LABEL[it.provider] }}</span>
              <span class="dep-name">{{ it.name }}</span>
              <span class="dep-meta">
                {{ it.allowedSources.length ? `${it.allowedSources.length} ${it.allowedSources.length === 1 ? 'app' : 'apps'}` : 'nenhum app autorizado' }}
                · token {{ it.tokenPrefix }}…
                · {{ it.lastEventAt ? `último evento ${relativeTime(it.lastEventAt)}` : 'sem eventos ainda' }}
              </span>
            </div>
            <label class="dep-switch">
              <input
                type="checkbox"
                :checked="it.enabled"
                :disabled="updateMutation.isPending.value"
                @change="updateMutation.mutate({ id: it.id, patch: { enabled: ($event.target as HTMLInputElement).checked } })"
              />
              <span>{{ it.enabled ? 'Ligada' : 'Desligada' }}</span>
            </label>
            <div class="dep-actions">
              <button
                type="button"
                class="dep-btn"
                :disabled="testMutation.isPending.value || !it.enabled"
                @click="testMutation.mutate({ id: it.id, status: 'FAILED' })"
              >
                Enviar teste
              </button>
              <button type="button" class="dep-btn" :aria-expanded="openLog === it.id" @click="openLog = openLog === it.id ? null : it.id">
                Histórico
                <ChevronDown :size="14" aria-hidden="true" :class="{ 'is-open': openLog === it.id }" />
              </button>
              <button type="button" class="dep-btn" @click="startEdit(it)">Editar</button>
              <button type="button" class="dep-btn" @click="confirmRotate = it">Novo token</button>
              <button type="button" class="dep-icon-btn dep-icon-btn--danger" :aria-label="`Remover ${it.name}`" @click="confirmDelete = it">
                <Trash2 :size="16" aria-hidden="true" />
              </button>
            </div>

            <div v-if="testResult?.id === it.id" class="dep-test" role="status">
              <LottiePlayer :src="testResult.dispatchError ? '/lottie/nevo-deploy-falhou.json' : '/lottie/nevo-deploy-ok.json'" :size="64" />
              <p v-if="!testResult.dispatchError">Evento de teste entregue. Confira o aviso no sino e na timeline da empresa.</p>
              <p v-else class="dep-test-warn">O evento entrou, mas um aviso não saiu: {{ testResult.dispatchError }}</p>
            </div>

            <div v-if="openLog === it.id" class="dep-log">
              <div v-if="deliveriesLoading" class="dep-skel"><Skeleton type="row" height="20px" /></div>
              <p v-else-if="!deliveries?.length" class="dep-empty">Nenhuma entrega ainda.</p>
              <ul v-else class="dep-log-list">
                <li v-for="d in deliveries" :key="d.id" class="dep-log-row">
                  <span class="dep-outcome" :class="`dep-outcome--${d.outcome.toLowerCase()}`">{{ OUTCOME_LABEL[d.outcome] }}</span>
                  <span class="dep-log-text">
                    {{ deliveryLine(d) }}
                    <span v-if="d.reason" class="dep-log-reason">{{ d.reason }}</span>
                    <span v-if="d.dispatchError" class="dep-log-reason dep-log-reason--warn">Aviso não enviado: {{ d.dispatchError }}</span>
                    <span v-if="d.duplicateCount" class="dep-log-reason">repetido {{ d.duplicateCount }}x</span>
                  </span>
                  <time class="dep-log-time" :datetime="d.receivedAt">{{ relativeTime(d.receivedAt) }}</time>
                  <button
                    v-if="canAuthorize(d, it)"
                    type="button"
                    class="dep-btn dep-btn--small"
                    :disabled="updateMutation.isPending.value"
                    @click="authorize(it, d.sourceId!)"
                  >
                    Autorizar este app
                  </button>
                </li>
              </ul>
            </div>
          </li>
        </ul>

        <form v-if="creating || editing" class="dep-form" @submit.prevent="submitForm">
          <h3 v-if="editing" class="dep-form-title">Editar {{ editing.name }}</h3>
          <div class="dep-row">
            <label class="dep-field">
              <span>Onde roda o build</span>
              <AppSelect
                v-model="form.provider"
                :disabled="!!editing"
                :items="[
                  { label: 'AWS Amplify', value: 'AMPLIFY' },
                  { label: 'Railway', value: 'RAILWAY' },
                ]"
              />
            </label>
            <label class="dep-field">
              <span>Nome</span>
              <input v-model="form.name" class="dep-input" maxlength="80" placeholder="Ex.: App PetJourney (produção)" required />
            </label>
          </div>
          <label class="dep-field">
            <span>Apps autorizados <small>(um por linha, com um nome opcional depois do id. Sem nenhum, o primeiro deploy chega como Recusado e você autoriza com um clique no Histórico)</small></span>
            <textarea v-model="form.sources" class="dep-input dep-textarea" rows="2" :placeholder="SOURCE_HINT[form.provider]" />
          </label>
          <label class="dep-field">
            <span>Quem recebe o aviso de falha <small>(vazio: quem administra a empresa)</small></span>
            <AppSelect v-model="form.notifyUserIds" :items="memberItems" multiple chip-avatars placeholder="Escolher pessoas" />
          </label>
          <div class="dep-checks">
            <label><input v-model="form.notifyDiscord" type="checkbox" /> Avisar também no Discord da empresa</label>
            <label><input v-model="form.notifyOnStarted" type="checkbox" /> Registrar quando o deploy começa</label>
          </div>
          <div class="dep-form-actions">
            <button type="button" class="dep-btn" @click="cancelForm">Cancelar</button>
            <button type="submit" class="dep-btn dep-btn--primary" :disabled="!canCreate">
              {{ editing ? (updateMutation.isPending.value ? 'Salvando…' : 'Salvar') : createMutation.isPending.value ? 'Criando…' : 'Criar integração' }}
            </button>
          </div>
        </form>

        <button v-else type="button" class="dep-btn dep-btn--add" @click="creating = true">
          <Plus :size="16" aria-hidden="true" />
          Nova integração
        </button>
      </template>
    </template>

    <ConfirmDialog
      :model-value="!!confirmRotate"
      title="Gerar outro token?"
      :message="`O token atual de “${confirmRotate?.name ?? ''}” para de funcionar na hora. Atualize a conexão na AWS ou no Railway logo depois.`"
      confirm-label="Gerar outro"
      :loading="rotateMutation.isPending.value"
      @update:model-value="(v) => !v && (confirmRotate = null)"
      @confirm="confirmRotate && rotateMutation.mutate(confirmRotate.id)"
    />
    <ConfirmDialog
      :model-value="!!confirmDelete"
      title="Remover integração?"
      :message="`Deploys de “${confirmDelete?.name ?? ''}” deixam de chegar no Nevo. O histórico de entregas também sai.`"
      confirm-label="Remover"
      danger
      :loading="deleteMutation.isPending.value"
      @update:model-value="(v) => !v && (confirmDelete = null)"
      @confirm="confirmDelete && deleteMutation.mutate(confirmDelete.id)"
    />
  </div>
</template>

<style scoped>
.dep {
  display: grid;
  gap: 14px;
}

.dep-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
}

.dep-sub {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-3);
  max-width: 70ch;
}

.dep-note,
.dep-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 13px;
  color: var(--text-2);
}

.dep-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
}

.dep-error p {
  margin: 0;
}

.dep-skel {
  display: grid;
  gap: 8px;
}

.dep-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.dep-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px 14px;
  align-items: center;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.dep-item-main {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.dep-provider {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-ink);
}

.dep-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dep-meta {
  font-size: 12px;
  color: var(--text-3);
}

.dep-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--text-2);
  cursor: pointer;
}

.dep-switch input {
  accent-color: var(--accent);
  width: 16px;
  height: 16px;
}

.dep-actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dep-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.dep-btn:hover:not(:disabled) {
  border-color: var(--border-strong);
}

.dep-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.dep-btn--primary {
  background: var(--accent);
  border-color: transparent;
  color: var(--accent-fg);
}

.dep-btn--add {
  justify-self: start;
}

.dep-btn--small {
  min-height: 28px;
  font-size: 12px;
}

.dep-btn .is-open {
  transform: rotate(180deg);
}

.dep-btn:focus-visible,
.dep-icon-btn:focus-visible,
.dep-copy:focus-visible,
.dep-input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.dep-icon-btn {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
}

.dep-icon-btn:hover {
  background: var(--surface-2);
}

.dep-icon-btn--danger:hover {
  color: var(--err);
}

.dep-test {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--text-2);
}

.dep-test p {
  margin: 0;
}

.dep-log {
  grid-column: 1 / -1;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}

.dep-log-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.dep-log-row {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px 10px;
  font-size: 12.5px;
}

.dep-log-row .dep-btn {
  grid-column: 2 / -1;
  justify-self: start;
}

.dep-outcome {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
}

.dep-outcome--accepted {
  color: var(--success);
}

.dep-outcome--rejected {
  color: var(--err);
}

.dep-outcome--test {
  color: var(--info);
}

.dep-log-text {
  color: var(--text);
  min-width: 0;
  overflow-wrap: anywhere;
}

.dep-log-reason {
  display: block;
  color: var(--text-3);
  font-size: 12px;
}

.dep-log-time {
  color: var(--text-3);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.dep-secret {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--warn) 40%, var(--border));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--warn) 7%, var(--surface));
}

.dep-secret-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dep-secret-head h3 {
  flex: 1;
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}

.dep-kv {
  display: grid;
  gap: 8px;
  margin: 0;
}

.dep-kv dt {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
}

.dep-kv dd {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 0 0;
  min-width: 0;
}

.dep-kv code {
  font-family: var(--font-mono);
  font-size: 12.5px;
  padding: 4px 8px;
  border-radius: var(--radius-xs);
  background: var(--surface-2);
  border: 1px solid var(--border);
  overflow-wrap: anywhere;
  min-width: 0;
}

.dep-copy {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.dep-howto summary {
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-ink);
}

.dep-howto ol {
  margin: 8px 0 0;
  padding-left: 20px;
  display: grid;
  gap: 6px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-2);
}

.dep-howto code {
  font-family: var(--font-mono);
  font-size: 12px;
}

.dep-form {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.dep-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  gap: 12px;
}

.dep-field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-2);
}

.dep-field small {
  font-weight: 400;
  color: var(--text-3);
}

.dep-input {
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 14px;
  font-weight: 400;
}

.dep-textarea {
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 13px;
}

.dep-checks {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--text-2);
}

.dep-checks input {
  accent-color: var(--accent);
  margin-right: 6px;
}

.dep-form-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}

.dep-test-warn,
.dep-log-reason--warn {
  color: var(--warn);
}

.dep-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 640px) {
  .dep-row {
    grid-template-columns: 1fr;
  }

  .dep-item {
    grid-template-columns: 1fr;
  }

  .dep-log-row {
    grid-template-columns: 1fr auto;
  }

  .dep-outcome {
    grid-column: 1 / -1;
  }

  .dep-kv dd {
    flex-wrap: wrap;
  }
}
</style>
