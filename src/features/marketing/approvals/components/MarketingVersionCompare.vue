<script setup lang="ts">
/**
 * Comparar duas versões lado a lado (no celular, uma embaixo da outra). Abre
 * com a anterior à esquerda e a atual à direita; cada lado troca de versão.
 */
import { computed, ref, watch } from 'vue'
import type { MarketingCardVersion } from '@/service/marketing/marketing-cards'
import { formatDayTime } from '../approvals-meta'
import MarketingVersionViewer from './MarketingVersionViewer.vue'

const props = defineProps<{
  groupId: string
  versions: MarketingCardVersion[]
  currentVersionId: string | null
  approvedVersionId: string | null
}>()

const leftId = ref('')
const rightId = ref('')

watch(
  () => props.versions.map((v) => v.id).join(),
  () => {
    const list = props.versions
    const currentIdx = Math.max(0, list.findIndex((v) => v.id === props.currentVersionId))
    const right = list[currentIdx] ?? list[list.length - 1]
    const left = list[currentIdx - 1] ?? list[0]
    rightId.value = right?.id ?? ''
    leftId.value = left?.id ?? ''
  },
  { immediate: true },
)

const left = computed(() => props.versions.find((v) => v.id === leftId.value) ?? null)
const right = computed(() => props.versions.find((v) => v.id === rightId.value) ?? null)

const sides = computed(() => [
  { key: 'left' as const, label: 'Versão da esquerda', id: leftId.value, version: left.value },
  { key: 'right' as const, label: 'Versão da direita', id: rightId.value, version: right.value },
])

function pick(side: 'left' | 'right', id: string) {
  if (side === 'left') leftId.value = id
  else rightId.value = id
}

function tag(v: MarketingCardVersion) {
  const parts = [`V${v.number}`]
  if (v.id === props.currentVersionId) parts.push('atual')
  if (v.id === props.approvedVersionId) parts.push('aprovada')
  return parts.join(', ')
}
</script>

<template>
  <div class="mkcmp" data-testid="compare">
    <section v-for="side in sides" :key="side.key" class="mkcmp__side" :data-side="side.key">
      <header class="mkcmp__head">
        <select
          class="mk-select mkcmp__sel"
          :aria-label="side.label"
          :value="side.id"
          @change="pick(side.key, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="v in versions" :key="v.id" :value="v.id">{{ tag(v) }}</option>
        </select>
        <span v-if="side.version" class="mkcmp__when">{{ formatDayTime(side.version.createdAt) }}</span>
      </header>
      <MarketingVersionViewer
        v-if="side.version"
        :group-id="groupId"
        :version="side.version"
        :comments="[]"
        :can-comment="false"
        :phone="false"
        :draft="null"
        :highlight-id="null"
        compact
      />
      <p v-if="side.version?.note" class="mkcmp__note">{{ side.version.note }}</p>
    </section>
  </div>
</template>

<style scoped>
.mkcmp {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  min-width: 0;
}

.mkcmp__side {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.mkcmp__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mkcmp__sel {
  width: auto;
  min-height: 32px;
}

.mkcmp__when {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
}

.mkcmp__note {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-2);
  white-space: pre-wrap;
}

@media (max-width: 640px) {
  .mkcmp {
    grid-template-columns: 1fr;
  }
}
</style>
