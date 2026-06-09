# Season Stats — Données disponibles, lacunes et idées de suivi

Ce document compare exhaustivement ce que l'API PUBG expose pour les saisons avec ce qui est effectivement stocké dans la base de données. Il sert de base pour décider quelles données récupérer et quelles pages construire.

Source de vérité du code : `src/lib/pubg.ts` — types `PubgGameModeStats`, `PubgNormalGameModeStats`, `PubgRankedGameModeStats`.

---

## Objectif — Deux nouvelles pages

Le but est de construire **deux pages distinctes** qui exploitent les données de saison PUBG, chacune avec un filtre par mode de jeu :

| Page | URL cible | Public | Données |
|---|---|---|---|
| **Page membre** | `/members/[id]/season-stats` | Le joueur, voit ses propres stats | Stats individuelles par mode + progression + position dans le clan |
| **Page clan** | `/clans/[clanId]/season-stats` | Tous les membres, vue comparative | Classements TOP 3 par mode + grille des tiers + milestones collectifs |

### Filtre par mode de jeu

Les deux pages doivent exposer un sélecteur de mode (composant `SegmentedControl` existant dans `src/components/ui/SegmentedControl.tsx`) :

| Mode | Source des données | Statut en DB |
|---|---|---|
| **Ranked** (squad ou squad-fpp) | `MemberSeasonStats` champs `ranked*` | ✅ Stocké |
| **Squad Normal** | `MemberSeasonStats` champs `normal*` | ✅ Stocké |
| **Duo Normal** | Endpoint normal season — clé `duo` ou `duo-fpp` | ❌ Non stocké |
| **Solo Normal** | Endpoint normal season — clé `solo` ou `solo-fpp` | ❌ Non stocké |

Pour la v1, le sélecteur propose **Ranked** et **Squad Normal** (données existantes). Duo et Solo nécessitent une extension du schéma (voir section 6).

---

## 1. Endpoint Normal Season — `/players/{playerId}/seasons/{seasonId}`

Retourne `gameModeStats` avec une entrée par mode : `squad`, `squad-fpp`, `duo`, `duo-fpp`, `solo`, `solo-fpp`.

### Ce que l'API fournit (chaque mode)

| Champ API | Type | Description |
|---|---|---|
| `kills` | number | Kills totaux |
| `assists` | number | Assists totaux |
| `damageDealt` | number | Dégâts totaux infligés |
| `wins` | number | Victoires (1er place) |
| `losses` | number | Défaites |
| `revives` | number | Coéquipiers relevés |
| `dBNOs` | number | Ennemis mis à terre (knockouts) |
| `headshotKills` | number | Kills en headshot |
| `longestKill` | number | Distance du kill le plus long (mètres) |
| `maxKillStreaks` | number | Plus grande série de kills dans un match |
| `mostSurvivalTime` | number | Temps de survie max dans un seul match (secondes) |
| `timeSurvived` | number | Temps de survie total cumulé (secondes) |
| `top10s` | number | Nombre de fois dans le top 10 |
| `boosts` | number | Boosters (energy drinks, painkillers) consommés |
| `heals` | number | Soins (bandages, medkit) consommés |
| `walkDistance` | number | Distance totale à pied (mètres) |
| `rideDistance` | number | Distance totale en véhicule (mètres) |
| `swimDistance` | number | Distance totale à la nage (mètres) |
| `vehicleDestroys` | number | Véhicules détruits |
| `roadKills` | number | Kills depuis un véhicule |
| `teamKills` | number | Kills d'alliés (friendly fire) |
| `suicides` | number | Suicides |
| `weaponsAcquired` | number | Armes ramassées |

### Ce qui est extrait et stocké (`MemberSeasonStats`)

Seul le mode `squad` (ou `squad-fpp` en fallback) est traité. Seuls 7 champs sont extraits :

| Champ DB | Champ API source | Stocké |
|---|---|---|
| `normalKills` | `kills` | ✅ |
| `normalDamage` | `damageDealt` | ✅ |
| `normalWins` | `wins` | ✅ |
| `normalLosses` | `losses` | ✅ |
| `normalAssists` | `assists` | ✅ |
| `normalRevives` | `revives` | ✅ |
| `normalMatches` | `wins + losses` (calculé) | ✅ |

### Données disponibles dans l'API mais NON stockées (normal)

| Champ API | Intérêt pour le clan |
|---|---|
| `dBNOs` | Knockouts — mesure l'agressivité sans finir les kills |
| `headshotKills` | Précision — ratio headshots/kills révélateur |
| `longestKill` | Record de distance, généateur de fun |
| `top10s` | Régularité — combien de fois dans le top 10 de la partie |
| `maxKillStreaks` | Pic de performance dans un seul match |
| `mostSurvivalTime` | Meilleur temps de survie dans un seul match |
| `timeSurvived` | Temps de survie cumulé — indicateur de régularité |
| `boosts` | Consommation de boosts |
| `heals` | Soins utilisés |
| `walkDistance` | Distance à pied — indicateur de style de jeu passif/actif |
| `rideDistance` | Distance en véhicule |
| `swimDistance` | Distance à la nage |
| `vehicleDestroys` | Véhicules détruits |
| `roadKills` | Kills depuis un véhicule |
| `weaponsAcquired` | Armes ramassées — style looter ou minimaliste |
| `teamKills` | Friendly fire (à monitorer avec précaution) |
| `suicides` | Données à interpréter avec contexte |

> **Mode non stockés** : les stats `duo`, `duo-fpp`, `solo`, `solo-fpp` sont présentes dans la réponse API mais complètement ignorées — seul `squad` est extrait.

---

## 2. Endpoint Ranked Season — `/players/{playerId}/seasons/{seasonId}/ranked`

Retourne `rankedGameModeStats` par mode. L'app sélectionne le premier mode avec un `currentTier` parmi : `squad-fpp > squad > duo-fpp > duo > solo-fpp > solo`.

### Ce que l'API fournit (chaque mode ranked)

| Champ API | Type | Description |
|---|---|---|
| `currentTier.tier` | string | Rang actuel (Bronze, Silver, Gold, Platinum, Diamond, Master) |
| `currentTier.subTier` | string | Sous-rang (I, II, III, IV, V) |
| `currentRankPoint` | number | RP courant |
| `bestTier.tier` | string | Meilleur rang atteint dans la saison |
| `bestTier.subTier` | string | Meilleur sous-rang atteint |
| `bestRankPoint` | number | Pic de RP dans la saison |
| `roundsPlayed` | number | Matchs ranked joués |
| `kills` | number | Kills en ranked |
| `damageDealt` | number | Dégâts en ranked |
| `wins` | number | Victoires en ranked |
| `assists` | number | Assists en ranked |
| `revives` | number | Relèves en ranked |
| `deaths` | number | Décès en ranked |
| `kd` | number | Kill/Death ratio pré-calculé |
| `kda` | number | Kill/Death/Assist ratio pré-calculé |
| `avgRank` | number | Rang moyen de placement par match |
| `winRatio` | number | Ratio victoires/matchs (0–1) |
| `top10Ratio` | number | Ratio top-10/matchs (0–1) |

### Ce qui est extrait et stocké (`MemberSeasonStats`)

| Champ DB | Champ API source | Stocké |
|---|---|---|
| `rankedTier` | `currentTier.tier` | ✅ |
| `rankedSubTier` | `currentTier.subTier` | ✅ |
| `rankedPoints` | `currentRankPoint` | ✅ |
| `rankedBestTier` | `bestTier.tier` | ✅ |
| `rankedBestSubTier` | `bestTier.subTier` | ✅ |
| `rankedBestPoints` | `bestRankPoint` | ✅ |
| `rankedKills` | `kills` | ✅ |
| `rankedDamage` | `damageDealt` | ✅ |
| `rankedWins` | `wins` | ✅ |
| `rankedMatches` | `roundsPlayed` | ✅ |
| `rankedAssists` | `assists` | ✅ |
| `rankedRevives` | `revives` | ✅ |
| `rankedGameMode` | mode sélectionné | ✅ |

### Données disponibles dans l'API mais NON stockées (ranked)

| Champ API | Intérêt pour le clan |
|---|---|
| `deaths` | Décès — permet de calculer K/D réel côté serveur |
| `kd` | K/D pré-calculé par PUBG — évite de diviser par zéro |
| `kda` | KDA officiel PUBG — tri alternatif pour leaderboard |
| `avgRank` | Placement moyen — mesure la régularité (hors wins) |
| `winRatio` | Déjà calculable (`rankedWins / rankedMatches`) mais livré nativement |
| `top10Ratio` | Ratio top 10 — régularité sans exiger une victoire |

> **Modes non stockés** : si un joueur joue à la fois en `squad-fpp` et `squad`, seul le premier mode avec un tier est conservé. Les stats des autres modes sont perdues.

---

## 3. Endpoint Lifetime — `/players/{playerId}/seasons/lifetime`

Utilisé pour récupérer les IDs de matchs récents ET les stats lifetime. La liste complète des champs est dans `PubgGameModeStats` (src/lib/pubg.ts:126) — identique aux champs de l'endpoint normal season. Tous ces champs sont stockés dans `MemberLifetimeStats`.

---

## 4. Endpoint Weapon Mastery — `/players/{playerId}/weapon_mastery`

Données de carrière (non saisonnières), stockées dans `MemberWeaponMastery`.

| Champ DB | Signification | Stocké |
|---|---|---|
| `kills` | Kills avec cette arme | ✅ |
| `headshots` | Headshots avec cette arme | ✅ |
| `knockouts` | Knockdowns avec cette arme | ✅ |
| `shots` | Tirs effectués | ✅ |
| `hits` | Tirs qui ont touché | ✅ |
| `damage` | Dégâts infligés | ✅ |
| `level` | Niveau de maîtrise (1–10+) | ✅ |
| `xpTotal` | XP total accumulé | ✅ |
| `tier` | Tier de médaille | ✅ |

---

## 5. Endpoint Leaderboard — `/leaderboards/{seasonId}/{gameMode}`

Retourne le **top 500 mondial** par saison et mode de jeu (ex. `squad`, `squad-fpp`).

| Champ par joueur | Description |
|---|---|
| `accountId` | ID joueur PUBG |
| `name` | Nom du joueur |
| `rank` | Position dans le top 500 |
| `stats.rankPoint` | RP du joueur |
| `stats.tier` | Tier du joueur |
| `stats.subTier` | Sous-tier |
| `stats.wins` | Victoires |
| `stats.games` | Matchs joués |
| `stats.winRatio` | Ratio victoires |
| `stats.averageDamage` | Dégâts moyens par match |
| `stats.kills` | Kills totaux |
| `stats.killDeathRatio` | K/D ratio |
| `stats.kda` | KDA ratio |
| `stats.averageRank` | Placement moyen |

**Statut actuel :** endpoint disponible mais **non consommé**. Permettrait de situer les membres du clan dans le classement mondial.

---

## 6. Synthèse des lacunes prioritaires

### P1 — Fort intérêt, coût faible (déjà appelé, juste pas stocké)

Ces champs sont **déjà dans la réponse API** des appels quotidiens. Il suffit d'ajouter les colonnes en DB et de les mapper dans le code de sync — sans appel API supplémentaire.

| Champ | Endpoint | Valeur pour le clan |
|---|---|---|
| `top10s` | Normal season | Régularité — joueurs qui finissent toujours dans le peloton de tête |
| `headshotKills` | Normal + Ranked | Précision — différencie les tireurs d'élite |
| `dBNOs` | Normal season | Agressivité — joueurs qui knockent sans toujours finir |
| `avgRank` | Ranked | Placement moyen — régularité sans dépendre des wins |
| `kda` | Ranked | KDA officiel PUBG — tri leaderboard plus équitable que K/D brut |
| `deaths` | Ranked | Permet de calculer K/D réel côté app |
| `top10Ratio` | Ranked | % de matchs dans le top 10 en ranked |
| `timeSurvived` | Normal season | Temps de survie cumulé — indicateur de playstyle défensif/agressif |
| `mostSurvivalTime` | Normal season | Record de survie en un seul match |
| `longestKill` | Normal season | Distance max — award fun et record à battre |

### P2 — Intérêt moyen, pas urgent

| Champ | Endpoint | Remarque |
|---|---|---|
| `boosts`, `heals` | Normal season | Tendance survie déjà partiellement couverte par télémétrie |
| `walkDistance`, `rideDistance` | Normal season | Doublonne avec ce qui est capturé dans `SquadMember` par match |
| `maxKillStreaks` | Normal season | Fun mais rare comme metric de suivi |
| `vehicleDestroys`, `roadKills` | Normal season | Anecdotique sauf pour les awards |
| `weaponsAcquired` | Normal season | Style de jeu looter, peu discriminant |

### P3 — Hors scope actuel

| Élément | Remarque |
|---|---|
| Stats par sous-mode (duo, solo) | Multi-mode non prioritaire pour un site de clan |
| Leaderboard mondial top 500 | Coût appel API, valeur limitée sans contexte clan |
| `teamKills`, `suicides` | Données sensibles à interpréter avec contexte |

---

## 7. Conception des deux pages

---

### Page A — Membre `/members/[id]/season-stats`

**Objectif :** donner au joueur une lecture complète de sa saison en cours, mode par mode, avec sa position dans le clan sur chaque métrique.

#### Sélecteur de mode

```
[ Ranked ]  [ Squad Normal ]  [ Duo Normal* ]  [ Solo Normal* ]
* nécessite extension DB (section 6)
```

#### Contenu — mode Ranked

| Bloc | Contenu | Données sources |
|---|---|---|
| Rang actuel | Icône tier + sous-tier + RP courant | `rankedTier`, `rankedSubTier`, `rankedPoints` |
| Pic de saison | Meilleur rang atteint + RP max | `rankedBestTier`, `rankedBestPoints` |
| Combat | Kills · Dégâts · Wins · Matchs joués | `rankedKills`, `rankedDamage`, `rankedWins`, `rankedMatches` |
| Soutien | Assists · Revives | `rankedAssists`, `rankedRevives` |
| Efficacité | K/M · Win rate | calculé côté client |
| Position clan | « Tu es #2 sur les kills ranked dans ton clan » | comparaison avec `MemberSeasonStats` des coéquipiers |
| Badges saison | Badges obtenus (top killer, best RP, sauveur…) | calculé à la volée |

**Idées enrichissées (avec champs P1 ajoutés) :**

| Bloc supplémentaire | Données | Champs à ajouter en DB |
|---|---|---|
| KDA officiel | KDA pré-calculé PUBG | `rankedKda` |
| Placement moyen | Rang moyen par match | `rankedAvgRank` |
| Top 10 rate | % de matchs top 10 en ranked | `rankedTop10Ratio` |

#### Contenu — mode Squad Normal

| Bloc | Contenu | Données sources |
|---|---|---|
| Résumé | Kills · Dégâts · Wins · Matchs | `normalKills`, `normalDamage`, `normalWins`, `normalMatches` |
| Soutien | Assists · Revives | `normalAssists`, `normalRevives` |
| Efficacité | K/M · Win rate · W/L | calculé côté client |
| Position clan | Rang dans le clan par métrique | comparaison avec coéquipiers |

**Idées enrichissées (avec champs P1 ajoutés) :**

| Bloc supplémentaire | Données | Champs à ajouter en DB |
|---|---|---|
| Régularité | Nombre de top 10 | `normalTop10s` |
| Précision | Headshots / kills ratio | `normalHeadshotKills` |
| Survie | Temps de survie cumulé + record | `normalTimeSurvived`, `normalMostSurvivalTime` |
| Record | Distance kill le plus long | `normalLongestKill` |

#### Contenu — modes Duo / Solo (v2, nécessite extension DB)

Mêmes blocs que Squad Normal mais filtrés sur les champs `duo*` / `solo*` (à créer dans `MemberSeasonStats`).

---

### Page B — Clan `/clans/[clanId]/season-stats`

**Objectif :** vue comparative de tous les membres sur la saison en cours. Chaque section donne le podium TOP 3 pour les métriques clés, filtré par mode de jeu.

#### Sélecteur de mode

```
[ Ranked ]  [ Squad Normal ]  [ Duo Normal* ]  [ Solo Normal* ]
```

#### Contenu — mode Ranked

**Grille des tiers** (toujours visible, en-tête de page)

Une carte par membre du clan : avatar · nom · icône tier (Bronze → Master) · RP courant · RP peak. Triée par `rankedPoints` desc.

**Podiums TOP 3** (un podium = médaille Or/Argent/Bronze + nom + valeur)

| Podium | Métrique | Formule |
|---|---|---|
| Meilleur chasseur | Kills | `rankedKills` desc |
| Plus gros dégâts | Damage | `rankedDamage` desc |
| Best RP courant | Points de rang | `rankedPoints` desc |
| Pic RP saison | Meilleur RP | `rankedBestPoints` desc |
| Meilleur win rate | % victoires | `rankedWins / rankedMatches` |
| K/M ranked | Kills par match | `rankedKills / rankedMatches` |
| Meilleur soutien | Assists + Revives | `rankedAssists + rankedRevives` desc |

**Podiums supplémentaires avec champs P1 :**

| Podium | Métrique | Champ requis |
|---|---|---|
| Placement le plus régulier | Rang moyen (plus bas = mieux) | `rankedAvgRank` asc |
| Meilleur KDA | KDA officiel PUBG | `rankedKda` desc |
| Roi du top 10 ranked | % matchs top 10 | `rankedTop10Ratio` desc |

**Milestone collectif** (encart en bas de page)

> **Objectif saison** : 200 wins ranked — 147 atteints ▓▓▓▓▓▓▓▓░░ 74%

Calculé en `SUM(rankedWins)` de tous les membres pour le `seasonId` courant. Objectif configurable dans les settings clan.

---

#### Contenu — mode Squad Normal

**Podiums TOP 3 :**

| Podium | Métrique | Formule |
|---|---|---|
| Meilleur chasseur squad | Kills | `normalKills` desc |
| Plus gros dégâts squad | Damage | `normalDamage` desc |
| Meilleur winner squad | Wins | `normalWins` desc |
| Meilleur soigneur | Revives | `normalRevives` desc |
| K/M squad | Kills par match | `normalKills / normalMatches` desc |
| Meilleur win rate squad | % victoires | `normalWins / normalMatches` |

**Podiums supplémentaires avec champs P1 :**

| Podium | Métrique | Champ requis |
|---|---|---|
| Roi du top 10 | Nombre de top 10 | `normalTop10s` desc |
| Sniper d'élite | Headshots | `normalHeadshotKills` desc |
| Meilleur survivant | Temps de survie cumulé | `normalTimeSurvived` desc |
| Record de distance | Plus long kill | `normalLongestKill` desc |

**Milestone collectif squad :**

> **Objectif** : 500 kills squad ce mois — 312 atteints

---

#### Contenu — modes Duo / Solo (v2)

Mêmes podiums que Squad Normal mais sur les champs `duo*` / `solo*`, avec note contextuelle car le clan joue principalement en squad.

---

### Badges saisonniers (transversaux aux deux pages)

Calculés par comparaison entre membres du clan à la volée (ou via cron quotidien). Affichés sur la page membre ET dans les podiums clan.

| Badge | Icône | Condition | Mode |
|---|---|---|---|
| Meilleur RP clan | 👑 | `rankedBestPoints` le plus élevé | Ranked |
| Top Killer | 🎯 | `rankedKills` ou `normalKills` le plus élevé | Ranked / Squad |
| Sniper | 🔭 | `normalHeadshotKills` le plus élevé | Squad (P1) |
| Placement parfait | 📊 | `rankedAvgRank` le plus bas | Ranked (P1) |
| Roi du top 10 | 🏅 | `normalTop10s` ou `rankedTop10Ratio` le plus élevé | Squad / Ranked (P1) |
| Sauveur | 💊 | `rankedRevives + normalRevives` le plus élevé | Tous |
| Record longue distance | 🎳 | `normalLongestKill` le plus élevé | Squad (P1) |

Modèle à suivre : `assignBadges()` dans `src/lib/stats-calculator.ts`.

---

## 8. Extension DB nécessaire pour la v1 enrichie

Les champs P1 (fort intérêt, déjà dans la réponse API quotidienne, zéro coût supplémentaire) à ajouter à `MemberSeasonStats` :

### Ranked (nouveaux champs)

```prisma
rankedDeaths     Int   @default(0)
rankedKd         Float @default(0)   // kill/death ratio
rankedKda        Float @default(0)   // kill/death/assist ratio
rankedAvgRank    Float @default(0)   // placement moyen (plus bas = mieux)
rankedTop10Ratio Float @default(0)   // % matchs dans le top 10
```

### Normal squad (nouveaux champs)

```prisma
normalTop10s          Int   @default(0)
normalHeadshotKills   Int   @default(0)
normalTimeSurvived    Float @default(0)   // secondes cumulées
normalMostSurvivalTime Float @default(0)  // record en un seul match
normalLongestKill     Float @default(0)   // mètres
normalDbnos           Int   @default(0)   // knockouts
```

### Duo et Solo (pour la v2, si besoin)

Nouveaux blocs de champs `duo*` et `solo*` miroir des champs `normal*`.

---

## 9. Fichiers clés à modifier

| Fichier | Action |
|---|---|
| `src/lib/pubg.ts` | Étendre `PubgNormalGameModeStats` + `PubgRankedGameModeStats`, mapper les nouveaux champs dans `fetchPlayerSeasonStats` + `fetchPlayerRankedStats` |
| `prisma/schema.prisma` | Ajouter les colonnes listées en section 8 |
| `src/lib/cron-jobs.ts` | `syncSeasonStatsDaily()` — upsert des nouveaux champs |
| `src/app/api/members/[id]/season-stats/route.ts` | Exposer les nouveaux champs |
| `src/app/api/clans/[clanId]/season-stats/route.ts` | Nouvelle route — agrégation par clan + filtre `seasonId` + filtre `mode` |
| `src/app/members/[id]/season-stats/page.tsx` | Nouvelle page membre avec `SegmentedControl` mode |
| `src/app/clans/[clanId]/season-stats/page.tsx` | Nouvelle page clan avec `SegmentedControl` mode + podiums |
| `src/lib/stats-calculator.ts` | Badges saisonniers — reproduire le pattern `assignBadges()` |
