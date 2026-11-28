/**
 * Agendamento público estilo Calendly.
 * Spec: docs/specs/2026/q4/agendamento-publico.md
 *
 * Duas superfícies com clientes diferentes de propósito:
 * - `bookingService` (logado, `api`): o DONO configura página, horários e tipos.
 * - `publicBookingService` (`publicApi`, sem token): quem marca, remarca e
 *   cancela. O `publicApi` não manda Authorization nem dispara o redirect de
 *   sessão expirada, então um anfitrião logado testando o próprio link vê
 *   exatamente o que o convidado vê.
 *
 * Todo horário trafega como INSTANTE ISO (UTC). Quem decide em que fuso
 * mostrar é a tela: o anfitrião pensa no fuso dele, o convidado no dele.
 */
import api, { publicApi } from '../api'

export interface ClockInterval {
  start: string // "HH:MM"
  end: string // "HH:MM" (aceita "24:00")
}

export interface WeeklyRule extends ClockInterval {
  /** 0 = domingo ... 6 = sábado */
  day: number
}

export interface DateOverride {
  date: string // "YYYY-MM-DD" no fuso do anfitrião
  /** Vazio = dia inteiro indisponível. */
  intervals: ClockInterval[]
}

export interface BookingEventType {
  id: string
  slug: string
  title: string
  description: string | null
  durationMin: number
  slotStepMin: number
  bufferBeforeMin: number
  bufferAfterMin: number
  minNoticeMin: number
  maxDaysAhead: number
  dailyLimit: number | null
  active: boolean
  position: number
  upcomingCount: number
  publicUrl: string
}

export interface BookingPage {
  id: string
  slug: string
  timezone: string
  displayName: string | null
  headline: string | null
  active: boolean
  weeklyHours: WeeklyRule[]
  dateOverrides: DateOverride[]
  publicUrl: string
  eventTypes: BookingEventType[]
}

export interface GoogleHealth {
  connected: boolean
  email: string | null
  /** false = conectado, mas o Google recusa a autorização (reconectar). */
  healthy: boolean
}

export interface BookingOverview {
  page: BookingPage | null
  google: GoogleHealth
  suggestedSlug: string | null
  publicBaseUrl: string
}

export interface UpsertPageInput {
  slug?: string
  timezone?: string
  displayName?: string | null
  headline?: string | null
  active?: boolean
  weeklyHours?: WeeklyRule[]
  dateOverrides?: DateOverride[]
}

export interface EventTypeInput {
  title: string
  slug?: string
  description?: string | null
  durationMin: number
  slotStepMin?: number
  bufferBeforeMin?: number
  bufferAfterMin?: number
  minNoticeMin?: number
  maxDaysAhead?: number
  dailyLimit?: number | null
  active?: boolean
  position?: number
}

export type BookingStatus = 'CONFIRMED' | 'CANCELED'
export type BookingActor = 'HOST' | 'INVITEE'
export type BookingScope = 'upcoming' | 'past' | 'canceled'

export interface HostBooking {
  id: string
  status: BookingStatus
  startAt: string
  endAt: string
  inviteeName: string
  inviteeEmail: string
  inviteeTimezone: string
  notes: string | null
  meetLink: string | null
  rescheduleCount: number
  canceledAt: string | null
  canceledBy: BookingActor | null
  cancelReason: string | null
  createdAt: string
  eventType: { id: string; title: string; slug: string; durationMin: number }
}

export interface SlugCheck {
  slug: string
  available: boolean
  reason: string | null
}

// ─── Público ────────────────────────────────────────────────────────────────

export interface PublicEventType {
  slug: string
  title: string
  description: string | null
  durationMin: number
  maxDaysAhead: number
}

export interface PublicHost {
  name: string
  headline: string | null
  /**
   * Foto do perfil no Nevo. Opcional porque a API pode ir ao ar depois do
   * front (deploys separados): sem o campo, a página mostra as iniciais.
   */
  avatarUrl?: string | null
}

export interface PublicPage {
  slug: string
  host: PublicHost
  timezone: string
  /** false = anfitrião sem Google conectado: a página existe, mas não marca. */
  accepting: boolean
  eventTypes: PublicEventType[]
}

export interface PublicEventTypeView {
  slug: string
  host: PublicHost
  timezone: string
  accepting: boolean
  eventType: PublicEventType
}

export interface PublicBooking {
  status: BookingStatus
  startAt: string
  endAt: string
  meetLink: string | null
  inviteeName: string
  inviteeEmail: string
  inviteeTimezone: string
  notes: string | null
  manageToken: string
  canceledAt: string | null
  canceledBy: BookingActor | null
  cancelReason: string | null
  canModify: boolean
  host: PublicHost & { timezone: string }
  page: { slug: string }
  eventType: PublicEventType
}

export interface CreateBookingInput {
  startAt: string
  name: string
  email: string
  timezone: string
  notes?: string
}

/** Segmento de URL vindo do router: reencoda para nunca virar caminho relativo. */
const seg = (value: string) => encodeURIComponent(value)

export const bookingService = {
  async overview(fresh = false) {
    const { data } = await api.get<BookingOverview>('/booking/page', {
      params: fresh ? { fresh: 1 } : undefined,
    })
    return data
  },

  async upsertPage(input: UpsertPageInput) {
    const { data } = await api.put<BookingOverview>('/booking/page', input)
    return data
  },

  async checkSlug(slug: string) {
    const { data } = await api.get<SlugCheck>('/booking/page/slug-check', { params: { slug } })
    return data
  },

  async createEventType(input: EventTypeInput) {
    const { data } = await api.post<BookingOverview>('/booking/event-types', input)
    return data
  },

  async updateEventType(id: string, input: Partial<EventTypeInput>) {
    const { data } = await api.patch<BookingOverview>(`/booking/event-types/${seg(id)}`, input)
    return data
  },

  async archiveEventType(id: string) {
    const { data } = await api.delete<BookingOverview>(`/booking/event-types/${seg(id)}`)
    return data
  },

  async listBookings(scope: BookingScope) {
    const { data } = await api.get<HostBooking[]>('/booking/bookings', { params: { scope } })
    return data
  },

  async cancelBooking(id: string, reason?: string) {
    const { data } = await api.post<HostBooking>(`/booking/bookings/${seg(id)}/cancel`, {
      reason: reason || undefined,
    })
    return data
  },

  /** URL de consentimento do Google, voltando para `returnTo` no fim. */
  async googleAuthUrl(returnTo: string) {
    const { data } = await api.get<{ url: string }>('/auth/google/link', { params: { returnTo } })
    return data.url
  },

  async disconnectGoogle() {
    await api.delete('/auth/google/link')
  },
}

export const publicBookingService = {
  async page(slug: string) {
    const { data } = await publicApi.get<PublicPage>(`/public/booking/pages/${seg(slug)}`)
    return data
  },

  async eventType(slug: string, eventSlug: string) {
    const { data } = await publicApi.get<PublicEventTypeView>(
      `/public/booking/pages/${seg(slug)}/${seg(eventSlug)}`,
    )
    return data
  },

  async slots(slug: string, eventSlug: string, range: { start: string; end: string }) {
    const { data } = await publicApi.get<{ slots: string[] }>(
      `/public/booking/pages/${seg(slug)}/${seg(eventSlug)}/slots`,
      { params: range },
    )
    return data.slots
  },

  async book(slug: string, eventSlug: string, input: CreateBookingInput) {
    const { data } = await publicApi.post<PublicBooking>(
      `/public/booking/pages/${seg(slug)}/${seg(eventSlug)}/book`,
      input,
    )
    return data
  },

  async manage(token: string) {
    const { data } = await publicApi.get<PublicBooking>(`/public/booking/manage/${seg(token)}`)
    return data
  },

  async manageSlots(token: string, range: { start: string; end: string }) {
    const { data } = await publicApi.get<{ slots: string[] }>(
      `/public/booking/manage/${seg(token)}/slots`,
      { params: range },
    )
    return data.slots
  },

  async reschedule(token: string, input: { startAt: string; timezone: string }) {
    const { data } = await publicApi.post<PublicBooking>(
      `/public/booking/manage/${seg(token)}/reschedule`,
      input,
    )
    return data
  },

  async cancel(token: string, reason?: string) {
    const { data } = await publicApi.post<PublicBooking>(`/public/booking/manage/${seg(token)}/cancel`, {
      reason: reason || undefined,
    })
    return data
  },
}
