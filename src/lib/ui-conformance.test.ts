import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Conformité des pages joueurs au standard des bandeaux et de la période — docs/TODO/sticky.md §7.A.
 *
 * Test statique : il lit les sources sans rien rendre (Vitest tourne en Node et ne collecte que
 * `src/lib/**`). Le rendu lui-même est vérifié par Playwright (`e2e/`). Chaque liste ci-dessous est
 * une décision : la modifier, c'est modifier le standard, et le document doit suivre.
 */

const ROOT = path.resolve(__dirname, '../..')

function toPosix(file: string) {
  return file.split(path.sep).join('/')
}

function listSources(dir: string): string[] {
  const absolute = path.join(ROOT, dir)
  const files: string[] = []
  for (const entry of readdirSync(absolute)) {
    const full = path.join(absolute, entry)
    if (statSync(full).isDirectory()) {
      files.push(...listSources(path.join(dir, entry)))
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      files.push(toPosix(path.join(dir, entry)))
    }
  }
  return files
}

function read(file: string) {
  return readFileSync(path.join(ROOT, file), 'utf8')
}

/** Outils d'administration et pages SuperUser : hors périmètre, par décision (sticky.md §2 et §6). */
const OUT_OF_SCOPE = [
  'src/app/api/',
  'src/app/settings/',
  'src/app/clans/[clanId]/settings/',
  'src/app/clans/[clanId]/telemetry/dashboard/',
  'src/app/clans/[clanId]/telemetry/errors/',
  'src/app/clans/[clanId]/telemetry/recoveries/',
  'src/app/clans/[clanId]/telemetry/sync-batch-manual/',
  'src/app/members/add/',
  'src/app/members/manage/',
]

const ALL_SOURCES = [...listSources('src/app'), ...listSources('src/components'), ...listSources('src/hooks')]
const PLAYER_SOURCES = ALL_SOURCES.filter((file) => !OUT_OF_SCOPE.some((prefix) => file.startsWith(prefix)))

/** Pages à filtres de page (inventaire du §6) : toutes portent un `DockingToolbar`. */
const TOOLBAR_PAGES = [
  // Clan
  'src/app/clans/[clanId]/overview/page.tsx',
  'src/app/clans/[clanId]/leaderboard/page.tsx',
  'src/app/clans/[clanId]/matches/page.tsx',
  'src/app/clans/[clanId]/matches/session/[date]/page.tsx',
  'src/app/clans/[clanId]/stats/page.tsx',
  'src/app/clans/[clanId]/stats/weapons/page.tsx',
  'src/app/clans/[clanId]/stats/weapons/categories/page.tsx',
  'src/app/clans/[clanId]/stats/items/page.tsx',
  'src/app/clans/[clanId]/stats/positions/page.tsx',
  'src/app/clans/[clanId]/stats/zone-closures/page.tsx',
  'src/app/clans/[clanId]/stats/heatmap-kills/page.tsx',
  'src/app/clans/[clanId]/drop-zones/page.tsx',
  'src/app/clans/[clanId]/telemetry/opponents/page.tsx',
  'src/app/clans/[clanId]/telemetry/matches/page.tsx',
  'src/app/clans/[clanId]/awards/page.tsx',
  'src/app/clans/[clanId]/members/page.tsx',
  'src/app/clans/[clanId]/challenges/page.tsx',
  // Joueur
  'src/app/members/[id]/dashboard/page.tsx',
  'src/app/members/[id]/matches/page.tsx',
  'src/app/members/[id]/weapons/page.tsx',
  'src/app/members/[id]/items/page.tsx',
  'src/app/members/[id]/map-stats/page.tsx',
  'src/app/members/[id]/heatmap/page.tsx',
  'src/app/members/[id]/drop-zones/page.tsx',
  'src/app/members/[id]/nemesis/page.tsx',
  'src/app/members/[id]/notifications/page.tsx',
  // Global
  'src/app/clans/page.tsx',
  'src/app/clans/comparator/page.tsx',
  'src/app/clans-leaderboard/page.tsx',
  'src/app/tournaments/page.tsx',
]

/** Composants partagés qui rendent le bandeau pour la page qui les importe. */
const TOOLBAR_COMPONENTS: Record<string, string> = {
  '@/components/ClanSelector': 'src/components/ClanSelector.tsx',
  '@/components/WeaponCategoryToolbar': 'src/components/WeaponCategoryToolbar.tsx',
}

/**
 * Pages dont les seuls contrôles appartiennent à une section (saison / ranked, filtre de phase d'un
 * tableau, granularité d'un classement) : ils restent dans leur section, la page n'a pas de bandeau.
 */
const SECTION_LOCAL_CONTROL_PAGES = [
  'src/app/members/[id]/stats/page.tsx',
  'src/app/clans/[clanId]/telemetry/matches/[matchId]/telemetry/page.tsx',
  'src/app/tournaments/[tournamentId]/page.tsx',
]

/** Composants autorisés à écouter le défilement de la fenêtre — jamais pour se docker. */
const ALLOWED_SCROLL_LISTENERS: Record<string, string> = {
  'src/components/ui/SectionAnchorNav.tsx': 'lien actif des ancres',
}

/** États de période locaux autorisés à côté du `PeriodFilter` de la page. */
const ALLOWED_LOCAL_PERIOD_STATE: Record<string, string> = {
  'src/app/members/[id]/dashboard/page.tsx': 'sélecteur de la comparaison de tendances, propre à sa section',
}

function usesToolbar(source: string) {
  if (source.includes('<DockingToolbar')) return true
  return Object.entries(TOOLBAR_COMPONENTS).some(
    ([specifier, file]) => source.includes(`from '${specifier}'`) && read(file).includes('<DockingToolbar')
  )
}

describe('ui-conformance — listes déclarées', () => {
  it('ne référence que des fichiers existants', () => {
    const declared = [
      ...TOOLBAR_PAGES,
      ...Object.values(TOOLBAR_COMPONENTS),
      ...SECTION_LOCAL_CONTROL_PAGES,
      ...Object.keys(ALLOWED_SCROLL_LISTENERS),
      ...Object.keys(ALLOWED_LOCAL_PERIOD_STATE),
    ]
    expect(declared.filter((file) => !existsSync(path.join(ROOT, file)))).toEqual([])
  })
})

describe('ui-conformance — 1. un bandeau par page à filtres', () => {
  it('chaque page déclarée utilise DockingToolbar, directement ou par un composant partagé', () => {
    expect(TOOLBAR_PAGES.filter((file) => !usesToolbar(read(file)))).toEqual([])
  })

  it("une page à bandeau n'ouvre pas de second <main> (le shell le fournit)", () => {
    // Balise JSX en début de ligne : un commentaire qui cite <main> ne compte pas.
    expect(TOOLBAR_PAGES.filter((file) => /^\s*<main[\s>]/m.test(read(file)))).toEqual([])
  })

  it("les pages à contrôles de section n'ont pas de bandeau", () => {
    expect(SECTION_LOCAL_CONTROL_PAGES.filter((file) => usesToolbar(read(file)))).toEqual([])
  })
})

describe('ui-conformance — 2. mêmes mots pour la période et les filtres', () => {
  const FORBIDDEN_LABEL = /(['"`])(?:Tout|All Time|Tous les temps|7 jours|30 jours|Mois-1|Mois-2)\1|>\s*(?:Tout|All Time)\s*</i

  it('aucun libellé « Tout », « All Time », « 7 jours », « 30 jours », « Mois-1 » ou « Mois-2 »', () => {
    const offenders = PLAYER_SOURCES.flatMap((file) =>
      read(file)
        .split('\n')
        .map((line, index) => (FORBIDDEN_LABEL.test(line) ? `${file}:${index + 1}: ${line.trim()}` : null))
        .filter((entry): entry is string => entry !== null)
    )
    expect(offenders).toEqual([])
  })

  it('aucune page ne définit ses propres options ou libellés de période (src/lib/period.ts)', () => {
    const LOCAL_PERIOD_DEFINITION = /value:\s*['"](?:week|month|month-1|month-2)['"]|\bweek:\s*['"]/
    const offenders = PLAYER_SOURCES.flatMap((file) =>
      read(file)
        .split('\n')
        .map((line, index) => (LOCAL_PERIOD_DEFINITION.test(line) ? `${file}:${index + 1}: ${line.trim()}` : null))
        .filter((entry): entry is string => entry !== null)
    )
    expect(offenders).toEqual([])
  })
})

describe('ui-conformance — 3. une seule couche collante, calée sur le header', () => {
  it('aucun décalage collant en dur hors de src/components/ui/', () => {
    const offenders: string[] = []
    for (const file of ALL_SOURCES.filter((entry) => !entry.startsWith('src/components/ui/'))) {
      read(file)
        .split('\n')
        .forEach((line, index) => {
          const where = `${file}:${index + 1}: ${line.trim()}`
          if (/\bsticky\b/.test(line)) {
            for (const match of line.matchAll(/(?:^|[\s'"`:])top-(\d+(?:\.\d+)?|px)\b/g)) {
              if (match[1] !== '0') offenders.push(where)
            }
          }
          for (const match of line.matchAll(/top-\[calc\(([^\]]*)\)\]/g)) {
            if (!match[1].includes('--app-header-height')) offenders.push(where)
          }
        })
    }
    expect(offenders).toEqual([])
  })
})

describe('ui-conformance — 4. bandeau docké sans bordure haute ni transition géométrique', () => {
  it('DockingToolbar ne contient ni border-y, ni border-t, ni transition-all', () => {
    const source = read('src/components/ui/DockingToolbar.tsx')
    expect(source).not.toMatch(/\bborder-[ty]\b/)
    expect(source).not.toMatch(/transition-all/)
  })
})

describe('ui-conformance — 5. détection du docking par sentinelle, jamais par le défilement', () => {
  it("seules les exceptions nommées écoutent le défilement de la fenêtre", () => {
    const listeners = ALL_SOURCES.filter((file) => /addEventListener\(\s*['"]scroll['"]/.test(read(file)))
    expect(listeners.filter((file) => !(file in ALLOWED_SCROLL_LISTENERS))).toEqual([])
  })
})

describe('ui-conformance — 6. une période par page, obtenue par usePagePeriod', () => {
  const filesWithFilter = PLAYER_SOURCES.filter((file) => read(file).includes('<PeriodFilter'))

  it('chaque fichier qui affiche PeriodFilter lit sa période par usePagePeriod', () => {
    expect(filesWithFilter.length).toBeGreaterThan(0)
    expect(filesWithFilter.filter((file) => !read(file).includes('usePagePeriod('))).toEqual([])
  })

  it('un seul PeriodFilter par fichier', () => {
    expect(filesWithFilter.filter((file) => read(file).split('<PeriodFilter').length - 1 > 1)).toEqual([])
  })

  it('aucun état de période local à côté du PeriodFilter', () => {
    const LOCAL_PERIOD_STATE = /useState<\s*\w*Period\s*>|const \[\s*period\s*,\s*setPeriod\s*\]\s*=\s*useState/
    expect(
      filesWithFilter.filter((file) => !(file in ALLOWED_LOCAL_PERIOD_STATE) && LOCAL_PERIOD_STATE.test(read(file)))
    ).toEqual([])
  })
})
