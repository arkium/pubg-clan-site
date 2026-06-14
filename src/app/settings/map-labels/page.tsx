'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { useAuthSession } from '@/hooks/useAuthSession'
import MapImage from '@/components/ui/MapImage'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import SettingsSectionNav from '@/components/SettingsSectionNav'

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

type MapLabels = Record<string, string>

export default function MapLabelsSettingsPage() {
  const router = useRouter()
  const { loading, authenticated, permissions } = useAuthSession()

  const [labels, setLabels] = useState<MapLabels>({})
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
        const response = await fetch('/api/settings/map-labels', { cache: 'no-store' })
        const payload = (await response.json().catch(() => null)) as { labels?: MapLabels } | null

        if (!response.ok) {
          throw new Error('Impossible de charger les alias de cartes')
        }

        if (!cancelled) {
          setLabels(payload?.labels ?? {})
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : 'Impossible de charger les alias de cartes'
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

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
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
          title="Alias des cartes PUBG"
          subtitle="Personnalisez les libelles affiches dans le filtre Carte PUBG de la page calendrier d'activite."
        />
        <SettingsSectionNav section="admin-menu" />
      </section>

      <section className="app-panel p-5 sm:p-6">
        <form className="space-y-4" onSubmit={handleSave}>
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
    </main>
  )
}
