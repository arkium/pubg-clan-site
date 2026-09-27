import { sessionDateOf } from '@/lib/match-sessions'
import { calendarWindow, type CalendarDay } from '@/lib/player-career'
import { prisma } from '@/lib/prisma'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

/**
 * Calendrier du tableau de bord d'un joueur (docs/features/carriere-joueur.md §5) : parties officielles et top 1 par
 * journée de jeu (`sessionDateOf`, 06:00 à 06:00 heure de Paris) sur les 5 dernières semaines, et le nombre de parties
 * par heure de Paris pour le créneau favori. Sans période : la page estompe les jours hors de la sienne.
 */

// `en-GB` : l'heure seule (« 21 »). En `fr-FR`, « 21 h » ne se lit pas comme un nombre.
const PARIS_HOUR = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' })

function parseMemberId(id: string) {
  const memberId = Number(id)
  return Number.isInteger(memberId) && memberId > 0 ? memberId : null
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)
    if (!memberId) {
      return Response.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const authError = await requireSameClanAsMember(memberId, request, { readOnly: true })
    if (authError) return authError

    const today = sessionDateOf(new Date())
    const dates = calendarWindow(today)
    const first = dates[0]
    const last = dates[dates.length - 1]
    // Une journée de jeu commence à 06:00 à Paris : minuit UTC du premier jour la précède toujours.
    const matches = await prisma.match.findMany({
      where: { memberId, matchType: 'official', pubgCreatedAt: { gte: new Date(`${first}T00:00:00Z`) } },
      select: { pubgCreatedAt: true, placement: true },
    })

    const days = new Map<string, CalendarDay>()
    const hours = Array.from({ length: 24 }, () => 0)
    for (const match of matches) {
      const date = sessionDateOf(match.pubgCreatedAt)
      if (date < first || date > last) continue
      const day = days.get(date) ?? { date, games: 0, wins: 0 }
      day.games += 1
      if (match.placement === 1) day.wins += 1
      days.set(date, day)
      hours[Number(PARIS_HOUR.format(match.pubgCreatedAt))] += 1
    }

    return Response.json({ today, days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), hours })
  } catch (error) {
    console.error('Error fetching member calendar:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
