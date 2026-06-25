'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'

interface PendingMember {
  id: number
  displayName: string
  pubgPlayerName: string
  platformShard: string
  isActive: boolean
  joinStatus: string
  createdAt: string
}

interface ClanPendingResponse {
  pending: PendingMember[]
  clanName: string
}

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default function PendingMembersPage() {
  const params = useParams()
  const router = useRouter()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const { loading: sessionLoading, authenticated, permissions, isSuperUser } = useAuthSession()

  const canManagePending = useMemo(() => {
    if (isSuperUser) return true
    if (permissions.includes('*')) return true
    return (
      permissions.includes('manage_members')
      || permissions.includes('manage_roles')
      || permissions.includes('manage_settings')
    )
  }, [isSuperUser, permissions])

  const [pending, setPending] = useState<PendingMember[]>([])
  const [clanName, setClanName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<{ id: number; action: 'approve' | 'reject' } | null>(null)

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }

    setClanId(clanId)
  }, [clanId, router, setClanId])

  useEffect(() => {
    if (!clanId || sessionLoading) return
    if (!authenticated || !canManagePending) {
      router.replace(`/clans/${clanId}/members`)
    }
  }, [authenticated, canManagePending, clanId, router, sessionLoading])

  useEffect(() => {
    if (!clanId || sessionLoading || !authenticated || !canManagePending) return

    async function loadPending() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`/api/clans/${clanId}/members?status=pending`, {
          cache: 'no-store',
        })

        if (response.status === 401 || response.status === 403) {
          router.replace(`/clans/${clanId}/members`)
          return
        }

        if (!response.ok) {
          throw new Error('Impossible de charger les demandes en attente.')
        }

        const data = (await response.json().catch(() => null)) as ClanPendingResponse | null
        if (data) {
          setPending(data.pending)
          setClanName(data.clanName)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Impossible de charger les demandes en attente.')
      } finally {
        setLoading(false)
      }
    }

    void loadPending()
  }, [authenticated, canManagePending, clanId, router, sessionLoading])

  async function handleAction(memberId: number, action: 'approve' | 'reject') {
    if (!clanId) return

    try {
      setPendingAction({ id: memberId, action })
      const response = await fetch(`/api/clans/${clanId}/members/${memberId}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })

      if (!response.ok) {
        throw new Error(action === 'approve' ? 'Impossible d\'approuver le membre.' : 'Impossible de refuser le membre.')
      }

      setPending((prev) => prev.filter((m) => m.id !== memberId))
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : action === 'approve'
            ? 'Impossible d\'approuver le membre.'
            : 'Impossible de refuser le membre.'
      )
    } finally {
      setPendingAction(null)
    }
  }

  if (!clanId || sessionLoading || !authenticated || !canManagePending) return null

  return (
    <main className="app-container app-main">
      <header className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Demandes d'adhesion</h1>
            <p className="text-sm text-gray-600">
              {clanName ? `${clanName} · ` : ''}Valide les nouveaux joueurs avant activation dans le clan.
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="app-panel p-8 text-center">
          <p className="text-slate-600 dark:text-slate-400">Chargement des demandes en attente...</p>
        </div>
      ) : pending.length === 0 ? (
        <div className="app-panel p-8 text-center">
          <p className="text-slate-600 dark:text-slate-400">Aucune demande d'adhesion en attente.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((member) => (
            <div
              key={member.id}
              className="app-panel flex items-center justify-between gap-3 p-4"
            >
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {member.displayName}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {member.pubgPlayerName} ({member.platformShard})
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                  Demande recue le {new Date(member.createdAt).toLocaleDateString('fr-FR')}
                </p>
              </div>

              <button
                onClick={() => {
                  if (window.confirm(`Refuser ${member.displayName} ?`)) {
                    void handleAction(member.id, 'reject')
                  }
                }}
                disabled={pendingAction?.id === member.id}
                className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
              >
                {pendingAction?.id === member.id && pendingAction.action === 'reject' ? 'Refus...' : 'Refuser'}
              </button>

              <button
                onClick={() => void handleAction(member.id, 'approve')}
                disabled={pendingAction?.id === member.id}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-700 dark:hover:bg-emerald-600"
              >
                {pendingAction?.id === member.id && pendingAction.action === 'approve' ? 'Approbation...' : 'Approuver'}
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
