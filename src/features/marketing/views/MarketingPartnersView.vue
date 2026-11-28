<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlarmClock, MessageCircle, Plus, Search, Users } from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import type { PartnerKind, PartnerStatus } from '@/service/marketing/marketing-partners'
import { useMarketing } from '../composables/useMarketing'
import { brandTone, toneStyle } from '../marketing-labels'
import { asText, labelItems } from '../select-items'
import PartnerFormDialog from '../partners/PartnerFormDialog.vue'
import PartnerPanel from '../partners/PartnerPanel.vue'
import {
  formatDay,
  PARTNER_KIND_LABEL,
  PARTNER_KINDS,
  PARTNER_STATUS_LABEL,
  PARTNER_STATUS_TONE,
  PARTNER_STATUSES,
  sinceLabel,
  stepState,
} from '../partners/partner-meta'
import { usePartnersList } from '../partners/usePartners'

/**
 * Parceiros e orçamentos. Tabela densa e painel pela URL `?parceiro=<id>`.
 * Filtros na URL: `?q=`, `?situacao=`, `?tipo=`, `?vencidos=1`; a marca vem do
 * `?marca=` do layout.
 */
const mk = useMarketing()
const route = useRoute()
const router = useRouter()

const groupId = computed(() => mk.groupId.value!)
const openId = computed(() => (typeof route.query.parceiro === 'string' ? route.query.parceiro : null))
const status = computed(() => {
  const v = route.query.situacao
  return typeof v === 'string' && (PARTNER_STATUSES as string[]).includes(v) ? (v as PartnerStatus) : ''
})
const kind = computed(() => {
  const v = route.query.tipo
  return typeof v === 'string' && (PARTNER_KINDS as string[]).includes(v) ? (v as PartnerKind) : ''
})
const dueOnly = computed(() => route.query.vencidos === '1')

const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
let searchTimer: ReturnType<typeof setTimeout> | undefined
function onSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => setQuery({ q: search.value.trim() || null }), 250)
}

function setQuery(patch: Record<string, string | null>) {
  const query = { ...route.query }
  for (const [key, value] of Object.entries(patch)) {
    if (value) query[key] = value
    else delete query[key]
  }
  void router.replace({ query })
}

const listQuery = usePartnersList(
  () => mk.groupId.value,
  () => ({
    companyId: mk.brandFilter.value,
    status: status.value,
    kind: kind.value,
    q: typeof route.query.q === 'string' ? route.query.q : '',
    nextStepDue: dueOnly.value,
  }),
)
const rows = computed(() => listQuery.data.value ?? [])
const multiBrand = computed(() => mk.brands.value.length > 1)
const filtered = computed(() => !!(status.value || kind.value || dueOnly.value || route.query.q))

function open(id: string) {
  setQuery({ parceiro: id })
}
function close() {
  setQuery({ parceiro: null })
}

const statusItems = labelItems(PARTNER_STATUSES, PARTNER_STATUS_LABEL, 'Todas as situações')
const kindItems = labelItems(PARTNER_KINDS, PARTNER_KIND_LABEL, 'Todos os tipos')

const formOpen = ref(false)
function onSaved(saved: { id: string }) {
  open(saved.id)
}
</script>

<template>
  <div class="mk-page pv" :class="{ 'is-split': !!openId }">
    <div class="pv__list">
      <div class="mk-toolbar">
        <div class="pv__search">
          <Search :size="14" aria-hidden="true" />
          <input
            v-model="search"
            type="search"
            class="mk-input pv__search-input"
            placeholder="Buscar por nome, contato ou cidade"
            aria-label="Buscar parceiro"
            autocomplete="off"
            @input="onSearch"
          />
        </div>
        <div class="pv__filter" data-filter="situacao">
          <AppSelect
            :model-value="status"
            :items="statusItems"
            label="Filtrar por situação"
            density="compact"
            @update:model-value="setQuery({ situacao: asText($event) || null })"
          />
        </div>
        <div class="pv__filter" data-filter="tipo">
          <AppSelect
            :model-value="kind"
            :items="kindItems"
            label="Filtrar por tipo"
            density="compact"
            @update:model-value="setQuery({ tipo: asText($event) || null })"
          />
        </div>
        <button
          type="button"
          class="mk-btn pv__due"
          :class="{ 'is-on': dueOnly }"
          :aria-pressed="dueOnly"
          @click="setQuery({ vencidos: dueOnly ? null : '1' })"
        >
          <AlarmClock :size="14" aria-hidden="true" />
          Próximo passo vencido
        </button>
        <span class="mk-toolbar__spacer" />
        <button v-if="mk.can('EDITOR')" type="button" class="mk-btn mk-btn--primary" @click="formOpen = true">
          <Plus :size="14" aria-hidden="true" />
          Novo parceiro
        </button>
      </div>

      <div v-if="listQuery.isLoading.value" class="pv__loading"><Skeleton type="block" height="160px" /></div>
      <p v-else-if="listQuery.isError.value" class="mk-error" role="alert">Não foi possível carregar os parceiros.</p>

      <EmptyState
        v-else-if="!rows.length"
        :icon="Users"
        :title="filtered ? 'Nenhum parceiro com esses filtros' : 'Nenhum parceiro cadastrado'"
        :description="
          filtered
            ? 'Tire um filtro ou mude a busca para ver mais.'
            : 'Cadastre clínicas, pet shops, influenciadores e fornecedores com o contato, o histórico de conversas e o próximo passo.'
        "
      >
        <template v-if="mk.can('EDITOR') && !filtered" #action>
          <button type="button" class="mk-btn mk-btn--primary" @click="formOpen = true">
            <Plus :size="14" aria-hidden="true" />
            Novo parceiro
          </button>
        </template>
      </EmptyState>

      <div v-else class="mk-panel pv__table-wrap">
        <table class="mk-table pv__table">
          <thead>
            <tr>
              <th scope="col">Parceiro</th>
              <th scope="col" class="pv__opt">Tipo</th>
              <th v-if="multiBrand" scope="col" class="pv__opt">Marca</th>
              <th scope="col">Situação</th>
              <th scope="col" class="pv__opt">Contato</th>
              <th scope="col" class="pv__opt">Último contato</th>
              <th scope="col">Próximo passo</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in rows" :key="p.id" class="pv__row" :class="{ 'is-open': p.id === openId }" @click="open(p.id)">
              <td class="pv__name">
                <RouterLink class="pv__link" :to="{ query: { ...route.query, parceiro: p.id } }" @click.stop>
                  {{ p.name }}
                </RouterLink>
                <small v-if="p.city" class="pv__sub">{{ p.city }}</small>
              </td>
              <td class="pv__opt">{{ PARTNER_KIND_LABEL[p.kind] }}</td>
              <td v-if="multiBrand" class="pv__opt">
                <span v-if="p.companyId" class="pv__brand">
                  <span class="mk-dot" :style="toneStyle(brandTone(mk.brandById(p.companyId)))" aria-hidden="true" />
                  {{ mk.brandById(p.companyId)?.name }}
                </span>
                <span v-else class="pv__sub">Todas</span>
              </td>
              <td class="pv__status">
                <span class="mk-chip" data-tone :style="toneStyle(PARTNER_STATUS_TONE[p.status])">
                  {{ PARTNER_STATUS_LABEL[p.status] }}
                </span>
              </td>
              <td class="pv__opt">
                <span class="pv__contact">
                  <span>{{ p.contactName }}</span>
                  <a
                    v-if="p.whatsappUrl"
                    class="pv__wa"
                    :href="p.whatsappUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    :aria-label="`Abrir o WhatsApp de ${p.name}`"
                    title="Abrir o WhatsApp"
                    @click.stop
                  >
                    <MessageCircle :size="14" aria-hidden="true" />
                  </a>
                </span>
              </td>
              <td class="pv__opt pv__since">{{ p.lastContactAt ? sinceLabel(p.lastContactAt) : 'nunca' }}</td>
              <td class="pv__step">
                <template v-if="p.nextStep || p.nextStepAt">
                  <span>{{ p.nextStep }}</span>
                  <small
                    v-if="p.nextStepAt"
                    :class="{ 'mk-late': stepState(p.nextStepAt) === 'late', 'mk-soon': stepState(p.nextStepAt) === 'today' }"
                  >
                    {{ formatDay(p.nextStepAt) }}
                  </small>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <PartnerPanel
      v-if="openId"
      :key="openId"
      class="pv__panel"
      :group-id="groupId"
      :partner-id="openId"
      @close="close"
      @deleted="close"
    />

    <PartnerFormDialog v-model="formOpen" :group-id="groupId" @saved="onSaved" />
  </div>
</template>

<style scoped>
.pv {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 14px;
}

.pv.is-split {
  grid-template-columns: minmax(0, 1fr) minmax(420px, 520px);
}

.pv__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.pv__panel {
  position: sticky;
  top: 8px;
}

.pv__search {
  position: relative;
  flex: 1 1 220px;
  max-width: 340px;
  min-width: 0;
}

.pv__search svg {
  position: absolute;
  top: 50%;
  left: 10px;
  transform: translateY(-50%);
  color: var(--text-3);
  pointer-events: none;
}

.pv__search-input {
  padding-left: 30px;
}

.pv__filter {
  min-width: 170px;
}

.pv__due.is-on {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.pv__table-wrap {
  overflow-x: auto;
}

.pv__row {
  cursor: pointer;
}

.pv__row.is-open {
  background: var(--accent-soft);
}

.pv__name,
.pv__step {
  min-width: 140px;
}

.pv__name,
.pv__step {
  vertical-align: middle;
}

.pv__name > *,
.pv__step > * {
  display: block;
}

.pv__link {
  color: var(--text);
  font-weight: 600;
  text-decoration: none;
}

.pv__link:hover {
  color: var(--accent-ink);
  text-decoration: underline;
}

.pv__sub {
  color: var(--text-3);
  font-size: 12px;
}

.pv__brand {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.pv__contact {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.pv__wa {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--success);
  text-decoration: none;
}

.pv__wa:hover {
  background: var(--surface-2);
  border-color: var(--border-strong);
}

.pv__since {
  white-space: nowrap;
  color: var(--text-2);
}

.pv__step small {
  font-size: 12px;
  color: var(--text-3);
}

.pv__step small.mk-late,
.pv__step small.mk-soon {
  font-weight: 600;
}

.pv__step small.mk-late {
  color: var(--due-late);
}

.pv__step small.mk-soon {
  color: var(--due-soon);
}

@media (max-width: 1100px) {
  .pv.is-split {
    grid-template-columns: minmax(0, 1fr);
  }

  .pv.is-split .pv__list {
    display: none;
  }

  .pv__panel {
    position: static;
  }
}

.pv.is-split .pv__opt {
  display: none;
}

/* Celular: a tabela vira lista (nome e situação em cima, próximo passo embaixo). */
@media (max-width: 760px) {
  .pv__opt {
    display: none;
  }

  .pv__table-wrap {
    overflow-x: visible;
  }

  .pv__table,
  .pv__table tbody {
    display: block;
  }

  .pv__table thead {
    display: none;
  }

  .pv__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'name status'
      'step step';
    gap: 0 10px;
    padding: 6px 12px 10px;
    border-bottom: 1px solid var(--border);
  }

  .pv__row:last-child {
    border-bottom: 0;
  }

  .pv__row td {
    display: block;
    padding: 0;
    border: 0;
  }

  .pv__row td.pv__opt {
    display: none;
  }

  .pv__name {
    grid-area: name;
    min-width: 0;
  }

  .pv__status {
    grid-area: status;
    align-self: center;
  }

  .pv__step {
    grid-area: step;
    min-width: 0;
    font-size: 12px;
    color: var(--text-2);
  }

  .pv__step > * {
    display: inline;
    margin-right: 6px;
  }

  .pv__link {
    display: flex;
    align-items: center;
    min-height: 44px;
  }

  .pv__search {
    flex: 1 1 100%;
    max-width: none;
  }

  .pv__filter {
    flex: 1 1 130px;
    min-width: 0;
  }

  .mk-toolbar__spacer {
    display: none;
  }

  .pv__due,
  .pv__list .mk-btn--primary {
    flex: 1 1 100%;
  }
}
</style>
