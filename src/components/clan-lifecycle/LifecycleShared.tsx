'use client'

import { AlertTriangle, CheckCircle2, ChevronDown, X, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/**
 * Briques communes de la page SuperUser « Cycle de vie des clans » (/settings/clans/lifecycle,
 * docs/features/cycle-de-vie-clan.md), selon la charte UI (docs/ui/index.html) : panneaux `app-panel`, classes de rôle,
 * couleurs par jetons (`--theme-ui-*`, `--game-*` sous `.game-ui`), états vide / erreur / chargement, modale et toasts.
 * Présentation seulement : chaque section garde ses appels API.
 */

// ── Types partagés ──────────────────────────────────────────────────────────────────────────────

export type ToastTone = 'success' | 'error'
export type Notify = (text: string, tone: ToastTone) => void

export type LifecycleSettings = {
  mode: 'observe' | 'apply'
  confirmationsRequired: number
  maxMovesRatioPercent: number
  archiveAfterDays: number
  autoArchive: boolean
  autoPromote: boolean
  webhookUrl: string | null
}

export type LifecycleCounters = {
  unacknowledged: number
  observed: number
  pending: number
  pendingClans: number
  archivedClans: number
  ungroupedMembers: number
  archiveCandidates: number
}

export type LifecycleRun = {
  id: string
  status: string
  mode: string
  startedAt: string
  durationMs: number | null
  membersScanned: number
  apiCalls: number
  statesUnknown: number
  discrepanciesFound: number
  awaitingConfirmation: number
  movementsPlanned: number
  movementsApplied: number
  circuitBreakerTripped: boolean
  movesRatioPercent: number | null
}

export type LifecycleOverview = {
  settings: LifecycleSettings
  health: { lastRun: LifecycleRun | null; recentRuns: LifecycleRun[]; ungroupedDailyApiCalls: number }
  counters: LifecycleCounters
}

// ── Formats ─────────────────────────────────────────────────────────────────────────────────────

const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function formatDate(iso: string | null) {
  if (!iso) return '—'
  return DATE_TIME.format(new Date(iso))
}

/** « 3 mouvements », « 1 clan » : pluriel français régulier. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count > 1 ? pluralForm : singular}`
}

/** Jeu de couleurs (`.game-ui`) d'une pastille ou d'une tuile ; `neutral` : texte atténué sur fond renforcé. */
export type Tone = 'pos' | 'neg' | 'warn' | 'sky' | 'neutral'

export function toneStyle(tone: Tone): CSSProperties {
  return tone === 'neutral'
    ? { color: 'var(--theme-ui-text-muted)', backgroundColor: 'var(--theme-ui-surface-strong)' }
    : { color: `var(--game-${tone})`, backgroundColor: `var(--game-${tone}-soft)` }
}

// ── Lecture d'une section ───────────────────────────────────────────────────────────────────────

/**
 * Lecture d'une route de la page : `data` garde la réponse précédente pendant un rechargement (filtre, action) — la
 * section l'estompe au lieu de se replier (CLAUDE.md, checklist nouvelle page). `token` relance la même adresse.
 */
export function useLifecycleResource<T>(url: string, token: number) {
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>({ data: null, error: '', loading: true })

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function load() {
      setState((current) => ({ ...current, loading: true }))
      try {
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
        const payload = (await response.json().catch(() => null)) as T | null
        if (response.status === 403) throw new Error('Accès réservé au SuperUser.')
        if (!response.ok || payload === null) throw new Error('Impossible de charger cette section.')
        if (!cancelled) setState({ data: payload, error: '', loading: false })
      } catch (caught) {
        if (cancelled || (caught as Error).name === 'AbortError') return
        const message = caught instanceof Error ? caught.message : 'Impossible de charger cette section.'
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

// ── Surfaces ────────────────────────────────────────────────────────────────────────────────────

/** Tuile lucide teintée à l'accent (au lieu d'un emoji), comme les cartes du compte et des awards. */
export function IconTile({ icon: Icon, tone }: { icon: LucideIcon; tone?: Tone }) {
  if (tone) {
    return (
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]" style={toneStyle(tone)} aria-hidden="true">
        <Icon className="h-[18px] w-[18px]" />
      </span>
    )
  }
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--theme-ui-accent-soft)] shadow-[inset_0_0_0_1px_var(--theme-ui-accent-ring)]"
      aria-hidden="true"
    >
      <Icon className="h-[18px] w-[18px] text-[var(--theme-ui-accent-text)]" />
    </span>
  )
}

/** Panneau de section : tuile, titre de carte et méta, action à droite, puis le contenu. */
export function LifecycleCard({
  id,
  icon,
  title,
  meta,
  aside,
  testId,
  children,
}: {
  id: string
  icon: LucideIcon
  title: string
  meta?: ReactNode
  aside?: ReactNode
  testId?: string
  children?: ReactNode
}) {
  return (
    <section className="app-panel flex flex-col gap-4 p-4 sm:p-5" aria-labelledby={id} data-testid={testId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <IconTile icon={icon} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id={id} className="t-card-title">
              {title}
            </h2>
            {meta ? <p className="t-meta">{meta}</p> : null}
          </div>
        </div>
        {aside ? <div className="flex shrink-0 flex-wrap items-center gap-2">{aside}</div> : null}
      </div>
      {children}
    </section>
  )
}

/** Pastille d'état (statut, origine, raison) : rayon 6, 11 px gras, couleur de jeu. */
export function Tag({ tone, children, testId }: { tone: Tone; children: ReactNode; testId?: string }) {
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold" style={toneStyle(tone)} data-testid={testId}>
      {children}
    </span>
  )
}

/** Tag de clan en chasse fixe, puis son nom. */
export function ClanLabel({ tag, name, className = '' }: { tag: string | null; name?: string | null; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-baseline gap-1.5 ${className}`.trim()}>
      <span className="shrink-0 font-mono font-bold text-gray-900">[{tag || '—'}]</span>
      {name ? <span className="truncate text-gray-700">{name}</span> : null}
    </span>
  )
}

// ── États ───────────────────────────────────────────────────────────────────────────────────────

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

/** Erreur de chargement d'une section, avec « Réessayer ». */
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

/** Squelette d'une liste : blocs aux dimensions du contenu (charte §5b), jamais de spinner plein écran. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="app-panel-muted flex items-center gap-3 px-3.5 py-3">
          <span className="h-8 w-8 shrink-0 animate-pulse rounded-[10px] bg-[var(--theme-ui-surface-strong)]" />
          <span className="flex flex-1 flex-col gap-1.5">
            <span className="h-3 w-1/3 animate-pulse rounded-md bg-[var(--theme-ui-surface-strong)]" />
            <span className="h-2.5 w-1/2 animate-pulse rounded-md bg-[var(--theme-ui-surface-strong)]" />
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Encadré d'information ou d'avertissement (charte, « alertes inline ») : contour et fond aux couleurs de jeu, rayon
 * du panneau. `warn` pour une décision qui engage, `sky` pour une information.
 */
export function Callout({ tone, icon: Icon, title, children, testId }: { tone: 'warn' | 'sky'; icon: LucideIcon; title: string; children: ReactNode; testId?: string }) {
  return (
    <div
      className="app-panel-muted flex items-start gap-3 px-3.5 py-3"
      style={{ borderColor: `color-mix(in srgb, var(--game-${tone}) 45%, transparent)`, backgroundColor: `var(--game-${tone}-soft)` }}
      data-testid={testId}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: `var(--game-${tone})` }} aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-[13px] font-bold" style={{ color: `var(--game-${tone})` }}>
          {title}
        </p>
        <div className="t-body text-gray-700">{children}</div>
      </div>
    </div>
  )
}

// ── Contrôles ───────────────────────────────────────────────────────────────────────────────────

/** Spinner de 12 px dans un bouton : libellé conservé (charte §5b, état de chargement). */
export function ButtonSpinner() {
  return <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
}

/**
 * Interrupteur de la charte (§5e) : 36 × 20, actif à l'accent avec une pastille à l'encre sombre (« accentOn », dérivée
 * de l'accent : jamais de blanc sur le jaune), inactif sur la piste neutre.
 */
export function Switch({
  checked,
  onChange,
  disabled,
  labelledBy,
  describedBy,
  testId,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  labelledBy: string
  describedBy?: string
  testId?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      data-testid={testId}
      className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-ui-accent-ring)] disabled:cursor-not-allowed disabled:opacity-45 ${
        checked ? 'justify-end bg-[var(--theme-ui-accent)]' : 'justify-start bg-[var(--theme-ui-surface-strong)] shadow-[inset_0_0_0_1px_var(--theme-ui-border)]'
      }`}
    >
      <span
        className={`h-4 w-4 rounded-full shadow-sm ${checked ? 'bg-[color-mix(in_srgb,var(--theme-ui-accent)_12%,black)]' : 'bg-[var(--theme-ui-text-muted)]'}`}
        aria-hidden="true"
      />
    </button>
  )
}

export type ChoiceOption<T extends string> = { value: T; label: string; icon?: LucideIcon; count?: ReactNode }

/**
 * Menu de la charte (`app-menu-trigger` / `app-menu` / `app-menu__item`) pour un choix sur mobile, où une rangée de
 * tuiles ne tiendrait pas sur une ligne : déclencheur pleine largeur, élément choisi teinté, Échap ou clic hors du menu
 * pour fermer.
 */
export function ChoiceMenu<T extends string>({
  label,
  options,
  value,
  onChange,
  testId,
}: {
  label: string
  options: ChoiceOption<T>[]
  value: T
  onChange: (value: T) => void
  testId?: string
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

  const current = options.find((option) => option.value === value) ?? options[0]
  const CurrentIcon = current.icon

  return (
    <div ref={rootRef} className="relative flex w-full self-stretch">
      <button
        type="button"
        onClick={() => setOpen((state) => !state)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label} : ${current.label}`}
        data-testid={testId}
        className="app-menu-trigger w-full justify-between"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {CurrentIcon ? <CurrentIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
          <span className="truncate">{current.label}</span>
          {current.count}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" aria-label={label} className="app-menu absolute inset-x-0 top-full z-50 mt-1.5">
          {options.map((option) => {
            const Icon = option.icon
            const active = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`app-menu__item ${active ? 'app-menu__item--active' : ''}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
                  <span className="truncate">{option.label}</span>
                </span>
                {option.count}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/** Compteur d'un onglet ou d'un choix : chiffres tabulaires, orange quand il appelle une action (charte §1.3). */
export function CountPill({ count, actionable = false }: { count: number; actionable?: boolean }) {
  return (
    <span
      className={`t-num inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 text-[11px] font-bold leading-4 ${actionable ? '' : 'bg-gray-100 text-gray-500'}`}
      style={actionable ? toneStyle('warn') : undefined}
    >
      {count}
    </span>
  )
}

// ── Modale de confirmation ──────────────────────────────────────────────────────────────────────

/**
 * Confirmation avant une action (modale de la charte : voile `app-modal-backdrop`, carte `app-panel`, boutons alignés à
 * droite, Annuler en secondaire). `danger` : action aux conséquences réelles, bouton négatif teinté, jamais jaune.
 */
export function ConfirmDialog({
  icon,
  title,
  children,
  confirmLabel,
  tone,
  busy,
  onCancel,
  onConfirm,
  testId,
}: {
  icon: LucideIcon
  title: string
  children: ReactNode
  confirmLabel: string
  tone: 'primary' | 'danger'
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
  testId?: string
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus sur « Annuler » à l'ouverture seulement : le choix sûr par défaut.
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
      aria-labelledby="lifecycle-confirm-title"
      aria-describedby="lifecycle-confirm-text"
      data-testid={testId}
    >
      <div className="app-panel w-full max-w-md p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <IconTile icon={icon} tone={tone === 'danger' ? 'neg' : undefined} />
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="lifecycle-confirm-title" className="t-section-title">
              {title}
            </h2>
            <div id="lifecycle-confirm-text" className="t-body text-gray-700">
              {children}
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className="app-btn app-btn--md app-btn--secondary">
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`app-btn app-btn--md gap-1.5 ${tone === 'danger' ? 'app-btn--danger' : 'app-btn--primary'}`}
          >
            {busy ? <ButtonSpinner /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Toasts ──────────────────────────────────────────────────────────────────────────────────────

export type Toast = { id: number; text: string; tone: ToastTone }

/**
 * Toasts de la charte (§5f) : en bas à droite (bas centré sur mobile), 3 empilés au plus, contour positif ou négatif
 * à 50 %, icône lucide 16 px. La page les retire au bout de 5 s.
 */
export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end" data-testid="lifecycle-toasts">
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
          >
            <Icon className="h-4 w-4 shrink-0" style={{ color }} aria-hidden="true" />
            <span className="min-w-0 flex-1">{toast.text}</span>
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
