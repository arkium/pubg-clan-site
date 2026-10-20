import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Tutoiement partout (CLAUDE.md §6 bis, décision du 2026-10-18) : interface, messages d'API, e-mails, notifications
 * et messages Discord. Passé sur tout `src/` le 2026-10-20 (docs/TODO/inventaire-2026-10-20.md).
 *
 * Repère « vous / votre / vos » et les impératifs en « -ez » hors commentaires. Les exceptions sont des pluriels
 * adressés à un groupe, pas du vouvoiement.
 */

const ROOT = path.resolve(__dirname, '..', '..')

/** Fichiers dont le « vous » s'adresse à plusieurs joueurs. */
const PLURAL_ADDRESS = new Set([
  // Verdict de la lecture de zone : il parle à l'escouade (« Maîtres du centre », « vous lisez la zone »).
  'src/lib/zone-closure-view.ts',
])

/** Mots en « -ez » qui ne sont pas des verbes. */
const NOT_A_VERB = new Set(['assez', 'chez', 'nez'])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [full] : []
  })
}

/** Retire les commentaires : seuls les textes comptent. */
function withoutComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')
}

function vouvoiementIn(source: string) {
  return withoutComments(source)
    .split('\n')
    .filter((line) => {
      if (/\b(vous|votre|vos)\b/i.test(line)) return true
      const words = line.match(/\p{L}+ez\b/gu) ?? []
      return words.some((word) => !NOT_A_VERB.has(word.toLowerCase()))
    })
    .map((line) => line.trim())
}

describe('Tutoiement', () => {
  const files = sourceFiles(path.join(ROOT, 'src'))
    .map((file) => path.relative(ROOT, file).split(path.sep).join('/'))
    .filter((file) => !PLURAL_ADDRESS.has(file))

  it('parcourt bien les sources', () => {
    expect(files.length).toBeGreaterThan(300)
    expect(files).toContain('src/lib/clan-lifecycle/clan-decision-email.ts')
  })

  it('aucune page, route ni message ne vouvoie', () => {
    const offending = files.flatMap((file) =>
      vouvoiementIn(readFileSync(path.join(ROOT, file), 'utf8')).map((line) => `${file} : ${line}`)
    )

    expect(offending).toEqual([])
  })

  it('le contrôle repère bien un vouvoiement', () => {
    expect(vouvoiementIn("const a = 'Vérifiez votre adresse.'")).toHaveLength(1)
    expect(vouvoiementIn("const a = 'Recharge la page, assez vite, chez toi.'")).toEqual([])
    expect(vouvoiementIn('// Connectez-vous : commentaire, ignoré')).toEqual([])
  })
})
