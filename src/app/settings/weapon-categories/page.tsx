'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { useEffect, useMemo, useState } from 'react'
import { ListPlus } from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'
import WeaponIcon from '@/components/ui/WeaponIcon'
import {
  CATEGORY_CODES,
  DEFAULT_CATEGORY_LABELS,
  DEFAULT_WEAPON_CATEGORIES,
  type CategoryCode,
} from '@/lib/weapon-category-service'

const WEAPON_KEYS = Object.keys(DEFAULT_WEAPON_CATEGORIES).sort()

type WeaponCategories = Record<string, CategoryCode>
type CategoryLabels = Record<string, string>

export default function WeaponCategoriesSettingsPage() {
  const router = useRouter()
  const { loading, authenticated, permissions } = useAuthSession()

  const [weaponCategories, setWeaponCategories] = useState<WeaponCategories>({})
  const [categoryLabels, setCategoryLabels] = useState<CategoryLabels>({})
  const [saving, setSaving] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  const canManageSettings = permissions.includes('*') || permissions.includes('manage_settings')

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/login?redirect=/settings/weapon-categories')
    }
  }, [authenticated, loading, router])

  useEffect(() => {
    if (loading || !authenticated || !canManageSettings) return

    let cancelled = false

    async function loadData() {
      try {
        const response = await fetch('/api/settings/weapon-categories', { cache: 'no-store' })
        const payload = (await response.json().catch(() => null)) as {
          weaponCategories?: WeaponCategories
          categoryLabels?: CategoryLabels
        } | null

        if (!response.ok) throw new Error('Impossible de charger les catégories')
        if (!cancelled) {
          setWeaponCategories(payload?.weaponCategories ?? {})
          setCategoryLabels(payload?.categoryLabels ?? {})
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les catégories')
      } finally {
        if (!cancelled) setDataLoaded(true)
      }
    }

    void loadData()
    return () => { cancelled = true }
  }, [authenticated, canManageSettings, loading])

  const filteredKeys = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()
    if (!search) return WEAPON_KEYS
    return WEAPON_KEYS.filter((key) => key.toLowerCase().includes(search))
  }, [searchTerm])

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      setSaving(true)
      setError('')
      setSuccess('')

      const response = await fetch('/api/settings/weapon-categories', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ weaponCategories, categoryLabels }),
      })

      const payload = (await response.json().catch(() => null)) as {
        error?: string
        weaponCategories?: WeaponCategories
        categoryLabels?: CategoryLabels
      } | null

      if (!response.ok) throw new Error(payload?.error ?? 'Echec de la sauvegarde')

      setWeaponCategories(payload?.weaponCategories ?? weaponCategories)
      setCategoryLabels(payload?.categoryLabels ?? categoryLabels)
      setSuccess('Catégories enregistrées.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Echec de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  if (loading || (authenticated && canManageSettings && !dataLoaded)) {
    return (
      <main className="app-container app-main flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-600">Chargement de la configuration...</p>
      </main>
    )
  }

  if (!authenticated) return null

  if (!canManageSettings) {
    return (
      <main className="app-container app-main flex-1 space-y-4">
      <NavigationTrail
        currentLabel="Catégories d'armes"
        currentHref="/settings/weapon-categories"
        fallbackParent={{ href: '/settings/admin', label: 'Administration' }}
      />
        <section className="app-panel p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-600">Permissions</p>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Acces restreint</h1>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800">
              Cette page est reservee au Owner ou aux admins disposant de la permission manage_settings.
            </p>
          </div>
          <Link href="/" className="mt-5 app-btn app-btn--md app-btn--secondary">Retour a l&apos;accueil</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="app-container app-main flex-1 space-y-4">
      <NavigationTrail
        currentLabel="Catégories d'armes"
        currentHref="/settings/weapon-categories"
        fallbackParent={{ href: '/settings/admin', label: 'Administration' }}
      />
      <header
        className="relative mb-6 min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-no-repeat sm:min-h-[13rem]"
        style={{ backgroundImage: `url('/banner-categories.jpg')`, backgroundPosition: 'center 35%' }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2.5 sm:px-5 sm:py-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <ListPlus className="h-4 w-4 text-purple-400 sm:h-6 sm:w-6" aria-hidden="true" />
            <h1 className="text-sm font-bold tracking-tight text-white drop-shadow-md sm:text-xl md:text-2xl">
              Catégories des armes
            </h1>
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-gray-200 drop-shadow-md sm:mt-1 sm:text-sm">
            Assigne chaque arme à une catégorie et personnalise les noms affichés dans les filtres.
          </p>
        </div>
      </header>

      <form className="space-y-4" onSubmit={handleSave}>
        <section className="app-panel p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900">Noms des catégories</h2>
          <p className="mt-1 mb-4 text-sm text-gray-600">Personnalise les labels affichés dans les filtres et colonnes.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {CATEGORY_CODES.map((code) => (
              <label key={code} className="block text-sm font-medium text-gray-700">
                <span className="mb-1 block text-xs text-gray-500">{code}</span>
                <input
                  type="text"
                  value={categoryLabels[code] ?? DEFAULT_CATEGORY_LABELS[code]}
                  maxLength={50}
                  onChange={(e) => setCategoryLabels((prev) => ({ ...prev, [code]: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder={DEFAULT_CATEGORY_LABELS[code]}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="app-panel p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900">Catégorie par arme</h2>
          <p className="mt-1 text-sm text-gray-600">Assigne chaque arme à une catégorie.</p>

          <div className="app-panel-muted mt-4 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex min-w-[18rem] flex-1 flex-col gap-1 text-sm font-medium text-gray-700">
                Recherche
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Ex: WeapAK47_C, Kar98..."
                />
              </label>
              <button type="button" onClick={() => setSearchTerm('')} disabled={!searchTerm.trim()} className="app-btn app-btn--sm app-btn--secondary">
                Effacer
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-600">{filteredKeys.length} résultat(s) sur {WEAPON_KEYS.length}</p>
          </div>

          <div className="app-panel-muted mt-4 grid gap-4 p-4 sm:p-5 md:grid-cols-2">
            {filteredKeys.map((key) => (
              <label key={key} className="flex items-center gap-3 text-sm font-medium text-gray-700">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center">
                  <WeaponIcon id={key} size="xl" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block truncate">{key}</span>
                  <select
                    value={weaponCategories[key] ?? DEFAULT_WEAPON_CATEGORIES[key] ?? 'Autre'}
                    onChange={(e) => setWeaponCategories((prev) => ({ ...prev, [key]: e.target.value as CategoryCode }))}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm font-normal"
                  >
                    {CATEGORY_CODES.map((code) => (
                      <option key={code} value={code}>
                        {code} — {categoryLabels[code] ?? DEFAULT_CATEGORY_LABELS[code]}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            ))}
            {filteredKeys.length === 0 ? (
              <p className="text-sm text-gray-600">Aucun résultat pour cette recherche.</p>
            ) : null}
          </div>
        </section>

        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving} className="app-btn app-btn--md app-btn--primary">
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </main>
  )
}
