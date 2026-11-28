<script setup lang="ts">
/**
 * Avatar de quem está numa reunião agendada: o anfitrião nas páginas públicas
 * (com a foto do perfil, quando a API manda) e o convidado na lista do painel
 * (sempre iniciais: é gente de fora). Sem foto, ou se a imagem falha, ficam as
 * iniciais no tom estável da pessoa.
 *
 * Não é o `PersonAvatar` de propósito: ele consulta o diretório de pessoas da
 * sessão pelo NOME quando não recebe foto, e um convidado de fora (ou um
 * visitante logado no Nevo) apareceria com a foto de um homônimo da empresa.
 * Aqui só vale a foto que veio junto.
 */
import { computed, ref, watch } from 'vue'
import { avatarTone, initials, resolveAvatarSrc } from '@/utils/avatar'

const props = withDefaults(defineProps<{ name: string; src?: string | null; size?: number }>(), {
  src: null,
  size: 48,
})

const url = computed(() => resolveAvatarSrc(props.src))
const failed = ref(false)
watch(url, () => (failed.value = false))

const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  fontSize: `${Math.max(12, Math.round(props.size * 0.36))}px`,
  '--ha-tone': avatarTone(props.name || '?'),
}))
</script>

<template>
  <span class="ha" :style="style" aria-hidden="true">
    <img
      v-if="url && !failed"
      :src="url"
      alt=""
      loading="eager"
      decoding="async"
      referrerpolicy="no-referrer"
      @error="failed = true"
    />
    <template v-else>{{ initials(name || '?') }}</template>
  </span>
</template>

<style scoped>
.ha {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 50%;
  background: color-mix(in srgb, var(--ha-tone) 18%, var(--surface-2));
  color: var(--ha-tone);
  font-weight: 700;
  letter-spacing: 0.02em;
  user-select: none;
}

/* Fio por cima da foto: foto clara não se dissolve no fundo claro. */
.ha::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 10%, transparent);
  pointer-events: none;
}

.ha img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
