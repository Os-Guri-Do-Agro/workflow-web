<script setup lang="ts">
/**
 * Encurtador de URL para campanha (UTM).
 * Spec: workflow-api/docs/specs/2026/q3/q3-2/encurtador-utm.md
 *
 * ## A regra que define esta tela
 *
 * Quem monta a URL final é o SERVIDOR, e ela volta pronta em `finalUrl`. Esta
 * tela nunca concatena `?utm_source=` na mão. Se remontasse aqui, existiriam
 * duas implementações da mesma regra, e a hora de descobrir que discordam seria
 * depois de o link já ter sido divulgado.
 *
 * O preview antes de criar é a única exceção, e é honesto sobre isso: é uma
 * PRÉVIA local, substituída pelo `finalUrl` do servidor assim que ele responde.
 */
import { computed, reactive, ref } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  BarChart3,
  Check,
  Copy,
  Link2,
  Pause,
  Play,
  Plus,
  SearchX,
  Trash2,
} from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import AppDialog from '@/components/ui/AppDialog.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import Pill from '@/components/ui/Pill.vue'
import { useToast } from '@/composables/useToast'
import { useWorkspaceStore } from '@/stores/workspaceStores'
import shortLinkService, {
  type ShortLink,
  type ShortLinkMetrics,
} from '@/service/short-link/short-link-service'

const { success: showSuccess, error: showError } = useToast()
const queryClient = useQueryClient()
const workspace = useWorkspaceStore()

// ─── Listagem ────────────────────────────────────────────────────────────────

const search = ref('')
const scope = ref<'all' | 'mine' | 'company'>('all')

const { data, isLoading } = useQuery({
  queryKey: ['short-links'],
  queryFn: () => shortLinkService.list(),
  staleTime: 15_000,
})

/**
 * Busca e escopo filtram NA MEMÓRIA, e isto é deliberado.
 *
 * A rota aceita os dois como query param, mas link de campanha é um acervo
 * pequeno por natureza (dezenas, não centenas): pagar uma ida ao servidor por
 * tecla digitada custaria mais do que filtrar o array. Quando passar de algumas
 * centenas, o filtro do servidor já está pronto do outro lado.
 */
const links = computed<ShortLink[]>(() => {
  const todos = data.value ?? []
  const termo = search.value.trim().toLowerCase()
  return todos.filter((l) => {
    if (scope.value === 'mine' && l.companyId) return false
    if (scope.value === 'company' && !l.companyId) return false
    if (!termo) return true
    return [l.label, l.code, l.targetUrl, l.utmCampaign, l.utmSource]
      .filter(Boolean)
      .some((campo) => String(campo).toLowerCase().includes(termo))
  })
})

function invalidar() {
  void queryClient.invalidateQueries({ queryKey: ['short-links'] })
}

// ─── Formulário de criação ───────────────────────────────────────────────────

const showForm = ref(false)

const form = reactive({
  targetUrl: '',
  label: '',
  code: '',
  companyId: '' as string,
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
  utmTerm: '',
  utmContent: '',
})

function resetForm() {
  form.targetUrl = ''
  form.label = ''
  form.code = ''
  form.companyId = ''
  form.utmSource = ''
  form.utmMedium = ''
  form.utmCampaign = ''
  form.utmTerm = ''
  form.utmContent = ''
}

const companies = computed(() => workspace.companies)

/**
 * Prévia LOCAL da URL final, só enquanto o link não existe.
 *
 * Mesma regra do servidor: UTM que já veio colado na URL é substituído pelo
 * campo, o resto da query e o fragmento ficam. Devolve string vazia quando a
 * URL ainda não é válida, para não piscar erro enquanto a pessoa digita.
 */
const preview = computed(() => {
  const cru = form.targetUrl.trim()
  if (!cru) return ''
  const comEsquema = /^[a-z][a-z0-9+.-]*:\/\//i.test(cru) ? cru : `https://${cru}`
  let url: URL
  try {
    url = new URL(comEsquema)
  } catch {
    return ''
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
  const campos: Array<[string, string]> = [
    ['utm_source', form.utmSource],
    ['utm_medium', form.utmMedium],
    ['utm_campaign', form.utmCampaign],
    ['utm_term', form.utmTerm],
    ['utm_content', form.utmContent],
  ]
  for (const [chave] of campos) url.searchParams.delete(chave)
  for (const [chave, valor] of campos) {
    if (valor.trim()) url.searchParams.set(chave, valor.trim())
  }
  return url.toString()
})

const criar = useMutation({
  mutationFn: () =>
    shortLinkService.create({
      targetUrl: form.targetUrl,
      label: form.label || undefined,
      code: form.code || undefined,
      companyId: form.companyId || undefined,
      utmSource: form.utmSource || undefined,
      utmMedium: form.utmMedium || undefined,
      utmCampaign: form.utmCampaign || undefined,
      utmTerm: form.utmTerm || undefined,
      utmContent: form.utmContent || undefined,
    }),
  onSuccess: async (link) => {
    invalidar()
    showForm.value = false
    resetForm()
    // Copiar na hora: o passo seguinte a criar um link de campanha é colar ele
    // em algum lugar. Fazer a pessoa procurar o botão de copiar é uma etapa a
    // mais entre a intenção e o resultado.
    await copiar(link.shortUrl, 'Link criado e copiado')
  },
  onError: (err: unknown) => showError(mensagemDeErro(err, 'Não foi possível criar o link')),
})

function mensagemDeErro(err: unknown, padrao: string): string {
  const resposta = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message
  if (Array.isArray(resposta)) return resposta[0] ?? padrao
  return resposta ?? padrao
}

// ─── Ações por link ──────────────────────────────────────────────────────────

/** Qual card acabou de ser copiado, para trocar o ícone por um "ok". */
const copiadoId = ref<string | null>(null)

async function copiar(texto: string, aviso = 'Link copiado') {
  try {
    await navigator.clipboard.writeText(texto)
    showSuccess(aviso)
  } catch {
    // Área de transferência bloqueada (http sem TLS, permissão negada): o link
    // continua visível na tela para seleção manual, então isto é aviso, não erro.
    showError('Não foi possível copiar. Selecione o link e copie na mão.')
  }
}

async function copiarCard(link: ShortLink) {
  await copiar(link.shortUrl)
  copiadoId.value = link.id
  window.setTimeout(() => {
    if (copiadoId.value === link.id) copiadoId.value = null
  }, 1600)
}

const alternarAtivo = useMutation({
  mutationFn: (link: ShortLink) => shortLinkService.setActive(link.id, !link.active),
  onSuccess: (link) => {
    invalidar()
    showSuccess(link.active ? 'Link reativado' : 'Link desativado')
  },
  onError: (err: unknown) => showError(mensagemDeErro(err, 'Não foi possível alterar o link')),
})

const paraExcluir = ref<ShortLink | null>(null)

const excluir = useMutation({
  mutationFn: (id: string) => shortLinkService.remove(id),
  onSuccess: () => {
    invalidar()
    paraExcluir.value = null
    showSuccess('Link excluído')
  },
  onError: (err: unknown) => showError(mensagemDeErro(err, 'Não foi possível excluir')),
})

// ─── Métricas ────────────────────────────────────────────────────────────────

const metricasDe = ref<ShortLink | null>(null)
const metricas = ref<ShortLinkMetrics | null>(null)
const carregandoMetricas = ref(false)

async function abrirMetricas(link: ShortLink) {
  metricasDe.value = link
  metricas.value = null
  carregandoMetricas.value = true
  try {
    metricas.value = await shortLinkService.metrics(link.id)
  } catch (err) {
    showError(mensagemDeErro(err, 'Não foi possível carregar as métricas'))
    metricasDe.value = null
  } finally {
    carregandoMetricas.value = false
  }
}

/** Altura da barra do dia, em % do pico. Barra some quando não há clique. */
function alturaBarra(count: number): string {
  const pico = Math.max(1, ...(metricas.value?.byDay ?? []).map((d) => d.count))
  return `${Math.round((count / pico) * 100)}%`
}

function dataCurta(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })
}

function horaCompleta(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/** Rótulo curto da campanha, para o card não virar parede de texto. */
function resumoUtm(link: ShortLink): string {
  return [link.utmSource, link.utmMedium, link.utmCampaign].filter(Boolean).join(' · ')
}
</script>

<template>
  <div class="sl">
    <header class="sl__head">
      <div class="sl__title">
        <h1>Encurtador</h1>
        <p>Monte o link de campanha com UTM, encurte e acompanhe os cliques.</p>
      </div>
      <button type="button" class="btn-primary press" @click="showForm = true">
        <Plus :size="15" />
        Novo link
      </button>
    </header>

    <div class="sl__filters">
      <input
        v-model="search"
        class="field-input"
        type="search"
        placeholder="Buscar por rótulo, código, destino ou campanha"
      />
      <div class="sl__scope">
        <button
          v-for="opcao in [
            { key: 'all', label: 'Todos' },
            { key: 'mine', label: 'Pessoais' },
            { key: 'company', label: 'Empresa' },
          ]"
          :key="opcao.key"
          type="button"
          class="sl__scope-btn"
          :class="{ 'is-active': scope === opcao.key }"
          @click="scope = opcao.key as typeof scope"
        >
          {{ opcao.label }}
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="sl__grid">
      <Skeleton v-for="n in 6" :key="n" height="132px" />
    </div>

    <EmptyState
      v-else-if="!links.length && (search || scope !== 'all')"
      :icon="SearchX"
      title="Nenhum link com esse filtro"
      description="Ajuste a busca ou volte para Todos."
    />

    <EmptyState
      v-else-if="!links.length"
      :icon="Link2"
      title="Nenhum link ainda"
      description="Crie o primeiro link de campanha: cole o destino, preencha o UTM e divulgue."
    >
      <template #action>
        <button type="button" class="btn-primary press" @click="showForm = true">
          <Plus :size="15" />
          Novo link
        </button>
      </template>
    </EmptyState>

    <div v-else class="sl__grid">
      <article v-for="link in links" :key="link.id" class="card" :class="{ 'is-off': !link.active }">
        <div class="card__top">
          <span class="card__label">{{ link.label || link.code }}</span>
          <!-- `color` do Pill entra CRU numa custom property de CSS: precisa ser
               um valor de cor valido (token), nao um nome de variante. -->
          <Pill v-if="!link.active" color="var(--warn)" size="sm">Desativado</Pill>
          <Pill v-else-if="link.companyId" color="var(--info)" size="sm">Empresa</Pill>
        </div>

        <button type="button" class="card__short" :title="link.shortUrl" @click="copiarCard(link)">
          <component :is="copiadoId === link.id ? Check : Copy" :size="13" />
          <span>{{ link.shortUrl }}</span>
        </button>

        <p class="card__target" :title="link.finalUrl">{{ link.finalUrl }}</p>

        <p v-if="resumoUtm(link)" class="card__utm">{{ resumoUtm(link) }}</p>

        <footer class="card__foot">
          <span class="card__clicks">
            {{ link.clickCount }} {{ link.clickCount === 1 ? 'clique' : 'cliques' }}
          </span>
          <div class="card__actions">
            <button type="button" class="icon-btn press" title="Métricas" @click="abrirMetricas(link)">
              <BarChart3 :size="14" />
            </button>
            <button
              v-if="link.isMine"
              type="button"
              class="icon-btn press"
              :title="link.active ? 'Desativar' : 'Reativar'"
              @click="alternarAtivo.mutate(link)"
            >
              <component :is="link.active ? Pause : Play" :size="14" />
            </button>
            <button
              v-if="link.isMine"
              type="button"
              class="icon-btn icon-btn--danger press"
              title="Excluir"
              @click="paraExcluir = link"
            >
              <Trash2 :size="14" />
            </button>
          </div>
        </footer>
      </article>
    </div>

    <!-- ── Criação ────────────────────────────────────────────────────────── -->
    <AppDialog v-model="showForm" label="Novo link de campanha" size="lg" :loading="criar.isPending.value">
      <form class="form" @submit.prevent="criar.mutate()">
        <h2 class="form__title">Novo link de campanha</h2>

        <label class="field">
          <span class="view-label">Destino</span>
          <input
            v-model="form.targetUrl"
            class="field-input"
            placeholder="nevo.app/precos — pode colar a URL que já tem UTM"
            required
          />
          <small class="field-hint">
            Colou um link que já tinha UTM? Os parâmetros são separados sozinhos
            para os campos abaixo.
          </small>
        </label>

        <div class="field-row">
          <label class="field">
            <span class="view-label">Rótulo (só você vê)</span>
            <input v-model="form.label" class="field-input" placeholder="Post do feed" />
          </label>
          <label class="field">
            <span class="view-label">Código personalizado</span>
            <input v-model="form.code" class="field-input" placeholder="black-friday (opcional)" />
          </label>
        </div>

        <label v-if="companies.length" class="field">
          <span class="view-label">Escopo</span>
          <select v-model="form.companyId" class="field-input">
            <option value="">Pessoal (só você vê)</option>
            <option v-for="c in companies" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>

        <fieldset class="utm">
          <legend>Campanha (UTM)</legend>
          <div class="field-row">
            <label class="field">
              <span class="view-label">Origem</span>
              <input v-model="form.utmSource" class="field-input" placeholder="instagram" />
            </label>
            <label class="field">
              <span class="view-label">Meio</span>
              <input v-model="form.utmMedium" class="field-input" placeholder="social" />
            </label>
          </div>
          <label class="field">
            <span class="view-label">Campanha</span>
            <input v-model="form.utmCampaign" class="field-input" placeholder="black-friday" />
          </label>
          <div class="field-row">
            <label class="field">
              <span class="view-label">Termo</span>
              <input v-model="form.utmTerm" class="field-input" placeholder="crm (opcional)" />
            </label>
            <label class="field">
              <span class="view-label">Conteúdo</span>
              <input v-model="form.utmContent" class="field-input" placeholder="botao-topo (opcional)" />
            </label>
          </div>
        </fieldset>

        <div v-if="preview" class="preview">
          <span class="view-label">Vai levar para</span>
          <code>{{ preview }}</code>
        </div>

        <div class="form__actions">
          <button type="button" class="btn-ghost press" @click="showForm = false">Cancelar</button>
          <button type="submit" class="btn-primary press" :disabled="!form.targetUrl || criar.isPending.value">
            {{ criar.isPending.value ? 'Criando…' : 'Criar e copiar' }}
          </button>
        </div>
      </form>
    </AppDialog>

    <!-- ── Métricas ───────────────────────────────────────────────────────── -->
    <AppDialog
      :model-value="!!metricasDe"
      label="Métricas do link"
      size="lg"
      @update:model-value="metricasDe = null"
    >
      <div class="metrics">
        <h2 class="form__title">{{ metricasDe?.label || metricasDe?.code }}</h2>

        <div v-if="carregandoMetricas" class="metrics__loading">
          <Skeleton height="120px" />
          <Skeleton height="80px" />
        </div>

        <template v-else-if="metricas">
          <p class="metrics__total">
            <strong>{{ metricas.clickCount }}</strong>
            {{ metricas.clickCount === 1 ? 'clique' : 'cliques' }}
          </p>

          <section v-if="metricas.byDay.length" class="metrics__block">
            <span class="view-label">Por dia</span>
            <div class="chart">
              <div v-for="dia in metricas.byDay" :key="dia.day" class="chart__col" :title="`${dia.count} em ${dataCurta(dia.day)}`">
                <div class="chart__bar" :style="{ height: alturaBarra(dia.count) }" />
                <span class="chart__x">{{ dataCurta(dia.day) }}</span>
              </div>
            </div>
          </section>

          <section v-if="metricas.byReferer.length" class="metrics__block">
            <span class="view-label">De onde veio</span>
            <ul class="list">
              <li v-for="r in metricas.byReferer" :key="r.referer">
                <span class="list__key">{{ r.referer }}</span>
                <span class="list__val">{{ r.count }}</span>
              </li>
            </ul>
          </section>

          <section v-if="metricas.recent.length" class="metrics__block">
            <span class="view-label">Últimos cliques</span>
            <ul class="list">
              <li v-for="(c, i) in metricas.recent" :key="i">
                <span class="list__key">{{ horaCompleta(c.at) }}</span>
                <span class="list__val list__val--muted">{{ c.referer || 'direto' }}</span>
              </li>
            </ul>
          </section>

          <EmptyState
            v-if="!metricas.clickCount"
            :icon="BarChart3"
            title="Nenhum clique ainda"
            description="Assim que alguém abrir o link, os números aparecem aqui."
          />
        </template>
      </div>
    </AppDialog>

    <ConfirmDialog
      :model-value="!!paraExcluir"
      title="Excluir este link?"
      :message="`O link ${paraExcluir?.shortUrl ?? ''} para de funcionar na hora e os cliques registrados são apagados junto. Não dá para desfazer.`"
      confirm-label="Excluir"
      danger
      @update:model-value="paraExcluir = null"
      @confirm="paraExcluir && excluir.mutate(paraExcluir.id)"
    />
  </div>
</template>

<style scoped>
/* ── Utilitários locais ──────────────────────────────────────────────────────
 *
 * `btn-*`, `icon-btn`, `field-input` e `view-label` NÃO são globais neste
 * projeto: cada view declara as suas (o TaskDetailsView é a referência que este
 * bloco reproduz). Ficar sem elas deixaria a tela inteira sem estilo — o
 * type-check não pega isso, então a checagem é visual mesmo.
 */

.btn-primary,
.btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.btn-primary {
  background: var(--accent);
  color: var(--accent-fg);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-ghost {
  background: transparent;
  color: var(--text-2);
}

.btn-ghost:hover {
  background: var(--surface-2);
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  cursor: pointer;
  transition:
    background var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

.icon-btn:hover {
  background: var(--surface-3);
  color: var(--text);
}

.icon-btn--danger:hover {
  color: var(--err);
  border-color: color-mix(in srgb, var(--err) 35%, var(--border));
}

.field-input {
  width: 100%;
  height: 38px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  color-scheme: light dark;
  outline: none;
  transition:
    border-color var(--motion-fast) var(--motion-ease),
    box-shadow var(--motion-fast) var(--motion-ease);
}

.field-input::placeholder {
  color: var(--text-4);
}

.field-input:focus {
  border-color: color-mix(in srgb, var(--accent) 60%, var(--border-strong));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}

.view-label {
  display: block;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
}

.sl {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
}

.sl__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.sl__title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 650;
  color: var(--text);
}

.sl__title p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-3);
}

.sl__filters {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.sl__filters .field-input {
  flex: 1 1 260px;
}

.sl__scope {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.sl__scope-btn {
  padding: 6px 12px;
  border: 0;
  border-radius: calc(var(--radius-sm) - 2px);
  background: transparent;
  color: var(--text-3);
  font-size: 12px;
  cursor: pointer;
}

.sl__scope-btn.is-active {
  background: var(--surface);
  color: var(--text);
}

.sl__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.card.is-off {
  opacity: 0.62;
}

.card__top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.card__short {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 9px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--accent);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--motion-ease);
}

.card__short:hover {
  border-color: var(--border-strong);
}

.card__short span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card__target {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--text-4);
}

.card__utm {
  margin: 0;
  font-size: 11px;
  color: var(--text-3);
}

.card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
}

.card__clicks {
  font-size: 12px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
}

.card__actions {
  display: flex;
  gap: 4px;
}

/* ── Formulário ─────────────────────────────────────────────────────────── */

.form,
.metrics {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px;
}

.form__title {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  color: var(--text);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
  min-width: 0;
}

.field-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.field-hint {
  font-size: 11px;
  color: var(--text-4);
}

.utm {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.utm legend {
  padding: 0 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-4);
}

.preview {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.preview code {
  font-size: 11px;
  color: var(--text-2);
  word-break: break-all;
}

.form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ── Métricas ───────────────────────────────────────────────────────────── */

.metrics__loading {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.metrics__total {
  margin: 0;
  font-size: 13px;
  color: var(--text-3);
}

.metrics__total strong {
  font-size: 26px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.metrics__block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chart {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 108px;
  padding-top: 4px;
  overflow-x: auto;
}

.chart__col {
  display: flex;
  flex: 1 0 26px;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  height: 100%;
}

.chart__bar {
  width: 100%;
  min-height: 2px;
  background: var(--accent);
  border-radius: 3px 3px 0 0;
}

.chart__x {
  font-size: 9px;
  color: var(--text-4);
  white-space: nowrap;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-size: 12px;
}

.list__key {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-2);
}

.list__val {
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.list__val--muted {
  color: var(--text-4);
  max-width: 50%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
