'use client'

import { Brain, Shield } from 'lucide-react'
import Link from 'next/link'

import CoachHelp from '@/components/coach/CoachHelp'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useCoachMemory } from '@/hooks/useCoachMemory'
import { useSelectedClan } from '@/hooks/useSelectedClan'

/**
 * Carte « Coach IA » de /account (demande du 2026-10-25) : lien vers la page du Coach pour le clan du membre (à défaut,
 * le clan choisi dans le menu), ce qu'il sait faire, ses limites et comment l'améliorer (`CoachHelp`), et — quand
 * l'administrateur a ouvert la mémoire personnelle — le nombre de lignes que le Coach retient. Une seule lecture
 * (`GET /api/coach/memory`), jamais la mémoire d'un autre compte.
 */
export default function CoachAccountCard() {
  const session = useAuthSession()
  const { clanId: selectedClanId } = useSelectedClan()
  const memory = useCoachMemory(!session.loading && session.authenticated)

  const activeMember = session.members.find((member) => member.memberId === session.activeMemberId) ?? session.members.find((member) => member.clanId !== null) ?? null
  const clanId = activeMember?.clanId ?? selectedClanId
  const coachHref = clanId ? `/clans/${clanId}/coach` : null
  const memoryEnabled = memory.enabled === true
  const count = memory.memories?.length ?? 0

  return (
    <div className="flex flex-col gap-4">
      <p className="t-body m-0 text-gray-700">
        Il répond à partir des données de ton clan et ne cite jamais un chiffre sans l’avoir lu dans un outil. Tu le trouves dans son tiroir — bouton « Coach IA » en haut à droite, bouton flottant sur mobile — ou sur sa page.
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {coachHref ? (
          <Link href={coachHref} className="app-btn app-btn--md app-btn--secondary gap-1.5" data-testid="account-coach-link">
            <Shield className="h-4 w-4" aria-hidden="true" />
            Ouvrir le Coach
          </Link>
        ) : (
          <span className="t-meta">Choisis un clan dans le menu pour ouvrir le Coach.</span>
        )}
        {memoryEnabled ? (
          <span className="t-meta inline-flex items-center gap-1.5" data-testid="account-coach-memory">
            <Brain className="h-3.5 w-3.5" aria-hidden="true" />
            {count === 0 ? 'Le Coach ne retient rien sur toi pour l’instant' : `Le Coach retient ${count} ${count > 1 ? 'lignes' : 'ligne'} sur toi`} — à voir et à effacer depuis le bouton « Ce que le Coach sait de toi » du Coach.
          </span>
        ) : null}
      </div>
      <CoachHelp variant="card" memoryEnabled={memoryEnabled} />
    </div>
  )
}
