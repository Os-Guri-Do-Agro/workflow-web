<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { X } from 'lucide-vue-next'
import { getApiErrorMessage } from '@/service/api'
import type { MarketingSettings } from '@/service/marketing/marketing-core'
import { updateGroupSettings } from '@/service/marketing/marketing-settings'
import { useToast } from '@/composables/useToast'

/**
 * Listas de trabalho (Admin e Dono editam): fontes e meios de UTM, categorias
 * do financeiro e dos links. UTM vira minúsculo sem acento na API.
 */
const props = defineProps<{ groupId: string; settings: MarketingSettings; canEdit: boolean }>()
const toast = useToast()
const queryClient = useQueryClient()

type ListKey = 'utmSources' | 'utmMediums' | 'expenseCategories' | 'linkCategories'
const LISTS: { key: ListKey; title: string; hint: string }[] = [
  { key: 'utmSources', title: 'Fontes de UTM (utm_source)', hint: 'De onde vem o clique: instagram, google, parceiro...' },
  { key: 'utmMediums', title: 'Meios de UTM (utm_medium)', hint: 'Como chegou: pago, organico, impresso...' },
  { key: 'expenseCategories', title: 'Categorias do financeiro', hint: 'Usadas nos lançamentos e no orçamento.' },
  { key: 'linkCategories', title: 'Categorias dos links', hint: 'Agrupam os links de trabalho.' },
]

const draft = reactive<Record<ListKey, string[]>>({
  utmSources: [],
  utmMediums: [],
  expenseCategories: [],
  linkCategories: [],
})
const input = reactive<Record<ListKey, string>>({ utmSources: '', utmMediums: '', expenseCategories: '', linkCategories: '' })
const busy = ref(false)

watch(
  () => props.settings,
  (s) => {
    for (const l of LISTS) draft[l.key] = [...s[l.key]]
  },
  { immediate: true, deep: true },
)

function addItem(key: ListKey) {
  const text = input[key].trim()
  if (!text) return
  if (!draft[key].some((v) => v.toLowerCase() === text.toLowerCase())) draft[key].push(text)
  input[key] = ''
}

function dirty(key: ListKey) {
  return JSON.stringify(draft[key]) !== JSON.stringify(props.settings[key])
}

async function save(key: ListKey) {
  busy.value = true
  try {
    await updateGroupSettings(props.groupId, { [key]: draft[key] })
    toast.success('Lista salva')
    await queryClient.invalidateQueries({ queryKey: ['marketing'] })
  } catch (error) {
    toast.error(getApiErrorMessage(error, 'Não deu para salvar.'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="mk-panel">
    <header class="mk-panel__head">Listas de trabalho</header>
    <div class="mk-panel__body sl">
      <div v-for="l in LISTS" :key="l.key" class="sl__list">
        <div class="sl__head">
          <span class="mk-label">{{ l.title }}</span>
          <span class="mk-hint">{{ l.hint }}</span>
        </div>
        <div class="sl__chips">
          <span v-for="(item, i) in draft[l.key]" :key="item" class="mk-chip sl__chip">
            {{ item }}
            <button
              v-if="canEdit"
              type="button"
              class="sl__x"
              :aria-label="`Tirar ${item}`"
              @click="draft[l.key].splice(i, 1)"
            >
              <X :size="12" />
            </button>
          </span>
        </div>
        <div v-if="canEdit" class="sl__add">
          <input
            v-model="input[l.key]"
            class="mk-input"
            type="text"
            :aria-label="`Novo item em ${l.title}`"
            placeholder="Novo item e Enter"
            @keydown.enter.prevent="addItem(l.key)"
          />
          <button type="button" class="mk-btn" :disabled="busy || !dirty(l.key)" @click="save(l.key)">Salvar</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sl {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.sl__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.sl__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sl__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.sl__chip {
  padding-right: 4px;
}

.sl__x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.sl__x:hover {
  background: var(--surface-3);
  color: var(--text);
}

.sl__add {
  display: flex;
  gap: 6px;
}

.sl__add .mk-input {
  flex: 1;
  min-width: 0;
}
</style>
