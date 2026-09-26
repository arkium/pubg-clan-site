'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { History, Search, Users, X } from 'lucide-react'

import {
  ActiveClanCard,
  ClanOfMomentCard,
  PinnedClanCard,
  SleepingClans,
  type DirectoryClan,
} from '@/components/clans/ClanDirectorySections'
import { MatchesBanner } from '@/components/matches/MatchesUi'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { isSleeping, matchesQuery, sortDirectory, type ClanDirectoryPayload, type DirectorySortKey } from '@/lib/clan-directory'

/**
 * Les clans — refonte du 2026-09-26 (docs/features/clans.md §Annuaire, maquette Claude Design « Clans », écrans 12a
 * à 12e) : bandeau commun, totaux sur une ligne, clan épinglé et clan du moment, clans actifs triés par activité,
 * clans en sommeil repliés. Ouverte aux SuperUsers et aux visiteurs ; un membre est renvoyé vers ses pages.
 */

type ClanListItem = {
  id: number
  name: string
  tag: string
  membersCount: number
  matchesCount: number
  killsCount?: number
  timePlayedSeconds?: number
  imageUrl?: string | null
  isSystem?: boolean
}

const SORT_OPTIONS: Array<{ value: DirectorySortKey; label: string }> = [
  { value: 'activity', label: 'Activité' },
  { value: 'name', label: 'Nom' },
  { value: 'members', label: 'Effectif' },
  { value: 'games', label: 'Parties' },
]

const numberFormat = new Intl.NumberFormat('fr-FR')

export default function ClansPage() {
  const router = useRouter()
  const { clanId: activeClanId, setClanId, syncCanSwitchClan } = useSelectedClan()
  const { loading: authLoading, authenticated, isSuperUser, authDisabled, members, activeMemberId } = useAuthSession()
  const [clans, setClans] = useState<ClanListItem[]>([])
  const [directory, setDirectory] = useState<ClanDirectoryPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryToken, setRetryToken] = useState(0)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<DirectorySortKey>('activity')

  const isVisitor = !authenticated && authDisabled
  const canSwitchClan = isSuperUser || isVisitor

  useEffect(() => {
    if (authLoading) return
    if (!authenticated && !authDisabled) {
      router.replace('/login')
      return
    }
    // Keep the persisted switch flag in sync with the live session, since the
    // one written at login time can go stale (e.g. SuperUser status granted since).
    if (authenticated) syncCanSwitchClan(isSuperUser)
    if (!canSwitchClan) router.replace('/members')
  }, [authDisabled, authLoading, authenticated, canSwitchClan, isSuperUser, router, syncCanSwitchClan])

  useEffect(() => {
    if (authLoading || (!authenticated && !isVisitor) || !canSwitchClan) return
    const controller = new AbortController()

    Promise.all([
      fetch('/api/clans', { signal: controller.signal }).then(async (response) => {
        const data = (await response.json()) as ClanListItem[] | { error?: string }
        if (!response.ok) throw new Error('error' in data ? data.error : 'Impossible de charger les clans')
        return data as ClanListItem[]
      }),
      // L'activité n'est qu'un complément : sans elle, l'annuaire reste utilisable.
      fetch('/api/clans/directory', { signal: controller.signal })
        .then((response) => (response.ok ? (response.json() as Promise<ClanDirectoryPayload>) : null))
        .catch(() => null),
    ])
      .then(([list, activity]) => {
        setClans(list)
        setDirectory(activity)
        setError('')
      })
      .catch((fetchError) => {
        if (!controller.signal.aborted) setError(fetchError instanceof Error ? fetchError.message : 'Impossible de charger les clans')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [authLoading, authenticated, canSwitchClan, isVisitor, retryToken])

  const entries = useMemo<DirectoryClan[]>(() => {
    const activity = new Map((directory?.activity ?? []).map((row) => [row.clanId, row]))
    return clans.map((clan) => {
      const row = activity.get(clan.id)
      return {
        id: clan.id,
        name: clan.name,
        tag: clan.tag,
        imageUrl: clan.imageUrl ?? null,
        isSystem: Boolean(clan.isSystem),
        membersCount: clan.membersCount,
        games7: row?.games7 ?? 0,
        wins7: row?.wins7 ?? 0,
        playedTonight: row?.playedTonight ?? 0,
        lastMatchAt: row?.lastMatchAt ?? null,
        leagueRank: row?.leagueRank ?? null,
      }
    })
  }, [clans, directory])

  function openClan(clanId: number) {
    if (!setClanId(clanId)) {
      setError('Seul le Owner peut changer de clan.')
      return
    }
    router.push(`/clans/${clanId}/overview`)
  }

  if (authLoading || (!authenticated && !isVisitor) || !canSwitchClan) {
    return (
      <div className="app-container app-main">
        <p className="text-sm text-gray-500">{authLoading ? 'Vérification de la session…' : 'Redirection…'}</p>
      </div>
    )
  }

  // Clan épinglé : le sien pour un connecté, le dernier consulté pour un visiteur (décision du 2026-09-26).
  const ownClanId = authenticated ? members.find((member) => member.memberId === activeMemberId)?.clanId ?? null : null
  const pinnedId = ownClanId ?? activeClanId ?? null
  const pinned = entries.find((entry) => entry.id === pinnedId) ?? null
  const moment = entries.find((entry) => entry.id === directory?.clanOfMomentId) ?? null
  const now = new Date()
  const visible = sortDirectory(
    entries.filter((entry) => matchesQuery(entry, query)),
    sort
  )
  const active = visible.filter((entry) => !isSleeping(entry.lastMatchAt, now))
  const sleeping = visible.filter((entry) => isSleeping(entry.lastMatchAt, now))
  const realClans = clans.filter((clan) => !clan.isSystem)
  const totals = {
    clans: realClans.length,
    players: clans.reduce((sum, clan) => sum + clan.membersCount, 0),
    matches: clans.reduce((sum, clan) => sum + clan.matchesCount, 0),
    hours: Math.round(clans.reduce((sum, clan) => sum + (clan.timePlayedSeconds ?? 0), 0) / 3600),
    kills: clans.reduce((sum, clan) => sum + (clan.killsCount ?? 0), 0),
  }

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    <div className="app-main-flush game-ui flex-1">
      <div className="app-container app-gutter flex flex-col gap-3">
        <MatchesBanner
          image="/banner-frenchchicken-gg.jpg"
          icon={Users}
          iconColor="#60a5fa"
          title="Les clans"
          chips={[
            { text: `${totals.clans} clans suivis` },
            ...(directory && directory.tonight.players > 0
              ? [{ text: `${numberFormat.format(directory.tonight.players)} joueurs ont joué ce soir`, live: true }]
              : []),
          ]}
        />
        {clans.length > 0 && (
          <p className="app-panel flex flex-wrap gap-x-5 gap-y-1 px-3.5 py-2.5 text-[13px] tabular-nums text-gray-500">
            {[
              [totals.clans, 'clans'],
              [totals.players, 'joueurs'],
              [totals.matches, 'parties'],
              [totals.hours, 'h de jeu'],
              [totals.kills, 'kills'],
            ].map(([value, label]) => (
              <span key={label}>
                <b className="text-sm text-gray-900">{numberFormat.format(value as number)}</b> {label}
              </span>
            ))}
            <span className="ml-auto">depuis le début du suivi</span>
          </p>
        )}
      </div>

      <DockingToolbar ariaLabel="Recherche et tri des clans">
        {({ compact }) => (
          <div className="flex w-full flex-wrap items-center gap-2.5">
            <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-[9px] border border-gray-200 bg-gray-50 px-3">
              <Search className="h-[15px] w-[15px] shrink-0 text-gray-500" aria-hidden="true" />
              <span className="sr-only">Rechercher un clan</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nom ou tag : [RATZ], Meute…"
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-gray-500"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} aria-label="Effacer la recherche" className="text-gray-500 hover:text-gray-900">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </label>
            {!compact && <SegmentedControl options={SORT_OPTIONS} value={sort} onChange={setSort} size="sm" className="shrink-0" />}
          </div>
        )}
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-6 pb-8">
        {error && (
          <div className="app-panel flex flex-wrap items-center gap-3 p-4 text-sm" role="alert">
            <span style={{ color: 'var(--game-neg)' }}>{error}</span>
            <button
              type="button"
              onClick={() => {
                setLoading(true)
                setError('')
                setRetryToken((token) => token + 1)
              }}
              className="text-xs font-semibold hover:underline"
              style={{ color: 'var(--game-link)' }}
            >
              Réessayer
            </button>
          </div>
        )}

        {loading && clans.length === 0 ? (
          <div className="grid gap-2.5 md:grid-cols-2" aria-busy="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="app-panel h-[86px] animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {(pinned || moment) && !query && (
              <section className={`grid gap-3 ${pinned && moment ? 'lg:[grid-template-columns:minmax(0,1.1fr)_minmax(0,1fr)]' : ''}`} aria-label="À la une">
                {pinned && <PinnedClanCard clan={pinned} label={ownClanId ? 'Mon clan' : 'Dernier clan consulté'} onOpen={() => openClan(pinned.id)} />}
                {moment && <ClanOfMomentCard clan={moment} leagueSize={directory?.leagueSize ?? 0} onOpen={() => openClan(moment.id)} />}
              </section>
            )}

            <section className="flex flex-col gap-2.5" aria-label="Clans actifs">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: 'var(--game-pos)' }} aria-hidden="true" />
                <h2 className="m-0 text-[17px] font-extrabold">Clans actifs</h2>
                <span className="text-[13px] text-gray-500">
                  {active.length} clan{active.length > 1 ? 's' : ''} · partie dans les 14 derniers jours
                </span>
              </div>
              {active.length === 0 ? (
                <p className="app-panel p-4 text-sm text-gray-500">{query ? 'Aucun clan ne correspond à la recherche.' : 'Aucun clan actif.'}</p>
              ) : (
                <ul className="grid gap-2.5 md:grid-cols-2">
                  {active.map((clan) => (
                    <li key={clan.id}>
                      <ActiveClanCard clan={clan} active={clan.id === activeClanId} onOpen={() => openClan(clan.id)} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <SleepingClans clans={sleeping} onOpen={openClan} />
          </>
        )}

        {/* Chantier 1 : les mouvements automatiques ne doivent jamais être silencieux. */}
        <div className="flex justify-center">
          <Link
            href="/clans/mutations"
            className="app-panel-muted inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-700 hover:text-gray-900"
          >
            <History className="h-4 w-4" aria-hidden="true" />
            Historique des mouvements de clan
          </Link>
        </div>
      </div>
    </div>
  )
}
