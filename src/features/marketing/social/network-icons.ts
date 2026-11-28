import { Facebook, Instagram, Linkedin, Megaphone, Music2, Share2, Youtube, type LucideIcon } from 'lucide-vue-next'

/** Ícone de cada rede (o TikTok não tem no lucide: nota musical, como o app). */
export const NETWORK_ICON: Record<string, LucideIcon> = {
  INSTAGRAM: Instagram,
  FACEBOOK: Facebook,
  YOUTUBE: Youtube,
  LINKEDIN: Linkedin,
  TIKTOK: Music2,
  META_ADS: Megaphone,
}

export function networkIcon(network: string): LucideIcon {
  return NETWORK_ICON[network] ?? Share2
}
