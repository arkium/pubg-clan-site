import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  upsert: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    appConfig: { findMany: mocks.findMany, upsert: mocks.upsert },
    $transaction: mocks.transaction,
  },
}))

import {
  clampCoachNumber,
  COACH_SETTING_DEFAULTS,
  COACH_SETTING_KEYS,
  getCoachSettings,
  hasCoachApiKey,
  parseCoachSettings,
  resetCoachSettingsCache,
  sanitizeCoachSettingsPatch,
  setCoachSettings,
} from '@/lib/coach/coach-config'

describe('réglages du Coach IA — lecture pure', () => {
  it('part fermé, sur le modèle par défaut', () => {
    const settings = parseCoachSettings({}, {})
    expect(settings).toEqual(COACH_SETTING_DEFAULTS)
    expect(settings.enabled).toBe(false)
    expect(settings.model).toBe('gemini-3.5-flash-lite')
  })

  it('lit la base, puis l’environnement, puis le défaut pour le modèle', () => {
    expect(parseCoachSettings({ coach_model: 'gemini-3.8-flash' }, { COACH_MODEL: 'gemini-3.1-flash-lite' }).model).toBe('gemini-3.8-flash')
    expect(parseCoachSettings({ coach_model: 'gemini-2.5-flash-lite' }, { COACH_MODEL: 'gemini-3.1-flash-lite' }).model).toBe('gemini-3.1-flash-lite')
    expect(parseCoachSettings({}, { COACH_MODEL: 'n-importe-quoi' }).model).toBe('gemini-3.5-flash-lite')
  })

  it('borne les nombres et comprend la virgule française', () => {
    expect(parseCoachSettings({ coach_hourly_limit: '500' }, {}).hourlyLimit).toBe(200)
    expect(parseCoachSettings({ coach_hourly_limit: '0' }, {}).hourlyLimit).toBe(1)
    expect(parseCoachSettings({ coach_hourly_limit: 'abc' }, {}).hourlyLimit).toBe(20)
    expect(parseCoachSettings({ coach_budget_per_account_eur: '2,50' }, {}).budgetPerAccountEur).toBe(2.5)
    expect(clampCoachNumber('usdEurRate', 0.86123)).toBe(0.8612)
    expect(clampCoachNumber('maxToolRounds', 3.7)).toBe(4)
  })

  it('lit l’interrupteur', () => {
    expect(parseCoachSettings({ coach_enabled: 'true' }, {}).enabled).toBe(true)
    expect(parseCoachSettings({ coach_enabled: '0' }, {}).enabled).toBe(false)
    expect(parseCoachSettings({ coach_enabled: 'oui' }, {}).enabled).toBe(false)
  })

  it('nettoie un patch de route : inconnu ignoré, modèle vérifié, nombre borné', () => {
    const { accepted, errors } = sanitizeCoachSettingsPatch({
      enabled: true,
      model: 'gemini-2.5-flash-lite',
      hourlyLimit: '30',
      globalBudgetEur: 'beaucoup',
      ...({ inconnu: 1 } as Record<string, unknown>),
    })
    expect(accepted).toEqual({ enabled: true, hourlyLimit: 30 })
    expect(errors).toEqual(['model : modèle inconnu du catalogue.', 'globalBudgetEur : nombre attendu.'])
    expect(sanitizeCoachSettingsPatch({ enabled: 'true' }).errors).toEqual(['enabled : vrai ou faux attendu.'])
  })

  it('sait si la clé d’API est posée sans la renvoyer', () => {
    expect(hasCoachApiKey({})).toBe(false)
    expect(hasCoachApiKey({ GEMINI_API_KEY: '  ' })).toBe(false)
    expect(hasCoachApiKey({ GEMINI_API_KEY: 'x' })).toBe(true)
  })
})

describe('réglages du Coach IA — base', () => {
  beforeEach(() => {
    resetCoachSettingsCache()
    mocks.findMany.mockReset()
    mocks.upsert.mockReset()
    mocks.transaction.mockReset()
    mocks.transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops))
    mocks.upsert.mockImplementation(async (args: { create: { key: string; value: string } }) => args.create)
  })

  it('lit toutes les clés en une requête et met en cache', async () => {
    mocks.findMany.mockResolvedValue([{ key: 'coach_enabled', value: 'true' }, { key: 'coach_hourly_limit', value: '12' }])
    const first = await getCoachSettings()
    expect(first.enabled).toBe(true)
    expect(first.hourlyLimit).toBe(12)
    expect(mocks.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.findMany.mock.calls[0][0].where.key.in).toEqual(Object.values(COACH_SETTING_KEYS))
    await getCoachSettings()
    expect(mocks.findMany).toHaveBeenCalledTimes(1)
  })

  it('rend les valeurs de repli quand la base ne répond pas', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.findMany.mockRejectedValue(new Error('down'))
    expect(await getCoachSettings()).toEqual(COACH_SETTING_DEFAULTS)
    silence.mockRestore()
  })

  it('écrit chaque réglage du patch en une transaction et relit', async () => {
    mocks.findMany.mockResolvedValue([{ key: 'coach_model', value: 'gemini-3.8-flash' }])
    const settings = await setCoachSettings({ model: 'gemini-3.8-flash', hourlyLimit: 30 })
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.upsert).toHaveBeenCalledTimes(2)
    expect(mocks.upsert.mock.calls.map((call) => call[0].create)).toEqual([
      { key: 'coach_model', value: 'gemini-3.8-flash' },
      { key: 'coach_hourly_limit', value: '30' },
    ])
    expect(settings.model).toBe('gemini-3.8-flash')
  })
})
