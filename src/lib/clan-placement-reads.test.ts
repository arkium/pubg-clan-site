import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Contrôle statique : aucune lecture de `SquadMatch.placement` (docs/TODO/place-partie-partagee.md).
 *
 * `SquadMatch` est unique par partie PUBG et partagé par tous les clans suivis du lobby : sa colonne `placement` n'est
 * que la place du clan qui a créé la ligne. La place d'un clan vient de ses membres (`clanPlacementOf`,
 * `CLAN_PLACEMENT_SQL`), celle d'un joueur de sa propre `SquadMember.placement`. Le test lit les sources sans rien
 * exécuter et repère les cinq façons de lire la colonne :
 *  1. un appel `*.squadMatch.find…/aggregate/groupBy/count(…)` qui sélectionne, filtre ou trie sur `placement` ;
 *  2. le même appel **sans `select`** : Prisma rend alors toutes les colonnes, `placement` comprise ;
 *  3. un bloc de relation `squadMatch: { … placement … }` (depuis `SquadMember`, `DropPressureStat`…) ;
 *  4. la propriété `.squadMatch.placement` ;
 *  5. en SQL, `<alias>.placement` d'un `FROM / JOIN SquadMatch <alias>`, ou `placement` nu sur un `SquadMatch` sans alias.
 * Les blocs `members: { … }` (relation vers `SquadMember`) sont ignorés : leur `placement` est celle du joueur.
 */

const ROOT = path.resolve(__dirname, '../..')

const IMPLICIT = 'findMany sans select (toutes les colonnes)'

/**
 * Lectures assumées, par fichier et par règle, chacune justifiée : la modifier, c'est modifier la règle, et la fiche
 * doit suivre. Une autre forme de lecture dans le même fichier reste refusée.
 */
const EXCEPTIONS: Record<string, { rules: string[]; reason: string }> = {
  'src/lib/tournament-service.ts': {
    rules: [IMPLICIT],
    reason:
      'manches de tournoi (`getTournamentMatches`) : les classements se calculent par équipe PUBG depuis les membres ' +
      '(`splitIntoPubgTeams`) ; la ligne créée par `materializeTournamentCustomMatches` porte la meilleure place suivie, ' +
      'exposée telle quelle dans le contrat `matches[].placement` des routes de tournoi — la place d’aucun clan.',
  },
  'src/lib/pubg-telemetry/backlog.ts': {
    rules: [IMPLICIT],
    reason: 'file de télémétrie : seuls l’identifiant, la télémétrie et les membres sont relus, jamais la place.',
  },
  'src/lib/pubg-telemetry/manual-sync.ts': {
    rules: [IMPLICIT],
    reason: 'resynchronisation de télémétrie choisie par l’administrateur : la ligne est relue pour le pipeline, jamais la place.',
  },
}

const SQL_KEYWORDS = new Set(['ON', 'WHERE', 'INNER', 'LEFT', 'RIGHT', 'JOIN', 'GROUP', 'ORDER', 'LIMIT', 'USING', 'SET', 'AS'])

function listSources(dir: string): string[] {
  const absolute = path.join(ROOT, dir)
  return readdirSync(absolute).flatMap((entry) => {
    const full = path.join(absolute, entry)
    if (statSync(full).isDirectory()) return listSources(path.join(dir, entry))
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path.join(dir, entry).split(path.sep).join('/')] : []
  })
}

/** Texte du bloc ouvert à `open` (`{` ou `(`), crochets équilibrés, chaînes sautées. */
function blockAt(source: string, open: number): string {
  let depth = 0
  let quote: string | null = null
  for (let index = open; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (char === '\\') index += 1
      else if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"' || char === '`') quote = char
    else if (char === '{' || char === '(' || char === '[') depth += 1
    else if (char === '}' || char === ')' || char === ']') {
      depth -= 1
      if (depth === 0) return source.slice(open, index + 1)
    }
  }
  return source.slice(open)
}

/** Retire les blocs `key: { … }` (récursivement : le premier trouvé emporte ceux qu'il contient). */
function stripBlocks(text: string, keys: readonly string[]): string {
  const pattern = new RegExp(`\\b(?:${keys.join('|')})\\s*:\\s*\\{`, 'g')
  let result = text
  for (let match = pattern.exec(result); match; match = pattern.exec(result)) {
    const open = match.index + match[0].length - 1
    result = result.slice(0, match.index) + result.slice(open + blockAt(result, open).length)
    pattern.lastIndex = match.index
  }
  return result
}

/** Clés de premier niveau d'un objet littéral `{ … }`. */
function topLevelKeys(objectText: string): string[] {
  const keys: string[] = []
  let depth = 0
  let quote: string | null = null
  for (let index = 0; index < objectText.length; index += 1) {
    const char = objectText[index]
    if (quote) {
      if (char === '\\') index += 1
      else if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"' || char === '`') quote = char
    else if ('{(['.includes(char)) depth += 1
    else if ('})]'.includes(char)) depth -= 1
    else if (depth === 1) {
      const key = /^(\.\.\.)?([A-Za-z_]\w*)\s*:?/.exec(objectText.slice(index))
      if (key && (objectText[index - 1] === undefined || /[\s{,]/.test(objectText[index - 1]))) {
        keys.push(key[0].startsWith('...') ? `...${key[2]}` : key[2])
        index += key[0].length - 1
      }
    }
  }
  return keys
}

const lineOf = (source: string, index: number) => source.slice(0, index).split('\n').length

/** Blanchit les commentaires (de ligne et de bloc) sans changer les positions : leur texte n'est pas du code. */
function blankComments(source: string): string {
  const chars = source.split('')
  let quote: string | null = null
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]
    if (quote) {
      if (char === '\\') index += 1
      else if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
    } else if (char === '/' && chars[index + 1] === '/') {
      while (index < chars.length && chars[index] !== '\n') chars[index++] = ' '
    } else if (char === '/' && chars[index + 1] === '*') {
      while (index < chars.length && !(chars[index] === '*' && chars[index + 1] === '/')) {
        if (chars[index] !== '\n') chars[index] = ' '
        index += 1
      }
      chars[index] = ' '
      if (index + 1 < chars.length) chars[index + 1] = ' '
      index += 1
    }
  }
  return chars.join('')
}

/** Les lectures de `SquadMatch.placement` d'une source, « ligne : règle ». */
export function findSquadMatchPlacementReads(rawSource: string): string[] {
  const source = blankComments(rawSource)
  const reads: string[] = []
  const READ_RELATIONS = ['members', 'data', 'create', 'update', '_count']

  // 1 et 2 : appels au modèle.
  for (const call of source.matchAll(/\.squadMatch\.(findMany|findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow|aggregate|groupBy|count|update|upsert)\(/g)) {
    const args = blockAt(source, call.index! + call[0].length - 1)
    const stripped = stripBlocks(args, READ_RELATIONS)
    const line = lineOf(source, call.index!)
    if (/\bplacement\b/.test(stripped)) reads.push(`${line}: ${call[1]} sur placement`)
    const objectStart = args.indexOf('{')
    const keys = objectStart >= 0 ? topLevelKeys(blockAt(args, objectStart)) : []
    if (/^find/.test(call[1]) && !keys.includes('select')) reads.push(`${line}: ${IMPLICIT}`)
  }

  // 3 : relation `squadMatch: { … }`.
  for (const relation of source.matchAll(/\bsquadMatch\s*:\s*\{/g)) {
    const block = blockAt(source, relation.index! + relation[0].length - 1)
    if (/\bplacement\b/.test(stripBlocks(block, READ_RELATIONS))) reads.push(`${lineOf(source, relation.index!)}: relation squadMatch sur placement`)
  }

  // 4 : propriété d'une relation chargée.
  for (const property of source.matchAll(/\.squadMatch\??\.placement\b/g)) reads.push(`${lineOf(source, property.index!)}: .squadMatch.placement`)

  // 5 : SQL.
  const aliases = new Set<string>()
  for (const table of source.matchAll(/\b(?:FROM|JOIN)\s+SquadMatch\s+(?:AS\s+)?([A-Za-z_]\w*)/g)) {
    if (!SQL_KEYWORDS.has(table[1].toUpperCase())) aliases.add(table[1])
  }
  for (const alias of aliases) {
    for (const read of source.matchAll(new RegExp(`\\b${alias}\\.placement\\b`, 'g'))) reads.push(`${lineOf(source, read.index!)}: SQL ${alias}.placement`)
  }
  for (const bare of source.matchAll(/\b(?:FROM|JOIN)\s+SquadMatch\b(?=\s*(?:$|WHERE\b|ON\b|INNER\b|LEFT\b|JOIN\b|GROUP\b|ORDER\b|LIMIT\b|\)|`))/gm)) {
    const start = source.lastIndexOf('`', bare.index!)
    const end = source.indexOf('`', bare.index!)
    const template = source.slice(start + 1, end < 0 ? undefined : end)
    if (/(?<![.\w])(?<!\bAS\s{1,4})placement\b/i.test(template)) reads.push(`${lineOf(source, bare.index!)}: SQL placement sur SquadMatch sans alias`)
  }
  return reads
}

const SOURCES = listSources('src')
const readsByFile = new Map(
  SOURCES.map((file) => [file, findSquadMatchPlacementReads(readFileSync(path.join(ROOT, file), 'utf8'))] as const).filter(([, reads]) => reads.length > 0)
)

describe('lecture de SquadMatch.placement', () => {
  it('le détecteur reconnaît chaque forme de lecture', () => {
    expect(findSquadMatchPlacementReads('prisma.squadMatch.findMany({ where: {}, select: { id: true, placement: true } })')).toHaveLength(1)
    expect(findSquadMatchPlacementReads('prisma.squadMatch.count({ where: { placement: 1 } })')).toHaveLength(1)
    expect(findSquadMatchPlacementReads('prisma.squadMatch.findMany({ where: {}, include: { members: true } })')).toEqual(['1: findMany sans select (toutes les colonnes)'])
    expect(findSquadMatchPlacementReads('prisma.squadMember.count({ where: { squadMatch: { placement: 1 } } })')).toHaveLength(1)
    expect(findSquadMatchPlacementReads('const won = row.squadMatch.placement === 1')).toHaveLength(1)
    expect(findSquadMatchPlacementReads('sql`SELECT sm.placement FROM SquadMatch sm`')).toHaveLength(1)
    expect(findSquadMatchPlacementReads('sql`SELECT SUM(placement = 1) FROM SquadMatch\n WHERE x`')).toHaveLength(1)
  })

  it('le détecteur laisse passer la place des membres', () => {
    expect(
      findSquadMatchPlacementReads(
        'prisma.squadMatch.findMany({ select: { id: true, members: { where: { placement: 1 }, select: { placement: true } } } })'
      )
    ).toEqual([])
    expect(findSquadMatchPlacementReads('prisma.squadMatch.create({ data: { placement: 3 } })')).toEqual([])
    expect(findSquadMatchPlacementReads('sql`SELECT sq.placement, t.placement AS placement FROM SquadMember sq JOIN SquadMatch sm ON sm.id = sq.squadMatchId`')).toEqual([])
    // Un commentaire n'est pas une lecture, et son apostrophe n'ouvre pas de chaîne.
    expect(
      findSquadMatchPlacementReads("prisma.squadMatch.findMany({\n  // l'équipe, jamais sm.placement\n  select: { id: true },\n})\nconst q = sql`FROM SquadMatch sm`")
    ).toEqual([])
  })

  const ruleOf = (read: string) => read.slice(read.indexOf(': ') + 2)

  it('aucune lecture hors des exceptions justifiées', () => {
    const unexpected = [...readsByFile]
      .map(([file, reads]) => [file, reads.filter((read) => !EXCEPTIONS[file]?.rules.includes(ruleOf(read)))] as const)
      .filter(([, reads]) => reads.length > 0)
      .map(([file, reads]) => `${file}\n  ${reads.join('\n  ')}`)
    expect(unexpected, unexpected.join('\n')).toEqual([])
  })

  it('chaque exception correspond encore à une lecture', () => {
    for (const [file, { rules }] of Object.entries(EXCEPTIONS)) {
      for (const rule of rules) expect(readsByFile.get(file)?.some((read) => ruleOf(read) === rule), `${file} : ${rule}`).toBe(true)
    }
  })
})
