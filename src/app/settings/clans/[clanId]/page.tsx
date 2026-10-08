'use client'

import { Settings, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import ClanFollowDangerZone from '@/components/clan/ClanFollowDangerZone'
import ClanSubdomainSettings from '@/components/clan/ClanSubdomainSettings'
import ClanSettingsBanner, { BANNER_GLASS_BUTTON } from '@/components/clan-settings/ClanSettingsBanner'
import { ErrorState } from '@/components/ui/CharteKit'

/**
 * Fiche d'un clan côté Plateforme (docs/TODO/administration.md, lot 3b), selon la charte UI (docs/ui/index.html) :
 * réglages qui engagent toute la plateforme, sortis de l'accueil « Mon clan » — sous-domaine et arrêt (ou reprise) du
 * suivi. Réservée au SuperUser (garde du dossier et des routes).
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
      <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
        <section className="app-panel">
          <ErrorState message="Identifiant de clan invalide." />
        </section>
      </div>
    )
  }

  return (
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
      <ClanSettingsBanner
        clanId={clanId}
        title="Sous-domaine et suivi"
        subtitle="Réglages de plateforme du clan : son adresse en sous-domaine, et l’arrêt ou la reprise de son suivi."
        icon={ShieldCheck}
        image="/clan_banner.jpg"
        currentHref={`/settings/clans/${clanId}`}
        parent={{ href: '/settings/clans', label: 'Clans' }}
        pills={['Réservé au SuperUser']}
        action={
          <Link href={`/clans/${clanId}/settings`} className={BANNER_GLASS_BUTTON}>
            <Settings className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
            Paramètres du clan
          </Link>
        }
      />
      <ClanSubdomainSettings clanId={clanId} />
      <ClanFollowDangerZone clanId={clanId} />
    </div>
  )
}
