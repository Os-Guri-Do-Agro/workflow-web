<script setup lang="ts">
/**
 * Moldura das páginas públicas de agendamento: cartão único com o anfitrião e
 * o resumo da reunião à esquerda, e o passo atual à direita. É a primeira
 * coisa que um cliente externo vê do produto, então ela responde antes de
 * qualquer clique: com quem, quanto tempo, onde (Google Meet) e em que fuso.
 *
 * Slots:
 * - `facts`: itens extras na lista de fatos (o horário escolhido, o fuso),
 *   com as classes `bk-fact` da folha da feature;
 * - `aside`: bloco livre abaixo da descrição;
 * - `aside-foot`: rodapé da coluna (ex.: "Outros tipos de reunião");
 * - padrão: o passo atual.
 *
 * Tema: quem chega pelo link sem nunca ter escolhido tema no Nevo vê a página
 * no tema do sistema dele (um cliente de tela clara não cai num painel
 * escuro). Nada é gravado; quem já escolheu um tema no Nevo continua com o dele.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Clock3, Video } from 'lucide-vue-next'
import { applyThemeTokens, type AccentName } from '@/plugins/tokens'
import { safeStorage } from '@/utils/safe-storage'
import BookingAvatar from './BookingAvatar.vue'
import { formatDuration } from '../booking-time'
import '../styles/booking.css'

const props = defineProps<{
  hostName?: string
  headline?: string | null
  avatarUrl?: string | null
  title?: string
  durationMin?: number
  description?: string | null
  /** Sem coluna lateral (estados de erro). */
  compact?: boolean
  /** Esqueleto do cartão enquanto a agenda carrega. */
  loading?: boolean
}>()

// ─── Descrição longa ────────────────────────────────────────────────────────
const LONG_DESCRIPTION = 240
const descOpen = ref(false)
const longDesc = computed(() => (props.description?.length ?? 0) > LONG_DESCRIPTION)

// ─── Tema do visitante ──────────────────────────────────────────────────────
let media: MediaQueryList | null = null
const followSystem = () => {
  const accent = (safeStorage.getItem('ui.accent') as AccentName | null) || 'teal'
  applyThemeTokens(media?.matches ? 'light' : 'dark', accent)
}

onMounted(() => {
  const chosen = safeStorage.getItem('ui.theme') || safeStorage.getItem('theme')
  if (chosen || typeof window.matchMedia !== 'function') return
  media = window.matchMedia('(prefers-color-scheme: light)')
  followSystem()
  media.addEventListener('change', followSystem)
})

onBeforeUnmount(() => media?.removeEventListener('change', followSystem))
</script>

<template>
  <main class="pbf">
    <!-- Carregando: o esqueleto já tem o formato do cartão, sem pulo depois. -->
    <div v-if="loading" class="pbf__card" aria-busy="true" aria-label="Carregando agenda">
      <aside class="pbf__aside">
        <div class="pbf__host">
          <span class="bk-skel pbf__skel-avatar" />
          <div class="pbf__skel-lines">
            <span class="bk-skel" style="width: 120px; height: 13px" />
            <span class="bk-skel" style="width: 90px; height: 11px" />
          </div>
        </div>
        <span class="bk-skel" style="width: 80%; height: 22px; margin-top: 18px" />
        <span class="bk-skel" style="width: 50%; height: 13px" />
        <span class="bk-skel" style="width: 42%; height: 13px" />
      </aside>
      <section class="pbf__main">
        <span class="bk-skel" style="width: 220px; height: 16px" />
        <span class="bk-skel" style="width: 100%; height: 300px; margin-top: 24px; border-radius: var(--radius-lg)" />
      </section>
    </div>

    <div v-else class="pbf__card" :class="{ 'pbf__card--compact': compact }">
      <aside v-if="!compact" class="pbf__aside">
        <div v-if="hostName" class="pbf__host">
          <BookingAvatar :name="hostName" :src="avatarUrl" :size="52" />
          <div class="pbf__host-text">
            <p class="pbf__host-name">{{ hostName }}</p>
            <p v-if="headline" class="pbf__headline">{{ headline }}</p>
          </div>
        </div>

        <div v-if="title" class="pbf__event">
          <h1 class="pbf__title">{{ title }}</h1>
          <ul class="bk-facts">
            <li v-if="durationMin" class="bk-fact">
              <Clock3 :size="16" />
              <span>{{ formatDuration(durationMin) }}</span>
            </li>
            <li class="bk-fact">
              <Video :size="16" />
              <span>Google Meet <span class="bk-fact__sub">O link chega no convite</span></span>
            </li>
            <slot name="facts" />
          </ul>
          <div v-if="description" class="pbf__desc-wrap">
            <p class="pbf__desc" :class="{ 'is-clamped': longDesc && !descOpen }">{{ description }}</p>
            <button
              v-if="longDesc"
              type="button"
              class="bk-link pbf__more"
              :aria-expanded="descOpen"
              @click="descOpen = !descOpen"
            >
              {{ descOpen ? 'Ver menos' : 'Ver mais' }}
            </button>
          </div>
        </div>

        <slot name="aside" />

        <div v-if="$slots['aside-foot']" class="pbf__aside-foot">
          <slot name="aside-foot" />
        </div>
      </aside>

      <section class="pbf__main">
        <slot />
      </section>
    </div>

    <footer class="pbf__foot">
      <img src="/brand/marca.svg" alt="" width="16" height="16" />
      Agendamento pelo Nevo
    </footer>
  </main>
</template>

<style scoped>
.pbf {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 40px 20px 24px;
  background:
    radial-gradient(
      1100px 520px at 50% -12%,
      color-mix(in srgb, var(--accent) 10%, transparent),
      transparent 72%
    ),
    var(--bg);
}

.pbf__card {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  width: 100%;
  max-width: 1060px;
  min-height: 600px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: var(--surface);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.pbf__card--compact {
  grid-template-columns: minmax(0, 1fr);
  max-width: 520px;
  min-height: 0;
}

/* ─── Coluna do anfitrião ─────────────────────────────────────────────────── */

.pbf__aside {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  padding: 30px 28px;
  border-right: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-2) 40%, var(--surface));
}

.pbf__host {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.pbf__host-text {
  min-width: 0;
}

.pbf__host-name {
  margin: 0;
  overflow: hidden;
  color: var(--text);
  font-size: 14.5px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pbf__headline {
  margin: 2px 0 0;
  color: var(--text-3);
  font-size: 12.5px;
  line-height: 1.4;
}

.pbf__event {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 18px;
  border-top: 1px solid var(--border);
}

.pbf__title {
  margin: 0;
  color: var(--text);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.015em;
  overflow-wrap: anywhere;
}

.pbf__desc-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.pbf__desc {
  margin: 0;
  color: var(--text-2);
  font-size: 13.5px;
  line-height: 1.6;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.pbf__desc.is-clamped {
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pbf__more {
  font-size: 12.5px;
}

.pbf__aside-foot {
  margin-top: auto;
  padding-top: 8px;
}

/* ─── Passo atual ─────────────────────────────────────────────────────────── */

.pbf__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 30px 34px;
}

.pbf__card--compact .pbf__main {
  padding: 36px 32px;
}

.pbf__foot {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-4);
  font-size: 12px;
}

.pbf__foot img {
  opacity: 0.75;
}

/* ─── Esqueleto ───────────────────────────────────────────────────────────── */

.pbf__skel-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
}

.pbf__skel-lines {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

/* ─── Telas menores ───────────────────────────────────────────────────────── */

@media (max-width: 900px) {
  .pbf {
    justify-content: flex-start;
    padding: 16px 12px 20px;
  }

  .pbf__card {
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
    border-radius: var(--radius-lg);
  }

  .pbf__aside {
    gap: 12px;
    padding: 20px;
    border-right: none;
    border-bottom: 1px solid var(--border);
  }

  .pbf__event {
    gap: 12px;
    padding-top: 14px;
  }

  .pbf__title {
    font-size: 19px;
  }

  .pbf__desc.is-clamped {
    -webkit-line-clamp: 3;
  }

  .pbf__aside-foot {
    margin-top: 0;
    padding-top: 0;
  }

  .pbf__main,
  .pbf__card--compact .pbf__main {
    padding: 22px 20px;
  }
}
</style>
