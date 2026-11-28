<script setup lang="ts">
/**
 * Moldura das páginas públicas de agendamento: cartão único com o anfitrião e
 * o resumo da reunião à esquerda, e o passo atual à direita. É a primeira
 * coisa que um cliente externo vê do produto, então ela responde antes de
 * qualquer clique: com quem, quanto tempo, onde (Google Meet) e em que fuso.
 */
import { computed } from 'vue'
import { Clock3, Video } from 'lucide-vue-next'
import { formatDuration } from '../booking-time'

const props = defineProps<{
  hostName?: string
  headline?: string | null
  title?: string
  durationMin?: number
  description?: string | null
  /** Sem coluna lateral (estados de erro / carregando). */
  compact?: boolean
}>()

const initials = computed(() =>
  (props.hostName ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join(''),
)
</script>

<template>
  <main class="pbf">
    <div class="pbf__card" :class="{ 'pbf__card--compact': compact }">
      <aside v-if="!compact" class="pbf__aside">
        <div v-if="hostName" class="pbf__host">
          <span class="pbf__avatar" aria-hidden="true">{{ initials }}</span>
          <div class="pbf__host-text">
            <p class="pbf__host-name">{{ hostName }}</p>
            <p v-if="headline" class="pbf__headline">{{ headline }}</p>
          </div>
        </div>

        <template v-if="title">
          <h1 class="pbf__title">{{ title }}</h1>
          <ul class="pbf__facts">
            <li v-if="durationMin">
              <Clock3 :size="15" />
              {{ formatDuration(durationMin) }}
            </li>
            <li>
              <Video :size="15" />
              Google Meet
            </li>
          </ul>
          <p v-if="description" class="pbf__desc">{{ description }}</p>
        </template>

        <slot name="aside" />
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
  padding: 32px 16px;
  background:
    radial-gradient(
      1200px 600px at 50% -10%,
      color-mix(in srgb, var(--accent) 9%, transparent),
      transparent 70%
    ),
    var(--bg);
}

.pbf__card {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  width: 100%;
  max-width: 1000px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: var(--surface);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.pbf__card--compact {
  grid-template-columns: 1fr;
  max-width: 480px;
}

.pbf__aside {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 28px 26px;
  border-right: 1px solid var(--border);
}

.pbf__host {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pbf__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
  color: var(--accent);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.pbf__host-text {
  min-width: 0;
}

.pbf__host-name {
  margin: 0;
  color: var(--text-2);
  font-size: 13.5px;
  font-weight: 600;
}

.pbf__headline {
  margin: 2px 0 0;
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.4;
}

.pbf__title {
  margin: 4px 0 0;
  color: var(--text);
  font-size: 21px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.01em;
}

.pbf__facts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.pbf__facts li {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 550;
}

.pbf__facts :deep(svg) {
  color: var(--text-3);
}

.pbf__desc {
  margin: 4px 0 0;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-line;
}

.pbf__main {
  min-width: 0;
  padding: 28px 30px;
}

.pbf__foot {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-4);
  font-size: 11.5px;
}

.pbf__foot img {
  opacity: 0.7;
}

@media (max-width: 860px) {
  .pbf {
    justify-content: flex-start;
    padding: 16px;
  }

  .pbf__card {
    grid-template-columns: 1fr;
  }

  .pbf__aside {
    border-right: none;
    border-bottom: 1px solid var(--border);
    padding: 22px 20px;
  }

  .pbf__main {
    padding: 22px 20px;
  }
}
</style>
