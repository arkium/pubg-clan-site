import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  classifyPubgApiFailure,
  PUBG_API_SOURCE_PRIORITIES,
  pubgApiPriorityOfSource,
  pubgApiSlotTone,
} from '@/lib/pubg-api-call-category'

describe('classement des échecs PUBG (docs/TODO/fraicheur-des-parties.md, lot 6)', () => {
  it('404 attendu (absent chez PUBG), 5xx et absence de réponse passagers, 429 à part, le reste à traiter', () => {
    expect(classifyPubgApiFailure(404)).toBe('expected')
    for (const status of [500, 502, 503, 504, null, undefined, 0]) expect(classifyPubgApiFailure(status)).toBe('transient')
    expect(classifyPubgApiFailure(429)).toBe('rateLimited')
    for (const status of [400, 401, 403, 415, 422]) expect(classifyPubgApiFailure(status)).toBe('action')
  })

  it('ton d’une tranche : les 404 attendus ne colorent rien ; un échec à traiter ou trois passagers la rougissent', () => {
    expect(pubgApiSlotTone({ action: 0, transient: 0, rateLimited: 0 })).toBe('pos')
    expect(pubgApiSlotTone({ action: 0, transient: 2, rateLimited: 0 })).toBe('pos')
    expect(pubgApiSlotTone({ action: 0, transient: 3, rateLimited: 0 })).toBe('neg')
    expect(pubgApiSlotTone({ action: 1, transient: 0, rateLimited: 0 })).toBe('neg')
    expect(pubgApiSlotTone({ action: 0, transient: 0, rateLimited: 1 })).toBe('warn')
    expect(pubgApiSlotTone({ action: 1, transient: 0, rateLimited: 4 })).toBe('neg')
  })
})

describe('priorité d’après l’origine (lot 2)', () => {
  it('synchronisation des parties et tournois en haute, tâches de fond en basse, le reste normal', () => {
    expect(pubgApiPriorityOfSource('clan-match-sync')).toBe('high')
    expect(pubgApiPriorityOfSource('tournament-sync')).toBe('high')
    expect(pubgApiPriorityOfSource('clan-lifetime-sync')).toBe('low')
    expect(pubgApiPriorityOfSource('encountered-player-resolution-cron')).toBe('low')
    expect(pubgApiPriorityOfSource('pubg-lib')).toBe('normal')
    expect(pubgApiPriorityOfSource('encountered-player-resolution-manual')).toBe('normal')
  })

  // La table ne sert qu'à l'affichage : la file lit la priorité du contexte de chaque appel. Les deux doivent concorder.
  const SRC = path.resolve(__dirname, '..')
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) return sourceFiles(full)
      return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [full] : []
    })
  }
  const files = sourceFiles(SRC).map((file) => ({ file, text: readFileSync(file, 'utf8') }))
  /** Objet littéral qui entoure une position : de l'accolade ouvrante qui précède à la fermante qui suit. */
  function enclosingObject(text: string, index: number) {
    return text.slice(text.lastIndexOf('{', index), text.indexOf('}', index) + 1)
  }

  it('chaque appel d’une origine de la table passe la même priorité à la file', () => {
    const mismatches: string[] = []
    let checked = 0
    for (const [source, priority] of Object.entries(PUBG_API_SOURCE_PRIORITIES)) {
      for (const { file, text } of files) {
        if (file.endsWith('pubg-api-call-category.ts')) continue
        for (const match of text.matchAll(new RegExp(`source: '${source}'`, 'g'))) {
          checked += 1
          const literal = enclosingObject(text, match.index ?? 0)
          if (!new RegExp(`priority: [^,}]*'${priority}'`).test(literal)) mismatches.push(`${path.relative(SRC, file)} : ${source}`)
        }
      }
    }
    // Les origines calculées : joueurs croisés (cron ou manuel) et cycle de vie (`clan-lifecycle-${source}`).
    const resolution = files.find(({ file }) => file.endsWith('encountered-player-resolution.ts'))!.text
    expect(resolution).toContain("priority: options?.source === 'manual' ? 'normal' : 'low'")
    const lifecycle = files.find(({ file }) => file.endsWith('membership-sync.ts'))!.text
    expect(lifecycle.match(/source: `clan-lifecycle-\$\{source\}`,\s*priority: source === 'cron' \? 'low' : 'normal'/g)).toHaveLength(2)

    expect(checked).toBeGreaterThanOrEqual(6)
    expect(mismatches).toEqual([])
  })
})
