<script setup lang="ts">
/**
 * Tela cheia mostrada quando o usuário está logado mas não pertence a NENHUMA
 * empresa. Antes esse usuário ficava preso: nenhuma tela funciona sem empresa e
 * não havia como criar uma (o modal só existia numa rota ADMIN). Aqui ele cria a
 * primeira (o backend deixa quem não tem vínculo criar e virar ADMIN).
 */
import { useRouter } from 'vue-router'
import { Sparkles, ArrowRight, LogOut } from 'lucide-vue-next'
import { useCompanyCreation } from '@/composables/useCompanyCreation'
import { clearSession } from '@/service/api'

const { openCreateCompany } = useCompanyCreation()
const router = useRouter()

function logout() {
  clearSession()
  router.push('/login')
}
</script>

<template>
  <div class="nc">
    <div class="nc-card">
      <div class="nc-badge">
        <Sparkles :size="20" />
      </div>
      <h1 class="nc-title">Nova ideia?</h1>
      <p class="nc-sub">
        Crie uma empresa e comece a organizar suas ideias: tarefas, tempo, notas e roadmap,
        tudo em um lugar só. Você vira dono dela na hora.
      </p>

      <button class="nc-cta press" type="button" @click="openCreateCompany">
        <span>Criar minha empresa</span>
        <ArrowRight :size="17" />
      </button>

      <button class="nc-logout" type="button" @click="logout">
        <LogOut :size="13" />
        Sair da conta
      </button>
    </div>
  </div>
</template>

<style scoped>
.nc {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(120% 90% at 50% -10%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 60%),
    var(--bg);
}

.nc-card {
  width: min(460px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 40px 32px 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.nc-badge {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  margin-bottom: 20px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 15%, var(--surface-2));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 26%, transparent),
    0 0 28px color-mix(in srgb, var(--accent) 30%, transparent);
}

.nc-title {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--text);
}

.nc-sub {
  margin: 12px 0 26px;
  max-width: 40ch;
  color: var(--text-2);
  font-size: 14px;
  line-height: 1.6;
}

.nc-cta {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  height: 48px;
  padding: 0 22px;
  border: 1px solid color-mix(in srgb, var(--accent) 60%, var(--border));
  border-radius: var(--radius-lg);
  background: var(--accent);
  color: var(--accent-fg);
  font: inherit;
  font-size: 14.5px;
  font-weight: 700;
  cursor: pointer;
  transition: filter var(--motion-fast) var(--motion-ease), transform var(--motion-fast) var(--motion-ease);
}

.nc-cta:hover {
  filter: brightness(1.06);
  transform: translateY(-1px);
}

.nc-logout {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 20px;
  background: transparent;
  border: none;
  color: var(--text-4);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: color var(--motion-fast) var(--motion-ease);
}

.nc-logout:hover {
  color: var(--text-2);
}
</style>
