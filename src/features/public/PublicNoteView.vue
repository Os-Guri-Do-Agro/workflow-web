<script setup lang="ts">
/**
 * Nota pública read-only por token. Molde de PublicBoardView. O HTML da nota
 * vem de outro usuário e é renderizado no navegador de terceiros: passa SEMPRE
 * por DOMPurify (o servidor não sanitiza). Sem isso, `<img onerror>` de uma
 * nota executaria aqui.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import DOMPurify from 'dompurify'
import { Loader2, Lock } from 'lucide-vue-next'
import shareService from '@/service/share/share-service'
import { getApiErrorMessage } from '@/service/api'
import type { PublicNote } from '@/features/notes/types'
import '@/features/notes/styles/note-content.css'

const route = useRoute()
const data = ref<PublicNote | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const token = computed(() => String(route.params.token ?? ''))
const safeHtml = computed(() =>
  data.value ? DOMPurify.sanitize(data.value.note.contentHtml) : '',
)
const updatedLabel = computed(() =>
  data.value
    ? new Date(data.value.note.updatedAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '',
)

onMounted(async () => {
  try {
    data.value = await shareService.publicNote(token.value)
  } catch (err) {
    error.value = getApiErrorMessage(err, 'Não foi possível abrir a nota compartilhada.')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="pub">
    <div v-if="loading" class="pub__state">
      <Loader2 :size="22" class="spin" />
      <span>Carregando nota…</span>
    </div>

    <div v-else-if="error" class="pub__state">
      <Lock :size="22" />
      <span>{{ error }}</span>
    </div>

    <article v-else-if="data" class="pub__paper">
      <img v-if="data.note.coverImage" :src="data.note.coverImage" alt="" class="pub__cover" />

      <header class="pub__head">
        <span class="pub__eyebrow">
          <Lock :size="12" />
          Nota compartilhada · somente leitura
        </span>
        <div class="pub__title-row">
          <span v-if="data.note.emoji" class="pub__emoji" aria-hidden="true">{{ data.note.emoji }}</span>
          <h1>{{ data.note.title || 'Sem título' }}</h1>
        </div>
        <p class="pub__meta">Por {{ data.note.author }} · atualizada em {{ updatedLabel }}</p>
      </header>

      <!-- eslint-disable-next-line vue/no-v-html - sanitizado por DOMPurify acima -->
      <div class="note-prose" v-html="safeHtml" />
    </article>
  </div>
</template>

<style scoped>
.pub {
  min-height: 100vh;
  padding: 48px 24px 25vh;
  background: var(--bg);
}

.pub__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 22vh;
  color: var(--text-3);
}

.pub__paper {
  width: 100%;
  max-width: 72ch;
  margin: 0 auto;
}

.pub__cover {
  width: 100%;
  height: 200px;
  margin-bottom: 28px;
  object-fit: cover;
  border-radius: var(--radius-lg);
}

.pub__head {
  margin-bottom: 26px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border);
}

.pub__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-3);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.pub__title-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 10px;
}

.pub__emoji {
  font-size: 34px;
  line-height: 1.15;
}

.pub__title-row h1 {
  margin: 0;
  color: var(--text);
  font-size: var(--text-title-large, 32px);
  font-weight: 680;
  letter-spacing: -0.026em;
  line-height: 1.15;
}

.pub__meta {
  margin: 10px 0 0;
  color: var(--text-3);
  font-size: 12.5px;
}

.spin {
  animation: pub-spin 1s linear infinite;
}

@keyframes pub-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation-duration: 2.4s;
  }
}
</style>
