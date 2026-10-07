'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'

import ClanFollowDangerZone from '@/components/clan/ClanFollowDangerZone'
import ClanSubdomainSettings from '@/components/clan/ClanSubdomainSettings'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { NavigationTrail } from '@/components/ui/NavigationTrail'

/**
 * Fiche d'un clan côté Plateforme (docs/TODO/administration.md, lot 3b) : réglages qui engagent toute la plateforme,
 * sortis de l'accueil « Mon clan » — sous-domaine et arrêt (ou reprise) du suivi.
 */

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default function PlatformClanPage() {
  const params = useParams()
  const clanId = parseClanId(params.clanId)

  if (!clanId) {
    return (
      <main className="app-container app-main flex-1">
        <p className="text-sm text-red-600">Identifiant de clan invalide.</p>
      </main>
    )
  }

  return (
    <main className="app-container app-main flex-1 space-y-6">
      <NavigationTrail
        currentLabel="Fiche du clan"
        currentHref={`/settings/clans/${clanId}`}
        fallbackParent={{ href: '/settings/clans', label: 'Clans' }}
      />
      <section className="app-panel p-6">
        <SettingsPageHeader
          title="Fiche du clan"
          subtitle="Réglages de plateforme du clan : sous-domaine et suivi."
          actions={
            <Link href={`/clans/${clanId}/settings`} className="app-btn app-btn--sm app-btn--secondary">
              Paramètres du clan
            </Link>
          }
        />
      </section>
      <ClanSubdomainSettings clanId={clanId} />
      <ClanFollowDangerZone clanId={clanId} />
    </main>
  )
}
