<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Megaphone } from 'lucide-vue-next'
import AppSelect from '@/components/ui/AppSelect.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import { MARKETING_ROLE_LABEL } from '@/service/marketing/marketing-core'
import { useMarketing, useMarketingRealtime } from './composables/useMarketing'
import { sectionPlacement, visibleSections, type MarketingSection } from './marketing-nav'
import { brandTone, toneStyle } from './marketing-labels'
import { asText, selectItems } from './select-items'
import CreateGroupDialog from './settings/CreateGroupDialog.vue'
import UploadTray from './uploads/UploadTray.vue'
import { swallowStrayDrop } from './uploads/file-sources'
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

/**
 * Troca de grupo pelo seletor: a URL volta limpa. Filtro, item aberto
 * (`?utm=`, `?item=`, `?ativacao=`...), pasta e a marca são do grupo anterior
 * e abririam vazio ou errado no novo. O card aberto em página própria é do
 * grupo anterior: volta para a lista de Aprovação.
 */
const groupItems = computed(() => selectItems(mk.groups.value, (g) => g.id, (g) => g.name))

function switchGroup(id: string) {
  if (!id || id === mk.groupId.value) return
  mk.selectGroup(id)
  const name = route.name === 'marketing-card' ? 'marketing-approvals' : (route.name ?? 'marketing')
  void router.replace({ name, query: {} })
}

/*
 * Arquivo solto fora de uma área de envio (as abas, a margem, a barra de cima)
 * faria o navegador abrir o arquivo e sair da ala, perdendo a fila de envio.
 * Vale para a ala inteira; as áreas de verdade tratam o drop antes.
 */
onMounted(() => {
  document.addEventListener('dragover', swallowStrayDrop)
  document.addEventListener('drop', swallowStrayDrop)
})
onBeforeUnmount(() => {
  document.removeEventListener('dragover', swallowStrayDrop)
  document.removeEventListener('drop', swallowStrayDrop)
})

/*
 * Abas que não cabem (1024 px com o menu lateral) rolam na horizontal: a
 * borda que esconde aba ganha um esmaecido, e a aba ativa entra à vista.
 */
const tabsEl = ref<HTMLElement | null>(null)
const tabsEdge = ref({ start: false, end: false })
function measureTabs() {
  const el = tabsEl.value
  if (!el) return
  tabsEdge.value = {
    start: el.scrollLeft > 2,
    end: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
  }
}
function revealActiveTab() {
  const el = tabsEl.value?.querySelector<HTMLElement>('.mk-tab.is-active')
  el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  measureTabs()
}
let tabsObserver: ResizeObserver | null = null
onMounted(() => {
  tabsObserver = new ResizeObserver(measureTabs)
  if (tabsEl.value) tabsObserver.observe(tabsEl.value)
  void nextTick(revealActiveTab)
})
watch(tabsEl, (el, old) => {
  if (old) tabsObserver?.unobserve(old)
  if (el) {
    tabsObserver?.observe(el)
    void nextTick(revealActiveTab)
  }
})
watch(() => route.name, () => void nextTick(revealActiveTab))
onBeforeUnmount(() => tabsObserver?.disconnect())

const sections = computed(() => visibleSections(mk.group.value))
/** A fita: só as seções do dia a dia (`placement` = tabs). */
const tabSections = computed(() => sections.value.filter((s) => sectionPlacement(s) === 'tabs'))
/** Atalhos do cabeçalho (Meus avisos, Lixeira, Configurações), na ordem da lista. */
const headerSections = computed(() => sections.value.filter((s) => sectionPlacement(s) === 'header'))
const groupsOrdered = computed(() => {
  const order: MarketingSection['group'][] = ['Produção', 'Divulgação', 'Eventos e dinheiro', 'Base']
  return order
    .map((name) => ({ name, items: tabSections.value.filter((s) => s.group === name) }))
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
        <div class="mk-layout__lead">
          <div class="mk-layout__title">
            <h1>Marketing</h1>
            <div v-if="mk.groups.value.length > 1" class="mk-layout__group" data-testid="group-switch">
              <AppSelect
                :model-value="mk.groupId.value ?? ''"
                :items="groupItems"
                label="Grupo de empresas"
                density="compact"
                @update:model-value="switchGroup(asText($event))"
              />
            </div>
            <span v-else class="mk-layout__group-name">{{ mk.group.value?.name }}</span>
            <span class="mk-chip" :title="mk.group.value?.title ?? undefined">
              {{ mk.role.value ? MARKETING_ROLE_LABEL[mk.role.value] : '' }}
            </span>
          </div>
          <!--
            Atalhos do cabeçalho (`placement: 'header'` em marketing-nav.ts): o
            que não é do dia a dia sai da fita. Ícone e rótulo; no celular só o
            ícone, com o nome no `aria-label` e a dica no `title`.
          -->
          <nav class="mk-layout__tools" aria-label="Atalhos da ala">
            <RouterLink
              v-for="s in headerSections"
              :key="s.key"
              :to="{ name: s.route, query: brandQuery }"
              class="mk-layout__tool"
              :class="{ 'is-active': isActive(s) }"
              :aria-current="isActive(s) ? 'page' : undefined"
              :data-testid="`header-link-${s.key}`"
              :title="s.hint ?? s.title"
              :aria-label="s.title"
            >
              <component :is="s.icon" :size="14" aria-hidden="true" />
              <span class="mk-layout__tool-label">{{ s.title }}</span>
            </RouterLink>
          </nav>
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

      <nav
        ref="tabsEl"
        class="mk-layout__tabs"
        :class="{ 'is-cut-start': tabsEdge.start, 'is-cut-end': tabsEdge.end }"
        aria-label="Seções da ala Marketing"
        @scroll.passive="measureTabs"
      >
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
            <component :is="s.icon" :size="14" aria-hidden="true" />
            <span>{{ s.title }}</span>
          </RouterLink>
        </template>
      </nav>

      <div class="mk-layout__body">
        <RouterView v-slot="{ Component }">
          <component :is="Component" v-if="mk.groupId.value" :key="mk.groupId.value" />
        </RouterView>
      </div>
      <!-- Bandeja "Envios" (R1, D4): a fila é global e segue subindo na troca de tela -->
      <UploadTray />
    </template>
  </div>
</template>

<style scoped>
.mk-layout {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  /* Fim da página acima da bandeja "Envios" (ela publica a altura em
     --mkt-tray-space): a última fileira e o "Carregar mais" ficam à vista. */
  padding: 16px 20px calc(32px + var(--mkt-tray-space, 0px));
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

/* Título e atalhos juntos à esquerda; o filtro de marca fica na outra ponta. */
.mk-layout__lead {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 0 1 auto;
}

.mk-layout__title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 0 1 auto;
}

.mk-layout__title > * {
  min-width: 0;
}

/* O papel não corta ("Visualizador" inteiro); quem encolhe é o nome do grupo. */
.mk-layout__title > .mk-chip {
  flex-shrink: 0;
}

.mk-layout__title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.mk-layout__group {
  min-width: 150px;
  max-width: 260px;
}

.mk-layout__group :deep(.app-select__trigger) {
  min-height: 30px;
}

.mk-layout__group-name {
  overflow: hidden;
  color: var(--text-3);
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mk-layout__tools {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.mk-layout__tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.mk-layout__tool:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.mk-layout__tool:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.mk-layout__tool.is-active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-ink);
}

.mk-layout__brands {
  display: flex;
  /* Encolhe e rola (a barra de rolagem fica escondida; o arrasto e a roda andam). */
  flex: 0 1 auto;
  min-width: 0;
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

/*
 * A fita de 13 abas cabe em 1440 px com o menu lateral (1152 px úteis): sem
 * vão entre as abas (o respiro é o padding de cada uma), ícone de 14px e
 * separador de 9px. Mais estreito que isso, rola com o esmaecido.
 */
.mk-layout__tabs {
  display: flex;
  align-items: center;
  gap: 0;
  min-width: 0;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}

.mk-layout__tabs::-webkit-scrollbar {
  display: none;
}

/* Tem aba escondida para o lado: a borda esmaece (dá para rolar). */
.mk-layout__tabs.is-cut-end {
  mask-image: linear-gradient(to right, #000 calc(100% - 40px), transparent);
}

.mk-layout__tabs.is-cut-start {
  mask-image: linear-gradient(to right, transparent, #000 40px);
}

.mk-layout__tabs.is-cut-start.is-cut-end {
  mask-image: linear-gradient(to right, transparent, #000 40px, #000 calc(100% - 40px), transparent);
}

.mk-layout__sep {
  flex-shrink: 0;
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--border);
}

.mk-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 8px 7px;
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
    padding: 12px 12px calc(24px + var(--mkt-tray-space, 0px));
  }

  .mk-tab {
    min-height: 44px;
  }

  /*
   * No celular os atalhos viram só o ícone, com alvo de 44px. Sem espaço ao
   * lado do papel, descem para a linha de baixo, à direita (o nome do grupo e
   * o papel ficam inteiros; nada é cortado).
   */
  .mk-layout__lead {
    flex-wrap: wrap;
    row-gap: 6px;
  }

  .mk-layout__tools {
    margin-left: auto;
  }

  .mk-layout__tool {
    min-width: 44px;
    min-height: 44px;
    padding: 0;
  }

  .mk-layout__tool-label {
    display: none;
  }

  .mk-layout__group :deep(.app-select__trigger) {
    min-height: 44px;
  }
}
</style>
