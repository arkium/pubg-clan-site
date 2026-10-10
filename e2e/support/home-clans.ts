import type { HomeShowcasePayload, ShowcaseClan } from '@/lib/home-showcase'

import { homeShowcase } from './data'

/**
 * Hub des clans de la vitrine (fin de page) — six clans fictifs : quatre classés (montée, baisse, stable, nouveau
 * classé), un en qualification, un sans partie de la semaine. Le premier a un logo absent du serveur (repli).
 */
export const HUB_CLANS: ShowcaseClan[] = [
  {
    clanId: 1,
    name: 'La Meute',
    tag: 'LMT',
    logoUrl: '/uploads/clans/absent.png',
    overviewPath: '/clans/1/overview',
    league: { status: 'ranked', rank: 1, powerScore: 1486, matches: 44, rankDelta: 2 },
  },
  {
    clanId: 2,
    name: 'Les Ratz',
    tag: 'RATZ',
    logoUrl: null,
    overviewPath: '/clans/2/overview',
    league: { status: 'ranked', rank: 2, powerScore: 1412, matches: 38, rankDelta: -1 },
  },
  {
    clanId: 3,
    name: 'La Team France',
    tag: 'LTF',
    logoUrl: null,
    overviewPath: '/clans/3/overview',
    league: { status: 'ranked', rank: 3, powerScore: 1290, matches: 31, rankDelta: 0 },
  },
  {
    clanId: 4,
    name: 'Bof Team',
    tag: 'BOFS',
    logoUrl: null,
    overviewPath: '/clans/4/overview',
    league: { status: 'ranked', rank: 4, powerScore: 1104, matches: 19, rankDelta: null },
  },
  {
    clanId: 5,
    name: 'Crazy Academy',
    tag: 'CRZ',
    logoUrl: null,
    overviewPath: '/clans/5/overview',
    league: { status: 'qualifying', matches: 3, required: 5 },
  },
  {
    clanId: 6,
    name: 'Fun’s Nest',
    tag: 'FNE',
    logoUrl: null,
    overviewPath: '/clans/6/overview',
    league: { status: 'idle' },
  },
]

/** Vitrine de `homeShowcase()` avec le hub des clans rempli. */
export function homeShowcaseWithClans(): HomeShowcasePayload {
  return { ...homeShowcase(), clans: HUB_CLANS }
}
