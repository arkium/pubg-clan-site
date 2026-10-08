import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import AdminPageBanner from '@/components/settings/AdminPageBanner'

export { BANNER_GLASS_BUTTON } from '@/components/settings/AdminPageBanner'

/**
 * Bandeau d'une page des paramètres d'un clan (charte, En-têtes de page) : `AdminPageBanner`, dont le retour mène par
 * défaut à l'accueil « Paramètres du clan ».
 */
export default function ClanSettingsBanner({
  clanId,
  parent,
  ...banner
}: {
  clanId: string | number
  title: string
  subtitle: ReactNode
  icon: LucideIcon
  image: string
  imagePosition?: string
  currentHref: string
  pills?: ReactNode[]
  action?: ReactNode
  /** Page de retour quand l'historique ne fournit rien ; par défaut l'accueil « Paramètres du clan ». */
  parent?: { href: string; label: string }
}) {
  return (
    <AdminPageBanner
      {...banner}
      parent={parent ?? { href: `/clans/${clanId}/settings`, label: 'Paramètres du clan', altHref: '/clans' }}
    />
  )
}
