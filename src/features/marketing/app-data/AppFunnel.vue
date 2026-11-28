<script setup lang="ts">
/**
 * Funil por UTM (M4, D8), por SEMANA FECHADA (contrato de 07/11): para cada
 * tupla fonte, mídia, campanha e conteúdo, os cliques do link curto, as
 * leituras do QR (que também passam pelo link) e os cadastros que o app contou
 * com aquela UTM nas semanas fechadas do período, e a conversão sobre os
 * cliques do mesmo intervalo. A tupla casa normalizada dos dois lados
 * ("Instagram" do link colado à mão casa com o `instagram` da UTM do Nevo).
 *
 * Embaixo, as linhas que não são tupla: "Outras UTMs" (link montado fora da
 * ala, ou UTM com menos de 5 cadastros na semana) e "Sem UTM". Com elas a
 * conta fecha com os cadastros das semanas. Na semana em que o recorte juntou
 * os sem UTM ao balde (veio `utm:outras` sem a `utm:sem_utm`), a linha é "Sem
 * UTM e outras" (revisão B, Etapa 3). A semana em curso aparece como aviso: o
 * número dela entra na segunda-feira seguinte.
 */
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { QrCode } from 'lucide-vue-next'
import type { AppAttribution, AppFunnelRow } from '@/service/marketing/marketing-app-data'
import { cutHint, fmtConversion, fmtInt, fmtOpenWeek, fmtSum, fmtWeeks } from './app-data-format'

const props = defineProps<{
  rows: AppFunnelRow[]
  totals: AppAttribution['totals']
  weeks: AppAttribution['weeks']
  brandName?: (id: string) => string
  multiBrand?: boolean
}>()

const showAll = ref(false)
const active = computed(() => props.rows.filter((r) => r.clicks > 0 || r.signups.cells > 0))
const visible = computed(() => (showAll.value ? props.rows : active.value))
const hidden = computed(() => props.rows.length - active.value.length)

/** As linhas que não são tupla (só quando a semana trouxe a célula). */
const summary = computed(() =>
  [
    {
      key: 'other',
      label: 'Outras UTMs',
      sub: 'Link montado fora da ala, ou UTM com menos de 5 cadastros na semana',
      title: 'Para proteger quem veio por uma UTM com poucos cadastros, às vezes uma UTM maior entra junto aqui.',
      value: props.totals.signupsOtherUtm,
    },
    {
      key: 'none',
      label: 'Sem UTM',
      sub: 'Cadastro que não veio de link com UTM',
      title: '',
      value: props.totals.signupsWithoutUtm,
    },
    {
      // A semana trouxe `utm:outras` sem a linha `utm:sem_utm`: o recorte juntou os dois.
      key: 'none-other',
      label: 'Sem UTM e outras',
      sub: 'Cadastros sem UTM, links montados fora da ala ou UTM com menos de 5 cadastros na semana',
      title: 'Para proteger quem veio por uma UTM com poucos cadastros, nesta semana os cadastros sem UTM entraram junto com as outras.',
      value: props.totals.signupsWithoutUtmAndOther,
    },
  ].filter((s) => s.value.cells > 0),
)
const openWeek = computed(() => fmtOpenWeek(props.weeks))

function tupleText(r: AppFunnelRow) {
  return [r.campaign, r.content].filter(Boolean).join(' / ') || '(sem campanha)'
}
</script>

<template>
  <section class="mk-panel adf" data-testid="app-funnel" aria-labelledby="adf-title">
    <header class="mk-panel__head adf__head">
      <div class="adf__title">
        <h3 id="adf-title">Funil por UTM</h3>
        <span class="adf__weeks" data-testid="funnel-weeks">{{ fmtWeeks(weeks) }}</span>
      </div>
      <label v-if="hidden > 0" class="adf__toggle">
        <input v-model="showAll" type="checkbox" />
        Mostrar as {{ hidden }} sem movimento
      </label>
    </header>
    <p v-if="openWeek" class="adf__open" data-testid="funnel-open-week">{{ openWeek }}</p>
    <p v-if="!weeks.count" class="adf__empty">
      Nenhuma semana do período fechou ainda. O funil conta por semana fechada, de segunda a domingo: o número
      entra na segunda-feira seguinte.
    </p>
    <p v-else-if="!visible.length && !summary.length" class="adf__empty">
      Nenhum clique nem cadastro com UTM nas semanas fechadas do período. Crie a UTM do post em "UTMs e QR" e use o
      link curto dela: o cadastro feito a partir dele entra aqui quando a semana fecha, a partir de 5 na semana.
    </p>
    <div v-else class="adf__scroll">
      <table class="mk-table adf__table">
        <thead>
          <tr>
            <th>UTM</th>
            <th class="hide-md">Onde é usado</th>
            <th class="mk-num">Cliques</th>
            <th class="mk-num hide-sm">Leituras QR</th>
            <th class="mk-num">Cadastros</th>
            <th class="mk-num">Conversão</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in visible" :key="`${r.companyId}:${r.key}`" :data-key="r.key" data-testid="funnel-row">
            <td><div class="adf__utm">
              <span class="adf__camp">{{ tupleText(r) }}</span>
              <span class="adf__sub">
                <template v-if="multiBrand && brandName">{{ brandName(r.companyId) }} · </template>{{ r.source || '-' }} / {{ r.medium || '-' }}
                <span v-if="!r.inNevo" class="mk-chip adf__chip" data-tone :style="{ '--mk-tone': 'var(--text-3)' }">sem UTM no Nevo</span>
              </span>
            </div></td>
            <td class="hide-md"><div class="adf__where">
              <template v-if="r.links.length">
                <span v-for="l in r.links.slice(0, 2)" :key="l.utmId" class="adf__link">
                  <RouterLink :to="{ name: 'marketing-utm', query: { utm: l.utmId } }">{{ l.placement || `/l/${l.code}` }}</RouterLink>
                  <QrCode v-if="l.qr" :size="12" aria-label="com QR" />
                  <RouterLink v-if="l.card" class="adf__meta" :to="{ name: 'marketing-card', params: { cardId: l.card.id } }">
                    {{ l.card.title }}
                  </RouterLink>
                  <span v-if="l.partner" class="adf__meta">{{ l.partner.name }}</span>
                </span>
                <span v-if="r.links.length > 2" class="adf__meta">e mais {{ r.links.length - 2 }}</span>
              </template>
              <span v-else class="adf__meta">Link montado fora da ala</span>
            </div></td>
            <td class="mk-num">{{ fmtInt(r.clicks) }}</td>
            <td class="mk-num hide-sm">{{ r.scans ? fmtInt(r.scans) : '-' }}</td>
            <td class="mk-num adf__signups" :title="cutHint(r.signups)">{{ r.signups.cells ? fmtSum(r.signups) : '0' }}</td>
            <td class="mk-num">{{ fmtConversion(r.conversion) }}</td>
          </tr>
          <tr v-if="!visible.length" class="adf__none-row">
            <td colspan="6">Nenhuma UTM da ala com cadastro nas semanas fechadas do período.</td>
          </tr>
        </tbody>
        <tbody v-if="summary.length" class="adf__summary">
          <tr v-for="s in summary" :key="s.key" :data-testid="`funnel-${s.key}`" :title="s.title || undefined">
            <td><div class="adf__utm">
              <span class="adf__camp adf__camp--muted">{{ s.label }}</span>
              <span class="adf__sub">{{ s.sub }}</span>
            </div></td>
            <td class="hide-md"><span class="adf__meta">-</span></td>
            <td class="mk-num adf__meta">-</td>
            <td class="mk-num hide-sm adf__meta">-</td>
            <td class="mk-num adf__signups" :title="cutHint(s.value)">{{ fmtSum(s.value) }}</td>
            <td class="mk-num adf__meta">-</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="adf__foot">
      Conta por semana fechada, de segunda a domingo de Brasília, e os cliques e as leituras de QR são do mesmo
      intervalo. Toda leitura de QR passa pelo link curto, então já está dentro dos cliques. A conversão é cadastros
      sobre cliques. A origem vem do site e do app: é estimativa, não prova.
    </p>
  </section>
</template>

<style scoped>
.adf {
  min-width: 0;
}

.adf__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.adf__head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.adf__title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 8px;
  min-width: 0;
}

.adf__weeks {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.adf__open {
  margin: 0;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  font-size: 12px;
  color: var(--text-2);
}

.adf__summary tr:first-child td {
  border-top: 1px solid var(--border-strong);
}

.adf__camp--muted {
  color: var(--text-2);
}

.adf__none-row td {
  font-size: 12px;
  color: var(--text-3);
}

.adf__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
}

.adf__empty,
.adf__foot {
  margin: 0;
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-3);
}

.adf__foot {
  border-top: 1px solid var(--border);
  font-size: 12px;
}

.adf__scroll {
  overflow-x: auto;
}

.adf__utm,
.adf__where {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.adf__camp {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.adf__sub,
.adf__meta {
  font-size: 12px;
  color: var(--text-3);
}

.adf__chip {
  margin-left: 4px;
}

.adf__link {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 6px;
}

.adf__link a {
  color: var(--text);
  text-decoration: none;
}

.adf__link a:hover {
  text-decoration: underline;
}

.adf__signups {
  font-weight: 700;
}

@media (max-width: 900px) {
  .hide-md {
    display: none;
  }
}

@media (max-width: 640px) {
  .hide-sm {
    display: none;
  }
}
</style>
