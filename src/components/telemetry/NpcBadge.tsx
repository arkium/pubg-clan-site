import type { ReactNode } from 'react'

import { NPC_LABELS, npcKindOf } from '@/lib/pubg-telemetry/debrief-view'

/**
 * Nom d'un combattant du kill-feed : un bot (`ai.1042`) ou un ours (`monster.bear-02`) s'affiche en badge (« Bot »,
 * « Ours »), jamais par son identifiant technique ; un joueur garde son nom (`children`). Classes : `.app-npc-badge`.
 */
export function CombatantName({ name, children }: { name: string; children: ReactNode }) {
  const kind = npcKindOf(name)
  if (!kind) return <>{children}</>
  return (
    <span className={`app-npc-badge ${kind === 'bot' ? 'app-npc-badge--bot' : 'app-npc-badge--animal'}`} title={`${NPC_LABELS[kind]} (${name})`}>
      {NPC_LABELS[kind]}
    </span>
  )
}
