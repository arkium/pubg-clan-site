import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Tests des garde-fous de la section « Sûreté d'exécution » (docs/TODO/todo.md, P2).
 *
 * Ce sont eux qui empêchent le cron du chantier 1 de déplacer toute la ligue sur une
 * réponse d'API dégradée. Les scénarios reprennent des mesures réelles du 2026-09-20.
 */

const mocks = vi.hoisted(() => ({
  pubgGet: vi.fn(),
}))

vi.mock('@/lib/api-throttle', () => ({
  // La file est transparente ici : on veut tester le traitement de la réponse.
  enqueuePubgApiRequestWithMetadata: (fn: () => Promise<unknown>) => fn(),
}))

vi.mock('@/lib/pubg', () => ({
  pubgApi: { get: mocks.pubgGet },
}))

import {
  chunkAccountIds,
  clanStateKey,
  fetchPlayersClanStates,
  PLAYER_IDS_BATCH_LIMIT,
  readClanIdState,
  type ClanIdState,
} from '@/lib/clan-lifecycle/clan-state'
import {
  evaluateCircuitBreaker,
  evaluateConfirmations,
  evaluateDepartureConfirmation,
  shouldApplyMovements,
} from '@/lib/clan-lifecycle/safety'

const HAS_CLAN = (clanId: string): ClanIdState => ({ kind: 'has_clan', clanId })
const NO_CLAN: ClanIdState = { kind: 'no_clan' }
const UNKNOWN: ClanIdState = { kind: 'unknown', reason: 'missing_from_response' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Garde-fou A — « champ absent » n’est pas « pas de clan »', () => {
  it('distingue les trois états sur les formes réellement renvoyées par l’API', () => {
    // Mesuré le 2026-09-20 : un joueur sans clan renvoie la chaîne vide.
    expect(readClanIdState({ clanId: 'clan.abc' })).toEqual({ kind: 'has_clan', clanId: 'clan.abc' })
    expect(readClanIdState({ clanId: '' })).toEqual({ kind: 'no_clan' })
    expect(readClanIdState({ clanId: null })).toEqual({ kind: 'no_clan' })
    expect(readClanIdState({ name: 'Joueur' })).toEqual({ kind: 'unknown', reason: 'field_absent' })
    expect(readClanIdState(undefined)).toEqual({ kind: 'unknown', reason: 'field_absent' })
  })

  it('refuse de conclure sur un type inattendu plutôt que de le coercer', () => {
    expect(readClanIdState({ clanId: 42 })).toEqual({ kind: 'unknown', reason: 'unexpected_type' })
  })

  it('accepte les variantes de nommage du champ', () => {
    expect(readClanIdState({ clan_id: 'clan.x' })).toEqual({ kind: 'has_clan', clanId: 'clan.x' })
  })
})

describe('Garde-fou A — complétude des lots', () => {
  it('refuse un lot au-dessus du plafond, car l’API tronque en silence', async () => {
    const tooMany = Array.from({ length: PLAYER_IDS_BATCH_LIMIT + 1 }, (_, i) => `account.${i}`)

    await expect(fetchPlayersClanStates(tooMany, 'steam')).rejects.toThrow(/tronque/i)
    expect(mocks.pubgGet).not.toHaveBeenCalled()
  })

  it('marque `unknown` un compte demandé mais absent de la réponse', async () => {
    // Cas réel : un playerId invalide est silencieusement omis du lot.
    mocks.pubgGet.mockResolvedValue({
      data: { data: [{ id: 'account.a', attributes: { clanId: 'clan.a' } }] },
    })

    const states = await fetchPlayersClanStates(['account.a', 'account.disparu'], 'steam')

    expect(states.get('account.a')).toEqual({ kind: 'has_clan', clanId: 'clan.a' })
    expect(states.get('account.disparu')).toEqual({
      kind: 'unknown',
      reason: 'missing_from_response',
    })
  })

  it('ne conclut rien du tout quand l’appel échoue', async () => {
    mocks.pubgGet.mockRejectedValue(new Error('503'))

    const states = await fetchPlayersClanStates(['account.a', 'account.b'], 'steam')

    expect([...states.values()]).toEqual([
      { kind: 'unknown', reason: 'request_failed' },
      { kind: 'unknown', reason: 'request_failed' },
    ])
  })

  it('découpe une liste plus longue que le plafond', () => {
    const ids = Array.from({ length: 25 }, (_, i) => `account.${i}`)
    const chunks = chunkAccountIds(ids)

    expect(chunks.map((c) => c.length)).toEqual([10, 10, 5])
    expect(chunks.flat()).toEqual(ids)
  })
})

describe('Garde-fou A — N observations stables avant d’agir', () => {
  it('ne déclenche rien sur une seule observation', () => {
    const verdict = evaluateConfirmations([NO_CLAN], 3)

    expect(verdict.shouldAct).toBe(false)
    expect(verdict.remaining).toBe(2)
  })

  it('déclenche quand les N dernières observations sont identiques', () => {
    const verdict = evaluateConfirmations([HAS_CLAN('clan.x'), NO_CLAN, NO_CLAN, NO_CLAN], 3)

    expect(verdict.shouldAct).toBe(true)
    expect(verdict.streak).toBe(3)
    expect(verdict.confirmedState).toEqual(NO_CLAN)
  })

  it('remet la série à zéro à la moindre divergence — cas pagiotte du 2026-09-20', () => {
    // KMS, KMS, "", KMS, KMS, KMS : la série utile ne fait que 3 en fin de parcours.
    const kms = HAS_CLAN('clan.5bb7')
    const verdict = evaluateConfirmations([kms, kms, NO_CLAN, kms, kms, kms], 3)

    expect(verdict.shouldAct).toBe(true)
    expect(verdict.streak).toBe(3)
  })

  it('ne déclenche pas sur le cas Vvila du 2026-09-20 avec N=3', () => {
    // KMS, KMS, KMS, KMS, "", "" : deux `no_clan` en fin de série ne suffisent pas.
    const kms = HAS_CLAN('clan.5bb7')
    const verdict = evaluateConfirmations([kms, kms, kms, kms, NO_CLAN, NO_CLAN], 3)

    expect(verdict.shouldAct).toBe(false)
    expect(verdict.streak).toBe(2)
  })

  it('aurait déclenché à tort avec N=2 — ce qui justifie N=3', () => {
    const kms = HAS_CLAN('clan.5bb7')
    const verdict = evaluateConfirmations([kms, kms, kms, kms, NO_CLAN, NO_CLAN], 2)

    expect(verdict.shouldAct).toBe(true)
  })

  it('une observation incertaine casse la série au lieu de la prolonger', () => {
    const verdict = evaluateConfirmations([NO_CLAN, NO_CLAN, UNKNOWN], 3)

    expect(verdict.shouldAct).toBe(false)
    expect(verdict.streak).toBe(0)
  })

  it('ne déclenche JAMAIS sur une série entièrement incertaine', () => {
    // Le cas dangereux : N réponses dégradées d'affilée sont « identiques » entre
    // elles. Sans garde explicite, la règle de stabilité les prendrait pour une
    // confirmation et basculerait le joueur sur du vide.
    const verdict = evaluateConfirmations([UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN], 3)

    expect(verdict.shouldAct).toBe(false)
    expect(verdict.streak).toBe(0)
    expect(verdict.confirmedState).toBeNull()
  })

  it('une incertitude au milieu de la série ne la traverse pas', () => {
    const verdict = evaluateConfirmations([NO_CLAN, UNKNOWN, NO_CLAN, NO_CLAN], 3)

    expect(verdict.shouldAct).toBe(false)
    expect(verdict.streak).toBe(2)
  })

  it('ne confond pas deux clans différents dans une même série', () => {
    const verdict = evaluateConfirmations([HAS_CLAN('clan.a'), HAS_CLAN('clan.b'), HAS_CLAN('clan.b')], 3)

    expect(verdict.shouldAct).toBe(false)
    expect(verdict.streak).toBe(2)
  })

  it('traite un historique vide sans planter', () => {
    expect(evaluateConfirmations([], 3)).toMatchObject({ shouldAct: false, streak: 0 })
  })
})

describe('Garde-fou A — confirmation du DEPART, independamment de la destination', () => {
  const SMK = 'clan.b4c35f61'
  const KMS = 'clan.5bb72090'

  it('confirme le depart meme quand la destination clignote — cas reel du 2026-09-20', () => {
    // 540 observations cumulees : Vvila et pagiotte ont contredit SMK 12 fois sur 12,
    // en alternant seulement entre KMS et « aucun clan ».
    const serie = [
      HAS_CLAN(KMS),
      HAS_CLAN(KMS),
      NO_CLAN,
      HAS_CLAN(KMS),
      HAS_CLAN(KMS),
      NO_CLAN,
    ]

    expect(evaluateDepartureConfirmation(serie, SMK, 3).shouldAct).toBe(true)
    // La destination, elle, n'est pas stable : le joueur ira au parking.
    expect(evaluateConfirmations(serie, 3).shouldAct).toBe(false)
  })

  it('ne confirme pas un depart si le joueur revient dans son clan', () => {
    const serie = [HAS_CLAN(KMS), HAS_CLAN(KMS), HAS_CLAN(SMK)]

    expect(evaluateDepartureConfirmation(serie, SMK, 3).shouldAct).toBe(false)
    expect(evaluateDepartureConfirmation(serie, SMK, 3).streak).toBe(0)
  })

  it('une incertitude interrompt la confirmation de depart', () => {
    const serie = [NO_CLAN, NO_CLAN, UNKNOWN]

    expect(evaluateDepartureConfirmation(serie, SMK, 3).shouldAct).toBe(false)
  })

  it('traite « sans clan cote site » comme un depart quand un clan est observe', () => {
    // Membre du clan technique (pas de pubgClanId) qui rejoint un vrai clan.
    const serie = [HAS_CLAN(KMS), HAS_CLAN(KMS), HAS_CLAN(KMS)]

    expect(evaluateDepartureConfirmation(serie, null, 3).shouldAct).toBe(true)
  })

  it('ne voit pas de depart pour un membre du clan technique toujours sans clan', () => {
    const serie = [NO_CLAN, NO_CLAN, NO_CLAN]

    expect(evaluateDepartureConfirmation(serie, null, 3).shouldAct).toBe(false)
  })
})

describe('Garde-fou A — coupe-circuit de volumétrie', () => {
  it('laisse passer un passage de routine', () => {
    const verdict = evaluateCircuitBreaker({ plannedMoves: 2, trackedTotal: 324, maxRatioPercent: 10 })

    expect(verdict.tripped).toBe(false)
    expect(verdict.ratioPercent).toBeCloseTo(0.62, 2)
  })

  it('saute quand la part dépasse le seuil', () => {
    const verdict = evaluateCircuitBreaker({ plannedMoves: 60, trackedTotal: 324, maxRatioPercent: 10 })

    expect(verdict.tripped).toBe(true)
  })

  it('ne saute pas exactement au seuil', () => {
    // 10 % pile reste acceptable ; c'est le dépassement qui déclenche.
    const verdict = evaluateCircuitBreaker({ plannedMoves: 4, trackedTotal: 40, maxRatioPercent: 10 })

    expect(verdict.tripped).toBe(false)
  })

  it('ne saute jamais quand aucun mouvement n’est prévu', () => {
    const verdict = evaluateCircuitBreaker({ plannedMoves: 0, trackedTotal: 0, maxRatioPercent: 10 })

    expect(verdict.tripped).toBe(false)
  })
})

describe('Garde-fou B — mode observation', () => {
  it('n’applique rien en mode observe, même sans coupe-circuit', () => {
    const breaker = evaluateCircuitBreaker({ plannedMoves: 1, trackedTotal: 324, maxRatioPercent: 10 })

    expect(shouldApplyMovements('observe', breaker)).toBe(false)
    expect(shouldApplyMovements('apply', breaker)).toBe(true)
  })

  it('n’applique rien en mode apply si le coupe-circuit a sauté', () => {
    const breaker = evaluateCircuitBreaker({ plannedMoves: 200, trackedTotal: 324, maxRatioPercent: 10 })

    expect(shouldApplyMovements('apply', breaker)).toBe(false)
  })
})

describe('Clé de comparaison des états', () => {
  it('produit la même clé pour deux états équivalents et des clés distinctes sinon', () => {
    expect(clanStateKey(HAS_CLAN('clan.a'))).toBe(clanStateKey(HAS_CLAN('clan.a')))
    expect(clanStateKey(HAS_CLAN('clan.a'))).not.toBe(clanStateKey(HAS_CLAN('clan.b')))
    expect(clanStateKey(NO_CLAN)).not.toBe(clanStateKey(HAS_CLAN('clan.a')))
  })
})
