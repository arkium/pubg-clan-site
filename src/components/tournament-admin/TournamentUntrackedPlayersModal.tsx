'use client'

import { AlertTriangle, CheckCircle2, RefreshCw, UserPlus, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { UntrackedPlayer, UntrackedPlayersReport } from '@/lib/tournament-untracked-players'

type Props = {
  clanId: number
  tournamentId: string
  tournamentTitle: string
  onClose: () => void
  /** Au moins un joueur ajouté : la page recharge ses tournois en fermant. */
  onAdded: (message: string) => void
}

type RowState = { status: 'idle' | 'adding' | 'added' | 'error'; message?: string }

/**
 * Étapes annoncées pendant l'ajout, qui prend de quelques secondes à une minute (appels PUBG, inscription du clan,
 * rattachement aux manches) : sans ce message, le bouton semble figé (demande du 2026-10-11).
 */
function progressLabel(player: UntrackedPlayer) {
  const steps = ['recherche du joueur sur PUBG']
  if (!player.siteClan && player.pubgClan) steps.push('inscription de son clan sur le site')
  steps.push('rattachement aux manches et recalcul du classement')
  return `Ajout en cours : ${steps.join(', ')}. Cela peut prendre jusqu’à une minute : attends le message final.`
}

function destinationLabel(player: UntrackedPlayer) {
  if (player.siteClan) return `Rejoindra ${player.siteClan.tag ? `[${player.siteClan.tag}] ` : ''}${player.siteClan.name}`
  if (player.pubgClan) {
    return `Inscrira son clan ${player.pubgClan.tag ? `[${player.pubgClan.tag}] ` : ''}${player.pubgClan.name ?? ''} sur le site`.trim()
  }
  return 'Rejoindra « Ungrouped » (aucun clan PUBG connu)'
}

/**
 * Joueurs non suivis d'un tournoi (demande du 2026-10-11) : présents dans les manches d'après la télémétrie, mais
 * inconnus du site — ils ne marquent rien et leurs kills manquent à leur squad. « Ajouter » les inscrit avec les règles
 * d'« Ajouter un joueur » (clan PUBG inscrit au besoin, par le SuperUser) et les rattache aussitôt aux manches.
 *
 * Modale de la charte UI (docs/ui/index.html#modales) : voile, carte `app-panel`, tuile d'icône à l'accent, corps qui
 * défile, actions fixes.
 */
export default function TournamentUntrackedPlayersModal({ clanId, tournamentId, tournamentTitle, onClose, onAdded }: Props) {
  const [report, setReport] = useState<UntrackedPlayersReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [addedMessages, setAddedMessages] = useState<string[]>([])

  const baseUrl = `/api/clans/${clanId}/tournaments/${tournamentId}/untracked-players`
  const adding = Object.values(rows).some((row) => row.status === 'adding')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch(baseUrl, { cache: 'no-store' })
        const payload = (await response.json().catch(() => null)) as (UntrackedPlayersReport & { error?: string }) | null
        if (!response.ok || !payload) throw new Error(payload?.error ?? 'Impossible de lister les joueurs non suivis.')
        if (!cancelled) setReport(payload)
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Impossible de lister les joueurs non suivis.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [baseUrl])

  function close() {
    if (adding) return
    if (addedMessages.length > 0) onAdded(addedMessages.join(' '))
    onClose()
  }

  // Échap ferme la modale, sauf pendant un ajout.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  async function add(player: UntrackedPlayer) {
    setRows((current) => ({ ...current, [player.accountId]: { status: 'adding' } }))
    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ accountId: player.accountId }),
      })
      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null
      if (!response.ok) throw new Error(payload?.error ?? 'Ajout impossible.')
      const message = payload?.message ?? `${player.name ?? 'Joueur'} ajouté.`
      setRows((current) => ({ ...current, [player.accountId]: { status: 'added', message } }))
      setAddedMessages((current) => [...current, message])
    } catch (caught) {
      setRows((current) => ({
        ...current,
        [player.accountId]: { status: 'error', message: caught instanceof Error ? caught.message : 'Ajout impossible.' },
      }))
    }
  }

  const players = report?.players ?? []

  return (
    <div
      className="app-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tournament-untracked-title"
      data-testid="tournament-untracked-modal"
    >
      <div className="app-panel flex max-h-[90vh] w-full max-w-2xl flex-col p-5 sm:p-6">
        <div className="flex shrink-0 items-start gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--theme-ui-accent-soft)] shadow-[inset_0_0_0_1px_var(--theme-ui-accent-ring)]"
            aria-hidden="true"
          >
            <UserPlus className="h-[18px] w-[18px] text-[var(--theme-ui-accent-text)]" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 id="tournament-untracked-title" className="t-section-title">
              Joueurs non suivis
            </h2>
            <p className="t-meta break-words">{tournamentTitle}</p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={adding}
            aria-label="Fermer"
            className="-mr-1 -mt-1 shrink-0 rounded-[8px] p-1.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="-mx-1 mt-4 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
          <p className="t-body text-gray-700">
            Présents dans les manches mais inconnus du site : ils ne marquent aucun point et leurs kills manquent à leur
            squad. Les ajouter les rattache aux manches et recalcule le classement aussitôt.
          </p>

          {loading ? (
            <div className="mt-4 flex flex-col gap-2" aria-busy="true">
              <p className="t-meta">Comparaison du lobby de chaque manche avec les joueurs suivis…</p>
              <div className="app-panel-muted h-20 animate-pulse motion-reduce:animate-none" />
            </div>
          ) : error ? (
            <p role="alert" className="mt-4 flex items-start gap-1.5 text-[13px] font-semibold text-[var(--theme-ui-negative)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-2.5">
              {report && report.roundsWithoutTelemetry.length > 0 ? (
                <p className="t-meta">
                  Manche{report.roundsWithoutTelemetry.length > 1 ? 's' : ''} {report.roundsWithoutTelemetry.join(', ')} sans
                  télémétrie analysée : non vérifiée{report.roundsWithoutTelemetry.length > 1 ? 's' : ''}.
                </p>
              ) : null}
              {players.length === 0 ? (
                <div className="app-panel-muted flex items-start gap-2.5 p-3">
                  <CheckCircle2 className="t-pos mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p className="t-body text-gray-700">Tous les joueurs des manches sont suivis par le site.</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2" aria-label="Joueurs non suivis">
                  {players.map((player) => {
                    const row = rows[player.accountId] ?? { status: 'idle' }
                    return (
                      <li key={player.accountId} className="app-panel-muted flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="text-sm text-gray-900">
                            <b>{player.name ?? 'Pseudo inconnu'}</b>
                            {player.pubgClan?.tag ? <span className="text-gray-500"> · [{player.pubgClan.tag}]</span> : null}
                          </span>
                          <span className="t-meta t-num">
                            Manche{player.rounds.length > 1 ? 's' : ''} {player.rounds.join(', ')} · {player.kills} kill
                            {player.kills > 1 ? 's' : ''}
                          </span>
                          {player.teammates.length > 0 ? (
                            <span className="t-meta break-words">Avec {player.teammates.join(', ')}</span>
                          ) : null}
                          <span className="t-meta">{destinationLabel(player)}</span>
                          {row.status === 'adding' ? (
                            <span role="status" className="t-sky flex items-start gap-1.5 text-[13px] font-semibold">
                              <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                              {progressLabel(player)}
                            </span>
                          ) : null}
                          {row.message ? (
                            <span
                              role={row.status === 'error' ? 'alert' : 'status'}
                              className={`text-[13px] font-semibold ${row.status === 'error' ? 'text-[var(--theme-ui-negative)]' : 't-pos'}`}
                            >
                              {row.message}
                            </span>
                          ) : null}
                        </div>
                        {row.status === 'added' ? (
                          <span className="t-pos inline-flex shrink-0 items-center gap-1 text-[13px] font-bold">
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                            Ajouté
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void add(player)}
                            disabled={adding || !player.name}
                            className="app-btn app-btn--sm app-btn--secondary shrink-0 gap-1.5 self-start sm:self-center"
                          >
                            {row.status === 'adding' ? (
                              <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                            ) : (
                              <UserPlus className="h-4 w-4" aria-hidden="true" />
                            )}
                            {row.status === 'adding' ? 'Ajout en cours…' : 'Ajouter au site'}
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 flex shrink-0 justify-end">
          <button type="button" onClick={close} disabled={adding} className="app-btn app-btn--md app-btn--secondary">
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
