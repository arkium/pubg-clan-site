'use client'

import { useEffect, useState } from 'react'

import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import Pagination from '@/components/ui/Pagination'
import SegmentedControl from '@/components/ui/SegmentedControl'
import type { AdminActionPage, AdminActionRow } from '@/lib/admin-action-log'

/**
 * Journal des actions d'administration (docs/TODO/administration.md Q10) : qui a fait quoi, sur quel clan, avec quel
 * résultat. Une ligne par écriture d'une route d'administration ; les refus et les simulations n'y sont pas. Conservé
 * 12 mois.
 */

type OutcomeFilter = 'all' | 'success' | 'error'

const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Europe/Paris' })

/** Le clan a sa propre colonne : l'action se lit sans le préfixe de l'adresse du clan. */
function actionLabel(action: string) {
  return action.replace(/^clans\/\[clanId\]\//, '')
}

function SummaryLine({ row }: { row: AdminActionRow }) {
  const parts = [
    ...Object.entries(row.summary?.params ?? {}).map(([key, value]) => `${key} ${value}`),
    ...Object.entries(row.summary?.result ?? {}).map(([key, value]) => `${key} : ${String(value)}`),
  ]
  if (parts.length === 0 && !row.summary?.error) return null
  return (
    <p className="text-xs text-gray-500">
      {parts.join(' · ')}
      {row.summary?.error ? <span className="block text-red-600">{row.summary.error}</span> : null}
    </p>
  )
}

export default function AdminJournalPage() {
  const [clanId, setClanId] = useState('')
  const [userId, setUserId] = useState('')
  const [outcome, setOutcome] = useState<OutcomeFilter>('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<AdminActionPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ page: String(page) })
    if (clanId) params.set('clanId', clanId)
    if (userId) params.set('userId', userId)
    if (outcome !== 'all') params.set('outcome', outcome)

    fetch(`/api/settings/admin-actions?${params}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as (AdminActionPage & { error?: string }) | null
        if (!response.ok || !payload) throw new Error(payload?.error ?? `HTTP ${response.status}`)
        setData(payload)
        setError('')
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return
        setError(caught instanceof Error ? caught.message : 'Chargement impossible.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [clanId, userId, outcome, page])

  function changeFilter(apply: () => void) {
    setLoading(true)
    setPage(1)
    apply()
  }

  const pageCount = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <main className="app-container app-main flex-1 space-y-4">
      <NavigationTrail
        currentLabel="Journal d’administration"
        currentHref="/settings/journal"
        fallbackParent={{ href: '/settings', label: 'Plateforme' }}
      />
      <section className="app-panel space-y-4 p-4 sm:p-6">
        <SettingsPageHeader
          title="Journal d’administration"
          subtitle="Chaque écriture d’un outil d’administration : qui, quel clan, quel résultat. Les refus et les simulations n’y figurent pas ; les lignes de plus de 12 mois sont purgées chaque nuit."
        />
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="space-y-1 text-xs font-semibold text-gray-500">
            <span>Clan</span>
            <select className="app-input" value={clanId} onChange={(event) => changeFilter(() => setClanId(event.target.value))}>
              <option value="">Tous</option>
              {data?.clans.map((clan) => (
                <option key={clan.id} value={clan.id}>
                  {clan.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-semibold text-gray-500">
            <span>Compte</span>
            <select className="app-input" value={userId} onChange={(event) => changeFilter(() => setUserId(event.target.value))}>
              <option value="">Tous</option>
              {data?.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.label}
                </option>
              ))}
            </select>
          </label>
          <SegmentedControl<OutcomeFilter>
            value={outcome}
            onChange={(value) => changeFilter(() => setOutcome(value))}
            options={[
              { value: 'all', label: 'Tous' },
              { value: 'success', label: 'Réussites' },
              { value: 'error', label: 'Erreurs' },
            ]}
          />
        </div>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {!data ? (
        loading ? <p className="text-sm text-gray-500">Chargement…</p> : null
      ) : data.rows.length === 0 ? (
        <section className="app-panel-muted p-6 text-center text-sm text-gray-500">Aucune action enregistrée.</section>
      ) : (
        // Rechargement : la page précédente reste affichée, estompée.
        <div aria-busy={loading} className={loading ? 'space-y-4 opacity-60' : 'space-y-4'}>
          <ul className="app-panel divide-y divide-gray-200">
            {data.rows.map((row) => (
              <li key={row.id} className="space-y-1 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 break-all text-sm font-semibold text-gray-900">
                    <span className="mr-2 text-xs font-bold text-gray-500">{row.method}</span>
                    {actionLabel(row.action)}
                  </p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                      row.outcome === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-red-200 bg-red-50 text-red-800'
                    }`}
                  >
                    {row.outcome === 'success' ? 'Réussie' : `Erreur ${row.status}`}
                  </span>
                </div>
                <p className="text-xs text-gray-600">
                  {dateTimeFormat.format(new Date(row.createdAt))}
                  {' · '}
                  {row.memberName ?? row.userLabel ?? (row.userId ? `Compte #${row.userId}` : 'Compte inconnu')}
                  {row.isSuperUser ? ' (SuperUser)' : ''}
                  {row.clanId ? ` · ${row.clanName ?? `Clan #${row.clanId}`}` : ''}
                </p>
                <SummaryLine row={row} />
              </li>
            ))}
          </ul>
          <Pagination
            page={data.page}
            pageCount={pageCount}
            total={data.total}
            pageSize={data.pageSize}
            onPageChange={(next) => {
              setLoading(true)
              setPage(next)
            }}
            ariaLabel="Pages du journal"
            itemLabel="Actions"
          />
        </div>
      )}
    </main>
  )
}
