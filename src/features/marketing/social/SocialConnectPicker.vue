<script setup lang="ts">
/**
 * Volta do OAuth (R2, A1; auditoria da parte A, achados 1 e 5): o callback
 * não grava nada. Aqui, logada, a pessoa que conectou vê o que a rede trouxe
 * (páginas, Instagram, contas de anúncio), escolhe a marca de destino e marca
 * só o que é dessa marca. Conta que já está em outra marca vem travada, com o
 * motivo. Confirmar grava; Cancelar descarta (a reserva vale 10 minutos).
 */
import { computed, ref, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { AlertTriangle, Loader2, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { useToast } from '@/composables/useToast'
import { getApiErrorMessage } from '@/service/api'
import {
  confirmPendingConnection,
  discardPendingConnection,
  getPendingConnection,
  type PendingConnection,
} from '@/service/marketing/marketing-social'
import { asText } from '../select-items'
import { networkIcon } from './network-icons'
import { PROVIDER_SHORT, socialKeys, socialPendingKey } from './social-meta'

const props = defineProps<{ groupId: string; connectionKey: string | null }>()
const emit = defineEmits<{
  close: []
  done: [result: { provider: string; saved: number; blocked: string[]; brandName: string }]
}>()

const toast = useToast()
const queryClient = useQueryClient()

const open = computed(() => !!props.connectionKey)
const pending = useQuery({
  queryKey: computed(() => socialPendingKey(props.groupId, props.connectionKey ?? '')),
  queryFn: () => getPendingConnection(props.groupId, props.connectionKey!),
  enabled: computed(() => !!props.groupId && !!props.connectionKey),
  retry: false,
  staleTime: Infinity,
})

const target = ref('')
const picked = ref<Set<string>>(new Set())
const saving = ref(false)
const discarding = ref(false)
const error = ref('')

function blockedFor(item: PendingConnection['items'][number], brandId: string): string | null {
  if (!item.linkedTo || item.linkedTo.companyId === brandId) return null
  // Marca que a pessoa não vê: a API não manda o nome (nem o id), e ela não teria como desconectar lá.
  if (item.linkedTo.hidden) return 'Já está em outra marca do grupo; peça a um Admin dela para desconectar.'
  return `Já está na marca ${item.linkedTo.name}. Desconecte lá antes de trazer para cá.`
}

/** Ao abrir (ou trocar a marca): marca só o que JÁ é desta marca (reconectar). */
function preset(data: PendingConnection, brandId: string) {
  picked.value = new Set(data.items.filter((i) => i.linkedTo?.companyId === brandId).map((i) => i.ref))
}

watch(
  () => pending.data.value,
  (data) => {
    if (!data) return
    target.value = data.companyId ?? data.brands[0]?.id ?? ''
    preset(data, target.value)
    error.value = ''
  },
  { immediate: true },
)

const brandItems = computed(() => (pending.data.value?.brands ?? []).map((b) => ({ label: b.name, value: b.id })))
const brandName = computed(() => pending.data.value?.brands.find((b) => b.id === target.value)?.name ?? 'a marca')
const providerName = computed(() => {
  const p = pending.data.value?.provider
  return p ? (PROVIDER_SHORT[p] ?? p) : 'a rede'
})

function setTarget(value: unknown) {
  const v = asText(value)
  if (!v || v === target.value || !pending.data.value) return
  target.value = v
  preset(pending.data.value, v)
}

function toggle(ref: string, on: boolean) {
  const next = new Set(picked.value)
  if (on) next.add(ref)
  else next.delete(ref)
  picked.value = next
}

const chosen = computed(() =>
  (pending.data.value?.items ?? []).filter((i) => picked.value.has(i.ref) && !blockedFor(i, target.value)),
)

const notFound = computed(() => {
  const e = pending.error.value as { response?: { status?: number } } | null
  return e?.response?.status === 404
})

async function confirm() {
  if (!props.connectionKey || !chosen.value.length || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const res = await confirmPendingConnection(props.groupId, props.connectionKey, {
      companyId: target.value,
      refs: chosen.value.map((i) => i.ref),
    })
    await queryClient.invalidateQueries({ queryKey: socialKeys.all(props.groupId) })
    emit('done', { provider: res.provider, saved: res.saved, blocked: res.blocked, brandName: brandName.value })
  } catch (err) {
    error.value = getApiErrorMessage(err, 'Não deu para conectar as contas.')
  } finally {
    saving.value = false
  }
}

async function cancel() {
  if (saving.value) return
  if (props.connectionKey && pending.data.value) {
    discarding.value = true
    try {
      await discardPendingConnection(props.groupId, props.connectionKey)
    } catch {
      // Venceu ou já foi usada: nada a descartar.
    } finally {
      discarding.value = false
    }
    toast.info('Nada foi conectado.')
  }
  emit('close')
}
</script>

<template>
  <AppDialog :model-value="open" label="Escolher as contas para conectar" size="lg" :loading="saving" persistent @update:model-value="(v) => { if (!v) void cancel() }">
    <div class="scp" data-testid="connect-picker">
      <header class="scp__head">
        <h2>Escolha o que entra em cada marca</h2>
        <button type="button" class="mk-icon-btn" aria-label="Fechar" :disabled="saving" @click="cancel">
          <X :size="16" />
        </button>
      </header>
      <div class="scp__body">
        <div v-if="pending.isLoading.value" class="scp__loading">
          <Skeleton type="row" />
          <Skeleton type="row" />
        </div>
        <div v-else-if="pending.isError.value" class="mk-load-error" role="alert" data-testid="connect-picker-error">
          <p>
            {{
              notFound
                ? 'Esta conexão não existe mais ou venceu (vale 10 minutos, e só para quem clicou em Conectar). Clique em Conectar de novo.'
                : getApiErrorMessage(pending.error.value, 'Não deu para abrir a conexão.')
            }}
          </p>
          <button v-if="!notFound" type="button" class="mk-btn" @click="pending.refetch()">Tentar de novo</button>
        </div>
        <template v-else-if="pending.data.value">
          <p class="mk-hint">
            {{ providerName }} trouxe tudo o que esta pessoa administra. Marque só o que é da marca escolhida: cada marca
            publica com as contas dela, e quem é só desta marca vê e usa estas contas.
          </p>
          <div class="mk-field scp__brand" data-field="brand">
            <span class="mk-label">Conectar na marca</span>
            <AppSelect
              :model-value="target"
              :items="brandItems"
              label="Marca que recebe as contas"
              density="compact"
              :disabled="saving"
              @update:model-value="setTarget($event)"
            />
          </div>
          <ul class="scp__list" role="list">
            <li
              v-for="item in pending.data.value.items"
              :key="item.ref"
              class="scp__row"
              :class="{ 'is-blocked': !!blockedFor(item, target) }"
              :data-network="item.network"
              :data-name="item.username ?? item.name"
            >
              <label class="scp__pick">
                <input
                  type="checkbox"
                  class="scp__check"
                  :checked="picked.has(item.ref) && !blockedFor(item, target)"
                  :disabled="saving || !!blockedFor(item, target)"
                  :aria-describedby="blockedFor(item, target) ? `why-${item.ref}` : undefined"
                  @change="toggle(item.ref, ($event.target as HTMLInputElement).checked)"
                />
                <component :is="networkIcon(item.network)" :size="16" class="scp__icon" aria-hidden="true" />
                <span class="scp__main">
                  <span class="scp__line">
                    <span class="scp__name">{{ item.name }}</span>
                    <span v-if="item.username" class="scp__sub">@{{ item.username.replace(/^@/, '') }}</span>
                    <span class="scp__sub">{{ item.networkLabel }}</span>
                  </span>
                  <span v-if="item.pageName || item.currency" class="scp__meta">
                    <template v-if="item.pageName">Página {{ item.pageName }}</template>
                    <template v-if="item.currency"> Moeda {{ item.currency }}</template>
                  </span>
                  <span v-if="blockedFor(item, target)" :id="`why-${item.ref}`" class="scp__why">
                    {{ blockedFor(item, target) }}
                  </span>
                  <span v-else-if="item.linkedTo" class="scp__meta">Já está nesta marca: marcar renova o acesso.</span>
                </span>
              </label>
            </li>
          </ul>
          <p v-if="error" class="mk-error" role="alert">
            <AlertTriangle :size="14" aria-hidden="true" /> {{ error }}
          </p>
        </template>
      </div>
      <footer class="scp__foot">
        <span class="scp__count" aria-live="polite">
          <template v-if="pending.data.value">{{ chosen.length }} {{ chosen.length === 1 ? 'conta marcada' : 'contas marcadas' }}</template>
        </span>
        <button type="button" class="mk-btn mk-btn--ghost" :disabled="saving || discarding" data-action="discard-connection" @click="cancel">
          {{ pending.data.value ? 'Cancelar' : 'Fechar' }}
        </button>
        <button
          v-if="pending.data.value"
          type="button"
          class="mk-btn mk-btn--primary"
          :disabled="saving || !chosen.length"
          data-action="confirm-connection"
          @click="confirm"
        >
          <Loader2 v-if="saving" :size="14" class="scp__spin" aria-hidden="true" />
          Conectar {{ chosen.length || '' }} em {{ brandName }}
        </button>
      </footer>
    </div>
  </AppDialog>
</template>

<style scoped>
.scp {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  max-height: calc(100vh - 40px);
  max-height: calc(100dvh - 40px);
}

.scp__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px 8px;
}

.scp__head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.scp__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 16px 14px;
}

.scp__loading {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scp__brand {
  max-width: 320px;
}

.scp__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.scp__row {
  border-bottom: 1px solid var(--border);
}

.scp__row:last-child {
  border-bottom: 0;
}

.scp__row.is-blocked {
  background: var(--surface-2);
}

.scp__pick {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
}

.scp__row.is-blocked .scp__pick {
  cursor: not-allowed;
}

.scp__check {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 2px;
  accent-color: var(--accent);
}

.scp__icon {
  flex: none;
  margin-top: 2px;
  color: var(--text-2);
}

.scp__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.scp__line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 13px;
}

.scp__name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.scp__sub,
.scp__meta {
  color: var(--text-3);
  font-size: 12px;
}

.scp__why {
  color: var(--text-2);
  font-size: 12px;
}

.scp__foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 16px 14px;
  border-top: 1px solid var(--border);
}

.scp__count {
  margin-right: auto;
  color: var(--text-3);
  font-size: 12.5px;
}

.scp__spin {
  animation: scp-spin 0.9s linear infinite;
}

@keyframes scp-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .scp__brand {
    max-width: none;
  }

  .scp__pick {
    min-height: 44px;
  }

  .scp__check {
    width: 20px;
    height: 20px;
  }

  .scp__foot .mk-btn {
    min-height: 44px;
  }
}
</style>
