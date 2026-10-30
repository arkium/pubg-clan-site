import 'server-only'

import { getMatchSyncHealthSummary } from '@/lib/match-sync-health-service'
import { prisma } from '@/lib/prisma'
import { isSuperUserSession } from '@/middleware/auth-permission'

/**
 * Fraîcheur des parties (`/settings/cron`, docs/TODO/fraicheur-des-parties.md) : le résumé que la synchronisation écrit
 * à chaque tour dans `AppConfig`, et le tag des clans de ses parties en attente. Aucune requête sur `Match` ni sur le
 * journal PUBG : la page s'ouvre sans rien recalculer.
 */
export async function GET(request: Request) {
  if (!(await isSuperUserSession(request))) {
    return Response.json({ error: 'Acces reserve au SuperUser' }, { status: 403 })
  }

  try {
    const health = await getMatchSyncHealthSummary()
    const clanIds = [...new Set(health?.pending.entries.map((entry) => entry.clanId) ?? [])]
    const clans =
      clanIds.length > 0 ? await prisma.clan.findMany({ where: { id: { in: clanIds } }, select: { id: true, tag: true, name: true } }) : []

    return Response.json({ ok: true, health, clans })
  } catch (error) {
    console.error('[match-sync-health] Lecture du résumé impossible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
