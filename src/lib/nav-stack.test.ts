import { describe, expect, it } from 'vitest'

import { NAV_STACK_MAX_ENTRIES, parseNavStack, recordNavigation, type NavStackEntry } from './nav-stack'

const entry = (href: string, label = href, ts = 1): NavStackEntry => ({ href, label, ts })

describe('recordNavigation', () => {
  it('empile une nouvelle page et renvoie la précédente comme retour', () => {
    const { stack, previous } = recordNavigation(
      [entry('/clans/comparator?clanIds=26%2C23%2C13&period=week', 'Comparateur')],
      { href: '/clans/23/telemetry/matches/abc/debrief', label: 'Débriefing' },
      5
    )

    expect(stack.map((e) => e.href)).toEqual([
      '/clans/comparator?clanIds=26%2C23%2C13&period=week',
      '/clans/23/telemetry/matches/abc/debrief',
    ])
    expect(previous?.href).toBe('/clans/comparator?clanIds=26%2C23%2C13&period=week')
  })

  it('met à jour la même page quand seule la query change, sans empiler', () => {
    const { stack, previous } = recordNavigation(
      [entry('/clans/1/overview'), entry('/clans/comparator?period=week', 'Comparateur', 3)],
      { href: '/clans/comparator?clanIds=26%2C23&period=month', label: 'Comparateur' },
      9
    )

    expect(stack).toEqual([
      entry('/clans/1/overview'),
      { href: '/clans/comparator?clanIds=26%2C23&period=month', label: 'Comparateur', ts: 3 },
    ])
    expect(previous?.href).toBe('/clans/1/overview')
  })

  it('affine le libellé d’une page déjà enregistrée (chargement terminé)', () => {
    const { stack } = recordNavigation(
      [entry('/clans/1/matches'), entry('/clans/1/telemetry/matches/abc/debrief', 'Débriefing Tactique')],
      { href: '/clans/1/telemetry/matches/abc/debrief', label: 'Débriefing #4 • Deston' },
      9
    )

    expect(stack).toHaveLength(2)
    expect(stack[1].label).toBe('Débriefing #4 • Deston')
  })

  it('distingue deux matchs différents (le chemin change)', () => {
    const { stack, previous } = recordNavigation(
      [entry('/clans/1/telemetry/matches/abc/debrief')],
      { href: '/clans/1/telemetry/matches/def/debrief', label: 'Autre' },
      2
    )

    expect(stack).toHaveLength(2)
    expect(previous?.href).toBe('/clans/1/telemetry/matches/abc/debrief')
  })

  it('n’a pas de retour sur une pile vide et borne la taille', () => {
    expect(recordNavigation([], { href: '/a', label: 'A' }, 1).previous).toBeNull()

    const full = Array.from({ length: NAV_STACK_MAX_ENTRIES }, (_, i) => entry(`/p${i}`))
    const { stack } = recordNavigation(full, { href: '/new', label: 'New' }, 2)
    expect(stack).toHaveLength(NAV_STACK_MAX_ENTRIES)
    expect(stack[stack.length - 1].href).toBe('/new')
    expect(stack[0].href).toBe('/p1')
  })
})

describe('parseNavStack', () => {
  it('ignore un contenu absent, corrompu ou mal formé', () => {
    expect(parseNavStack(null)).toEqual([])
    expect(parseNavStack('{pas du json')).toEqual([])
    expect(parseNavStack('{"href":"/a"}')).toEqual([])
    expect(parseNavStack('[{"href":"/a","label":"A","ts":1},{"href":2}]')).toEqual([entry('/a', 'A')])
  })
})
