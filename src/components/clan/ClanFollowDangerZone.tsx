'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'

import ClanArchiveDialog from '@/components/clan/ClanArchiveDialog'
import type { ClanFollowState } from '@/lib/clan-archive-state'

type ClanFollowSummary = {
  clan: {
    id: number
    name: string
    tag: string
    isSystem: boolean
    state: ClanFollowState
    archivedAt: string | null
    archivedReason: string | null
  }
  activeMembers: number
}

const ARCHIVE_REASON_LABELS: Record<string, string> = {
  unfollowed: 'suivi arrêté par un SuperUser',
  rejected: 'demande de création refusée',
}

/**
 * « Zone de danger » des paramètres d'un clan, réservée au SuperUser —
 * docs/TODO/clan-archive.md §4.C. Arrête ou reprend le suivi du clan.
 */
export default function ClanFollowDangerZone({ clanId }: { clanId: number }) {
  const [summary, setSummary] = useState<ClanFollowSummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reactivating, setReactivating] = useState(false)
  const [feedback, setFeedback] = useState<{ text: string; tone: 'success' | 'error' } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/settings/clans/${clanId}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!response.ok) throw new Error(body?.error ?? 'Chargement impossible.')
        setSummary(body as ClanFollowSummary)
        setLoadError(null)
      })
      .catch((caught: unknown) => {
        if (caught instanceof Error && caught.name === 'AbortError') return
        setLoadError(caught instanceof Error ? caught.message : 'Chargement impossible.')
      })
    return () => controller.abort()
  }, [clanId, refreshKey])

  async function reactivate() {
    try {
      setReactivating(true)
      setFeedback(null)
      const response = await fetch(`/api/settings/clans/${clanId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'reactivate' }),
      })
      const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null
      if (!response.ok) throw new Error(body?.error ?? 'Réactivation impossible.')
      setFeedback({ text: body?.message ?? 'Clan réactivé.', tone: 'success' })
      setRefreshKey((key) => key + 1)
    } catch (caught) {
      setFeedback({ text: caught instanceof Error ? caught.message : 'Réactivation impossible.', tone: 'error' })
    } finally {
      setReactivating(false)
    }
  }

  const clan = summary?.clan

  return (
    <section className="app-panel rounded-2xl border border-red-200 p-6 dark:border-red-900/60">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-500" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Zone de danger</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Réservée au SuperUser. Arrêter le suivi coupe la synchronisation du clan sans rien effacer.
          </p>

          <div className="mt-4 text-sm text-slate-700 dark:text-slate-300">
            {loadError ? (
              <p className="text-red-600">{loadError}</p>
            ) : !clan ? (
              <p className="text-slate-500">Chargement…</p>
            ) : clan.isSystem ? (
              <p>Clan technique du site : son suivi ne peut pas être arrêté.</p>
            ) : clan.state === 'pending' ? (
              <p>
                Ce clan attend sa validation.{' '}
                <Link href="/settings/clan-lifecycle?tab=pending" className="font-semibold text-indigo-600 underline dark:text-indigo-400">
                  Le valider ou le refuser
                </Link>
                .
              </p>
            ) : clan.state === 'archived' ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p>
                  Ce clan n’est plus suivi depuis le{' '}
                  {clan.archivedAt ? new Date(clan.archivedAt).toLocaleDateString('fr-FR') : '—'}
                  {clan.archivedReason ? ` (${ARCHIVE_REASON_LABELS[clan.archivedReason] ?? clan.archivedReason})` : ''}.
                </p>
                <button
                  type="button"
                  onClick={() => void reactivate()}
                  disabled={reactivating}
                  className="app-btn app-btn--md app-btn--secondary"
                >
                  {reactivating ? 'Réactivation…' : 'Réactiver le suivi'}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p>
                  {summary.activeMembers} membre(s) actif(s). Vous choisirez leur sort à l’étape suivante.
                </p>
                <button
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  className="app-btn app-btn--md app-btn--danger-solid"
                >
                  Désactiver le suivi de ce clan
                </button>
              </div>
            )}
          </div>

          {feedback ? (
            <p
              role="status"
              className={`mt-3 text-sm ${feedback.tone === 'success' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'}`}
            >
              {feedback.text}
            </p>
          ) : null}
        </div>
      </div>

      {dialogOpen && clan ? (
        <ClanArchiveDialog
          clan={clan}
          onClose={() => setDialogOpen(false)}
          onArchived={(message) => {
            setDialogOpen(false)
            setFeedback({ text: message, tone: 'success' })
            setRefreshKey((key) => key + 1)
          }}
        />
      ) : null}
    </section>
  )
}
