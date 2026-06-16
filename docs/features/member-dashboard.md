# Dashboard membre — Stats, progression, lifetime et heatmap

Ce document décrit la page dashboard d'un membre (`/members/[id]/dashboard`), les données `PlayerStats` et `MemberLifetimeStats`, la progression, la comparaison clan, les squads fréquents et la heatmap d'activité.

---

## 1. Page `/members/[id]/dashboard`

**Page :** `src/app/members/[id]/dashboard/page.tsx`  
**Hook principal :** `usePlayerDashboard(memberId, period)`

La page charge en parallèle :
- Les données dashboard via `GET /api/members/[id]/dashboard`.
- L'historique des matchs via `GET /api/members/[id]/matches` (tri + pagination).

Deux périodes distinctes sont maintenues en état :
- `period` : période des stats dashboard (`week | month | all`).
- `matchPeriod` : période de l'historique des matchs (`week | month | all`).

Règle métier appliquée aux blocs dashboard : **mode clan sans solo** (seuls les matchs détectés avec d'autres membres du clan entrent dans les stats principales).

---

## 2. Sections affichées

### 2.1 Identité membre

Depuis `ClanMember` :
- `displayName`, `pubgPlayerName`, `platformShard`, `createdAt`.
- `avatarUrl` depuis `identities[0].user.avatarUrl` si présent.

### 2.2 Stats principales (`PlayerStats`)

**Source :** table `PlayerStats` (pré-agrégée par le cron `stats-calculator.ts`).  
**Endpoint :** `GET /api/members/[id]/dashboard` → bloc `stats`.

Les stats ne sont pas recalculées à la volée pour ce bloc — elles sont lues depuis la ligne correspondant à la `periodKey` calculée :

| Période UI | `periodKey` |
|---|---|
| `week` | `week-YYYY-WW` (ex. `week-2026-23`) |
| `month` | `month-YYYY-MM` |
| `all` | `all-time` |

**Champs disponibles dans `PlayerStats` :**

| Champ | Description |
|---|---|
| `totalKills` | Kills sur la période |
| `totalDamage` | Dégâts infligés |
| `totalAssists` | Assists |
| `totalRevives` | Relèves |
| `matchesPlayed` | Matchs joués |
| `matchesWon` | Victoires |
| `winRate` | `matchesWon / matchesPlayed` |
| `avgKillsPerGame` | K/M |
| `avgDamagePerGame` | Damage moyen par match |
| `badgeType` | Badge de distinction calculé par le cron |

Si `stats === null` (aucun match sur la période), la carte affiche un message de données indisponibles.

**Composant :** `src/components/dashboard/PlayerStats.tsx`

Affiche 4 cartes : Kills, Damage, Win Rate, Matchs joués.

### 2.3 Comparaison clan (`clanAverage`)

**Source :** tous les `PlayerStats` des membres actifs du même clan pour la même `periodKey`.

Calcul : moyenne arithmétique par métrique (`avgKills`, `avgDamage`, `avgWinRate`, `avgMatches`, `avgAssists`, `avgRevives`).

**Affichage dans les cartes stats :**

```
vsKills  = ((totalKills  - avgKills)  / avgKills)  * 100
vsDamage = ((totalDamage - avgDamage) / avgDamage) * 100
```

Règles visuelles :
- `up` si écart > +5%.
- `down` si écart < -5%.
- `neutral` sinon.

**Composant :** `src/components/dashboard/ComparisonRadar.tsx`

Axes comparés : Kills, Damage, Win Rate, Assists, Revives. Chaque axe est normalisé sur son max local (ou 100 pour le win rate). Affiche `diff` et `pct` par rapport à la moyenne clan.

### 2.4 Progression (`ProgressionChart`)

**Source :** 4 clés de semaines ISO précédentes dans `PlayerStats`.

Calcul :
1. Construction de 4 clés de semaines ISO (de la plus ancienne à la plus récente).
2. Lecture des lignes `PlayerStats` correspondantes.
3. Valeurs manquantes complétées à `0`.

**Métriques sélectionnables :** `totalKills`, `totalDamage`, `winRate`, `matchesPlayed`.

**Tendance :** compare le dernier point vs le précédent → `↑`, `↓`, `→`.

**Composant :** `src/components/dashboard/ProgressionChart.tsx`

### 2.5 Meilleures performances (`topPerformances`)

**Source :** calculé à la volée depuis `Match` + filtrage mode clan via `SquadMember`.

Filtre : la période sélectionnée restreint les candidats par `pubgCreatedAt`. Les matchs sans coéquipier clan détecté (solo clan) sont exclus.

Requête : tri par `kills desc`, puis `damageDealt desc` — extraction des 5 premiers non-solo clan.

### 2.6 Squads fréquents (`SquadFrequency`)

**Source :** calculé à la volée depuis `SquadMember` pour le membre courant.

Étapes :
1. Charger les `squadMatchId` de `SquadMember` pour le membre courant (filtrés par période via `squadMatch.createdAt`).
2. Charger les autres membres sur ces mêmes `squadMatchId`.
3. Agréger par coéquipier :
   - `matchCount`
   - `totalKills` (kills du membre courant + kills du coéquipier sur les matchs partagés)
   - `totalDamage` (damage du coéquipier)
   - `wins` (placement squad = 1)
4. Dériver `winRate = wins / matchCount`.
5. Tri côté API par `matchCount desc`, limité à 10.

**Affichage :**
- Nom du coéquipier (lien vers son dashboard).
- Nombre de matchs ensemble, kills cumulés, win rate ensemble.
- Icône coupe pour le meilleur taux (ex-æquo inclus).

**Composant :** `src/components/dashboard/SquadFrequency.tsx`

Tri côté UI via `SegmentedControl` : Matchs / Kills / Win Rate.

### 2.7 Historique des matchs

Le bloc `MatchHistory` en bas de page réutilise `GET /api/members/[id]/matches` (mode historique importé). Voir `docs/features/matches.md` pour le détail.

Particularité : ce bloc utilise `matchPeriod` (fenêtre glissante 7/30 jours), pas les périodes calendaires des stats dashboard.

**Composant :** `src/components/dashboard/MatchHistory.tsx`

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
| `/api/members/[id]/dashboard` | `GET` | Stats, progression, comparaison clan, squads, top performances |
| `/api/members/[id]/matches` | `GET` | Historique matchs (mode historique ou détection récents) |
| `/api/members/[id]/stats` | `GET` | Stats lifetime complètes + rangs clan |
| `/api/members/[id]/stats` | `POST` | Refresh forcé depuis l'API PUBG |
| `/api/members/[id]/activity-heatmap` | `GET` | Distribution d'activité par jour/heure |

---

## 7. Points d'attention

Les périodes ne sont pas homogènes entre tous les blocs du dashboard :

| Bloc | Source | Période |
|---|---|---|
| `stats` / `clanAverage` | `PlayerStats` par clé ISO/calendaire | Calendaire (semaine/mois calendaires) |
| `topPerformances` / `squads` | Agrégation live | Calendaire (semaine/mois calendaires) |
| `progression` | `PlayerStats` sur 4 semaines ISO | Calendaire |
| `MatchHistory` | `Match` via l'API matches | Glissante (7 ou 30 jours) |

La bascule de `period` met à jour les blocs stats, squads préférés et meilleures performances, mais pas l'historique des matchs (piloté par `matchPeriod` séparé).

---

## 8. Fichiers clés

| Fichier | Rôle |
|---|---|
| `src/app/members/[id]/dashboard/page.tsx` | Orchestration de la page dashboard |
| `src/app/members/[id]/stats/page.tsx` | Page stats lifetime |
| `src/app/api/members/[id]/dashboard/route.ts` | Endpoint dashboard |
| `src/app/api/members/[id]/stats/route.ts` | Endpoint stats lifetime |
| `src/app/api/members/[id]/activity-heatmap/route.ts` | Endpoint heatmap |
| `src/hooks/usePlayerDashboard.ts` | Hook dashboard + historique |
| `src/components/dashboard/PlayerStats.tsx` | Cartes stats principales |
| `src/components/dashboard/ProgressionChart.tsx` | Graphique progression |
| `src/components/dashboard/ComparisonRadar.tsx` | Radar comparaison clan |
| `src/components/dashboard/SquadFrequency.tsx` | Squads fréquents |
| `src/components/dashboard/MatchHistory.tsx` | Historique des matchs |
| `src/lib/stats-calculator.ts` | `recalculateStatsForClan()`, calcul `PlayerStats` |
| `src/lib/pubg.ts` | `fetchLifetimeStats()` |
| `src/types/dashboard.ts` | Types du dashboard et des matchs |
| `prisma/schema.prisma` | Schéma `PlayerStats`, `MemberLifetimeStats` |
