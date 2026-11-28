<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { AlertTriangle, Check, Loader2, X } from 'lucide-vue-next'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import { bookingService, type BookingOverview, type BookingPage } from '@/service/booking/booking-service'
import GoogleConnectionCard from './GoogleConnectionCard.vue'
import { useBookingSettings } from '../../composables/useBookingSettings'

const props = defineProps<{ page: BookingPage; overview: BookingOverview }>()
const emit = defineEmits<{ googleChanged: [] }>()

const { savePage } = useBookingSettings()
const { success: showSuccess, error: showError } = useToast()

const form = reactive({ slug: '', displayName: '', headline: '', active: true })

function reset() {
  Object.assign(form, {
    slug: props.page.slug,
    displayName: props.page.displayName ?? '',
    headline: props.page.headline ?? '',
    active: props.page.active,
  })
}
reset()
watch(() => props.page, reset)

const slugChanged = computed(() => form.slug !== props.page.slug)
const dirty = computed(
  () =>
    slugChanged.value ||
    form.displayName !== (props.page.displayName ?? '') ||
    form.headline !== (props.page.headline ?? '') ||
    form.active !== props.page.active,
)

const slugCheck = ref<{ state: 'idle' | 'checking' | 'ok' | 'bad'; reason?: string | null }>({
  state: 'idle',
})
const runCheck = useDebounceFn(async (value: string) => {
  if (value !== form.slug) return
  try {
    const result = await bookingService.checkSlug(value)
    if (value === form.slug) {
      slugCheck.value = result.available ? { state: 'ok' } : { state: 'bad', reason: result.reason }
    }
  } catch {
    slugCheck.value = { state: 'idle' }
  }
}, 350)

watch(
  () => form.slug,
  (value) => {
    if (value === props.page.slug) {
      slugCheck.value = { state: 'idle' }
      return
    }
    slugCheck.value = { state: 'checking' }
    void runCheck(value)
  },
)

function onSlugInput(event: Event) {
  form.slug = (event.target as HTMLInputElement).value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 40)
}

const canSave = computed(
  () =>
    dirty.value &&
    !savePage.isPending.value &&
    (!slugChanged.value || slugCheck.value.state === 'ok'),
)

const prefix = computed(() => `${props.overview.publicBaseUrl.replace(/^https?:\/\//, '')}/`)

async function save() {
  if (!canSave.value) return
  try {
    await savePage.mutateAsync({
      slug: slugChanged.value ? form.slug : undefined,
      displayName: form.displayName.trim() || null,
      headline: form.headline.trim() || null,
      active: form.active,
    })
    showSuccess('Página atualizada')
  } catch (e) {
    showError(getApiErrorMessage(e, 'Não foi possível salvar.'))
  }
}
</script>

<template>
  <div class="pset">
    <form class="pset__card bk-card" @submit.prevent="save">
      <div class="pset__row pset__row--switch">
        <div>
          <p class="pset__title">Página no ar</p>
          <p class="bk-hint">Desligada, o link responde que a agenda não está recebendo agendamentos.</p>
        </div>
        <label class="bk-switch">
          <input v-model="form.active" type="checkbox" aria-label="Página no ar" />
          <span />
        </label>
      </div>

      <label class="bk-field">
        <span class="bk-label">Endereço</span>
        <span class="bk-affix">
          <span class="bk-affix__prefix">{{ prefix }}</span>
          <input :value="form.slug" type="text" spellcheck="false" autocomplete="off" @input="onSlugInput" />
        </span>
        <span v-if="slugCheck.state === 'checking'" class="bk-hint pset__hint">
          <Loader2 :size="11" class="bk-spin" /> Conferindo...
        </span>
        <span v-else-if="slugCheck.state === 'bad'" class="bk-hint bk-hint--err pset__hint">
          <X :size="11" /> {{ slugCheck.reason }}
        </span>
        <span v-else-if="slugCheck.state === 'ok'" class="bk-hint bk-hint--ok pset__hint">
          <Check :size="11" /> Disponível
        </span>
        <span v-if="slugChanged" class="bk-alert bk-alert--warn pset__warn">
          <AlertTriangle :size="14" />
          O link antigo para de funcionar. Os convites já enviados continuam valendo (o link de
          remarcar não depende do endereço), mas quem tiver o endereço antigo salvo vai dar com 404.
        </span>
      </label>

      <label class="bk-field">
        <span class="bk-label">Nome exibido</span>
        <input v-model="form.displayName" class="bk-input" maxlength="80" placeholder="Seu nome no Nevo" />
        <span class="bk-hint">Vazio usa o nome da sua conta.</span>
      </label>

      <label class="bk-field">
        <span class="bk-label">Frase abaixo do nome</span>
        <input
          v-model="form.headline"
          class="bk-input"
          maxlength="140"
          placeholder="Ex.: CEO da Fluviotec"
        />
      </label>

      <div class="pset__actions">
        <button type="button" class="bk-btn bk-btn--ghost" :disabled="!dirty || savePage.isPending.value" @click="reset()">
          Descartar
        </button>
        <button type="submit" class="bk-btn bk-btn--primary" :disabled="!canSave">
          <Loader2 v-if="savePage.isPending.value" :size="14" class="bk-spin" />
          Salvar
        </button>
      </div>
    </form>

    <section class="pset__card bk-card">
      <p class="pset__title">Google Calendar</p>
      <p class="bk-hint">
        Sua disponibilidade é conferida no calendário principal desta conta, e as reuniões são criadas
        nele com Google Meet.
      </p>
      <GoogleConnectionCard :google="overview.google" @changed="emit('googleChanged')" />
    </section>
  </div>
</template>

<style scoped>
.pset {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.pset__card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
}

.pset__row--switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.pset__title {
  margin: 0 0 3px;
  color: var(--text);
  font-size: 14px;
  font-weight: 650;
}

.pset__hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.pset__warn {
  align-items: flex-start;
  margin-top: 4px;
}

.pset__warn :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--warn);
}

.pset__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 900px) {
  .pset {
    grid-template-columns: 1fr;
  }
}
</style>
