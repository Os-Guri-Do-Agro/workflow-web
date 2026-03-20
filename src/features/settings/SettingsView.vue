<script setup lang="ts">
import { ref, watch } from 'vue'
import { useTheme } from 'vuetify'

const theme = useTheme()
const isDarkMode = ref(theme.global.name.value === 'dark')

const toggleTheme = () => {
  theme.global.name.value = isDarkMode.value ? 'dark' : 'light'
  localStorage.setItem('theme', theme.global.name.value)
}

// ── Accent color ──
const accentColors = [
  { name: 'Padrão', value: '' },
  { name: 'Azul',   value: '#3B82F6' },
  { name: 'Violeta', value: '#8B5CF6' },
  { name: 'Rosa',   value: '#EC4899' },
  { name: 'Laranja', value: '#F59E0B' },
  { name: 'Verde',  value: '#10B981' },
  { name: 'Cyan',   value: '#06B6D4' },
  { name: 'Vermelho', value: '#EF4444' },
]

const selectedAccent = ref(localStorage.getItem('accentColor') || '')

const applyAccent = (color: string) => {
  selectedAccent.value = color
  if (color) {
    localStorage.setItem('accentColor', color)
    document.documentElement.style.setProperty('--app-accent', color)
  } else {
    localStorage.removeItem('accentColor')
    document.documentElement.style.removeProperty('--app-accent')
  }
}

// apply on mount
if (selectedAccent.value) {
  document.documentElement.style.setProperty('--app-accent', selectedAccent.value)
}

const language = ref('pt-BR')
</script>

<template>
  <div class="settings-page">
    <div class="settings-header">
      <h1 class="settings-title">Configurações</h1>
      <p class="settings-sub">Aparência e preferências</p>
    </div>

    <div class="settings-grid">
      <!-- Appearance -->
      <div class="settings-card">
        <div class="card-section-title">Aparência</div>

        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Tema</span>
            <span class="setting-desc">Alternar entre modo claro e escuro</span>
          </div>
          <button
            class="theme-toggle"
            :class="{ dark: isDarkMode }"
            @click="isDarkMode = !isDarkMode; toggleTheme()"
          >
            <div class="theme-toggle-thumb">
              <v-icon size="14">{{ isDarkMode ? 'mdi-moon-waning-crescent' : 'mdi-white-balance-sunny' }}</v-icon>
            </div>
          </button>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Cor de destaque</span>
            <span class="setting-desc">Personalize a cor principal do sistema</span>
          </div>
          <div class="accent-picker">
            <button
              v-for="c in accentColors"
              :key="c.value"
              class="accent-swatch"
              :class="{ active: selectedAccent === c.value }"
              :style="{
                backgroundColor: c.value || 'rgb(var(--v-theme-secondary))',
                opacity: c.value ? 1 : 0.3,
              }"
              @click="applyAccent(c.value)"
            >
              <v-icon v-if="selectedAccent === c.value" size="12" color="white">mdi-check</v-icon>
            </button>
          </div>
        </div>
      </div>

      <!-- Language -->
      <div class="settings-card">
        <div class="card-section-title">Idioma</div>
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Idioma do sistema</span>
            <span class="setting-desc">Define o idioma de toda a interface</span>
          </div>
          <select v-model="language" class="settings-select">
            <option value="pt-BR">Português (BR)</option>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </div>
      </div>

      <!-- Shortcuts -->
      <div class="settings-card">
        <div class="card-section-title">Atalhos de teclado</div>
        <div class="shortcuts-grid">
          <div class="shortcut-row">
            <span class="shortcut-label">Abrir Command Palette</span>
            <kbd>Ctrl K</kbd>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-label">Criar atividade</span>
            <kbd>C</kbd>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-label">Ir para Dashboard</span>
            <kbd>G D</kbd>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-label">Ir para Tickets</span>
            <kbd>G T</kbd>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-label">Editar título do card</span>
            <kbd>Double-click</kbd>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  padding: 24px;
  max-width: 680px;
}

.settings-header {
  margin-bottom: 24px;
}

.settings-title {
  font-size: 22px;
  font-weight: 700;
  color: rgb(var(--v-theme-secondary));
  letter-spacing: -0.02em;
  margin: 0 0 3px;
}

.settings-sub {
  font-size: 13px;
  color: rgba(var(--v-theme-secondary), 0.4);
  margin: 0;
}

.settings-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ─── Card ─── */
.settings-card {
  background: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-secondary), 0.07);
  border-radius: 12px;
  padding: 16px 18px;
}

.card-section-title {
  font-size: 12px;
  font-weight: 600;
  color: rgba(var(--v-theme-secondary), 0.4);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 14px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.05);
}

.setting-row:last-child {
  border-bottom: none;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setting-label {
  font-size: 14px;
  font-weight: 500;
  color: rgb(var(--v-theme-secondary));
}

.setting-desc {
  font-size: 12.5px;
  color: rgba(var(--v-theme-secondary), 0.4);
}

/* ─── Theme toggle ─── */
.theme-toggle {
  width: 44px;
  height: 24px;
  border-radius: 999px;
  background: rgba(var(--v-theme-secondary), 0.15);
  border: none;
  cursor: pointer;
  position: relative;
  transition: background 0.2s ease;
  flex-shrink: 0;
}

.theme-toggle.dark {
  background: rgba(var(--v-theme-secondary), 0.25);
}

.theme-toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgb(var(--v-theme-secondary));
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease;
  color: rgb(var(--v-theme-primary));
}

.theme-toggle.dark .theme-toggle-thumb {
  transform: translateX(20px);
}

/* ─── Accent picker ─── */
.accent-picker {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.accent-swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.12s ease, border-color 0.12s ease;
}

.accent-swatch:hover {
  transform: scale(1.15);
}

.accent-swatch.active {
  border-color: rgb(var(--v-theme-secondary));
  transform: scale(1.15);
}

/* ─── Select ─── */
.settings-select {
  font-size: 13px;
  color: rgb(var(--v-theme-secondary));
  background: rgba(var(--v-theme-secondary), 0.06);
  border: 1px solid rgba(var(--v-theme-secondary), 0.1);
  border-radius: 8px;
  padding: 6px 10px;
  outline: none;
  font-family: inherit;
  cursor: pointer;
  min-width: 150px;
}

/* ─── Shortcuts ─── */
.shortcuts-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(var(--v-theme-secondary), 0.04);
}

.shortcut-row:last-child { border-bottom: none; }

.shortcut-label {
  font-size: 13px;
  color: rgba(var(--v-theme-secondary), 0.6);
}

.shortcuts-grid kbd {
  font-size: 11px;
  font-weight: 600;
  color: rgba(var(--v-theme-secondary), 0.45);
  background: rgba(var(--v-theme-secondary), 0.07);
  padding: 3px 8px;
  border-radius: 5px;
  border: 1px solid rgba(var(--v-theme-secondary), 0.1);
  font-family: inherit;
}
</style>
