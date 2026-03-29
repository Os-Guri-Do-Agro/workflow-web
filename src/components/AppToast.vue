<script setup lang="ts">
import { useToast } from '@/composables/useToast'
import { CircleCheck, CircleX, AlertTriangle, Info } from 'lucide-vue-next'

const { toast, hideToast } = useToast()

const icons = { success: CircleCheck, error: CircleX, warning: AlertTriangle, info: Info }
</script>

<template>
  <v-snackbar
    v-model="toast.show"
    :color="toast.type"
    :timeout="toast.timeout"
    location="top right"
    rounded="lg"
  >
    <div class="d-flex align-center ga-2">
      <component :is="icons[toast.type]" :size="18" />
      <span>{{ toast.message }}</span>
    </div>
    <template #actions>
      <v-btn variant="text" density="compact" icon size="small" @click="hideToast">
        <v-icon size="16">mdi-close</v-icon>
      </v-btn>
    </template>
  </v-snackbar>
</template>
