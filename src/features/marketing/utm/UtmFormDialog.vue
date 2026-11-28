<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { AlertTriangle, Link2, Loader2, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import { getApiErrorMessage } from '@/service/api'
import {
  duplicateUtmId,
  type MarketingUtm,
  type UtmOptions,
} from '@/service/marketing/marketing-utm'
import type { MarketingBrand } from '@/service/marketing/marketing-core'
import { useUtmMutations } from './useUtm'
import { buildFinalPreview, normalizeUtmValue, splitPastedUtm } from './utm-normalize'

/**
 * Gerador de UTM (criar e editar). A prévia mostra, ao vivo, o valor que cada
 * campo vira (minúsculo, sem acento, hífen no lugar de espaço) e a URL com
 * UTM, porque é isso que vai para o relatório.
 *
 * "Gerar QR Code" vem marcado ao criar (spec R1, D10): a API cria a UTM e o QR
 * na mesma transação. Antes o QR só nascia num botão no fim do painel e
 * ninguém achava.
 */
const props = defineProps<{
  modelValue: boolean
  groupId: string
  brands: MarketingBrand[]
  defaultBrandId: string | null
  options: UtmOptions | undefined
  /** Preenchido = editar essa UTM */
  utm?: MarketingUtm | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [utm: MarketingUtm]
  'open-existing': [id: string]
}>()

const editing = computed(() => !!props.utm)
const mut = useUtmMutations(() => props.groupId)

const companyId = ref('')
const target = ref('')
const source = ref('')
const medium = ref('')
const campaign = ref('')
const campaignId = ref('')
const content = ref('')
const term = ref('')
const placement = ref('')
const cardId = ref('')
const partnerId = ref('')
const activationId = ref('')
/** Só na criação; padrão marcado (D10). */
const withQr = ref(true)

/** O texto só fala de QR quando haverá um: o que vai ser criado, ou o que a UTM editada já tem. */
const hasQr = computed(() => (editing.value ? !!props.utm?.qr : withQr.value))

const error = ref('')
const duplicateId = ref<string | null>(null)
const saving = computed(() => mut.create.isPending.value || mut.update.isPending.value)

function reset() {
  const u = props.utm
  error.value = ''
  duplicateId.value = null
  if (u) {
    companyId.value = u.companyId
    target.value = u.shortLink.targetUrl
    source.value = u.shortLink.utmSource ?? ''
    medium.value = u.shortLink.utmMedium ?? ''
    campaign.value = u.shortLink.utmCampaign ?? ''
    campaignId.value = u.campaign?.id ?? ''
    content.value = u.shortLink.utmContent ?? ''
    term.value = u.shortLink.utmTerm ?? ''
    placement.value = u.placement
    cardId.value = u.cardId ?? ''
    partnerId.value = u.partnerId ?? ''
    activationId.value = u.activationId ?? ''
    return
  }
  companyId.value = props.defaultBrandId ?? props.brands[0]?.companyId ?? ''
  withQr.value = true
  target.value = ''
  source.value = ''
  medium.value = ''
  campaign.value = ''
  campaignId.value = ''
  content.value = ''
  term.value = ''
  placement.value = ''
  cardId.value = ''
  partnerId.value = ''
  activationId.value = ''
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) reset()
  },
  { immediate: true },
)

// Item da lista fixa que a UTM antiga já tem continua aparecendo no select.
function withCurrent(list: string[] | undefined, current: string) {
  const base = list ?? []
  return current && !base.includes(current) ? [current, ...base] : base
}
const sourceItems = computed(() => withCurrent(props.options?.sources, source.value))
const mediumItems = computed(() => withCurrent(props.options?.mediums, medium.value))

/**
 * Na edição, o vínculo que a UTM já tem fica na lista mesmo fora das opções
 * (campanha cancelada, card arquivado, parceiro de outra lista): senão o
 * select mostra vazio e a pessoa acha que perdeu o vínculo.
 */
function keepCurrent<T extends { id: string }>(list: T[], current: T | null | undefined): T[] {
  return current && !list.some((x) => x.id === current.id) ? [current, ...list] : list
}
const current = <K extends 'campaign' | 'card' | 'partner' | 'activation'>(key: K) =>
  editing.value ? (props.utm?.[key] ?? null) : null

const campaignItems = computed(() =>
  keepCurrent<{ id: string; name: string }>(
    (props.options?.campaigns ?? []).filter((c) => c.companyId === companyId.value),
    current('campaign'),
  ),
)
const cardItems = computed(() =>
  keepCurrent<{ id: string; title: string }>(
    (props.options?.cards ?? []).filter((c) => c.companyId === companyId.value),
    current('card'),
  ),
)
const partnerItems = computed(() =>
  keepCurrent<{ id: string; name: string }>(
    (props.options?.partners ?? []).filter((p) => !p.companyId || p.companyId === companyId.value),
    current('partner'),
  ),
)
const activationItems = computed(() =>
  keepCurrent<{ id: string; title: string }>(
    (props.options?.activations ?? []).filter((a) => a.companyId === companyId.value),
    current('activation'),
  ),
)

watch(companyId, () => {
  // Na edição a marca não muda (o select nem aparece): o reset ao abrir troca o
  // companyId e isto apagava os vínculos que a UTM já tinha.
  if (editing.value) return
  // Trocar a marca solta o que era de outra marca.
  if (!campaignItems.value.some((c) => c.id === campaignId.value)) campaignId.value = ''
  if (!cardItems.value.some((c) => c.id === cardId.value)) cardId.value = ''
  if (!partnerItems.value.some((p) => p.id === partnerId.value)) partnerId.value = ''
  if (!activationItems.value.some((a) => a.id === activationId.value)) activationId.value = ''
})

function pickCampaign(id: string) {
  campaignId.value = id
  const found = campaignItems.value.find((c) => c.id === id)
  if (found) campaign.value = normalizeUtmValue(found.name)
}

// Itens dos AppSelect (o Nevo não usa select nativo, D11).
const brandSelect = computed(() => props.brands.map((b) => ({ label: b.name, value: b.companyId })))
const sourceSelect = computed(() => sourceItems.value.map((v) => ({ label: v, value: v })))
const mediumSelect = computed(() => mediumItems.value.map((v) => ({ label: v, value: v })))
const campaignSelect = computed(() => [
  { label: 'Nenhuma', value: '' },
  ...campaignItems.value.map((c) => ({ label: c.name, value: c.id })),
])
const cardSelect = computed(() => [{ label: 'Nenhum', value: '' }, ...cardItems.value.map((c) => ({ label: c.title, value: c.id }))])
const partnerSelect = computed(() => [
  { label: 'Nenhum', value: '' },
  ...partnerItems.value.map((p) => ({ label: p.name, value: p.id })),
])
const activationSelect = computed(() => [
  { label: 'Nenhuma', value: '' },
  ...activationItems.value.map((a) => ({ label: a.title, value: a.id })),
])
const asText = (v: unknown) => (typeof v === 'string' ? v : '')

/** Link colado já com utm_*: separa a base e preenche os campos que estavam vazios. */
function splitTarget() {
  const split = splitPastedUtm(target.value)
  if (!split || !Object.keys(split.found).length) return
  const f = split.found
  const src = normalizeUtmValue(f.utm_source)
  const med = normalizeUtmValue(f.utm_medium)
  if (!source.value && src && props.options?.sources.includes(src)) source.value = src
  if (!medium.value && med && props.options?.mediums.includes(med)) medium.value = med
  if (!campaign.value && f.utm_campaign) campaign.value = f.utm_campaign
  if (!content.value && f.utm_content) content.value = f.utm_content
  if (!term.value && f.utm_term) term.value = f.utm_term
  target.value = split.base
}

const campaignNorm = computed(() => normalizeUtmValue(campaign.value))
const contentNorm = computed(() => normalizeUtmValue(content.value))
const termNorm = computed(() => normalizeUtmValue(term.value))

const finalUrl = computed(() =>
  buildFinalPreview({
    target: target.value,
    source: source.value,
    medium: medium.value,
    campaign: campaign.value,
    content: content.value,
    term: term.value,
  }),
)

const missing = computed(() => {
  if (!editing.value && !companyId.value) return 'Escolha a marca.'
  if (!splitPastedUtm(target.value)) return 'Informe um destino http(s) válido.'
  if (!source.value) return 'Escolha a origem (utm_source).'
  if (!medium.value) return 'Escolha a mídia (utm_medium).'
  if (!campaignNorm.value) return 'Informe a campanha (utm_campaign).'
  if (!placement.value.trim()) return 'Diga onde esse link será usado.'
  return ''
})

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

async function submit(force = false) {
  error.value = ''
  if (!force) duplicateId.value = null
  if (missing.value) {
    error.value = missing.value
    return
  }
  const common = {
    targetUrl: splitPastedUtm(target.value)!.base,
    utmSource: source.value,
    utmMedium: medium.value,
    utmCampaign: campaign.value,
    utmContent: content.value || null,
    utmTerm: term.value || null,
    placement: placement.value.trim(),
    campaignId: campaignId.value || null,
    cardId: cardId.value || null,
    partnerId: partnerId.value || null,
    activationId: activationId.value || null,
    ...(force ? { force: true } : {}),
  }
  try {
    const saved = props.utm
      ? await mut.update.mutateAsync({ id: props.utm.id, patch: common })
      : await mut.create.mutateAsync({ companyId: companyId.value, ...common, withQr: withQr.value })
    emit('saved', saved)
    emit('update:modelValue', false)
  } catch (e) {
    const existing = duplicateUtmId(e)
    if (existing) duplicateId.value = existing
    else error.value = getApiErrorMessage(e, 'Não foi possível salvar a UTM.')
  }
}
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    :label="editing ? 'Editar UTM' : 'Nova UTM'"
    size="lg"
    :loading="saving"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="uf" data-testid="utm-form">
      <header class="uf-head">
        <span class="uf-icon"><Link2 :size="16" /></span>
        <h2>{{ editing ? 'Editar UTM' : 'Nova UTM' }}</h2>
        <button type="button" class="mk-icon-btn" aria-label="Fechar" :disabled="saving" @click="close">
          <X :size="16" />
        </button>
      </header>

      <form class="uf-body" @submit.prevent="submit(false)">
        <div class="uf-grid">
          <p v-if="!editing" class="mk-hint uf-wide uf-intro">
            <template v-if="hasQr">
              O Nevo cria um <strong>link curto</strong>, que conta cada clique, e o <strong>QR Code</strong>, que conta cada
              leitura. Os dois levam ao destino com as UTMs, que dizem ao Google Analytics de onde veio a visita.
            </template>
            <template v-else>
              O Nevo cria um <strong>link curto</strong>, que conta cada clique e leva ao destino com as UTMs, que dizem ao
              Google Analytics de onde veio a visita. O QR Code pode ser criado depois, no painel da UTM.
            </template>
          </p>

          <div v-if="!editing && brands.length > 1" class="mk-field uf-wide" data-testid="utm-brand">
            <span class="mk-label">Marca</span>
            <AppSelect :model-value="companyId" :items="brandSelect" label="Marca" density="compact" @update:model-value="companyId = asText($event)" />
          </div>

          <label class="mk-field uf-wide">
            <span class="mk-label">URL de destino</span>
            <input
              v-model="target"
              class="mk-input"
              type="text"
              inputmode="url"
              autocomplete="off"
              placeholder="https://petjourney.com.br/app"
              data-testid="utm-target"
              @change="splitTarget"
            />
            <span class="mk-hint">Se você colar um link que já tem utm_, os campos abaixo são preenchidos sozinhos.</span>
          </label>

          <div class="mk-field" data-testid="utm-source">
            <span class="mk-label">Origem (utm_source)</span>
            <AppSelect
              :model-value="source"
              :items="sourceSelect"
              label="Origem (utm_source)"
              placeholder="Escolha"
              density="compact"
              @update:model-value="source = asText($event)"
            />
          </div>
          <div class="mk-field" data-testid="utm-medium">
            <span class="mk-label">Mídia (utm_medium)</span>
            <AppSelect
              :model-value="medium"
              :items="mediumSelect"
              label="Mídia (utm_medium)"
              placeholder="Escolha"
              density="compact"
              @update:model-value="medium = asText($event)"
            />
          </div>

          <div v-if="campaignItems.length" class="mk-field uf-wide" data-testid="utm-campaign-select">
            <span class="mk-label">Campanha cadastrada (opcional)</span>
            <AppSelect
              :model-value="campaignId"
              :items="campaignSelect"
              label="Campanha cadastrada"
              density="compact"
              @update:model-value="pickCampaign(asText($event))"
            />
          </div>

          <label class="mk-field uf-wide">
            <span class="mk-label">Campanha (utm_campaign)</span>
            <input
              v-model="campaign"
              class="mk-input"
              type="text"
              autocomplete="off"
              placeholder="Dia dos Pets 2026"
              data-testid="utm-campaign"
            />
            <span v-if="campaign.trim()" class="mk-hint" data-testid="utm-campaign-normalized">
              Será gravada como <code>{{ campaignNorm || '(vazio)' }}</code>
            </span>
          </label>

          <label class="mk-field">
            <span class="mk-label">Conteúdo (utm_content, opcional)</span>
            <input v-model="content" class="mk-input" type="text" autocomplete="off" placeholder="placa-balcao" data-testid="utm-content" />
            <span v-if="content.trim()" class="mk-hint">Vira <code>{{ contentNorm || '(vazio)' }}</code></span>
          </label>
          <label class="mk-field">
            <span class="mk-label">Termo (utm_term, opcional)</span>
            <input v-model="term" class="mk-input" type="text" autocomplete="off" data-testid="utm-term" />
            <span v-if="term.trim()" class="mk-hint">Vira <code>{{ termNorm || '(vazio)' }}</code></span>
          </label>

          <label class="mk-field uf-wide">
            <span class="mk-label">Onde será usado</span>
            <input
              v-model="placement"
              class="mk-input"
              type="text"
              maxlength="200"
              autocomplete="off"
              placeholder="Bio do Instagram, placa da clínica Vida Felina, folder da feira"
              data-testid="utm-placement"
            />
          </label>

          <div v-if="cardItems.length" class="mk-field" data-testid="utm-card">
            <span class="mk-label">Post ou peça (opcional)</span>
            <AppSelect :model-value="cardId" :items="cardSelect" label="Post ou peça" density="compact" @update:model-value="cardId = asText($event)" />
          </div>
          <div v-if="partnerItems.length" class="mk-field" data-testid="utm-partner">
            <span class="mk-label">Parceiro (opcional)</span>
            <AppSelect :model-value="partnerId" :items="partnerSelect" label="Parceiro" density="compact" @update:model-value="partnerId = asText($event)" />
          </div>
          <div v-if="activationItems.length" class="mk-field" data-testid="utm-activation">
            <span class="mk-label">Ativação (opcional)</span>
            <AppSelect
              :model-value="activationId"
              :items="activationSelect"
              label="Ativação"
              density="compact"
              @update:model-value="activationId = asText($event)"
            />
          </div>

          <label v-if="!editing" class="uf-qr uf-wide">
            <input v-model="withQr" type="checkbox" data-testid="utm-with-qr" />
            <span class="uf-qr__text">
              <strong>Gerar QR Code</strong>
              <small>Para placa, folder e embalagem. Cada leitura é contada, e o QR continua valendo se você trocar o destino depois.</small>
            </span>
          </label>
        </div>

        <div class="uf-preview">
          <span class="mk-label">URL com UTM (prévia)</span>
          <code class="uf-url" data-testid="utm-final-preview">{{ finalUrl ?? 'Informe o destino para ver a URL com UTM.' }}</code>
          <span class="mk-hint">
            É o destino com as UTMs coladas. Ela não passa pelo Nevo, então não conta clique: para divulgar, use o link curto{{
              hasQr ? ' ou o QR' : ''
            }}.
          </span>
          <span v-if="editing" class="mk-hint">
            Mudar o destino ou as UTMs não troca o link curto{{ hasQr ? ' nem o QR' : '' }}: o que já foi impresso continua valendo.
          </span>
        </div>

        <div v-if="duplicateId" class="uf-dup" role="alert" data-testid="utm-duplicate">
          <AlertTriangle :size="16" aria-hidden="true" />
          <div class="uf-dup__text">
            <strong>Já existe uma UTM igual.</strong>
            <span>Mesmo destino e mesmas cinco UTMs. Use a existente para os cliques não ficarem divididos.</span>
          </div>
          <div class="uf-dup__actions">
            <button type="button" class="mk-btn" @click="emit('open-existing', duplicateId!); emit('update:modelValue', false)">
              Abrir a existente
            </button>
            <button type="button" class="mk-btn" :disabled="saving" @click="submit(true)">Criar mesmo assim</button>
          </div>
        </div>

        <p v-if="error" class="mk-error" role="alert">{{ error }}</p>

        <footer class="uf-foot">
          <button type="button" class="mk-btn mk-btn--ghost" :disabled="saving" @click="close">Cancelar</button>
          <button type="submit" class="mk-btn mk-btn--primary" :disabled="saving">
            <Loader2 v-if="saving" :size="14" class="uf-spin" />
            {{ editing ? 'Salvar' : 'Criar UTM' }}
          </button>
        </footer>
      </form>
    </div>
  </AppDialog>
</template>

<style scoped>
.uf {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: calc(100vh - 40px);
}

.uf-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}

.uf-head h2 {
  flex: 1;
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.uf-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.uf-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px 18px;
  overflow-y: auto;
  min-height: 0;
}

.uf-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.uf-wide {
  grid-column: 1 / -1;
}

.uf-intro {
  margin: 0;
}

.uf-qr {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.uf-qr input {
  width: 16px;
  height: 16px;
  margin: 2px 0 0;
  accent-color: var(--accent);
}

.uf-qr__text {
  display: grid;
  gap: 2px;
  font-size: 13px;
}

.uf-qr__text small {
  color: var(--text-3);
  font-size: 12px;
}

.uf-preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.uf-url {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text);
  word-break: break-all;
}

.uf-dup {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px 10px;
  align-items: start;
  padding: 10px 12px;
  border: 1px solid var(--warn);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--warn) 10%, transparent);
  font-size: 13px;
}

.uf-dup__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.uf-dup__text span {
  color: var(--text-2);
}

.uf-dup__actions {
  grid-column: 1 / -1;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.uf-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.uf-spin {
  animation: uf-spin 0.9s linear infinite;
}

@keyframes uf-spin {
  to {
    transform: rotate(360deg);
  }
}

code {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text);
}

@media (max-width: 640px) {
  .uf-grid {
    grid-template-columns: 1fr;
  }

  .uf-foot .mk-btn,
  .uf-dup__actions .mk-btn {
    flex: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .uf-spin {
    animation: none;
  }
}

/* AppSelect compacto tem 36px; no celular o toque pede 44px. */
@media (max-width: 640px) {
  .uf-grid :deep(.app-select__trigger) {
    min-height: 44px;
  }
}
</style>
