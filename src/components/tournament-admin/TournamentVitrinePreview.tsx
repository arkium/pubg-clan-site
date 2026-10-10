'use client'

import { AlertTriangle, CalendarClock, EyeOff } from 'lucide-react'
import { useState } from 'react'

import { LiveTournamentBlock, TicketCard, UpcomingAgendaRow, UpcomingCard } from '@/components/home/HomeTournaments'
import { tournamentFormPeriod, type TournamentFormState } from '@/components/tournament-admin/tournament-form'
import { Callout } from '@/components/ui/CharteKit'
import { homeTournamentVisibility, type HomeRankedTournament } from '@/lib/home-tournaments'
import { formatTournamentPeriod } from '@/lib/tournament-schedule'
import { tournamentTitleProblem } from '@/lib/tournament-title'

/**
 * Aperçu de la vitrine dans le formulaire d'un tournoi — docs/features/tournois.md, « Horaires et aperçu de la vitrine ».
 * Les vrais composants de la page d'accueil (`HomeTournaments.tsx`), avec les valeurs saisies : carte des prochains
 * tournois, ligne d'agenda (mobile), ticket du héros et cadre « en direct ». Rien n'est interprété : le titre s'affiche
 * en texte, comme sur la vitrine (React échappe tout) ; un titre refusé par l'API (lien, balise) est signalé ici aussi.
 * L'aperçu est inerte : ses liens ne mènent nulle part et ne prennent pas le focus.
 */

const dayFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' })

export function TournamentVitrinePreview({
  form,
  organizerClan,
}: {
  form: TournamentFormState
  organizerClan: { id: number; name: string; tag: string | null } | null
}) {
  // Instant figé à l'ouverture : le compte à rebours de l'aperçu ne bouge pas pendant la saisie.
  const [now] = useState(() => new Date())
  const period = tournamentFormPeriod(form)
  const titleProblem = form.title.trim() ? tournamentTitleProblem(form.title) : null

  if (!period) {
    return <p className="t-meta m-0">Renseignez le début et la fin du tournoi pour voir son aperçu.</p>
  }

  const tournament: HomeRankedTournament = {
    id: 'apercu',
    title: form.title.trim() || 'Titre du tournoi',
    mode: form.mode,
    startDate: period.startDate,
    endDate: period.endDate,
    gameMode: form.gameMode || null,
    mapName: form.mapName || null,
    organizerClan,
    roundCount: 0,
    participantCount: 0,
    playerCount: 0,
    lastRoundAt: null,
    leaders: [],
  }
  const visibility = homeTournamentVisibility(period.startDate, period.endDate)

  return (
    <div className="flex flex-col gap-4" data-testid="tournament-vitrine-preview">
      {form.status === 'draft' ? (
        <Callout tone="sky" icon={EyeOff} title="Brouillon : rien n’apparaît sur la vitrine">
          Le tournoi s’affiche sur la page d’accueil une fois son statut passé à « Actif ».
        </Callout>
      ) : null}
      {titleProblem ? (
        <Callout tone="warn" icon={AlertTriangle} title="Ce titre sera refusé à l’enregistrement">
          {titleProblem}
        </Callout>
      ) : null}

      <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Calendrier sur la vitrine">
        {[
          `Annoncé à partir du ${dayFormat.format(visibility.announcedFrom)} (14 jours avant le début).`,
          `En direct : ${formatTournamentPeriod(period.startDate, period.endDate)} (heure de Paris).`,
          `Résultats affichés jusqu’au ${dayFormat.format(visibility.resultsUntil)}.`,
        ].map((line) => (
          <li key={line} className="t-body flex items-start gap-2 text-gray-700">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
            {line}
          </li>
        ))}
      </ul>

      {/* Inerte : les liens de l'aperçu ne mènent nulle part et ne prennent pas le focus. */}
      <div inert className="flex flex-col gap-4">
        <section className="flex flex-col gap-2" aria-label="Carte des prochains tournois">
          <span className="t-label">Carte « Prochains tournois »</span>
          {/* `min-w-0` : sans lui, une colonne de grille garde la largeur de son contenu et déborde sur mobile. */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="min-w-0 md:[&>article]:h-full">
              <UpcomingCard tournament={tournament} first now={now} />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="t-meta">Sur mobile</span>
              <ul className="app-panel m-0 list-none overflow-hidden p-0">
                <UpcomingAgendaRow tournament={tournament} first now={now} />
              </ul>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-2" aria-label="Ticket du héros">
          <span className="t-label">Ticket du haut de page (ordinateur)</span>
          <div className="rounded-[14px] bg-slate-950 p-3">
            <TicketCard tournament={tournament} live={null} now={now} footer={null} />
          </div>
        </section>

        <section className="flex flex-col gap-2" aria-label="Cadre en direct">
          <span className="t-label">Cadre « en direct », pendant le tournoi</span>
          <LiveTournamentBlock tournament={tournament} now={now} />
          <span className="t-meta">Il se remplit au fil des manches comptées : nombre de manches, de joueurs et top 3.</span>
        </section>
      </div>
    </div>
  )
}
