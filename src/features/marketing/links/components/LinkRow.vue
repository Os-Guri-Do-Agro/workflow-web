<script setup lang="ts">
/**
 * Uma linha dos Links de trabalho: abrir e copiar o link, copiar o usuário, e
 * a senha mascarada. "Revelar" pede a senha à API (fica registrado no
 * histórico da ala), mostra com o botão copiar e esconde sozinha em 30 s.
 * A senha revelada mora só aqui, na memória da linha; nunca no cache.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { Copy, ExternalLink, Eye, EyeOff, Loader2, Pencil, Star, Trash2 } from 'lucide-vue-next'
import { useToast } from '@/composables/useToast'
import { copyText } from '@/utils/clipboard'
import type { MarketingLink } from '@/service/marketing/marketing-links'
import { toneStyle } from '../../marketing-labels'
import { apiErrorMessage } from '../../calendar/api-error'

const REVEAL_SECONDS = 30

const props = defineProps<{
  link: MarketingLink
  brandName: string
  brandTone: string
  canEdit: boolean
  canReveal: boolean
  reveal: (linkId: string) => Promise<string>
}>()

const emit = defineEmits<{
  favorite: [link: MarketingLink]
  edit: [link: MarketingLink]
  delete: [link: MarketingLink]
}>()

const toast = useToast()

const host = computed(() => {
  try {
    const u = new URL(props.link.url)
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}`
  } catch {
    return props.link.url
  }
})

// ── Senha revelada (30 s) ─────────────────────────────────────────────────
const secret = ref<string | null>(null)
const left = ref(0)
const revealing = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

function hide() {
  secret.value = null
  left.value = 0
  if (timer) clearInterval(timer)
  timer = null
}

async function onReveal() {
  if (secret.value) return hide()
  revealing.value = true
  try {
    secret.value = await props.reveal(props.link.id)
    left.value = REVEAL_SECONDS
    if (timer) clearInterval(timer)
    timer = setInterval(() => {
      left.value -= 1
      if (left.value <= 0) hide()
    }, 1000)
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Não deu para revelar a senha.'))
  } finally {
    revealing.value = false
  }
}

onBeforeUnmount(hide)

async function copy(what: 'link' | 'user' | 'secret') {
  try {
    if (what === 'link') await copyText(props.link.url)
    else if (what === 'user') await copyText(props.link.username ?? '')
    // Sem revelar na tela: o reveal roda dentro do gesto do clique (e fica registrado).
    else await copyText(secret.value ?? props.reveal(props.link.id))
    toast.success(what === 'link' ? 'Link copiado.' : what === 'user' ? 'Usuário copiado.' : 'Senha copiada.')
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Não deu para copiar.'))
  }
}
</script>

<template>
  <li class="lk" :data-link="link.id">
    <button
      type="button"
      class="mk-icon-btn lk__fav"
      :class="{ 'is-on': link.isFavorite }"
      :aria-pressed="link.isFavorite"
      :aria-label="link.isFavorite ? `Tirar ${link.title} dos favoritos` : `Favoritar ${link.title}`"
      data-action="favorite"
      @click="emit('favorite', link)"
    >
      <Star :size="15" :fill="link.isFavorite ? 'currentColor' : 'none'" />
    </button>

    <div class="lk__main">
      <a :href="link.url" target="_blank" rel="noopener noreferrer" class="lk__title" :title="`${link.title} (${link.url})`">
        <span class="lk__title-text">{{ link.title }}</span>
        <ExternalLink :size="12" aria-hidden="true" />
      </a>
      <span class="lk__sub">
        <span v-if="brandName" class="lk__brand">
          <span class="mk-dot" :style="toneStyle(brandTone)" aria-hidden="true" />
          {{ brandName }}
        </span>
        <span class="lk__host">{{ host }}</span>
      </span>
      <span v-if="link.notes" class="lk__notes">{{ link.notes }}</span>
    </div>

    <div class="lk__field lk__user">
      <template v-if="link.username">
        <span class="lk__k">Usuário</span>
        <span class="lk__v" data-field="username">{{ link.username }}</span>
        <button type="button" class="mk-icon-btn lk__mini" :aria-label="`Copiar usuário de ${link.title}`" @click="copy('user')">
          <Copy :size="14" />
        </button>
      </template>
    </div>

    <div class="lk__field lk__secret">
      <template v-if="link.hasSecret">
        <span class="lk__k">Senha</span>
        <span v-if="secret" class="lk__v lk__v--secret" data-field="secret">{{ secret }}</span>
        <span v-else class="lk__v lk__mask" aria-label="Senha escondida">••••••••</span>
        <template v-if="canReveal">
          <button
            type="button"
            class="mk-icon-btn lk__mini"
            :aria-label="secret ? `Esconder a senha de ${link.title}` : `Revelar a senha de ${link.title}`"
            :title="secret ? 'Esconder' : 'Revelar (fica no histórico)'"
            :disabled="revealing"
            data-action="reveal"
            @click="onReveal"
          >
            <Loader2 v-if="revealing" :size="14" class="lk__spin" />
            <EyeOff v-else-if="secret" :size="14" />
            <Eye v-else :size="14" />
          </button>
          <button
            type="button"
            class="mk-icon-btn lk__mini"
            :aria-label="`Copiar a senha de ${link.title}`"
            title="Copiar senha (fica no histórico)"
            data-action="copy-secret"
            @click="copy('secret')"
          >
            <Copy :size="14" />
          </button>
          <span v-if="secret" class="lk__left" :title="`A senha some sozinha em ${left} s`" :aria-label="`A senha some em ${left} segundos`">{{ left }} s</span>
        </template>
      </template>
    </div>

    <div class="lk__actions">
      <button type="button" class="mk-btn mk-btn--ghost lk__copy" :aria-label="`Copiar link de ${link.title}`" data-action="copy-link" @click="copy('link')">
        <Copy :size="14" aria-hidden="true" />
        <span>Copiar link</span>
      </button>
      <button v-if="canEdit" type="button" class="mk-icon-btn" :aria-label="`Editar ${link.title}`" data-action="edit" @click="emit('edit', link)">
        <Pencil :size="14" />
      </button>
      <button
        v-if="link.canDelete"
        type="button"
        class="mk-icon-btn lk__del"
        :aria-label="`Mandar ${link.title} para a lixeira`"
        title="Mandar para a lixeira"
        data-action="delete"
        @click="emit('delete', link)"
      >
        <Trash2 :size="14" />
      </button>
    </div>
  </li>
</template>

<style scoped>
.lk {
  display: grid;
  grid-template-columns: 32px minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.3fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 6px 10px 6px 6px;
}

.lk + .lk {
  border-top: 1px solid var(--border);
}

.lk:hover {
  background: color-mix(in srgb, var(--surface-2) 60%, transparent);
}

.lk__fav {
  color: var(--text-4);
}

.lk__fav.is-on {
  color: var(--warn);
}

.lk__main {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.lk__title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  font-size: 13.5px;
  font-weight: 650;
  text-decoration: none;
  white-space: nowrap;
}

.lk__title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lk__title:hover {
  color: var(--accent-ink);
  text-decoration: underline;
}

.lk__title svg {
  flex: none;
  color: var(--text-3);
}

.lk__sub {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  color: var(--text-3);
  font-size: 12px;
}

.lk__brand {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 5px;
  color: var(--text-2);
  font-weight: 600;
}

.lk__host {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lk__notes {
  overflow: hidden;
  color: var(--text-3);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lk__field {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.lk__k {
  flex: none;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 600;
}

.lk__v {
  min-width: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lk__mask {
  color: var(--text-3);
  letter-spacing: 0.08em;
}

.lk__v--secret {
  flex-shrink: 0;
  max-width: 60%;
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  background: color-mix(in srgb, var(--warn) 14%, transparent);
  user-select: all;
}

.lk__mini {
  width: 28px;
  height: 28px;
}

.lk__mini:disabled {
  opacity: 0.6;
}

.lk__left {
  flex: none;
  color: var(--text-3);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.lk__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  justify-content: flex-end;
}

.lk__copy {
  min-height: 30px;
  padding: 4px 8px;
}

.lk__del:hover {
  color: var(--err);
}

.lk__spin {
  animation: lk-spin 0.8s linear infinite;
}

@keyframes lk-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1100px) {
  .lk {
    grid-template-columns: 32px minmax(0, 1fr) auto;
    grid-template-areas:
      'fav main actions'
      '. user user'
      '. secret secret';
    row-gap: 4px;
  }

  .lk__fav {
    grid-area: fav;
  }

  .lk__main {
    grid-area: main;
  }

  .lk__user {
    grid-area: user;
  }

  .lk__secret {
    grid-area: secret;
  }

  .lk__actions {
    grid-area: actions;
  }

  .lk__user:empty,
  .lk__secret:empty {
    display: none;
  }
}

@media (max-width: 640px) {
  .lk {
    gap: 6px 8px;
    padding: 8px 6px 8px 2px;
  }

  .lk__copy span {
    display: none;
  }

  .lk__copy {
    width: 44px;
    padding: 0;
  }

  .lk__mini {
    width: 44px;
    height: 44px;
  }
}
</style>
