'use client'

import { CircleHelp } from 'lucide-react'

import { TOURNAMENT_GUIDE_CARDS } from '@/lib/tournament-guide'

type TournamentGuideProps = {
  /** Masque l'en-tête quand le guide est déjà annoncé par un onglet ou un accordéon. */
  showHeader?: boolean
}

/**
 * Guide « Comment fonctionne un tournoi ? ». Même contenu pour l'organisateur et pour les joueurs : une règle
 * expliquée d'un côté ne peut pas diverger de l'autre.
 *
 * Charte UI (docs/ui/index.html) : tuile lucide teintée à l'accent, titre de section, fiches `app-panel-muted`
 * numérotées (chiffres tabulaires), textes aux classes de rôle — aucune couleur en dur.
 */
export default function TournamentGuide({ showHeader = true }: TournamentGuideProps) {
  return (
    <div className="flex flex-col gap-3" data-testid="tournament-guide">
      {showHeader ? (
        <div className="flex items-start gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--theme-ui-accent-soft)] shadow-[inset_0_0_0_1px_var(--theme-ui-accent-ring)]"
            aria-hidden="true"
          >
            <CircleHelp className="h-[18px] w-[18px] text-[var(--theme-ui-accent-text)]" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="t-section-title">Comment fonctionne un tournoi ?</h2>
            <p className="t-meta">Un tournoi regroupe des parties personnalisées déjà jouées et leur applique un barème.</p>
          </div>
        </div>
      ) : null}

      <ol className="flex flex-col gap-2.5">
        {TOURNAMENT_GUIDE_CARDS.map((card, index) => (
          <li key={card.id} className="app-panel-muted flex items-start gap-3 p-3 sm:p-4">
            <span
              className="t-num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--theme-ui-surface)] text-[13px] font-extrabold text-gray-700 shadow-[inset_0_0_0_1px_var(--theme-ui-border)]"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="t-card-title">{card.title}</h3>
              <p className="t-body text-gray-700">{card.body}</p>
              {card.bullets ? (
                <ul className="t-body mt-1 flex list-disc flex-col gap-1 pl-5 text-gray-700 marker:text-gray-500">
                  {card.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
