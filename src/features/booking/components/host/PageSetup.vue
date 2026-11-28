<script setup lang="ts">
/**
 * Primeiro acesso, em dois passos: conectar o Google e escolher o endereço (e
 * o fuso). Só isso. A página nasce com expediente comum (seg-sex, 9-12 e
 * 13-18) e um tipo de 30 min, prontos para divulgar; o resto se ajusta depois,
 * com o link já funcionando.
 *
 * O passo do Google não trava o segundo: dá para criar a página antes e
 * conectar depois (ela só não aceita agendamento enquanto isso). Mas ele vem
 * primeiro porque, sem ele, o link nasce fora do ar.
 */
import { computed, ref, watch } from 'vue'
import { CalendarHeart, Check, Globe, Loader2, Video, X, Zap } from 'lucide-vue-next'
import { useDebounceFn } from '@vueuse/core'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import { bookingService, type GoogleHealth } from '@/service/booking/booking-service'
import GoogleConnectionCard from './GoogleConnectionCard.vue'
import TimezoneSelect from '../TimezoneSelect.vue'
import { browserTimeZone } from '../../booking-time'
import { useBookingSettings } from '../../composables/useBookingSettings'

const props = defineProps<{ suggestedSlug: string | null; publicBaseUrl: string; google: GoogleHealth }>()
const emit = defineEmits<{ googleChanged: [] }>()

const { savePage } = useBookingSettings()
const { success: showSuccess, error: showError } = useToast()

const slug = ref(props.suggestedSlug ?? '')
const timezone = ref(browserTimeZone())
const check = ref<{ state: 'idle' | 'checking' | 'ok' | 'bad'; reason?: string | null }>({
  state: 'idle',
})

const googleOk = computed(() => props.google.connected && props.google.healthy)
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
    <div class="ps__intro">
      <span class="ps__icon"><CalendarHeart :size="24" /></span>
      <h2>Crie sua página de agendamento</h2>
      <p class="ps__lead">
        Um link seu para clientes e parceiros escolherem um horário livre na sua agenda, sem troca de
        mensagens.
      </p>
      <ul class="ps__perks">
        <li>
          <Zap :size="15" />
          <span>Só aparecem os horários livres da sua agenda do Google, atualizados na hora.</span>
        </li>
        <li>
          <Video :size="15" />
          <span>A reunião nasce no seu Google Calendar com link do Meet, e o convite vai por e-mail.</span>
        </li>
        <li>
          <Globe :size="15" />
          <span>Cada pessoa vê os horários no próprio fuso. Ninguém chega uma hora atrasado.</span>
        </li>
      </ul>
    </div>

    <ol class="ps__steps">
      <li class="ps__step" :class="{ 'is-done': googleOk }">
        <span class="ps__num" aria-hidden="true">
          <Check v-if="googleOk" :size="14" :stroke-width="3" />
          <template v-else>1</template>
        </span>
        <div class="ps__step-body">
          <h3>Conecte o Google Calendar</h3>
          <p v-if="!googleOk" class="ps__step-desc">
            É dele que saem seus horários ocupados, e é nele que as reuniões são criadas.
          </p>
          <GoogleConnectionCard :google="google" variant="inline" @changed="emit('googleChanged')" />
        </div>
      </li>

      <li class="ps__step">
        <span class="ps__num" aria-hidden="true">2</span>
        <form class="ps__step-body ps__form" @submit.prevent="submit">
          <h3>Escolha o endereço</h3>
          <label class="bk-field">
            <span class="bk-label">Endereço da página</span>
            <span class="bk-affix" :aria-invalid="check.state === 'bad'">
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
            <span v-else class="bk-hint">Curto e fácil de ditar. Evite mudar depois de divulgado.</span>
          </label>

          <label class="bk-field">
            <span class="bk-label">Seu fuso horário</span>
            <TimezoneSelect v-model="timezone" />
            <span class="bk-hint">Seus horários de atendimento são definidos neste fuso.</span>
          </label>

          <div class="ps__submit">
            <button type="submit" class="bk-btn bk-btn--primary" :disabled="!canSubmit">
              <Loader2 v-if="savePage.isPending.value" :size="14" class="bk-spin" />
              Criar minha página
            </button>
            <span class="bk-hint">Ela já nasce com seg. a sex., das 9h às 12h e das 13h às 18h, e um tipo de 30 min. Tudo se ajusta depois.</span>
          </div>
        </form>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.ps {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  overflow: hidden;
}

/* ─── Apresentação ────────────────────────────────────────────────────────── */

.ps__intro {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 30px 28px;
  border-right: 1px solid var(--border);
  background:
    radial-gradient(420px 260px at 0% 0%, var(--accent-soft), transparent 70%),
    color-mix(in srgb, var(--surface-2) 40%, var(--surface));
}

.ps__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.ps__intro h2 {
  margin: 8px 0 0;
  color: var(--text);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.02em;
}

.ps__lead {
  margin: 0;
  color: var(--text-2);
  font-size: 13.5px;
  line-height: 1.6;
}

.ps__perks {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.ps__perks li {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 10px;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.5;
}

.ps__perks svg {
  margin-top: 2px;
  color: var(--accent-ink);
}

/* ─── Passos ──────────────────────────────────────────────────────────────── */

.ps__steps {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 10px 28px;
  list-style: none;
}

.ps__step {
  position: relative;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 14px;
  padding: 20px 0;
}

.ps__step + .ps__step {
  border-top: 1px solid var(--border);
}

.ps__num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-strong);
  border-radius: 50%;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 700;
}

.ps__step.is-done .ps__num {
  border-color: transparent;
  background: color-mix(in srgb, var(--success) 15%, transparent);
  color: var(--success);
}

.ps__step-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.ps__step-body h3 {
  margin: 4px 0 0;
  color: var(--text);
  font-size: 14.5px;
  font-weight: 650;
}

.ps__step-desc {
  margin: -6px 0 0;
  color: var(--text-3);
  font-size: 12.5px;
  line-height: 1.5;
}

.ps__form {
  gap: 16px;
}

.ps__submit {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
}

.ps__submit .bk-btn {
  min-height: 40px;
  padding: 0 20px;
}

@media (max-width: 900px) {
  .ps {
    grid-template-columns: minmax(0, 1fr);
  }

  .ps__intro {
    padding: 22px 20px;
    border-right: none;
    border-bottom: 1px solid var(--border);
  }

  .ps__steps {
    padding: 4px 20px;
  }
}
</style>
