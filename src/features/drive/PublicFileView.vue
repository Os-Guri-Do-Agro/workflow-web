<script setup lang="ts">
/**
 * Página pública de download (`/f/:token`). Sem shell, sem login.
 *
 * Quem chega aqui recebeu um link de alguém e precisa de duas respostas antes
 * de clicar: que arquivo é esse, e dá para confiar. Por isso a página mostra
 * nome, tipo e tamanho ANTES do botão, e diz de onde o link veio (o produto).
 *
 * Os três motivos de indisponibilidade viram mensagens diferentes: link
 * inexistente, revogado e expirado exigem ações diferentes de quem recebeu
 * (conferir o endereço, pedir de novo, pedir um novo prazo).
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Download, FileWarning, ShieldCheck } from 'lucide-vue-next'
import { publicApi } from '@/service/api'
import { formatBytes, iconOf, labelOf } from '@/utils/file-kind'
import { coverLabelOf, paletteOf } from '@/features/drive/file-palette'
import { kindOf } from '@/utils/file-kind'

interface PublicFileMeta {
  file: { name: string; mimeType: string; size: number }
  expiresAt: string | null
}

const route = useRoute()
// O router entrega o parâmetro já decodificado, então um link com `..%2F` no
// token viraria caminho relativo e a URL final normalizaria para outro
// endpoint da API. Reencodar mantém o token como um segmento só.
const token = encodeURIComponent(String(route.params.token ?? ''))

const meta = ref<PublicFileMeta | null>(null)
const errorMessage = ref<string | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const { data } = await publicApi.get<PublicFileMeta>(`/public/drive/${token}`)
    meta.value = data
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status
    const serverMessage = (error as { response?: { data?: { message?: string } } })
      ?.response?.data?.message
    errorMessage.value =
      serverMessage ??
      (status === 404
        ? 'Link não encontrado. Confira se o endereço foi copiado por inteiro.'
        : 'Não foi possível abrir este link agora.')
  } finally {
    loading.value = false
  }
})

function download() {
  // Navegação direta: a rota responde 302 para a URL assinada de 60s.
  window.location.href = `${publicApi.defaults.baseURL ?? ''}/public/drive/${token}/download`
}

function fileLike() {
  return {
    filename: meta.value?.file.name ?? '',
    mimeType: meta.value?.file.mimeType,
  }
}

/**
 * "PDF · 861 KB", não "PDF (PDF) · 861 KB": a extensão só entra quando
 * acrescenta informação ao nome da família (XLSX sob "Planilha", sim; PDF sob
 * "PDF", não).
 */
const description = computed(() => {
  if (!meta.value) return ''
  const family = labelOf(fileLike())
  const ext = coverLabelOf(meta.value.file.name, family)
  const head = ext && ext !== family.toUpperCase() ? `${family} (${ext})` : family
  const size = formatBytes(meta.value.file.size)
  return size ? `${head} · ${size}` : head
})
</script>

<template>
  <main class="pf">
    <div class="pf-card">
      <p v-if="loading" class="pf-loading">Carregando arquivo...</p>

      <template v-else-if="errorMessage">
        <div class="pf-icon pf-icon--err">
          <FileWarning :size="30" />
        </div>
        <h1 class="pf-title">Link indisponível</h1>
        <p class="pf-msg">{{ errorMessage }}</p>
      </template>

      <template v-else-if="meta">
        <div
          class="pf-icon"
          :style="{ '--pf-accent': paletteOf(kindOf(fileLike())).accent, background: paletteOf(kindOf(fileLike())).wash }"
        >
          <component :is="iconOf(fileLike())" :size="30" />
        </div>

        <h1 class="pf-title">{{ meta.file.name }}</h1>
        <p class="pf-msg">{{ description }}</p>

        <button type="button" class="pf-btn press" @click="download">
          <Download :size="17" />
          Baixar arquivo
        </button>

        <p class="pf-safe">
          <ShieldCheck :size="13" />
          Compartilhado por um usuário do sistema. O download é direto e o link
          pode ser revogado por quem enviou.
        </p>
      </template>
    </div>
  </main>
</template>

<style scoped>
.pf {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
  background: var(--bg);
}

.pf-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 100%;
  max-width: 420px;
  padding: 36px 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  text-align: center;
}

.pf-loading {
  margin: 0;
  color: var(--text-3);
  font-size: 13px;
}

.pf-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  color: var(--pf-accent, var(--text-2));
}

.pf-icon--err {
  color: var(--err);
  background: color-mix(in srgb, var(--err) 12%, transparent);
}

.pf-title {
  margin: 0;
  color: var(--text);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.35;
  word-break: break-word;
}

.pf-msg {
  margin: 0;
  color: var(--text-3);
  font-size: 12.5px;
  line-height: 1.5;
}

.pf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  margin-top: 6px;
  padding: 12px 24px;
  border: none;
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--accent-fg);
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
}

.pf-safe {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 4px 0 0;
  color: var(--text-4, var(--text-3));
  font-size: 10.5px;
  line-height: 1.5;
  text-align: left;
}
</style>
