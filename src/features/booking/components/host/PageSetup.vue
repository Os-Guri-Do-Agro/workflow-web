<script setup lang="ts">
/**
 * Primeiro acesso: escolher o endereço e o fuso. Só isso. A página nasce com
 * expediente comum (seg-sex, 9-12 e 13-18) e um tipo de 30 min, prontos para
 * divulgar; o resto se ajusta depois, com o link já funcionando.
 */
import { computed, ref, watch } from 'vue'
import { CalendarHeart, Check, Loader2, X } from 'lucide-vue-next'
import { useDebounceFn } from '@vueuse/core'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import { bookingService } from '@/service/booking/booking-service'
import TimezoneSelect from '../TimezoneSelect.vue'
import { browserTimeZone } from '../../booking-time'
import { useBookingSettings } from '../../composables/useBookingSettings'

const props = defineProps<{ suggestedSlug: string | null; publicBaseUrl: string }>()

const { savePage } = useBookingSettings()
const { success: showSuccess, error: showError } = useToast()

const slug = ref(props.suggestedSlug ?? '')
const timezone = ref(browserTimeZone())
const check = ref<{ state: 'idle' | 'checking' | 'ok' | 'bad'; reason?: string | null }>({
  state: 'idle',
})

const prefix = computed(() => `${props.publicBaseUrl.replace(/^https?:\/\//, '')}/`)

/** Normaliza enquanto digita: minúsculas, sem acento, espaço vira hífen. */
function onInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  slug.value = raw
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 40)
}

const runCheck = useDebounceFn(async (value: string) => {
  if (value !== slug.value) return
  try {
    const result = await bookingService.checkSlug(value)
    if (value !== slug.value) return
    check.value = result.available ? { state: 'ok' } : { state: 'bad', reason: result.reason }
  } catch {
    check.value = { state: 'idle' }
  }
}, 350)

watch(
  slug,
  (value) => {
    if (!value) {
      check.value = { state: 'idle' }
      return
    }
    check.value = { state: 'checking' }
    void runCheck(value)
  },
  { immediate: true },
)

const canSubmit = computed(() => check.value.state === 'ok' && !savePage.isPending.value)

async function submit() {
  if (!canSubmit.value) return
  try {
    await savePage.mutateAsync({ slug: slug.value.replace(/^-+|-+$/g, ''), timezone: timezone.value })
    showSuccess('Página criada. Já dá para divulgar o link.')
  } catch (e) {
    showError(getApiErrorMessage(e, 'Não foi possível criar a página.'))
  }
}
</script>

<template>
  <section class="ps bk-card">
    <span class="ps__icon"><CalendarHeart :size="24" /></span>
    <h2>Crie sua página de agendamento</h2>
    <p class="ps__lead">
      Um link seu para clientes e parceiros escolherem um horário livre na sua agenda. A reunião entra
      no seu Google Calendar com link do Meet, e a outra pessoa recebe o convite por e-mail, no fuso
      dela.
    </p>

    <form class="ps__form" @submit.prevent="submit">
      <label class="bk-field">
        <span class="bk-label">Endereço da página</span>
        <span class="bk-affix">
          <span class="bk-affix__prefix">{{ prefix }}</span>
          <input
            :value="slug"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="seu-nome"
            :aria-invalid="check.state === 'bad'"
            @input="onInput"
          />
        </span>
        <span v-if="check.state === 'checking'" class="bk-hint">
          <Loader2 :size="11" class="bk-spin" /> Conferindo...
        </span>
        <span v-else-if="check.state === 'ok'" class="bk-hint bk-hint--ok">
          <Check :size="11" /> Disponível
        </span>
        <span v-else-if="check.state === 'bad'" class="bk-hint bk-hint--err">
          <X :size="11" /> {{ check.reason }}
        </span>
        <span v-else class="bk-hint">Curto e fácil de ditar. Não muda depois de divulgado.</span>
      </label>

      <label class="bk-field">
        <span class="bk-label">Seu fuso horário</span>
        <TimezoneSelect v-model="timezone" />
        <span class="bk-hint">
          Seus horários de atendimento são definidos neste fuso. Quem marca vê tudo convertido para o
          fuso dela.
        </span>
      </label>

      <button type="submit" class="bk-btn bk-btn--primary ps__submit" :disabled="!canSubmit">
        <Loader2 v-if="savePage.isPending.value" :size="14" class="bk-spin" />
        Criar minha página
      </button>
    </form>
  </section>
</template>

<style scoped>
.ps {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  max-width: 620px;
  padding: 28px;
}

.ps__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}

.ps h2 {
  margin: 6px 0 0;
  color: var(--text);
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.ps__lead {
  margin: 0;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.6;
}

.ps__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  margin-top: 12px;
}

.ps__form .bk-hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.ps__submit {
  align-self: flex-start;
  min-height: 40px;
  padding: 0 20px;
}
</style>
