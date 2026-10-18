import { Suspense } from 'react'

import ClanOverviewFindings from '@/components/clan-overview/ClanOverviewFindings'
import ClanOverviewPage from '@/components/clan-overview/ClanOverviewPage'

/**
 * Vue d'ensemble d'un clan (docs/features/clans.md). La vitrine interactive est un composant client ; la page serveur
 * lui ajoute le bloc « En bref » du clan (chiffres, liens vers ses pages), calculé ici pour être dans le HTML
 * (docs/TODO/geo-seo-propositions.md, lot 2).
 */
export default async function ClanOverviewRoute({ params }: { params: Promise<{ clanId: string }> }) {
  const { clanId } = await params
  return (
    <ClanOverviewPage
      findings={
        <Suspense fallback={null}>
          <ClanOverviewFindings clanId={Number(clanId)} />
        </Suspense>
      }
    />
  )
}
