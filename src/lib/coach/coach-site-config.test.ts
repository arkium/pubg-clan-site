import { describe, expect, it } from 'vitest'

import { buildSiteConfiguration, type SiteConfigFacts } from '@/lib/site-config'

// Section « Coach IA » de /settings/configuration (docs/TODO/chatbot-ia.md §4.2) : module pur, valeurs fictives.
function facts(env: Record<string, string | undefined>): SiteConfigFacts {
  return {
    env,
    pubgRateLimitRpm: 10,
    latestRateLimit: null,
    email: { ready: false, lastSuccessAt: null, lastError: null },
    standaloneRuntime: false,
  }
}

function coachItems(env: Record<string, string | undefined>) {
  const section = buildSiteConfiguration(facts(env)).sections.find((entry) => entry.id === 'coach')
  if (!section) throw new Error('section Coach IA absente')
  return Object.fromEntries(section.items.map((item) => [item.key, item]))
}

describe('configuration du site — section Coach IA', () => {
  it('dit que le Coach est fermé sans clé, sans jamais afficher la clé', () => {
    const items = coachItems({})
    expect(items.coach_api_key.status).toBe('info')
    expect(items.coach_api_key.value).toBe('absente : Coach fermé')
    expect(items.coach_api_key.fix).toContain('facturation')
    expect(items.coach_model.value).toBe('absente : gemini-3.5-flash-lite')

    const withKey = coachItems({ GEMINI_API_KEY: 'AQ.secret-fictif' })
    expect(withKey.coach_api_key.status).toBe('ok')
    expect(JSON.stringify(withKey)).not.toContain('secret-fictif')
  })

  it('vérifie le modèle de repli au catalogue', () => {
    expect(coachItems({ COACH_MODEL: 'gemini-3.8-flash' }).coach_model).toMatchObject({ status: 'ok', value: 'gemini-3.8-flash' })
    const unknown = coachItems({ COACH_MODEL: 'gemini-2.5-flash-lite' }).coach_model
    expect(unknown.status).toBe('warning')
    expect(unknown.value).toBe('inconnue : gemini-2.5-flash-lite')
    expect(unknown.fix).toBeDefined()
  })
})
