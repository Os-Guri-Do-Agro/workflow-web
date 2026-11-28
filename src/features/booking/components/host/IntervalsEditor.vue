<script setup lang="ts">
/**
 * Lista de intervalos de UM dia ("09:00 – 12:00", "13:00 – 18:00"). Usado na
 * regra semanal e nas datas específicas. Valida na hora (fim antes do início,
 * sobreposição) com a mesma regra do servidor, para o erro aparecer ao lado do
 * campo e não só depois de salvar.
 */
import { computed } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import type { ClockInterval } from '@/service/booking/booking-service'
import { intervalsProblem, toClock, toMinutes } from '../../availability'

const model = defineModel<ClockInterval[]>({ required: true })
defineProps<{ dayLabel: string }>()

const problem = computed(() => intervalsProblem(model.value))

function update(index: number, key: 'start' | 'end', value: string) {
  model.value = model.value.map((interval, i) => (i === index ? { ...interval, [key]: value } : interval))
}

function add() {
  const last = model.value[model.value.length - 1]
  const start = last ? Math.min(toMinutes(last.end) + 60, 22 * 60) : 9 * 60
  model.value = [...model.value, { start: toClock(start), end: toClock(start + 60) }]
}

function remove(index: number) {
  model.value = model.value.filter((_, i) => i !== index)
}
</script>

<template>
  <div class="ie">
    <div v-for="(interval, index) in model" :key="index" class="ie__row">
      <input
        class="bk-input ie__time"
        type="time"
        step="300"
        :value="interval.start"
        :aria-label="`${dayLabel}: início do intervalo ${index + 1}`"
        @change="update(index, 'start', ($event.target as HTMLInputElement).value)"
      />
      <span class="ie__dash">–</span>
      <input
        class="bk-input ie__time"
        type="time"
        step="300"
        :value="interval.end"
        :aria-label="`${dayLabel}: fim do intervalo ${index + 1}`"
        @change="update(index, 'end', ($event.target as HTMLInputElement).value)"
      />
      <button
        type="button"
        class="bk-icon-btn"
        :aria-label="`Remover intervalo ${index + 1} de ${dayLabel}`"
        @click="remove(index)"
      >
        <X :size="14" />
      </button>
      <button
        v-if="index === model.length - 1"
        type="button"
        class="bk-icon-btn"
        :aria-label="`Adicionar intervalo em ${dayLabel}`"
        title="Adicionar intervalo"
        :disabled="model.length >= 8"
        @click="add"
      >
        <Plus :size="14" />
      </button>
    </div>
    <p v-if="problem" class="bk-hint bk-hint--err">{{ problem }}</p>
  </div>
</template>

<style scoped>
.ie {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ie__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ie__time {
  width: 112px;
  min-height: 36px;
  padding: 0 8px;
  font-variant-numeric: tabular-nums;
}

.ie__dash {
  color: var(--text-3);
}
</style>
