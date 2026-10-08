'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Search, Swords, Tags } from 'lucide-react'

import AdminPageBanner from '@/components/settings/AdminPageBanner'
import { ADMIN_PAGE_CLASS, AdminPageLoading, AdminPageRestricted, FormFeedback } from '@/components/settings/AdminPageStates'
import { EmptyState, SectionCard } from '@/components/ui/CharteKit'
import WeaponIcon from '@/components/ui/WeaponIcon'
import { useAuthSession } from '@/hooks/useAuthSession'

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

/**
 * Alias des armes PUBG, référentiel commun à la plateforme (SuperUser), selon la charte UI (docs/ui/index.html) :
 * bandeau photo, recherche, une ligne par arme (icône, clé PUBG, libellé affiché).
 */
export default function WeaponLabelsSettingsPage() {
  const router = useRouter()
  const { loading, authenticated, isSuperUser } = useAuthSession()

  const [labels, setLabels] = useState<WeaponLabels>({})
  const [saving, setSaving] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  // Référentiel commun à toute la plateforme : SuperUser seulement, comme l'API
  const canManageSettings = isSuperUser

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
          throw new Error('Impossible de charger les alias d’armes')
        }

        if (!cancelled) {
          setLabels(payload?.labels ?? {})
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les alias d’armes')
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

      const payload = (await response.json().catch(() => null)) as { error?: string; labels?: WeaponLabels } | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Échec de l’enregistrement')
      }

      setLabels(payload?.labels ?? labels)
      setSuccess('Alias d’armes enregistrés.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Échec de l’enregistrement')
    } finally {
      setSaving(false)
    }
  }

  if (loading || loadingData) {
    return <AdminPageLoading />
  }

  if (!authenticated) {
    return null
  }

  if (!canManageSettings) {
    return <AdminPageRestricted message="Cette page est réservée au SuperUser : les alias d’armes sont communs à toute la plateforme." />
  }

  return (
    <div className={ADMIN_PAGE_CLASS}>
      <AdminPageBanner
        title="Alias des armes"
        subtitle="Noms d’armes affichés dans les pages de télémétrie : clan, joueur, débriefing d’un match."
        icon={Swords}
        image="/banner-weapons.jpg"
        currentHref="/settings/weapon-labels"
        parent={{ href: '/settings', label: 'Plateforme' }}
        pills={[
          <>
            <span className="t-num">{orderedKeys.length}</span> armes
          </>,
          'Réservé au SuperUser',
        ]}
      />

      <form onSubmit={handleSave}>
        <SectionCard
          id="weapon-labels-title"
          icon={Tags}
          title="Libellés des armes"
          meta="La clé PUBG reste intacte ; seul le libellé affiché change. Laisser vide pour garder le nom par défaut."
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <label className="relative w-full sm:w-72">
              <span className="sr-only">Rechercher une arme</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="app-input pl-9"
                placeholder="WeapHK416_C, M416, fusil…"
              />
            </label>
            <span className="t-meta t-num">
              {filteredKeys.length} sur {orderedKeys.length}
            </span>
          </div>

          {filteredKeys.length === 0 ? (
            <EmptyState icon={Search} title="Aucune arme ne correspond à cette recherche" />
          ) : (
            <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
              {filteredKeys.map((weaponKey) => (
                <li key={weaponKey} className="app-panel-muted flex items-center gap-3 px-3 py-2">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center">
                    <WeaponIcon id={weaponKey} size="xl" />
                  </span>
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="t-meta truncate font-mono">{weaponKey}</span>
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
                      className="app-input"
                      placeholder={weaponKey}
                    />
                  </label>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving} className="app-btn app-btn--md app-btn--primary">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <FormFeedback error={error} success={success} />
          </div>
        </SectionCard>
      </form>
    </div>
  )
}
