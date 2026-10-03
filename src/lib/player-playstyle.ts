/**
 * Style de jeu d'un joueur (`/members/[id]/playstyle`, docs/features/membres.md) : la télémétrie de ses matchs sur la
 * période, comparée au clan — profil par rôle, mobilité / cercle / survie, coopération avec ses coéquipiers. Mêmes
 * calculs que le style de jeu du clan (`clan-playstyle.ts`), appliqués à une seule ligne. Module pur, testé par
 * `player-playstyle.test.ts` ; la page ne fait que l'afficher.
 */
import { PLAYSTYLE_ROLES, type ClanPlaystyleRow, type CooperationPair, type PlaystyleRoleId } from '@/lib/clan-playstyle'

/** `stats` de `/api/members/[id]/telemetry/playstyle` : une ligne de `MemberTelemetryStats`, `null` sans mesure. */
export type PlayerPlaystyleStats = Omit<ClanPlaystyleRow, 'memberId' | 'displayName'> & {
  avgVehicleRideEvents?: number
  avgVehicleLeaveEvents?: number
}

export type PlayerPlaystyleResponse = {
  member: { id: number; displayName: string; clanId: number | null }
  stats: PlayerPlaystyleStats | null
}

/** La ligne du joueur au format du clan, pour réutiliser `playstyleThemes`. */
export function asPlaystyleRow(memberId: number, displayName: string, stats: PlayerPlaystyleStats): ClanPlaystyleRow {
  return { ...stats, memberId, displayName }
}

const round = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

/**
 * Un rôle du joueur face au clan : son score, la moyenne des joueurs mesurés du clan (lui compris), l'écart en points
 * et son rang. `clanAverage`, `delta` et `rank` valent `null` sans données du clan — rien n'est alors affiché.
 */
export type PlayerRoleComparison = {
  id: PlaystyleRoleId
  role: string
  metric: string
  hint: string
  score: number
  clanAverage: number | null
  delta: number | null
  rank: number | null
  ranked: number
}

export function playerRoleComparison(player: ClanPlaystyleRow, clanRows: ClanPlaystyleRow[] | null): PlayerRoleComparison[] {
  // Le joueur compte dans la moyenne et le rang, même si la route du clan ne l'a pas renvoyé.
  const rows = clanRows && clanRows.length > 0 ? [...clanRows.filter((row) => row.memberId !== player.memberId), player] : null
  return PLAYSTYLE_ROLES.map((role) => {
    const score = round(role.score(player))
    if (!rows || rows.length < 2) {
      return { id: role.id, role: role.role, metric: role.metric, hint: role.hint, score, clanAverage: null, delta: null, rank: null, ranked: 0 }
    }
    const clanAverage = round(rows.reduce((sum, row) => sum + role.score(row), 0) / rows.length)
    const rank = 1 + rows.filter((row) => row.memberId !== player.memberId && round(role.score(row)) > score).length
    return { id: role.id, role: role.role, metric: role.metric, hint: role.hint, score, clanAverage, delta: score - clanAverage, rank, ranked: rows.length }
  })
}

/** « +12 pts vs clan », « −4 pts vs clan », « dans la moyenne du clan » ; `null` sans moyenne. */
export function roleDeltaLabel(delta: number | null) {
  if (delta === null) return null
  if (delta === 0) return 'dans la moyenne du clan'
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)} pt${Math.abs(delta) > 1 ? 's' : ''} vs clan`
}

// ── Coopération ─────────────────────────────────────────────────────────────────────────────────────

export type CooperationPartner = {
  memberId: number
  displayName: string
  revives: number
  coKills: number
  recalls: number
  sharedDamage: number
  /** Même pondération que l'indice de synergie du clan : réanimations ×3, co-kills ×2, dégâts partagés ×1. */
  score: number
}

/**
 * Les coéquipiers du joueur dans les binômes de coopération du clan, du plus coopératif au moins coopératif. Un binôme
 * sans aucune entraide n'y figure pas.
 */
export function cooperationPartners(pairs: CooperationPair[], memberId: number): CooperationPartner[] {
  return pairs
    .filter((pair) => pair.memberAId === memberId || pair.memberBId === memberId)
    .map((pair) => {
      const partnerIsB = pair.memberAId === memberId
      const revives = pair.reviveCount
      const coKills = pair.coKillCount
      const recalls = pair.recallCount ?? 0
      const sharedDamage = pair.sharedDamageEvents
      return {
        memberId: partnerIsB ? pair.memberBId : pair.memberAId,
        displayName: partnerIsB ? pair.memberBName : pair.memberAName,
        revives,
        coKills,
        recalls,
        sharedDamage,
        score: revives * 3 + coKills * 2 + sharedDamage,
      }
    })
    .filter((partner) => partner.revives + partner.coKills + partner.recalls + partner.sharedDamage > 0)
    .sort((a, b) => b.score - a.score || b.revives - a.revives || a.displayName.localeCompare(b.displayName, 'fr'))
}

export function cooperationTotals(partners: CooperationPartner[]) {
  const total = (pick: (partner: CooperationPartner) => number) => partners.reduce((sum, partner) => sum + pick(partner), 0)
  return {
    partners: partners.length,
    revives: total((partner) => partner.revives),
    coKills: total((partner) => partner.coKills),
    recalls: total((partner) => partner.recalls),
  }
}

/** Ligne de contexte du bandeau : « 12 parties analysées · 8 joueurs du clan mesurés ». */
export function playerPlaystyleContext(stats: PlayerPlaystyleStats | null, clanRows: ClanPlaystyleRow[] | null) {
  if (!stats) return 'Aucune partie analysée sur la période'
  const matches = Math.round(stats.matchesPlayed)
  const parts = [`${matches} partie${matches > 1 ? 's' : ''} analysée${matches > 1 ? 's' : ''}`]
  if (clanRows && clanRows.length > 1) parts.push(`comparé à ${clanRows.length} joueurs du clan`)
  return parts.join(' · ')
}
