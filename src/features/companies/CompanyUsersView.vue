<script setup lang="ts">
import { ref, onMounted } from 'vue'
import companieService from '@/service/companies/companies-services'
import AddUserModal from './components/AddUserModal.vue'
import BulkAddUsersModal from './components/BulkAddUsersModal.vue'
import CreateCompanyModal from './components/CreateCompanyModal.vue'
import CreateUserModal from '@/components/CreateUserModal.vue'

type Company = {
  id: string
  name: string
  cnpj: string
  usersCount: number
}

type UserCompany = {
  role: string
  joinedAt: string
  company: {
    id: string
    name: string
    cnpj: string
  }
}

const tab = ref('user')
const systemCompanies = ref<Company[]>([])
const userCompanies = ref<UserCompany[]>([])
const showAddUserModal = ref(false)
const showBulkAddModal = ref(false)
const showUserAddModal = ref(false)
const selectedCompany = ref<any>(null)

const fetchSystemCompanies = async () => {
  try {
    const data = await companieService.getCompanyAll()
    systemCompanies.value = data.map((company: any) => ({
      id: company.id,
      name: company.name,
      cnpj: company.cnpj,
      usersCount: 0,
    }))
  } catch (error) {
    console.error('Erro ao carregar empresas do sistema:', error)
  }
}

const fetchUserCompanies = async () => {
  try {
    const data = await companieService.getCompany()
    userCompanies.value = data
  } catch (error) {
    console.error('Erro ao carregar empresas do usuário:', error)
  }
}

const openAddUser = (company: Company) => {
  selectedCompany.value = company
  showAddUserModal.value = true
}

const openBulkAdd = (company: Company) => {
  selectedCompany.value = company
  showBulkAddModal.value = true
}

const openUserAdd = (userCompany: UserCompany) => {
  selectedCompany.value = userCompany.company
  showUserAddModal.value = true
}

onMounted(() => {
  fetchSystemCompanies()
  fetchUserCompanies()
})
</script>

<template>
  <v-container fluid class="pa-6">
    <div class="d-flex align-center justify-space-between mb-6">
      <div>
        <h1 class="text-h4 font-weight-bold mb-1">Usuários / Empresas</h1>
        <p class="text-body-2 text-medium-emphasis">Gerencie usuários das empresas do projeto</p>
      </div>
      <div class="d-flex ga-2">
        <CreateUserModal />
        <CreateCompanyModal @created="fetchSystemCompanies" />
      </div>
    </div>

    <v-tabs v-model="tab" bg-color="primary" class="mb-6">
      <v-tab value="user">Minhas Empresas</v-tab>
      <v-tab value="system">Empresas do Sistema</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <v-window-item value="system" class="py-4">
        <v-row>
          <v-col v-for="company in systemCompanies" :key="company.id" cols="12" md="6" lg="4">
            <v-card rounded="lg" elevation="2" hover>
              <v-card-title class="d-flex align-center ga-3 bg-primary pa-4">
                <v-icon color="secondary" size="32">mdi-office-building</v-icon>
                <div class="flex-grow-1">
                  <div class="text-subtitle-1 font-weight-bold text-secondary">{{ company.name }}</div>
                  <div class="text-caption text-secondary-lighten-2">{{ company.cnpj }}</div>
                </div>
              </v-card-title>

              <v-card-text class="pa-4">
                <v-divider class="mb-4" />

                <div class="d-flex flex-column ga-2">
                  <v-btn
                    color="primary"
                    variant="flat"
                    prepend-icon="mdi-account-plus"
                    block
                    @click="openAddUser(company)"
                  >
                    Adicionar Usuário
                  </v-btn>

                  <v-btn
                    color="secondary"
                    variant="outlined"
                    prepend-icon="mdi-account-multiple-plus"
                    block
                    @click="openBulkAdd(company)"
                  >
                    Adicionar em Lote
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-window-item>

      <v-window-item value="user" class="py-4">
        <v-row>
          <v-col v-for="item in userCompanies" :key="item.company.id" cols="12" md="6" lg="4">
            <v-card rounded="lg" elevation="2" hover>
              <v-card-title class="d-flex align-center ga-3 bg-primary pa-4">
                <v-icon color="secondary" size="32">mdi-office-building</v-icon>
                <div class="flex-grow-1">
                  <div class="text-subtitle-1 font-weight-bold text-secondary">{{ item.company.name }}</div>
                  <div class="text-caption text-secondary-lighten-2">{{ item.company.cnpj }}</div>
                </div>
              </v-card-title>

              <v-card-text class="pa-4">
                <v-divider class="mb-4" />

                <v-btn
                  color="primary"
                  variant="flat"
                  prepend-icon="mdi-account-plus"
                  block
                  @click="openUserAdd(item)"
                >
                  Adicionar Usuário
                </v-btn>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-window-item>
    </v-window>

    <AddUserModal v-model="showAddUserModal" :company="selectedCompany" />
    <AddUserModal v-model="showUserAddModal" :company="selectedCompany" />
    <BulkAddUsersModal v-model="showBulkAddModal" :company="selectedCompany" />
  </v-container>
</template>
