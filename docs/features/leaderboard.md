# Leaderboard — Classement interne clan et leaderboard PUBG mondial

Ce document décrit les deux systèmes de classement du projet : le leaderboard interne du clan (calculé à la volée depuis les matchs importés) et le leaderboard PUBG API mondial (disponible mais non consommé).

---

## 1. Deux systèmes distincts

| | Leaderboard interne (clan) | Leaderboard PUBG API (mondial) |
|---|---|---|
| **Page** | `/clans/[clanId]/leaderboard` | Pas de page |
| **Source** | Matchs stockés en DB (`Match`, `SquadMember`) | API PUBG — `GET /leaderboards/{seasonId}/{gameMode}` |
| **Périmètre** | Membres du clan uniquement | Top 500 mondial par saison et mode |
| **Périodes** | Semaine / Mois / All-time | Saison PUBG (fixe) |
| **Modes** | Mode clan (solo clan, duo clan, trio clan, squad clan) | Mode PUBG (squad, duo, solo + variantes FPP) |
| **Statut** | Implémenté complet | Non consommé |

---

## 2. Leaderboard interne — Fonctionnement

### 2.1 Notion de mode clan

Le leaderboard n'utilise pas le `gameMode` PUBG brut. Il détecte le nombre de membres du clan présents dans chaque match :

| Membres clan détectés dans le match | Mode clan |
|---|---|
| 0 entrée `SquadMember` pour ce membre | `solo clan` |
| 2 membres | `duo clan` |
| 3 membres | `trio clan` |
| 4 membres ou plus | `squad clan` |

Un match PUBG `squad` peut être `solo clan` si un seul membre du clan y participe. Un match PUBG `solo` est toujours `solo clan`.

### 2.2 Route API

`GET /api/clans/[clanId]/leaderboard`

**Paramètres :**

| Paramètre | Valeurs | Défaut | Description |
|---|---|---|---|
| `period` | `week`, `month`, `all` | `week` | Période temporelle |
| `sortBy` | `kills`, `damage`, `winRate`, `matches`, `kpm` | `kills` | Critère de tri |
| `killsView` | `clan`, `withSolo` | `clan` | Inclure ou non les matchs solo clan |

### 2.3 Calcul des périodes

| Période | Plage |
|---|---|
| `week` | Lundi 00:00:00 → dimanche 23:59:59.999 (semaine calendaire ISO) |
| `month` | Premier jour du mois 00:00:00 → dernier jour du mois 23:59:59.999 |
| `all` | Toutes les données disponibles (pas de filtre date) |

La clé de période pour `PlayerStats` est calculée ainsi :
- `week` → `week-YYYY-WW` (ex. `week-2026-23`)
- `month` → `month-YYYY-MM`
- `all` → `all-time`

### 2.4 Toggle Clan / Inclus Solo

**Mode `Clan` (`killsView=clan`) :** seuls les matchs détectés entre membres du clan (`SquadMember`) entrent dans les totaux principaux. Les matchs `solo clan` ne sont pas inclus dans les agrégats, mais la colonne `soloKills` reste renseignée à titre informatif.

**Mode `Inclus Solo` (`killsView=withSolo`) :** les matchs `solo clan` (table `Match` sans entrée `SquadMember` correspondante) sont ajoutés aux totaux. Tous les chiffres sont recalculés avec les solos inclus, y compris la progression et les Top performers.

### 2.5 Métriques calculées par joueur

| Champ | Description | Source |
|---|---|---|
| `totalKills` | Kills totaux sur la période | `SquadMember.kills` + optionnellement `Match.kills` |
| `totalDamage` | Dégâts totaux | `SquadMember.damage` |
| `totalAssists` | Assists totaux | `SquadMember.assists` |
| `totalRevives` | Relèves totales | `SquadMember.revives` |
| `matchesPlayed` | Matchs joués | Comptage |
| `matchesWon` | Victoires (`placement === 1`) | `SquadMember.placement` |
| `winRate` | `matchesWon / matchesPlayed` | Calculé |
| `avgKillsPerGame` | K/M | `totalKills / matchesPlayed` |
| `avgDamagePerGame` | Damage moyen par match | `totalDamage / matchesPlayed` |
| `soloKills` | Kills en solo clan (informatif) | `Match.kills` sans entrée `SquadMember` |
| `duoClanKills` | Kills en duo clan | `SquadMember` avec `_count.members <= 2` |
| `trioClanKills` | Kills en trio clan | `SquadMember` avec `_count.members === 3` |
| `squadClanKills` | Kills en squad clan | `SquadMember` avec `_count.members >= 4` |

### 2.6 Colonnes du tableau

| Colonne | Champ source |
|---|---|
| Kills | `totalKills` |
| Matchs | `matchesPlayed` |
| Damage | `totalDamage` |
| K/M | `avgKillsPerGame` (formaté 2 décimales) |
| Winner | `matchesWon` |
| Win Rate | `winRate * 100` en pourcentage |
| Solo | `soloKills` (décomposition mode clan) |
| Duo clan | `duoClanKills` |
| Trio clan | `trioClanKills` |
| Squad clan | `squadClanKills` |

### 2.7 Top performers

Les cartes Top performers sont recalculées à la volée à partir des mêmes données que le tableau (même périmètre période + mode).

| Carte | Condition |
|---|---|
| Top Killer | Plus grand `totalKills` |
| Top Damage | Plus grand `totalDamage` (si pas déjà Top Killer) |
| Best Win Rate | Meilleur `winRate` parmi les joueurs avec au moins 3 matchs |
| MVP | Score combiné : `totalKills/maxKills + totalDamage/maxDamage + winRate` |
| TOP K/M | Meilleur `avgKillsPerGame` (joueurs avec ≥ 3 matchs, sinon fallback sur tous) |

Les mêmes badges (`top_killer`, `top_damage`, `best_wr`, `mvp`, `best_kpm`) sont affichés dans la colonne joueur du tableau principal.

### 2.8 Progression historique

La progression est calculée à la volée — elle ne lit pas un historique pré-stocké.

- 4 semaines passées pour la période `week`.
- 4 mois passés pour la période `month`.
- Aucune progression pour `all` (les déltas sont masqués en UI).

Pour chaque période passée, l'API recharge les matchs individuels et les `SquadMember` pour tous les joueurs, puis réapplique exactement la même agrégation que pour la période courante. La progression suit donc le même toggle Clan / Inclus Solo.

**Champs de delta affichés :**

| Champ | Formule |
|---|---|
| `killsDelta` | `current.totalKills - previous.totalKills` |
| `matchesDelta` | `current.matchesPlayed - previous.matchesPlayed` |
| `damageDelta` | `round(current.totalDamage - previous.totalDamage)` |
| `winnerDelta` | `current.matchesWon - previous.matchesWon` |
| `winRateDelta` | `(current.winRate - previous.winRate) * 100` |

Codes visuels : `↑` vert (positif), `↓` rouge (négatif), `→` gris (nul), `•` gris (progression indisponible).

### 2.9 Rôle des `PlayerStats` (cron)

Le cron de recalcul dans `src/lib/stats-calculator.ts` continue d'alimenter la table `PlayerStats`. Ce calcul :
- Ne prend en compte que `SquadMember` (pas les matchs solo).
- Sert à maintenir les stats historisées.
- Alimente le champ `lastUpdatedAt` affiché sur la page leaderboard.

Les chiffres du tableau leaderboard sont calculés **live** depuis `Match` + `SquadMember` et peuvent différer légèrement de `PlayerStats` selon le toggle actif.

---

## 3. Leaderboard PUBG API mondial — Données disponibles (non consommées)

### 3.1 Endpoint

`GET /shards/{shard}/leaderboards/{seasonId}/{gameMode}`

### 3.2 Modes de jeu valides

| `gameMode` | Description |
|---|---|
| `squad` | Escouade 4 joueurs — 3ème personne |
| `squad-fpp` | Escouade 4 joueurs — 1ère personne |
| `duo` | Duo 2 joueurs — 3ème personne |
| `duo-fpp` | Duo 2 joueurs — 1ère personne |
| `solo` | Solo — 3ème personne |
| `solo-fpp` | Solo — 1ère personne |

### 3.3 Données retournées (top 500 par mode et saison)

| Champ API | Type | Description |
|---|---|---|
| `name` | string | Nom du joueur PUBG |
| `rank` | number | Position mondiale (1 → 500) |
| `stats.rankPoint` | number | RP courant |
| `stats.tier` | string | Tier (Bronze → Master) |
| `stats.subTier` | string | Sous-tier (I → V) |
| `stats.wins` | number | Victoires sur la saison |
| `stats.games` | number | Matchs joués sur la saison |
| `stats.winRatio` | number | Ratio victoires/matchs (0–1) |
| `stats.averageDamage` | number | Dégâts moyens par match |
| `stats.kills` | number | Kills totaux sur la saison |
| `stats.killDeathRatio` | number | K/D ratio |
| `stats.kda` | number | KDA ratio |
| `stats.averageRank` | number | Rang moyen de placement par match |

### 3.4 Contraintes

| Contrainte | Détail |
|---|---|
| Scope | Top 500 mondial uniquement — pas de recherche par compte ID |
| Saison | Nécessite un `seasonId` valide (`division.bro.official.pc-2018-XX`) |
| Disponibilité | Certains modes peuvent être indisponibles en offseason |
| Quota API | Soumis au quota RPM comme tous les endpoints PUBG |
| Pas de pagination | Réponse fixe — exactement les 500 premières entrées |
| Pas de recherche ciblée | Il faut charger le top 500 complet et chercher par `pubgPlayerName` |

### 3.5 Comparaison des métriques disponibles

| Métrique | Leaderboard interne | Leaderboard PUBG API |
|---|---|---|
| Kills | `totalKills` | `stats.kills` |
| Dégâts moyens | `avgDamagePerGame` | `stats.averageDamage` |
| Assists | `totalAssists` | Non fourni |
| Revives | `totalRevives` | Non fourni |
| Matchs joués | `matchesPlayed` | `stats.games` |
| Victoires | `matchesWon` | `stats.wins` |
| Win rate | `winRate` | `stats.winRatio` |
| K/D ratio | Non stocké | `stats.killDeathRatio` |
| KDA | Non stocké | `stats.kda` |
| Rang mondial | Absent | `rank` (1–500) |
| RP | Absent (dans `MemberSeasonStats`) | `stats.rankPoint` |
| Tier | Absent (dans `MemberSeasonStats`) | `stats.tier` |
| Placement moyen | Absent | `stats.averageRank` |
| Décomposition duo/trio/squad | Oui | Non |
| Progression sur N périodes | Oui (4 semaines/mois) | Non (saison uniquement) |

---

## 4. Fichiers clés

| Fichier | Rôle |
|---|---|
| `src/app/api/clans/[clanId]/leaderboard/route.ts` | Calcul live du leaderboard |
| `src/components/Leaderboard.tsx` | Tableau principal |
| `src/components/LeaderboardStats.tsx` | Cartes Top performers |
| `src/hooks/useLeaderboard.ts` | Chargement client de l'API |
| `src/lib/stats-calculator.ts` | Recalcul cron de `PlayerStats` |
| `src/types/leaderboard.ts` | Types du leaderboard interne |
| `src/lib/pubg.ts` | Client API PUBG (endpoint leaderboard non consommé) |
