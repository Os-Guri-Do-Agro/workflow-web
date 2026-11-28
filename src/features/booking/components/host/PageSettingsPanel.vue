<script setup lang="ts">
/**
 * Configuração da página: no ar ou pausada, endereço, nome e frase. Ao lado,
 * a prévia do topo da página pública, que muda enquanto se digita: é como o
 * cliente vai ver o nome e a frase, sem precisar abrir o link para conferir.
 */
import { computed, reactive, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { AlertTriangle, Check, Clock3, ExternalLink, Loader2, Video, X } from 'lucide-vue-next'
import { useToast } from '@/composables/useToast'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { getApiErrorMessage } from '@/service/api'
import { bookingService, type BookingOverview, type BookingPage } from '@/service/booking/booking-service'
import BookingAvatar from '../BookingAvatar.vue'
import GoogleConnectionCard from './GoogleConnectionCard.vue'
import { useBookingSettings } from '../../composables/useBookingSettings'
import { formatDuration } from '../../booking-time'

const props = defineProps<{ page: BookingPage; overview: BookingOverview }>()
const emit = defineEmits<{ googleChanged: [] }>()

const { savePage } = useBookingSettings()
const { success: showSuccess, error: showError } = useToast()
const { me } = useCurrentUser()

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

// ─── Prévia ─────────────────────────────────────────────────────────────────
const accountName = computed(() => (typeof me.value?.name === 'string' ? me.value.name : '') || 'Você')
const previewName = computed(() => form.displayName.trim() || accountName.value)
const previewAvatar = computed(() =>
  typeof me.value?.avatarUrl === 'string' ? (me.value.avatarUrl as string) : null,
)
const previewType = computed(() => props.page.eventTypes.find((t) => t.active) ?? null)

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
      <header>
        <h3 class="bk-card__title">Sua página</h3>
        <p class="bk-card__sub">O endereço que você divulga e como seu nome aparece para quem marca.</p>
      </header>

      <label class="pset__live" :class="{ 'is-off': !form.active }">
        <span class="pset__live-text">
          <span class="pset__live-title">{{ form.active ? 'Página no ar' : 'Página pausada' }}</span>
          <span class="bk-hint">
            {{ form.active ? 'Aceitando agendamentos pelo link.' : 'O link responde que a agenda não está recebendo agendamentos.' }}
          </span>
        </span>
        <span class="bk-switch">
          <input v-model="form.active" type="checkbox" aria-label="Página no ar" />
          <span />
        </span>
      </label>

      <label class="bk-field">
        <span class="bk-label">Endereço</span>
        <span class="bk-affix" :aria-invalid="slugCheck.state === 'bad'">
          <span class="bk-affix__prefix">{{ prefix }}</span>
          <input :value="form.slug" type="text" spellcheck="false" autocomplete="off" @input="onSlugInput" />
        </span>
        <span v-if="slugCheck.state === 'checking'" class="bk-hint">
          <Loader2 :size="11" class="bk-spin" /> Conferindo...
        </span>
        <span v-else-if="slugCheck.state === 'bad'" class="bk-hint bk-hint--err">
          <X :size="11" /> {{ slugCheck.reason }}
        </span>
        <span v-else-if="slugCheck.state === 'ok'" class="bk-hint bk-hint--ok">
          <Check :size="11" /> Disponível
        </span>
        <span v-if="slugChanged" class="bk-alert bk-alert--warn pset__warn">
          <AlertTriangle :size="15" />
          <span>
            O link antigo para de funcionar. Os convites já enviados continuam valendo (o link de
            remarcar não depende do endereço), mas quem tiver o endereço antigo salvo vai dar com 404.
          </span>
        </span>
      </label>

      <div class="pset__grid">
        <label class="bk-field">
          <span class="bk-label">Nome exibido</span>
          <input v-model="form.displayName" class="bk-input" maxlength="80" :placeholder="accountName" />
          <span class="bk-hint">Vazio usa o nome da sua conta.</span>
        </label>

        <label class="bk-field">
          <span class="bk-label">Frase abaixo do nome</span>
          <input v-model="form.headline" class="bk-input" maxlength="140" placeholder="Ex.: CEO da Fluviotec" />
          <span class="bk-hint">Cargo e empresa costumam bastar.</span>
        </label>
      </div>

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

    <div class="pset__side">
      <section class="pset__card bk-card">
        <header class="bk-card__head">
          <div>
            <h3 class="bk-card__title">Prévia</h3>
            <p class="bk-card__sub">O topo da sua página, como o convidado vê.</p>
          </div>
          <a :href="page.publicUrl" target="_blank" rel="noopener" class="bk-btn bk-btn--sm">
            <ExternalLink :size="13" />
            Abrir
          </a>
        </header>

        <div class="pv" :class="{ 'is-off': !form.active }" aria-hidden="true">
          <div class="pv__host">
            <BookingAvatar :name="previewName" :src="previewAvatar" :size="44" />
            <div class="pv__host-text">
              <p class="pv__name">{{ previewName }}</p>
              <p v-if="form.headline.trim()" class="pv__headline">{{ form.headline }}</p>
              <p v-else class="pv__headline pv__headline--empty">Sem frase</p>
            </div>
          </div>
          <div v-if="previewType" class="pv__event">
            <p class="pv__title">{{ previewType.title }}</p>
            <p class="pv__fact"><Clock3 :size="13" /> {{ formatDuration(previewType.durationMin) }}</p>
            <p class="pv__fact"><Video :size="13" /> Google Meet</p>
          </div>
          <span v-if="!form.active" class="bk-chip bk-chip--warn pv__paused">Pausada</span>
        </div>
        <p class="bk-hint">A foto é a do seu perfil no Nevo.</p>
      </section>

      <section class="pset__card bk-card">
        <header>
          <h3 class="bk-card__title">Google Calendar</h3>
          <p class="bk-card__sub">
            Sua disponibilidade é conferida no calendário principal desta conta, e as reuniões são
            criadas nele com Google Meet.
          </p>
        </header>
        <GoogleConnectionCard :google="overview.google" @changed="emit('googleChanged')" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.pset {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
  padding-top: 4px;
}

.pset__side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pset__card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
}

/* No ar / pausada: o interruptor mais importante da tela, em destaque. */
.pset__live {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--success) 35%, var(--border));
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--success) 6%, transparent);
  cursor: pointer;
}

.pset__live.is-off {
  border-color: color-mix(in srgb, var(--warn) 40%, var(--border));
  background: color-mix(in srgb, var(--warn) 7%, transparent);
}

.pset__live-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pset__live-title {
  color: var(--text);
  font-size: 13.5px;
  font-weight: 650;
}

.pset__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.pset__warn {
  margin-top: 4px;
}

.pset__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}

/* ─── Prévia ──────────────────────────────────────────────────────────────── */

.pv {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(360px 160px at 50% -20%, var(--accent-soft), transparent 75%),
    var(--bg);
  transition: opacity var(--motion) var(--motion-ease);
}

.pv.is-off > :not(.pv__paused) {
  opacity: 0.55;
}

.pv__host {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}

.pv__host-text {
  min-width: 0;
}

.pv p {
  margin: 0;
}

.pv__name {
  overflow: hidden;
  color: var(--text);
  font-size: 13.5px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pv__headline {
  margin-top: 1px !important;
  overflow: hidden;
  color: var(--text-3);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pv__headline--empty {
  color: var(--text-4);
  font-style: italic;
}

.pv__event {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.pv__title {
  color: var(--text);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.pv__fact {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
}

.pv__fact :deep(svg) {
  color: var(--text-3);
}

.pv__paused {
  position: absolute;
  top: 12px;
  right: 12px;
}

@media (max-width: 980px) {
  .pset {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 560px) {
  .pset__card {
    padding: 16px 14px;
  }

  .pset__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
