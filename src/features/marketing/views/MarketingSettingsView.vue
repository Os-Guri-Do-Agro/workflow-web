<script setup lang="ts">
import { computed } from 'vue'
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

/**
 * Configurações da ala (fundação, spec ala-marketing/00-fundacao.md):
 * empresas do grupo e configurações do Dono (cargo maior), equipe e listas
 * de trabalho (Admin e Dono). Quem não pode mexer vê só a leitura.
 */
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
  </div>
</template>

<style scoped>
.ms__loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
