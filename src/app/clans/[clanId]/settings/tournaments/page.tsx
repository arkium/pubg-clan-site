'use client'

import { RefreshCw } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'

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
  organizerClan: { id: number; name: string } | null
  clans: Array<{ clanId: number; clan: { id: number; name: string } }>
}

type TournamentFormState = {
  title: string
  description: string
  startDate: string
  endDate: string
  gameMode: string
  mapName: string
  status: 'draft' | 'active' | 'finished'
  placementPoints: Record<string, number>
  killPoints: number
  winBonus: number
  bestOfRounds: number | null
}

const DEFAULT_PLACEMENT_POINTS: Record<string, number> = {
  '1': 15, '2': 12, '3': 10, '4': 8, '5': 6,
  '6': 4, '7': 2, '8': 1, '9': 1, '10': 1,
}

const TOURNAMENT_GAME_MODE_OPTIONS = [
  { value: '', label: 'Tous les modes' },
  { value: 'solo', label: 'Solo' },
  { value: 'duo', label: 'Duo' },
  { value: 'trio', label: 'Trio' },
  { value: 'squad', label: 'Squad' },
]

const TOURNAMENT_MAP_OPTIONS = [
  { value: '', label: 'Toutes les cartes' },
  { value: 'Erangel', label: 'Erangel' },
  { value: 'Miramar', label: 'Miramar' },
  { value: 'Sanhok', label: 'Sanhok' },
  { value: 'Vikendi', label: 'Vikendi' },
  { value: 'Karakin', label: 'Karakin' },
  { value: 'Paramo', label: 'Paramo' },
  { value: 'Taego', label: 'Taego' },
  { value: 'Deston', label: 'Deston' },
  { value: 'Haven', label: 'Haven' },
  { value: 'Rondo', label: 'Rondo' },
]

function getRulesForm(rules: unknown) {
  const value = rules && typeof rules === 'object' ? rules as Record<string, unknown> : {}
  const placementValues = value.placementPoints && typeof value.placementPoints === 'object'
    ? value.placementPoints as Record<string, unknown>
    : {}
  const asNonNegativeNumber = (entry: unknown, fallback: number) => {
    const parsed = Number(entry)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
  }
  const bestOfRounds = Number(value.bestOfRounds)

  return {
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
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function getDefaultForm(clanId: number): TournamentFormState {
  const today = new Date()
  const startDate = today.toISOString().slice(0, 10)
  const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  return {
    title: '',
    description: '',
    startDate,
    endDate,
    gameMode: '',
    mapName: '',
    status: 'draft',
    placementPoints: { ...DEFAULT_PLACEMENT_POINTS },
    killPoints: 1,
    winBonus: 5,
    bestOfRounds: null,
  }
}

export default function ClanTournamentSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const { authenticated, permissions, isSuperUser, loading: sessionLoading } = useAuthSession()
  const canManageSettings = isSuperUser || permissions.includes('*') || permissions.includes('manage_settings')

  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [form, setForm] = useState<TournamentFormState | null>(null)
  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncingTournamentId, setSyncingTournamentId] = useState<string | null>(null)
  const [syncNotice, setSyncNotice] = useState<{ tone: 'progress' | 'success' | 'error'; message: string } | null>(null)
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
      return
    }

    setForm((current) => current ?? getDefaultForm(clanId))
  }, [authenticated, canManageSettings, clanId, router, sessionLoading])

  useEffect(() => {
    if (!clanId || sessionLoading || !authenticated || !canManageSettings) return

    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        const tournamentsResponse = await fetch(`/api/clans/${clanId}/tournaments`, { cache: 'no-store' })

        if (!tournamentsResponse.ok) {
          throw new Error('Impossible de charger les tournois.')
        }

        const tournamentsPayload = (await tournamentsResponse.json()) as { tournaments?: Tournament[] }

        setTournaments(tournamentsPayload.tournaments ?? [])
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Impossible de charger les données.')
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [clanId, sessionLoading, authenticated, canManageSettings])

  function editTournament(tournament: Tournament) {
    if (!clanId) return
    setEditingTournamentId(tournament.id)
    setForm({
      title: tournament.title,
      description: tournament.description ?? '',
      startDate: tournament.startDate.slice(0, 10),
      endDate: tournament.endDate.slice(0, 10),
      gameMode: tournament.gameMode ?? '',
      mapName: tournament.mapName ?? '',
      status: tournament.status as TournamentFormState['status'],
      ...getRulesForm(tournament.rules),
    })
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!clanId || !form) return

    const title = form.title.trim()
    const startDate = form.startDate
    const endDate = form.endDate

    if (!title) {
      setError('Le titre du tournoi est obligatoire.')
      return
    }

    if (!startDate || !endDate) {
      setError('Les dates de début et de fin sont obligatoires.')
      return
    }

    if (new Date(endDate).getTime() < new Date(startDate).getTime()) {
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
          startDate,
          endDate,
          gameMode: form.gameMode.trim() || null,
          mapName: form.mapName.trim() || null,
          status: form.status,
          rules: {
            placementPoints: form.placementPoints,
            killPoints: form.killPoints,
            winBonus: form.winBonus,
            bestOfRounds: form.bestOfRounds,
          },
        }),
        }
      )

      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Impossible de créer le tournoi.')
      }

      setSuccess(editingTournamentId ? 'Barème du tournoi mis à jour.' : 'Tournoi créé avec succès.')
      setForm(getDefaultForm(clanId))
      setEditingTournamentId(null)

      const refresh = await fetch(`/api/clans/${clanId}/tournaments`, { cache: 'no-store' })
      const refreshed = (await refresh.json().catch(() => ({ tournaments: [] }))) as { tournaments?: Tournament[] }
      setTournaments(refreshed.tournaments ?? [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de créer le tournoi.')
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

      const response = await fetch(`/api/clans/${clanId}/tournaments/${tournament.id}/sync`, {
        method: 'POST',
      })
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
      const message = materializationError
        ? `${details} Projection impossible : ${materializationError}`
        : payload?.sourceCustomMatches === 0
          ? `${details} ${payload?.sourceMissingAccounts ? `${payload.sourceMissingAccounts} ligne(s) n'ont pas de compte PUBG associé.` : 'Aucun match custom n\'est actuellement enregistré pour les clans participants dans la fenêtre du tournoi.'}`
        : `${details} Le worker lance le recalcul des agrégats après les imports.`
      setSuccess(message)
      const filters = [
        tournament.gameMode ? `mode ${tournament.gameMode}` : null,
        tournament.mapName ? `carte ${tournament.mapName}` : null,
      ].filter(Boolean).join(', ')
      setSyncNotice({
        tone: 'success',
        message: materializationError
          ? message
          : payload?.eligibleMatches === 0 && filters
          ? `${message} Aucun match ne correspond aux filtres du tournoi (${filters}).`
          : message,
      })
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Impossible de synchroniser le tournoi.'
      setError(message)
      setSyncNotice({ tone: 'error', message })
    } finally {
      setSyncingTournamentId(null)
    }
  }

  if (!clanId || sessionLoading || !authenticated || !canManageSettings) return null

  return (
    <main className="app-container app-main space-y-6">
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
            {syncNotice.tone === 'progress' ? <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : null}
            <p className="flex-1 text-sm font-medium">{syncNotice.message}</p>
            <button type="button" onClick={() => setSyncNotice(null)} className="text-sm font-semibold opacity-70 hover:opacity-100" aria-label="Fermer la notification">Fermer</button>
          </div>
        </div>
      ) : null}

      <NavigationTrail
        currentLabel="Tournois"
        currentHref={`/clans/${clanId}/settings/tournaments`}
        fallbackParent={{ href: `/clans/${clanId}/overview`, label: 'Vue d\'ensemble', altHref: '/clans' }}
      />

      <section className="app-panel p-6">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestion des tournois</h1>
            <p className="text-sm text-gray-500">Créer, modifier et suivre les tournois inter-clans de votre clan.</p>
          </div>
        </div>

        {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
        {success ? <p className="mb-4 text-sm text-green-600">{success}</p> : null}

        {form ? (
          <form onSubmit={handleSubmit} className="mb-8 space-y-5 rounded-xl border border-gray-200 bg-white p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-medium text-gray-700">Titre du tournoi</span>
                <input
                  value={form.title}
                  onChange={(event) => setForm((current) => current ? { ...current, title: event.target.value } : current)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-0 placeholder:text-gray-400 focus:border-blue-400"
                  placeholder="Ex: Coupe du clan août"
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-medium text-gray-700">Description</span>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => current ? { ...current, description: event.target.value } : current)}
                  className="min-h-24 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-400"
                  placeholder="Résumé du tournoi, infos, règles, etc."
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-700">Date de début</span>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(event) => setForm((current) => current ? { ...current, startDate: event.target.value } : current)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-700">Date de fin</span>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(event) => setForm((current) => current ? { ...current, endDate: event.target.value } : current)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-700">Mode de jeu</span>
                <select
                  value={form.gameMode}
                  onChange={(event) => setForm((current) => current ? { ...current, gameMode: event.target.value } : current)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400"
                >
                  {!TOURNAMENT_GAME_MODE_OPTIONS.some((option) => option.value === form.gameMode) ? <option value={form.gameMode}>{form.gameMode} (valeur à corriger)</option> : null}
                  {TOURNAMENT_GAME_MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-700">Carte</span>
                <select
                  value={form.mapName}
                  onChange={(event) => setForm((current) => current ? { ...current, mapName: event.target.value } : current)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400"
                >
                  {!TOURNAMENT_MAP_OPTIONS.some((option) => option.value === form.mapName) ? <option value={form.mapName}>{form.mapName} (valeur à corriger)</option> : null}
                  {TOURNAMENT_MAP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-gray-700">Statut</span>
                <select
                  value={form.status}
                  onChange={(event) => setForm((current) => current ? { ...current, status: event.target.value as TournamentFormState['status'] } : current)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400"
                >
                  <option value="draft">Brouillon</option>
                  <option value="active">Actif</option>
                  <option value="finished">Terminé</option>
                </select>
              </label>
            </div>

            <p className="text-sm text-gray-500">
              Les clans et joueurs suivis présents dans les matchs récupérés seront détectés automatiquement.
            </p>

            <fieldset className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <legend className="px-1 text-sm font-semibold text-gray-900">Barème</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {Object.keys(DEFAULT_PLACEMENT_POINTS).map((placement) => (
                  <label key={placement} className="space-y-1">
                    <span className="text-xs font-medium text-gray-700">#{placement}</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={form.placementPoints[placement]}
                      onChange={(event) => setForm((current) => current ? {
                        ...current,
                        placementPoints: {
                          ...current.placementPoints,
                          [placement]: Math.max(0, Number(event.target.value) || 0),
                        },
                      } : current)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400"
                    />
                  </label>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Points par kill</span>
                  <input type="number" min="0" step="0.5" value={form.killPoints} onChange={(event) => setForm((current) => current ? { ...current, killPoints: Math.max(0, Number(event.target.value) || 0) } : current)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400" />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Bonus victoire</span>
                  <input type="number" min="0" step="1" value={form.winBonus} onChange={(event) => setForm((current) => current ? { ...current, winBonus: Math.max(0, Number(event.target.value) || 0) } : current)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400" />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-gray-700">Meilleures manches</span>
                  <input type="number" min="1" step="1" value={form.bestOfRounds ?? ''} placeholder="Toutes" onChange={(event) => setForm((current) => current ? { ...current, bestOfRounds: event.target.value ? Math.max(1, Math.trunc(Number(event.target.value) || 1)) : null } : current)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-400" />
                </label>
              </div>
            </fieldset>

            <div className="flex justify-end gap-3">
              {editingTournamentId ? <button type="button" onClick={() => { setEditingTournamentId(null); setForm(getDefaultForm(clanId)) }} className="app-btn app-btn--secondary app-btn--md">Annuler</button> : null}
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Enregistrement...' : editingTournamentId ? 'Enregistrer le barème' : 'Créer le tournoi'}
              </button>
            </div>
          </form>
        ) : null}

        {loading ? <p className="text-sm text-gray-500">Chargement...</p> : null}

        {!loading && !error && tournaments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
            Aucun tournoi créé pour ce clan.
          </div>
        ) : null}

        <div className="space-y-3">
          {tournaments.map((tournament) => (
            <div key={tournament.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{tournament.title}</h2>
                  <p className="text-sm text-gray-500">{formatDate(tournament.startDate)} → {formatDate(tournament.endDate)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                    {tournament.status}
                  </span>
                  {tournament.status === 'active' ? (
                    <button
                      type="button"
                      onClick={() => syncTournament(tournament)}
                      disabled={syncingTournamentId === tournament.id}
                      className="app-btn app-btn--secondary app-btn--xs"
                      title="Récupérer les matchs et lancer la télémétrie"
                    >
                      <RefreshCw className={syncingTournamentId === tournament.id ? 'animate-spin' : ''} aria-hidden="true" />
                      {syncingTournamentId === tournament.id ? 'Synchronisation...' : 'Synchroniser'}
                    </button>
                  ) : null}
                  <button type="button" onClick={() => editTournament(tournament)} className="text-sm text-blue-600 hover:underline">
                    Modifier
                  </button>
                  <a href={`/tournaments/${tournament.id}`} className="text-sm text-blue-600 hover:underline">
                    Voir
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
