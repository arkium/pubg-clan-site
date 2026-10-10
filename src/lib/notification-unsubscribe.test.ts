import { describe, expect, it } from 'vitest'

import {
  createUnsubscribeToken,
  notificationLinkSecret,
  notificationUnsubscribeLinks,
  verifyUnsubscribeToken,
} from '@/lib/notification-unsubscribe'

const SECRET = 'un-secret-de-test-assez-long'
const OTHER_SECRET = 'un-autre-secret-de-test-long'

describe('notification-unsubscribe', () => {
  it('signe et relit le membre du jeton', () => {
    const token = createUnsubscribeToken(42, SECRET)
    expect(token).toMatch(/^42\.[A-Za-z0-9_-]{43}$/)
    expect(verifyUnsubscribeToken(token, SECRET)).toBe(42)
  })

  it('refuse un jeton modifié, d’un autre membre ou d’un autre secret', () => {
    const token = createUnsubscribeToken(42, SECRET)!
    const signature = token.split('.')[1]
    expect(verifyUnsubscribeToken(`43.${signature}`, SECRET)).toBeNull()
    const tampered = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
    expect(verifyUnsubscribeToken(`42.${tampered}`, SECRET)).toBeNull()
    expect(verifyUnsubscribeToken(token, OTHER_SECRET)).toBeNull()
    expect(verifyUnsubscribeToken('42', SECRET)).toBeNull()
    expect(verifyUnsubscribeToken('', SECRET)).toBeNull()
    expect(verifyUnsubscribeToken(null, SECRET)).toBeNull()
  })

  it('ne produit ni ne vérifie rien sans secret', () => {
    expect(createUnsubscribeToken(42, null)).toBeNull()
    expect(verifyUnsubscribeToken(createUnsubscribeToken(42, SECRET), null)).toBeNull()
    expect(notificationUnsubscribeLinks(42, new URL('https://chickendinner.fr'), null)).toBeNull()
  })

  it('choisit NOTIFICATION_LINK_SECRET, sinon AUTH_BOOTSTRAP_SECRET — jamais la valeur d’exemple ni une clé courte', () => {
    expect(notificationLinkSecret({ NOTIFICATION_LINK_SECRET: SECRET, AUTH_BOOTSTRAP_SECRET: OTHER_SECRET })).toBe(SECRET)
    expect(notificationLinkSecret({ AUTH_BOOTSTRAP_SECRET: OTHER_SECRET })).toBe(OTHER_SECRET)
    expect(notificationLinkSecret({ NOTIFICATION_LINK_SECRET: 'court', AUTH_BOOTSTRAP_SECRET: OTHER_SECRET })).toBe(OTHER_SECRET)
    expect(notificationLinkSecret({ AUTH_BOOTSTRAP_SECRET: 'change-me-long-random-string' })).toBeNull()
    expect(notificationLinkSecret({})).toBeNull()
  })

  it('page de confirmation dans le texte, route API pour le désabonnement en un clic', () => {
    const links = notificationUnsubscribeLinks(42, new URL('https://chickendinner.fr'), SECRET)!
    const token = encodeURIComponent(createUnsubscribeToken(42, SECRET)!)
    expect(links.pageUrl).toBe(`https://chickendinner.fr/notifications/desabonnement?t=${token}`)
    expect(links.oneClickUrl).toBe(`https://chickendinner.fr/api/notifications/unsubscribe?t=${token}`)
  })
})
