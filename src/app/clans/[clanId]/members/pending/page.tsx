'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Gamepad2,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { NavigationTrail } from '@/components/ui/NavigationTrail'

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
    <div className="members-page app-page-surface min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8 space-y-6">
        <NavigationTrail
          currentLabel="Demandes en attente"
          currentHref={`/clans/${clanId}/members/pending`}
          fallbackParent={{ href: `/clans/${clanId}/members`, label: 'Membres', altHref: '/clans' }}
        />

        {/* Hero Header Gaming avec Banner */}
        <header
          className="relative min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/members.jpg')`, backgroundPosition: 'center 20%' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 px-4 py-3 sm:px-6 sm:py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-cyan-400 sm:h-7 sm:w-7" aria-hidden="true" />
                  <h1 className="text-lg font-bold tracking-tight text-white drop-shadow-md sm:text-2xl md:text-3xl">
                    Demandes d&apos;adhésion
                  </h1>
                </div>
                <p className="mt-1 max-w-2xl text-xs font-medium text-gray-200 drop-shadow-md sm:text-sm">
                  {clanName ? `${clanName} · ` : ''}Validez ou refusez les demandes d&apos;intégration des nouveaux joueurs avant leur activation officielle.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                <Link
                  href={`/clans/${clanId}/members`}
                  className="app-btn app-btn--sm app-btn--secondary inline-flex items-center gap-1.5"
                >
                  <Users className="h-4 w-4" />
                  <span>Membres du clan</span>
                </Link>
                <Link
                  href="/members/add"
                  className="app-btn app-btn--sm app-btn--secondary inline-flex items-center gap-1.5"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>Ajouter un joueur</span>
                </Link>
              </div>
            </div>
          </div>
        </header>

        {/* Notifications d'alerte et de succès */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200" role="alert">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
            <div>
              <p className="font-semibold">Une erreur est survenue</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {actionSuccess && (
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200" role="status">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold">Opération réussie</p>
              <p className="mt-0.5">{actionSuccess}</p>
            </div>
          </div>
        )}

        {/* Panneau principal de gestion des demandes */}
        <div className="app-panel p-4 sm:p-6 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Demandes en attente
              </h2>
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                {pending.length}
              </span>
            </div>

            {pending.length > 0 && (
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Rechercher par nom ou pseudo..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            )}
          </div>

          {loading ? (
            <div className="py-12 text-center space-y-2">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              <p className="text-sm text-slate-600 dark:text-slate-400">Chargement des demandes en attente...</p>
            </div>
          ) : pending.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Aucune demande d&apos;adhésion en attente
              </h3>
              <p className="mx-auto max-w-md text-xs text-slate-500 dark:text-slate-400">
                Toutes les candidatures pour rejoindre {clanName ? `le clan ${clanName}` : 'ce clan'} ont été traitées.
              </p>
              <div className="pt-2">
                <Link
                  href={`/clans/${clanId}/members`}
                  className="app-btn app-btn--sm app-btn--secondary inline-flex items-center gap-1.5"
                >
                  <Users className="h-4 w-4" />
                  <span>Consulter l&apos;effectif du clan</span>
                </Link>
              </div>
            </div>
          ) : filteredPending.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Aucun joueur ne correspond à votre recherche « {searchQuery} ».
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPending.map((member) => {
                const initial = member.displayName.trim().charAt(0).toUpperCase() || 'P'
                const isProcessing = pendingAction?.id === member.id

                return (
                  <div
                    key={member.id}
                    className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 font-black text-amber-700 shadow-sm dark:border-amber-800/40 dark:bg-amber-950/40 dark:text-amber-300">
                        <span>{initial}</span>
                        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900 animate-pulse" title="En attente de validation" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {member.displayName}
                          </span>
                          <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {member.pubgPlayerName}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-300">
                            <Gamepad2 className="h-3 w-3" />
                            <span>{PLATFORM_LABELS[member.platformShard] ?? member.platformShard}</span>
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span>
                            Demande reçue le {new Date(member.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setConfirmModal({ member, action: 'reject' })}
                        disabled={isProcessing}
                        className="app-btn app-btn--sm border border-rose-200 text-rose-700 hover:bg-rose-50 hover:border-rose-300 disabled:opacity-50 dark:border-rose-900/50 dark:text-rose-300 dark:hover:bg-rose-950/40 inline-flex items-center gap-1.5"
                      >
                        <X className="h-3.5 w-3.5" />
                        <span>Refuser</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setConfirmModal({ member, action: 'approve' })}
                        disabled={isProcessing}
                        className="app-btn app-btn--sm app-btn--primary inline-flex items-center gap-1.5"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Approuver</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modale interactive de confirmation d'approbation ou refus */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {confirmModal.action === 'approve' ? (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    <UserCheck className="h-6 w-6" />
                  </div>
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
                    <XCircle className="h-6 w-6" />
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    {confirmModal.action === 'approve'
                      ? "Confirmer l'approbation"
                      : 'Refuser la demande'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Action d&apos;administration de clan
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={Boolean(pendingAction)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 text-xs dark:border-slate-800 dark:bg-slate-800/40">
              <div className="flex justify-between">
                <span className="text-slate-500">Joueur :</span>
                <span className="font-bold text-slate-900 dark:text-white">{confirmModal.member.displayName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Compte PUBG :</span>
                <span className="font-mono text-slate-900 dark:text-white">{confirmModal.member.pubgPlayerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Plateforme :</span>
                <span className="text-slate-900 dark:text-white">{PLATFORM_LABELS[confirmModal.member.platformShard] ?? confirmModal.member.platformShard}</span>
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-600 dark:text-slate-400">
              {confirmModal.action === 'approve'
                ? `En approuvant cette demande, ${confirmModal.member.displayName} deviendra officiellement membre actif de votre structure et pourra accéder aux statistiques et fonctionnalités de clan.`
                : `Êtes-vous sûr de vouloir rejeter la demande d'adhésion de ${confirmModal.member.displayName} ? Cette action rejettera sa demande d'intégration.`}
            </p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={Boolean(pendingAction)}
                className="app-btn app-btn--sm app-btn--secondary"
              >
                Annuler
              </button>

              {confirmModal.action === 'approve' ? (
                <button
                  type="button"
                  onClick={() =>
                    executeAction(confirmModal.member.id, 'approve', confirmModal.member.displayName)
                  }
                  disabled={Boolean(pendingAction)}
                  className="app-btn app-btn--sm app-btn--primary inline-flex items-center gap-1.5"
                >
                  {pendingAction?.id === confirmModal.member.id ? (
                    <>
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      <span>Approbation...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Approuver le joueur</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    executeAction(confirmModal.member.id, 'reject', confirmModal.member.displayName)
                  }
                  disabled={Boolean(pendingAction)}
                  className="app-btn app-btn--sm bg-rose-600 text-white hover:bg-rose-700 inline-flex items-center gap-1.5"
                >
                  {pendingAction?.id === confirmModal.member.id ? (
                    <>
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      <span>Refus en cours...</span>
                    </>
                  ) : (
                    <>
                      <X className="h-3.5 w-3.5" />
                      <span>Confirmer le refus</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

