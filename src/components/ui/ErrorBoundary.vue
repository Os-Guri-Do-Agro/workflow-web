<script setup lang="ts">
/**
 * Fronteira de erro: impede que um pedaço quebrado derrube a tela inteira.
 *
 * No Vue, uma exceção no `setup` de um filho sobe e mata a árvore toda — a
 * pessoa vê a página em branco, sem saber por quê e sem nada para clicar. Numa
 * tela composta como o Meu tempo, é desproporcional: um card lateral com
 * problema não deveria impedir alguém de registrar o próprio tempo.
 *
 * Aqui o erro é contido, o restante da tela continua funcionando, e o pedaço
 * quebrado vira uma caixa com "tentar de novo".
 *
 * Use em volta do que é ACESSÓRIO. Não use para esconder falha do fluxo
 * principal: ali o certo é a tela dizer o que aconteceu.
 *
 * O Nevo triste (pequeno, parado, decorativo) fica ao lado da mensagem: dá o
 * tom de "algo deu errado aqui" sem alarme. O NevoSprite é só CSS e sprite,
 * e as telas que usam esta caixa (home e Meu tempo) já o carregam.
 */
import { onErrorCaptured, ref } from 'vue'
import { RotateCcw } from 'lucide-vue-next'
import NevoSprite from '@/components/nevo/NevoSprite.vue'

const props = withDefaults(
  defineProps<{
    /** O que falhou, na língua de quem lê. Ex.: "o banco de horas". */
    label?: string
  }>(),
  { label: 'esta parte' },
)

const erro = ref<Error | null>(null)
/** Trocar a chave remonta a subárvore do zero na hora de tentar de novo. */
const tentativa = ref(0)

onErrorCaptured((e) => {
  erro.value = e instanceof Error ? e : new Error(String(e))
  // O erro continua indo para o console (e para quem monitora), mas para de
  // subir na árvore de componentes.
  console.error(`[nevo] Falha isolada em ${props.label}:`, e)
  return false
})

function tentarDeNovo() {
  erro.value = null
  tentativa.value += 1
}
</script>

<template>
  <div v-if="erro" class="eb">
    <span class="eb-nevo">
      <NevoSprite pose="sad" motion="still" :size="48" />
    </span>
    <div class="eb-text">
      <p class="eb-title">Não consegui carregar {{ label }}</p>
      <p class="eb-msg">{{ erro.message }}</p>
    </div>
    <button class="eb-btn" type="button" @click="tentarDeNovo">
      <RotateCcw :size="14" aria-hidden="true" /> Tentar de novo
    </button>
  </div>
  <template v-else>
    <slot :key="tentativa" />
  </template>
</template>

<style scoped>
.eb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 12px;
  padding: 10px 13px;
  border: 1px solid color-mix(in srgb, var(--warn) 35%, var(--border));
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--warn);
}

.eb-nevo {
  flex: none;
  display: inline-flex;
  align-items: flex-end;
  justify-content: center;
  width: 40px;
  height: 48px;
}

.eb-text {
  flex: 1;
  min-width: min(180px, 100%);
}

.eb-title {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--text);
}

.eb-msg {
  margin: 3px 0 0;
  /* Piso de 12px (acessibilidade 50+); em rem para seguir o "Aumento de fonte". */
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--text-3);
  overflow-wrap: anywhere;
}

.eb-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  /* Alvo de toque >= 44px (acessibilidade 50+). */
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 650;
  cursor: pointer;
}

.eb-btn:hover {
  background: var(--surface-3);
}
</style>
