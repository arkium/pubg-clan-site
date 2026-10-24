'use client'

import { useParams } from 'next/navigation'

import CoachPanel from '@/components/coach/CoachPanel'
import { NavigationTrail } from '@/components/ui/NavigationTrail'

/**
 * Coach IA en plein écran (docs/TODO/chatbot-ia.md §8.3) : liste des fils à gauche, fil centré sur 760 px. Page
 * personnelle d'un membre connecté ; un visiteur y trouve le teaser. Hors index (`CLAN_PAGES`, `noindex`).
 */

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default function CoachPage() {
  const params = useParams()
  const clanId = parseClanId(params.clanId)

  return (
    <main className="app-container app-main charte game-ui">
      {clanId ? (
        <NavigationTrail currentLabel="Coach IA" currentHref={`/clans/${clanId}/coach`} fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }} />
      ) : null}
      <header className="mb-4">
        <h1 className="t-banner-title m-0">Coach IA</h1>
        <p className="t-meta m-0 mt-1">Tes parties, tes armes et tes adversaires expliqués à partir de la télémétrie du clan. Réservé aux membres connectés.</p>
      </header>
      {clanId ? <CoachPanel variant="page" active /> : <p className="t-meta">Clan inconnu.</p>}
    </main>
  )
}
