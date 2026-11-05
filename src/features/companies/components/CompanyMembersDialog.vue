<script setup lang="ts">
/**
 * Pessoas de uma empresa, com o "Link de primeiro acesso" por membro (só ADMIN
 * abre). O link é o caminho de quem ainda não tem senha e de quem esqueceu a
 * senha quando o e-mail não está configurado: o admin copia e manda.
 */
import { computed, ref, watch } from 'vue'
import { KeyRound, Loader2, RefreshCw, Search, Users2, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import AccessLinkBox from '@/components/AccessLinkBox.vue'
import companieService, { type AccessLinkResult } from '@/service/companies/companies-services'
import { getApiErrorMessage } from '@/service/api'
import { getUserToken } from '@/utils/authContent'

interface Member {
  role: string
  joinedAt?: string
  user: { id: string; name: string; email: string; avatarUrl?: string | null }
}

const props = defineProps<{
  modelValue: boolean
  company: { id: string; name: string } | null
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const members = ref<Member[]>([])
const loading = ref(false)
const loadError = ref('')
const search = ref('')
const busyId = ref<string | null>(null)
const links = ref<Record<string, AccessLinkResult>>({})
const rowErrors = ref<Record<string, string>>({})

const myId = computed(() => getUserToken()?.sub ?? null)

const ROLE_LABEL: Record<string, string> = { ADMIN: 'Admin', WORKER: 'Membro' }

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const visible = computed(() => {
  const q = normalize(search.value.trim())
  const list = [...members.value].sort((a, b) => a.user.name.localeCompare(b.user.name, 'pt-BR'))
  if (!q) return list
  return list.filter((m) => normalize(`${m.user.name} ${m.user.email}`).includes(q))
})

async function load() {
  if (!props.company) return
  loading.value = true
  loadError.value = ''
  try {
    const data = await companieService.getCompanyMembers(props.company.id)
    members.value = Array.isArray(data) ? data : []
  } catch (err) {
    loadError.value = getApiErrorMessage(err, 'Não deu para carregar as pessoas desta empresa.')
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.modelValue, props.company?.id] as const,
  ([open]) => {
    if (!open) return
    search.value = ''
    links.value = {}
    rowErrors.value = {}
    void load()
  },
)

async function generate(member: Member) {
  if (!props.company || busyId.value) return
  const id = member.user.id
  busyId.value = id
  const { [id]: _drop, ...rest } = rowErrors.value
  rowErrors.value = rest
  try {
    const result = await companieService.createAccessLink(props.company.id, id)
    links.value = { ...links.value, [id]: result }
  } catch (err) {
    rowErrors.value = {
      ...rowErrors.value,
      [id]: getApiErrorMessage(err, 'Não deu para gerar o link agora. Tente de novo.'),
    }
  } finally {
    busyId.value = null
  }
}

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    :label="company ? `Pessoas de ${company.name}` : 'Pessoas da empresa'"
    size="lg"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <header class="md-head">
      <span class="md-icon"><Users2 :size="18" /></span>
      <div class="md-titles">
        <h2 class="md-title">Pessoas de {{ company?.name }}</h2>
        <p class="md-sub">
          Quem ainda não entrou ou esqueceu a senha cria a dela pelo link de primeiro acesso.
        </p>
      </div>
      <button class="md-close" type="button" aria-label="Fechar" @click="close">
        <X :size="16" />
      </button>
    </header>

    <div class="md-body">
      <div v-if="members.length > 6" class="md-search">
        <Search :size="14" class="md-search-icon" />
        <input
          v-model="search"
          class="md-search-input"
          type="search"
          placeholder="Buscar por nome ou e-mail"
          aria-label="Buscar pessoa"
        />
      </div>

      <div v-if="loading" class="md-state">
        <Loader2 :size="16" class="md-spin" />
        Carregando pessoas
      </div>

      <div v-else-if="loadError" class="md-state md-state--err" role="alert">
        {{ loadError }}
        <button class="md-btn" type="button" @click="load">Tentar de novo</button>
      </div>

      <p v-else-if="!visible.length" class="md-state">Ninguém encontrado.</p>

      <ul v-else class="md-list">
        <li v-for="m in visible" :key="m.user.id" class="md-item">
          <div class="md-row">
            <PersonAvatar
              :id="m.user.id"
              :name="m.user.name"
              :avatar-url="m.user.avatarUrl ?? undefined"
              :size="32"
              variant="soft"
              decorative
            />
            <div class="md-person">
              <span class="md-name">
                {{ m.user.name }}
                <span v-if="m.user.id === myId" class="md-you">(você)</span>
              </span>
              <span class="md-email">{{ m.user.email }}</span>
            </div>
            <span class="md-role" :class="{ 'md-role--admin': m.role === 'ADMIN' }">
              {{ ROLE_LABEL[m.role] ?? m.role }}
            </span>
            <button
              class="md-btn"
              type="button"
              :disabled="busyId !== null"
              :aria-label="`${links[m.user.id] ? 'Gerar de novo o link' : 'Link de primeiro acesso'} de ${m.user.name}`"
              @click="generate(m)"
            >
              <Loader2 v-if="busyId === m.user.id" :size="14" class="md-spin" />
              <RefreshCw v-else-if="links[m.user.id]" :size="14" />
              <KeyRound v-else :size="14" />
              <span>{{ links[m.user.id] ? 'Gerar de novo' : 'Link de acesso' }}</span>
            </button>
          </div>
          <p v-if="rowErrors[m.user.id]" class="md-row-error" role="alert">
            {{ rowErrors[m.user.id] }}
          </p>
          <AccessLinkBox
            v-if="links[m.user.id]"
            class="md-link"
            :link="links[m.user.id]!.link"
            :expires-at="links[m.user.id]!.expiresAt"
            :emailed="links[m.user.id]!.emailed"
            :email="links[m.user.id]!.user.email"
          />
        </li>
      </ul>
    </div>
  </AppDialog>
</template>

<style scoped>
.md-head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
}

.md-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: var(--radius);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.md-titles {
  min-width: 0;
}

.md-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text);
  overflow-wrap: anywhere;
}

.md-sub {
  margin: 2px 0 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-3);
}

.md-close {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
}

.md-close:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.md-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.md-search {
  position: relative;
  display: flex;
  align-items: center;
}

.md-search-icon {
  position: absolute;
  left: 10px;
  color: var(--text-3);
  pointer-events: none;
}

.md-search-input {
  width: 100%;
  height: 36px;
  padding: 0 10px 0 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  outline: none;
}

.md-search-input:focus {
  border-color: var(--accent);
}

.md-state {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 0;
  padding: 18px 0;
  font-size: 13px;
  color: var(--text-3);
}

.md-state--err {
  color: var(--err);
}

.md-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.md-item {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}

.md-item:last-child {
  border-bottom: none;
}

.md-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
}

.md-person {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.md-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.md-you {
  font-weight: 500;
  color: var(--text-3);
}

.md-email {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.md-role {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
}

.md-role--admin {
  color: var(--accent-ink);
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
}

.md-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

/* 32px de desenho, 44px de toque. */
.md-btn::after {
  content: '';
  position: absolute;
  inset: -6px 0;
}

.md-btn:hover:not(:disabled) {
  background: var(--surface-2);
  border-color: var(--border-strong);
}

.md-btn:disabled {
  opacity: 0.55;
  cursor: progress;
}

.md-row-error {
  margin: 8px 0 0 42px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--err);
}

.md-link {
  margin: 10px 0 2px 42px;
}

.md-spin {
  animation: md-spin 0.85s linear infinite;
}

@keyframes md-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 560px) {
  .md-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'av who role'
      'av act act';
    row-gap: 8px;
  }
  .md-row > :first-child {
    grid-area: av;
    align-self: start;
  }
  .md-person {
    grid-area: who;
  }
  .md-role {
    grid-area: role;
  }
  .md-btn {
    grid-area: act;
    justify-self: start;
  }
  .md-link,
  .md-row-error {
    margin-left: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .md-spin {
    animation-duration: 1.8s;
  }
}
</style>
