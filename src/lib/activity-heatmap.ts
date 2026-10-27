/**
 * Calendrier d'activité d'un joueur (`/members/[id]/heatmap`) : parties par jour de la semaine et par heure. Module pur,
 * testé par `activity-heatmap.test.ts` ; la page ne fait que l'afficher.
 */

import { sessionDateOf } from '@/lib/match-sessions'

export type ActivityCell = { dayIndex: number; hour: number; count: number }

// `en-GB` : jour court en anglais (« Mon ») et heure seule (« 21 »), faciles à lire comme des clés.
const PARIS_SLOT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', hourCycle: 'h23' })
const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

/**
 * Case d'une partie dans le calendrier : jour (0 = lundi) et heure **de Paris**, quel que soit le fuseau du serveur — UTC
 * en production, ce qui décalait les heures d'une ou deux heures (docs/TODO/aide-des-pages.md §0, g).
 */
export function parisSlotOf(at: Date): { dayIndex: number; hour: number } {
  const parts = PARIS_SLOT.formatToParts(at)
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Mon'
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0')
  return { dayIndex: WEEKDAY_INDEX[weekday] ?? 0, hour: hour === 24 ? 0 : hour }
}

/** Jours actifs : soirées distinctes (journée de 06:00, heure de Paris), pas des dates UTC. */
export function activeSessionDays(playedAt: readonly Date[]): number {
  return new Set(playedAt.map((at) => sessionDateOf(at))).size
}

export const ACTIVITY_DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const
const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const

/**
 * Palier de l'échelle séquentielle de la charte (`app-seq-0` à `app-seq-4`, rampe jaune validée le 03/10/2026) : 0 sans
 * partie, puis quatre quarts du créneau le plus joué.
 */
export function activityLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0
  const ratio = count / max
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

/** Parties par jour de la semaine (index 0 = lundi). */
export function activityByDay(cells: readonly ActivityCell[]) {
  const totals = Array.from({ length: 7 }, () => 0)
  for (const cell of cells) if (cell.dayIndex >= 0 && cell.dayIndex < 7) totals[cell.dayIndex] += cell.count
  return totals
}

/** Créneau le plus joué ; à égalité, le plus tôt dans la semaine puis dans la journée. `null` sans partie. */
export function busiestSlot(cells: readonly ActivityCell[]) {
  let best: ActivityCell | null = null
  for (const cell of cells) {
    if (cell.count <= 0) continue
    if (!best || cell.count > best.count || (cell.count === best.count && (cell.dayIndex < best.dayIndex || (cell.dayIndex === best.dayIndex && cell.hour < best.hour)))) {
      best = cell
    }
  }
  return best
}

export const activityHourLabel = (hour: number) => `${String(hour).padStart(2, '0')}h`

/** « Samedi, 21h–22h » */
export function slotLabel(slot: ActivityCell) {
  const day = DAY_NAMES[slot.dayIndex] ?? ''
  return `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${activityHourLabel(slot.hour)}–${activityHourLabel((slot.hour + 1) % 24)}`
}

export const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`
