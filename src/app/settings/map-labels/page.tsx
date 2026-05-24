'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { useAuthSession } from '@/hooks/useAuthSession'

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
      <main className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-4 py-12">
        <p className="text-sm text-slate-600">Chargement de la configuration...</p>
      </main>
    )
  }

  if (!authenticated) {
    return null
  }

  if (!canManageSettings) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-xl font-bold text-amber-900">Acces restreint</h1>
          <p className="mt-2 text-sm text-amber-800">
            Cette page est reservee au Owner ou aux admins disposant de la permission
            manage_settings.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900"
          >
            Retour a l&apos;accueil
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-cyan-50 via-white to-blue-50 p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-700">
          Parametrage heatmap
        </p>
        <h1 className="mt-2 text-2xl font-black text-slate-900">Alias des cartes PUBG</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Personnalisez les libelles affiches dans le filtre Carte PUBG de la page calendrier
          d&apos;activite.
        </p>

        <form className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-5" onSubmit={handleSave}>
          <div className="grid gap-4 md:grid-cols-2">
            {MAP_KEYS.map((mapKey) => (
              <label key={mapKey} className="block text-sm font-medium text-slate-700">
                {mapKey}
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
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  placeholder={mapKey}
                />
              </label>
            ))}
          </div>

          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
            <Link href="/settings/login-welcome" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Aller au message d&apos;accueil
            </Link>
          </div>
        </form>
      </section>
    </main>
  )
}
