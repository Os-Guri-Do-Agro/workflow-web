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
          <v-select
            v-model="formData.role"
            label="Tipo de Usuário"
            :items="roles"
            :rules="[rules.required]"
            required
          />
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

const emit = defineEmits(['created'])

const dialog = ref(false)
const loading = ref(false)
const showPassword = ref(false)
const form = ref()
const formData = ref({ name: '', email: '', password: '', role: '' })

const roles = [
  { title: 'Cliente', value: 'CLIENT' },
  { title: 'Trabalhador', value: 'WORKER' },
]

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
  if (!valid) return

  loading.value = true
  try {
    await userService.postUser(formData.value)
    dialog.value = false
    formData.value = { name: '', email: '', password: '', role: '' }
    form.value.reset()
    emit('created')
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}
</script>
