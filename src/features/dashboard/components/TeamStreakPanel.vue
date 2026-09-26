<script setup lang="ts">
/**
 * "Seu time hoje": a sequência de cada colega da empresa ativa, na home
 * (spec sequencia-diaria-nevo, T7). Cada um vê o do outro: quem já garantiu o
 * dia (chama acesa no avatar), nível, dias seguidos, a semana e os pontos.
 *
 * - Resumo: "3 de 5 garantiram o dia" (anel) e a sequência do TIME (dias em
 *   que todo mundo ativo garantiu; D13 da spec).
 * - Ranking por pontos da semana, na ordem que a API já devolve. Até 6
 *   linhas; se a pessoa logada ficou de fora, ela entra no lugar da 6ª com a
 *   posição real (ninguém some da própria lista). O resto fica a um clique,
 *   na aba Equipe do /time.
 * - Top 3 por pontos ganha medalha CHAPADA nos tons de metal do pódio (sem
 *   gradiente nem brilho); com 0 pontos não há pódio a mostrar.
 *
 * Privacidade: só o que a API expõe para colegas (D12). Nada de horas.
 *
 * Estados: carregando, erro compacto com "Tentar de novo", vazio (só você na
 * empresa: convite amigável) e sem rota na API ou sem empresa (não renderiza).
 * O layout responde à largura do PAINEL (container query): em uma coluna
 * estreita a semana desce para baixo do nome; com o painel na largura toda, a
 * lista vira duas colunas.
 */
import { computed } from 'vue'
import { ArrowRight, CircleAlert, RotateCcw, UserPlus, Users } from 'lucide-vue-next'
import CountUp from '@/components/ui/CountUp.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import NevoFlame from '@/components/nevo/NevoFlame.vue'
import NevoSprite from '@/components/nevo/NevoSprite.vue'
import StreakWeek from '@/components/nevo/StreakWeek.vue'
import { daysLabel, tierTone } from '@/components/nevo/nevo-assets'
import { useStreakTeam } from '@/composables/useStreak'
import type { StreakTeamMember } from '@/service/streak/streak-service'
import { avatarTone, initials } from '@/utils/avatar'
import { getUserToken } from '@/utils/authContent'

const { team, companyId, isLoading, isFetching, isError, available, refetch } = useStreakTeam()

/** Sem rota na API, ou sem empresa ativa (consulta desligada): some da home. */
const shown = computed(() => available.value && !!companyId.value)

const MAX_ROWS = 6

const members = computed<StreakTeamMember[]>(() => team.value?.members ?? [])
const total = computed(() => team.value?.summary.total ?? members.value.length)
const securedCount = computed(() => team.value?.summary.securedToday ?? 0)
const teamStreak = computed(() => team.value?.summary.teamStreak ?? 0)
const alone = computed(() => members.value.length <= 1)

/** Todo mundo de descanso hoje (fim de semana, feriado) e ninguém garantiu. */
const restDay = computed(
  () => members.value.length > 0 && members.value.every((m) => m.todayIsRest) && securedCount.value === 0,
)

const securedPct = computed(() => (total.value > 0 ? (securedCount.value / total.value) * 100 : 0))

interface Row {
  member: StreakTeamMember
  rank: number
  firstName: string
  tone: string
  tierColor: string
  initials: string
  medal: 1 | 2 | 3 | null
  /** A linha vem depois de um salto na posição (a sua, fora do top). */
  gapBefore: boolean
  todayText: string
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

function todayTextOf(m: StreakTeamMember): string {
  if (m.securedToday) return 'garantiu hoje'
  if (m.todayIsRest) return 'hoje é descanso'
  return 'ainda não garantiu hoje'
}

const rows = computed<Row[]>(() => {
  const ranked = members.value.map((member, i) => ({ member, rank: i + 1 }))
  let visible = ranked.slice(0, MAX_ROWS)
  if (!visible.some((r) => r.member.isMe)) {
    const mine = ranked.find((r) => r.member.isMe)
    if (mine) visible = [...ranked.slice(0, MAX_ROWS - 1), mine]
  }
  return visible.map(({ member, rank }, i) => {
    const prev = visible[i - 1]
    return {
      member,
      rank,
      firstName: firstNameOf(member.user.name),
      tone: avatarTone(member.user.name),
      tierColor: member.tier.key === 'none' ? 'var(--text-3)' : tierTone(member.tier.key),
      initials: initials(member.user.name),
      medal: rank <= 3 && member.points.week > 0 ? (rank as 1 | 2 | 3) : null,
      gapBefore: !!prev && rank - prev.rank > 1,
      todayText: todayTextOf(member),
    }
  })
})

const moreLabel = computed(() =>
  members.value.length > MAX_ROWS ? `Ver o time todo (${members.value.length} pessoas)` : 'Ver detalhes do time',
)

/**
 * Convite só para quem pode convidar (ADMIN da empresa ativa, pelo token).
 * O token pode estar velho, mas aqui só decide se o link aparece: quem manda
 * é o backend, e a tela de usuários já é restrita a ADMIN no router.
 */
const canInvite = computed(() => {
  const cid = companyId.value
  if (!cid) return false
  return getUserToken()?.companies?.some((c) => c.companyId === cid && c.role === 'ADMIN') ?? false
})

const summaryText = computed(() => {
  const n = securedCount.value
  return `${n} de ${total.value} ${n === 1 ? 'garantiu' : 'garantiram'} o dia`
})
</script>

<template>
  <section v-if="shown" v-reveal="3" class="bento-cell tsp" aria-labelledby="tsp-title">
    <header class="tsp-head">
      <span class="tsp-head-icon" aria-hidden="true"><Users :size="16" /></span>
      <div class="tsp-head-copy">
        <h2 id="tsp-title" class="tsp-title">Seu time hoje</h2>
        <p class="tsp-sub">Quem já garantiu o dia e os pontos da semana</p>
      </div>
    </header>

    <!-- ─── Carregando ─────────────────────────────────────────────────────── -->
    <div v-if="isLoading" class="tsp-skel" aria-busy="true">
      <p class="sr-only">Carregando o time.</p>
      <div class="tsp-summary" aria-hidden="true">
        <div v-for="i in 2" :key="i" class="skel" style="height: 76px"><Skeleton type="block" height="100%" /></div>
      </div>
      <div class="tsp-skel-rows" aria-hidden="true">
        <div v-for="i in 5" :key="i" class="tsp-skel-row">
          <div class="skel skel--round" style="width: 40px; height: 40px"><Skeleton type="block" height="100%" /></div>
          <div class="tsp-skel-lines">
            <Skeleton type="text" :lines="2" height="12px" />
          </div>
        </div>
      </div>
    </div>

    <!-- ─── Erro sem nada em cache ─────────────────────────────────────────── -->
    <div v-else-if="isError && !team" class="dash-inline-error" role="status">
      <CircleAlert :size="18" aria-hidden="true" />
      <p>Não foi possível carregar o time.</p>
      <button class="ghost-btn press" type="button" :disabled="isFetching" @click="refetch()">
        <RotateCcw :size="14" aria-hidden="true" />
        {{ isFetching ? 'Tentando...' : 'Tentar de novo' }}
      </button>
    </div>

    <template v-else-if="team">
      <!-- ─── Resumo do dia (sozinho, "0 de 1" só faria ruído ao lado do convite) -->
      <div v-if="!alone" class="tsp-summary">
        <div class="tsp-stat">
          <ProgressRing :value="securedPct" :size="52" :stroke="5" :aria-label="summaryText">
            <span class="tsp-ring-text" aria-hidden="true">{{ securedCount }}/{{ total }}</span>
          </ProgressRing>
          <p class="tsp-stat-copy">
            <template v-if="restDay">
              <strong>Dia de descanso</strong>
              <span>Ninguém precisa garantir hoje</span>
            </template>
            <template v-else>
              <strong>{{ securedCount }} de {{ total }}</strong>
              <span>{{ securedCount === 1 ? 'garantiu' : 'garantiram' }} o dia</span>
            </template>
          </p>
        </div>

        <div class="tsp-stat" :class="{ 'is-on': teamStreak > 0 }">
          <span class="tsp-stat-flame" aria-hidden="true">
            <NevoFlame :live="teamStreak > 0" :lit="teamStreak > 0" :size="40" />
          </span>
          <p class="tsp-stat-copy">
            <template v-if="teamStreak > 0">
              <strong>{{ daysLabel(teamStreak) }}</strong>
              <span>Time em chamas</span>
            </template>
            <template v-else>
              <strong>Sequência do time</strong>
              <span>Acende quando todo mundo garante o dia</span>
            </template>
          </p>
        </div>
      </div>

      <!-- ─── Ranking ──────────────────────────────────────────────────────── -->
      <ol class="tsp-list" aria-label="Ranking de pontos da semana">
        <template v-for="row in rows" :key="row.member.user.id">
          <li v-if="row.gapBefore" class="tsp-gap" aria-hidden="true"><span /></li>
          <li class="tsp-row" :class="{ 'is-me': row.member.isMe }">
            <span class="tsp-pos">
              <span class="sr-only">{{ row.rank }}º lugar:</span>
              <span
                v-if="row.medal"
                class="tsp-medal"
                :class="`tsp-medal--${row.medal}`"
                aria-hidden="true"
              >{{ row.rank }}</span>
              <span v-else class="tsp-rank" aria-hidden="true">{{ row.rank }}</span>
            </span>

            <span class="tsp-avatar" :style="{ '--pc': row.tone }" aria-hidden="true">
              {{ row.initials }}
              <span class="tsp-avatar-flame">
                <NevoFlame :lit="row.member.securedToday" :size="14" />
              </span>
            </span>

            <div class="tsp-body">
              <p class="tsp-name">
                <span class="tsp-name-text" :title="row.member.user.name">{{ row.member.user.name }}</span>
                <span v-if="row.member.isMe" class="tsp-you">Você</span>
              </p>
              <p class="tsp-meta">
                <span class="tsp-tier" :style="{ color: row.tierColor }">{{ row.member.tier.label }}</span>
                <span aria-hidden="true">·</span>
                <span>{{ daysLabel(row.member.current) }}</span>
                <span class="sr-only">seguidos, {{ row.todayText }}.</span>
              </p>
            </div>

            <div class="tsp-side">
              <p class="tsp-points">
                <strong><CountUp :value="row.member.points.week" /></strong>
                <span>{{ row.member.points.week === 1 ? 'ponto' : 'pontos' }}</span>
              </p>
              <StreakWeek
                class="tsp-week"
                size="sm"
                :days="row.member.week"
                :aria-label="`Semana de ${row.firstName}`"
              />
            </div>
          </li>
        </template>
      </ol>

      <!-- ─── Só você na empresa ───────────────────────────────────────────── -->
      <div v-if="alone" class="tsp-empty">
        <NevoSprite class="tsp-empty-nevo" pose="dando-dica" motion="idle" :size="72" />
        <div class="tsp-empty-copy">
          <p class="tsp-empty-title">Por enquanto é só você por aqui</p>
          <p class="tsp-empty-text">
            Quando o time entrar, cada pessoa aparece aqui com a própria chama, a semana e os pontos.
          </p>
          <RouterLink v-if="canInvite" class="ghost-btn press tsp-invite" to="/company-users">
            <UserPlus :size="15" aria-hidden="true" />
            Convidar pessoas
          </RouterLink>
        </div>
      </div>

      <RouterLink
        v-else
        class="tsp-more press"
        :to="{ path: '/time', query: { tab: 'team' } }"
      >
        {{ moreLabel }}
        <ArrowRight :size="15" aria-hidden="true" />
      </RouterLink>
    </template>
  </section>
</template>

<style scoped>
@import './dashboard-shared.css';

.tsp {
  container: tsp / inline-size;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px 20px 16px;
  min-width: 0;
}

/* ─── Cabeçalho ──────────────────────────────────────────────────────────── */
.tsp-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tsp-head-icon {
  flex: none;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-2);
}

.tsp-head-copy {
  min-width: 0;
}

.tsp-title {
  margin: 0;
  font-size: var(--text-body-large);
  font-weight: 700;
  color: var(--text);
}

.tsp-sub {
  margin: 2px 0 0;
  font-size: 0.8125rem;
  color: var(--text-3);
}

/* ─── Resumo ─────────────────────────────────────────────────────────────── */
.tsp-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(190px, 100%), 1fr));
  gap: 10px;
}

.tsp-stat {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
}

/* Time em chamas: tinta chapada da chama, como o "hoje pendente" da semana. */
.tsp-stat.is-on {
  border-color: color-mix(in srgb, var(--streak-flame) 35%, var(--border));
  background: color-mix(in srgb, var(--streak-flame) 8%, var(--surface-2));
}

.tsp-stat-flame {
  flex: none;
  width: 52px;
  display: inline-flex;
  justify-content: center;
}

.tsp-ring-text {
  font-size: 0.75rem;
  font-weight: 750;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.tsp-stat-copy {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 0.8125rem;
  line-height: 1.3;
  color: var(--text-3);
}

.tsp-stat-copy strong {
  font-size: var(--text-body-large);
  font-weight: 750;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

/* ─── Lista ──────────────────────────────────────────────────────────────── */
.tsp-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/*
 * Linha: posição | avatar | nome e nível | pontos e semana. No estreito a
 * coluna da direita desce para baixo do nome (ver container query).
 */
.tsp-row {
  display: grid;
  grid-template-columns: 30px 40px minmax(0, 1fr) auto;
  grid-template-areas: 'pos av body side';
  align-items: center;
  gap: 4px 12px;
  min-height: 60px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
}

/* Você: tinta leve do acento e hairline, sem faixa lateral. */
.tsp-row.is-me {
  border-color: color-mix(in srgb, var(--accent) 32%, var(--border));
  background: color-mix(in srgb, var(--accent) 7%, transparent);
}

.tsp-gap {
  display: flex;
  justify-content: center;
  padding: 2px 0;
}

.tsp-gap span {
  width: 36px;
  border-top: 2px dotted var(--border-strong);
}

.tsp-pos {
  grid-area: pos;
  display: inline-flex;
  justify-content: center;
}

.tsp-rank {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

/* Medalha chapada: corpo do metal, contorno no tom escuro do mesmo metal e
   número na tinta da marca (contraste AA nos três metais). */
.tsp-medal {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 0.8125rem;
  font-weight: 800;
  color: var(--brand-ink);
  font-variant-numeric: tabular-nums;
}

.tsp-medal--1 {
  background: var(--metal-gold);
  border: 1.5px solid var(--metal-gold-lo);
}

.tsp-medal--2 {
  background: var(--metal-silver);
  border: 1.5px solid var(--metal-silver-lo);
}

.tsp-medal--3 {
  background: var(--metal-bronze);
  border: 1.5px solid var(--metal-bronze-lo);
}

/* Avatar de iniciais no padrão da Equipe (tom estável por pessoa). */
.tsp-avatar {
  grid-area: av;
  position: relative;
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--pc) 32%, transparent);
  background: color-mix(in srgb, var(--pc) 16%, var(--surface));
  color: color-mix(in srgb, var(--pc) 64%, var(--text));
  font-size: 0.8125rem;
  font-weight: 750;
}

/* Mini chama no canto: acesa = garantiu hoje. Selo com a cor da superfície
   em volta para a chama não se misturar ao avatar. */
.tsp-avatar-flame {
  position: absolute;
  right: -5px;
  bottom: -4px;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--border);
}

.tsp-body {
  grid-area: body;
  min-width: 0;
}

.tsp-name {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.tsp-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.9375rem;
  font-weight: 650;
  color: var(--text);
}

.tsp-you {
  flex: none;
  padding: 1px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--text);
  font-size: 0.75rem;
  font-weight: 700;
}

.tsp-meta {
  margin: 2px 0 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0 6px;
  font-size: 0.8125rem;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.tsp-tier {
  font-weight: 700;
}

.tsp-side {
  grid-area: side;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.tsp-points {
  margin: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-size: 0.75rem;
  color: var(--text-3);
}

.tsp-points strong {
  font-size: var(--text-body-large);
  font-weight: 750;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

/* ─── Vazio (só você) ────────────────────────────────────────────────────── */
.tsp-empty {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
}

.tsp-empty-nevo {
  flex: none;
}

.tsp-empty-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}

.tsp-empty-title {
  margin: 0;
  font-size: var(--text-body-large);
  font-weight: 700;
  color: var(--text);
}

.tsp-empty-text {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--text-3);
}

.tsp-invite {
  margin-top: 4px;
  text-decoration: none;
}

/* ─── Rodapé ─────────────────────────────────────────────────────────────── */
.tsp-more {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 4px;
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-size: 0.875rem;
  font-weight: 650;
  text-decoration: none;
  transition: color var(--motion-fast) var(--motion-ease);
}

.tsp-more:hover {
  color: var(--text);
}

/* ─── Esqueleto ──────────────────────────────────────────────────────────── */
.tsp-skel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tsp-skel-rows {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tsp-skel-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tsp-skel-lines {
  flex: 1;
}

.skel {
  overflow: hidden;
  border-radius: var(--radius);
}

.skel--round {
  flex: none;
  border-radius: 50%;
}

/* ─── Largura do painel ──────────────────────────────────────────────────── */

/* Estreito: pontos e semana descem para baixo do nome. */
@container tsp (max-width: 419px) {
  .tsp-row {
    grid-template-columns: 26px 40px minmax(0, 1fr);
    grid-template-areas:
      'pos av body'
      'pos av side';
  }

  .tsp-side {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 6px 12px;
  }
}

/* Muito estreito: a semana em miniatura não cabe; a sequência já está no texto. */
@container tsp (max-width: 279px) {
  .tsp-week {
    display: none;
  }

  .tsp-empty {
    flex-direction: column;
    align-items: flex-start;
  }
}

/* Painel na largura toda (sem vitrine ao lado): duas colunas de pessoas. */
@container tsp (min-width: 820px) {
  .tsp-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px 16px;
  }

  .tsp-gap {
    grid-column: 1 / -1;
  }
}
</style>
