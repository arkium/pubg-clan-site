/**
 * Lecture de zone — bloc « En bref » rendu côté serveur (docs/TODO/geo-seo-propositions.md, lot 2) : les chiffres de
 * l'analyse en phrases complètes, avec leur périmètre et leur date. C'est le texte que lisent les robots qui
 * n'exécutent pas le JavaScript (moteurs génératifs) ; l'analyse interactive de la page reste chargée par l'API.
 *
 * Chaque titre vient des chiffres, comme les verdicts de l'onglet Analyse (mêmes fonctions et mêmes seuils).
 * Fichier pur, sans import `@/`.
 */
import {
  closingVerdict,
  practicalRule,
  ZONE_READING_BAND_METERS,
  ZONE_READING_FIRST_CIRCLE_SHARE,
  ZONE_READING_MIN_MATCHES,
} from './zone-reading-analysis'
import { ZONE_READING_MODE_LABELS, type ZoneReadingAnalysis } from './zone-reading-api'

export type ZoneReadingFinding = { lead: string; detail: string }

export type ZoneReadingFindings = {
  title: string
  /** Mode, ancienneté des parties et date des chiffres. */
  scope: string
  findings: ZoneReadingFinding[]
  /** Parties analysées par carte, la plus jouée en tête. */
  maps: Array<{ label: string; matches: number }>
  method: string
}

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const longDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })

const ordinal = (value: number) => (value === 1 ? '1er' : `${value}e`)

/** `null` quand la carte n'a pas assez de parties : l'onglet Analyse n'affiche alors pas de chiffres non plus. */
export function zoneReadingFindings(
  payload: ZoneReadingAnalysis,
  labelOf: (mapName: string) => string,
  now: Date
): ZoneReadingFindings | null {
  const stats = payload.stats
  if (!payload.ready || !stats || !payload.mapName) return null

  const findings: ZoneReadingFinding[] = []

  const firstRandom = stats.crossesFirstRandomShare
  findings.push({
    lead:
      stats.crossesFirstShare >= ZONE_READING_FIRST_CIRCLE_SHARE
        ? 'Le premier cercle croise presque toujours la ligne de vol.'
        : 'La ligne de vol ne croise pas toujours le premier cercle.',
    detail:
      `La ligne de vol du C-130 traverse le premier cercle dans ${percent.format(stats.crossesFirstShare)} des parties` +
      (firstRandom !== null ? `, contre ${percent.format(firstRandom)} avec la ligne de vol d’une autre partie.` : '.'),
  })

  // Même règle que `bandExplanation` : la ligne n'« attire » la zone finale que nettement au-dessus du hasard.
  const bandRandom = stats.bandRandomShare
  const attracts = bandRandom !== null && stats.bandShare >= bandRandom * 2 && stats.bandShare >= 0.5
  findings.push({
    lead: attracts ? 'La ligne de vol attire la zone finale.' : 'La zone finale ne suit pas la ligne de vol.',
    detail:
      `${percent.format(stats.bandShare)} des zones finales tombent à moins de ${ZONE_READING_BAND_METERS} m de la ligne de vol` +
      (bandRandom !== null ? ` ; au hasard, ce serait ${percent.format(bandRandom)}` : '') +
      `. Distance médiane entre la zone finale et la ligne : ${integer.format(stats.finalLineMedian)} m.`,
  })

  const bars = stats.closing.filter((bar) => bar.total > 0)
  if (bars.length > 0) {
    const shares = bars.map((bar) => bar.share)
    const low = percent.format(Math.min(...shares))
    const high = percent.format(Math.max(...shares))
    findings.push({
      lead: closingVerdict(stats),
      detail:
        `Du ${ordinal(bars[0].circle)} au ${ordinal(bars[bars.length - 1].circle)} cercle, un cercle se rapproche de la ligne de vol ` +
        `dans ${low === high ? low : `${low} à ${high}`} des cas : 50 %, c’est le hasard.`,
    })
  }

  const rows = stats.rule.filter((row) => row.total > 0)
  if (rows.length > 0) {
    const first = rows[0]
    const last = rows[rows.length - 1]
    findings.push({
      lead: practicalRule(rows),
      detail:
        `Erreur médiane sur la zone finale en visant le centre : ${integer.format(first.center)} m au ${ordinal(first.circle)} cercle, ` +
        `${integer.format(last.center)} m au ${ordinal(last.circle)} ; en visant la ligne de vol : ${integer.format(first.line)} m ` +
        `et ${integer.format(last.line)} m.`,
    })
  }

  const since = payload.since ? `parties depuis le ${longDate.format(new Date(payload.since))}` : 'toutes les parties'
  return {
    title: `En bref : ce que disent ${integer.format(payload.matchCount)} parties sur ${labelOf(payload.mapName)}`,
    scope: `${ZONE_READING_MODE_LABELS[payload.mode]}, ${since} · chiffres du ${longDate.format(now)}`,
    findings,
    maps: payload.mapOptions.map((option) => ({ label: labelOf(option.mapName), matches: option.matches })),
    method: ZONE_READING_METHOD,
  }
}

/**
 * Méthode de la page, en clair : la barre « Comment c'est calculé ? » (`CalculationHelp`) l'affiche même quand le
 * résumé du serveur est indisponible.
 */
export const ZONE_READING_METHOD =
  'Ces chiffres viennent de la télémétrie officielle de chaque partie (API PUBG) : ligne de vol du C-130, cercles ' +
  'successifs et zone finale, pour les parties normales et classées des clans suivis par le site. « Au hasard » ' +
  'confronte chaque zone finale à la ligne de vol de la partie suivante. Une carte n’est analysée qu’au-delà de ' +
  `${integer.format(ZONE_READING_MIN_MATCHES)} parties.`
