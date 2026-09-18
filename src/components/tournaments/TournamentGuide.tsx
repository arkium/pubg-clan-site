'use client'

import { Info } from 'lucide-react'

import { TOURNAMENT_GUIDE_CARDS } from '@/lib/tournament-guide'

type TournamentGuideProps = {
  /** Masque l'en-tête quand le guide est déjà annoncé par un onglet ou un accordéon. */
  showHeader?: boolean
}

/**
 * Guide « Comment fonctionne un tournoi ? ». Même contenu pour l'organisateur et pour les joueurs : une règle
 * expliquée d'un côté ne peut pas diverger de l'autre.
 */
export default function TournamentGuide({ showHeader = true }: TournamentGuideProps) {
  return (
    <div className="space-y-3">
      {showHeader ? (
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sky-500/20 bg-sky-500/10 text-sky-500">
            <Info className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Comment fonctionne un tournoi ?</h2>
            <p className="mt-1 text-sm text-gray-600">
              Un tournoi regroupe des parties personnalisées déjà jouées et leur applique un barème.
            </p>
          </div>
        </div>
      ) : null}

      {TOURNAMENT_GUIDE_CARDS.map((card, index) => (
        <section key={card.id} className="app-modal-callout rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-gray-900">
            {index + 1}. {card.title}
          </h3>
          <p className="mt-1 text-sm text-gray-600">{card.body}</p>
          {card.bullets ? (
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              {card.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-2">
                  <span aria-hidden className="text-gray-400">
                    •
                  </span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  )
}
