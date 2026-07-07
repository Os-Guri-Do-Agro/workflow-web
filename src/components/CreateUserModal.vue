<template>
  <v-dialog v-model="dialog" max-width="500">
    <template v-slot:activator="{ props }">
      <v-btn color="primary" v-bind="props">Novo Usuário</v-btn>
    </template>
    <v-card>
      <v-card-title>Cadastrar Usuário</v-card-title>
      <v-card-text>
        <v-form ref="form" @submit.prevent="handleSubmit">
          <v-text-field v-model="formData.name" label="Nome" :rules="[rules.required]" required />
          <v-text-field
            v-model="formData.email"
            label="Email"
            type="email"
            :rules="[rules.required, rules.email]"
            required
          />
          <v-text-field
            v-model="formData.password"
            label="Senha"
            :type="showPassword ? 'text' : 'password'"
            :rules="[rules.required, rules.password]"
            :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showPassword = !showPassword"
            required
          />
          <div class="field-block">
            <span class="field-label">Tipo de Usuário</span>
            <AppSelect
              :model-value="formData.role"
              :items="roles"
              label="Tipo de Usuário"
              placeholder="Selecione o tipo"
              @update:model-value="onRoleChange(String($event))"
            />
            <span v-if="roleError" class="field-error">{{ roleError }}</span>
          </div>
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="dialog = false">Cancelar</v-btn>
        <v-btn color="secondary" :loading="loading" @click="handleSubmit">Salvar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import userService from '@/service/user/user-service'
import { useToast } from '@/composables/useToast'
import AppSelect from '@/components/ui/AppSelect.vue'

const { success, error: showError } = useToast()

const emit = defineEmits(['created'])

const dialog = ref(false)
const loading = ref(false)
const showPassword = ref(false)
const form = ref()
const formData = ref({ name: '', email: '', password: '', role: '' })
// Erro de "obrigatório" do tipo de usuário (AppSelect não usa :rules do Vuetify).
const roleError = ref('')

const roles = [
  { label: 'Trabalhador', value: 'WORKER' },
  { label: 'Admin', value: 'ADMIN' },
]

const onRoleChange = (value: string) => {
  formData.value.role = value
  if (value) roleError.value = ''
}

const rules = {
  required: (v: string) => !!v || 'Campo obrigatório',
  email: (v: string) => {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return pattern.test(v) || 'Email inválido'
  },
  password: (v: string) => {
    if (v.length < 6) return 'Senha deve ter no mínimo 6 caracteres'
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(v)
    return hasSpecial || 'Senha deve conter pelo menos 1 caractere especial'
  },
}

const handleSubmit = async () => {
  const { valid } = await form.value.validate()
  // Validação do tipo de usuário (obrigatório) feita à mão — AppSelect não tem :rules.
  if (!formData.value.role) {
    roleError.value = 'Campo obrigatório'
    return
  }
  if (!valid) return

  loading.value = true
  try {
    await userService.postUser(formData.value)
    dialog.value = false
    formData.value = { name: '', email: '', password: '', role: '' }
    roleError.value = ''
    form.value.reset()
    emit('created')
    success('Usuário criado com sucesso')
  } catch (error: any) {
    showError(error?.response?.data?.message || 'Erro ao criar usuário')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* Bloco de campo do AppSelect (label visível + erro inline), tokenizado. */
.field-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 8px 0 4px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.field-error {
  font-size: 11px;
  color: var(--err);
}
</style>
