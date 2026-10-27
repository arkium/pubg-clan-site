import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  PAGE_SCOPES,
  pageScopeAnchor,
  pageScopeEntriesOf,
  pageScopeKey,
  pageScopeMethodologyHref,
  pageScopeRows,
  periodText,
  type PageScopeData,
} from '@/lib/page-scope'
import { PAGE_SCOPE_ENTRIES } from '@/lib/page-scope-entries'

/**
 * Registre « D'où viennent ces chiffres ? » (docs/TODO/aide-des-pages.md, lots 1 et 4) : chaque page de données d'un
 * joueur et d'un clan a son entrée, chaque entrée sa page, et chaque page pose sa barre ; puis les textes produits
 * selon les filtres et les dates.
 */

const ROOT = process.cwd()
const AREAS = { member: 'src/app/members/[id]', clan: 'src/app/clans/[clanId]' } as const
/** Hors du chantier : pages personnelles sans statistique, Coach IA (son propre « Comment ça marche ? »), administration. */
const EXCLUDED: Record<keyof typeof AREAS, string[]> = {
  member: ['notifications', 'notification-preferences'],
  clan: ['coach'],
}

function pageSlugs(dir: string, prefix = ''): string[] {
  const slugs: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (!statSync(full).isDirectory()) continue
    const slug = prefix ? `${prefix}/${name}` : name
    if (slug === 'settings') continue
    if (existsSync(path.join(full, 'page.tsx'))) slugs.push(slug)
    slugs.push(...pageSlugs(full, slug))
  }
  return slugs
}

describe('registre des pages', () => {
  for (const [area, dir] of Object.entries(AREAS) as Array<[keyof typeof AREAS, string]>) {
    it(`chaque page de ${dir} a son entrée, et chaque entrée sa page`, () => {
      const pages = pageSlugs(path.join(ROOT, dir)).filter((slug) => !EXCLUDED[area].some((excluded) => slug === excluded || slug.startsWith(`${excluded}/`)))
      const entries = pageScopeEntriesOf(area).map((entry) => entry.slug)
      expect([...entries].sort()).toEqual([...pages].sort())
    })
  }

  it('une entrée par page, sans doublon ; chaque page pose sa barre avec sa clé', () => {
    expect(new Set(PAGE_SCOPE_ENTRIES.map(pageScopeKey)).size).toBe(PAGE_SCOPE_ENTRIES.length)
    for (const entry of PAGE_SCOPE_ENTRIES) {
      const file = entry.view ?? path.join(AREAS[entry.area], entry.slug, 'page.tsx')
      const source = readFileSync(path.join(ROOT, file), 'utf8')
      expect(source, `${file} : <PageScopeNote scope="${pageScopeKey(entry)}">`).toContain(`scope="${pageScopeKey(entry)}"`)
    }
  })

  it('chaque entrée cite des fichiers qui existent', () => {
    for (const entry of PAGE_SCOPE_ENTRIES) {
      for (const file of entry.code) expect(existsSync(path.join(ROOT, file)), `${pageScopeKey(entry)} : ${file}`).toBe(true)
    }
  })

  it('ancres de la Méthodologie : uniques, sans crochet', () => {
    const anchors = PAGE_SCOPE_ENTRIES.map(pageScopeAnchor)
    expect(new Set(anchors).size).toBe(anchors.length)
    expect(pageScopeAnchor({ area: 'clan', slug: 'matches/session/[date]' })).toBe('page-clan-matches-session-date')
    expect(pageScopeMethodologyHref({ area: 'member', slug: 'dashboard' })).toBe('/a-propos/methodologie#page-joueur-dashboard')
  })
})

describe('textes de la barre', () => {
  // Lundi 26 octobre 2026, 20 h à Paris.
  const now = new Date('2026-10-26T19:00:00Z')

  it('période du filtre, en bornes calendaires', () => {
    expect(periodText('week', now)).toBe('Semaine du 26 octobre au 1er novembre : du lundi 0 h au dimanche 23 h 59.')
    expect(periodText('month', now)).toBe('Mois d’octobre 2026 : le mois civil, du 1er au 31.')
    expect(periodText('month-1', now)).toBe('Mois de septembre 2026 : le mois civil, du 1er au 30.')
    expect(periodText('all', now)).toContain('Tout l’historique')
  })

  it('parties comptées : règle fixe, filtre de la page et libellés propres à la page', () => {
    const dashboard = PAGE_SCOPES['member:dashboard']
    const overview = PAGE_SCOPES['clan:overview']
    const [, official] = pageScopeRows({ ...dashboard, matchTypes: 'official', matchTypesNote: undefined }, { period: 'week', now })
    expect(official.text).toBe('Parties normales seulement (matchmaking normal) : Ranked, Casual, parties perso et tournois ne comptent pas.')
    const [, ranked] = pageScopeRows({ ...overview, matchTypesNote: undefined }, { period: 'week', matchType: 'casual', now })
    expect(ranked.text).toBe('Type « Casual » : parties casual, lobbies de bots compris ; les autres types se choisissent dans le filtre de la page.')
    const [, every] = pageScopeRows({ ...overview, matchTypesNote: undefined }, { period: 'week', matchType: 'all', now })
    expect(every.text).toContain('Tous les types de partie')
    // Méthodologie : les choix du filtre, avec les libellés de la page.
    const [, general] = pageScopeRows({ ...overview, matchTypesNote: undefined })
    expect(general.text).toBe('Filtre « Type de partie » : « Officiel », « Casual », « Custom », « Tous » (« Officiel » par défaut).')
  })

  it('dates : textes généraux repliée, « — » en lecture, dates réelles ensuite ; jamais de faux zéro', () => {
    const entry = { ...PAGE_SCOPES['member:dashboard'], since: ['onSite', 'clanMatches', 'items', 'geoRetention'] as const, telemetry: true }
    const closed = pageScopeRows(entry, { period: 'week', now })
    expect(closed.find((row) => row.id === 'since')?.items?.[1]).toContain('environ 14 jours')
    expect(closed.find((row) => row.id === 'source')?.text).not.toContain('Parties analysées')

    const loading = pageScopeRows(entry, { period: 'week', now }, null)
    expect(loading.find((row) => row.id === 'since')?.items?.[0]).toMatch(/^Sur le site depuis le — ;/)
    expect(loading.find((row) => row.id === 'source')?.text).toContain('Parties analysées : —.')
    expect(JSON.stringify(loading)).not.toMatch(/\b0 sur 0\b/)

    const data: PageScopeData = {
      pendingAnalyses: 3,
      coverage: {
        scope: 'member',
        onSiteSince: '2026-05-23',
        clanMatches: { firstSession: '2026-05-11', firstMatchAt: '2026-05-11T23:30:00.000Z', lastSession: '2026-10-26', lastMatchAt: '2026-10-26T20:00:00.000Z', count: 812 },
        telemetry: { since: '2026-05-29', until: '2026-10-26', analyzed: 736, of: 812, percent: 91 },
        pubgMatches: { since: '2026-05-18', until: '2026-10-26', count: 1024, byType: [{ matchType: 'official', count: 989 }] },
        drops: { since: '2026-05-29', until: '2026-10-26', count: 722 },
        kills: { since: '2026-05-29', until: '2026-10-26', count: 1119 },
        positions: { since: '2026-05-29', until: '2026-10-26' },
        closures: { since: '2026-09-03', until: '2026-10-26', count: 525 },
        items: { since: null, until: null },
        careerSyncedAt: '2026-10-27T05:54:16.000Z',
      },
    }
    const loaded = pageScopeRows(entry, { period: 'week', now }, data)
    expect(loaded.find((row) => row.id === 'source')?.text).toContain('Parties analysées : 736 sur 812 (91 %). 3 analyses en attente.')
    expect(loaded.find((row) => row.id === 'since')?.items).toEqual([
      'Sur le site depuis le 23 mai 2026 ; PUBG ne garde les parties qu’environ 14 jours : l’historique commence au plus tôt 14 jours avant l’arrivée sur le site.',
      'Parties avec le clan depuis le 11 mai 2026 (812 parties).',
      'Objets consommés : aucune donnée pour l’instant.',
      expect.stringContaining('30 jours, 90 pour un Top 1 ou une partie custom'),
    ])
  })

  it('une soirée : sa date et la journée de 6 h à 6 h', () => {
    const [period] = pageScopeRows(PAGE_SCOPES['clan:matches/session/[date]'], { sessionDate: '2026-10-24' })
    expect(period.text).toMatch(/^Soirée du samedi 24 octobre 2026 : de 6 h à 6 h le lendemain/)
  })
})
