<script setup lang="ts">
/**
 * "Registrar como já publicado" (post) ou "já entregue" (peça impressa): o
 * Admin põe no fim da trilha o que saiu fora do Nevo, sem versão e sem
 * aprovação (`POST /cards/:id/record-done`, só Admin). Abre do board (soltar ou
 * "Mover para" no fim da trilha) e do "Mudar status" da página do card.
 *
 * Post: quando saiu (hora de Brasília; padrão é a data de publicação do card,
 * se já passou, senão agora; nunca no futuro) e o link, opcional. A data vira a
 * do calendário. Peça impressa: só a confirmação (o card não guarda data de
 * entrega).
 *
 * Card publicado não recebe arte nem legenda nova (um Admin reabre para
 * produção): sem versão, o diálogo avisa para subir a V1 antes, se quiser
 * guardar a arte junto.
 */
import { computed, ref, watch } from 'vue'
import { CheckCheck, Loader2, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import { getApiErrorMessage } from '@/service/api'
import { recordCardDone, type MarketingCardDetail } from '@/service/marketing/marketing-cards'
import { spLocalInput, spLocalInputToIso } from '../../calendar/calendar-time'
import type { CardKind, CardStatus } from '../../marketing-labels'
import { recordDoneLabel } from '../approvals-meta'

export interface RecordDoneCard {
  id: string
  title: string
  kind: CardKind | string
  status: CardStatus
  publishAt: string | null
  /** Tem versão (arte ou legenda fechada). Ausente = não sabe (sem aviso). */
  hasVersion?: boolean
}

const props = defineProps<{
  modelValue: boolean
  groupId: string
  card: RecordDoneCard | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  done: [card: MarketingCardDetail]
}>()

const when = ref('')
const url = ref('')
const saving = ref(false)
const error = ref('')

const isPrint = computed(() => props.card?.kind === 'PRINT')
const title = computed(() => (props.card ? recordDoneLabel(props.card.kind) : ''))
/** Limite do campo: agora, em Brasília (o servidor aceita 1 min de folga). */
const maxWhen = ref('')

watch(
  () => props.modelValue,
  (open) => {
    if (!open || !props.card) return
    const now = new Date()
    const planned = props.card.publishAt ? new Date(props.card.publishAt) : null
    const start = planned && planned.getTime() <= now.getTime() ? planned : now
    when.value = spLocalInput(start.toISOString())
    maxWhen.value = spLocalInput(now.toISOString())
    url.value = ''
    error.value = ''
  },
  { immediate: true },
)

watch([when, url], () => {
  if (error.value) error.value = ''
})

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

async function submit() {
  const card = props.card
  if (!card) return
  let at: string | null = null
  let link: string | null = null
  if (!isPrint.value) {
    at = spLocalInputToIso(when.value)
    if (!at) {
      error.value = 'Diga quando o post saiu (dia e hora).'
      return
    }
    if (new Date(at).getTime() > Date.now() + 60_000) {
      error.value = 'A data está no futuro. Para o que ainda vai sair, use "Agendar publicação".'
      return
    }
    link = url.value.trim() || null
    if (link && !/^https?:\/\//i.test(link)) {
      error.value = 'Link do post: use um endereço que comece com http ou https.'
      return
    }
  }
  saving.value = true
  error.value = ''
  try {
    const detail = await recordCardDone(props.groupId, card.id, isPrint.value ? {} : { at, url: link })
    emit('done', detail)
    emit('update:modelValue', false)
  } catch (err) {
    error.value = getApiErrorMessage(err, 'Não deu para registrar.')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppDialog :model-value="modelValue" :label="title" size="sm" :loading="saving" persistent @update:model-value="close">
    <!-- novalidate: a recusa (data no futuro, link) sai na frase da tela, não no balão do navegador. -->
    <form v-if="card" class="mkrd" data-testid="record-done-dialog" novalidate @submit.prevent="submit">
      <header class="mkrd__head">
        <span class="mkrd__icon" aria-hidden="true"><CheckCheck :size="16" /></span>
        <div class="mkrd__head-text">
          <h2 class="mkrd__title">{{ title }}</h2>
          <p class="mkrd__card">{{ card.title }}</p>
        </div>
        <button type="button" class="mk-icon-btn" aria-label="Fechar" :disabled="saving" @click="close"><X :size="16" /></button>
      </header>

      <div class="mkrd__body">
        <p class="mkrd__lead">
          <template v-if="isPrint">Para a peça que já foi impressa e entregue fora do Nevo. Ela vai direto para Impresso e entregue, sem passar pela aprovação e pela gráfica.</template>
          <template v-else>Para o post que já saiu fora do Nevo. Ele vai direto para Publicado, sem passar pela aprovação.</template>
          O histórico do card guarda que foi registrado por você.
        </p>

        <template v-if="!isPrint">
          <label class="mk-field">
            <span class="mk-label">Quando saiu</span>
            <input v-model="when" type="datetime-local" class="mk-input" name="at" :max="maxWhen" required />
            <span class="mk-hint">Hora de Brasília. É o dia em que o post aparece no calendário.</span>
          </label>
          <label class="mk-field">
            <span class="mk-label">Link do post (opcional)</span>
            <input v-model="url" type="url" class="mk-input" name="url" maxlength="2000" placeholder="https://instagram.com/p/..." inputmode="url" />
          </label>
        </template>

        <p v-if="card.status === 'SCHEDULED'" class="mkrd__note">O que ainda não saiu pelo Nevo nas redes deste card é cancelado.</p>
        <p v-if="card.hasVersion === false" class="mkrd__note" data-testid="record-no-version">
          O card está sem arte. Para guardar a arte junto, suba a V1 antes de registrar: depois de {{ isPrint ? 'entregue' : 'publicado' }} o card não recebe versão nova.
        </p>

        <p v-if="error" class="mk-error" role="alert" data-testid="record-error">{{ error }}</p>
      </div>

      <footer class="mkrd__foot">
        <button type="button" class="mk-btn mk-btn--ghost" :disabled="saving" @click="close">Cancelar</button>
        <button type="submit" class="mk-btn mk-btn--primary" :disabled="saving" data-action="confirm-record-done">
          <Loader2 v-if="saving" :size="14" class="mkrd__spin" aria-hidden="true" />
          {{ isPrint ? 'Registrar entrega' : 'Registrar publicação' }}
        </button>
      </footer>
    </form>
  </AppDialog>
</template>

<style scoped>
.mkrd {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.mkrd__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px 10px;
}

.mkrd__icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.mkrd__head-text {
  flex: 1;
  min-width: 0;
}

.mkrd__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  line-height: 22px;
}

.mkrd__card {
  margin: 2px 0 0;
  color: var(--text-2);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.mkrd__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 16px 12px;
  overflow-y: auto;
}

.mkrd__lead {
  margin: 0;
  color: var(--text-2);
  font-size: 13px;
  line-height: 19px;
}

.mkrd__note {
  margin: 0;
  padding: 8px 10px;
  border-left: 3px solid var(--warn, var(--due-soon, var(--border-strong)));
  border-radius: var(--radius-xs);
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 12.5px;
  line-height: 18px;
}

.mkrd__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px 14px;
  border-top: 1px solid var(--border);
}

.mkrd__spin {
  animation: mkrd-spin 0.8s linear infinite;
}

@keyframes mkrd-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
