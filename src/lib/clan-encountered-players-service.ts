import { Prisma } from '@prisma/client'

import {
  ENCOUNTERED_PLAYER_MAX_RESOLVE_ATTEMPTS,
  ENCOUNTERED_PLAYER_MIN_ENCOUNTERS_BEFORE_RESOLUTION,
} from '@/lib/encountered-player-resolution-constants'
import { deriveEncounteredPlayerStatus } from '@/lib/encountered-player-status'
import { prisma } from '@/lib/prisma'
import { getPeriodStart } from '@/lib/period'

export type EncounterPeriod = 'week' | 'month' | 'all'

// Nombre de joueurs renvoyés dans la liste détaillée. Les agrégats
// (summary, rivalClans) sont eux calculés sur l'ensemble filtré complet,
// indépendamment de cette limite — voir diagnostic du 2026-08-09.
export const PLAYERS_LIST_LIMIT = 300

type Count = bigint | number | string | null
/** Un groupe par clan PUBG (`tag` nul : joueur sans clan connu) — résumé et clans rivaux en un seul passage. */
type ClanGroupRow = {
  tag: string | null
  name: string | null
  players: Count
  resolved: Count
  teammates: Count
  rivalPlayers: Count
  opponentEncounters: Count
  killedByClan: Count
  killedMember: Count
  lastSeenAt: Date | null
}
type PlayerRow = {
  id: string
  pubgAccountId: string
  pubgPlayerName: string
  pubgClanTag: string | null
  pubgClanName: string | null
  clanResolvedAt: Date | null
  encounterCount: number
  teammateEncounterCount: number
  resolveAttempts: number
  firstSeenAt: Date
  lastSeenAt: Date
}

const toNumber = (value: Count | undefined) => Number(value ?? 0)

/**
 * Adversaires croisés par un clan (page /clans/[clanId]/stats/opponents). Depuis le 2026-10-20, lus dans
 * `ClanEncounter` (une ligne par clan et par joueur) joint à l'identité globale `Player` et à son clan `OpponentClan`,
 * agrégés par la base : la route chargeait auparavant toutes les lignes EncounteredPlayer du clan (jusqu'à 300 000)
 * pour les agréger en mémoire (fin d'EncounteredPlayer, docs/TODO/inventaire-2026-10-20.md §2.A).
 */
export async function loadClanEncounteredPlayers(clanId: number, period: EncounterPeriod) {
  // `getPeriodStart` (src/lib/period.ts) : semaine et mois calendaires, comme les autres pages.
  const periodStart = getPeriodStart(period)
  // Filtre sur la dernière rencontre, pas un compteur recalculé sur la période : encounterCount reste le cumul total.
  const periodFilter = periodStart ? Prisma.sql`AND ce.lastSeenAt >= ${periodStart}` : Prisma.empty

  // Croisé avec le kill-feed (KillEvent) : qui a déjà été tué par le clan, et qui a déjà tué un membre du clan — ne
  // couvre que les matchs synchronisés depuis le déploiement du kill-feed, pas d'historique complet.
  const killedByClan = Prisma.sql`
    SELECT victimAccountId AS accountId, COUNT(*) AS kills FROM KillEvent
     WHERE clanId = ${clanId} AND killerMemberId IS NOT NULL AND victimAccountId NOT LIKE 'ai.%'
     GROUP BY victimAccountId`
  const killedClanMember = Prisma.sql`
    SELECT killerAccountId AS accountId, COUNT(*) AS kills FROM KillEvent
     WHERE clanId = ${clanId} AND victimMemberId IS NOT NULL AND killerAccountId NOT LIKE 'ai.%'
     GROUP BY killerAccountId`

  // Un seul passage sur les lignes du clan, groupées par clan PUBG : le résumé est la somme des groupes, les clans
  // rivaux en sont les groupes nommés (mesuré le 2026-10-20 : 8,5 à 15 s pour les deux plus gros clans, 300 000
  // lignes, contre 9 à 19 s pour l'ancienne lecture plus son agrégation en mémoire ; < 0,3 s pour un clan ordinaire).
  // Un coéquipier occasionnel (même roster qu'un membre suivi) n'est pas un rival — seuls les croisements en tant
  // qu'adversaire réel comptent pour un clan rival, sinon le clan d'un ami qui joue parfois avec nous polluerait ce
  // classement.
  const [clanGroups, playerRows, killTotals, clanMembers] = await Promise.all([
    prisma.$queryRaw<ClanGroupRow[]>`
      SELECT oc.tag AS tag, MAX(oc.name) AS name, COUNT(*) AS players,
             SUM(p.clanResolvedAt IS NOT NULL) AS resolved,
             SUM(ce.teammateEncounterCount > 0) AS teammates,
             SUM(ce.encounterCount > ce.teammateEncounterCount) AS rivalPlayers,
             SUM(GREATEST(ce.encounterCount - ce.teammateEncounterCount, 0)) AS opponentEncounters,
             SUM(IF(ce.encounterCount > ce.teammateEncounterCount, COALESCE(kb.kills, 0), 0)) AS killedByClan,
             SUM(IF(ce.encounterCount > ce.teammateEncounterCount, COALESCE(km.kills, 0), 0)) AS killedMember,
             MAX(IF(ce.encounterCount > ce.teammateEncounterCount, ce.lastSeenAt, NULL)) AS lastSeenAt
        FROM ClanEncounter ce
        JOIN Player p ON p.id = ce.playerId
        LEFT JOIN OpponentClan oc ON oc.id = p.opponentClanId
        LEFT JOIN (${killedByClan}) kb ON kb.accountId = p.pubgAccountId
        LEFT JOIN (${killedClanMember}) km ON km.accountId = p.pubgAccountId
       WHERE ce.clanId = ${clanId} ${periodFilter}
       GROUP BY oc.tag`,
    // Index (clanId, encounterCount) : la base s'arrête aux 300 premières lignes de la période.
    prisma.$queryRaw<PlayerRow[]>`
      SELECT ce.id AS id, p.pubgAccountId AS pubgAccountId, p.pubgPlayerName AS pubgPlayerName,
             oc.tag AS pubgClanTag, oc.name AS pubgClanName, p.clanResolvedAt AS clanResolvedAt,
             ce.encounterCount AS encounterCount, ce.teammateEncounterCount AS teammateEncounterCount,
             p.resolveAttempts AS resolveAttempts, ce.firstSeenAt AS firstSeenAt, ce.lastSeenAt AS lastSeenAt
        FROM ClanEncounter ce
        JOIN Player p ON p.id = ce.playerId
        LEFT JOIN OpponentClan oc ON oc.id = p.opponentClanId
       WHERE ce.clanId = ${clanId} ${periodFilter}
       ORDER BY ce.encounterCount DESC, ce.lastSeenAt DESC
       LIMIT ${PLAYERS_LIST_LIMIT}`,
    prisma.$queryRaw<Array<{ side: string; players: bigint | number; kills: bigint | number | null }>>`
      SELECT 'byClan' AS side, COUNT(*) AS players, SUM(kills) AS kills FROM (${killedByClan}) kb
      UNION ALL
      SELECT 'byOpponent' AS side, COUNT(*) AS players, SUM(kills) AS kills FROM (${killedClanMember}) km`,
    prisma.clanMember.findMany({ where: { clanId: clanId }, select: { id: true } }),
  ])

  // Kills par compte, pour les lignes affichées seulement (au plus 300 comptes).
  const shownAccountIds = playerRows.map((row) => row.pubgAccountId)
  const [shownKilledByClan, shownKilledMember] = shownAccountIds.length
    ? await Promise.all([
        prisma.killEvent.groupBy({
          by: ['victimAccountId'],
          where: { clanId: clanId, killerMemberId: { not: null }, victimAccountId: { in: shownAccountIds } },
          _count: { _all: true },
        }),
        prisma.killEvent.groupBy({
          by: ['killerAccountId'],
          where: { clanId: clanId, victimMemberId: { not: null }, killerAccountId: { in: shownAccountIds } },
          _count: { _all: true },
        }),
      ])
    : [[], []]
  const killedByClanCounts = new Map(shownKilledByClan.map((group) => [group.victimAccountId as string, group._count._all]))
  const killedClanMemberCounts = new Map(shownKilledMember.map((group) => [group.killerAccountId as string, group._count._all]))

  // Une vraie partie synchronisée génère une ligne Match par membre tracké
  // qui y a joué — un match croisé par plusieurs membres du clan compte donc
  // plusieurs fois dans cette moyenne, approximation acceptable pour un
  // indicateur de fréquentation, pas une statistique exacte par match unique.
  const memberIds = clanMembers.map((member) => member.id)
  const botStats =
    memberIds.length > 0
      ? await prisma.match.aggregate({
          where: {
            memberId: { in: memberIds },
            matchType: 'official',
            botCount: { not: null },
            ...(periodStart ? { pubgCreatedAt: { gte: periodStart } } : {}),
          },
          _avg: { botCount: true },
          _count: { botCount: true },
        })
      : null

  const thresholds = {
    minEncounters: ENCOUNTERED_PLAYER_MIN_ENCOUNTERS_BEFORE_RESOLUTION,
    maxAttempts: ENCOUNTERED_PLAYER_MAX_RESOLVE_ATTEMPTS,
  }

  const sum = (pick: (row: ClanGroupRow) => Count) => clanGroups.reduce((total, row) => total + toNumber(pick(row)), 0)
  const totalPlayers = sum((row) => row.players)
  const resolvedCount = sum((row) => row.resolved)
  const killSide = (side: string) => killTotals.find((row) => row.side === side)

  const rivalClans = clanGroups
    .filter((row): row is ClanGroupRow & { tag: string; lastSeenAt: Date } => !!row.tag && toNumber(row.rivalPlayers) > 0 && !!row.lastSeenAt)
    .map((row) => ({
      tag: row.tag,
      name: row.name,
      playerCount: toNumber(row.rivalPlayers),
      opponentEncounterCount: toNumber(row.opponentEncounters),
      killedByClanCount: toNumber(row.killedByClan),
      killedClanMemberCount: toNumber(row.killedMember),
      lastSeenAt: new Date(row.lastSeenAt).toISOString(),
    }))
    .sort((left, right) => right.opponentEncounterCount - left.opponentEncounterCount)

  const topRivalClans = rivalClans
    .slice(0, 5)
    .map((clan) => ({ tag: clan.tag, encounterCount: clan.opponentEncounterCount }))

  return {
      period,
      summary: {
        totalPlayers,
        resolvedCount,
        pendingCount: totalPlayers - resolvedCount,
        distinctClansIdentified: rivalClans.length,
        teammateCount: sum((row) => row.teammates),
        killedByClanPlayerCount: toNumber(killSide('byClan')?.players),
        killedByClanTotalKills: toNumber(killSide('byClan')?.kills),
        killedClanMemberPlayerCount: toNumber(killSide('byOpponent')?.players),
        killedClanMemberTotalKills: toNumber(killSide('byOpponent')?.kills),
      },
      playersListLimit: PLAYERS_LIST_LIMIT,
      playersListTruncated: totalPlayers > PLAYERS_LIST_LIMIT,
      thresholds,
      botStats: {
        avgBotsPerMatch: botStats?._avg.botCount ?? null,
        matchesWithData: botStats?._count.botCount ?? 0,
      },
      topRivalClans,
      rivalClans,
      players: playerRows.map((row) => {
        const encounterCount = toNumber(row.encounterCount)
        const teammateEncounterCount = toNumber(row.teammateEncounterCount)
        const resolveAttempts = toNumber(row.resolveAttempts)
        return {
          id: row.id,
          pubgAccountId: row.pubgAccountId,
          pubgPlayerName: row.pubgPlayerName,
          pubgClanTag: row.pubgClanTag,
          pubgClanName: row.pubgClanName,
          clanResolvedAt: row.clanResolvedAt ? new Date(row.clanResolvedAt).toISOString() : null,
          encounterCount,
          teammateEncounterCount,
          opponentEncounterCount: encounterCount - teammateEncounterCount,
          resolveAttempts,
          status: deriveEncounteredPlayerStatus(
            { encounterCount, clanResolvedAt: row.clanResolvedAt, resolveAttempts, pubgClanTag: row.pubgClanTag },
            thresholds
          ),
          killedByClanCount: killedByClanCounts.get(row.pubgAccountId) ?? 0,
          killedClanMemberCount: killedClanMemberCounts.get(row.pubgAccountId) ?? 0,
          firstSeenAt: new Date(row.firstSeenAt).toISOString(),
          lastSeenAt: new Date(row.lastSeenAt).toISOString(),
        }
      }),
    }
}
