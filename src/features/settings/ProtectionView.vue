<script setup lang="ts">
/**
 * Proteção do cronômetro: a tela que resolve, e não a que explica.
 *
 * Ela existe porque a versão anterior desta entrega empurrava para o usuário um
 * roteiro de seis passos ("abra chrome://extensions, ligue o modo do
 * desenvolvedor, carregue sem compactação..."). Ninguém vai pedir isso a cada
 * pessoa do time — e o pior é que a maioria nem precisa de extensão nenhuma:
 * um clique em "Permitir" no navegador dá exatamente a mesma proteção.
 *
 * A hierarquia da tela é essa, e é deliberada:
 *
 *   1. Permitir no navegador — um clique, nada para instalar, resolve o caso da
 *      esmagadora maioria.
 *   2. Instalar a extensão — um clique na loja, para quem bloqueou a permissão
 *      antes ou quer proteção com o Nevo fechado.
 *   3. Pedir para a TI — quando as máquinas são gerenciadas, o funcionário não
 *      faz absolutamente nada.
 *
 * A tela reage sozinha: quando a proteção fica completa, o topo muda na hora,
 * sem recarregar e sem a pessoa precisar conferir nada em lugar nenhum.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  Building2,
  Check,
  Copy,
  MousePointerClick,
  Puzzle,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-vue-next'
import { useIdleAlerts } from '@/composables/useIdleAlerts'
import { useToast } from '@/composables/useToast'
import { extensionDetected, extensionVersion } from '@/composables/useExtensionBridge'
import { detectionSource, protectionLevel } from '@/composables/idle-state'

const router = useRouter()
const { success } = useToast()
const alerts = useIdleAlerts()

/** URL da extensão na loja. Sem ela, o passo vira "ainda não publicamos". */
const storeUrl = import.meta.env.VITE_EXTENSION_STORE_URL as string | undefined

const completa = computed(() => protectionLevel.value === 'full')

/**
 * O navegador consegue dar a permissão? Firefox e Safari não têm a API, e
 * oferecer um botão que não faz nada seria pior do que não oferecer.
 */
const navegadorSuporta = computed(() => alerts.detectionSupported)
const bloqueada = computed(() => alerts.detectionBlocked.value)

const fonteAtual = computed(() => {
  if (detectionSource.value === 'system') return 'a permissão do navegador'
  if (detectionSource.value === 'extension') return `a extensão${extensionVersion.value ? ` ${extensionVersion.value}` : ''}`
  return null
})

// A tela reage à instalação da extensão sem recarregar; um tique curto mantém
// o texto de estado honesto enquanto a pessoa resolve as coisas em outra aba.
const tick = ref(0)
let timer: number | null = null
onMounted(() => {
  timer = window.setInterval(() => (tick.value += 1), 2000)
})
onUnmounted(() => {
  if (timer !== null) window.clearInterval(timer)
})

async function permitir() {
  await alerts.requestNext()
}

function copiarPedido() {
  const texto = [
    'Oi! Preciso da extensão "Nevo — detector de atividade" instalada na minha máquina.',
    '',
    'Ela deixa o cronômetro do Nevo saber quando estou trabalhando fora do navegador,',
    'para não registrar tempo parado nem parar o tempo enquanto eu trabalho em outro programa.',
    '',
    storeUrl ? `Link da loja: ${storeUrl}` : 'A equipe do Nevo envia o pacote e a política de instalação.',
    '',
    'Ela pode ser instalada em todas as máquinas de uma vez por política do navegador',
    '(ExtensionInstallForcelist), sem ninguém precisar fazer nada.',
  ].join('\n')
  void navigator.clipboard.writeText(texto).then(() => success('Pedido copiado. É só colar para a TI.'))
}
</script>

<template>
  <div class="prot-page">
    <button class="prot-back" type="button" @click="router.back()">
      <ArrowLeft :size="14" /> Voltar
    </button>

    <!-- Estado, antes de qualquer instrução: quem já está protegido não precisa
         ler mais nada. -->
    <section class="prot-hero" :class="completa ? 'prot-hero--ok' : 'prot-hero--warn'">
      <span class="prot-hero-icon">
        <component :is="completa ? ShieldCheck : ShieldAlert" :size="26" />
      </span>
      <div>
        <h1 class="prot-hero-title">
          {{ completa ? 'Seu tempo está protegido' : 'Seu tempo ainda não está protegido' }}
        </h1>
        <p class="prot-hero-sub">
          <template v-if="completa">
            O Nevo enxerga o computador inteiro por {{ fonteAtual }}. Se você sair, o cronômetro
            para sozinho no último momento em que você estava ativo.
          </template>
          <template v-else>
            Hoje o Nevo só enxerga esta aba. Ele avisa quando você some, mas nunca para o tempo
            sozinho, porque não consegue distinguir "saiu do computador" de "foi trabalhar em
            outro programa". Escolha um caminho abaixo: leva um clique.
          </template>
        </p>
      </div>
    </section>

    <div v-if="!completa" class="prot-ways">
      <!-- 1. O caminho que resolve para quase todo mundo -->
      <article class="prot-way prot-way--primary">
        <span class="prot-way-num">1</span>
        <div class="prot-way-body">
          <h2 class="prot-way-title">
            <MousePointerClick :size="15" /> Permitir aqui mesmo
          </h2>
          <p class="prot-way-desc">
            Um clique, nada para instalar. O navegador pergunta se o Nevo pode saber quando
            você está no computador, e a resposta é a única coisa que ele recebe: ativo ou
            parado. Nunca o que você faz.
          </p>
          <button
            v-if="navegadorSuporta && !bloqueada && alerts.nextStep.value"
            class="prot-cta"
            type="button"
            :disabled="alerts.requesting.value"
            @click="permitir"
          >
            {{ alerts.stepLabel.value }}
          </button>
          <p v-else-if="bloqueada" class="prot-way-note">
            Você bloqueou esta permissão antes. Clique no cadeado na barra de endereço, mude
            "Detecção de atividade" para Permitir e recarregue. Se preferir não mexer nisso, o
            caminho 2 resolve sem depender do cadeado.
          </p>
          <p v-else-if="!navegadorSuporta" class="prot-way-note">
            Seu navegador não tem esse recurso. Use o caminho 2, ou o Chrome, Edge ou Brave.
          </p>
        </div>
      </article>

      <!-- 2. Extensão: um clique na loja, quando ela existe -->
      <article class="prot-way">
        <span class="prot-way-num">2</span>
        <div class="prot-way-body">
          <h2 class="prot-way-title"><Puzzle :size="15" /> Instalar a extensão do Nevo</h2>
          <p class="prot-way-desc">
            Vale a pena se você bloqueou a permissão acima, ou se quer que o Nevo continue
            protegendo o cronômetro mesmo com a aba fechada. Ela não pede permissão nenhuma
            para funcionar.
          </p>
          <a v-if="storeUrl" class="prot-cta" :href="storeUrl" target="_blank" rel="noopener">
            Instalar do navegador
          </a>
          <p v-else class="prot-way-note">
            A extensão ainda não está publicada na loja. Enquanto isso, o caminho 1 dá
            exatamente a mesma proteção enquanto o Nevo estiver aberto.
          </p>
          <p v-if="extensionDetected" class="prot-way-ok">
            <Check :size="13" /> Extensão instalada e funcionando.
          </p>
        </div>
      </article>

      <!-- 3. Zero passos para o funcionário -->
      <article class="prot-way">
        <span class="prot-way-num">3</span>
        <div class="prot-way-body">
          <h2 class="prot-way-title"><Building2 :size="15" /> Pedir para a TI da sua empresa</h2>
          <p class="prot-way-desc">
            Se os computadores do time são gerenciados, a extensão pode ser instalada em todas
            as máquinas de uma vez, sem ninguém fazer nada. Copie o pedido pronto e mande para
            quem cuida disso.
          </p>
          <button class="prot-cta prot-cta--ghost" type="button" @click="copiarPedido">
            <Copy :size="13" /> Copiar pedido para a TI
          </button>
        </div>
      </article>
    </div>

    <p class="prot-foot">
      O Nevo nunca registra o que você faz, qual programa está aberto ou o que você digita. O
      único sinal é se o computador está sendo usado, e ele serve para uma coisa só: não
      cobrar de você o tempo em que você não estava trabalhando.
    </p>
  </div>
</template>

<style scoped>
.prot-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 22px 20px 40px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.prot-back {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.prot-back:hover {
  color: var(--text);
  background: var(--surface-2);
}

.prot-hero {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.prot-hero--ok {
  border-color: color-mix(in srgb, var(--success) 45%, var(--border));
}

.prot-hero--warn {
  border-color: color-mix(in srgb, var(--warn) 45%, var(--border));
}

.prot-hero-icon {
  width: 46px;
  height: 46px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius);
}

.prot-hero--ok .prot-hero-icon {
  background: color-mix(in srgb, var(--success) 16%, transparent);
  color: var(--success);
}

.prot-hero--warn .prot-hero-icon {
  background: color-mix(in srgb, var(--warn) 16%, transparent);
  color: var(--warn);
}

.prot-hero-title {
  margin: 2px 0 0;
  font-size: 18px;
  font-weight: 780;
  letter-spacing: -0.01em;
  color: var(--text);
}

.prot-hero-sub {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-2);
}

.prot-ways {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.prot-way {
  display: flex;
  gap: 12px;
  padding: 15px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
}

.prot-way--primary {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 5%, var(--surface));
}

.prot-way-num {
  width: 22px;
  height: 22px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--surface-3);
  color: var(--text-3);
  font-size: 11px;
  font-weight: 800;
}

.prot-way--primary .prot-way-num {
  background: var(--accent);
  color: var(--accent-fg);
}

.prot-way-body {
  min-width: 0;
  flex: 1;
}

.prot-way-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 730;
  color: var(--text);
}

.prot-way-desc {
  margin: 5px 0 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-3);
}

.prot-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 11px;
  min-height: 34px;
  padding: 0 15px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-fg);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
}

.prot-cta:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.prot-cta--ghost {
  border-color: var(--border-strong);
  background: var(--surface-2);
  color: var(--text);
}

.prot-cta--ghost:hover {
  background: var(--surface-3);
}

.prot-way-note {
  margin: 9px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-3);
}

.prot-way-ok {
  margin: 9px 0 0;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 700;
  color: var(--success);
}

.prot-foot {
  margin: 4px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-4);
}
</style>
