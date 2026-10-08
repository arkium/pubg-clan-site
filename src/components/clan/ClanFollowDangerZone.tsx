'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PowerOff, RotateCcw, ShieldAlert } from 'lucide-react'

import ClanArchiveDialog from '@/components/clan/ClanArchiveDialog'
import { ButtonSpinner, IconTile, ListSkeleton } from '@/components/ui/CharteKit'
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
    <section
      className="app-panel flex flex-col gap-4 p-4 sm:p-5"
      style={{ borderColor: 'color-mix(in srgb, var(--game-neg) 45%, transparent)' }}
      aria-labelledby={`clan-danger-title-${clanId}`}
    >
      <div className="flex items-start gap-3">
        <IconTile icon={ShieldAlert} tone="neg" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={`clan-danger-title-${clanId}`} className="t-card-title m-0">
            Zone de danger
          </h2>
          <p className="t-meta m-0">Arrêter le suivi coupe la synchronisation du clan, sans rien effacer.</p>
        </div>
      </div>

      <div className="t-body text-gray-700">
        {loadError ? (
          <p className="t-neg m-0">{loadError}</p>
        ) : !clan ? (
          <ListSkeleton rows={1} />
        ) : clan.isSystem ? (
          <p className="m-0">Clan technique du site : son suivi ne peut pas être arrêté.</p>
        ) : clan.state === 'pending' ? (
          <p className="m-0">
            Ce clan attend sa validation.{' '}
            <Link href="/settings/clans/lifecycle?tab=pending" className="app-link font-semibold">
              Le valider ou le refuser
            </Link>
            .
          </p>
        ) : clan.state === 'archived' ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0">
              Ce clan n’est plus suivi depuis le {clan.archivedAt ? new Date(clan.archivedAt).toLocaleDateString('fr-FR') : '—'}
              {clan.archivedReason ? ` (${ARCHIVE_REASON_LABELS[clan.archivedReason] ?? clan.archivedReason})` : ''}.
            </p>
            <button
              type="button"
              onClick={() => void reactivate()}
              disabled={reactivating}
              className="app-btn app-btn--md app-btn--secondary gap-1.5"
            >
              {reactivating ? <ButtonSpinner /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
              {reactivating ? 'Réactivation…' : 'Réactiver le suivi'}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0">
              <span className="t-num font-semibold text-gray-900">{summary.activeMembers}</span> membre(s) actif(s) : vous
              choisirez leur sort à l’étape suivante.
            </p>
            <button type="button" onClick={() => setDialogOpen(true)} className="app-btn app-btn--md app-btn--danger-solid gap-1.5">
              <PowerOff className="h-4 w-4" aria-hidden="true" />
              Arrêter le suivi de ce clan
            </button>
          </div>
        )}
      </div>

      {feedback ? (
        <p role="status" className={`t-body m-0 ${feedback.tone === 'success' ? 't-pos' : 't-neg'}`}>
          {feedback.text}
        </p>
      ) : null}

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
