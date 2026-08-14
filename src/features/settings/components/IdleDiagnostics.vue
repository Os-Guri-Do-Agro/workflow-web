<script setup lang="ts">
/**
 * Diagnóstico da proteção do cronômetro (spec timer-confiavel).
 *
 * Existe para responder, na máquina de quem está perguntando, a única pergunta
 * que importa: **isso está funcionando aqui?** Antes disto a resposta dependia
 * de ficar quinze minutos parado, ou de um modo de depuração que só roda em
 * desenvolvimento — ou seja, ninguém do time tinha como saber.
 *
 * Mostra os quatro sinais que decidem o comportamento (fonte, atividade,
 * extensão, servidor) e dá o botão que exercita o ciclo inteiro na hora.
 */
import { computed, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Activity,
  MonitorCheck,
  Puzzle,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Zap,
} from 'lucide-vue-next'
import { useTimeTracking } from '@/composables/useTimeTracking'
import { useUiPreferences } from '@/composables/useUiPreferences'
import { extensionDetected, extensionVersion } from '@/composables/useExtensionBridge'
import { lastBeatAt } from '@/composables/useTimerHeartbeat'
import {
  detectionSource,
  effectiveActivityAt,
  protectionLevel,
  simulateAbsence,
} from '@/composables/idle-state'

const { isRunning } = useTimeTracking()
const { idleWarnMin } = useUiPreferences()

// Relógio próprio: os campos são "há quanto tempo", e sem um tique eles
// congelariam na tela e pareceriam quebrados.
const now = ref(Date.now())
const clock = window.setInterval(() => (now.value = Date.now()), 1000)
onUnmounted(() => window.clearInterval(clock))

function ago(ts: number | null): string {
  if (!ts) return 'nunca'
  const sec = Math.max(0, Math.round((now.value - ts) / 1000))
  if (sec < 5) return 'agora mesmo'
  if (sec < 60) return `há ${sec}s`
  const min = Math.round(sec / 60)
  return min < 60 ? `há ${min} min` : `há ${Math.round(min / 60)}h`
}

const fonte = computed(() => {
  if (detectionSource.value === 'system') return 'Navegador (detecção do sistema)'
  if (detectionSource.value === 'extension') return 'Extensão do Nevo'
  return 'Só esta aba'
})

const completa = computed(() => protectionLevel.value === 'full')

const simulou = ref(false)

/**
 * Dispara o ciclo real: empurra a última atividade para o limiar configurado e
 * o aviso sobe no próximo tique. Não é encenação — se a proteção estiver
 * completa e ninguém responder, o corte acontece de verdade (e o tempo continua
 * recuperável em um clique, como em qualquer corte).
 */
function simular() {
  simulateAbsence(Math.max(1, idleWarnMin.value) * 60_000 + 2000)
  simulou.value = true
  window.setTimeout(() => (simulou.value = false), 12_000)
}
</script>

<template>
  <div class="diag">
    <div class="diag-grid">
      <div class="diag-item" :class="completa ? 'diag-item--ok' : 'diag-item--warn'">
        <MonitorCheck :size="14" />
        <div class="diag-text">
          <span class="diag-label">Proteção</span>
          <span class="diag-value">{{ completa ? 'Completa' : 'Limitada' }}</span>
          <span class="diag-hint">
            {{ completa ? 'para o tempo sozinho' : 'avisa, mas nunca para sozinho' }}
          </span>
        </div>
      </div>

      <div class="diag-item">
        <Activity :size="14" />
        <div class="diag-text">
          <span class="diag-label">Sinal vem de</span>
          <span class="diag-value">{{ fonte }}</span>
          <span class="diag-hint">última atividade {{ ago(effectiveActivityAt) }}</span>
        </div>
      </div>

      <div class="diag-item" :class="extensionDetected ? 'diag-item--ok' : ''">
        <Puzzle :size="14" />
        <div class="diag-text">
          <span class="diag-label">Extensão do Nevo</span>
          <span class="diag-value">{{ extensionDetected ? 'Conectada' : 'Não encontrada' }}</span>
          <span class="diag-hint">
            {{ extensionDetected ? `versão ${extensionVersion ?? '?'}` : 'opcional, e a mais confiável' }}
          </span>
        </div>
      </div>

      <div class="diag-item">
        <ServerCog :size="14" />
        <div class="diag-text">
          <span class="diag-label">Servidor</span>
          <span class="diag-value">{{ isRunning ? ago(lastBeatAt) : 'em repouso' }}</span>
          <span class="diag-hint">
            {{ isRunning ? 'sinal de vida do cronômetro' : 'só sincroniza com o timer rodando' }}
          </span>
        </div>
      </div>
    </div>

    <div class="diag-foot">
      <p class="diag-note">
        <template v-if="!isRunning">
          Inicie um cronômetro para poder testar: sem tempo correndo não há o que avisar.
        </template>
        <template v-else-if="simulou">
          Pronto: o aviso aparece na tela e como notificação. Mexer no mouse cancela ele,
          que é justamente o comportamento certo.
        </template>
        <template v-else-if="completa">
          O teste é real: se você não responder ao aviso, o tempo vai parar de verdade.
          Dá para recuperar em um clique depois.
        </template>
        <template v-else>
          Como a proteção está limitada, o teste mostra o aviso e não para nada.
        </template>
      </p>
      <div class="diag-actions">
        <RouterLink v-if="!completa" class="diag-btn diag-btn--primary" :to="{ name: 'protection' }">
          <ShieldCheck :size="12" />
          Resolver
        </RouterLink>
        <button type="button" class="diag-btn" :disabled="!isRunning || simulou" @click="simular">
          <component :is="simulou ? RefreshCw : Zap" :size="12" :class="simulou ? 'spin' : ''" />
          {{ simulou ? 'Testando...' : 'Testar agora' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diag {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

/*
 * 2x2, e não `auto-fit`: na largura real do card de configurações cabiam três
 * colunas, o que deixava o quarto sinal órfão numa linha curta. Quatro itens
 * pedem um quadrado.
 */
.diag-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

@media (min-width: 1600px) {
  .diag-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .diag-grid {
    grid-template-columns: 1fr;
  }
}

.diag-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-3);
}

.diag-item--ok {
  border-color: color-mix(in srgb, var(--success) 40%, var(--border));
  color: var(--success);
}

.diag-item--warn {
  border-color: color-mix(in srgb, var(--warn) 40%, var(--border));
  color: var(--warn);
}

.diag-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.diag-label {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-4);
}

.diag-value {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text);
}

.diag-hint {
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-3);
}

.diag-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.diag-note {
  margin: 0;
  flex: 1;
  min-width: 200px;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--text-3);
}

.diag-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
  transition: background var(--motion-fast) var(--motion-ease);
}

.diag-btn:hover:not(:disabled) {
  background: var(--surface-3);
}

.diag-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.diag-actions {
  display: flex;
  gap: 6px;
  flex: none;
}

.diag-btn--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-fg);
  text-decoration: none;
}

.diag-btn--primary:hover {
  background: color-mix(in srgb, var(--accent) 88%, black);
}

.spin {
  animation: diag-spin 1s linear infinite;
}

@keyframes diag-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
</style>
