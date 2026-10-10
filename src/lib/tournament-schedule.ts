/**
 * Horaires d'un tournoi — docs/features/tournois.md, « Horaires ». Module pur (ni Prisma ni React) : la capture des
 * manches, la phase (à venir, en direct, terminé), le formulaire d'administration et l'affichage s'y fient tous.
 *
 * `startDate` et `endDate` sont des horodatages UTC. Deux formes coexistent, sans migration :
 * - **journée entière** (tournois d'avant le 2026-10-10, ou heures laissées vides) : minuit UTC pile, la fin couvrant
 *   tout son dernier jour (jusqu'à 23:59:59.999 UTC) ;
 * - **heure précise**, saisie en heure de Paris (« 21:00 → 03:00 le lendemain ») et convertie en UTC. Une heure qui
 *   tomberait pile sur minuit UTC est décalée d'une milliseconde, pour ne jamais passer pour une journée entière.
 */

export const TOURNAMENT_TIME_ZONE = 'Europe/Paris'

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Saisie refusée (heure mal formée, titre avec lien…) : les routes la renvoient en 400 avec son message. */
export class TournamentInputError extends Error {}

const parisParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TOURNAMENT_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function zonedParts(date: Date) {
  const parts = Object.fromEntries(parisParts.formatToParts(date).map((part) => [part.type, part.value]))
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

/** Écart de l'heure de Paris sur l'UTC à cet instant (+1 h en hiver, +2 h en été), en millisecondes. */
function parisOffsetMs(date: Date) {
  const parts = zonedParts(date)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - (date.getTime() - date.getUTCMilliseconds())
}

const pad = (value: number) => String(value).padStart(2, '0')

/** « 2026-10-10 » et « 21:00 », heure de Paris → instant UTC (changement d'heure compris). */
export function parisLocalToUtc(day: string, time: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const guess = Date.UTC(year, month - 1, date, hour, minute)
  const firstPass = guess - parisOffsetMs(new Date(guess))
  return new Date(guess - parisOffsetMs(new Date(firstPass)))
}

/** Faux pour une journée entière (minuit UTC pile), vrai pour une heure précise. */
export function hasScheduledTime(value: Date | string) {
  const date = new Date(value)
  return !(date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0)
}

/**
 * Instant enregistré pour un jour et une heure facultative. Sans heure : la date telle quelle (journée entière, ou
 * horodatage ISO d'un ancien appelant). Avec une heure : heure de Paris, jamais minuit UTC pile.
 */
export function tournamentInstant(day: Date | string, time?: string | null): Date {
  if (!time) return new Date(day)
  if (!TIME_PATTERN.test(time)) {
    throw new TournamentInputError(`Heure invalide (« ${time} ») : format attendu HH:MM.`)
  }
  const dayString = typeof day === 'string' ? day.slice(0, 10) : day.toISOString().slice(0, 10)
  if (!DAY_PATTERN.test(dayString)) {
    throw new TournamentInputError('Date invalide : format attendu AAAA-MM-JJ.')
  }
  const instant = parisLocalToUtc(dayString, time)
  return hasScheduledTime(instant) ? instant : new Date(instant.getTime() + 1)
}

/** Fin réelle de la fenêtre : l'instant précis, ou la fin du dernier jour (UTC) pour une journée entière. */
export function tournamentWindowEnd(end: Date | string): Date {
  const date = new Date(end)
  if (!hasScheduledTime(date)) date.setUTCHours(23, 59, 59, 999)
  return date
}

/** Jour et heure à remettre dans le formulaire : heure de Paris, ou `null` pour une journée entière. */
export function tournamentLocalParts(value: Date | string): { date: string; time: string | null } {
  const date = new Date(value)
  if (!hasScheduledTime(date)) return { date: date.toISOString().slice(0, 10), time: null }
  const parts = zonedParts(date)
  return { date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`, time: `${pad(parts.hour)}:${pad(parts.minute)}` }
}

// ── Affichage ────────────────────────────────────────────────────────────────────────────────────────

// Une journée entière s'affiche en UTC (sa date exacte, quel que soit le fuseau du lecteur) ; une heure, en heure de Paris.
const formatters = (timeZone: string) => ({
  dayMonth: new Intl.DateTimeFormat('fr-FR', { timeZone, day: 'numeric', month: 'short' }),
  weekday: new Intl.DateTimeFormat('fr-FR', { timeZone, weekday: 'short' }),
  day: new Intl.DateTimeFormat('fr-FR', { timeZone, day: '2-digit' }),
  month: new Intl.DateTimeFormat('fr-FR', { timeZone, month: 'short' }),
  time: new Intl.DateTimeFormat('fr-FR', { timeZone, hour: '2-digit', minute: '2-digit' }),
})
const UTC_FORMAT = formatters('UTC')
const PARIS_FORMAT = formatters(TOURNAMENT_TIME_ZONE)

function formatOf(value: Date) {
  return hasScheduledTime(value) ? PARIS_FORMAT : UTC_FORMAT
}

/** « 21:00 » (heure de Paris) pour une heure précise, `null` pour une journée entière. */
export function tournamentTimeLabel(value: Date | string) {
  const date = new Date(value)
  return hasScheduledTime(date) ? PARIS_FORMAT.time.format(date).replace(' ', '') : null
}

/** Pavé de date d'une carte : « SAM », « 10 », « OCT », et l'heure si elle est précisée. */
export function tournamentDayParts(value: Date | string) {
  const date = new Date(value)
  const format = formatOf(date)
  const clean = (text: string) => text.replace('.', '').toUpperCase()
  return {
    weekday: clean(format.weekday.format(date)),
    day: format.day.format(date),
    month: clean(format.month.format(date)),
    time: tournamentTimeLabel(date),
  }
}

/**
 * Période d'un tournoi : « 22 sept. → 28 sept. », « 10 oct. » pour un seul jour ; avec des heures,
 * « 10 oct. 21:00 → 11 oct. 03:00 », ou « 10 oct. 21:00 → 23:30 » le même jour.
 */
export function formatTournamentPeriod(start: Date | string, end: Date | string) {
  const startDate = new Date(start)
  const endDate = new Date(end)
  const startDay = formatOf(startDate).dayMonth.format(startDate)
  const endDay = formatOf(endDate).dayMonth.format(endDate)
  const startTime = tournamentTimeLabel(startDate)
  const endTime = tournamentTimeLabel(endDate)

  if (!startTime && !endTime) return startDay === endDay ? startDay : `${startDay} → ${endDay}`
  const from = startTime ? `${startDay} ${startTime}` : startDay
  if (startDay === endDay && endTime) return `${from} → ${endTime}`
  return `${from} → ${endTime ? `${endDay} ${endTime}` : endDay}`
}
