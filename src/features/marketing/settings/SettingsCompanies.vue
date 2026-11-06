<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { Plus, Trash2 } from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { TAG_COLOR_KEYS } from '@/components/ui/tag-palette'
import { getApiErrorMessage } from '@/service/api'
import {
  getAvailableCompanies,
  linkCompany,
  unlinkCompany,
  updateLinkedCompany,
  type MarketingGroupDetail,
} from '@/service/marketing/marketing-settings'
import { useToast } from '@/composables/useToast'
import { brandTone, toneStyle } from '../marketing-labels'
import { asText, selectItems } from '../select-items'

/**
 * Empresas do grupo (marcas da ala). Só o Dono liga, desliga, troca a cor e
 * tira; o Admin vê a lista. Ligar só oferece empresa que o Dono administra e
 * que não está em outro grupo (a API confere de novo).
 */
const props = defineProps<{ groupId: string; detail: MarketingGroupDetail; isOwner: boolean }>()
const toast = useToast()
const queryClient = useQueryClient()

const available = useQuery({
  queryKey: computed(() => ['marketing', props.groupId, 'settings', 'available']),
  queryFn: () => getAvailableCompanies(props.groupId),
  enabled: computed(() => props.isOwner),
})

const toAdd = ref('')
const busy = ref(false)
const removing = ref<{ companyId: string; name: string } | null>(null)

async function refresh() {
  await queryClient.invalidateQueries({ queryKey: ['marketing'] })
}

async function run(action: () => Promise<unknown>, ok: string) {
  busy.value = true
  try {
    await action()
    toast.success(ok)
    await refresh()
  } catch (error) {
    toast.error(getApiErrorMessage(error, 'Não deu para salvar.'))
  } finally {
    busy.value = false
  }
}

function add() {
  if (!toAdd.value) return
  const name = available.data.value?.find((c) => c.id === toAdd.value)?.name ?? 'Empresa'
  void run(() => linkCompany(props.groupId, { companyId: toAdd.value }), `${name} ligada ao grupo`).then(() => {
    toAdd.value = ''
  })
}

function toggle(companyId: string, marketingEnabled: boolean) {
  void run(
    () => updateLinkedCompany(props.groupId, companyId, { marketingEnabled }),
    marketingEnabled ? 'Marca ligada na ala' : 'Marca desligada na ala',
  )
}

const COLOR_LABEL: Record<string, string> = {
  slate: 'Cinza',
  blue: 'Azul',
  cyan: 'Ciano',
  teal: 'Verde-água',
  green: 'Verde',
  lime: 'Lima',
  amber: 'Âmbar',
  orange: 'Laranja',
  red: 'Vermelho',
  pink: 'Rosa',
  purple: 'Roxo',
  indigo: 'Índigo',
}
const colorItems = [
  { label: 'Cor automática', value: '' },
  ...TAG_COLOR_KEYS.map((k) => ({ label: COLOR_LABEL[k] ?? k, value: k })),
]
const addItems = computed(() => [
  {
    label: available.data.value?.length ? 'Escolha uma empresa que você administra' : 'Nenhuma empresa livre que você administra',
    value: '',
  },
  ...selectItems(available.data.value ?? [], (c) => c.id, (c) => c.name),
])

/**
 * Cor salva ao escolher. Enquanto grava, o campo mostra a escolha; quando
 * termina, volta a mostrar o que está gravado (se a API recusou, é o valor
 * anterior, e o toast mostra a frase).
 */
const pendingColor = reactive<Record<string, string>>({})
async function setColor(companyId: string, color: string, current: string | null) {
  if (color === (current ?? '')) return
  pendingColor[companyId] = color
  try {
    await run(() => updateLinkedCompany(props.groupId, companyId, { color: color || null }), 'Cor salva')
  } finally {
    delete pendingColor[companyId]
  }
}

function confirmRemove() {
  const target = removing.value
  if (!target) return
  void run(() => unlinkCompany(props.groupId, target.companyId), `${target.name} saiu do grupo`).then(() => {
    removing.value = null
  })
}
</script>

<template>
  <section class="mk-panel">
    <header class="mk-panel__head">Empresas do grupo</header>
    <div class="mk-panel__body sc">
      <p class="mk-hint">
        Cada empresa ligada é uma marca dentro da ala. Desligar esconde a marca da equipe sem apagar nada.
      </p>
      <ul class="sc__list">
        <li v-for="c in detail.companies" :key="c.companyId" class="sc__row">
          <span class="mk-dot" :style="toneStyle(brandTone(c))" aria-hidden="true" />
          <span class="sc__name">{{ c.name }}</span>
          <span v-if="!c.marketingEnabled" class="mk-chip">Desligada</span>
          <span class="mk-toolbar__spacer" />
          <template v-if="isOwner">
            <div class="sc__color" :data-color-for="c.companyId">
              <AppSelect
                :model-value="pendingColor[c.companyId] ?? c.color ?? ''"
                :items="colorItems"
                :label="`Cor de ${c.name}`"
                density="compact"
                :disabled="busy"
                @update:model-value="setColor(c.companyId, asText($event), c.color)"
              />
            </div>
            <label class="sc__switch">
              <input
                type="checkbox"
                :checked="c.marketingEnabled"
                :disabled="busy"
                @change="toggle(c.companyId, ($event.target as HTMLInputElement).checked)"
              />
              Na ala
            </label>
            <button
              type="button"
              class="mk-icon-btn"
              :aria-label="`Tirar ${c.name} do grupo`"
              :disabled="busy || detail.companies.length <= 1"
              @click="removing = { companyId: c.companyId, name: c.name }"
            >
              <Trash2 :size="15" />
            </button>
          </template>
        </li>
      </ul>

      <div v-if="isOwner" class="sc__add">
        <div class="sc__pick" data-testid="company-to-add">
          <AppSelect
            :model-value="toAdd"
            :items="addItems"
            label="Empresa para ligar ao grupo"
            density="compact"
            :disabled="busy"
            @update:model-value="toAdd = asText($event)"
          />
        </div>
        <button type="button" class="mk-btn" :disabled="!toAdd || busy" @click="add">
          <Plus :size="15" /> Ligar ao grupo
        </button>
      </div>
    </div>

    <ConfirmDialog
      :model-value="!!removing"
      title="Tirar a empresa do grupo?"
      :message="`${removing?.name ?? ''} deixa de ser marca da ala. O conteúdo dela fica guardado e volta se a empresa for ligada de novo.`"
      confirm-label="Tirar do grupo"
      danger
      :loading="busy"
      @update:model-value="(v) => { if (!v) removing = null }"
      @confirm="confirmRemove"
    />
  </section>
</template>

<style scoped>
.sc {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sc__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.sc__row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.sc__row:last-child {
  border-bottom: 0;
}

.sc__name {
  font-weight: 600;
  font-size: 13px;
}

.sc__color {
  width: 150px;
}

.sc__switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--text-2);
}

.sc__add {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.sc__pick {
  flex: 1;
  min-width: 200px;
}
</style>
