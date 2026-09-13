'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Megaphone } from 'lucide-react'

import DiscordEmbedPreview from '@/components/discord/DiscordEmbedPreview'
import type { DiscordWebhookPayload } from '@/lib/discord/discord-client'

type Round = {
  squadMatchId: string
  roundNumber: number
  mapName: string | null
  gameMode: string | null
  playedAt: string
  sentAt: string | null
}

type Preview = {
  preview: DiscordWebhookPayload
  roundNumber: number
  totalRounds: number
  usesTournamentOverride: boolean
  alreadySentAt: string | null
}

type Props = {
  clanId: number
  tournamentId: string
  tournamentTitle: string
  onClose: () => void
  onBroadcast: (message: string) => void
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function TournamentBroadcastModal({
  clanId,
  tournamentId,
  tournamentTitle,
  onClose,
  onBroadcast,
}: Props) {
  const [rounds, setRounds] = useState<Round[]>([])
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loadingRounds, setLoadingRounds] = useState(true)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const baseUrl = `/api/clans/${clanId}/tournaments/${tournamentId}/discord`

  useEffect(() => {
    let cancelled = false

    async function loadRounds() {
      try {
        const response = await fetch(baseUrl, { cache: 'no-store' })
        const payload = (await response.json().catch(() => null)) as
          | { rounds?: Round[]; error?: string }
          | null

        if (!response.ok) throw new Error(payload?.error ?? 'Impossible de charger les manches.')

        if (!cancelled) {
          const loaded = payload?.rounds ?? []
          setRounds(loaded)
          // La derniere manche jouee est celle qu'on diffuse presque toujours.
          setSelectedMatchId(loaded[loaded.length - 1]?.squadMatchId ?? null)
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Impossible de charger les manches.')
        }
      } finally {
        if (!cancelled) setLoadingRounds(false)
      }
    }

    void loadRounds()

    return () => {
      cancelled = true
    }
  }, [baseUrl])

  useEffect(() => {
    if (!selectedMatchId) return

    let cancelled = false

    async function loadPreview() {
      setLoadingPreview(true)
      setError(null)

      try {
        const response = await fetch(`${baseUrl}?matchId=${encodeURIComponent(selectedMatchId!)}`, {
          cache: 'no-store',
        })
        const payload = (await response.json().catch(() => null)) as (Preview & { error?: string }) | null

        if (!response.ok) throw new Error(payload?.error ?? 'Prévisualisation impossible.')

        if (!cancelled) setPreview(payload)
      } catch (caught) {
        if (!cancelled) {
          setPreview(null)
          setError(caught instanceof Error ? caught.message : 'Prévisualisation impossible.')
        }
      } finally {
        if (!cancelled) setLoadingPreview(false)
      }
    }

    void loadPreview()

    return () => {
      cancelled = true
    }
  }, [baseUrl, selectedMatchId])

  const handleBroadcast = useCallback(async () => {
    if (!selectedMatchId) return

    try {
      setSending(true)
      setError(null)

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ matchId: selectedMatchId }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { message?: string; error?: string }
        | null

      if (!response.ok) throw new Error(payload?.error ?? 'Diffusion impossible.')

      onBroadcast(payload?.message ?? 'Manche publiée sur Discord.')
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Diffusion impossible.')
    } finally {
      setSending(false)
    }
  }, [baseUrl, onBroadcast, onClose, selectedMatchId])

  return (
    <div
      className="app-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tournament-broadcast-title"
    >
      <div className="app-modal-card max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10 text-indigo-500">
              <Megaphone className="h-6 w-6" />
            </div>
            <div>
              <h3
                id="tournament-broadcast-title"
                className="text-lg font-black text-slate-900 dark:text-white"
              >
                Diffuser une manche sur Discord
              </h3>
              <p className="app-modal-subtitle text-xs text-slate-500 dark:text-slate-400">
                {tournamentTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            Fermer
          </button>
        </div>

        {loadingRounds ? (
          <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">Chargement des manches...</p>
        ) : rounds.length === 0 ? (
          <div className="app-modal-callout mt-6 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Aucune manche comptabilisée pour l&apos;instant. Lancez d&apos;abord une
              synchronisation du tournoi.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-6 space-y-2">
              <label
                htmlFor="broadcast-round"
                className="text-sm font-medium text-slate-700 dark:text-slate-200"
              >
                Manche à diffuser
              </label>
              <select
                id="broadcast-round"
                value={selectedMatchId ?? ''}
                onChange={(event) => setSelectedMatchId(event.target.value)}
                className="app-modal-select w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {rounds.map((round) => (
                  <option key={round.squadMatchId} value={round.squadMatchId}>
                    Manche #{round.roundNumber} — {formatDateTime(round.playedAt)}
                    {round.sentAt ? ' (déjà diffusée)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {preview?.alreadySentAt ? (
              <div className="app-modal-callout mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/60 dark:bg-amber-950/30">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Cette manche a déjà été diffusée le {formatDateTime(preview.alreadySentAt)}. La
                  confirmer publiera un second message.
                </p>
              </div>
            ) : null}

            {preview?.usesTournamentOverride ? (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Envoi via le webhook spécifique de ce tournoi.
              </p>
            ) : null}

            <div className="app-modal-inner-card mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              {loadingPreview ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Calcul des scores de la manche...
                </p>
              ) : preview ? (
                <DiscordEmbedPreview payload={preview.preview} />
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">Aucun aperçu disponible.</p>
              )}
            </div>
          </>
        )}

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className="app-btn app-btn--md app-btn--secondary">
            Annuler
          </button>
          <button
            type="button"
            onClick={handleBroadcast}
            disabled={sending || loadingPreview || !preview}
            className="app-btn app-btn--md app-btn--primary"
          >
            {sending
              ? 'Envoi en cours...'
              : preview?.alreadySentAt
                ? 'Confirmer et rediffuser'
                : 'Confirmer et envoyer sur Discord'}
          </button>
        </div>
      </div>
    </div>
  )
}
