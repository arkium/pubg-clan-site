'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, History, Loader2, Search, UserRound } from 'lucide-react'

import { PlaceCell } from '@/components/matches/MatchesUi'
import AdminPageBanner from '@/components/settings/AdminPageBanner'
import { ADMIN_PAGE_CLASS, AdminPageLoading, AdminPageRestricted, FormFeedback } from '@/components/settings/AdminPageStates'
import { EmptyState, SectionCard, Tag } from '@/components/ui/CharteKit'
import SortableTh from '@/components/ui/SortableTh'
import TeamModeBadge, { type TeamMode } from '@/components/ui/TeamModeBadge'
import { useAuthSession } from '@/hooks/useAuthSession'

interface MemberOption {
  id: number
  displayName: string
  clan: { id: number; name: string; tag: string } | null
}

interface MatchInfo {
  memberId: number
  playerId: string
  shard: string
  recentApiMatchIds: string[]
  recentMatchesConsidered: number
  totalMatches: number
}

interface ApiMatch {
  id: string
  mode: string
  mapName: string
  createdAt: string
  durationSeconds: number
  stats: {
    kills: number
    assists: number
    damageDealt: number
    headshotKills: number
    revives: number
    position: number
  }
}

interface ImportedMatchResponse {
  id: string
}

const MEMBER_RESULTS_LIMIT = 8

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes} min ${String(remainingSeconds).padStart(2, '0')} s`
}

/** Mode d'équipe d'un mode PUBG brut (`squad-fpp`, `duo`…), pour le badge partagé ; `null` pour un mode d'événement. */
function teamModeOf(mode: string): TeamMode | null {
  const base = mode.toLowerCase().split('-')[0]
  return base === 'solo' || base === 'duo' || base === 'trio' || base === 'squad' ? base : null
}

function ModeCell({ mode }: { mode: string }) {
  const teamMode = teamModeOf(mode)
  return teamMode ? (
    <span className="inline-flex items-center gap-1.5" title={mode}>
      <TeamModeBadge mode={teamMode} />
      {mode.toLowerCase().includes('fpp') ? <span className="t-meta">FPP</span> : null}
    </span>
  ) : (
    <span className="t-meta">{mode}</span>
  )
}

/**
 * Import manuel des derniers matchs PUBG d'un membre, tous clans confondus (SuperUser), selon la charte UI
 * (docs/ui/index.html) : choix du membre par recherche, vérification auprès de l'API PUBG (rythme limité), import
 * match par match ou en bloc.
 */
export default function MatchImportSettingsPage() {
  const router = useRouter()
  const { loading, authenticated, isSuperUser } = useAuthSession()

  const [members, setMembers] = useState<MemberOption[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null)
  const [memberQuery, setMemberQuery] = useState('')

  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null)
  const [apiMatches, setApiMatches] = useState<ApiMatch[]>([])
  const [checkingPubgMatches, setCheckingPubgMatches] = useState(false)
  const [hasCheckedPubgMatches, setHasCheckedPubgMatches] = useState(false)
  const [loadingApiMatches, setLoadingApiMatches] = useState(false)
  const [importingAll, setImportingAll] = useState(false)
  const [importingMatchIds, setImportingMatchIds] = useState<string[]>([])
  const [error, setError] = useState('')
  const [mapLabels, setMapLabels] = useState<Record<string, string>>({})

  const pubgCheckCancelledRef = useRef(false)

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/login?redirect=/settings/match-import')
    }
  }, [authenticated, loading, router])

  useEffect(() => {
    if (loading || !authenticated || !isSuperUser) {
      return
    }

    let cancelled = false

    async function loadMembers() {
      try {
        setLoadingMembers(true)
        const response = await fetch('/api/members', { cache: 'no-store' })
        const payload = (await response.json()) as MemberOption[] | { error?: string }

        if (!response.ok) {
          throw new Error('error' in payload ? payload.error : 'Impossible de charger les membres')
        }

        if (!cancelled) {
          setMembers(payload as MemberOption[])
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les membres')
        }
      } finally {
        if (!cancelled) {
          setLoadingMembers(false)
        }
      }
    }

    void loadMembers()

    return () => {
      cancelled = true
    }
  }, [authenticated, isSuperUser, loading])

  useEffect(() => {
    return () => {
      pubgCheckCancelledRef.current = true
    }
  }, [])

  const selectedMember = members.find((member) => member.id === selectedMemberId) ?? null

  const memberResults = useMemo(() => {
    const query = memberQuery.trim().toLowerCase()
    if (!query) return []
    return members
      .filter((member) => member.displayName.toLowerCase().includes(query) || member.clan?.tag.toLowerCase().includes(query))
      .slice(0, MEMBER_RESULTS_LIMIT)
  }, [memberQuery, members])

  function resetMemberState() {
    pubgCheckCancelledRef.current = true
    setMatchInfo(null)
    setApiMatches([])
    setHasCheckedPubgMatches(false)
    setCheckingPubgMatches(false)
    setLoadingApiMatches(false)
    setError('')
  }

  function selectMember(memberId: number | null) {
    setSelectedMemberId(memberId)
    setMemberQuery('')
    resetMemberState()
  }

  async function checkPubgMatches() {
    if (!selectedMemberId) {
      return
    }

    pubgCheckCancelledRef.current = false
    const cancelledRef = pubgCheckCancelledRef

    setCheckingPubgMatches(true)
    setError('')

    try {
      const response = await fetch(`/api/members/${selectedMemberId}/matches`)
      const payload = (await response.json()) as MatchInfo | { error?: string }

      if (!response.ok) {
        throw new Error('error' in payload ? payload.error : 'Impossible de charger les matchs')
      }

      if (cancelledRef.current) {
        return
      }

      const data = payload as MatchInfo
      setMatchInfo(data)
      setApiMatches([])
      setHasCheckedPubgMatches(true)

      if (data.recentApiMatchIds.length === 0) {
        return
      }

      setLoadingApiMatches(true)
      const fetchedMatches: ApiMatch[] = []
      const delayMs = 6000

      for (let index = 0; index < data.recentApiMatchIds.length; index += 1) {
        if (cancelledRef.current) {
          return
        }

        if (index > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs))
        }

        const matchId = data.recentApiMatchIds[index]

        try {
          const matchResponse = await fetch(`/api/matches/${matchId}?shard=${data.shard}&playerId=${data.playerId}`)
          const matchPayload = (await matchResponse.json()) as ApiMatch | { error?: string }

          if (!matchResponse.ok) {
            throw new Error('error' in matchPayload ? matchPayload.error : 'Impossible de charger le match')
          }

          fetchedMatches.push(matchPayload as ApiMatch)
          if (!cancelledRef.current) {
            setApiMatches([...fetchedMatches])
          }
        } catch (matchError) {
          console.error(`Failed to fetch match ${matchId}:`, matchError)
        }
      }
    } catch (loadError) {
      if (!cancelledRef.current) {
        setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les matchs')
      }
    } finally {
      if (!cancelledRef.current) {
        setCheckingPubgMatches(false)
        setLoadingApiMatches(false)
      }
    }
  }

  async function importMatch(matchId: string) {
    if (!matchInfo) {
      return
    }

    setImportingMatchIds((current) => [...current, matchId])
    setError('')

    try {
      const response = await fetch(`/api/matches/${matchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: matchInfo.memberId,
          playerId: matchInfo.playerId,
          shard: matchInfo.shard,
        }),
      })
      const payload = (await response.json()) as ImportedMatchResponse | { error?: string }

      if (!response.ok) {
        throw new Error('error' in payload ? payload.error : 'Impossible d’importer le match')
      }

      setApiMatches((current) => current.filter((match) => match.id !== matchId))
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Impossible d’importer le match')
      throw importError
    } finally {
      setImportingMatchIds((current) => current.filter((id) => id !== matchId))
    }
  }

  async function handleImportAll() {
    const pendingMatchIds = apiMatches.map((match) => match.id)

    if (pendingMatchIds.length === 0) {
      return
    }

    setImportingAll(true)
    setError('')

    try {
      for (const matchId of pendingMatchIds) {
        await importMatch(matchId)
      }
    } catch {
      // importMatch remonte déjà le message d'erreur utile
    } finally {
      setImportingAll(false)
    }
  }

  useEffect(() => {
    async function loadMapLabels() {
      try {
        const response = await fetch('/api/settings/map-labels', { cache: 'no-store' })
        if (!response.ok) return
        const payload = (await response.json()) as { labels?: Record<string, string> }
        setMapLabels(payload.labels ?? {})
      } catch {
        // Les libellés de carte ne sont pas critiques, on garde les noms bruts en cas d'échec
      }
    }

    void loadMapLabels()
  }, [])

  if (loading || loadingMembers) {
    return <AdminPageLoading />
  }

  if (!authenticated) {
    return null
  }

  if (!isSuperUser) {
    return <AdminPageRestricted />
  }

  return (
    <div className={ADMIN_PAGE_CLASS}>
      <AdminPageBanner
        title="Import de matchs"
        subtitle="Vérifier puis importer à la main les derniers matchs PUBG d’un membre, tous clans confondus."
        icon={Download}
        image="/matches.jpg"
        currentHref="/settings/match-import"
        parent={{ href: '/settings', label: 'Plateforme' }}
        pills={[
          <>
            <span className="t-num">{members.length.toLocaleString('fr-FR')}</span> membres
          </>,
          'Réservé au SuperUser',
        ]}
      />

      <SectionCard id="match-import-member" icon={UserRound} title="Membre" meta="Rechercher par pseudo ou par tag de clan.">
        {selectedMember ? (
          <div className="app-panel-muted flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="t-card-title truncate">{selectedMember.displayName}</span>
              <span className="t-meta shrink-0 font-mono">{selectedMember.clan ? `[${selectedMember.clan.tag}]` : 'sans clan'}</span>
            </span>
            <button type="button" onClick={() => selectMember(null)} className="app-btn app-btn--sm app-btn--secondary">
              Changer de membre
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="relative sm:max-w-md">
              <span className="sr-only">Rechercher un membre</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
              <input
                type="search"
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.target.value)}
                className="app-input pl-9"
                placeholder="Pseudo ou tag de clan…"
                autoComplete="off"
              />
            </label>
            {memberQuery.trim() === '' ? (
              <p className="t-meta m-0">{members.length.toLocaleString('fr-FR')} membres actifs, tous clans confondus.</p>
            ) : memberResults.length === 0 ? (
              <p className="t-meta m-0">Aucun membre ne correspond.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 sm:max-w-md">
                {memberResults.map((member) => (
                  <li key={member.id}>
                    <button
                      type="button"
                      onClick={() => selectMember(member.id)}
                      className="app-panel-muted flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-gray-100"
                    >
                      <span className="t-body truncate font-semibold text-gray-900">{member.displayName}</span>
                      <span className="t-meta shrink-0 font-mono">{member.clan ? `[${member.clan.tag}]` : 'sans clan'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </SectionCard>

      {selectedMember ? (
        <SectionCard
          id="match-import-matches"
          icon={History}
          title="Matchs PUBG récents à importer"
          meta={
            matchInfo
              ? `${apiMatches.length} match(s) non importé(s) parmi les ${matchInfo.recentMatchesConsidered} plus récents (${matchInfo.totalMatches} remontés par PUBG).`
              : 'Interroge l’API PUBG pour repérer les matchs de ce membre absents du site.'
          }
          aside={
            hasCheckedPubgMatches && apiMatches.length > 0 ? (
              <>
                <Tag tone="warn">{apiMatches.length} à importer</Tag>
                <button
                  type="button"
                  onClick={() => void handleImportAll()}
                  disabled={importingAll}
                  className="app-btn app-btn--sm app-btn--primary gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  {importingAll ? 'Import en cours…' : 'Tout importer'}
                </button>
              </>
            ) : null
          }
        >
          {!hasCheckedPubgMatches ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void checkPubgMatches()}
                disabled={checkingPubgMatches}
                className="app-btn app-btn--md app-btn--primary gap-1.5"
              >
                {checkingPubgMatches ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
                {checkingPubgMatches ? 'Vérification…' : 'Vérifier les nouveaux matchs'}
              </button>
              <FormFeedback error={error} />
            </div>
          ) : matchInfo ? (
            <>
              {apiMatches.length === 0 && !loadingApiMatches ? (
                <EmptyState icon={History} title="Tous les derniers matchs sont déjà importés" />
              ) : (
                <>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
                    {apiMatches.map((match) => (
                      <li key={match.id} className="app-panel-muted flex flex-col gap-1.5 px-3 py-2.5">
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <PlaceCell place={match.stats.position} title={`Place ${match.stats.position}`} />
                            <span className="t-body font-semibold text-gray-900">{mapLabels[match.mapName] ?? match.mapName}</span>
                          </span>
                          <ModeCell mode={match.mode} />
                        </span>
                        <span className="t-meta">
                          {new Date(match.createdAt).toLocaleString('fr-FR')} · {formatDuration(match.durationSeconds)}
                        </span>
                        <span className="t-meta t-num">
                          {match.stats.kills} kills · {match.stats.assists} assists · {match.stats.damageDealt.toFixed(0)} dégâts ·{' '}
                          {match.stats.headshotKills} headshots · {match.stats.revives} réa.
                        </span>
                        <ImportButton
                          busy={importingAll || importingMatchIds.includes(match.id)}
                          onClick={() => void importMatch(match.id).catch(() => undefined)}
                        />
                      </li>
                    ))}
                  </ul>
                  <div className="app-table-shell hidden md:block">
                    <table className="w-full text-left text-sm">
                      <thead className="app-table-head">
                        <tr>
                          <SortableTh align="center">Place</SortableTh>
                          <SortableTh align="left">Carte</SortableTh>
                          <SortableTh align="left">Mode</SortableTh>
                          <SortableTh align="left">Joué le</SortableTh>
                          <SortableTh>Kills</SortableTh>
                          <SortableTh>Assists</SortableTh>
                          <SortableTh>Dégâts</SortableTh>
                          <SortableTh>Headshots</SortableTh>
                          <SortableTh title="Réanimations">Réa.</SortableTh>
                          <SortableTh align="right">
                            <span className="sr-only">Action</span>
                          </SortableTh>
                        </tr>
                      </thead>
                      <tbody>
                        {apiMatches.map((match) => (
                          <tr key={match.id} className="app-table-row">
                            <td className="px-[9px] py-2 text-center">
                              <PlaceCell place={match.stats.position} />
                            </td>
                            <td className="px-[9px] py-2 font-semibold text-gray-900">{mapLabels[match.mapName] ?? match.mapName}</td>
                            <td className="px-[9px] py-2">
                              <ModeCell mode={match.mode} />
                            </td>
                            <td className="whitespace-nowrap px-[9px] py-2 text-gray-700">
                              {new Date(match.createdAt).toLocaleString('fr-FR')}
                              <span className="t-meta block">{formatDuration(match.durationSeconds)}</span>
                            </td>
                            <td className="t-num px-[9px] py-2 text-right text-gray-900">{match.stats.kills}</td>
                            <td className="t-num px-[9px] py-2 text-right text-gray-700">{match.stats.assists}</td>
                            <td className="t-num px-[9px] py-2 text-right text-gray-700">{match.stats.damageDealt.toFixed(0)}</td>
                            <td className="t-num px-[9px] py-2 text-right text-gray-700">{match.stats.headshotKills}</td>
                            <td className="t-num px-[9px] py-2 text-right text-gray-700">{match.stats.revives}</td>
                            <td className="px-[9px] py-2 text-right">
                              <ImportButton
                                busy={importingAll || importingMatchIds.includes(match.id)}
                                onClick={() => void importMatch(match.id).catch(() => undefined)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {loadingApiMatches ? (
                <p className="t-meta m-0 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Chargement des matchs restants, un toutes les 6 secondes pour ménager l’API PUBG…
                </p>
              ) : null}
              <FormFeedback error={error} />
            </>
          ) : (
            <FormFeedback error={error} />
          )}
        </SectionCard>
      ) : (
        <FormFeedback error={error} />
      )}
    </div>
  )
}

function ImportButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className="app-btn app-btn--xs app-btn--secondary gap-1 self-start">
      <Download className="h-3 w-3" aria-hidden="true" />
      {busy ? 'Import…' : 'Importer'}
    </button>
  )
}
