# Matchs — Modèle de données, import, pages clan et membre

Ce document décrit le modèle de données des matchs, la détection des squads, l'import depuis l'API PUBG, et les pages de visualisation pour le clan et pour le membre individuel.

---

## 1. Modèle de données

### Table `Match`

Stocke les matchs individuels de chaque membre, importés depuis l'API PUBG.

| Champ | Type | Description |
|---|---|---|
| `memberId` | Int | FK vers `ClanMember` |
| `pubgMatchId` | String | ID PUBG du match |
| `kills` | Int | Kills du membre dans ce match |
| `assists` | Int | Assists |
| `damageDealt` | Float | Dégâts infligés |
| `headshotKills` | Int | Kills en headshot |
| `revives` | Int | Coéquipiers relevés |
| `placement` | Int | Position finale (1 = victoire) |
| `durationSeconds` | Int | Durée du match |
| `mapName` | String | Nom de la carte |
| `gameMode` | String | Mode PUBG brut (`solo`, `duo`, `trio`, `squad`) |
| `pubgCreatedAt` | DateTime | Date du match |

Contrainte unique : `(memberId, pubgMatchId)` — pas de doublon par membre/match.

### Table `SquadMatch`

Représente un match joué par plusieurs membres du clan ensemble. Un `SquadMatch` correspond à un `pubgMatchId` donné dans lequel au moins 2 membres du clan ont été détectés.

| Champ | Description |
|---|---|
| `pubgMatchId` | ID PUBG du match |
| `mapName` | Carte |
| `gameMode` | Mode PUBG brut |
| `placement` | Position finale de l'équipe |
| `createdAt` | Date du match |

### Table `SquadMember`

Lie un `ClanMember` à un `SquadMatch` avec ses stats individuelles dans ce match.

| Champ | Type | Description |
|---|---|---|
| `memberId` | Int | FK vers `ClanMember` |
| `squadMatchId` | Int | FK vers `SquadMatch` |
| `kills` | Int | Kills |
| `damage` | Float | Dégâts infligés |
| `assists` | Int | Assists |
| `revives` | Int | Relèves |
| `placement` | Int | Position finale |

Ces 13 champs proviennent du résumé de match de l'API PUBG (endpoint `/matches/{matchId}`) sans appel télémétrie :

```
kills, damage, assists, revives, placement,
headshots, knockouts, timeSurvived,
rideDistance, walkDistance, boosts, heals,
vehicleDestroys, roadKills, longestKill,
teamKills, weaponsAcquired
```

Les données de télémétrie enrichissent des tables séparées (synergies co-kills, revives croisés) et ne modifient pas `SquadMember` directement.

---

## 2. Détection des squads

Le module `squad-detector.ts` (appelé depuis `analyzeMatchForSquads`) identifie les membres du clan qui ont joué ensemble dans un même match.

### Algorithme

1. Pour chaque match importé, les membres actifs du clan sont croisés avec les participants du match (depuis l'API PUBG).
2. Si au moins 2 membres du clan sont présents dans le même match, un `SquadMatch` est créé ou mis à jour (upsert sur `pubgMatchId`).
3. Pour chaque membre détecté, une entrée `SquadMember` est créée avec ses stats individuelles.

### Classification mode clan

Le mode clan est dérivé du nombre de membres du clan détectés dans le match (`SquadMatch._count.members`) :

| Membres détectés | Mode clan |
|---|---|
| 0 ou 1 (pas de `SquadMember`) | `solo clan` |
| 2 | `duo clan` |
| 3 | `trio clan` |
| 4 ou plus | `squad clan` |

Ce mode clan est distinct du `gameMode` PUBG brut.

---

## 3. Import des matchs

### Import automatique (cron)

Le cron `daily_sync` appelle `POST /api/clans/[clanId]/sync-matches` pour chaque clan actif.

Pour chaque membre actif :
1. Résolution du `pubgAccountId` si manquant via `searchPlayerByName()`.
2. Récupération des matchs récents PUBG via `fetchRecentMatchIds()`.
3. Import incrémental des matchs non déjà présents en DB.
4. Upsert des lignes `Match`.
5. Analyse squad via `analyzeMatchForSquads` → upsert `SquadMatch` / `SquadMember`.

Les matchs PUBG introuvables (HTTP 404) sont traités en `skipped` — non bloquants pour les autres membres. Les erreurs bloquantes remontent dans `errorsCount`.

### Import manuel par membre

**Page :** `/members/[id]/matches`

L'endpoint `GET /api/members/[id]/matches` (sans query params) détecte les matchs récents PUBG non encore importés :
1. Chargement des `pubgMatchId` déjà en DB pour ce membre.
2. Récupération des 10 derniers IDs de matchs PUBG via `fetchRecentMatchIds()`.
3. Exclusion des matchs déjà importés → `recentApiMatchIds`.

Chaque match est chargé individuellement via `GET /api/matches/[matchId]?shard=...&playerId=...`.

L'import s'effectue via `POST /api/matches/[matchId]` (body : `memberId`, `shard`, `playerId`). Un délai de 6 secondes entre chaque appel est appliqué pour respecter le rate limit PUBG.

---

## 4. Page `/clans/[clanId]/matches`

**API :** `GET /api/clans/[clanId]/matches`  
**Hook client :** `useSquadMatches` (avec cache mémoire par `clanId:period:gameMode`)

### Paramètres

| Paramètre | Valeurs | Défaut |
|---|---|---|
| `period` | `week`, `month` | `week` |
| `gameMode` | `duo`, `trio`, `squad` | aucun (tous les modes) |

Note : la période `all` n'est pas disponible sur cette page. Le filtre `gameMode` porte sur le mode clan détecté (nombre de membres), pas sur le `gameMode` PUBG brut.

### Blocs retournés par l'API

**`stats` — KPI globaux de la période**

| Champ | Description |
|---|---|
| `totalKills` | Kills totaux de tous les matchs filtrés |
| `totalDamage` | Dégâts totaux |
| `matchCount` | Nombre de matchs |
| `wins` | Victoires |
| `winRate` | `wins / matchCount` |

**`modePerformance` — Agrégats par mode clan**

Pour chaque mode (`duo`, `trio`, `squad`) : `matches`, `kills`, `wins`, `losses`, `damage`, `assists`, `durationSeconds`.

**`sessions` — Récapitulatif par soirée**

Regroupement par **journée de jeu** (`sessionDateOf`, `src/lib/match-sessions.ts`, décision du 2026-09-26) : date de Paris,
la journée commençant à **06:00**. Une partie jouée avant 6 h compte dans la soirée de la veille : une soirée qui passe minuit
reste entière. Auparavant, la date UTC (`createdAt.slice(0, 10)`) rangeait une partie de 00:30 à la veille et faisait
commencer « la soirée du 26 » par les parties de la nuit du 25. La même règle sert la page de la soirée, la page de pilotage
de la télémétrie, les liens des récupérations et le lien retour du débriefing (`fromDate`). Une soirée à cheval sur deux
mois apparaît dans chacun des deux, avec les parties de la période. Pour chaque session :
- Liste des matchs du jour.
- `totalDuration`, `totalKills`, `totalDamage`, `winRate`.
- Membres uniques présents dans la session.

Tri : sessions par date descendante, matchs dans chaque session par `createdAt` descendant.

**`synergies` — Paires et compositions fréquentes**

- `topPairs` : 5 meilleures paires de membres (combinaisons 2 à 2). Clé de regroupement : `memberId1:memberId2` triés.
- `topSquads` : 5 meilleures compositions de 3 ou 4 membres exactes.

Tri des synergies :
1. `matchesPlayed` desc
2. `winRate` desc
3. `totalKills` desc

Chaque entrée contient : `matchesPlayed`, `wins`, `totalKills`, `totalDamage`, `winRate`.

**`topPerformers` — Tops individuels**

Trois classements (top 5 chacun) :
- `kills` : tri par kills desc.
- `damage` : tri par damage desc.
- `survival` : tri par `averagePlacement` asc (meilleur placement = plus petit).

**`availableModes`** : liste des modes clan détectés sur la période (calculée avant application du filtre `gameMode`).

**`mapLabels`** : alias des noms de cartes via `getMapLabels()`.

**`squads[].teamCount`** : équipes au départ de chaque partie (« #3 / 26 »), lues dans les instantanés de phase de la
télémétrie (`teamCountFromPhaseSnapshots`) ; `null` sans télémétrie analysée.

**Colonnes compressées** : la route lit `weaponStats`, `memberStats` et `phaseSnapshots` avec leurs colonnes `*Gz` et
les normalise par `decodeTelemetryRow` (CLAUDE.md, piège n° 10). Avant le 2026-09-26, elle ne lisait que les colonnes en
clair : les 10 482 parties de septembre n'avaient plus ni « Top armes » ni « Stats joueurs » sur la page de pilotage.

### Refonte du 2026-09-26 (maquette Claude Design « Matchs et soirées », écrans 10a à 10f)

| Audit de la maquette | Réponse |
|---|---|
| La soirée n'avait pas de bandeau | `MatchesBanner` commun aux deux pages : image (celle de la carte du premier top 1 de la soirée, sinon de sa première partie), titre, pastilles « 7 parties · 2 h 41 · 1 chicken dinner ». Hauteurs de l'ancien bandeau conservées (règle : ne jamais changer la hauteur d'un bandeau d'image) |
| Deux styles de chiffres clés, libellés différents | `KpiGrid` sur les deux pages : Kills, Dégâts, Top 1, Parties, Temps de jeu (liste) ; Kills, Dégâts, Meilleure place, Place moyenne (soirée) |
| Récap par soirée chargé (pastilles, tableau à 6 colonnes, modes non joués à 0) | Carnet des soirées (`SessionLogbook`) : bloc date, une case par partie colorée par la place (or top 1, vert ≤ 5, bleu ≤ 10), joueurs, modes joués, trois chiffres |
| Cartes de match techniques | Carte de fin de partie (`MatchResultCard`) : image de la carte, « #3/26 », tampon « Chicken dinner », kills par joueur en barres, Kills / Dégâts / Réa., télémétrie réduite à un point ; « Débriefing » ou « État » (audit). `SquadMatchList` reste pour la page de pilotage de la télémétrie |
| Navigation entre soirées sans date | Bandeau collant : soirée précédente et suivante datées (« ven. 25 »), sept soirées voisines, soirée courante en accent ; « Soirée n / N » sur mobile |
| Divers (« Liste complete », « 14.3% », tons de mode pensés pour le clair) | Français partout, virgule décimale, couleurs par jetons `--game-*` (`.game-ui`) en clair et en sombre |

Plan de vol de la soirée (`SessionFlightPlan`) : une étape par partie dans l'ordre du jeu, reliées en pointillés, avec
miniature de carte, heure, `PlacementBadge` et couronne sur un top 1 ; un clic met la carte de la partie en avant.
Répartition par mode en barre (Duo, Trio, Squad, avec `TeamModeBadge`). Défilement horizontal au-delà de la largeur.

**Écart constaté avec la maquette** : elle imaginait 5 à 7 parties par soirée. Les clans actifs en jouent bien plus (Aurore_Funeste :
1 123 parties en septembre, jusqu'à ~60 par jour, plusieurs escouades en parallèle). Le carnet passe les cases à la ligne,
le plan de vol défile ; aucune donnée n'est tronquée.

### Navigation par session

Depuis le carnet, chaque soirée ouvre `/clans/[clanId]/matches/session/[date]` (`?period=` et `?gameMode=` repris).
La sous-page valide la date (`YYYY-MM-DD`), filtre les parties par `sessionDateOf`, calcule la soirée précédente et
suivante, et affiche plan de vol et cartes.

---

## 5. Page `/members/[id]/matches`

**Endpoint :** `GET /api/members/[id]/matches`

### Mode historique importé

Déclenché si au moins un query param (`period`, `limit`, `offset`) est présent.

**Paramètres :**

| Paramètre | Valeurs | Défaut |
|---|---|---|
| `period` | `week`, `month`, `all` | `all` |
| `limit` | 1–100 | 10 |
| `offset` | ≥ 0 | 0 |
| `sortBy` | `pubgCreatedAt`, `kills`, `damageDealt`, `placement` | `pubgCreatedAt` |
| `sortDirection` | `asc`, `desc` | `desc` |

Note : depuis le 2026-09-26, `week` et `month` sont **calendaires** (semaine ISO depuis lundi 00:00, mois civil — `src/lib/period.ts`), comme le leaderboard et la page matchs clan. La période et la date exacte se choisissent dans le bandeau de la page.

**Colonne `clanMode`** : pour chaque match de l'historique, l'API calcule le mode clan via `SquadMember`/`SquadMatch` :
- `solo` : pas de `SquadMember` ou compteur ≤ 1.
- `duo` : compteur ≤ 2.
- `trio` : compteur = 3.
- `squad` : compteur ≥ 4.

**Réponse :** `matches[]`, `totalCount`, `sortBy`, `sortDirection`, `mapLabels`.

### Mode détection des matchs récents à importer

Déclenché si aucun query param n'est présent.

**Réponse :** `memberId`, `playerId`, `shard`, `recentApiMatchIds` (matchs récents non importés), `recentMatchesConsidered` (max 10), `totalMatches` (total PUBG).

---

## 6. Synergies télémétrie

Les synergies affichées sur la page clan (co-kills, revives croisés entre coéquipiers) sont calculées depuis la télémétrie PUBG lorsqu'elle est disponible.

La télémétrie est un pipeline distinct (`src/lib/pubg-telemetry/`) qui parse les fichiers de log de match (gzip, 10–200 Mo, disponibles 14 jours sur le CDN `assets.pubg.com`). Les résultats enrichissent des tables dédiées et ne modifient pas `SquadMember` directement.

---

## 7. Routes API concernées

| Route | Méthode | Description |
|---|---|---|
| `/api/clans/[clanId]/matches` | `GET` | Matchs équipe du clan (periode, mode) |
| `/api/clans/[clanId]/sync-matches` | `POST` | Déclenche la sync des matchs (manuel) |
| `/api/members/[id]/matches` | `GET` | Historique matchs membre ou détection récents |
| `/api/matches/[matchId]` | `GET` | Détail d'un match PUBG (pour import) |
| `/api/matches/[matchId]` | `POST` | Import d'un match en base pour un membre |

---

## 8. Fichiers clés

| Fichier | Rôle |
|---|---|
| `src/app/api/clans/[clanId]/matches/route.ts` | Calcul principal matchs clan |
| `src/app/api/clans/[clanId]/sync-matches/route.ts` | Déclenchement sync matchs |
| `src/app/api/members/[id]/matches/route.ts` | Historique + détection matchs récents |
| `src/app/api/matches/[matchId]/route.ts` | Détail et import d'un match |
| `src/hooks/useSquadMatches.ts` | Chargement + cache client matchs clan |
| `src/app/clans/[clanId]/matches/page.tsx` | Page matchs clan |
| `src/app/clans/[clanId]/matches/session/[date]/page.tsx` | Sous-page détail par date |
| `src/app/members/[id]/matches/page.tsx` | Page matchs membre |
| `src/components/matches/MatchesUi.tsx` | Bandeau, indicateurs, case de place (communs aux deux pages) |
| `src/components/matches/SessionLogbook.tsx` | Carnet des soirées (page Matchs) |
| `src/components/matches/SessionFlightPlan.tsx` | Plan de vol d'une soirée |
| `src/components/matches/MatchResultCard.tsx` | Carte de fin de partie |
| `src/lib/match-sessions.ts` | Journée de jeu (`sessionDateOf`), bilan de soirée, modes, soirées voisines, libellés |
| `src/components/SquadMatchList.tsx` | Cartes techniques (page de pilotage de la télémétrie) |
| `src/lib/pubg.ts` | `fetchRecentMatchIds()`, `fetchMatchDetails()` |
| `src/types/squad-matches.ts` | Types contrat de données matchs clan |
| `src/types/dashboard.ts` | Types `MatchesResponse`, tri, période |
