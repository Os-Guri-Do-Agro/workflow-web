<script setup lang="ts">
/**
 * Área Dados sem número do app (M4): explica o que é, como conectar e o que
 * fica de fora, sem quebrar a ala. O Dono vai direto para a conexão; quem não
 * é Dono vê a quem pedir.
 */
import { RouterLink } from 'vue-router'
import { PlugZap } from 'lucide-vue-next'

defineProps<{ connected: boolean; isOwner: boolean; canSeeSettings: boolean }>()
</script>

<template>
  <section class="mk-panel ade" data-testid="app-data-empty" aria-labelledby="ade-title">
    <div class="ade__head">
      <PlugZap :size="18" aria-hidden="true" />
      <h2 id="ade-title">
        {{ connected ? 'O app está conectado, mas ainda não mandou números' : 'Os números do app ainda não chegam aqui' }}
      </h2>
    </div>
    <p class="ade__lead">
      Esta área mostra, por dia, os cadastros, ativos, assinaturas, pets e o uso das funções do app, e cruza os
      cadastros de cada semana fechada com as UTMs da ala: qual post, QR, campanha ou parceiro trouxe os cadastros.
    </p>
    <ol class="ade__steps">
      <li>
        <b>O Dono cria o token</b> em Configurações, "Conexão com o app", escolhendo a marca. O token aparece uma vez
        só: copie na hora.
      </li>
      <li>
        <b>Quem cuida da API do app</b> põe o token em <code>NEVO_API_TOKEN</code> e o endereço da API do Nevo em
        <code>NEVO_API_URL</code>. O envio roda sozinho todo dia às 03:15 (Brasília), com o dia anterior.
      </li>
      <li>
        <b>No dia seguinte</b> os números aparecem aqui. Na primeira vez o app manda também os 90 dias anteriores.
      </li>
    </ol>
    <p class="ade__note">
      Só chegam números somados. Qualquer número de 1 a 4 vem como "menos de 5", para ninguém ser reconhecido. A
      origem do cadastro vem do próprio site e do app: é uma estimativa, não uma prova.
    </p>
    <div class="ade__actions">
      <RouterLink
        v-if="isOwner"
        class="mk-btn mk-btn--primary"
        :to="{ name: 'marketing-settings', query: { aba: 'app' } }"
        data-action="go-connect"
      >
        Abrir a conexão com o app
      </RouterLink>
      <RouterLink
        v-else-if="canSeeSettings"
        class="mk-btn"
        :to="{ name: 'marketing-settings', query: { aba: 'app' } }"
      >
        Ver a conexão com o app
      </RouterLink>
      <span v-else class="mk-hint">Peça ao Dono do grupo para conectar o app.</span>
    </div>
  </section>
</template>

<style scoped>
.ade {
  display: grid;
  gap: 10px;
  padding: 16px 18px;
  max-width: 760px;
}

.ade__head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
}

.ade__head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.ade__lead,
.ade__note {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-2);
}

.ade__note {
  color: var(--text-3);
}

.ade__steps {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text);
}

.ade__steps code {
  padding: 0 4px;
  border-radius: 4px;
  background: var(--surface-2);
  font-size: 12px;
}

.ade__actions {
  display: flex;
  gap: 8px;
}

.ade__actions a {
  text-decoration: none;
}
</style>
