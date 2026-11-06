<script setup lang="ts">
/**
 * "Mover para" no card do board, no computador: um botão pequeno que aparece
 * no hover e no foco do card (sempre à vista em tela de toque) e abre um menu
 * com os status da trilha. Quem não pode ir aparece desabilitado com o motivo
 * (o espelho `moveTargets` de approvals-meta.ts, o mesmo da folha do celular).
 * Escolher emite `select`; o board grava pelo MESMO `/move` do arraste, então
 * a regra e a frase de recusa do servidor continuam valendo.
 *
 * Teclado (reka-ui): Tab chega no botão, Enter/Espaço/seta abre com o foco na
 * primeira opção liberada, setas andam (pulam as desabilitadas), Enter escolhe,
 * Esc fecha e devolve o foco ao botão. Depois de mover, o board leva o foco
 * para o card na coluna nova (o botão daqui deixa de existir).
 *
 * O menu vai para o body (Portal): o desenho dele está em marketing.css
 * (`.mk-move-menu`), porque o scoped não viaja junto.
 */
import { computed } from 'vue'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { ArrowRightLeft, Check, Printer } from 'lucide-vue-next'
import type { MarketingRole } from '@/service/marketing/marketing-core'
import type { MarketingCardSummary } from '@/service/marketing/marketing-cards'
import { toneStyle, type CardStatus } from '../../marketing-labels'
import { PRINT_DESK_STATUSES, moveInfoOf, moveTargets } from '../approvals-meta'

const props = defineProps<{
  card: MarketingCardSummary
  role: MarketingRole | null
  disabled?: boolean
}>()

const emit = defineEmits<{ select: [status: CardStatus] }>()

// Computado preguiçoso: só roda quando o menu abre (o conteúdo é quem lê).
const targets = computed(() => moveTargets(moveInfoOf(props.card), props.role))

/** Peça impressa aprovada: o próximo passo mora na tela Gráfica. */
const printDesk = computed(
  () => props.card.kind === 'PRINT' && (props.card.status === 'APPROVED' || PRINT_DESK_STATUSES.includes(props.card.status)),
)

let picked = false
function pick(status: CardStatus) {
  picked = true
  emit('select', status)
}

/** Depois de mover, o foco é do board (vai para o card na coluna nova). */
function onCloseAutoFocus(event: Event) {
  if (picked) event.preventDefault()
  picked = false
}
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child :disabled="disabled">
      <button
        type="button"
        class="mkmm__btn"
        data-action="move-menu"
        :aria-label="`Mover ${card.title} para outro status`"
        title="Mover para"
        @click.stop
        @keydown.enter.stop
        @keydown.space.stop
      >
        <ArrowRightLeft :size="14" :stroke-width="2" aria-hidden="true" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        class="dd-menu mk-move-menu"
        align="end"
        :side-offset="4"
        :collision-padding="8"
        :data-card="card.id"
        @close-auto-focus="onCloseAutoFocus"
      >
        <DropdownMenuLabel class="mk-move-menu__label">Mover para</DropdownMenuLabel>
        <DropdownMenuItem
          v-for="t in targets"
          :key="t.value"
          class="dd-item mk-move-menu__item"
          :class="{ 'is-current': t.current }"
          :disabled="t.current || !!t.blocked"
          :data-move-to="t.value"
          @select="pick(t.value)"
        >
          <span class="mk-dot" :style="toneStyle(t.tone)" aria-hidden="true" />
          <span class="mk-move-menu__text">
            <span class="mk-move-menu__name">{{ t.label }}</span>
            <span v-if="t.current" class="mk-move-menu__why">Status atual</span>
            <span v-else-if="t.blocked" class="mk-move-menu__why" data-why>{{ t.blocked }}</span>
          </span>
          <Check v-if="t.current" :size="14" class="mk-move-menu__check" aria-hidden="true" />
        </DropdownMenuItem>
        <template v-if="printDesk">
          <DropdownMenuSeparator class="dd-sep" />
          <DropdownMenuItem as-child class="dd-item mk-move-menu__item">
            <RouterLink :to="{ name: 'marketing-print', query: { peca: card.id } }" data-action="open-print">
              <Printer :size="14" aria-hidden="true" />
              <span class="mk-move-menu__name">Abrir na Gráfica</span>
            </RouterLink>
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<style scoped>
/*
 * O lugar do botão fica reservado no card (nada pula quando ele aparece). Some
 * fora do hover/foco do card; a área de clique cresce por fora sem empurrar a
 * linha. `.mkc` é o card do board (MarketingBoardCard).
 */
.mkmm__btn {
  position: relative;
  flex: none;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  margin: -3px -4px -3px 0;
  padding: 0;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  opacity: 0;
  transition:
    opacity var(--motion-fast) var(--motion-ease),
    background-color var(--motion-fast) var(--motion-ease);
}

.mkmm__btn::after {
  content: '';
  position: absolute;
  inset: -5px;
}

.mkc:hover .mkmm__btn,
.mkc:focus-within .mkmm__btn,
.mkmm__btn[data-state='open'] {
  opacity: 1;
}

.mkmm__btn:hover,
.mkmm__btn[data-state='open'] {
  background: var(--surface-3);
  color: var(--text);
}

.mkmm__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}

/* Card indo para outra coluna (gravando): sem botão até o servidor responder. */
.mkmm__btn:disabled {
  visibility: hidden;
}

/* Tela de toque não tem hover: o botão fica sempre à vista, com alvo maior. */
@media (hover: none) {
  .mkmm__btn {
    opacity: 1;
  }

  .mkmm__btn::after {
    inset: -11px;
  }
}
</style>
