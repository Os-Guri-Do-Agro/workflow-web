<script setup lang="ts">
import { ref } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import { getApiErrorMessage } from '@/service/api'
import type { MarketingSettings } from '@/service/marketing/marketing-core'
import {
  updateGroup,
  updateGroupSettings,
  type MarketingGroupDetail,
} from '@/service/marketing/marketing-settings'
import { useToast } from '@/composables/useToast'

/**
 * Configurações do Dono (o cargo maior): o que muda o acesso de todo mundo.
 * Só aparece para o Dono; a API recusa as mesmas chaves para qualquer outro.
 */
const props = defineProps<{ groupId: string; detail: MarketingGroupDetail; settings: MarketingSettings }>()
const toast = useToast()
const queryClient = useQueryClient()
const busy = ref(false)
const name = ref(props.detail.name)
const confirmOff = ref(false)

type SevereKey = 'viewerSeesFinance' | 'editorRevealsSecrets' | 'campaignNeedsApproval' | 'editorCanDelete'
const SEVERE: { key: SevereKey; title: string; hint: string }[] = [
  { key: 'viewerSeesFinance', title: 'Visualizador vê o financeiro', hint: 'Lançamentos, orçamento e custo de campanha e ativação.' },
  { key: 'editorRevealsSecrets', title: 'Editor revela senha dos links', hint: 'Desligado, só Admin e Dono revelam. Todo revelar fica no histórico.' },
  { key: 'campaignNeedsApproval', title: 'Campanha só fica ativa depois de aprovada', hint: 'Desligado, o Editor ativa direto do rascunho.' },
  { key: 'editorCanDelete', title: 'Editor apaga o que os outros criaram', hint: 'Desligado, o Editor só apaga o que ele mesmo criou.' },
]

async function refresh() {
  await queryClient.invalidateQueries({ queryKey: ['marketing'] })
}

async function setSevere(key: SevereKey, value: boolean) {
  busy.value = true
  try {
    await updateGroupSettings(props.groupId, { [key]: value })
    toast.success('Configuração salva')
    await refresh()
  } catch (error) {
    toast.error(getApiErrorMessage(error, 'Não deu para salvar.'))
  } finally {
    busy.value = false
  }
}

async function saveName() {
  const next = name.value.trim()
  if (!next || next === props.detail.name) return
  busy.value = true
  try {
    await updateGroup(props.groupId, { name: next })
    toast.success('Nome do grupo salvo')
    await refresh()
  } catch (error) {
    toast.error(getApiErrorMessage(error, 'Não deu para salvar.'))
  } finally {
    busy.value = false
  }
}

/** Ligar é direto; desligar pede confirmação (a caixa volta marcada até confirmar). */
function onEnabledChange(event: Event) {
  const box = event.target as HTMLInputElement
  if (box.checked) {
    void setEnabled(true)
    return
  }
  box.checked = true
  confirmOff.value = true
}

async function setEnabled(value: boolean) {
  busy.value = true
  try {
    await updateGroup(props.groupId, { marketingEnabled: value })
    toast.success(value ? 'Ala ligada' : 'Ala desligada')
    confirmOff.value = false
    await refresh()
  } catch (error) {
    toast.error(getApiErrorMessage(error, 'Não deu para salvar.'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="mk-panel">
    <header class="mk-panel__head">Configurações do Dono</header>
    <div class="mk-panel__body so">
      <div class="so__row">
        <div class="mk-field so__name">
          <label class="mk-label" for="so-name">Nome do grupo</label>
          <div class="so__inline">
            <input id="so-name" v-model="name" class="mk-input" type="text" maxlength="80" @keydown.enter.prevent="saveName" />
            <button type="button" class="mk-btn" :disabled="busy || !name.trim() || name.trim() === detail.name" @click="saveName">
              Salvar
            </button>
          </div>
        </div>
      </div>

      <ul class="so__list">
        <li v-for="s in SEVERE" :key="s.key" class="so__item">
          <label class="so__toggle">
            <input
              type="checkbox"
              :checked="settings[s.key]"
              :disabled="busy"
              @change="setSevere(s.key, ($event.target as HTMLInputElement).checked)"
            />
            <span class="so__text">
              <span class="so__title">{{ s.title }}</span>
              <span class="mk-hint">{{ s.hint }}</span>
            </span>
          </label>
        </li>
        <li class="so__item">
          <label class="so__toggle">
            <input
              type="checkbox"
              :checked="detail.marketingEnabled"
              :disabled="busy"
              @change="onEnabledChange"
            />
            <span class="so__text">
              <span class="so__title">Ala Marketing ligada</span>
              <span class="mk-hint">Desligada, a equipe perde o acesso (nada é apagado). Só o Dono continua vendo as configurações.</span>
            </span>
          </label>
        </li>
      </ul>
    </div>

    <ConfirmDialog
      v-model="confirmOff"
      title="Desligar a ala Marketing?"
      message="Toda a equipe perde o acesso até você ligar de novo. Nada é apagado."
      confirm-label="Desligar"
      danger
      :loading="busy"
      @confirm="setEnabled(false)"
    />
  </section>
</template>

<style scoped>
.so {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.so__name {
  max-width: 460px;
}

.so__inline {
  display: flex;
  gap: 6px;
}

.so__inline .mk-input {
  flex: 1;
  min-width: 0;
}

.so__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.so__item {
  padding: 10px 0;
  border-top: 1px solid var(--border);
}

.so__toggle {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}

.so__toggle input {
  margin-top: 3px;
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}

.so__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.so__title {
  font-size: 13px;
  font-weight: 600;
}
</style>
