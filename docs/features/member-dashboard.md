# Dashboard membre — données PlayerStats, carrière et heatmap

Ce document décrit les données `PlayerStats` et `MemberLifetimeStats`, la page de carrière d'un membre et la heatmap d'activité. La page `/members/[id]/dashboard` elle-même est décrite dans [membres.md](membres.md).

---

## 1. Page `/members/[id]/dashboard`

**Refaite le 2026-09-27** — carte joueur, une seule période, chiffres clés, meilleure partie, profil de jeu, arsenal,
frères d'armes, némésis, drop, dernières parties : voir **[Membres et tableau de bord](membres.md)** §3. Les anciennes
sections (stats principales, progression, radar, squads fréquents, meilleures performances, historique) et leurs
composants sont archivés dans `archive/refonte-ui/membres/`.

Les chiffres clés restent lus dans `PlayerStats` (§3), parties **officielles**, clé de période calendaire.

---

## 3. Données `MemberLifetimeStats` — Différence avec `PlayerStats`

### Différences fondamentales

| Aspect | `PlayerStats` | `MemberLifetimeStats` |
|---|---|---|
| Source | Calculée par `stats-calculator.ts` depuis les matchs importés en DB | Récupérée depuis l'API PUBG lifetime (`/players/{id}/seasons/lifetime`) |
| Scope | Matchs du clan uniquement (ceux importés dans `Match` + `SquadMember`) | Tous les matchs PUBG lifetime du joueur, tous modes confondus |
| Périodes | `week`, `month`, `all-time` via `periodKey` | Pas de période — carrière complète uniquement |
| Mise à jour | Par le cron `daily_stats_recalc` | Par le cron `daily_lifetime_stats_sync` ou sync manuelle |
| Mode clan | Oui (solo clan exclu par défaut) | Non — tous modes agrégés ensemble |

### Champs disponibles dans `MemberLifetimeStats`

La table stocke 6 colonnes JSON, une par catégorie. Tous les modes de jeu sont agrégés ensemble.

**Catégorie `combat` :**

| Champ DB | Source API | Description |
|---|---|---|
| `kills` | `kills` | Kills totaux |
| `deaths` | `losses` | Défaites |
| `kdRatio` | `kills / losses` | K/D calculé |
| `headshots` | `headshotKills` | Kills en headshot |
| `assists` | `assists` | Assists |
| `knockouts` | `dBNOs` | Ennemis mis à terre |
| `highestKillstreak` | `maxKillStreaks` | Meilleure série de kills |
| `longestKill` | `longestKill` | Distance du kill le plus long (mètres) |
| `teamkills` | `teamKills` | Kills d'alliés |
| `suicides` | `suicides` | Suicides |

**Catégorie `victory` :**

| Champ DB | Source API | Description |
|---|---|---|
| `wins` | `wins` | Victoires |
| `losses` | `losses` | Défaites |
| `winLossRatio` | `wins / losses` | W/L calculé |
| `longestTimeAlive` | `mostSurvivalTime` | Meilleur temps de survie dans un match (secondes) |

**Catégorie `support` :**

| Champ DB | Source API | Description |
|---|---|---|
| `teammatesRevived` | `revives` | Coéquipiers relevés |
| `boostsUsed` | `boosts` | Boosters consommés |
| `healed` | `heals` | Soins consommés |

**Catégorie `vehicle` :**

| Champ DB | Source API | Description |
|---|---|---|
| `vehiclesDestroyed` | `vehicleDestroys` | Véhicules détruits |
| `roadkills` | `roadKills` | Kills depuis un véhicule |

**Catégorie `movement` :**

| Champ DB | Source API | Description |
|---|---|---|
| `drivenDistance` | `rideDistance` | Distance en véhicule (mètres) |
| `walkedDistance` | `walkDistance` | Distance à pied (mètres) |
| `swamDistance` | `swimDistance` | Distance à la nage (mètres) |

**Catégorie `other` :**

| Champ DB | Source API | Description |
|---|---|---|
| `weaponsPicked` | `weaponsAcquired` | Armes ramassées |
| `damageGiven` | `damageDealt` | Dégâts infligés |
| `timeSurvived` | `timeSurvived` (somme des modes) | Temps passé en partie, secondes — depuis le 2026-09-27 |
| `roundsPlayed` | `roundsPlayed` (somme des modes) | Parties jouées — depuis le 2026-09-27 |
| `daysPlayed` | `days` (**maximum** des modes) | Jours de jeu, plancher : l'API compte par mode — depuis le 2026-09-27 |

Les trois derniers champs sont absents des lignes synchronisées avant le 2026-09-27 ; ils arrivent au prochain
`daily_lifetime_stats_sync` (voir [Statistiques](statistiques.md) §4).

Champ supplémentaire : `lastRefreshedAt` — date de la dernière sync depuis l'API PUBG.

**Lacune principale :** aucune ventilation par mode de jeu (`squad`, `duo`, `solo`). L'API PUBG fournit ces données par mode mais le code actuel agrège tout via `aggregateGameModeStats()`.

---

## 4. Page `/members/[id]/stats`

**Route API :** `GET /api/members/[id]/stats` (lecture) / `POST /api/members/[id]/stats` (refresh forcé)

La page affiche les stats lifetime complètes du membre et sa position dans le clan pour chaque métrique.

### Sections

- **Résumé médailles** : comptage Or/Argent/Bronze + 4 KPI (wins, K/D, kills, dégâts).
- **Saison & ranked** : 3 dernières saisons (ranked + normal squad), bouton refresh.
- **Stats lifetime complètes** (`MemberLifetimeStatsPanel`) : les 6 groupes de métriques avec, pour chacune, la médaille clan si le joueur est #1/#2/#3 parmi les membres actifs.

**Rangs clan :** l'API `/api/members/[id]/stats` calcule la position du joueur pour chaque métrique lifetime en comparant avec tous les membres actifs du clan (`clanRanks`).

---

## 5. Heatmap d'activité (`/members/[id]/heatmap`)

**Route API :** `GET /api/members/[id]/activity-heatmap`

La heatmap montre la distribution de l'activité du membre par :
- **Jour de la semaine** (lundi → dimanche).
- **Heure de la journée** (0h → 23h).

La valeur de chaque cellule correspond au nombre de matchs joués à ce créneau horaire. Les données sont dérivées des `pubgCreatedAt` des matchs importés dans la table `Match`.

---

## 6. Routes API concernées

| Route | Méthode | Description |
|---|---|---|
| `/api/members/[id]/dashboard` | `GET` | Tableau de bord d'une période — voir [membres.md](membres.md) §3 |
| `/api/members/[id]/matches` | `GET` | Historique matchs (mode historique ou détection récents) |
| `/api/members/[id]/stats` | `GET` | Stats lifetime complètes + rangs clan |
| `/api/members/[id]/stats` | `POST` | Refresh forcé depuis l'API PUBG |
| `/api/members/[id]/activity-heatmap` | `GET` | Distribution d'activité par jour/heure |

---

## 7. Points d'attention

Depuis le 2026-09-27, tout le tableau de bord suit **une seule période** (semaine, mois ou tous) ; les mini-barres
rangent les parties par **soirée** (`sessionDateOf`), les agrégats `PlayerStats` et `MemberTelemetryStats` restent
calendaires (heure locale du serveur).

---

## 8. Fichiers clés

| Fichier | Rôle |
|---|---|
| `src/app/members/[id]/dashboard/page.tsx` | Orchestration de la page dashboard |
| `src/app/members/[id]/stats/page.tsx` | Page stats lifetime |
| `src/app/api/members/[id]/dashboard/route.ts` | Endpoint dashboard |
| `src/app/api/members/[id]/stats/route.ts` | Endpoint stats lifetime |
| `src/app/api/members/[id]/activity-heatmap/route.ts` | Endpoint heatmap |
| `src/components/player-dashboard/PlayerDashboardSections.tsx` | Blocs du tableau de bord ([membres.md](membres.md)) |
| `src/lib/player-dashboard.ts` | Clés de période, barres d'activité, écart au clan, profil de jeu |
| `src/components/dashboard/MatchHistory.tsx` | Historique des matchs (page Matchs du joueur) |
| `src/lib/stats-calculator.ts` | `recalculateStatsForClan()`, calcul `PlayerStats` |
| `src/lib/pubg.ts` | `fetchLifetimeStats()` |
| `src/types/dashboard.ts` | Types du dashboard et des matchs |
| `prisma/schema.prisma` | Schéma `PlayerStats`, `MemberLifetimeStats` |
