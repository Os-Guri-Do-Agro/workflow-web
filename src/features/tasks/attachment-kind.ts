/**
 * Reexport de compatibilidade: a classificação de arquivo foi promovida para
 * `@/utils/file-kind` quando o Drive passou a precisar dela (spec drive-p1).
 * Imports existentes da área de tarefas continuam funcionando por aqui;
 * código novo deve importar de `@/utils/file-kind` direto.
 */
export * from '@/utils/file-kind'
