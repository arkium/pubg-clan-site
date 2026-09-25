'use client'

import { useMemo } from 'react'

import ItemIcon from '@/components/ui/ItemIcon'
import { Skeleton } from '@/components/ui/Skeleton'
import { resolveItemName } from '@/lib/pubg-assets'
import type { ItemUseStats } from '@/lib/item-use-stats'

/**
 * La période se choisit dans le bandeau de la page (`DockingToolbar` + `PeriodFilter`,
 * docs/TODO/sticky.md §4) : le panneau n'affiche que les résultats.
 */
type ItemUsePanelProps = {
  stats: ItemUseStats | null
  loading?: boolean
  error?: string
  scope: 'clan' | 'member'
}

/** Familles renvoyées par la télémétrie (`item.subCategory`). Une famille inconnue garde son libellé brut. */
const FAMILY_LABELS: Record<string, string> = {
  Heal: 'Soins',
  Boost: 'Boosts',
  Fuel: 'Carburant',
  Gadget: 'Gadgets',
  Unknown: 'Non classés',
}

const FAMILY_COLORS: Record<string, string> = {
  Heal: '#22c55e',
  Boost: '#f97316',
  Fuel: '#3b82f6',
  Gadget: '#a855f7',
  Unknown: '#94a3b8',
}

const numberFormat = new Intl.NumberFormat('fr-FR')
const formatShare = (value: number) => `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
const familyLabel = (subCategory: string) => FAMILY_LABELS[subCategory] ?? subCategory
const familyColor = (subCategory: string) => FAMILY_COLORS[subCategory] ?? '#64748b'

export default function ItemUsePanel({ stats, loading, error, scope }: ItemUsePanelProps) {
  const perMatch = useMemo(
    () => (stats && stats.matchCount > 0 ? stats.totalCount / stats.matchCount : 0),
    [stats]
  )

  return (
    <div className="space-y-5">
      {loading && !stats ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : error ? (
        <p className="text-sm text-rose-600">{error}</p>
      ) : !stats || stats.totalCount === 0 ? (
        <section className="app-panel p-4">
          <p className="text-sm text-gray-600">
            Aucun objet consommé enregistré sur cette période. Le détail par objet n’existe que pour les matchs
            analysés depuis le 2026-09-17 : les matchs plus anciens ne peuvent pas être rattrapés, la télémétrie ne
            conserve pas ces événements en base.
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="app-panel p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Objets consommés</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{numberFormat.format(stats.totalCount)}</p>
              <p className="text-xs text-gray-500">{numberFormat.format(stats.matchCount)} matchs analysés</p>
            </div>
            <div className="app-panel p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Par match</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {perMatch.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
              </p>
              <p className="text-xs text-gray-500">soins, boosts, carburant et gadgets confondus</p>
            </div>
            <div className="app-panel p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Famille dominante</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {stats.families[0] ? familyLabel(stats.families[0].subCategory) : 'N/D'}
              </p>
              <p className="text-xs text-gray-500">
                {stats.families[0] ? formatShare(stats.families[0].share) : '—'} des objets consommés
              </p>
            </div>
          </section>

          <section className="app-panel p-4">
            <h2 className="text-base font-semibold text-gray-900">Répartition par famille</h2>
            <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
              {stats.families.map((family) => (
                <div
                  key={family.subCategory}
                  style={{ width: `${family.share}%`, backgroundColor: familyColor(family.subCategory) }}
                  title={`${familyLabel(family.subCategory)} : ${numberFormat.format(family.count)}`}
                />
              ))}
            </div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {stats.families.map((family) => (
                <li key={family.subCategory} className="app-panel-muted flex items-center justify-between gap-2 p-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: familyColor(family.subCategory) }} />
                    <span className="text-gray-700">{familyLabel(family.subCategory)}</span>
                  </span>
                  <span className="tabular-nums text-gray-900">
                    {numberFormat.format(family.count)} <span className="text-xs text-gray-500">({formatShare(family.share)})</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="app-panel p-4">
            <h2 className="text-base font-semibold text-gray-900">Objets les plus consommés</h2>

            {/* Mobile : cartes empilées. Desktop : tableau, comme la page des armes. */}
            <ul className="mt-3 space-y-2 lg:hidden">
              {stats.items.slice(0, 20).map((item) => (
                <li key={item.itemId} className="app-panel-muted flex items-center gap-3 p-3">
                  <ItemIcon id={item.itemId} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{resolveItemName(item.itemId)}</p>
                    <p className="text-xs text-gray-500">{familyLabel(item.subCategory)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-gray-900">{numberFormat.format(item.count)}</p>
                    <p className="text-xs text-gray-500">{formatShare(item.share)}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="app-table-shell mt-3 hidden overflow-x-auto lg:block">
              <table className="min-w-full text-sm">
                <thead className="app-table-head">
                  <tr>
                    <th className="px-3 py-2 text-left">Objet</th>
                    <th className="px-3 py-2 text-left">Famille</th>
                    <th className="px-3 py-2 text-right">Utilisations</th>
                    <th className="px-3 py-2 text-right">Part</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.items.map((item) => (
                    <tr key={item.itemId} className="app-table-row">
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          <ItemIcon id={item.itemId} size="md" />
                          <span className="font-medium text-gray-900">{resolveItemName(item.itemId)}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{familyLabel(item.subCategory)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{numberFormat.format(item.count)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatShare(item.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {scope === 'clan' && stats.members.length > 0 ? (
            <section className="app-panel p-4">
              <h2 className="text-base font-semibold text-gray-900">Par membre</h2>
              <div className="app-table-shell mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="app-table-head">
                    <tr>
                      <th className="px-3 py-2 text-left">Membre</th>
                      <th className="px-3 py-2 text-right">Utilisations</th>
                      <th className="px-3 py-2 text-right">Par match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.members.map((member) => (
                      <tr key={member.memberId} className="app-table-row">
                        <td className="px-3 py-2 font-medium text-gray-900">{member.displayName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{numberFormat.format(member.count)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {member.perMatch.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
