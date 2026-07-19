/**
 * Estado de gravação de um autosave, do jeito honesto: enquanto a request está
 * no ar é "salvando", só vira "salvo" quando o servidor confirma, e "erro"
 * quando falha (com opção de tentar de novo). Compartilhado entre o indicador
 * (`SaveStatus.vue`), os campos inline (`InlineEditText.vue`) e a camada de
 * dados que dispara as mutações.
 */
export type SaveState = 'idle' | 'saving' | 'saved' | 'error'
