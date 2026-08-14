<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import {
  Check,
  Sun,
  Moon,
  Columns3,
  LayoutPanelLeft,
  Square,
  Timer,
  Play,
  Volume2,
  Upload,
  FileCode,
  Loader2,
  Bell,
  Send,
  Eye,
  EyeOff,
} from 'lucide-vue-next'
import { useUiPreferences } from '@/composables/useUiPreferences'
import { useIdleAlerts } from '@/composables/useIdleAlerts'
import { TIMER_VOLUMES, useTimerSounds } from '@/composables/useTimerSounds'
import { useSystemNotification } from '@/composables/useSystemNotification'
import { idleDetectionPermission, idleDetectionState } from '@/composables/useIdleDetection'
import { useToast } from '@/composables/useToast'
import importService from '@/service/import/import-service'
import notificationsService from '@/service/notifications/notifications-service'
// import RepositoriesSection from './RepositoriesSection.vue' // oculto até liberar feature
import type { AccentName, Density, FontScale, ShellVariant } from '@/plugins/tokens'
import { accents } from '@/plugins/tokens'
import { CANVAS_ENABLED } from '@/config/feature-flags'
import IdleDiagnostics from '@/features/settings/components/IdleDiagnostics.vue'
import WorkScheduleCard from '@/features/settings/components/WorkScheduleCard.vue'

const { success: toastSuccess, error: toastError } = useToast()
const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const importResult = ref<any>(null)
const dragOver = ref(false)

const openFilePicker = () => fileInput.value?.click()

const handleJiraFile = async (file: File) => {
  if (!file.name.toLowerCase().endsWith('.xml')) {
    toastError('Arquivo precisa ser .xml (export do Jira)')
    return
  }
  importing.value = true
  importResult.value = null
  try {
    const result = await importService.importJiraXml(file)
    importResult.value = result
    const imported = result?.imported ?? result?.count ?? result?.total ?? '?'
    toastSuccess(`Importação concluída — ${imported} issue(s)`)
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Falha ao importar XML do Jira')
  } finally {
    importing.value = false
  }
}

const onFileChange = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) handleJiraFile(file)
}

const onDrop = (e: DragEvent) => {
  e.preventDefault()
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) handleJiraFile(file)
}

const onDragOver = (e: DragEvent) => {
  e.preventDefault()
  dragOver.value = true
}

const onDragLeave = () => {
  dragOver.value = false
}

const {
  theme,
  accent,
  density,
  shell,
  fontScale,
  setTheme,
  toggleTheme,
  setAccent,
  setDensity,
  setShell,
  setFontScale,
  idleGuard,
  idleWarnMin,
  setIdleGuard,
  setIdleWarnMin,
  timerSounds,
  timerSoundPack,
  timerVolume,
  pickerShowDone,
  setTimerSounds,
  setTimerSoundPack,
  setTimerVolume,
  setPickerShowDone,
} = useUiPreferences()

/** Três degraus de volume (ver `TIMER_VOLUMES`). */
const volumes = TIMER_VOLUMES

// ── Som do cronômetro ────────────────────────────────────────────────────
const { preview, packs } = useTimerSounds()

// ── Teste de notificação ─────────────────────────────────────────────────
const notification = useSystemNotification()

/**
 * Dispara a MESMA notificação do aviso de ociosidade, com os dois botões, para
 * a pessoa ver como o sistema dela apresenta o aviso (no Windows o toast
 * aparece no canto e depois recolhe para a Central de Ações). A ação clicada
 * volta como toast — é o que prova que o botão realmente chega no app.
 */
async function testNotification() {
  const result = await notification.notify({
    tag: 'nevo-idle-test',
    title: 'Teste do aviso do Nevo',
    body: 'É assim que o aviso aparece quando o timer fica sozinho. Clique num botão para ver a resposta chegar no app.',
    actions: [
      { action: 'continue', title: 'Continuar contando' },
      { action: 'stop', title: 'Parar agora' },
    ],
    // `idle-test` é o que impede o guard de tratar estes botões como reais e
    // parar o timer de verdade.
    data: { kind: 'idle-test' },
  })

  if (result === 'sent-with-actions') {
    toastSuccess('Notificação enviada. Se não apareceu na tela, veja a Central de Ações')
  } else if (result === 'sent-without-actions') {
    toastSuccess('Notificação enviada, mas sem botões neste navegador')
  } else if (result === 'blocked') {
    toastError('Notificações bloqueadas: libere no cadeado da barra de endereço')
  } else {
    toastError('Não foi possível enviar a notificação')
  }
}

/** Resposta do TESTE (o aviso real é tratado pelo guard, não aqui). */
const stopListeningAction = notification.onAction((action, kind) => {
  if (kind !== 'idle-test') return
  const labels: Record<string, string> = {
    continue: 'Continuar contando',
    stop: 'Parar agora',
    recover: 'Recuperar o tempo',
    open: 'abriu a notificação',
  }
  toastSuccess(`Chegou aqui: ${labels[action] ?? action}`)
})
onUnmounted(() => stopListeningAction())

/**
 * Escolher já toca: som é gosto, e ninguém decide por descrição escrita. A
 * prévia funciona com a preferência desligada de propósito (quem está
 * decidindo precisa ouvir antes de ligar).
 */
function chooseSound(id: string) {
  setTimerSoundPack(id)
  preview(id)
}

// ── Aviso de ociosidade (spec timer-ociosidade) ──────────────────────────
const idleAlerts = useIdleAlerts()
const idleWarnOptions = [5, 10, 15]

onMounted(() => {
  // Popula `idleDetectionState` (o estado é compartilhado e reativo).
  void idleDetectionPermission()
})

/**
 * Estado legível das duas permissões. O texto precisa dizer o que fazer quando
 * está bloqueado: uma vez negada, nenhuma API reabre o prompt, só o cadeado da
 * barra de endereço.
 */
const idleStatusText = computed(() => {
  if (!idleAlerts.supported) {
    return 'Este navegador não envia notificações do sistema. O aviso aparece só dentro do Nevo.'
  }
  if (idleAlerts.blocked.value) {
    return 'Notificações bloqueadas. Libere no cadeado da barra de endereço para ser avisado com o navegador minimizado.'
  }
  if (!idleAlerts.granted.value) {
    return 'Sem permissão, o aviso só aparece dentro do Nevo, e não alcança você em outro app.'
  }
  if (idleDetectionState.value === 'granted') {
    return 'Notificação do sistema ativa, com detecção de atividade em todo o computador.'
  }
  if (idleDetectionState.value === 'unsupported') {
    return 'Notificação do sistema ativa. Neste navegador a atividade é medida só dentro do Nevo.'
  }
  if (idleDetectionState.value === 'denied') {
    return 'Notificação ativa, mas a detecção em todo o computador foi bloqueada: trabalhar em outro programa pode parecer inatividade. Libere no cadeado da barra de endereço.'
  }
  return 'Notificação do sistema ativa. Falta permitir a detecção de atividade em todo o computador.'
})

const accentOptions: { name: AccentName; label: string }[] = [
  { name: 'teal', label: 'Padrão' },
  { name: 'neutral', label: 'Neutro' },
  { name: 'blue', label: 'Azul' },
  { name: 'violet', label: 'Violeta' },
  { name: 'green', label: 'Verde' },
  { name: 'orange', label: 'Laranja' },
  { name: 'pink', label: 'Rosa' },
]

const densityOptions: { value: Density; label: string; desc: string }[] = [
  { value: 'compact', label: 'Compacta', desc: 'Mais itens na tela, ideal para power users' },
  { value: 'comfortable', label: 'Confortável', desc: 'Espaçamento maior, respira mais' },
]

const fontScaleOptions: { value: FontScale; label: string }[] = [
  { value: 1, label: 'Padrão' },
  { value: 1.1, label: 'Maior' },
  { value: 1.2, label: 'Grande' },
  { value: 1.3, label: 'Máximo' },
]

// ── Discord notifications ────────────────────────────────────────────────
type NotifCompany = {
  id: string
  name: string
  notificationsEnabled: boolean
  hasWebhook: boolean
}

const notifCompanies = ref<NotifCompany[]>([])
const notifLoading = ref(false)
const notifSavingId = ref<string | null>(null)
const notifTogglingAll = ref(false)
const webhookDrafts = ref<Record<string, string>>({})
const showWebhook = ref<Record<string, boolean>>({})
const runningNow = ref(false)

const allEnabled = ref(false)

const loadNotifications = async () => {
  notifLoading.value = true
  try {
    const list = await notificationsService.listCompanies()
    notifCompanies.value = Array.isArray(list) ? list : list?.data || []
    allEnabled.value =
      notifCompanies.value.length > 0 &&
      notifCompanies.value.every((c) => c.notificationsEnabled)
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Erro ao carregar empresas')
  } finally {
    notifLoading.value = false
  }
}

const toggleAll = async () => {
  notifTogglingAll.value = true
  try {
    if (allEnabled.value) {
      await notificationsService.disableAll()
      toastSuccess('Notificações desativadas em todas as empresas')
      allEnabled.value = false
    } else {
      await notificationsService.enableAll()
      toastSuccess('Notificações ativadas em todas as empresas')
      allEnabled.value = true
    }
    await loadNotifications()
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Falha ao alternar')
  } finally {
    notifTogglingAll.value = false
  }
}

const saveCompanyWebhook = async (companyId: string) => {
  const url = (webhookDrafts.value[companyId] || '').trim()
  if (url && !url.startsWith('https://discord.com/api/webhooks/')) {
    toastError('Webhook precisa começar com https://discord.com/api/webhooks/')
    return
  }
  notifSavingId.value = companyId
  try {
    await notificationsService.updateCompany(companyId, {
      discordWebhookUrl: url || null,
    })
    toastSuccess('Webhook salvo')
    webhookDrafts.value[companyId] = ''
    showWebhook.value[companyId] = false
    await loadNotifications()
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Erro ao salvar webhook')
  } finally {
    notifSavingId.value = null
  }
}

const toggleCompanyEnabled = async (companyId: string, value: boolean) => {
  notifSavingId.value = companyId
  try {
    await notificationsService.updateCompany(companyId, {
      notificationsEnabled: value,
    })
    await loadNotifications()
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Erro ao alternar empresa')
  } finally {
    notifSavingId.value = null
  }
}

const runCronNow = async () => {
  runningNow.value = true
  try {
    const r = await notificationsService.runNow()
    toastSuccess(
      `Cron rodou: ${r?.companiesProcessed ?? 0} empresas, ${r?.notificationsSent ?? 0} notificações`,
    )
  } catch (e: any) {
    toastError(e?.response?.data?.message || 'Erro ao disparar cron')
  } finally {
    runningNow.value = false
  }
}

onMounted(() => loadNotifications())

const shellOptions: {
  value: ShellVariant
  label: string
  desc: string
  icon: typeof LayoutPanelLeft
}[] = [
  {
    value: 'command',
    label: 'Command',
    desc: 'Topbar + sidebar clássica. Foco em hierarquia e breadcrumbs.',
    icon: LayoutPanelLeft,
  },
  {
    value: 'focus',
    label: 'Focus',
    desc: 'Rail de ícones + coluna de contexto. Inspirado no Linear.',
    icon: Columns3,
  },
  // Shell "Canvas" só aparece com a feature flag ligada (ver feature-flags.ts).
  ...(CANVAS_ENABLED
    ? [
        {
          value: 'canvas' as ShellVariant,
          label: 'Canvas',
          desc: 'Nav horizontal + dock flutuante. Mais espaço para o conteúdo.',
          icon: Square,
        },
      ]
    : []),
]
</script>

<template>
  <div class="settings-page">
    <div class="settings-header">
      <h1 class="settings-title">Configurações</h1>
      <p class="settings-sub">Aparência e preferências</p>
    </div>

    <div class="settings-grid">
      <!-- Appearance: theme + accent + density -->
      <div class="settings-card">
        <div class="card-section-title">Aparência</div>

        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Tema</span>
            <span class="setting-desc">Alternar entre modo escuro e claro</span>
          </div>
          <div class="segmented">
            <button
              class="segmented-btn"
              :class="{ 'segmented-btn--active': theme === 'dark' }"
              @click="setTheme('dark')"
            >
              <Moon :size="13" />
              <span>Escuro</span>
            </button>
            <button
              class="segmented-btn"
              :class="{ 'segmented-btn--active': theme === 'light' }"
              @click="setTheme('light')"
            >
              <Sun :size="13" />
              <span>Claro</span>
            </button>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Cor de destaque</span>
            <span class="setting-desc">Usada em botões, foco e detalhes</span>
          </div>
          <div class="accent-picker">
            <button
              v-for="opt in accentOptions"
              :key="opt.name"
              class="accent-swatch"
              :class="{ 'accent-swatch--active': accent === opt.name }"
              :style="{ backgroundColor: accents[opt.name][theme] }"
              :title="opt.label"
              @click="setAccent(opt.name)"
            >
              <Check v-if="accent === opt.name" :size="12" class="accent-check" />
            </button>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Densidade</span>
            <span class="setting-desc">Compacidade geral das informações</span>
          </div>
          <div class="segmented">
            <button
              v-for="opt in densityOptions"
              :key="opt.value"
              class="segmented-btn"
              :class="{ 'segmented-btn--active': density === opt.value }"
              :title="opt.desc"
              @click="setDensity(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Aumento de fonte</span>
            <span class="setting-desc">
              Deixa todo o texto do app maior, para uma leitura mais confortável.
            </span>
          </div>
          <div class="segmented">
            <button
              v-for="opt in fontScaleOptions"
              :key="opt.value"
              class="segmented-btn"
              :class="{ 'segmented-btn--active': fontScale === opt.value }"
              :title="`Escala ${Math.round(opt.value * 100)}%`"
              @click="setFontScale(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- Shell variant -->
      <div class="settings-card">
        <div class="card-section-title">Layout</div>
        <div class="setting-row setting-row--column">
          <div class="setting-info">
            <span
              class="setting-label setting-label--glossary"
              title="“Shell” é o esqueleto da tela: onde ficam o menu, a barra do topo e a navegação."
            >
              Variante de shell
            </span>
            <span class="setting-desc">
              Escolha como a navegação principal é exibida (menu e barra do topo). A troca é instantânea.
            </span>
          </div>
          <div class="shell-grid">
            <button
              v-for="opt in shellOptions"
              :key="opt.value"
              class="shell-card"
              :class="{ 'shell-card--active': shell === opt.value }"
              @click="setShell(opt.value)"
            >
              <div class="shell-preview">
                <div v-if="opt.value === 'command'" class="preview preview--command">
                  <div class="preview-topbar" />
                  <div class="preview-body">
                    <div class="preview-sidebar" />
                    <div class="preview-main" />
                  </div>
                </div>
                <div v-else-if="opt.value === 'focus'" class="preview preview--focus">
                  <div class="preview-rail" />
                  <div class="preview-context" />
                  <div class="preview-main" />
                </div>
                <div v-else class="preview preview--canvas">
                  <div class="preview-topnav" />
                  <div class="preview-main" />
                  <div class="preview-dock" />
                </div>
              </div>
              <div class="shell-card-body">
                <div class="shell-card-header">
                  <component :is="opt.icon" :size="14" class="shell-icon" />
                  <span class="shell-label">{{ opt.label }}</span>
                  <Check v-if="shell === opt.value" :size="13" class="shell-check" />
                </div>
                <div class="shell-desc">{{ opt.desc }}</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <!-- Meu tempo: som e seletor de tarefa -->
      <div class="settings-card">
        <div class="card-section-title">
          <Volume2 :size="13" style="vertical-align: -2px; margin-right: 4px" />
          Meu tempo
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Som ao iniciar e parar o cronômetro</span>
            <span class="setting-desc">
              Um toque curto quando você começa e o correspondente, descendo, quando termina.
            </span>
          </div>
          <button
            type="button"
            class="toggle"
            :class="{ 'toggle--on': timerSounds }"
            @click="setTimerSounds(!timerSounds)"
          >
            <span class="toggle-knob" />
          </button>
        </div>

        <!-- Sem `v-if` de propósito: com o som desligado, esconder a galeria
             tirava a única forma de ouvir antes de decidir ligar. -->
        <div class="setting-row setting-row--column">
          <div class="setting-info">
            <span class="setting-label">Timbre</span>
            <span class="setting-desc">
              Clique para ouvir.
              {{
                timerSounds
                  ? 'O escolhido toca no timer.'
                  : 'A prévia toca mesmo com o som desligado.'
              }}
            </span>
          </div>
          <div class="sound-grid">
            <button
              v-for="pack in packs"
              :key="pack.id"
              type="button"
              class="sound-card"
              :class="{ 'sound-card--active': timerSoundPack === pack.id }"
              @click="chooseSound(pack.id)"
            >
              <span class="sound-card-head">
                <span class="sound-card-name">{{ pack.label }}</span>
                <Check v-if="timerSoundPack === pack.id" :size="13" class="sound-card-check" />
                <Play v-else :size="11" class="sound-card-play" />
              </span>
              <span class="sound-card-hint">{{ pack.hint }}</span>
            </button>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Volume</span>
            <span class="setting-desc">Mesmo no alto ele continua discreto.</span>
          </div>
          <div class="segmented">
            <button
              v-for="vol in volumes"
              :key="vol.label"
              class="segmented-btn"
              :class="{ 'segmented-btn--active': timerVolume === vol.value }"
              @click="(setTimerVolume(vol.value), preview(timerSoundPack))"
            >
              {{ vol.label }}
            </button>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Mostrar tarefas concluídas no seletor</span>
            <span class="setting-desc">
              Por padrão o seletor de tarefa esconde o que já foi concluído, para achar mais
              rápido o que ainda está em aberto.
            </span>
          </div>
          <button
            type="button"
            class="toggle"
            :class="{ 'toggle--on': pickerShowDone }"
            @click="setPickerShowDone(!pickerShowDone)"
          >
            <span class="toggle-knob" />
          </button>
        </div>
      </div>

      <!-- Jornada e banco de horas (spec banco-de-horas) -->
      <div class="settings-card">
        <div class="card-section-title">
          <Timer :size="13" style="vertical-align: -2px; margin-right: 4px" />
          Jornada e banco de horas
        </div>
        <WorkScheduleCard />
      </div>

      <!-- Aviso de ociosidade do timer (spec timer-ociosidade) -->
      <div class="settings-card">
        <div class="card-section-title">
          <Timer :size="13" style="vertical-align: -2px; margin-right: 4px" />
          Aviso de ociosidade
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Avisar quando eu esquecer o timer rodando</span>
            <span class="setting-desc">
              Sem atividade no computador, o Nevo avisa e, se você não responder, para o
              tempo no último momento em que estava ativo. Nada é perdido: dá para recuperar
              o período em um clique.
            </span>
          </div>
          <button
            type="button"
            class="toggle"
            :class="{ 'toggle--on': idleGuard }"
            @click="setIdleGuard(!idleGuard)"
          >
            <span class="toggle-knob" />
          </button>
        </div>

        <div v-if="idleGuard" class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Tempo parado até o aviso</span>
            <span class="setting-desc">
              Depois do aviso, você ainda tem um terço desse tempo para responder antes do
              corte ({{ Math.round(idleWarnMin / 3) }} min agora).
            </span>
          </div>
          <div class="segmented">
            <button
              v-for="opt in idleWarnOptions"
              :key="opt"
              class="segmented-btn"
              :class="{ 'segmented-btn--active': idleWarnMin === opt }"
              @click="setIdleWarnMin(opt)"
            >
              {{ opt }} min
            </button>
          </div>
        </div>

        <div v-if="idleGuard" class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Aviso fora do navegador</span>
            <span class="setting-desc">{{ idleStatusText }}</span>
          </div>
          <div class="setting-actions">
            <button
              v-if="idleAlerts.granted.value"
              type="button"
              class="sound-preview"
              @click="testNotification"
            >
              <Bell :size="12" />
              Testar
            </button>
            <button
              v-if="idleAlerts.nextStep.value"
              type="button"
              class="idle-perm-btn"
              :disabled="idleAlerts.requesting.value"
              @click="idleAlerts.requestNext()"
            >
              {{ idleAlerts.stepLabel.value }}
            </button>
            <span v-else-if="idleAlerts.granted.value" class="idle-perm-ok">
              <Check :size="13" /> Ativo
            </span>
          </div>
        </div>

        <!-- "Como sei que funciona?": estado real desta máquina + teste do ciclo
             inteiro sem esperar o limiar. -->
        <div v-if="idleGuard" class="setting-block">
          <IdleDiagnostics />
        </div>
      </div>

      <!-- Notifications Discord -->
      <div class="settings-card">
        <div class="card-section-title">
          <Bell :size="13" style="vertical-align: -2px; margin-right: 4px" />
          Notificações Discord
        </div>

        <!-- Toggle global -->
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Ativar notificações em todas as empresas</span>
            <span class="setting-desc">
              A cada 2 horas, posta no Discord o que está atrasado, sem responsável,
              e os bug reports novos.
            </span>
          </div>
          <button
            type="button"
            class="toggle"
            :class="{ 'toggle--on': allEnabled }"
            :disabled="notifTogglingAll"
            @click="toggleAll"
          >
            <Loader2 v-if="notifTogglingAll" :size="13" class="spin" />
            <span v-else class="toggle-knob" />
          </button>
        </div>

        <!-- Lista por empresa -->
        <div v-if="notifLoading" class="notif-loading">
          <Loader2 :size="16" class="spin" />
          <span>Carregando empresas…</span>
        </div>

        <div v-else-if="notifCompanies.length" class="notif-list">
          <div v-for="c in notifCompanies" :key="c.id" class="notif-row">
            <div class="notif-row-head">
              <div class="notif-company">
                <span class="notif-company-name">{{ c.name }}</span>
                <span
                  class="notif-status"
                  :class="{
                    'notif-status--on': c.notificationsEnabled && c.hasWebhook,
                    'notif-status--warn': c.notificationsEnabled && !c.hasWebhook,
                  }"
                >
                  <template v-if="c.notificationsEnabled && c.hasWebhook">
                    Ativa
                  </template>
                  <template v-else-if="c.notificationsEnabled && !c.hasWebhook">
                    Faltando webhook
                  </template>
                  <template v-else>Desativada</template>
                </span>
              </div>
              <button
                type="button"
                class="toggle toggle--sm"
                :class="{ 'toggle--on': c.notificationsEnabled }"
                :disabled="notifSavingId === c.id"
                @click="toggleCompanyEnabled(c.id, !c.notificationsEnabled)"
              >
                <span class="toggle-knob" />
              </button>
            </div>

            <div class="notif-webhook">
              <div class="notif-webhook-status">
                <span v-if="c.hasWebhook" class="notif-webhook-set">
                  <Check :size="12" />
                  Webhook configurado
                </span>
                <span v-else class="notif-webhook-empty">Sem webhook configurado</span>
              </div>
              <div class="notif-webhook-edit">
                <input
                  v-model="webhookDrafts[c.id]"
                  :type="showWebhook[c.id] ? 'text' : 'password'"
                  class="notif-input"
                  placeholder="https://discord.com/api/webhooks/..."
                  :disabled="notifSavingId === c.id"
                />
                <button
                  type="button"
                  class="notif-eye"
                  :aria-label="showWebhook[c.id] ? 'Ocultar' : 'Mostrar'"
                  @click="showWebhook[c.id] = !showWebhook[c.id]"
                >
                  <component :is="showWebhook[c.id] ? EyeOff : Eye" :size="13" />
                </button>
                <button
                  type="button"
                  class="notif-save"
                  :disabled="!webhookDrafts[c.id]?.trim() || notifSavingId === c.id"
                  @click="saveCompanyWebhook(c.id)"
                >
                  <Loader2 v-if="notifSavingId === c.id" :size="13" class="spin" />
                  <span v-else>Salvar</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="notif-empty">
          Você não é membro de nenhuma empresa ainda.
        </div>

        <!-- Botão de teste manual -->
        <div class="setting-row" style="margin-top: 12px">
          <div class="setting-info">
            <span class="setting-label">Disparar verificação agora</span>
            <span class="setting-desc">
              Roda o cron manualmente — útil pra testar se o webhook está certo.
            </span>
          </div>
          <button
            type="button"
            class="btn-run-now"
            :disabled="runningNow"
            @click="runCronNow"
          >
            <Loader2 v-if="runningNow" :size="13" class="spin" />
            <Send v-else :size="13" />
            <span>{{ runningNow ? 'Rodando…' : 'Rodar agora' }}</span>
          </button>
        </div>
      </div>

      <!-- Repositórios — oculto enquanto a feature de Repos está em desenvolvimento -->
      <!-- <div class="settings-card"><RepositoriesSection /></div> -->

      <!-- Integrations -->
      <div class="settings-card">
        <div class="card-section-title">Integrações</div>
        <div class="setting-row setting-row--column">
          <div class="setting-info">
            <span class="setting-label">
              <FileCode :size="13" style="vertical-align: -2px; margin-right: 4px" />
              Importar do Jira
            </span>
            <span class="setting-desc">
              Envie o XML gerado pelo <em>Entity Engine Export</em> do Jira (até 50MB) para importar issues como tarefas.
            </span>
          </div>

          <div
            class="dropzone press"
            :class="{ 'dropzone--over': dragOver, 'dropzone--loading': importing }"
            @click="openFilePicker"
            @drop="onDrop"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
          >
            <input
              ref="fileInput"
              type="file"
              accept=".xml,application/xml,text/xml"
              class="dropzone-input"
              @change="onFileChange"
            />
            <div class="dropzone-icon">
              <Loader2 v-if="importing" :size="20" class="spin" />
              <Upload v-else :size="20" />
            </div>
            <div class="dropzone-text">
              <span class="dropzone-title">
                {{ importing ? 'Importando XML…' : 'Clique ou arraste o XML do Jira' }}
              </span>
              <span class="dropzone-meta">.xml · até 50MB</span>
            </div>
          </div>

          <div v-if="importResult" class="import-result">
            <Check :size="13" class="import-result-icon" />
            <span>
              Importação concluída.
              <strong>{{ importResult?.imported ?? importResult?.count ?? importResult?.total ?? 0 }}</strong>
              itens processados.
            </span>
          </div>
        </div>
      </div>

      <!-- Shortcuts -->
      <div class="settings-card">
        <div class="card-section-title">Atalhos de teclado</div>
        <div class="shortcuts-grid">
          <div class="shortcut-row">
            <span
              class="shortcut-label shortcut-label--glossary"
              title="Command Palette: uma busca rápida que abre qualquer página ou ação digitando o nome."
            >
              Abrir busca rápida (Command Palette)
            </span>
            <kbd class="kbd">Ctrl K</kbd>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-label">Foco na busca (Variáveis)</span>
            <kbd class="kbd">/</kbd>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-label">Nova variável</span>
            <kbd class="kbd">N</kbd>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-label">Alternar tema</span>
            <kbd class="kbd">Ctrl Shift L</kbd>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  padding: 24px;
  max-width: 820px;
  margin: 0 auto;
}

.settings-header {
  margin-bottom: 20px;
}

.settings-title {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text);
  margin: 0 0 3px;
}

.settings-sub {
  font-size: 13px;
  color: var(--text-3);
  margin: 0;
}

.settings-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.settings-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px 18px;
}

.card-section-title {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-4);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 12px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}

/* Bloco de largura inteira dentro do card (o diagnóstico não é par rótulo/ação). */
.setting-block {
  padding: 10px 0 2px;
}

.setting-row:last-child {
  border-bottom: none;
}

.setting-row--column {
  flex-direction: column;
  align-items: stretch;
}

/* ── Meu tempo ───────────────────────────────────────────────────────── */

.sound-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}

.sound-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease),
    transform var(--motion-fast) var(--motion-ease);
}

.sound-card:hover {
  border-color: var(--border-strong);
  background: var(--surface-3);
}

.sound-card:active {
  transform: scale(0.985);
}

.sound-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.sound-card--active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
}

.sound-card-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sound-card-name {
  flex: 1;
  font-size: 12.5px;
  font-weight: 700;
}

.sound-card-check {
  color: var(--accent);
}

.sound-card-play {
  color: var(--text-4);
}

.sound-card-hint {
  color: var(--text-3);
  font-size: 11px;
  line-height: 1.35;
}

.setting-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.sound-preview {
  min-height: 30px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 650;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.sound-preview:hover {
  background: var(--surface-3);
  color: var(--text);
}

/* ── Aviso de ociosidade ─────────────────────────────────────────────── */

.idle-perm-btn {
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: var(--accent-fg);
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: filter var(--motion-fast) var(--motion-ease);
}

.idle-perm-btn:hover:not(:disabled) {
  filter: brightness(1.05);
}

.idle-perm-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.idle-perm-ok {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--success);
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}

/* ── Discord notifications ───────────────────────────────────────────── */

.toggle {
  width: 42px;
  height: 24px;
  padding: 2px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  flex-shrink: 0;
  transition: background var(--motion-fast), border-color var(--motion-fast);
}

.toggle--sm {
  width: 36px;
  height: 20px;
}

.toggle:disabled {
  opacity: 0.6;
  cursor: progress;
}

.toggle-knob {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--text-3);
  transition: transform var(--motion-fast), background var(--motion-fast);
}

.toggle--sm .toggle-knob {
  width: 14px;
  height: 14px;
}

.toggle--on {
  background: var(--accent);
  border-color: var(--accent);
  justify-content: flex-end;
}

.toggle--on .toggle-knob {
  background: var(--accent-fg);
  transform: translateX(0);
}

.notif-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  color: var(--text-3);
  font-size: 13px;
}

.notif-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.notif-row {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--surface);
}

.notif-row-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.notif-company {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.notif-company-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notif-status {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  padding: 2px 6px;
  border-radius: 999px;
  flex-shrink: 0;
}

.notif-status--on {
  color: #10b981;
  border-color: color-mix(in srgb, #10b981 30%, var(--border));
  background: color-mix(in srgb, #10b981 10%, var(--surface-2));
}

.notif-status--warn {
  color: #f59e0b;
  border-color: color-mix(in srgb, #f59e0b 30%, var(--border));
  background: color-mix(in srgb, #f59e0b 10%, var(--surface-2));
}

.notif-webhook {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.notif-webhook-status {
  font-size: 11.5px;
}

.notif-webhook-set {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #10b981;
}

.notif-webhook-empty {
  color: var(--text-4);
}

.notif-webhook-edit {
  display: flex;
  gap: 6px;
  align-items: center;
}

.notif-input {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 12.5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  outline: none;
}

.notif-input:focus {
  border-color: var(--accent);
}

.notif-eye {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-3);
  cursor: pointer;
  flex-shrink: 0;
}

.notif-eye:hover {
  color: var(--text);
}

.notif-save {
  padding: 6px 12px;
  background: var(--accent);
  color: var(--accent-fg);
  border: 1px solid color-mix(in srgb, var(--accent) 80%, black);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.notif-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.notif-empty {
  font-size: 12.5px;
  color: var(--text-3);
  padding: 16px 0;
  text-align: center;
}

.btn-run-now {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: var(--surface-2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
}

.btn-run-now:hover:not(:disabled) {
  border-color: var(--accent);
}

.btn-run-now:disabled {
  opacity: 0.5;
  cursor: progress;
}

.spin {
  animation: spin 0.85s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setting-label {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
}

/* Termo técnico com explicação no tooltip (acessibilidade 50+). */
.setting-label--glossary,
.shortcut-label--glossary {
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
  text-decoration-color: var(--text-4);
}

.setting-desc {
  font-size: 12.5px;
  color: var(--text-3);
}

.segmented {
  display: inline-flex;
  padding: 2px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  gap: 2px;
}

.segmented-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  background: transparent;
  border: none;
  border-radius: 6px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-3);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.segmented-btn:hover {
  color: var(--text-2);
}

.segmented-btn--active {
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
}

.accent-picker {
  display: inline-flex;
  gap: 6px;
  flex-shrink: 0;
}

.accent-swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    transform var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.accent-swatch:hover {
  transform: scale(1.12);
}

.accent-swatch--active {
  border-color: var(--text);
  transform: scale(1.12);
}

.accent-check {
  color: var(--accent-fg);
}

.shell-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-top: 12px;
}

.shell-card {
  text-align: left;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  font-family: inherit;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.shell-card:hover {
  border-color: var(--border-strong);
  background: var(--surface-3);
}

.shell-card--active {
  border-color: var(--accent);
  background: var(--surface-3);
}

.shell-preview {
  aspect-ratio: 16 / 9;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  padding: 8px;
}

.preview {
  height: 100%;
  display: flex;
  gap: 4px;
}

.preview-topbar,
.preview-topnav {
  height: 14%;
  background: var(--surface-3);
  border-radius: 3px;
}

.preview--command,
.preview--canvas {
  flex-direction: column;
}

.preview-body {
  display: flex;
  gap: 4px;
  flex: 1;
}

.preview-sidebar,
.preview-context {
  width: 22%;
  background: var(--surface-3);
  border-radius: 3px;
}

.preview-rail {
  width: 8%;
  background: var(--surface-3);
  border-radius: 3px;
}

.preview-main {
  flex: 1;
  background: var(--surface-2);
  border-radius: 3px;
}

.preview--canvas {
  position: relative;
}

.preview-dock {
  position: absolute;
  left: 50%;
  bottom: 10%;
  transform: translateX(-50%);
  width: 40%;
  height: 8%;
  background: var(--surface-3);
  border-radius: 3px;
}

.shell-card-body {
  padding: 10px 12px;
}

.shell-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}

.shell-icon {
  color: var(--text-2);
}

.shell-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  flex: 1;
}

.shell-check {
  color: var(--accent);
}

.shell-desc {
  font-size: 11px;
  color: var(--text-3);
  line-height: 1.4;
}

.shortcuts-grid {
  display: flex;
  flex-direction: column;
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.shortcut-row:last-child {
  border-bottom: none;
}

.shortcut-label {
  font-size: 12.5px;
  color: var(--text-2);
}

.kbd {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--surface-2);
  padding: 3px 8px;
  border-radius: 5px;
  border: 1px solid var(--border);
}

/* ─── Dropzone (Jira) ─── */
.dropzone {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 18px;
  margin-top: 12px;
  background: var(--surface-2);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.dropzone:hover {
  background: var(--surface-3);
  border-color: var(--accent);
}

.dropzone--over {
  background: color-mix(in srgb, var(--accent) 10%, var(--surface-2));
  border-color: var(--accent);
}

.dropzone--loading {
  cursor: wait;
}

.dropzone-input {
  display: none;
}

.dropzone-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.dropzone-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.dropzone-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.dropzone-meta {
  font-size: 11.5px;
  color: var(--text-3);
  font-family: var(--font-mono);
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.import-result {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--success);
  background: color-mix(in srgb, var(--success) 12%, transparent);
  padding: 6px 10px;
  border-radius: 8px;
}

.import-result-icon {
  color: var(--success);
}
</style>
