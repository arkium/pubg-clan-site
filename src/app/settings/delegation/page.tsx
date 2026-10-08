'use client'

import { useEffect, useState } from 'react'

import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import SegmentedControl from '@/components/ui/SegmentedControl'
import type { OwnerFeatureAccess } from '@/lib/auth/owner-feature-catalog'

/**
 * Délégation aux Owners (docs/TODO/administration.md §5.3, lot 3b) : le SuperUser choisit, pour tous les Owners à la
 * fois, les outils de clan qui leur sont ouverts. Le réglage s'applique aux API, aux pages et aux menus. La télémétrie
 * d'un clan (données, resynchronisation, outils) n'y figure pas : réservée au SuperUser (décision du 2026-10-08).
 */

type FeatureRow = {
  key: string
  label: string
  description: string
  access: OwnerFeatureAccess
  defaultAccess: OwnerFeatureAccess
}

export default function DelegationPage() {
  const [features, setFeatures] = useState<FeatureRow[] | null>(null)
  const [error, setError] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/settings/owner-features', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { features?: FeatureRow[]; error?: string } | null
        if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`)
        if (!cancelled) setFeatures(payload?.features ?? [])
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Chargement impossible.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function save(key: string, access: OwnerFeatureAccess) {
    setSavingKey(key)
    setError('')
    try {
      const response = await fetch('/api/settings/owner-features', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ feature: key, access }),
      })
      const payload = (await response.json().catch(() => null)) as { features?: FeatureRow[]; error?: string } | null
      if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`)
      setFeatures(payload?.features ?? null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Enregistrement impossible.')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <main className="app-container app-main flex-1 space-y-4">
      <NavigationTrail
        currentLabel="Délégation aux Owners"
        currentHref="/settings/delegation"
        fallbackParent={{ href: '/settings', label: 'Plateforme' }}
      />
      <section className="app-panel p-4 sm:p-6">
        <SettingsPageHeader
          title="Délégation aux Owners"
          subtitle="Outils de clan ouverts aux Owners, pour tous les clans à la fois. Le SuperUser garde toujours l’accès ; la télémétrie des clans lui reste réservée. Un changement s’applique sous 30 secondes."
        />
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {features === null ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : (
        <ul className="space-y-3">
          {features.map((feature) => (
            <li key={feature.key} className="app-panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 max-w-2xl space-y-1">
                  <p className="text-sm font-semibold text-gray-900">{feature.label}</p>
                  <p className="text-sm text-gray-600">{feature.description}</p>
                </div>
                <SegmentedControl<OwnerFeatureAccess>
                  value={feature.access}
                  onChange={(access) => void save(feature.key, access)}
                  options={[
                    { value: 'owner', label: 'Ouvert aux Owners', disabled: savingKey === feature.key },
                    { value: 'superuser', label: 'SuperUser seul', disabled: savingKey === feature.key },
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
