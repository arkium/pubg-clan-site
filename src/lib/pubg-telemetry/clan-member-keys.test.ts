import { describe, expect, it } from 'vitest'

import { buildClanMemberKeys } from '@/lib/pubg-telemetry/clan-member-keys'

describe('buildClanMemberKeys', () => {
  it('réunit comptes et pseudos en minuscules', () => {
    expect(
      buildClanMemberKeys([
        { pubgAccountId: 'account.ABC', pubgPlayerName: 'Pagiotte' },
        { pubgAccountId: null, pubgPlayerName: 'SAMUELAXEII' },
      ])
    ).toEqual(new Set(['account.abc', 'pagiotte', 'samuelaxeii']))
  })

  it('renvoie undefined sans aucune clé exploitable', () => {
    expect(buildClanMemberKeys([])).toBeUndefined()
    expect(buildClanMemberKeys([{ pubgAccountId: null, pubgPlayerName: null }])).toBeUndefined()
  })
})
