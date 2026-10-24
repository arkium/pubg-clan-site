'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Copy, Megaphone, Send, X } from 'lucide-react'

import DiscordEmbedPreview from '@/components/discord/DiscordEmbedPreview'
import type { DiscordWebhookPayload } from '@/lib/discord/discord-client'
import { DISCORD_MESSAGE_LIMIT, discordPayloadToText, splitDiscordMessage } from '@/lib/discord/discord-payload-text'

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
  /** Absent pour le classement par escouade et le résumé. */
  roundNumber?: number
  totalRounds: number
  usesTournamentOverride: boolean
  alreadySentAt: string | null
  /** Un webhook valide existe ; sinon, le message se copie et se colle à la main (2026-10-24). */
  canSend?: boolean
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

/** Choix du menu autres qu'une manche : le classement par escouade (2026-10-11) et le résumé du tournoi (2026-10-24). */
const SQUADS = 'squads'
const SUMMARY = 'summary'
const SQUADS_LABEL = 'Classement final par squad'

type ExtraAvailability = { available: boolean; sentAt: string | null }
type SummaryAvailability = ExtraAvailability & { final: boolean }
type ExtraOption = { value: string; label: string; sentAt: string | null }

/** Pastille « déjà diffusée » : orange d'attente (charte §1.3), jamais jaune. */
function SentBadge({ label = 'Déjà diffusée' }: { label?: string }) {
  return (
    <span className="shrink-0 rounded-[6px] bg-[var(--game-warn-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--game-warn)]">
      {label}
    </span>
  )
}

/**
 * Choix du message : une manche, puis les messages de tout le tournoi (classement par escouade, résumé). Menu de la
 * charte (`app-menu-trigger` / `app-menu`), intitulé au-dessus — jamais de `<select>` natif. Le nombre de manches n'est
 * pas borné : la liste défile dans le menu.
 */
function RoundMenu({
  rounds,
  extras,
  value,
  onChange,
}: {
  rounds: Round[]
  extras: ExtraOption[]
  value: string | null
  onChange: (selection: string) => void
}) {
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
  const extra = extras.find((option) => option.value === value) ?? null
  const current = rounds.find((round) => round.squadMatchId === value) ?? rounds[rounds.length - 1]
  const currentLabel = extra ? extra.label : roundLabel(current)
  const currentSentAt = extra ? extra.sentAt : current.sentAt
  return (
    <div className="flex flex-col gap-1">
      <span id="broadcast-round-label" className="text-[13px] font-semibold text-gray-700">
        Message à diffuser
      </span>
      <div ref={rootRef} className="relative">
        <button
          id="broadcast-round"
          type="button"
          onClick={() => setOpen((state) => !state)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Message à diffuser : ${currentLabel}${currentSentAt ? ' (déjà diffusé)' : ''}`}
          className="app-menu-trigger h-9 w-full justify-between"
        >
          <span className="t-num truncate">{currentLabel}</span>
          <span className="flex shrink-0 items-center gap-2">
            {currentSentAt ? <SentBadge label={extra ? 'Déjà diffusé' : undefined} /> : null}
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
                aria-checked={!extra && round.squadMatchId === current.squadMatchId}
                onClick={() => {
                  onChange(round.squadMatchId)
                  setOpen(false)
                }}
                className={`app-menu__item ${!extra && round.squadMatchId === current.squadMatchId ? 'app-menu__item--active' : ''}`}
              >
                <span className="t-num truncate">{roundLabel(round)}</span>
                {round.sentAt ? <SentBadge /> : null}
              </button>
            ))}
            {extras.map((option, index) => (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={extra?.value === option.value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`app-menu__item ${index === 0 ? 'border-t border-gray-200' : ''} ${extra?.value === option.value ? 'app-menu__item--active' : ''}`}
              >
                <span className="truncate">{option.label}</span>
                {option.sentAt ? <SentBadge label="Déjà diffusé" /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Diffusion d'un tournoi sur Discord : une manche, le classement par escouade ou le résumé du tournoi ; aperçu exact du
 * message, envoi sur confirmation. Sans webhook configuré, le message se copie (en parties de 2 000 caractères au besoin)
 * pour être collé à la main dans Discord. Ouverte depuis l'administration des tournois et depuis la page d'un tournoi
 * (API de props inchangée).
 *
 * Modale de la charte UI (docs/ui/index.html#modales) : voile `app-modal-backdrop`, carte `app-panel`, tuile d'icône
 * teintée à l'accent, titre de section, Annuler en secondaire et confirmation en principal. Alertes aux jetons :
 * message déjà diffusé et webhook absent en orange d'attente (`--game-warn`), erreur au jeton négatif.
 */
export default function TournamentBroadcastModal({
  clanId,
  tournamentId,
  tournamentTitle,
  onClose,
  onBroadcast,
}: Props) {
  const [rounds, setRounds] = useState<Round[]>([])
  const [squadStandings, setSquadStandings] = useState<ExtraAvailability | null>(null)
  const [summary, setSummary] = useState<SummaryAvailability | null>(null)
  // Identifiant de la manche choisie, `SQUADS` (classement par escouade) ou `SUMMARY` (résumé du tournoi).
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loadingRounds, setLoadingRounds] = useState(true)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Copie rattachée à l'aperçu copié : changer de message efface d'elle-même la confirmation.
  const [copied, setCopied] = useState<{ preview: Preview; index: number } | null>(null)
  const [copyFallback, setCopyFallback] = useState<{ preview: Preview; text: string } | null>(null)

  const baseUrl = `/api/clans/${clanId}/tournaments/${tournamentId}/discord`
  const extras: ExtraOption[] = [
    ...(squadStandings?.available ? [{ value: SQUADS, label: SQUADS_LABEL, sentAt: squadStandings.sentAt }] : []),
    ...(summary?.available
      ? [{ value: SUMMARY, label: summary.final ? 'Résumé du tournoi' : 'Résumé du tournoi (provisoire)', sentAt: summary.sentAt }]
      : []),
  ]

  useEffect(() => {
    let cancelled = false

    async function loadRounds() {
      try {
        const response = await fetch(baseUrl, { cache: 'no-store' })
        const payload = (await response.json().catch(() => null)) as
          | { rounds?: Round[]; squadStandings?: ExtraAvailability; summary?: SummaryAvailability; error?: string }
          | null

        if (!response.ok) throw new Error(payload?.error ?? 'Impossible de charger les manches.')

        if (!cancelled) {
          const loaded = payload?.rounds ?? []
          setRounds(loaded)
          setSquadStandings(payload?.squadStandings ?? null)
          setSummary(payload?.summary ?? null)
          // Tournoi terminé : le résumé. Sinon, la dernière manche jouée, celle qu'on diffuse presque toujours.
          setSelectedMatchId(
            payload?.summary?.available && payload.summary.final ? SUMMARY : (loaded[loaded.length - 1]?.squadMatchId ?? null)
          )
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
        const query =
          selectedMatchId === SQUADS || selectedMatchId === SUMMARY
            ? `view=${selectedMatchId}`
            : `matchId=${encodeURIComponent(selectedMatchId!)}`
        const response = await fetch(`${baseUrl}?${query}`, { cache: 'no-store' })
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

  // Webhook inconnu tant que l'aperçu n'est pas arrivé : le bouton d'envoi reste en place, désactivé.
  const canSend = preview?.canSend ?? true
  const copyParts = useMemo(() => (preview ? splitDiscordMessage(discordPayloadToText(preview.preview)) : []), [preview])
  const copiedIndex = copied && copied.preview === preview ? copied.index : null
  const fallbackText = copyFallback && copyFallback.preview === preview ? copyFallback.text : null

  const handleCopy = useCallback(
    async (index: number) => {
      if (!preview) return
      const text = copyParts[index]
      try {
        await navigator.clipboard.writeText(text)
        setCopyFallback(null)
        setCopied({ preview, index })
        window.setTimeout(() => setCopied((current) => (current?.preview === preview && current.index === index ? null : current)), 2500)
      } catch {
        // Presse-papiers refusé (navigateur, permissions) : le texte s'affiche, prêt à être sélectionné.
        setCopyFallback({ preview, text })
      }
    },
    [copyParts, preview]
  )

  const handleBroadcast = useCallback(async () => {
    if (!selectedMatchId) return

    try {
      setSending(true)
      setError(null)

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          selectedMatchId === SQUADS || selectedMatchId === SUMMARY ? { view: selectedMatchId } : { matchId: selectedMatchId }
        ),
      })
      const payload = (await response.json().catch(() => null)) as
        | { message?: string; error?: string }
        | null

      if (!response.ok) throw new Error(payload?.error ?? 'Diffusion impossible.')

      onBroadcast(
        payload?.message ??
          (selectedMatchId === SQUADS
            ? 'Classement publié sur Discord.'
            : selectedMatchId === SUMMARY
              ? 'Résumé publié sur Discord.'
              : 'Manche publiée sur Discord.')
      )
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

  const alreadySentLabel =
    selectedMatchId === SQUADS
      ? 'Ce classement a déjà été diffusé'
      : selectedMatchId === SUMMARY
        ? 'Ce résumé a déjà été diffusé'
        : 'Cette manche a déjà été diffusée'
  const loadingLabel =
    selectedMatchId === SQUADS
      ? 'Calcul du classement par squad…'
      : selectedMatchId === SUMMARY
        ? 'Calcul du résumé du tournoi…'
        : 'Calcul des scores de la manche…'

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
              Diffuser sur Discord
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
                Aucune manche comptabilisée pour l&apos;instant. Lance d&apos;abord une synchronisation du tournoi.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <RoundMenu rounds={rounds} extras={extras} value={selectedMatchId} onChange={setSelectedMatchId} />

              {preview && !preview.canSend ? (
                <div
                  role="status"
                  data-testid="tournament-broadcast-no-webhook"
                  className="flex items-start gap-2.5 rounded-[14px] border border-[color-mix(in_srgb,var(--game-warn)_45%,transparent)] bg-[var(--game-warn-soft)] px-3.5 py-3"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--game-warn)]" aria-hidden="true" />
                  <p className="t-body text-gray-700">
                    Aucun webhook Discord pour les tournois : copie le message, puis colle-le dans ton salon Discord
                    (Ctrl+V).
                    {copyParts.length > 1
                      ? ` Il dépasse ${DISCORD_MESSAGE_LIMIT.toLocaleString('fr-FR')} caractères : colle les ${copyParts.length} parties à la suite.`
                      : ''}{' '}
                    Pour l&apos;envoyer d&apos;un clic, renseigne un webhook dans les{' '}
                    <Link href={`/clans/${clanId}/settings/discord`} className="app-link font-semibold">
                      paramètres Discord du clan
                    </Link>{' '}
                    ou sur ce tournoi.
                  </p>
                </div>
              ) : null}

              {preview?.alreadySentAt ? (
                <div
                  role="status"
                  className="flex items-start gap-2.5 rounded-[14px] border border-[color-mix(in_srgb,var(--game-warn)_45%,transparent)] bg-[var(--game-warn-soft)] px-3.5 py-3"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--game-warn)]" aria-hidden="true" />
                  <p className="t-body text-gray-700">
                    {alreadySentLabel} le <span className="t-num">{formatDateTime(preview.alreadySentAt)}</span>. La
                    confirmer publiera un second message.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="t-label">Aperçu du message</span>
                  {preview?.usesTournamentOverride ? <span className="t-meta">Envoi via le webhook spécifique de ce tournoi.</span> : null}
                </div>
                {/* Pendant le calcul d'un autre message, l'aperçu précédent reste affiché, estompé. */}
                <div
                  className={`app-panel-muted p-3 transition-opacity sm:p-4 ${loadingPreview && preview ? 'opacity-60' : ''}`}
                  aria-busy={loadingPreview}
                  data-testid="tournament-broadcast-preview"
                >
                  {preview ? (
                    <DiscordEmbedPreview payload={preview.preview} />
                  ) : loadingPreview ? (
                    <p className="t-meta">{loadingLabel}</p>
                  ) : (
                    <p className="t-meta">Aucun aperçu disponible.</p>
                  )}
                </div>
              </div>

              {fallbackText ? (
                <label className="flex flex-col gap-1.5">
                  <span className="t-meta">
                    Copie automatique impossible : sélectionne le texte ci-dessous, copie-le (Ctrl+C) puis colle-le dans
                    Discord.
                  </span>
                  <textarea
                    readOnly
                    value={fallbackText}
                    onFocus={(event) => event.currentTarget.select()}
                    rows={8}
                    className="app-input h-auto py-2 font-mono text-[12px]"
                    data-testid="tournament-broadcast-copy-fallback"
                  />
                </label>
              ) : null}
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
          {/* Copier : action principale sans webhook, secondaire sinon (pour coller le message ailleurs). */}
          {copyParts.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => void handleCopy(index)}
              disabled={loadingPreview}
              className={`app-btn app-btn--md gap-1.5 ${canSend ? 'app-btn--secondary' : 'app-btn--primary'}`}
            >
              {copiedIndex === index ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copiedIndex === index
                ? 'Copié'
                : copyParts.length > 1
                  ? `Copier la partie ${index + 1}/${copyParts.length}`
                  : canSend
                    ? 'Copier le texte'
                    : 'Copier le message'}
            </button>
          ))}
          {canSend ? (
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
          ) : null}
        </div>
      </div>
    </div>
  )
}
