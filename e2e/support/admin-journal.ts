import type { ApiMock } from './api'
import { mockMemberSession } from './session'
import type { AdminActionPage, AdminActionRow } from '@/lib/admin-action-log'

/**
 * Journal d'administration (e2e/admin-journal.spec.ts) : session SuperUser et 120 actions simulées, filtrées et
 * paginées comme le ferait la route. Les adresses demandées sont gardées pour vérifier les filtres envoyés.
 */

const ROWS: AdminActionRow[] = Array.from({ length: 120 }, (_, index) => {
  const failed = index % 10 === 3
  return {
    id: 1000 - index,
    createdAt: new Date(Date.UTC(2026, 9, 7, 20, 0) - index * 600_000).toISOString(),
    action: index % 2 === 0 ? 'clans/[clanId]/telemetry/sync-selected' : 'settings/owner-features',
    method: index % 2 === 0 ? 'POST' : 'PUT',
    status: failed ? 500 : 200,
    outcome: failed ? 'error' : 'success',
    isSuperUser: index % 3 !== 0,
    clanId: index % 2 === 0 ? 1 : null,
    clanName: index % 2 === 0 ? 'Clan Démo' : null,
    userId: index % 3 === 0 ? 8 : 7,
    userLabel: index % 3 === 0 ? 'owner@example.com' : 'admin@example.com',
    memberId: index % 3 === 0 ? 4 : null,
    memberName: index % 3 === 0 ? 'Joueur Owner' : null,
    summary: failed
      ? { error: 'PUBG indisponible' }
      : index % 2 === 0
        ? { result: { ok: true, queuedCount: 4 } }
        : { result: { ok: true } },
  }
})

export function mockAdminJournal(api: ApiMock, options: { missingTable?: boolean } = {}): { urls: URL[] } {
  const calls = { urls: [] as URL[] }
  mockMemberSession(api, { superUser: true })
  api.on('GET', '/api/settings/admin-actions', (url) => {
    calls.urls.push(url)
    if (options.missingTable) {
      return { status: 503, body: { error: 'Journal indisponible : la migration add_admin_action_log n’est pas encore appliquée.' } }
    }
    const outcome = url.searchParams.get('outcome')
    const clanId = Number(url.searchParams.get('clanId')) || null
    const page = Number(url.searchParams.get('page')) || 1
    const rows = ROWS.filter((row) => (!outcome || row.outcome === outcome) && (!clanId || row.clanId === clanId))
    const body: AdminActionPage = {
      rows: rows.slice((page - 1) * 50, page * 50),
      total: rows.length,
      page,
      pageSize: 50,
      clans: [{ id: 1, name: 'Clan Démo' }],
      users: [
        { id: 7, label: 'admin@example.com' },
        { id: 8, label: 'owner@example.com' },
      ],
    }
    return { body }
  })
  return calls
}
