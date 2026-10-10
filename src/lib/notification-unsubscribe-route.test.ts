import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createUnsubscribeToken } from '@/lib/notification-unsubscribe'

// Vitest ne collecte que `src/lib/**` : ce fichier importe la route depuis src/app. Prisma est simulé : rien n'est écrit.
const mocks = vi.hoisted(() => ({
  clanMemberFindUnique: vi.fn(),
  preferenceUpsert: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clanMember: { findUnique: mocks.clanMemberFindUnique },
    notificationPreference: { upsert: mocks.preferenceUpsert },
  },
}))

import { GET, POST } from '@/app/api/notifications/unsubscribe/route'

const SECRET = 'un-secret-de-test-assez-long'

function request(token: string | null, method: 'GET' | 'POST' = 'GET') {
  const query = token === null ? '' : `?t=${encodeURIComponent(token)}`
  return new Request(`http://localhost:3000/api/notifications/unsubscribe${query}`, {
    method,
    // Désabonnement en un clic d'une messagerie (RFC 8058) : corps de formulaire, ignoré par la route.
    ...(method === 'POST' ? { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' } : {}),
  })
}

describe('/api/notifications/unsubscribe', () => {
  const previous = process.env.NOTIFICATION_LINK_SECRET

  beforeEach(() => {
    process.env.NOTIFICATION_LINK_SECRET = SECRET
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.clanMemberFindUnique.mockImplementation(async ({ where }: { where: { id: number } }) =>
      where.id === 42 ? { id: 42, displayName: 'Arkium_FR', notificationPreference: { emailNotifications: true } } : null
    )
    mocks.preferenceUpsert.mockResolvedValue({})
  })

  afterEach(() => {
    if (previous === undefined) delete process.env.NOTIFICATION_LINK_SECRET
    else process.env.NOTIFICATION_LINK_SECRET = previous
  })

  it('GET : rend l’état sans rien modifier', async () => {
    const response = await GET(request(createUnsubscribeToken(42, SECRET)))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ memberId: 42, displayName: 'Arkium_FR', emailNotifications: true })
    expect(mocks.preferenceUpsert).not.toHaveBeenCalled()
  })

  it('POST : coupe seulement le canal e-mail', async () => {
    const response = await POST(request(createUnsubscribeToken(42, SECRET), 'POST'))
    expect(response.status).toBe(200)
    expect(mocks.preferenceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { memberId: 42 }, update: { emailNotifications: false } })
    )
    expect(mocks.preferenceUpsert.mock.calls[0][0].create).toMatchObject({ memberId: 42, emailNotifications: false, inAppNotifications: true })
  })

  it('refuse un jeton absent, faux ou signé par un autre secret (400), sans toucher la base', async () => {
    for (const token of [null, 'n-importe-quoi', createUnsubscribeToken(42, 'un-autre-secret-de-test-long')]) {
      expect((await GET(request(token))).status).toBe(400)
      expect((await POST(request(token, 'POST'))).status).toBe(400)
    }
    expect(mocks.clanMemberFindUnique).not.toHaveBeenCalled()
    expect(mocks.preferenceUpsert).not.toHaveBeenCalled()
  })

  it('membre supprimé : 404', async () => {
    expect((await POST(request(createUnsubscribeToken(7, SECRET), 'POST'))).status).toBe(404)
    expect(mocks.preferenceUpsert).not.toHaveBeenCalled()
  })
})
