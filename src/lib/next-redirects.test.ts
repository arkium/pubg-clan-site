import { describe, expect, it } from 'vitest'

import nextConfig from '../../next.config'
import { hasAppPage } from '@/lib/test-support/app-routes'

/**
 * Redirections de `next.config.ts` (anciennes adresses de pages refondues). Une redirection s'applique avant les
 * pages : une destination qui n'existe pas donne un 404, une source qui est encore une page la rend inaccessible sans
 * aucun message. Ce test relie chaque règle au système de fichiers de `src/app`.
 */

describe('next.config.ts — redirections', () => {
  it('chaque destination est une page qui existe', async () => {
    const rules = await nextConfig.redirects!()
    expect(rules.length).toBeGreaterThan(0)
    expect(rules.filter((rule) => !hasAppPage(rule.destination)).map((rule) => rule.destination)).toEqual([])
  })

  it('aucune source n’est encore une page (elle serait masquée par la redirection)', async () => {
    const rules = await nextConfig.redirects!()
    // Une règle conditionnée par la requête (`has`) ne masque la page que pour cette requête : `/mortier?tab=guide`.
    expect(rules.filter((rule) => !rule.has && hasAppPage(rule.source)).map((rule) => rule.source)).toEqual([])
  })

  it('l’ancien onglet du guide du mortier mène à sa propre adresse, la page d’entraînement reste servie', async () => {
    const rules = await nextConfig.redirects!()
    const guide = rules.find((rule) => rule.source === '/mortier')
    expect(guide).toMatchObject({ destination: '/mortier/guide', has: [{ type: 'query', key: 'tab', value: 'guide' }] })
    expect(hasAppPage('/mortier')).toBe(true)
    expect(hasAppPage('/mortier/guide')).toBe(true)
  })

  it('pages refondues le 2026-10-23 : vraie redirection HTTP, plus de page qui répond 200 puis rafraîchit', async () => {
    const rules = await nextConfig.redirects!()
    expect(rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: '/clans/:clanId/stats/heatmap-kills', destination: '/clans/:clanId/stats/maps', permanent: false }),
        expect.objectContaining({
          source: '/clans/:clanId/telemetry/matches/:matchId/telemetry',
          destination: '/clans/:clanId/telemetry/matches/:matchId/debrief',
          permanent: false,
        }),
      ])
    )
    expect(hasAppPage('/clans/:clanId/stats/heatmap-kills')).toBe(false)
    expect(hasAppPage('/clans/:clanId/telemetry/matches/:matchId/telemetry')).toBe(false)
  })

  it('anciennes pages de télémétrie d’un match et d’une manche (liens Discord publiés) : redirection HTTP vers le débriefing', async () => {
    const rules = await nextConfig.redirects!()
    expect(rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: '/clans/:clanId/matches/:matchId/telemetry',
          destination: '/clans/:clanId/telemetry/matches/:matchId/debrief',
          permanent: false,
        }),
        expect.objectContaining({
          source: '/tournaments/:tournamentId/matches/:matchId/telemetry',
          destination: '/tournaments/:tournamentId/matches/:matchId',
          permanent: false,
        }),
      ])
    )
    expect(hasAppPage('/clans/:clanId/matches/:matchId/telemetry')).toBe(false)
    expect(hasAppPage('/tournaments/:tournamentId/matches/:matchId/telemetry')).toBe(false)
  })

  it('les anciennes pages de tournoi par clan mènent aux pages globales, identifiant compris', async () => {
    const rules = await nextConfig.redirects!()
    expect(rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: '/clans/:clanId/tournaments', destination: '/tournaments', permanent: false }),
        expect.objectContaining({
          source: '/clans/:clanId/tournaments/:tournamentId',
          destination: '/tournaments/:tournamentId',
          permanent: false,
        }),
      ])
    )
  })
})
