<template>
  <v-dialog v-model="dialog" max-width="500">
    <template v-slot:activator="{ props }">
      <v-btn color="primary" v-bind="props">Nova Empresa</v-btn>
    </template>
    <v-card>
      <v-card-title>Cadastrar Empresa</v-card-title>
      <v-card-text>
        <v-form ref="form" @submit.prevent="handleSubmit">
          <v-text-field
            v-model="formData.name"
            label="Nome da Empresa"
            :rules="[rules.required]"
            required
          />
          <v-text-field
            v-model="formData.cnpj"
            label="CNPJ"
            :rules="[rules.required, rules.cnpj]"
            @input="applyCnpjMask"
            maxlength="18"
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
import companieService from '@/service/companies/companies-services'

const emit = defineEmits(['created'])

const dialog = ref(false)
const loading = ref(false)
const form = ref()
const formData = ref({ name: '', cnpj: '' })

const rules = {
  required: (v: string) => !!v || 'Campo obrigatório',
  cnpj: (v: string) => {
    const cleaned = v.replace(/\D/g, '')
    return cleaned.length === 14 || 'CNPJ deve ter 14 dígitos'
  },
}

const applyCnpjMask = (e: Event) => {
  const input = (e.target as HTMLInputElement).value
  const cleaned = input.replace(/\D/g, '')
  let masked = cleaned
  if (cleaned.length <= 14) {
    masked = cleaned
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }
  formData.value.cnpj = masked
}

const handleSubmit = async () => {
  const { valid } = await form.value.validate()
  if (!valid) return

  loading.value = true
  try {
    await companieService.postCompany(formData.value)
    dialog.value = false
    formData.value = { name: '', cnpj: '' }
    form.value.reset()
    emit('created')
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}
</script>
