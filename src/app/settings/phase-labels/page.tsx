'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { useAuthSession } from '@/hooks/useAuthSession'
import { PHASE_KEYS, DEFAULT_PHASE_LABELS, type PhaseKey } from '@/lib/phase-label-service'

type PhaseLabels = Record<string, string>

const PHASE_GROUPS: Array<{
  title: string
  description: string
  keys: readonly string[]
}> = [
  {
    title: 'Pré-partie',
    description: 'Phase avant le saut (isGame = 0.1)',
    keys: ['0.1'],
  },
  {
    title: 'Phases stables',
    description: 'Cercle fixe — isGame entier (1, 2… 8)',
    keys: ['1', '2', '3', '4', '5', '6', '7', '8'],
  },
  {
    title: 'Transitions (rétrécissements)',
    description: 'Cercle en mouvement — isGame avec .5 (1.5, 2.5… 7.5)',
    keys: ['1.5', '2.5', '3.5', '4.5', '5.5', '6.5', '7.5'],
  },
]

export default function PhaseLabelSettingsPage() {
  const router = useRouter()
  const { loading, authenticated, permissions } = useAuthSession()

  const [labels, setLabels] = useState<PhaseLabels>({})
  const [saving, setSaving] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const canManageSettings = permissions.includes('*') || permissions.includes('manage_settings')

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/login?redirect=/settings/phase-labels')
    }
  }, [authenticated, loading, router])

  useEffect(() => {
    if (loading || !authenticated || !canManageSettings) return

    let cancelled = false
    async function loadData() {
      try {
        const response = await fetch('/api/settings/phase-labels', { cache: 'no-store' })
        const payload = (await response.json().catch(() => null)) as { labels?: PhaseLabels } | null
        if (!response.ok) throw new Error('Impossible de charger les alias de phases')
        if (!cancelled) setLabels(payload?.labels ?? {})
      } catch (loadError) {
        if (!cancelled)
          setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les alias de phases')
      } finally {
        if (!cancelled) setDataLoaded(true)
      }
    }
    void loadData()
    return () => { cancelled = true }
  }, [authenticated, canManageSettings, loading])

  const loadingData = authenticated && canManageSettings && !dataLoaded

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      setSaving(true)
      setError('')
      setSuccess('')
      const response = await fetch('/api/settings/phase-labels', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ labels }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; labels?: PhaseLabels } | null
      if (!response.ok) throw new Error(payload?.error ?? 'Echec de la sauvegarde')
      setLabels(payload?.labels ?? labels)
      setSuccess('Alias de phases enregistrés.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Echec de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    const defaults: PhaseLabels = {}
    for (const key of PHASE_KEYS) {
      defaults[key] = DEFAULT_PHASE_LABELS[key as PhaseKey]
    }
    setLabels(defaults)
    setSuccess('')
    setError('')
  }

  if (loading || loadingData) {
    return (
      <main className="app-container app-main flex flex-1 items-center justify-center">
        <p className="text-sm text-slate-600">Chargement de la configuration...</p>
      </main>
    )
  }

  if (!authenticated) return null

  if (!canManageSettings) {
    return (
      <main className="app-container app-main flex-1">
        <section className="app-panel p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Permissions</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Accès restreint</h1>
          <p className="mt-3 text-sm text-slate-600">
            Cette page est réservée au Owner ou aux membres disposant de la permission manage_settings.
          </p>
          <Link href="/" className="mt-5 app-btn app-btn--md app-btn--secondary">
            Retour à l&apos;accueil
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="app-container app-main flex-1">
      <section className="app-panel mb-4 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Alias des phases PUBG</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Personnalise les noms affichés pour chaque valeur <code className="rounded bg-slate-100 px-1 text-xs">isGame</code> dans les filtres, graphiques et tableaux de phases. Les alias apparaissent dans tous les sélecteurs de phase du site.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/settings/weapon-labels" className="app-btn app-btn--sm app-btn--secondary">
              Alias armes
            </Link>
            <Link href="/settings/map-labels" className="app-btn app-btn--sm app-btn--secondary">
              Alias cartes
            </Link>
          </div>
        </div>
      </section>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      <form onSubmit={handleSave}>
        <div className="space-y-4">
          {PHASE_GROUPS.map((group) => (
            <section key={group.title} className="app-panel p-4 md:p-5">
              <h2 className="text-base font-semibold text-slate-900">{group.title}</h2>
              <p className="mt-0.5 text-xs text-slate-500">{group.description}</p>

              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-24 px-3 py-2">isGame</th>
                      <th className="w-40 px-3 py-2">Type</th>
                      <th className="px-3 py-2">Alias (affiché dans les filtres)</th>
                      <th className="w-40 px-3 py-2 text-slate-400">Valeur par défaut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.keys.map((key) => {
                      const isGame = Number(key)
                      const type = isGame < 1 ? 'pré-partie' : Number.isInteger(isGame) ? 'stable' : 'rétrécissement'
                      const typeTone =
                        isGame < 1
                          ? 'bg-slate-100 text-slate-600'
                          : Number.isInteger(isGame)
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-orange-100 text-orange-700'
                      return (
                        <tr key={key} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-mono text-xs text-slate-700">{key}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeTone}`}>
                              {type}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={labels[key] ?? DEFAULT_PHASE_LABELS[key as PhaseKey] ?? ''}
                              maxLength={40}
                              onChange={(e) =>
                                setLabels((prev) => ({ ...prev, [key]: e.target.value }))
                              }
                              className="app-input w-full"
                              placeholder={DEFAULT_PHASE_LABELS[key as PhaseKey]}
                            />
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-400">
                            {DEFAULT_PHASE_LABELS[key as PhaseKey]}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="app-btn app-btn--md app-btn--primary"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer les alias'}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="app-btn app-btn--md app-btn--secondary"
          >
            Réinitialiser les valeurs par défaut
          </button>
        </div>
      </form>
    </main>
  )
}
