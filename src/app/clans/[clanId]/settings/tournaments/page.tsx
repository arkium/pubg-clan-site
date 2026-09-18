'use client'

import Link from 'next/link'
import {
  ChevronDown,
  Eye,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Trophy,
  X,
} from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import TournamentBroadcastModal from '@/components/discord/TournamentBroadcastModal'
import TournamentDeleteModal from '@/components/tournaments/TournamentDeleteModal'
import TournamentGuide from '@/components/tournaments/TournamentGuide'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import {
  MIXED_SQUAD_RULE_DESCRIPTIONS as MIXED_SQUAD_OPTIONS,
  TOURNAMENT_MODE_DESCRIPTIONS as MODE_OPTIONS,
} from '@/lib/tournament-guide'
import {
  TOURNAMENT_GAME_MODE_OPTIONS,
  TOURNAMENT_MAP_OPTIONS,
  normalizeTournamentGameMode,
  normalizeTournamentMapName,
  tournamentGameModeLabel,
  tournamentMapLabel,
} from '@/lib/tournament-filters'
import type { MixedSquadRule, TournamentMode } from '@/lib/tournament-service'

type Tournament = {
  id: string
  title: string
  description: string | null
  status: string
  startDate: string
  endDate: string
  gameMode: string | null
  mapName: string | null
  rules: unknown
  discordWebhookUrl: string | null
  organizerClan: { id: number; name: string } | null
}

type TournamentFormState = {
  title: string
  description: string
  startDate: string
  endDate: string
  gameMode: string
  mapName: string
  status: 'draft' | 'active' | 'finished'
  mode: TournamentMode
  mixedSquadRule: MixedSquadRule
  placementPoints: Record<string, number>
  killPoints: number
  winBonus: number
  bestOfRounds: number | null
  discordWebhookUrl: string
}

type AdminTab = 'tournaments' | 'editor' | 'guide'
type StatusFilter = 'all' | 'active' | 'finished' | 'draft'

const DEFAULT_PLACEMENT_POINTS: Record<string, number> = {
  '1': 15, '2': 12, '3': 10, '4': 8, '5': 6,
  '6': 4, '7': 2, '8': 1, '9': 1, '10': 1,
}

const TAB_OPTIONS: Array<{ value: AdminTab; label: string }> = [
  { value: 'tournaments', label: '🏆 Tournois' },
  { value: 'editor', label: '✏️ Créer / Modifier' },
  { value: 'guide', label: '💡 Guide' },
]

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'active', label: 'Actifs' },
  { value: 'finished', label: 'Terminés' },
  { value: 'draft', label: 'Brouillons' },
]

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  active: 'Actif',
  finished: 'Terminé',
}

function getRulesForm(rules: unknown) {
  const value = rules && typeof rules === 'object' ? (rules as Record<string, unknown>) : {}
  const placementValues =
    value.placementPoints && typeof value.placementPoints === 'object'
      ? (value.placementPoints as Record<string, unknown>)
      : {}
  const asNonNegativeNumber = (entry: unknown, fallback: number) => {
    const parsed = Number(entry)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
  }
  const bestOfRounds = Number(value.bestOfRounds)
  const mode = MODE_OPTIONS.some((option) => option.value === value.mode)
    ? (value.mode as TournamentMode)
    : 'inter_clan'

  return {
    mode,
    mixedSquadRule: (value.mixedSquadRule === 'prorata' ? 'prorata' : 'full_share') as MixedSquadRule,
    placementPoints: Object.fromEntries(
      Object.entries(DEFAULT_PLACEMENT_POINTS).map(([placement, points]) => [
        placement,
        asNonNegativeNumber(placementValues[placement], points),
      ])
    ),
    killPoints: asNonNegativeNumber(value.killPoints, 1),
    winBonus: asNonNegativeNumber(value.winBonus, 5),
    bestOfRounds: Number.isInteger(bestOfRounds) && bestOfRounds > 0 ? bestOfRounds : null,
  }
}

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getDefaultForm(): TournamentFormState {
  const today = new Date()
  return {
    title: '',
    description: '',
    startDate: today.toISOString().slice(0, 10),
    endDate: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    gameMode: '',
    mapName: '',
    status: 'draft',
    mode: 'inter_clan',
    mixedSquadRule: 'full_share',
    placementPoints: { ...DEFAULT_PLACEMENT_POINTS },
    killPoints: 1,
    winBonus: 5,
    bestOfRounds: null,
    discordWebhookUrl: '',
  }
}

function FormBlock({ step, title, help, children }: { step: number; title: string; help: string; children: React.ReactNode }) {
  return (
    <section className="app-panel-muted p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900/10 text-sm font-bold text-gray-700">
          {step}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="mt-0.5 text-xs text-gray-500">{help}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

export default function ClanTournamentSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const { authenticated, permissions, isSuperUser, loading: sessionLoading } = useAuthSession()
  const canManageSettings = isSuperUser || permissions.includes('*') || permissions.includes('manage_settings')

  const [tab, setTab] = useState<AdminTab>('tournaments')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [archivesOpen, setArchivesOpen] = useState(false)

  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [form, setForm] = useState<TournamentFormState>(() => getDefaultForm())
  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncingTournamentId, setSyncingTournamentId] = useState<string | null>(null)
  const [syncNotice, setSyncNotice] = useState<{ tone: 'progress' | 'success' | 'error'; message: string } | null>(null)
  const [broadcastTournament, setBroadcastTournament] = useState<Tournament | null>(null)
  const [deleteTournament, setDeleteTournament] = useState<Tournament | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }
    setClanId(clanId)
  }, [clanId, router, setClanId])

  useEffect(() => {
    if (!clanId || sessionLoading) return
    if (!authenticated || !canManageSettings) {
      router.replace(`/clans/${clanId}/overview`)
    }
  }, [authenticated, canManageSettings, clanId, router, sessionLoading])

  async function refreshTournaments(signalError = true) {
    if (!clanId) return
    try {
      setLoading(true)
      const response = await fetch(`/api/clans/${clanId}/tournaments`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Impossible de charger les tournois.')
      const payload = (await response.json()) as { tournaments?: Tournament[] }
      setTournaments(payload.tournaments ?? [])
    } catch (caught) {
      if (signalError) setError(caught instanceof Error ? caught.message : 'Impossible de charger les données.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!clanId || sessionLoading || !authenticated || !canManageSettings) return
    let cancelled = false

    async function loadData() {
      try {
        setLoading(true)
        const response = await fetch(`/api/clans/${clanId}/tournaments`, { cache: 'no-store' })
        if (!response.ok) throw new Error('Impossible de charger les tournois.')
        const payload = (await response.json()) as { tournaments?: Tournament[] }
        if (!cancelled) setTournaments(payload.tournaments ?? [])
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Impossible de charger les données.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadData()
    return () => {
      cancelled = true
    }
  }, [clanId, sessionLoading, authenticated, canManageSettings])

  function startCreation() {
    setEditingTournamentId(null)
    setForm(getDefaultForm())
    setTab('editor')
    setError(null)
    setSuccess(null)
  }

  function editTournament(tournament: Tournament) {
    setEditingTournamentId(tournament.id)
    setForm({
      title: tournament.title,
      description: tournament.description ?? '',
      startDate: tournament.startDate.slice(0, 10),
      endDate: tournament.endDate.slice(0, 10),
      // Un tournoi enregistré avant le 2026-09-18 peut porter « Erangel » ou « squad » : on le ramène à la valeur
      // réellement utilisée par les matchs, sinon le formulaire afficherait une option vide.
      gameMode: normalizeTournamentGameMode(tournament.gameMode) ?? '',
      mapName: normalizeTournamentMapName(tournament.mapName) ?? '',
      status: tournament.status as TournamentFormState['status'],
      discordWebhookUrl: tournament.discordWebhookUrl ?? '',
      ...getRulesForm(tournament.rules),
    })
    setTab('editor')
    setError(null)
    setSuccess(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!clanId) return

    const title = form.title.trim()
    if (!title) {
      setError('Le titre du tournoi est obligatoire.')
      return
    }
    if (!form.startDate || !form.endDate) {
      setError('Les dates de début et de fin sont obligatoires.')
      return
    }
    if (new Date(form.endDate).getTime() < new Date(form.startDate).getTime()) {
      setError('La date de fin doit être après la date de début.')
      return
    }

    try {
      setSaving(true)
      setError(null)
      setSuccess(null)

      const response = await fetch(
        editingTournamentId
          ? `/api/clans/${clanId}/tournaments/${editingTournamentId}`
          : `/api/clans/${clanId}/tournaments`,
        {
          method: editingTournamentId ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title,
            description: form.description.trim() || null,
            startDate: form.startDate,
            endDate: form.endDate,
            gameMode: form.gameMode || null,
            mapName: form.mapName || null,
            status: form.status,
            rules: {
              mode: form.mode,
              mixedSquadRule: form.mixedSquadRule,
              placementPoints: form.placementPoints,
              killPoints: form.killPoints,
              winBonus: form.winBonus,
              bestOfRounds: form.bestOfRounds,
            },
            discordWebhookUrl: form.discordWebhookUrl.trim() || null,
          }),
        }
      )

      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Impossible d’enregistrer le tournoi.')
      }

      setSuccess(editingTournamentId ? 'Tournoi mis à jour.' : 'Tournoi créé avec succès.')
      setForm(getDefaultForm())
      setEditingTournamentId(null)
      setTab('tournaments')
      await refreshTournaments(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer le tournoi.')
    } finally {
      setSaving(false)
    }
  }

  async function syncTournament(tournament: Tournament) {
    if (!clanId) return

    try {
      setSyncingTournamentId(tournament.id)
      setError(null)
      setSuccess(null)
      setSyncNotice({
        tone: 'progress',
        message: `Interrogation directe de PUBG pour « ${tournament.title} » avec votre compte administrateur. Les matchs récents sont récupérés puis leur télémétrie est mise en file.`,
      })

      const response = await fetch(`/api/clans/${clanId}/tournaments/${tournament.id}/sync`, { method: 'POST' })
      const payload = (await response.json().catch(() => null)) as {
        error?: string
        importedMatches?: number
        sourceCustomRows?: number
        sourceCustomMatches?: number
        sourceMissingAccounts?: number
        materializedMatches?: number
        materializationErrors?: string[]
        eligibleMatches?: number
        telemetryQueued?: number
      } | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Impossible de synchroniser le tournoi.')
      }

      const details = [
        `Découverte PUBG : ${payload?.importedMatches ?? 0} nouveau(x) match(s) importé(s).`,
        `Analyse tournoi : ${payload?.sourceCustomMatches ?? 0} match(s) custom scanné(s) (${payload?.sourceCustomRows ?? 0} entrée(s) suivie(s)).`,
        `Résultats : ${payload?.materializedMatches ?? 0} match(s) projeté(s), ${payload?.eligibleMatches ?? 0} éligible(s).`,
        `Télémétrie : ${payload?.telemetryQueued ?? 0} match(s) mis en file.`,
      ].join(' ')
      const materializationError = payload?.materializationErrors?.[0]
      const filters = [
        tournament.gameMode ? `mode ${tournamentGameModeLabel(tournament.gameMode)}` : null,
        tournament.mapName ? `carte ${tournamentMapLabel(tournament.mapName)}` : null,
      ]
        .filter(Boolean)
        .join(', ')

      const message = materializationError
        ? `${details} Projection impossible : ${materializationError}`
        : payload?.sourceCustomMatches === 0
          ? `${details} ${payload?.sourceMissingAccounts ? `${payload.sourceMissingAccounts} ligne(s) n'ont pas de compte PUBG associé.` : 'Aucun match custom n’est actuellement enregistré pour les clans participants dans la fenêtre du tournoi.'}`
          : `${details} Le worker lance le recalcul des agrégats après les imports.`

      setSuccess(message)
      setSyncNotice({
        tone: 'success',
        message:
          !materializationError && payload?.eligibleMatches === 0 && filters
            ? `${message} Aucun match ne correspond aux filtres du tournoi (${filters}).`
            : message,
      })
      await refreshTournaments(false)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Impossible de synchroniser le tournoi.'
      setError(message)
      setSyncNotice({ tone: 'error', message })
    } finally {
      setSyncingTournamentId(null)
    }
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return tournaments.filter((tournament) => {
      if (statusFilter !== 'all' && tournament.status !== statusFilter) return false
      if (!needle) return true
      return [tournament.title, tournament.description]
        .filter((field): field is string => Boolean(field))
        .some((field) => field.toLowerCase().includes(needle))
    })
  }, [tournaments, search, statusFilter])

  const activeTournaments = filtered.filter((tournament) => tournament.status === 'active')
  const otherTournaments = filtered.filter((tournament) => tournament.status !== 'active')

  if (!clanId || sessionLoading || !authenticated || !canManageSettings) return null

  function renderActions(tournament: Tournament) {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => syncTournament(tournament)}
          disabled={syncingTournamentId === tournament.id}
          className="app-btn app-btn--xs app-btn--secondary"
        >
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${syncingTournamentId === tournament.id ? 'animate-spin' : ''}`} aria-hidden />
          {syncingTournamentId === tournament.id ? 'Synchronisation…' : 'Synchroniser PUBG'}
        </button>
        <button type="button" onClick={() => setBroadcastTournament(tournament)} className="app-btn app-btn--xs app-btn--secondary">
          <Megaphone className="mr-1 h-3.5 w-3.5" aria-hidden />
          Diffuser sur Discord
        </button>
        <Link href={`/tournaments/${tournament.id}`} className="app-btn app-btn--xs app-btn--secondary">
          <Eye className="mr-1 h-3.5 w-3.5" aria-hidden />
          Voir le classement
        </Link>
        <button type="button" onClick={() => editTournament(tournament)} className="app-btn app-btn--xs app-btn--secondary">
          <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />
          Modifier
        </button>
        <button type="button" onClick={() => setDeleteTournament(tournament)} className="app-btn app-btn--xs app-btn--danger">
          <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
          Supprimer
        </button>
      </div>
    )
  }

  function renderTournamentCard(tournament: Tournament) {
    const rules = getRulesForm(tournament.rules)
    const modeLabel = MODE_OPTIONS.find((option) => option.value === rules.mode)?.label ?? 'Inter-Clans'
    return (
      <article key={tournament.id} className="app-panel space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900">{tournament.title}</h3>
            {tournament.description ? <p className="mt-0.5 text-sm text-gray-600">{tournament.description}</p> : null}
          </div>
          <span className="app-panel-muted rounded-full px-2.5 py-1 text-xs font-semibold text-gray-700">
            {STATUS_LABELS[tournament.status] ?? tournament.status}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-600">
          <span className="app-panel-muted rounded-full px-2 py-0.5">{modeLabel}</span>
          {rules.mode === 'inter_clan' ? (
            <span className="app-panel-muted rounded-full px-2 py-0.5">
              {rules.mixedSquadRule === 'prorata' ? 'Escouades mixtes au prorata' : 'Escouades mixtes : partage intégral'}
            </span>
          ) : null}
          <span className="app-panel-muted rounded-full px-2 py-0.5">{tournamentGameModeLabel(tournament.gameMode)}</span>
          <span className="app-panel-muted rounded-full px-2 py-0.5">{tournamentMapLabel(tournament.mapName)}</span>
          <span className="app-panel-muted rounded-full px-2 py-0.5">
            {formatDate(tournament.startDate)} → {formatDate(tournament.endDate)}
          </span>
        </div>
        {renderActions(tournament)}
      </article>
    )
  }

  return (
    <main className="app-container app-main space-y-5">
      {syncNotice ? (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 max-w-md rounded-lg border p-4 shadow-lg ${
            syncNotice.tone === 'error'
              ? 'border-red-300 bg-red-50 text-red-800'
              : syncNotice.tone === 'success'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-blue-300 bg-blue-50 text-blue-800'
          }`}
        >
          <div className="flex items-start gap-3">
            {syncNotice.tone === 'progress' ? (
              <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            ) : null}
            <p className="flex-1 text-sm font-medium">{syncNotice.message}</p>
            <button
              type="button"
              onClick={() => setSyncNotice(null)}
              className="text-sm font-semibold opacity-70 hover:opacity-100"
              aria-label="Fermer la notification"
            >
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      <NavigationTrail
        currentLabel="Tournois"
        currentHref={`/clans/${clanId}/settings/tournaments`}
        fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
      />

      <header className="app-panel flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-500">
            <Trophy className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-gray-900">Gestion des tournois</h1>
            <p className="mt-1 text-sm text-gray-600">
              Créer, configurer et suivre les tournois organisés par votre clan.
            </p>
          </div>
        </div>
        <button type="button" onClick={startCreation} className="app-btn app-btn--sm app-btn--primary">
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          Nouveau tournoi
        </button>
      </header>

      <SegmentedControl options={TAB_OPTIONS} value={tab} onChange={setTab} wrap fullWidthOnMobile />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

      {tab === 'tournaments' ? (
        <>
          <section className="app-panel grid gap-3 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un tournoi du clan…"
                aria-label="Rechercher un tournoi"
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm text-gray-900"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Effacer la recherche"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
            <SegmentedControl options={STATUS_FILTER_OPTIONS} value={statusFilter} onChange={setStatusFilter} wrap fullWidthOnMobile />
          </section>

          {loading ? <p className="text-sm text-gray-500">Chargement…</p> : null}

          {!loading && filtered.length === 0 ? (
            <section className="app-panel p-6 text-center">
              <p className="text-sm text-gray-600">Aucun tournoi ne correspond à cette recherche.</p>
              <button type="button" onClick={startCreation} className="app-btn app-btn--sm app-btn--primary mt-3">
                Créer un tournoi
              </button>
            </section>
          ) : null}

          {activeTournaments.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-gray-900">Tournois actifs</h2>
              {activeTournaments.map(renderTournamentCard)}
            </section>
          ) : null}

          {otherTournaments.length > 0 ? (
            <section className="space-y-3">
              <button
                type="button"
                onClick={() => setArchivesOpen((open) => !open)}
                aria-expanded={archivesOpen}
                className="app-panel flex w-full items-center justify-between gap-3 p-4 text-left"
              >
                <span className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-gray-900">Brouillons et tournois terminés</h2>
                  <span className="app-panel-muted rounded-full px-2 py-0.5 text-xs text-gray-600">
                    {otherTournaments.length}
                  </span>
                </span>
                <ChevronDown
                  className={`h-5 w-5 text-gray-500 transition-transform duration-200 ${archivesOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>
              {archivesOpen ? <div className="space-y-3">{otherTournaments.map(renderTournamentCard)}</div> : null}
            </section>
          ) : null}
        </>
      ) : null}

      {tab === 'editor' ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="text-base font-semibold text-gray-900">
            {editingTournamentId ? `Modifier : ${form.title || 'tournoi'}` : 'Nouveau tournoi'}
          </h2>

          <FormBlock step={1} title="Informations générales" help="Ce que les joueurs verront sur la page publique.">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-gray-600 sm:col-span-2">
                Titre
                <input
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  required
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </label>
              <label className="text-xs font-medium text-gray-600 sm:col-span-2">
                Description
                <textarea
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </label>
              <label className="text-xs font-medium text-gray-600">
                Début
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(event) => setForm({ ...form, startDate: event.target.value })}
                  required
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </label>
              <label className="text-xs font-medium text-gray-600">
                Fin
                <input
                  type="date"
                  value={form.endDate}
                  min={form.startDate}
                  onChange={(event) => setForm({ ...form, endDate: event.target.value })}
                  required
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </label>
              <label className="text-xs font-medium text-gray-600">
                Statut
                <select
                  value={form.status}
                  onChange={(event) => setForm({ ...form, status: event.target.value as TournamentFormState['status'] })}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                >
                  <option value="draft">Brouillon</option>
                  <option value="active">Actif</option>
                  <option value="finished">Terminé</option>
                </select>
              </label>
            </div>
          </FormBlock>

          <FormBlock
            step={2}
            title="Mode de tournoi et attribution des points"
            help="Le mode décide de ce qui est classé : un clan, une équipe ou un joueur."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {MODE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm ${
                    form.mode === option.value ? 'border-cyan-500 bg-cyan-500/5' : 'border-gray-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="tournament-mode"
                    value={option.value}
                    checked={form.mode === option.value}
                    onChange={() => setForm({ ...form, mode: option.value })}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-gray-900">{option.label}</span>
                    <span className="block text-xs text-gray-500">{option.help}</span>
                  </span>
                </label>
              ))}
            </div>

            {form.mode === 'inter_clan' ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {MIXED_SQUAD_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm ${
                      form.mixedSquadRule === option.value ? 'border-cyan-500 bg-cyan-500/5' : 'border-gray-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="mixed-squad-rule"
                      value={option.value}
                      checked={form.mixedSquadRule === option.value}
                      onChange={() => setForm({ ...form, mixedSquadRule: option.value })}
                      className="mt-1"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-gray-900">{option.label}</span>
                      <span className="block text-xs text-gray-500">{option.help}</span>
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
          </FormBlock>

          <FormBlock
            step={3}
            title="Format et filtres PUBG"
            help="Seules les manches correspondant à ces filtres entrent dans le classement."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-gray-600">
                Mode de jeu
                <select
                  value={form.gameMode}
                  onChange={(event) => setForm({ ...form, gameMode: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                >
                  {TOURNAMENT_GAME_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-gray-600">
                Carte
                <select
                  value={form.mapName}
                  onChange={(event) => setForm({ ...form, mapName: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                >
                  {TOURNAMENT_MAP_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Les parties personnalisées utilisent des modes dédiés (« Squad (partie perso) »). Laissez « Tous les
              modes » si vous n’êtes pas sûr : un filtre trop strict ne retiendrait aucune manche.
            </p>
          </FormBlock>

          <FormBlock step={4} title="Barème de points" help="Points par place, par kill, bonus de victoire et manches retenues.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {Object.keys(DEFAULT_PLACEMENT_POINTS).map((placement) => (
                <label key={placement} className="text-xs font-medium text-gray-600">
                  Top {placement}
                  <input
                    type="number"
                    min={0}
                    value={form.placementPoints[placement] ?? 0}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        placementPoints: { ...form.placementPoints, [placement]: Number(event.target.value) },
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900"
                  />
                </label>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-medium text-gray-600">
                Points par kill
                <input
                  type="number"
                  min={0}
                  value={form.killPoints}
                  onChange={(event) => setForm({ ...form, killPoints: Number(event.target.value) })}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </label>
              <label className="text-xs font-medium text-gray-600">
                Bonus de victoire
                <input
                  type="number"
                  min={0}
                  value={form.winBonus}
                  onChange={(event) => setForm({ ...form, winBonus: Number(event.target.value) })}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </label>
              <label className="text-xs font-medium text-gray-600">
                Meilleures manches retenues
                <input
                  type="number"
                  min={1}
                  value={form.bestOfRounds ?? ''}
                  placeholder="Toutes"
                  onChange={(event) =>
                    setForm({ ...form, bestOfRounds: event.target.value ? Number(event.target.value) : null })
                  }
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </label>
            </div>
          </FormBlock>

          <FormBlock
            step={5}
            title="Diffusion Discord"
            help="Laisser vide pour utiliser le webhook du clan configuré dans les paramètres Discord."
          >
            <label className="text-xs font-medium text-gray-600">
              Webhook dédié à ce tournoi
              <input
                type="url"
                value={form.discordWebhookUrl}
                onChange={(event) => setForm({ ...form, discordWebhookUrl: event.target.value })}
                placeholder="https://discord.com/api/webhooks/…"
                className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
              />
            </label>
          </FormBlock>

          <div className="flex flex-wrap justify-end gap-2">
            {editingTournamentId ? (
              <button type="button" onClick={startCreation} className="app-btn app-btn--md app-btn--secondary">
                Annuler la modification
              </button>
            ) : null}
            <button type="submit" disabled={saving} className="app-btn app-btn--md app-btn--primary">
              {saving ? 'Enregistrement…' : editingTournamentId ? 'Enregistrer les modifications' : 'Créer le tournoi'}
            </button>
          </div>
        </form>
      ) : null}

      {tab === 'guide' ? (
        <section className="app-panel p-4">
          <TournamentGuide />
        </section>
      ) : null}

      {broadcastTournament ? (
        <TournamentBroadcastModal
          clanId={clanId}
          tournamentId={broadcastTournament.id}
          tournamentTitle={broadcastTournament.title}
          onClose={() => setBroadcastTournament(null)}
          onBroadcast={(message) => setSyncNotice({ tone: 'success', message })}
        />
      ) : null}

      {deleteTournament ? (
        <TournamentDeleteModal
          clanId={clanId}
          tournamentId={deleteTournament.id}
          tournamentTitle={deleteTournament.title}
          onClose={() => setDeleteTournament(null)}
          onDeleted={(message) => {
            setDeleteTournament(null)
            setSuccess(message)
            void refreshTournaments(false)
          }}
        />
      ) : null}
    </main>
  )
}
