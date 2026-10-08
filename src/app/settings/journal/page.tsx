'use client'

import { useEffect, useState } from 'react'
import { ScrollText } from 'lucide-react'

import AdminPageBanner from '@/components/settings/AdminPageBanner'
import { ADMIN_PAGE_CLASS, FormFeedback } from '@/components/settings/AdminPageStates'
import { ChoiceMenu, EmptyState, ListSkeleton, Tag } from '@/components/ui/CharteKit'
import Pagination from '@/components/ui/Pagination'
import SegmentedControl from '@/components/ui/SegmentedControl'
import type { AdminActionPage, AdminActionRow } from '@/lib/admin-action-log'

/**
 * Journal des actions d'administration (docs/TODO/administration.md Q10) : qui a fait quoi, sur quel clan, avec quel
 * résultat. Une ligne par écriture d'une route d'administration ; les refus et les simulations n'y sont pas. Conservé
 * 12 mois. Selon la charte UI (docs/ui/index.html) : bandeau photo, filtres en menus de la charte, résultat en pastille.
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
    <p className="t-meta m-0 break-all">
      {parts.join(' · ')}
      {row.summary?.error ? <span className="t-neg block">{row.summary.error}</span> : null}
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
  const clanOptions = [{ value: '', label: 'Tous les clans' }, ...(data?.clans ?? []).map((clan) => ({ value: String(clan.id), label: clan.name }))]
  const userOptions = [{ value: '', label: 'Tous les comptes' }, ...(data?.users ?? []).map((user) => ({ value: String(user.id), label: user.label }))]

  return (
    <div className={ADMIN_PAGE_CLASS}>
      <AdminPageBanner
        title="Journal d’administration"
        subtitle="Chaque écriture d’un outil d’administration : qui, quel clan, quel résultat. Sans les refus ni les simulations ; purgé au-delà de 12 mois."
        icon={ScrollText}
        image="/matchesplayer.jpg"
        currentHref="/settings/journal"
        parent={{ href: '/settings', label: 'Plateforme' }}
        pills={[
          ...(data
            ? [
                <>
                  <span className="t-num">{data.total.toLocaleString('fr-FR')}</span> actions
                </>,
              ]
            : []),
          'Réservé au SuperUser',
        ]}
      />

      <div className="app-panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <div className="flex flex-col gap-1">
          <span className="t-label">Clan</span>
          <ChoiceMenu<string> label="Clan" value={clanId} onChange={(value) => changeFilter(() => setClanId(value))} options={clanOptions} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="t-label">Compte</span>
          <ChoiceMenu<string> label="Compte" value={userId} onChange={(value) => changeFilter(() => setUserId(value))} options={userOptions} />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
          <span className="t-label">Résultat</span>
          <SegmentedControl<OutcomeFilter>
            size="sm"
            value={outcome}
            onChange={(value) => changeFilter(() => setOutcome(value))}
            options={[
              { value: 'all', label: 'Tous' },
              { value: 'success', label: 'Réussites' },
              { value: 'error', label: 'Erreurs' },
            ]}
          />
        </div>
      </div>

      <FormFeedback error={error} />

      {!data ? (
        loading ? <ListSkeleton rows={5} /> : null
      ) : data.rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="Aucune action enregistrée" />
      ) : (
        // Rechargement : la page précédente reste affichée, estompée.
        <div aria-busy={loading} className={`flex flex-col gap-4 ${loading ? 'opacity-60 transition-opacity' : ''}`}>
          <ul className="app-panel m-0 list-none divide-y divide-gray-200 p-0">
            {data.rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="m-0 flex min-w-0 items-center gap-2 break-all text-sm font-semibold text-gray-900">
                    <Tag tone="neutral">
                      <span className="font-mono">{row.method}</span>
                    </Tag>
                    {actionLabel(row.action)}
                  </p>
                  <Tag tone={row.outcome === 'success' ? 'pos' : 'neg'}>{row.outcome === 'success' ? 'Réussie' : `Erreur ${row.status}`}</Tag>
                </div>
                <p className="t-meta m-0">
                  {dateTimeFormat.format(new Date(row.createdAt))}
                  {' · '}
                  <span className="font-semibold text-gray-700">
                    {row.memberName ?? row.userLabel ?? (row.userId ? `Compte #${row.userId}` : 'Compte inconnu')}
                  </span>
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
    </div>
  )
}
