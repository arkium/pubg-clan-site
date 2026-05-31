# Logique de calcul de la page Matchs membre

Ce document decrit la logique de la page `/members/[id]/matches`: chargement de l historique importe, recuperation des matchs PUBG recents non importes, tri/pagination, puis import en base.

## Resume rapide

- La page combine 2 flux:
  - historique des matchs deja importes (DB)
  - file d attente des derniers matchs PUBG non importes
- L historique importe est charge via `GET /api/members/[id]/matches` avec filtres/sort/pagination.
- Les matchs PUBG recents non importes sont identifies via `GET /api/members/[id]/matches` sans query params.
- Le detail de chaque match recent est charge via `GET /api/matches/[matchId]`.
- L import d un match est fait via `POST /api/matches/[matchId]` (upsert en base).

## Fichiers a connaitre

- `src/app/members/[id]/matches/page.tsx`: orchestration UI
- `src/app/api/members/[id]/matches/route.ts`: endpoint principal (2 modes)
- `src/app/api/matches/[matchId]/route.ts`: detail match PUBG + import DB
- `src/lib/pubg.ts`: appels PUBG (`fetchRecentMatchIds`, `fetchMatchDetails`)
- `src/types/dashboard.ts`: types `MatchesResponse`, tri, periode

## Parametres et etat UI

La page maintient les etats suivants:

- `historyPeriod`: `week | month | all`
- `historySortKey`: `pubgCreatedAt | kills | damageDealt | placement`
- `historySortDir`: `asc | desc`
- `historyOffset`: offset de pagination
- `HISTORY_LIMIT`: fixe a `10`
- `apiMatches`: liste des matchs recents a importer

## Endpoint `GET /api/members/[id]/matches`: deux comportements

La route choisit son mode selon la presence de query params (`period`, `limit`, `offset`).

### 1) Mode historique importe (dashboard mode)

Condition:

- au moins un des params `period`, `limit`, `offset` est present

Calculs:

1. Validation `memberId` (> 0)
2. Parsing:
   - `limit`: borne entre 1 et 100 (defaut 10)
   - `offset`: >= 0 (defaut 0)
   - `sortBy`: fallback `pubgCreatedAt`
   - `sortDirection`: fallback `desc`
3. Filtre periode (`getPeriodDateFilter`):
   - `week`: `now - 7 jours` (fenetre glissante)
   - `month`: `now - 30 jours` (fenetre glissante)
   - `all`: pas de filtre date
4. Requete DB:
   - `findMany` sur `Match` avec `where(memberId, since?)`
   - `orderBy`: colonne choisie puis `id desc` en tie-break
   - `take/skip` pour pagination
   - `count` en parallele pour `totalCount`
5. Mapping reponse:
   - dates converties en ISO (`pubgCreatedAt.toISOString()`)
   - `mapLabels` ajoute via `getMapLabels()`

Sortie principale:

- `matches[]`
- `totalCount`
- `sortBy`
- `sortDirection`
- `mapLabels`

### Colonne `Mode clan` (nouvelle)

Pour chaque match de l historique, l API calcule aussi `clanMode` a partir de `SquadMember`/`SquadMatch`:

- `solo`: aucun `SquadMember` pour ce membre sur ce `pubgMatchId`, ou compteur <= 1
- `duo`: compteur de membres clan detectes <= 2
- `trio`: compteur == 3
- `squad`: compteur >= 4

Ce champ alimente la colonne `Mode clan` dans le tableau de la page `/members/[id]/matches`.

### 2) Mode detection des matchs recents a importer

Condition:

- aucun des params `period`, `limit`, `offset`

Calculs:

1. Validation `memberId`
2. Chargement du membre clan (doit avoir `pubgPlayerName`)
3. Chargement des matchs deja importes en DB (`Match.pubgMatchId`)
4. Resolution `playerId` PUBG:
   - utilise `member.pubgAccountId` si present
   - sinon `searchPlayerByName(pubgPlayerName, shard)`
   - persiste `pubgAccountId` sur le membre si trouve
5. Recuperation des matchs PUBG lifetime via `fetchRecentMatchIds(playerId, shard)`
6. Fenetre recente:
   - `recentWindow = allRecentMatchIds.slice(0, 10)`
7. Exclusion des matchs deja importes:
   - `recentApiMatchIds = recentWindow - importedMatchIds`

Sortie principale:

- `memberId`, `playerId`, `shard`
- `recentApiMatchIds`
- `recentMatchesConsidered` (max 10)
- `totalMatches` (total PUBG remonte)

## Endpoint `GET /api/matches/[matchId]`

Utilisation:

- charger les details d un match recent dans le tableau d import

Inputs:

- query params requis: `shard`, `playerId`

Calculs:

1. `fetchMatchDetails(matchId, playerId, shard)`
2. Extraction des champs utilises en UI:
   - `mode`, `mapName`, `createdAt`, `durationSeconds`
   - stats: `kills`, `assists`, `damageDealt`, `headshotKills`, `revives`, `position`

## Endpoint `POST /api/matches/[matchId]`

Utilisation:

- importer un match recent en base pour un membre

Inputs body:

- `memberId`, `shard`, `playerId`

Calculs:

1. Validation des inputs et existence du membre
2. `fetchMatchDetails(matchId, playerId, shard)`
3. Mapping vers schema DB `Match`:
   - kills/assists/damage/headshots/revives/placement/duration/map/mode/date
4. `upsert` sur cle unique `(memberId, pubgMatchId)`
   - `create` si absent
   - `update` si deja present

Effet metier:

- pas de doublon par membre/match
- reimport possible pour rafraichir les valeurs

## Logique de chargement cote page

La page lance 2 effets independants:

1. Historique importe
   - depend de `historyPeriod`, `historySortKey`, `historySortDir`, `historyOffset`, `historyReloadKey`
2. Matchs recents PUBG non importes
   - charge `MatchInfo` puis details de chaque id via `/api/matches/[id]`

Particularite anti-rate-limit:

- delai de 6 secondes entre chaque `GET /api/matches/[id]`

## Import unitaire et import global

### Import unitaire

- clic sur `Importer` -> `POST /api/matches/[id]`
- en succes:
  - suppression de la ligne de `apiMatches`
  - incrementation de `historyReloadKey` pour recharger l historique

### Import global

- boucle sequentielle sur la liste `apiMatches`
- reutilise la meme logique que l import unitaire

## Tri, pagination, periode (historique DB)

Tri:

- applique cote serveur avant pagination
- cles: `pubgCreatedAt`, `kills`, `damageDealt`, `placement`
- direction: `asc` ou `desc`

Pagination:

- `limit=10` cote page
- `offset` pilote les pages
- `totalCount` pilote les controles de pagination

Periode:

- `week` = 7 derniers jours glissants
- `month` = 30 derniers jours glissants
- `all` = sans filtre date

## Permissions

- La section import est reservee aux users avec permission `*` (owner)
- Sans permission, l historique importe reste visible mais les actions d import sont desactivees/masquees

## Erreurs et robustesse

- Les erreurs API sont remontees en message utilisateur (`error`)
- Un echec de detail match dans la boucle des recents ne bloque pas les autres matchs
- Le composant protege les effets avec `cancelled` pour eviter les setState apres unmount

## Points d attention

- La logique de periode de cette page est glissante (7/30 jours), pas calendaire.
- Le lot des recents est limite aux 10 ids les plus recents renvoyes par PUBG.
- Le chargement sequentiel (6s) privilegie la stabilite API plutot que la rapidite.