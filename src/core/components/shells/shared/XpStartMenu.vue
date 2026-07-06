<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { LogOut, Power } from 'lucide-vue-next'
import XpIcon from './XpIcon.vue'
import { useUiPreferences } from '@/composables/useUiPreferences'
import { useNavQuarters } from '@/composables/useNavQuarters'
import { getUserToken } from '@/utils/authContent'
import { clearSession } from '@/service/api'

/*
 * Menu Iniciar do easter egg Windows XP (tema Luna).
 *
 * Sobe do canto inferior esquerdo, acima da XpTaskbar. Header azul com o
 * usuário, corpo em duas colunas (atalhos de app à esquerda em branco, itens de
 * sistema à direita em azul-claro) e rodapé com Logoff / Desligar. O estado de
 * aberto/fechado vive na XpTaskbar (pai); aqui só emitimos `close` ao escolher.
 *
 * Cores literais Luna são propositais (é o ponto do easter egg).
 */

const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const { toggleXp } = useUiPreferences()
const { firstMonth } = useNavQuarters()

// Usuário do JWT (mesmo caminho do UserMenu). Sem token → "Usuário".
const user = getUserToken()
const userName = computed(() => user?.name || 'Usuário')
const userInitials = computed(() =>
  (user?.name || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2),
)

interface MenuLink {
  label: string
  icon: string // nome do XpIcon
  to: string
}

// Coluna esquerda: TODOS os destinos de navegação (a sidebar some no XP, então
// o Menu Iniciar é a navegação principal). Tarefas cai no primeiro mês.
const appLinks = computed<MenuLink[]>(() => {
  const links: MenuLink[] = [
    { label: 'Dashboard', icon: 'dashboard', to: '/dashboard' },
    { label: 'Board', icon: 'board', to: '/board' },
    { label: 'Roadmap', icon: 'roadmap', to: '/roadmap' },
  ]
  if (firstMonth.value) {
    links.push({ label: 'Tarefas', icon: 'documents', to: `/tasks/${firstMonth.value.id}` })
  }
  links.push(
    { label: 'Notas', icon: 'notes', to: '/notes' },
    { label: 'Calendário', icon: 'calendar', to: '/calendar' },
    { label: 'Variáveis', icon: 'variables', to: '/variables' },
    { label: 'Usuários', icon: 'users', to: '/company-users' },
    { label: 'QR Codes', icon: 'qr', to: '/qr' },
    { label: 'Meu tempo', icon: 'clock', to: '/time' },
  )
  return links
})

function go(to: string): void {
  void router.push(to)
  emit('close')
}

// Item decorativo (Meu Computador / Ajuda): só fecha o menu.
function decorative(): void {
  emit('close')
}

// Fazer Logoff: logout real (limpa sessão, preserva preferências de UI) e vai
// pro login.
function logoff(): void {
  clearSession()
  emit('close')
  void router.push('/login')
}

// Desligar: "desliga" o computador = sai do modo XP.
function shutDown(): void {
  emit('close')
  toggleXp()
}
</script>

<template>
  <div class="xp-startmenu" role="menu" aria-label="Menu Iniciar">
    <!-- Header azul com usuário -->
    <header class="xp-sm-header">
      <div class="xp-sm-avatar">{{ userInitials }}</div>
      <span class="xp-sm-username">{{ userName }}</span>
    </header>

    <!-- Corpo em duas colunas -->
    <div class="xp-sm-body">
      <div class="xp-sm-col xp-sm-col--left">
        <button
          v-for="link in appLinks"
          :key="link.to"
          class="xp-sm-item"
          type="button"
          role="menuitem"
          @click="go(link.to)"
        >
          <span class="xp-sm-item-ico">
            <XpIcon :name="link.icon" :size="26" />
          </span>
          <span class="xp-sm-item-label">{{ link.label }}</span>
        </button>
      </div>

      <div class="xp-sm-col xp-sm-col--right">
        <button class="xp-sm-item xp-sm-item--sys" type="button" role="menuitem" @click="decorative">
          <span class="xp-sm-item-ico"><XpIcon name="my-computer" :size="26" /></span>
          <span class="xp-sm-item-label">Meu Computador</span>
        </button>
        <button class="xp-sm-item xp-sm-item--sys" type="button" role="menuitem" @click="decorative">
          <span class="xp-sm-item-ico"><XpIcon name="documents" :size="26" /></span>
          <span class="xp-sm-item-label">Meus Documentos</span>
        </button>
        <button class="xp-sm-item xp-sm-item--sys" type="button" role="menuitem" @click="go('/settings')">
          <span class="xp-sm-item-ico"><XpIcon name="settings" :size="26" /></span>
          <span class="xp-sm-item-label">Configurações</span>
        </button>
        <div class="xp-sm-sep" />
        <button class="xp-sm-item xp-sm-item--sys" type="button" role="menuitem" @click="decorative">
          <span class="xp-sm-item-ico"><XpIcon name="internet" :size="26" /></span>
          <span class="xp-sm-item-label">Ajuda e Suporte</span>
        </button>
      </div>
    </div>

    <!-- Rodapé azul com Logoff / Desligar -->
    <footer class="xp-sm-footer">
      <button class="xp-sm-power" type="button" @click="logoff">
        <LogOut :size="16" />
        <span>Fazer Logoff</span>
      </button>
      <button class="xp-sm-power" type="button" @click="shutDown">
        <Power :size="16" />
        <span>Desligar</span>
      </button>
    </footer>
  </div>
</template>

<style scoped>
.xp-startmenu {
  position: fixed;
  left: 0;
  bottom: 30px; /* logo acima da XpTaskbar (30px) */
  z-index: 1001;
  width: 380px;
  max-width: calc(100vw - 8px);
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  font-family: Tahoma, 'Segoe UI', Verdana, sans-serif;
  border: 1px solid #0a3aa0;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  box-shadow: 4px 0 18px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

/* ── Header ── */
.xp-sm-header {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 58px;
  padding: 0 14px;
  background: linear-gradient(180deg, #1f6fe0 0%, #185fd0 45%, #0f4bb8 100%);
  border-bottom: 2px solid #ec9b1a;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
}

.xp-sm-avatar {
  width: 38px;
  height: 38px;
  border-radius: 5px;
  background: linear-gradient(180deg, #ffd479, #e9973a);
  border: 2px solid rgba(255, 255, 255, 0.85);
  color: #5a3300;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 14px;
  flex-shrink: 0;
}

.xp-sm-username {
  color: #ffffff;
  font-size: 15px;
  font-weight: 700;
  text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.45);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Corpo ── */
.xp-sm-body {
  display: grid;
  grid-template-columns: 1fr 44%;
  min-height: 0;
  overflow-y: auto;
}

.xp-sm-col {
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.xp-sm-col--left {
  background: #ffffff;
  border-right: 1px solid #aac4ea;
}

.xp-sm-col--right {
  background: #d3e5fa;
}

.xp-sm-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 8px;
  background: transparent;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  color: #0a1a33;
}

.xp-sm-item:hover {
  background: #2f66d0;
  color: #ffffff;
}

.xp-sm-item-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  flex-shrink: 0;
}

.xp-sm-item-ico--accent {
  color: #d24726;
}

.xp-sm-item:hover .xp-sm-item-ico,
.xp-sm-item:hover .xp-sm-item-ico--accent {
  color: #ffffff;
}

.xp-sm-item-label {
  font-size: 12.5px;
  font-weight: 600;
}

.xp-sm-item--sys .xp-sm-item-label {
  font-weight: 700;
}

.xp-sm-sep {
  height: 1px;
  margin: 5px 6px;
  background: #a7c1e6;
}

/* ── Rodapé ── */
.xp-sm-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  padding: 6px 10px;
  background: linear-gradient(180deg, #2f7bea 0%, #1a5cce 55%, #0f4bb8 100%);
  border-top: 1px solid #6a9be5;
}

.xp-sm-power {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: #ffffff;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.35);
  transition: background 120ms ease;
}

.xp-sm-power:hover {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.4);
}

.xp-sm-power:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 1px;
}
</style>
