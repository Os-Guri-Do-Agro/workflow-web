<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { KeyRound, Pencil, Trash2, UserPlus } from 'lucide-vue-next'
import AccessLinkBox from '@/components/AccessLinkBox.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import { getApiErrorMessage } from '@/service/api'
import {
  MARKETING_ROLE_LABEL,
  type MarketingBrand,
  type MarketingMember,
  type MarketingRole,
} from '@/service/marketing/marketing-core'
import {
  memberAccessLink,
  removeMember,
  updateMember,
  type AccessLinkResult,
} from '@/service/marketing/marketing-settings'
import { useToast } from '@/composables/useToast'
import { brandTone, toneStyle } from '../marketing-labels'
import InviteMembersDialog from './InviteMembersDialog.vue'
import SettingsDialog from './SettingsDialog.vue'

/**
 * Equipe da ala. Admin convida e mexe em Editor e Visualizador; Dono mexe em
 * todos. O convite tem duas abas (spec R1, D9): "Do Nevo" (quem já trabalha
 * nas empresas do grupo, em lote) e "Por e-mail" (quem entra só pela ala, o
 * freelancer, recebe o link de primeiro acesso na hora).
 */
const props = defineProps<{
  groupId: string
  members: MarketingMember[]
  brands: MarketingBrand[]
  myRole: MarketingRole
  myId: string | null
}>()
const toast = useToast()
const queryClient = useQueryClient()

const isOwner = computed(() => props.myRole === 'OWNER')
const canManageTeam = computed(() => props.myRole === 'OWNER' || props.myRole === 'ADMIN')
const grantable = computed<MarketingRole[]>(() =>
  isOwner.value ? ['VIEWER', 'EDITOR', 'ADMIN', 'OWNER'] : ['VIEWER', 'EDITOR'],
)
const ROLE_HINT: Record<MarketingRole, string> = {
  OWNER: 'Tudo, mais as configurações do Dono',
  ADMIN: 'Aprova, apaga e convida Editor e Visualizador',
  EDITOR: 'Cria, sobe arquivo, comenta e lança gasto',
  VIEWER: 'Só vê',
}

function canManage(m: MarketingMember) {
  if (m.userId === props.myId && m.role === 'OWNER') return isOwner.value
  return isOwner.value || (props.myRole === 'ADMIN' && (m.role === 'EDITOR' || m.role === 'VIEWER'))
}

function brandNames(ids: string[]) {
  if (!ids.length) return 'Todas as marcas'
  return ids.map((id) => props.brands.find((b) => b.companyId === id)?.name ?? 'Marca desligada').join(', ')
}

const busy = ref(false)
async function refresh() {
  await queryClient.invalidateQueries({ queryKey: ['marketing'] })
}

// ── Convidar ────────────────────────────────────────────────────────────────
const inviteOpen = ref(false)
function openInvite() {
  inviteOpen.value = true
}

// ── Editar ──────────────────────────────────────────────────────────────────
const editing = ref<MarketingMember | null>(null)
const edit = reactive({ role: 'EDITOR' as MarketingRole, brandIds: [] as string[], title: '' })
const roleItems = computed(() => grantable.value.map((r) => ({ label: MARKETING_ROLE_LABEL[r], value: r })))
function openEdit(m: MarketingMember) {
  editing.value = m
  Object.assign(edit, { role: m.role, brandIds: [...m.brandIds], title: m.title ?? '' })
}
async function submitEdit() {
  const m = editing.value
  if (!m) return
  busy.value = true
  try {
    await updateMember(props.groupId, m.userId, {
      role: edit.role !== m.role ? edit.role : undefined,
      brandIds: edit.brandIds,
      title: edit.title.trim() || null,
    })
    toast.success(`${m.name} atualizado`)
    editing.value = null
    await refresh()
  } catch (error) {
    toast.error(getApiErrorMessage(error, 'Não deu para salvar.'))
  } finally {
    busy.value = false
  }
}

// ── Link de acesso e remover ────────────────────────────────────────────────
const linkFor = ref<{ member: MarketingMember; result: AccessLinkResult } | null>(null)
async function generateLink(m: MarketingMember) {
  busy.value = true
  try {
    linkFor.value = { member: m, result: await memberAccessLink(props.groupId, m.userId) }
  } catch (error) {
    toast.error(getApiErrorMessage(error, 'Não deu para gerar o link.'))
  } finally {
    busy.value = false
  }
}

const removing = ref<MarketingMember | null>(null)
async function confirmRemove() {
  const m = removing.value
  if (!m) return
  busy.value = true
  try {
    await removeMember(props.groupId, m.userId)
    toast.success(m.userId === props.myId ? 'Você saiu da ala' : `${m.name} saiu da ala`)
    removing.value = null
    await refresh()
  } catch (error) {
    toast.error(getApiErrorMessage(error, 'Não deu para tirar.'))
  } finally {
    busy.value = false
  }
}

function toggleBrand(list: string[], id: string) {
  const i = list.indexOf(id)
  if (i >= 0) list.splice(i, 1)
  else list.push(id)
}
</script>

<template>
  <section class="mk-panel">
    <header class="mk-panel__head">
      Equipe
      <span class="mk-hint">{{ members.length }} {{ members.length === 1 ? 'pessoa' : 'pessoas' }}</span>
      <span class="mk-toolbar__spacer" />
      <button v-if="canManageTeam" type="button" class="mk-btn mk-btn--primary" @click="openInvite">
        <UserPlus :size="15" /> Convidar
      </button>
    </header>
    <div class="st__wrap">
      <table class="mk-table st__table">
        <thead>
          <tr>
            <th>Pessoa</th>
            <th>Papel</th>
            <th class="st__hide-sm">Marcas</th>
            <th v-if="canManageTeam" class="st__actions-h"><span class="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in members" :key="m.userId">
            <td>
              <div class="st__person">
                <PersonAvatar :id="m.userId" :name="m.name" :avatar-url="m.avatarUrl" :size="28" decorative />
                <div class="st__who">
                  <span class="st__name">{{ m.name }}<template v-if="m.userId === myId"> (você)</template></span>
                  <span class="mk-hint">{{ m.title || m.email || '' }}</span>
                </div>
              </div>
            </td>
            <td>
              <span class="mk-chip" :title="ROLE_HINT[m.role]">{{ MARKETING_ROLE_LABEL[m.role] }}</span>
            </td>
            <td class="st__hide-sm">
              <span class="mk-hint">{{ brandNames(m.brandIds) }}</span>
            </td>
            <td v-if="canManageTeam" class="st__actions">
              <template v-if="canManage(m)">
                <button type="button" class="mk-icon-btn" :aria-label="`Editar ${m.name}`" @click="openEdit(m)">
                  <Pencil :size="15" />
                </button>
                <button
                  type="button"
                  class="mk-icon-btn"
                  :aria-label="`Link de primeiro acesso de ${m.name}`"
                  title="Link de primeiro acesso (quem entra só pela ala)"
                  :disabled="busy"
                  @click="generateLink(m)"
                >
                  <KeyRound :size="15" />
                </button>
                <button type="button" class="mk-icon-btn" :aria-label="`Tirar ${m.name} da ala`" @click="removing = m">
                  <Trash2 :size="15" />
                </button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Convidar: abas Do Nevo e Por e-mail -->
    <InviteMembersDialog
      v-model="inviteOpen"
      :group-id="groupId"
      :brands="brands"
      :grantable="grantable"
      :role-hint="ROLE_HINT"
    />

    <!-- Editar -->
    <SettingsDialog :model-value="!!editing" :title="`Editar ${editing?.name ?? ''}`" :loading="busy" @update:model-value="(v) => { if (!v) editing = null }">
      <div class="mk-field">
        <span class="mk-label">Papel</span>
        <AppSelect v-model="edit.role" :items="roleItems" label="Papel" density="compact" />
        <span class="mk-hint">{{ ROLE_HINT[edit.role] }}</span>
      </div>
      <fieldset v-if="brands.length > 1" class="st__brands">
        <legend class="mk-label">Marcas (nenhuma marcada = todas)</legend>
        <label v-for="b in brands" :key="b.companyId" class="st__brand">
          <input type="checkbox" :checked="edit.brandIds.includes(b.companyId)" @change="toggleBrand(edit.brandIds, b.companyId)" />
          <span class="mk-dot" :style="toneStyle(brandTone(b))" aria-hidden="true" />
          {{ b.name }}
        </label>
      </fieldset>
      <div class="mk-field">
        <label class="mk-label" for="ed-title">Rótulo na equipe</label>
        <input id="ed-title" v-model="edit.title" class="mk-input" type="text" />
      </div>
      <template #footer>
        <button type="button" class="mk-btn mk-btn--ghost" :disabled="busy" @click="editing = null">Cancelar</button>
        <button type="button" class="mk-btn mk-btn--primary" :disabled="busy" @click="submitEdit">Salvar</button>
      </template>
    </SettingsDialog>

    <!-- Link gerado -->
    <SettingsDialog :model-value="!!linkFor" :title="`Acesso de ${linkFor?.member.name ?? ''}`" @update:model-value="(v) => { if (!v) linkFor = null }">
      <AccessLinkBox
        v-if="linkFor"
        :link="linkFor.result.link"
        :expires-at="linkFor.result.expiresAt"
        :emailed="linkFor.result.emailed"
        :email="linkFor.result.user.email"
      />
      <template #footer>
        <button type="button" class="mk-btn mk-btn--primary" @click="linkFor = null">Pronto</button>
      </template>
    </SettingsDialog>

    <ConfirmDialog
      :model-value="!!removing"
      :title="removing?.userId === myId ? 'Sair da ala?' : 'Tirar da ala?'"
      :message="removing?.userId === myId
        ? 'Você perde o acesso à ala Marketing deste grupo. O que você criou fica.'
        : `${removing?.name ?? ''} perde o acesso à ala. O que a pessoa criou fica.`"
      :confirm-label="removing?.userId === myId ? 'Sair' : 'Tirar da ala'"
      danger
      :loading="busy"
      @update:model-value="(v) => { if (!v) removing = null }"
      @confirm="confirmRemove"
    />
  </section>
</template>

<style scoped>
.st__wrap {
  overflow-x: auto;
}

.st__person {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.st__who {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.st__name {
  font-weight: 600;
}

.st__actions-h {
  width: 1%;
}

.st__actions {
  white-space: nowrap;
  text-align: right;
}

.st__brands {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin: 0;
  padding: 0;
  border: 0;
}

.st__brands legend {
  margin-bottom: 6px;
}

.st__brand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

@media (max-width: 640px) {
  .st__hide-sm {
    display: none;
  }
}

/* AppSelect compacto tem 36px; no celular o toque pede 44px. */
@media (max-width: 640px) {
  .mk-field :deep(.app-select__trigger) {
    min-height: 44px;
  }
}
</style>
