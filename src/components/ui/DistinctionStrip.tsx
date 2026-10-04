import Image from 'next/image'

import ChevronPager from '@/components/ui/ChevronPager'
import { DISTINCTION_BADGE_META, type DistinctionBadgeKey } from '@/lib/distinction-badges'

export type DistinctionStripItem = {
  key: DistinctionBadgeKey
  memberName: string
  value: string
}

/**
 * Bande « Distinctions » (docs/ui/composants-refonte.md, `DistinctionStrip`) : pastilles sur ordinateur, cartes sous
 * 768 px — paginées par chevrons sous 640 px (`ChevronPager`, 2 par page), à la ligne au-delà : jamais de défilement
 * horizontal (charte, « Rangée de cartes »). Icônes et libellés : `src/lib/distinction-badges.ts`.
 */
export default function DistinctionStrip({ items }: { items: DistinctionStripItem[] }) {
  if (items.length === 0) return null

  return (
    <section aria-label="Distinctions">
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <span className="t-label mr-1">Distinctions</span>
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
              {item.value ? <span className="t-num text-xs text-gray-700">{item.value}</span> : null}
            </span>
          )
        })}
      </div>

      <div className="flex flex-col gap-1.5 md:hidden">
        <span className="t-label">Distinctions</span>
        <ChevronPager
          ariaLabel="Pages · Distinctions"
          pageSize={2}
          items={items.map((item) => {
            const meta = DISTINCTION_BADGE_META[item.key]
            return {
              key: item.key,
              node: (
                <div className="app-panel min-w-0 flex-1 p-2.5 sm:w-[132px] sm:flex-none">
                  <p className="flex items-center gap-1.5 text-[11px] text-gray-500">
                    <Image src={meta.iconPath} alt="" width={20} height={20} />
                    <span className="truncate">{meta.shortLabel}</span>
                  </p>
                  <p className="mt-1.5 truncate text-[13px] font-bold text-gray-900">{item.memberName}</p>
                  {item.value ? <p className="t-num text-xs text-gray-700">{item.value}</p> : null}
                </div>
              ),
            }
          })}
        />
      </div>
    </section>
  )
}
