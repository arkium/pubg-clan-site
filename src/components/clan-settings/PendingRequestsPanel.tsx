'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, CheckCircle2, Clock, Search, ShieldCheck, UserCheck, X, XCircle } from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { MembersSectionHeader } from '@/components/clan-settings/MembersSettingsTabs'
import { Callout, ConfirmDialog, CountPill, EmptyState, ListSkeleton, Tag, toneStyle } from '@/components/ui/CharteKit'

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

const PLATFORM_LABELS: Record<string, string> = {
  steam: 'Steam (PC)',
  xbox: 'Xbox',
  psn: 'PlayStation',
  kakao: 'Kakao (KR)',
}

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/** Onglet « Demandes d’adhésion » de /clans/[clanId]/settings/members (ex-/clans/[clanId]/members/pending, lot 3b). */
export default function PendingRequestsPanel() {
  const params = useParams()
  const router = useRouter()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const { loading: sessionLoading, authenticated, permissions, isSuperUser } = useAuthSession()

  const canManagePending = useMemo(() => {
    if (isSuperUser) return true
    if (permissions.includes('*')) return true
    return (
      permissions.includes('manage_members') ||
      permissions.includes('manage_roles') ||
      permissions.includes('manage_settings')
    )
  }, [isSuperUser, permissions])

  const [pending, setPending] = useState<PendingMember[]>([])
  const [clanName, setClanName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [pendingAction, setPendingAction] = useState<{ id: number; action: 'approve' | 'reject' } | null>(null)
  const [confirmModal, setConfirmModal] = useState<{ member: PendingMember; action: 'approve' | 'reject' } | null>(null)

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

  async function executeAction(memberId: number, action: 'approve' | 'reject', memberName: string) {
    if (!clanId) return

    try {
      setPendingAction({ id: memberId, action })
      setError(null)
      setActionSuccess(null)

      const response = await fetch(`/api/clans/${clanId}/members/${memberId}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(
          payload?.error ??
            (action === 'approve'
              ? "Impossible d'approuver le membre."
              : 'Impossible de refuser la demande.')
        )
      }

      setPending((prev) => prev.filter((m) => m.id !== memberId))
      setActionSuccess(
        action === 'approve'
          ? `Le joueur « ${memberName} » a été approuvé et activé avec succès dans le clan.`
          : `La demande d'adhésion de « ${memberName} » a été refusée.`
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : action === 'approve'
            ? "Impossible d'approuver le membre."
            : 'Impossible de refuser la demande.'
      )
    } finally {
      setPendingAction(null)
      setConfirmModal(null)
    }
  }

  const filteredPending = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return pending
    return pending.filter(
      (m) =>
        m.displayName.toLowerCase().includes(q) ||
        m.pubgPlayerName.toLowerCase().includes(q)
    )
  }, [pending, searchQuery])

  if (!clanId || sessionLoading || !authenticated || !canManagePending) return null

  return (
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
      <MembersSectionHeader
        clanId={clanId}
        active="demandes"
        title="Demandes d’adhésion"
        subtitle={`${clanName ? `${clanName} · ` : ''}Validez ou refusez les demandes des joueurs avant leur activation dans le clan.`}
        icon={UserCheck}
        pills={[<><span className="t-num">{pending.length}</span> en attente</>]}
      />

      {error ? (
        <Callout tone="warn" icon={AlertCircle} title="Une erreur est survenue">
          {error}
        </Callout>
      ) : null}
      {actionSuccess ? (
        <p className="t-body t-pos m-0 flex items-start gap-2" role="status">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {actionSuccess}
        </p>
      ) : null}

      <section className="flex flex-col gap-2.5" aria-labelledby="pending-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pending-title" className="t-section-title m-0 flex items-center gap-2">
            Demandes en attente <CountPill count={pending.length} actionable={pending.length > 0} />
          </h2>
          {pending.length > 0 ? (
            <label className="relative w-full sm:w-72">
              <span className="sr-only">Rechercher une demande</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
              <input
                type="text"
                placeholder="Nom ou pseudo PUBG…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="app-input pl-9"
              />
            </label>
          ) : null}
        </div>

        {loading ? (
          <ListSkeleton rows={3} />
        ) : pending.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Aucune demande en attente"
            text={
              <>
                Toutes les candidatures pour rejoindre {clanName ? `le clan ${clanName}` : 'ce clan'} ont été traitées.{' '}
                <Link href={`/clans/${clanId}/members`} className="app-link font-semibold">
                  Voir les membres du clan
                </Link>
              </>
            }
          />
        ) : filteredPending.length === 0 ? (
          <EmptyState icon={Search} title={`Aucune demande ne correspond à « ${searchQuery} »`} />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {filteredPending.map((member) => {
              const initial = member.displayName.trim().charAt(0).toUpperCase() || 'P'
              const isProcessing = pendingAction?.id === member.id
              return (
                <li key={member.id} className="app-panel flex flex-wrap items-center justify-between gap-3 p-3.5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] text-base font-black"
                      style={toneStyle('warn')}
                      title="En attente de validation"
                    >
                      {initial}
                    </span>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="t-card-title">{member.displayName}</span>
                        <Tag tone="neutral">{member.pubgPlayerName}</Tag>
                        <Tag tone="sky">{PLATFORM_LABELS[member.platformShard] ?? member.platformShard}</Tag>
                      </span>
                      <span className="t-meta flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Demande reçue le{' '}
                        {new Date(member.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmModal({ member, action: 'reject' })}
                      disabled={isProcessing}
                      className="app-btn app-btn--sm app-btn--danger gap-1.5"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      Refuser
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmModal({ member, action: 'approve' })}
                      disabled={isProcessing}
                      className="app-btn app-btn--sm app-btn--primary gap-1.5"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      Approuver
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {confirmModal ? (
        <ConfirmDialog
          icon={confirmModal.action === 'approve' ? UserCheck : XCircle}
          title={
            confirmModal.action === 'approve'
              ? `Approuver ${confirmModal.member.displayName} ?`
              : `Refuser la demande de ${confirmModal.member.displayName} ?`
          }
          confirmLabel={confirmModal.action === 'approve' ? 'Approuver le joueur' : 'Refuser la demande'}
          tone={confirmModal.action === 'approve' ? 'primary' : 'danger'}
          busy={Boolean(pendingAction)}
          onCancel={() => setConfirmModal(null)}
          onConfirm={() => executeAction(confirmModal.member.id, confirmModal.action, confirmModal.member.displayName)}
        >
          {confirmModal.member.pubgPlayerName} · {PLATFORM_LABELS[confirmModal.member.platformShard] ?? confirmModal.member.platformShard}.{' '}
          {confirmModal.action === 'approve'
            ? 'Le joueur devient membre actif du clan et accède à ses statistiques et fonctionnalités.'
            : 'Sa demande d’intégration est rejetée.'}
        </ConfirmDialog>
      ) : null}
    </div>
  )
}
