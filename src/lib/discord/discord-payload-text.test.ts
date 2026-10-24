import { describe, expect, it } from 'vitest'

import { DISCORD_MESSAGE_LIMIT, discordPayloadToText, splitDiscordMessage } from './discord-payload-text'

// Module pur : le message à coller dans Discord quand aucun webhook n'est configuré (2026-10-24).
describe('discordPayloadToText', () => {
  it('titre lié, description, champs en gras, pied de page en petit texte', () => {
    const text = discordPayloadToText({
      embeds: [
        {
          title: '🏆 Tournoi : Coupe [FR] — Résultat final',
          url: 'https://chickendinner.fr/t/abc',
          description: '🗓️ 23 oct. · organisé par **[FUN] FunsNRoses**',
          fields: [
            { name: 'Classement final', value: '🥇 **[FR] FR-Alliance-BE** — 61 pts' },
            { name: 'Manches', value: 'M1 · Haven · Solo' },
          ],
          footer: { text: '1 manche(s)' },
        },
      ],
    })
    expect(text).toBe(
      [
        '## [🏆 Tournoi : Coupe \\[FR\\] — Résultat final](https://chickendinner.fr/t/abc)',
        '🗓️ 23 oct. · organisé par **[FUN] FunsNRoses**',
        '',
        '**Classement final**',
        '🥇 **[FR] FR-Alliance-BE** — 61 pts',
        '',
        '**Manches**',
        'M1 · Haven · Solo',
        '',
        '-# 1 manche(s)',
      ].join('\n')
    )
  })

  it('garde la mention en tête et un titre sans lien', () => {
    expect(discordPayloadToText({ content: '<@&42>', embeds: [{ title: 'Résultats' }] })).toBe('<@&42>\n\n## Résultats')
  })
})

describe('splitDiscordMessage', () => {
  it('un message court reste entier', () => {
    expect(splitDiscordMessage('Bonjour')).toEqual(['Bonjour'])
  })

  it('découpe entre deux lignes, chaque partie sous la limite de Discord', () => {
    const lines = Array.from({ length: 60 }, (_, index) => `Ligne ${index} ${'x'.repeat(50)}`)
    const parts = splitDiscordMessage(lines.join('\n'))
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(DISCORD_MESSAGE_LIMIT)
    // Rien de perdu ni de coupé : recollées, les parties redonnent les lignes.
    expect(parts.join('\n')).toBe(lines.join('\n'))
  })

  it('coupe net une ligne plus longue que la limite', () => {
    const parts = splitDiscordMessage('a'.repeat(4500), 2000)
    expect(parts.map((part) => part.length)).toEqual([2000, 2000, 500])
  })
})
