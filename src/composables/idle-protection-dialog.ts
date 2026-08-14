import { ref } from 'vue'

/**
 * Abertura do diálogo de proteção do cronômetro.
 *
 * Estado de módulo (e não prop) porque quem PEDE para abrir são os três pontos
 * de início do timer (widget e as duas ações da tela /time), enquanto quem
 * DESENHA é um único componente montado no AppShell. Passar isso por props
 * atravessaria três níveis de componente sem ganho nenhum.
 */
export const protectionDialogOpen = ref(false)

export function openProtectionDialog(): void {
  protectionDialogOpen.value = true
}

export function closeProtectionDialog(): void {
  protectionDialogOpen.value = false
}
