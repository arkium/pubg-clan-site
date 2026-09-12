import { describe, it, expect } from 'vitest'
import MatchTypeBadge from '@/components/ui/MatchTypeBadge'

describe('MatchTypeBadge', () => {
  it('returns null for empty or official match types by default', () => {
    expect(MatchTypeBadge({ matchType: null })).toBeNull()
    expect(MatchTypeBadge({ matchType: undefined })).toBeNull()
    expect(MatchTypeBadge({ matchType: 'official' })).toBeNull()
    expect(MatchTypeBadge({ matchType: 'OFFICIAL' })).toBeNull()
  })

  it('renders a badge for event match type', () => {
    const badge = MatchTypeBadge({ matchType: 'event' })
    expect(badge).not.toBeNull()
    expect(badge?.props.children).toBe('Event')
    expect(badge?.props.className).toContain('bg-amber-100')
  })

  it('renders a badge for arcade match type', () => {
    const badge = MatchTypeBadge({ matchType: 'arcade' })
    expect(badge).not.toBeNull()
    expect(badge?.props.children).toBe('Arcade')
    expect(badge?.props.className).toContain('bg-rose-100')
  })

  it('renders a badge for casual and airoyale match types', () => {
    const badge1 = MatchTypeBadge({ matchType: 'casual' })
    expect(badge1?.props.children).toBe('Casual')
    expect(badge1?.props.className).toContain('bg-blue-100')

    const badge2 = MatchTypeBadge({ matchType: 'airoyale' })
    expect(badge2?.props.children).toBe('Casual')
  })

  it('renders a badge for custom match type', () => {
    const badge = MatchTypeBadge({ matchType: 'custom' })
    expect(badge?.props.children).toBe('Custom')
    expect(badge?.props.className).toContain('bg-purple-100')
  })

  it('supports size="sm"', () => {
    const badge = MatchTypeBadge({ matchType: 'event', size: 'sm' })
    expect(badge?.props.className).toContain('text-xs')
  })
})
