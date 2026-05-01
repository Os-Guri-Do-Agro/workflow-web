<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { GitBranch, Loader2, Lock, Users, ChevronRight, Settings } from 'lucide-vue-next'
import repositoryService from '@/service/repository/repository-service'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const { error: showError } = useToast()
const repos = ref<any[]>([])
const loading = ref(true)

const grouped = computed(() => {
  const map: Record<string, { company: { id: string; name: string }; items: any[] }> = {}
  for (const r of repos.value) {
    const cId = r.companyId
    if (!map[cId]) map[cId] = { company: r.company, items: [] }
    map[cId].items.push(r)
  }
  return Object.values(map)
})

onMounted(async () => {
  try {
    const list = await repositoryService.list()
    repos.value = Array.isArray(list) ? list : list?.data || []
  } catch (e: any) {
    showError(e?.response?.data?.message || 'Erro ao listar repositórios')
  } finally {
    loading.value = false
  }
})

const open = (id: string) => router.push(`/repos/${id}`)
const goSettings = () => router.push('/settings')
</script>

<template>
  <div class="page">
    <header class="head">
      <div class="head-left">
        <div class="head-icon"><GitBranch :size="18" /></div>
        <div>
          <h1 class="head-title">Repositórios</h1>
          <p class="head-sub">Navegue, abra arquivos e crie pull requests</p>
        </div>
      </div>
      <button class="btn-link" @click="goSettings">
        <Settings :size="14" />
        <span>Configurar</span>
      </button>
    </header>

    <div v-if="loading" class="state">
      <Loader2 :size="20" class="spin" />
      <span>Carregando…</span>
    </div>

    <div v-else-if="!repos.length" class="state">
      <p>
        Nenhum repositório vinculado. Vá em
        <button class="link" @click="goSettings">Configurações → Repositórios</button>
        e adicione um.
      </p>
    </div>

    <div v-else class="groups">
      <section v-for="g in grouped" :key="g.company.id" class="group">
        <h2 class="group-title">{{ g.company.name }}</h2>
        <ul class="repo-list">
          <li
            v-for="r in g.items"
            :key="r.id"
            class="repo-card"
            @click="open(r.id)"
          >
            <div class="repo-card-icon"><GitBranch :size="16" /></div>
            <div class="repo-card-body">
              <div class="repo-card-name">{{ r.owner }}/{{ r.name }}</div>
              <div class="repo-card-meta">
                <span class="branch">{{ r.defaultBranch }}</span>
                <span class="sep">·</span>
                <span :class="r.visibility === 'TEAM' ? 'vis-team' : 'vis-rest'">
                  <Users v-if="r.visibility === 'TEAM'" :size="11" />
                  <Lock v-else :size="11" />
                  {{ r.visibility === 'TEAM' ? 'Team' : 'Restrito' }}
                </span>
                <span class="sep">·</span>
                <span :class="r.hasToken ? 'tok-yes' : 'tok-no'">
                  {{ r.hasToken ? 'token salvo' : 'sem token' }}
                </span>
              </div>
            </div>
            <ChevronRight :size="14" class="repo-card-arrow" />
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px 28px;
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.head-left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.head-icon {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--accent);
}
.head-title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0;
}
.head-sub {
  font-size: 12.5px;
  color: var(--text-3);
  margin: 0;
}
.btn-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
}
.btn-link:hover {
  border-color: var(--border-strong);
  color: var(--text);
}
.state {
  text-align: center;
  padding: 40px 0;
  color: var(--text-3);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
}
.link {
  background: transparent;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font: inherit;
  text-decoration: underline;
}
.groups {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.group-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
  margin: 0 4px;
}
.repo-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.repo-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition:
    border-color var(--motion-fast),
    background var(--motion-fast);
}
.repo-card:hover {
  border-color: var(--accent);
}
.repo-card-icon {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text-3);
  flex-shrink: 0;
}
.repo-card-body {
  flex: 1;
  min-width: 0;
}
.repo-card-name {
  font-size: 14px;
  font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.repo-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-3);
  margin-top: 3px;
}
.branch {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--text-2);
}
.sep {
  opacity: 0.5;
}
.vis-team {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--text-2);
}
.vis-rest {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #f59e0b;
}
.tok-yes {
  color: #10b981;
}
.tok-no {
  color: var(--text-4);
}
.repo-card-arrow {
  color: var(--text-4);
  flex-shrink: 0;
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
