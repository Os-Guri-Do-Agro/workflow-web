<script setup lang="ts">
/**
 * "Cards de marketing" no painel da tarefa do Nevo (R1, P3; D8 da spec
 * docs/specs/2026/q4/q4-2/ala-marketing/r1-acervo-tarefas-convite.md).
 *
 * - Carrega À PARTE (`GET /marketing/tasks/:id/cards`), nunca no include
 *   quente da tarefa: o board lê a `Activity` em todo lugar.
 * - Só aparece quando há card ligado. Sem a tabela da R1 (API antes da
 *   migration) a resposta vem `available: false` e nada aparece.
 * - Quem é da ala e vê a marca recebe o link para o card (com `?grupo=`, que
 *   a ala usa para escolher o grupo certo). Os outros veem só a contagem.
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { Megaphone } from 'lucide-vue-next'
import { hasSession } from '@/composables/useSession'
import { getTaskMarketingCards } from '@/service/marketing/marketing-tasks'
import {
  CARD_STATUS_TONE,
  brandTone,
  cardStatusLabel,
  toneStyle,
  type CardStatus,
} from '@/features/marketing/marketing-labels'
import { taskKeys } from './task-links'

const props = defineProps<{
  activityId: string
  /** Empresa da tarefa (o `/board` mistura empresas; vai no `x-company-id`). */
  companyId?: string | null
  /** Densidade do lugar onde entra: o dialog do board ou a página cheia. */
  variant?: 'dialog' | 'page'
}>()

const query = useQuery({
  queryKey: computed(() => taskKeys.ofTask(props.activityId, props.companyId ?? null)),
  queryFn: () => getTaskMarketingCards(props.activityId, props.companyId ?? null),
  enabled: computed(() => hasSession.value && !!props.activityId && !props.activityId.startsWith('rec:')),
  staleTime: 30_000,
  // Recurso a mais no painel: falhou, some quieto (o resto do painel segue).
  retry: false,
})

const data = computed(() => query.data.value ?? null)
const visible = computed(() => !!data.value?.available && data.value.total > 0)
const cards = computed(() => data.value?.cards ?? [])
const hiddenCount = computed(() => (data.value ? data.value.total - cards.value.length : 0))

function plural(n: number) {
  return n === 1 ? '1 card de marketing' : `${n} cards de marketing`
}
</script>

<template>
  <section v-if="visible" class="tmc" :class="`tmc--${variant ?? 'dialog'}`" aria-labelledby="tmc-title" data-testid="task-marketing-cards">
    <div class="tmc__head">
      <h3 id="tmc-title" class="tmc__title">
        <Megaphone :size="14" :stroke-width="1.8" aria-hidden="true" />
        Cards de marketing
        <span class="tmc__count">{{ data!.total }}</span>
      </h3>
    </div>

    <ul v-if="cards.length" class="tmc__list" role="list">
      <li v-for="card in cards" :key="card.id" class="tmc__item">
        <span class="tmc__dot" :style="toneStyle(brandTone({ companyId: card.brand.companyId ?? card.brand.name, color: card.brand.color }))" aria-hidden="true" />
        <RouterLink :to="card.link" class="tmc__name" :title="`Abrir “${card.title}” na ala Marketing`">
          {{ card.title }}
        </RouterLink>
        <span
          class="tmc__chip"
          :style="toneStyle(CARD_STATUS_TONE[card.status as CardStatus])"
        >
          {{ cardStatusLabel(card.status as CardStatus, card.kind) }}
        </span>
      </li>
    </ul>
    <p v-if="!cards.length" class="tmc__only" data-testid="task-marketing-count">
      Ligada a {{ plural(data!.total) }}.
    </p>
    <p v-else-if="hiddenCount > 0" class="tmc__only">
      E mais {{ plural(hiddenCount) }} de marca que você não vê na ala.
    </p>
  </section>
</template>

<style scoped>
.tmc {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

/* Página cheia da tarefa: o cartão (borda) vem do .panel de lá; o respiro, daqui. */
.tmc--page {
  padding: 12px 14px 14px;
}

.tmc__head {
  display: flex;
  align-items: center;
  min-height: 24px;
}

.tmc__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  font-weight: 600;
  color: var(--text);
}

.tmc__title svg {
  color: var(--text-3);
}

.tmc__count {
  font-weight: 400;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.tmc__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tmc__item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  min-width: 0;
}

.tmc__dot {
  display: inline-block;
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--mk-tone, var(--text-3));
}

.tmc__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  line-height: 20px;
  color: var(--text);
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tmc__name:hover {
  color: var(--accent-ink);
  text-decoration: underline;
}

.tmc__name:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}

/* Fora da ala o marketing.css não está carregado: o chip mora aqui. */
.tmc__chip {
  flex-shrink: 0;
  max-width: 50%;
  overflow: hidden;
  padding: 1px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--mk-tone) 14%, transparent);
  color: var(--mk-tone);
  font-size: 11.5px;
  font-weight: 600;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tmc__only {
  margin: 0;
  font-size: 12.5px;
  line-height: 18px;
  color: var(--text-3);
}

@media (max-width: 640px) {
  .tmc__item {
    min-height: 44px;
  }
}
</style>
