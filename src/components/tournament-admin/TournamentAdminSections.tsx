'use client'

import Link from 'next/link'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Eye,
  Flag,
  Gamepad2,
  Map as MapIcon,
  Megaphone,
  Pencil,
  PencilLine,
  Plus,
  RefreshCw,
  Scale,
  Trash2,
  Trophy,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import TournamentModeBadge from '@/components/tournaments/TournamentModeBadge'
import {
  getRulesForm,
  STATUS_FILTER_OPTIONS,
  type AdminTournament,
  type StatusFilter,
} from '@/components/tournament-admin/tournament-form'
import { tournamentGameModeLabel, tournamentMapLabel } from '@/lib/tournament-filters'

/**
 * Blocs de la page d'administration des tournois d'un clan (/clans/[clanId]/settings/tournaments,
 * docs/features/tournois.md, « Page d'administration »), selon la charte UI (docs/ui/index.html) : bandeau photo à
 * titre Teko, cartes `app-panel`, mode du tournoi par `TournamentModeBadge`, alertes et toast aux jetons positif /
 * négatif / ciel, aucune couleur en dur. Composants de présentation : l'état et les appels API restent dans la page.
 */

const DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

/** « 1 oct. 2026 → 6 oct. 2026 » : l'année reste, l'administration remonte loin dans les archives. */
function dateRange(tournament: Pick<AdminTournament, 'startDate' | 'endDate'>) {
  const start = DATE.format(new Date(tournament.startDate))
  const end = DATE.format(new Date(tournament.endDate))
  return start === end ? start : `${start} → ${end}`
}

// ── Bandeau d'image ─────────────────────────────────────────────────────────────────────────────────

/** Bandeau photo : titre Teko, action principale « Nouveau tournoi » en haut à droite, en verre dépoli (charte, En-têtes). */
export function TournamentAdminBanner({ onCreate }: { onCreate: () => void }) {
  return (
    <header
      className="app-on-photo bg-hero-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-no-repeat sm:min-h-[13rem]"
      style={{ backgroundImage: `url('/ClanLeaderboardTable.jpg')`, backgroundPosition: 'center 60%' }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent" />
      <button
        type="button"
        onClick={onCreate}
        className="absolute right-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-black/50 px-2.5 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-md transition-colors hover:bg-black/70 sm:right-4 sm:top-4 sm:px-3 sm:py-1.5 sm:text-sm"
      >
        <Plus className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" />
        Nouveau tournoi
      </button>
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 px-3.5 py-3 sm:px-6 sm:py-5">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
          <h1 className="t-banner-title text-white drop-shadow-md">Gestion des tournois</h1>
        </div>
        <p className="text-[13px] text-white/80 drop-shadow-md">
          Créer, configurer et suivre les tournois organisés par votre clan.
        </p>
      </div>
    </header>
  )
}

// ── Statut, bandeau docké ───────────────────────────────────────────────────────────────────────────

/**
 * Filtre de statut en menu (`app-menu-trigger`), quand le bandeau est docké : onglets, recherche et statut tiennent
 * alors sur une seule ligne (charte §6 : pas de bandeau sur deux lignes). Au repos, le segmented reste affiché.
 */
export function StatusFilterMenu({ value, onChange }: { value: StatusFilter; onChange: (value: StatusFilter) => void }) {
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
  const current = STATUS_FILTER_OPTIONS.find((option) => option.value === value) ?? STATUS_FILTER_OPTIONS[0]
  return (
    // Étiré à la hauteur de la ligne du bandeau : même hauteur que le champ de recherche voisin.
    <div ref={rootRef} className="relative flex shrink-0 self-stretch">
      <button
        type="button"
        onClick={() => setOpen((state) => !state)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Statut : ${current.label}`}
        className={`app-menu-trigger ${value !== 'all' ? 'app-menu-trigger--active' : ''}`}
      >
        {current.label}
        <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" aria-label="Statut" className="app-menu absolute right-0 top-full z-50 mt-1.5 w-[11rem]">
          {STATUS_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
              className={`app-menu__item ${option.value === value ? 'app-menu__item--active' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ── Messages ────────────────────────────────────────────────────────────────────────────────────────

const ALERT_TONES = {
  pos: {
    icon: CheckCircle2,
    box: 'border-[color-mix(in_srgb,var(--theme-ui-positive)_45%,transparent)] bg-[var(--game-pos-soft)]',
    ink: 't-pos',
  },
  neg: {
    icon: AlertTriangle,
    box: 'border-[color-mix(in_srgb,var(--theme-ui-negative)_45%,transparent)] bg-[var(--game-neg-soft)]',
    ink: 't-neg',
  },
} as const

/**
 * Alerte en ligne de la charte (États › alertes inline) : contour du jeton à 45 %, fond doux, icône lucide colorée,
 * texte secondaire. `pos` pour un enregistrement réussi, `neg` pour une erreur.
 */
export function AdminAlert({ tone, children, testId }: { tone: keyof typeof ALERT_TONES; children: ReactNode; testId?: string }) {
  const { icon: Icon, box, ink } = ALERT_TONES[tone]
  return (
    <div
      role={tone === 'neg' ? 'alert' : 'status'}
      data-testid={testId}
      className={`flex items-start gap-3 rounded-[14px] border px-4 py-3 ${box}`}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ink}`} aria-hidden="true" />
      <p className="t-body min-w-0 text-gray-700">{children}</p>
    </div>
  )
}

export type SyncNotice = { tone: 'progress' | 'success' | 'error'; message: string }

const TOAST_TONES: Record<SyncNotice['tone'], { icon: LucideIcon; ring: string; ink: string }> = {
  progress: { icon: RefreshCw, ring: 'border-[var(--game-sky-ring)]', ink: 't-sky animate-spin motion-reduce:animate-none' },
  success: { icon: CheckCircle2, ring: 'border-[color-mix(in_srgb,var(--theme-ui-positive)_50%,transparent)]', ink: 't-pos' },
  error: { icon: AlertTriangle, ring: 'border-[color-mix(in_srgb,var(--theme-ui-negative)_50%,transparent)]', ink: 't-neg' },
}

/**
 * Toast de la charte (Modales › Toasts) : en bas à droite, centré en bas sur mobile ; contour du jeton à 50 %, icône
 * lucide 16 px. Synchronisation en cours (ciel, icône qui tourne), réussie (positif) ou en échec (négatif).
 */
export function SyncToast({ notice, onClose }: { notice: SyncNotice; onClose: () => void }) {
  const { icon: Icon, ring, ink } = TOAST_TONES[notice.tone]
  return (
    <div
      role="status"
      data-testid="tournament-admin-toast"
      className={`fixed inset-x-4 bottom-4 z-50 flex items-start gap-2.5 rounded-[10px] border bg-[var(--theme-ui-surface)] px-3 py-2.5 shadow-[0_20px_40px_-16px_rgb(0_0_0/0.5)] sm:inset-x-auto sm:bottom-5 sm:right-5 sm:max-w-md ${ring}`}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ink}`} aria-hidden="true" />
      <p className="t-body min-w-0 flex-1 text-gray-900">{notice.message}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer la notification"
        className="-m-1 rounded-[6px] p-1 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

// ── Carte d'un tournoi ──────────────────────────────────────────────────────────────────────────────

const STATUS_BADGES: Record<string, { label: string; icon: LucideIcon; className: string }> = {
  // Actif = état en cours : teinté à l'accent (charte §1.2). Brouillon et terminé restent neutres.
  active: {
    label: 'Actif',
    icon: CheckCircle2,
    className: 'border-[var(--theme-ui-accent-ring)] bg-[var(--theme-ui-accent-soft)] text-[var(--theme-ui-accent-text)]',
  },
  draft: { label: 'Brouillon', icon: PencilLine, className: 'border-gray-200 bg-gray-100 text-gray-700' },
  finished: { label: 'Terminé', icon: Flag, className: 'border-gray-200 text-gray-500' },
}

function StatusBadge({ status }: { status: string }) {
  const badge = STATUS_BADGES[status] ?? { label: status, icon: Flag, className: 'border-gray-200 text-gray-500' }
  const Icon = badge.icon
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-[6px] border px-2 py-0.5 text-[11px] font-extrabold ${badge.className}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {badge.label}
    </span>
  )
}

function MetaPill({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="app-meta-pill gap-1">
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {children}
    </span>
  )
}

export type TournamentCardActions = {
  syncingId: string | null
  onSync: (tournament: AdminTournament) => void
  onBroadcast: (tournament: AdminTournament) => void
  onEdit: (tournament: AdminTournament) => void
  onDelete: (tournament: AdminTournament) => void
}

export function TournamentAdminCard({ tournament, actions }: { tournament: AdminTournament; actions: TournamentCardActions }) {
  const rules = getRulesForm(tournament.rules)
  const syncing = actions.syncingId === tournament.id
  return (
    <article className="app-panel flex flex-col gap-3 p-4" aria-label={tournament.title} data-testid="tournament-admin-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="t-card-title break-words">{tournament.title}</h3>
          {tournament.description ? <p className="t-meta break-words">{tournament.description}</p> : null}
        </div>
        <StatusBadge status={tournament.status} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <TournamentModeBadge mode={rules.mode} />
        {rules.mode === 'inter_clan' ? (
          <MetaPill icon={Scale}>
            {rules.mixedSquadRule === 'prorata' ? 'Escouades mixtes au prorata' : 'Escouades mixtes : partage intégral'}
          </MetaPill>
        ) : null}
        <MetaPill icon={Gamepad2}>{tournament.gameMode ? tournamentGameModeLabel(tournament.gameMode) : 'Tous formats'}</MetaPill>
        <MetaPill icon={MapIcon}>{tournamentMapLabel(tournament.mapName)}</MetaPill>
        <MetaPill icon={CalendarDays}>
          <span className="t-num">{dateRange(tournament)}</span>
        </MetaPill>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-3">
        <button
          type="button"
          onClick={() => actions.onSync(tournament)}
          disabled={syncing}
          className="app-btn app-btn--xs app-btn--secondary gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
          {syncing ? 'Synchronisation…' : 'Synchroniser PUBG'}
        </button>
        <button type="button" onClick={() => actions.onBroadcast(tournament)} className="app-btn app-btn--xs app-btn--secondary gap-1.5">
          <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />
          Diffuser sur Discord
        </button>
        <Link href={`/tournaments/${tournament.id}`} className="app-btn app-btn--xs app-btn--secondary gap-1.5">
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          Voir le classement
        </Link>
        <button type="button" onClick={() => actions.onEdit(tournament)} className="app-btn app-btn--xs app-btn--secondary gap-1.5">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Modifier
        </button>
        {/* Seule action destructive de la carte : bouton négatif teinté (charte, Boutons), écarté des autres. */}
        <button type="button" onClick={() => actions.onDelete(tournament)} className="app-btn app-btn--xs app-btn--danger gap-1.5 sm:ml-auto">
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Supprimer
        </button>
      </div>
    </article>
  )
}

// ── Liste ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * Tournois actifs en cartes, brouillons et tournois terminés repliés sous un en-tête qui se déplie. Pendant un
 * rechargement (après un enregistrement), la liste précédente reste affichée, estompée.
 */
export function TournamentAdminList({
  tournaments,
  reloading,
  archivesOpen,
  onToggleArchives,
  onCreate,
  actions,
}: {
  tournaments: AdminTournament[]
  reloading: boolean
  archivesOpen: boolean
  onToggleArchives: () => void
  onCreate: () => void
  actions: TournamentCardActions
}) {
  const active = tournaments.filter((tournament) => tournament.status === 'active')
  const others = tournaments.filter((tournament) => tournament.status !== 'active')

  if (tournaments.length === 0) {
    return (
      // État vide de la charte : bordure tiretée, rayon 14.
      <section className="flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-gray-200 px-4 py-8 text-center" data-testid="tournament-admin-empty">
        <p className="t-body text-gray-700">Aucun tournoi ne correspond à cette recherche.</p>
        <button type="button" onClick={onCreate} className="app-btn app-btn--sm app-btn--secondary gap-1.5">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Créer un tournoi
        </button>
      </section>
    )
  }

  return (
    <div className={`flex flex-col gap-6 transition-opacity ${reloading ? 'opacity-60' : ''}`} aria-busy={reloading}>
      {active.length > 0 ? (
        <section aria-labelledby="tournament-admin-active" className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h2 id="tournament-admin-active" className="t-section-title">Tournois actifs</h2>
            <span className="t-meta">
              {active.length} tournoi{active.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {active.map((tournament) => (
              <TournamentAdminCard key={tournament.id} tournament={tournament} actions={actions} />
            ))}
          </div>
        </section>
      ) : null}

      {others.length > 0 ? (
        <section aria-labelledby="tournament-admin-archives" className="flex flex-col gap-2.5">
          <h2 id="tournament-admin-archives" className="t-section-title">
            <button
              type="button"
              onClick={onToggleArchives}
              aria-expanded={archivesOpen}
              aria-controls="tournament-admin-archives-list"
              className="app-panel flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
            >
              <span className="flex min-w-0 items-baseline gap-2">
                <span>Brouillons et tournois terminés</span>
                <span className="t-meta t-num">{others.length}</span>
              </span>
              <ChevronDown
                className={`h-5 w-5 shrink-0 text-gray-500 transition-transform duration-150 motion-reduce:transition-none ${archivesOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          </h2>
          {archivesOpen ? (
            <div id="tournament-admin-archives-list" className="flex flex-col gap-3">
              {others.map((tournament) => (
                <TournamentAdminCard key={tournament.id} tournament={tournament} actions={actions} />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
