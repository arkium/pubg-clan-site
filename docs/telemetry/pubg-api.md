# Télémétrie — Couverture API PUBG

Ce document croise les endpoints de l'API officielle PUBG avec ce qui est effectivement consommé dans l'application, et recense les assets de référence utilisés.

Base URL API : `https://api.pubg.com/shards/{shard}/` — soumis au quota RPM.
CDN télémétrie : `https://assets.pubg.com` — hors quota, fichiers lourds.

---

## Endpoints consommés

| Endpoint | Usage dans l'application | Quota | Fréquence |
|----------|--------------------------|-------|-----------|
| `GET /players?filter[playerNames]={name}` | Recherche joueur par nom, résolution de l'`accountId` | Oui | A la demande (ajout membre) |
| `GET /players/{playerId}` | Récupération du `clanId` depuis le profil joueur | Oui | A la demande |
| `GET /players/{playerId}/seasons/lifetime` | Stats lifetime + liste des IDs de matchs récents | Oui | Cron `daily_sync` |
| `GET /matches/{matchId}` | Détails du match (participants, scores) + URL d'asset télémétrie | Oui | Cron `daily_sync` |
| `GET /clans?filter[clanIds]={id}` | Informations clan PUBG (nom, tag, memberCount) | Oui | A la demande / cron |
| `GET /clans/{clanId}` | Fallback direct informations clan | Oui | A la demande |
| `GET {telemetryUrl}` (CDN assets.pubg.com) | Fichier télémétrie JSON complet d'un match | Non | Pipeline télémétrie |
| `GET /seasons` | Liste des saisons disponibles, ID de la saison courante | Oui | Cron `daily_season_stats_sync` (quotidien à 5h) |
| `GET /players/{playerId}/seasons/{seasonId}` | Stats normales par saison (squad : kills, dégâts, wins, matchs) | Oui | Cron `daily_season_stats_sync` |
| `GET /players/{playerId}/seasons/{seasonId}/ranked` | Stats ranked par saison (tier, RP, kills, wins) | Oui | Cron `daily_season_stats_sync` |
| `GET /players/{playerId}/weapon_mastery` | Maîtrise par arme sur toute la carrière (kills, headshots, XP, level) | Oui | Cron `daily_season_stats_sync` |

### Notes sur les endpoints consommés

**Lifetime stats** : utilisé pour récupérer la liste des `matchIds` récents, qui alimentent le backlog de sync télémétrie. Deux appels quota par cron par joueur actif (ranked + normal).

**Télémétrie CDN** : les fichiers `assets.pubg.com` sont hors quota RPM mais peuvent peser de 10 à 200 Mo compressés. La disponibilité est limitée à **14 jours** après le match. Au-delà, le fichier est supprimé du CDN et la télémétrie ne peut plus être récupérée.

**Season stats** : le cron `daily_season_stats_sync` tourne à `0 5 * * *` (configurable via `CLAN_SEASON_STATS_SYNC_CRON`). Il met à jour `MemberSeasonStats` et `MemberWeaponMastery` en parallèle pour tous les clans actifs. Les stats ranked retiennent le meilleur mode squad (`squad-fpp` prioritaire sur `squad`).

---

## Endpoints disponibles mais non consommés

| Endpoint | Données exposées | Intérêt pour l'application |
|----------|-----------------|---------------------------|
| `GET /leaderboards/{seasonId}/{gameMode}` | Top 500 mondial par saison et mode de jeu | Moyen — comparaison globale, peu pertinent pour un suivi de clan interne |
| `GET /samples` | Echantillons aléatoires d'IDs de matchs | Faible — ne concerne pas les matchs du clan |
| `GET /clans/{clanId}/members` | Liste complète des membres PUBG avec `accountId` | Elevé — permettrait l'auto-sync des membres et la détection des départs |

L'endpoint `/clans/{clanId}/members` représente la lacune principale : les membres sont actuellement ajoutés manuellement sur le site. Sa consommation permettrait de détecter automatiquement les nouveaux membres PUBG et les départs, et d'afficher un diff entre le clan officiel PUBG et les membres trackés. Voir `docs/archive/clans-endpoint.md` pour le plan d'implémentation.

---

## Evénements télémétrie parsés

Le parser lit le fichier JSON du CDN et route chaque événement par type. Fichier source : `src/lib/pubg-telemetry/parser.ts`.

| Evénement télémétrie | Données extraites | Destination |
|---------------------|-------------------|-------------|
| `LogPlayerKillV2` | kills, headshots, distance, weapon, attacker/victim accountId | `MemberWeaponStats`, `MemberTelemetryStats.aggressionScore` |
| `LogPlayerTakeDamage` | dégâts reçus, weapon, bodyPart | `MemberTelemetryStats.avgDamageTaken` |
| `LogPlayerRevive` | reviver + victim (synergies) | `ClanSynergyTelemetryStats.reviveCount` |
| `LogPlayerMakeGroggy` | knockouts | `MemberTelemetryStats.supportScore` |
| `LogPlayerPosition` | position x/y/z, phase, in-vehicle | `SquadMatchTelemetry.positionSamples` |
| `LogGameStatePeriodically` | snapshots zone/phase | Analyse cercles |
| `LogPhaseChange` | timing des cercles | `MemberTelemetryStats.avgFirstContactPhase` |
| `LogBlueZoneDamage` | hits zone bleue | `MemberTelemetryStats.avgBlueZoneHits` |
| `LogVehicleRide` | événements ride véhicule | `MemberTelemetryStats.avgVehicleRideEvents` |
| `LogVehicleLeave` | événements leave + `maxSpeed` | `MemberTelemetryStats.maxVehicleSpeedKph`, `avgVehicleLeaveEvents` |
| `LogItemPickup` / `LogItemDrop` / `LogItemEquip` | loot basique | Agrégats loot |
| `LogItemUse` | boosts/soins, détection type par itemId | `MemberTelemetryStats` (soins) |
| `LogWeaponFireCount` | shots fired par arme (incréments de 10) | `MemberWeaponStats.shotsFired` |
| `LogHeal` | item de soin + montant `healAmount` | `MemberTelemetryStats.avgHealsUsed`, `avgHealAmount`, `avgBoostsUsed` |
| `LogParachuteLanding` | position d'atterrissage x/y | `SquadMatchTelemetry.landingSamples` |

### Evénements disponibles mais non parsés

| Evénement | Données potentiellement utiles | Intérêt |
|-----------|-------------------------------|---------|
| `LogPlayerUseThrowable` | Grenades/molotovs déployés | Moyen — indicateur de diversité du style de jeu |
| `LogSwimStart` / `LogSwimEnd` | Durée et distance de nage | Faible |
| `LogVaultStart` | Déplacements verticaux | Faible |
| `LogVehicleDamage` | Dégâts infligés aux véhicules | Faible |
| `LogPlayerDestroyBreachableWall` | Murs détruits | Faible |

### Champs d'objets partiellement utilisés

| Objet télémétrie | Champs non utilisés | Utilisation potentielle |
|-----------------|---------------------|------------------------|
| `CharacterWrapper` | `primaryWeaponFirst`, `primaryWeaponSecond`, `secondaryWeapon` | Arme en main au moment de l'événement |
| `Stats` (GameResult) | `distanceOnSwim`, `distanceOnParachute`, `distanceOnFreefall` | Détail des déplacements |
| `GameState` | `blackZonePosition`, `blackZoneRadius`, `numAliveTeams` | Progression du match |
| `Vehicle` | `feulPercent`, `altitudeAbs` | Stats véhicule avancées |

---

## Assets de référence PUBG (pubg-assets)

Repo source : `https://github.com/pubg/api-assets`. Fichiers versionnés dans `src/lib/pubg-assets/`. Assets visuels dans `public/icons/pubg/` (non versionnés, générés via `npm run sync:pubg-assets`).

### Dictionnaires

| Fichier | Contenu | Usage dans l'application |
|---------|---------|--------------------------|
| `dictionaries/damageCauserName.json` | ~160 entrées : armes (`WeapAK47_C → "AKM"`), véhicules (`BP_ATV_C → "Quad"`), entités | Alimente `weapon-label-service.ts` (remplace `DEFAULT_WEAPON_LABELS`) et `vehicle-label-service.ts` |
| `dictionaries/damageTypeCategory.json` | 45 entrées : catégories de dégâts (`Damage_Gun`, `Damage_BlueZone`, `Damage_Instant_Fall`) | `damage-type-label-service.ts`, prêt pour future page analytics dégâts |
| `dictionaries/mapName.json` | 12 entrées : noms officiels des cartes (`Baltic_Main → "Erangel (Remastered)"`) | Alimente `map-label-service.ts` |
| `dictionaries/gameMode.json` | 40 modes : Solo/Duo/Squad TPP+FPP, War Mode, Team Deathmatch | `game-mode-label-service.ts`, appliqué dans les pages telemetry/recoveries |
| `dictionaries/weaponMastery/medalName.json` | 12 médailles (`MedalFirstBlood`, `MedalLongshot`, `MedalFrenzy`, `MedalRampage`...) | `medal-name-service.ts` — prêt, non encore affiché |
| `survivalTitles.json` | 8 tiers de survie (Beginner → Lone Survivor, points 0-6000+) | `survival-title-service.ts` — prêt, bloqué par absence de `survivalPoints` en DB |

### Enums

| Fichier | Contenu | Usage |
|---------|---------|-------|
| `enums/damageReason.json` | `HeadShot`, `TorsoShot`, `ArmShot`, `LegShot`, `PelvisShot`, `NonSpecific`, `None` | Type TypeScript `DamageReason` |
| `enums/regionId.json` | Zones nommées par carte (25 sur Erangel, 30 sur Miramar...) | Page drop zones — nommer les zones d'atterrissage (non implémenté) |
| `enums/item/category.json` | `Ammunition`, `Attachment`, `Equipment`, `Event`, `Use`, `Weapon` | Type TypeScript `ItemCategory` |
| `enums/item/subCategory.json` | `Backpack`, `Boost`, `Handgun`, `Headgear`, `Heal`, `Main`, `Melee`... | Type TypeScript `ItemSubCategory` |
| `enums/vehicle/vehicleType.json` | `WheeledVehicle`, `FloatingVehicle`, `FlyingVehicle`, `Parachute`... | Type TypeScript `VehicleType` |
| `enums/weatherId.json` | `Clear`, `Night`, `Snow`, `Sunrise`, `Overcast`... | Non utilisé — donnée météo absente du schéma DB |

### Assets visuels

Téléchargés via `npm run sync:pubg-assets` (script `scripts/sync-pubg-assets.ts`) :

| Dossier source | Destination locale | Contenu |
|---------------|-------------------|---------|
| `Assets/Item/Weapon/Main/` | `public/icons/pubg/weapons/` | ~30 armes longues |
| `Assets/Item/Weapon/Handgun/` | `public/icons/pubg/weapons/` | ~7 pistolets |
| `Assets/Item/Weapon/Melee/` | `public/icons/pubg/weapons/` | ~4 armes de mêlée |
| `Assets/Vehicle/` | `public/icons/pubg/vehicles/` | 38 véhicules |

Total : **164 icônes armes + 38 icônes véhicules** lors de la dernière synchronisation.

Le dossier `public/icons/pubg/` est dans `.gitignore` — les assets sont générés et non versionnés.

**Convention de nommage armes :**

```typescript
// Clé télémétrie → nom de fichier asset
// "WeapAK47_C" → "Item_Weapon_AK47_C.png"
function weaponTelemetryToAssetName(telemetryId: string): string {
  return telemetryId.replace(/^Weap/, 'Item_Weapon_')
}
```

**Convention de nommage véhicules :**

```typescript
// "Dacia_A_03_v2_C" → "Dacia_A_00_v2_C"
// Les variantes de couleur (01, 02, 03...) → variante canonique 00
function vehicleTelemetryToAssetName(telemetryId: string): string {
  return telemetryId.replace(/_\d{2}_/, '_00_')
}
```

---

## Contraintes et limites de l'API PUBG

### Quota RPM

Tous les endpoints `api.pubg.com` sont soumis au quota de requêtes par minute (RPM). Le module `src/lib/pubg-telemetry/api-throttle.ts` gère une file d'attente interne pour éviter les erreurs 429. Les valeurs de concurrence et de timeout sont configurables via les variables d'environnement `TELEMETRY_SYNC_CONCURRENCY` et `TELEMETRY_FETCH_TIMEOUT_MS`.

### CDN télémétrie

Les fichiers `assets.pubg.com` sont hors quota RPM mais soumis à deux contraintes :
- **Taille** : les fichiers non compressés peuvent dépasser 500 Mo pour les gros matchs. L'application applique une limite configurable (`TELEMETRY_MAX_ASSET_SIZE_MB`, défaut 250 Mo) et tronque proprement si dépassée.
- **Disponibilité** : 14 jours maximum après la fin du match. Passé ce délai, le fichier est supprimé du CDN de façon définitive.

### Shard

L'application cible exclusivement le shard `steam`. Les shards console (`psn`, `xbox`) ne sont pas supportés.

### Format des IDs de saison

Les IDs de saison PUBG suivent le format `division.bro.official.pc-2018-NN` (historique) ou `division.bro.official.pc-YYYY-NN` (récent). Ils sont récupérés dynamiquement via `GET /seasons` et non hardcodés.
