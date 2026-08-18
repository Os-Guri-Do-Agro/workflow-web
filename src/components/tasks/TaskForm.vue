<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  X,
  Plus,
  Type,
  FileText,
  CalendarDays,
  ChevronRight,
  Flag,
  AlignLeft,
  ListChecks,
  Users,
  Paperclip,
  Tag as TagIcon,
  Check,
  Loader2,
} from 'lucide-vue-next'
import TagInput from '@/components/ui/TagInput.vue'
import { dateOnlyToUtcNoonIso } from '@/utils/date'
import { avatarTone, initials as personInitials } from '@/utils/avatar'
// Boundary: a regra do repo é que componente compartilhado não importe TIPOS de
// `features/*` na sua API pública. Isto é outra coisa: `components/tasks/` já é
// do domínio de tarefa (aqui e no `KanbanBoard`), então consumir o editor de
// descrição da feature é irmão chamando irmão. A descrição precisa nascer com a
// MESMA superfície que ela tem na edição, senão a pessoa formata depois de criar.
// Follow-up (R2): mover `components/tasks/` para dentro de `features/tasks/`.
import TaskDescriptionEditor from '@/features/tasks/components/TaskDescriptionEditor.vue'
import { isMarkdownFilename } from '@/utils/file-kind'

// Shapes locais (regra de boundary: componente compartilhado não importa tipos
// de features/*). O membro chega em dois formatos conforme o caller: plano
// ({ id, name }) ou vínculo com o usuário aninhado ({ user: { id, name } }) —
// o template já tratava os dois, o tipo reflete isso.
interface TaskFormMember {
  id?: string
  name?: string
  email?: string
  user?: { id: string; name: string }
}

/** Tag como o chip precisa. Shape local pela mesma regra de boundary acima. */
interface TaskFormTag {
  id: string
  name: string
  slug: string
  color: string | null
}

/** Subtarefa em rascunho, antes de a tarefa pai existir. */
export interface TaskFormSubtask {
  title: string
  /** Texto plano; vira HTML na hora de gravar (`plainToHtml`). */
  description: string
}

interface TaskFormModel {
  title: string
  description: string
  priorityNumber: number
  dueDate: string
  assignees: string[]
  /**
   * Vários arquivos. Cada um sobe numa requisição própria depois que a tarefa
   * existe: o endpoint é single-file e um arquivo recusado não pode derrubar
   * os outros nem a criação da tarefa.
   */
  attachments: File[]
  tags: TaskFormTag[]
  /**
   * Markdown do documento inicial. Vira o documento PRINCIPAL da tarefa, que é
   * o que as subtarefas herdam quando esta for um módulo.
   */
  docContent: string
  docTitle: string
  /**
   * Subtarefas já digitadas na criação, com título e descrição.
   *
   * Antes, quebrar uma tarefa em passos exigia criar a tarefa, abrir a tarefa e
   * criar uma subtarefa por vez lá dentro — três telas para uma decisão que a
   * pessoa já tinha tomado enquanto escrevia o título. Aqui elas são criadas
   * junto, depois do pai existir (mesmo desenho de documento e anexos).
   *
   * A descrição entrou depois: eram só títulos, e o código enviava
   * `description: ''` fixo, então subtarefa nascia obrigatoriamente sem
   * explicação nenhuma. O campo é opcional e fica recolhido até ser pedido.
   */
  subtasks: TaskFormSubtask[]
}

const emit = defineEmits<{
  close: []
  submit: []
  'update:modelValue': [value: TaskFormModel]
}>()

const props = defineProps<{
  members: TaskFormMember[]
  modelValue: TaskFormModel
  loading?: boolean
  /** Escopo do catálogo de tags. Sem ele o campo de tags não aparece. */
  companyId?: string | null
}>()

const form = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const attachmentError = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

const priorities = [
  { value: 0, label: 'P0', tone: 'var(--text-3)' },
  { value: 1, label: 'P1', tone: 'var(--info)' },
  { value: 2, label: 'P2', tone: 'var(--info)' },
  { value: 3, label: 'P3', tone: 'var(--warn)' },
  { value: 4, label: 'P4', tone: 'var(--err)' },
  { value: 5, label: 'P5', tone: 'var(--err)' },
]

/** Espelho de `ATTACHMENT_MAX_BYTES` do servidor, que é quem manda. */
const MAX_BYTES = 25 * 1024 * 1024

/**
 * `.md` escolhido no seletor, com o destino que o usuário deu a ele.
 *
 * Markdown tem dois destinos dentro da tarefa e antes desta rodada o form
 * decidia sozinho: o primeiro `.md` virava o documento e o RESTO era descartado
 * em silêncio. Quem só queria jogar o arquivo não tinha saída, e quem escolhia
 * dois `.md` perdia um sem aviso. Agora cada um aparece com a escolha à vista.
 */
interface MarkdownPick {
  id: string
  file: File
  as: 'doc' | 'file'
}

const mdPicks = ref<MarkdownPick[]>([])
let mdSeq = 0

/**
 * Texto do `.md` que alimentou o campo de documento.
 *
 * Serve para saber, na hora de trocar o destino para "anexo", se o campo ainda
 * é o arquivo puro (pode limpar) ou se a pessoa editou por cima (não pode).
 */
const docSource = ref<{ pickId: string; content: string } | null>(null)

/** Anexos comuns: os `.md` têm lista própria, com o seletor de destino. */
const plainAttachments = computed(() =>
  props.modelValue.attachments
    .map((file, index) => ({ file, index }))
    .filter((entry) => !mdPicks.value.some((pick) => pick.file === entry.file)),
)

const docTitleFrom = (filename: string) =>
  filename.replace(/\.(md|markdown)$/i, '').replace(/[-_]+/g, ' ')

/** Aceita vários arquivos; `.md` vai para a lista de destino, o resto é anexo. */
const onFileChange = async (e: Event) => {
  attachmentError.value = ''
  const input = e.target as HTMLInputElement
  const picked = Array.from(input.files ?? [])
  input.value = ''
  if (!picked.length) return

  const tooBig = picked.filter((f) => f.size > MAX_BYTES)
  if (tooBig.length) {
    attachmentError.value =
      tooBig.length === 1
        ? `"${tooBig[0]!.name}" tem mais de 25 MB`
        : `${tooBig.length} arquivos têm mais de 25 MB`
  }

  const ok = picked.filter((f) => f.size <= MAX_BYTES)
  const markdown = ok.filter((f) => isMarkdownFilename(f.name))
  const files = ok.filter((f) => !isMarkdownFilename(f.name))

  // Só o primeiro `.md` do lote pode virar documento sozinho, e só se o campo
  // ainda estiver vazio: sobrescrever spec já colada é perda de trabalho.
  const canAutoDoc = !docSource.value && !props.modelValue.docContent.trim()

  const fresh: MarkdownPick[] = markdown.map((file, i) => ({
    id: `md-${mdSeq++}`,
    file,
    as: canAutoDoc && i === 0 ? 'doc' : 'file',
  }))
  mdPicks.value = [...mdPicks.value, ...fresh]

  // Os que ficaram como anexo entram no modelo junto com os arquivos comuns.
  const asFiles = fresh.filter((pick) => pick.as === 'file').map((pick) => pick.file)
  const next: TaskFormModel = {
    ...props.modelValue,
    attachments: [...props.modelValue.attachments, ...files, ...asFiles],
  }

  const doc = fresh.find((pick) => pick.as === 'doc')
  if (doc) {
    const content = await doc.file.text()
    docSource.value = { pickId: doc.id, content }
    next.docContent = content
    next.docTitle = docTitleFrom(doc.file.name)
  }

  emit('update:modelValue', next)
}

/** Troca o destino de um `.md` já escolhido. Documento é exclusivo: só um. */
const setMarkdownDest = async (pick: MarkdownPick, dest: 'doc' | 'file') => {
  if (pick.as === dest) return

  let attachments = [...props.modelValue.attachments]
  let docContent = props.modelValue.docContent
  let docTitle = props.modelValue.docTitle

  const releaseDoc = (current: MarkdownPick) => {
    current.as = 'file'
    if (!attachments.includes(current.file)) attachments = [...attachments, current.file]
    // Só limpa o campo se ele ainda for o arquivo puro. Texto editado à mão
    // fica, mesmo que a fonte tenha virado anexo.
    if (docSource.value?.pickId === current.id && docContent === docSource.value.content) {
      docContent = ''
      docTitle = ''
    }
    if (docSource.value?.pickId === current.id) docSource.value = null
  }

  if (dest === 'doc') {
    const previous = mdPicks.value.find((p) => p.as === 'doc' && p.id !== pick.id)
    if (previous) releaseDoc(previous)

    const content = await pick.file.text()
    pick.as = 'doc'
    attachments = attachments.filter((file) => file !== pick.file)
    docSource.value = { pickId: pick.id, content }
    docContent = content
    docTitle = docTitleFrom(pick.file.name)
  } else {
    releaseDoc(pick)
  }

  emit('update:modelValue', { ...props.modelValue, attachments, docContent, docTitle })
}

const removeMarkdownPick = (pick: MarkdownPick) => {
  attachmentError.value = ''
  mdPicks.value = mdPicks.value.filter((p) => p.id !== pick.id)

  const wasDoc = docSource.value?.pickId === pick.id
  const untouched = wasDoc && props.modelValue.docContent === docSource.value?.content
  if (wasDoc) docSource.value = null

  emit('update:modelValue', {
    ...props.modelValue,
    attachments: props.modelValue.attachments.filter((file) => file !== pick.file),
    docContent: untouched ? '' : props.modelValue.docContent,
    docTitle: untouched ? '' : props.modelValue.docTitle,
  })
}

const removeFile = (index: number) => {
  attachmentError.value = ''
  emit('update:modelValue', {
    ...props.modelValue,
    attachments: props.modelValue.attachments.filter((_, i) => i !== index),
  })
}

const onTagsChange = (tags: TaskFormTag[]) => {
  emit('update:modelValue', { ...props.modelValue, tags })
}

/** `v-model` do documento: o form é controlado pelo pai, então escreve por emit. */
const docTitleModel = computed({
  get: () => props.modelValue.docTitle,
  set: (docTitle: string) => emit('update:modelValue', { ...props.modelValue, docTitle }),
})

// ─── Subtarefas ──────────────────────────────────────────────────────────────

const subtaskDraft = ref('')

/**
 * Quais subtarefas estão com a descrição aberta.
 *
 * Fechada por padrão de propósito: quem está quebrando a tarefa em passos digita
 * título e Enter, título e Enter. Um textarea sempre visível por item
 * transformaria uma lista de cinco passos numa página de rolagem.
 */
const descricaoAberta = ref<Set<number>>(new Set())

function toggleDescricao(index: number): void {
  const proximo = new Set(descricaoAberta.value)
  if (proximo.has(index)) proximo.delete(index)
  else proximo.add(index)
  descricaoAberta.value = proximo
}

function addSubtask(): void {
  const title = subtaskDraft.value.trim()
  if (!title) return
  emit('update:modelValue', {
    ...props.modelValue,
    subtasks: [...props.modelValue.subtasks, { title, description: '' }],
  })
  subtaskDraft.value = ''
}

function updateSubtask(index: number, title: string): void {
  const subtasks = props.modelValue.subtasks.map((s, i) => (i === index ? { ...s, title } : s))
  emit('update:modelValue', { ...props.modelValue, subtasks })
}

/** A descrição que a subtarefa já nasce tendo (antes ela nascia sempre vazia). */
function updateSubtaskDescription(index: number, description: string): void {
  const subtasks = props.modelValue.subtasks.map((s, i) =>
    i === index ? { ...s, description } : s,
  )
  emit('update:modelValue', { ...props.modelValue, subtasks })
}

function removeSubtask(index: number): void {
  // Os índices abertos mudam de dono quando um item some do meio da lista.
  descricaoAberta.value = new Set(
    [...descricaoAberta.value]
      .filter((i) => i !== index)
      .map((i) => (i > index ? i - 1 : i)),
  )
  emit('update:modelValue', {
    ...props.modelValue,
    subtasks: props.modelValue.subtasks.filter((_, i) => i !== index),
  })
}

// ─── Seção técnica (markdown) ────────────────────────────────────────────────

const hasDoc = computed(
  () =>
    props.modelValue.docContent.trim().length > 0 ||
    props.modelValue.docTitle.trim().length > 0,
)

/**
 * Fechada por padrão, MAS aberta quando já tem conteúdo — senão um `.md`
 * escolhido nos arquivos preencheria o documento sem nada na tela indicando
 * isso, e a pessoa não teria como revisar o que vai ser salvo.
 */
const devOpen = ref(hasDoc.value)
watch(hasDoc, (filled) => {
  if (filled) devOpen.value = true
})

const docContentModel = computed({
  get: () => props.modelValue.docContent,
  set: (docContent: string) =>
    emit('update:modelValue', { ...props.modelValue, docContent }),
})

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`

const toggleAssignee = (userId?: string) => {
  if (!userId) return
  const list: string[] = Array.isArray(form.value?.assignees) ? [...form.value.assignees] : []
  const idx = list.indexOf(userId)
  if (idx >= 0) list.splice(idx, 1)
  else list.push(userId)
  emit('update:modelValue', { ...props.modelValue, assignees: list })
}

const isSelected = (userId?: string) =>
  !!userId && Array.isArray(form.value?.assignees) && form.value.assignees.includes(userId)

// Iniciais e tom de pessoa vêm do util compartilhado (tokens --avatar-1..6):
// o mesmo membro aparece igual aqui, no board, no detalhe da tarefa e no
// ranking da equipe.
const initials = (name?: string) => personInitials(name || '?')
const toneOf = (name?: string) => avatarTone(name || '?')

const valid = computed(() => !!form.value?.title?.trim())

const submit = () => {
  if (!valid.value) return
  if (form.value.dueDate && typeof form.value.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(form.value.dueDate)) {
    emit('update:modelValue', { ...form.value, dueDate: dateOnlyToUtcNoonIso(form.value.dueDate) })
  }
  emit('submit')
}
</script>

<template>
  <div class="form-card">
    <!-- Head -->
    <header class="head">
      <div class="head-main">
        <span class="head-icon">
          <Plus :size="17" />
        </span>
        <div>
          <h2 class="head-title">Nova atividade</h2>
          <p class="head-sub">Crie uma tarefa com responsáveis e prioridade</p>
        </div>
      </div>
      <button class="close-btn" aria-label="Fechar" :disabled="props.loading" @click="emit('close')">
        <X :size="16" />
      </button>
    </header>

    <!-- Body -->
    <div class="body">
      <!-- Title -->
      <label class="field">
        <span class="label">
          <Type :size="12" />
          Título
        </span>
        <textarea
          v-model="form.title"
          class="input input--title"
          rows="2"
          placeholder="O que precisa ser feito?"
          @keydown.meta.enter.prevent="submit"
          @keydown.ctrl.enter.prevent="submit"
        />
      </label>

      <!-- Descrição: mesma superfície fundida da edição, com formatação inline -->
      <div class="field">
        <span class="label">
          <FileText :size="12" />
          Descrição
        </span>
        <TaskDescriptionEditor
          :model-value="form.description"
          field-label="Descrição da atividade"
          placeholder="Detalhes, critérios de aceitação, links úteis..."
          variant="field"
          min-height="76px"
          hide-count
          @save="form = { ...form, description: $event }"
        />
      </div>

      <!-- Priority + Due date row -->
      <div class="row">
        <div class="field flex-1">
          <span class="label">
            <Flag :size="12" />
            Prioridade
          </span>
          <div class="prio-row">
            <button
              v-for="p in priorities"
              :key="p.value"
              type="button"
              class="prio-chip"
              :class="{ 'prio-chip--active': Number(form.priorityNumber) === p.value }"
              :style="{ '--prio-c': p.tone } as Record<string, string>"
              @click="emit('update:modelValue', { ...form, priorityNumber: p.value })"
            >
              {{ p.label }}
            </button>
          </div>
        </div>

        <label class="field flex-1">
          <span class="label">
            <CalendarDays :size="12" />
            Entrega
          </span>
          <input v-model="form.dueDate" type="date" class="input" />
        </label>
      </div>

      <!-- Assignees -->
      <div class="field">
        <span class="label">
          <Users :size="12" />
          Responsáveis
          <span v-if="form.assignees?.length" class="label-count">
            {{ form.assignees.length }} selecionado{{ form.assignees.length > 1 ? 's' : '' }}
          </span>
        </span>
        <div v-if="!props.members.length" class="empty-line">
          Nenhum membro disponível nesta empresa.
        </div>
        <div v-else class="members-row">
          <button
            v-for="m in props.members"
            :key="m.user?.id || m.id"
            type="button"
            class="member-chip"
            :class="{ 'member-chip--active': isSelected(m.user?.id || m.id) }"
            :title="m.user?.name || m.name"
            :aria-pressed="isSelected(m.user?.id || m.id)"
            @click="toggleAssignee(m.user?.id || m.id)"
          >
            <span
              class="avatar"
              aria-hidden="true"
              :style="{
                background: `color-mix(in srgb, ${toneOf(m.user?.name || m.name)} 20%, var(--surface-3))`,
                color: `color-mix(in srgb, ${toneOf(m.user?.name || m.name)} 64%, var(--text))`,
              }"
            >
              {{ initials(m.user?.name || m.name) }}
            </span>
            <span class="member-name">{{ m.user?.name || m.name }}</span>
            <Check v-if="isSelected(m.user?.id || m.id)" :size="12" class="member-check" />
          </button>
        </div>
      </div>

      <!-- Tags -->
      <div v-if="companyId" class="field">
        <span class="label">
          <TagIcon :size="12" />
          Tags
        </span>
        <TagInput
          :model-value="form.tags"
          :company-id="companyId"
          @update:model-value="onTagsChange"
        />
      </div>

      <!-- Subtarefas: quebrar em passos na hora de criar, não depois -->
      <div class="field">
        <span class="label">
          <ListChecks :size="12" />
          Subtarefas
          <span v-if="form.subtasks.length" class="label-count">
            {{ form.subtasks.length }}
          </span>
        </span>

        <ul v-if="form.subtasks.length" class="sub-list">
          <li v-for="(step, i) in form.subtasks" :key="i" class="sub-item">
            <span class="sub-index">{{ i + 1 }}</span>
            <input
              class="sub-input"
              :value="step.title"
              :aria-label="`Subtarefa ${i + 1}`"
              @input="updateSubtask(i, ($event.target as HTMLInputElement).value)"
            />
            <!-- Descrição opcional, escondida até ser pedida: a lista precisa
                 continuar rápida para quem só quer enumerar passos. -->
            <button
              type="button"
              class="sub-del press"
              :class="{ 'sub-del--on': descricaoAberta.has(i) || step.description }"
              :aria-label="`Descrição da subtarefa ${i + 1}`"
              :aria-expanded="descricaoAberta.has(i)"
              title="Escrever uma descrição para esta subtarefa"
              @click="toggleDescricao(i)"
            >
              <AlignLeft :size="13" />
            </button>
            <button
              type="button"
              class="sub-del press"
              :aria-label="`Remover subtarefa ${i + 1}`"
              @click="removeSubtask(i)"
            >
              <X :size="13" />
            </button>
            <textarea
              v-if="descricaoAberta.has(i) || step.description"
              class="sub-desc"
              rows="2"
              :value="step.description"
              :aria-label="`Descrição da subtarefa ${i + 1}`"
              placeholder="O que precisa ser feito neste passo?"
              @input="updateSubtaskDescription(i, ($event.target as HTMLTextAreaElement).value)"
            />
          </li>
        </ul>

        <!-- Enter adiciona e mantém o foco: quem está listando passos digita
             vários seguidos, e tirar a mão do teclado a cada item mata o fluxo. -->
        <input
          v-model="subtaskDraft"
          type="text"
          class="input"
          placeholder="Digite um passo e tecle Enter"
          aria-label="Nova subtarefa"
          @keydown.enter.prevent="addSubtask"
        />
        <p class="field-hint">
          Cada passo vira uma subtarefa desta tarefa, na ordem em que você
          escrever.
        </p>
      </div>

      <!--
        Documento em markdown atrás de um portão técnico.
        Quem sobe spec em markdown é quem programa; para o resto do time o campo
        aparecia sempre aberto, sem explicar o que era nem para que servia. O
        rótulo `<dev>` é o sinal de que a seção é opcional e técnica.
      -->
      <div class="field">
        <button
          type="button"
          class="dev-toggle press"
          :aria-expanded="devOpen"
          @click="devOpen = !devOpen"
        >
          <ChevronRight
            :size="13"
            class="dev-chevron"
            :class="{ 'dev-chevron--open': devOpen }"
            aria-hidden="true"
          />
          <code class="dev-tag">&lt;dev&gt;</code>
          <span class="dev-label">Documento técnico em markdown</span>
          <span v-if="hasDoc" class="dev-filled">preenchido</span>
          <span v-else class="dev-optional">opcional</span>
        </button>

        <div v-if="devOpen" class="dev-body">
          <p class="field-hint dev-hint">
            Vira o documento principal da tarefa, legível dentro dela. Serve para
            spec, contrato de API ou passo a passo técnico. Se não for o seu
            caso, pode ignorar.
          </p>
          <input
            v-model="docTitleModel"
            type="text"
            class="input"
            placeholder="Leia primeiro"
            aria-label="Título do documento"
          />
          <textarea
            v-model="docContentModel"
            class="doc-area"
            rows="5"
            spellcheck="false"
            placeholder="# Contexto&#10;&#10;Cole aqui a spec em markdown. Fica como documento principal da tarefa."
            aria-label="Conteúdo do documento em markdown"
          />
          <p class="field-hint">
            Um arquivo .md escolhido abaixo pode preencher este campo ou ficar
            como anexo. Você escolhe.
          </p>
        </div>
      </div>

      <!-- Anexos -->
      <div class="field">
        <span class="label">
          <Paperclip :size="12" />
          Arquivos
        </span>
        <div class="file-row">
          <button type="button" class="file-btn" @click="fileInputRef?.click()">
            <Paperclip :size="13" />
            <span>Selecionar arquivos...</span>
          </button>
          <input
            ref="fileInputRef"
            type="file"
            multiple
            class="file-input"
            @change="onFileChange"
          />
        </div>

        <!-- Markdown: destino à vista, um por linha -->
        <ul v-if="mdPicks.length" class="md-list">
          <li v-for="pick in mdPicks" :key="pick.id" class="md-item">
            <FileText :size="14" class="md-icon" />
            <span class="file-name">{{ pick.file.name }}</span>
            <div class="md-seg" role="group" :aria-label="`Destino de ${pick.file.name}`">
              <button
                type="button"
                class="md-seg-btn"
                :class="{ 'md-seg-btn--on': pick.as === 'doc' }"
                :aria-pressed="pick.as === 'doc'"
                @click="setMarkdownDest(pick, 'doc')"
              >
                Documento
              </button>
              <button
                type="button"
                class="md-seg-btn"
                :class="{ 'md-seg-btn--on': pick.as === 'file' }"
                :aria-pressed="pick.as === 'file'"
                @click="setMarkdownDest(pick, 'file')"
              >
                Anexo
              </button>
            </div>
            <button
              type="button"
              class="file-clear"
              :aria-label="`Remover ${pick.file.name}`"
              @click="removeMarkdownPick(pick)"
            >
              <X :size="12" />
            </button>
          </li>
        </ul>

        <ul v-if="plainAttachments.length" class="file-list">
          <li
            v-for="entry in plainAttachments"
            :key="`${entry.file.name}-${entry.index}`"
          >
            <span class="file-name">{{ entry.file.name }}</span>
            <span class="file-size">{{ formatSize(entry.file.size) }}</span>
            <button
              type="button"
              class="file-clear"
              :aria-label="`Remover ${entry.file.name}`"
              @click="removeFile(entry.index)"
            >
              <X :size="12" />
            </button>
          </li>
        </ul>

        <p v-if="attachmentError" class="field-err">{{ attachmentError }}</p>
        <p v-else-if="mdPicks.length" class="field-hint">
          Até 25 MB por arquivo. Documento fica legível dentro da tarefa; anexo
          fica como arquivo para baixar.
        </p>
        <p v-else class="field-hint">Até 25 MB por arquivo.</p>
      </div>
    </div>

    <!-- Footer -->
    <footer class="foot">
      <span class="foot-hint">⌘ + Enter para criar</span>
      <div class="foot-actions">
        <button
          class="btn btn-ghost"
          type="button"
          :disabled="props.loading"
          @click="emit('close')"
        >
          Cancelar
        </button>
        <button
          class="btn btn-primary"
          type="button"
          :disabled="!valid || props.loading"
          @click="submit"
        >
          <Loader2 v-if="props.loading" :size="13" class="spin" />
          <Plus v-else :size="13" />
          {{ props.loading ? 'Criando…' : 'Criar atividade' }}
        </button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* Sem chrome próprio: o AppDialog (casca) já dá superfície, borda e raio.
   Duplicar aqui virava borda dupla e raio desencontrado dentro do overlay. */
.form-card {
  color: var(--text);
  border-radius: inherit;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  box-shadow: var(--shadow-overlay);
}

/* Head */
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
  gap: 12px;
}

.head-main {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.head-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.head-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
  letter-spacing: -0.01em;
}

.head-sub {
  font-size: 12px;
  color: var(--text-3);
  margin: 2px 0 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text-2);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background var(--motion-fast) var(--motion-ease);
}

.close-btn:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--text);
}

.close-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Body */
.body {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row {
  display: flex;
  gap: 12px;
}

.flex-1 {
  flex: 1;
  min-width: 0;
}

.label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}

.label-count {
  font-size: 9.5px;
  color: var(--text-4);
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: none;
  margin-left: auto;
}

.input {
  width: 100%;
  padding: 9px 11px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text);
  font-family: inherit;
  font-size: 13px;
  outline: none;
  resize: vertical;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    background var(--motion-fast) var(--motion-ease);
}

.input:focus {
  background: var(--surface);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}

.input--title {
  font-size: 14px;
  font-weight: 500;
  min-height: 52px;
}

/* Priority */
.prio-row {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.prio-chip {
  flex: 1;
  min-width: 40px;
  padding: 8px 6px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.prio-chip:hover {
  background: var(--surface-3);
  color: var(--text);
}

.prio-chip--active {
  background: color-mix(in srgb, var(--prio-c) 14%, transparent);
  border-color: var(--prio-c);
  color: var(--prio-c);
}

/* Members */
.members-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  /* Empresa com 20+ membros empurrava Anexo e o rodapé para fora da dobra.
     ~4 fileiras de chips e o resto rola aqui dentro, sem roubar o scroll do
     corpo do diálogo. */
  max-height: 172px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  padding-right: 2px;
}

.empty-line {
  padding: 12px;
  text-align: center;
  background: var(--surface-2);
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-3);
  font-size: 12px;
}

.member-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  /* Alvo de toque de 36px (denso) sem inflar o chip. */
  min-height: 36px;
  max-width: 100%;
  min-width: 0;
  padding: 5px 10px 5px 5px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.member-chip:hover {
  background: var(--surface-3);
  color: var(--text);
}

.member-chip--active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}

.avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--surface-3);
  color: var(--text-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

/* Selecionado NÃO repinta o avatar de acento: o tom é a identidade da pessoa e
   precisa ser o mesmo do board. O estado vem da borda, do fundo e do check. */

.member-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-check {
  color: var(--accent);
  flex-shrink: 0;
}

/* File */
.file-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.file-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 11px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px dashed var(--border);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  text-align: left;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease);
}

.file-btn:hover {
  background: var(--surface-3);
  border-color: var(--border-strong);
  color: var(--text);
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.file-clear {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-3);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background var(--motion-fast) var(--motion-ease);
}

.file-clear:hover {
  background: var(--surface-3);
  color: var(--text);
}

.file-input {
  display: none;
}

.field-err {
  margin: 0;
  font-size: 11.5px;
  color: var(--err);
}

.file-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.file-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 11.5px;
  color: var(--text-2);
}

.file-list .file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  color: var(--text-4);
  font-variant-numeric: tabular-nums;
  flex: none;
}

/* Markdown escolhido: nome + para onde ele vai */
.md-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.md-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: color-mix(in srgb, var(--accent) 6%, var(--surface-2));
  border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
  border-radius: var(--radius-sm);
  font-size: 11.5px;
  color: var(--text-2);
}

.md-icon {
  color: var(--accent);
  flex: none;
}

.md-seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  flex: none;
}

.md-seg-btn {
  padding: 4px 9px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.md-seg-btn:hover {
  color: var(--text);
}

.md-seg-btn--on {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}

.md-seg-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.doc-area {
  width: 100%;
  margin-top: 6px;
  padding: 10px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
}

.doc-area:focus {
  border-color: var(--accent);
}

.doc-area::placeholder {
  color: var(--text-4);
}

/* ─── Subtarefas ─────────────────────────────────────────────────────────── */

.label-count {
  margin-left: 2px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--text-3);
  font-size: 10px;
  font-weight: 700;
}

.sub-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
}

.sub-item {
  display: flex;
  align-items: center;
  gap: 8px;
  /* A descrição desce para a linha de baixo, alinhada com o texto do título. */
  flex-wrap: wrap;
}

.sub-desc {
  flex: 1 0 100%;
  margin: 2px 0 6px 28px;
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.45;
  resize: vertical;
}

.sub-desc:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

/* Marca que a subtarefa JÁ tem descrição escrita. */
.sub-del--on {
  color: var(--accent);
}

.sub-index {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--text-3);
  font-size: 10.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.sub-input {
  flex: 1;
  min-width: 0;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font-family: inherit;
  font-size: 12.5px;
}

.sub-input:focus {
  outline: none;
  border-color: var(--accent);
}

.sub-del {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex: none;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}

.sub-del:hover {
  background: var(--surface-3);
  color: var(--err);
}

/* ─── Portão da seção técnica ────────────────────────────────────────────── */

.dev-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 11px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}

.dev-toggle:hover {
  background: var(--surface-2);
}

.dev-chevron {
  flex: none;
  color: var(--text-3);
  transition: transform var(--motion-fast) var(--motion-ease);
}

.dev-chevron--open {
  transform: rotate(90deg);
}

.dev-tag {
  flex: none;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
}

.dev-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dev-optional,
.dev-filled {
  flex: none;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
}

.dev-optional {
  background: var(--surface-3);
  color: var(--text-4);
}

.dev-filled {
  background: color-mix(in srgb, var(--success) 16%, transparent);
  color: var(--success);
}

.dev-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.dev-hint {
  margin-top: 0;
}

.field-hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-4);
}

/* Footer */
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-top: 1px solid var(--border);
  background: var(--surface);
  gap: 10px;
}

.foot-hint {
  font-size: 11px;
  color: var(--text-4);
}

.foot-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    background var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease),
    filter var(--motion-fast) var(--motion-ease);
}

.btn-ghost {
  background: var(--surface-2);
  border-color: var(--border);
  color: var(--text);
}

.btn-ghost:hover:not(:disabled) {
  background: var(--surface-3);
  border-color: var(--border-strong);
}

.btn-primary {
  background: var(--accent);
  color: var(--accent-fg);
  border-color: color-mix(in srgb, var(--accent) 80%, black);
}

.btn-primary:hover:not(:disabled) {
  filter: brightness(1.06);
}

.btn-primary:disabled,
.btn-ghost:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.spin {
  animation: spin 0.85s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
