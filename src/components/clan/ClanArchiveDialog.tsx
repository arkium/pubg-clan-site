'use client'

import { AlertTriangle } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { ClanFollowState, ClanMembersDisposition } from '@/lib/clan-archive-state'

type ClanFollowSummary = {
  clan: { id: number; name: string; tag: string; isSystem: boolean; state: ClanFollowState }
  activeMembers: number
}

type ClanArchiveDialogProps = {
  clan: { id: number; name: string; tag: string }
  onClose: () => void
  /** Appelé après l'archivage, avec le message de l'API. */
  onArchived: (message: string) => void
}

const DISPOSITIONS: Array<{ value: ClanMembersDisposition; title: string; description: string }> = [
  {
    value: 'ungrouped',
    title: 'Les déplacer vers le parking Ungrouped',
    description:
      'Recommandé s’ils continuent de jouer : leurs statistiques restent synchronisées, et le cycle de vie les promouvra s’ils rejoignent un autre clan suivi. Chaque déplacement est journalisé.',
  },
  {
    value: 'deactivate',
    title: 'Désactiver leurs fiches',
    description:
      'Recommandé si le clan est dissous : leur synchronisation PUBG s’arrête. Réactivables un par un depuis l’annuaire des joueurs.',
  },
]

/**
 * Arrêt de suivi d'un clan — docs/TODO/clan-archive.md §4.C.
 *
 * Utilisée par l'Observatoire (« Vos clans suivis ») et par la zone de danger des paramètres
 * du clan. Un clan vide se confirme d'un clic ; un clan avec des membres actifs exige de
 * choisir leur sort, sans choix par défaut.
 */
export default function ClanArchiveDialog({ clan, onClose, onArchived }: ClanArchiveDialogProps) {
  const [summary, setSummary] = useState<ClanFollowSummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [disposition, setDisposition] = useState<ClanMembersDisposition | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/settings/clans/${clan.id}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!response.ok) throw new Error(body?.error ?? 'Chargement impossible.')
        setSummary(body as ClanFollowSummary)
      })
      .catch((caught: unknown) => {
        if (caught instanceof Error && caught.name === 'AbortError') return
        setLoadError(caught instanceof Error ? caught.message : 'Chargement impossible.')
      })
    return () => controller.abort()
  }, [clan.id])

  // Échap ferme la boîte, sauf pendant l'envoi.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, submitting])

  const activeMembers = summary?.activeMembers ?? 0
  const archivable = summary?.clan.state === 'active' && !summary.clan.isSystem
  const needsDisposition = activeMembers > 0
  const canSubmit = archivable && (!needsDisposition || disposition !== null) && !submitting

  async function handleArchive() {
    if (!canSubmit) return
    try {
      setSubmitting(true)
      setError(null)
      const response = await fetch(`/api/settings/clans/${clan.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'archive',
          ...(needsDisposition && disposition ? { membersDisposition: disposition } : {}),
        }),
      })
      const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null
      if (!response.ok) throw new Error(body?.error ?? 'Archivage impossible.')
      onArchived(body?.message ?? 'Clan archivé.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Archivage impossible.')
    } finally {
      setSubmitting(false)
    }
  }

  const label = clan.tag ? `[${clan.tag}] ${clan.name}` : clan.name

  return (
    <div
      className="app-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clan-archive-title"
    >
      <div className="app-modal-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/10 text-red-500">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="clan-archive-title" className="text-lg font-semibold text-gray-900">
              Ne plus suivre {label} ?
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              La synchronisation des matchs s’arrête et le clan disparaît de la liste des clans et des classements.
            </p>
          </div>
        </div>

        <div className="app-modal-callout mt-4 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <p className="text-sm">
            <strong>L’historique est conservé.</strong> Matchs, duels et tournois restent en base, et le clan peut être
            réactivé à tout moment depuis l’onglet « Clans archivés » du cycle de vie.
          </p>
        </div>

        <div className="mt-4 text-sm text-gray-700">
          {loadError ? (
            <p className="text-red-600">{loadError}</p>
          ) : !summary ? (
            <p className="text-gray-500">Chargement…</p>
          ) : summary.clan.isSystem ? (
            <p>Le clan technique du site ne peut pas être archivé.</p>
          ) : summary.clan.state !== 'active' ? (
            <p>
              {summary.clan.state === 'archived'
                ? 'Ce clan n’est déjà plus suivi.'
                : 'Ce clan attend sa validation : refusez sa demande depuis le cycle de vie des clans.'}
            </p>
          ) : !needsDisposition ? (
            <p>Ce clan n’a aucun membre actif : aucune autre question.</p>
          ) : (
            <fieldset>
              <legend className="font-semibold text-gray-900">
                Que deviennent ses {activeMembers} membre(s) actif(s) ?
              </legend>
              <div className="mt-2 space-y-2">
                {DISPOSITIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      disposition === option.value
                        ? 'border-red-400 bg-red-50 dark:border-red-700 dark:bg-red-950/30'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800'
                    }`}
                  >
                    <input
                      type="radio"
                      name="clan-archive-disposition"
                      value={option.value}
                      checked={disposition === option.value}
                      onChange={() => setDisposition(option.value)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-semibold text-gray-900">{option.title}</span>
                      <span className="mt-0.5 block text-xs text-gray-600">{option.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} disabled={submitting} className="app-btn app-btn--md app-btn--secondary">
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleArchive()}
            disabled={!canSubmit}
            className="app-btn app-btn--md app-btn--danger"
          >
            {submitting ? 'Archivage…' : 'Ne plus suivre ce clan'}
          </button>
        </div>
      </div>
    </div>
  )
}
