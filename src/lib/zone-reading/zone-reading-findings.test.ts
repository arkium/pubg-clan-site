import { describe, expect, it } from 'vitest'

import type { ZoneReadingAnalysis } from './zone-reading-api'
import { zoneReadingFindings } from './zone-reading-findings'

// Chiffres de la production (Erangel, Squad, toutes les parties) le 2026-10-18.
const PAYLOAD: ZoneReadingAnalysis = {
  mapName: 'Baltic_Main',
  mapSizeMeters: 8192,
  mode: 'squad',
  period: 'all',
  mapOptions: [
    { mapName: 'Baltic_Main', matches: 11131 },
    { mapName: 'Savage_Main', matches: 2133 },
  ],
  matchCount: 11131,
  since: '2026-05-29T01:09:44.000Z',
  threshold: 300,
  ready: true,
  stats: {
    matches: 11131,
    finalLineMedian: 906.3,
    bandShare: 0.1119,
    bandRandomShare: 0.0791,
    crossesFirstShare: 0.9992,
    crossesFirstRandomShare: 0.7064,
    firstCenterLineMedian: 906.4,
    closing: [
      { circle: 2, share: 0.4635, total: 11131 },
      { circle: 3, share: 0.4862, total: 11131 },
      { circle: 8, share: 0.5046, total: 5305 },
    ],
    rule: [
      { circle: 1, center: 593, line: 1016, total: 11131 },
      { circle: 4, center: 102, line: 367, total: 11130 },
    ],
  },
  axes: [],
  defaultAxis: null,
  cellLabels: [],
}

const LABELS: Record<string, string> = { Baltic_Main: 'Erangel', Savage_Main: 'Sanhok' }
const labelOf = (mapName: string) => LABELS[mapName] ?? mapName
const NOW = new Date('2026-10-18T10:00:00Z')

describe('zoneReadingFindings', () => {
  const result = zoneReadingFindings(PAYLOAD, labelOf, NOW)!

  it('titre avec le nombre de parties et la carte, périmètre et date des chiffres', () => {
    expect(result.title.replace(/ | /g, ' ')).toBe('En bref : ce que disent 11 131 parties sur Erangel')
    expect(result.scope).toBe('Squad, parties depuis le 29 mai 2026 · chiffres du 18 octobre 2026')
  })

  it('quatre constats, chacun titré par les chiffres et comparé au hasard', () => {
    const text = result.findings.map((finding) => `${finding.lead} ${finding.detail}`).join('\n').replace(/ | /g, ' ')
    expect(result.findings).toHaveLength(4)
    expect(text).toContain('Le premier cercle croise presque toujours la ligne de vol. La ligne de vol du C-130 traverse le premier cercle dans 99,9 % des parties, contre 70,6 % avec la ligne de vol d’une autre partie.')
    expect(text).toContain('La zone finale ne suit pas la ligne de vol. 11,2 % des zones finales tombent à moins de 200 m de la ligne de vol ; au hasard, ce serait 7,9 %. Distance médiane entre la zone finale et la ligne : 906 m.')
    expect(text).toContain('L’avion place le premier cercle. Ensuite, c’est le hasard. Du 2e au 8e cercle, un cercle se rapproche de la ligne de vol dans 46,4 % à 50,5 % des cas')
    expect(text).toContain('Vise le centre du cercle, dès le premier.')
    expect(text).toContain('593 m au 1er cercle, 102 m au 4e ; en visant la ligne de vol : 1 016 m et 367 m.')
  })

  it('liste les parties par carte et explique la méthode', () => {
    expect(result.maps).toEqual([
      { label: 'Erangel', matches: 11131 },
      { label: 'Sanhok', matches: 2133 },
    ])
    expect(result.method).toContain('télémétrie officielle')
    expect(result.method.replace(/ | /g, ' ')).toContain('au-delà de 300 parties')
  })

  it('rien sous le seuil de parties, comme l’onglet Analyse', () => {
    expect(zoneReadingFindings({ ...PAYLOAD, ready: false }, labelOf, NOW)).toBeNull()
    expect(zoneReadingFindings({ ...PAYLOAD, stats: null }, labelOf, NOW)).toBeNull()
  })

  it('sans comparaison au hasard, ne l’invente pas', () => {
    const stats = { ...PAYLOAD.stats!, bandRandomShare: null, crossesFirstRandomShare: null }
    const text = zoneReadingFindings({ ...PAYLOAD, stats }, labelOf, NOW)!.findings.map((finding) => finding.detail).join(' ')
    expect(text).not.toContain('autre partie')
    expect(text).not.toContain('au hasard, ce serait')
  })

  it('suit les chiffres si la ligne attirait vraiment la zone finale', () => {
    const stats = { ...PAYLOAD.stats!, bandShare: 0.6, bandRandomShare: 0.1 }
    expect(zoneReadingFindings({ ...PAYLOAD, stats }, labelOf, NOW)!.findings[1].lead).toBe('La ligne de vol attire la zone finale.')
  })
})
