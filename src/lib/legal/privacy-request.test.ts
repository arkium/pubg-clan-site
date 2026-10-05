import { describe, expect, it } from 'vitest'

import { LEGAL_LINKS, LEGAL_PATHS } from './legal-info'
import {
  clientKeyOf,
  createSlidingWindowLimiter,
  isHoneypotFilled,
  privacyRequestDeadline,
  privacyRequestEmail,
  privacyRequestNotification,
  validatePrivacyRequest,
} from './privacy-request'

const VALID = { pubgName: ' Arkium_FR ', kind: 'hide', reason: '', email: ' joueur@exemple.fr ', confirmOwner: true }

describe('validatePrivacyRequest', () => {
  it('accepte une demande complète et nettoie les espaces', () => {
    const result = validatePrivacyRequest(VALID)
    expect(result).toEqual({
      ok: true,
      data: { pubgName: 'Arkium_FR', kind: 'hide', reason: '', email: 'joueur@exemple.fr', confirmOwner: true },
    })
  })

  it('donne le motif vide par défaut et ignore les champs inconnus (dont le champ piège)', () => {
    const withoutReason = { pubgName: VALID.pubgName, kind: VALID.kind, email: VALID.email, confirmOwner: true }
    const result = validatePrivacyRequest({ ...withoutReason, website: 'http://spam' })
    expect(result.ok && result.data).toEqual({
      pubgName: 'Arkium_FR',
      kind: 'hide',
      reason: '',
      email: 'joueur@exemple.fr',
      confirmOwner: true,
    })
  })

  it('renvoie un message par champ fautif, en français', () => {
    const result = validatePrivacyRequest({ pubgName: '   ', kind: 'delete-all', reason: 'x'.repeat(1001), email: 'pas-un-mail', confirmOwner: false })
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        pubgName: 'Indique ton pseudo PUBG.',
        kind: 'Choisis un type de demande.',
        reason: 'Motif trop long : 1 000 caractères au plus.',
        email: 'Adresse e-mail invalide.',
        confirmOwner: 'Confirme être le titulaire de ce compte PUBG.',
      },
    })
  })

  it('exige une adresse e-mail et la case cochée, même absentes du corps', () => {
    const result = validatePrivacyRequest({ pubgName: 'Arkium_FR', kind: 'purge' })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.fieldErrors).toEqual({
      email: 'Indique une adresse e-mail.',
      confirmOwner: 'Confirme être le titulaire de ce compte PUBG.',
    })
  })

  it('refuse un pseudo de plus de 32 caractères', () => {
    const result = validatePrivacyRequest({ ...VALID, pubgName: 'a'.repeat(33) })
    expect(!result.ok && result.fieldErrors.pubgName).toBe('Pseudo trop long : 32 caractères au plus.')
  })

  it('ne plante pas sur un corps qui n’est pas un objet', () => {
    expect(validatePrivacyRequest(null)).toEqual({ ok: false, fieldErrors: {} })
    expect(validatePrivacyRequest('texte')).toEqual({ ok: false, fieldErrors: {} })
  })
})

describe('isHoneypotFilled', () => {
  it('ne se déclenche que sur un champ piège rempli', () => {
    expect(isHoneypotFilled({ website: 'http://spam.example' })).toBe(true)
    expect(isHoneypotFilled({ website: '  ' })).toBe(false)
    expect(isHoneypotFilled({ website: '' })).toBe(false)
    expect(isHoneypotFilled({})).toBe(false)
    expect(isHoneypotFilled(null)).toBe(false)
  })
})

describe('createSlidingWindowLimiter', () => {
  it('bloque au-delà de la limite, sans compter les refus, puis libère à la fin de la fenêtre', () => {
    const limiter = createSlidingWindowLimiter(2, 1000)
    expect(limiter.take('a', 0)).toBe(true)
    expect(limiter.take('a', 100)).toBe(true)
    expect(limiter.take('a', 200)).toBe(false)
    expect(limiter.take('b', 200)).toBe(true)
    // Le premier essai sort de la fenêtre à 1000 ms : une place se libère, pas deux.
    expect(limiter.take('a', 1000)).toBe(true)
    expect(limiter.take('a', 1001)).toBe(false)
  })
})

describe('clientKeyOf', () => {
  it('préfère X-Real-IP posé par Nginx, puis le premier X-Forwarded-For', () => {
    expect(clientKeyOf(new Headers({ 'x-real-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.1' }))).toBe('203.0.113.7')
    expect(clientKeyOf(new Headers({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }))).toBe('198.51.100.1')
    expect(clientKeyOf(new Headers())).toBe('unknown')
  })
})

describe('privacyRequestDeadline', () => {
  it('ajoute un mois, borné au dernier jour du mois suivant', () => {
    expect(privacyRequestDeadline(new Date('2026-10-05T10:00:00Z')).toISOString()).toBe('2026-11-05T10:00:00.000Z')
    expect(privacyRequestDeadline(new Date('2027-01-31T10:00:00Z')).toISOString()).toBe('2027-02-28T10:00:00.000Z')
    expect(privacyRequestDeadline(new Date('2026-12-15T10:00:00Z')).toISOString()).toBe('2027-01-15T10:00:00.000Z')
  })
})

describe('textes de la notification et de l’e-mail', () => {
  const request = {
    id: 12,
    pubgName: 'Arkium_FR',
    kind: 'purge' as const,
    reason: 'Je ne joue plus.',
    email: 'joueur@exemple.fr',
    createdAt: new Date('2026-10-05T10:00:00Z'),
  }

  it('résume la demande dans la notification, échéance comprise', () => {
    expect(privacyRequestNotification(request)).toEqual({
      title: 'Demande sur les données n° 12',
      message: 'Purger mon historique pour Arkium_FR. Réponse à joueur@exemple.fr avant le 5 novembre 2026.',
    })
  })

  it('tient dans les VARCHAR(191) de Notification, même avec une adresse longue', () => {
    const { title, message } = privacyRequestNotification({ ...request, email: `${'x'.repeat(180)}@exemple.fr` })
    expect(title.length).toBeLessThanOrEqual(191)
    expect(message.length).toBeLessThanOrEqual(191)
    expect(message.endsWith('…')).toBe(true)
  })

  it('met tout le détail dans le corps de l’e-mail et rien de saisi dans le sujet', () => {
    const { subject, text } = privacyRequestEmail(request)
    expect(subject).toBe('[chickendinner.fr] Demande sur les données n° 12 : Purger mon historique')
    expect(text).toContain('Pseudo PUBG : Arkium_FR')
    expect(text).toContain('E-mail de réponse : joueur@exemple.fr')
    expect(text).toContain('Motif : Je ne joue plus.')
    expect(text).toContain('Réponse attendue avant le : 5 novembre 2026')
    expect(privacyRequestEmail({ ...request, reason: null }).text).toContain('Motif : (aucun)')
  })
})

describe('liens légaux', () => {
  it('ouvre au public les pages du footer et le formulaire, que seule la page Confidentialité lie', () => {
    expect(LEGAL_LINKS.map((link) => link.label)).toEqual(['Mentions légales', 'Confidentialité', 'À propos'])
    expect(LEGAL_PATHS).toEqual(['/mentions-legales', '/confidentialite', '/a-propos', '/confidentialite/demande'])
  })
})
