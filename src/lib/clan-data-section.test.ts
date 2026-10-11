import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config'
import {
  DATA_ANCHORS,
  dataCoverageHref,
  dataFailuresHref,
  dataSectionTabs,
  dataSessionHref,
} from '@/lib/clan-data-section'
import { hasAppPage } from '@/lib/test-support/app-routes'

/**
 * « Données » d'un clan ramenées à trois onglets (docs/TODO/administration.md §8) : onglets, liens internes et
 * redirections des adresses supprimées. Aucune base touchée.
 */

const SOURCE_ROOT = path.resolve(__dirname, '..')

function toRegExp(source: string) {
  const pattern = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[a-zA-Z]+/g, '[^/]+')
  return new RegExp(`^${pattern}$`)
}

const pathOf = (href: string) => href.split(/[?#]/)[0]

describe('onglets des Données du clan', () => {
  it('trois onglets : Santé, Soirées, Récupérations', () => {
    expect(dataSectionTabs(7)).toEqual([
      { href: '/clans/7/settings/data', label: 'Santé des données' },
      { href: '/clans/7/settings/data/sessions', label: 'Soirées' },
      { href: '/clans/7/settings/data/recoveries', label: 'Récupérations' },
    ])
  })

  it('chaque onglet mène à une page', () => {
    for (const tab of dataSectionTabs(':clanId')) {
      expect([tab.href, hasAppPage(tab.href)]).toEqual([tab.href, true])
    }
  })

  it('liens vers les blocs de Récupérations, dont les ancres sont posées par les composants', () => {
    expect(dataFailuresHref(7)).toBe('/clans/7/settings/data/recoveries#echecs')
    expect(dataCoverageHref(7)).toBe('/clans/7/settings/data/recoveries#couverture')
    const failures = fs.readFileSync(path.join(SOURCE_ROOT, 'components/clan-settings/data/TelemetryFailuresSection.tsx'), 'utf8')
    const recoveries = fs.readFileSync(path.join(SOURCE_ROOT, 'app/clans/[clanId]/settings/data/recoveries/page.tsx'), 'utf8')
    expect(failures).toContain('id={DATA_ANCHORS.failures}')
    expect(recoveries).toContain('id={DATA_ANCHORS.coverage}')
    expect(recoveries).toContain('<TelemetryFailuresSection')
  })
})

describe('soirée des Données d’une partie', () => {
  // Dimanche 11 octobre 2026 au soir : semaine du lundi 5, mois d'octobre.
  const now = new Date(2026, 9, 11, 21, 0)

  it('prend la première période calendaire qui contient la partie', () => {
    expect(dataSessionHref(7, '2026-10-10T19:00:00.000Z', now)).toBe('/clans/7/settings/data/sessions/2026-10-10?period=week')
    expect(dataSessionHref(7, '2026-10-02T18:00:00.000Z', now)).toBe('/clans/7/settings/data/sessions/2026-10-02?period=month')
    expect(dataSessionHref(7, '2026-09-15T18:00:00.000Z', now)).toBe('/clans/7/settings/data/sessions/2026-09-15?period=month-1')
    expect(dataSessionHref(7, '2026-08-15T18:00:00.000Z', now)).toBe('/clans/7/settings/data/sessions/2026-08-15?period=month-2')
  })

  it('date de soirée à Paris : une partie de 1 h 30 compte dans la soirée de la veille', () => {
    // 1 h 30 à Paris le 10 octobre (UTC+2) = 23 h 30 UTC le 9.
    expect(dataSessionHref(7, '2026-10-09T23:30:00.000Z', now)).toBe('/clans/7/settings/data/sessions/2026-10-09?period=week')
  })

  it('aucun lien hors des périodes de la page ou sur une date illisible', () => {
    expect(dataSessionHref(7, '2026-07-15T18:00:00.000Z', now)).toBeNull()
    expect(dataSessionHref(7, 'pas une date', now)).toBeNull()
  })
})

describe('redirections des onglets supprimés', () => {
  const MOVED: Array<[string, string]> = [
    ['/clans/:clanId/settings/data/state', '/clans/:clanId/settings/data'],
    ['/clans/:clanId/settings/data/errors', `/clans/:clanId/settings/data/recoveries#${DATA_ANCHORS.failures}`],
    ['/clans/:clanId/settings/data/sync', '/clans/:clanId/settings/data/sessions'],
    ['/clans/:clanId/telemetry/dashboard', '/clans/:clanId/settings/data'],
    ['/clans/:clanId/telemetry/errors', `/clans/:clanId/settings/data/recoveries#${DATA_ANCHORS.failures}`],
    ['/clans/:clanId/telemetry/sync-batch-manual', '/clans/:clanId/settings/data/sessions'],
    ['/clans/:clanId/telemetry/recoveries', '/clans/:clanId/settings/data/recoveries'],
  ]

  it('chaque ancienne adresse est redirigée, sans page résiduelle, vers une page existante', async () => {
    const redirects = (await nextConfig.redirects?.()) ?? []
    for (const [source, destination] of MOVED) {
      expect([source, hasAppPage(source)]).toEqual([source, false])
      expect([source, redirects.find((rule) => rule.source === source)?.destination]).toEqual([source, destination])
      expect([destination, hasAppPage(destination)]).toEqual([destination, true])
    }
  })

  it('aucune redirection ne mène à une autre redirection', async () => {
    const redirects = (await nextConfig.redirects?.()) ?? []
    const chained = redirects
      .filter((rule) => redirects.some((other) => other !== rule && toRegExp(other.source).test(pathOf(rule.destination))))
      .map((rule) => `${rule.source} → ${rule.destination}`)
    expect(chained).toEqual([])
  })
})
