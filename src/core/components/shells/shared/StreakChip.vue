<script setup lang="ts">
/**
 * StreakChip: a sequência diária na topbar (spec sequencia-diaria-nevo, T6).
 *
 * Trigger compacto (chama + número) que abre um popover com o resumo do dia:
 * humor do Nevo, semana, missões, próximo marco, recorde e atalhos para a home
 * e para o ranking do time.
 *
 * Props:
 * - `compact`: versão mais estreita, para o Canvas (lá o grupo de ações nunca
 *   encolhe e cada pixel sai das abas).
 *
 * Estados:
 * - carregando (primeira busca): esqueleto discreto, sem clique;
 * - API sem a rota (404/403, `available=false`) ou erro sem dado: não desenha
 *   nada. A topbar é de todas as telas e não é lugar de mensagem de erro;
 * - erro numa nova busca COM dado anterior: continua mostrando o último dado.
 *
 * Popover do reka com portal: o painel vai para o body. Dentro da topbar o
 * Modo XP pinta o texto de branco e a barra de título do XP fica em z 900/1000;
 * no body, com z 3000, nenhum dos dois alcança o painel. Por isso o estilo do
 * painel é GLOBAL (segundo bloco <style>), com prefixo `streak-pop`.
 *
 * Fronteira: componente de shell não importa de `features/*`; tudo vem de
 * `components/nevo` e `composables`.
 */
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import NevoFlame from '@/components/nevo/NevoFlame.vue'
import {
  NEVO_MILESTONES,
  POINTS_RULES,
  daysLabel,
  litTone,
  milestoneTone,
  remainingLabel,
  tierToneText,
} from '@/components/nevo/nevo-assets'
import { useStreak } from '@/composables/useStreak'

/**
 * O chip vive no chunk de ENTRADA (shell é import estático do AppShell), e só
 * o trigger precisa estar lá. O corpo do popover entra sob demanda: as missões
 * trazem o `motion-v` (anel do `ProgressRing`), e Nevo e semana são CSS e
 * sprites que ninguém vê antes do clique. Medido no build: com tudo estático o
 * chip e a comemoração somavam ~10 KB gzip na entrada. Os chunks são pedidos
 * quando o ponteiro ou o foco chegam no botão, antes do clique, e o popover
 * abre já com tudo pronto.
 */
const loadSprite = () => import('@/components/nevo/NevoSprite.vue')
const loadWeek = () => import('@/components/nevo/StreakWeek.vue')
const loadMissions = () => import('@/components/nevo/StreakMissions.vue')
const NevoSprite = defineAsyncComponent(loadSprite)
const StreakWeek = defineAsyncComponent(loadWeek)
const StreakMissions = defineAsyncComponent(loadMissions)

let panelRequested = false
function prefetchPanel() {
  if (panelRequested) return
  panelRequested = true
  // Sem rede agora: libera para tentar de novo (e o defineAsyncComponent
  // também tenta ao abrir).
  Promise.all([loadSprite(), loadWeek(), loadMissions()]).catch(() => {
    panelRequested = false
  })
}

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })

const { streak, isLoading, available, refetch, mood } = useStreak()

const open = ref(false)

const data = computed(() => streak.value ?? null)

type ChipState = 'hidden' | 'loading' | 'ready'

const chipState = computed<ChipState>(() => {
  if (!available.value) return 'hidden'
  if (data.value) return 'ready'
  if (isLoading.value) return 'loading'
  // Erro sem dado (5xx, rede) ou consulta parada: topbar limpa.
  return 'hidden'
})

const lit = computed(() => data.value?.securedToday ?? false)
const atRisk = computed(() => data.value?.atRisk ?? false)
const current = computed(() => data.value?.current ?? 0)
const tierKey = computed(() => data.value?.tier.key ?? 'none')

/**
 * Aceso, chip e topo do popover seguem o NÍVEL: a chama vira o cristal do
 * nível (`NevoFlame` com `tier`) e o número pega o mesmo tom. Os `--tier-*`
 * passam AA como texto nos dois temas; no Modo XP o número segue branco.
 */
const litStyle = computed(() => (lit.value ? { '--streak-lit': litTone(tierKey.value) } : undefined))

/**
 * Nome acessível do botão (e o `title`, idêntico). Dia de descanso ganha frase
 * própria: "garanta o dia de hoje" num sábado sugeriria uma obrigação que não
 * existe (descanso não quebra a sequência, D4).
 */
const triggerLabel = computed(() => {
  const s = data.value
  if (!s) return ''
  if (s.securedToday) return `Sequência de ${daysLabel(s.current)}. Hoje garantido.`
  if (s.current <= 0) return 'Comece sua sequência hoje.'
  if (s.todayIsRest) return `Sequência de ${daysLabel(s.current)}. Hoje é dia de descanso.`
  return `Sequência de ${daysLabel(s.current)}. Garanta o dia de hoje.`
})

// ─── "Pop" do número ──────────────────────────────────────────────────────────
// A chave muda só quando o número MUDA (não na montagem): o span é recriado com
// a classe de animação e o keyframe roda uma vez. Trocar de shell remonta o chip
// e não pode fazer o número pular à toa.
const popKey = ref(0)
watch(
  () => data.value?.current,
  (next, prev) => {
    if (next === undefined || prev === undefined || next === prev) return
    popKey.value++
  },
)

// Abrir = dado fresco (mesma ideia do InboxBell): o polling é de 5 min.
watch(open, (isOpen) => {
  if (isOpen) void refetch()
})

/**
 * Foco ao abrir: vai para o próprio painel (tabindex -1 do FocusScope do reka),
 * não para o primeiro botão. O padrão do reka pulava direto para "Ver minha
 * jornada", lá no rodapé, e o leitor de tela começava pelo fim.
 *
 * O evento nasce no invólucro de posicionamento do reka (div sem tabindex, onde
 * `focus()` não faz nada), por isso o painel é procurado dentro dele.
 */
function focusPanel(event: Event) {
  const scope = event.target
  if (!(scope instanceof HTMLElement)) return
  const panel = scope.matches('.streak-pop')
    ? scope
    : scope.querySelector<HTMLElement>('.streak-pop')
  // Sem o painel à mão, fica o comportamento padrão do reka (primeiro botão).
  if (!panel) return
  event.preventDefault()
  panel.focus({ preventScroll: true })
}

function closePopover() {
  open.value = false
}

/**
 * "Ver minha jornada": o foco vai para o módulo da sequência na home (quem leva
 * é o router, junto com a rolagem até a âncora). Por isso, ao fechar, o reka
 * NÃO devolve o foco a este botão, senão ele voltava para a topbar.
 */
let focusGoesToJourney = false

function goToJourney() {
  focusGoesToJourney = true
  closePopover()
}

function onCloseAutoFocus(event: Event) {
  if (!focusGoesToJourney) return
  focusGoesToJourney = false
  event.preventDefault()
}

// ─── Conteúdo do popover ──────────────────────────────────────────────────────
const unitLabel = computed(() => (current.value === 1 ? 'dia seguido' : 'dias seguidos'))

const tierColor = computed(() => tierToneText(data.value?.tier.key ?? 'none'))

const missionsDone = computed(() => data.value?.missions.filter((m) => m.done).length ?? 0)
const missionsTotal = computed(() => data.value?.missions.length ?? 0)

const nextMilestone = computed(() => {
  const next = data.value?.nextMilestone
  if (!next) return null
  const meta = NEVO_MILESTONES.find((m) => m.days === next.days)
  // Progresso até o marco (12 de 14 = 86%). É reforço visual: o texto já diz.
  const pct = Math.max(0, Math.min(100, Math.round((current.value / next.days) * 100)))
  return {
    label: next.label,
    text: `${remainingLabel(next.remaining)} para o marco`,
    flame: meta?.flame ?? 'seq-basico',
    tone: meta ? milestoneTone(meta.key) : 'var(--streak-flame)',
    pct,
  }
})

const bestLabel = computed(() => `Recorde: ${daysLabel(data.value?.best ?? 0)}`)
const weekPoints = computed(() => data.value?.points.week ?? 0)

const TIER_HINT =
  'Nível do mascote: o Nevo evolui conforme a sequência cresce (Básico, Em progresso, Determinado, Especialista e Lendário).'
const POINTS_HINT = `Pontos da semana: ${POINTS_RULES}. Servem para o ranking do time.`
</script>

<template>
  <span
    v-if="chipState === 'loading'"
    class="streak-skel"
    :class="{ 'streak-skel--compact': compact }"
    aria-hidden="true"
  >
    <span class="streak-skel__flame" />
    <span class="streak-skel__num" />
  </span>

  <PopoverRoot v-else-if="chipState === 'ready' && data" v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="streak-trigger"
        :class="{
          'is-lit': lit,
          'is-open': open,
          'streak-trigger--compact': compact,
        }"
        :style="litStyle"
        :aria-label="triggerLabel"
        :title="triggerLabel"
        @pointerenter="prefetchPanel"
        @focus="prefetchPanel"
      >
        <span class="streak-trigger__flame">
          <NevoFlame :live="lit" :lit="lit" :tier="tierKey" :size="compact ? 20 : 22" />
          <span v-if="atRisk" class="streak-trigger__risk" aria-hidden="true" />
        </span>
        <span
          :key="popKey"
          class="streak-trigger__num"
          :class="{ 'is-pop': popKey > 0 }"
          aria-hidden="true"
        >
          {{ current }}
        </span>
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        class="streak-pop"
        side="bottom"
        align="end"
        :side-offset="10"
        :collision-padding="12"
        @open-auto-focus="focusPanel"
        @close-auto-focus="onCloseAutoFocus"
      >
        <!-- Topo: chama + número (como no mock do dono) e o Nevo no humor do dia. -->
        <section class="streak-pop__hero" :class="{ 'is-lit': lit }" :style="litStyle">
          <div class="streak-pop__hero-main">
            <div class="streak-pop__count">
              <NevoFlame :live="lit" :lit="lit" :tier="tierKey" :size="40" />
              <p class="streak-pop__num">{{ current }}</p>
            </div>
            <p class="streak-pop__unit">{{ unitLabel }}</p>
            <p class="streak-pop__tier">
              <span class="streak-pop__gloss" :title="TIER_HINT">Nível</span>
              <strong :style="{ color: tierColor }">{{ data.tier.label }}</strong>
            </p>
          </div>
          <!-- Caixa com a altura do Nevo: o chunk dele pode chegar depois. -->
          <span class="streak-pop__nevo">
            <NevoSprite :pose="mood.pose" :motion="mood.motion" :size="72" floor />
          </span>
        </section>

        <div class="streak-pop__mood">
          <p class="streak-pop__mood-title">{{ mood.title }}</p>
          <p class="streak-pop__mood-msg">{{ mood.message }}</p>
        </div>

        <section class="streak-pop__section">
          <h3 class="streak-pop__label">Sua semana</h3>
          <div class="streak-pop__week">
            <StreakWeek :days="data.week" size="md" />
          </div>
        </section>

        <section class="streak-pop__section">
          <div class="streak-pop__section-head">
            <h3 class="streak-pop__label">Missões de hoje</h3>
            <span class="streak-pop__meta">{{ missionsDone }} de {{ missionsTotal }}</span>
          </div>
          <div class="streak-pop__missions">
            <StreakMissions :missions="data.missions" variant="compact" />
          </div>
        </section>

        <div v-if="nextMilestone" class="streak-pop__next">
          <NevoFlame :sprite="nextMilestone.flame" :size="30" />
          <div class="streak-pop__next-body">
            <p class="streak-pop__next-text">
              {{ nextMilestone.text }} <strong>{{ nextMilestone.label }}</strong>
            </p>
            <span class="streak-pop__bar" aria-hidden="true">
              <span
                class="streak-pop__bar-fill"
                :style="{ width: `${nextMilestone.pct}%`, background: nextMilestone.tone }"
              />
            </span>
          </div>
        </div>
        <p v-else class="streak-pop__next-done">
          Você já passou por todos os marcos. Coisa de lenda!
        </p>

        <p class="streak-pop__stats">
          <!-- "Recorde: 0 dias" só desanima quem está começando. -->
          <span v-if="data.best > 0">{{ bestLabel }}</span>
          <span class="streak-pop__gloss" :title="POINTS_HINT">
            {{ weekPoints }} {{ weekPoints === 1 ? 'ponto' : 'pontos' }} na semana
          </span>
        </p>

        <nav class="streak-pop__actions" aria-label="Atalhos da sequência">
          <RouterLink
            class="streak-pop__btn streak-pop__btn--primary"
            :to="{ path: '/', hash: '#sequencia' }"
            @click="goToJourney"
          >
            Ver minha jornada
          </RouterLink>
          <RouterLink
            class="streak-pop__btn"
            :to="{ path: '/time', query: { tab: 'team' } }"
            @click="closePopover"
          >
            Ver o time
          </RouterLink>
        </nav>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
/* ─── Trigger ────────────────────────────────────────────────────────────── */
.streak-trigger {
  position: relative;
  /* Alvo >= 44x44 (acessibilidade 50+). */
  min-width: 44px;
  height: 44px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: none;
  /* Borda transparente reservada: o hover acende a borda sem mexer no tamanho. */
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.streak-trigger--compact {
  padding: 0 8px;
  gap: 4px;
}

.streak-trigger:hover,
.streak-trigger.is-open {
  background: var(--surface-3);
  border-color: var(--border);
  color: var(--text);
}

.streak-trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.streak-trigger__flame {
  position: relative;
  display: inline-flex;
  align-items: flex-end;
}

/* Em risco: ponto chapado da cor da chama, pulsando devagar (sem halo). */
.streak-trigger__risk {
  position: absolute;
  top: -2px;
  right: -4px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--streak-flame);
  animation: streak-risk 2.4s ease-in-out infinite;
}

.streak-trigger__num {
  display: inline-block;
  font-size: 0.9375rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
}

.streak-trigger.is-lit .streak-trigger__num {
  color: var(--streak-lit, var(--streak-flame));
}

.streak-trigger__num.is-pop {
  animation: streak-num-pop 520ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* ─── Esqueleto (primeira busca) ─────────────────────────────────────────── */
.streak-skel {
  height: 44px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  animation: streak-skel 1.6s ease-in-out infinite;
}

.streak-skel--compact {
  padding: 0 8px;
  gap: 4px;
}

.streak-skel__flame,
.streak-skel__num {
  display: block;
  background: var(--surface-3);
}

.streak-skel__flame {
  width: 16px;
  height: 20px;
  border-radius: 999px 999px 8px 8px;
}

.streak-skel__num {
  width: 14px;
  height: 12px;
  border-radius: 4px;
}

/* ─── Modo XP ────────────────────────────────────────────────────────────── */
/* A topbar vira a barra azul Luna e o xp.css redefine --text* como branco nos
   elementos dela. O laranja da chama sobre o azul não tem contraste: no XP o
   número aceso fica branco (a chama colorida ao lado já diz "aceso"). O fundo
   de hover sai de --text (branco translúcido): --surface-3 no XP é bege e
   apagava o ícone branco. O foco em --accent (azul) sumia no azul da barra. */
html[data-xp='true'] .streak-trigger.is-lit .streak-trigger__num {
  color: var(--text);
}

html[data-xp='true'] .streak-trigger:hover,
html[data-xp='true'] .streak-trigger.is-open {
  background: color-mix(in srgb, var(--text) 18%, transparent);
  border-color: color-mix(in srgb, var(--text) 40%, transparent);
}

html[data-xp='true'] .streak-trigger:focus-visible {
  outline-color: var(--text);
}

html[data-xp='true'] .streak-skel__flame,
html[data-xp='true'] .streak-skel__num {
  background: color-mix(in srgb, var(--text) 30%, transparent);
}

/* ─── Keyframes (100% é sempre o repouso) ────────────────────────────────── */
@keyframes streak-num-pop {
  0% {
    transform: scale(1);
  }
  35% {
    transform: translateY(-2px) scale(1.35);
  }
  70% {
    transform: translateY(0) scale(0.94);
  }
  100% {
    transform: translateY(0) scale(1);
  }
}

@keyframes streak-risk {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(0.7);
    opacity: 0.5;
  }
}

@keyframes streak-skel {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

@media (prefers-reduced-motion: reduce) {
  .streak-trigger__num.is-pop,
  .streak-trigger__risk,
  .streak-skel {
    animation: none;
  }
}
</style>

<style>
/*
 * Painel do StreakChip. GLOBAL de propósito: o PopoverPortal leva o conteúdo
 * para o <body> (mesma lição de styles/menus.css). Tudo com prefixo
 * `streak-pop` para não vazar.
 */
.streak-pop {
  z-index: 3000;
  width: min(380px, calc(100vw - 24px));
  max-height: min(700px, var(--reka-popover-content-available-height, calc(100vh - 80px)));
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-overlay);
  font-family: var(--font-family);
  transform-origin: var(--reka-popover-content-transform-origin);
}

/* O painel recebe foco ao abrir (para o leitor de tela começar pelo topo);
   ele não é um controle, então não desenha anel. Os botões dentro desenham. */
.streak-pop:focus {
  outline: none;
}

.streak-pop[data-state='open'] {
  animation: streak-pop-in 220ms cubic-bezier(0.34, 1.3, 0.64, 1);
}

.streak-pop[data-state='closed'] {
  animation: streak-pop-out 120ms ease-in forwards;
}

.streak-pop p,
.streak-pop h3 {
  margin: 0;
}

/* ─── Topo ───────────────────────────────────────────────────────────────── */
.streak-pop__hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  /* Folga no alto para o pulo do Nevo não sair do cartão. */
  padding: 22px 16px 14px;
  border-radius: var(--radius-lg);
  background: var(--surface-2);
}

/* Aceso: tinta chapada da chama do nível (sem radial, sem brilho). */
.streak-pop__hero.is-lit {
  background: color-mix(in srgb, var(--streak-lit, var(--streak-flame)) 8%, var(--surface-2));
}

.streak-pop__hero-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.streak-pop__count {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.streak-pop__num {
  font-size: 2.5rem;
  font-weight: 800;
  line-height: 0.9;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--text);
}

.streak-pop__hero.is-lit .streak-pop__num {
  color: var(--streak-lit, var(--streak-flame));
}

.streak-pop__unit {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-3);
}

.streak-pop__tier {
  padding-top: 4px;
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 0.8125rem;
  color: var(--text-3);
}

.streak-pop__tier strong {
  font-weight: 750;
}

.streak-pop__nevo {
  flex: none;
  min-width: 56px;
  min-height: 72px;
  margin-right: 4px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

/* Termo com explicação no title (padrão do glossário da topbar). */
.streak-pop__gloss {
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

/* ─── Humor ──────────────────────────────────────────────────────────────── */
.streak-pop__mood {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 2px;
}

.streak-pop__mood-title {
  font-size: var(--text-body-large);
  font-weight: 700;
  line-height: 1.3;
  color: var(--text);
}

.streak-pop__mood-msg {
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--text-2);
}

/* ─── Seções ─────────────────────────────────────────────────────────────── */
.streak-pop__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.streak-pop__section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.streak-pop__label {
  font-size: 0.8125rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--text-2);
}

.streak-pop__meta {
  font-size: 0.75rem;
  font-weight: 650;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

/* Reservam a altura enquanto os chunks da semana e das missões chegam
   (círculo de 2,25rem + rótulo; 3 linhas de ~49px). */
.streak-pop__week {
  min-height: calc(2.25rem + 18px);
}

.streak-pop__missions {
  min-height: 150px;
}

/* ─── Próximo marco ──────────────────────────────────────────────────────── */
.streak-pop__next {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--surface-2);
}

.streak-pop__next-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.streak-pop__next-text,
.streak-pop__next-done {
  font-size: 0.8125rem;
  line-height: 1.35;
  color: var(--text-2);
}

.streak-pop__next-text strong {
  color: var(--text);
  font-weight: 700;
}

.streak-pop__bar {
  display: block;
  height: 6px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}

.streak-pop__bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width var(--motion-slow) var(--motion-ease);
}

/* ─── Recorde e pontos ───────────────────────────────────────────────────── */
.streak-pop__stats {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 12px;
  padding: 0 2px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

/* ─── Atalhos ────────────────────────────────────────────────────────────── */
.streak-pop__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.streak-pop__btn {
  min-height: 44px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 650;
  line-height: 1.2;
  text-decoration: none;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    filter var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.streak-pop__btn:hover {
  background: var(--surface-3);
  border-color: var(--border-strong);
}

.streak-pop__btn--primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--accent-fg);
}

.streak-pop__btn--primary:hover {
  border-color: transparent;
  background: var(--accent);
  filter: brightness(1.06);
}

.streak-pop__btn:active {
  transform: scale(0.98);
}

.streak-pop__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* ─── Entrada e saída ────────────────────────────────────────────────────── */
@keyframes streak-pop-in {
  0% {
    opacity: 0;
    transform: translateY(-6px) scale(0.97);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes streak-pop-out {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }
}

@media (prefers-reduced-motion: reduce) {
  .streak-pop[data-state='open'],
  .streak-pop[data-state='closed'] {
    animation: none;
  }
  .streak-pop__bar-fill {
    transition: none;
  }
}
</style>
