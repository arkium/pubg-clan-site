'use client'

import { useMemo } from 'react'

import { usePageData } from '@/hooks/usePageData'
import { dominantStylesByMember, rosterRole, type RosterRoleId } from '@/lib/member-roster'
import type { StandardPeriod } from '@/lib/period'

type PlaystyleScoresRow = { memberId: number; aggressionScore: number; supportScore: number; zoneDisciplineScore: number }

const pickRows = (payload: unknown) => (payload as { rows?: PlaystyleScoresRow[] } | null)?.rows ?? null
const NO_STYLES = new Map<number, RosterRoleId>()

/**
 * Couleur de pastille d'un joueur sur les pages à carte : son style de jeu dominant **sur la période affichée**
 * (Fragger, Medic, Ghost — couleurs de la liste des membres), lu dans le style de jeu du clan. Sans télémétrie sur la
 * période, ou sans accès au style de jeu du clan : `null`, la pastille reste neutre.
 */
export function usePlaystyleColors(clanId: number | null, period: StandardPeriod) {
  const { data } = usePageData(clanId ? `/api/clans/${clanId}/telemetry/playstyle?period=${period}` : null, pickRows)
  const styles = useMemo(() => (data ? dominantStylesByMember(data) : NO_STYLES), [data])
  return useMemo(
    () => ({
      styleOf: (memberId: number) => styles.get(memberId) ?? null,
      colorOf: (memberId: number) => {
        const style = styles.get(memberId)
        return style ? rosterRole(style).color : null
      },
    }),
    [styles]
  )
}
