'use client'

import { CircleHelp, PencilLine, Plus, Search, Trophy, X } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import TournamentBroadcastModal from '@/components/discord/TournamentBroadcastModal'
import {
  AdminAlert,
  StatusFilterMenu,
  SyncToast,
  TournamentAdminBanner,
  TournamentAdminList,
  type SyncNotice,
} from '@/components/tournament-admin/TournamentAdminSections'
import { TournamentEditor } from '@/components/tournament-admin/TournamentEditor'
import {
  STATUS_FILTER_OPTIONS,
  formFromTournament,
  getDefaultForm,
  tournamentRequestBody,
  validateTournamentForm,
  type AdminTab,
  type AdminTournament,
  type StatusFilter,
  type TournamentFormErrors,
  type TournamentFormState,
} from '@/components/tournament-admin/tournament-form'
import TournamentDeleteModal from '@/components/tournaments/TournamentDeleteModal'
import TournamentGuide from '@/components/tournaments/TournamentGuide'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import ToolbarGroup from '@/components/ui/ToolbarGroup'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import {
  TOURNAMENT_SYNC_PROGRESS_MESSAGE,
  summarizeTournamentSync,
  tournamentSyncFailureMessage,
  type TournamentSyncPayload,
} from '@/lib/tournament-sync-summary'

/** Onglets ; celui du formulaire dit ce qu'il contient : « Créer », ou « Modifier » quand un tournoi est en cours d'édition. */
function tabOptions(editing: boolean): Array<{ value: AdminTab; label: string; icon: React.ReactNode }> {
  return [
    { value: 'tournaments', label: 'Tournois', icon: <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> },
    editing
      ? { value: 'editor', label: 'Modifier', icon: <PencilLine className="h-3.5 w-3.5" aria-hidden="true" /> }
      : { value: 'editor', label: 'Créer', icon: <Plus className="h-3.5 w-3.5" aria-hidden="true" /> },
    { value: 'guide', label: 'Guide', icon: <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" /> },
  ]
}

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/** Ramène la vue en haut de page : un formulaire ouvert depuis une carte basse s'affiche par son début. */
function scrollToTop() {
  window.scrollTo({ top: 0 })
}

/**
 * Gestion des tournois d'un clan — docs/features/tournois.md, « Page d'administration » ; réservée à
 * `manage_settings` (ou SuperUser). Charte UI (docs/ui/index.html) : bandeau photo, bandeau collant (onglets, recherche,
 * statut), cartes et formulaire dans `src/components/tournament-admin/`. La page garde l'état et les appels API.
 */
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

  const [tournaments, setTournaments] = useState<AdminTournament[]>([])
  // Organisateur des nouveaux tournois, pour l'aperçu de la vitrine du formulaire.
  const [organizerClan, setOrganizerClan] = useState<{ id: number; name: string; tag: string | null } | null>(null)
  const [form, setForm] = useState<TournamentFormState>(() => getDefaultForm())
  const [fieldErrors, setFieldErrors] = useState<TournamentFormErrors>({})
  const [editingTournamentId, setEditingTournamentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncingTournamentId, setSyncingTournamentId] = useState<string | null>(null)
  const [syncNotice, setSyncNotice] = useState<SyncNotice | null>(null)
  const [broadcastTournament, setBroadcastTournament] = useState<AdminTournament | null>(null)
  const [deleteTournament, setDeleteTournament] = useState<AdminTournament | null>(null)
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
      const payload = (await response.json()) as { tournaments?: AdminTournament[]; clan?: { id: number; name: string; tag: string | null } }
      setTournaments(payload.tournaments ?? [])
      setOrganizerClan(payload.clan ?? null)
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
        const payload = (await response.json()) as { tournaments?: AdminTournament[]; clan?: { id: number; name: string; tag: string | null } }
        if (!cancelled) {
          setTournaments(payload.tournaments ?? [])
          setOrganizerClan(payload.clan ?? null)
        }
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
    setFieldErrors({})
    setTab('editor')
    setError(null)
    setSuccess(null)
    scrollToTop()
  }

  function editTournament(tournament: AdminTournament) {
    setEditingTournamentId(tournament.id)
    setForm(formFromTournament(tournament))
    setFieldErrors({})
    setTab('editor')
    setError(null)
    setSuccess(null)
    scrollToTop()
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!clanId) return

    const errors = validateTournamentForm(form)
    setFieldErrors(errors)
    const firstInvalid = (['title', 'startDate', 'endDate'] as const).find((field) => errors[field])
    if (firstInvalid) {
      const ids = { title: 'tournament-title', startDate: 'tournament-start', endDate: 'tournament-end' }
      document.getElementById(ids[firstInvalid])?.focus()
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
          body: JSON.stringify(tournamentRequestBody(form)),
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
      scrollToTop()
      await refreshTournaments(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible d’enregistrer le tournoi.')
    } finally {
      setSaving(false)
    }
  }

  async function syncTournament(tournament: AdminTournament) {
    if (!clanId) return

    setSyncingTournamentId(tournament.id)
    setError(null)
    setSuccess(null)
    setSyncNotice({ tone: 'progress', message: `« ${tournament.title} » : ${TOURNAMENT_SYNC_PROGRESS_MESSAGE}` })

    let response: Response
    try {
      response = await fetch(`/api/clans/${clanId}/tournaments/${tournament.id}/sync`, { method: 'POST' })
    } catch {
      const message = tournamentSyncFailureMessage(null, null)
      setError(message)
      setSyncNotice({ tone: 'error', message })
      setSyncingTournamentId(null)
      return
    }

    const payload = (await response.json().catch(() => null)) as TournamentSyncPayload | null
    if (response.ok) {
      // Un message pour l'organisateur, pas un rapport technique (src/lib/tournament-sync-summary.ts).
      const summary = summarizeTournamentSync(payload, tournament)
      if (summary.tone === 'success') setSuccess(summary.message)
      setSyncNotice(summary)
      await refreshTournaments(false)
    } else {
      const message = tournamentSyncFailureMessage(response.status, payload)
      setError(message)
      setSyncNotice({ tone: 'error', message })
    }
    setSyncingTournamentId(null)
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

  if (!clanId || sessionLoading || !authenticated || !canManageSettings) return null

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter">
        <NavigationTrail
          currentLabel="Tournois"
          currentHref={`/clans/${clanId}/settings/tournaments`}
          fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
        />
        <TournamentAdminBanner onCreate={startCreation} />
      </div>

      {/*
        Onglets, puis recherche et statut de l'onglet Tournois. Page sans période : rien de docké sur mobile
        (sticky.md §2). Docké, le statut passe en menu pour tenir sur une ligne avec les onglets et la recherche.
      */}
      <DockingToolbar ariaLabel="Onglets et filtres de la gestion des tournois" dockOnMobile={false}>
        {({ isSticky }) => (
          <div className="flex w-full flex-wrap items-end gap-3">
            <ToolbarGroup label="Rubrique" showLabel={!isSticky} className="max-sm:w-full">
              <SegmentedControl options={tabOptions(editingTournamentId !== null)} value={tab} onChange={setTab} fullWidthOnMobile />
            </ToolbarGroup>
            {tab === 'tournaments' ? (
              <>
                <ToolbarGroup label="Recherche" showLabel={!isSticky} className="min-w-[10rem] flex-1 self-stretch">
                  <label className="app-toolbar-search flex-1">
                    <Search className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Titre ou description"
                      aria-label="Rechercher un tournoi"
                    />
                    {search ? (
                      <button type="button" onClick={() => setSearch('')} aria-label="Effacer la recherche" className="text-gray-500 hover:text-gray-900">
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                  </label>
                </ToolbarGroup>
                <ToolbarGroup label="Statut" showLabel={!isSticky} className={isSticky ? 'self-stretch' : 'max-sm:w-full'}>
                  {isSticky ? (
                    <StatusFilterMenu value={statusFilter} onChange={setStatusFilter} />
                  ) : (
                    <div role="group" aria-label="Statut" className="flex">
                      <SegmentedControl options={STATUS_FILTER_OPTIONS} value={statusFilter} onChange={setStatusFilter} fullWidthOnMobile />
                    </div>
                  )}
                </ToolbarGroup>
              </>
            ) : null}
          </div>
        )}
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-4 pb-8 sm:gap-6">
        {/* Dans l'éditeur, l'erreur d'enregistrement s'affiche sous le formulaire, à côté du bouton. */}
        {error && tab !== 'editor' ? <AdminAlert tone="neg">{error}</AdminAlert> : null}
        {success ? (
          <AdminAlert tone="pos" testId="tournament-admin-success">
            {success}
          </AdminAlert>
        ) : null}

        {tab === 'tournaments' ? (
          loading && tournaments.length === 0 ? (
            <CardSkeleton />
          ) : (
            <TournamentAdminList
              tournaments={filtered}
              reloading={loading}
              archivesOpen={archivesOpen}
              onToggleArchives={() => setArchivesOpen((open) => !open)}
              onCreate={startCreation}
              actions={{
                syncingId: syncingTournamentId,
                onSync: (tournament) => void syncTournament(tournament),
                onBroadcast: setBroadcastTournament,
                onEdit: editTournament,
                onDelete: setDeleteTournament,
              }}
            />
          )
        ) : null}

        {tab === 'editor' ? (
          <TournamentEditor
            form={form}
            onChange={(next) => {
              setForm(next)
              if (Object.keys(fieldErrors).length > 0) setFieldErrors({})
            }}
            editing={editingTournamentId !== null}
            errors={fieldErrors}
            submitError={error}
            saving={saving}
            onSubmit={handleSubmit}
            onCancelEdit={startCreation}
            organizerClan={organizerClan}
          />
        ) : null}

        {tab === 'guide' ? (
          <section className="app-panel p-4 sm:p-5" aria-label="Guide des tournois">
            <TournamentGuide />
          </section>
        ) : null}
      </div>

      {syncNotice ? <SyncToast notice={syncNotice} onClose={() => setSyncNotice(null)} /> : null}

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
    </div>
  )
}
