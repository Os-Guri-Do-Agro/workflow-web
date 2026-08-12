<script setup lang="ts">
/**
 * Navegação do Drive, modelo QR: Pessoal + TODAS as empresas do usuário, cada
 * uma com contador; clicar numa empresa mostra os arquivos dela sem tocar na
 * empresa ativa do topo. Só o espaço selecionado expande a árvore de pastas
 * (todas abertas viraria uma coluna rolável sem hierarquia legível).
 *
 * Hierarquia por indentação e peso tipográfico, sem `border-left` (convenção
 * do projeto). Ações de pasta no hover/foco, gateadas por permissão do espaço:
 * pessoal = sempre; empresa = só ADMIN daquela empresa.
 */
import { computed, ref } from 'vue'
import { ChevronRight, FolderPlus, User } from 'lucide-vue-next'
import DriveSidebarRow from './DriveSidebarRow.vue'
import { avatarTone, initials } from '@/utils/avatar'
import type {
  DriveCompanySection,
  DriveFolderNode,
  DriveScope,
} from '@/features/drive/types'

const props = defineProps<{
  /** 'personal' ou o id da empresa selecionada. */
  activeKey: string
  activeFolderId: string | null
  personalTree: DriveFolderNode[]
  personalCount: number
  companies: DriveCompanySection[]
}>()

const emit = defineEmits<{
  /** scope + companyId (null = pessoal) + pasta. */
  select: [scope: DriveScope, companyId: string | null, folderId: string | null]
  'create-folder': [companyId: string | null, parentId: string | null]
  'rename-folder': [folder: DriveFolderNode]
  'move-folder': [folder: DriveFolderNode]
  'delete-folder': [folder: DriveFolderNode]
}>()

/** Pastas recolhidas (default é aberto: árvore rasa na prática). */
const collapsed = ref(new Set<string>())

/** Empresas sem arquivo ficam escondidas até o usuário pedir. */
const showEmpty = ref(false)

const visibleCompanies = computed(() => {
  if (showEmpty.value) return props.companies
  return props.companies.filter(
    // A selecionada nunca some, senão a tela mostra arquivos de um espaço que
    // não aparece em lugar nenhum da navegação.
    (c) => c.count > 0 || c.id === props.activeKey,
  )
})

const hiddenCount = computed(
  () => props.companies.length - visibleCompanies.value.length,
)

function toggle(id: string) {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
}
</script>

<template>
  <aside class="ds" aria-label="Espaços do Drive">
    <!-- ─── Pessoal ─────────────────────────────────────────────────────── -->
    <div class="ds-group">
      <div class="ds-rootline">
        <button
          type="button"
          class="ds-item ds-item--root"
          :class="{
            'ds-item--active': activeKey === 'personal' && activeFolderId === null,
          }"
          :aria-expanded="activeKey === 'personal'"
          @click="emit('select', 'personal', null, null)"
        >
          <User :size="14" class="ds-item-icon" />
          <span class="ds-item-label">Pessoal</span>
          <span class="ds-count">{{ personalCount }}</span>
        </button>
        <button
          type="button"
          class="ds-add press"
          aria-label="Nova pasta pessoal"
          title="Nova pasta"
          @click="emit('create-folder', null, null)"
        >
          <FolderPlus :size="14" />
        </button>
      </div>

      <template v-if="activeKey === 'personal'">
        <DriveSidebarRow
          v-for="node in personalTree"
          :key="node.id"
          :node="node"
          :active-folder-id="activeFolderId"
          :collapsed="collapsed"
          :can-manage="true"
          @select="(id) => emit('select', 'personal', null, id)"
          @toggle="toggle"
          @create="(id) => emit('create-folder', null, id)"
          @rename="(f) => emit('rename-folder', f)"
          @move="(f) => emit('move-folder', f)"
          @remove="(f) => emit('delete-folder', f)"
        />
      </template>
    </div>

    <!-- ─── Uma seção por empresa do usuário ────────────────────────────── -->
    <p v-if="companies.length" class="ds-eyebrow">Empresas</p>

    <div v-for="company in visibleCompanies" :key="company.id" class="ds-group">
      <div class="ds-rootline">
        <button
          type="button"
          class="ds-item ds-item--root"
          :class="{
            'ds-item--active': activeKey === company.id && activeFolderId === null,
            'ds-item--muted': company.count === 0,
          }"
          :aria-expanded="activeKey === company.id"
          @click="emit('select', 'company', company.id, null)"
        >
          <ChevronRight
            :size="13"
            class="ds-chevron"
            :class="{ 'ds-chevron--open': activeKey === company.id }"
            aria-hidden="true"
          />
          <span
            class="ds-avatar"
            :style="{ '--tone': avatarTone(company.name) }"
            aria-hidden="true"
          >{{ initials(company.name) }}</span>
          <span class="ds-item-label">{{ company.name }}</span>
          <span v-if="company.count > 0" class="ds-count">{{ company.count }}</span>
        </button>
        <button
          v-if="company.canManage"
          type="button"
          class="ds-add press"
          :aria-label="`Nova pasta em ${company.name}`"
          title="Nova pasta"
          @click="emit('create-folder', company.id, null)"
        >
          <FolderPlus :size="14" />
        </button>
      </div>

      <template v-if="activeKey === company.id">
        <DriveSidebarRow
          v-for="node in company.tree"
          :key="node.id"
          :node="node"
          :active-folder-id="activeFolderId"
          :collapsed="collapsed"
          :can-manage="company.canManage"
          @select="(id) => emit('select', 'company', company.id, id)"
          @toggle="toggle"
          @create="(id) => emit('create-folder', company.id, id)"
          @rename="(f) => emit('rename-folder', f)"
          @move="(f) => emit('move-folder', f)"
          @remove="(f) => emit('delete-folder', f)"
        />
      </template>
    </div>

    <!--
      Empresas sem NENHUM arquivo ficam atrás de um "mostrar mais".
      Com dez empresas, listar todas com "0" ao lado transforma a coluna numa
      parede de zeros onde os espaços que têm conteúdo somem no meio. Elas
      continuam a um clique, e a que estiver selecionada nunca é escondida.
    -->
    <button
      v-if="hiddenCount > 0"
      type="button"
      class="ds-more press"
      @click="showEmpty = !showEmpty"
    >
      <ChevronRight
        :size="12"
        class="ds-chevron"
        :class="{ 'ds-chevron--open': showEmpty }"
        aria-hidden="true"
      />
      {{ showEmpty ? 'Ocultar vazias' : `${hiddenCount} sem arquivos` }}
    </button>
  </aside>
</template>

<style scoped>
.ds {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 240px;
  flex: none;
  padding-right: 14px;
}

.ds-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ds-rootline {
  display: flex;
  align-items: center;
  gap: 4px;
}

.ds-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  padding: 7px 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font-size: 12.5px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.ds-item--root {
  font-weight: 600;
  color: var(--text);
}

.ds-item:hover {
  background: var(--surface-2);
}

.ds-item--active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--text);
}

.ds-item-icon {
  flex: none;
  color: var(--text-3);
}

.ds-item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ds-count {
  flex: none;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-3);
  background: var(--surface-2);
  border-radius: 999px;
  padding: 1px 7px;
}

.ds-eyebrow {
  margin: 4px 0 -4px 10px;
  color: var(--text-4);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

/* Avatar tonal por empresa: dá identidade e faz a lista virar reconhecível. */
.ds-avatar {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex: none;
  border-radius: 7px;
  background: color-mix(in srgb, var(--tone) 20%, transparent);
  color: var(--tone);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

/* Empresa sem arquivo pesa menos, mas continua legível e clicável. */
.ds-item--muted .ds-item-label {
  color: var(--text-3);
  font-weight: 500;
}

.ds-more {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  align-self: flex-start;
  margin-left: 8px;
  padding: 5px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.ds-more:hover {
  background: var(--surface-2);
  color: var(--text-2);
}

.ds-chevron {
  flex: none;
  color: var(--text-3);
  transition: transform var(--motion-fast) var(--motion-ease);
}

.ds-chevron--open {
  transform: rotate(90deg);
}

.ds-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  flex: none;
}

.ds-add:hover {
  background: var(--surface-2);
  color: var(--text);
}

@media (max-width: 900px) {
  .ds {
    width: 100%;
    padding-right: 0;
  }
}
</style>
