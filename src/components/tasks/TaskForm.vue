<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTasks } from '@/features/tasks/useTasks'
import type { SubTask } from '@/core/types'

const emit = defineEmits<{ close: []; submit: []; 'update:modelValue': [value: any] }>()
const props = defineProps<{ members: any[]; modelValue: any; loading?: boolean }>()
const { companies, addActivity } = useTasks()

const form = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const attachmentError = ref('')

const onFileChange = (files: File | File[] | null) => {
  attachmentError.value = ''
  const file = Array.isArray(files) ? files[0] : files
  if (file && file.size > 10 * 1024 * 1024) {
    attachmentError.value = 'O arquivo deve ter menos de 10MB'
    emit('update:modelValue', { ...props.modelValue, attachment: null })
    return
  }
  emit('update:modelValue', { ...props.modelValue, attachment: file ?? null })
}

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
      <div class="d-flex ga-2 align-start">
        <v-textarea
          v-model="form.title"
          label="Título *"
          variant="outlined"
          rounded="lg"
          color="secondary"
          bg-color="primary"
          density="compact"
          prepend-inner-icon="mdi-text"
          rows="3"
          auto-grow
        />
      </div>

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

      <v-file-input
        label="Anexos"
        variant="outlined"
        rounded="lg"
        color="secondary"
        bg-color="primary"
        density="compact"
        prepend-inner-icon="mdi-paperclip"
        prepend-icon=""
        accept="*/*"
        :multiple="false"
        hide-details
        :error-messages="attachmentError"
        class="mt-3"
        @update:model-value="onFileChange"
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
      <v-btn variant="text" rounded="lg" :disabled="props.loading" @click="emit('close')"
        >Cancelar</v-btn
      >
      <v-btn
        color="secondary"
        rounded="lg"
        elevation="0"
        :disabled="!valid || props.loading"
        :loading="props.loading"
        @click="submit"
      >
        Criar Atividade
      </v-btn>
    </v-card-actions>
  </v-card>
</template>
