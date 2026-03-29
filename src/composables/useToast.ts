import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastState {
  show: boolean
  message: string
  type: ToastType
  timeout: number
}

const state = ref<ToastState>({
  show: false,
  message: '',
  type: 'success',
  timeout: 3000,
})

function showToast(message: string, type: ToastType = 'success', timeout = 3000) {
  state.value = { show: true, message, type, timeout }
}

function hideToast() {
  state.value.show = false
}

export function useToast() {
  return {
    toast: state,
    showToast,
    hideToast,
    success: (msg: string) => showToast(msg, 'success'),
    error: (msg: string) => showToast(msg, 'error'),
    warning: (msg: string) => showToast(msg, 'warning'),
    info: (msg: string) => showToast(msg, 'info'),
  }
}
