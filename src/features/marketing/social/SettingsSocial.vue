<script setup lang="ts">
/**
 * Aba "Redes" das Configurações da ala (R2, A1 e A2).
 *
 * - Por marca: as contas conectadas (página, Instagram, conta de anúncio,
 *   canal, página do LinkedIn, TikTok), com status, validade e quem conectou.
 *   Dono e Admin conectam, testam e desconectam; os outros só leem.
 * - Rede sem chave no servidor: o passo a passo de criar o app, com a URL de
 *   callback pronta para copiar. O resto da ala segue igual (sai à mão).
 * - Na volta do OAuth a URL traz `?escolher=<reserva>` (abre a escolha das
 *   contas: nada foi gravado ainda) ou `?erro=`: a tela mostra a frase e tira
 *   o parâmetro. Auditoria da parte A, achados 1 e 5.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, PlugZap, RefreshCw, Unplug } from 'lucide-vue-next'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import SocialConnectPicker from './SocialConnectPicker.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import type { MarketingBrand } from '@/service/marketing/marketing-core'
import {
  checkAccount,
  disconnectAccount,
  getConnectUrl,
  getSocialStatus,
  listSocialAccounts,
  type SocialAccount,
  type SocialProvider,
} from '@/service/marketing/marketing-social'
import { brandTone, toneStyle } from '../marketing-labels'
import { formatDayTime } from '../approvals/approvals-meta'
import {
  ACCOUNT_STATUS_LABEL,
  ACCOUNT_STATUS_TONE,
  cleanMotivo,
  CONNECT_ERROR_TEXT,
  PROVIDER_SHORT,
  SOCIAL_NETWORK_LABEL,
  socialKeys,
} from './social-meta'
import { networkIcon } from './network-icons'

const props = defineProps<{ groupId: string; brands: MarketingBrand[]; canManage: boolean }>()

const route = useRoute()
const router = useRouter()
const toast = useToast()
const queryClient = useQueryClient()

const status = useQuery({
  queryKey: computed(() => socialKeys.status(props.groupId)),
  queryFn: () => getSocialStatus(props.groupId),
  enabled: computed(() => !!props.groupId),
})
const accounts = useQuery({
  queryKey: computed(() => socialKeys.accounts(props.groupId)),
  queryFn: () => listSocialAccounts(props.groupId),
  enabled: computed(() => !!props.groupId),
})

const providers = computed(() => status.data.value?.providers ?? [])
const configured = computed(() => providers.value.filter((p) => p.configured))
const missing = computed(() => providers.value.filter((p) => !p.configured))
const canConnect = computed(() => props.canManage && !!status.data.value?.canConnect)

function accountsOf(companyId: string): SocialAccount[] {
  return (accounts.data.value ?? []).filter((a) => a.companyId === companyId)
}

// ── Volta do OAuth ──────────────────────────────────────────────────────────
const banner = ref<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null)
/** Reserva da conexão (`?escolher=`): abre a escolha das contas. */
const pickerKey = ref<string | null>(null)
watch(
  () => [route.query.escolher, route.query.erro] as const,
  ([key, err]) => {
    if (!key && !err && !route.query.conectado) return
    if (typeof key === 'string' && /^[\w-]{8,64}$/.test(key)) {
      pickerKey.value = key
    } else if (typeof err === 'string') {
      // Só o código conhecido vira frase; o motivo vem limpo (a URL pode ter sido montada por outra pessoa).
      const base = CONNECT_ERROR_TEXT[err] ?? 'Não deu para conectar.'
      const motivo = err === 'falhou' ? cleanMotivo(route.query.motivo) : ''
      banner.value = { tone: 'err', text: motivo ? `${base} ${motivo}` : base }
      toast.error(base)
    }
    const query = { ...route.query }
    for (const k of ['escolher', 'conectado', 'erro', 'n', 'pulados', 'motivo']) delete query[k]
    void router.replace({ query })
  },
  { immediate: true },
)

function onPicked(r: { provider: string; saved: number; blocked: string[]; brandName: string }) {
  pickerKey.value = null
  const name = PROVIDER_SHORT[r.provider as SocialProvider] ?? r.provider
  let text = r.saved === 1 ? `${name}: 1 conta conectada na ${r.brandName}.` : `${name}: ${r.saved} contas conectadas na ${r.brandName}.`
  if (r.blocked.length) text += ` ${r.blocked.length === 1 ? '1 conta já estava' : `${r.blocked.length} contas já estavam`} em outra marca e ficou onde estava.`
  const tone = r.saved ? 'ok' : 'warn'
  banner.value = { tone, text }
  if (r.saved) toast.success(text)
  else toast.warning(text)
}

// ── Ações ───────────────────────────────────────────────────────────────────
const connecting = ref<string | null>(null)
// Voltar do site da rede pelo "voltar" do navegador restaura a página com o
// botão girando (Safari): o evento `pageshow` destrava.
function unlockConnect() {
  connecting.value = null
}
onMounted(() => window.addEventListener('pageshow', unlockConnect))
onBeforeUnmount(() => window.removeEventListener('pageshow', unlockConnect))
async function connect(provider: SocialProvider, companyId: string) {
  connecting.value = `${provider}:${companyId}`
  try {
    const url = await getConnectUrl(props.groupId, provider, companyId)
    window.location.assign(url)
  } catch (error) {
    toast.error(getApiErrorMessage(error, 'Não deu para abrir a conexão.'))
    connecting.value = null
  }
}

const checking = ref<string | null>(null)
async function test(account: SocialAccount) {
  checking.value = account.id
  try {
    const fresh = await checkAccount(props.groupId, account.id)
    if (fresh.status === 'ACTIVE' && !fresh.lastError) toast.success(`${account.name}: conexão funcionando.`)
    else toast.error(fresh.lastError ?? `${account.name} precisa ser reconectada.`)
    await queryClient.invalidateQueries({ queryKey: socialKeys.all(props.groupId) })
  } catch (error) {
    toast.error(getApiErrorMessage(error, 'Não deu para testar a conexão.'))
  } finally {
    checking.value = null
  }
}

const removing = ref<SocialAccount | null>(null)
const removingBusy = ref(false)
async function confirmRemove() {
  const target = removing.value
  if (!target) return
  removingBusy.value = true
  try {
    const res = await disconnectAccount(props.groupId, target.id)
    removing.value = null
    let text = `${target.name} desconectada.`
    if (res.affectedPublications) text += ` ${res.affectedPublications} publicação(ões) pendente(s) ficaram com "Tentar de novo".`
    if (res.revokeError) text += ' A rede não confirmou a revogação; tire o acesso do app também pelo site da rede.'
    toast.success(text)
    await queryClient.invalidateQueries({ queryKey: ['marketing', props.groupId] })
  } catch (error) {
    toast.error(getApiErrorMessage(error, 'Não deu para desconectar.'))
  } finally {
    removingBusy.value = false
  }
}

const copied = ref<string | null>(null)
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = text
    toast.success('Copiado.')
    setTimeout(() => {
      if (copied.value === text) copied.value = null
    }, 2000)
  } catch {
    toast.error('Não deu para copiar. Selecione e copie à mão.')
  }
}

function expiry(a: SocialAccount): string {
  if (!a.expiresAt) return a.network === 'FACEBOOK' || a.network === 'INSTAGRAM' ? 'Não vence' : 'Sem validade informada'
  const d = new Date(a.expiresAt)
  if (a.autoRenew && a.status === 'ACTIVE') return 'Renova sozinho'
  return d.getTime() < Date.now() ? `Venceu em ${formatDayTime(a.expiresAt)}` : `Vence em ${formatDayTime(a.expiresAt)}`
}
function expiringSoon(a: SocialAccount): boolean {
  if (!a.expiresAt || a.autoRenew) return false
  // Quem não renova sozinho (conta de anúncio da Meta, LinkedIn sem renovação) avisa 7 dias antes.
  return new Date(a.expiresAt).getTime() - Date.now() < 7 * 864e5
}
</script>

<template>
  <div class="ss" data-testid="settings-social">
    <section class="mk-panel">
      <header class="mk-panel__head">Contas das redes por marca</header>
      <div class="mk-panel__body ss__body">
        <p class="mk-hint">
          Cada marca publica com as contas dela. Conectar abre a rede para você autorizar; o acesso fica guardado cifrado
          e nunca aparece na tela. Rede sem conta sai como lembrete à mão na hora marcada.
        </p>
        <div
          v-if="banner"
          class="ss__banner"
          :class="`is-${banner.tone}`"
          :role="banner.tone === 'err' ? 'alert' : 'status'"
          data-testid="social-banner"
        >
          <Check v-if="banner.tone === 'ok'" :size="15" aria-hidden="true" />
          <AlertTriangle v-else :size="15" aria-hidden="true" />
          <span>{{ banner.text }}</span>
        </div>

        <div v-if="status.isLoading.value || accounts.isLoading.value" class="ss__loading">
          <Skeleton type="row" />
          <Skeleton type="row" />
        </div>
        <div v-else-if="status.isError.value || accounts.isError.value" class="mk-load-error" role="alert">
          <p>{{ getApiErrorMessage(status.error.value ?? accounts.error.value, 'Não deu para carregar as redes.') }}</p>
          <button type="button" class="mk-btn" @click="status.refetch(); accounts.refetch()">Tentar de novo</button>
        </div>

        <template v-else>
          <div v-for="brand in brands" :key="brand.companyId" class="ss__brand" :data-brand="brand.companyId">
            <div class="ss__brand-head">
              <span class="mk-dot" :style="toneStyle(brandTone(brand))" aria-hidden="true" />
              <strong>{{ brand.name }}</strong>
              <span class="ss__count">{{ accountsOf(brand.companyId).length }} {{ accountsOf(brand.companyId).length === 1 ? 'conta' : 'contas' }}</span>
            </div>
            <ul v-if="accountsOf(brand.companyId).length" class="ss__list" role="list">
              <li v-for="a in accountsOf(brand.companyId)" :key="a.id" class="ss__row" :data-account="a.network">
                <component :is="networkIcon(a.network)" :size="16" class="ss__icon" aria-hidden="true" />
                <div class="ss__main">
                  <div class="ss__line">
                    <span class="ss__name">{{ a.name }}</span>
                    <span v-if="a.username" class="ss__user">@{{ a.username.replace(/^@/, '') }}</span>
                    <span class="ss__net">{{ SOCIAL_NETWORK_LABEL[a.network] ?? a.network }}</span>
                  </div>
                  <div class="ss__meta">
                    <span class="mk-chip" data-tone :style="toneStyle(ACCOUNT_STATUS_TONE[a.status])" data-testid="account-status">
                      {{ ACCOUNT_STATUS_LABEL[a.status] ?? a.status }}
                    </span>
                    <span :class="{ 'mk-late': expiringSoon(a) }">{{ expiry(a) }}</span>
                    <span v-if="a.info.currency">Moeda {{ a.info.currency }}</span>
                    <span v-if="a.info.pageName">Página {{ a.info.pageName }}</span>
                    <span v-if="a.connectedBy" class="ss__by">por {{ a.connectedBy.name }}</span>
                  </div>
                  <p v-if="a.lastError" class="ss__err" role="alert">{{ a.lastError }}</p>
                </div>
                <div v-if="canConnect" class="ss__actions">
                  <button
                    type="button"
                    class="mk-btn mk-btn--ghost"
                    :disabled="checking === a.id"
                    data-action="check-account"
                    @click="test(a)"
                  >
                    <Loader2 v-if="checking === a.id" :size="14" class="ss__spin" aria-hidden="true" />
                    <RefreshCw v-else :size="14" aria-hidden="true" />
                    Testar
                  </button>
                  <button type="button" class="mk-btn mk-btn--ghost ss__danger" data-action="disconnect" @click="removing = a">
                    <Unplug :size="14" aria-hidden="true" /> Desconectar
                  </button>
                </div>
              </li>
            </ul>
            <p v-else class="ss__empty">Nenhuma conta conectada nesta marca.</p>

            <div v-if="canConnect && configured.length" class="ss__connect" role="group" :aria-label="`Conectar contas de ${brand.name}`">
              <button
                v-for="p in configured"
                :key="p.provider"
                type="button"
                class="mk-btn"
                :disabled="!!connecting"
                :data-connect="p.provider"
                @click="connect(p.provider, brand.companyId)"
              >
                <Loader2 v-if="connecting === `${p.provider}:${brand.companyId}`" :size="14" class="ss__spin" aria-hidden="true" />
                <PlugZap v-else :size="14" aria-hidden="true" />
                Conectar {{ PROVIDER_SHORT[p.provider] }}
              </button>
            </div>
          </div>
          <p v-if="!canManage" class="mk-hint">Para conectar ou desconectar uma conta, peça para um Admin ou para o Dono do grupo.</p>
        </template>
      </div>
    </section>

    <section v-if="providers.length" class="mk-panel" data-testid="social-setup">
      <header class="mk-panel__head">Redes no servidor</header>
      <div class="mk-panel__body ss__body">
        <ul class="ss__providers" role="list">
          <li v-for="p in providers" :key="p.provider" class="ss__prov" :data-provider="p.provider" :data-configured="p.configured ? '1' : '0'">
            <div class="ss__prov-head">
              <strong>{{ p.label }}</strong>
              <span class="mk-chip" data-tone :style="toneStyle(p.configured ? 'green' : 'slate')">
                {{ p.configured ? 'Ligada' : 'Sem chave no servidor' }}
              </span>
            </div>
            <template v-if="!p.configured && canManage">
              <ol class="ss__steps">
                <li v-for="(s, i) in p.steps" :key="i">{{ s }}</li>
              </ol>
              <div class="ss__copy">
                <span class="mk-label">URL de callback</span>
                <div class="ss__copy-row">
                  <code class="ss__code" data-testid="callback-url">{{ p.callbackUrl }}</code>
                  <button type="button" class="mk-btn" :aria-label="`Copiar a URL de callback de ${p.label}`" data-action="copy-callback" @click="copy(p.callbackUrl)">
                    <Check v-if="copied === p.callbackUrl" :size="14" aria-hidden="true" />
                    <Copy v-else :size="14" aria-hidden="true" />
                    Copiar
                  </button>
                </div>
              </div>
              <p class="ss__env">
                Variáveis: <code v-for="e in p.env" :key="e" class="ss__code ss__code--inline">{{ e }}</code>
                <span class="ss__sep">·</span>
                Escopos: <span class="ss__scopes">{{ p.scopes.join(', ') }}</span>
              </p>
              <a :href="p.consoleUrl" target="_blank" rel="noopener noreferrer" class="ss__link">
                <ExternalLink :size="13" aria-hidden="true" /> Abrir o painel de desenvolvedor ({{ PROVIDER_SHORT[p.provider] }})
              </a>
            </template>
            <p v-else-if="!p.configured" class="mk-hint">Esta rede ainda não foi ligada no servidor do Nevo (quem cuida da instalação põe as chaves). Até lá, os posts dela saem como lembrete à mão.</p>
            <p v-else class="ss__env">
              Callback: <code class="ss__code ss__code--inline">{{ p.callbackUrl }}</code>
            </p>
          </li>
        </ul>
        <p v-if="missing.length && canManage" class="mk-hint">
          As chaves ficam só nas variáveis do servidor (nunca nesta tela). Depois de pôr as chaves, reinicie a API e volte aqui para conectar.
        </p>
      </div>
    </section>

    <SocialConnectPicker :group-id="groupId" :connection-key="pickerKey" @close="pickerKey = null" @done="onPicked" />

    <ConfirmDialog
      :model-value="!!removing"
      title="Desconectar a conta?"
      :message="`${removing?.name ?? ''} deixa de publicar por esta marca. O que já saiu e os números ficam guardados; o que estava agendado nela fica com Tentar de novo.`"
      confirm-label="Desconectar"
      danger
      :loading="removingBusy"
      @update:model-value="(v) => { if (!v) removing = null }"
      @confirm="confirmRemove"
    />
  </div>
</template>

<style scoped>
.ss {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ss__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ss__loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ss__banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.ss__banner.is-ok {
  border-color: color-mix(in srgb, var(--success) 40%, var(--border));
  background: color-mix(in srgb, var(--success) 7%, var(--surface));
}

.ss__banner.is-err {
  border-color: color-mix(in srgb, var(--err) 40%, var(--border));
  background: color-mix(in srgb, var(--err) 6%, var(--surface));
}

.ss__banner.is-warn {
  border-color: color-mix(in srgb, var(--warn) 40%, var(--border));
  background: color-mix(in srgb, var(--warn) 7%, var(--surface));
}

.ss__brand {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.ss__brand:last-of-type {
  border-bottom: 0;
}

.ss__brand-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.ss__count {
  color: var(--text-3);
  font-size: 12px;
}

.ss__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.ss__row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}

.ss__row:last-child {
  border-bottom: 0;
}

.ss__icon {
  flex: none;
  margin-top: 2px;
  color: var(--text-2);
}

.ss__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ss__line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 13px;
}

.ss__name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.ss__user,
.ss__net,
.ss__by {
  color: var(--text-3);
  font-size: 12px;
}

.ss__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--text-2);
}

.ss__err {
  margin: 0;
  color: var(--err);
  font-size: 12px;
}

.ss__actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.ss__danger:hover {
  color: var(--err);
}

.ss__empty {
  margin: 0;
  color: var(--text-3);
  font-size: 12.5px;
}

.ss__connect {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.ss__providers {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ss__prov {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.ss__prov-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
}

.ss__steps {
  margin: 0;
  padding-left: 20px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-2);
}

.ss__copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ss__copy-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.ss__code {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.ss__code--inline {
  display: inline;
  padding: 1px 5px;
  margin-right: 4px;
}

.ss__env {
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.ss__scopes {
  color: var(--text-3);
}

.ss__sep {
  margin: 0 6px;
  color: var(--text-3);
}

.ss__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  color: var(--accent-ink);
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
}

.ss__link:hover {
  text-decoration: underline;
}

.ss__spin {
  animation: ss-spin 0.9s linear infinite;
}

@keyframes ss-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .ss__row {
    flex-wrap: wrap;
  }

  .ss__actions {
    width: 100%;
    padding-left: 26px;
  }

  .ss__actions .mk-btn,
  .ss__connect .mk-btn,
  .ss__copy-row .mk-btn {
    min-height: 44px;
  }

  .ss__copy-row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
