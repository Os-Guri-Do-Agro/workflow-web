<script setup lang="ts">
/**
 * PersonAvatar: o componente ÚNICO de pessoa. Todo lugar que desenha alguém
 * (topbar, card, lista, painel, equipe, comentários, menus) passa por aqui, e
 * nunca por um círculo de iniciais feito à mão.
 *
 * De onde vem a foto, nesta ordem:
 * 1. `avatarUrl` com valor (sobrepõe o diretório; é o que a prévia do upload usa);
 * 2. o diretório de pessoas (`usePeopleDirectory`), pelo `id` e, sem ele ou sem
 *    achar, pelo `name` normalizado (sem acento, sem caixa).
 * Sem foto, ou se a imagem falhar ao carregar, caem as INICIAIS no tom estável
 * da pessoa (`avatarTone` + `initials` de `utils/avatar.ts`), como sempre foi.
 *
 * Props:
 * - `id`: id do usuário, quando o payload tem (`user.id`, `userId`).
 * - `name`: obrigatório. Dá as iniciais, o tom e o texto alternativo.
 * - `avatarUrl`: foto explícita. `null`/ausente = consulta o diretório.
 * - `size`: diâmetro em px (padrão 24). As iniciais escalam junto: abaixo de 24
 *   ficam em metade do disco (a exceção aceita de texto < 12px), de 24 para
 *   cima nunca passam de 12px para baixo.
 * - `ring`: anel na cor do fundo para separar discos empilhados. A cor vem de
 *   `--pa-ring-color` (padrão `--surface`) e a espessura de `--pa-ring-width`
 *   (padrão 1.5px); quem empilha ajusta as duas no próprio CSS (ex.: no hover
 *   do card, `--pa-ring-color: var(--surface-2)`).
 * - `variant`: `solid` (disco no tom, iniciais na cor da superfície: board,
 *   menus) ou `soft` (tinta clara do tom com aro do tom: equipe, feed).
 * - `shape`: `circle` (padrão) ou `rounded` (quadrado de canto curto, o quadro
 *   do Menu Iniciar do Modo XP).
 * - `decorative`: o nome já está escrito ao lado. O avatar some da árvore de
 *   acessibilidade e o `alt` fica vazio, para o leitor não ler o nome duas vezes.
 *
 * O `title` (e qualquer outro atributo, como `class`) cai no elemento raiz.
 * Foto: `<img>` redondo com `object-fit: cover`, `loading="lazy"` e
 * `decoding="async"`, e um fio neutro por cima para a foto clara não se
 * dissolver no fundo claro. Zero hex: tudo sai de tokens.
 */
import { computed, ref } from 'vue'
import { usePeopleDirectory } from '@/composables/usePeopleDirectory'
import { avatarTone, initials, resolveAvatarSrc } from '@/utils/avatar'

const props = withDefaults(
  defineProps<{
    id?: string | null
    name: string
    avatarUrl?: string | null
    size?: number
    ring?: boolean
    variant?: 'solid' | 'soft'
    shape?: 'circle' | 'rounded'
    decorative?: boolean
  }>(),
  {
    id: null,
    avatarUrl: null,
    size: 24,
    ring: false,
    variant: 'solid',
    shape: 'circle',
    decorative: false,
  },
)

const directory = usePeopleDirectory()

const displayName = computed(() => props.name?.trim() || '?')

const src = computed(
  () => resolveAvatarSrc(props.avatarUrl) ?? directory.avatarFor({ id: props.id, name: props.name }),
)

/**
 * A URL que falhou, e não um booleano: quando a foto muda (upload novo,
 * diretório relido) a nova URL ganha outra chance sozinha.
 */
const failedSrc = ref<string | null>(null)
const showPhoto = computed(() => !!src.value && src.value !== failedSrc.value)

function onError() {
  failedSrc.value = src.value
}

const letters = computed(() => initials(displayName.value))

/** Metade do disco nos pequenos; de 24px para cima, nunca menos de 12px. */
const fontSize = computed(() => {
  const size = props.size
  if (size < 24) return Math.max(8, Math.round(size / 2))
  return Math.max(12, Math.round(size * 0.36))
})

const style = computed(() => ({
  '--pa-size': `${props.size}px`,
  '--pa-font': `${fontSize.value}px`,
  '--pa-tone': avatarTone(displayName.value),
}))
</script>

<template>
  <span
    class="person-avatar"
    :class="[
      `person-avatar--${variant}`,
      `person-avatar--${shape}`,
      { 'person-avatar--photo': showPhoto, 'person-avatar--ring': ring },
    ]"
    :style="style"
    :role="!decorative && !showPhoto ? 'img' : undefined"
    :aria-label="!decorative && !showPhoto ? displayName : undefined"
    :aria-hidden="decorative ? 'true' : undefined"
  >
    <img
      v-if="showPhoto"
      :key="src ?? undefined"
      class="person-avatar__img"
      :src="src ?? undefined"
      :alt="decorative ? '' : displayName"
      loading="lazy"
      decoding="async"
      draggable="false"
      @error="onError"
    />
    <template v-else>{{ letters }}</template>
  </span>
</template>

<style scoped>
.person-avatar {
  /* Duas camadas de sombra compostas por variável: o anel (fora) e o aro do
     tom no `soft` (dentro). Uma não apaga a outra. */
  --pa-halo: 0 0 0 0 transparent;
  --pa-edge: 0 0 0 0 transparent;

  position: relative;
  flex: none;
  display: inline-grid;
  place-items: center;
  width: var(--pa-size);
  height: var(--pa-size);
  box-sizing: border-box;
  border-radius: 999px;
  box-shadow: var(--pa-halo), var(--pa-edge);
  font-size: var(--pa-font);
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  vertical-align: middle;
  user-select: none;
}

.person-avatar--rounded {
  border-radius: var(--radius-xs, 4px);
}

.person-avatar--solid {
  background: var(--pa-tone);
  color: var(--surface);
}

.person-avatar--soft {
  --pa-edge: inset 0 0 0 1px color-mix(in srgb, var(--pa-tone) 32%, transparent);
  background: color-mix(in srgb, var(--pa-tone) 16%, var(--surface));
  color: color-mix(in srgb, var(--pa-tone) 64%, var(--text));
}

.person-avatar--ring {
  --pa-halo: 0 0 0 var(--pa-ring-width, 1.5px) var(--pa-ring-color, var(--surface));
}

/* Com foto: fundo neutro enquanto carrega (nada de iniciais piscando antes da
   imagem) e o fio neutro por cima da foto, não embaixo. */
.person-avatar--photo {
  --pa-edge: 0 0 0 0 transparent;
  background: var(--surface-3);
  color: transparent;
}

.person-avatar--photo::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 0 0 0 1px var(--border);
  pointer-events: none;
}

.person-avatar__img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
  -webkit-user-drag: none;
}
</style>
