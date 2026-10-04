'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, Megaphone, Send, X } from 'lucide-react'

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

const roundLabel = (round: Round) => `Manche #${round.roundNumber} — ${formatDateTime(round.playedAt)}`

/** Pastille « déjà diffusée » : orange d'attente (charte §1.3), jamais jaune. */
function SentBadge() {
  return (
    <span className="shrink-0 rounded-[6px] bg-[var(--game-warn-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--game-warn)]">
      Déjà diffusée
    </span>
  )
}

/**
 * Choix de la manche : menu de la charte (`app-menu-trigger` / `app-menu`), intitulé au-dessus — jamais de `<select>`
 * natif. Le nombre de manches n'est pas borné : la liste défile dans le menu.
 */
function RoundMenu({ rounds, value, onChange }: { rounds: Round[]; value: string | null; onChange: (matchId: string) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  const current = rounds.find((round) => round.squadMatchId === value) ?? rounds[rounds.length - 1]
  return (
    <div className="flex flex-col gap-1">
      <span id="broadcast-round-label" className="text-[13px] font-semibold text-gray-700">
        Manche à diffuser
      </span>
      <div ref={rootRef} className="relative">
        <button
          id="broadcast-round"
          type="button"
          onClick={() => setOpen((state) => !state)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Manche à diffuser : ${roundLabel(current)}${current.sentAt ? ' (déjà diffusée)' : ''}`}
          className="app-menu-trigger h-9 w-full justify-between"
        >
          <span className="t-num truncate">{roundLabel(current)}</span>
          <span className="flex shrink-0 items-center gap-2">
            {current.sentAt ? <SentBadge /> : null}
            <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </span>
        </button>
        {open ? (
          <div role="menu" aria-labelledby="broadcast-round-label" className="app-menu absolute inset-x-0 top-full z-20 mt-1.5">
            {rounds.map((round) => (
              <button
                key={round.squadMatchId}
                type="button"
                role="menuitemradio"
                aria-checked={round.squadMatchId === current.squadMatchId}
                onClick={() => {
                  onChange(round.squadMatchId)
                  setOpen(false)
                }}
                className={`app-menu__item ${round.squadMatchId === current.squadMatchId ? 'app-menu__item--active' : ''}`}
              >
                <span className="t-num truncate">{roundLabel(round)}</span>
                {round.sentAt ? <SentBadge /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Diffusion d'une manche de tournoi sur Discord : choix de la manche, aperçu exact du message, envoi sur confirmation.
 * Ouverte depuis l'administration des tournois et depuis la page d'un tournoi (API de props inchangée).
 *
 * Modale de la charte UI (docs/ui/index.html#modales) : voile `app-modal-backdrop`, carte `app-panel`, tuile d'icône
 * teintée à l'accent, titre de section, Annuler en secondaire et confirmation en principal. Alertes aux jetons :
 * manche déjà diffusée en orange d'attente (`--game-warn`), erreur au jeton négatif.
 */
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

  // Échap ferme la modale (un menu ouvert se ferme d'abord : il intercepte la même touche), sauf pendant l'envoi.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || sending) return
      if (document.querySelector('#broadcast-round[aria-expanded="true"]')) return
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose, sending])

  return (
    <div
      className="app-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tournament-broadcast-title"
      data-testid="tournament-broadcast-modal"
    >
      {/* En-tête et actions fixes, corps défilant : sur mobile, « Confirmer » reste à portée sous un long aperçu. */}
      <div className="app-panel flex max-h-[90vh] w-full max-w-2xl flex-col p-5 sm:p-6">
        <div className="flex shrink-0 items-start gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--theme-ui-accent-soft)] shadow-[inset_0_0_0_1px_var(--theme-ui-accent-ring)]"
            aria-hidden="true"
          >
            <Megaphone className="h-[18px] w-[18px] text-[var(--theme-ui-accent-text)]" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 id="tournament-broadcast-title" className="t-section-title">
              Diffuser une manche sur Discord
            </h2>
            <p className="t-meta break-words">{tournamentTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="-mr-1 -mt-1 shrink-0 rounded-[8px] p-1.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="-mx-1 mt-5 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
          {loadingRounds ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              <p className="t-meta">Chargement des manches…</p>
              <div className="app-panel-muted h-24 animate-pulse motion-reduce:animate-none" />
            </div>
          ) : rounds.length === 0 ? (
            // État vide de la charte : bordure tiretée, rayon 14.
            <div className="rounded-[14px] border border-dashed border-gray-200 px-4 py-6 text-center">
              <p className="t-body text-gray-700">
                Aucune manche comptabilisée pour l&apos;instant. Lancez d&apos;abord une synchronisation du tournoi.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <RoundMenu rounds={rounds} value={selectedMatchId} onChange={setSelectedMatchId} />

              {preview?.alreadySentAt ? (
                <div
                  role="status"
                  className="flex items-start gap-2.5 rounded-[14px] border border-[color-mix(in_srgb,var(--game-warn)_45%,transparent)] bg-[var(--game-warn-soft)] px-3.5 py-3"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--game-warn)]" aria-hidden="true" />
                  <p className="t-body text-gray-700">
                    Cette manche a déjà été diffusée le <span className="t-num">{formatDateTime(preview.alreadySentAt)}</span>. La
                    confirmer publiera un second message.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="t-label">Aperçu du message</span>
                  {preview?.usesTournamentOverride ? <span className="t-meta">Envoi via le webhook spécifique de ce tournoi.</span> : null}
                </div>
                {/* Pendant le calcul d'une autre manche, l'aperçu précédent reste affiché, estompé. */}
                <div
                  className={`app-panel-muted p-3 transition-opacity sm:p-4 ${loadingPreview && preview ? 'opacity-60' : ''}`}
                  aria-busy={loadingPreview}
                  data-testid="tournament-broadcast-preview"
                >
                  {preview ? (
                    <DiscordEmbedPreview payload={preview.preview} />
                  ) : loadingPreview ? (
                    <p className="t-meta">Calcul des scores de la manche…</p>
                  ) : (
                    <p className="t-meta">Aucun aperçu disponible.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {error ? (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-[14px] border border-[color-mix(in_srgb,var(--theme-ui-negative)_45%,transparent)] bg-[color-mix(in_srgb,var(--theme-ui-negative)_10%,transparent)] px-3.5 py-3"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--theme-ui-negative)]" aria-hidden="true" />
              <p className="t-body text-gray-700">{error}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex shrink-0 flex-wrap items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="app-btn app-btn--md app-btn--secondary">
            Annuler
          </button>
          <button
            type="button"
            onClick={handleBroadcast}
            disabled={sending || loadingPreview || !preview}
            className="app-btn app-btn--md app-btn--primary gap-1.5"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {sending
              ? 'Envoi en cours…'
              : preview?.alreadySentAt
                ? 'Confirmer et rediffuser'
                : 'Confirmer et envoyer sur Discord'}
          </button>
        </div>
      </div>
    </div>
  )
}
