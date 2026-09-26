import Image from 'next/image'

import { DISTINCTION_BADGE_META, type DistinctionBadgeKey } from '@/lib/distinction-badges'

export type DistinctionStripItem = {
  key: DistinctionBadgeKey
  memberName: string
  value: string
}

/**
 * Bande « Distinctions » (docs/ui/composants-refonte.md, `DistinctionStrip`) : pastilles sur ordinateur,
 * cartes en défilement horizontal sur mobile. Icônes et libellés : `src/lib/distinction-badges.ts`.
 */
export default function DistinctionStrip({ items }: { items: DistinctionStripItem[] }) {
  if (items.length === 0) return null

  return (
    <section aria-label="Distinctions">
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">Distinctions</span>
        {items.map((item) => {
          const meta = DISTINCTION_BADGE_META[item.key]
          return (
            <span
              key={item.key}
              className="flex h-8 items-center gap-1.5 rounded-full border border-gray-200 bg-white py-0 pl-[5px] pr-3 text-[12.5px] text-gray-500"
            >
              <Image src={meta.iconPath} alt="" width={22} height={22} />
              {meta.shortLabel}
              <b className="font-semibold text-gray-900">{item.memberName}</b>
              {item.value ? <span className="text-xs tabular-nums text-gray-700">{item.value}</span> : null}
            </span>
          )
        })}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 md:hidden">
        {items.map((item) => {
          const meta = DISTINCTION_BADGE_META[item.key]
          return (
            <div key={item.key} className="app-panel w-[132px] shrink-0 p-2.5">
              <p className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <Image src={meta.iconPath} alt="" width={20} height={20} />
                {meta.shortLabel}
              </p>
              <p className="mt-1.5 truncate text-[13px] font-bold text-gray-900">{item.memberName}</p>
              {item.value ? <p className="text-xs tabular-nums text-gray-700">{item.value}</p> : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
