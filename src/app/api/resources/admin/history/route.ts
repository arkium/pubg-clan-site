import { getSessionFromRequest } from '@/lib/auth-session'
import { getResourceHistory } from '@/lib/resources/resource-service-admin'
import { resourceErrorResponse } from '@/lib/resources/resource-service'

/** Historique des décisions des 30 derniers jours (SuperUser) : `?page=` → `ResourceHistoryResponse`. */
export async function GET(request: Request) {
  try {
    const page = new URL(request.url).searchParams.get('page')
    return Response.json(await getResourceHistory(await getSessionFromRequest(request), page))
  } catch (error) {
    return resourceErrorResponse(error, 'admin/history')
  }
}
