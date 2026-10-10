import { afterEach, describe, expect, it } from 'vitest'

import { buildNotificationEmail } from '@/lib/notification-email'
import { siteName } from '@/lib/site-name'

describe('siteName', () => {
  const previous = process.env.SITE_NAME

  afterEach(() => {
    if (previous === undefined) delete process.env.SITE_NAME
    else process.env.SITE_NAME = previous
  })

  it('lit SITE_NAME, sinon chickendinner.fr (valeur vide comprise)', () => {
    expect(siteName({ SITE_NAME: ' Chicken Dinner FR ' })).toBe('Chicken Dinner FR')
    expect(siteName({ SITE_NAME: '  ' })).toBe('chickendinner.fr')
    expect(siteName({})).toBe('chickendinner.fr')
  })

  it('signe le pied des e-mails de notification', () => {
    process.env.SITE_NAME = 'Chicken Dinner FR'
    const { text } = buildNotificationEmail(
      { memberId: 42, displayName: 'Arkium_FR', title: 'Nouveau défi lancé', message: 'Un défi démarre.' },
      new URL('https://chickendinner.fr'),
      null
    )
    expect(text).toContain('activées pour Arkium_FR sur Chicken Dinner FR.')
  })
})
