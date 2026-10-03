'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { formatCount } from '@/lib/weapons/armory'
import { WEAPON_CATEGORY_LABELS, type WeaponCategory } from '@/lib/weapons/weapon-categories'

export const ALL_ARSENAL_LABEL = "Tout l'arsenal"

/**
 * Sélecteur de catégorie de l'armurerie : chevrons ‹ ›, compteur « 3 / 11 », barre de progression cliquable et, sur
 * ordinateur, puces qui donnent les kills par catégorie. Le premier cran est « Tout l'arsenal » (`null`). État actif en
 * accent (refonte UI §6 bis).
 */
export default function ArmoryCategoryPager({
  categories,
  value,
  onChange,
  kills,
  totalKills,
  weaponCount,
}: {
  categories: readonly WeaponCategory[]
  value: WeaponCategory | null
  onChange: (next: WeaponCategory | null) => void
  kills: Record<WeaponCategory, number>
  totalKills: number
  /** Nombre d'armes de la catégorie affichée (ou de tout l'arsenal). */
  weaponCount: number
}) {
  const steps: Array<WeaponCategory | null> = [null, ...categories]
  const index = Math.max(0, steps.indexOf(value))
  const go = (offset: number) => onChange(steps[(index + offset + steps.length) % steps.length])
  const labelOf = (step: WeaponCategory | null) => (step ? WEAPON_CATEGORY_LABELS[step] : ALL_ARSENAL_LABEL)
  const killsOf = (step: WeaponCategory | null) => (step ? kills[step] : totalKills)

  return (
    <section className="app-panel overflow-hidden" aria-label="Catégorie d'armes">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 p-2.5 sm:gap-3.5 sm:px-3.5 sm:py-3">
        <button type="button" onClick={() => go(-1)} aria-label="Catégorie précédente" className="armory-pager-button">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3.5" aria-live="polite">
          <span className="armory-code-tag shrink-0 text-[13px] sm:text-base">{value ?? 'TOUTES'}</span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <b className="truncate text-base font-extrabold tracking-[-0.01em] text-gray-900 sm:text-[22px]">{labelOf(value)}</b>
            <span className="truncate text-xs tabular-nums text-gray-500">
              {formatCount(killsOf(value))} kills · {weaponCount} arme{weaponCount > 1 ? 's' : ''}
            </span>
          </div>
          {/* Sous 640 px, la barre de progression donne déjà la position : le titre garde la place. */}
          <span className="ml-auto shrink-0 text-xs font-bold tabular-nums text-gray-500 max-sm:hidden">
            {index + 1} / {steps.length}
          </span>
        </div>
        <button type="button" onClick={() => go(1)} aria-label="Catégorie suivante" className="armory-pager-button">
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex gap-[3px] px-2.5 pb-2.5 sm:px-3.5">
        {steps.map((step, stepIndex) => (
          <button
            key={step ?? 'all'}
            type="button"
            onClick={() => onChange(step)}
            title={labelOf(step)}
            aria-label={labelOf(step)}
            aria-current={stepIndex === index ? 'true' : undefined}
            className={`armory-progress-step ${stepIndex === index ? 'armory-progress-step--active' : ''}`}
          />
        ))}
      </div>

      <div className="hidden flex-wrap gap-1.5 border-t border-gray-200 px-3.5 pb-3 pt-2.5 sm:flex" role="group" aria-label="Catégories">
        {steps.map((step) => {
          const active = step === value
          return (
            <button
              key={step ?? 'all'}
              type="button"
              aria-pressed={active}
              title={labelOf(step)}
              onClick={() => onChange(step)}
              className={`app-sort-chip inline-flex items-center gap-1.5 rounded-[8px]! ${active ? 'app-sort-chip--active' : ''}`}
            >
              <b className="font-extrabold">{step ?? 'Toutes'}</b>
              <span className="tabular-nums opacity-75">{formatCount(killsOf(step))}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
