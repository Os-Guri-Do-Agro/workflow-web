<script setup lang="ts">
/**
 * "Meus avisos" (spec R2, C3): cada pessoa, em qualquer papel, escolhe como
 * recebe os avisos da ala NESTE grupo. O sino do Nevo recebe sempre; aqui é
 * o resto:
 * - push neste navegador (pedido de permissão pelo fluxo de push do Nevo:
 *   `useSystemNotification` + `usePushSubscription`);
 * - e-mail desligado, na hora (um por aviso) ou no resumo diário às 8h;
 * - os tipos silenciados (não chegam por push nem por e-mail).
 * Sem linha salva vale o padrão: push ligado e resumo diário.
 *
 * Cada mudança salva sozinha; a API recusou, a tela volta ao que estava.
 */
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { BellRing, Mail, MonitorSmartphone, VolumeX } from 'lucide-vue-next'
import Skeleton from '@/components/ui/Skeleton.vue'
import { usePushSubscription } from '@/composables/usePushSubscription'
import { useSystemNotification } from '@/composables/useSystemNotification'
import { useToast } from '@/composables/useToast'
import {
  getNotifyPrefs,
  saveNotifyPrefs,
  type NotifyEmailMode,
  type NotifyPrefs,
  type SaveNotifyPrefsBody,
} from '@/service/marketing/marketing-notify'
import { apiErrorMessage } from '../calendar/api-error'
import { useMarketing } from '../composables/useMarketing'
import LibraryCheck from '../library/LibraryCheck.vue'

const mk = useMarketing()
const qc = useQueryClient()
const toast = useToast()
const pushSub = usePushSubscription()
const system = useSystemNotification()

const key = computed(() => ['marketing', mk.groupId.value, 'notify', 'prefs'] as const)
const prefs = useQuery({
  queryKey: key,
  queryFn: () => getNotifyPrefs(mk.groupId.value!),
  enabled: computed(() => !!mk.groupId.value),
})

/** O que a tela mostra: o gravado, ou a escolha que acabou de sair (otimista). */
const draft = ref<Pick<NotifyPrefs, 'push' | 'email' | 'muted'> | null>(null)
watch(
  () => prefs.data.value,
  (data) => {
    if (data) draft.value = { push: data.push, email: data.email, muted: [...data.muted] }
  },
  { immediate: true },
)

const save = useMutation({
  mutationFn: (body: SaveNotifyPrefsBody) => saveNotifyPrefs(mk.groupId.value!, body),
  // Um refetch que já estava no ar traria o valor de ANTES por cima do salvo
  // (a tela voltava sozinha): cancela antes de mandar e antes de gravar.
  onMutate: () => qc.cancelQueries({ queryKey: key.value }),
  onSuccess: async (data) => {
    await qc.cancelQueries({ queryKey: key.value })
    qc.setQueryData(key.value, data)
    toast.success('Preferência salva.')
  },
  onError: (err) => {
    // Volta ao que está gravado.
    const data = prefs.data.value
    if (data) draft.value = { push: data.push, email: data.email, muted: [...data.muted] }
    toast.error(apiErrorMessage(err, 'Não deu para salvar a preferência.'))
  },
})

// ── Push ──────────────────────────────────────────────────────────────────
const permission = system.permission
const pushServerOn = computed(() => prefs.data.value?.pushAvailable ?? false)
const browserOk = pushSub.supported && system.supported
const subscribing = ref(false)

const pushStatus = computed(() => {
  if (!pushServerOn.value) {
    return { tone: 'muted', text: 'O push ainda não está ligado no servidor do Nevo. Os avisos continuam chegando no sino.' }
  }
  if (!browserOk) return { tone: 'muted', text: 'Este navegador não recebe push. Use o Chrome, o Edge ou o Firefox.' }
  if (permission.value === 'denied') {
    return { tone: 'warn', text: 'O navegador bloqueou as notificações do Nevo. Libere nas configurações do site e volte aqui.' }
  }
  if (permission.value !== 'granted') return { tone: 'muted', text: 'Este navegador ainda não pediu permissão para mostrar avisos.' }
  if (pushSub.subscribed.value) return { tone: 'ok', text: 'Este navegador recebe os avisos com a aba fechada.' }
  return { tone: 'muted', text: 'Permissão dada. Falta ligar este navegador.' }
})
const canAskBrowser = computed(
  () => pushServerOn.value && browserOk && permission.value !== 'denied' && !pushSub.subscribed.value,
)
// Permissão já dada (outra tela pediu): confere a assinatura deste navegador
// em silêncio, para a linha de estado dizer a verdade.
watch(
  () => [pushServerOn.value, permission.value, draft.value?.push] as const,
  ([server, perm, on]) => {
    if (server && on && perm === 'granted' && browserOk && !pushSub.subscribed.value) void pushSub.ensureSubscribed()
  },
  { immediate: true },
)

/** Mesmo fluxo do Nevo: pede a permissão no clique e assina este navegador. */
async function enableBrowser() {
  subscribing.value = true
  try {
    const result = permission.value === 'granted' ? 'granted' : await system.requestPermission()
    if (result !== 'granted') {
      toast.warning('Sem a permissão do navegador o push não chega aqui.')
      return
    }
    const ok = await pushSub.ensureSubscribed()
    if (ok) toast.success('Este navegador vai receber os avisos.')
    else toast.error('Não deu para ligar o push neste navegador. Tente de novo em instantes.')
  } finally {
    subscribing.value = false
  }
}

async function togglePush() {
  if (!draft.value) return
  const next = !draft.value.push
  draft.value.push = next
  save.mutate({ push: next })
  if (next && canAskBrowser.value) await enableBrowser()
}

// ── E-mail ────────────────────────────────────────────────────────────────
const EMAIL_OPTIONS: Array<{ value: NotifyEmailMode; label: string; hint: string }> = [
  { value: 'OFF', label: 'Desligado', hint: 'Nenhum e-mail da ala.' },
  { value: 'IMMEDIATE', label: 'Na hora', hint: 'Um e-mail por aviso, assim que ele chega.' },
  { value: 'DAILY', label: 'Resumo diário', hint: 'Um e-mail às 8h com os avisos que você ainda não leu.' },
]
function setEmail(value: NotifyEmailMode) {
  if (!draft.value || draft.value.email === value) return
  draft.value.email = value
  save.mutate({ email: value })
}

// ── Silenciados ──────────────────────────────────────────────────────────
const areas = computed(() => {
  const kinds = prefs.data.value?.kinds ?? []
  const order: string[] = []
  for (const k of kinds) if (!order.includes(k.area)) order.push(k.area)
  return order.map((area) => ({ area, kinds: kinds.filter((k) => k.area === area) }))
})
const mutedCount = computed(() => draft.value?.muted.length ?? 0)
// Manda só o tipo que mudou (delta): com a tela aberta em duas abas, silenciar
// um tipo numa não desfaz o que a outra acabou de mudar em outro tipo.
function toggleKind(kind: string) {
  if (!draft.value) return
  const wasMuted = draft.value.muted.includes(kind)
  draft.value.muted = wasMuted ? draft.value.muted.filter((k) => k !== kind) : [...draft.value.muted, kind]
  save.mutate(wasMuted ? { unmute: [kind] } : { mute: [kind] })
}
</script>

<template>
  <div class="mk-page mkn">
    <header class="mkn__head">
      <h2 class="mkn__title"><BellRing :size="18" aria-hidden="true" /> Meus avisos</h2>
      <p class="mk-hint">
        O sino do Nevo recebe todos os avisos da ala. Aqui você escolhe o que mais chega para você em
        <strong>{{ mk.group.value?.name }}</strong>. Vale só para você.
      </p>
    </header>

    <!-- O erro vem antes do "carregando": sem dado, `!draft` segurava o skeleton para sempre. -->
    <div v-if="prefs.isError.value && !draft" class="mk-load-error" role="alert">
      {{ apiErrorMessage(prefs.error.value, 'Não deu para abrir os seus avisos.') }}
      <button type="button" class="mk-btn mk-btn--ghost" @click="prefs.refetch()">Tentar de novo</button>
    </div>
    <div v-else-if="prefs.isLoading.value || !draft" class="mkn__loading">
      <Skeleton type="block" />
      <Skeleton type="block" />
    </div>
    <template v-else>
      <section class="mk-panel" data-section="push">
        <header class="mk-panel__head"><MonitorSmartphone :size="15" aria-hidden="true" /> Push</header>
        <div class="mk-panel__body mkn__body">
          <div class="mkn__row">
            <LibraryCheck :checked="draft.push" label="Receber os avisos por push" @toggle="togglePush" />
            <span class="mkn__text">
              <span class="mkn__label">Receber por push</span>
              <span class="mk-hint">A notificação aparece no computador ou no celular, mesmo com o Nevo fechado.</span>
            </span>
          </div>
          <p class="mkn__status" :data-tone="pushStatus.tone" data-testid="push-status">{{ pushStatus.text }}</p>
          <button
            v-if="draft.push && canAskBrowser"
            type="button"
            class="mk-btn mk-btn--primary mkn__cta"
            data-action="enable-browser"
            :disabled="subscribing"
            @click="enableBrowser"
          >
            Ligar neste navegador
          </button>
        </div>
      </section>

      <section class="mk-panel" data-section="email">
        <header class="mk-panel__head"><Mail :size="15" aria-hidden="true" /> E-mail</header>
        <div class="mk-panel__body mkn__body">
          <div class="mkn__seg" role="radiogroup" aria-label="Como receber por e-mail">
            <button
              v-for="o in EMAIL_OPTIONS"
              :key="o.value"
              type="button"
              role="radio"
              class="mkn__opt"
              :class="{ 'is-on': draft.email === o.value }"
              :aria-checked="draft.email === o.value"
              :data-email="o.value"
              @click="setEmail(o.value)"
            >
              <span class="mkn__opt-label">{{ o.label }}</span>
              <span class="mkn__opt-hint">{{ o.hint }}</span>
            </button>
          </div>
          <p v-if="prefs.data.value?.emailAddress && draft.email !== 'OFF'" class="mk-hint">
            Vai para {{ prefs.data.value.emailAddress }}.
          </p>
          <p v-if="!prefs.data.value?.emailAvailable" class="mkn__status" data-tone="muted" data-testid="email-status">
            O envio de e-mail ainda não está configurado no servidor do Nevo. A sua escolha fica salva e passa a valer
            quando ligar.
          </p>
        </div>
      </section>

      <section class="mk-panel" data-section="muted">
        <header class="mk-panel__head">
          <VolumeX :size="15" aria-hidden="true" /> Tipos de aviso
          <span v-if="mutedCount" class="mk-chip mkn__muted">{{ mutedCount }} {{ mutedCount === 1 ? 'silenciado' : 'silenciados' }}</span>
        </header>
        <div class="mk-panel__body mkn__body">
          <p class="mk-hint">
            Desmarque o que não quer receber por push nem por e-mail. O sino continua mostrando tudo.
          </p>
          <div v-for="a in areas" :key="a.area" class="mkn__area">
            <h3 class="mkn__area-title">{{ a.area }}</h3>
            <ul class="mkn__kinds">
              <li v-for="k in a.kinds" :key="k.kind" class="mkn__kind" :data-kind="k.kind">
                <LibraryCheck
                  :checked="!draft.muted.includes(k.kind)"
                  :label="`Receber: ${k.label}`"
                  @toggle="toggleKind(k.kind)"
                />
                <span :class="{ 'is-muted': draft.muted.includes(k.kind) }">{{ k.label }}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.mkn {
  max-width: 760px;
}
.mkn__head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mkn__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.mkn__loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.mkn__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mk-panel__head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mkn__row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.mkn__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 4px;
}
.mkn__label {
  font-weight: 600;
  font-size: 13px;
}
.mkn__status {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 12.5px;
  color: var(--text-2);
  background: var(--surface-2, var(--surface));
}
.mkn__status[data-tone='ok'] {
  border-color: color-mix(in srgb, var(--success) 40%, var(--border));
  color: var(--text);
}
.mkn__status[data-tone='warn'] {
  border-color: color-mix(in srgb, var(--warn, #b45309) 45%, var(--border));
  color: var(--text);
}
.mkn__cta {
  align-self: flex-start;
}
.mkn__seg {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.mkn__opt {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.mkn__opt.is-on {
  border-color: var(--accent);
  background: var(--accent-soft, var(--surface));
  color: var(--accent-ink, var(--text));
}
.mkn__opt:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
.mkn__opt-label {
  font-weight: 700;
  font-size: 13px;
}
.mkn__opt-hint {
  font-size: 12px;
  color: var(--text-3);
}
.mkn__muted {
  margin-left: auto;
}
.mkn__area-title {
  margin: 4px 0 2px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-3);
}
.mkn__kinds {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.mkn__kind {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  font-size: 13px;
}
.mkn__kind .is-muted {
  color: var(--text-3);
  text-decoration: line-through;
}

@media (max-width: 640px) {
  .mkn__seg,
  .mkn__kinds {
    grid-template-columns: 1fr;
  }
  .mkn__opt,
  .mkn__kind {
    min-height: 44px;
  }
}
</style>
