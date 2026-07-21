/**
 * Paleta e emojis das notas.
 *
 * Estes hex são a exceção documentada à regra "nunca hex em componente": o
 * valor é **dado persistido** (o backend guarda a cor escolhida em
 * `Note.noteColor` / `NoteFolder.color`), não decisão de tema. Os tons
 * acompanham os acentos de `plugins/tokens.ts` para não destoar do app.
 */
export const NOTE_COLORS = [
  '#2563EB',
  '#7C3AED',
  '#059669',
  '#EA580C',
  '#DB2777',
  '#0891B2',
  '#CA8A04',
  '#DC2626',
  '#475569',
] as const

export const NOTE_EMOJIS = [
  '📝', '📌', '📒', '📚', '💡', '⭐', '✅', '🔥',
  '🎯', '🚀', '🧠', '❤️', '⚠️', '📊', '🗂️', '🔖',
  '💬', '🛠️', '📅', '✨', '🎨', '🧩', '🏆', '📎',
] as const
