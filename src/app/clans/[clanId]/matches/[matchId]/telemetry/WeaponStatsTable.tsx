'use client'

import { useState, useMemo } from 'react'
import WeaponIcon from '@/components/ui/WeaponIcon'
import { getWeaponCategory } from '@/lib/weapons/weapon-categories'

export type WeaponStat = {
  weaponName: string
  kills: number
  headshots: number
  damageDealt: number
}

function displayWeaponName(weaponName: string, labels?: Record<string, string>) {
  if (labels && labels[weaponName]) {
    return labels[weaponName]
  }
  return weaponName
}

export function WeaponStatsTable({
  weaponStats,
  weaponLabels,
}: {
  weaponStats: WeaponStat[]
  weaponLabels?: Record<string, string>
}) {
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState<keyof WeaponStat | 'category'>('kills')
  const [sortDesc, setSortDesc] = useState(true)
  const [page, setPage] = useState(1)
  const pageSize = 10

  const filteredAndSorted = useMemo(() => {
    let result = weaponStats

    if (search.trim()) {
      const lowerSearch = search.toLowerCase()
      result = result.filter((w) => {
        const name = displayWeaponName(w.weaponName, weaponLabels).toLowerCase()
        const category = getWeaponCategory(name).toLowerCase()
        return name.includes(lowerSearch) || category.includes(lowerSearch)
      })
    }

    result = [...result].sort((a, b) => {
      const nameA = displayWeaponName(a.weaponName, weaponLabels)
      const nameB = displayWeaponName(b.weaponName, weaponLabels)
      
      let valA: string | number = a[sortCol as keyof WeaponStat]
      let valB: string | number = b[sortCol as keyof WeaponStat]

      if (sortCol === 'weaponName') {
        valA = nameA
        valB = nameB
      } else if (sortCol === 'category') {
        valA = getWeaponCategory(nameA)
        valB = getWeaponCategory(nameB)
      }

      if (valA < valB) return sortDesc ? 1 : -1
      if (valA > valB) return sortDesc ? -1 : 1
      return 0
    })

    return result
  }, [weaponStats, weaponLabels, search, sortCol, sortDesc])

  const totalPages = Math.ceil(filteredAndSorted.length / pageSize)
  const paginated = filteredAndSorted.slice((page - 1) * pageSize, page * pageSize)

  const handleSort = (col: keyof WeaponStat | 'category') => {
    if (sortCol === col) {
      setSortDesc(!sortDesc)
    } else {
      setSortCol(col)
      setSortDesc(true)
    }
    setPage(1)
  }

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <input
          type="text"
          placeholder="Filtrer par arme ou categorie..."
          value={search}
          onChange={handleSearch}
          className="w-full sm:w-64 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="text-sm text-slate-500">
          {filteredAndSorted.length} arme(s)
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th
                className="cursor-pointer select-none px-3 py-2 hover:bg-slate-100"
                onClick={() => handleSort('weaponName')}
              >
                Arme {sortCol === 'weaponName' ? (sortDesc ? '↓' : '↑') : ''}
              </th>
              <th
                className="cursor-pointer select-none px-3 py-2 hover:bg-slate-100"
                onClick={() => handleSort('category')}
              >
                Categorie {sortCol === 'category' ? (sortDesc ? '↓' : '↑') : ''}
              </th>
              <th
                className="cursor-pointer select-none px-3 py-2 text-right hover:bg-slate-100"
                onClick={() => handleSort('kills')}
              >
                Kills {sortCol === 'kills' ? (sortDesc ? '↓' : '↑') : ''}
              </th>
              <th
                className="cursor-pointer select-none px-3 py-2 text-right hover:bg-slate-100"
                onClick={() => handleSort('headshots')}
              >
                Headshots {sortCol === 'headshots' ? (sortDesc ? '↓' : '↑') : ''}
              </th>
              <th
                className="cursor-pointer select-none px-3 py-2 text-right hover:bg-slate-100"
                onClick={() => handleSort('damageDealt')}
              >
                Damage {sortCol === 'damageDealt' ? (sortDesc ? '↓' : '↑') : ''}
              </th>
            </tr>
          </thead>
          <tbody className="">
            {paginated.map((weapon) => {
              const displayName = displayWeaponName(weapon.weaponName, weaponLabels)
              const category = getWeaponCategory(displayName)
              return (
                <tr key={weapon.weaponName} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      <WeaponIcon id={weapon.weaponName} label={displayName} size="sm" />
                      {displayName}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 border border-slate-200">
                      {category}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {weapon.kills}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {weapon.headshots}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                    {Math.round(weapon.damageDealt)}
                  </td>
                </tr>
              )
            })}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                  Aucune arme trouvee
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 pt-3">
          <div className="text-sm text-slate-500">
            Page <span className="font-medium text-slate-900">{page}</span> sur{' '}
            <span className="font-medium text-slate-900">{totalPages}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Precedent
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
