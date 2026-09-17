'use client'

import Image from 'next/image'
import { Target } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import DropZoneMapViewport, {
  type DropZoneMapViewportHandle,
} from '@/components/drop-zones/DropZoneMapViewport'
import MobileDropdownNav from '@/components/ui/MobileDropdownNav'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { TACTICAL_PHASE_OPTIONS, parseTacticalPhase, type TacticalPhase } from '@/lib/tactical-phase'

type ZonePeriod = 'week' | 'month' | 'all'
type ZoneBand = 'center' | 'edge' | 'outside'

type ZoneClosureResponse = {
  selectedMap: string | null
  selectedMapLabel: string | null
  mapOptions: Array<{ mapName: string; label: string; positions: number; matches: number }>
  members: Array<{ memberId: number; displayName: string; positions: number }>
  counts: { positions: number; matches: number; closures: number; members: number; averageSurvivors: number }
  bands: Record<ZoneBand, number>
  averageRatio: number
  byPhase: Array<{ phase: number; positions: number; averageRatio: number; bands: Record<ZoneBand, number> }>
  cells: Array<{ xIndex: number; yIndex: number; count: number }>
  topCities: Array<{ locationId: string; name: string; positions: number; share: number }>
  dataStart: string | null
  error?: string
}

const GRID_SIZE = 40

// Même convention d'assets que les autres pages cartographiques.
function mapAssetPath(mapName: string) {
  return `/maps/pubg/${mapName}.webp`
}

const PERIOD_OPTIONS: Array<{ value: ZonePeriod; label: string }> = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Tous' },
]

const BAND_META: Record<ZoneBand, { label: string; description: string; color: string }> = {
  center: { label: 'Centre', description: 'à moins de la moitié du rayon', color: '#22c55e' },
  edge: { label: 'Bord intérieur', description: 'dans le cercle, au-delà de la moitié du rayon', color: '#eab308' },
  outside: { label: 'Hors zone', description: 'encore dehors à la fermeture', color: '#ef4444' },
}

/** Échantillon jugé trop mince pour être commenté : on affiche la valeur, avec une réserve explicite. */
const LOW_SAMPLE_THRESHOLD = 20

const numberFormat = new Intl.NumberFormat('fr-FR')
const formatShare = (value: number, total: number) =>
  total > 0 ? `${((value / total) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : '—'

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default function ZoneClosuresPage() {
  const params = useParams()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const mapViewportRef = useRef<DropZoneMapViewportHandle>(null)

  const [period, setPeriod] = useState<ZonePeriod>('month')
  const [mapName, setMapName] = useState('')
  const [memberId, setMemberId] = useState<number | null>(null)
  const [phase, setPhase] = useState<TacticalPhase>('all')
  const [payload, setPayload] = useState<ZoneClosureResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!clanId) return
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError('')
        const search = new URLSearchParams({ period, phase })
        if (mapName) search.set('map', mapName)
        if (memberId) search.set('memberId', String(memberId))
        const response = await fetch(`/api/clans/${clanId}/telemetry/zone-closures?${search.toString()}`, {
          cache: 'no-store',
        })
        const data = (await response.json()) as ZoneClosureResponse
        if (cancelled) return
        if (!response.ok) {
          setPayload(null)
          setError(data.error ?? 'Chargement impossible.')
          return
        }
        setPayload(data)
      } catch {
        if (!cancelled) {
          setPayload(null)
          setError('Chargement impossible.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [clanId, period, mapName, memberId, phase])

  const periodItems = PERIOD_OPTIONS.map((option) => ({
    key: `period-${option.value}`,
    label: option.label,
    active: period === option.value,
    onSelect: () => setPeriod(option.value),
  }))

  const mapItems = (payload?.mapOptions ?? []).map((option) => ({
    key: `map-${option.mapName}`,
    label: `${option.label} (${numberFormat.format(option.positions)})`,
    active: (payload?.selectedMap ?? '') === option.mapName,
    onSelect: () => {
      setMapName(option.mapName)
      mapViewportRef.current?.reset()
    },
  }))

  const memberItems = [
    { key: 'member-all', label: 'Toute l’escouade', active: memberId === null, onSelect: () => setMemberId(null) },
    ...(payload?.members ?? []).map((member) => ({
      key: `member-${member.memberId}`,
      label: `${member.displayName} (${numberFormat.format(member.positions)})`,
      active: memberId === member.memberId,
      onSelect: () => setMemberId(member.memberId),
    })),
  ]

  const phaseItems = TACTICAL_PHASE_OPTIONS.map((option) => ({
    key: `phase-${option.value}`,
    label: option.label,
    active: phase === option.value,
    onSelect: () => setPhase(parseTacticalPhase(option.value)),
  }))

  const totalBands = payload ? payload.bands.center + payload.bands.edge + payload.bands.outside : 0
  const maxCellCount = payload?.cells.reduce((max, cell) => Math.max(max, cell.count), 0) ?? 0
  const lowSample = totalBands > 0 && totalBands < LOW_SAMPLE_THRESHOLD

  if (!clanId) {
    return (
      <main className="app-container app-main">
        <p className="text-sm text-red-600">Clan invalide.</p>
      </main>
    )
  }

  return (
    <main className="app-container app-main mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <NavigationTrail
        currentLabel="Fin de zone"
        currentHref={`/clans/${clanId}/stats/zone-closures`}
        fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
      />

      <header className="app-panel mb-5 flex flex-wrap items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10 text-cyan-500">
          <Target className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-gray-900">Densité des positions en fin de zone</h1>
          <p className="mt-1 text-sm text-gray-600">
            Où l’escouade termine ses rotations quand un rétrécissement s’achève et que le nouveau cercle devient
            stable. Une position par membre encore en vie et par fermeture.
          </p>
        </div>
      </header>

      <section className="app-panel mb-5 p-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MobileDropdownNav id="zone-period" label="Période" currentLabel={PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? ''} items={periodItems} visibilityClass="" className="w-full" />
          <MobileDropdownNav id="zone-map" label="Carte" currentLabel={payload?.selectedMapLabel ?? 'Aucune carte'} items={mapItems} visibilityClass="" className="w-full" />
          <MobileDropdownNav id="zone-member" label="Joueur" currentLabel={memberId ? payload?.members.find((member) => member.memberId === memberId)?.displayName ?? '—' : 'Toute l’escouade'} items={memberItems} visibilityClass="" className="w-full" />
          <MobileDropdownNav id="zone-phase" label="Plage tactique" currentLabel={TACTICAL_PHASE_OPTIONS.find((option) => option.value === phase)?.label ?? ''} items={phaseItems} visibilityClass="" className="w-full" />
        </div>
      </section>

      {error ? <p className="mb-5 text-sm text-red-600">{error}</p> : null}
      {loading && !payload ? <p className="text-sm text-gray-500">Chargement…</p> : null}

      {payload && payload.counts.positions === 0 && !loading ? (
        <section className="app-panel p-4">
          <p className="text-sm text-gray-600">
            Aucune fin de zone enregistrée pour ces filtres. Les fermetures sont écrites au moment de l’analyse des
            matchs ; les matchs dont les positions brutes ont été purgées ne peuvent plus être rattrapés.
          </p>
        </section>
      ) : null}

      {payload && payload.counts.positions > 0 ? (
        <>
          <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="app-panel p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Observations</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{numberFormat.format(payload.counts.positions)}</p>
              <p className="text-xs text-gray-500">
                {numberFormat.format(payload.counts.closures)} fermetures · {numberFormat.format(payload.counts.matches)} matchs ·{' '}
                {numberFormat.format(payload.counts.members)} joueurs
              </p>
            </div>
            <div className="app-panel p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Position moyenne</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {payload.averageRatio.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-gray-500">
                Distance au centre divisée par le rayon : 0 au centre, 1 sur le bord.
              </p>
            </div>
            <div className="app-panel p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Dans le cercle</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {formatShare(payload.bands.center + payload.bands.edge, totalBands)}
              </p>
              <p className="text-xs text-gray-500">
                {formatShare(payload.bands.outside, totalBands)} encore dehors à la fermeture
              </p>
            </div>
            <div className="app-panel p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Survivants du lobby</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {payload.counts.averageSurvivors.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
              </p>
              <p className="text-xs text-gray-500">en moyenne au moment des fermetures observées</p>
            </div>
          </section>

          {lowSample ? (
            <p className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Échantillon réduit ({numberFormat.format(totalBands)} observations) : à lire comme une tendance, pas
              comme une statistique.
            </p>
          ) : null}

          <section className="app-panel mb-5 overflow-hidden p-0">
            <div className="border-b border-gray-200 px-4 py-3 text-sm text-gray-600">
              Positions d’arrivée sur {payload.selectedMapLabel ?? 'la carte'} — la taille du point suit le nombre
              d’arrivées dans la case.
            </div>
            <div className="p-3 sm:p-4">
              <DropZoneMapViewport ref={mapViewportRef} showBoundaryControl={false}>
                {payload.selectedMap ? (
                  <>
                    <Image
                      src={mapAssetPath(payload.selectedMap)}
                      alt={payload.selectedMapLabel ?? payload.selectedMap}
                      fill
                      className="object-cover opacity-80 brightness-[0.72] saturate-[0.8] contrast-[1.08]"
                      sizes="(max-width: 1280px) 100vw, 70vw"
                      unoptimized
                    />
                    <div className="absolute inset-0 bg-slate-950/20" />
                  </>
                ) : null}
                <div className="absolute inset-0 overflow-hidden">
                  {payload.cells.map((cell) => {
                    const ratio = maxCellCount > 0 ? cell.count / maxCellCount : 0
                    const size = 8 + Math.sqrt(ratio) * 22
                    return (
                      <div
                        key={`${cell.xIndex}-${cell.yIndex}`}
                        className="absolute z-20 rounded-full border border-white/80"
                        style={{
                          left: `${((cell.xIndex + 0.5) / GRID_SIZE) * 100}%`,
                          top: `${((cell.yIndex + 0.5) / GRID_SIZE) * 100}%`,
                          width: `${size}px`,
                          height: `${size}px`,
                          transform: 'translate(-50%, -50%)',
                          backgroundColor: `rgba(34, 211, 238, ${0.25 + ratio * 0.6})`,
                          boxShadow: `0 0 ${6 + ratio * 12}px rgba(34, 211, 238, 0.7)`,
                        }}
                        title={`${numberFormat.format(cell.count)} arrivée(s)`}
                      />
                    )
                  })}
                </div>
              </DropZoneMapViewport>
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="app-panel p-4">
              <h2 className="text-base font-semibold text-gray-900">Par fermeture</h2>
              <p className="mt-1 text-xs text-gray-500">
                Numéro de la phase qui commence. Le nombre d’observations décroît avec les phases : seuls les membres
                encore en vie y figurent, c’est le biais de survie.
              </p>
              <div className="app-table-shell mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="app-table-head">
                    <tr>
                      <th className="px-3 py-2 text-left">Phase</th>
                      <th className="px-3 py-2 text-right">Observations</th>
                      <th className="px-3 py-2 text-right">Centre</th>
                      <th className="px-3 py-2 text-right">Bord</th>
                      <th className="px-3 py-2 text-right">Hors zone</th>
                      <th className="px-3 py-2 text-right">Ratio moyen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payload.byPhase.map((entry) => (
                      <tr key={entry.phase} className="app-table-row">
                        <td className="px-3 py-2 font-medium text-gray-900">Phase {entry.phase}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{numberFormat.format(entry.positions)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatShare(entry.bands.center, entry.positions)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatShare(entry.bands.edge, entry.positions)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatShare(entry.bands.outside, entry.positions)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {entry.averageRatio.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-gray-500">
                {(Object.keys(BAND_META) as ZoneBand[]).map((band) => (
                  <li key={band} className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: BAND_META[band].color }} />
                    <span>
                      <strong className="text-gray-700">{BAND_META[band].label}</strong> — {BAND_META[band].description}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="app-panel p-4">
              <h2 className="text-base font-semibold text-gray-900">Top 5 des secteurs d’arrivée</h2>
              <p className="mt-1 text-xs text-gray-500">
                Villes configurées pour cette carte ; les arrivées hors de tout périmètre ne sont pas classées.
              </p>
              {payload.topCities.length > 0 ? (
                <div className="app-table-shell mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="app-table-head">
                      <tr>
                        <th className="w-12 px-3 py-2 text-center">Rang</th>
                        <th className="px-3 py-2 text-left">Secteur</th>
                        <th className="px-3 py-2 text-right">Arrivées</th>
                        <th className="px-3 py-2 text-right">Part</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.topCities.map((city, index) => (
                        <tr key={city.locationId} className={`app-table-row ${index < 3 ? `app-table-row--top${index + 1}` : ''}`}>
                          <td className="px-3 py-2 text-center font-semibold">{index + 1}</td>
                          <td className="px-3 py-2 font-medium text-gray-900">{city.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{numberFormat.format(city.positions)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {city.share.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-3 text-sm text-gray-500">Aucune arrivée dans un périmètre configuré.</p>
              )}
              {payload.dataStart ? (
                <p className="mt-3 text-xs text-gray-500">
                  Données depuis le{' '}
                  {new Date(payload.dataStart).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}.
                </p>
              ) : null}
            </section>
          </div>
        </>
      ) : null}
    </main>
  )
}
