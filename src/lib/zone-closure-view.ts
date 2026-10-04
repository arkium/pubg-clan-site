/**
 * Page « Fin de zone » (docs/features/fin-de-zone.md) : lecture « joueur » des fermetures de zone — la cible
 * centre / bord / dehors, un verdict pour le clan, un profil par joueur et trois titres. Module pur, testé par
 * `zone-closure-view.test.ts`.
 *
 * Seuils calés sur les données réelles (clan 13, 2026-10-04, `scripts/measure-zone-closures.ts`) : le bord
 * intérieur domine (50 à 68 % des fermetures), le centre reste rare (10 à 30 %) et 14 à 45 % finissent dehors. Un
 * seuil absolu « majorité au centre » ne serait jamais atteint.
 */
import type { ZoneBand } from '@/lib/zone-closure-positions'

export type ZoneBandCounts = Record<ZoneBand, number>

export const ZONE_BANDS: readonly ZoneBand[] = ['center', 'edge', 'outside']

/** Couleurs de la charte (conteneur `.game-ui`) : positif au centre, « attention » au bord, négatif dehors. */
export const ZONE_BAND_META: Record<ZoneBand, { label: string; description: string; color: string; soft: string }> = {
  center: { label: 'Centre', description: 'à moins de la moitié du rayon', color: 'var(--game-pos)', soft: 'var(--game-pos-soft)' },
  edge: { label: 'Bord intérieur', description: 'dans le cercle, au-delà de la moitié du rayon', color: 'var(--game-warn)', soft: 'var(--game-warn-soft)' },
  outside: { label: 'Dehors', description: 'encore hors du cercle à la fermeture', color: 'var(--game-neg)', soft: 'var(--game-neg-soft)' },
}

/** En dessous, un joueur n'a ni profil ni titre : quelques fermetures ne disent rien de sa façon de jouer. */
export const MIN_PLAYER_SAMPLE = 10

const VERDICT_LATE = 30
const VERDICT_CENTER = 25
const VERDICT_EDGE = 55

const PROFILE_OUTSIDE = 33
const PROFILE_CENTER = 25
const PROFILE_EDGE = 60

/** Parts en pourcentage (0 à 100) de chaque bande. */
export function bandShares(bands: ZoneBandCounts) {
  const total = bands.center + bands.edge + bands.outside
  const share = (value: number) => (total > 0 ? (value / total) * 100 : 0)
  return { total, center: share(bands.center), edge: share(bands.edge), outside: share(bands.outside) }
}

/** Distance au centre en pourcentage du rayon : 0 au centre, 100 sur le bord, au-delà dehors. */
export const ratioPercent = (ratio: number) => Math.round(ratio * 100)

const percent = (value: number) => `${Math.round(value)} %`

export type ZoneVerdict = { key: 'late' | 'center' | 'edge' | 'balanced'; title: string; sentence: string }

/** Ce que disent les fermetures du clan, en une phrase. `null` sans observation. */
export function zoneVerdict(bands: ZoneBandCounts): ZoneVerdict | null {
  const shares = bandShares(bands)
  if (shares.total === 0) return null
  if (shares.outside >= VERDICT_LATE) {
    return {
      key: 'late',
      title: 'La zone vous colle aux talons',
      sentence: `${percent(shares.outside)} des fermetures vous trouvent encore dehors : partez plus tôt.`,
    }
  }
  if (shares.center >= VERDICT_CENTER) {
    return {
      key: 'center',
      title: 'Maîtres du centre',
      sentence: `${percent(shares.center)} des fermetures au cœur du cercle : vous lisez la zone avant les autres.`,
    }
  }
  if (shares.edge >= VERDICT_EDGE) {
    return {
      key: 'edge',
      title: 'Surfeurs de bord',
      sentence: `${percent(shares.edge)} des fermetures juste à l’intérieur du cercle : à l’abri, mais sans marge.`,
    }
  }
  return {
    key: 'balanced',
    title: 'Placement équilibré',
    sentence: `${percent(shares.center)} au centre, ${percent(shares.edge)} au bord, ${percent(shares.outside)} dehors.`,
  }
}

export type ZoneMemberStat = {
  memberId: number
  displayName: string
  positions: number
  averageRatio: number
  bands: ZoneBandCounts
}

export type ZoneProfile = { key: 'late' | 'center' | 'edge' | 'balanced'; label: string; tone: 'neg' | 'pos' | 'warn' | 'neutral' }

/** Profil d'un joueur ; `null` sous `MIN_PLAYER_SAMPLE` fermetures. Dehors d'abord : c'est ce qui coûte des vies. */
export function memberZoneProfile(member: ZoneMemberStat): ZoneProfile | null {
  if (member.positions < MIN_PLAYER_SAMPLE) return null
  const shares = bandShares(member.bands)
  if (shares.outside >= PROFILE_OUTSIDE) return { key: 'late', label: 'Court après la zone', tone: 'neg' }
  if (shares.center >= PROFILE_CENTER) return { key: 'center', label: 'Joue le centre', tone: 'pos' }
  if (shares.edge >= PROFILE_EDGE) return { key: 'edge', label: 'Longe le bord', tone: 'warn' }
  return { key: 'balanced', label: 'Équilibré', tone: 'neutral' }
}

/** Joueurs classés du plus central au plus excentré (distance moyenne), les petits échantillons en fin de liste. */
export function rankZoneMembers(members: readonly ZoneMemberStat[]) {
  return [...members].sort((left, right) => {
    const leftSmall = left.positions < MIN_PLAYER_SAMPLE
    const rightSmall = right.positions < MIN_PLAYER_SAMPLE
    if (leftSmall !== rightSmall) return leftSmall ? 1 : -1
    return left.averageRatio - right.averageRatio || right.positions - left.positions
  })
}

export type ZoneTitle = {
  key: 'king' | 'survivor' | 'latecomer'
  title: string
  description: string
  memberId: number
  displayName: string
  value: string
}

/**
 * Trois titres de la période, parmi les joueurs d'au moins `MIN_PLAYER_SAMPLE` fermetures : le plus central (Roi du
 * cercle), celui qui en a vécu le plus (Increvable), le plus souvent dehors (Coureur de zone bleue — seulement s'il
 * a déjà fini dehors).
 */
export function zoneTitles(members: readonly ZoneMemberStat[]): ZoneTitle[] {
  const eligible = members.filter((member) => member.positions >= MIN_PLAYER_SAMPLE)
  if (eligible.length === 0) return []
  const best = <T,>(score: (member: ZoneMemberStat) => T, better: (a: T, b: T) => boolean) =>
    eligible.reduce((winner, member) => (better(score(member), score(winner)) ? member : winner))

  const king = best((member) => member.averageRatio, (a, b) => a < b)
  const survivor = best((member) => member.positions, (a, b) => a > b)
  const latecomer = best((member) => bandShares(member.bands).outside, (a, b) => a > b)

  const titles: ZoneTitle[] = [
    {
      key: 'king',
      title: 'Roi du cercle',
      description: 'le plus près du centre en moyenne',
      memberId: king.memberId,
      displayName: king.displayName,
      value: `${ratioPercent(king.averageRatio)} % du rayon`,
    },
    {
      key: 'survivor',
      title: 'Increvable',
      description: 'le plus de fermetures vécues',
      memberId: survivor.memberId,
      displayName: survivor.displayName,
      value: `${survivor.positions} fermetures`,
    },
  ]
  const lateShare = bandShares(latecomer.bands).outside
  if (lateShare > 0) {
    titles.push({
      key: 'latecomer',
      title: 'Coureur de zone bleue',
      description: 'le plus souvent dehors à la fermeture',
      memberId: latecomer.memberId,
      displayName: latecomer.displayName,
      value: `${Math.round(lateShare)} % dehors`,
    })
  }
  return titles
}
