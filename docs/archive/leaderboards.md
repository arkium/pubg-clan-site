# Leaderboards — Deux systèmes distincts, données disponibles et conception des pages

Ce document distingue les deux systèmes de classement présents dans le projet, décrit l'endpoint PUBG API non encore consommé, et propose la conception de deux pages (membre et clan) qui exploitent les deux sources.

Sources de vérité du code :
- `src/app/api/clans/[clanId]/leaderboard/route.ts` — leaderboard interne clan
- `src/types/leaderboard.ts` — types du leaderboard interne
- `src/hooks/useLeaderboard.ts` — hook client leaderboard interne
- `src/lib/pubg.ts` — client API PUBG (endpoint leaderboard non consommé)
- `docs/leaderboard-calcul.md` — logique détaillée du leaderboard interne

---

## Les deux systèmes de leaderboard

> **À ne pas confondre.** Ces deux systèmes coexistent et sont complémentaires.

| | Leaderboard interne (clan) | Leaderboard PUBG API (mondial) |
|---|---|---|
| **URL page** | `/clans/[clanId]/leaderboard` ✅ | Pas encore de page ❌ |
| **Source des données** | Matchs stockés en DB (`Match`, `SquadMember`) | API PUBG — `GET /leaderboards/{seasonId}/{gameMode}` |
| **Périmètre** | Membres du clan uniquement | Top 500 mondial par saison et mode |
| **Périodes** | Semaine / Mois / All-time | Saison PUBG (fixed) |
| **Modes** | Mode clan (solo clan, duo clan, trio clan, squad clan) | Mode PUBG (squad, duo, solo + variantes FPP) |
| **Métriques** | Kills, damage, assists, revives, win rate, K/M | RP, tier, kills, K/D, KDA, damage moyen, win ratio, placement moyen |
| **Statut** | ✅ Implémenté complet | ❌ Non consommé |

---

## 1. Leaderboard interne — Ce qui est implémenté

### Endpoint interne

`GET /api/clans/[clanId]/leaderboard?period=week&sortBy=kills&killsView=clan`

### Paramètres

| Paramètre | Valeurs | Défaut | Description |
|---|---|---|---|
| `period` | `week`, `month`, `all` | `week` | Période temporelle |
| `sortBy` | `kills`, `damage`, `winRate`, `matches`, `kpm` | `kills` | Critère de tri |
| `killsView` | `clan`, `withSolo` | `clan` | Inclure ou non les matchs joués en solo par rapport au clan |

### Métriques calculées par joueur (`PlayerStatsEntry`)

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
| `soloKills` | Kills en solo clan (informatif) | `Match.kills` non présent dans `SquadMember` |
| `duoClanKills` | Kills en duo clan | `SquadMember` avec `_count.members <= 2` |
| `trioClanKills` | Kills en trio clan | `SquadMember` avec `_count.members === 3` |
| `squadClanKills` | Kills en squad clan | `SquadMember` avec `_count.members >= 4` |
| `badgeType` | Badge attribué | Calculé à la volée |

### Badges attribués à la volée

| Badge | Condition |
|---|---|
| `top_killer` | Plus grand `totalKills` |
| `top_damage` | Plus grand `totalDamage` (si pas déjà `top_killer`) |
| `best_wr` | Meilleur `winRate` avec ≥ 3 matchs |
| `mvp` | Score combiné `kills/max + damage/max + winRate` |
| `best_kpm` | Meilleur `avgKillsPerGame` (≥ 3 matchs) |

### Progression historique

Calculée à la volée sur les **4 dernières périodes** (4 semaines ou 4 mois). Champs de delta affichés :
- `killsDelta`, `matchesDelta`, `damageDelta`, `winnerDelta`, `winRateDelta`

---

## 2. Leaderboard PUBG API — Ce qui est disponible mais non consommé

### Endpoint

`GET /shards/{shard}/leaderboards/{seasonId}/{gameMode}`

### Modes de jeu valides

| `gameMode` | Description |
|---|---|
| `squad` | Escouade 4 joueurs — vue 3ème personne |
| `squad-fpp` | Escouade 4 joueurs — vue 1ère personne |
| `duo` | Duo 2 joueurs — vue 3ème personne |
| `duo-fpp` | Duo 2 joueurs — vue 1ère personne |
| `solo` | Solo — vue 3ème personne |
| `solo-fpp` | Solo — vue 1ère personne |

### Données retournées — par joueur (top 500)

| Champ API | Type | Description |
|---|---|---|
| `name` | string | Nom du joueur PUBG |
| `rank` | number | Position mondiale (1 → 500) |
| `stats.rankPoint` | number | RP courant du joueur |
| `stats.tier` | string | Tier actuel (Bronze → Master) |
| `stats.subTier` | string | Sous-tier (I → V) |
| `stats.wins` | number | Victoires sur la saison |
| `stats.games` | number | Matchs joués sur la saison |
| `stats.winRatio` | number | Ratio victoires/matchs (0–1) |
| `stats.averageDamage` | number | Dégâts moyens par match |
| `stats.kills` | number | Kills totaux sur la saison |
| `stats.killDeathRatio` | number | K/D ratio |
| `stats.kda` | number | KDA ratio (kills + assists / deaths) |
| `stats.averageRank` | number | Rang moyen de placement par match |

### Contraintes et limites

| Contrainte | Détail |
|---|---|
| **Scope** | Top 500 mondial uniquement — pas de recherche par compte ID |
| **Saison** | Nécessite un `seasonId` valide (`division.bro.official.pc-2018-XX`) |
| **Disponibilité** | Certains modes peuvent être indisponibles en offseason |
| **Quota API** | Soumis au quota RPM comme tous les endpoints API PUBG |
| **Pas de pagination** | Réponse fixe — exactement les 500 premières entrées |
| **Pas de recherche** | Impossible de demander directement le rang d'un joueur spécifique — il faut charger le top 500 et chercher dans le tableau |

### Stratégie de consommation recommandée

Pour trouver si un membre du clan apparaît dans le top 500 :
1. Appeler le leaderboard PUBG pour le mode principal du clan (`squad` ou `squad-fpp`)
2. Chercher dans les 500 entrées si `entry.name === member.pubgPlayerName`
3. Si trouvé → stocker le rang, le RP, les stats associées

> Ce n'est pas garanti de fonctionner pour tous les membres (seul le top 500 est exposé). La majorité des membres d'un clan standard n'y figurera pas.

---

## 3. Métriques disponibles — Comparaison des deux systèmes

| Métrique | Leaderboard interne | Leaderboard PUBG API |
|---|---|---|
| Kills | ✅ `totalKills` | ✅ `stats.kills` |
| Dégâts | ✅ `totalDamage` | ✅ (sous forme de `averageDamage × games`) |
| Dégâts moyens | ✅ `avgDamagePerGame` | ✅ `stats.averageDamage` |
| Assists | ✅ `totalAssists` | ❌ non fourni |
| Revives | ✅ `totalRevives` | ❌ non fourni |
| Matchs joués | ✅ `matchesPlayed` | ✅ `stats.games` |
| Victoires | ✅ `matchesWon` | ✅ `stats.wins` |
| Win rate | ✅ `winRate` | ✅ `stats.winRatio` |
| K/D ratio | ❌ non stocké | ✅ `stats.killDeathRatio` |
| KDA | ❌ non stocké | ✅ `stats.kda` |
| K/M | ✅ `avgKillsPerGame` | ❌ calculable via kills/games |
| Rang mondial | ❌ absent | ✅ `rank` (1-500) |
| RP | ❌ absent (en MemberSeasonStats) | ✅ `stats.rankPoint` |
| Tier | ❌ absent (en MemberSeasonStats) | ✅ `stats.tier` |
| Placement moyen | ❌ absent | ✅ `stats.averageRank` |
| Décomposition duo/trio/squad | ✅ `duoClanKills`, `trioClanKills`… | ❌ absent |
| Progression sur N périodes | ✅ 4 semaines/mois | ❌ saison uniquement |

---

## 4. Conception des deux pages

---

### Page A — Membre `/members/[id]/leaderboard` (nouvelle)

**Objectif :** Donner au joueur une vue de sa position dans deux contextes — dans son clan et dans le monde.

#### Bloc 1 — Position dans le clan (depuis le leaderboard interne)

Reprend les données déjà disponibles via `/api/clans/[clanId]/leaderboard`.

Sélecteur de période : `[ Semaine ]  [ Mois ]  [ All Time ]`

| Métrique | Rang clan | Ta valeur | #1 clan |
|---|---|---|---|
| Kills | #2 | 142 | PlayerX — 198 |
| Dégâts | #1 | 48 200 | Toi |
| Win rate | #3 | 11.2% | PlayerY — 18.5% |
| K/M | #2 | 3.8 | PlayerX — 4.1 |
| Matchs joués | #4 | 37 | PlayerZ — 52 |

Filtre par mode clan (toggle existant) : `[ Clan ]  [ Inclus Solo ]`

#### Bloc 2 — Décomposition kills par contexte (graphique)

Répartition visuelle des kills de la période :

```
Solo clan   ████░░░░░░  12 kills (8%)
Duo clan    ██░░░░░░░░  6 kills (4%)
Trio clan   ░░░░░░░░░░  0 kills (0%)
Squad clan  ████████░░  124 kills (87%)
```

#### Bloc 3 — Rang mondial PUBG (depuis leaderboard PUBG API)

> **Dépend de la consommation de l'endpoint PUBG.** Données stockées quotidiennement ou à la demande.

Sélecteur de mode : `[ Squad ]  [ Squad FPP ]  [ Duo ]  [ Solo ]`

| Info | Valeur |
|---|---|
| Rang mondial | #347 (ou "Hors top 500") |
| RP | 2 840 |
| Tier | Gold III |
| K/D mondial | 3.12 |
| KDA mondial | 3.84 |
| Damage moyen | 312 |
| Placement moyen | 18.4 |
| Win rate mondial | 7.3% |

Si le joueur est hors top 500, afficher : "Non classé dans le top 500 mondial pour ce mode."

#### Bloc 4 — Évolution sur les périodes récentes (depuis leaderboard interne)

Graphique ligne sur les 4 dernières semaines/mois : kills, damage, win rate.
Déjà calculé par le leaderboard interne — à reformater pour une vue membre.

---

### Page B — Clan `/clans/[clanId]/leaderboard` (existant — à enrichir)

La page existe déjà avec le leaderboard interne complet. Les améliorations proposées s'ajoutent à l'existant.

#### Ce qui existe déjà

- Sélecteur période : Semaine / Mois / All Time
- Sélecteur tri : Kills / Damage / Win Rate / Matchs / K/M
- Toggle : Clan / Inclus Solo
- Tableau classement avec badges
- Cartes Top performers (Top Killer, Top Damage, Best Win Rate, MVP, TOP K/M)
- Progression sur 4 périodes (flèches deltas)
- Décomposition kills Solo / Duo / Trio / Squad clan

#### Améliorations proposées

**1 — Filtre par mode de jeu clan**

Actuellement le leaderboard agrège tous les matchs du membre (solo clan + duo clan + trio clan + squad clan). Ajouter un filtre :

```
[ Tous ]  [ Squad clan ]  [ Duo clan ]  [ Solo clan ]
```

Chaque filtre recalcule le classement uniquement avec les matchs du mode sélectionné.

**2 — Section "Rang mondial" (en-tête de section, depuis leaderboard PUBG API)**

> **Nécessite la consommation de l'endpoint PUBG.**

Un encart sous le tableau de classement : membres du clan présents dans le top 500 mondial pour le mode actuel.

| Rang mondial | Joueur | RP | Tier | KDA | Damage moyen |
|---|---|---|---|---|---|
| #47 | PlayerA | 5 210 | Master | 5.8 | 612 |
| #182 | PlayerB | 3 840 | Diamond I | 4.1 | 487 |
| #394 | PlayerC | 2 910 | Platinum II | 3.2 | 341 |
| — | PlayerD | — | Hors top 500 | — | — |

Sélecteur de mode PUBG : `[ Squad ]  [ Squad FPP ]  [ Duo ]  [ Solo ]`

**3 — Tableau comparatif interne vs mondial**

Pour les membres présents dans les deux systèmes — comparer les métriques :

| Joueur | K/M interne | K/D mondial | Damage interne | Damage mondial | Wins interne | Wins PUBG |
|---|---|---|---|---|---|---|
| PlayerA | 4.2 (clan) | 5.8 (global) | 280 | 612 | 12 | 47 |

> Les métriques internes reflètent les matchs dans le clan (filtre période). Les métriques mondiales reflètent toute la saison tous modes confondus.

**4 — Milestone collectif : Top 500 challenge**

Un encart motivationnel :

> **Objectif clan :** Avoir 3 membres dans le top 500 mondial — 2 atteints sur 3

**5 — Noms cliquables dans le tableau**

Chaque nom du classement devient un lien vers `/members/{id}/leaderboard` (nouvelle page membre proposée ci-dessus).

---

## 5. Architecture pour consommer le leaderboard PUBG API

### Option A — Refresh à la demande (effort faible)

Un bouton "Vérifier le classement mondial" sur la page clan appelle une route qui :
1. Récupère le `seasonId` courant depuis `MemberSeasonStats`
2. Appelle `GET /leaderboards/{seasonId}/squad`
3. Cherche les membres du clan par `pubgPlayerName` dans les 500 résultats
4. Retourne les rangs trouvés (pas de stockage)

**Avantage :** zéro migration DB, implémentation en quelques heures.
**Inconvénient :** résultat volatile, pas d'historique, coût API à chaque appel.

### Option B — Sync quotidienne avec stockage (effort moyen)

Nouvelle table `MemberWorldRank` :

```prisma
model MemberWorldRank {
  id       Int        @id @default(autoincrement())
  memberId Int
  member   ClanMember @relation(...)

  seasonId  String
  gameMode  String   // "squad", "squad-fpp", "duo", "solo"...
  worldRank Int?     // null si hors top 500
  rankPoint Float    @default(0)
  tier      String?
  subTier   String?
  kills     Int      @default(0)
  games     Int      @default(0)
  wins      Int      @default(0)
  winRatio  Float    @default(0)
  kd        Float    @default(0)
  kda       Float    @default(0)
  averageDamage Float @default(0)
  averageRank   Float @default(0)

  lastCheckedAt DateTime
  @@unique([memberId, seasonId, gameMode])
}
```

Cron quotidien :
1. Pour chaque mode actif (`squad`, `squad-fpp`), appeler le leaderboard PUBG
2. Pour chaque membre du clan, chercher son nom dans les 500 résultats
3. Upsert dans `MemberWorldRank` (worldRank = null si absent du top 500)

**Avantage :** historique, affichage instantané, comparaison saison vs saison.
**Inconvénient :** coût API quotidien (2 appels par mode × nombre de clans).

---

## 6. Métriques manquantes dans le leaderboard interne (à envisager)

| Métrique | Source possible | Remarque |
|---|---|---|
| K/D ratio | `totalKills / (matchesPlayed - matchesWon)` | Approximatif (deaths = matchs perdus, pas toujours exact) |
| KDA | Besoin des assists en rapport avec les deaths | Approximatif sans le nombre exact de deaths |
| Dégâts reçus | Non disponible dans `Match`/`SquadMember` — uniquement en télémétrie | `MemberTelemetryStats.avgDamageTaken` existe |
| Headshots | `Match.headshotKills` et `SquadMember` manque ce champ | À ajouter à `SquadMember` |
| Knockdowns | `SquadMember` n'a pas `dBNOs` | À ajouter à `SquadMember` |

---

## 7. APIs concernées

| Route | Méthode | Statut | Description |
|---|---|---|---|
| `/api/clans/[clanId]/leaderboard` | `GET` | ✅ Existe | Leaderboard interne avec période, tri, toggle |
| `/api/clans/[clanId]/challenges/[id]/leaderboard` | `GET` | ✅ Existe | Leaderboard par challenge |
| `/api/clans/[clanId]/world-rank` | `GET` | ❌ À créer | Rangs mondiaux depuis l'API PUBG |
| `/api/members/[id]/world-rank` | `GET` | ❌ À créer | Rang mondial individuel |

---

## 8. Fichiers clés à modifier ou créer

| Fichier | Action |
|---|---|
| `src/lib/pubg.ts` | Ajouter `fetchLeaderboard(seasonId, gameMode, shard)` |
| `prisma/schema.prisma` | Créer `MemberWorldRank` (Option B) |
| `src/lib/cron-jobs.ts` | Ajouter sync quotidienne du rang mondial (Option B) |
| `src/app/api/clans/[clanId]/world-rank/route.ts` | Nouvelle route — rang mondial membres du clan |
| `src/app/api/members/[id]/world-rank/route.ts` | Nouvelle route — rang mondial individuel |
| `src/app/clans/[clanId]/leaderboard/page.tsx` | Ajouter filtre mode clan + section rang mondial + noms cliquables |
| `src/app/members/[id]/leaderboard/page.tsx` | Nouvelle page membre — position clan + rang mondial |
| `src/types/leaderboard.ts` | Ajouter types `WorldRankEntry`, `WorldRankResponse` |
| `docs/leaderboard-calcul.md` | Référencer ce document pour la partie API PUBG |
