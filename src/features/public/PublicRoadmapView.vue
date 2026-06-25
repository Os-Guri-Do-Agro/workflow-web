<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { CalendarDays, Loader2 } from 'lucide-vue-next'
import shareService, { type PublicRoadmapResponse } from '@/service/share/share-service'

const route = useRoute()
const roadmap = ref<PublicRoadmapResponse | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const token = computed(() => String(route.params.token ?? ''))

onMounted(async () => {
  try {
    roadmap.value = await shareService.publicRoadmap(token.value)
  } catch {
    error.value = 'Não foi possível abrir este roadmap público.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="public-page">
    <section v-if="loading" class="state">
      <Loader2 :size="22" class="spin" />
      <span>Carregando roadmap...</span>
    </section>

    <section v-else-if="error" class="state error">
      <CalendarDays :size="24" />
      <strong>{{ error }}</strong>
    </section>

    <template v-else-if="roadmap">
      <header class="hero">
        <span class="eyebrow">Roadmap público</span>
        <h1>Roadmap {{ roadmap.year }}</h1>
        <p>Visualização somente leitura compartilhada pela equipe.</p>
      </header>

      <section class="months-grid">
        <article v-for="month in roadmap.months" :key="month.key" class="month-card">
          <div class="month-head">
            <span>{{ month.key }}</span>
            <small>{{ month.persisted ? 'Planejado' : 'Vazio' }}</small>
          </div>
          <h2>{{ month.title || 'Sem título' }}</h2>
          <p>{{ month.main || 'Sem objetivo principal informado.' }}</p>

          <div v-if="month.focusItems.length" class="block">
            <strong>Focos</strong>
            <ul>
              <li v-for="focus in month.focusItems" :key="focus.id">{{ focus.text }}</li>
            </ul>
          </div>

          <div v-if="month.entries.length" class="block">
            <strong>Agenda</strong>
            <ul>
              <li v-for="entry in month.entries" :key="entry.id">
                <span>{{ entry.date }}</span>
                {{ entry.title }}
              </li>
            </ul>
          </div>
        </article>
      </section>
    </template>
  </main>
</template>

<style scoped>
.public-page {
  min-height: 100vh;
  padding: 32px;
  background: var(--bg);
  color: var(--text);
}

.hero {
  margin: 0 auto 24px;
  max-width: 1120px;
}

.eyebrow {
  color: var(--text-4);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero h1 {
  margin: 8px 0;
  font-size: clamp(32px, 5vw, 56px);
}

.hero p,
.month-card p {
  color: var(--text-2);
}

.months-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
  max-width: 1120px;
  margin: 0 auto;
}

.month-card,
.state {
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: var(--surface);
}

.month-card {
  padding: 18px;
}

.month-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--text-3);
  font-size: 12px;
}

.month-card h2 {
  margin: 10px 0 8px;
  font-size: 20px;
}

.block {
  margin-top: 14px;
}

.block strong {
  font-size: 12px;
  text-transform: uppercase;
  color: var(--text-3);
}

.block ul {
  margin: 8px 0 0;
  padding-left: 18px;
  color: var(--text-2);
}

.block li + li {
  margin-top: 6px;
}

.block li span {
  color: var(--text-3);
  margin-right: 6px;
}

.state {
  display: grid;
  place-items: center;
  gap: 10px;
  min-height: 220px;
  max-width: 520px;
  margin: 15vh auto 0;
  padding: 28px;
  color: var(--text-2);
  text-align: center;
}

.state.error {
  color: var(--err);
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
