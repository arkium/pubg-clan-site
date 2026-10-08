import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import ClanSettingsBanner from '@/components/clan-settings/ClanSettingsBanner'
import DataSectionTabs from '@/components/clan-settings/DataSectionTabs'

export { BANNER_GLASS_BUTTON } from '@/components/clan-settings/ClanSettingsBanner'

/**
 * En-tête des onglets de « Données » d'un clan selon la charte (docs/ui/index.html, En-têtes de page) : fil d'Ariane,
 * bandeau photo commun à la section, pastille « Réservé au SuperUser », puis les onglets.
 */
export default function DataSectionHeader({
  clanId,
  title,
  subtitle,
  icon,
  currentHref,
  pills = [],
  action,
}: {
  clanId: string | number
  title: string
  subtitle: string
  icon: LucideIcon
  currentHref: string
  pills?: ReactNode[]
  action?: ReactNode
}) {
  return (
    <>
      <ClanSettingsBanner
        clanId={clanId}
        title={title}
        subtitle={subtitle}
        icon={icon}
        image="/matchtelemetry.jpg"
        imagePosition="center 30%"
        currentHref={currentHref}
        pills={[...pills, 'Réservé au SuperUser']}
        action={action}
      />
      <DataSectionTabs clanId={clanId} />
    </>
  )
}
