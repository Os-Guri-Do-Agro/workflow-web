<script setup lang="ts">
import { computed, ref } from 'vue'
import { Building2, Plus, QrCode as QrCodeIcon, RotateCw, User } from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import QrCard from './components/QrCard.vue'
import QrEditDialog from './components/QrEditDialog.vue'
import QrMetricsDialog from './components/QrMetricsDialog.vue'
import { useQrList, useQrMutations } from '@/composables/useQrCodes'
import type { QrCode, QrStyle } from '@/service/qr/qr-service'

const list = useQrList()
const { create, update, cancel, remove } = useQrMutations()

const qrs = computed<QrCode[]>(() => list.data.value ?? [])

// Agrupamento visual: meus QRs pessoais x QRs de empresa (o backend já traz os dois).
const personalQrs = computed(() => qrs.value.filter((q) => q.scope === 'personal'))
const companyQrs = computed(() => qrs.value.filter((q) => q.scope === 'company'))
// Só separa em seções quando existem os dois grupos; senão mostra uma grade única.
const grouped = computed(() => personalQrs.value.length > 0 && companyQrs.value.length > 0)

// ─── Criar / editar ───────────────────────────────────────────────────────────
const editOpen = ref(false)
const editing = ref<QrCode | null>(null)
const saving = computed(() => create.isPending.value || update.isPending.value)

function openCreate() {
  editing.value = null
  editOpen.value = true
}

function openEdit(qr: QrCode) {
  editing.value = qr
  editOpen.value = true
}

async function handleSubmit(payload: {
  targetUrl: string
  label: string
  active: boolean
  companyId: string | null
  style: QrStyle
}) {
  try {
    if (editing.value) {
      await update.mutateAsync({
        id: editing.value.id,
        data: {
          targetUrl: payload.targetUrl,
          label: payload.label,
          active: payload.active,
          companyId: payload.companyId,
          style: payload.style,
        },
      })
    } else {
      await create.mutateAsync({
        targetUrl: payload.targetUrl,
        label: payload.label || undefined,
        active: payload.active,
        companyId: payload.companyId,
        style: payload.style,
      })
    }
    editOpen.value = false
  } catch {
    // Toast já é disparado pelas mutations; mantém o dialog aberto p/ correção.
  }
}

// ─── Métricas ─────────────────────────────────────────────────────────────────
const metricsFor = ref<QrCode | null>(null)

// ─── Cancelar ─────────────────────────────────────────────────────────────────
const cancelTarget = ref<QrCode | null>(null)
async function confirmCancel() {
  if (!cancelTarget.value) return
  try {
    await cancel.mutateAsync(cancelTarget.value.id)
    cancelTarget.value = null
  } catch {
    /* toast já disparado */
  }
}

// ─── Excluir ──────────────────────────────────────────────────────────────────
const removeTarget = ref<QrCode | null>(null)
async function confirmRemove() {
  if (!removeTarget.value) return
  try {
    await remove.mutateAsync(removeTarget.value.id)
    removeTarget.value = null
  } catch {
    /* toast já disparado */
  }
}
</script>

<template>
  <div class="qr-view">
    <header class="qr-head">
      <div>
        <p class="qr-eyebrow">Ferramentas</p>
        <h1 class="qr-title">QR Codes</h1>
        <p class="qr-sub">Imprima uma vez e troque o destino quando quiser — com métricas de leitura.</p>
      </div>
      <button class="qr-new" type="button" @click="openCreate">
        <Plus :size="16" />
        <span>Novo QR</span>
      </button>
    </header>

    <!-- Loading -->
    <div v-if="list.isLoading.value" class="qr-grid">
      <div v-for="i in 3" :key="i" class="qr-skel">
        <Skeleton type="card" />
        <Skeleton type="text" :lines="2" />
      </div>
    </div>

    <!-- Erro -->
    <div v-else-if="list.isError.value" class="qr-state">
      <p class="qr-state-msg">Não foi possível carregar seus QR codes.</p>
      <button class="qr-retry" type="button" @click="() => list.refetch()">
        <RotateCw :size="15" />
        <span>Tentar de novo</span>
      </button>
    </div>

    <!-- Vazio -->
    <EmptyState
      v-else-if="!qrs.length"
      :icon="QrCodeIcon"
      title="Nenhum QR ainda"
      description="Crie um QR dinâmico: você imprime uma vez e pode trocar para onde ele aponta a qualquer momento, sem reimprimir."
    >
      <template #action>
        <button class="qr-new" type="button" @click="openCreate">
          <Plus :size="16" />
          <span>Criar primeiro QR</span>
        </button>
      </template>
    </EmptyState>

    <!-- Lista agrupada (Pessoais | Da empresa) quando há os dois grupos -->
    <template v-else-if="grouped">
      <section class="qr-group">
        <div class="qr-group-head">
          <User :size="15" />
          <h2 class="qr-group-title">Pessoais</h2>
          <span class="qr-group-count">{{ personalQrs.length }}</span>
        </div>
        <div class="qr-grid">
          <QrCard
            v-for="qr in personalQrs"
            :key="qr.id"
            :qr="qr"
            @edit="openEdit(qr)"
            @metrics="metricsFor = qr"
            @cancel="cancelTarget = qr"
            @remove="removeTarget = qr"
          />
        </div>
      </section>

      <section class="qr-group">
        <div class="qr-group-head">
          <Building2 :size="15" />
          <h2 class="qr-group-title">Da empresa</h2>
          <span class="qr-group-count">{{ companyQrs.length }}</span>
        </div>
        <div class="qr-grid">
          <QrCard
            v-for="qr in companyQrs"
            :key="qr.id"
            :qr="qr"
            @edit="openEdit(qr)"
            @metrics="metricsFor = qr"
            @cancel="cancelTarget = qr"
            @remove="removeTarget = qr"
          />
        </div>
      </section>
    </template>

    <!-- Grade única quando há só um grupo -->
    <div v-else class="qr-grid">
      <QrCard
        v-for="qr in qrs"
        :key="qr.id"
        :qr="qr"
        @edit="openEdit(qr)"
        @metrics="metricsFor = qr"
        @cancel="cancelTarget = qr"
        @remove="removeTarget = qr"
      />
    </div>

    <!-- Dialogs -->
    <QrEditDialog
      v-model="editOpen"
      :editing="editing"
      :loading="saving"
      @submit="handleSubmit"
    />

    <QrMetricsDialog
      v-if="metricsFor"
      :id="metricsFor.id"
      :label="metricsFor.label"
      @close="metricsFor = null"
    />

    <ConfirmDialog
      :model-value="!!cancelTarget"
      title="Cancelar este QR?"
      message="O link vai parar de redirecionar (responde como inativo). O QR não é apagado e as métricas continuam disponíveis — você pode reativá-lo editando."
      confirm-label="Cancelar QR"
      cancel-label="Voltar"
      :loading="cancel.isPending.value"
      @update:model-value="(v) => { if (!v) cancelTarget = null }"
      @confirm="confirmCancel"
    />

    <ConfirmDialog
      :model-value="!!removeTarget"
      title="Excluir este QR?"
      message="Esta ação apaga o QR e todas as suas métricas de leitura. Não dá para desfazer."
      confirm-label="Excluir"
      cancel-label="Voltar"
      danger
      :loading="remove.isPending.value"
      @update:model-value="(v) => { if (!v) removeTarget = null }"
      @confirm="confirmRemove"
    />
  </div>
</template>

<style scoped>
.qr-view {
  max-width: 1080px;
  margin: 0 auto;
  padding: 24px 20px 60px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.qr-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.qr-eyebrow {
  margin: 0 0 2px;
  color: var(--text-4);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.qr-title {
  margin: 0;
  font-size: var(--text-title-large, 24px);
  font-weight: 780;
  letter-spacing: -0.02em;
  color: var(--text);
}

.qr-sub {
  margin: 4px 0 0;
  color: var(--text-3);
  font-size: 13px;
  max-width: 520px;
}

.qr-new {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--accent-fg);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: filter var(--motion-fast) var(--motion-ease);
}

.qr-new:hover {
  filter: brightness(1.05);
}

.qr-group {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.qr-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-3);
}

.qr-group-title {
  margin: 0;
  font-size: 13px;
  font-weight: 750;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.qr-group-count {
  min-width: 22px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-3);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.qr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.qr-skel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.qr-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 60px 24px;
  text-align: center;
}

.qr-state-msg {
  margin: 0;
  color: var(--text-2);
  font-size: 14px;
}

.qr-retry {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}

.qr-retry:hover {
  border-color: var(--border-strong);
}

@media (max-width: 560px) {
  .qr-grid {
    grid-template-columns: 1fr;
  }
}
</style>
