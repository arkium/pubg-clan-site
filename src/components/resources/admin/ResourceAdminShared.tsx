'use client'

import { AlertTriangle, CheckCircle2, Fuel, Undo2, X, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { KIND_ICONS } from '@/components/resources/resource-icons'
import type { ResourcePointKind } from '@/lib/resources/resource-map'

/**
 * Briques communes de la vue SuperUser de la Carte des ressources (onglets « Validation » et « Historique »,
 * docs/features/carte-ressources.md §5), selon la charte UI (docs/ui/index.html) : lecture d'une route avec
 * rechargement estompé, icônes des types de points, pastilles aux jetons de jeu, états vide / erreur, modale de
 * confirmation et notifications annulables. Les jetons `--game-*` viennent du conteneur `.game-ui` de la page ; chaque
 * emploi garde un repli sur les jetons du thème.
 */

// ── Lecture ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Lecture d'une route SuperUser : `data` garde la réponse précédente pendant un rechargement (décision, page suivante)
 * — l'onglet l'estompe au lieu de se replier. `token` relance la même adresse.
 */
export function useAdminResource<T>(url: string, token: number) {
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>({ data: null, error: '', loading: true })

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function load() {
      setState((current) => ({ ...current, loading: true }))
      try {
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
        const payload = (await response.json().catch(() => null)) as T | null
        if (response.status === 401 || response.status === 403) throw new Error('Accès réservé aux SuperUsers.')
        if (!response.ok || payload === null) throw new Error('Chargement impossible.')
        if (!cancelled) setState({ data: payload, error: '', loading: false })
      } catch (caught) {
        if (cancelled || (caught as Error).name === 'AbortError') return
        const message = caught instanceof Error ? caught.message : 'Chargement impossible.'
        setState((current) => ({ data: current.data, error: message, loading: false }))
      }
    }

    void load()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [url, token])

  return state
}

/** POST JSON : corps de la réponse et message d'erreur lisible (jamais d'exception). */
export async function postJson<T>(url: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const payload = (await response.json().catch(() => null)) as (T & { error?: unknown }) | null
    if (!response.ok || payload === null) {
      if (response.status === 401 || response.status === 403) return { ok: false, error: 'Accès réservé aux SuperUsers.' }
      const message = payload && typeof payload.error === 'string' ? payload.error : 'Action non enregistrée — réessaie.'
      return { ok: false, error: message }
    }
    return { ok: true, data: payload }
  } catch {
    return { ok: false, error: 'Action non enregistrée — réessaie.' }
  }
}

// ── Types de points ─────────────────────────────────────────────────────────────────────────────

/** Icône d'un type de point : celles de la carte joueur (`resource-icons.ts`), pour un seul vocabulaire visuel. */
export function KindIcon({ kind, className = 'h-4 w-4' }: { kind: ResourcePointKind; className?: string }) {
  const Icon = KIND_ICONS[kind] ?? Fuel
  return <Icon className={className} aria-hidden="true" />
}

// ── Couleurs ────────────────────────────────────────────────────────────────────────────────────

export type Tone = 'pos' | 'neg' | 'warn' | 'neutral'

const TONE_FALLBACK: Record<Exclude<Tone, 'neutral'>, string> = {
  pos: 'var(--theme-ui-positive)',
  neg: 'var(--theme-ui-negative)',
  warn: 'var(--theme-ui-text-secondary)',
}

/** Couleur de jeu d'un ton (repli sur le jeton du thème hors `.game-ui`). */
export function toneColor(tone: Exclude<Tone, 'neutral'>) {
  return `var(--game-${tone}, ${TONE_FALLBACK[tone]})`
}

/** Fond teinté d'un ton. */
export function toneSoft(tone: Exclude<Tone, 'neutral'>) {
  return `var(--game-${tone}-soft, color-mix(in srgb, ${TONE_FALLBACK[tone]} 14%, transparent))`
}

export function toneStyle(tone: Tone): CSSProperties {
  return tone === 'neutral'
    ? { color: 'var(--theme-ui-text-secondary)', backgroundColor: 'var(--theme-ui-surface-strong)' }
    : { color: toneColor(tone), backgroundColor: toneSoft(tone) }
}

/** Pastille (rayon 6, 11 px gras) : nature d'une ligne, regroupement, état d'une carte. */
export function ToneChip({ tone, icon: Icon, children, testId }: { tone: Tone; icon?: LucideIcon; children: ReactNode; testId?: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-[6px] px-1.5 py-0.5 text-[11px] font-bold leading-4" style={toneStyle(tone)} data-testid={testId}>
      {Icon ? <Icon className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
      {children}
    </span>
  )
}

/**
 * Bouton d'action au jeton positif ou négatif (« Valider », « Refuser ») : fond teinté, texte de la couleur de jeu.
 * La bordure passe par le style : `.app-btn` (hors couche) l'emporte sur les utilitaires de bordure.
 */
export function toneButtonProps(tone: 'pos' | 'neg') {
  return {
    className:
      tone === 'pos'
        ? 'bg-[var(--game-pos-soft,var(--theme-ui-surface-soft))] hover:bg-[color-mix(in_srgb,var(--game-pos,var(--theme-ui-positive))_24%,transparent)]'
        : 'bg-[var(--game-neg-soft,var(--theme-ui-surface-soft))] hover:bg-[color-mix(in_srgb,var(--game-neg,var(--theme-ui-negative))_24%,transparent)]',
    style: { color: toneColor(tone), borderColor: `color-mix(in srgb, ${toneColor(tone)} 35%, transparent)` } satisfies CSSProperties,
  }
}

// ── États ───────────────────────────────────────────────────────────────────────────────────────

/** Spinner de 12 px dans un bouton : libellé conservé (charte §5b, état de chargement). */
export function ButtonSpinner() {
  return <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
}

/** État vide (charte §2) : bordure pointillée, rayon 14, icône atténuée. */
export function EmptyState({ icon: Icon, title, text, testId }: { icon: LucideIcon; title: string; text?: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-gray-200 px-4 py-8 text-center" data-testid={testId}>
      <Icon className="h-8 w-8 text-gray-500 opacity-60" aria-hidden="true" />
      <p className="t-card-title">{title}</p>
      {text ? <p className="t-meta max-w-md">{text}</p> : null}
    </div>
  )
}

/** Erreur de chargement, avec « Réessayer ». */
export function ErrorState({ message, onRetry, testId }: { message: string; onRetry?: () => void; testId?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center" role="alert" data-testid={testId}>
      <AlertTriangle className="h-8 w-8 text-[var(--theme-ui-negative)]" aria-hidden="true" />
      <p className="text-[13px] font-semibold text-[var(--theme-ui-negative)]">{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="app-btn app-btn--sm app-btn--secondary">
          Réessayer
        </button>
      ) : null}
    </div>
  )
}

/** Erreur attachée à une ligne (décision refusée, annulation impossible). */
export function InlineError({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 text-[12px] font-semibold text-[var(--theme-ui-negative)]" data-testid={testId}>
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  )
}

// ── Modale de confirmation ──────────────────────────────────────────────────────────────────────

/**
 * Confirmation avant une action (modale de la charte, comme la suppression d'un tournoi : voile `app-modal-backdrop`,
 * carte `app-panel`, tuile d'icône, titre de section, Annuler en secondaire à gauche de l'action). Échap ferme.
 */
export function ConfirmDialog({
  icon: Icon,
  tone,
  title,
  children,
  confirmLabel,
  busy,
  error,
  onCancel,
  onConfirm,
  testId,
}: {
  icon: LucideIcon
  tone: 'warn' | 'pos'
  title: string
  children: ReactNode
  confirmLabel: string
  busy: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: () => void
  testId?: string
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus sur « Annuler » à l'ouverture : le choix sûr par défaut.
  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  return (
    <div
      className="app-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resource-confirm-title"
      aria-describedby="resource-confirm-text"
      data-testid={testId}
    >
      <div className="app-panel w-full max-w-md p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]" style={toneStyle(tone)} aria-hidden="true">
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 id="resource-confirm-title" className="t-section-title break-words">
              {title}
            </h2>
            <div id="resource-confirm-text" className="t-body text-gray-700">
              {children}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Fermer"
            className="-mr-1 -mt-1 shrink-0 rounded-[8px] p-1.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {error ? (
          <div className="mt-3">
            <InlineError>{error}</InlineError>
          </div>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className="app-btn app-btn--md app-btn--secondary">
            Annuler
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="app-btn app-btn--md app-btn--primary gap-1.5">
            {busy ? <ButtonSpinner /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Notifications ───────────────────────────────────────────────────────────────────────────────

export type ResourceToast = {
  id: number
  text: string
  tone: 'success' | 'error'
  /** Actions annulables (« Refusé · Annuler ») : identifiants renvoyés par la décision. */
  undo?: { actionIds: string[]; busy?: boolean }
}

/** Durée d'affichage d'une notification annulable, puis d'une notification simple. */
export const UNDO_TOAST_MS = 7000
export const TOAST_MS = 4000

/** File de notifications (3 au plus) retirées d'elles-mêmes. */
export function useToasts() {
  const [toasts, setToasts] = useState<ResourceToast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const schedule = useCallback(
    (id: number, delay: number) => {
      const previous = timers.current.get(id)
      if (previous) clearTimeout(previous)
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), delay)
      )
    },
    [dismiss]
  )

  const push = useCallback(
    (toast: Omit<ResourceToast, 'id'>) => {
      const id = nextId.current++
      setToasts((current) => [...current.slice(-2), { ...toast, id }])
      schedule(id, toast.undo ? UNDO_TOAST_MS : TOAST_MS)
      return id
    },
    [schedule]
  )

  /** Remplace le contenu d'une notification (annulation en cours, puis faite) et relance sa minuterie. */
  const update = useCallback(
    (id: number, patch: Partial<Omit<ResourceToast, 'id'>>, delay?: number) => {
      setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, ...patch } : toast)))
      if (delay !== undefined) schedule(id, delay)
      else {
        const timer = timers.current.get(id)
        if (timer) clearTimeout(timer)
        timers.current.delete(id)
      }
    },
    [schedule]
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  return { toasts, push, update, dismiss }
}

/**
 * Notifications de la charte (§5f) : en bas à droite (bas centré sur mobile), contour positif ou négatif à 50 %, icône
 * 16 px ; « Refusé · Annuler » propose d'annuler la décision tant qu'elle est affichée.
 */
export function ToastStack({ toasts, onDismiss, onUndo }: { toasts: ResourceToast[]; onDismiss: (id: number) => void; onUndo: (toast: ResourceToast) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end" data-testid="resource-toasts">
      {toasts.map((toast) => {
        const color = toast.tone === 'success' ? 'var(--theme-ui-positive)' : 'var(--theme-ui-negative)'
        const Icon = toast.tone === 'success' ? CheckCircle2 : AlertTriangle
        return (
          <div
            key={toast.id}
            role={toast.tone === 'success' ? 'status' : 'alert'}
            className="pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-[10px] border bg-white px-3 py-2.5 text-[13px] font-medium text-gray-900 shadow-[0_20px_40px_-16px_rgba(0,0,0,0.5)]"
            style={{ borderColor: `color-mix(in srgb, ${color} 50%, transparent)` }}
            data-tone={toast.tone}
            data-testid="resource-toast"
          >
            <Icon className="h-4 w-4 shrink-0" style={{ color }} aria-hidden="true" />
            <span className="min-w-0 flex-1">{toast.text}</span>
            {toast.undo ? (
              <button
                type="button"
                onClick={() => onUndo(toast)}
                disabled={toast.undo.busy}
                className="inline-flex shrink-0 items-center gap-1 rounded-[6px] px-1.5 py-1 text-[13px] font-bold text-[var(--theme-ui-accent-text)] transition-colors hover:bg-[var(--theme-ui-accent-soft)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {toast.undo.busy ? <ButtonSpinner /> : <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />}
                Annuler
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-gray-500 hover:bg-gray-50"
              aria-label="Fermer la notification"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
