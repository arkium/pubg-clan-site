import { describe, it, expect } from 'vitest'
import { getFallbackParent } from './nav-parent-registry'

describe('nav-parent-registry', () => {
  it('résout correctement un parent statique (sans paramètres)', () => {
    const result = getFallbackParent('clan.overview', {})
    expect(result).toBeDefined()
    expect(result?.href).toBe('/clans')
    expect(result?.label).toBe('Liste des clans')
  })

  it('résout correctement un parent avec un paramètre dynamique', () => {
    const result = getFallbackParent('clan.members', { clanId: 123 })
    expect(result).toBeDefined()
    expect(result?.href).toBe('/clans/123/overview')
    expect(result?.label).toBe("Vue d'ensemble") // from the NAV_REGISTRY actually, or the fallback
    expect(result?.altHref).toBe('/clans')
  })

  it('résout correctement un parent avec plusieurs paramètres dynamiques', () => {
    const result = getFallbackParent('member.stats', { clanId: 456, id: 789 })
    expect(result).toBeDefined()
    expect(result?.href).toBe('/members/789/dashboard')
    expect(result?.label).toBe('Dashboard')
  })

  it('renvoie null pour une route inconnue', () => {
    const result = getFallbackParent('unknown.route', { id: 1 })
    expect(result).toBeNull()
  })
})
