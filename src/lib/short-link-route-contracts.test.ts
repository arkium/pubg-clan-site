import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Pages des liens courts `/m`, `/t`, `/j` (docs/TODO/url-masking.md §4 et §6). `redirect` et `notFound` lèvent, comme
 * dans Next.js : le test lit la destination dans l'erreur.
 */

const mocks = vi.hoisted(() => ({
  squadMatchFindUnique: vi.fn(),
  tournamentFindUnique: vi.fn(),
  clanMemberFindUnique: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    squadMatch: { findUnique: mocks.squadMatchFindUnique },
    tournament: { findUnique: mocks.tournamentFindUnique },
    clanMember: { findUnique: mocks.clanMemberFindUnique },
  },
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`)
  },
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
}))

import ShortMatchLinkPage from '@/app/m/[matchId]/page'
import ShortTournamentLinkPage from '@/app/t/[tournamentId]/page'
import ShortTournamentRoundLinkPage from '@/app/t/[tournamentId]/[matchId]/page'
import ShortPlayerLinkPage from '@/app/j/[memberId]/page'
import { chooseMatchClan } from '@/lib/short-link-resolution'

const MATCH = 'cmatch0000000000000000001'
const TOURNAMENT = 'ctour00000000000000000001'

const SMOKE = { id: 2, name: 'Smoke', tag: 'SMK', subdomain: 'smk' }
const RATZ = { id: 6, name: 'Les-Ratz', tag: 'RATZ', subdomain: null }

function matchWithClans(...clans: Array<typeof SMOKE>) {
  return { members: clans.map((clan) => ({ member: { clan } })) }
}

async function openMatch(matchId: string, query: Record<string, string> = {}) {
  return ShortMatchLinkPage({ params: Promise.resolve({ matchId }), searchParams: Promise.resolve(query) })
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
})

/** Destination exacte : une inclusion laisserait passer un paramètre de trop. */
async function expectRedirect(page: Promise<unknown>, url: string) {
  const error = await page.then(
    () => null,
    (reason: unknown) => reason
  )
  expect(error instanceof Error ? error.message : error).toBe(`REDIRECT ${url}`)
}

describe('/m/<match>', () => {
  it('un seul clan suivi : 307 vers son débriefing, contexte transmis et filtré', async () => {
    mocks.squadMatchFindUnique.mockResolvedValue(matchWithClans(SMOKE, SMOKE))

    await expectRedirect(openMatch(MATCH, { period: 'month', fromDate: '2026-10-18', evil: 'x' }), `/clans/2/telemetry/matches/${MATCH}/debrief?period=month&fromDate=2026-10-18`)
    // Clans actifs et hors parking seulement, lus en une requête.
    expect(mocks.squadMatchFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MATCH },
        select: expect.objectContaining({
          members: expect.objectContaining({ where: { member: { clan: { isActive: true, isSystem: false } } } }),
        }),
      })
    )
  })

  it('contexte mal formé : ignoré', async () => {
    mocks.squadMatchFindUnique.mockResolvedValue(matchWithClans(SMOKE))

    await expectRedirect(openMatch(MATCH, { period: '<script>', fromDate: 'hier' }), `/clans/2/telemetry/matches/${MATCH}/debrief`)
  })

  it('match partagé : le sous-domaine d’un clan du match l’emporte', async () => {
    mocks.squadMatchFindUnique.mockResolvedValue(matchWithClans(RATZ, SMOKE))

    await expectRedirect(openMatch(MATCH, { c: 'SMK' }), `/clans/2/telemetry/matches/${MATCH}/debrief`)
  })

  it('match partagé sans indication, ou sous-domaine étranger au match : page de choix', async () => {
    mocks.squadMatchFindUnique.mockResolvedValue(matchWithClans(SMOKE, RATZ))

    await expect(openMatch(MATCH)).resolves.toBeTruthy()
    await expect(openMatch(MATCH, { c: 'bofs' })).resolves.toBeTruthy()
    expect(chooseMatchClan([SMOKE, RATZ], null)).toEqual({ kind: 'choice', clans: [RATZ, SMOKE] })
  })

  it('cuid invalide : 404 sans lecture en base ; match inconnu ou sans clan suivi : 404', async () => {
    await expect(openMatch('pas-un-cuid')).rejects.toThrow('NOT_FOUND')
    expect(mocks.squadMatchFindUnique).not.toHaveBeenCalled()

    mocks.squadMatchFindUnique.mockResolvedValueOnce(null)
    await expect(openMatch(MATCH)).rejects.toThrow('NOT_FOUND')

    mocks.squadMatchFindUnique.mockResolvedValueOnce({ members: [] })
    await expect(openMatch(MATCH)).rejects.toThrow('NOT_FOUND')
  })
})

describe('/t/<tournoi>[/<match>]', () => {
  it('tournoi : 307 vers sa page ; inconnu ou hors format : 404', async () => {
    mocks.tournamentFindUnique.mockResolvedValueOnce({ id: TOURNAMENT })
    await expectRedirect(ShortTournamentLinkPage({ params: Promise.resolve({ tournamentId: TOURNAMENT }) }), `/tournaments/${TOURNAMENT}`)

    mocks.tournamentFindUnique.mockResolvedValueOnce(null)
    await expect(ShortTournamentLinkPage({ params: Promise.resolve({ tournamentId: TOURNAMENT }) })).rejects.toThrow(
      'NOT_FOUND'
    )

    await expect(ShortTournamentLinkPage({ params: Promise.resolve({ tournamentId: 'coupe' }) })).rejects.toThrow(
      'NOT_FOUND'
    )
    expect(mocks.tournamentFindUnique).toHaveBeenCalledTimes(2)
  })

  it('manche : 307 vers le débriefing en vue tournoi, Replay 2D sur demande', async () => {
    mocks.tournamentFindUnique.mockResolvedValue({ id: TOURNAMENT })
    mocks.squadMatchFindUnique.mockResolvedValue({ id: MATCH })
    const open = (query: Record<string, string>) =>
      ShortTournamentRoundLinkPage({
        params: Promise.resolve({ tournamentId: TOURNAMENT, matchId: MATCH }),
        searchParams: Promise.resolve(query),
      })

    await expectRedirect(open({}), `/tournaments/${TOURNAMENT}/matches/${MATCH}`)
    await expectRedirect(open({ tab: 'replay' }), `/tournaments/${TOURNAMENT}/matches/${MATCH}?tab=replay`)
    await expectRedirect(open({ tab: 'autre' }), `/tournaments/${TOURNAMENT}/matches/${MATCH}`)
  })

  it('manche inconnue : 404', async () => {
    mocks.tournamentFindUnique.mockResolvedValue({ id: TOURNAMENT })
    mocks.squadMatchFindUnique.mockResolvedValue(null)

    await expect(
      ShortTournamentRoundLinkPage({
        params: Promise.resolve({ tournamentId: TOURNAMENT, matchId: MATCH }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow('NOT_FOUND')
  })
})

describe('/j/<joueur>', () => {
  it('joueur connu : 307 vers son tableau de bord', async () => {
    mocks.clanMemberFindUnique.mockResolvedValue({ id: 42 })

    await expectRedirect(ShortPlayerLinkPage({ params: Promise.resolve({ memberId: '42' }) }), '/members/42/dashboard')
    expect(mocks.clanMemberFindUnique).toHaveBeenCalledWith({ where: { id: 42 }, select: { id: true } })
  })

  it.each(['abc', '0', '012', '12345678901', '4.2'])('identifiant « %s » : 404 sans lecture en base', async (memberId) => {
    await expect(ShortPlayerLinkPage({ params: Promise.resolve({ memberId }) })).rejects.toThrow('NOT_FOUND')
    expect(mocks.clanMemberFindUnique).not.toHaveBeenCalled()
  })

  it('joueur inconnu : 404', async () => {
    mocks.clanMemberFindUnique.mockResolvedValue(null)

    await expect(ShortPlayerLinkPage({ params: Promise.resolve({ memberId: '42' }) })).rejects.toThrow('NOT_FOUND')
  })
})
