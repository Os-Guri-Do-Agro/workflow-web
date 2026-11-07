<script setup lang="ts">
import { computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import Skeleton from '@/components/ui/Skeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { TriangleAlert } from 'lucide-vue-next'
import { getGroupDetail } from '@/service/marketing/marketing-settings'
import { getUserToken } from '@/utils/authContent'
import { useMarketing, useMarketingMembers } from '../composables/useMarketing'
import SettingsCompanies from '../settings/SettingsCompanies.vue'
import SettingsTeam from '../settings/SettingsTeam.vue'
import SettingsLists from '../settings/SettingsLists.vue'
import SettingsOwner from '../settings/SettingsOwner.vue'
import SettingsSocial from '../social/SettingsSocial.vue'
import SettingsCadence from '../settings/SettingsCadence.vue'
import SettingsAppConnection from '../settings/SettingsAppConnection.vue'

/**
 * Configurações da ala (fundação, spec ala-marketing/00-fundacao.md):
 * empresas do grupo e configurações do Dono (cargo maior), equipe e listas
 * de trabalho (Admin e Dono). Quem não pode mexer vê só a leitura.
 *
 * Abas por `?aba=` (o link da volta do OAuth e dos avisos abre direto na aba).
 * Cada parte registra a SUA aba em `TABS` e o bloco dela no template.
 * R2 (A): "Redes", contas das redes por marca.
 */
const route = useRoute()
const router = useRouter()
const TABS: Array<{ key: string; label: string }> = [
  { key: 'geral', label: 'Geral' },
  { key: 'redes', label: 'Redes' },
  // R2 (C4): meta de cadência por marca e rede.
  { key: 'cadencia', label: 'Cadência' },
  // R2 (B, M4): token do app por marca e o link do Looker Studio.
  { key: 'app', label: 'Conexão com o app' },
]
const tab = computed(() => {
  const q = route.query.aba
  return typeof q === 'string' && TABS.some((t) => t.key === q) ? q : 'geral'
})
function setTab(key: string) {
  const query = { ...route.query }
  if (key === 'geral') delete query.aba
  else query.aba = key
  void router.replace({ query })
}

/** Abas com teclado: setas, Home e End trocam e levam o foco (padrão ARIA de tabs). */
function onTabKey(event: KeyboardEvent, index: number) {
  const last = TABS.length - 1
  const next =
    event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
        : event.key === 'Home' ? 0
          : event.key === 'End' ? last
            : null
  if (next === null) return
  event.preventDefault()
  const key = TABS[next]?.key
  if (!key) return
  setTab(key)
  void nextTick(() => document.getElementById(`ms-tab-${key}`)?.focus())
}

const mk = useMarketing()
const members = useMarketingMembers(mk.groupId)
const detail = useQuery({
  queryKey: computed(() => ['marketing', mk.groupId.value ?? '-', 'settings', 'detail']),
  queryFn: () => getGroupDetail(mk.groupId.value!),
  enabled: computed(() => !!mk.groupId.value),
})

const myId = computed(() => getUserToken()?.sub ?? null)
const isOwner = computed(() => mk.role.value === 'OWNER')
const canEditLists = computed(() => mk.can('ADMIN'))
</script>

<template>
  <div class="mk-page">
    <div v-if="detail.isLoading.value || members.isLoading.value" class="ms__loading">
      <Skeleton type="block" />
      <Skeleton type="block" />
    </div>
    <EmptyState
      v-else-if="detail.isError.value || !detail.data.value || !mk.groupId.value || !mk.role.value"
      :icon="TriangleAlert"
      title="Não deu para abrir as configurações"
      description="Recarregue a página. Se continuar, fale com o Dono do grupo."
    />
    <template v-else>
      <div class="ms__tabs" role="tablist" aria-label="Seções das configurações">
        <button
          v-for="(t, i) in TABS"
          :id="`ms-tab-${t.key}`"
          :key="t.key"
          type="button"
          role="tab"
          class="ms__tab"
          :class="{ 'is-on': tab === t.key }"
          :aria-selected="tab === t.key"
          aria-controls="ms-panel"
          :tabindex="tab === t.key ? 0 : -1"
          :data-tab="t.key"
          @click="setTab(t.key)"
          @keydown="onTabKey($event, i)"
        >
          {{ t.label }}
        </button>
      </div>
      <div id="ms-panel" class="ms__panel" role="tabpanel" :aria-labelledby="`ms-tab-${tab}`">
      <template v-if="tab === 'geral'">
        <SettingsOwner
          v-if="isOwner && mk.settings.value"
          :group-id="mk.groupId.value"
          :detail="detail.data.value"
          :settings="mk.settings.value"
        />
        <SettingsCompanies :group-id="mk.groupId.value" :detail="detail.data.value" :is-owner="isOwner" />
        <SettingsTeam
          :group-id="mk.groupId.value"
          :members="members.data.value ?? []"
          :brands="mk.brands.value"
          :my-role="mk.role.value"
          :my-id="myId"
        />
        <SettingsLists
          v-if="mk.settings.value"
          :group-id="mk.groupId.value"
          :settings="mk.settings.value"
          :can-edit="canEditLists"
        />
      </template>
      <SettingsSocial
        v-else-if="tab === 'redes'"
        :group-id="mk.groupId.value"
        :brands="mk.brands.value"
        :can-manage="canEditLists"
      />
      <SettingsCadence
        v-else-if="tab === 'cadencia'"
        :group-id="mk.groupId.value"
        :brands="mk.brands.value"
        :can-edit="canEditLists"
      />
      <SettingsAppConnection
        v-else-if="tab === 'app' && mk.settings.value"
        :group-id="mk.groupId.value"
        :brands="mk.brands.value"
        :settings="mk.settings.value"
        :is-owner="isOwner"
        :can-edit="canEditLists"
      />
      </div>
    </template>
  </div>
</template>

<style scoped>
.ms__panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.ms__loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ms__tabs {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid var(--border);
}

.ms__tab {
  flex: none;
  min-height: 34px;
  padding: 4px 12px;
  margin-bottom: -1px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.ms__tab.is-on {
  border-bottom-color: var(--accent);
  color: var(--accent-ink);
}

.ms__tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

@media (max-width: 640px) {
  .ms__tab {
    min-height: 44px;
  }
}
</style>
