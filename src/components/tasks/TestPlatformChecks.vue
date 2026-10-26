<script setup lang="ts">
/**
 * Teste por plataforma (spec teste-por-plataforma, D9 e D10): Web, iOS e
 * Android, marcados por quem testou SEM abrir a tarefa. A tarefa só entra em
 * Revisados com as três; sem web, a pessoa marca Web mesmo assim (D2).
 *
 * - `card`: a faixa no rodapé do card de "Em teste". Três botões de largura
 *   igual; em card estreito os nomes somem e ficam o ícone e a marca.
 * - `field`: a linha "Testes" do detalhe da tarefa, uma linha por plataforma
 *   com quem testou e quando.
 *
 * Grava sozinho, como a bolinha do sinal (o mesmo card vive no board do mês e
 * no `/board`, que mistura empresas): mostra o check na hora, chama a API com
 * a empresa do card e volta ao anterior se a gravação falhar. Os três botões
 * esperam a resposta antes de aceitar outro clique: duas respostas fora de
 * ordem apagariam um check na tela. O dado que chega depois (refetch,
 * realtime) substitui o local.
 *
 * Cor nunca é o único canal: o botão diz o estado no nome acessível e no
 * tooltip, e a marca muda de forma (círculo vazio para check).
 */
import { computed, ref, watch } from 'vue'
import { Check } from 'lucide-vue-next'
import PlatformIcon from '@/components/tasks/PlatformIcon.vue'
import PersonAvatar from '@/components/ui/PersonAvatar.vue'
import activityService from '@/service/activities/activity-service'
import { useToast } from '@/composables/useToast'
import { getUserToken } from '@/utils/authContent'
import { relativeTime } from '@/utils/relative-time'
import {
  TEST_PLATFORMS,
  missingPlatforms,
  platformNames,
  type TestPlatformSpec,
} from '@/features/tasks/test-platforms'
import type { TestCheckView, TestPlatform } from '@/features/tasks/activity-types'

const props = withDefaults(
  defineProps<{
    taskId: string
    checks?: TestCheckView[] | null
    /** Empresa da tarefa. Obrigatória no `/board`; no board do mês vale a ativa. */
    companyId?: string | null
    readonly?: boolean
    variant?: 'card' | 'field'
  }>(),
  { checks: null, companyId: null, readonly: false, variant: 'card' },
)

const emit = defineEmits<{
  /** Gravado no servidor (a lista inteira). Quem quiser atualiza o próprio estado. */
  changed: [checks: TestCheckView[]]
}>()

const toast = useToast()

// Lista gravada aqui e ainda não refletida no dado que veio de cima.
const local = ref<TestCheckView[] | null>(null)
watch(
  () => props.checks,
  () => {
    local.value = null
  },
)

const current = computed<TestCheckView[]>(() => local.value ?? props.checks ?? [])
const byPlatform = computed(() => new Map(current.value.map((c) => [c.platform, c])))
const missing = computed(() => missingPlatforms(current.value))
const doneCount = computed(() => TEST_PLATFORMS.length - missing.value.length)
const saving = ref(false)

const order = (p: TestPlatform) => TEST_PLATFORMS.findIndex((s) => s.value === p)
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name

function describe(spec: TestPlatformSpec, check: TestCheckView | null): string {
  if (!check) {
    return props.readonly ? `${spec.spoken}: não testado` : `${spec.spoken}: não testado. Marcar como testado`
  }
  const base = `${spec.spoken}: testado por ${check.checkedBy?.name ?? 'alguém'}, ${relativeTime(check.checkedAt)}`
  return props.readonly ? base : `${base}. Clique para desmarcar`
}

/** Uma linha por plataforma, já com o check (ou `null`) e o nome acessível. */
const rows = computed(() =>
  TEST_PLATFORMS.map((spec) => {
    const check = byPlatform.value.get(spec.value) ?? null
    return {
      spec,
      check,
      on: check !== null,
      label: describe(spec, check),
      who: check ? firstName(check.checkedBy?.name ?? 'Alguém') : null,
    }
  }),
)

const groupLabel = computed(() => `Testes por plataforma: ${doneCount.value} de ${TEST_PLATFORMS.length}`)

const hint = computed(() =>
  missing.value.length ? `Falta testar em ${platformNames(missing.value)}` : 'Pronto para Revisados',
)

async function toggle(platform: TestPlatform) {
  if (props.readonly || saving.value) return
  const previous = local.value
  const before = current.value
  const marking = !byPlatform.value.has(platform)
  const me = getUserToken()
  // Otimista: o check aparece na hora com o nome de quem clicou; a hora e o
  // autor reais vêm da resposta.
  local.value = marking
    ? [
        ...before,
        { platform, checkedBy: me ? { id: me.sub, name: me.name } : null, checkedAt: new Date().toISOString() },
      ].sort((a, b) => order(a.platform) - order(b.platform))
    : before.filter((c) => c.platform !== platform)
  saving.value = true
  try {
    const saved = await activityService.setTestCheck(props.taskId, platform, marking, props.companyId)
    local.value = saved
    emit('changed', saved)
  } catch (error: unknown) {
    local.value = previous
    const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
    toast.error(message ?? 'Não foi possível marcar o teste')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <!-- Card: três botões de largura igual no rodapé. -->
  <div
    v-if="variant === 'card'"
    class="tpc"
    role="group"
    :aria-label="groupLabel"
    :aria-busy="saving || undefined"
  >
    <component
      :is="readonly ? 'span' : 'button'"
      v-for="row in rows"
      :key="row.spec.value"
      class="tpc__chip"
      :class="{ 'is-on': row.on, 'no-drag': !readonly }"
      v-bind="
        readonly
          ? { role: 'img', 'aria-label': row.label }
          : { type: 'button', 'aria-pressed': row.on, 'aria-label': row.label }
      "
      :title="row.label"
      @click.stop="toggle(row.spec.value)"
      @dblclick.stop
      @keydown.enter.stop
      @keydown.space.stop
    >
      <PlatformIcon :path="row.spec.icon" :size="14" />
      <span class="tpc__label">{{ row.spec.label }}</span>
      <span class="tpc__mark" aria-hidden="true">
        <Check v-if="row.on" :size="11" :stroke-width="3" />
      </span>
    </component>
  </div>

  <!-- Detalhe: uma linha por plataforma, com quem testou e quando. -->
  <div v-else class="tpf" :aria-busy="saving || undefined">
    <ul class="tpf__list" :aria-label="groupLabel">
      <li v-for="row in rows" :key="row.spec.value">
        <component
          :is="readonly ? 'div' : 'button'"
          class="tpf__row"
          :class="{ 'is-on': row.on }"
          v-bind="
            readonly
              ? { 'aria-label': row.label }
              : { type: 'button', 'aria-pressed': row.on, 'aria-label': row.label }
          "
          :title="row.label"
          @click="toggle(row.spec.value)"
        >
          <span class="tpf__icon"><PlatformIcon :path="row.spec.icon" :size="16" /></span>
          <span class="tpf__name">{{ row.spec.label }}</span>
          <span class="tpf__who">
            <PersonAvatar
              v-if="row.check?.checkedBy"
              :id="row.check.checkedBy.id"
              :name="row.check.checkedBy.name"
              :size="16"
              decorative
            />
            <span class="tpf__who-text" :class="{ 'tpf__who-text--none': !row.on }">
              {{ row.who ?? 'Não testado' }}
            </span>
          </span>
          <span class="tpc__mark tpf__mark" aria-hidden="true">
            <Check v-if="row.on" :size="12" :stroke-width="3" />
          </span>
        </component>
      </li>
    </ul>
    <p v-if="!readonly" class="tpf__hint" :class="{ 'is-ready': !missing.length }">{{ hint }}</p>
  </div>
</template>

<style scoped>
/* ── Card ─────────────────────────────────────────────────────────────────── */
/* Flex proporcional ao conteúdo, e não três colunas iguais: com nome, o botão
   do Android precisa de mais espaço que o da Web. Sem nome (card estreito), os
   três ficam iguais. */
.tpc {
  container-type: inline-size;
  display: flex;
  gap: 4px;
  margin-top: 2px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.tpc__chip {
  position: relative;
  display: inline-flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
  height: 28px;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  white-space: nowrap;
  transition:
    background-color var(--motion-fast) var(--motion-ease),
    border-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}

button.tpc__chip {
  cursor: pointer;
}

/* Alvo de 44px de altura sem engordar a faixa. */
button.tpc__chip::after {
  content: '';
  position: absolute;
  inset: -8px -2px;
}

button.tpc__chip:hover {
  background: var(--surface-2);
  color: var(--text-2);
}

.tpc__chip.is-on {
  border-color: var(--test-check-on-border);
  background: var(--test-check-on-bg);
  color: var(--text);
  font-weight: 600;
}

button.tpc__chip.is-on:hover {
  border-color: var(--test-check-on);
}

button.tpc__chip:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.tpc__label {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* A marca: círculo vazio (falta testar) ou check (testado). Muda de FORMA,
   não só de cor. */
.tpc__mark {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1.5px var(--text-4);
  color: var(--test-check-on);
}

.is-on .tpc__mark {
  box-shadow: none;
}

/* Card estreito (5 colunas em 1440 com a barra lateral): sobra ícone e marca.
   Os três nomes, com ícone e marca, pedem uns 217px. */
@container (max-width: 224px) {
  .tpc__label {
    display: none;
  }
}

/* ── Detalhe ──────────────────────────────────────────────────────────────── */
.tpf {
  /* Contêiner de largura: sem `width` explícita ele mede 0 (a contenção ignora
     o conteúdo) e as linhas transbordam cortando o nome. */
  container-type: inline-size;
  display: grid;
  gap: 4px;
  width: 100%;
  min-width: 0;
}

/* A linha mostra quem testou (avatar e primeiro nome); o "quando" fica no
   tooltip e no nome acessível, porque a coluna de propriedades do dialog tem
   uns 200px. Mais estreita que isso (celular), a linha sem teste fica só com o
   círculo vazio: a dica logo abaixo já diz o que falta. */
@container (max-width: 200px) {
  .tpf__who-text--none {
    display: none;
  }
}

.tpf__list {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tpf__row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 32px;
  margin-left: -8px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font: inherit;
  font-size: 13px;
  text-align: left;
}

button.tpf__row {
  cursor: pointer;
}

button.tpf__row:hover {
  background: var(--surface-2);
}

button.tpf__row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.tpf__row.is-on {
  color: var(--text);
}

.tpf__icon {
  display: inline-flex;
  color: var(--text-3);
}

.tpf__row.is-on .tpf__icon {
  color: var(--text);
}

.tpf__name {
  min-width: 52px;
  font-weight: 600;
}

.tpf__who {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.tpf__who-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-2);
}

.tpf__who-text--none {
  color: var(--text-3);
}

.tpf__mark {
  width: 14px;
  height: 14px;
}

.tpf__hint {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--text-3);
}

.tpf__hint.is-ready {
  color: var(--text-2);
  font-weight: 600;
}
</style>
