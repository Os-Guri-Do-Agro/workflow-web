<script setup lang="ts">
/**
 * Lado direito da página do card: detalhes (status, marca, tipo, redes, datas,
 * responsável) e o texto do post (legenda por rede, hashtags, briefing). Quem
 * edita grava ao sair do campo (`patch`, `PATCH /cards/:id`); o Visualizador só
 * lê. O servidor recusa o que não pode (tipo depois de aprovado, data de card
 * publicado) e a frase aparece no toast de quem chamou.
 */
import { computed, ref, watch } from 'vue'
import { CalendarClock, Info, Send } from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import { hasMarketingRole, type MarketingBrand, type MarketingMember } from '@/service/marketing/marketing-core'
import type { MarketingCardDetail, UpdateCardInput } from '@/service/marketing/marketing-cards'
import {
  CARD_KIND_LABEL,
  CARD_NETWORK_LABEL,
  CARD_STATUS_TONE,
  brandTone,
  cardStatusLabel,
  toneStyle,
  type CardKind,
  type CardNetwork,
} from '../../marketing-labels'
import { formatDayTime, formatFull } from '../approvals-meta'
import { labelItems, useSavedSelect } from '../../select-items'
import { spLocalInput, spLocalInputToIso } from '../../calendar/calendar-time'

const props = defineProps<{
  card: MarketingCardDetail
  brand?: MarketingBrand
  members: MarketingMember[]
  canEdit: boolean
}>()

/** `onFail` roda quando a API recusa: o campo que salva sozinho volta ao valor gravado. */
const emit = defineEmits<{ patch: [input: UpdateCardInput, onFail?: () => void] }>()

const KINDS = Object.keys(CARD_KIND_LABEL) as CardKind[]
const NETWORKS = Object.keys(CARD_NETWORK_LABEL) as CardNetwork[]
const APPROVED_ON = ['APPROVED', 'SCHEDULED', 'PUBLISHED', 'SENT_TO_PRINTER', 'PROOF_RECEIVED', 'DELIVERED']

const kindLocked = computed(() => APPROVED_ON.includes(props.card.status))
const isPrint = computed(() => props.card.kind === 'PRINT')

const dueAt = ref('')
const publishAt = ref('')
const captions = ref<Partial<Record<CardNetwork, string>>>({})
const hashtags = ref('')
const briefing = ref('')

/**
 * Valor de cada campo que está "em dia" com o servidor. Campo com valor local
 * diferente disso é edição pendente (a pessoa digitou e ainda não saiu do
 * campo): a atualização do servidor (tempo real, outro campo salvo) não passa
 * por cima dele. Datas no fuso de Brasília.
 */
interface FieldText {
  dueAt: string
  publishAt: string
  captions: Partial<Record<CardNetwork, string>>
  hashtags: string
  briefing: string
}
function serverText(): FieldText {
  return {
    dueAt: spLocalInput(props.card.dueAt),
    publishAt: spLocalInput(props.card.publishAt),
    captions: { ...props.card.captions },
    hashtags: props.card.hashtags.map((h) => `#${h}`).join(' '),
    briefing: props.card.briefing ?? '',
  }
}
let synced: FieldText = serverText()

const same = (s: string) => s
const trimmed = (s: string) => s.trim()
const tags = (s: string) =>
  s
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#+/, '').trim())
    .filter(Boolean)
    .join(' ')

/**
 * Um campo na atualização do servidor. Sem alteração local: recebe o valor
 * novo. Já igual ao novo (só muda espaço ou o "#"): fica como a pessoa
 * escreveu, e conta como em dia. Pendente: fica o que a pessoa digitou.
 */
function mergeField(local: string, prev: string, next: string, norm: (s: string) => string) {
  if (local === prev) return { value: next, synced: next }
  if (norm(local) === norm(next)) return { value: local, synced: local }
  return { value: local, synced: next }
}

/** Troca de card: carrega tudo. */
function loadAll() {
  synced = serverText()
  dueAt.value = synced.dueAt
  publishAt.value = synced.publishAt
  captions.value = { ...synced.captions }
  hashtags.value = synced.hashtags
  briefing.value = synced.briefing
}

/** Mesmo card atualizado: só os campos sem alteração local pendente. */
function loadClean() {
  const next = serverText()
  const prev = synced
  const due = mergeField(dueAt.value, prev.dueAt, next.dueAt, same)
  const pub = mergeField(publishAt.value, prev.publishAt, next.publishAt, same)
  const tag = mergeField(hashtags.value, prev.hashtags, next.hashtags, tags)
  const brief = mergeField(briefing.value, prev.briefing, next.briefing, trimmed)
  dueAt.value = due.value
  publishAt.value = pub.value
  hashtags.value = tag.value
  briefing.value = brief.value

  const caps: Partial<Record<CardNetwork, string>> = {}
  const capsSynced: Partial<Record<CardNetwork, string>> = {}
  const networks = new Set([...Object.keys(next.captions), ...Object.keys(prev.captions), ...Object.keys(captions.value)])
  for (const n of networks as Set<CardNetwork>) {
    const c = mergeField(captions.value[n] ?? '', prev.captions[n] ?? '', next.captions[n] ?? '', trimmed)
    if (c.value) caps[n] = c.value
    if (c.synced) capsSynced[n] = c.synced
  }
  captions.value = caps
  synced = { dueAt: due.synced, publishAt: pub.synced, captions: capsSynced, hashtags: tag.synced, briefing: brief.synced }
}

watch(
  () => [props.card.id, props.card.updatedAt] as const,
  ([id], old) => {
    if (!old || old[0] !== id) loadAll()
    else loadClean()
  },
  { immediate: true },
)

const assignees = computed(() =>
  props.members.filter(
    (m) =>
      hasMarketingRole(m.role, 'EDITOR') &&
      (m.brandIds.length === 0 || m.brandIds.includes(props.card.companyId)),
  ),
)

// Tipo e responsável salvam ao escolher; se a API recusa, voltam ao que estava gravado.
const kindItems = labelItems(KINDS, CARD_KIND_LABEL)
const kindField = useSavedSelect(() => props.card.kind)
function pickKind(value: unknown) {
  if (typeof value !== 'string' || !kindField.pick(value)) return
  emit('patch', { kind: value as CardKind }, () => kindField.revert())
}

const assigneeField = useSavedSelect(() => props.card.assignee?.id ?? '')
const assigneeItems = computed(() => {
  const items = [{ label: 'Sem responsável', value: '' }, ...assignees.value.map((m) => ({ label: m.name, value: m.userId }))]
  const current = props.card.assignee
  // Quem já é o responsável continua na lista mesmo sem ser mais Editor da marca.
  if (current && !items.some((i) => i.value === current.id)) items.push({ label: current.name, value: current.id })
  return items
})
function pickAssignee(value: unknown) {
  if (typeof value !== 'string' || !assigneeField.pick(value)) return
  emit('patch', { assigneeId: value || null }, () => assigneeField.revert())
}

function toggleNetwork(n: CardNetwork) {
  const list = props.card.networks.includes(n) ? props.card.networks.filter((x) => x !== n) : [...props.card.networks, n]
  emit('patch', { networks: list })
}

function saveDate(field: 'dueAt' | 'publishAt', value: string) {
  const iso = spLocalInputToIso(value)
  const before = props.card[field]
  if ((iso ? new Date(iso).getTime() : null) === (before ? new Date(before).getTime() : null)) return
  emit('patch', { [field]: iso })
}

function saveCaption() {
  const clean: Partial<Record<CardNetwork, string>> = {}
  for (const [k, v] of Object.entries(captions.value)) if (v?.trim()) clean[k as CardNetwork] = v.trim()
  if (JSON.stringify(clean) === JSON.stringify(props.card.captions ?? {})) return
  emit('patch', { captions: clean })
}

function saveHashtags() {
  const list = hashtags.value
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#+/, '').trim())
    .filter(Boolean)
  if (list.join() === props.card.hashtags.join()) return
  emit('patch', { hashtags: list })
}

function saveBriefing() {
  const text = briefing.value.trim()
  if (text === (props.card.briefing ?? '')) return
  emit('patch', { briefing: text || null })
}

const captionNetworks = computed(() => props.card.networks)
</script>

<template>
  <section class="mk-panel mkf" aria-labelledby="mkf-title">
    <header class="mk-panel__head">
      <Info :size="15" aria-hidden="true" />
      <h2 id="mkf-title" class="mkf__title">Detalhes</h2>
    </header>
    <dl class="mkf__grid">
      <dt>Status</dt>
      <dd>
        <span class="mk-chip" data-tone :style="toneStyle(CARD_STATUS_TONE[card.status])" data-testid="card-status">
          {{ cardStatusLabel(card.status, card.kind) }}
        </span>
      </dd>

      <dt>Marca</dt>
      <dd class="mkf__inline">
        <span class="mk-dot" :style="toneStyle(brandTone(brand))" aria-hidden="true" />
        {{ brand?.name ?? 'Marca' }}
      </dd>

      <dt>Tipo</dt>
      <dd>
        <div v-if="canEdit && !kindLocked" class="mkf__sel" data-testid="card-kind">
          <AppSelect
            :model-value="kindField.shown.value"
            :items="kindItems"
            label="Tipo"
            density="compact"
            @update:model-value="pickKind"
          />
        </div>
        <span v-else :title="kindLocked ? 'O tipo só muda antes da aprovação' : undefined">{{ CARD_KIND_LABEL[card.kind] }}</span>
      </dd>

      <template v-if="!isPrint">
        <dt>Redes</dt>
        <dd>
          <div v-if="canEdit" class="mkf__chips">
            <button
              v-for="n in NETWORKS"
              :key="n"
              type="button"
              class="mkf__chip"
              :class="{ 'is-on': card.networks.includes(n) }"
              :aria-pressed="card.networks.includes(n)"
              @click="toggleNetwork(n)"
            >
              {{ CARD_NETWORK_LABEL[n] }}
            </button>
          </div>
          <span v-else>{{ card.networks.map((n) => CARD_NETWORK_LABEL[n]).join(', ') || 'Nenhuma' }}</span>
        </dd>
      </template>

      <dt><label for="mkf-due">Prazo</label></dt>
      <dd>
        <input
          v-if="canEdit"
          id="mkf-due"
          v-model="dueAt"
          type="datetime-local"
          class="mk-input mkf__date"
          :class="{ 'mk-late': card.overdue }"
          @change="saveDate('dueAt', dueAt)"
        />
        <span v-else-if="card.dueAt" :class="{ 'mk-late': card.overdue }">{{ formatDayTime(card.dueAt) }}</span>
        <span v-else class="mkf__none">Sem prazo</span>
        <span v-if="card.overdue" class="mkf__late-note mk-late">Prazo vencido</span>
      </dd>

      <dt><label for="mkf-pub">Publicação</label></dt>
      <dd>
        <input
          v-if="canEdit && card.status !== 'PUBLISHED'"
          id="mkf-pub"
          v-model="publishAt"
          type="datetime-local"
          class="mk-input mkf__date"
          @change="saveDate('publishAt', publishAt)"
        />
        <span v-else-if="card.publishAt">{{ formatDayTime(card.publishAt) }}</span>
        <span v-else class="mkf__none">Sem data</span>
      </dd>

      <dt>Responsável</dt>
      <dd>
        <div v-if="canEdit" class="mkf__sel" data-testid="card-assignee">
          <AppSelect
            :model-value="assigneeField.shown.value"
            :items="assigneeItems"
            label="Responsável"
            density="compact"
            @update:model-value="pickAssignee"
          />
        </div>
        <span v-else-if="card.assignee" class="mkf__inline">
          <PersonAvatar :id="card.assignee.id" :name="card.assignee.name" :size="20" decorative />
          {{ card.assignee.name }}
        </span>
        <span v-else class="mkf__none">Sem responsável</span>
      </dd>

      <template v-if="card.campaign">
        <dt>Campanha</dt>
        <dd>
          <RouterLink
            class="mkf__link"
            :to="{ name: 'marketing-campaigns', query: { campanha: card.campaign.id } }"
            data-testid="card-campaign-link"
          >
            {{ card.campaign.name }}
          </RouterLink>
        </dd>
      </template>

      <template v-if="card.approvalValid && card.approvedBy">
        <dt>Aprovado</dt>
        <dd class="mkf__inline" :title="card.approvedAt ? formatFull(card.approvedAt) : undefined">
          <PersonAvatar :id="card.approvedBy.id" :name="card.approvedBy.name" :size="20" decorative />
          {{ card.approvedBy.name }}<template v-if="card.approvedAt">, {{ formatDayTime(card.approvedAt) }}</template>
        </dd>
      </template>

      <template v-if="card.publishedAt">
        <dt>Publicado</dt>
        <dd class="mkf__inline"><Send :size="13" aria-hidden="true" /> {{ formatDayTime(card.publishedAt) }}</dd>
      </template>

      <template v-if="card.createdBy">
        <dt>Criado por</dt>
        <dd class="mkf__inline mkf__muted">
          <CalendarClock :size="13" aria-hidden="true" /> {{ card.createdBy.name }}, {{ formatDayTime(card.createdAt) }}
        </dd>
      </template>
    </dl>
  </section>

  <section v-if="!isPrint" class="mk-panel mkf" aria-labelledby="mkf-text">
    <header class="mk-panel__head">
      <h2 id="mkf-text" class="mkf__title">Texto do post</h2>
    </header>
    <div class="mk-panel__body mkf__text">
      <template v-if="captionNetworks.length">
        <label v-for="n in captionNetworks" :key="n" class="mk-field">
          <span class="mk-label">Legenda {{ CARD_NETWORK_LABEL[n] }}</span>
          <textarea
            v-if="canEdit"
            v-model="captions[n]"
            class="mk-textarea"
            rows="3"
            maxlength="5000"
            :name="`caption-${n}`"
            @blur="saveCaption"
          />
          <p v-else class="mkf__read">{{ card.captions[n] || 'Sem legenda' }}</p>
        </label>
      </template>
      <p v-else class="mk-hint">Escolha as redes para escrever a legenda de cada uma.</p>

      <label class="mk-field">
        <span class="mk-label">Hashtags</span>
        <input
          v-if="canEdit"
          v-model="hashtags"
          class="mk-input"
          name="hashtags"
          placeholder="#pets #cuidado"
          @blur="saveHashtags"
        />
        <p v-else class="mkf__read">{{ card.hashtags.map((h) => `#${h}`).join(' ') || 'Sem hashtags' }}</p>
      </label>
    </div>
  </section>

  <section class="mk-panel mkf" aria-labelledby="mkf-brief">
    <header class="mk-panel__head">
      <h2 id="mkf-brief" class="mkf__title">Briefing</h2>
    </header>
    <div class="mk-panel__body">
      <textarea
        v-if="canEdit"
        v-model="briefing"
        class="mk-textarea"
        rows="3"
        maxlength="20000"
        name="briefing"
        aria-labelledby="mkf-brief"
        placeholder="Objetivo, referências, o que não pode faltar"
        @blur="saveBriefing"
      />
      <p v-else class="mkf__read">{{ card.briefing || 'Sem briefing' }}</p>
    </div>
  </section>
</template>

<style scoped>
.mkf__title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
}

.mkf__grid {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 8px 10px;
  margin: 0;
  padding: 12px 14px;
  font-size: 13px;
}

.mkf__grid dt {
  padding-top: 6px;
  color: var(--text-3);
  font-weight: 600;
  font-size: 12px;
}

.mkf__grid dd {
  margin: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  min-height: 30px;
}

.mkf__inline,
.mkf__grid dd.mkf__inline {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
}

.mkf__muted {
  color: var(--text-2);
  font-size: 12.5px;
}

.mkf__sel {
  width: 100%;
}

.mkf__sel :deep(.app-select__trigger) {
  min-height: 30px;
}

.mkf__date {
  width: 100%;
  min-height: 30px;
  padding: 4px 8px;
}

.mkf__date.mk-late {
  border-color: color-mix(in srgb, var(--due-late) 50%, var(--border));
}

.mkf__late-note {
  font-size: 12px;
  margin-top: 2px;
}

.mkf__none {
  color: var(--text-3);
}

.mkf__link {
  color: var(--accent-ink);
  font-weight: 600;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.mkf__link:hover {
  text-decoration: underline;
}

.mkf__link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}

.mkf__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.mkf__chip {
  min-height: 26px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-3);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.mkf__chip.is-on {
  border-color: transparent;
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.mkf__chip:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.mkf__text {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mkf__read {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--text);
}

@media (max-width: 640px) {
  .mkf__sel :deep(.app-select__trigger),
  .mkf__date {
    min-height: 44px;
  }

  .mkf__chip {
    min-height: 40px;
    padding: 2px 12px;
  }
}
</style>
