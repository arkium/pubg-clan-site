'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { useAuthSession } from '@/hooks/useAuthSession'
import WeaponIcon from '@/components/ui/WeaponIcon'

const WEAPON_KEYS = [
  'WeapAK47_C',
  'WeapBerylM762_C',
  'WeapACE32_C',
  'WeapGroza_C',
  'WeapM16A4_C',
  'WeapAUG_C',
  'WeapHK416_C',
  'WeapSCAR-L_C',
  'WeapQBZ95_C',
  'WeapG36C_C',
  'WeapK2_C',
  'WeapMk47Mutant_C',
  'WeapMini14_C',
  'WeapQBU88_C',
  'WeapMk12_C',
  'WeapM24_C',
  'WeapKar98k_C',
  'WeapAWM_C',
  'WeapDragunov_C',
  'WeapSKS_C',
  'WeapFNFal_C',
  'WeapM249_C',
  'WeapMG3_C',
  'WeapDP28_C',
  'WeapMP5K_C',
  'WeapMP9_C',
  'WeapUMP_C',
  'WeapVector_C',
  'WeapBizonPP19_C',
  'WeapThompson_C',
  'WeapUZI_C',
  'WeapP90_C',
  'WeapSaiga12_C',
  'WeapDBS_C',
  'WeapWinchester_C',
  'WeapBerreta686_C',
  'WeapSawnoff_C',
  'WeapPan_C',
  'WeapCrossbow_1_C',
  'WeapPanzerFaust100M1_C',
  'WeapGrenade_C',
  'WeapMolotov_C',
  'EsiGameModeBase_BattleRoyaleBP_C',
] as const

type WeaponLabels = Record<string, string>

export default function WeaponLabelsSettingsPage() {
  const router = useRouter()
  const { loading, authenticated, permissions } = useAuthSession()

  const [labels, setLabels] = useState<WeaponLabels>({})
  const [saving, setSaving] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  const canManageSettings = permissions.includes('*') || permissions.includes('manage_settings')

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/login?redirect=/settings/weapon-labels')
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
        const response = await fetch('/api/settings/weapon-labels', { cache: 'no-store' })
        const payload = (await response.json().catch(() => null)) as { labels?: WeaponLabels } | null

        if (!response.ok) {
          throw new Error('Impossible de charger les alias d\'armes')
        }

        if (!cancelled) {
          setLabels(payload?.labels ?? {})
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : 'Impossible de charger les alias d\'armes'
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

  const orderedKeys = useMemo(() => {
    const unique = new Set<string>([...WEAPON_KEYS, ...Object.keys(labels)])
    return Array.from(unique).sort((left, right) => left.localeCompare(right))
  }, [labels])

  const filteredKeys = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()
    if (!search) {
      return orderedKeys
    }

    return orderedKeys.filter((weaponKey) => {
      const label = (labels[weaponKey] ?? '').toLowerCase()
      return weaponKey.toLowerCase().includes(search) || label.includes(search)
    })
  }, [labels, orderedKeys, searchTerm])

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setSaving(true)
      setError('')
      setSuccess('')

      const response = await fetch('/api/settings/weapon-labels', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ labels }),
      })

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; labels?: WeaponLabels }
        | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Echec de la sauvegarde')
      }

      setLabels(payload?.labels ?? labels)
      setSuccess('Alias d\'armes enregistres.')
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
          <Link href="/" className="mt-5 app-btn app-btn--md app-btn--secondary">
            Retour a l&apos;accueil
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
            <h1 className="text-2xl font-bold text-gray-900">Alias des armes PUBG</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Personnalise les noms affiches dans les pages telemetry (clan, membre, detail match).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/settings/weapon-categories" className="app-btn app-btn--md app-btn--secondary">
              Catégories armes
            </Link>
            <Link href="/settings/map-labels" className="app-btn app-btn--md app-btn--secondary">
              Alias cartes
            </Link>
            <Link href="/settings/login-welcome" className="app-btn app-btn--md app-btn--secondary">
              Accueil login
            </Link>
          </div>
        </div>
      </section>

      <section className="app-panel p-5 sm:p-6">
        <form className="space-y-4" onSubmit={handleSave}>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Libelles des armes</h2>
            <p className="mt-1 text-sm text-gray-600">
              Garde les cles PUBG intactes et ajuste seulement le label d&apos;affichage.
            </p>
          </div>

          <div className="app-panel-muted p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[18rem] flex-1 flex-col gap-1 text-sm font-medium text-gray-700">
                Recherche
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Ex: WeapHK416_C, M416, shotgun..."
                />
              </label>
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                disabled={searchTerm.trim().length === 0}
                className="app-btn app-btn--sm app-btn--secondary"
              >
                Effacer
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-600">
              {filteredKeys.length} resultat(s) sur {orderedKeys.length}
            </p>
          </div>

          <div className="app-panel-muted p-4 sm:p-5">
            <div className="grid gap-4 md:grid-cols-2">
              {filteredKeys.map((weaponKey) => (
                <label key={weaponKey} className="flex items-center gap-3 text-sm font-medium text-gray-700">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center">
                    <WeaponIcon id={weaponKey} size="xl" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate">{weaponKey}</span>
                    <input
                      type="text"
                      value={labels[weaponKey] ?? ''}
                      maxLength={50}
                      onChange={(event) =>
                        setLabels((current) => ({
                          ...current,
                          [weaponKey]: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm font-normal"
                      placeholder={weaponKey}
                    />
                  </div>
                </label>
              ))}
            </div>
            {filteredKeys.length === 0 ? (
              <p className="text-sm text-gray-600">Aucun resultat pour cette recherche.</p>
            ) : null}
          </div>

          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving} className="app-btn app-btn--md app-btn--primary">
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
