/**
 * Escouade suivie par le Replay 2D quand le débriefing en choisit une autre que celle du clan consulté
 * (bande des escouades, vue tournoi). Le payload reste celui du serveur : on ne recalcule que `sq`.
 */

/** Couleurs d'escouade PUBG, attribuées dans l'ordre alphabétique des pseudos (la télémétrie ne donne pas le slot). */
export const PUBG_SQUAD_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#f97316'] as const

type FocusablePlayer = { i: number; n: string; team: number; sq: boolean }
type FocusableCrate = { sq: boolean; lteams?: number[] }
type FocusableReplay = {
  match: { clanTag: string | null }
  players: FocusablePlayer[]
  crates?: FocusableCrate[]
}

export function applyReplaySquadFocus<T extends FocusableReplay>(
  data: T,
  focusTeamId: number | null,
  focusTag: string | null = null
): T {
  if (focusTeamId === null) return data
  return {
    ...data,
    match: { ...data.match, clanTag: focusTag ?? data.match.clanTag },
    players: data.players.map((player) => ({ ...player, sq: player.team === focusTeamId })),
    // Payloads antérieurs à `lteams` (cache de 5 min) : on garde la valeur serveur.
    crates: data.crates?.map((crate) =>
      Array.isArray(crate.lteams) ? { ...crate, sq: crate.lteams.includes(focusTeamId) } : crate
    ),
  }
}

/** Couleur de chaque joueur de l'escouade suivie, par index de joueur. */
export function squadColorsByIndex(players: FocusablePlayer[]): Map<number, string> {
  const squad = players.filter((player) => player.sq).sort((left, right) => left.n.localeCompare(right.n))
  return new Map(squad.map((player, index) => [player.i, PUBG_SQUAD_COLORS[index % PUBG_SQUAD_COLORS.length]]))
}
