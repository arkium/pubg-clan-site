'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Map, MapPin, Plus, Tags, Trash2 } from 'lucide-react'

import DropZoneMapViewport, { type DropZoneMapViewportHandle } from '@/components/drop-zones/DropZoneMapViewport'
import AdminPageBanner from '@/components/settings/AdminPageBanner'
import { ADMIN_PAGE_CLASS, AdminPageLoading, AdminPageRestricted, FormFeedback } from '@/components/settings/AdminPageStates'
import { ChoiceMenu, EmptyState, SectionCard, Switch } from '@/components/ui/CharteKit'
import MapImage from '@/components/ui/MapImage'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { useAuthSession } from '@/hooks/useAuthSession'
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
  'Range_Main',
  'Summerland_Main',
  'Tiger_Main',
  'Kiki_Main',
  'Chimera_Main',
  'Heaven_Main',
  'Neon_Main',
])

type MapLabels = Record<string, string>
type SettingsView = 'labels' | 'locations'

const VIEW_OPTIONS: Array<{ value: SettingsView; label: string }> = [
  { value: 'labels', label: 'Alias des cartes' },
  { value: 'locations', label: 'Villes et zones' },
]

/**
 * Cartes PUBG, référentiel commun à la plateforme (SuperUser), selon la charte UI (docs/ui/index.html) : alias des
 * cartes, et villes ou zones placées sur la carte (position, diamètre, activation).
 */
export default function MapLabelsSettingsPage() {
  const router = useRouter()
  const { loading, authenticated, isSuperUser } = useAuthSession()
  const mapViewportRef = useRef<DropZoneMapViewportHandle>(null)

  const [labels, setLabels] = useState<MapLabels>({})
  const [locations, setLocations] = useState<MapLocations>({})
  const [defaultLocations, setDefaultLocations] = useState<MapLocations>({})
  const [view, setView] = useState<SettingsView>('labels')
  const [selectedMap, setSelectedMap] = useState<string>(MAP_KEYS[0])
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Référentiel commun à toute la plateforme : SuperUser seulement, comme l'API
  const canManageSettings = isSuperUser

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
        const labelsPayload = (await labelsResponse.json().catch(() => null)) as { labels?: MapLabels } | null
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
          setError(loadError instanceof Error ? loadError.message : 'Impossible de charger la configuration des cartes')
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

      const payload = (await response.json().catch(() => null)) as { error?: string; labels?: MapLabels } | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Échec de l’enregistrement')
      }

      setLabels(payload?.labels ?? labels)
      setSuccess('Alias de cartes enregistrés.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Échec de l’enregistrement')
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
      const payload = (await response.json().catch(() => null)) as { error?: string; locations?: MapLocations } | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Échec de l’enregistrement')
      }

      setLocations(payload?.locations ?? locations)
      setSuccess('Villes et zones enregistrées.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Échec de l’enregistrement')
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
    mapViewportRef.current?.focusLocation(location)
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
        ? `${additions.length} ville(s) ajoutée(s) pour ${labels[selectedMap] ?? selectedMap}, à enregistrer.`
        : `Toutes les villes par défaut de ${labels[selectedMap] ?? selectedMap} sont déjà présentes.`
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
        ? `${addedCount} ville(s) ajoutée(s) sur les cartes disponibles, à enregistrer.`
        : 'Toutes les villes par défaut sont déjà présentes.'
    )
    setError('')
  }

  function deleteSelectedLocation() {
    if (!selectedLocationId) return

    setLocations((current) => ({
      ...current,
      [selectedMap]: (current[selectedMap] ?? []).filter((location) => location.id !== selectedLocationId),
    }))
    setSelectedLocationId(null)
  }

  function placeSelectedLocation(xPct: number, yPct: number) {
    if (!selectedLocationId) return

    updateSelectedLocation({
      xPct: Number(xPct.toFixed(2)),
      yPct: Number(yPct.toFixed(2)),
    })
  }

  if (loading || loadingData) {
    return <AdminPageLoading />
  }

  if (!authenticated) {
    return null
  }

  if (!canManageSettings) {
    return <AdminPageRestricted message="Cette page est réservée au SuperUser : les alias de cartes sont communs à toute la plateforme." />
  }

  const locationCount = Object.values(locations).reduce((total, list) => total + list.length, 0)

  return (
    <div className={ADMIN_PAGE_CLASS}>
      <AdminPageBanner
        title="Cartes"
        subtitle="Noms des cartes affichés dans le site et périmètres des villes utilisés par les zones de drop."
        icon={Map}
        image="/banner-maps.jpg"
        currentHref="/settings/map-labels"
        parent={{ href: '/settings', label: 'Plateforme' }}
        pills={[
          <>
            <span className="t-num">{MAP_KEYS.length}</span> cartes
          </>,
          <>
            <span className="t-num">{locationCount}</span> villes
          </>,
          'Réservé au SuperUser',
        ]}
      />

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

      {view === 'labels' ? (
        <form onSubmit={handleSaveLabels}>
          <SectionCard
            id="map-labels-title"
            icon={Tags}
            title="Libellés des cartes"
            meta="Noms affichés dans les filtres et tableaux du site ; laisser vide pour garder la clé PUBG."
          >
            <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
              {MAP_KEYS.map((mapKey) => (
                <li key={mapKey} className="app-panel-muted flex items-center gap-3 px-3 py-2">
                  <MapImage mapKey={mapKey} className="h-12 w-20 shrink-0 rounded-[6px]" />
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="t-meta truncate font-mono">{mapKey}</span>
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
                      className="app-input"
                      placeholder={mapKey}
                    />
                  </label>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={saving} className="app-btn app-btn--md app-btn--primary">
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <FormFeedback error={error} success={success} />
            </div>
          </SectionCard>
        </form>
      ) : (
        <form onSubmit={handleSaveLocations}>
          <SectionCard
            id="map-locations-title"
            icon={MapPin}
            title="Villes et zones"
            meta={`${labels[selectedMap] ?? selectedMap} · ${selectedMapLocations.length} zone(s). Cliquer sur la carte place la ville choisie.`}
            aside={
              <>
                <button type="button" className="app-btn app-btn--sm app-btn--secondary" onClick={loadAllDefaultLocations}>
                  Pré-remplir toutes les cartes
                </button>
                <button
                  type="button"
                  className="app-btn app-btn--sm app-btn--secondary"
                  onClick={loadDefaultLocationsForSelectedMap}
                  disabled={(defaultLocations[selectedMap] ?? []).length === 0}
                >
                  Pré-remplir cette carte
                </button>
              </>
            }
          >
            <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-4 lg:grid-cols-6">
              {MAP_KEYS.map((mapKey) => {
                const available = MAP_KEYS_WITH_ASSETS.has(mapKey)
                const selected = selectedMap === mapKey
                return (
                  <li key={mapKey} className="flex">
                    <button
                      type="button"
                      disabled={!available}
                      aria-pressed={selected}
                      onClick={() => {
                        setSelectedMap(mapKey)
                        setSelectedLocationId(null)
                        mapViewportRef.current?.reset()
                      }}
                      className="app-panel-muted flex w-full min-w-0 flex-col gap-1 p-1.5 text-left transition-colors enabled:hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-45"
                      style={selected ? { borderColor: 'var(--theme-ui-accent)', backgroundColor: 'var(--theme-ui-accent-tint)' } : undefined}
                      title={available ? undefined : 'Image de carte indisponible'}
                    >
                      <MapImage mapKey={mapKey} className="aspect-video w-full rounded-[6px]" />
                      <span
                        className={`truncate text-xs font-semibold ${selected ? 'text-[var(--theme-ui-accent-text)]' : 'text-gray-700'}`}
                      >
                        {labels[mapKey] || mapKey}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.75fr)]">
              <div className="min-w-0">
                <DropZoneMapViewport ref={mapViewportRef} showBoundaryControl={false} onMapClick={placeSelectedLocation}>
                  <Image
                    src={`/maps/pubg/${selectedMap}.webp`}
                    alt={labels[selectedMap] ?? selectedMap}
                    fill
                    className="object-fill"
                    sizes="(min-width: 1024px) 56vw, 100vw"
                    unoptimized
                  />
                  {selectedMapLocations
                    .filter((location) => location.enabled)
                    .map((location) => {
                      const active = location.id === selectedLocationId
                      return (
                        <span
                          key={location.id}
                          className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-semibold text-white shadow"
                          style={{
                            left: `${location.xPct}%`,
                            top: `${location.yPct}%`,
                            width: `${location.radiusPct * 2}%`,
                            aspectRatio: '1',
                            border: `2px solid ${active ? 'var(--theme-ui-accent)' : 'color-mix(in srgb, white 80%, transparent)'}`,
                            backgroundColor: active
                              ? 'color-mix(in srgb, var(--theme-ui-accent) 40%, transparent)'
                              : 'color-mix(in srgb, black 45%, transparent)',
                          }}
                        >
                          <span className="max-w-full truncate px-1">{location.name}</span>
                        </span>
                      )
                    })}
                </DropZoneMapViewport>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span className="t-label">Ville ou zone</span>
                  {selectedMapLocations.length === 0 ? (
                    <p className="t-meta m-0">Aucune ville configurée sur cette carte.</p>
                  ) : (
                    <ChoiceMenu<string>
                      label="Ville ou zone"
                      value={selectedLocationId ?? ''}
                      options={[
                        { value: '', label: 'Choisir une ville' },
                        ...selectedMapLocations.map((location) => ({
                          value: location.id,
                          label: `${location.name} — Ø ${(location.radiusPct * 2).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`,
                        })),
                      ]}
                      onChange={(locationId) => {
                        setSelectedLocationId(locationId || null)
                        const location = selectedMapLocations.find((item) => item.id === locationId)
                        if (location) {
                          centerMapOnLocation(location)
                        }
                      }}
                    />
                  )}
                </div>
                <button type="button" className="app-btn app-btn--sm app-btn--secondary gap-1.5 self-start" onClick={addLocation}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Ajouter une ville
                </button>

                {selectedLocation ? (
                  <div className="app-panel-muted flex flex-col gap-3 p-3.5">
                    <label className="flex flex-col gap-1">
                      <span className="t-label">Nom</span>
                      <input
                        type="text"
                        value={selectedLocation.name}
                        maxLength={60}
                        onChange={(event) => updateSelectedLocation({ name: event.target.value })}
                        className="app-input"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-2.5">
                      <label className="flex flex-col gap-1">
                        <span className="t-label">Position X (%)</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={selectedLocation.xPct}
                          onChange={(event) => updateSelectedLocation({ xPct: Number(event.target.value) })}
                          className="app-input"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="t-label">Position Y (%)</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.1}
                          value={selectedLocation.yPct}
                          onChange={(event) => updateSelectedLocation({ yPct: Number(event.target.value) })}
                          className="app-input"
                        />
                      </label>
                    </div>

                    <label className="flex flex-col gap-1">
                      <span className="t-label">
                        Diamètre <span className="t-num">({(selectedLocation.radiusPct * 2).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %)</span>
                      </span>
                      <input
                        type="range"
                        min={0.5}
                        max={50}
                        step={0.5}
                        value={selectedLocation.radiusPct * 2}
                        onChange={(event) => updateSelectedLocation({ radiusPct: Number(event.target.value) / 2 })}
                        className="w-full accent-[var(--theme-ui-accent)]"
                      />
                    </label>

                    <div className="flex items-center gap-2.5">
                      <Switch
                        checked={selectedLocation.enabled}
                        onChange={(enabled) => updateSelectedLocation({ enabled })}
                        labelledBy="map-location-enabled"
                      />
                      <span id="map-location-enabled" className="t-body text-gray-900">
                        Zone active
                      </span>
                    </div>

                    <button type="button" className="app-btn app-btn--sm app-btn--danger gap-1.5 self-start" onClick={deleteSelectedLocation}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Retirer la ville
                    </button>
                  </div>
                ) : selectedMapLocations.length > 0 ? (
                  <EmptyState icon={MapPin} title="Aucune ville choisie" text="Choisir une ville pour la déplacer, la redimensionner ou la désactiver." />
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={saving} className="app-btn app-btn--md app-btn--primary">
                {saving ? 'Enregistrement…' : 'Enregistrer les villes'}
              </button>
              <FormFeedback error={error} success={success} />
            </div>
          </SectionCard>
        </form>
      )}
    </div>
  )
}
