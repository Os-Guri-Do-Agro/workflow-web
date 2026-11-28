import { ref, watch } from 'vue'
import { safeStorage } from '@/utils/safe-storage'
import { browserTimeZone, isValidTimeZone } from '../booking-time'

const KEY = 'booking:invitee-tz'

/**
 * Fuso em que o convidado vê os horários. Começa no fuso do navegador (o que
 * acerta para quase todo mundo) e lembra a troca manual: quem está viajando e
 * prefere ver no fuso de casa não deveria precisar trocar a cada página.
 */
export function useInviteeTimezone() {
  const stored = safeStorage.getItem(KEY)
  const timezone = ref(stored && isValidTimeZone(stored) ? stored : browserTimeZone())
  watch(timezone, (tz) => {
    if (tz === browserTimeZone()) safeStorage.removeItem(KEY)
    else safeStorage.setItem(KEY, tz)
  })
  return timezone
}
