'use client'

import { useEffect, useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'

import AdminPageBanner from '@/components/settings/AdminPageBanner'
import { ADMIN_PAGE_CLASS, FormFeedback } from '@/components/settings/AdminPageStates'
import { Callout, ListSkeleton, Tag } from '@/components/ui/CharteKit'
import SegmentedControl from '@/components/ui/SegmentedControl'
import type { OwnerFeatureAccess } from '@/lib/auth/owner-feature-catalog'

/**
 * Délégation aux Owners (docs/TODO/administration.md §5.3, lot 3b) : le SuperUser choisit, pour tous les Owners à la
 * fois, les outils de clan qui leur sont ouverts. Le réglage s'applique aux API, aux pages et aux menus. La télémétrie
 * d'un clan (données, resynchronisation, outils) n'y figure pas : réservée au SuperUser (décision du 2026-10-08).
 * Selon la charte UI (docs/ui/index.html) : bandeau photo, une carte par outil, choix en segmented.
 */

type FeatureRow = {
  key: string
  label: string
  description: string
  access: OwnerFeatureAccess
  defaultAccess: OwnerFeatureAccess
}

const ACCESS_LABELS: Record<OwnerFeatureAccess, string> = {
  owner: 'Ouvert aux Owners',
  superuser: 'SuperUser seul',
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

  const openCount = features?.filter((feature) => feature.access === 'owner').length ?? 0

  return (
    <div className={ADMIN_PAGE_CLASS}>
      <AdminPageBanner
        title="Délégation aux Owners"
        subtitle="Outils de clan ouverts aux Owners, pour tous les clans à la fois ; un changement s’applique sous 30 secondes."
        icon={KeyRound}
        image="/member-dashboard.jpg"
        currentHref="/settings/delegation"
        parent={{ href: '/settings', label: 'Plateforme' }}
        pills={[
          ...(features
            ? [
                <>
                  <span className="t-num">{openCount}</span> / <span className="t-num">{features.length}</span> ouverts
                </>,
              ]
            : []),
          'Réservé au SuperUser',
        ]}
      />

      <Callout tone="sky" icon={ShieldCheck} title="Le SuperUser garde toujours l’accès">
        Fermer un outil aux Owners ne le retire qu’à eux. La télémétrie des clans (données, resynchronisation, outils) ne se
        délègue pas.
      </Callout>

      <FormFeedback error={error} />

      {features === null ? (
        error ? null : <ListSkeleton rows={3} />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {features.map((feature) => (
            <li key={feature.key} className="app-panel flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="flex min-w-0 max-w-2xl flex-col gap-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="t-card-title">{feature.label}</span>
                  {feature.access !== feature.defaultAccess ? <Tag tone="sky">Modifié</Tag> : null}
                </span>
                <span className="t-body text-gray-700">{feature.description}</span>
                <span className="t-meta">Par défaut : {ACCESS_LABELS[feature.defaultAccess]}</span>
              </div>
              <SegmentedControl<OwnerFeatureAccess>
                size="sm"
                value={feature.access}
                onChange={(access) => void save(feature.key, access)}
                options={[
                  { value: 'owner', label: ACCESS_LABELS.owner, disabled: savingKey === feature.key },
                  { value: 'superuser', label: ACCESS_LABELS.superuser, disabled: savingKey === feature.key },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
