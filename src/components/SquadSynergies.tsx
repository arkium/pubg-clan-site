import TeamModeBadge, { teamModeFromMemberCount } from '@/components/ui/TeamModeBadge'
import PlayerNameBadge from '@/components/ui/PlayerNameBadge'

import type { SquadSynergiesData } from '@/types/squad-matches'

interface SquadSynergiesProps {
  synergies: SquadSynergiesData
}

function formatWinRate(value: number) {
  return `${(value * 100).toFixed(1)}%`
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
            const teamMode = teamModeFromMemberCount(entry.memberNames.length)

            return (
              <li key={entry.memberIds.join(':')} className="text-xs text-gray-700">
                <div className="mb-1 flex items-center gap-2">
                  <TeamModeBadge mode={teamMode} className="shadow-none" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {entry.memberNames.map((memberName) => (
                    <PlayerNameBadge key={`${entry.memberIds.join(':')}:${memberName}`} name={memberName} />
                  ))}
                </div>
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
