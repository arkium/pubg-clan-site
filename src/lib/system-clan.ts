/**
 * Identité du clan technique du site — le parking des joueurs sans clan qu'on
 * continue de suivre (chantier 0 du cycle de vie de clan, docs/TODO/todo.md).
 *
 * Module volontairement sans dépendance : `clan-service.ts` tire `server-only` par
 * la chaîne `stats-calculator` → `notification-service`, ce qui le rend inutilisable
 * depuis un script `tsx`. Les constantes vivent donc ici pour que le service et les
 * scripts de maintenance partagent la même source, sans duplication de littéraux.
 *
 * Rappel : l'identification d'un clan technique se fait par `Clan.isSystem`, jamais
 * par son nom. Ces constantes ne servent qu'à la **création** du clan.
 */

export const UNGROUPED_CLAN_NAME = 'Ungrouped'
export const UNGROUPED_CLAN_TAG = 'UNG'
