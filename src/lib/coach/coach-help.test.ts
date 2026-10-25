import { describe, expect, it, vi } from 'vitest'

/**
 * Aide du Coach IA : les domaines affichés couvrent exactement les outils déclarés (un outil ajouté sans domaine, ou
 * un domaine qui cite un outil disparu, casse ici), chaque domaine a des exemples, et les textes tutoient.
 */

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { COACH_TOOL_DECLARATIONS } from '@/lib/coach/coach-tools'
import { COACH_HELP_DOMAINS, COACH_HELP_IMPROVE, COACH_HELP_LIMITS, COACH_HELP_MEMORY_DOMAIN, COACH_HELP_MEMORY_TIP, coachHelpDomains } from '@/lib/coach/coach-help'
import { COACH_MEMORY_TOOL_NAME } from '@/lib/coach/coach-memory'

describe('aide du Coach IA', () => {
  it('couvre chaque outil déclaré par un domaine, et un seul', () => {
    const declared = COACH_TOOL_DECLARATIONS.map((tool) => tool.name).sort()
    const covered = COACH_HELP_DOMAINS.flatMap((domain) => domain.tools).sort()
    expect(covered).toEqual(declared)
    expect(new Set(covered).size).toBe(covered.length)
  })

  it('réserve la mémoire à son domaine, affiché seulement quand elle est ouverte', () => {
    expect(COACH_HELP_MEMORY_DOMAIN.tools).toEqual([COACH_MEMORY_TOOL_NAME])
    expect(coachHelpDomains(false).map((domain) => domain.id)).not.toContain('memoire')
    expect(coachHelpDomains(true).at(-1)?.id).toBe('memoire')
  })

  it('donne au moins deux exemples par domaine, des limites et des conseils, au tutoiement', () => {
    for (const domain of [...COACH_HELP_DOMAINS, COACH_HELP_MEMORY_DOMAIN]) {
      expect(domain.examples.length, domain.id).toBeGreaterThanOrEqual(2)
      expect(domain.title.length).toBeGreaterThan(3)
    }
    expect(COACH_HELP_LIMITS.length).toBeGreaterThanOrEqual(4)
    expect(COACH_HELP_IMPROVE.length).toBeGreaterThanOrEqual(3)
    const texts = [...COACH_HELP_LIMITS, ...COACH_HELP_IMPROVE, COACH_HELP_MEMORY_TIP, ...COACH_HELP_DOMAINS.flatMap((domain) => domain.examples)]
    for (const text of texts) expect(text).not.toMatch(/\b(vous|votre|vos)\b/i)
  })
})
