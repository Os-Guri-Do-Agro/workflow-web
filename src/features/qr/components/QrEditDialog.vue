<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  Building2,
  ImagePlus,
  Link2,
  Loader2,
  Trash2,
  User,
  X,
} from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'
import QrPreview from './QrPreview.vue'
import type { QrCode, QrFolder, QrStyle } from '@/service/qr/qr-service'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import { useToast } from '@/composables/useToast'

/**
 * Dialog de criar/editar QR. Duas colunas no desktop: preview ao vivo do QR
 * (reagindo a cor/estilo/logo) à esquerda e os controles à direita — destino,
 * escopo (pessoal x empresa) e a seção de Aparência. No mobile empilha.
 */
const props = defineProps<{
  modelValue: boolean
  /** QR em edição; null = criação. */
  editing: QrCode | null
  loading?: boolean
  /** Pastas disponíveis (todas as visíveis do usuário). */
  folders?: QrFolder[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: [
    payload: {
      targetUrl: string
      label: string
      active: boolean
      companyId: string | null
      folderId: string | null
      style: QrStyle
    },
  ]
}>()

const workspace = useWorkspaceStore()
const { error: showError, info: showInfo } = useToast()

const LOGO_MAX_BYTES = 200 * 1024 // ~200KB

// Formato dos pontos / cantos (rótulos PT-BR → valores do contrato).
const dotOptions = [
  { label: 'Quadrado', value: 'square' },
  { label: 'Arredondado', value: 'rounded' },
  { label: 'Pontos', value: 'dots' },
  { label: 'Elegante', value: 'classy' },
] as const

const cornerOptions = [
  { label: 'Quadrado', value: 'square' },
  { label: 'Arredondado', value: 'rounded' },
  { label: 'Ponto', value: 'dot' },
] as const

// Combinações de cores prontas (contraste alto = escaneável). Hex literais.
const colorPresets = [
  { name: 'Clássico', dark: '#111827', light: '#ffffff' },
  { name: 'Azul', dark: '#0054e3', light: '#ffffff' },
  { name: 'Verde', dark: '#067647', light: '#ffffff' },
  { name: 'Vinho', dark: '#9f1239', light: '#fff1f2' },
] as const

type DotStyle = QrStyle['dotStyle']
type CornerStyle = QrStyle['cornerStyle']

const form = reactive({
  targetUrl: '',
  label: '',
  active: true,
  companyId: null as string | null,
  folderId: null as string | null,
  colorDark: '#000000',
  colorLight: '#ffffff',
  dotStyle: 'square' as DotStyle,
  cornerStyle: 'square' as CornerStyle,
  logoUrl: '' as string,
})
const touched = ref(false)

const isEdit = computed(() => !!props.editing)

// "Pessoal (só eu)" + uma opção por empresa do usuário (mesma fonte do TimerWidget).
const companyOptions = computed(() => [
  { label: 'Pessoal (só eu)', value: null as string | null },
  ...workspace.companies.map((c) => ({ label: c.name, value: c.id })),
])

// Pastas do MESMO escopo do QR: empresa selecionada → pastas da empresa; sem
// empresa → pastas pessoais. Sempre inclui "Sem pasta".
const folderOptions = computed(() => {
  const scoped = (props.folders ?? []).filter((f) =>
    form.companyId ? f.companyId === form.companyId : f.scope === 'personal',
  )
  return [
    { label: 'Sem pasta', value: null as string | null },
    ...scoped.map((f) => ({ label: f.name, value: f.id })),
  ]
})

// Trocar de escopo pode invalidar a pasta escolhida — zera se saiu do escopo.
watch(
  () => form.companyId,
  () => {
    if (
      form.folderId &&
      !folderOptions.value.some((o) => o.value === form.folderId)
    ) {
      form.folderId = null
    }
  },
)

// Carrega as empresas se ainda não estiverem no store (best-effort).
onMounted(() => {
  if (!workspace.companies.length) {
    void workspace.fetchCompanies().catch(() => {})
  }
})

// (Re)popula ao abrir — inclui escopo e estilo persistido.
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    touched.value = false
    form.targetUrl = props.editing?.targetUrl ?? ''
    form.label = props.editing?.label ?? ''
    form.active = props.editing?.active ?? true
    form.companyId = props.editing?.companyId ?? null
    form.folderId = props.editing?.folderId ?? null

    const st = props.editing?.style
    form.colorDark = st?.colorDark ?? '#000000'
    form.colorLight = st?.colorLight ?? '#ffffff'
    form.dotStyle = st?.dotStyle ?? 'square'
    form.cornerStyle = st?.cornerStyle ?? 'square'
    form.logoUrl = st?.logoUrl ?? ''

    // Criação: se sobrou rascunho de uma sessão interrompida (F5, aba fechada,
    // dialog fechado por acidente), devolve em vez de exigir digitar tudo de novo.
    if (!props.editing && restoreDraft()) {
      showInfo('Recuperamos o que você tinha preenchido')
    }
  },
  { immediate: true },
)

const targetError = computed(() => {
  if (!touched.value) return ''
  return form.targetUrl.trim() ? '' : 'Informe o destino do QR'
})

// Estilo montado a partir do form — alimenta o preview ao vivo.
const previewStyle = computed<QrStyle>(() => ({
  colorDark: form.colorDark,
  colorLight: form.colorLight,
  dotStyle: form.dotStyle,
  cornerStyle: form.cornerStyle,
  logoUrl: form.logoUrl || undefined,
}))

// Texto do preview: redirectUrl quando editando; senão o destino digitado; senão
// um exemplo.
//
// O destino digitado passa por um atraso curto DE PROPÓSITO: sem ele, cada tecla
// no campo de destino manda o `qr-code-styling` recalcular a matriz e redesenhar
// o QR inteiro, e digitar uma URL vira uma sequência de travadas.
const targetDebounced = ref('')
let targetTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => form.targetUrl,
  (v) => {
    if (targetTimer) clearTimeout(targetTimer)
    targetTimer = setTimeout(() => {
      targetTimer = null
      targetDebounced.value = v.trim()
    }, 350)
  },
  { immediate: true },
)

const previewText = computed(
  () => props.editing?.redirectUrl || targetDebounced.value || 'https://exemplo.com',
)

function applyPreset(preset: { dark: string; light: string }) {
  form.colorDark = preset.dark
  form.colorLight = preset.light
}

// ─── Cor por código, e não só pelo seletor do sistema ────────────────────────
//
// Antes o hex era um `<span>` só de leitura: para trocar a cor era obrigatório
// abrir o seletor do sistema operacional, que trabalha em RGB. Quem tinha o
// código da marca na mão (`#0054E3`) não conseguia colar, e traduzir hex para
// RGB de cabeça é pedir erro. Agora o campo aceita digitar e colar.
//
// Aceita, porque é o que aparece colado na prática: `#0054E3`, `0054e3`, `#08f`,
// `rgb(0, 84, 227)` e `0, 84, 227`.
function normalizeColor(raw: string): string | null {
  const texto = raw.trim().toLowerCase()
  if (!texto) return null

  const hex = texto.replace(/^#/, '')
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`
  // Forma curta: `#08f` significa `#0088ff`.
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
  }

  const rgb = texto.match(/^(?:rgba?\()?\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})/)
  if (rgb) {
    const canais = [rgb[1], rgb[2], rgb[3]].map((n) => Number(n))
    if (canais.every((n) => n >= 0 && n <= 255)) {
      return `#${canais.map((n) => n.toString(16).padStart(2, '0')).join('')}`
    }
  }
  return null
}

/**
 * Rascunhos do que está sendo digitado nos campos de cor.
 *
 * Sem isto, `#0054E3` seria rejeitado a cada tecla até o 6º dígito e o campo
 * ficaria brigando com quem digita. O valor só vai para o form quando forma uma
 * cor válida; o que está na tela continua sendo o que a pessoa escreveu.
 */
const hexDraft = reactive({ dark: '', light: '' })

function onHexInput(which: 'dark' | 'light', raw: string) {
  hexDraft[which] = raw
  const cor = normalizeColor(raw)
  if (!cor) return
  if (which === 'dark') form.colorDark = cor
  else form.colorLight = cor
}

/** Ao sair do campo, descarta rascunho inválido e volta a mostrar a cor real. */
function onHexBlur(which: 'dark' | 'light') {
  hexDraft[which] = ''
}

const hexDarkValue = computed(() => hexDraft.dark || form.colorDark.toUpperCase())
const hexLightValue = computed(() => hexDraft.light || form.colorLight.toUpperCase())

const hexDarkInvalido = computed(
  () => !!hexDraft.dark && !normalizeColor(hexDraft.dark),
)
const hexLightInvalido = computed(
  () => !!hexDraft.light && !normalizeColor(hexDraft.light),
)

// ─── Upload de logo (data URL) ────────────────────────────────────────────────
const fileInput = ref<HTMLInputElement | null>(null)

function pickLogo() {
  fileInput.value?.click()
}

function onLogoChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // permite re-selecionar o mesmo arquivo
  if (!file) return
  if (!file.type.startsWith('image/')) {
    showError('Selecione um arquivo de imagem')
    return
  }
  if (file.size > LOGO_MAX_BYTES) {
    showError('Logo muito grande (máx. ~200KB). Use uma imagem menor.')
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    form.logoUrl = typeof reader.result === 'string' ? reader.result : ''
  }
  reader.onerror = () => showError('Não foi possível ler a imagem')
  reader.readAsDataURL(file)
}

function removeLogo() {
  form.logoUrl = ''
}

// ─── Não perder o que foi digitado ───────────────────────────────────────────
//
// Este formulário é longo (destino, descrição, escopo, pasta, cores, formatos,
// logo). Antes, um clique no fundo escuro fechava o dialog e apagava tudo, e
// reabrir começava do zero: quem estava no meio do preenchimento perdia o
// trabalho sem nenhum aviso. Duas defesas, nesta ordem:
//
// 1. Clique no fundo e Esc NÃO fecham enquanto há coisa digitada. Fechar exige
//    um gesto explícito (o X ou Cancelar).
// 2. O rascunho fica em `localStorage` a cada mudança, então até um F5 no meio
//    do preenchimento devolve o formulário como estava.
//
// Só vale para CRIAÇÃO. Na edição o estado de partida é o QR salvo, e um
// rascunho velho sobrescrevendo dado real seria pior que o problema.
const DRAFT_KEY = 'qr.createDraft'

const isDirty = computed(() => {
  if (isEdit.value) return false
  return (
    !!form.targetUrl.trim() ||
    !!form.label.trim() ||
    !!form.companyId ||
    !!form.folderId ||
    !!form.logoUrl ||
    form.colorDark !== '#000000' ||
    form.colorLight !== '#ffffff' ||
    form.dotStyle !== 'square' ||
    form.cornerStyle !== 'square' ||
    form.active !== true
  )
})

let draftTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Grava o rascunho, com atraso e sem o logo.
 *
 * As duas coisas existem por medição, não por precaução: gravar no `localStorage`
 * a cada tecla é I/O síncrono no meio da digitação, e `form.logoUrl` é uma data
 * URL de até 200KB. Serializar e escrever isso a cada caractere trava a digitação
 * por centenas de milissegundos (o DevTools acusa o `textarea` bloqueando a UI).
 *
 * O logo fica de fora do rascunho de propósito: é o único campo pesado, e
 * reanexar uma imagem é muito mais barato que redigitar o formulário inteiro.
 */
function saveDraft() {
  if (isEdit.value || !props.modelValue) return
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    draftTimer = null
    try {
      if (!isDirty.value) {
        localStorage.removeItem(DRAFT_KEY)
        return
      }
      const { logoUrl: _logo, ...leve } = form
      localStorage.setItem(DRAFT_KEY, JSON.stringify(leve))
    } catch {
      // Cota cheia ou modo privado: o rascunho é conveniência, não requisito.
    }
  }, 600)
}

onBeforeUnmount(() => {
  if (draftTimer) clearTimeout(draftTimer)
  if (targetTimer) clearTimeout(targetTimer)
})

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // idem
  }
}

/** Devolve o rascunho ao form. Ignora chave desconhecida (formato antigo). */
function restoreDraft(): boolean {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return false
    const draft = JSON.parse(raw) as Partial<typeof form>
    let restaurou = false
    for (const key of Object.keys(form) as (keyof typeof form)[]) {
      const value = draft[key]
      if (value !== undefined && typeof value === typeof form[key]) {
        // @ts-expect-error chaves e tipos conferidos acima, uma a uma
        form[key] = value
        restaurou = true
      }
    }
    return restaurou
  } catch {
    return false
  }
}

watch(form, saveDraft, { deep: true })

/** Fechamento explícito (X, Cancelar): descarta o rascunho de propósito. */
function close() {
  if (props.loading) return
  clearDraft()
  emit('update:modelValue', false)
}

/**
 * Tentativa de fechar por clique no fundo ou Esc. Com formulário preenchido,
 * ignora e avisa: é o gesto mais fácil de disparar por acidente e o que mais
 * custava caro.
 */
function requestClose() {
  if (props.loading) return
  if (isDirty.value) {
    showInfo('Use o X ou Cancelar para descartar o que você preencheu')
    return
  }
  close()
}

// Envia só os campos preenchidos: cores/formatos sempre têm valor; logo é opcional.
function buildStyle(): QrStyle {
  const style: QrStyle = {
    colorDark: form.colorDark,
    colorLight: form.colorLight,
    dotStyle: form.dotStyle,
    cornerStyle: form.cornerStyle,
  }
  if (form.logoUrl) style.logoUrl = form.logoUrl
  return style
}

function submit() {
  touched.value = true
  if (!form.targetUrl.trim()) return
  // Gravou: o rascunho cumpriu a função e sai de cena.
  clearDraft()
  emit('submit', {
    targetUrl: form.targetUrl.trim(),
    label: form.label.trim(),
    active: form.active,
    companyId: form.companyId,
    folderId: form.folderId,
    style: buildStyle(),
  })
}
</script>

<template>
  <Teleport to="body">
    <!-- `requestClose`: com formulário preenchido, o clique no fundo não descarta
         nada. Era o acidente mais caro deste dialog.

         O comentário fica FORA do <Transition> de propósito: Transition aceita um
         único filho, e um comentário ao lado de um `v-if` conta como segundo nó.
         O efeito é a saída nunca completar e o overlay ficar preso na tela. -->
    <Transition name="qed-fade">
      <div
        v-if="modelValue"
        class="qed-overlay"
        @mousedown.self="requestClose"
        @keydown.esc.stop="requestClose"
      >
        <section
          class="qed"
          role="dialog"
          aria-modal="true"
          :aria-label="isEdit ? 'Editar QR' : 'Novo QR'"
        >
          <header class="qed-head">
            <div>
              <p class="qed-eyebrow">{{ isEdit ? 'Editar' : 'Novo' }} QR</p>
              <h2 class="qed-title">{{ isEdit ? 'Trocar destino e aparência' : 'Criar QR dinâmico' }}</h2>
            </div>
            <button class="qed-icon-btn" type="button" aria-label="Fechar" :disabled="loading" @click="close">
              <X :size="16" />
            </button>
          </header>

          <form class="qed-body" @submit.prevent="submit">
            <!-- Coluna do preview ao vivo -->
            <aside class="qed-preview">
              <QrPreview :text="previewText" :style="previewStyle" :size="196" />
              <p class="qed-preview-cap">Prévia ao vivo</p>
            </aside>

            <!-- Coluna dos controles -->
            <div class="qed-controls">
              <!-- Destino: o campo central -->
              <label class="qed-field">
                <span class="qed-label">Destino do link</span>
                <div class="qed-input-wrap" :class="{ 'qed-input-wrap--err': targetError }">
                  <Link2 :size="15" class="qed-input-icon" />
                  <input
                    v-model="form.targetUrl"
                    class="qed-input"
                    type="url"
                    inputmode="url"
                    placeholder="https://..."
                    autocomplete="off"
                    @blur="touched = true"
                  />
                </div>
                <span v-if="targetError" class="qed-hint qed-hint--err">{{ targetError }}</span>
                <span v-else-if="isEdit" class="qed-hint">
                  O mesmo QR impresso passa a apontar para este link — sem reimprimir.
                </span>
              </label>

              <label class="qed-field">
                <span class="qed-label">Descrição (opcional)</span>
                <textarea
                  v-model="form.label"
                  class="qed-textarea"
                  rows="2"
                  placeholder="Ex.: Cartaz da campanha de verão, mesa 3"
                  maxlength="120"
                />
                <span class="qed-hint qed-hint--count">{{ form.label.length }}/120</span>
              </label>

              <!-- Escopo: pessoal x empresa -->
              <div class="qed-field">
                <span class="qed-label">Onde salvar</span>
                <AppSelect
                  :model-value="form.companyId"
                  :items="companyOptions"
                  placeholder="Pessoal (só eu)"
                  label="Onde salvar"
                  @update:model-value="(v) => (form.companyId = v as string | null)"
                />
                <span class="qed-hint">
                  <component :is="form.companyId ? Building2 : User" :size="12" />
                  {{ form.companyId ? 'Compartilhado com a empresa selecionada.' : 'Visível só para você.' }}
                </span>
              </div>

              <!-- Pasta (organiza dentro do escopo) -->
              <div v-if="folderOptions.length > 1" class="qed-field">
                <span class="qed-label">Pasta (opcional)</span>
                <AppSelect
                  :model-value="form.folderId"
                  :items="folderOptions"
                  placeholder="Sem pasta"
                  label="Pasta"
                  @update:model-value="(v) => (form.folderId = v as string | null)"
                />
              </div>

              <label class="qed-toggle">
                <input v-model="form.active" type="checkbox" class="qed-checkbox" />
                <span class="qed-toggle-text">
                  <span class="qed-toggle-title">QR ativo</span>
                  <span class="qed-toggle-desc">Desligado, o link responde como inativo.</span>
                </span>
              </label>

              <!-- Aparência -->
              <div class="qed-section">
                <p class="qed-section-title">Aparência</p>

                <!-- Presets -->
                <div class="qed-presets">
                  <button
                    v-for="p in colorPresets"
                    :key="p.name"
                    type="button"
                    class="qed-preset"
                    :title="p.name"
                    @click="applyPreset(p)"
                  >
                    <span class="qed-preset-swatch" :style="{ background: p.light }">
                      <span class="qed-preset-dot" :style="{ background: p.dark }" />
                    </span>
                    <span class="qed-preset-name">{{ p.name }}</span>
                  </button>
                </div>

                <!-- Cores -->
                <!-- `div` e não `label`: o bloco tem DOIS controles (o seletor e
                     o campo de código), e um label repassaria o clique do campo
                     de texto para o seletor, abrindo o picker do sistema. -->
                <div class="qed-row">
                  <div class="qed-color">
                    <span class="qed-label">Cor dos módulos</span>
                    <span class="qed-color-wrap" :class="{ 'qed-color-wrap--err': hexDarkInvalido }">
                      <input
                        v-model="form.colorDark"
                        type="color"
                        class="qed-color-input"
                        aria-label="Escolher a cor dos módulos"
                      />
                      <input
                        class="qed-color-hex"
                        type="text"
                        inputmode="text"
                        spellcheck="false"
                        autocomplete="off"
                        maxlength="24"
                        aria-label="Código da cor dos módulos"
                        placeholder="#000000"
                        :value="hexDarkValue"
                        @input="onHexInput('dark', ($event.target as HTMLInputElement).value)"
                        @blur="onHexBlur('dark')"
                      />
                    </span>
                    <span class="qed-hint">Cole o código: #0054E3, 0054e3 ou rgb(0, 84, 227)</span>
                  </div>
                  <div class="qed-color">
                    <span class="qed-label">Cor do fundo</span>
                    <span class="qed-color-wrap" :class="{ 'qed-color-wrap--err': hexLightInvalido }">
                      <input
                        v-model="form.colorLight"
                        type="color"
                        class="qed-color-input"
                        aria-label="Escolher a cor do fundo"
                      />
                      <input
                        class="qed-color-hex"
                        type="text"
                        inputmode="text"
                        spellcheck="false"
                        autocomplete="off"
                        maxlength="24"
                        aria-label="Código da cor do fundo"
                        placeholder="#FFFFFF"
                        :value="hexLightValue"
                        @input="onHexInput('light', ($event.target as HTMLInputElement).value)"
                        @blur="onHexBlur('light')"
                      />
                    </span>
                  </div>
                </div>

                <!-- Formatos -->
                <div class="qed-row">
                  <div class="qed-field qed-field--half">
                    <span class="qed-label">Formato dos pontos</span>
                    <AppSelect
                      :model-value="form.dotStyle ?? 'square'"
                      :items="dotOptions"
                      label="Formato dos pontos"
                      density="compact"
                      @update:model-value="(v) => (form.dotStyle = v as DotStyle)"
                    />
                  </div>
                  <div class="qed-field qed-field--half">
                    <span class="qed-label">Formato dos cantos</span>
                    <AppSelect
                      :model-value="form.cornerStyle ?? 'square'"
                      :items="cornerOptions"
                      label="Formato dos cantos"
                      density="compact"
                      @update:model-value="(v) => (form.cornerStyle = v as CornerStyle)"
                    />
                  </div>
                </div>

                <!-- Logo -->
                <div class="qed-field">
                  <span class="qed-label">Logo no centro (opcional)</span>
                  <input
                    ref="fileInput"
                    type="file"
                    accept="image/*"
                    class="qed-file-hidden"
                    @change="onLogoChange"
                  />
                  <div class="qed-logo-row">
                    <button type="button" class="qed-logo-btn" @click="pickLogo">
                      <ImagePlus :size="15" />
                      <span>{{ form.logoUrl ? 'Trocar logo' : 'Enviar logo' }}</span>
                    </button>
                    <div v-if="form.logoUrl" class="qed-logo-preview">
                      <img :src="form.logoUrl" alt="Logo do QR" />
                    </div>
                    <button
                      v-if="form.logoUrl"
                      type="button"
                      class="qed-logo-remove"
                      aria-label="Remover logo"
                      @click="removeLogo"
                    >
                      <Trash2 :size="14" />
                      <span>Remover</span>
                    </button>
                  </div>
                  <span class="qed-hint">PNG ou JPG até ~200KB. Ele fica no meio do QR.</span>
                </div>
              </div>
            </div>

            <footer class="qed-actions">
              <button class="qed-btn qed-btn--ghost" type="button" :disabled="loading" @click="close">
                Cancelar
              </button>
              <button class="qed-btn qed-btn--primary" type="submit" :disabled="loading">
                <Loader2 v-if="loading" :size="14" class="spin" />
                <span>{{ isEdit ? 'Salvar' : 'Criar QR' }}</span>
              </button>
            </footer>
          </form>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.qed-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: grid;
  place-items: center;
  padding: 20px;
  background: color-mix(in srgb, var(--text) 55%, transparent);
  backdrop-filter: blur(10px);
}

.qed {
  width: min(880px, 100%);
  max-height: min(92vh, 820px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xl);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-overlay);
}

.qed-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.qed-eyebrow {
  margin: 0 0 2px;
  color: var(--text-4);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.qed-title {
  margin: 0;
  font-size: 16px;
  font-weight: 750;
  color: var(--text);
}

.qed-icon-btn {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
  flex-shrink: 0;
}

.qed-icon-btn:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--border-strong);
}

.qed-body {
  padding: 22px;
  overflow-y: auto;
  display: grid;
  grid-template-columns: 240px 1fr;
  grid-template-areas:
    'preview controls'
    'actions actions';
  gap: 22px 26px;
  align-items: start;
}

.qed-preview {
  grid-area: preview;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
}

.qed-preview-cap {
  margin: 0;
  color: var(--text-3);
  font-size: 11.5px;
  font-weight: 600;
}

.qed-controls {
  grid-area: controls;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.qed-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.qed-label {
  font-size: 12px;
  font-weight: 650;
  color: var(--text-2);
}

.qed-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  transition: border-color var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease);
}

.qed-input-wrap:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent);
}

.qed-input-wrap--err {
  border-color: var(--err);
}

.qed-input-icon {
  color: var(--text-3);
  flex-shrink: 0;
}

.qed-input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 14px;
  outline: none;
}

/* Descrição: campo maior (textarea), o "input pequeno" que o dono apontou. */
.qed-textarea {
  width: 100%;
  min-height: 60px;
  padding: 11px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 14px;
  line-height: 1.45;
  resize: vertical;
  outline: none;
  transition: border-color var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease);
}

.qed-textarea:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent);
}

.qed-hint--count {
  align-self: flex-end;
  font-size: 11px;
  color: var(--text-4);
}

.qed-input::placeholder,
.qed-textarea::placeholder {
  color: var(--text-3);
}

.qed-hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--text-3);
  line-height: 1.4;
}

.qed-hint--err {
  color: var(--err);
}

.qed-toggle {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  cursor: pointer;
}

.qed-checkbox {
  width: 18px;
  height: 18px;
  margin-top: 1px;
  accent-color: var(--accent);
  cursor: pointer;
  flex-shrink: 0;
}

.qed-toggle-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.qed-toggle-title {
  font-size: 13px;
  font-weight: 650;
  color: var(--text);
}

.qed-toggle-desc {
  font-size: 11.5px;
  color: var(--text-3);
}

/* ─── Aparência ─── */
.qed-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}

.qed-section-title {
  margin: 0;
  font-size: 12px;
  font-weight: 750;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.qed-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.qed-preset {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 12px 0 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-2);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.qed-preset:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.qed-preset-swatch {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  border: 1px solid var(--border);
}

.qed-preset-dot {
  width: 11px;
  height: 11px;
  border-radius: 3px;
}

.qed-preset-name {
  white-space: nowrap;
}

.qed-row {
  display: flex;
  gap: 12px;
}

.qed-field--half {
  flex: 1;
}

.qed-color {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.qed-color-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 10px 0 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.qed-color-input {
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

/* Deixa o swatch nativo redondinho onde o browser permitir. */
.qed-color-input::-webkit-color-swatch-wrapper {
  padding: 0;
}
.qed-color-input::-webkit-color-swatch {
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
}

/* Agora é campo de texto (dá para digitar e colar), não mais um rótulo morto. */
.qed-color-hex {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  outline: none;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 12px;
  text-transform: uppercase;
}

.qed-color-hex::placeholder {
  color: var(--text-4);
  text-transform: none;
}

.qed-color-wrap:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}

/* Digitação ainda incompleta ou inválida: avisa sem bloquear a digitação. */
.qed-color-wrap--err {
  border-color: color-mix(in srgb, var(--err) 55%, transparent);
}

.qed-color-wrap--err:focus-within {
  border-color: var(--err);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--err) 20%, transparent);
}

/* ─── Logo ─── */
.qed-file-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.qed-logo-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.qed-logo-btn,
.qed-logo-remove {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.qed-logo-btn:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.qed-logo-remove:hover {
  border-color: var(--err);
  color: var(--err);
}

.qed-logo-preview {
  width: 40px;
  height: 40px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: #ffffff; /* logo pode ser transparente — fundo branco p/ conferir */
  display: grid;
  place-items: center;
  overflow: hidden;
}

.qed-logo-preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.qed-actions {
  grid-area: actions;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 4px;
  border-top: 1px solid var(--border);
}

.qed-btn {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 18px;
  border-radius: var(--radius);
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: filter var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.qed-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.qed-btn--ghost {
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
}

.qed-btn--ghost:hover:not(:disabled) {
  border-color: var(--border-strong);
}

.qed-btn--primary {
  border: 1px solid var(--accent);
  background: var(--accent);
  color: var(--accent-fg);
}

.qed-btn--primary:hover:not(:disabled) {
  filter: brightness(1.05);
}

.spin {
  animation: spin 0.8s linear infinite;
}

.qed-fade-enter-active,
.qed-fade-leave-active {
  transition: opacity var(--motion-fast) var(--motion-ease);
}

.qed-fade-enter-from,
.qed-fade-leave-to {
  opacity: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}

/* Mobile: empilha preview em cima dos controles. */
@media (max-width: 620px) {
  .qed-body {
    grid-template-columns: 1fr;
    grid-template-areas:
      'preview'
      'controls'
      'actions';
  }

  .qed-preview {
    position: static;
  }

  .qed-row {
    flex-direction: column;
  }
}
</style>
