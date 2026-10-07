
import { withAdminActionLog } from '@/lib/admin-action-log'
import { getSessionFromRequest } from '@/lib/auth-session'
import { rememberSessionActor } from '@/lib/auth/admin-actor'
import { getPubgApiCallsOverview, purgePubgApiCallLogHistory } from '@/lib/pubg-api-call-log-service'
import { getPubgApiRateLimitBounds, getPubgApiRateLimitRpm } from '@/lib/pubg-rate-limit-config-service'

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!session.isSuperUser) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const historyPageRaw = Number(url.searchParams.get('page'))
  const historyPageSizeRaw = Number(url.searchParams.get('pageSize'))
  const errorsOnlyRaw = (url.searchParams.get('errorsOnly') ?? '').toLowerCase()
  const historyQueryRaw = url.searchParams.get('q')
  const historyClanIdRaw = Number(url.searchParams.get('clanId'))

  const overview = await getPubgApiCallsOverview({
    historyPage: Number.isFinite(historyPageRaw) ? historyPageRaw : undefined,
    historyPageSize: Number.isFinite(historyPageSizeRaw) ? historyPageSizeRaw : undefined,
    errorsOnly: errorsOnlyRaw === '1' || errorsOnlyRaw === 'true',
    historyQuery: historyQueryRaw ?? undefined,
    historyClanId: Number.isFinite(historyClanIdRaw) && historyClanIdRaw > 0 ? historyClanIdRaw : undefined,
  })

  const [rpm, bounds] = await Promise.all([
    getPubgApiRateLimitRpm(),
    Promise.resolve(getPubgApiRateLimitBounds()),
  ])

  return Response.json({
    rpm,
    bounds,
    ...overview,
  })
}

async function handleDelete(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!session.isSuperUser) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  rememberSessionActor(request, session)

  const deletedCount = await purgePubgApiCallLogHistory()
  return Response.json({ deletedCount })
}

export const DELETE = withAdminActionLog('settings/pubg-api-calls', handleDelete)
