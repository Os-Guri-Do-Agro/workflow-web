<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ChevronsUpDown, CheckCircle2, X } from 'lucide-vue-next'
import router from '@/router'
import companiesServices from '@/service/companies/companies-services'
import { getInfoAuth } from '@/utils/authContent'
import { useWorkspaceStore } from '@/stores/workspaceStores'

const AVATAR_COLORS = [
  '#60A5FA', '#A78BFA', '#34D399', '#FB923C',
  '#F472B6', '#22D3EE', '#FACC15', '#F87171',
]

function hashColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]!
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '·'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}

type Company = {
  id: string
  name: string
  cnpj: string
  active?: boolean
}

type CompanyResponse = {
  role: string
  joinedAt: string
  company: Company
}

withDefaults(
  defineProps<{
    variant?: 'full' | 'compact' | 'inline'
  }>(),
  { variant: 'full' },
)

const emit = defineEmits<{
  change: [companyId: string]
}>()

const companies = ref<Company[]>([])
const workspace = useWorkspaceStore()
const showDialog = ref(false)
const activeCompany = computed(() => companies.value.find((c) => c.active))

const findCompanies = async () => {
  try {
    const response = await companiesServices.getCompany()
    const savedCompanyId = localStorage.getItem('activeCompany')
    const list = Array.isArray(response) ? response : response?.data || []
    companies.value = list.map((item: CompanyResponse, index: number) => ({
      ...item.company,
      active: savedCompanyId ? item.company.id === savedCompanyId : index === 0,
    }))
    const first = companies.value[0]
    if (!savedCompanyId && first) {
      workspace.setActiveCompany(first.id)
      localStorage.setItem('activeCompany', first.id)
    }
  } catch (e) {
    console.error(e)
  }
}

const switchCompany = (company: Company) => {
  companies.value.forEach((c) => (c.active = c.id === company.id))
  workspace.setActiveCompany(company.id)
  localStorage.setItem('activeCompany', company.id)
  getInfoAuth()
  showDialog.value = false
  emit('change', company.id)
  setTimeout(() => router.push('/'))
}

onMounted(() => {
  if (localStorage.getItem('token')) findCompanies()
})
</script>

<template>
  <button
    v-if="variant === 'full'"
    class="switch-btn switch-btn--full press"
    @click="showDialog = true"
  >
    <div
      v-if="activeCompany"
      class="avatar-mark"
      :style="{ background: hashColor(activeCompany.name) }"
    >{{ initials(activeCompany.name) }}</div>
    <div v-else class="avatar-mark avatar-mark--empty">w.</div>
    <div class="switch-info">
      <span class="switch-eyebrow">Empresa</span>
      <span class="switch-name">{{ activeCompany?.name || 'Selecione' }}</span>
    </div>
    <ChevronsUpDown :size="13" class="switch-chevron" />
  </button>

  <button
    v-else-if="variant === 'compact'"
    class="switch-btn switch-btn--compact press"
    @click="showDialog = true"
  >
    <div
      v-if="activeCompany"
      class="avatar-mark avatar-mark--sm"
      :style="{ background: hashColor(activeCompany.name) }"
    >{{ initials(activeCompany.name) }}</div>
    <div v-else class="avatar-mark avatar-mark--sm avatar-mark--empty">w.</div>
    <span class="switch-name-inline">{{ activeCompany?.name || 'Empresa' }}</span>
    <ChevronsUpDown :size="12" class="switch-chevron" />
  </button>

  <button v-else class="switch-btn switch-btn--inline press" @click="showDialog = true">
    <div
      v-if="activeCompany"
      class="avatar-mark avatar-mark--sm"
      :style="{ background: hashColor(activeCompany.name) }"
    >{{ initials(activeCompany.name) }}</div>
    <span class="switch-name-inline">{{ activeCompany?.name || 'Empresa' }}</span>
    <ChevronsUpDown :size="12" class="switch-chevron" />
  </button>

  <v-dialog v-model="showDialog" max-width="440">
    <v-card rounded="xl" elevation="0" class="switch-dialog">
      <div class="dialog-header">
        <span class="dialog-title">Trocar Empresa</span>
        <button class="close-btn" @click="showDialog = false">
          <X :size="16" />
        </button>
      </div>
      <div class="dialog-body">
        <button
          v-for="company in companies"
          :key="company.id"
          class="company-row"
          :class="{ 'company-row--active': company.active }"
          @click="switchCompany(company)"
        >
          <div
            class="company-row-avatar"
            :style="{ background: hashColor(company.name) }"
          >{{ initials(company.name) }}</div>
          <div class="company-row-info">
            <span class="company-row-name">{{ company.name }}</span>
            <span class="company-row-cnpj">{{ company.cnpj }}</span>
          </div>
          <CheckCircle2 v-if="company.active" :size="14" class="check-icon" />
        </button>
      </div>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.switch-btn {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  color: var(--text);
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
  font-family: inherit;
}

.switch-btn:hover {
  background: var(--surface-3);
  border-color: var(--border-strong);
}

.switch-btn--full {
  width: 100%;
  padding: 7px 10px;
}

.switch-btn--compact {
  padding: 6px 10px;
  color: var(--text-2);
}

.switch-btn--inline {
  background: transparent;
  border: none;
  padding: 4px 6px;
}

.avatar-mark {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: #0B0B0C;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 10.5px;
  letter-spacing: -0.01em;
  flex-shrink: 0;
}

.avatar-mark--sm {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  font-size: 9.5px;
}

.avatar-mark--empty {
  background: var(--accent);
  color: var(--accent-fg);
}

.company-row-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: #0B0B0C;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 12px;
  flex-shrink: 0;
}

.switch-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  line-height: 1.2;
}

.switch-eyebrow {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-4);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.switch-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.switch-name-inline {
  font-size: 12.5px;
  font-weight: 600;
}

.switch-chevron {
  color: var(--text-3);
  flex-shrink: 0;
}

.switch-dialog {
  background: var(--surface) !important;
  border: 1px solid var(--border) !important;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid var(--border);
}

.dialog-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}

.close-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-3);
  padding: 4px;
  border-radius: 6px;
  display: inline-flex;
  transition: background var(--motion-fast) var(--motion-ease);
}

.close-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.dialog-body {
  padding: 10px;
}

.company-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  color: var(--text);
  margin-bottom: 2px;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.company-row:hover {
  background: var(--surface-2);
  border-color: var(--border);
}

.company-row--active {
  background: var(--surface-2);
  border-color: var(--border-strong);
}

.company-row-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.company-row-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.company-row-cnpj {
  font-size: 11px;
  color: var(--text-3);
}

.check-icon {
  color: var(--success);
  flex-shrink: 0;
}
</style>
