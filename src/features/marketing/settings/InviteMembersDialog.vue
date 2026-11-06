<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { refDebounced } from '@vueuse/core'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { Loader2, Mail, Search, Users, X } from 'lucide-vue-next'
import AccessLinkBox from '@/components/AccessLinkBox.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { hasSession } from '@/composables/useSession'
import { getApiErrorMessage } from '@/service/api'
import {
  MARKETING_ROLE_LABEL,
  type MarketingBrand,
  type MarketingRole,
} from '@/service/marketing/marketing-core'
import {
  addMember,
  addMembersFromNevo,
  CANDIDATES_LIMIT,
  getMemberCandidates,
  MEMBERS_BATCH_MAX,
  type AccessLinkResult,
  type MemberCandidate,
} from '@/service/marketing/marketing-settings'
import { brandTone, toneStyle } from '../marketing-labels'
import SettingsDialog from './SettingsDialog.vue'

/**
 * Convidar para a ala (spec R1, D9), em duas abas:
 * - "Do Nevo": quem já trabalha nas empresas do grupo e ainda não está na ala.
 *   Marca várias pessoas; papel, marcas e rótulo valem para o lote. A API
 *   confere cada pessoa (ninguém de fora do grupo entra por aqui).
 * - "Por e-mail": o convite de sempre; conta nova recebe o link de primeiro
 *   acesso.
 */
const props = defineProps<{
  modelValue: boolean
  groupId: string
  brands: MarketingBrand[]
  grantable: MarketingRole[]
  roleHint: Record<MarketingRole, string>
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; done: [] }>()
const queryClient = useQueryClient()

type Tab = 'nevo' | 'email'
const tab = ref<Tab>('nevo')
const busy = ref(false)
const error = ref('')

// Papel, marcas e rótulo: os mesmos campos nas duas abas.
const form = reactive({ role: 'EDITOR' as MarketingRole, brandIds: [] as string[], title: '' })
const roleItems = computed(() => props.grantable.map((r) => ({ label: MARKETING_ROLE_LABEL[r], value: r })))

// ── Resultado ───────────────────────────────────────────────────────────────
type Result =
  | { kind: 'nevo'; names: string[]; role: MarketingRole }
  | { kind: 'email'; name: string; email: string; link: AccessLinkResult | null; created: boolean }
const result = ref<Result | null>(null)

// ── Do Nevo ─────────────────────────────────────────────────────────────────
const search = ref('')
const searchDebounced = refDebounced(search, 250)
/** Selecionadas ficam guardadas por id: a busca troca a lista, a seleção fica. */
const selected = ref(new Map<string, MemberCandidate>())

const candidates = useQuery({
  queryKey: computed(() => ['marketing', props.groupId, 'members', 'candidates', searchDebounced.value.trim()] as const),
  queryFn: () => getMemberCandidates(props.groupId, searchDebounced.value),
  enabled: computed(() => hasSession.value && props.modelValue && tab.value === 'nevo' && !result.value),
  staleTime: 30_000,
})
const list = computed(() => candidates.data.value ?? [])
const searching = computed(() => !!searchDebounced.value.trim())
const capped = computed(() => list.value.length >= CANDIDATES_LIMIT)
const full = computed(() => selected.value.size >= MEMBERS_BATCH_MAX)
const brandNamesText = computed(() => {
  const names = props.brands.map((b) => b.name)
  if (names.length <= 1) return names[0] ?? 'nas empresas do grupo'
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
})

function toggle(c: MemberCandidate) {
  const next = new Map(selected.value)
  if (next.has(c.userId)) next.delete(c.userId)
  else if (next.size < MEMBERS_BATCH_MAX) next.set(c.userId, c)
  selected.value = next
}
function unselect(id: string) {
  const next = new Map(selected.value)
  next.delete(id)
  selected.value = next
}

// ── Por e-mail ──────────────────────────────────────────────────────────────
const email = reactive({ email: '', name: '' })

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    tab.value = 'nevo'
    Object.assign(form, { role: props.grantable.includes('EDITOR') ? 'EDITOR' : props.grantable[0], brandIds: [], title: '' })
    Object.assign(email, { email: '', name: '' })
    search.value = ''
    selected.value = new Map()
    error.value = ''
    result.value = null
  },
)
watch(tab, () => (error.value = ''))

function toggleBrand(id: string) {
  const i = form.brandIds.indexOf(id)
  if (i >= 0) form.brandIds.splice(i, 1)
  else form.brandIds.push(id)
}

const canSubmit = computed(() =>
  tab.value === 'nevo' ? selected.value.size > 0 : !!email.email.trim(),
)
const submitLabel = computed(() => {
  if (tab.value === 'email') return 'Convidar'
  const n = selected.value.size
  return n === 0 ? 'Incluir' : n === 1 ? 'Incluir 1 pessoa' : `Incluir ${n} pessoas`
})

async function submit() {
  if (!canSubmit.value || busy.value) return
  error.value = ''
  busy.value = true
  const common = { role: form.role, brandIds: form.brandIds, title: form.title.trim() || undefined }
  try {
    if (tab.value === 'nevo') {
      const res = await addMembersFromNevo(props.groupId, { ...common, userIds: [...selected.value.keys()] })
      result.value = { kind: 'nevo', names: res.members.map((m) => m.name), role: form.role }
    } else {
      const res = await addMember(props.groupId, {
        ...common,
        email: email.email.trim(),
        name: email.name.trim() || undefined,
      })
      result.value = {
        kind: 'email',
        name: res.member.name,
        email: res.member.email,
        link: res.accessLink,
        created: res.created,
      }
    }
    await queryClient.invalidateQueries({ queryKey: ['marketing'] })
    emit('done')
  } catch (e) {
    error.value = getApiErrorMessage(e, tab.value === 'nevo' ? 'Não deu para incluir.' : 'Não deu para convidar.')
    // Alguém entrou ou saiu enquanto a lista estava aberta: atualiza.
    if (tab.value === 'nevo') void candidates.refetch()
  } finally {
    busy.value = false
  }
}

function listText(names: string[]) {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
}
</script>

<template>
  <SettingsDialog
    :model-value="modelValue"
    title="Convidar para a ala"
    size="lg"
    :loading="busy"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-if="!result">
      <div class="inv__tabs" role="tablist" aria-label="Como convidar">
        <button
          type="button"
          role="tab"
          class="inv__tab"
          :class="{ 'is-active': tab === 'nevo' }"
          :aria-selected="tab === 'nevo'"
          data-testid="inv-tab-nevo"
          @click="tab = 'nevo'"
        >
          <Users :size="14" aria-hidden="true" /> Do Nevo
        </button>
        <button
          type="button"
          role="tab"
          class="inv__tab"
          :class="{ 'is-active': tab === 'email' }"
          :aria-selected="tab === 'email'"
          data-testid="inv-tab-email"
          @click="tab = 'email'"
        >
          <Mail :size="14" aria-hidden="true" /> Por e-mail
        </button>
      </div>

      <!-- Do Nevo -->
      <template v-if="tab === 'nevo'">
        <p class="mk-hint">
          Pessoas que já trabalham em {{ brandNamesText }} e ainda não estão na ala. Elas entram com o login de sempre.
        </p>
        <div class="inv__search">
          <Search :size="14" aria-hidden="true" />
          <input
            v-model="search"
            class="mk-input"
            type="search"
            placeholder="Buscar por nome ou e-mail"
            aria-label="Buscar pessoa do Nevo"
            autocomplete="off"
            data-testid="inv-search"
          />
        </div>

        <div v-if="selected.size" class="inv__picked" aria-label="Pessoas escolhidas">
          <span class="inv__picked-n">{{ selected.size }} {{ selected.size === 1 ? 'escolhida' : 'escolhidas' }}</span>
          <span v-for="c in selected.values()" :key="c.userId" class="inv__chip">
            <PersonAvatar :id="c.userId" :name="c.name" :avatar-url="c.avatarUrl" :size="16" decorative />
            {{ c.name }}
            <button type="button" class="inv__chip-x" :aria-label="`Tirar ${c.name}`" @click="unselect(c.userId)">
              <X :size="12" />
            </button>
          </span>
        </div>

        <div class="inv__list" data-testid="inv-list">
          <div v-if="candidates.isLoading.value" class="inv__loading">
            <Skeleton type="row" /><Skeleton type="row" /><Skeleton type="row" />
          </div>
          <p v-else-if="candidates.isError.value" class="mk-error" role="alert">
            {{ getApiErrorMessage(candidates.error.value, 'Não deu para carregar as pessoas.') }}
          </p>
          <div v-else-if="!list.length" class="inv__empty" data-testid="inv-empty">
            <p class="inv__empty-title">
              {{ searching ? `Ninguém com "${searchDebounced.trim()}" nas empresas do grupo.` : 'Ninguém para incluir por aqui.' }}
            </p>
            <p class="mk-hint">
              Aqui aparecem só as pessoas que já trabalham em {{ brandNamesText }} e ainda não estão na ala.
              Quem não é dessas empresas (um freelancer, por exemplo) entra pela aba Por e-mail.
            </p>
            <button type="button" class="mk-btn" @click="tab = 'email'"><Mail :size="14" /> Convidar por e-mail</button>
          </div>
          <ul v-else class="inv__rows">
            <li v-for="c in list" :key="c.userId">
              <label class="inv__row" :class="{ 'is-on': selected.has(c.userId) }" :data-user="c.userId">
                <input
                  type="checkbox"
                  :checked="selected.has(c.userId)"
                  :disabled="!selected.has(c.userId) && full"
                  @change="toggle(c)"
                />
                <PersonAvatar :id="c.userId" :name="c.name" :avatar-url="c.avatarUrl" :size="28" decorative />
                <span class="inv__who">
                  <span class="inv__name">{{ c.name }}</span>
                  <span class="inv__email">{{ c.email }}</span>
                </span>
                <span class="inv__cos">
                  <span v-for="co in c.companies" :key="co.companyId" class="inv__co">
                    <span class="mk-dot" :style="toneStyle(brandTone(brands.find((b) => b.companyId === co.companyId)))" aria-hidden="true" />
                    {{ co.name }}
                  </span>
                </span>
              </label>
            </li>
          </ul>
        </div>
        <p v-if="capped" class="mk-hint">Mostrando as {{ CANDIDATES_LIMIT }} primeiras. Busque pelo nome para achar outras.</p>
        <p v-if="full" class="mk-hint">No máximo {{ MEMBERS_BATCH_MAX }} pessoas por vez.</p>
      </template>

      <!-- Por e-mail -->
      <template v-else>
        <p class="mk-hint">
          Quem ainda não tem conta ganha uma, sem acesso ao resto do Nevo. Quem já tem conta só ganha o papel na ala.
        </p>
        <div class="mk-field">
          <label class="mk-label" for="inv-email">E-mail</label>
          <input id="inv-email" v-model="email.email" class="mk-input" type="email" autocomplete="off" />
        </div>
        <div class="mk-field">
          <label class="mk-label" for="inv-name">Nome</label>
          <input id="inv-name" v-model="email.name" class="mk-input" type="text" autocomplete="off" />
          <span class="mk-hint">Obrigatório só para conta nova.</span>
        </div>
      </template>

      <!-- Papel, marcas e rótulo (valem para o lote) -->
      <div class="inv__batch" :class="{ 'is-nevo': tab === 'nevo' }">
        <p v-if="tab === 'nevo'" class="inv__batch-title">Vale para todas as pessoas escolhidas</p>
        <div class="inv__grid">
          <div class="mk-field">
            <span class="mk-label">Papel</span>
            <div data-testid="inv-role"><AppSelect v-model="form.role" :items="roleItems" label="Papel" density="compact" /></div>
            <span class="mk-hint">{{ roleHint[form.role] }}</span>
          </div>
          <div class="mk-field">
            <label class="mk-label" for="inv-title">Rótulo na equipe</label>
            <input id="inv-title" v-model="form.title" class="mk-input" type="text" placeholder="Freelancer, Diretoria..." />
          </div>
        </div>
        <fieldset v-if="brands.length > 1" class="inv__brands">
          <legend class="mk-label">Marcas (nenhuma marcada = todas)</legend>
          <label v-for="b in brands" :key="b.companyId" class="inv__brand">
            <input type="checkbox" :checked="form.brandIds.includes(b.companyId)" @change="toggleBrand(b.companyId)" />
            <span class="mk-dot" :style="toneStyle(brandTone(b))" aria-hidden="true" />
            {{ b.name }}
          </label>
        </fieldset>
      </div>
      <p v-if="error" class="mk-error" role="alert">{{ error }}</p>
    </template>

    <template v-else>
      <template v-if="result.kind === 'nevo'">
        <p class="inv__done" data-testid="inv-done">
          {{ listText(result.names) }} {{ result.names.length === 1 ? 'entrou' : 'entraram' }} na ala como {{ MARKETING_ROLE_LABEL[result.role] }}.
        </p>
        <p class="mk-hint">Cada pessoa recebe um aviso no sino com o link da ala e entra com o login de sempre.</p>
      </template>
      <template v-else>
        <p class="inv__done">
          {{ result.name }} {{ result.created ? 'ganhou uma conta e' : '' }} entrou na ala.
        </p>
        <AccessLinkBox
          v-if="result.link"
          :link="result.link.link"
          :expires-at="result.link.expiresAt"
          :emailed="result.link.emailed"
          :email="result.email"
        />
        <p v-else class="mk-hint">A pessoa já tem conta no Nevo: entra com o login de sempre e encontra a ala no menu.</p>
      </template>
    </template>

    <template #footer>
      <template v-if="!result">
        <button type="button" class="mk-btn mk-btn--ghost" :disabled="busy" @click="emit('update:modelValue', false)">Cancelar</button>
        <button type="button" class="mk-btn mk-btn--primary" :disabled="busy || !canSubmit" data-testid="inv-submit" @click="submit">
          <Loader2 v-if="busy" :size="14" class="inv__spin" aria-hidden="true" />
          {{ submitLabel }}
        </button>
      </template>
      <button v-else type="button" class="mk-btn mk-btn--primary" @click="emit('update:modelValue', false)">Pronto</button>
    </template>
  </SettingsDialog>
</template>

<style scoped>
.inv__tabs {
  display: inline-flex;
  align-self: flex-start;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.inv__tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: calc(var(--radius-sm) - 2px);
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.inv__tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.inv__tab.is-active {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.inv__search {
  position: relative;
}

.inv__search svg {
  position: absolute;
  top: 50%;
  left: 10px;
  transform: translateY(-50%);
  color: var(--text-3);
  pointer-events: none;
}

.inv__search .mk-input {
  padding-left: 30px;
}

.inv__picked {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
}

.inv__picked-n {
  margin-right: 2px;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 700;
}

.inv__chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 2px 0 4px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-2);
  font-size: 12px;
}

.inv__chip-x {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.inv__chip-x:hover {
  background: var(--surface-3);
  color: var(--text);
}

.inv__list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.inv__loading {
  display: grid;
  gap: 6px;
  padding: 8px;
}

.inv__empty {
  display: grid;
  justify-items: start;
  gap: 6px;
  padding: 12px;
}

.inv__empty-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.inv__rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.inv__rows li + li {
  border-top: 1px solid var(--border);
}

.inv__row {
  display: grid;
  grid-template-columns: auto 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 6px 10px;
  cursor: pointer;
}

.inv__row:hover {
  background: var(--surface-2);
}

.inv__row.is-on {
  background: var(--accent-soft);
}

.inv__row input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--accent);
}

.inv__who {
  display: grid;
  min-width: 0;
}

.inv__name {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inv__email {
  overflow: hidden;
  color: var(--text-3);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inv__cos {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 2px 10px;
  max-width: 220px;
  color: var(--text-2);
  font-size: 12px;
}

.inv__co {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.inv__batch {
  display: grid;
  gap: 10px;
}

.inv__batch.is-nevo {
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.inv__batch-title {
  margin: 0;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 700;
}

.inv__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.inv__brands {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin: 0;
  padding: 0;
  border: 0;
}

.inv__brands legend {
  margin-bottom: 6px;
}

.inv__brand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  font-size: 13px;
}

.inv__brand input {
  accent-color: var(--accent);
}

.inv__done {
  margin: 0;
  font-weight: 600;
}

.inv__spin {
  animation: inv-spin 0.9s linear infinite;
}

@keyframes inv-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .inv__tabs {
    align-self: stretch;
  }

  .inv__tab {
    flex: 1;
    justify-content: center;
    min-height: 44px;
  }

  .inv__row {
    grid-template-columns: auto 28px minmax(0, 1fr);
    min-height: 56px;
  }

  .inv__cos {
    grid-column: 3;
    justify-content: flex-start;
    max-width: none;
  }

  .inv__grid {
    grid-template-columns: 1fr;
  }

  .inv__brand {
    min-height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .inv__spin {
    animation: none;
  }
}

/* AppSelect compacto tem 36px; no celular o toque pede 44px. */
@media (max-width: 640px) {
  .inv__grid :deep(.app-select__trigger) {
    min-height: 44px;
  }
}
</style>
