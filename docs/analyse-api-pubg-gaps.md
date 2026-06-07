# Analyse API PUBG — Données disponibles vs implémentées

Ce document croise les données exposées par l'API officielle PUBG avec ce qui est effectivement consommé dans l'application. Il sert de référence pour planifier et intégrer les prochaines itérations.

**Contexte** : l'app est un outil de suivi de clan PUBG qui permet aux joueurs de visualiser leurs performances individuelles et collectives sur des périodes semaine/mois/tout-temps, dans l'objectif de s'améliorer collectivement.

Sources de données :
- API PUBG (`api.pubg.com`) — soumis au quota RPM
- Télémétrie CDN (`assets.pubg.com`) — hors quota

---

## Endpoints API PUBG : consommés vs disponibles

### Consommés

| Endpoint | Usage dans l'app |
|----------|-----------------|
| `GET /shards/{shard}/players?filter[playerNames]` | Recherche joueur par nom → `accountId` |
| `GET /shards/{shard}/players/{playerId}` | Récupération clan du joueur |
| `GET /shards/{shard}/players/{playerId}/seasons/lifetime` | Stats lifetime + IDs des matchs récents |
| `GET /shards/{shard}/matches/{matchId}` | Détails match + URL télémétrie asset |
| `GET /shards/{shard}/clans` / `/clans/{clanId}` | Infos clan PUBG |
| `GET {telemetryUrl}` (CDN) | Fichier télémétrie JSON |
| `GET /shards/{shard}/seasons` | Liste des saisons → ID saison courante (**P2.1 ✅**) |
| `GET /shards/{shard}/players/{playerId}/seasons/{seasonId}` | Stats normales par saison (**P2.1 ✅**) |
| `GET /shards/{shard}/players/{playerId}/seasons/{seasonId}/ranked` | Stats ranked + tier (**P2.1 ✅**) |
| `GET /shards/{shard}/players/{playerId}/weapon_mastery` | Maîtrise par arme sur carrière (**P2.2 ✅**) |

### Disponibles mais non consommés

| Endpoint | Données exposées | Intérêt |
|----------|-----------------|---------|
| `GET /shards/{shard}/leaderboards/{seasonId}/{gameMode}` | Top 500 mondial par saison/mode | **Moyen** — comparaison globale |
| `GET /shards/{shard}/samples` | Échantillons aléatoires de match IDs | Faible pour un clan |

---

## Champs match stockés dans `SquadMember`

**P1.1 ✅ — Tous les champs ci-dessous sont stockés dans `SquadMember` et alimentent les awards fun.**

La réponse `GET /matches/{matchId}` retourne des stats par participant dans `included[type=participant].attributes.stats`. Ces données sont disponibles **sans télémétrie**.

| Champ API | Valeur pour le clan | Award fun |
|-----------|--------------------|----|
| `timeSurvived` | Temps de survie (secondes) | Le brouteur d'herbe |
| `rideDistance` | Distance en véhicule (mètres) | JACKY TUNING |
| `walkDistance` | Distance à pied (mètres) | Le rôdeur |
| `swimDistance` | Distance à la nage (mètres) | — |
| `boosts` | Boosts consommés | L'alcoolique du dimanche |
| `heals` | Soins consommés | Le fou de l'hôpital |
| `vehicleDestroys` | Véhicules détruits | Le destructeur |
| `roadKills` | Kills depuis un véhicule | La brute de métal |
| `longestKill` | Distance du kill le plus long (mètres) | Le sniper |
| `teamKills` | Friendly fire (à monitorer) | — |
| `weaponsAcquired` | Armes ramassées | Le collectionneur d'armes |

Fichiers : `src/lib/pubg.ts` — `ParticipantStats` et `resolveMatchDetails` ; `prisma/schema.prisma` — `SquadMember`.

---

## Événements télémétrie disponibles vs parsés

### Parsés (parser v1/v2)

| Événement | Données extraites |
|-----------|-----------------|
| `LogPlayerKillV2` | kills, headshots, distance, weapon, attacker/victim accountId |
| `LogPlayerTakeDamage` | damage reçu, weapon, bodyPart |
| `LogPlayerRevive` | reviver + victim (synergies) |
| `LogPlayerMakeGroggy` | knockouts |
| `LogPlayerPosition` | position x/y/z, phase, in-vehicle |
| `LogGameStatePeriodically` | snapshots zone/phase |
| `LogPhaseChange` | timing des cercles |
| `LogBlueZoneDamage` | hits zone bleue |
| `LogVehicleRide` | événements véhicule |
| `LogVehicleLeave` | événements véhicule + **`maxSpeed`** → `maxVehicleSpeedKph` (**P3.2 ✅**) |
| `LogItemPickup/Drop/Equip` | loot basique |
| `LogItemUse` | boosts/soins + détection type par itemId |
| `LogWeaponFireCount` | shots fired par arme (incréments de 10) (**P1.2 ✅**) |
| `LogHeal` | item de soin + montant `healAmount` → `avgHealsUsed`, `avgHealAmount`, `avgBoostsUsed` (**P1.3 ✅**) |
| `LogParachuteLanding` | position d'atterrissage x/y → `landingSamples` dans `SquadMatchTelemetry` (**P3.1 ✅**) |

### Disponibles mais non parsés

| Événement | Données utiles | Intérêt |
|-----------|--------------|---------|
| `LogPlayerUseThrowable` | Grenades/molotovs déployés | **Moyen** — diversité style de jeu |
| `LogSwimStart` / `LogSwimEnd` | Durée et distance de nage | Faible |
| `LogVaultStart` | Déplacements verticaux | Faible |
| `LogVehicleDamage` | Dégâts infligés aux véhicules | Faible |
| `LogPlayerDestroyBreachableWall` | Murs détruits | Faible |

### Objets télémétrie partiellement utilisés

| Objet | Champs non utilisés | Intérêt |
|-------|-------------------|---------|
| `CharacterWrapper` | `primaryWeaponFirst`, `primaryWeaponSecond`, `secondaryWeapon` | Arme en main au moment de l'event |
| `Stats` (GameResult) | `distanceOnSwim`, `distanceOnParachute`, `distanceOnFreefall` | Détail déplacement |
| `GameState` | `blackZonePosition/Radius`, `numAliveTeams` | Progression match |
| `Vehicle` | `feulPercent`, `altitudeAbs` | Stats véhicule avancées |

---

## État fonctionnalités

| Fonctionnalité | État | Notes |
|---------------|------|-------|
| Stats armes (kills + headshots + distance) | ✅ | Parser v2 ok, backfill v1→v2 en attente |
| Revives croisés et co-kills (synergies) | ✅ | Opérationnel |
| Profil de jeu agressif/support/passif | ✅ | Scores calculés |
| Heatmaps positions sur carte | ✅ | Infrastructure ok, rendu overlay SVG à affiner |
| Analyse cercles et rotation | ✅ | Routes et agrégats présents |
| Précision tir par arme | ✅ | `LogWeaponFireCount` parsé — `shotsFired` dans `MemberWeaponStats` |
| Économie de loot (boosts/soins) | ✅ | `LogHeal` parsé — `avgHealsUsed`, `avgHealAmount`, `avgBoostsUsed` dans `MemberTelemetryStats` |
| Ranked stats (Elo/tier) | ✅ | `MemberSeasonStats` — `GET/POST /api/members/[id]/season-stats` |
| Stats par saison | ✅ | Agrégés normaux (squad) dans `MemberSeasonStats` |
| Weapon mastery (carrière) | ✅ | `MemberWeaponMastery` — `GET/POST /api/members/[id]/weapon-mastery` |
| Stats véhicules — vitesse max | ✅ | `maxVehicleSpeedKph` dans `MemberTelemetryStats`, agrégé max par période |
| Zones de drop | ✅ | `landingSamples` JSON dans `SquadMatchTelemetry` — API drop-zones |
| Awards fun | ✅ | 11 catégories — `GET /api/clans/[clanId]/awards?period=` |

---

## Priorités

### P1 ✅ — Terminé

1. **Champs match manquants dans `SquadMember`** — 13 champs extraits du résumé match PUBG API sans appel supplémentaire
2. **`LogWeaponFireCount`** — `shotsFired` disponible par arme dans le parser
3. **`LogHeal`** — montants de soin précis agrégés en `avgHealsUsed` / `avgHealAmount` / `avgBoostsUsed`

### P2 ✅ — Terminé

4. **Season stats + Ranked stats** — `MemberSeasonStats` (tier, points, kills, damage par saison), cron `0 5 * * *`
5. **Weapon Mastery API** — `MemberWeaponMastery` (kills, headshots, shots, hits, damage, level, XP par arme sur toute la carrière), bundlé dans le même cron

### P3 ✅ — Terminé

6. **`LogParachuteLanding`** — `landingSamples Json?` dans `SquadMatchTelemetry`, API `GET /api/clans/[clanId]/telemetry/drop-zones?period=`
7. **`LogVehicleLeave.maxSpeed`** — `maxVehicleSpeedKph` dans `MemberTelemetryStats`, agrégation max sur toute la période
8. **Awards fun** — `src/lib/awards-service.ts` + API `GET /api/clans/[clanId]/awards?period=week|month|all`

---

## Migration SQL

Fichier : `prisma/migrations/20260607120000_add_squad_member_stats_and_heal_telemetry/migration.sql`

**À appliquer manuellement** sur `smk.arkium.group:3306`. Ne pas lancer `prisma migrate dev/deploy` — risque de conflit de checksum sur la migration `20260604194120_add_weapon_stats_total_damage` déjà appliquée.

Contient six blocs :
1. `ALTER TABLE SquadMember` — 13 nouveaux champs ParticipantStats (P1.1)
2. `ALTER TABLE MemberTelemetryStats` — 3 champs agrégats LogHeal (P1.3) : `avgHealsUsed`, `avgHealAmount`, `avgBoostsUsed`
3. `ALTER TABLE MemberTelemetryStats` — `maxVehicleSpeedKph` (P3.2)
4. `ALTER TABLE SquadMatchTelemetry` — `landingSamples JSON NULL` (P3.1)
5. `CREATE TABLE MemberSeasonStats` — stats ranked + normales par saison (P2.1)
6. `CREATE TABLE MemberWeaponMastery` — maîtrise par arme sur carrière (P2.2)

---

## Référence API — Nouveaux endpoints (à câbler en UI)

Cette section documente précisément les contrats JSON des endpoints créés lors de P1/P2/P3, destinée à l'intégration UI.

---

### `GET /api/clans/[clanId]/awards`

**Source** : `src/app/api/clans/[clanId]/awards/route.ts`  
**Auth** : `requireRole(['Owner', 'Admin', 'Member'])` — accessible à tous les membres du clan  
**Query params** : `?period=week` (défaut) | `month` | `all`

**Réponse 200** :

```typescript
type AwardWinner = {
  memberId: number       // id interne ClanMember
  memberName: string    // displayName
  value: number         // score brut (kills, mètres, secondes…)
}

type ClanAward = {
  key: string           // identifiant stable (voir liste ci-dessous)
  label: string         // libellé narratif affiché
  description: string   // description courte
  unit: string          // unité de la valeur
  winner: AwardWinner | null  // null si aucun match dans la période
}

type ClanAwards = {
  clanId: number
  period: 'week' | 'month' | 'all'
  periodKey: string     // ex. "week-2026-23", "month-2026-06", "all-time"
  awards: ClanAward[]   // toujours 11 entrées, dans cet ordre
}
```

**11 awards dans l'ordre de réponse** :

| `key` | `label` | `description` | `unit` | Source champ `SquadMember` |
|-------|---------|---------------|--------|---------------------------|
| `top_killer` | Le croc mort | Plus de kills sur la période | kills | `kills` (total) |
| `top_damage` | La brute | Plus de dégâts infligés | dégâts | `damage` (total, arrondi) |
| `jacky_tuning` | JACKY TUNING | Plus de distance parcourue en véhicule | m | `rideDistance` (total, arrondi) |
| `le_rodeur` | Le rôdeur | Plus de distance parcourue à pied | m | `walkDistance` (total, arrondi) |
| `brouteur_herbe` | Le brouteur d'herbe | Temps de survie total le plus long | s | `timeSurvived` (total) |
| `alcoolique_dimanche` | L'alcoolique du dimanche | Plus de boosts consommés | boosts | `boosts` (total) |
| `fou_hopital` | Le fou de l'hôpital | Plus de soins utilisés | soins | `heals` (total) |
| `destructeur` | Le destructeur | Plus de véhicules détruits | véhicules | `vehicleDestroys` (total) |
| `le_sniper` | Le sniper | Kill le plus long sur la période | m | `longestKill` (max, arrondi) |
| `collectionneur` | Le collectionneur d'armes | Plus d'armes ramassées | armes | `weaponsAcquired` (total) |
| `brute_metal` | La brute de métal | Plus de kills depuis un véhicule | kills | `roadKills` (total) |

**Notes** :
- `winner` est `null` si aucun membre n'a de valeur > 0 dans la période.
- `timeSurvived` est en secondes brutes. Pour l'affichage : `Math.floor(value / 3600)h Math.floor((value % 3600) / 60)m`.
- `rideDistance` / `walkDistance` / `longestKill` sont en mètres. Pour km : diviser par 1000.
- Le calcul est à la volée depuis `SquadMember` — pas de cache, appel DB à chaque GET.

**Exemple de réponse** :

```json
{
  "clanId": 1,
  "period": "week",
  "periodKey": "week-2026-23",
  "awards": [
    {
      "key": "top_killer",
      "label": "Le croc mort",
      "description": "Plus de kills sur la période",
      "unit": "kills",
      "winner": { "memberId": 42, "memberName": "Kraken", "value": 37 }
    },
    {
      "key": "jacky_tuning",
      "label": "JACKY TUNING",
      "description": "Plus de distance parcourue en véhicule",
      "unit": "m",
      "winner": { "memberId": 7, "memberName": "Pagnol", "value": 48321 }
    }
  ]
}
```

---

### `GET /api/clans/[clanId]/telemetry/drop-zones`

**Source** : `src/app/api/clans/[clanId]/telemetry/drop-zones/route.ts`  
**Auth** : `requireRole(['Owner'])` — réservé à l'owner  
**Query params** : `?period=week` (défaut) | `month` | `all`

**Réponse 200** — enveloppée dans le contrat `buildTelemetrySuccessResponse` :

```typescript
type LandingPoint = {
  memberId: number      // id interne ClanMember
  memberName: string    // displayName
  matchId: string       // squadMatchId (UUID)
  mapName: string       // ex. "Baltic_Main", "Desert_Main"
  x: number            // coordonnée brute (mètres, repère carte PUBG)
  y: number
  xPct: number         // position normalisée en % [0..100] sur la carte
  yPct: number         // position normalisée en % [0..100] sur la carte
}

type HeatmapCell = {
  xIndex: number   // colonne dans la grille 40×40 [0..39]
  yIndex: number   // ligne dans la grille 40×40 [0..39]
  count: number    // nombre de landings dans cette cellule
}

// data retourné dans buildTelemetrySuccessResponse
type DropZonesData = {
  gridSize: 40
  points: LandingPoint[]   // un point par membre par match
  heatmap: HeatmapCell[]   // uniquement les cellules avec count > 0
}
```

**Structure complète de réponse** :

```json
{
  "success": true,
  "meta": {
    "scope": "clan",
    "clanId": 1,
    "period": "week",
    "periodKey": "week-2026-23",
    "count": 87
  },
  "data": {
    "gridSize": 40,
    "points": [
      { "memberId": 42, "memberName": "Kraken", "matchId": "abc-123", "mapName": "Baltic_Main", "x": 432100, "y": 218500, "xPct": 43.21, "yPct": 21.85 }
    ],
    "heatmap": [
      { "xIndex": 17, "yIndex": 8, "count": 5 }
    ]
  },
  "legacy": { "clanId": 1, "period": "week", "periodKey": "week-2026-23", "total": 87 }
}
```

**Notes pour l'UI** :
- Les cartes PUBG font ~816 000 × 816 000 unités (Erangel/Miramar). `xPct`/`yPct` sont déjà normalisés et utilisables directement en `left`/`top` CSS sur une image de carte.
- La grille 40×40 correspond à des cellules de ~2% de la carte. Pour le rendu heatmap, colorer les cellules selon `count` / `count_max`.
- `mapName` peut être `Baltic_Main` (Erangel), `Desert_Main` (Miramar), `Range_Main` (Training), `Savage_Main` (Sanhok), `Summerland_Main` (Karakin), `Tiger_Main` (Taego), `Kiki_Main` (Deston), `Neon_Main` (Rondo).
- Les points sans landing (matchs avec parser v1 ou antérieurs à la migration) ne figurent pas dans `points`.

---

### `GET /api/members/[id]/season-stats`

**Source** : `src/app/api/members/[id]/season-stats/route.ts`  
**Auth** : aucune vérification de rôle (lecture libre, données publiques PUBG)  
**Pas de query params**

**Réponse 200** :

```typescript
type MemberSeasonStatsRow = {
  id: number
  memberId: number
  seasonId: string           // ex. "division.bro.official.pc-2018-30"
  // Ranked (squad ou squad-fpp — meilleur mode retenu)
  rankedGameMode: string | null    // ex. "squad-fpp"
  rankedTier: string | null        // Bronze | Silver | Gold | Platinum | Diamond | Master
  rankedSubTier: string | null     // I | II | III | IV | V (null si Master)
  rankedPoints: number             // RP actuels
  rankedBestTier: string | null    // meilleur tier atteint dans la saison
  rankedBestSubTier: string | null
  rankedBestPoints: number
  rankedKills: number
  rankedDamage: number
  rankedWins: number
  rankedMatches: number
  rankedAssists: number
  rankedRevives: number
  // Normal (squad uniquement)
  normalKills: number
  normalDamage: number
  normalWins: number
  normalLosses: number
  normalAssists: number
  normalRevives: number
  normalMatches: number           // = normalWins + normalLosses
  lastRefreshedAt: string         // ISO 8601
  createdAt: string
  updatedAt: string
}

type SeasonStatsResponse = {
  memberId: number
  seasons: MemberSeasonStatsRow[]   // jusqu'à 3 saisons, ordre décroissant par seasonId
}
```

**Notes** :
- Si `rankedTier` est `null`, le joueur n'a pas joué le mode ranked cette saison (ou n'a pas encore été fetchée via POST).
- Les stats ranked sont agrégées sur le mode squad le plus favorable (`squad-fpp` > `squad` > `duo-fpp` > `duo` > `solo-fpp` > `solo`).
- Les stats normales couvrent uniquement le mode `squad` (mode claniste principal).
- Pour afficher le tier : `rankedTier + ' ' + rankedSubTier` (ex. `"Gold III"`), ou juste `"Master"` si `rankedSubTier` est null.

### `POST /api/members/[id]/season-stats`

Force le refresh depuis l'API PUBG pour la saison courante. Coûte 2 appels API PUBG quota (ranked + normal).

**Réponse 200** :
```typescript
type SeasonStatsRefreshResponse = {
  memberId: number
  seasonId: string
  isOffseason: boolean
  stats: MemberSeasonStatsRow
}
```

---

### `GET /api/members/[id]/weapon-mastery`

**Source** : `src/app/api/members/[id]/weapon-mastery/route.ts`  
**Auth** : aucune vérification de rôle  
**Pas de query params**

**Réponse 200** :

```typescript
type WeaponMasteryEntry = {
  id: number
  memberId: number
  weaponId: string      // ex. "Item_Weapon_AK47_C"
  weaponName: string    // ex. "AK47" (dérivé de weaponId : préfixe "Item_Weapon_" et suffixe "_C" supprimés)
  kills: number
  headshots: number
  knockouts: number
  shots: number
  hits: number
  damage: number        // dégâts totaux sur toute la carrière
  level: number         // niveau de maîtrise PUBG (0–10+)
  xpTotal: number       // XP total accumulé
  tier: number          // tier de médaille
  lastRefreshedAt: string   // ISO 8601
  createdAt: string
  updatedAt: string
}

type WeaponMasteryResponse = {
  memberId: number
  weapons: WeaponMasteryEntry[]   // triées par kills desc
}
```

**Notes** :
- `headshots / kills` → taux de headshot carrière par arme.
- `hits / shots` → précision globale carrière par arme.
- Les armes sans kills (`kills === 0`) figurent quand même si le joueur a des données de maîtrise PUBG.
- `level` va de 1 (débutant) à typiquement 10+ pour les armes principales.

### `POST /api/members/[id]/weapon-mastery`

Force le refresh depuis l'API PUBG. Pas de quota significatif (1 appel API).

**Réponse 200** :
```typescript
{ memberId: number; count: number }   // count = nombre d'armes upsertées
```

---

## Champs nouveaux dans `MemberTelemetryStats` (agrégats périodiques)

Ces champs ont été ajoutés à la table `MemberTelemetryStats` et sont calculés par le pipeline de recalcul des agrégats (`period-aggregates.ts`). Ils ne sont **pas encore exposés** dans une route API dédiée — la route `/telemetry/playstyle` les listera une fois mise à jour.

| Champ DB | Type | Agrégation | Source |
|----------|------|------------|--------|
| `avgHealsUsed` | DOUBLE | moyenne par match | `LogHeal` — nombre d'items de soin utilisés par match |
| `avgHealAmount` | DOUBLE | moyenne par match | `LogHeal` — montant total de HP soigné par match |
| `avgBoostsUsed` | DOUBLE | moyenne par match | `LogHeal` — nombre de boosts (analgésiques, énergie) par match |
| `maxVehicleSpeedKph` | DOUBLE | maximum sur la période | `LogVehicleLeave.maxSpeed` — vitesse max en km/h atteinte sur la période |

Ces champs sont déjà calculés et stockés en base dès que le pipeline de recalcul tourne. Ils peuvent être ajoutés à n'importe quelle requête SQL sur `MemberTelemetryStats`.

**Pour exposer ces champs en UI**, deux options :
1. Étendre la route `/telemetry/playstyle` pour inclure `avgHealsUsed`, `avgHealAmount`, `avgBoostsUsed`, `maxVehicleSpeedKph` dans le SELECT.
2. Créer une route `/telemetry/recovery-stats` ou `/telemetry/economy` spécifique.

---

## Suggestions UI — Nouvelles pages à construire

### Page Awards (priorité haute — données prêtes)

**URL suggérée** : `/clans/[clanId]/awards`  
**Endpoint** : `GET /api/clans/[clanId]/awards?period=week|month|all`  
**Auth** : Member, Admin, Owner

Composants à créer :
- Sélecteur de période (semaine / mois / tout temps) — identique aux autres pages télémétrie
- Grille de 11 cartes award. Chaque carte contient :
  - Icône ou emoji thématique (à définir par catégorie)
  - `label` en titre (ex. "Le croc mort")
  - `description` en sous-titre
  - Nom du gagnant (`winner.memberName`) mis en valeur
  - Valeur formatée (`winner.value` + `unit`)
  - État vide si `winner === null` ("Pas de données cette période")
- Les valeurs nécessitant un formatage spécifique :
  - `brouteur_herbe` : afficher en `Xh Ym Zs`
  - `jacky_tuning`, `le_rodeur` : afficher en km si ≥ 1000 m
  - `top_damage` : séparer les milliers

### Page Season Stats / Ranked (priorité haute — données prêtes)

**URL suggérée** : intégrer dans la page membre existante `/members/[id]`  
**Endpoints** : `GET /api/members/[id]/season-stats` + `POST` pour le bouton refresh

Composants à créer :
- Badge de tier ranked dans l'en-tête du profil membre :
  - Couleur par tier : Bronze (marron), Silver (gris), Gold (jaune), Platinum (cyan), Diamond (bleu), Master (violet/doré)
  - Format : `"Gold III"` ou `"Master"`
  - Afficher le tier courant (`rankedTier` + `rankedSubTier`) et le meilleur tier de saison (`rankedBestTier`)
- Tableau stats ranked : kills, damage, wins, matches, K/D, win rate
- Tableau stats normales (squad) : kills, damage, wins, losses, matches, K/D, win rate
- Bouton "Rafraîchir" → POST, puis recharge le GET

### Page Weapon Mastery (priorité moyenne — données prêtes)

**URL suggérée** : intégrer dans la page membre existante ou onglet dédié `/members/[id]/weapons`  
**Endpoints** : `GET /api/members/[id]/weapon-mastery` + `POST` pour le bouton refresh

Composants à créer :
- Tableau trié par kills (ordre par défaut) avec colonnes : Arme, Kills, Headshot%, Précision (hits/shots), Damage, Niveau
- Tri secondaire possible par headshots, damage, level
- Bouton "Rafraîchir" → POST

### Page Drop Zones (priorité moyenne — données conditionnelles)

**URL suggérée** : `/clans/[clanId]/telemetry/drop-zones`  
**Endpoint** : `GET /api/clans/[clanId]/telemetry/drop-zones?period=week|month|all`  
**Auth** : Owner uniquement

Composants à créer :
- Image de la carte (Baltic_Main par défaut) en position relative
- Points de landing superposés (`xPct`/`yPct` → `left`/`top` CSS) colorés par membre
- Overlay heatmap (grille 40×40) avec transparence variable selon `count`
- Sélecteur de période
- Légende par membre (couleur → nom)

**Remarque** : les données `landingSamples` ne sont présentes que pour les matchs parsés après la migration (créés après l'application du SQL). Les matchs historiques n'ont pas de données.

### Extension route `/telemetry/playstyle` (priorité basse — champs prêts en DB)

Ajouter dans la query SQL de `src/app/api/clans/[clanId]/telemetry/playstyle/route.ts` :

```sql
mts.avgHealsUsed,
mts.avgHealAmount,
mts.avgBoostsUsed,
mts.maxVehicleSpeedKph
```

Ces champs sont déjà en base après le recalcul des agrégats.

---

## Notes

- Le backfill v1→v2 du parser reste à faire : les matchs antérieurs à la migration n'ont pas `landingSamples` ni `maxVehicleSpeedKph`.
- Les ranked stats PUBG sont par saison et par mode ; l'app retient le meilleur mode squad pour simplifier l'affichage.
- `fetchWeaponMastery` retourne `[]` sur 404/422 (joueur sans données) — aucune erreur remontée.
- Les awards sont recalculés à chaque appel GET — prévoir un spinner côté UI si la période "all" est lente (nombreux `SquadMember` à agréger).
- Le cron `daily_season_stats_sync` tourne à `0 5 * * *` (configurable via `CLAN_SEASON_STATS_SYNC_CRON` en `.env`) et met à jour `MemberSeasonStats` + `MemberWeaponMastery` en parallèle pour tous les clans.
