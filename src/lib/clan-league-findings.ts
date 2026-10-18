import { leagueMatchTypeOption } from '@/lib/clan-league'
import type { ClanLeaguePayload } from '@/lib/clan-league-service'
import { PERIOD_WHEN_LABELS } from '@/lib/period'

/**
 * Ligue des clans — bloc « En bref » rendu côté serveur (docs/TODO/geo-seo-propositions.md, lot 2) : le podium, le
 * nombre de clans classés et la formule du Power score en phrases, avec les réglages en vigueur. C'est le texte que
 * lisent les robots qui n'exécutent pas le JavaScript ; le classement interactif reste chargé par l'API. Pur.
 */

export type LeaguePodiumLine = { rank: number; clanId: number; label: string; powerScore: string; matches: number }

export type LeagueFindings = {
  title: string
  scope: string
  podium: LeaguePodiumLine[]
  summary: string
  formula: string[]
}

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const oneDecimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const longDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })

const placeLabel = (rank: number) => (rank === 1 ? '1re' : `${rank}e`)
const plural = (count: number, singular: string, pluralForm = `${singular}s`) => `${integer.format(count)} ${count > 1 ? pluralForm : singular}`

export function leagueFindings(payload: ClanLeaguePayload, now: Date): LeagueFindings {
  const type = leagueMatchTypeOption(payload.matchType)
  const when = PERIOD_WHEN_LABELS[payload.period]
  const { minMatches, settings } = payload.scoring
  const ranked = payload.standings.length

  const summary =
    ranked === 0
      ? `Aucun clan n’a encore joué ${minMatches} parties ${when} : le classement commence à ${minMatches} parties.`
      : `${plural(ranked, 'clan classé', 'clans classés')}, ${integer.format(payload.qualifying.length)} en qualification ` +
        `(moins de ${minMatches} parties) et ${integer.format(payload.withoutMatch.length)} sans partie ${type.noun} ${when}.`

  const scale = settings.placementPoints.map((points, index) => `${placeLabel(index + 1)} place ${integer.format(points)}`).join(', ')
  const damage = settings.damageWeight !== 1 ? `dégâts × ${oneDecimal.format(settings.damageWeight)}` : 'dégâts'

  return {
    title: `En bref : la Ligue des clans ${when}`,
    scope: `${type.hint.charAt(0).toUpperCase()}${type.hint.slice(1)} · chiffres du ${longDate.format(now)}`,
    podium: payload.standings.slice(0, 3).map((entry) => ({
      rank: entry.rank,
      clanId: entry.clanId,
      label: `${entry.name} [${entry.tag}]`,
      powerScore: integer.format(Math.round(entry.powerScore)),
      matches: entry.matches,
    })),
    summary,
    formula: [
      `Score brut d’un clan, en moyenne par partie et pour ses seuls membres actifs : points de placement × ` +
        `${integer.format(settings.placementWeight)} + ${damage} + kills × ${integer.format(settings.killWeight)} + knocks × ` +
        `${integer.format(settings.knockWeight)}.`,
      `Points de placement : ${scale} ; au-delà de la ${placeLabel(settings.placementPoints.length)} place, 0.`,
      `Pondération par le volume : ${plural(settings.priorMatches, 'partie fictive', 'parties fictives')} au niveau moyen de la ligue ` +
        `s’ajoutent à celles du clan. Avec peu de parties, le Power score reste proche de la moyenne ; plus un clan joue, plus son niveau pèse.`,
      `Un clan est classé à partir de ${minMatches} parties sur la période ; en dessous, il est « en qualification ».`,
    ],
  }
}
