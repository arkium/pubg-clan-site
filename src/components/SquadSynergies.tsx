import Image from 'next/image'

import type { SquadSynergiesData } from '@/types/squad-matches'

interface SquadSynergiesProps {
  synergies: SquadSynergiesData
}

function formatWinRate(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function getTeamSizeMeta(memberCount: number) {
  if (memberCount <= 2) {
    return {
      label: 'Duo',
      iconPath: '/icons/squads/duo.svg',
      tone: 'bg-sky-100 text-sky-700',
    }
  }

  if (memberCount === 3) {
    return {
      label: 'Trio',
      iconPath: '/icons/squads/trio.svg',
      tone: 'bg-violet-100 text-violet-700',
    }
  }

  return {
    label: 'Squad',
    iconPath: '/icons/squads/squad.svg',
    tone: 'bg-emerald-100 text-emerald-700',
  }
}

function SynergyList({
  title,
  entries,
}: {
  title: string
  entries: SquadSynergiesData['topPairs']
}) {
  return (
    <div className="rounded border border-gray-200 p-3">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-xs text-gray-600">Pas encore assez de données.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => {
            const team = getTeamSizeMeta(entry.memberNames.length)

            return (
              <li key={entry.memberIds.join(':')} className="text-xs text-gray-700">
                <div className="mb-1 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold ${team.tone}`}>
                    <Image src={team.iconPath} alt={`${team.label} icon`} width={16} height={16} />
                    <span>{team.label}</span>
                  </span>
                </div>
                <p className="font-medium text-gray-900">{entry.memberNames.join(' + ')}</p>
                <p>
                  {entry.matchesPlayed} matchs · {entry.totalKills} éliminations · {formatWinRate(entry.winRate)}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default function SquadSynergies({ synergies }: SquadSynergiesProps) {
  return (
    <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Synergies</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <SynergyList title="Meilleurs binômes" entries={synergies.topPairs} />
        <SynergyList title="Meilleurs squads (3-4 joueurs)" entries={synergies.topSquads} />
      </div>
    </section>
  )
}
