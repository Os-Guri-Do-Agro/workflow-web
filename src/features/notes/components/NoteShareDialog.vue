<script setup lang="ts">
/**
 * Compartilhar nota: convidar pessoas da empresa (Ver/Editar) e gerar link
 * público. Padrão de overlay do projeto (Teleport + tokens, sem v-dialog).
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { refDebounced } from '@vueuse/core'
import {
  Copy, Link2, Loader2, Search, Trash2, UserPlus, X,
} from 'lucide-vue-next'
import userService from '@/service/user/user-service'
import { getApiErrorMessage } from '@/service/api'
import { useToast } from '@/composables/useToast'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { useNoteAccess } from '../composables/useNoteAccess'
import type { NoteAccessLevel } from '../types'

const props = defineProps<{ modelValue: boolean; noteId: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const { success, error: showError } = useToast()

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const { people, links, grant, changeLevel, revoke, createLink, revokeLink } = useNoteAccess(
  () => props.noteId,
  () => props.modelValue,
)

// ── Busca de pessoas ──
const query = ref('')
const debounced = refDebounced(query, 300)
const results = ref<Array<{ id: string; name: string; email: string }>>([])
const searching = ref(false)
const inviteLevel = ref<NoteAccessLevel>('EDIT')

watch(debounced, async (q) => {
  const term = q.trim()
  if (term.length < 2) {
    results.value = []
    return
  }
  searching.value = true
  try {
    const all = await userService.searchUsers(term)
    const taken = new Set(people.data.value?.map((p) => p.user.id) ?? [])
    results.value = all.filter((u) => !taken.has(u.id))
  } catch {
    results.value = []
  } finally {
    searching.value = false
  }
})

async function invite(userId: string) {
  try {
    await grant.mutateAsync({ userId, level: inviteLevel.value })
    query.value = ''
    results.value = []
    success('Convite enviado')
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não foi possível convidar'))
  }
}

async function setLevel(userId: string, level: NoteAccessLevel) {
  try {
    await changeLevel.mutateAsync({ userId, level })
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não foi possível mudar o nível'))
  }
}

async function removePerson(userId: string) {
  try {
    await revoke.mutateAsync(userId)
    success('Acesso removido')
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não foi possível remover'))
  }
}

// ── Link público ──
const linkLevel = ref<NoteAccessLevel>('VIEW')
const revokingToken = ref<string | null>(null)

async function generateLink() {
  try {
    const link = await createLink.mutateAsync(linkLevel.value)
    await copyLink(link.path)
    success('Link criado e copiado')
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não foi possível gerar o link'))
  }
}

async function copyLink(path: string) {
  const url = `${window.location.origin}${path}`
  try {
    await navigator.clipboard.writeText(url)
    success('Link copiado')
  } catch {
    showError('Copie o link manualmente: ' + url)
  }
}

async function confirmRevokeLink() {
  const token = revokingToken.value
  if (!token) return
  try {
    const res = await revokeLink.mutateAsync(token)
    revokingToken.value = null
    success(
      res.revokedAccesses > 0
        ? `Link revogado. ${res.revokedAccesses} pessoa(s) perderam o acesso.`
        : 'Link revogado',
    )
  } catch (err) {
    showError(getApiErrorMessage(err, 'Não foi possível revogar o link'))
  }
}

const revokingLink = computed(() =>
  links.data.value?.find((l) => l.token === revokingToken.value),
)

function invitedLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
}

const panel = ref<HTMLElement | null>(null)
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false
}
watch(open, async (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', onKeydown)
    query.value = ''
    results.value = []
    await nextTick()
    panel.value?.focus()
  } else {
    document.removeEventListener('keydown', onKeydown)
  }
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="share-fade">
      <div v-if="open" class="share-scrim" @mousedown.self="open = false">
        <div ref="panel" class="share" role="dialog" aria-modal="true" aria-label="Compartilhar nota" tabindex="-1">
          <header class="share__head">
            <h2>Compartilhar</h2>
            <button type="button" aria-label="Fechar" @click="open = false"><X :size="16" /></button>
          </header>

          <!-- Convidar -->
          <div class="share__invite">
            <div class="share__search">
              <Search :size="15" />
              <input
                v-model="query"
                type="text"
                placeholder="Buscar pessoas por nome ou e-mail"
                aria-label="Buscar pessoas"
              />
              <div class="share__level-toggle" role="group" aria-label="Nível do convite">
                <button type="button" :class="{ on: inviteLevel === 'VIEW' }" @click="inviteLevel = 'VIEW'">Ver</button>
                <button type="button" :class="{ on: inviteLevel === 'EDIT' }" @click="inviteLevel = 'EDIT'">Editar</button>
              </div>
            </div>

            <ul v-if="results.length" class="share__results">
              <li v-for="u in results" :key="u.id">
                <button type="button" class="share__result" @click="invite(u.id)">
                  <span class="share__avatar">{{ initials(u.name) }}</span>
                  <span class="share__person">
                    <strong>{{ u.name }}</strong>
                    <small>{{ u.email }}</small>
                  </span>
                  <UserPlus :size="15" />
                </button>
              </li>
            </ul>
            <p v-else-if="searching" class="share__hint">Buscando…</p>
            <p v-else-if="query.trim().length >= 2" class="share__hint">Ninguém encontrado na empresa.</p>
          </div>

          <!-- Quem tem acesso -->
          <div class="share__section">
            <span class="share__label">Com acesso</span>
            <ul class="share__people">
              <li v-for="p in people.data.value ?? []" :key="p.user.id" class="share__row">
                <span class="share__avatar">{{ initials(p.user.name) }}</span>
                <span class="share__person">
                  <strong>{{ p.user.name }}</strong>
                  <small>
                    {{ p.viaLink ? 'entrou por link' : 'convidado em' }} {{ invitedLabel(p.invitedAt) }}
                  </small>
                </span>
                <div class="share__level-toggle share__level-toggle--sm" role="group" aria-label="Nível de acesso">
                  <button type="button" :class="{ on: p.level === 'VIEW' }" @click="setLevel(p.user.id, 'VIEW')">Ver</button>
                  <button type="button" :class="{ on: p.level === 'EDIT' }" @click="setLevel(p.user.id, 'EDIT')">Editar</button>
                </div>
                <button type="button" class="share__remove" aria-label="Remover acesso" @click="removePerson(p.user.id)">
                  <Trash2 :size="14" />
                </button>
              </li>
              <li v-if="!(people.data.value ?? []).length" class="share__empty">
                Só você tem acesso. Convide alguém acima.
              </li>
            </ul>
          </div>

          <!-- Link público -->
          <div class="share__section">
            <span class="share__label">Link público</span>
            <div class="share__link-create">
              <div class="share__level-toggle" role="group" aria-label="Nível do link">
                <button type="button" :class="{ on: linkLevel === 'VIEW' }" @click="linkLevel = 'VIEW'">Ver</button>
                <button type="button" :class="{ on: linkLevel === 'EDIT' }" @click="linkLevel = 'EDIT'">Editar</button>
              </div>
              <button type="button" class="share__link-btn" :disabled="createLink.isPending.value" @click="generateLink">
                <Loader2 v-if="createLink.isPending.value" :size="14" class="spin" />
                <Link2 v-else :size="14" />
                Gerar link
              </button>
            </div>
            <p class="share__link-note">
              {{ linkLevel === 'VIEW'
                ? 'Qualquer pessoa com o link lê a nota sem precisar de conta.'
                : 'Quem abrir o link precisa entrar; então ganha acesso de edição.' }}
            </p>

            <ul v-if="(links.data.value ?? []).length" class="share__links">
              <li v-for="l in links.data.value ?? []" :key="l.token" class="share__link-row">
                <span class="share__link-badge" :class="`share__link-badge--${l.accessLevel.toLowerCase()}`">
                  {{ l.accessLevel === 'VIEW' ? 'Ver' : 'Editar' }}
                </span>
                <code class="share__link-url">{{ l.path }}</code>
                <button type="button" aria-label="Copiar link" @click="copyLink(l.path)"><Copy :size="14" /></button>
                <button type="button" aria-label="Revogar link" @click="revokingToken = l.token"><X :size="14" /></button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <ConfirmDialog
    :model-value="!!revokingToken"
    title="Revogar link"
    :message="
      (revokingLink && !revokingLink.accessLevel)
        ? 'Este link deixará de funcionar.'
        : 'O link deixará de funcionar. Quem entrou por ele perde o acesso; convites diretos continuam.'
    "
    confirm-label="Revogar"
    danger
    :loading="revokeLink.isPending.value"
    @update:model-value="revokingToken = null"
    @confirm="confirmRevokeLink"
  />
</template>

<style scoped>
.share-scrim {
  position: fixed;
  inset: 0;
  z-index: 2500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: color-mix(in srgb, var(--bg) 72%, transparent);
  backdrop-filter: blur(3px);
}

.share {
  width: 100%;
  max-width: 460px;
  max-height: min(88vh, 720px);
  overflow-y: auto;
  padding: 18px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-overlay);
}

.share:focus {
  outline: none;
}

.share__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.share__head h2 {
  margin: 0;
  color: var(--text);
  font-size: 16px;
  font-weight: 650;
}

.share__head button {
  display: inline-flex;
  padding: 5px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-3);
  cursor: pointer;
}

.share__head button:hover {
  background: var(--surface-2);
  color: var(--text);
}

.share__search {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 9px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-3);
}

.share__search:focus-within {
  border-color: var(--accent);
}

.share__search input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
}

.share__search input:focus {
  outline: none;
}

.share__level-toggle {
  display: inline-flex;
  flex-shrink: 0;
  padding: 2px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.share__level-toggle button {
  padding: 4px 9px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-3);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}

.share__level-toggle button.on {
  background: var(--accent);
  color: var(--accent-fg);
}

.share__level-toggle--sm button {
  padding: 3px 7px;
  font-size: 11px;
}

.share__results {
  margin: 6px 0 0;
  padding: 4px;
  list-style: none;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.share__result {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.share__result:hover {
  background: var(--surface-3);
}

.share__result :last-child {
  margin-left: auto;
  color: var(--text-3);
}

.share__hint,
.share__empty {
  margin: 8px 2px 0;
  color: var(--text-4);
  font-size: 12px;
}

.share__avatar {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 20%, var(--surface-3));
  color: var(--text);
  font-size: 11px;
  font-weight: 700;
}

.share__person {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.share__person strong {
  overflow: hidden;
  color: var(--text);
  font-size: 13px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share__person small {
  color: var(--text-3);
  font-size: 11px;
}

.share__section {
  margin-top: 18px;
}

.share__label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-3);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.share__people {
  margin: 0;
  padding: 0;
  list-style: none;
}

.share__row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 0;
}

.share__row .share__person {
  flex: 1;
}

.share__remove {
  display: inline-flex;
  padding: 5px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-3);
  cursor: pointer;
}

.share__remove:hover {
  background: color-mix(in srgb, var(--err) 14%, transparent);
  color: var(--err);
}

.share__link-create {
  display: flex;
  align-items: center;
  gap: 8px;
}

.share__link-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.share__link-btn:hover:not(:disabled) {
  background: var(--surface-3);
}

.share__link-note {
  margin: 8px 2px 0;
  color: var(--text-3);
  font-size: 11.5px;
  line-height: 1.5;
}

.share__links {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.share__link-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.share__link-badge {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
}

.share__link-badge--view {
  background: color-mix(in srgb, var(--info) 18%, transparent);
  color: var(--info);
}

.share__link-badge--edit {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--accent);
}

.share__link-url {
  flex: 1;
  overflow: hidden;
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share__link-row button {
  display: inline-flex;
  padding: 4px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-3);
  cursor: pointer;
}

.share__link-row button:hover {
  background: var(--surface-3);
  color: var(--text);
}

.spin {
  animation: share-spin 1s linear infinite;
}

@keyframes share-spin {
  to {
    transform: rotate(360deg);
  }
}

.share-fade-enter-active,
.share-fade-leave-active {
  transition: opacity var(--motion) var(--motion-ease);
}

.share-fade-enter-from,
.share-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .share-fade-enter-active,
  .share-fade-leave-active {
    transition-duration: 1ms;
  }
  .spin {
    animation-duration: 2.4s;
  }
}
</style>
