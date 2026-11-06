<script setup lang="ts">
/**
 * "Já está no acervo": o mesmo arquivo (sha256) já existe. Manter os dois ou
 * Pular, com "fazer o mesmo para os próximos" quando vêm vários no lote.
 */
import { ref, watch } from 'vue'
import { Copy, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import LibraryCheck from './LibraryCheck.vue'
import './library.css'

const props = defineProps<{
  modelValue: boolean
  fileName: string
  /** "PetJourney / Fotos" */
  where: string
  existingTitle: string
  /** O envio ainda tem outros arquivos: vale oferecer "fazer o mesmo" */
  more: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  decide: [decision: 'keep' | 'skip', applyToAll: boolean]
}>()

const all = ref(false)
watch(
  () => props.modelValue,
  (open) => {
    if (open) all.value = false
  },
)

function decide(decision: 'keep' | 'skip') {
  emit('decide', decision, all.value)
}
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    label="Arquivo repetido"
    size="sm"
    persistent
    @update:model-value="(v) => (!v ? decide('skip') : undefined)"
  >
    <header class="lib-dlg__head">
      <div class="lib-dlg__title">
        <Copy :size="16" aria-hidden="true" />
        <h2>Já está no acervo</h2>
      </div>
      <button type="button" class="mk-icon-btn" aria-label="Pular este arquivo" @click="decide('skip')">
        <X :size="15" aria-hidden="true" />
      </button>
    </header>
    <div class="lib-dlg__body" data-dialog="duplicate">
      <p class="lib-note">
        <strong>{{ fileName }}</strong> já está no acervo em <strong>{{ where }}</strong>
        <template v-if="existingTitle && existingTitle !== fileName"> (como "{{ existingTitle }}")</template>.
      </p>
      <p class="mk-hint">Manter os dois sobe outra cópia. Pular não envia este arquivo.</p>
      <label v-if="more" class="lib-check-row">
        <LibraryCheck :checked="all" label="Fazer o mesmo para os outros repetidos deste envio" @toggle="all = !all" />
        Fazer o mesmo para os outros repetidos deste envio
      </label>
    </div>
    <footer class="lib-dlg__foot">
      <button type="button" class="mk-btn" data-action="dup-skip" @click="decide('skip')">Pular</button>
      <button type="button" class="mk-btn mk-btn--primary" data-action="dup-keep" @click="decide('keep')">Manter os dois</button>
    </footer>
  </AppDialog>
</template>
