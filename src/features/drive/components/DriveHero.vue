<script setup lang="ts">
/**
 * Cabeçalho do espaço: o que é, quanto pesa e do que é feito.
 *
 * Existe porque a tela não respondia a primeira pergunta de quem abre um drive
 * ("o que tem aqui dentro?"). Sem isto, um espaço com poucos arquivos vira um
 * retângulo branco com um ícone no meio, e um espaço cheio não dá noção
 * nenhuma de volume.
 *
 * O número de arquivos usa `CountUp` (mesma coreografia dos tiles do
 * Dashboard). A barra de uso é informativa: `quotaBytes` é um teto de
 * referência do servidor, não uma cota que bloqueia upload — por isso ela nunca
 * fica vermelha nem impede ação, só muda de temperatura quando passa de 80%.
 */
import { computed } from 'vue'
import { Building2, HardDrive, User } from 'lucide-vue-next'
import CountUp from '@/components/ui/CountUp.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { formatBytes } from '@/utils/file-kind'
import { avatarTone, initials } from '@/utils/avatar'

const props = defineProps<{
  spaceName: string
  isPersonal: boolean
  files: number
  bytes: number
  quotaBytes: number
  loading: boolean
}>()

const usedRatio = computed(() => {
  if (!props.quotaBytes) return 0
  return Math.min(1, props.bytes / props.quotaBytes)
})

const usedPercent = computed(() => Math.round(usedRatio.value * 100))
/** Sempre visível: 0,4% de um arquivo pequeno viraria uma barra invisível. */
const barWidth = computed(() =>
  props.bytes > 0 ? `${Math.max(2, usedRatio.value * 100)}%` : '0%',
)
const nearLimit = computed(() => usedRatio.value >= 0.8)

const tone = computed(() =>
  props.isPersonal ? null : avatarTone(props.spaceName),
)
</script>

<template>
  <header v-reveal="1" class="bento-cell hero">
    <div class="hero-id">
      <span
        class="hero-avatar"
        :class="{ 'hero-avatar--personal': isPersonal }"
        :style="tone ? { '--tone': tone } : undefined"
        aria-hidden="true"
      >
        <User v-if="isPersonal" :size="18" />
        <template v-else>{{ initials(spaceName) }}</template>
      </span>

      <div class="hero-titles">
        <p class="hero-eyebrow">
          <component :is="isPersonal ? User : Building2" :size="12" />
          {{ isPersonal ? 'Seu espaço' : 'Espaço da empresa' }}
        </p>
        <h1 class="hero-name">{{ spaceName }}</h1>
      </div>
    </div>

    <div class="hero-metrics">
      <div v-if="loading" class="hero-skel"><Skeleton type="row" /></div>
      <template v-else>
        <div class="hero-stat">
          <CountUp class="hero-stat-value" :value="files" />
          <span class="hero-stat-label">
            {{ files === 1 ? 'arquivo' : 'arquivos' }}
          </span>
        </div>

        <div class="hero-storage">
          <div class="hero-storage-head">
            <HardDrive :size="13" />
            <span class="hero-storage-text">
              <strong>{{ formatBytes(bytes) || '0 B' }}</strong>
              de {{ formatBytes(quotaBytes) }}
            </span>
            <span class="hero-storage-pct" :class="{ warn: nearLimit }">
              {{ usedPercent }}%
            </span>
          </div>
          <div
            class="hero-bar"
            role="progressbar"
            :aria-valuenow="usedPercent"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="`Armazenamento usado: ${usedPercent}%`"
          >
            <span
              class="hero-bar-fill"
              :class="{ warn: nearLimit }"
              :style="{ width: barWidth }"
            />
          </div>
        </div>
      </template>
    </div>
  </header>
</template>

<style scoped>
@import '@/features/dashboard/components/dashboard-shared.css';

.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 18px 20px;
  flex-wrap: wrap;
}

.hero-id {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.hero-avatar {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  flex: none;
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--tone, var(--accent)) 18%, var(--surface-2));
  color: var(--tone, var(--accent));
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.hero-avatar--personal {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface-2));
  color: var(--accent);
}

.hero-titles {
  min-width: 0;
}

.hero-eyebrow {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0 0 3px;
  color: var(--text-3);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.hero-name {
  margin: 0;
  color: var(--text);
  font-size: 21px;
  font-weight: 650;
  letter-spacing: -0.03em;
  line-height: 1.15;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero-metrics {
  display: flex;
  align-items: center;
  gap: 22px;
  flex: none;
}

.hero-skel {
  width: 260px;
}

.hero-stat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.05;
}

.hero-stat-value {
  color: var(--text);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
}

.hero-stat-label {
  color: var(--text-3);
  font-size: 11.5px;
}

.hero-storage {
  width: 210px;
}

.hero-storage-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 7px;
  color: var(--text-3);
  font-size: 11.5px;
}

.hero-storage-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero-storage-text strong {
  color: var(--text-2);
  font-weight: 650;
}

.hero-storage-pct {
  font-weight: 700;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.hero-storage-pct.warn {
  color: var(--warn);
}

.hero-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--surface-3);
  overflow: hidden;
}

.hero-bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
  transition: width var(--motion-slow) var(--motion-ease);
}

.hero-bar-fill.warn {
  background: var(--warn);
}

@media (prefers-reduced-motion: reduce) {
  .hero-bar-fill {
    transition: none;
  }
}

@media (max-width: 720px) {
  .hero-metrics {
    width: 100%;
    justify-content: space-between;
  }

  .hero-storage {
    width: 60%;
  }
}
</style>
