<script setup lang="ts">
/*
 * Ícones estilo Windows XP — recriações próprias em SVG (não são os arquivos
 * originais da Microsoft): shapes suaves, gradientes verticais com brilho no
 * topo e leve perspectiva, no espírito do XP. Usados no desktop, no Menu
 * Iniciar e na taskbar do easter egg. viewBox 0 0 48 48; `size` controla o px.
 */
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 32 })
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <!-- ─── Meu Computador (monitor CRT) ─── -->
    <g v-if="name === 'my-computer'">
      <defs>
        <linearGradient id="xp-mc-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#f4f5f7" />
          <stop offset="0.5" stop-color="#d3d8e0" />
          <stop offset="1" stop-color="#a9b0bd" />
        </linearGradient>
        <linearGradient id="xp-mc-screen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#8fc0f0" />
          <stop offset="0.5" stop-color="#3f83d6" />
          <stop offset="1" stop-color="#1f56a8" />
        </linearGradient>
      </defs>
      <!-- base -->
      <path d="M14 40 h20 l3 4 H11 z" fill="#b7bdc8" stroke="#8b93a1" stroke-width="0.7" />
      <rect x="21" y="34" width="6" height="5" fill="#c3c8d2" />
      <!-- corpo do monitor -->
      <rect x="6" y="7" width="36" height="29" rx="3" fill="url(#xp-mc-body)" stroke="#7c8492" stroke-width="0.8" />
      <!-- tela -->
      <rect x="9.5" y="10" width="29" height="20" rx="1.5" fill="url(#xp-mc-screen)" stroke="#0e3b7a" stroke-width="0.8" />
      <!-- nuvenzinha / brilho na tela -->
      <ellipse cx="17" cy="16" rx="5" ry="2.2" fill="#cfe6fb" opacity="0.85" />
      <rect x="9.5" y="10" width="29" height="6" rx="1.5" fill="#ffffff" opacity="0.14" />
      <!-- botão de power -->
      <circle cx="35" cy="33" r="1.1" fill="#8bd45a" />
    </g>

    <!-- ─── Lixeira ─── -->
    <g v-else-if="name === 'recycle-bin'">
      <defs>
        <linearGradient id="xp-bin" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#e7eef6" />
          <stop offset="0.5" stop-color="#c2d0e0" />
          <stop offset="1" stop-color="#9db0c6" />
        </linearGradient>
      </defs>
      <!-- corpo -->
      <path d="M12 15 h24 l-3 27 a2 2 0 0 1 -2 1.8 H17 a2 2 0 0 1 -2 -1.8 z" fill="url(#xp-bin)" stroke="#7f93aa" stroke-width="0.8" opacity="0.95" />
      <!-- ranhuras -->
      <path d="M18 18 l1.6 22 M24 18 l0 22 M30 18 l-1.6 22" stroke="#8aa0b8" stroke-width="1" opacity="0.6" />
      <!-- setas de reciclagem verdes -->
      <g fill="#3ba536">
        <path d="M24 22 l3 4 h-2 v3 h-2 v-3 h-2 z" />
        <path d="M20 30 l-2.4 3.4 1 1.7 3 -1.7 -0.9 -1.4 2.5 -1.6 z" opacity="0.9" />
        <path d="M28 30 l2.4 3.4 -1 1.7 -3 -1.7 0.9 -1.4 -2.5 -1.6 z" opacity="0.9" />
      </g>
      <!-- borda/tampa -->
      <ellipse cx="24" cy="15" rx="12" ry="2.6" fill="#dbe6f1" stroke="#7f93aa" stroke-width="0.8" />
    </g>

    <!-- ─── Pasta amarela (Meus Documentos usa 'documents') ─── -->
    <g v-else-if="name === 'folder' || name === 'documents'">
      <defs>
        <linearGradient id="xp-fold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffe38a" />
          <stop offset="0.55" stop-color="#ffcf4d" />
          <stop offset="1" stop-color="#f0a91e" />
        </linearGradient>
      </defs>
      <!-- aba de trás -->
      <path d="M6 14 h13 l3 3 h20 v4 H6 z" fill="#f2b733" stroke="#c98a10" stroke-width="0.7" />
      <!-- documento (só no 'documents') -->
      <g v-if="name === 'documents'">
        <rect x="15" y="12" width="18" height="20" rx="1" fill="#ffffff" stroke="#b9c2cc" stroke-width="0.7" />
        <path d="M18 17 h12 M18 20 h12 M18 23 h9" stroke="#5f7fb0" stroke-width="1" />
      </g>
      <!-- frente da pasta -->
      <path d="M6 18 h36 l-3 21 a1.5 1.5 0 0 1 -1.5 1.4 H10.5 a1.5 1.5 0 0 1 -1.5 -1.4 z" fill="url(#xp-fold)" stroke="#c98a10" stroke-width="0.8" />
      <path d="M6 18 h36 l-0.6 4 H6.6 z" fill="#ffffff" opacity="0.25" />
    </g>

    <!-- ─── Documento / Notas ─── -->
    <g v-else-if="name === 'notes'">
      <path d="M12 5 h16 l8 8 v30 a1.5 1.5 0 0 1 -1.5 1.5 H12 a1.5 1.5 0 0 1 -1.5 -1.5 V6.5 A1.5 1.5 0 0 1 12 5 z" fill="#ffffff" stroke="#9aa7b4" stroke-width="0.9" />
      <path d="M28 5 v8 h8 z" fill="#dbe3ec" stroke="#9aa7b4" stroke-width="0.9" />
      <path d="M15 20 h18 M15 25 h18 M15 30 h18 M15 35 h11" stroke="#3f83d6" stroke-width="1.4" opacity="0.8" />
      <path d="M15 15 h9" stroke="#e0605a" stroke-width="1.6" />
    </g>

    <!-- ─── Board (kanban / colunas) ─── -->
    <g v-else-if="name === 'board'">
      <defs>
        <linearGradient id="xp-win" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#eef4fb" /><stop offset="1" stop-color="#cdddf0" />
        </linearGradient>
      </defs>
      <rect x="6" y="9" width="36" height="30" rx="2" fill="url(#xp-win)" stroke="#5f86bd" stroke-width="1" />
      <rect x="6" y="9" width="36" height="6" rx="2" fill="#3f83d6" />
      <rect x="10" y="19" width="8" height="16" rx="1.5" fill="#7fb2ef" />
      <rect x="20" y="19" width="8" height="11" rx="1.5" fill="#86c232" />
      <rect x="30" y="19" width="8" height="14" rx="1.5" fill="#f7a838" />
    </g>

    <!-- ─── Dashboard (gráfico) ─── -->
    <g v-else-if="name === 'dashboard'">
      <rect x="6" y="8" width="36" height="32" rx="2" fill="#ffffff" stroke="#5f86bd" stroke-width="1" />
      <rect x="6" y="8" width="36" height="6" rx="2" fill="#3f83d6" />
      <rect x="11" y="28" width="5" height="8" fill="#7fb2ef" />
      <rect x="19" y="23" width="5" height="13" fill="#86c232" />
      <rect x="27" y="19" width="5" height="17" fill="#f7a838" />
      <path d="M11 24 l8 -5 8 -3 6 -4" stroke="#e0605a" stroke-width="1.6" fill="none" />
    </g>

    <!-- ─── Calendário ─── -->
    <g v-else-if="name === 'calendar'">
      <rect x="7" y="10" width="34" height="32" rx="2.5" fill="#ffffff" stroke="#9aa7b4" stroke-width="0.9" />
      <rect x="7" y="10" width="34" height="9" rx="2.5" fill="#d94a3d" />
      <rect x="13" y="7" width="3.5" height="7" rx="1.5" fill="#8a5a2b" />
      <rect x="31.5" y="7" width="3.5" height="7" rx="1.5" fill="#8a5a2b" />
      <g fill="#5f7fb0">
        <rect x="12" y="23" width="4" height="4" /><rect x="19" y="23" width="4" height="4" /><rect x="26" y="23" width="4" height="4" /><rect x="33" y="23" width="3" height="4" />
        <rect x="12" y="30" width="4" height="4" /><rect x="19" y="30" width="4" height="4" fill="#d94a3d" /><rect x="26" y="30" width="4" height="4" /><rect x="33" y="30" width="3" height="4" />
      </g>
    </g>

    <!-- ─── Relógio (Meu tempo) ─── -->
    <g v-else-if="name === 'clock'">
      <defs>
        <linearGradient id="xp-clk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffffff" /><stop offset="1" stop-color="#cfd8e2" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="17" fill="url(#xp-clk)" stroke="#7c8492" stroke-width="1.4" />
      <circle cx="24" cy="24" r="17" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.6" />
      <path d="M24 24 V13 M24 24 l8 5" stroke="#22303f" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="24" cy="24" r="1.6" fill="#d94a3d" />
    </g>

    <!-- ─── Roadmap (bandeira/marco) ─── -->
    <g v-else-if="name === 'roadmap'">
      <path d="M14 6 v36" stroke="#8a6a3a" stroke-width="2.4" stroke-linecap="round" />
      <path d="M15 8 h20 l-4 5 4 5 H15 z" fill="#3f83d6" stroke="#245aa0" stroke-width="0.8" />
      <path d="M15 8 h20 l-1.6 2 H15 z" fill="#ffffff" opacity="0.25" />
    </g>

    <!-- ─── QR ─── -->
    <g v-else-if="name === 'qr'">
      <rect x="7" y="7" width="34" height="34" rx="2" fill="#ffffff" stroke="#9aa7b4" stroke-width="0.9" />
      <g fill="#1a1a1a">
        <rect x="11" y="11" width="9" height="9" /><rect x="13" y="13" width="5" height="5" fill="#fff" /><rect x="14.5" y="14.5" width="2" height="2" fill="#1a1a1a" />
        <rect x="28" y="11" width="9" height="9" /><rect x="30" y="13" width="5" height="5" fill="#fff" /><rect x="31.5" y="14.5" width="2" height="2" fill="#1a1a1a" />
        <rect x="11" y="28" width="9" height="9" /><rect x="13" y="30" width="5" height="5" fill="#fff" /><rect x="14.5" y="31.5" width="2" height="2" fill="#1a1a1a" />
        <rect x="24" y="24" width="3" height="3" /><rect x="30" y="24" width="3" height="3" /><rect x="34" y="27" width="3" height="3" /><rect x="27" y="30" width="3" height="3" /><rect x="24" y="34" width="3" height="3" /><rect x="31" y="33" width="3" height="4" />
      </g>
    </g>

    <!-- ─── Variáveis (chave) ─── -->
    <g v-else-if="name === 'variables'">
      <defs>
        <linearGradient id="xp-key" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffe38a" /><stop offset="1" stop-color="#e6a81e" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="8.5" fill="url(#xp-key)" stroke="#b5820f" stroke-width="1" />
      <circle cx="16" cy="16" r="3.4" fill="#ffffff" stroke="#b5820f" stroke-width="1" />
      <path d="M21 21 l14 14 M31 31 l4 -4 M28 28 l3 -3" stroke="url(#xp-key)" stroke-width="4" stroke-linecap="round" />
      <path d="M21 21 l14 14 M31 31 l4 -4 M28 28 l3 -3" stroke="#b5820f" stroke-width="1" fill="none" opacity="0.5" />
    </g>

    <!-- ─── Usuários (pessoas) ─── -->
    <g v-else-if="name === 'users'">
      <circle cx="18" cy="16" r="7" fill="#7fb2ef" stroke="#3f6fb0" stroke-width="0.8" />
      <path d="M7 40 a11 11 0 0 1 22 0 z" fill="#7fb2ef" stroke="#3f6fb0" stroke-width="0.8" />
      <circle cx="31" cy="19" r="6" fill="#f7a838" stroke="#c07f18" stroke-width="0.8" opacity="0.95" />
      <path d="M23 41 a9 9 0 0 1 18 0 z" fill="#f7a838" stroke="#c07f18" stroke-width="0.8" opacity="0.95" />
    </g>

    <!-- ─── Configurações (Painel de Controle) ─── -->
    <g v-else-if="name === 'settings'">
      <rect x="6" y="8" width="36" height="32" rx="2" fill="#ffffff" stroke="#5f86bd" stroke-width="1" />
      <rect x="6" y="8" width="36" height="6" rx="2" fill="#3f83d6" />
      <circle cx="24" cy="27" r="7.5" fill="#cdddf0" stroke="#5f86bd" stroke-width="1" />
      <g stroke="#3f6fb0" stroke-width="2">
        <path d="M24 17 v3 M24 34 v3 M14 27 h3 M31 27 h3 M17 20 l2 2 M29 32 l2 2 M31 20 l-2 2 M17 34 l2 -2" />
      </g>
      <circle cx="24" cy="27" r="2.6" fill="#3f83d6" />
    </g>

    <!-- ─── Internet (globo) ─── -->
    <g v-else-if="name === 'internet'">
      <defs>
        <radialGradient id="xp-globe" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stop-color="#a7d3f5" /><stop offset="0.6" stop-color="#3f83d6" /><stop offset="1" stop-color="#1a4f9c" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="17" fill="url(#xp-globe)" stroke="#12386f" stroke-width="1" />
      <g stroke="#dbeafe" stroke-width="0.9" fill="none" opacity="0.85">
        <ellipse cx="24" cy="24" rx="8" ry="17" /><ellipse cx="24" cy="24" rx="16" ry="7" /><path d="M8 20 h32 M9 30 h30" />
      </g>
    </g>

    <!-- ─── Meu Computador genérico p/ fallback ─── -->
    <g v-else>
      <rect x="8" y="9" width="32" height="26" rx="2" fill="#d3d8e0" stroke="#7c8492" stroke-width="1" />
      <rect x="11" y="12" width="26" height="17" rx="1" fill="#3f83d6" />
    </g>
  </svg>
</template>
