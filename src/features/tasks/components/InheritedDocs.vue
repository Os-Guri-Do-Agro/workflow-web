<script setup lang="ts">
/**
 * Documentos do módulo, vistos de dentro da frente.
 *
 * A atividade pai é o módulo e carrega o `Leia-primeiro.md`; a subtarefa é a
 * frente (`(cms)`, `(app)`). Quem está trabalhando na frente precisa do
 * contexto do módulo sem sair da tarefa, mas não deve editá-lo daqui: o
 * documento tem um dono só, e é o pai. Editar é lá, pelo link.
 *
 * Recolhida por padrão: é contexto, não o trabalho da tela.
 */
import { computed, ref, watch } from 'vue'
import { ChevronRight, ExternalLink, FileText, Loader2, Star } from 'lucide-vue-next'
import { useQuery } from '@tanstack/vue-query'
import { renderMarkdown } from '@/composables/useMarkdownRenderer'
import activityService from '@/service/activities/activity-service'
import type { ActivityDoc, ActivityDocMeta } from '../activity-types'
import '@/styles/markdown-doc.css'

const props = withDefaults(
  defineProps<{
    docs: ActivityDocMeta[]
    /** Para o link "Abrir no módulo". */
    parentId?: string | null
    parentTitle?: string | null
    companyId?: string | null
  }>(),
  { parentId: null, parentTitle: null, companyId: null },
)

const emit = defineEmits<{ 'open-parent': [] }>()

const open = ref(false)
const selectedId = ref<string | null>(null)

// O principal do pai vem primeiro (a API ordena por `isPrimary`), e é ele que
// abre por padrão: é o documento de entrada do módulo.
watch(
  () => props.docs,
  (docs) => {
    if (!docs.some((d) => d.id === selectedId.value)) {
      selectedId.value = docs[0]?.id ?? null
    }
  },
  { immediate: true },
)

/**
 * O conteúdo só é buscado quando a seção é expandida. Carregar a spec do
 * módulo ao abrir toda subtarefa seria pagar por um texto que na maioria das
 * vezes ninguém vai ler naquele momento.
 */
const contentQuery = useQuery<ActivityDoc>({
  queryKey: computed(() => ['activity-doc', selectedId.value]),
  queryFn: () =>
    activityService.getDoc(selectedId.value!, props.companyId ?? undefined),
  enabled: computed(() => open.value && !!selectedId.value),
  staleTime: 60_000,
})

const html = computed(() => renderMarkdown(contentQuery.data.value?.content ?? ''))
</script>

<template>
  <section v-if="docs.length" class="inh">
    <button
      type="button"
      class="inh__toggle"
      :aria-expanded="open"
      @click="open = !open"
    >
      <ChevronRight :size="13" class="inh__chev" :class="{ 'inh__chev--on': open }" />
      <FileText :size="12" />
      <span class="inh__label">Do módulo</span>
      <span class="inh__count">{{ docs.length }}</span>
      <span v-if="parentTitle" class="inh__parent">{{ parentTitle }}</span>
    </button>

    <div v-if="open" class="inh__body">
      <div class="inh__bar">
        <div class="inh__tabs" role="tablist" aria-label="Documentos do módulo">
          <button
            v-for="doc in docs"
            :key="doc.id"
            type="button"
            role="tab"
            class="inh__tab"
            :class="{ 'inh__tab--on': doc.id === selectedId }"
            :aria-selected="doc.id === selectedId"
            @click="selectedId = doc.id"
          >
            <Star v-if="doc.isPrimary" :size="10" class="inh__star" />
            {{ doc.title }}
          </button>
        </div>

        <button
          v-if="parentId"
          type="button"
          class="inh__open press"
          @click="emit('open-parent')"
        >
          <ExternalLink :size="12" />
          Abrir no módulo
        </button>
      </div>

      <p class="inh__readonly">Somente leitura. Editar é na tarefa do módulo.</p>

      <div v-if="contentQuery.isLoading.value" class="inh__loading">
        <Loader2 :size="14" class="spin" />
        <span>Carregando...</span>
      </div>

      <!--
        eslint-disable-next-line vue/no-v-html
        Passou por `renderMarkdown` (marked + DOMPurify).
      -->
      <div v-else class="inh__content md-doc" v-html="html" />
    </div>
  </section>
</template>

<style scoped>
.inh {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  overflow: hidden;
}

.inh__toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
  text-align: left;
}

.inh__toggle:hover {
  color: var(--text-2);
}

.inh__toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.inh__chev {
  transition: transform var(--motion-fast) var(--motion-ease);
  flex: none;
}

.inh__chev--on {
  transform: rotate(90deg);
}

.inh__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--text-2);
  font-size: 10px;
  letter-spacing: 0;
}

.inh__parent {
  margin-left: auto;
  color: var(--text-4);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 45%;
}

.inh__body {
  padding: 0 10px 10px;
  border-top: 1px solid var(--border);
}

.inh__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0 4px;
}

.inh__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.inh__tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}

.inh__tab--on {
  background: var(--surface);
  border-color: var(--border);
  color: var(--text);
  font-weight: 600;
}

.inh__star {
  color: var(--accent);
}

.inh__open {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-2);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  flex: none;
}

.inh__open:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.inh__readonly {
  margin: 0 0 8px;
  color: var(--text-4);
  font-size: 10.5px;
}

.inh__loading {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 16px 0;
  color: var(--text-3);
  font-size: 12px;
}

.inh__content {
  max-height: 340px;
  overflow-y: auto;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.spin {
  animation: inh-spin 0.9s linear infinite;
}

@keyframes inh-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
  .inh__chev {
    transition: none;
  }
}
</style>
