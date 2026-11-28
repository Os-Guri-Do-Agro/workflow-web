<script setup lang="ts">
/**
 * Resultados das redes na campanha (R2, A8 e A9):
 * - números dos posts dos cards da campanha (soma do último número de cada post);
 * - anúncios da Meta ligados: total, série por dia, "Atualizar" e "Lançar gasto
 *   do mês no financeiro" (um lançamento por mês, em Tráfego pago; repetir avisa
 *   e oferece "Atualizar valor").
 * Dinheiro só aparece para quem vê o financeiro (a API manda `null`).
 */
import { computed, ref, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import axios from 'axios'
import { Link2, Loader2, Megaphone, Plus, RefreshCw, Unlink, Wallet, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import {
  getCampaignSocial,
  launchAdSpend,
  linkAdCampaign,
  listAdCampaigns,
  syncAdCampaign,
  unlinkAdCampaign,
  type AdLink,
  type CampaignSocial,
} from '@/service/marketing/marketing-social'
import { formatDayTime } from '../approvals/approvals-meta'
import { asText } from '../select-items'
import { AD_OBJECTIVE_LABEL, AD_STATUS_LABEL, METRIC_LABELS, fmtNum, formatMoney, socialKeys } from './social-meta'
import { networkIcon } from './network-icons'

const props = defineProps<{ groupId: string; campaignId: string }>()
const toast = useToast()
const queryClient = useQueryClient()

const key = computed(() => socialKeys.campaign(props.groupId, props.campaignId))
const query = useQuery({
  queryKey: key,
  queryFn: () => getCampaignSocial(props.groupId, props.campaignId),
  enabled: computed(() => !!props.groupId && !!props.campaignId),
  retry: (count, err) => !(axios.isAxiosError(err) && [403, 404, 503].includes(err.response?.status ?? 0)) && count < 2,
})
const hidden = computed(() => {
  const err = query.error.value
  return axios.isAxiosError(err) && [403, 404, 503].includes(err.response?.status ?? 0)
})
const data = computed(() => query.data.value ?? null)
function apply(next: CampaignSocial) {
  queryClient.setQueryData(key.value, next)
}

/**
 * A Meta manda o gasto na moeda da CONTA de anúncio: cada valor sai na moeda
 * dela, e o total só soma quando todas as ligadas usam a mesma moeda
 * (auditoria da parte A).
 */
const adCurrency = computed(() => {
  const set = new Set((data.value?.ads.links ?? []).map((l) => l.account.currency ?? 'BRL'))
  return set.size === 1 ? [...set][0] : null
})
const money = (cents: number | null | undefined, l?: AdLink) => formatMoney(cents, l ? l.account.currency : adCurrency.value)
/** O financeiro é em reais: conta de outra moeda lança à mão (a API recusa). */
const isBrl = (l: AdLink) => !l.account.currency || l.account.currency === 'BRL'
type LaunchedCampaign = NonNullable<NonNullable<AdLink['months'][number]['launched']>['campaign']>
/** Onde está o lançamento do mês quando não é nesta campanha (a mesma chave que o "Lançar" barra). */
function launchedWhere(c: LaunchedCampaign): string {
  // Sem nome: sem campanha, ou de marca que a pessoa não vê (a API não manda nem o id).
  if (!c.name) return 'fora desta campanha'
  return c.inTrash ? `na campanha ${c.name}, que está na Lixeira` : `na campanha ${c.name}`
}
const adsEmptyText = computed(() => {
  const d = data.value
  if (!d) return ''
  if (!d.canEdit) return 'Nenhuma campanha de anúncio ligada.'
  if (d.ads.accounts.length && !d.ads.accounts.some((a) => a.status === 'ACTIVE')) {
    return 'A conta de anúncio desta marca precisa ser reconectada (Configurações, aba Redes) para ligar campanhas.'
  }
  if (!d.ads.accounts.length) {
    return 'Esta marca não tem conta de anúncio da Meta conectada. Um Admin conecta em Configurações, aba Redes; depois é só ligar a campanha aqui.'
  }
  return 'Nenhuma campanha de anúncio ligada. Ligue para ver gasto, alcance e resultado por dia.'
})

const postMetrics = computed(() => {
  const t = data.value?.posts.totals
  if (!t) return []
  return METRIC_LABELS.filter((m) => typeof t[m.key] === 'number').map((m) => ({ label: m.label, value: fmtNum(t[m.key]) }))
})

// ── Ligar campanha de anúncio ───────────────────────────────────────────────
const linkOpen = ref(false)
const accountId = ref('')
const activeAccounts = computed(() => (data.value?.ads.accounts ?? []).filter((a) => a.status === 'ACTIVE'))
watch(linkOpen, (open) => {
  if (open && !accountId.value) accountId.value = activeAccounts.value[0]?.id ?? ''
})
const options = useQuery({
  queryKey: computed(() => socialKeys.adCampaigns(props.groupId, props.campaignId, accountId.value || '-')),
  queryFn: () => listAdCampaigns(props.groupId, props.campaignId, accountId.value),
  enabled: computed(() => linkOpen.value && !!accountId.value),
})
const accountItems = computed(() => activeAccounts.value.map((a) => ({ label: a.currency ? `${a.name} (${a.currency})` : a.name, value: a.id })))
const linking = ref<string | null>(null)
async function link(externalCampaignId: string, name: string) {
  linking.value = externalCampaignId
  try {
    apply(await linkAdCampaign(props.groupId, props.campaignId, { accountId: accountId.value, externalCampaignId, name }))
    linkOpen.value = false
    toast.success(`"${name}" ligada. O gasto e o resultado entram sozinhos todo dia.`)
  } catch (err) {
    toast.error(getApiErrorMessage(err, 'Não deu para ligar a campanha de anúncio.'))
  } finally {
    linking.value = null
  }
}

// ── Atualizar, desligar e lançar ────────────────────────────────────────────
const busy = ref<string | null>(null)
async function sync(l: AdLink) {
  busy.value = `sync:${l.id}`
  try {
    const next = await syncAdCampaign(props.groupId, props.campaignId, l.id)
    apply(next)
    // A API grava a falha da Meta no link e responde 200: a frase vem daqui.
    const failed = next.ads.links.find((x) => x.id === l.id)?.lastSyncError
    if (failed) toast.error(failed)
    else toast.success('Números da Meta atualizados.')
  } catch (err) {
    toast.error(getApiErrorMessage(err, 'Não deu para atualizar.'))
  } finally {
    busy.value = null
  }
}

const unlinkTarget = ref<AdLink | null>(null)
async function confirmUnlink() {
  const l = unlinkTarget.value
  if (!l) return
  busy.value = `unlink:${l.id}`
  try {
    apply(await unlinkAdCampaign(props.groupId, props.campaignId, l.id))
    unlinkTarget.value = null
    toast.success('Campanha de anúncio desligada. O que já foi lançado no financeiro ficou.')
  } catch (err) {
    toast.error(getApiErrorMessage(err, 'Não deu para desligar.'))
  } finally {
    busy.value = null
  }
}

async function launch(l: AdLink, month: string, update = false) {
  busy.value = `launch:${l.id}:${month}`
  try {
    const res = await launchAdSpend(props.groupId, props.campaignId, l.id, { month, update })
    const kept = res.kept?.length ? ` A ${res.kept.join(' e a ')}, editadas à mão, ficaram como estavam.` : ''
    toast.success(
      res.created
        ? `Lançado no financeiro: ${money(res.amountCents, l)} em Tráfego pago.`
        : res.changed
          ? `Valor atualizado para ${money(res.amountCents, l)}.${kept}`
          : 'O financeiro já estava com este valor.',
    )
    await query.refetch()
    void queryClient.invalidateQueries({ queryKey: ['marketing', props.groupId, 'finance'] })
    void queryClient.invalidateQueries({ queryKey: ['marketing', props.groupId, 'campaigns'] })
  } catch (err) {
    toast.error(getApiErrorMessage(err, 'Não deu para lançar no financeiro.'))
    void query.refetch()
  } finally {
    busy.value = null
  }
}

/** Barras da série por dia: gasto (quem vê o financeiro) ou impressões. */
function series(l: AdLink) {
  const money = data.value?.seesMoney && l.days.some((d) => (d.spendCents ?? 0) > 0)
  const values = l.days.map((d) => (money ? (d.spendCents ?? 0) : d.impressions))
  const max = Math.max(1, ...values)
  return {
    label: money ? 'Gasto por dia' : 'Impressões por dia',
    bars: l.days.map((d, i) => ({
      date: d.date,
      h: Math.max(2, Math.round(((values[i] ?? 0) / max) * 56)),
      title: `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}: ${money ? formatMoney(d.spendCents ?? 0, l.account.currency) : `${fmtNum(d.impressions)} impressões`}, ${fmtNum(d.clicks)} cliques${d.results !== null ? `, ${fmtNum(d.results)} resultados` : ''}`,
    })),
  }
}
const showDays = ref<string | null>(null)
</script>

<template>
  <section v-if="!hidden" class="csr" data-testid="campaign-social">
    <div v-if="query.isLoading.value"><Skeleton type="block" height="80px" /></div>
    <div v-else-if="query.isError.value" class="mk-load-error" role="alert">
      <p>{{ getApiErrorMessage(query.error.value, 'Não deu para carregar os números das redes.') }}</p>
      <button type="button" class="mk-btn" @click="query.refetch()">Tentar de novo</button>
    </div>

    <template v-else-if="data">
      <div class="csr__block" data-testid="campaign-posts">
        <h3 class="csr__title">Posts da campanha nas redes</h3>
        <p v-if="!data.posts.count" class="mk-hint">Nenhum card desta campanha foi publicado pelo Nevo ainda. Os números chegam no dia seguinte à publicação.</p>
        <template v-else>
          <p class="mk-hint">{{ data.posts.count }} {{ data.posts.count === 1 ? 'post publicado' : 'posts publicados' }}. Soma do último número de cada post.</p>
          <dl class="csr__nums">
            <div v-for="m in postMetrics" :key="m.label">
              <dt>{{ m.label }}</dt>
              <dd>{{ m.value }}</dd>
            </div>
          </dl>
          <!-- Rola de lado no celular (5 colunas não cabem em 375 px) -->
          <div v-if="data.posts.byNetwork.length > 1" class="csr__scroll" data-testid="posts-by-network">
            <table class="mk-table csr__table">
              <thead>
                <tr><th>Rede</th><th class="mk-num">Posts</th><th class="mk-num">Alcance</th><th class="mk-num">Curtidas</th><th class="mk-num">Comentários</th></tr>
              </thead>
              <tbody>
                <tr v-for="n in data.posts.byNetwork" :key="n.network">
                  <td><component :is="networkIcon(n.network)" :size="13" aria-hidden="true" /> {{ n.label }}</td>
                  <td class="mk-num">{{ n.posts }}</td>
                  <td class="mk-num">{{ fmtNum(n.totals.reach) }}</td>
                  <td class="mk-num">{{ fmtNum(n.totals.likes) }}</td>
                  <td class="mk-num">{{ fmtNum(n.totals.comments) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>

      <div class="csr__block" data-testid="campaign-ads">
        <div class="csr__head">
          <h3 class="csr__title"><Megaphone :size="14" aria-hidden="true" /> Anúncios da Meta</h3>
          <button v-if="data.ads.canLink" type="button" class="mk-btn" data-action="link-ad" @click="linkOpen = true">
            <Plus :size="14" aria-hidden="true" /> Ligar campanha de anúncio
          </button>
        </div>
        <p v-if="!data.ads.links.length" class="mk-hint" data-testid="ads-empty">{{ adsEmptyText }}</p>

        <template v-if="data.ads.links.length">
          <dl class="csr__nums" data-testid="ads-totals">
            <div>
              <dt>Gasto</dt>
              <dd>
                {{ data.ads.totals.spendCents === null ? 'Só no financeiro' : adCurrency ? money(data.ads.totals.spendCents) : 'Moedas diferentes: veja em cada campanha' }}
              </dd>
            </div>
            <div><dt>Impressões</dt><dd>{{ fmtNum(data.ads.totals.impressions) }}</dd></div>
            <div><dt>Alcance</dt><dd>{{ fmtNum(data.ads.totals.reach) }}</dd></div>
            <div><dt>Cliques</dt><dd>{{ fmtNum(data.ads.totals.clicks) }}</dd></div>
            <div><dt>Resultados</dt><dd>{{ fmtNum(data.ads.totals.results) }}</dd></div>
          </dl>
          <ul class="csr__links" role="list">
            <li v-for="l in data.ads.links" :key="l.id" class="csr__link" data-testid="ad-link">
              <div class="csr__link-head">
                <Link2 :size="14" aria-hidden="true" />
                <strong class="csr__name">{{ l.name }}</strong>
                <span class="csr__muted">{{ l.account.name }}</span>
                <span class="mk-toolbar__spacer" />
                <button v-if="data.canEdit" type="button" class="mk-btn mk-btn--ghost csr__act" :disabled="!!busy" data-action="sync-ad" @click="sync(l)">
                  <Loader2 v-if="busy === `sync:${l.id}`" :size="13" class="csr__spin" aria-hidden="true" />
                  <RefreshCw v-else :size="13" aria-hidden="true" />
                  Atualizar
                </button>
                <button v-if="data.canEdit" type="button" class="mk-btn mk-btn--ghost csr__act" :disabled="!!busy" :aria-label="`Desligar ${l.name}`" data-action="unlink-ad" @click="unlinkTarget = l">
                  <Unlink :size="13" aria-hidden="true" /> Desligar
                </button>
              </div>
              <p class="csr__muted">
                {{ l.lastSyncAt ? `Atualizado ${formatDayTime(l.lastSyncAt)}` : 'Ainda sem números' }}<template v-if="l.resultLabel"> · resultado: {{ l.resultLabel }}</template>
              </p>
              <p v-if="l.lastSyncError" class="mk-error" role="alert">{{ l.lastSyncError }}</p>
              <dl class="csr__nums csr__nums--sm">
                <div><dt>Gasto</dt><dd>{{ l.totals.spendCents === null ? '-' : money(l.totals.spendCents, l) }}</dd></div>
                <div><dt>Impressões</dt><dd>{{ fmtNum(l.totals.impressions) }}</dd></div>
                <div><dt>Cliques</dt><dd>{{ fmtNum(l.totals.clicks) }}</dd></div>
                <div><dt>{{ l.resultLabel ?? 'Resultados' }}</dt><dd>{{ fmtNum(l.totals.results) }}</dd></div>
              </dl>
              <figure v-if="l.days.length" class="csr__chart" :aria-label="series(l).label">
                <figcaption class="csr__muted">{{ series(l).label }} ({{ l.days.length }} dias)</figcaption>
                <div class="csr__bars" role="img" :aria-label="`${series(l).label}: ${l.days.length} dias`">
                  <span v-for="b in series(l).bars" :key="b.date" class="csr__bar" :style="{ height: `${b.h}px` }" :title="b.title" />
                </div>
                <button type="button" class="mk-btn mk-btn--ghost csr__act" :aria-expanded="showDays === l.id" @click="showDays = showDays === l.id ? null : l.id">
                  {{ showDays === l.id ? 'Esconder os dias' : 'Ver os dias' }}
                </button>
                <div v-if="showDays === l.id" class="csr__scroll">
                  <table class="mk-table csr__table">
                    <thead><tr><th>Dia</th><th class="mk-num">Gasto</th><th class="mk-num">Impressões</th><th class="mk-num">Cliques</th><th class="mk-num">Resultados</th></tr></thead>
                    <tbody>
                      <tr v-for="d in [...l.days].reverse()" :key="d.date">
                        <td>{{ d.date.slice(8, 10) }}/{{ d.date.slice(5, 7) }}</td>
                        <td class="mk-num">{{ d.spendCents === null ? '-' : money(d.spendCents, l) }}</td>
                        <td class="mk-num">{{ fmtNum(d.impressions) }}</td>
                        <td class="mk-num">{{ fmtNum(d.clicks) }}</td>
                        <td class="mk-num">{{ fmtNum(d.results) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </figure>
              <ul v-if="data.seesMoney && l.months.length" class="csr__months" role="list">
                <li v-for="m in l.months" :key="m.month" class="csr__month" :data-month="m.month">
                  <Wallet :size="13" aria-hidden="true" />
                  <span class="csr__month-name">{{ m.label }}</span>
                  <span class="csr__muted">{{ money(m.spendCents, l) }} na Meta</span>
                  <span class="mk-toolbar__spacer" />
                  <template v-if="m.launched?.inTrash">
                    <span class="mk-chip">Lançamento na Lixeira{{ m.launched.campaign ? ` (${launchedWhere(m.launched.campaign)})` : '' }}</span>
                  </template>
                  <template v-else-if="m.launched">
                    <!-- A campanha de anúncio pode ter sido lançada noutra campanha da ala antes de mudar de lugar. -->
                    <span v-if="m.launched.campaign" class="mk-chip" data-tone style="--mk-tone: var(--tag-green)" data-testid="launched" data-elsewhere>
                      <template v-if="m.launched.campaign.id && !m.launched.campaign.inTrash">
                        Lançado na campanha
                        <RouterLink class="csr__chip-link" :to="{ name: 'marketing-campaigns', query: { campanha: m.launched.campaign.id } }" data-testid="launched-campaign">{{ m.launched.campaign.name }}</RouterLink>:
                      </template>
                      <template v-else>Lançado {{ launchedWhere(m.launched.campaign) }}:</template>
                      {{ money(m.launched.amountCents, l) }}
                    </span>
                    <span v-else class="mk-chip" data-tone style="--mk-tone: var(--tag-green)" data-testid="launched">Lançado: {{ money(m.launched.amountCents, l) }}</span>
                    <button
                      v-if="data.canEdit && m.launched.amountCents !== m.spendCents"
                      type="button"
                      class="mk-btn mk-btn--ghost csr__act"
                      :disabled="!!busy"
                      data-action="update-launch"
                      @click="launch(l, m.month, true)"
                    >
                      Atualizar valor
                    </button>
                  </template>
                  <span v-else-if="data.canEdit && !isBrl(l)" class="csr__muted">Conta em {{ l.account.currency }}: lance à mão no financeiro, com o valor da fatura em reais.</span>
                  <span v-else-if="data.canEdit && m.spendCents <= 0" class="csr__muted">Sem gasto neste mês.</span>
                  <button
                    v-else-if="data.canEdit"
                    type="button"
                    class="mk-btn csr__act"
                    :disabled="!!busy"
                    data-action="launch-spend"
                    @click="launch(l, m.month)"
                  >
                    <Loader2 v-if="busy === `launch:${l.id}:${m.month}`" :size="13" class="csr__spin" aria-hidden="true" />
                    Lançar gasto do mês no financeiro
                  </button>
                </li>
              </ul>
            </li>
          </ul>
        </template>
      </div>
    </template>

    <AppDialog v-model="linkOpen" label="Ligar campanha de anúncio" size="md">
      <div class="csr__dlg" data-testid="link-ad-dialog">
        <header class="csr__dlg-head">
          <h2>Ligar campanha de anúncio</h2>
          <button type="button" class="mk-icon-btn" aria-label="Fechar" @click="linkOpen = false"><X :size="16" /></button>
        </header>
        <div class="csr__dlg-body">
          <div v-if="accountItems.length > 1" class="mk-field">
            <span class="mk-label">Conta de anúncio</span>
            <AppSelect :model-value="accountId" :items="accountItems" label="Conta de anúncio" density="compact" @update:model-value="accountId = asText($event)" />
          </div>
          <p v-if="options.isLoading.value" class="mk-hint">Buscando as campanhas na Meta...</p>
          <div v-else-if="options.isError.value" class="mk-load-error" role="alert">
            <p>{{ getApiErrorMessage(options.error.value, 'Não deu para listar as campanhas da Meta.') }}</p>
            <button type="button" class="mk-btn" @click="options.refetch()">Tentar de novo</button>
          </div>
          <p v-else-if="!(options.data.value ?? []).length" class="mk-hint">Esta conta não tem campanhas de anúncio.</p>
          <ul v-else class="csr__opts" role="list">
            <li v-for="o in options.data.value" :key="o.id" class="csr__opt" :data-ad="o.id">
              <div class="csr__opt-main">
                <strong>{{ o.name }}</strong>
                <span class="csr__muted">
                  {{ o.objective ? (AD_OBJECTIVE_LABEL[o.objective] ?? o.objective) : 'Sem objetivo' }}<template v-if="o.status"> · {{ AD_STATUS_LABEL[o.status] ?? o.status }}</template>
                </span>
                <span v-if="o.linkedElsewhere" class="csr__muted">Já ligada a outra campanha da ala: desligue lá antes (o gasto entraria duas vezes).</span>
              </div>
              <span v-if="o.linkedHere" class="mk-chip">Ligada</span>
              <span v-else-if="o.linkedElsewhere" class="mk-chip">Em outra campanha</span>
              <button v-else type="button" class="mk-btn" :disabled="!!linking" data-action="pick-ad" @click="link(o.id, o.name)">
                <Loader2 v-if="linking === o.id" :size="13" class="csr__spin" aria-hidden="true" />
                Ligar
              </button>
            </li>
          </ul>
        </div>
      </div>
    </AppDialog>
    <ConfirmDialog
      :model-value="!!unlinkTarget"
      title="Desligar a campanha de anúncio?"
      :message="`Os números de ${unlinkTarget?.name ?? ''} saem desta campanha. O que já foi lançado no financeiro fica como está.`"
      confirm-label="Desligar"
      danger
      @update:model-value="(v) => { if (!v) unlinkTarget = null }"
      @confirm="confirmUnlink"
    />
  </section>
</template>

<style scoped>
.csr {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 14px;
}

.csr__block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.csr__head,
.csr__link-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.csr__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.csr__head .mk-btn {
  margin-left: auto;
}

.csr__nums {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 0;
}

.csr__nums div {
  display: flex;
  flex-direction: column;
}

.csr__nums dt {
  font-size: 11px;
  color: var(--text-3);
}

.csr__nums dd {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.csr__nums--sm dd {
  font-size: 13px;
}

.csr__table td svg {
  vertical-align: -2px;
}

.csr__links {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.csr__link {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.csr__name {
  font-size: 13px;
  overflow-wrap: anywhere;
}

.csr__muted {
  margin: 0;
  color: var(--text-3);
  font-size: 12px;
}

.csr__act {
  min-height: 28px;
  padding: 3px 8px;
  font-size: 12.5px;
}

.csr__chip-link {
  color: inherit;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.csr__chip-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}

.csr__chart {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
}

.csr__bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 58px;
  padding-bottom: 2px;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}

.csr__bar {
  flex: 1 0 4px;
  max-width: 16px;
  border-radius: 2px 2px 0 0;
  background: color-mix(in srgb, var(--accent) 70%, transparent);
}

.csr__chart .csr__act {
  align-self: flex-start;
}

.csr__scroll {
  max-height: 260px;
  overflow: auto;
}

.csr__months {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.csr__month {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  font-size: 12.5px;
}

.csr__month:last-child {
  border-bottom: 0;
}

.csr__month-name {
  font-weight: 600;
}

.csr__dlg {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 40px);
  min-height: 0;
}

.csr__dlg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 8px;
}

.csr__dlg-head h2 {
  margin: 0;
  font-size: 15px;
}

.csr__dlg-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 16px 16px;
  overflow-y: auto;
}

.csr__opts {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.csr__opt {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.csr__opt-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}

.csr__spin {
  animation: csr-spin 0.9s linear infinite;
}

@keyframes csr-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .csr__act,
  .csr__head .mk-btn,
  .csr__opt .mk-btn {
    min-height: 44px;
  }

  .csr__head .mk-btn {
    margin-left: 0;
    width: 100%;
  }
}
</style>
