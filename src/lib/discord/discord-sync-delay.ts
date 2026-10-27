import { getCronRunsPerDay } from '@/lib/cron-frequency'

/**
 * Délai annoncé d'une alerte Top 1 (page `/clans/[clanId]/settings/discord`) : l'alerte part quand la synchronisation
 * des parties (`daily_sync`) importe la partie, pas en direct. Le délai ajoute le temps que PUBG publie la partie
 * (quelques minutes), l'attente du passage suivant et le tour du clan dans ce passage : la fréquence, plus un quart
 * d'heure (docs/TODO/synchro-parties-30-min.md §4). Module pur, importable côté client.
 */

export type Top1DelayInfo = {
  /** Minutes entre deux synchronisations ; `null` quand l'expression n'est pas une fréquence simple. */
  everyMinutes: number | null
  text: string
}

const MARGIN_MINUTES = 15

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} minutes`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? (hours === 1 ? '1 heure' : `${hours} heures`) : `${hours} h ${String(rest).padStart(2, '0')}`
}

/** « toutes les 30 minutes », « toutes les heures », « toutes les 4 heures », « toutes les 1 h 30 ». */
function everyLabel(minutes: number) {
  return minutes === 60 ? 'toutes les heures' : `toutes les ${formatDuration(minutes)}`
}

export function describeTop1Delay(expression: string | null | undefined): Top1DelayInfo {
  const runsPerDay = expression ? getCronRunsPerDay(expression) : null
  const everyMinutes = runsPerDay && runsPerDay > 0 ? Math.round((24 * 60) / runsPerDay) : null

  if (everyMinutes === null) {
    return {
      everyMinutes,
      text: 'Pas en direct : l’alerte part quand le site relit les parties du clan auprès de PUBG, ce qui peut prendre plusieurs heures.',
    }
  }

  return {
    everyMinutes,
    text:
      `Pas en direct : l’alerte part quand le site relit les parties du clan auprès de PUBG, ${everyLabel(everyMinutes)}. ` +
      `Compte en général jusqu’à ${formatDuration(everyMinutes + MARGIN_MINUTES)} après la fin de la partie.`,
  }
}
