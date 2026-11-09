import { expect, test } from './support/api'
import { CLAN_ID } from './support/data'
import { mockMemberSession } from './support/session'

/**
 * Onglet « Ajouter un joueur » (`/clans/[clanId]/settings/members?tab=ajout`) — joueur encore rattaché à un autre clan
 * du site (docs/features/cycle-de-vie-clan.md §5, décision du 2026-11-09). Quand PUBG le place déjà dans le clan qui
 * l'ajoute, l'aperçu annonce le clan qu'il quitte et l'ajout part ; sinon, le refus du serveur s'affiche tel quel.
 * Toutes les API sont simulées : rien n'est écrit en base.
 */

const PREVIEW = {
  mode: 'preview',
  player: { displayName: 'Jose-Leplumeau', pubgPlayerName: 'Jose-Leplumeau', platformShard: 'steam' },
  clan: { id: CLAN_ID, name: 'Clan Démo', tag: 'DEMO' },
  fromUngrouped: false,
  fromClan: { id: 6, name: 'Les-Ratz', tag: 'RATZ' },
}

const NO_PUBG_CLAN =
  'Ce joueur est encore membre du clan « Les-Ratz » sur le site et PUBG ne le place dans aucun clan : reviens quand il aura rejoint ton clan dans le jeu.'

test('joueur d’un autre clan que PUBG place déjà dans le sien : l’aperçu annonce le départ, l’ajout part', async ({ api, page }) => {
  mockMemberSession(api, { superUser: true })
  const modes: string[] = []
  api.on('POST', '/api/members', (_url, request) => {
    const body = request.postDataJSON() as { mode: string; clanId: number }
    modes.push(body.mode)
    expect(body.clanId).toBe(CLAN_ID)
    return body.mode === 'preview' ? { body: PREVIEW } : { status: 201, body: { id: 1682, clanId: CLAN_ID } }
  })

  await page.goto(`/clans/${CLAN_ID}/settings/members?tab=ajout`)
  await page.getByPlaceholder('ex. ProGamer_99').fill('Jose-Leplumeau')
  await page.getByRole('button', { name: 'Vérifier sur PUBG' }).click()

  const dialog = page.getByRole('dialog', { name: 'Joueur trouvé sur PUBG' })
  await expect(dialog.getByTestId('add-member-outcome')).toHaveText(
    'Il est encore rattaché au clan Les-Ratz [RATZ] sur le site, mais PUBG le place déjà dans ton clan : il le quitte et rejoint le tien avec tout son historique de parties, sans attendre la synchronisation de nuit.'
  )
  await dialog.getByRole('button', { name: 'Ajouter au clan' }).click()

  await expect(page.getByRole('main')).toContainText('a été ajouté avec succès au clan')
  expect(modes).toEqual(['preview', 'create'])
})

test('PUBG ne le place dans aucun clan : le refus du serveur s’affiche, aucune fenêtre de confirmation', async ({ api, page }) => {
  mockMemberSession(api, { superUser: true })
  api.on('POST', '/api/members', { status: 409, body: { error: NO_PUBG_CLAN } })

  await page.goto(`/clans/${CLAN_ID}/settings/members?tab=ajout`)
  await page.getByPlaceholder('ex. ProGamer_99').fill('Jose-Leplumeau')
  await page.getByRole('button', { name: 'Vérifier sur PUBG' }).click()

  await expect(page.getByRole('main')).toContainText(NO_PUBG_CLAN)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
