'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { mapLabel } from '@/components/maps/MapToolbarControls'
import RankCell from '@/components/ui/RankCell'
import { Skeleton } from '@/components/ui/Skeleton'
import type { ZoneReadingLeaderboard as ZoneReadingLeaderboardPayload, ZoneReadingLeaderboardRow } from '@/lib/zone-reading/zone-reading-api'
import { formatDistance } from '@/lib/zone-reading/zone-reading-game'

/**
 * « Le clan » : écart moyen de chaque membre du clan sélectionné sur toutes ses séries de la carte, le plus bas en tête
 * (`GET /api/zone-reading/leaderboard`). Ligne du lecteur à l'accent avec « Toi », ajoutée en bas hors des dix
 * premiers. Rechargé au changement de carte et après une série enregistrée (`reloadToken`).
 */

function useLeaderboard(clanId: number | null, mapName: string, reloadToken: number) {
  const url = clanId && mapName ? `/api/zone-reading/leaderboard?clanId=${clanId}&map=${encodeURIComponent(mapName)}` : null
  const key = url ? `${url}#${reloadToken}` : null
  const [state, setState] = useState<{ key: string | null; data: ZoneReadingLeaderboardPayload | null; error: string }>({
    key: null,
    data: null,
    error: '',
  })

  useEffect(() => {
    if (!url || !key) return
    let cancelled = false
    fetch(url, { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as ZoneReadingLeaderboardPayload | null
        if (!response.ok || !payload || !Array.isArray(payload.rows)) throw new Error('Classement indisponible.')
        if (!cancelled) setState({ key, data: payload, error: '' })
      })
      .catch((caught: unknown) => {
        if (!cancelled) setState((previous) => ({ key, data: previous.data, error: caught instanceof Error ? caught.message : 'Classement indisponible.' }))
      })
    return () => {
      cancelled = true
    }
  }, [url, key])

  const loading = key !== null && state.key !== key
  return { data: state.data, loading, error: loading ? '' : state.error }
}

function seriesLabel(count: number) {
  return `${count} série${count > 1 ? 's' : ''}`
}

function Row({ row, viewer }: { row: ZoneReadingLeaderboardRow; viewer: boolean }) {
  return (
    <li
      data-testid="zone-board-row"
      aria-current={viewer ? 'true' : undefined}
      className={`grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[10px] px-2 py-1.5 ${
        viewer ? 'bg-[var(--theme-ui-accent-soft)] shadow-[inset_0_0_0_1px_var(--theme-ui-accent-ring)]' : ''
      }`}
    >
      <span className="flex justify-center">
        <RankCell rank={row.rank} size="xs" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-gray-900">{row.displayName}</span>
          {viewer ? <span className="t-label t-accent shrink-0">Toi</span> : null}
        </span>
        <span className="t-meta t-num">{seriesLabel(row.series)}</span>
      </span>
      <span className="t-num text-[13px] font-bold text-gray-900">{formatDistance(row.average)}</span>
    </li>
  )
}

export default function ZoneReadingLeaderboard({
  clanId,
  mapName,
  reloadToken,
}: {
  clanId: number | null
  mapName: string
  reloadToken: number
}) {
  const { data, loading, error } = useLeaderboard(clanId, mapName, reloadToken)
  const viewerId = data?.viewer?.memberId ?? null
  const viewerOutside = data?.viewer && !data.rows.some((row) => row.memberId === data.viewer?.memberId) ? data.viewer : null
  const label = mapName ? mapLabel(mapName) : ''

  return (
    <section aria-labelledby="zone-board-title" className="app-panel flex flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-col gap-0.5">
        <h2 id="zone-board-title" className="t-section-title">
          Le clan
        </h2>
        <p className="t-meta">{label ? `${label} · ` : ''}écart moyen à la zone finale, le plus bas en tête</p>
      </div>

      {!clanId ? (
        <p className="t-body text-gray-600">
          Choisis un clan pour voir son classement. <Link href="/clans" className="app-link">Les clans</Link>
        </p>
      ) : !data && loading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Chargement du classement">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : error && !data ? (
        <p className="t-body text-[var(--theme-ui-negative)]">{error}</p>
      ) : data ? (
        <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          {data.rows.length === 0 && !viewerOutside ? (
            <p className="t-body rounded-[14px] border border-dashed border-gray-200 px-3 py-4 text-center text-gray-600">
              Personne n’a encore terminé de série sur {label || 'cette carte'} — sois le premier
            </p>
          ) : (
            <ol className="flex flex-col gap-0.5" aria-label={`Classement du clan, ${label}`}>
              {data.rows.map((row) => (
                <Row key={row.memberId} row={row} viewer={row.memberId === viewerId} />
              ))}
              {viewerOutside ? (
                <>
                  <li aria-hidden="true" className="t-meta text-center leading-3">
                    …
                  </li>
                  <Row row={viewerOutside} viewer />
                </>
              ) : null}
            </ol>
          )}
          {error ? <p className="t-meta mt-2 text-[var(--theme-ui-negative)]">{error}</p> : null}
        </div>
      ) : null}
    </section>
  )
}
