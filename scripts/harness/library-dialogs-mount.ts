/**
 * Só do harness (o Vite serve em /scripts/harness/library-dialogs-mount.ts).
 *
 * Monta o "Escolher do acervo" e o "Mandar para o acervo" DENTRO da página do
 * app já aberta, com o roteador e o Vue Query próprios, para o
 * `marketing-library-e2e.cjs` exercitar os dois componentes antes de o
 * orquestrador costurá-los no diálogo de versão e no visualizador. O resultado
 * fica em `window.__libDialog` (ids escolhidos, item mandado).
 */
import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import LibraryPickerDialog from '@/features/marketing/library/LibraryPickerDialog.vue'
import SendToLibraryDialog from '@/features/marketing/library/SendToLibraryDialog.vue'

type Result = { picked?: string[]; sent?: { id: string; title: string }; closed?: boolean }
declare global {
  interface Window {
    __libDialog?: Result
  }
}

export function mountLibraryDialog(opts: {
  which: 'picker' | 'send'
  groupId: string
  companyId: string
  assetId?: string
  defaultTitle?: string
}) {
  const el = document.createElement('div')
  el.id = 'lib-dialog-harness'
  document.body.appendChild(el)
  window.__libDialog = {}
  const blank = { render: () => null }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/marketing/acervo', name: 'marketing-library', component: blank },
      { path: '/:rest(.*)*', component: blank },
    ],
  })
  const open = ref(true)
  const app = createApp({
    setup() {
      return () =>
        opts.which === 'picker'
          ? h(LibraryPickerDialog, {
              modelValue: open.value,
              groupId: opts.groupId,
              companyId: opts.companyId,
              'onUpdate:modelValue': (v: boolean) => {
                open.value = v
                if (!v) window.__libDialog = { ...window.__libDialog, closed: true }
              },
              onPicked: (ids: string[]) => {
                window.__libDialog = { ...window.__libDialog, picked: ids }
                open.value = false
              },
            })
          : h(SendToLibraryDialog, {
              modelValue: open.value,
              groupId: opts.groupId,
              assetId: opts.assetId ?? '',
              companyId: opts.companyId,
              defaultTitle: opts.defaultTitle ?? 'arquivo',
              'onUpdate:modelValue': (v: boolean) => {
                open.value = v
                if (!v) window.__libDialog = { ...window.__libDialog, closed: true }
              },
              onSent: (item: { id: string; title: string }) => {
                window.__libDialog = { ...window.__libDialog, sent: { id: item.id, title: item.title } }
              },
            })
    },
  })
  app.use(router)
  app.use(VueQueryPlugin, { queryClient: new QueryClient() })
  void router.push('/')
  app.mount(el)
  return () => {
    app.unmount()
    el.remove()
  }
}
