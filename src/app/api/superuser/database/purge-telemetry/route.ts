import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/auth-session'
import {
  clearGeoPurgeRun,
  parseSelection,
  readGeoPurgeCounts,
  readGeoPurgeRunForDisplay,
  refreshGeoPurgeCounts,
  requestGeoPurgeCancel,
  startGeoPurgeRun,
} from '@/lib/telemetry-geo-purge'

/**
 * Statut et pilotage de la purge de géolocalisation (page /settings/superuser/database).
 *
 * Cette route ne compte plus rien elle-même : le comptage coûte 247 s (scan complet de ~22 Go,
 * voir `src/lib/telemetry-geo-purge.ts`) et dépassait le `proxy_read_timeout` de Nginx, ce qui
 * faisait afficher « Aucun match ne correspond au filtre » alors que des milliers de matchs
 * attendaient. Le comptage est produit une fois par nuit par le cron `telemetry_geo_purge_count`
 * et servi ici depuis `AppConfig` — donc instantanément, et pour tous les seuils d'un coup.
 *
 * La purge, elle, s'exécute côté serveur : `POST { action: 'start' }` lance la boucle et rend la
 * main. La page ne fait que lire l'avancement, on peut donc la quitter.
 */

/** Un recomptage manuel à la fois : deux scans simultanés se disputeraient les mêmes 22 Go. */
let recountInFlight = false

async function requireSuperUser(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  return session && session.isSuperUser ? session : null
}

export async function GET(req: NextRequest) {
  try {
    if (!(await requireSuperUser(req))) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const [counts, run] = await Promise.all([readGeoPurgeCounts(), readGeoPurgeRunForDisplay()])

    // Sert de repère quand aucun comptage n'a encore été publié (première installation du cron).
    const totalRowsRes = await prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(*) as total FROM SquadMatchTelemetry
    `

    return Response.json({
      counts,
      run,
      recounting: recountInFlight,
      totalRows: Number(totalRowsRes[0]?.total ?? 0),
    })
  } catch (err: unknown) {
    console.error('Error fetching purge status:', err)
    const message = err instanceof Error ? err.message : 'Erreur lors de la lecture du statut de purge'
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await requireSuperUser(req))) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as {
      action?: 'start' | 'cancel' | 'recount' | 'dismiss'
      olderThanDays?: number | string
    }

    // Efface le compte rendu de la derniere purge : purement cosmetique, rien n'est annule.
    if (body.action === 'dismiss') {
      await clearGeoPurgeRun()
      return Response.json({ ok: true, dismissed: true })
    }

    if (body.action === 'cancel') {
      const cancelled = await requestGeoPurgeCancel()
      return Response.json({ ok: true, cancelled })
    }

    if (body.action === 'recount') {
      if (recountInFlight) {
        return Response.json({ ok: true, alreadyRunning: true })
      }
      recountInFlight = true
      // Détaché de la réponse : le scan dure ~4 min, la page se contente de relire le statut.
      void refreshGeoPurgeCounts()
        .catch((error) => console.error('[geo-purge] recomptage manuel impossible', error))
        .finally(() => {
          recountInFlight = false
        })
      return Response.json({ ok: true, started: true })
    }

    if (body.action !== 'start') {
      return Response.json({ error: 'Action inconnue' }, { status: 400 })
    }

    const selection = parseSelection(body.olderThanDays)
    const counts = await readGeoPurgeCounts()
    const threshold = counts?.byThreshold?.[String(selection)]

    // Sans comptage publié, on ignore l'ampleur : mieux vaut refuser que lancer à l'aveugle.
    if (!threshold) {
      return Response.json(
        {
          error:
            'Aucun comptage disponible pour ce seuil. Lancez un recomptage et attendez son résultat avant de purger.',
        },
        { status: 409 }
      )
    }

    if (threshold.purgeable === 0) {
      return Response.json({ ok: true, started: false, reason: 'nothing_to_purge' })
    }

    const result = await startGeoPurgeRun(selection, threshold.purgeable)
    if (!result.started) {
      return Response.json(
        { error: 'Une purge est déjà en cours.', run: result.state },
        { status: 409 }
      )
    }

    return Response.json({ ok: true, started: true, run: result.state })
  } catch (err: unknown) {
    console.error('Error starting telemetry purge:', err)
    const message = err instanceof Error ? err.message : 'Erreur lors de la purge'
    return Response.json({ error: message }, { status: 500 })
  }
}
