'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Activity, CircleDot, Hourglass, Shrink } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import AdminPageBanner from '@/components/settings/AdminPageBanner'
import { ADMIN_PAGE_CLASS, AdminPageLoading, AdminPageRestricted, FormFeedback } from '@/components/settings/AdminPageStates'
import { SectionCard, Tag, type Tone } from '@/components/ui/CharteKit'
import { useAuthSession } from '@/hooks/useAuthSession'
import { PHASE_KEYS, DEFAULT_PHASE_LABELS, type PhaseKey } from '@/lib/phase-label-service'

type PhaseLabels = Record<string, string>

const PHASE_GROUPS: Array<{
  id: string
  title: string
  description: string
  icon: LucideIcon
  keys: readonly string[]
}> = [
  {
    id: 'phase-group-pre',
    title: 'Avant le saut',
    description: 'Phase d’avant-partie (isGame = 0.1).',
    icon: Hourglass,
    keys: ['0.1'],
  },
  {
    id: 'phase-group-stable',
    title: 'Phases stables',
    description: 'Cercle fixe : isGame entier (1, 2… 8).',
    icon: CircleDot,
    keys: ['1', '2', '3', '4', '5', '6', '7', '8'],
  },
  {
    id: 'phase-group-shrink',
    title: 'Rétrécissements',
    description: 'Cercle en mouvement : isGame en .5 (1.5, 2.5… 7.5).',
    icon: Shrink,
    keys: ['1.5', '2.5', '3.5', '4.5', '5.5', '6.5', '7.5'],
  },
]

function phaseType(key: string): { label: string; tone: Tone } {
  const isGame = Number(key)
  if (isGame < 1) return { label: 'avant-partie', tone: 'neutral' }
  return Number.isInteger(isGame) ? { label: 'stable', tone: 'sky' } : { label: 'rétrécissement', tone: 'warn' }
}

/**
 * Alias des phases de jeu (valeur `isGame` de la télémétrie), référentiel commun à la plateforme (SuperUser), selon la
 * charte UI (docs/ui/index.html) : un bloc par famille de phases, une ligne par valeur.
 */
export default function PhaseLabelSettingsPage() {
  const router = useRouter()
  const { loading, authenticated, isSuperUser } = useAuthSession()

  const [labels, setLabels] = useState<PhaseLabels>({})
  const [saving, setSaving] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Référentiel commun à toute la plateforme : SuperUser seulement, comme l'API
  const canManageSettings = isSuperUser

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
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les alias de phases')
      } finally {
        if (!cancelled) setDataLoaded(true)
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
      const response = await fetch('/api/settings/phase-labels', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ labels }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string; labels?: PhaseLabels } | null
      if (!response.ok) throw new Error(payload?.error ?? 'Échec de l’enregistrement')
      setLabels(payload?.labels ?? labels)
      setSuccess('Alias de phases enregistrés.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Échec de l’enregistrement')
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

  if (loading || loadingData) return <AdminPageLoading />

  if (!authenticated) return null

  if (!canManageSettings) {
    return <AdminPageRestricted message="Cette page est réservée au SuperUser : les alias de phases sont communs à toute la plateforme." />
  }

  return (
    <div className={ADMIN_PAGE_CLASS}>
      <AdminPageBanner
        title="Alias des phases"
        subtitle="Noms affichés pour chaque phase de jeu (valeur isGame) dans les filtres, graphiques et tableaux."
        icon={Activity}
        image="/banner-phases.jpg"
        currentHref="/settings/phase-labels"
        parent={{ href: '/settings', label: 'Plateforme' }}
        pills={[
          <>
            <span className="t-num">{PHASE_KEYS.length}</span> phases
          </>,
          'Réservé au SuperUser',
        ]}
      />

      <form onSubmit={handleSave} className="flex flex-col gap-5">
        {PHASE_GROUPS.map((group) => (
          <SectionCard key={group.id} id={group.id} icon={group.icon} title={group.title} meta={group.description}>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {group.keys.map((key) => {
                const type = phaseType(key)
                const defaultLabel = DEFAULT_PHASE_LABELS[key as PhaseKey]
                return (
                  <li
                    key={key}
                    className="app-panel-muted grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 px-3 py-2 sm:grid-cols-[3.5rem_8.5rem_minmax(0,1fr)_minmax(0,11rem)]"
                  >
                    <span className="t-num font-mono font-semibold text-gray-900">{key}</span>
                    <span>
                      <Tag tone={type.tone}>{type.label}</Tag>
                    </span>
                    <label className="col-span-2 sm:col-span-1">
                      <span className="sr-only">Alias de la phase {key}</span>
                      <input
                        type="text"
                        value={labels[key] ?? defaultLabel ?? ''}
                        maxLength={40}
                        onChange={(event) => setLabels((prev) => ({ ...prev, [key]: event.target.value }))}
                        className="app-input"
                        placeholder={defaultLabel}
                      />
                    </label>
                    <span className="t-meta col-span-2 truncate sm:col-span-1" title={defaultLabel}>
                      Par défaut : {defaultLabel}
                    </span>
                  </li>
                )
              })}
            </ul>
          </SectionCard>
        ))}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving} className="app-btn app-btn--md app-btn--primary">
            {saving ? 'Enregistrement…' : 'Enregistrer les alias'}
          </button>
          <button type="button" onClick={handleReset} disabled={saving} className="app-btn app-btn--md app-btn--secondary">
            Rétablir les valeurs par défaut
          </button>
          <FormFeedback error={error} success={success} />
        </div>
      </form>
    </div>
  )
}
