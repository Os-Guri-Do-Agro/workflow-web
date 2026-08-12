<script setup lang="ts">
/**
 * MascotCard — aviso do Nevo no canto, no formato de mensagem recebida.
 *
 * A carinha da marca faz o papel do avatar de quem manda a mensagem, e o
 * conteúdo vem num balão com bico apontando para ela, como conversa de grupo.
 * Não é enfeite: um aviso que se apresenta como recado de alguém é lido como
 * conversa, e não como erro do sistema — que é o tom certo para "seu timer está
 * rodando sozinho".
 *
 * Só o desenho mora aqui. Posicionamento é do container (`.nevo-stack` no
 * AppShell), para os avisos empilharem entre si e nunca cobrirem o botão do
 * assistente, que ocupa o mesmo canto.
 */
withDefaults(
  defineProps<{
    /** Nome do remetente na linha de cima do balão. */
    from?: string
    /** `warn` tinge o balão de âmbar (aviso que pede ação). */
    tone?: 'default' | 'warn'
    /**
     * Como leitores de tela anunciam o card. `assertive` para o que pede ação
     * agora (ociosidade), `polite` para convite. Aviso que aparece sozinho na
     * tela precisa ser anunciado: quem não vê o canto não fica sabendo.
     */
    live?: 'polite' | 'assertive' | 'off'
  }>(),
  { from: 'Nevo', tone: 'default', live: 'polite' },
)
</script>

<template>
  <div
    class="mascot"
    :class="`mascot--${tone}`"
    :role="live === 'assertive' ? 'alert' : 'status'"
    :aria-live="live"
  >
    <span class="mascot-avatar">
      <img src="/brand/rosto.png" alt="" width="34" height="34" />
    </span>

    <div class="mascot-bubble">
      <p class="mascot-from">
        {{ from }}
        <slot name="meta" />
      </p>
      <slot />
      <div v-if="$slots.actions" class="mascot-actions">
        <slot name="actions" />
      </div>
    </div>

    <slot name="dismiss" />
  </div>
</template>

<style scoped>
.mascot {
  position: relative;
  width: min(370px, calc(100vw - 32px));
  display: flex;
  align-items: flex-end;
  gap: 9px;
  pointer-events: auto;
}

/* Avatar: chega com uma molinha e um leve giro, como quem aparece na conversa. */
.mascot-avatar {
  flex: none;
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid var(--border);
  /* Creme da marca, como no botão do assistente: sobre o fundo escuro do app a
     carinha em cima de superfície neutra some. */
  background: var(--brand-body, #ffdcb6);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transform-origin: bottom center;
  animation: mascot-pop 460ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.mascot-avatar img {
  width: 34px;
  height: 34px;
  object-fit: contain;
}

.mascot-bubble {
  flex: 1;
  min-width: 0;
  position: relative;
  padding: 10px 12px;
  border: 1px solid var(--border-strong);
  /* Canto de baixo à esquerda reto: é ele que "aponta" para o avatar. */
  border-radius: var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px;
  background: var(--surface);
  box-shadow: var(--shadow-overlay);
  animation: mascot-in 240ms var(--motion-ease) both;
}

.mascot--warn .mascot-bubble {
  border-color: color-mix(in srgb, var(--warn) 55%, var(--border));
  background: color-mix(in srgb, var(--warn) 10%, var(--surface));
}

/* Bico do balão. */
.mascot-bubble::before {
  content: '';
  position: absolute;
  left: -6px;
  bottom: 8px;
  width: 10px;
  height: 10px;
  transform: rotate(45deg);
  border-left: 1px solid var(--border-strong);
  border-bottom: 1px solid var(--border-strong);
  background: inherit;
}

.mascot--warn .mascot-bubble::before {
  border-color: color-mix(in srgb, var(--warn) 55%, var(--border));
}

.mascot-from {
  margin: 0 0 3px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-4);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.mascot-actions {
  margin-top: 9px;
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

@keyframes mascot-pop {
  0% {
    opacity: 0;
    transform: translateY(6px) scale(0.4) rotate(-10deg);
  }
  60% {
    opacity: 1;
    transform: translateY(0) scale(1.08) rotate(3deg);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1) rotate(0deg);
  }
}

@keyframes mascot-in {
  from {
    opacity: 0;
    transform: translateX(14px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mascot-avatar,
  .mascot-bubble {
    animation: none;
  }
}
</style>
