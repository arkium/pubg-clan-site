'use client'

import { useParams } from 'next/navigation'

import CoachHelp from '@/components/coach/CoachHelp'
import CoachPanel from '@/components/coach/CoachPanel'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useCoachLimits } from '@/hooks/useCoachLimits'
import { useCoachMemory } from '@/hooks/useCoachMemory'

/**
 * Coach IA en plein écran (docs/TODO/chatbot-ia.md §8.3) : liste des fils à gauche, fil centré sur 760 px, puis la
 * section « aide » (`#aide`, demande du 2026-10-25) — ce qu'il sait faire avec des questions d'exemple, ses limites,
 * comment l'améliorer. Page personnelle d'un membre connecté ; un visiteur y trouve le teaser. Hors index (`CLAN_PAGES`).
 */

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default function CoachPage() {
  const params = useParams()
  const clanId = parseClanId(params.clanId)
  const session = useAuthSession()
  // Le domaine « Ce qu'il retient de toi » n'apparaît que si la mémoire est ouverte : une lecture, membre connecté seulement.
  const memory = useCoachMemory(!session.loading && session.authenticated)
  // Limites chiffrées de l'aide (route publique en cache), pour tout le monde — le teaser du visiteur les montre aussi.
  const limits = useCoachLimits(true)

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
      {/* « Comment ça marche ? » : une barre repliée qui déplie ce qu'il sait faire, ses limites, comment l'améliorer. */}
      <section id="aide" aria-label="Comment ça marche ?" className="mt-4">
        <CoachHelp variant="page" memoryEnabled={memory.enabled === true} limits={limits} />
      </section>
    </main>
  )
}
