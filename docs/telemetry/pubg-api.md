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

**Weapon mastery — structure réelle des champs.** Source officielle : `https://documentation.pubg.com/en/mastery-endpoint.html`, schéma exact `https://documentation.pubg.com/en/_static/swagger/en/schemas/weaponSummary.yml` (vérifié le 2026-08-02, recoupé avec l'écran "Maîtrise des armes" du client PUBG). Chaque arme expose jusqu'à trois blocs de stats au même schéma, `StatsTotal` (legacy, gelé depuis le patch 18.2), `OfficialStatsTotal` (tracker actif post-18.2) et `CompetitiveStatsTotal` (ranked uniquement) :

| Champ API | Présent dans | Description officielle | Utilisé pour |
|---|---|---|---|
| `Kills` | les trois blocs | "The total number of kills for the player" | `MemberWeaponMastery.kills` |
| `HeadShots` | les trois blocs | "The total headshots that the player has done in their career" | `MemberWeaponMastery.headshots` — **compte des coups en headshot, pas des kills** malgré le libellé officiel ambigu ; peut dépasser `Kills` (constaté sur M24 : `HeadShots=205` pour `Kills=173`, recoupé avec l'écran officiel PUBG) |
| `Groggies` | les trois blocs | "The total number of times that the player has caused another player to become groggy during their career" | `MemberWeaponMastery.knockouts` (knockdowns) — confirmé officiellement |
| `Defeats` | les trois blocs | "The total number of defeats in their career" | quasi toujours `0` — **pas** un compteur de knockouts, la doc officielle ne fait aucun lien entre `Defeats` et les knockdowns |
| `DamagePlayer` | les trois blocs | "The total damage that the player has done in their career" | `MemberWeaponMastery.damage` — confirmé officiellement comme un total carrière, pas une moyenne (le "Dgt moyens" affiché par le client PUBG n'a pas d'équivalent dans ce schéma) |
| `LongestKill` | `OfficialStatsTotal`/`CompetitiveStatsTotal` uniquement (absent de `StatsTotal`) | "The longest distance that the player got a kill for" | non consommé — match exact vérifié contre l'écran PUBG (M24 : `LongestKill=458` = "Élim. la plus lointaine (m)") |
| `MostKillsInAGame`, `MostDefeatsInAGame` | les trois blocs | records par match | non consommés |

**Aucun champ `Shots`/`Hits` (ou équivalent) n'existe dans ce schéma officiel** — la précision par arme (`hits / shots`) ne peut donc pas être calculée depuis `weapon_mastery`. Les colonnes `MemberWeaponMastery.shots`/`.hits` restent à `0` par construction ; seule la télémétrie match-par-match (`MemberWeaponStats.shotsFired`/`hitsLanded`, via `LogWeaponFireCount`/`LogPlayerTakeDamage`) fournit une vraie précision, mais sur la période trackée, pas sur la carrière complète.

**Le "Taux de headshot (%)" affiché par le client PUBG n'est pas `HeadShots / Kills`** — vérifié directement contre l'écran officiel du jeu sur deux armes (MP5K : jeu `7,44 %` vs `HeadShots/Kills` = `40,8 %` ; M24 : jeu `34,5 %` vs `HeadShots/Kills` = `118,5 %`, impossible car > 100 %). Le vrai calcul du jeu utilise un dénominateur non exposé par l'API publique.

Le code (`fetchWeaponMastery` dans `src/lib/pubg.ts`) fusionne `OfficialStatsTotal` et `StatsTotal` **champ par champ** (pas un choix d'objet entier) : certaines armes ont une activité réelle uniquement post-18.2 (legacy à zéro) ou l'inverse, donc piocher tout un bloc au lieu de l'autre sous-évalue silencieusement des armes.

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

**Comment un ID télémétrie devient une icône, un nom affiché et une catégorie de filtre (conventions de nommage, synchronisation locale, dégradé gracieux, runbook nouvelle arme) : voir [pubg-assets.md](pubg-assets.md), doc dédiée.** Cette section-ci reste l'inventaire des dictionnaires/enums bruts.

### Dictionnaires

| Fichier | Contenu | Usage dans l'application |
|---------|---------|--------------------------|
| `dictionaries/damageCauserName.json` | ~160 entrées : armes (`WeapAK47_C → "AKM"`), jetables (`ProjMolotov_C → "Molotov Cocktail"`), véhicules (`BP_ATV_C → "Quad"`), entités | Alimente `weapon-label-service.ts` (remplace `DEFAULT_WEAPON_LABELS`) et `vehicle-label-service.ts` |
| `dictionaries/itemId.json` | Dictionnaire plus large que `damageCauserName.json` : tous les items (armes, munitions, équipement, items Use — `Item_Heal_Bandage_C → "Bandage"`) | `resolveItemName()`, ajouté le 2026-08-16 pour les icônes items Use |
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

### Assets visuels — résumé

Téléchargés via `npm run sync:pubg-assets` (script `scripts/sync-pubg-assets.ts`), incrémental, non versionnés (`.gitignore`). Détail complet (conventions de nommage, exceptions de casse, runbook) dans [pubg-assets.md](pubg-assets.md).

| Dossier source | Destination locale | Contenu | État au 2026-08-16 |
|---------------|-------------------|---------|---|
| `Assets/Item/Weapon/{Main,Handgun,Melee}` + `Assets/Item/Equipment/Throwable` | `public/icons/pubg/weapons/` | Armes à feu + objets lancés (grenades, Molotov, C4...) | 178 fichiers |
| `Assets/Vehicle/` | `public/icons/pubg/vehicles/` | Véhicules | 38 fichiers |
| `Assets/Item/Use/{Heal,Boost,Fuel,Gadget}` | `public/icons/pubg/items/` | Soin, boost, fuel, gadget | 8 fichiers |

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
