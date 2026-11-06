<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Megaphone } from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { MARKETING_ROLE_LABEL } from '@/service/marketing/marketing-core'
import { useMarketing, useMarketingRealtime } from './composables/useMarketing'
import { visibleSections, type MarketingSection } from './marketing-nav'
import { brandTone, toneStyle } from './marketing-labels'
import CreateGroupDialog from './settings/CreateGroupDialog.vue'
import './marketing.css'

/**
 * Moldura da ala Marketing: título, grupo, filtro de marca e as abas das
 * seções. O conteúdo de cada seção é a rota filha (routes.ts).
 *
 * Filtro de marca mora na URL (`?marca=`), e a troca de aba preserva o filtro.
 */
const route = useRoute()
const router = useRouter()
const mk = useMarketing()
useMarketingRealtime()

/**
 * Aviso do sino da ala traz `?grupo=<groupId>` no link: quem está em mais de um
 * grupo abre o card/campanha no grupo certo. Se for grupo da pessoa, vira o
 * grupo ativo; o parâmetro sai da URL (o grupo ativo mora no localStorage).
 * Espera o `/marketing/me` carregar para não descartar o parâmetro antes da hora.
 */
watch(
  () => [route.query.grupo, mk.me.data.value] as const,
  ([grupo, me]) => {
    if (typeof grupo !== 'string' || !me) return
    if (mk.groups.value.some((g) => g.id === grupo)) mk.selectGroup(grupo)
    const query = { ...route.query }
    delete query.grupo
    void router.replace({ query, hash: route.hash })
  },
  { immediate: true },
)

const sections = computed(() => visibleSections(mk.group.value))
const groupsOrdered = computed(() => {
  const order: MarketingSection['group'][] = ['Produção', 'Divulgação', 'Eventos e dinheiro', 'Base']
  return order
    .map((name) => ({ name, items: sections.value.filter((s) => s.group === name) }))
    .filter((g) => g.items.length)
})

function isActive(section: MarketingSection) {
  if (section.key === 'home') return route.name === 'marketing'
  if (section.key === 'approvals' && route.name === 'marketing-card') return true
  return route.name === section.route
}

const brandQuery = computed(() => (mk.brandFilter.value ? { marca: mk.brandFilter.value } : {}))
const loading = computed(() => mk.me.isLoading.value)
/** Admin de alguma empresa sem ala ainda pode criar o grupo (vira Dono). */
const canCreate = computed(() => !!mk.me.data.value?.available && !!mk.me.data.value?.canCreateGroup)
const createOpen = ref(false)
function onCreated(groupId: string) {
  mk.selectGroup(groupId)
}
</script>

<template>
  <div class="mk-layout">
    <div v-if="loading" class="mk-layout__loading">
      <Skeleton type="row" />
      <Skeleton type="block" />
    </div>

    <template v-else-if="!mk.hasAccess.value">
      <EmptyState
        :icon="Megaphone"
        title="Você não está na ala Marketing"
        :description="canCreate
          ? 'A ala é de um grupo de empresas. Peça para o Dono de um grupo incluir você, ou crie um grupo com as empresas que você administra.'
          : 'A ala Marketing é liberada pelo Dono do grupo de empresas. Peça para ele incluir você na equipe.'"
      >
        <template v-if="canCreate" #action>
          <button type="button" class="mk-btn mk-btn--primary" @click="createOpen = true">Criar grupo de empresas</button>
        </template>
      </EmptyState>
      <CreateGroupDialog v-model="createOpen" @created="onCreated" />
    </template>

    <template v-else>
      <header class="mk-layout__head">
        <div class="mk-layout__title">
          <h1>Marketing</h1>
          <select
            v-if="mk.groups.value.length > 1"
            class="mk-select mk-layout__group"
            :value="mk.groupId.value ?? ''"
            aria-label="Grupo de empresas"
            @change="mk.selectGroup(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="g in mk.groups.value" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
          <span v-else class="mk-layout__group-name">{{ mk.group.value?.name }}</span>
          <span class="mk-chip" :title="mk.group.value?.title ?? undefined">
            {{ mk.role.value ? MARKETING_ROLE_LABEL[mk.role.value] : '' }}
          </span>
        </div>

        <div
          v-if="mk.brands.value.length > 1"
          class="mk-layout__brands"
          role="group"
          aria-label="Filtrar por marca"
        >
          <button
            type="button"
            class="mk-layout__brand"
            :class="{ 'is-active': !mk.brandFilter.value }"
            :aria-pressed="!mk.brandFilter.value"
            @click="mk.setBrandFilter(null)"
          >
            Todas as marcas
          </button>
          <button
            v-for="b in mk.brands.value"
            :key="b.companyId"
            type="button"
            class="mk-layout__brand"
            :class="{ 'is-active': mk.brandFilter.value === b.companyId }"
            :aria-pressed="mk.brandFilter.value === b.companyId"
            @click="mk.setBrandFilter(b.companyId)"
          >
            <span class="mk-dot" :style="toneStyle(brandTone(b))" aria-hidden="true" />
            {{ b.name }}
          </button>
        </div>
      </header>

      <nav class="mk-layout__tabs" aria-label="Seções da ala Marketing">
        <template v-for="(grp, gi) in groupsOrdered" :key="grp.name">
          <span v-if="gi > 0" class="mk-layout__sep" aria-hidden="true" />
          <RouterLink
            v-for="s in grp.items"
            :key="s.key"
            :to="{ name: s.route, query: brandQuery }"
            class="mk-tab"
            :class="{ 'is-active': isActive(s) }"
            :aria-current="isActive(s) ? 'page' : undefined"
          >
            <component :is="s.icon" :size="15" aria-hidden="true" />
            <span>{{ s.title }}</span>
          </RouterLink>
        </template>
      </nav>

      <div class="mk-layout__body">
        <RouterView v-slot="{ Component }">
          <component :is="Component" v-if="mk.groupId.value" :key="mk.groupId.value" />
        </RouterView>
      </div>
    </template>
  </div>
</template>

<style scoped>
.mk-layout {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 16px 20px 32px;
}

.mk-layout__loading {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mk-layout__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.mk-layout__title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.mk-layout__title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.mk-layout__group {
  width: auto;
  min-height: 30px;
  padding: 3px 8px;
}

.mk-layout__group-name {
  color: var(--text-3);
  font-size: 13px;
  font-weight: 600;
}

.mk-layout__brands {
  display: flex;
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  overflow-x: auto;
  max-width: 100%;
  scrollbar-width: none;
}

.mk-layout__brand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 0;
  border-radius: calc(var(--radius-sm) - 2px);
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.mk-layout__brand.is-active {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.mk-layout__tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  scrollbar-width: none;
}

.mk-layout__sep {
  flex-shrink: 0;
  width: 1px;
  height: 18px;
  margin: 0 6px;
  background: var(--border);
}

.mk-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 8px 10px;
  border-bottom: 2px solid transparent;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  margin-bottom: -1px;
}

.mk-tab:hover {
  color: var(--text);
}

.mk-tab.is-active {
  border-bottom-color: var(--accent);
  color: var(--accent-ink);
}

.mk-layout__body {
  min-width: 0;
}

@media (max-width: 640px) {
  .mk-layout {
    padding: 12px 12px 24px;
  }

  .mk-tab {
    min-height: 44px;
  }
}
</style>
