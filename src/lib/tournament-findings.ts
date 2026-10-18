import { TOURNAMENT_MODE_DISPLAY } from '@/lib/tournament-mode-display'
import type { TournamentOverview } from '@/lib/tournament-overview'
import { formatTournamentPeriod } from '@/lib/tournament-schedule'

/**
 * Page d'un tournoi — résumé rendu côté serveur (docs/TODO/geo-seo-propositions.md, lot 2) : le classement complet pèse
 * 160 Ko et se charge par l'API ; ce résumé met dans le HTML le titre, le mode, les dates, l'affluence et le podium.
 *
 * Pas de pseudo de joueur : le podium n'est nommé qu'en inter-clans, où l'on classe des clans. Les autres modes classent
 * des équipes, des joueurs ou des squads, nommés par des pseudos — les pages joueur restent hors index (seo.md §2). Pur.
 */

export type TournamentPodiumLine = { rank: number; label: string; points: string; kills: number }

export type TournamentFindings = {
  title: string
  /** « Tournoi PUBG inter-clans · 10 oct. 21:00 → 11 oct. 00:00 · organisé par [FR] FR-Alliance-BE » */
  scope: string
  status: string
  attendance: string
  podium: TournamentPodiumLine[]
  rule: string
}

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const points = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

const count = (value: number, one: string, many: string) => `${integer.format(value)} ${value > 1 ? many : one}`

/** `null` pour un brouillon : sa page n'est pas publique. */
export function tournamentFindings(overview: TournamentOverview): TournamentFindings | null {
  if (overview.phase === 'draft') return null
  const display = TOURNAMENT_MODE_DISPLAY[overview.mode]
  const organizer = overview.organizerClan
    ? ` · organisé par ${overview.organizerClan.tag ? `[${overview.organizerClan.tag}] ` : ''}${overview.organizerClan.name}`
    : ''
  const named = overview.mode === 'inter_clan'
  const leader = overview.leaders[0]

  let status: string
  if (overview.phase === 'upcoming') status = 'À venir : les manches seront comptées pendant les dates du tournoi.'
  else if (overview.phase === 'live') status = named && leader && leader.totalPoints > 0 ? `En cours. En tête : ${leader.label}.` : 'En cours.'
  else if (overview.winner) status = named ? `Terminé. Vainqueur : ${overview.winner.label}.` : 'Terminé : le vainqueur est sur le podium du classement.'
  else status = 'Terminé, sans manche comptée.'

  return {
    title: overview.title,
    scope: `Tournoi PUBG ${display.label.toLowerCase()} · ${formatTournamentPeriod(overview.startDate, overview.endDate)}${organizer}`,
    status,
    attendance:
      overview.roundCount === 0
        ? 'Aucune manche comptée pour l’instant.'
        : `${count(overview.roundCount, 'manche', 'manches')}, ${count(overview.clanCount, 'clan', 'clans')}, ` +
          `${count(overview.playerCount, 'joueur suivi', 'joueurs suivis')} ; ${count(overview.participantCount, display.unit.one, display.unit.many)} au classement.`,
    podium: named
      ? overview.leaders
          .filter((entry) => entry.totalPoints > 0)
          .map((entry, index) => ({ rank: index + 1, label: entry.label, points: points.format(entry.totalPoints), kills: entry.totalKills }))
      : [],
    rule: `Le mode ${display.label.toLowerCase()} ${display.ranks}. Seules les parties personnalisées jouées pendant les dates du tournoi comptent, avec au moins un membre du clan organisateur ; chaque manche rapporte des points de placement, des points par kill et un bonus de victoire.`,
  }
}
