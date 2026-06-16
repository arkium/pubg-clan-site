# Logique de la page Selection de clan

Ce document decrit le comportement de la page `/clans`: controle d acces, chargement des clans, selection active et redirection.

## Resume rapide

- La page UI est `src/app/clans/page.tsx`.
- L utilisateur doit etre authentifie.
- Le changement de clan est reserve aux profils avec permission wildcard (`*`).
- La liste des clans est chargee via `GET /api/clans`.
- La selection persiste dans `localStorage` via `useSelectedClan`.
- Apres selection, la navigation va sur `/clans/[clanId]/members`.

## Fichiers principaux

- Page: `src/app/clans/page.tsx`
- Composant de liste: `src/components/ClanSelector.tsx`
- Hook session: `src/hooks/useAuthSession.ts`
- Hook selection clan: `src/hooks/useSelectedClan.ts`
- API clans: `src/app/api/clans/route.ts`

## Controle d acces

La page applique 2 gardes:

1. Authentification
- Si la session n est pas authentifiee, redirection vers `/login`.

2. Permission de switch clan
- `canSwitchClan` est calcule avec `permissions.includes('*')`.
- Si l utilisateur n a pas cette permission, redirection vers `/members`.

Remarque:
- La page est donc principalement une page Owner/Admin global (selon les permissions renvoyees par la session).

## Chargement de donnees

Quand `authLoading` est termine et que les gardes sont valides:

- la page appelle `fetch('/api/clans')`
- stocke le resultat dans `clans`
- gere les etats `loading` et `error`

### Contrat attendu de `GET /api/clans`

Chaque element de la liste contient:

- `id`
- `name`
- `tag`
- `platformShard`
- `membersCount`
- `matchesCount`

## Logique API `/api/clans`

La route:

- recupere les clans actifs (`Clan.isActive = true`)
- trie par nom ascendant
- calcule `membersCount` via `_count.members` (membres actifs)
- calcule `matchesCount` via `prisma.match.count(...)` par clan

Point d attention:
- `matchesCount` est calcule clan par clan (boucle + count), ce qui peut devenir couteux si le nombre de clans augmente fortement.

## Selection d un clan

Quand l utilisateur clique sur `Consulter`:

1. `handleSelect(clanId)` appelle `setClanId(clanId)` (hook `useSelectedClan`).
2. Si `setClanId` retourne `false`, la page affiche l erreur:
   - `Seul le Owner peut changer de clan.`
3. Si succes, redirection vers:
   - `/clans/${clanId}/members`

## Persistance locale (`useSelectedClan`)

Le hook gere:

- `selectedClanId` dans `localStorage`
- un flag `canSwitchClan` dans `localStorage`
- un event custom `selected-clan-changed` pour synchroniser les composants

Comportements utiles:

- Hydratation initiale depuis `localStorage`
- Fallback via `/api/auth/session` si aucun clan n est stocke
- Possibilite de bloquer un changement de clan si `canSwitchClan` est faux

## Composant `ClanSelector`

Fonctionnalites UI:

- champ de recherche client-side (nom + tag)
- etats:
  - chargement (`Chargement des clans...`)
  - erreur (message rouge)
  - vide (`Aucun clan trouve.`)
- rendu des cartes clan avec bouton `Consulter`

## Etats UX de la page `/clans`

- `authLoading = true` -> `Verification de la session...`
- non authentifie / non autorise -> `Redirection...`
- autorise -> titre + description + `ClanSelector`

## Fichiers a connaitre

- `src/app/clans/page.tsx`: orchestration complete (auth, fetch, select, redirect)
- `src/components/ClanSelector.tsx`: filtre/recherche + rendu des cartes
- `src/app/api/clans/route.ts`: source des donnees de la liste
- `src/hooks/useSelectedClan.ts`: persistance et regles de changement de clan
- `src/hooks/useAuthSession.ts`: etat de session/permissions
