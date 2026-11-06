<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { getApiErrorMessage } from '@/service/api'
import { createGroup, getAvailableCompanies } from '@/service/marketing/marketing-settings'
import { useToast } from '@/composables/useToast'
import LibraryCheck from '../library/LibraryCheck.vue'
import SettingsDialog from './SettingsDialog.vue'

/**
 * Criar o grupo de empresas (quem cria vira Dono). Só aparecem empresas que a
 * pessoa administra e que não estão em outro grupo.
 */
const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; created: [groupId: string] }>()
const toast = useToast()
const queryClient = useQueryClient()

const available = useQuery({
  queryKey: ['marketing', 'me', 'available-companies'],
  queryFn: () => getAvailableCompanies(),
  enabled: computed(() => props.modelValue),
})

const name = ref('')
const picked = ref<string[]>([])
function togglePick(id: string) {
  picked.value = picked.value.includes(id) ? picked.value.filter((x) => x !== id) : [...picked.value, id]
}
const busy = ref(false)
const error = ref('')

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      name.value = ''
      picked.value = []
      error.value = ''
    }
  },
)

async function submit() {
  error.value = ''
  busy.value = true
  try {
    const group = await createGroup({ name: name.value.trim(), companyIds: picked.value })
    toast.success(`Grupo ${group.name} criado`)
    await queryClient.invalidateQueries({ queryKey: ['marketing'] })
    emit('created', group.id)
    emit('update:modelValue', false)
  } catch (e) {
    error.value = getApiErrorMessage(e, 'Não deu para criar o grupo.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <SettingsDialog :model-value="modelValue" title="Criar grupo de empresas" :loading="busy" @update:model-value="emit('update:modelValue', $event)">
    <p class="mk-hint">
      As empresas do grupo dividem uma ala Marketing só, cada uma como marca. Você vira o Dono e decide quem entra.
    </p>
    <div class="mk-field">
      <label class="mk-label" for="cg-name">Nome do grupo</label>
      <input id="cg-name" v-model="name" class="mk-input" type="text" maxlength="80" placeholder="Ex.: Grupo Fluvio" />
    </div>
    <fieldset class="cg__companies">
      <legend class="mk-label">Empresas</legend>
      <p v-if="available.isLoading.value" class="mk-hint">Carregando...</p>
      <p v-else-if="!available.data.value?.length" class="mk-hint">
        Nenhuma empresa livre: você precisa ser Admin de uma empresa que ainda não esteja em outro grupo.
      </p>
      <label v-for="c in available.data.value ?? []" :key="c.id" class="cg__company" :data-company="c.id">
        <LibraryCheck :checked="picked.includes(c.id)" :label="`Escolher ${c.name}`" @toggle="togglePick(c.id)" />
        {{ c.name }}
      </label>
    </fieldset>
    <p v-if="error" class="mk-error" role="alert">{{ error }}</p>
    <template #footer>
      <button type="button" class="mk-btn mk-btn--ghost" :disabled="busy" @click="emit('update:modelValue', false)">Cancelar</button>
      <button
        type="button"
        class="mk-btn mk-btn--primary"
        :disabled="busy || name.trim().length < 2 || !picked.length"
        @click="submit"
      >
        Criar grupo
      </button>
    </template>
  </SettingsDialog>
</template>

<style scoped>
.cg__companies {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: 0;
}

.cg__companies legend {
  margin-bottom: 6px;
}

.cg__company {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  cursor: pointer;
}
</style>
