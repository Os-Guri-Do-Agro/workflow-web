<script setup lang="ts">
/**
 * Rankings por cadastros (M4, D9): campanha, post, parceiro e QR. O parceiro
 * soma o código de indicação (`/r/<codigo>`, a indicação gravada no cadastro)
 * e as UTMs ligadas a ele, sem contar duas vezes quem veio pelo link da UTM
 * que leva ao próprio `/r/`. Linha "compartilhada" = a mesma UTM serve a dois
 * itens, e o app não sabe por qual link a pessoa veio.
 *
 * Todos contam por SEMANA FECHADA (o mesmo intervalo do funil): a UTM e o
 * parceiro vêm do app em `cadastros_semana`, não por dia.
 *
 * Embaixo dos parceiros, as linhas que não são parceiro, como no funil: "Outros
 * parceiros" (menos de 5 na semana) e "Sem indicação". Na semana em que o recorte
 * juntou os sem indicação ao balde (veio `parceiro:outros` sem a
 * `parceiro:sem_parceiro`), a linha é "Sem indicação e outros" (revisão B, Etapa 3).
 */
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { AppAttribution } from '@/service/marketing/marketing-app-data'
import { cutHint, fmtConversion, fmtInt, fmtSum, fmtWeeks } from './app-data-format'

const props = defineProps<{
  rankings: AppAttribution['rankings']
  weeks: AppAttribution['weeks']
  totals?: AppAttribution['totals']
}>()

/** As linhas que não são parceiro (só quando a semana trouxe a célula). */
const partnerSummary = computed(() => {
  const t = props.totals
  if (!t) return []
  return [
    { key: 'other', label: 'Outros parceiros', sub: 'Parceiro com menos de 5 cadastros na semana', value: t.partnersOther },
    { key: 'none', label: 'Sem indicação', sub: 'Cadastro que não veio por parceiro', value: t.partnersNone },
    {
      key: 'none-other',
      label: 'Sem indicação e outros',
      sub: 'Cadastros sem indicação ou parceiro com menos de 5 cadastros na semana',
      value: t.partnersNoneAndOther,
    },
  ].filter((s) => s.value.cells > 0)
})

type Tab = 'campaigns' | 'cards' | 'partners' | 'qrs'
const TABS: { key: Tab; label: string }[] = [
  { key: 'campaigns', label: 'Campanhas' },
  { key: 'cards', label: 'Posts' },
  { key: 'partners', label: 'Parceiros' },
  { key: 'qrs', label: 'QR' },
]
const tab = ref<Tab>('campaigns')
const rows = computed(() => props.rankings[tab.value] ?? [])

const MATCHED: Record<string, string> = {
  code: 'pelo código',
  name: 'pelo nome',
  utm: 'pelas UTMs',
}
</script>

<template>
  <section class="mk-panel adr" data-testid="app-rankings" aria-labelledby="adr-title">
    <header class="mk-panel__head adr__head">
      <div class="adr__title">
        <h3 id="adr-title">Quem trouxe os cadastros</h3>
        <span class="adr__weeks" data-testid="rankings-weeks">{{ fmtWeeks(weeks) }}</span>
      </div>
      <div class="adr__tabs" role="tablist" aria-label="Ranking">
        <button
          v-for="t in TABS"
          :key="t.key"
          type="button"
          role="tab"
          class="adr__tab"
          :class="{ 'is-active': tab === t.key }"
          :aria-selected="tab === t.key"
          :data-tab="t.key"
          @click="tab = t.key"
        >
          {{ t.label }} <span class="adr__count">{{ rankings[t.key].length }}</span>
        </button>
      </div>
    </header>

    <p v-if="tab === 'partners'" class="adr__note" data-testid="partners-weekly">
      Por semana fechada: o app manda o parceiro somado de segunda a domingo. Parceiro com menos de 5 cadastros na
      semana não sai com o nome, para ninguém ser reconhecido.
    </p>
    <p v-if="!rows.length && !(tab === 'partners' && partnerSummary.length)" class="adr__empty">
      <template v-if="tab === 'partners'">
        Nenhum cadastro por parceiro nas semanas fechadas do período. Ligue a UTM ao parceiro em "UTMs e QR" (de
        preferência apontando para o link de indicação dele, <code>/r/CODIGO</code>) para o cadastro contar para ele.
      </template>
      <template v-else>
        Nenhum cadastro com UTM ligada a {{ tab === 'qrs' ? 'QR' : tab === 'cards' ? 'post' : 'campanha' }} nas
        semanas fechadas do período.
      </template>
    </p>

    <table v-else-if="tab === 'partners'" class="mk-table adr__table" data-testid="ranking-partners">
      <thead>
        <tr>
          <th>Parceiro</th>
          <th class="mk-num hide-sm">Pelo código</th>
          <th class="mk-num hide-sm">Pelas UTMs</th>
          <th class="mk-num">Cadastros</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rankings.partners" :key="r.id" :data-partner="r.partnerId ?? r.code ?? ''">
          <td><div class="adr__name">
            <RouterLink v-if="r.partnerId" :to="{ name: 'marketing-partners', query: { parceiro: r.partnerId } }">{{ r.name }}</RouterLink>
            <span v-else>{{ r.name }}</span>
            <span class="adr__sub">
              <template v-if="r.code">código {{ r.code }}</template>
              <template v-if="!r.partnerId"> · sem parceiro no Nevo</template>
              <template v-else-if="r.matchedBy"> · ligado {{ MATCHED[r.matchedBy] }}</template>
            </span>
          </div></td>
          <td class="mk-num hide-sm" :title="cutHint(r.viaCode)">{{ r.viaCode.cells ? fmtSum(r.viaCode) : '-' }}</td>
          <td class="mk-num hide-sm" :title="cutHint(r.viaUtm)">{{ r.viaUtm.cells ? fmtSum(r.viaUtm) : '-' }}</td>
          <td class="mk-num adr__total" :title="cutHint(r.signups)">{{ fmtSum(r.signups) }}</td>
        </tr>
      </tbody>
      <tbody v-if="partnerSummary.length" class="adr__summary">
        <tr v-for="s in partnerSummary" :key="s.key" :data-testid="`partners-${s.key}`">
          <td><div class="adr__name">
            <span class="adr__muted">{{ s.label }}</span>
            <span class="adr__sub">{{ s.sub }}</span>
          </div></td>
          <td class="mk-num hide-sm adr__sub">-</td>
          <td class="mk-num hide-sm adr__sub">-</td>
          <td class="mk-num adr__total" :title="cutHint(s.value)">{{ fmtSum(s.value) }}</td>
        </tr>
      </tbody>
    </table>

    <table v-else class="mk-table adr__table" :data-testid="`ranking-${tab}`">
      <thead>
        <tr>
          <th>{{ tab === 'campaigns' ? 'Campanha' : tab === 'cards' ? 'Post' : 'QR (onde é usado)' }}</th>
          <th class="mk-num">Cliques</th>
          <th v-if="tab === 'qrs'" class="mk-num hide-sm">Leituras</th>
          <th class="mk-num">Cadastros</th>
          <th class="mk-num hide-sm">Conversão</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows as AppAttribution['rankings']['campaigns']" :key="r.id">
          <td><div class="adr__name">
            <RouterLink v-if="tab === 'campaigns'" :to="{ name: 'marketing-campaigns', query: { campanha: r.id } }">{{ r.name }}</RouterLink>
            <RouterLink v-else-if="tab === 'cards'" :to="{ name: 'marketing-card', params: { cardId: r.id } }">{{ r.name }}</RouterLink>
            <RouterLink v-else :to="{ name: 'marketing-utm', query: { utm: r.id } }">{{ r.name }}</RouterLink>
            <span v-if="r.shared" class="adr__sub" title="A mesma UTM também está em outro item: o app não sabe por qual link a pessoa veio">
              UTM compartilhada
            </span>
          </div></td>
          <td class="mk-num">{{ fmtInt(r.clicks) }}</td>
          <td v-if="tab === 'qrs'" class="mk-num hide-sm">{{ fmtInt(r.scans) }}</td>
          <td class="mk-num adr__total" :title="cutHint(r.signups)">{{ fmtSum(r.signups) }}</td>
          <td class="mk-num hide-sm">{{ fmtConversion(r.conversion) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.adr {
  min-width: 0;
}

.adr__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.adr__head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.adr__title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 8px;
  min-width: 0;
}

.adr__weeks {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.adr__note {
  margin: 0;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-2);
}

.adr__tabs {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-2);
}

.adr__tab {
  min-height: 28px;
  padding: 2px 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.adr__tab.is-active {
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.adr__tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.adr__count {
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.adr__empty {
  margin: 0;
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-3);
}

.adr__name {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.adr__name a {
  color: var(--text);
  text-decoration: none;
  overflow-wrap: anywhere;
}

.adr__name a:hover {
  text-decoration: underline;
}

.adr__sub {
  font-size: 12px;
  color: var(--text-3);
}

.adr__total {
  font-weight: 700;
}

.adr__summary tr:first-child td {
  border-top: 1px solid var(--border-strong);
}

.adr__muted {
  color: var(--text-2);
  font-weight: 600;
}

@media (max-width: 640px) {
  .hide-sm {
    display: none;
  }

  .adr__tab {
    min-height: 36px;
  }
}
</style>
