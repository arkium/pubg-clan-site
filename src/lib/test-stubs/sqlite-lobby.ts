import { createRequire } from 'node:module'

import type { Prisma } from '@prisma/client'

/**
 * Base SQLite en mémoire (`node:sqlite`, Node 22) pour exécuter **pour de vrai** une requête `Prisma.sql` écrite pour
 * MySQL dans un test : les fragments de la place d'un clan (`CLAN_PLACEMENT_SQL`) et les agrégats de la Ligue et des
 * Cartes y tournent tels quels. Réservé aux tests (`src/lib/**\/*.test.ts`), jamais de base réelle.
 *
 * `node:sqlite` est chargé par `createRequire` : Vite ne connaît pas ce module intégré et refuse son import statique.
 */

type Statement = { all: (...values: unknown[]) => Record<string, unknown>[] }
type Database = { exec: (sql: string) => void; prepare: (sql: string) => Statement; close: () => void }

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => Database }

export type LobbyClan = { id: number; name?: string; tag?: string; isActive?: boolean; pubgClanId?: string | null; isSystem?: boolean }
export type LobbyMember = { id: number; clanId: number | null; isActive?: boolean; joinStatus?: string; displayName?: string }
export type LobbyMatch = {
  id: string
  /** `SquadMatch.placement` : la place du clan qui a créé la ligne. */
  placement: number
  createdAt: string
  mapName?: string
  matchType?: string
  gameMode?: string
}
export type LobbySquadMember = {
  squadMatchId: string
  memberId: number
  placement: number
  kills?: number
  damage?: number
  knockouts?: number
  timeSurvived?: number
}

const SCHEMA = `
  CREATE TABLE Clan (id INTEGER PRIMARY KEY, name TEXT, tag TEXT, isActive INTEGER, pubgClanId TEXT, isSystem INTEGER);
  CREATE TABLE ClanMember (id INTEGER PRIMARY KEY, clanId INTEGER, isActive INTEGER, joinStatus TEXT, displayName TEXT);
  CREATE TABLE SquadMatch (id TEXT PRIMARY KEY, pubgMatchId TEXT, gameMode TEXT, matchType TEXT, mapName TEXT, placement INTEGER,
    createdAt TEXT, totalKills INTEGER, totalDamage REAL, totalAssists INTEGER, totalRevives INTEGER);
  CREATE TABLE SquadMember (id TEXT PRIMARY KEY, squadMatchId TEXT, memberId INTEGER, placement INTEGER, kills INTEGER,
    damage REAL, knockouts INTEGER, assists INTEGER, revives INTEGER, timeSurvived INTEGER);
`

/** Les dates partent en ISO (ordre lexical = ordre chronologique), les booléens en 0 / 1, comme MySQL les lit. */
function bindValue(value: unknown) {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'boolean') return value ? 1 : 0
  return value
}

export function createSquadLobbyDb(input: {
  clans?: LobbyClan[]
  members: LobbyMember[]
  matches: LobbyMatch[]
  squadMembers: LobbySquadMember[]
}) {
  const db = new DatabaseSync(':memory:')
  db.exec(SCHEMA)
  const insert = (sql: string, rows: unknown[][]) => {
    const statement = db.prepare(sql) as unknown as { run: (...values: unknown[]) => void }
    for (const row of rows) statement.run(...row.map(bindValue))
  }
  const clanIds = new Set([...(input.clans ?? []).map((clan) => clan.id), ...input.members.flatMap((member) => (member.clanId ? [member.clanId] : []))])
  insert(
    'INSERT INTO Clan VALUES (?, ?, ?, ?, ?, ?)',
    [...clanIds].map((id) => {
      const clan = input.clans?.find((entry) => entry.id === id)
      return [id, clan?.name ?? `Clan ${id}`, clan?.tag ?? `C${id}`, clan?.isActive ?? true, clan?.pubgClanId === undefined ? `pubg-${id}` : clan.pubgClanId, clan?.isSystem ?? false]
    })
  )
  insert(
    'INSERT INTO ClanMember VALUES (?, ?, ?, ?, ?)',
    input.members.map((member) => [member.id, member.clanId, member.isActive ?? true, member.joinStatus ?? 'active', member.displayName ?? `Joueur ${member.id}`])
  )
  insert(
    'INSERT INTO SquadMatch VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)',
    input.matches.map((match) => [match.id, `pubg-${match.id}`, match.gameMode ?? 'squad', match.matchType ?? 'official', match.mapName ?? 'Baltic_Main', match.placement, match.createdAt])
  )
  insert(
    'INSERT INTO SquadMember VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)',
    input.squadMembers.map((entry, index) => [
      `sq${index}`,
      entry.squadMatchId,
      entry.memberId,
      entry.placement,
      entry.kills ?? 0,
      entry.damage ?? 0,
      entry.knockouts ?? 0,
      entry.timeSurvived ?? 0,
    ])
  )

  return {
    /** Remplace `prisma.$queryRaw` : exécute la requête et rend des objets simples. */
    queryRaw: async (query: Prisma.Sql) => db.prepare(query.sql).all(...query.values.map(bindValue)).map((row) => ({ ...row })),
    close: () => db.close(),
  }
}
