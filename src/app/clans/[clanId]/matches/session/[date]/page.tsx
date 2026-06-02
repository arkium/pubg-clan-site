'use client'

import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import ClanSectionNav from '@/components/ClanSectionNav'
import SquadMatchList from '@/components/SquadMatchList'
import TeamModeBadge, { teamModeFromMemberCount, type TeamMode } from '@/components/ui/TeamModeBadge'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { useSquadMatches } from '@/hooks/useSquadMatches'
import type { SquadMatch, SquadPeriod } from '@/types/squad-matches'

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parsePeriod(value: string | null): SquadPeriod {
  return value === 'month' ? 'month' : 'week'
}

function parseGameMode(value: string | null) {
  return value === 'duo' || value === 'trio' || value === 'squad' ? value : undefined
}

function isValidDateSegment(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return false
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function formatDateLabel(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1))
  return date.toLocaleDateString('fr-FR', { dateStyle: 'full' })
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  return `${minutes}m`
}

function buildSessionStats(matches: SquadMatch[]) {
  return matches.reduce(
    (acc, match) => {
      acc.totalKills += match.totalKills
      acc.totalDamage += match.totalDamage
      acc.matchCount += 1
      acc.wins += match.isWin ? 1 : 0
      return acc
    },
    {
      totalKills: 0,
      totalDamage: 0,
      matchCount: 0,
      wins: 0,
    }
  )
}

function buildModePerformance(matches: SquadMatch[]) {
  const modes = {
    duo: {
      key: 'duo',
      mode: 'duo' as TeamMode,
      label: 'Duo',
      tone: 'border-sky-200 bg-sky-50 text-sky-800',
      matches: 0,
      kills: 0,
      wins: 0,
      damage: 0,
      durationSeconds: 0,
    },
    trio: {
      key: 'trio',
      mode: 'trio' as TeamMode,
      label: 'Trio',
      tone: 'border-violet-200 bg-violet-50 text-violet-800',
      matches: 0,
      kills: 0,
      wins: 0,
      damage: 0,
      durationSeconds: 0,
    },
    squad: {
      key: 'squad',
      mode: 'squad' as TeamMode,
      label: 'Squad',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      matches: 0,
      kills: 0,
      wins: 0,
      damage: 0,
      durationSeconds: 0,
    },
  }

  for (const match of matches) {
    const mode = modes[teamModeFromMemberCount(match.members.length)]
    mode.matches += 1
    mode.kills += match.totalKills
    mode.damage += match.totalDamage
    mode.durationSeconds += match.durationSeconds
    mode.wins += match.isWin ? 1 : 0
  }

  return [modes.duo, modes.trio, modes.squad]
}

export default function ClanSessionDatePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const period = useMemo(() => parsePeriod(searchParams.get('period')), [searchParams])
  const gameMode = useMemo(() => parseGameMode(searchParams.get('gameMode')), [searchParams])
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([])
  const [telemetrySyncLoading, setTelemetrySyncLoading] = useState(false)
  const [telemetrySyncMessage, setTelemetrySyncMessage] = useState<string | null>(null)
  const [telemetrySyncErrors, setTelemetrySyncErrors] = useState<string[]>([])
  const [telemetrySyncCaptureNotes, setTelemetrySyncCaptureNotes] = useState<string[]>([])
  const [telemetryClearLoading, setTelemetryClearLoading] = useState(false)
  const [telemetryClearMessage, setTelemetryClearMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }

    setClanId(clanId)
  }, [clanId, router, setClanId])

  const validDate = isValidDateSegment(params.date)
  const date = validDate && typeof params.date === 'string' ? params.date : null

  const { clanName, mapLabels, squads, loading, error, refresh } = useSquadMatches(
    clanId,
    period,
    gameMode
  )

  const sessionMatches = useMemo(() => {
    if (!date) {
      return []
    }

    return squads.filter((match) => match.createdAt.slice(0, 10) === date)
  }, [date, squads])

  useEffect(() => {
    setSelectedMatchIds([])
    setTelemetrySyncMessage(null)
    setTelemetrySyncErrors([])
    setTelemetrySyncCaptureNotes([])
    setTelemetryClearMessage(null)
  }, [date, gameMode, period])

  const sessionStats = useMemo(() => buildSessionStats(sessionMatches), [sessionMatches])
  const modePerformance = useMemo(() => buildModePerformance(sessionMatches), [sessionMatches])

  const sortedSessionDates = useMemo(
    () => Array.from(new Set(squads.map((match) => match.createdAt.slice(0, 10)))).sort((a, b) => b.localeCompare(a)),
    [squads]
  )

  const currentDateIndex = useMemo(() => sortedSessionDates.findIndex((value) => value === date), [date, sortedSessionDates])

  const previousDate = currentDateIndex >= 0 ? sortedSessionDates[currentDateIndex + 1] : undefined
  const nextDate = currentDateIndex > 0 ? sortedSessionDates[currentDateIndex - 1] : undefined

  const backHref = useMemo(() => {
    if (!clanId) {
      return '/clans'
    }

    const paramsBuilder = new URLSearchParams({ period })
    if (gameMode) {
      paramsBuilder.set('gameMode', gameMode)
    }

    return `/clans/${clanId}/matches?${paramsBuilder.toString()}`
  }, [clanId, gameMode, period])

  const sessionHref = useMemo(() => {
    if (!clanId) {
      return (targetDate: string) => `/clans`
    }

    return (targetDate: string) => {
      const paramsBuilder = new URLSearchParams({ period })
      if (gameMode) {
        paramsBuilder.set('gameMode', gameMode)
      }

      return `/clans/${clanId}/matches/session/${targetDate}?${paramsBuilder.toString()}`
    }
  }, [clanId, gameMode, period])

  async function runManualTelemetrySync() {
    if (!clanId || selectedMatchIds.length === 0) {
      return
    }

    setTelemetrySyncLoading(true)
    setTelemetrySyncMessage(null)
    setTelemetrySyncErrors([])
    setTelemetrySyncCaptureNotes([])

    try {
      const response = await fetch(`/api/clans/${clanId}/telemetry/sync-selected`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          squadMatchIds: selectedMatchIds,
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean
            error?: string
            successCount?: number
            failedCount?: number
            processedCount?: number
            captureEnabled?: boolean
            captureMaxBytes?: number
            results?: Array<{
              squadMatchId: string
              status: 'success' | 'failed'
              errorCode?: string | null
              errorMessage: string | null
              captureFilePath?: string
              captureEventCount?: number
              captureBytesRead?: number
              captureWasTruncated?: boolean
              captureError?: string
            }>
          }
        | null

      if (!response.ok || !payload?.ok) {
        setTelemetrySyncMessage(payload?.error ?? 'Echec de la récupération télémétrie.')
        return
      }

      const failedEntries = (payload.results ?? [])
        .filter((entry) => entry.status === 'failed')
        .map((entry) => `${entry.squadMatchId}: ${entry.errorMessage ?? 'erreur inconnue'}`)

      const capturedEntries = (payload.results ?? []).filter((entry) => !!entry.captureFilePath)
      const truncatedEntries = capturedEntries.filter((entry) => entry.captureWasTruncated === true)
      const captureErrorEntries = (payload.results ?? [])
        .filter((entry) => !!entry.captureError)
        .map((entry) => `${entry.squadMatchId}: ${entry.captureError}`)
      const captureNotAttemptedEntries = (payload.results ?? []).filter(
        (entry) => !entry.captureFilePath && !entry.captureError
      )
      const captureFailedCount = (payload.results ?? []).filter((entry) => !!entry.captureError).length
      const captureDisabledCount = payload.captureEnabled === false ? payload.processedCount ?? 0 : 0
      const captureNotAttemptedCount = Math.max(0, captureNotAttemptedEntries.length - captureDisabledCount)

      const captureNotes: string[] = []
      const captureMaxBytesLabel = payload.captureMaxBytes
        ? `${(payload.captureMaxBytes / (1024 * 1024)).toFixed(1)} Mo`
        : 'limite inconnue'

      captureNotes.push(
        `Captures: ${capturedEntries.length} réussie(s), ${captureNotAttemptedCount + captureDisabledCount} non tentée(s), ${captureFailedCount} en erreur.`
      )

      if (truncatedEntries.length > 0) {
        captureNotes.push(`Fichiers tronqués: ${truncatedEntries.length} (limite ${captureMaxBytesLabel}).`)
      }

      if (captureDisabledCount > 0) {
        captureNotes.push('Raison non tentée: capture désactivée (TELEMETRY_CAPTURE_FIXTURES=false).')
      } else if (captureNotAttemptedCount > 0) {
        captureNotes.push('Raison non tentée: capture non lancée pour certains matchs (échec en amont du flux telemetry).')
      }

      if (captureErrorEntries.length > 0) {
        captureNotes.push(...captureErrorEntries.slice(0, 10))
      }

      setTelemetrySyncMessage(
        `Récupération terminée: ${payload.successCount ?? 0} succès, ${payload.failedCount ?? 0} échec(s), ${payload.processedCount ?? 0} match(s) traité(s).`
      )
      setTelemetrySyncErrors(failedEntries)
      setTelemetrySyncCaptureNotes(captureNotes)
      setTelemetryClearMessage(null)
      refresh()
    } catch {
      setTelemetrySyncMessage('Echec de la récupération télémétrie.')
    } finally {
      setTelemetrySyncLoading(false)
    }
  }

  async function runClearTelemetryOk() {
    if (!clanId || selectedMatchIds.length === 0) {
      return
    }

    setTelemetryClearLoading(true)
    setTelemetryClearMessage(null)

    try {
      const response = await fetch(`/api/clans/${clanId}/telemetry/clear-selected`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          squadMatchIds: selectedMatchIds,
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean
            error?: string
            deletedCount?: number
            deletedFileCount?: number
            alreadyMissingCount?: number
            outOfScopeCount?: number
          }
        | null

      if (!response.ok || !payload?.ok) {
        setTelemetryClearMessage(payload?.error ?? 'Echec de la suppression télémétrie OK.')
        return
      }

      setTelemetryClearMessage(
        `Suppression terminée: ${payload.deletedCount ?? 0} télémétrie OK effacée(s), ${payload.deletedFileCount ?? 0} fichier(s) capturé(s) supprimé(s), ${payload.alreadyMissingCount ?? 0} déjà absente(s), ${payload.outOfScopeCount ?? 0} hors périmètre.`
      )
      setTelemetrySyncMessage(null)
      setTelemetrySyncErrors([])
      setTelemetrySyncCaptureNotes([])
      refresh()
    } catch {
      setTelemetryClearMessage('Echec de la suppression télémétrie OK.')
    } finally {
      setTelemetryClearLoading(false)
    }
  }

  function toggleMatchSelection(matchId: string) {
    setSelectedMatchIds((current) =>
      current.includes(matchId)
        ? current.filter((id) => id !== matchId)
        : [...current, matchId]
    )
  }

  function selectAllSessionMatches() {
    setSelectedMatchIds(sessionMatches.map((match) => match.id))
  }

  function clearSelectedSessionMatches() {
    setSelectedMatchIds([])
  }

  if (!clanId || !date) {
    return null
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <header className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Détail par date</p>
          <h1 className="text-2xl font-bold text-gray-900">
            {clanName || `Clan #${clanId}`} | {formatDateLabel(date)}
          </h1>
          <p className="text-sm text-gray-600">
            Détail complet des matchs détectés pour cette date, sur la période {period === 'week' ? 'semaine' : 'mois'}.
          </p>
          <ClanSectionNav clanId={clanId} />
        </div>
      </header>

      <section className="mb-6 rounded border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Link
            href={backHref}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 sm:w-auto"
          >
            Retour aux matchs
          </Link>

          <div className="grid w-full grid-cols-2 gap-2 md:w-auto md:grid-cols-1 md:grid-flow-col md:justify-end">
            {previousDate ? (
              <Link
                href={sessionHref(previousDate)}
                className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                <span className="sm:hidden">← Précédente</span>
                <span className="hidden sm:inline">← Soirée précédente</span>
              </Link>
            ) : (
              <span className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-400">
                <span className="sm:hidden">← Précédente</span>
                <span className="hidden sm:inline">← Soirée précédente</span>
              </span>
            )}

            {nextDate ? (
              <Link
                href={sessionHref(nextDate)}
                className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                <span className="sm:hidden">Suivante →</span>
                <span className="hidden sm:inline">Soirée suivante →</span>
              </Link>
            ) : (
              <span className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-400">
                <span className="sm:hidden">Suivante →</span>
                <span className="hidden sm:inline">Soirée suivante →</span>
              </span>
            )}
          </div>
        </div>
      </section>

      {loading ? <p className="mb-6 text-sm text-gray-600">Chargement de la soirée...</p> : null}
      {error ? <p className="mb-6 text-sm text-red-600">{error}</p> : null}

      {!loading && !error && sessionMatches.length > 0 ? (
        <>
          <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <article className="flex min-h-28 flex-col rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Éliminations soirée</p>
              <p className="mt-auto self-end text-right text-2xl font-bold text-gray-900 tabular-nums">{sessionStats.totalKills}</p>
            </article>
            <article className="flex min-h-28 flex-col rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Dégâts soirée</p>
              <p className="mt-auto self-end text-right text-2xl font-bold text-gray-900 tabular-nums">{Math.round(sessionStats.totalDamage)}</p>
            </article>
            <article className="flex min-h-28 flex-col rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Taux de victoire</p>
              <p className="mt-auto self-end text-right text-2xl font-bold text-gray-900 tabular-nums">
                {sessionStats.matchCount > 0 ? `${((sessionStats.wins / sessionStats.matchCount) * 100).toFixed(1)}%` : '0.0%'}
              </p>
            </article>
            <article className="flex min-h-28 flex-col rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Matchs de la soirée</p>
              <p className="mt-auto self-end text-right text-2xl font-bold text-gray-900 tabular-nums">{sessionStats.matchCount}</p>
            </article>
          </section>

          <section className="mb-6 rounded border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Performances duo/trio/squad</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {modePerformance.map((mode) => (
                <article key={mode.key} className={`rounded border p-3 ${mode.tone}`}>
                  <div className="mb-3 flex items-center gap-2">
                    <TeamModeBadge mode={mode.mode} label={mode.label} size="sm" className="shadow-none" />
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <p className="flex items-baseline justify-between gap-2">
                      <span>Matchs</span>
                      <span className="text-right font-semibold tabular-nums">{mode.matches}</span>
                    </p>
                    <p className="flex items-baseline justify-between gap-2">
                      <span>Éliminations</span>
                      <span className="text-right font-semibold tabular-nums">{mode.kills}</span>
                    </p>
                    <p className="flex items-baseline justify-between gap-2">
                      <span>Victoires</span>
                      <span className="text-right font-semibold tabular-nums">{mode.wins}</span>
                    </p>
                    <p className="flex items-baseline justify-between gap-2">
                      <span>Dégâts</span>
                      <span className="text-right font-semibold tabular-nums">{Math.round(mode.damage)}</span>
                    </p>
                    <p className="col-span-2 flex items-baseline justify-between gap-2">
                      <span>Durée</span>
                      <span className="text-right font-semibold tabular-nums">{formatDuration(mode.durationSeconds)}</span>
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <SquadMatchList
            clanId={clanId}
            period={period}
            matches={sessionMatches}
            mapLabels={mapLabels}
            title="Matchs de la soirée"
            description={`Liste complete des ${sessionMatches.length} matchs détectés pour le ${formatDateLabel(date)}.`}
            emptyMessage="Aucun match trouvé pour cette date."
            limit={sessionMatches.length}
            selectable
            selectedMatchIds={selectedMatchIds}
            onToggleMatchSelection={toggleMatchSelection}
          />

          <section className="mt-6 rounded border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Récupération télémétrie manuelle</h2>
            <p className="mt-1 text-sm text-gray-600">
              Sélectionnez des matchs ci-dessus puis lancez la récupération sans passer par le cron.
            </p>
            <div className="mt-3">
              <Link
                href={`/clans/${clanId}/telemetry/recoveries`}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Ouvrir le suivi des récupérations
              </Link>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectAllSessionMatches}
                className="app-btn app-btn--xs app-btn--secondary"
                disabled={telemetrySyncLoading || sessionMatches.length === 0}
              >
                Tout sélectionner
              </button>
              <button
                type="button"
                onClick={clearSelectedSessionMatches}
                className="app-btn app-btn--xs app-btn--secondary"
                disabled={telemetrySyncLoading || selectedMatchIds.length === 0}
              >
                Vider la sélection
              </button>
              <button
                type="button"
                onClick={runManualTelemetrySync}
                className="app-btn app-btn--xs app-btn--primary"
                disabled={telemetrySyncLoading || telemetryClearLoading || selectedMatchIds.length === 0}
              >
                {telemetrySyncLoading
                  ? 'Récupération en cours...'
                  : `Lancer récupération (${selectedMatchIds.length})`}
              </button>
              <button
                type="button"
                onClick={runClearTelemetryOk}
                className="app-btn app-btn--xs app-btn--danger"
                disabled={telemetrySyncLoading || telemetryClearLoading || selectedMatchIds.length === 0}
              >
                {telemetryClearLoading
                  ? 'Suppression en cours...'
                  : `Effacer télémétrie OK (${selectedMatchIds.length})`}
              </button>
            </div>

            {telemetryClearMessage ? (
              <p className="mt-3 text-sm text-amber-700">{telemetryClearMessage}</p>
            ) : null}

            {telemetrySyncMessage ? (
              <p className="mt-3 text-sm text-gray-700">{telemetrySyncMessage}</p>
            ) : null}

            {telemetrySyncErrors.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-rose-700">
                {telemetrySyncErrors.slice(0, 10).map((errorLine) => (
                  <li key={errorLine}>{errorLine}</li>
                ))}
              </ul>
            ) : null}

            {telemetrySyncCaptureNotes.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-700">
                {telemetrySyncCaptureNotes.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </section>
        </>
      ) : null}

      {!loading && !error && sessionMatches.length === 0 ? (
        <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-600">Aucun match trouvé pour cette date avec les filtres actuels.</p>
        </section>
      ) : null}
    </main>
  )
}
