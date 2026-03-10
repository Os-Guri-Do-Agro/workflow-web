<script setup lang="ts">
import { computed } from 'vue'
import { useTasks } from '@/features/tasks/useTasks'
import type { SubTask } from '@/core/types'

const emit = defineEmits<{ close: [], submit: [], 'update:modelValue': [value: any] }>()
const props = defineProps<{ members: any[], modelValue: any }>()
const { companies, addActivity } = useTasks()

const form = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const valid = computed(() => !!form.value?.title?.trim())

const submit = () => {
  if (form.value?.title?.trim()) {
    emit('submit')
  }
}
</script>

<template>
  <v-card rounded="lg" color="primary">
    <v-card-title class="pa-4 d-flex justify-space-between align-center">
      <span class="text-h6 font-weight-bold text-secondary">Nova Atividade</span>
      <v-btn icon="mdi-close" variant="text" size="small" @click="emit('close')" />
    </v-card-title>

    <v-divider />

    <v-card-text class="pa-4">
      <v-text-field
        v-model="form.title"
        label="Título *"
        variant="outlined"
        rounded="lg"
        color="secondary"
        bg-color="primary"
        density="compact"
        prepend-inner-icon="mdi-text"
      />
        
        <v-textarea
          v-model="form.description"
          label="Descrição"
          rows="3"
          variant="outlined"
          rounded="lg"
          color="secondary"
          bg-color="primary"
          density="compact"
          prepend-inner-icon="mdi-text-box-outline"
          class="mt-3"
        />

        <v-select
          v-model="form.assignees"
          :items="props.members"
          item-title="user.name"
          item-value="user.id"
          label="Responsáveis"
          variant="outlined"
          rounded="lg"
          color="secondary"
          bg-color="primary"
          density="compact"
          prepend-inner-icon="mdi-account-outline"
          multiple
          chips
          closable-chips
          class="mt-3"
        />

        <div class="d-flex ga-3 mt-3">
          <v-text-field
            v-model="form.dueDate"
            label="Data de Entrega"
            type="date"
            variant="outlined"
            rounded="lg"
            color="secondary"
            bg-color="primary"
            density="compact"
            prepend-inner-icon="mdi-calendar-outline"
          />

          <v-select
            v-model="form.priorityNumber"
            :items="[0, 1, 2, 3, 4, 5]"
            label="Prioridade"
            variant="outlined"
            rounded="lg"
            color="secondary"
            bg-color="primary"
            density="compact"
            prepend-inner-icon="mdi-flag-outline"
          />
        </div>
    </v-card-text>

    <v-divider />

    <v-card-actions class="pa-4">
      <v-spacer />
      <v-btn variant="text" rounded="lg" @click="emit('close')">Cancelar</v-btn>
      <v-btn
        color="secondary"
        rounded="lg"
        elevation="0"
        :disabled="!valid"
        @click="submit"
      >
        Criar Atividade
      </v-btn>
    </v-card-actions>
  </v-card>
</template>
