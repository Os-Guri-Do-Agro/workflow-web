<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import notesService from '@/service/notes/notes-service'

const router = useRouter()
const notes = ref<any[]>([])
const folders = ref<any[]>([])
const loading = ref(true)
const searchQuery = ref('')
const selectedFolder = ref<string | null>(null)

onMounted(async () => {
  await fetchNotes()
  await fetchFolders()
  loading.value = false
})

async function fetchNotes() {
  try {
    const response = await notesService.getNotes({
      folderId: selectedFolder.value || undefined,
      search: searchQuery.value || undefined,
    })
    notes.value = response
  } catch (e) {
    console.error('Erro ao buscar notas:', e)
  }
}

async function fetchFolders() {
  try {
    const response = await notesService.getFolders()
    folders.value = response
  } catch (e) {
    console.error('Erro ao buscar pastas:', e)
  }
}

function createNote() {
  router.push('/notes/new')
}

function openNote(id: string) {
  router.push(`/notes/${id}`)
}

function selectFolder(folderId: string | null) {
  selectedFolder.value = folderId
  fetchNotes()
}
</script>

<template>
  <div class="notes-page">
    <div class="notes-header">
      <div>
        <h1 class="notes-title">Notas</h1>
        <p class="notes-sub">Documentação e anotações do time</p>
      </div>
      <button class="create-btn" @click="createNote">
        <v-icon size="16">mdi-plus</v-icon>
        Nova Nota
      </button>
    </div>

    <div class="notes-layout">
      <!-- Sidebar -->
      <div class="notes-sidebar">
        <div class="search-box">
          <v-icon size="16" class="search-icon">mdi-magnify</v-icon>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Buscar notas..."
            @input="fetchNotes"
          />
        </div>

        <div class="folders-list">
          <div
            class="folder-item"
            :class="{ 'folder-item--active': selectedFolder === null }"
            @click="selectFolder(null)"
          >
            <v-icon size="16">mdi-note-multiple</v-icon>
            <span>Todas as notas</span>
            <span class="folder-count">{{ notes.length }}</span>
          </div>

          <div class="folder-divider">Pastas</div>

          <div
            v-for="folder in folders"
            :key="folder.id"
            class="folder-item"
            :class="{ 'folder-item--active': selectedFolder === folder.id }"
            @click="selectFolder(folder.id)"
          >
            <v-icon size="16">mdi-folder</v-icon>
            <span>{{ folder.name }}</span>
            <span class="folder-count">{{ folder._count?.notes || 0 }}</span>
          </div>
        </div>
      </div>

      <!-- Notes Grid -->
      <div class="notes-content">
        <div v-if="loading" class="notes-skeleton">
          <div v-for="i in 6" :key="i" class="note-skeleton" />
        </div>

        <div v-else-if="notes.length === 0" class="notes-empty">
          <v-icon size="48" color="grey-darken-2">mdi-note-text-outline</v-icon>
          <span>Nenhuma nota encontrada</span>
          <button class="create-btn-empty" @click="createNote">
            Criar primeira nota
          </button>
        </div>

        <div v-else class="notes-grid">
          <div
            v-for="note in notes"
            :key="note.id"
            class="note-card"
            :class="{ 'note-card--pinned': note.isPinned }"
            @click="openNote(note.id)"
          >
            <div class="note-header">
              <h3 class="note-title">{{ note.title }}</h3>
              <v-icon v-if="note.isPinned" size="14" color="warning">
                mdi-pin
              </v-icon>
            </div>
            <p class="note-preview">{{ note.content.substring(0, 100) }}...</p>
            <div class="note-meta">
              <span class="note-date">
                {{ new Date(note.updatedAt).toLocaleDateString('pt-BR') }}
              </span>
              <div v-if="note.tags?.length" class="note-tags">
                <span v-for="tag in note.tags.slice(0, 2)" :key="tag" class="tag">
                  {{ tag }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notes-page {
  padding: 24px;
  height: 100%;
}

.notes-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.notes-title {
  font-size: 22px;
  font-weight: 700;
  color: rgb(var(--v-theme-secondary));
  margin: 0 0 3px;
}

.notes-sub {
  font-size: 13px;
  color: rgba(var(--v-theme-secondary), 0.4);
  margin: 0;
}

.create-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: rgb(var(--v-theme-secondary));
  color: rgb(var(--v-theme-primary));
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.create-btn:hover {
  opacity: 0.9;
}

.notes-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
  height: calc(100% - 80px);
}

.notes-sidebar {
  background: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-secondary), 0.08);
  border-radius: 12px;
  padding: 12px;
  overflow-y: auto;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(var(--v-theme-secondary), 0.05);
  border-radius: 8px;
  margin-bottom: 12px;
}

.search-icon {
  color: rgba(var(--v-theme-secondary), 0.4);
}

.search-box input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 13px;
  color: rgb(var(--v-theme-secondary));
  outline: none;
}

.search-box input::placeholder {
  color: rgba(var(--v-theme-secondary), 0.4);
}

.folders-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.folder-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: rgba(var(--v-theme-secondary), 0.7);
  transition: all 0.12s ease;
}

.folder-item:hover {
  background: rgba(var(--v-theme-secondary), 0.05);
  color: rgb(var(--v-theme-secondary));
}

.folder-item--active {
  background: rgba(var(--v-theme-secondary), 0.08);
  color: rgb(var(--v-theme-secondary));
  font-weight: 500;
}

.folder-count {
  margin-left: auto;
  font-size: 11px;
  color: rgba(var(--v-theme-secondary), 0.4);
  background: rgba(var(--v-theme-secondary), 0.08);
  padding: 1px 6px;
  border-radius: 999px;
}

.folder-divider {
  font-size: 11px;
  font-weight: 600;
  color: rgba(var(--v-theme-secondary), 0.35);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 12px 10px 6px;
}

.notes-content {
  overflow-y: auto;
}

.notes-skeleton {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.note-skeleton {
  height: 140px;
  border-radius: 10px;
  background: rgba(var(--v-theme-secondary), 0.05);
  animation: shimmer 1.4s ease infinite;
}

.notes-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px;
  gap: 12px;
  color: rgba(var(--v-theme-secondary), 0.4);
}

.create-btn-empty {
  margin-top: 8px;
  padding: 8px 16px;
  background: rgba(var(--v-theme-secondary), 0.08);
  border: none;
  border-radius: 6px;
  font-size: 13px;
  color: rgb(var(--v-theme-secondary));
  cursor: pointer;
  transition: all 0.15s ease;
}

.create-btn-empty:hover {
  background: rgba(var(--v-theme-secondary), 0.12);
}

.notes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.note-card {
  background: rgb(var(--v-theme-primary));
  border: 1px solid rgba(var(--v-theme-secondary), 0.08);
  border-radius: 10px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.note-card:hover {
  border-color: rgba(var(--v-theme-secondary), 0.15);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.note-card--pinned {
  border-color: rgba(245, 158, 11, 0.3);
  background: rgba(245, 158, 11, 0.02);
}

.note-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.note-title {
  font-size: 14px;
  font-weight: 600;
  color: rgb(var(--v-theme-secondary));
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-preview {
  font-size: 13px;
  color: rgba(var(--v-theme-secondary), 0.6);
  margin: 0 0 12px;
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.note-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.note-date {
  font-size: 11px;
  color: rgba(var(--v-theme-secondary), 0.4);
}

.note-tags {
  display: flex;
  gap: 4px;
}

.tag {
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(var(--v-theme-secondary), 0.08);
  color: rgba(var(--v-theme-secondary), 0.6);
  border-radius: 4px;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
</style>
