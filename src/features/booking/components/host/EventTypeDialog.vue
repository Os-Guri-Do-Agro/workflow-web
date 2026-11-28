<script setup lang="ts">
/**
 * Criar/editar tipo de reunião. O básico (nome, duração, descrição) fica à
 * vista; as regras que quase ninguém mexe (folgas, antecedência, horizonte,
 * teto diário) ficam em "Regras de agenda", já com padrões bons.
 */
import { computed, reactive, ref, watch } from 'vue'
import { ChevronDown, Loader2, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import type { BookingEventType, EventTypeInput } from '@/service/booking/booking-service'
import { useBookingSettings } from '../../composables/useBookingSettings'
import { formatDuration } from '../../booking-time'

const props = defineProps<{ eventType: BookingEventType | null; pageSlug: string }>()
const open = defineModel<boolean>({ required: true })

const { createEventType, updateEventType } = useBookingSettings()
const { success: showSuccess } = useToast()

const DURATIONS = [15, 20, 30, 45, 60, 90, 120]
const STEPS = [10, 15, 20, 30, 60]
const BUFFERS = [0, 5, 10, 15, 30, 60]
const NOTICES = [0, 60, 120, 240, 720, 1440, 2880]
const HORIZONS = [7, 14, 30, 60, 90, 180]

function noticeLabel(min: number) {
  if (min === 0) return 'Sem antecedência mínima'
  if (min < 1440) return `${min / 60} h antes`
  return `${min / 1440} ${min === 1440 ? 'dia' : 'dias'} antes`
}

/**
 * Opções do select + o valor atual quando ele não está na lista (tipo criado
 * pela API com 25 min, por exemplo): sem isso o select mostraria vazio e o
 * próximo salvar trocaria o valor sem a pessoa ter mexido.
 */
function options(values: number[], current: number, label: (n: number) => string) {
  const all = values.includes(current) ? values : [...values, current].sort((a, b) => a - b)
  return all.map((value) => ({ label: label(value), value }))
}

const form = reactive({
  title: '',
  slug: '',
  description: '',
  durationMin: 30,
  slotStepMin: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minNoticeMin: 240,
  maxDaysAhead: 60,
  dailyLimit: '' as string,
})
const durationItems = computed(() => options(DURATIONS, form.durationMin, formatDuration))
const stepItems = computed(() =>
  options(STEPS, form.slotStepMin, (m) => `A cada ${formatDuration(m)}`),
)
const bufferBeforeItems = computed(() =>
  options(BUFFERS, form.bufferBeforeMin, (m) => (m ? formatDuration(m) : 'Nenhuma')),
)
const bufferAfterItems = computed(() =>
  options(BUFFERS, form.bufferAfterMin, (m) => (m ? formatDuration(m) : 'Nenhuma')),
)
const noticeItems = computed(() => options(NOTICES, form.minNoticeMin, noticeLabel))
const horizonItems = computed(() =>
  options(HORIZONS, form.maxDaysAhead, (d) => `Até ${d} dias à frente`),
)

const showRules = ref(false)
const slugTouched = ref(false)
const error = ref<string | null>(null)

const isEdit = computed(() => !!props.eventType)
const saving = computed(() => createEventType.isPending.value || updateEventType.isPending.value)

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

watch(open, (isOpen) => {
  if (!isOpen) return
  const t = props.eventType
  error.value = null
  slugTouched.value = !!t
  showRules.value = false
  Object.assign(form, {
    title: t?.title ?? '',
    slug: t?.slug ?? '',
    description: t?.description ?? '',
    durationMin: t?.durationMin ?? 30,
    slotStepMin: t?.slotStepMin ?? 30,
    bufferBeforeMin: t?.bufferBeforeMin ?? 0,
    bufferAfterMin: t?.bufferAfterMin ?? 0,
    minNoticeMin: t?.minNoticeMin ?? 240,
    maxDaysAhead: t?.maxDaysAhead ?? 60,
    dailyLimit: t?.dailyLimit ? String(t.dailyLimit) : '',
  })
})

watch(
  () => form.title,
  (title) => {
    if (!slugTouched.value) form.slug = slugify(title)
  },
)

const dailyLimitValue = computed(() => {
  const n = Number.parseInt(form.dailyLimit, 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : null
})

const canSave = computed(() => form.title.trim().length > 0 && !saving.value)

async function save() {
  if (!canSave.value) return
  error.value = null
  const input: EventTypeInput = {
    title: form.title.trim(),
    slug: form.slug.trim() || undefined,
    description: form.description.trim() || null,
    durationMin: form.durationMin,
    slotStepMin: form.slotStepMin,
    bufferBeforeMin: form.bufferBeforeMin,
    bufferAfterMin: form.bufferAfterMin,
    minNoticeMin: form.minNoticeMin,
    maxDaysAhead: form.maxDaysAhead,
    dailyLimit: dailyLimitValue.value,
  }
  try {
    if (props.eventType) {
      await updateEventType.mutateAsync({ id: props.eventType.id, input })
      showSuccess('Tipo de reunião atualizado')
    } else {
      await createEventType.mutateAsync(input)
      showSuccess('Tipo de reunião criado')
    }
    open.value = false
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Não foi possível salvar.')
  }
}
</script>

<template>
  <AppDialog v-model="open" :label="isEdit ? 'Editar tipo de reunião' : 'Novo tipo de reunião'" size="lg" :loading="saving" persistent>
    <form class="bk-dialog" @submit.prevent="save">
      <header class="bk-dialog__head">
        <h2>{{ isEdit ? 'Editar tipo de reunião' : 'Novo tipo de reunião' }}</h2>
        <button type="button" class="bk-icon-btn" aria-label="Fechar" :disabled="saving" @click="open = false">
          <X :size="16" />
        </button>
      </header>

      <div class="bk-dialog__body">
        <label class="bk-field">
          <span class="bk-label">Nome</span>
          <input v-model="form.title" class="bk-input" maxlength="80" placeholder="Ex.: Reunião de alinhamento" />
        </label>

        <div class="et-grid">
          <div class="bk-field">
            <span class="bk-label">Duração</span>
            <AppSelect v-model="form.durationMin" :items="durationItems" label="Duração" />
          </div>
          <label class="bk-field">
            <span class="bk-label">Link</span>
            <span class="bk-affix">
              <span class="bk-affix__prefix">…/{{ pageSlug }}/</span>
              <input
                v-model="form.slug"
                type="text"
                spellcheck="false"
                maxlength="60"
                @input="slugTouched = true"
              />
            </span>
          </label>
        </div>

        <label class="bk-field">
          <span class="bk-label">Descrição <span class="et-optional">(aparece para quem vai marcar)</span></span>
          <textarea
            v-model="form.description"
            class="bk-input"
            rows="3"
            maxlength="2000"
            placeholder="O que vai ser tratado, o que preparar antes..."
          />
        </label>

        <button type="button" class="et-toggle" :aria-expanded="showRules" @click="showRules = !showRules">
          <ChevronDown :size="15" :class="{ 'is-open': showRules }" />
          Regras de agenda
          <span class="et-toggle__sum">
            {{ noticeLabel(form.minNoticeMin).toLowerCase() }} · até {{ form.maxDaysAhead }} dias
          </span>
        </button>

        <div v-if="showRules" class="et-rules">
          <div class="et-grid">
            <div class="bk-field">
              <span class="bk-label">Horários oferecidos</span>
              <AppSelect v-model="form.slotStepMin" :items="stepItems" label="Intervalo entre horários" />
              <span class="bk-hint">09:00, 09:30, 10:00… com "a cada 30 min".</span>
            </div>
            <div class="bk-field">
              <span class="bk-label">Antecedência mínima</span>
              <AppSelect v-model="form.minNoticeMin" :items="noticeItems" label="Antecedência mínima" />
            </div>
            <div class="bk-field">
              <span class="bk-label">Folga antes</span>
              <AppSelect v-model="form.bufferBeforeMin" :items="bufferBeforeItems" label="Folga antes" />
            </div>
            <div class="bk-field">
              <span class="bk-label">Folga depois</span>
              <AppSelect v-model="form.bufferAfterMin" :items="bufferAfterItems" label="Folga depois" />
            </div>
            <div class="bk-field">
              <span class="bk-label">Janela de agendamento</span>
              <AppSelect v-model="form.maxDaysAhead" :items="horizonItems" label="Janela de agendamento" />
            </div>
            <label class="bk-field">
              <span class="bk-label">Máximo por dia</span>
              <input
                v-model="form.dailyLimit"
                class="bk-input"
                type="number"
                min="1"
                max="50"
                inputmode="numeric"
                placeholder="Sem limite"
              />
            </label>
          </div>
          <p class="bk-hint">
            As folgas valem contra qualquer compromisso da sua agenda, não só contra outras reuniões
            desta página.
          </p>
        </div>

        <p v-if="error" class="bk-alert bk-alert--err" role="alert">{{ error }}</p>
      </div>

      <footer class="bk-dialog__foot">
        <button type="button" class="bk-btn" :disabled="saving" @click="open = false">Cancelar</button>
        <button type="submit" class="bk-btn bk-btn--primary" :disabled="!canSave">
          <Loader2 v-if="saving" :size="14" class="bk-spin" />
          {{ isEdit ? 'Salvar' : 'Criar' }}
        </button>
      </footer>
    </form>
  </AppDialog>
</template>

<style scoped>
.et-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.et-optional {
  color: var(--text-4);
  font-weight: 500;
}

.et-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border: none;
  border-top: 1px solid var(--border);
  background: none;
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
}

.et-toggle :deep(svg) {
  transition: transform var(--motion-fast) var(--motion-ease);
  transform: rotate(-90deg);
}

.et-toggle :deep(svg.is-open) {
  transform: none;
}

.et-toggle__sum {
  margin-left: auto;
  color: var(--text-3);
  font-weight: 500;
}

.et-rules {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (max-width: 560px) {
  .et-grid {
    grid-template-columns: 1fr;
  }

  .et-toggle__sum {
    display: none;
  }
}
</style>
