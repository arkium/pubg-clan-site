import Link from 'next/link'

import {
  getWeaponCategoryAliases,
  type WeaponCategory,
} from '@/lib/weapons/weapon-categories'

type PageProps = {
  params: Promise<{ clanId: string }>
}

const CATEGORY_ORDER: WeaponCategory[] = [
  'AR',
  'DMR',
  'SR',
  'SMG',
  'LMG',
  'SG',
  'PISTOL',
  'MELEE',
  'THROWABLE',
  'SPECIAL',
  'OTHER',
]

export default async function WeaponCategoryAliasesPage({ params }: PageProps) {
  const { clanId } = await params
  const entries = getWeaponCategoryAliases()

  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    items: entries.filter((entry) => entry.category === category),
  })).filter((group) => group.items.length > 0)

  return (
    <main className="app-container app-main mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Armes</p>
          <h1 className="text-2xl font-bold text-gray-900">Alias des categories</h1>
        </div>
        <Link
          href={`/clans/${clanId}/stats/weapons`}
          className="app-button app-button-ghost app-button-sm"
        >
          Retour stats armes
        </Link>
      </header>

      <section className="app-panel space-y-4 p-4">
        <p className="text-sm text-gray-500">
          Cette page liste le mapping utilise pour classer les armes par categorie.
        </p>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {grouped.map((group) => (
            <article key={group.category} className="app-panel-muted space-y-3 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900">
                {group.category}
              </h2>

              <ul className="space-y-2">
                {group.items.map((entry) => (
                  <li key={entry.key} className="rounded border border-gray-200 px-3 py-2">
                    <p className="text-sm font-semibold text-gray-900">{entry.key}</p>
                    <p className="text-xs text-gray-500">{entry.aliases.join(' | ')}</p>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
