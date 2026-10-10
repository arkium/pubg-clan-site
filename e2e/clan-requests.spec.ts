import { expect, test } from './support/api'
import { CLAN_ID } from './support/data'
import { mockMemberSession } from './support/session'

/**
 * Demandes d'accès d'un clan, côté Owner (`/clans/[clanId]/settings/members?tab=demandes`) — docs/features/clans.md,
 * « Ajout d'un membre — flux auto-inscription ». Une demande envoyée de /join sans compte montre son adresse de contact
 * et « Sans compte » ; l'accepter envoie le lien de création du compte à cette adresse, d'où l'avertissement de vérifier
 * qu'elle appartient bien au joueur. Toutes les API sont simulées : rien n'est accepté en base.
 */

const PENDING = [
  {
    id: 41,
    displayName: 'Balthazar_99',
    pubgPlayerName: 'Balthazar_99',
    platformShard: 'steam',
    isActive: false,
    joinStatus: 'pending',
    createdAt: '2026-10-09T18:00:00.000Z',
    contactEmail: 'joueur@exemple.fr',
    hasAccount: false,
  },
  {
    id: 42,
    displayName: 'Ancien_Membre',
    pubgPlayerName: 'Ancien_Membre',
    platformShard: 'steam',
    isActive: false,
    joinStatus: 'pending',
    createdAt: '2026-10-08T18:00:00.000Z',
    contactEmail: null,
    hasAccount: true,
  },
]

test('demande sans compte : adresse visible, avertissement avant d’accepter, lien de création du compte annoncé', async ({ api, page }) => {
  mockMemberSession(api, { superUser: true })
  api
    .on('GET', `/api/clans/${CLAN_ID}/members`, { body: { pending: PENDING, clanName: 'Clan Démo' } })
    .on('POST', `/api/clans/${CLAN_ID}/members/41/approve`, {
      body: {
        message: 'Balthazar_99 est maintenant membre actif du clan Clan Démo. Lien de création du compte envoyé à joueur@exemple.fr.',
        invitation: { status: 'invited' },
        emailSent: true,
      },
    })

  await page.goto(`/clans/${CLAN_ID}/settings/members?tab=demandes`)
  const requests = page.locator('main ul > li')
  const newcomer = requests.filter({ hasText: 'Balthazar_99' })
  await expect(newcomer).toContainText('Sans compte')
  await expect(newcomer).toContainText('joueur@exemple.fr')
  await expect(requests.filter({ hasText: 'Ancien_Membre' })).not.toContainText('Sans compte')
  await expect(page.locator('main')).not.toContainText(/candidature|rejoindre/i)

  await newcomer.getByRole('button', { name: 'Approuver' }).click()
  const dialog = page.getByRole('dialog', { name: 'Approuver Balthazar_99 ?' })
  await expect(dialog).toContainText('le lien pour le créer part à joueur@exemple.fr')
  await expect(dialog).toContainText('Vérifiez que cette adresse est bien la sienne')
  await dialog.getByRole('button', { name: 'Approuver le joueur' }).click()

  await expect(page.getByRole('status')).toContainText('Lien de création du compte envoyé à joueur@exemple.fr')
  await expect(requests.filter({ hasText: 'Balthazar_99' })).toHaveCount(0)
})
