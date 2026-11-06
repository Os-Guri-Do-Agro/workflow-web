<script setup lang="ts">
/**
 * Criar e editar link de trabalho. A senha nunca vem para cá: editando, o
 * campo começa vazio e vazio quer dizer "manter a guardada". Trocar é digitar
 * outra; "Apagar senha guardada" manda `secret: null`.
 */
import { computed, reactive, ref, watch } from 'vue'
import { Eye, EyeOff, KeyRound, Loader2, X } from 'lucide-vue-next'
import AppDialog from '@/components/ui/AppDialog.vue'
import type { MarketingBrand } from '@/service/marketing/marketing-core'
import type { LinkInput, MarketingLink } from '@/service/marketing/marketing-links'
import { apiErrorMessage } from '../../calendar/api-error'

const props = defineProps<{
  modelValue: boolean
  /** null = criar */
  link: MarketingLink | null
  categories: string[]
  brands: MarketingBrand[]
  defaultBrand: string | null
  defaultCategory: string | null
  submit: (input: LinkInput, linkId: string | null) => Promise<unknown>
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const form = reactive({
  title: '',
  url: '',
  category: '',
  companyId: '',
  username: '',
  secret: '',
  clearSecret: false,
  notes: '',
})
const showSecret = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

const editing = computed(() => !!props.link)
/** Categorias da lista e, editando, a que o link já tinha (mesmo fora da lista). */
const categoryOptions = computed(() => {
  const list = [...props.categories]
  if (props.link && !list.includes(props.link.category)) list.push(props.link.category)
  return list
})

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    const l = props.link
    form.title = l?.title ?? ''
    form.url = l?.url ?? ''
    form.category =
      l?.category ?? props.defaultCategory ?? (props.categories.includes('Outros') ? 'Outros' : props.categories[0] ?? '')
    form.companyId = l ? (l.companyId ?? '') : (props.defaultBrand ?? (props.brands.length === 1 ? props.brands[0]!.companyId : ''))
    form.username = l?.username ?? ''
    form.secret = ''
    form.clearSecret = false
    form.notes = l?.notes ?? ''
    showSecret.value = false
    error.value = null
  },
  { immediate: true },
)

/** "instagram.com/x" vira "https://instagram.com/x" ao sair do campo. */
function normalizeUrl() {
  const v = form.url.trim()
  if (v && !/^[a-z][a-z0-9+.-]*:/i.test(v)) form.url = `https://${v}`
}

const valid = computed(() => !!form.title.trim() && !!form.url.trim())

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

async function onSubmit() {
  normalizeUrl()
  if (!valid.value || saving.value) return
  const input: LinkInput = {
    title: form.title.trim(),
    url: form.url.trim(),
    category: form.category,
    companyId: form.companyId || null,
    username: form.username.trim() || null,
    notes: form.notes.trim() || null,
  }
  if (form.secret) input.secret = form.secret
  else if (editing.value && form.clearSecret) input.secret = null
  saving.value = true
  error.value = null
  try {
    await props.submit(input, props.link?.id ?? null)
    saving.value = false
    form.secret = ''
    emit('update:modelValue', false)
  } catch (err) {
    error.value = apiErrorMessage(err, 'Não deu para salvar o link. Tente de novo.')
    saving.value = false
  }
}
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    :label="editing ? 'Editar link' : 'Novo link'"
    size="md"
    :loading="saving"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <form class="ld" autocomplete="off" novalidate @submit.prevent="onSubmit">
      <header class="ld__head">
        <KeyRound :size="17" aria-hidden="true" />
        <h2>{{ editing ? 'Editar link' : 'Novo link' }}</h2>
        <button type="button" class="mk-icon-btn" aria-label="Fechar" :disabled="saving" @click="close">
          <X :size="16" />
        </button>
      </header>

      <div class="ld__body">
        <label class="mk-field">
          <span class="mk-label">Nome</span>
          <input v-model="form.title" class="mk-input" maxlength="200" placeholder="Ex.: Instagram da PetJourney" autofocus data-field="title" />
        </label>
        <label class="mk-field">
          <span class="mk-label">Endereço</span>
          <input
            v-model="form.url"
            class="mk-input"
            type="url"
            inputmode="url"
            maxlength="2000"
            placeholder="https://"
            data-field="url"
            @blur="normalizeUrl"
          />
        </label>
        <div class="ld__row">
          <label class="mk-field">
            <span class="mk-label">Categoria</span>
            <select v-model="form.category" class="mk-select" data-field="category">
              <option v-for="c in categoryOptions" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
          <label v-if="brands.length > 1 || editing" class="mk-field">
            <span class="mk-label">Marca</span>
            <select v-model="form.companyId" class="mk-select" data-field="brand">
              <option value="">Todas as marcas (grupo)</option>
              <option v-for="b in brands" :key="b.companyId" :value="b.companyId">{{ b.name }}</option>
            </select>
          </label>
        </div>
        <div class="ld__row">
          <label class="mk-field">
            <span class="mk-label">Usuário <span class="ld__opt">(opcional)</span></span>
            <input v-model="form.username" class="mk-input" maxlength="200" autocomplete="off" data-field="username" />
          </label>
          <div class="mk-field">
            <label class="mk-label" for="ld-secret">
              Senha <span class="ld__opt">{{ editing && link?.hasSecret ? '(vazio mantém a guardada)' : '(opcional)' }}</span>
            </label>
            <div class="ld__secret">
              <input
                id="ld-secret"
                v-model="form.secret"
                class="mk-input"
                :type="showSecret ? 'text' : 'password'"
                maxlength="2000"
                autocomplete="new-password"
                :placeholder="editing && link?.hasSecret ? 'Senha guardada' : ''"
                :disabled="form.clearSecret"
                data-field="secret"
              />
              <button
                type="button"
                class="mk-icon-btn"
                :aria-label="showSecret ? 'Esconder o que digitei' : 'Mostrar o que digitei'"
                @click="showSecret = !showSecret"
              >
                <EyeOff v-if="showSecret" :size="15" />
                <Eye v-else :size="15" />
              </button>
            </div>
            <label v-if="editing && link?.hasSecret" class="ld__clear">
              <input v-model="form.clearSecret" type="checkbox" data-field="clear-secret" />
              Apagar senha guardada
            </label>
          </div>
        </div>
        <label class="mk-field">
          <span class="mk-label">Observações <span class="ld__opt">(opcional)</span></span>
          <textarea v-model="form.notes" class="mk-textarea" rows="2" maxlength="5000" placeholder="Ex.: 2FA no celular da Letícia" data-field="notes" />
        </label>
        <p class="mk-hint">A senha fica cifrada no servidor e só aparece em "Revelar", que fica registrado no histórico.</p>
        <p v-if="error" class="mk-error" role="alert">{{ error }}</p>
      </div>

      <footer class="ld__foot">
        <button type="button" class="mk-btn mk-btn--ghost" :disabled="saving" @click="close">Cancelar</button>
        <button type="submit" class="mk-btn mk-btn--primary" :disabled="!valid || saving" data-action="save-link">
          <Loader2 v-if="saving" :size="14" class="ld__spin" aria-hidden="true" />
          {{ editing ? 'Salvar' : 'Criar link' }}
        </button>
      </footer>
    </form>
  </AppDialog>
</template>

<style scoped>
.ld {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ld__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 14px 8px 18px;
  color: var(--accent-ink);
}

.ld__head h2 {
  flex: 1;
  margin: 0;
  color: var(--text);
  font-size: 16px;
  font-weight: 700;
}

.ld__body {
  display: grid;
  gap: 12px;
  padding: 4px 18px 14px;
  overflow-y: auto;
}

.ld__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.ld__opt {
  color: var(--text-3);
  font-weight: 500;
}

.ld__secret {
  display: flex;
  gap: 4px;
}

.ld__clear {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-2);
  font-size: 12.5px;
  cursor: pointer;
}

.ld .mk-hint,
.ld .mk-error {
  margin: 0;
}

.ld__foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px 16px;
  border-top: 1px solid var(--border);
}

.ld__spin {
  animation: ld-spin 0.8s linear infinite;
}

@keyframes ld-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .ld__clear {
    min-height: 44px;
  }
}
</style>
