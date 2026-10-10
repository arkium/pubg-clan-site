import { describe, expect, it } from 'vitest'

import { buildNotificationEmail, NOTIFICATION_EMAIL_EXAMPLE } from '@/lib/notification-email'

const BASE = new URL('https://chickendinner.fr')
const LINKS = {
  pageUrl: 'https://chickendinner.fr/notifications/desabonnement?t=42.sig',
  oneClickUrl: 'https://chickendinner.fr/api/notifications/unsubscribe?t=42.sig',
}
const INPUT = { memberId: 42, displayName: 'Arkium_FR', ...NOTIFICATION_EMAIL_EXAMPLE }

describe('buildNotificationEmail', () => {
  it('reprend le titre en objet, le titre et le message dans le texte', () => {
    const email = buildNotificationEmail(INPUT, BASE, LINKS)
    expect(email.subject).toBe('Nouvelle partie en escouade')
    expect(email.text).toContain('Bonjour Arkium_FR,')
    expect(email.text).toContain('Nouvelle partie en escouade\nTon escouade a joué ensemble sur Erangel — top 3.')
  })

  it('mène aux notifications et aux préférences du membre', () => {
    const { text } = buildNotificationEmail(INPUT, BASE, LINKS)
    expect(text).toContain('Voir mes notifications : https://chickendinner.fr/members/42/notifications')
    expect(text).toContain('Choisir ce qui te prévient : https://chickendinner.fr/members/42/notification-preferences')
  })

  it('porte le lien de désabonnement et les en-têtes du désabonnement en un clic (RFC 8058)', () => {
    const email = buildNotificationEmail(INPUT, BASE, LINKS)
    expect(email.text.endsWith(`Ne plus recevoir ces e-mails : ${LINKS.pageUrl}`)).toBe(true)
    expect(email.headers).toEqual({
      'List-Unsubscribe': `<${LINKS.oneClickUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    })
  })

  it('sans secret de lien : ni lien de désabonnement, ni en-têtes — les préférences restent', () => {
    const email = buildNotificationEmail(INPUT, BASE, null)
    expect(email.text).not.toContain('Ne plus recevoir')
    expect(email.text).toContain('/members/42/notification-preferences')
    expect(email.headers).toEqual({})
  })
})
