import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Chantier 4 — email de contact d'une demande de création de clan.
 *
 * Deux règles, et une contrainte d'exploitation :
 *   - l'email n'est exigé que pour une **création** de clan, jamais pour rejoindre
 *     un clan existant ;
 *   - le refus (`reject`) existe enfin, et laisse le demandeur en `rejected`, état
 *     qui autorise la ré-adhésion ;
 *   - `SMTP_URL` est optionnel : un email qui ne part pas ne doit jamais faire
 *     échouer la décision, qui reste visible dans l'UI SuperUser.
 */

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  clanFindUnique: vi.fn(),
  clanUpdate: vi.fn(),
  memberUpdate: vi.fn(),
  changeUpdateMany: vi.fn(),
  requireSuperUser: vi.fn(),
}))

vi.mock('@/lib/email-service', () => ({ sendEmail: mocks.sendEmail }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    // `update` : le refus archive le clan (docs/TODO/clan-archive.md §3).
    clan: { findUnique: mocks.clanFindUnique, update: mocks.clanUpdate },
    clanMember: { update: mocks.memberUpdate },
    playerClanChange: { updateMany: mocks.changeUpdateMany },
  },
}))

vi.mock('@/middleware/auth-permission', () => ({ requireSuperUser: mocks.requireSuperUser }))

import { sendClanApprovedEmail, sendClanRejectedEmail } from '@/lib/clan-lifecycle/clan-decision-email'
import { POST as rejectClan } from '@/app/api/clans/[clanId]/reject/route'

const params = Promise.resolve({ clanId: '999' })

function rejectRequest(body: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/clans/999/reject', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function pendingClan(overrides: Record<string, unknown> = {}) {
  return {
    id: 999,
    name: 'NouveauClan',
    tag: 'NEW',
    isActive: false,
    isSystem: false,
    members: [
      {
        id: 11,
        pubgPlayerName: 'Vvila',
        contactEmail: 'vvila@example.com',
        roles: [{ role: { name: 'Owner' } }],
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireSuperUser.mockResolvedValue(null)
  mocks.sendEmail.mockResolvedValue({ delivered: true, mode: 'smtp' })
  mocks.memberUpdate.mockResolvedValue({})
  mocks.clanUpdate.mockResolvedValue({})
  mocks.changeUpdateMany.mockResolvedValue({ count: 0 })
})

describe('Notification de décision', () => {
  it('n’envoie rien quand aucun contact n’est connu, sans lever', async () => {
    const result = await sendClanApprovedEmail({
      contactEmail: null,
      clanName: 'X',
      clanTag: 'X',
      playerName: 'Vvila',
    })

    expect(result).toEqual({ sent: false, reason: 'no_contact' })
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('remonte un échec SMTP sans lever — la décision reste prise', async () => {
    mocks.sendEmail.mockRejectedValue(new Error('SMTP indisponible'))

    const result = await sendClanRejectedEmail({
      contactEmail: 'a@b.c',
      clanName: 'X',
      clanTag: 'X',
      playerName: 'Vvila',
    })

    expect(result).toMatchObject({ sent: false, reason: 'failed' })
  })

  it('inclut le motif de refus quand il est fourni', async () => {
    await sendClanRejectedEmail({
      contactEmail: 'a@b.c',
      clanName: 'X',
      clanTag: 'XX',
      playerName: 'Vvila',
      reason: 'Clan inactif depuis trop longtemps',
    })

    expect(mocks.sendEmail.mock.calls[0][0].text).toContain('Clan inactif depuis trop longtemps')
  })
})

describe('Refus d’une demande de clan', () => {
  it('laisse le demandeur en `rejected`, état qui autorise une nouvelle demande', async () => {
    mocks.clanFindUnique.mockResolvedValue(pendingClan())

    const res = await rejectClan(rejectRequest(), { params })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(mocks.memberUpdate).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { isActive: false, joinStatus: 'rejected' },
    })
    expect(data.emailSent).toBe(true)
  })

  it('clôt les mouvements qui attendaient ce clan', async () => {
    mocks.clanFindUnique.mockResolvedValue(pendingClan())
    mocks.changeUpdateMany.mockResolvedValue({ count: 3 })

    const data = await (await rejectClan(rejectRequest(), { params })).json()

    expect(mocks.changeUpdateMany).toHaveBeenCalledWith({
      where: { newClanId: 999, status: 'pending' },
      data: { status: 'ignored' },
    })
    expect(data.closedPromotions).toBe(3)
    expect(data.message).toContain('3 mouvement(s) en attente annulé(s)')
  })

  it('archive le clan refusé : il quitte la liste « Clans en attente »', async () => {
    mocks.clanFindUnique.mockResolvedValue(pendingClan())

    const res = await rejectClan(rejectRequest(), { params })

    expect(res.status).toBe(200)
    expect(mocks.clanUpdate).toHaveBeenCalledWith({
      where: { id: 999 },
      data: { archivedAt: expect.any(Date), archivedReason: 'rejected' },
    })
  })

  it('refuse (409) un clan déjà archivé, sans rien réécrire', async () => {
    mocks.clanFindUnique.mockResolvedValue(pendingClan({ archivedAt: new Date('2026-09-20'), archivedReason: 'rejected' }))

    const res = await rejectClan(rejectRequest(), { params })

    expect(res.status).toBe(409)
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
    expect(mocks.clanUpdate).not.toHaveBeenCalled()
  })

  it('refuse de rejeter un clan déjà actif', async () => {
    mocks.clanFindUnique.mockResolvedValue(pendingClan({ isActive: true }))

    const res = await rejectClan(rejectRequest(), { params })

    expect(res.status).toBe(409)
    expect(mocks.memberUpdate).not.toHaveBeenCalled()
  })

  it('refuse de rejeter le clan technique', async () => {
    mocks.clanFindUnique.mockResolvedValue(pendingClan({ isSystem: true }))

    const res = await rejectClan(rejectRequest(), { params })

    expect(res.status).toBe(400)
  })

  it('reste un succès quand aucun email ne part', async () => {
    // Clan decouvert automatiquement : aucun demandeur, donc aucun contact.
    mocks.clanFindUnique.mockResolvedValue(pendingClan({ members: [] }))

    const res = await rejectClan(rejectRequest(), { params })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.emailSent).toBe(false)
    expect(data.message).toContain('Aucun email envoyé')
  })

  it('exige le SuperUser', async () => {
    mocks.requireSuperUser.mockResolvedValue(
      Response.json({ error: 'Forbidden' }, { status: 403 })
    )

    const res = await rejectClan(rejectRequest(), { params })

    expect(res.status).toBe(403)
    expect(mocks.clanFindUnique).not.toHaveBeenCalled()
  })
})
