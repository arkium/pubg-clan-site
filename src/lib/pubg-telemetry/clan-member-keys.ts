/**
 * Clés (compte PUBG et pseudo, en minuscules) des membres suivis d'un match, transmises au parser.
 *
 * Elles ne servent qu'à calculer les zones de tirs et de dégâts de ces joueurs. Les trois chemins de
 * synchronisation (stream automatique, « Resync ce match », fichier local) doivent les fournir, sans quoi
 * `shotSamples` et `damageSamples` restent vides.
 */
export function buildClanMemberKeys(
  members: ReadonlyArray<{ pubgAccountId: string | null; pubgPlayerName: string | null }>
): Set<string> | undefined {
  const keys = new Set<string>()
  for (const member of members) {
    if (member.pubgAccountId) keys.add(member.pubgAccountId.toLowerCase())
    if (member.pubgPlayerName) keys.add(member.pubgPlayerName.toLowerCase())
  }
  return keys.size > 0 ? keys : undefined
}
