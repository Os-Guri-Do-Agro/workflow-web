<script setup lang="ts">
/**
 * "Sua sequência": o primeiro módulo da home (spec sequencia-diaria-nevo, T7).
 *
 * É a peça que puxa a pessoa de volta todo dia, no espírito do Duolingo: o
 * número grande de dias seguidos com a chama, o Nevo reagindo ao humor do dia
 * num palco próprio (com balão de fala), a semana, as 3 missões, e embaixo a
 * evolução do mascote e os marcos.
 *
 * Layout por CONTAINER query, não por viewport: a largura útil depende do
 * shell (sidebar de 248px no Command, trilho no Focus, nada no Canvas), então
 * o mesmo viewport dá larguras bem diferentes para este módulo.
 * - largo (>= 700px): duas colunas, texto à esquerda e palco do Nevo à direita;
 *   missões e rodapé ocupam a largura toda.
 * - estreito (300 a 699px, celular incluso): o Nevo pequeno ao lado do
 *   número, o resto empilha.
 * - mínimo (< 300px): uma coluna só, sem palco.
 *
 * Estados: carregando (esqueleto com a mesma geometria), erro (linha compacta
 * com "Tentar de novo"), sem rota na API (não renderiza: a home volta a ser
 * como era antes da sequência).
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useElementSize } from '@vueuse/core'
import {
  CircleAlert,
  CircleCheck,
  Flag,
  MessageCircle,
  Play,
  RotateCcw,
  Sparkles,
  Timer,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-vue-next'
import CountUp from '@/components/ui/CountUp.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import NevoFlame from '@/components/nevo/NevoFlame.vue'
import NevoSprite from '@/components/nevo/NevoSprite.vue'
import StreakWeek from '@/components/nevo/StreakWeek.vue'
import StreakMissions from '@/components/nevo/StreakMissions.vue'
import TierTrack from '@/components/nevo/TierTrack.vue'
import MilestoneTrack from '@/components/nevo/MilestoneTrack.vue'
import { useStreak } from '@/composables/useStreak'
import {
  NEVO_MILESTONES,
  daysLabel,
  milestoneTone,
  moodFor,
  remainingLabel,
  tierOf,
  tierTone,
  type NevoMood,
  type NevoMoodKey,
  type NevoSpriteName,
} from '@/components/nevo/nevo-assets'

const router = useRouter()
const { streak, isLoading, isFetching, isError, available, refetch, mood: baseMood } = useStreak()

// ─── Largura do módulo (tamanho do Nevo e da chama) ──────────────────────────
// O layout em si é CSS (container query); aqui só o que é prop numérica. Os
// cortes batem com os do CSS, medidos no mesmo elemento (content-box).
const root = ref<HTMLElement | null>(null)
// Antes da primeira medida a largura é 0: assumir o largo evita o Nevo nascer
// pequeno e crescer num piscar em monitor comum, que é o caso mais frequente.
const { width } = useElementSize(root, { width: 1200, height: 0 })

const layout = computed<'wide' | 'narrow' | 'tiny'>(() => {
  if (width.value >= 700) return 'wide'
  if (width.value >= 300) return 'narrow'
  return 'tiny'
})
// No largo, o palco não pode ficar mais alto que a coluna de texto ao lado
// (número + humor + semana, ~350px): a sobra vira um vão embaixo da semana.
// 180px de Nevo é o que cabe com balão e próximo marco sem passar dela.
const spriteSize = computed(() =>
  layout.value === 'wide' ? (width.value >= 980 ? 180 : 160) : 104,
)
const flameSize = computed(() => (layout.value === 'wide' ? 84 : 56))
/** Disco chapado atrás do Nevo, proporcional a ele (não à largura do palco). */
const discSize = computed(() => Math.round(spriteSize.value * 1.22))

// ─── Humor ────────────────────────────────────────────────────────────────────
/** Até quantos dias depois da quebra o Nevo ainda fala dela ("Ops... que pena"). */
const BROKEN_RECENT_DAYS = 7

function daysBetween(from: string, to: string): number {
  // Meio-dia local nas duas pontas: horário de verão não empurra a conta.
  const a = new Date(`${from}T12:00:00`).getTime()
  const b = new Date(`${to}T12:00:00`).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

/**
 * O humor base vem do `useStreak`. Aqui só um ajuste: sequência que quebrou há
 * muito tempo não é mais notícia. Depois de uma semana o Nevo para de lamentar
 * e volta a convidar como se fosse o começo (spec: "broken" só se recente).
 */
const mood = computed<NevoMood>(() => {
  const s = streak.value
  const m = baseMood.value
  if (m.key !== 'broken' || !s?.brokenOn) return m
  if (daysBetween(s.brokenOn, s.date) <= BROKEN_RECENT_DAYS) return m
  return moodFor({ ...s, previous: 0, brokenOn: null })
})

/** Fala curta do Nevo no balão (primeira pessoa, sem repetir o título). */
const SPEECH: Record<NevoMoodKey, string> = {
  perfect: 'Cumpriu tudo hoje. Que orgulho!',
  secured: 'Chama acesa! Mandou bem.',
  rest: 'Zzz... hoje é folga.',
  'at-risk': 'Ainda dá tempo, vamos juntos?',
  pending: 'Estou pronto quando você estiver!',
  broken: 'Recomeça comigo hoje?',
  fresh: 'Oi! Eu sou o Nevo.',
  loading: 'Passando um café...',
}
const speech = computed(() => SPEECH[mood.value.key])

/**
 * Próximo passo claro em todo estado que pede ação. Quebrou: "Retomar hoje";
 * nunca começou: "Começar agora" (as duas primárias). Pendente: atalho
 * secundário para o cronômetro. Garantido ou descanso: nada a fazer.
 */
const cta = computed<{ label: string; primary: boolean; icon: LucideIcon } | null>(() => {
  switch (mood.value.key) {
    case 'broken':
      return { label: 'Retomar hoje', primary: true, icon: Play }
    case 'fresh':
      return { label: 'Começar agora', primary: true, icon: Play }
    case 'pending':
    case 'at-risk':
      return { label: 'Abrir o cronômetro', primary: false, icon: Timer }
    default:
      return null
  }
})

function goTime() {
  void router.push('/time')
}

/** "45 min", "1h", "1h35" (foco do dia, sem segundos). */
function focusLabel(sec: number): string {
  const min = Math.floor(Math.max(0, sec) / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const rest = min % 60
  return rest ? `${h}h${String(rest).padStart(2, '0')}` : `${h}h`
}

/**
 * Resumo do que a pessoa já fez hoje, quando não há ação a pedir (dia
 * garantido, perfeito ou descanso). É a recompensa lida em números, e ocupa o
 * lugar do botão para a coluna não ficar com um vão.
 */
const todayRecap = computed(() => {
  if (cta.value) return null
  const s = streak.value
  const today = s?.week.find((d) => d.isToday) ?? s?.recent[s.recent.length - 1]
  if (!today) return null
  const items: { key: string; text: string }[] = []
  if (today.focusSec >= 60) items.push({ key: 'focus', text: `${focusLabel(today.focusSec)} de foco` })
  if (today.tasksDone > 0) {
    items.push({ key: 'task', text: `${today.tasksDone} ${today.tasksDone === 1 ? 'tarefa concluída' : 'tarefas concluídas'}` })
  }
  if (today.collab > 0) {
    items.push({ key: 'collab', text: `${today.collab} ${today.collab === 1 ? 'ação no time' : 'ações no time'}` })
  }
  return items.length ? items : null
})

// ─── Números e selos ─────────────────────────────────────────────────────────
const current = computed(() => streak.value?.current ?? 0)
const unit = computed(() => (current.value === 1 ? 'dia seguido' : 'dias seguidos'))

const tierKey = computed(() => streak.value?.tier.key ?? 'none')
const tone = computed(() => tierTone(tierKey.value))
const tierFlame = computed<NevoSpriteName>(() => tierOf(tierKey.value)?.flame ?? 'fogo-normal')

/**
 * Nível Lendário: a chama dourada (`fogo-aura`) atrás do Nevo, como no mock
 * ("31+ dias", o Nevo dentro do fogo). É o próprio render com o sombreamento
 * dele; nada de brilho em CSS. Maior que o Nevo para a chama aparecer em volta
 * da cabeça e dos ombros, e não só como uma ponta atrás dele.
 */
const legendary = computed(() => tierKey.value === 'lendario')
// No estreito o Nevo mora colado no topo do módulo: com 1.3x a ponta da chama
// batia na borda (o módulo recorta com `overflow: clip`).
const auraSize = computed(() =>
  Math.round(spriteSize.value * (layout.value === 'wide' ? 1.3 : 1.15)),
)

const securedThisWeek = computed(() => streak.value?.week.filter((d) => d.secured).length ?? 0)
const missionsDone = computed(() => streak.value?.missions.filter((m) => m.done).length ?? 0)
const missionsTotal = computed(() => streak.value?.missions.length ?? 3)

/** Próximo marco com a chama-cristal dele e o progresso até lá (0 a 100). */
const nextMilestone = computed(() => {
  const s = streak.value
  const next = s?.nextMilestone
  if (!s || !next) return null
  const meta = NEVO_MILESTONES.find((m) => m.days === next.days)
  return {
    label: next.label,
    text: `${remainingLabel(next.remaining)} para ${next.label}`,
    pct: Math.max(0, Math.min(100, (s.current / next.days) * 100)),
    flame: meta?.flame ?? ('seq-basico' as NevoSpriteName),
    tone: meta ? milestoneTone(meta.key) : 'var(--streak-flame)',
  }
})

const reachedMilestones = computed(() => streak.value?.milestones.filter((m) => m.reached).length ?? 0)

const POINTS_HELP =
  'Pontos da semana: tarefa concluída +10, foco +1 a cada 3 minutos, colaboração +3, dia garantido +15 e dia perfeito +10.'

// ─── "+1" quando a sequência sobe com a tela aberta ──────────────────────────
// Micro-comemoração local (a grande é o StreakCelebration do shell). Só quando
// o número SOBE depois do primeiro carregamento, nunca na chegada da página.
const bump = ref(0)
watch(
  () => streak.value?.current,
  (now, before) => {
    // `before` indefinido = primeira chegada dos dados (ou cache ao voltar
    // para a home): não é "subiu agora", é só a página abrindo.
    if (now === undefined || before === undefined) return
    if (now > before) bump.value++
  },
)

// ─── Evolução e marcos (abas) ────────────────────────────────────────────────
// As duas trilhas lado a lado pediriam ~1.530px de faixa (5 cartões de 148px
// + 5 de 132px); a home tem no máximo 1.424px de conteúdo. Lado a lado, as duas
// ficariam SEMPRE cortadas com rolagem horizontal. Em abas, cada uma abre na
// largura toda, sem rolar, e as duas continuam a um clique.
type TrackTab = 'tiers' | 'milestones'
const tab = ref<TrackTab>('tiers')
const TABS: readonly TrackTab[] = ['tiers', 'milestones']
const tabRefs = ref<Record<TrackTab, HTMLButtonElement | null>>({ tiers: null, milestones: null })

function setTabRef(key: TrackTab, el: unknown) {
  tabRefs.value[key] = el instanceof HTMLButtonElement ? el : null
}

/** Setas trocam de aba e levam o foco junto (padrão ARIA de tabs). */
function onTabKey(e: KeyboardEvent) {
  const idx = TABS.indexOf(tab.value)
  let next: number | null = null
  if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length
  else if (e.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = TABS.length - 1
  if (next === null) return
  e.preventDefault()
  const key = TABS[next]!
  tab.value = key
  tabRefs.value[key]?.focus()
}
</script>

<template>
  <section
    v-if="available"
    id="sequencia"
    ref="root"
    v-reveal="1"
    class="bento-cell sh"
    :class="[`sh--${layout}`, { 'is-loading': isLoading, 'is-error': isError && !streak }]"
    :style="{ '--sh-tone': tone }"
    aria-label="Sua sequência"
    :aria-busy="isLoading ? 'true' : undefined"
  >
    <!-- ─── Carregando: mesma geometria do módulo pronto ─────────────────── -->
    <template v-if="isLoading">
      <p class="sr-only">Carregando sua sequência.</p>
      <div class="sh-grid" aria-hidden="true">
        <div class="sh-count">
          <div class="skel skel--round" :style="{ width: `${flameSize}px`, height: `${flameSize}px` }">
            <Skeleton type="block" height="100%" />
          </div>
          <div class="skel" style="width: 180px; height: 56px"><Skeleton type="block" height="100%" /></div>
        </div>
        <div class="sh-mood">
          <Skeleton type="text" :lines="2" height="14px" />
        </div>
        <div class="sh-week sh-panel">
          <div class="skel" style="height: 72px"><Skeleton type="block" height="100%" /></div>
        </div>
        <div v-if="layout !== 'tiny'" class="sh-stage">
          <div class="skel skel--stage"><Skeleton type="block" height="100%" /></div>
        </div>
        <div class="sh-journey">
          <div class="skel-cards">
            <div v-for="i in 3" :key="i" class="skel" style="height: 76px"><Skeleton type="block" height="100%" /></div>
          </div>
        </div>
      </div>
      <div class="sh-tracks" aria-hidden="true">
        <div class="skel" style="height: 220px"><Skeleton type="block" height="100%" /></div>
      </div>
    </template>

    <!-- ─── Erro de verdade (5xx, rede) sem nada em cache ─────────────────── -->
    <div v-else-if="isError && !streak" class="dash-inline-error" role="status">
      <CircleAlert :size="18" aria-hidden="true" />
      <p>Não foi possível carregar sua sequência.</p>
      <button class="ghost-btn press" type="button" :disabled="isFetching" @click="refetch()">
        <RotateCcw :size="14" aria-hidden="true" />
        {{ isFetching ? 'Tentando...' : 'Tentar de novo' }}
      </button>
    </div>

    <!-- ─── Pronto ─────────────────────────────────────────────────────────── -->
    <template v-else-if="streak">
      <div class="sh-grid">
        <!-- Número grande: chama + dias seguidos + nível -->
        <div class="sh-count">
          <NevoFlame class="sh-flame" live :lit="streak.securedToday" :size="flameSize" />
          <p class="sh-number">
            <span class="sr-only">{{ current }} {{ unit }}</span>
            <span class="sh-number-value" aria-hidden="true">
              <CountUp :value="current" :duration="0.9" />
              <span v-if="bump" :key="bump" class="sh-bump">+1</span>
            </span>
            <span class="sh-unit" aria-hidden="true">{{ unit }}</span>
          </p>
          <div class="sh-tier">
            <span class="sh-tier-eyebrow">Nível do Nevo</span>
            <span class="sh-tier-pill" :class="{ 'is-none': tierKey === 'none' }">
              <NevoFlame :sprite="tierFlame" :lit="tierKey !== 'none'" :size="18" />
              {{ streak.tier.label }}
            </span>
          </div>
        </div>

        <!-- Humor do dia -->
        <div class="sh-mood">
          <h2 class="sh-title">{{ mood.title }}</h2>
          <p class="sh-msg">{{ mood.message }}</p>
          <div v-if="cta" class="sh-cta">
            <button
              v-if="cta.primary"
              class="dash-btn-primary press"
              type="button"
              @click="goTime"
            >
              <component :is="cta.icon" :size="16" aria-hidden="true" />
              {{ cta.label }}
            </button>
            <button v-else class="ghost-btn press" type="button" @click="goTime">
              <component :is="cta.icon" :size="15" aria-hidden="true" />
              {{ cta.label }}
            </button>
          </div>
          <ul v-else-if="todayRecap" class="sh-recap" aria-label="O que você fez hoje">
            <li v-for="item in todayRecap" :key="item.key" class="sh-recap-item">
              <Timer v-if="item.key === 'focus'" :size="14" aria-hidden="true" />
              <CircleCheck v-else-if="item.key === 'task'" :size="14" aria-hidden="true" />
              <MessageCircle v-else :size="14" aria-hidden="true" />
              {{ item.text }}
            </li>
          </ul>
        </div>

        <!-- Semana -->
        <div class="sh-week sh-panel">
          <div class="sh-row-head">
            <h3 class="sh-h3">Esta semana</h3>
            <span class="sh-meta">
              {{ securedThisWeek }} {{ securedThisWeek === 1 ? 'dia garantido' : 'dias garantidos' }}
            </span>
          </div>
          <StreakWeek :days="streak.week" size="md" aria-label="Sua semana, de segunda a domingo" />
        </div>

        <!-- Palco do Nevo -->
        <div v-if="layout !== 'tiny'" class="sh-stage">
          <p v-if="layout === 'wide'" :key="`speech-${mood.key}`" class="sh-bubble" aria-hidden="true">
            {{ speech }}
          </p>
          <div class="sh-actor" :style="{ '--sh-disc': `${discSize}px` }">
            <span class="sh-disc" aria-hidden="true" />
            <span v-if="legendary" class="sh-aura" aria-hidden="true">
              <NevoFlame sprite="fogo-aura" :size="auraSize" />
            </span>
            <NevoSprite
              :key="`nevo-${mood.key}`"
              class="sh-nevo"
              :pose="mood.pose"
              :motion="mood.motion"
              :size="spriteSize"
              floor
            />
          </div>
          <div v-if="layout === 'wide'" class="sh-next" :style="{ '--sh-next-tone': nextMilestone?.tone }">
            <ProgressRing
              :value="nextMilestone ? nextMilestone.pct : 100"
              :size="48"
              :stroke="4"
              aria-hidden="true"
            >
              <NevoFlame :sprite="nextMilestone?.flame ?? 'seq-lendario'" :size="24" />
            </ProgressRing>
            <p class="sh-next-text">
              <span class="sh-next-eyebrow">Próximo marco</span>
              <strong v-if="nextMilestone">{{ nextMilestone.text }}</strong>
              <strong v-else>Todos os marcos conquistados!</strong>
            </p>
          </div>
        </div>

        <!-- Sua jornada (missões do dia) -->
        <div class="sh-journey">
          <div class="sh-row-head">
            <h3 class="sh-h3">Sua jornada</h3>
            <span class="sh-chip" :class="{ 'is-perfect': streak.perfectToday }">
              {{ streak.perfectToday ? 'Dia perfeito!' : `${missionsDone} de ${missionsTotal} missões` }}
            </span>
            <span class="sh-meta sh-rule">
              30 min de foco ou 1 tarefa concluída garantem o dia. As 3 missões juntas fazem um dia perfeito.
            </span>
          </div>
          <StreakMissions :missions="streak.missions" variant="cards" />
        </div>

        <!-- Rodapé: recorde e pontos -->
        <dl class="sh-foot">
          <div class="sh-stat">
            <Trophy :size="16" class="sh-stat-icon" aria-hidden="true" />
            <dt>Recorde</dt>
            <dd>{{ daysLabel(streak.best) }}</dd>
          </div>
          <div class="sh-stat" :title="POINTS_HELP">
            <Sparkles :size="16" class="sh-stat-icon" aria-hidden="true" />
            <dt>Pontos da semana</dt>
            <dd><CountUp :value="streak.points.week" /></dd>
          </div>
          <div class="sh-stat">
            <TrendingUp :size="16" class="sh-stat-icon" aria-hidden="true" />
            <dt>Hoje</dt>
            <dd>+{{ streak.points.today }} {{ streak.points.today === 1 ? 'ponto' : 'pontos' }}</dd>
          </div>
          <!-- No largo o próximo marco mora no palco; no estreito, aqui. -->
          <div v-if="layout !== 'wide'" class="sh-stat">
            <Flag :size="16" class="sh-stat-icon" aria-hidden="true" />
            <dt>Próximo marco</dt>
            <dd>{{ nextMilestone ? nextMilestone.text : 'Todos conquistados' }}</dd>
          </div>
        </dl>
      </div>

      <!-- ─── Evolução do Nevo e marcos ───────────────────────────────────── -->
      <div class="sh-tracks">
        <div class="sh-tabs" role="tablist" aria-label="Evolução do Nevo e marcos de sequência">
          <button
            :ref="(el) => setTabRef('tiers', el)"
            id="sh-tab-tiers"
            class="sh-tab"
            :class="{ 'is-active': tab === 'tiers' }"
            type="button"
            role="tab"
            :aria-selected="tab === 'tiers'"
            aria-controls="sh-panel-tracks"
            :tabindex="tab === 'tiers' ? 0 : -1"
            @click="tab = 'tiers'"
            @keydown="onTabKey"
          >
            Evolução do Nevo
            <span class="sh-tab-meta">{{ streak.tier.label }}</span>
          </button>
          <button
            :ref="(el) => setTabRef('milestones', el)"
            id="sh-tab-milestones"
            class="sh-tab"
            :class="{ 'is-active': tab === 'milestones' }"
            type="button"
            role="tab"
            :aria-selected="tab === 'milestones'"
            aria-controls="sh-panel-tracks"
            :tabindex="tab === 'milestones' ? 0 : -1"
            @click="tab = 'milestones'"
            @keydown="onTabKey"
          >
            Marcos de sequência
            <span class="sh-tab-meta">{{ reachedMilestones }} de {{ streak.milestones.length || 5 }}</span>
          </button>
        </div>

        <div
          id="sh-panel-tracks"
          class="sh-track-panel"
          role="tabpanel"
          :aria-labelledby="tab === 'tiers' ? 'sh-tab-tiers' : 'sh-tab-milestones'"
        >
          <Transition name="sh-swap" mode="out-in">
            <TierTrack v-if="tab === 'tiers'" key="tiers" :current="streak.current" :tier-key="streak.tier.key" />
            <MilestoneTrack
              v-else
              key="milestones"
              :milestones="streak.milestones"
              :current="streak.current"
              :best="streak.best"
            />
          </Transition>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
@import './dashboard-shared.css';

/*
 * O módulo é um container: todo o layout abaixo responde à largura DELE (ver
 * o comentário do script). `overflow: clip` e não `hidden`: o selo "Você está
 * aqui" da trilha e o pulo do Nevo saem um pouco da própria caixa e não podem
 * virar barra de rolagem.
 */
/*
 * Padding igual em todas as larguras de propósito: os cortes de layout medem
 * a caixa de conteúdo, e um padding que mudasse com o layout mudaria a própria
 * medida (na fronteira, o módulo ficaria alternando entre dois layouts).
 */
.sh {
  container: sh / inline-size;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 22px 20px 20px;
  overflow: clip;
}

.sh.is-error {
  gap: 0;
  padding: 14px 18px;
}

/* ─── Grade principal ────────────────────────────────────────────────────── */
/* Mínimo (< 300px): uma coluna só, sem palco. */
.sh-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    'count'
    'mood'
    'week'
    'jour'
    'foot';
  gap: 18px;
}

.sh-count {
  grid-area: count;
}
.sh-mood {
  grid-area: mood;
}
.sh-week {
  grid-area: week;
}
.sh-stage {
  grid-area: stage;
}
.sh-journey {
  grid-area: jour;
}
.sh-foot {
  grid-area: foot;
}

/* Estreito: o Nevo pequeno do lado do número, como no card do celular. */
@container sh (min-width: 300px) {
  .sh-grid {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'count stage'
      'mood  mood'
      'week  week'
      'jour  jour'
      'foot  foot';
  }
}

/*
 * Largo: texto à esquerda, palco à direita ocupando as três primeiras linhas.
 * A coluna da esquerda flui do topo, sem vão entre o botão e a semana: o palco
 * foi dimensionado para caber na altura dela (Nevo de 180px, balão e próximo
 * marco enxutos). Se num estado o palco ainda passar, a linha da semana (`1fr`)
 * absorve a diferença EMBAIXO da semana, ao lado do fim do palco, e não no
 * meio do texto.
 */
@container sh (min-width: 700px) {
  .sh-grid {
    grid-template-columns: minmax(0, 7fr) minmax(260px, 5fr);
    grid-template-rows: auto auto 1fr auto auto;
    grid-template-areas:
      'count stage'
      'mood  stage'
      'week  stage'
      'jour  jour'
      'foot  foot';
    column-gap: 28px;
  }

  .sh-week {
    align-self: start;
  }
}

/* ─── Número grande ──────────────────────────────────────────────────────── */
/* Container próprio: o selo do nível decide a posição pela largura DESTA
   linha (ver `shcount` abaixo), que no largo varia com a coluna 7fr. */
.sh-count {
  container: shcount / inline-size;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 16px;
  min-width: 0;
}

.sh-flame {
  flex: none;
}

.sh-number {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.sh-number-value {
  position: relative;
  font-size: 3.5rem;
  font-weight: 800;
  line-height: 0.9;
  letter-spacing: -0.05em;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.sh--wide .sh-number-value {
  font-size: 5.25rem;
}

.sh-unit {
  max-width: 5.5em;
  font-size: var(--text-body-large);
  font-weight: 650;
  line-height: 1.2;
  color: var(--text-2);
}

/* Estreito: "dias seguidos" desce para baixo do número e libera a lateral
   para o Nevo. */
.sh--narrow .sh-number,
.sh--tiny .sh-number {
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.sh--narrow .sh-unit,
.sh--tiny .sh-unit {
  max-width: none;
  white-space: nowrap;
}

/* "+1" que sobe e some ao lado do número quando a sequência cresce. */
.sh-bump {
  position: absolute;
  top: -0.1em;
  right: -0.9em;
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: 0;
  color: var(--streak-flame);
  opacity: 0;
  animation: sh-bump 1.4s var(--motion-ease) both;
}

.sh-tier {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin-left: auto;
}

.sh-tier-eyebrow {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}

/* Selo do nível: tinta chapada do tom do nível, hairline do mesmo tom. */
.sh-tier-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px 5px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--sh-tone) 45%, var(--border));
  background: color-mix(in srgb, var(--sh-tone) 13%, var(--surface));
  color: var(--sh-tone);
  font-size: 0.875rem;
  font-weight: 750;
  white-space: nowrap;
}

.sh-tier-pill.is-none {
  color: var(--text-3);
}

/*
 * Linha curta (celular, ou a coluna 7fr num monitor de ~1100px): o selo não
 * cabe ao lado do número e desce para a linha de baixo. Aí ele fica em linha
 * e à esquerda; à direita, sozinho numa linha, parecia solto.
 */
@container shcount (max-width: 539px) {
  .sh-tier {
    margin-left: 0;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    flex-basis: 100%;
  }
}

/* ─── Humor ──────────────────────────────────────────────────────────────── */
.sh-mood {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.sh-title {
  margin: 0;
  font-size: var(--text-title-large);
  font-weight: 750;
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: var(--text);
}

.sh-msg {
  margin: 0;
  max-width: 56ch;
  font-size: var(--text-body-large);
  line-height: 1.45;
  color: var(--text-2);
}

.sh-cta {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.sh-recap {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Conquista do dia: tinta verde chapada, a mesma da missão concluída. */
.sh-recap-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--success) 35%, var(--border));
  background: color-mix(in srgb, var(--success) 8%, var(--surface-2));
  color: var(--text);
  font-size: 0.8125rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.sh-recap-item svg {
  flex: none;
  color: var(--streak-done);
}

/* ─── Painéis internos (semana) ──────────────────────────────────────────── */
.sh-panel {
  padding: 12px 14px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  min-width: 0;
}

.sh-row-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-bottom: 12px;
}

.sh-h3 {
  margin: 0;
  font-size: var(--text-body-large);
  font-weight: 700;
  color: var(--text);
}

.sh-meta {
  font-size: 0.8125rem;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.sh-week .sh-meta {
  margin-left: auto;
}

.sh-rule {
  flex-basis: 100%;
}

.sh-chip {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--text-2);
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.sh-chip.is-perfect {
  background: color-mix(in srgb, var(--streak-perfect) 16%, transparent);
  color: var(--streak-perfect);
}

.sh-journey {
  min-width: 0;
}

/* ─── Palco do Nevo ──────────────────────────────────────────────────────── */
.sh-stage {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

/* No largo o palco é um painel com a tinta do nível (chapada, sem brilho). */
.sh--wide .sh-stage {
  justify-content: space-between;
  gap: 8px;
  padding: 14px 14px 12px;
  border: 1px solid color-mix(in srgb, var(--sh-tone) 22%, var(--border));
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--sh-tone) 6%, var(--surface-2));
}

.sh--narrow .sh-stage {
  justify-content: center;
}

/* Balão de fala, na linguagem do MascotCard: raio grande e bico apontando
   para o mascote logo abaixo. */
.sh-bubble {
  position: relative;
  max-width: 100%;
  margin: 0;
  padding: 8px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  color: var(--text);
  font-size: 0.9375rem;
  font-weight: 650;
  line-height: 1.35;
  /* Acima da aura do Lendário, que sobe atrás do Nevo até perto do balão. */
  z-index: 1;
  text-align: center;
  transform-origin: 50% 100%;
  animation: sh-bubble-in 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.sh-bubble::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -6px;
  width: 10px;
  height: 10px;
  transform: translateX(-50%) rotate(45deg);
  border-right: 1px solid var(--border-strong);
  border-bottom: 1px solid var(--border-strong);
  background: inherit;
}

.sh-actor {
  position: relative;
  flex: 1;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  /* Folga mínima acima da cabeça: o pulo do "bounce" (~24% da altura) passa
     por cima do balão por um instante, o que é aceitável e não abre vão. */
  padding-top: 6px;
}

/* Disco chapado atrás do Nevo: dá profundidade sem virar halo. O tamanho vem
   do script (`--sh-disc`), proporcional ao Nevo. */
.sh-disc {
  position: absolute;
  left: 50%;
  bottom: 6%;
  width: min(92%, var(--sh-disc, 220px));
  aspect-ratio: 1;
  border-radius: 50%;
  background: color-mix(in srgb, var(--sh-tone) 11%, transparent);
  transform: translateX(-50%);
}

.sh--narrow .sh-disc {
  width: 92px;
  bottom: 4px;
}

/*
 * Aura do Lendário: a chama dourada nasce atrás das pernas do Nevo e sobe em
 * volta dele. `translate` e `scale` separados: a respiração (scale) não
 * desfaz a centralização (translate). Escala a partir do pé, como uma chama
 * que cresce do chão.
 */
.sh-aura {
  position: absolute;
  left: 50%;
  bottom: 4%;
  display: flex;
  translate: -50% 0;
  transform-origin: 50% 100%;
  animation: sh-aura-breathe 3.6s ease-in-out infinite;
}

.sh--narrow .sh-aura {
  bottom: 0;
}

.sh-nevo {
  position: relative;
}

.sh-next {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 12px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--border);
}

.sh-next-text {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: 0.875rem;
  line-height: 1.3;
  color: var(--text);
}

.sh-next-text strong {
  font-weight: 700;
}

.sh-next-eyebrow {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}

/* ─── Rodapé ─────────────────────────────────────────────────────────────── */
.sh-foot {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 10px 28px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}

.sh-stat {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 0.875rem;
}

.sh-stat-icon {
  flex: none;
  color: var(--text-3);
}

.sh-stat dt {
  color: var(--text-3);
}

.sh-stat dd {
  margin: 0;
  font-weight: 700;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

/* ─── Evolução e marcos ──────────────────────────────────────────────────── */
.sh-tracks {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

/* Segmentado no mesmo desenho do alternador Empresa/Workspace do cabeçalho,
   com alvo de 44px. */
.sh-tabs {
  display: inline-flex;
  flex-wrap: wrap;
  align-self: flex-start;
  max-width: 100%;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.sh-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 650;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.sh-tab:hover {
  color: var(--text-2);
}

.sh-tab.is-active {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.sh-tab-meta {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.sh-tab.is-active .sh-tab-meta {
  color: var(--sh-tone);
}

.sh-track-panel {
  min-width: 0;
}

.sh-swap-enter-active,
.sh-swap-leave-active {
  transition:
    opacity var(--motion) var(--motion-ease),
    transform var(--motion) var(--motion-ease);
}

.sh-swap-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.sh-swap-leave-to {
  opacity: 0;
}

/* ─── Esqueleto ──────────────────────────────────────────────────────────── */
.skel {
  overflow: hidden;
  border-radius: var(--radius);
}

.skel--round {
  flex: none;
  border-radius: 50%;
}

.skel--stage {
  width: 100%;
  height: 100%;
  min-height: 104px;
  min-width: 96px;
  border-radius: var(--radius-lg);
}

/* Mesma altura do palco pronto (Nevo de 180px + balão + próximo marco). */
.sh--wide .skel--stage {
  min-height: 330px;
}

.skel-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
  gap: 10px;
}

/* ─── Keyframes (100% é sempre o repouso) ────────────────────────────────── */
@keyframes sh-bubble-in {
  0% {
    opacity: 0;
    transform: translateY(6px) scale(0.86);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Respiração da aura: cresce ~4% e volta. Sem opacidade nem cor: é a mesma
   imagem, só viva. */
@keyframes sh-aura-breathe {
  0%,
  100% {
    scale: 1;
  }
  50% {
    scale: 1.045 1.06;
  }
}

@keyframes sh-bump {
  0% {
    opacity: 0;
    transform: translateY(8px) scale(0.7);
  }
  20% {
    opacity: 1;
    transform: translateY(0) scale(1.1);
  }
  70% {
    opacity: 1;
    transform: translateY(-10px) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-18px) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sh-bubble,
  .sh-aura {
    animation: none;
  }

  /* O "+1" é só movimento; parado ele vira ruído ao lado do número. */
  .sh-bump {
    display: none;
  }
}
</style>
