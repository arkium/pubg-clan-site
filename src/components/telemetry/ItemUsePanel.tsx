'use client'

import { useMemo } from 'react'

import ItemIcon from '@/components/ui/ItemIcon'
import { Skeleton } from '@/components/ui/Skeleton'
import SortableTh from '@/components/ui/SortableTh'
import { itemLabel } from '@/lib/clan-playstyle'
import { resolveItemName } from '@/lib/pubg-assets'
import type { ItemUseStats } from '@/lib/item-use-stats'

/**
 * Objets consommés (page `/members/[id]/items`). La période se choisit dans le bandeau de la page (`DockingToolbar` +
 * `PeriodFilter`, docs/TODO/sticky.md §4) : le panneau n'affiche que les résultats. Charte (2026-10-03) : KPI
 * `app-kpi` en Teko, couleurs de familles en jetons de jeu (`.game-ui`), tableau `app-table-shell`. Pendant un
 * rechargement, les résultats précédents restent affichés, estompés.
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

/** Couleurs de la charte : soins positif, boosts « en attente » (orange), carburant ciel, gadgets violet. */
const FAMILY_COLORS: Record<string, string> = {
  Heal: 'var(--game-pos)',
  Boost: 'var(--game-warn)',
  Fuel: 'var(--game-sky)',
  Gadget: 'var(--game-violet)',
  Unknown: 'var(--theme-ui-text-muted)',
}

const numberFormat = new Intl.NumberFormat('fr-FR')
const decimalFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
/** « 2,9 » ; une famille rare (1 jerrican en 46 matchs) affiche « < 0,1 », jamais « 0 ». */
const perMatchValue = (value: number) => (value > 0 && value < 0.05 ? '< 0,1' : decimalFormat.format(value))
const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' })
const formatShare = (value: number) => `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
const familyLabel = (subCategory: string) => FAMILY_LABELS[subCategory] ?? subCategory
/** Nom français de l'objet (« Trousse de soins »), comme le style de jeu du clan ; le dictionnaire PUBG en repli. */
const itemName = (itemId: string) => itemLabel(itemId, resolveItemName)
const familyColor = (subCategory: string) => FAMILY_COLORS[subCategory] ?? 'var(--theme-ui-text-muted)'

function FamilyDot({ subCategory }: { subCategory: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: familyColor(subCategory) }} aria-hidden="true" />
}

export default function ItemUsePanel({ stats, loading, error, scope }: ItemUsePanelProps) {
  const perMatch = useMemo(() => (stats && stats.matchCount > 0 ? stats.totalCount / stats.matchCount : 0), [stats])

  if (loading && !stats) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  if (error) return <p className="app-panel p-4 text-sm text-[var(--theme-ui-negative)]">{error}</p>
  if (!stats || stats.totalCount === 0) {
    return (
      <p className={`app-panel t-body p-6 text-center text-gray-500 transition-opacity ${loading ? 'opacity-60' : ''}`}>
        Aucun objet consommé enregistré sur cette période. Le détail par objet n’existe que pour les matchs analysés depuis le
        17/09/2026 : les matchs plus anciens ne peuvent pas être rattrapés, la télémétrie ne conserve pas ces événements en
        base.
      </p>
    )
  }

  const dominant = stats.families[0] ?? null

  return (
    <div aria-busy={loading} className={`flex flex-col gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
      <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <div className="app-panel app-kpi">
          <dt className="t-label">Objets consommés</dt>
          <dd className="t-hero t-hero--md text-gray-900">{numberFormat.format(stats.totalCount)}</dd>
          <dd className="t-meta">
            {numberFormat.format(stats.matchCount)} matchs analysés
            {/* Le détail par objet n'existe que depuis le 17/09/2026 : la date dit d'où partent les chiffres. */}
            {stats.dataStart ? ` depuis le ${dateFormat.format(new Date(stats.dataStart))}` : ''}
          </dd>
        </div>
        <div className="app-panel app-kpi">
          <dt className="t-label">Par match</dt>
          <dd className="t-hero t-hero--md text-gray-900">{perMatch.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</dd>
          <dd className="t-meta">toutes familles confondues</dd>
        </div>
        <div className="app-panel app-kpi col-span-2 sm:col-span-1">
          <dt className="t-label">Famille dominante</dt>
          <dd className="t-hero t-hero--md flex items-center gap-2 text-gray-900">
            {dominant ? <FamilyDot subCategory={dominant.subCategory} /> : null}
            {dominant ? familyLabel(dominant.subCategory) : '—'}
          </dd>
          <dd className="t-meta">{dominant ? `${formatShare(dominant.share)} des objets consommés` : 'aucune'}</dd>
        </div>
      </dl>

      <section aria-labelledby="item-families-title" className="app-panel flex flex-col gap-3 p-4">
        <h2 id="item-families-title" className="t-card-title">Répartition par famille</h2>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
          {stats.families.map((family) => (
            <div
              key={family.subCategory}
              style={{ width: `${family.share}%`, backgroundColor: familyColor(family.subCategory) }}
              title={`${familyLabel(family.subCategory)} : ${numberFormat.format(family.count)}`}
            />
          ))}
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Familles">
          {stats.families.map((family) => (
            <li key={family.subCategory} className="app-panel-muted flex flex-col gap-0.5 px-3 py-2">
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm text-gray-700">
                  <FamilyDot subCategory={family.subCategory} />
                  {familyLabel(family.subCategory)}
                </span>
                <span className="t-num text-sm font-semibold text-gray-900">
                  {numberFormat.format(family.count)} <span className="t-meta font-normal">({formatShare(family.share)})</span>
                </span>
              </span>
              {/* Moyenne par match analysé (même base que le « par match » des chiffres clés), en chiffre héros. */}
              <span className="flex items-baseline gap-1.5" data-testid="family-per-match">
                <b className="t-hero t-hero--sm text-gray-900">{stats.matchCount > 0 ? perMatchValue(family.count / stats.matchCount) : '—'}</b>
                <span className="t-meta">par match</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="item-top-title" className="app-panel flex flex-col gap-3 p-4">
        <h2 id="item-top-title" className="t-card-title">Objets les plus consommés</h2>

        {/* Mobile : cartes empilées (20 premières). Ordinateur : tableau complet, comme la page des armes. */}
        <ul className="flex flex-col gap-2 lg:hidden" aria-label="Objets les plus consommés">
          {stats.items.slice(0, 20).map((item) => (
            <li key={item.itemId} className="app-panel-muted flex items-center gap-3 p-3">
              <ItemIcon id={item.itemId} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{itemName(item.itemId)}</p>
                <p className="t-meta flex items-center gap-1.5">
                  <FamilyDot subCategory={item.subCategory} />
                  {familyLabel(item.subCategory)}
                </p>
              </div>
              <div className="t-num text-right">
                <p className="text-sm font-bold text-gray-900">{numberFormat.format(item.count)}</p>
                <p className="t-meta">{formatShare(item.share)}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="app-table-shell hidden overflow-hidden lg:block">
          <table className="w-full table-auto text-[13px]">
            <thead className="app-table-head">
              <tr>
                <SortableTh align="left" className="pl-3">Objet</SortableTh>
                <SortableTh align="left">Famille</SortableTh>
                <SortableTh>Utilisations</SortableTh>
                <SortableTh className="pr-3">Part</SortableTh>
              </tr>
            </thead>
            <tbody className="t-num">
              {stats.items.map((item) => (
                <tr key={item.itemId} className="app-table-row">
                  <td className="py-2 pl-3 pr-[9px]">
                    <span className="flex items-center gap-2">
                      <ItemIcon id={item.itemId} size="md" />
                      <span className="font-semibold text-gray-900">{itemName(item.itemId)}</span>
                    </span>
                  </td>
                  <td className="px-[9px] py-2 text-gray-700">
                    <span className="flex items-center gap-1.5">
                      <FamilyDot subCategory={item.subCategory} />
                      {familyLabel(item.subCategory)}
                    </span>
                  </td>
                  <td className="px-[9px] py-2 text-right font-semibold text-gray-900">{numberFormat.format(item.count)}</td>
                  <td className="py-2 pl-[9px] pr-3 text-right text-gray-700">{formatShare(item.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {scope === 'clan' && stats.members.length > 0 ? (
        <section aria-labelledby="item-members-title" className="app-panel flex flex-col gap-3 p-4">
          <h2 id="item-members-title" className="t-card-title">Par membre</h2>
          <div className="app-table-shell overflow-hidden">
            <table className="w-full table-auto text-[13px]">
              <thead className="app-table-head">
                <tr>
                  <SortableTh align="left" className="pl-3">Membre</SortableTh>
                  <SortableTh>Utilisations</SortableTh>
                  <SortableTh className="pr-3">Par match</SortableTh>
                </tr>
              </thead>
              <tbody className="t-num">
                {stats.members.map((member) => (
                  <tr key={member.memberId} className="app-table-row">
                    <td className="py-2 pl-3 pr-[9px] font-semibold text-gray-900">{member.displayName}</td>
                    <td className="px-[9px] py-2 text-right">{numberFormat.format(member.count)}</td>
                    <td className="py-2 pl-[9px] pr-3 text-right">{member.perMatch.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
