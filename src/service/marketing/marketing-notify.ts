import api from '../api'
import { mkt } from './marketing-core'

/**
 * "Meus avisos" (spec R2, C3) e a meta de cadência (C4). O sino recebe sempre;
 * a preferência decide push e e-mail de cada pessoa no grupo.
 */

export type NotifyEmailMode = 'OFF' | 'IMMEDIATE' | 'DAILY'

export interface NotifyKind {
  kind: string
  label: string
  area: string
}

export interface NotifyPrefs {
  push: boolean
  email: NotifyEmailMode
  muted: string[]
  kinds: NotifyKind[]
  /** Sem VAPID no servidor o push não sai. */
  pushAvailable: boolean
  /** Sem SendGrid o e-mail não sai. */
  emailAvailable: boolean
  emailAddress: string | null
  digestHour: string
}

export async function getNotifyPrefs(groupId: string) {
  const { data } = await api.get<NotifyPrefs>(mkt(groupId, '/notify/prefs'))
  return data
}

/**
 * PUT parcial. Para os silenciados a tela manda o delta (`mute`/`unmute`, só o
 * tipo que mudou): duas abas mexendo em tipos diferentes somam. `muted` (a
 * lista inteira) segue aceito pela API.
 */
export interface SaveNotifyPrefsBody extends Partial<Pick<NotifyPrefs, 'push' | 'email' | 'muted'>> {
  mute?: string[]
  unmute?: string[]
}

export async function saveNotifyPrefs(groupId: string, body: SaveNotifyPrefsBody) {
  const { data } = await api.put<NotifyPrefs>(mkt(groupId, '/notify/prefs'), body)
  return data
}

// ── Meta de cadência ───────────────────────────────────────────────────────

export interface CadenceWeek {
  key: string
  monday: string
  sunday: string
  alertDay: boolean
}

export interface CadenceGoal {
  id: string
  companyId: string
  network: string
  networkName: string
  perWeek: number
  active: boolean
  updatedAt: string
  done: number
  met: boolean
}

export interface CadenceList {
  week: CadenceWeek
  canEdit?: boolean
  goals: CadenceGoal[]
}

/** Item da faixa "Cadência da semana" do painel inicial. */
export interface CadenceStatus {
  goalId: string
  companyId: string
  network: string
  networkName: string
  perWeek: number
  done: number
  missing: number
  met: boolean
  label: string
}

export async function getCadence(groupId: string) {
  const { data } = await api.get<CadenceList>(mkt(groupId, '/cadence'))
  return data
}

export async function saveCadenceGoal(
  groupId: string,
  body: { companyId: string; network: string; perWeek: number; active?: boolean },
) {
  const { data } = await api.put(mkt(groupId, '/cadence'), body)
  return data
}

export async function removeCadenceGoal(groupId: string, goalId: string) {
  await api.delete(mkt(groupId, `/cadence/${encodeURIComponent(goalId)}`))
}
