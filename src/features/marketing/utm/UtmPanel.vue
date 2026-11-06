<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { AlertTriangle, Copy, Download, ExternalLink, Info, Pencil, Power, QrCode, Trash2, X } from 'lucide-vue-next'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import QrPreview from '@/features/qr/components/QrPreview.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import type { QrStyle } from '@/service/qr/qr-service'
import type { MarketingUtm } from '@/service/marketing/marketing-utm'
import { exportQr } from '@/utils/qr-styled'
import { spYmd } from '../calendar/calendar-time'
import { formatYmd } from '../campaigns/campaign-labels'
import UtmMetricsChart from './UtmMetricsChart.vue'
import { fileSlug } from './utm-normalize'
import { useUtmMetrics, useUtmMutations } from './useUtm'

/**
 * Painel de uma UTM: o que divulgar (link curto e QR, lado a lado no topo),
 * a URL com UTM, destino, métricas e vínculos. O QR guarda o link curto, então
 * trocar o destino aqui nunca invalida o que já foi impresso.
 *
 * Spec R1, D10: o QR saiu do fim do painel (ninguém achava) e a "URL final"
 * virou "URL com UTM", com o aviso de que ela não passa pelo Nevo e por isso
 * não conta clique (era o "link grande que não deu certo" em produção).
 */
const props = defineProps<{
  utm: MarketingUtm
  groupId: string
  canEdit: boolean
  canDelete: boolean
  brandName: string
  /** Mostra o botão de fechar (no painel lateral; no dialog o X é do dialog) */
  closable?: boolean
}>()

const emit = defineEmits<{
  close: []
  edit: []
  deleted: []
}>()

const toast = useToast()
const mut = useUtmMutations(() => props.groupId)
const metrics = useUtmMetrics(
  () => props.groupId,
  () => props.utm.id,
)

const target = ref(props.utm.shortLink.targetUrl)
watch(
  () => props.utm.shortLink.targetUrl,
  (v) => (target.value = v),
)
const targetDirty = computed(() => target.value.trim() !== props.utm.shortLink.targetUrl)

const confirmDelete = ref(false)
const qrStyle = computed(() => (props.utm.qr?.style ?? null) as QrStyle | null)
const active = computed(() => props.utm.shortLink.active)

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copiado.`)
  } catch {
    toast.error('Não foi possível copiar. Selecione o texto e copie à mão.')
  }
}

async function saveTarget() {
  try {
    await mut.update.mutateAsync({ id: props.utm.id, patch: { targetUrl: target.value.trim() } })
    toast.success('Destino atualizado. O link curto e o QR continuam os mesmos.')
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Não foi possível trocar o destino.'))
  }
}

async function toggleActive() {
  try {
    await mut.setActive.mutateAsync({ id: props.utm.id, active: !active.value })
    toast.success(active.value ? 'Link e QR desativados.' : 'Link e QR reativados.')
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Não foi possível mudar o estado.'))
  }
}

async function makeQr() {
  try {
    await mut.createQr.mutateAsync({ id: props.utm.id })
    toast.success('QR criado. Ele aponta para o link curto.')
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Não foi possível criar o QR.'))
  }
}

async function download(format: 'png' | 'svg') {
  const qr = props.utm.qr
  if (!qr) return
  try {
    await exportQr(qr.redirectUrl, qr.style as QrStyle | null, format, `qr-${fileSlug(props.utm.placement)}.${format}`)
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Não foi possível baixar o QR.'))
  }
}

async function remove() {
  try {
    await mut.remove.mutateAsync(props.utm.id)
    confirmDelete.value = false
    toast.success('UTM apagada.')
    emit('deleted')
  } catch (e) {
    toast.error(getApiErrorMessage(e, 'Não foi possível apagar a UTM.'))
  }
}

const linked = computed(() => {
  const u = props.utm
  const out: { label: string; text: string; to?: object }[] = []
  if (u.campaign) out.push({ label: 'Campanha', text: u.campaign.name, to: { name: 'marketing-campaigns', query: { campanha: u.campaign.id } } })
  if (u.card) out.push({ label: 'Post ou peça', text: u.card.title, to: { name: 'marketing-card', params: { cardId: u.card.id } } })
  if (u.partner) out.push({ label: 'Parceiro', text: u.partner.name, to: { name: 'marketing-partners', query: { parceiro: u.partner.id } } })
  if (u.activation) {
    out.push({ label: 'Ativação', text: u.activation.title, to: { name: 'marketing-activations', query: { ativacao: u.activation.id } } })
  }
  return out
})

function fmtDate(iso: string) {
  return formatYmd(spYmd(iso))
}
</script>

<template>
  <div class="up" data-testid="utm-panel">
    <header class="up-head">
      <div class="up-title">
        <h2>{{ utm.placement }}</h2>
        <div class="up-meta">
          <span class="mk-chip">{{ brandName }}</span>
          <span class="mk-chip" data-tone :style="{ '--mk-tone': active ? 'var(--success)' : 'var(--text-3)' }">
            {{ active ? 'Ativa' : 'Desativada' }}
          </span>
          <span class="up-sub">criada em {{ fmtDate(utm.createdAt) }}<template v-if="utm.createdBy"> por {{ utm.createdBy.name }}</template></span>
        </div>
      </div>
      <button v-if="closable" type="button" class="mk-icon-btn" aria-label="Fechar" @click="emit('close')">
        <X :size="16" />
      </button>
    </header>

    <div v-if="canEdit || canDelete" class="up-actions">
      <button v-if="canEdit" type="button" class="mk-btn" @click="emit('edit')"><Pencil :size="14" />Editar</button>
      <button v-if="canEdit" type="button" class="mk-btn" :disabled="mut.setActive.isPending.value" @click="toggleActive">
        <Power :size="14" />{{ active ? 'Desativar' : 'Reativar' }}
      </button>
      <button v-if="canDelete" type="button" class="mk-btn mk-btn--danger" @click="confirmDelete = true">
        <Trash2 :size="14" />Apagar
      </button>
    </div>

    <section class="up-sec up-share" data-testid="utm-share">
      <h3>Para divulgar</h3>
      <p class="mk-hint up-share__lead">
        Use o link curto em post, bio e mensagem, e o QR em placa, folder e embalagem. Os dois passam pelo Nevo: cada
        clique e cada leitura entram nos resultados abaixo.
      </p>
      <p v-if="!active" class="up-off" role="status">
        <AlertTriangle :size="14" aria-hidden="true" />
        Desativada: o link curto e o QR mostram "link inativo" até você reativar.
      </p>
      <div class="up-share__grid">
        <div class="up-short" data-testid="utm-short">
          <span class="up-share__label">Link curto</span>
          <code class="up-short__url">{{ utm.shortLink.shortUrl }}</code>
          <div class="up-share__btns">
            <a
              class="mk-btn"
              :href="utm.shortLink.shortUrl"
              target="_blank"
              rel="noopener noreferrer"
              title="Abre o link curto numa aba nova. Conta como um clique, igual ao do público."
              data-testid="utm-open-short"
            >
              <ExternalLink :size="14" aria-hidden="true" />Abrir
            </a>
            <button type="button" class="mk-btn" aria-label="Copiar link curto" @click="copy(utm.shortLink.shortUrl, 'Link curto')">
              <Copy :size="14" aria-hidden="true" />Copiar
            </button>
          </div>
          <span class="mk-hint">Conta cada clique.</span>
        </div>

        <div v-if="utm.qr" class="up-qr" data-testid="utm-qr">
          <QrPreview :text="utm.qr.redirectUrl" :style="qrStyle" :size="112" />
          <div class="up-qr__side">
            <span class="up-share__label">QR Code</span>
            <div class="up-share__btns">
              <button type="button" class="mk-btn" aria-label="Baixar PNG do QR" @click="download('png')"><Download :size="14" aria-hidden="true" />PNG</button>
              <button type="button" class="mk-btn" aria-label="Baixar SVG do QR" @click="download('svg')"><Download :size="14" aria-hidden="true" />SVG</button>
            </div>
            <span class="mk-hint">Conta cada leitura. Para gráfica, use o SVG (vetor).</span>
          </div>
        </div>
        <div v-else class="up-qr up-qr--empty" data-testid="utm-qr-empty">
          <span class="up-qr__ph" aria-hidden="true"><QrCode :size="28" /></span>
          <div class="up-qr__side">
            <span class="up-share__label">QR Code</span>
            <span class="mk-hint">Esta UTM ainda não tem QR.</span>
            <button
              v-if="canEdit"
              type="button"
              class="mk-btn mk-btn--primary"
              :disabled="mut.createQr.isPending.value"
              @click="makeQr"
            >
              <QrCode :size="14" aria-hidden="true" />Criar QR Code
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="up-sec" data-testid="utm-long">
      <h3>URL com UTM</h3>
      <div class="up-link">
        <code class="up-link__url">{{ utm.shortLink.finalUrl }}</code>
        <button type="button" class="mk-icon-btn" aria-label="Copiar URL com UTM" @click="copy(utm.shortLink.finalUrl, 'URL com UTM')">
          <Copy :size="15" />
        </button>
      </div>
      <p class="up-warn" data-testid="utm-long-warning">
        <Info :size="14" aria-hidden="true" />
        <span>Não passa pelo Nevo, então não conta clique. Para divulgar, use o link curto ou o QR.</span>
      </p>
      <p class="mk-hint">
        Serve para conferir as UTMs ou para quem precisa do endereço completo (um anúncio que já mede por conta própria,
        por exemplo).
      </p>
      <dl class="up-utm">
        <div><dt>Origem</dt><dd>{{ utm.shortLink.utmSource }}</dd></div>
        <div><dt>Mídia</dt><dd>{{ utm.shortLink.utmMedium }}</dd></div>
        <div><dt>Campanha</dt><dd>{{ utm.shortLink.utmCampaign }}</dd></div>
        <div v-if="utm.shortLink.utmContent"><dt>Conteúdo</dt><dd>{{ utm.shortLink.utmContent }}</dd></div>
        <div v-if="utm.shortLink.utmTerm"><dt>Termo</dt><dd>{{ utm.shortLink.utmTerm }}</dd></div>
      </dl>
    </section>

    <section class="up-sec">
      <h3>Destino</h3>
      <div class="up-dest">
        <input
          v-model="target"
          class="mk-input"
          type="text"
          inputmode="url"
          :readonly="!canEdit"
          aria-label="URL de destino"
          autocomplete="off"
        />
        <button
          v-if="canEdit"
          type="button"
          class="mk-btn mk-btn--primary"
          :disabled="!targetDirty || mut.update.isPending.value"
          @click="saveTarget"
        >
          Salvar destino
        </button>
      </div>
      <p class="mk-hint">O QR impresso continua valendo: ele aponta para o link curto, e é o link curto que muda de destino.</p>
    </section>

    <section class="up-sec">
      <h3>Resultados</h3>
      <div class="up-stats">
        <div class="up-stat">
          <strong>{{ utm.shortLink.clickCount.toLocaleString('pt-BR') }}</strong>
          <span>Cliques no link</span>
        </div>
        <div class="up-stat">
          <strong>{{ (utm.qr?.scanCount ?? 0).toLocaleString('pt-BR') }}</strong>
          <span>Leituras de QR</span>
        </div>
        <div class="up-stat" title="Quem lê o QR passa pelo link curto, então cada leitura também conta um clique. Esta é a diferença.">
          <strong>{{ (metrics.data.value?.totals.clicksOutsideQr ?? Math.max(0, utm.shortLink.clickCount - (utm.qr?.scanCount ?? 0))).toLocaleString('pt-BR') }}</strong>
          <span>Cliques fora do QR</span>
        </div>
      </div>
      <div data-testid="utm-chart" class="up-chart">
        <Skeleton v-if="metrics.isLoading.value" type="block" />
        <UtmMetricsChart v-else-if="metrics.data.value" :days="metrics.data.value.days" :has-qr="!!utm.qr" />
        <p v-else class="mk-hint">Não foi possível carregar as métricas.</p>
      </div>
      <ul v-if="metrics.data.value?.referers.length" class="up-ref" aria-label="Principais origens dos cliques">
        <li v-for="r in metrics.data.value.referers" :key="r.referer">
          <span class="up-ref__name">{{ r.referer }}</span>
          <span class="mk-num">{{ r.count }}</span>
        </li>
      </ul>
    </section>

    <section v-if="linked.length" class="up-sec">
      <h3>Ligada a</h3>
      <ul class="up-linked">
        <li v-for="l in linked" :key="l.label">
          <span class="up-linked__label">{{ l.label }}</span>
          <RouterLink v-if="l.to" :to="l.to" class="up-linked__link">{{ l.text }}<ExternalLink :size="12" aria-hidden="true" /></RouterLink>
          <span v-else>{{ l.text }}</span>
        </li>
      </ul>
    </section>

    <ConfirmDialog
      v-model="confirmDelete"
      title="Apagar UTM"
      message="Isso apaga o link curto, o QR e os cliques e leituras contados. QR impresso com esse código para de funcionar. Para só pausar, use Desativar."
      confirm-label="Apagar UTM"
      danger
      :loading="mut.remove.isPending.value"
      @confirm="remove"
    />
  </div>
</template>

<style scoped>
.up {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  container-type: inline-size;
}

.up-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.up-title {
  flex: 1;
  min-width: 0;
}

.up-title h2 {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.up-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.up-sub {
  font-size: 12px;
  color: var(--text-3);
}

.up-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.up-sec {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.up-sec h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.up-link {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.up-share__lead {
  margin: 0;
}

.up-share__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
}

.up-short,
.up-qr {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.up-share__label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-2);
}

.up-short__url {
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 600;
  word-break: break-all;
  color: var(--text);
}

.up-share__btns {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.up-share__btns .mk-btn {
  text-decoration: none;
}

.up-off {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 6px 10px;
  border: 1px solid var(--warn);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--warn) 10%, transparent);
  font-size: 12.5px;
}

.up-warn {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--warn);
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  color: var(--text);
}

.up-warn svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--warn);
}

.up-link__url {
  font-family: var(--font-mono);
  font-size: 12px;
  word-break: break-all;
  color: var(--text);
}

.up-utm {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 6px 12px;
  margin: 0;
}

.up-utm div {
  min-width: 0;
}

.up-utm dt {
  font-size: 12px;
  color: var(--text-3);
}

.up-utm dd {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.up-dest {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.up-dest .mk-input {
  flex: 1;
  min-width: 180px;
}

.up-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.up-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.up-stat strong {
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.up-stat span {
  font-size: 12px;
  color: var(--text-3);
}

.up-chart {
  min-height: 190px;
}

.up-ref {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12.5px;
}

.up-ref li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
}

.up-ref__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-2);
}

.up-qr {
  flex-direction: row;
  align-items: flex-start;
  gap: 10px;
}

.up-qr__side {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.up-qr__ph {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text-3);
}

.up-linked {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
}

.up-linked li {
  display: flex;
  gap: 10px;
}

.up-linked__label {
  width: 90px;
  flex-shrink: 0;
  color: var(--text-3);
  font-size: 12px;
}

.up-linked__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--accent-ink);
  text-decoration: none;
  font-weight: 600;
}

.up-linked__link:hover {
  text-decoration: underline;
}

code {
  font-family: var(--font-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}

/* No painel lateral (440px) o QR desce para baixo do link curto: lado a lado
   ele ficava espremido e o texto quebrava palavra por palavra. */
@container (max-width: 480px) {
  .up-share__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .up-share__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .up-share__btns .mk-btn {
    flex: 1;
    justify-content: center;
    min-height: 44px;
  }

  .up-stat strong {
    font-size: 18px;
  }
}
</style>
