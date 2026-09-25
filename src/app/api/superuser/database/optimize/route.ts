import { NextRequest } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth-session'
import {
  MAINTAINABLE_TABLES,
  analyzeTable,
  clearOptimizeRun,
  assessOptimize,
  readOptimizeRunForDisplay,
  startOptimizeRun,
} from '@/lib/table-maintenance'

/**
 * Compactage et statistiques d'index d'une table (page /settings/superuser/database).
 *
 * `OPTIMIZE TABLE` reconstruit intégralement la table : il dépasse largement une requête HTTP
 * (l'ancienne version rendait un 504 Nginx pendant que MariaDB continuait en silence) et exige
 * autant d'espace disque libre que la table elle-même. Il part donc en tâche de fond, et
 * seulement si le verdict de `assessOptimize` l'autorise — voir `src/lib/table-maintenance.ts`.
 *
 * `ANALYZE TABLE`, lui, ne fait qu'échantillonner les index : il reste synchrone.
 */

const ALLOWED_TABLES = new Set<string>(MAINTAINABLE_TABLES)

async function requireSuperUser(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!session.isSuperUser) return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  return { error: null }
}

export async function GET(req: NextRequest) {
  const guard = await requireSuperUser(req)
  if (guard.error) return guard.error

  try {
    const { searchParams } = new URL(req.url)
    const table = searchParams.get('table') || 'SquadMatchTelemetry'
    if (!ALLOWED_TABLES.has(table)) {
      return Response.json({ error: `Table non autorisée : ${table}` }, { status: 400 })
    }

    const [assessment, run] = await Promise.all([assessOptimize(table), readOptimizeRunForDisplay()])
    return Response.json({ assessment, run })
  } catch (error: unknown) {
    console.error('Erreur lors de la lecture de l’état de compactage:', error)
    const message = error instanceof Error ? error.message : 'Échec de la lecture de l’état de compactage'
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireSuperUser(req)
  if (guard.error) return guard.error

  try {
    const body = (await req.json().catch(() => ({}))) as {
      table?: string
      action?: 'optimize' | 'analyze' | 'dismiss'
      force?: boolean
    }

    // Efface le compte rendu du dernier compactage : purement cosmetique.
    if (body?.action === 'dismiss') {
      await clearOptimizeRun()
      return Response.json({ ok: true, dismissed: true })
    }

    const table = body?.table || 'SquadMatchTelemetry'
    const action = body?.action === 'analyze' ? 'analyze' : 'optimize'

    if (!ALLOWED_TABLES.has(table)) {
      return Response.json({ error: `Table non autorisée : ${table}` }, { status: 400 })
    }

    if (action === 'analyze') {
      const t0 = Date.now()
      const stats = await analyzeTable(table)
      return Response.json({
        ok: true,
        table,
        action,
        durationMs: Date.now() - t0,
        stats,
        message: `Statistiques de la table ${table} recalculées avec succès.`,
      })
    }

    const result = await startOptimizeRun(table, { force: body?.force === true })
    if (!result.started) {
      // 409 et non 500 : la demande est comprise, c'est l'état du serveur qui l'interdit.
      return Response.json(
        { error: result.assessment.reason, assessment: result.assessment },
        { status: 409 }
      )
    }

    return Response.json({
      ok: true,
      table,
      action,
      started: true,
      run: result.state,
      message: `Compactage de ${table} lancé sur le serveur. Vous pouvez quitter cette page.`,
    })
  } catch (error: unknown) {
    console.error('Erreur lors de l’optimisation de la table:', error)
    const message = error instanceof Error ? error.message : 'Échec de l’optimisation de la table'
    return Response.json({ error: message }, { status: 500 })
  }
}
