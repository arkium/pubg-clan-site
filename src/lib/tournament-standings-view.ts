/**
 * Mise en forme du classement d'un tournoi pour l'affichage : libellés des participants, podium, manches numérotées
 * et MVP. Le moteur (`tournament-service.ts`) ne manipule que des identifiants ; c'est ici qu'ils deviennent lisibles.
 *
 * Tout est pur : la route résout les noms en base, puis passe les dictionnaires à ces fonctions.
 */
import {
  computeTournamentModeStandings,
  groupMatchByMode,
  normalizeTournamentRules,
  scoreTournamentTeam,
  type NormalizedTournamentRules,
  type TournamentModeStanding,
  type TournamentParticipant,
  type TournamentRulesInput,
} from '@/lib/tournament-service'

export type ClanDirectory = Record<number, { name: string; tag: string | null }>
export type MemberDirectory = Record<number, { displayName: string; clanId: number | null }>

export type TournamentStandingView = TournamentModeStanding & {
  rank: number
  /** Nom affiché : clan, composition d'équipe ou pseudo du joueur. */
  label: string
  /** Tags de clan concernés, pour les pastilles de composition. */
  clanTags: string[]
  /** Composition détaillée (équipes et scrims internes). */
  memberLabels: string[]
}

export type TournamentRoundScoreView = {
  key: string
  label: string
  points: number
  totalKills: number
  bestPlacement: number
  /** Détail du calcul, affiché tel quel dans l'embed Discord. */
  placementScore: number
  killScore: number
  winBonus: number
  /** Composition, vide pour un clan ou un joueur seul. */
  memberLabels: string[]
}

export type TournamentRoundView = {
  /** Numéro chronologique de la manche : #1 est la plus ancienne. */
  index: number
  matchId: string
  createdAt: string
  mapName: string | null
  gameMode: string | null
  winnerLabel: string | null
  mvp: { memberId: number; label: string; kills: number; damage: number } | null
  scores: TournamentRoundScoreView[]
}

type MatchLike = {
  id: string
  createdAt: Date | string
  mapName?: string | null
  gameMode?: string | null
  members: Array<{
    memberId: number
    member: { clanId: number | null; displayName?: string | null }
    kills: number
    placement: number
    damage?: number
  }>
}

function clanLabel(clanId: number, clans: ClanDirectory) {
  const clan = clans[clanId]
  if (!clan) return `Clan ${clanId}`
  return clan.tag ? `[${clan.tag}] ${clan.name}` : clan.name
}

function memberLabel(memberId: number, members: MemberDirectory, clans: ClanDirectory) {
  const member = members[memberId]
  if (!member) return `Joueur ${memberId}`
  const tag = member.clanId !== null && member.clanId !== undefined ? clans[member.clanId]?.tag : null
  return tag ? `[${tag}] ${member.displayName}` : member.displayName
}

export function describeParticipant(
  participant: TournamentParticipant,
  clans: ClanDirectory,
  members: MemberDirectory
): { label: string; clanTags: string[]; memberLabels: string[] } {
  if (participant.kind === 'clan') {
    return {
      label: clanLabel(participant.clanId, clans),
      clanTags: [clans[participant.clanId]?.tag].filter((tag): tag is string => Boolean(tag)),
      memberLabels: [],
    }
  }

  if (participant.kind === 'player') {
    return {
      label: memberLabel(participant.memberId, members, clans),
      clanTags:
        participant.clanId !== null && clans[participant.clanId]?.tag ? [clans[participant.clanId]!.tag!] : [],
      memberLabels: [],
    }
  }

  const memberLabels = participant.memberIds.map((memberId) => memberLabel(memberId, members, clans))
  return {
    // Une équipe n'a pas de nom propre : sa composition en tient lieu, c'est ce qui l'identifie vraiment.
    label: memberLabels.join(', ') || 'Équipe sans joueur identifié',
    clanTags: participant.clanIds.map((clanId) => clans[clanId]?.tag).filter((tag): tag is string => Boolean(tag)),
    memberLabels,
  }
}

export function buildStandingViews(
  standings: TournamentModeStanding[],
  clans: ClanDirectory,
  members: MemberDirectory
): TournamentStandingView[] {
  return standings.map((standing, index) => ({
    ...standing,
    rank: index + 1,
    ...describeParticipant(standing.participant, clans, members),
  }))
}

/** MVP d'un ensemble de manches : le plus de kills, départagé par les dégâts. */
export function pickMvp(matches: MatchLike[], members: MemberDirectory, clans: ClanDirectory) {
  const totals = new Map<number, { kills: number; damage: number }>()

  for (const match of matches) {
    for (const row of match.members ?? []) {
      const current = totals.get(row.memberId) ?? { kills: 0, damage: 0 }
      current.kills += row.kills
      current.damage += row.damage ?? 0
      totals.set(row.memberId, current)
    }
  }

  const best = [...totals.entries()].sort((left, right) => {
    if (right[1].kills !== left[1].kills) return right[1].kills - left[1].kills
    return right[1].damage - left[1].damage
  })[0]

  if (!best || (best[1].kills === 0 && best[1].damage === 0)) return null
  return {
    memberId: best[0],
    label: memberLabel(best[0], members, clans),
    kills: best[1].kills,
    damage: Math.round(best[1].damage),
  }
}

/**
 * Manches numérotées chronologiquement (#1 = la plus ancienne), avec le score de chaque participant et le MVP.
 * Le découpage suit le mode du tournoi, donc la manche d'un tournoi solo liste des joueurs, pas des clans.
 */
export function buildRoundViews(
  matches: MatchLike[],
  participantClanIds: number[],
  rulesInput: TournamentRulesInput | NormalizedTournamentRules,
  clans: ClanDirectory,
  members: MemberDirectory,
  organizerClanId?: number
): TournamentRoundView[] {
  const rules = normalizeTournamentRules(rulesInput)
  const ordered = [...matches].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  )

  return ordered.map((match, index) => {
    const entries = groupMatchByMode(match, participantClanIds, rules, organizerClanId)
    const scores = entries
      .map((entry) => {
        const described = describeParticipant(entry.participant, clans, members)
        const score = scoreTournamentTeam(entry, rules)
        return {
          key: entry.key,
          label: described.label,
          memberLabels: described.memberLabels,
          points: score.points,
          placementScore: score.placementScore,
          killScore: score.killScore,
          winBonus: score.winBonus,
          totalKills: entry.totalKills,
          bestPlacement: entry.bestPlacement,
        }
      })
      .sort((left, right) => {
        if (right.points !== left.points) return right.points - left.points
        return left.bestPlacement - right.bestPlacement
      })

    return {
      index: index + 1,
      matchId: match.id,
      createdAt: new Date(match.createdAt).toISOString(),
      mapName: match.mapName ?? null,
      gameMode: match.gameMode ?? null,
      // Vainqueur de la manche : le participant arrivé premier, pas celui qui marque le plus de points.
      winnerLabel: scores.find((score) => score.bestPlacement === 1)?.label ?? null,
      mvp: pickMvp([match], members, clans),
      scores,
    }
  })
}

/** Classement dérivé par clan en mode solo : somme des points marqués par les membres de chaque clan. */
export function buildClanTrophy(standings: TournamentModeStanding[], clans: ClanDirectory) {
  const totals = new Map<number, { points: number; kills: number; players: number }>()

  for (const standing of standings) {
    if (standing.participant.kind !== 'player') continue
    const clanId = standing.participant.clanId
    if (clanId === null || clanId === undefined) continue
    const current = totals.get(clanId) ?? { points: 0, kills: 0, players: 0 }
    current.points += standing.totalPoints
    current.kills += standing.totalKills
    current.players += 1
    totals.set(clanId, current)
  }

  return [...totals.entries()]
    .map(([clanId, value]) => ({ clanId, label: clanLabel(clanId, clans), ...value }))
    .sort((left, right) => right.points - left.points)
}

/**
 * Vue « détail par escouade » du mode inter-clans : le même tournoi recalculé équipe par équipe, pour voir le
 * comportement de chaque escouade derrière le cumul de son clan.
 */
export function buildSquadBreakdown(
  matches: MatchLike[],
  participantClanIds: number[],
  rulesInput: TournamentRulesInput | NormalizedTournamentRules,
  clans: ClanDirectory,
  members: MemberDirectory
): TournamentStandingView[] {
  const rules = normalizeTournamentRules(rulesInput)
  const standings = computeTournamentModeStandings(matches, participantClanIds, {
    ...rules,
    mode: 'custom_teams',
  })
  return buildStandingViews(standings, clans, members)
}
