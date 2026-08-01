'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { useAuthSession } from '@/hooks/useAuthSession'
import MapImage from '@/components/ui/MapImage'
import SegmentedControl from '@/components/ui/SegmentedControl'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import type { MapLocation, MapLocations } from '@/lib/map-location-service'

const MAP_KEYS = [
  'Baltic_Main',
  'Savage_Main',
  'Desert_Main',
  'DihorOtok_Main',
  'Range_Main',
  'Summerland_Main',
  'Tiger_Main',
  'Kiki_Main',
  'Chimera_Main',
  'Heaven_Main',
  'Neon_Main',
] as const

const MAP_KEYS_WITH_ASSETS = new Set<string>([
  'Baltic_Main',
  'Savage_Main',
  'Desert_Main',
  'DihorOtok_Main',
  'Summerland_Main',
  'Tiger_Main',
  'Kiki_Main',
  'Chimera_Main',
  'Neon_Main',
])

type MapLabels = Record<string, string>
type SettingsView = 'labels' | 'locations'

const VIEW_OPTIONS: Array<{ value: SettingsView; label: string }> = [
  { value: 'labels', label: 'Alias des cartes' },
  { value: 'locations', label: 'Villes et zones' },
]

export default function MapLabelsSettingsPage() {
  const router = useRouter()
  const { loading, authenticated, permissions } = useAuthSession()
  const mapViewportRef = useRef<HTMLDivElement>(null)

  const [labels, setLabels] = useState<MapLabels>({})
  const [locations, setLocations] = useState<MapLocations>({})
  const [defaultLocations, setDefaultLocations] = useState<MapLocations>({})
  const [view, setView] = useState<SettingsView>('labels')
  const [selectedMap, setSelectedMap] = useState<string>(MAP_KEYS[0])
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const [mapZoom, setMapZoom] = useState(1)
  const [saving, setSaving] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const canManageSettings = permissions.includes('*') || permissions.includes('manage_settings')

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/login?redirect=/settings/map-labels')
    }
  }, [authenticated, loading, router])

  useEffect(() => {
    if (loading) {
      return
    }

    if (!authenticated || !canManageSettings) {
      return
    }

    let cancelled = false

    async function loadData() {
      try {
        const [labelsResponse, locationsResponse] = await Promise.all([
          fetch('/api/settings/map-labels', { cache: 'no-store' }),
          fetch('/api/settings/map-locations', { cache: 'no-store' }),
        ])
        const labelsPayload = (await labelsResponse.json().catch(() => null)) as
          | { labels?: MapLabels }
          | null
        const locationsPayload = (await locationsResponse.json().catch(() => null)) as
          | { locations?: MapLocations; defaultLocations?: MapLocations }
          | null

        if (!labelsResponse.ok || !locationsResponse.ok) {
          throw new Error('Impossible de charger la configuration des cartes')
        }

        if (!cancelled) {
          setLabels(labelsPayload?.labels ?? {})
          setLocations(locationsPayload?.locations ?? {})
          setDefaultLocations(locationsPayload?.defaultLocations ?? {})
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Impossible de charger la configuration des cartes'
          )
        }
      } finally {
        if (!cancelled) {
          setDataLoaded(true)
        }
      }
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [authenticated, canManageSettings, loading])

  const loadingData = authenticated && canManageSettings && !dataLoaded

  async function handleSaveLabels(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setSaving(true)
      setError('')
      setSuccess('')

      const response = await fetch('/api/settings/map-labels', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ labels }),
      })

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; labels?: MapLabels }
        | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Echec de la sauvegarde')
      }

      setLabels(payload?.labels ?? labels)
      setSuccess('Alias de cartes enregistres.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Echec de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveLocations(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setSaving(true)
      setError('')
      setSuccess('')

      const response = await fetch('/api/settings/map-locations', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locations }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; locations?: MapLocations }
        | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Echec de la sauvegarde')
      }

      setLocations(payload?.locations ?? locations)
      setSuccess('Villes et zones enregistrees.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Echec de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const selectedMapLocations = locations[selectedMap] ?? []
  const selectedLocation = selectedMapLocations.find((location) => location.id === selectedLocationId)

  function updateSelectedLocation(updates: Partial<MapLocation>) {
    if (!selectedLocationId) return

    setLocations((current) => ({
      ...current,
      [selectedMap]: (current[selectedMap] ?? []).map((location) =>
        location.id === selectedLocationId ? { ...location, ...updates } : location
      ),
    }))
  }

  function addLocation() {
    const id = `${selectedMap}-${Date.now().toString(36)}`
    const location: MapLocation = {
      id,
      name: 'Nouvelle ville',
      mapName: selectedMap,
      xPct: 50,
      yPct: 50,
      radiusPct: 4,
      enabled: true,
    }

    setLocations((current) => ({
      ...current,
      [selectedMap]: [...(current[selectedMap] ?? []), location],
    }))
    setSelectedLocationId(id)
    requestAnimationFrame(() => centerMapOnLocation(location))
  }

  function centerMapOnLocation(location: MapLocation) {
    const viewport = mapViewportRef.current
    if (!viewport) return

    viewport.scrollTo({
      left: (location.xPct / 100) * viewport.scrollWidth - viewport.clientWidth / 2,
      top: (location.yPct / 100) * viewport.scrollHeight - viewport.clientHeight / 2,
      behavior: 'smooth',
    })
  }

  function changeMapZoom(nextZoom: number) {
    const viewport = mapViewportRef.current
    const boundedZoom = Math.max(1, Math.min(4, nextZoom))
    const centerX = viewport
      ? (viewport.scrollLeft + viewport.clientWidth / 2) / viewport.scrollWidth
      : 0.5
    const centerY = viewport
      ? (viewport.scrollTop + viewport.clientHeight / 2) / viewport.scrollHeight
      : 0.5

    setMapZoom(boundedZoom)
    requestAnimationFrame(() => {
      const nextViewport = mapViewportRef.current
      if (!nextViewport) return

      nextViewport.scrollTo({
        left: centerX * nextViewport.scrollWidth - nextViewport.clientWidth / 2,
        top: centerY * nextViewport.scrollHeight - nextViewport.clientHeight / 2,
      })
    })
  }

  function loadDefaultLocationsForSelectedMap() {
    const defaults = defaultLocations[selectedMap] ?? []
    if (defaults.length === 0) return

    const existing = locations[selectedMap] ?? []
    const existingIds = new Set(existing.map((location) => location.id))
    const additions = defaults.filter((location) => !existingIds.has(location.id))

    setLocations((current) => ({
      ...current,
      [selectedMap]: [...(current[selectedMap] ?? []), ...additions],
    }))
    setSuccess(
      additions.length > 0
        ? `${additions.length} villes ajoutees pour ${labels[selectedMap] ?? selectedMap}.`
        : `Toutes les villes par defaut de ${labels[selectedMap] ?? selectedMap} sont deja presentes.`
    )
    setError('')
  }

  function loadAllDefaultLocations() {
    let addedCount = 0
    const nextLocations: MapLocations = { ...locations }

    for (const [mapName, defaults] of Object.entries(defaultLocations)) {
      const existing = nextLocations[mapName] ?? []
      const existingIds = new Set(existing.map((location) => location.id))
      const additions = defaults.filter((location) => !existingIds.has(location.id))
      nextLocations[mapName] = [...existing, ...additions]
      addedCount += additions.length
    }

    setLocations(nextLocations)
    setSuccess(
      addedCount > 0
        ? `${addedCount} villes ajoutees sur les cartes disponibles.`
        : 'Toutes les villes par defaut sont deja presentes.'
    )
    setError('')
  }

  function deleteSelectedLocation() {
    if (!selectedLocationId) return

    setLocations((current) => ({
      ...current,
      [selectedMap]: (current[selectedMap] ?? []).filter(
        (location) => location.id !== selectedLocationId
      ),
    }))
    setSelectedLocationId(null)
  }

  function placeSelectedLocation(event: React.MouseEvent<HTMLButtonElement>) {
    if (!selectedLocationId) return

    const bounds = event.currentTarget.getBoundingClientRect()
    updateSelectedLocation({
      xPct: Number((((event.clientX - bounds.left) / bounds.width) * 100).toFixed(2)),
      yPct: Number((((event.clientY - bounds.top) / bounds.height) * 100).toFixed(2)),
    })
  }

  if (loading || loadingData) {
    return (
      <main className="app-container app-main flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-600">Chargement de la configuration...</p>
      </main>
    )
  }

  if (!authenticated) {
    return null
  }

  if (!canManageSettings) {
    return (
      <main className="app-container app-main flex-1">
        <section className="app-panel p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-600">Permissions</p>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Acces restreint</h1>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800">
              Cette page est reservee au Owner ou aux admins disposant de la permission
              manage_settings.
            </p>
          </div>
          <Link
            href="/"
            className="mt-5 app-btn app-btn--md app-btn--secondary"
          >
            Retour a l&apos;accueil
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="app-container app-main flex-1">
      <section className="app-panel mb-4 p-4">
        <SettingsPageHeader
          title="Configuration des cartes PUBG"
          subtitle="Gerez les libelles des cartes et les perimetres des villes."
        />
        <div className="mt-4 border-t border-gray-200 pt-4">
          <SegmentedControl
            options={VIEW_OPTIONS}
            value={view}
            onChange={(nextView) => {
              setView(nextView)
              setError('')
              setSuccess('')
            }}
            size="sm"
            fullWidthOnMobile
          />
        </div>
      </section>

      {view === 'labels' ? (
        <section className="app-panel p-5 sm:p-6">
        <form className="space-y-4" onSubmit={handleSaveLabels}>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Libellés des cartes</h2>
            <p className="mt-1 text-sm text-gray-600">
              Ajuste les noms affichés dans les filtres et tableaux de l&apos;application.
            </p>
          </div>

          <div className="app-panel-muted p-4 sm:p-5">
            <div className="grid gap-4 md:grid-cols-2">
              {MAP_KEYS.map((mapKey) => (
                <label key={mapKey} className="flex items-center gap-3 text-sm font-medium text-gray-700">
                  <div className="flex h-12 w-20 shrink-0 items-center justify-center">
                    <MapImage mapKey={mapKey} className="h-12 w-20" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate">{mapKey}</span>
                    <input
                      type="text"
                      value={labels[mapKey] ?? ''}
                      maxLength={40}
                      onChange={(event) =>
                        setLabels((current) => ({
                          ...current,
                          [mapKey]: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm font-normal"
                      placeholder={mapKey}
                    />
                  </div>
                </label>
              ))}
            </div>
          </div>

          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="app-btn app-btn--md app-btn--primary"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
        </section>
      ) : (
        <section className="app-panel p-5 sm:p-6">
          <form className="space-y-5" onSubmit={handleSaveLocations}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Villes et zones</h2>
                <p className="mt-1 text-sm text-gray-600">
                  {labels[selectedMap] ?? selectedMap} · {selectedMapLocations.length} zone(s)
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="app-btn app-btn--sm app-btn--secondary"
                  onClick={loadAllDefaultLocations}
                >
                  Pre-remplir toutes les cartes
                </button>
                <button
                  type="button"
                  className="app-btn app-btn--sm app-btn--secondary"
                  onClick={loadDefaultLocationsForSelectedMap}
                  disabled={(defaultLocations[selectedMap] ?? []).length === 0}
                >
                  Pre-remplir cette carte
                </button>
                <button type="button" className="app-btn app-btn--sm app-btn--primary" onClick={addLocation}>
                  Ajouter une ville
                </button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {MAP_KEYS.map((mapKey) => (
                <button
                  key={mapKey}
                  type="button"
                  disabled={!MAP_KEYS_WITH_ASSETS.has(mapKey)}
                  onClick={() => {
                    setSelectedMap(mapKey)
                    setSelectedLocationId(null)
                    setMapZoom(1)
                    mapViewportRef.current?.scrollTo({ left: 0, top: 0 })
                  }}
                  className={`min-w-0 rounded border p-2 text-left transition-colors ${
                    !MAP_KEYS_WITH_ASSETS.has(mapKey)
                      ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400 opacity-55'
                      : selectedMap === mapKey
                      ? 'border-blue-500 bg-blue-50 text-blue-800'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                  title={MAP_KEYS_WITH_ASSETS.has(mapKey) ? undefined : 'Image de carte indisponible'}
                >
                  <MapImage mapKey={mapKey} className="aspect-video w-full" />
                  <span className="mt-1 block truncate text-xs font-medium">
                    {labels[mapKey] ?? mapKey}
                  </span>
                </button>
              ))}
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
              <div className="min-w-0 space-y-2">
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--secondary h-9 w-9 p-0 text-lg"
                    onClick={() => changeMapZoom(mapZoom - 0.5)}
                    disabled={mapZoom <= 1}
                    title="Reduire le zoom"
                    aria-label="Reduire le zoom"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--secondary min-w-16"
                    onClick={() => changeMapZoom(1)}
                    title="Reinitialiser le zoom"
                    aria-label="Reinitialiser le zoom"
                  >
                    {mapZoom.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}×
                  </button>
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--secondary h-9 w-9 p-0 text-lg"
                    onClick={() => changeMapZoom(mapZoom + 0.5)}
                    disabled={mapZoom >= 4}
                    title="Augmenter le zoom"
                    aria-label="Augmenter le zoom"
                  >
                    +
                  </button>
                </div>

                <div
                  ref={mapViewportRef}
                  className="aspect-square w-full overflow-auto rounded border border-gray-300 bg-slate-950"
                  data-map-viewport
                >
                  <button
                    type="button"
                    onClick={placeSelectedLocation}
                    className="relative block shrink-0 cursor-crosshair overflow-hidden bg-slate-950"
                    style={{
                      width: `${mapZoom * 100}%`,
                      aspectRatio: '1',
                    }}
                    aria-label={`Carte de ${labels[selectedMap] ?? selectedMap}`}
                  >
                    <Image
                      src={`/maps/pubg/${selectedMap}.webp`}
                      alt={labels[selectedMap] ?? selectedMap}
                      fill
                      className="object-fill"
                      sizes="(min-width: 1024px) 56vw, 100vw"
                      unoptimized
                    />
                    {selectedMapLocations.filter((location) => location.enabled).map((location) => (
                      <span
                        key={location.id}
                        className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[10px] font-semibold text-white shadow ${
                          location.id === selectedLocationId
                            ? 'border-cyan-200 bg-cyan-700/55 ring-2 ring-white'
                            : 'border-white/80 bg-slate-950/45'
                        }`}
                        style={{
                          left: `${location.xPct}%`,
                          top: `${location.yPct}%`,
                          width: `${location.radiusPct * 2}%`,
                          aspectRatio: '1',
                        }}
                      >
                        <span className="max-w-full truncate px-1">{location.name}</span>
                      </span>
                    ))}
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="app-panel-muted p-3">
                  <div className="space-y-2">
                    {selectedMapLocations.length === 0 ? (
                      <p className="text-sm text-gray-600">Aucune ville configuree.</p>
                    ) : selectedMapLocations.map((location) => (
                      <button
                        key={location.id}
                        type="button"
                        onClick={() => {
                          setSelectedLocationId(location.id)
                          centerMapOnLocation(location)
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded border px-3 py-2 text-left text-sm ${
                          location.id === selectedLocationId
                            ? 'border-blue-500 bg-blue-50 text-blue-800'
                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <span className="truncate font-medium">{location.name}</span>
                        <span className="shrink-0 text-xs text-gray-500">
                          Ø {(location.radiusPct * 2).toFixed(1)}%
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedLocation ? (
                  <div className="app-panel-muted space-y-4 p-4">
                    <label className="block text-sm font-medium text-gray-700">
                      Nom
                      <input
                        type="text"
                        value={selectedLocation.name}
                        maxLength={60}
                        onChange={(event) => updateSelectedLocation({ name: event.target.value })}
                        className="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-normal"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="block text-sm font-medium text-gray-700">
                        Position X (%)
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={selectedLocation.xPct}
                          onChange={(event) => updateSelectedLocation({ xPct: Number(event.target.value) })}
                          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-normal"
                        />
                      </label>
                      <label className="block text-sm font-medium text-gray-700">
                        Position Y (%)
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={selectedLocation.yPct}
                          onChange={(event) => updateSelectedLocation({ yPct: Number(event.target.value) })}
                          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-normal"
                        />
                      </label>
                    </div>

                    <label className="block text-sm font-medium text-gray-700">
                      Diametre ({(selectedLocation.radiusPct * 2).toFixed(1)}%)
                      <input
                        type="range"
                        min={0.5}
                        max={50}
                        step={0.5}
                        value={selectedLocation.radiusPct * 2}
                        onChange={(event) =>
                          updateSelectedLocation({ radiusPct: Number(event.target.value) / 2 })
                        }
                        className="mt-2 w-full"
                      />
                    </label>

                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      <input
                        type="checkbox"
                        checked={selectedLocation.enabled}
                        onChange={(event) => updateSelectedLocation({ enabled: event.target.checked })}
                      />
                      Zone active
                    </label>

                    <button
                      type="button"
                      className="app-btn app-btn--sm app-btn--danger"
                      onClick={deleteSelectedLocation}
                    >
                      Supprimer la ville
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {error ? <p className="text-sm text-rose-700">{error}</p> : null}
            {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

            <button type="submit" disabled={saving} className="app-btn app-btn--md app-btn--primary">
              {saving ? 'Enregistrement...' : 'Enregistrer les villes'}
            </button>
          </form>
        </section>
      )}
    </main>
  )
}
