# Télémétrie PUBG — Parser

## Principe

La fonction `parseTelemetrySnapshotFromStream` (`src/lib/pubg-telemetry/parser.ts`) lit un `ReadableStream<Uint8Array>` JSON et construit un accumulateur `TelemetryAccumulator` événement par événement. Le fichier peut faire entre 1 et 35 Mo (gzip décompressé). Le parser ne charge pas le JSON en mémoire complète : il lit par chunks et démarshalise les événements un à un.

Chaque événement est identifié par son champ `_T` (ou `eventType` dans les anciennes versions de l'API PUBG). Le dispatcher appelle le handler correspondant.

Le parser retourne un `ParsedTelemetrySnapshot` contenant tous les agrégats et samples calculés.

---

## Événements parsés

### 1. LogPlayerKillV2

Événement de mort confirmée d'un joueur.

Données extraites :
- `killerKey` — `accountId` ou `name` de l'attaquant (chemins : `killer.accountId`, `attacker.accountId`, `finisher.accountId`, `dBNOMaker.accountId`)
- `victimKey` — `accountId` ou `name` de la victime (chemins : `victim.accountId`, `target.accountId`)
- `weaponName` — arme utilisée (depuis `killerDamageInfo.damageCauserName`, `finishDamageInfo.damageCauserName`, etc.)
- `isHeadshot` — détecté via `headshot === true`, `isHeadshot === true`, ou `damageReason.includes('headshot')`
- `distance` — depuis `distance`, `distanceByVictimToKiller`, `killerDamageInfo.distanceByVictimToKiller`
- `phase` — phase de cercle courante au moment de l'événement
- `killerLocation` / `victimLocation` — coordonnées x/y

Effets sur l'accumulateur :
- Incrémente `kills`, `headshots` et `damageDealt` dans `memberStats` du killer
- Incrémente `deaths` dans `memberStats` de la victime
- Met à jour `firstKillPhase` si c'est le premier kill du joueur
- Met à jour `memberWeaponStats` (kills, headshots, distance)
- Ajoute un `KillSample` dans `killSamples`

### 2. LogPlayerTakeDamage

Dégâts reçus par un joueur.

Données extraites :
- `attackerKey` — accountId de l'attaquant
- `victimKey` — accountId de la victime
- `damage` — valeur numérique (depuis `damage`, `damageDealt`, `amount`)
- `weaponName` — arme utilisée
- `isBlueZone` — détecté via `damageTypeCategory.includes('bluezone')`
- `attackerLocation` / `victimLocation` — coordonnées x/y

Effets :
- Incrémente `damageDealt` dans `memberStats` de l'attaquant
- Incrémente `damageTaken` dans `memberStats` de la victime
- Incrémente `blueZoneHits` si c'est un dégât de zone bleue
- Ajoute un cluster spatial dans `damageClusters` (regroupement par cellule de `TELEMETRY_DAMAGE_CLUSTER_RADIUS_METERS`, défaut 30 m)

### 3. LogPlayerRevive

Un joueur en relève un autre.

Données extraites :
- `reviverKey` — accountId du joueur qui relève (chemins : `reviver.accountId`, `reviverName`)
- `victimKey` — accountId du joueur relevé

Effets :
- Incrémente `revives` dans `memberStats` du reviver
- Ajoute un `ReviveSample` dans `reviveSamples` pour les deux rôles (reviver et revived)
- Alimente les synergies de revive entre paires de membres du clan

### 4. LogPlayerMakeGroggy

Un joueur en knock un autre (DBNO — Down But Not Out).

Données extraites :
- `attackerKey`, `victimKey`, `weaponName`, `isHeadshot`
- Positions attaquant et victime

Effets :
- Incrémente `knockouts` dans `memberStats` de l'attaquant
- Ajoute un `KnockoutSample` dans `knockoutSamples` pour les deux rôles

### 5. LogPlayerPosition

Position GPS d'un joueur à intervalles réguliers (environ toutes les 10 secondes).

Données extraites :
- `characterKey` — accountId du joueur (depuis `character.accountId`)
- `x`, `y` — coordonnées (depuis `character.location.x`, `location.x`)
- `phase` — phase de cercle courante
- `inVehicle` — booléen (depuis `character.isInVehicle` ou présence de `character.vehicle`)
- `timestampSeconds` — depuis `elapsedTime`, `common.elapsedTime`, ou parsing du champ `_D`

Filtrage par intervalle : un échantillon n'est enregistré que si le temps écoulé depuis le dernier sample du même joueur dépasse `minPositionSampleIntervalSeconds`. Ce paramètre est calculé automatiquement par `resolvePositionSampleInterval` selon la taille du fichier capturé :

| Taille fichier | Intervalle | Samples max (100 joueurs / 30 min) |
|---|---|---|
| Moins de 5 Mo | 10 s | ~18 000 |
| 5 à 15 Mo | 20 s | ~9 000 |
| 15 Mo et plus | 30 s | ~6 000 |

Effets :
- Ajoute un `PositionSample` dans `positionSamples`
- Ajoute un `TrajectorySegment` reliant la position précédente à la nouvelle
- Met à jour le tracking de cercle : calcul du temps passé hors zone bleue (`circleDelaySeconds`, `circleDelayPercent`)
- Met à jour `onFootDistanceMeters` ou `vehicleDistanceMeters`

### 6. LogGameStatePeriodically

Snapshot de l'état global de la partie à intervalles réguliers.

Données extraites :
- `numAlivePlayers`, `numAliveTeams`
- `safetyZoneRadius`, `poisonGasWarningRadius`
- `safetyZonePosition.x`, `safetyZonePosition.y`
- `isGame`, `timestampSeconds`

Effets :
- Met à jour `latestZoneState` dans l'accumulateur (utilisé par `LogPlayerPosition` pour le calcul du temps hors zone)
- Ajoute un `PhaseSnapshot` dans `phaseSnapshots`

### 7. LogPhaseChange

Changement de phase (numéro de cercle).

Données extraites :
- Nouveau numéro de phase

Effets :
- Met à jour `currentPhase` dans l'accumulateur
- Incrémente le compteur `phaseChangeEvents`

### 8. LogBlueZoneDamage

Dégâts de zone bleue reçus par un joueur.

Données extraites :
- `victimKey` — accountId de la victime
- `damage` — montant

Effets :
- Incrémente `blueZoneHits` dans `memberStats` de la victime

Note : `LogPlayerTakeDamage` avec `damageTypeCategory` incluant `'bluezone'` est également compté comme blue zone hit. Les deux événements peuvent exister dans un même fichier selon la version de l'API.

### 9. LogVehicleRide

Un joueur monte dans un véhicule.

Données extraites :
- `characterKey`, `vehicleType`, phase, timestamp, position

Effets :
- Incrémente `vehicleRideEvents` dans `memberStats`
- Ajoute un `VehicleSample` (action `'ride'`) dans `vehicleSamples`

### 10. LogVehicleLeave

Un joueur descend d'un véhicule.

Données extraites :
- `characterKey`, `vehicleType`, phase, timestamp, position
- `maxSpeed` — vitesse maximale atteinte dans ce véhicule (km/h)

Effets :
- Incrémente `vehicleLeaveEvents` dans `memberStats`
- Met à jour `maxVehicleSpeedKph` si la valeur est supérieure au max précédent pour ce joueur
- Ajoute un `VehicleSample` (action `'leave'`) dans `vehicleSamples`

`maxVehicleSpeedKph` est ensuite agrégé comme `MAX` sur la période dans `MemberTelemetryStats`.

### 11. LogItemPickup, LogItemDrop, LogItemEquip

Événements de gestion d'inventaire.

Données extraites :
- `characterKey`, `itemId`, `weaponName`

Effets :
- Incrémente les compteurs de loot basiques dans `memberStats`
- Contribue à la détection de l'arme en main au moment des autres événements (usage limité actuellement)

### 12. LogItemUse

Utilisation d'un objet (boost ou soin).

Données extraites :
- `characterKey`, `itemId`
- Détection du type : boost (Energy Drink, Pain Killer, Adrenaline Syringe) ou soin (Bandage, First Aid Kit, Med Kit)

Effets :
- Incrémente `healsUsed` ou `boostsUsed` selon la catégorie de l'item
- Note : `LogHeal` (voir ci-dessous) est préféré pour les montants précis

### 13. LogWeaponFireCount

Compteur de tirs par arme. Cet événement est émis par incréments de 10 tirs.

Données extraites :
- `characterKey`, `weaponId` (normalisé depuis `Item_Weapon_*`)
- `fireCount` — nombre cumulé de tirs (l'événement indique le total, pas le delta)

Filtrage : les armes jetables (grenades, molotovs, fumigènes) et les `snowball` sont exclus via `isCountableWeaponName`.

Effets :
- Met à jour `shotsFired` dans `memberWeaponStats` pour la combinaison joueur/arme
- Contribue au calcul de précision : `hitsLanded / shotsFired`

### 14. LogHeal

Utilisation d'un item de soin avec montant précis.

Données extraites :
- `characterKey`
- `item.itemId` — identifiant de l'item
- `healAmount` — montant de HP soigné

Effets :
- Incrémente `healsUsed` ou `boostsUsed` selon la catégorie (boost = Energy Drink, Pain Killer, Adrenaline Syringe)
- Accumule `healAmountTotal` pour le calcul de `avgHealAmount`

Ces valeurs sont agrégées par période dans `MemberTelemetryStats` : `avgHealsUsed`, `avgHealAmount`, `avgBoostsUsed`.

### 15. LogParachuteLanding

Atterrissage après le parachute.

Données extraites :
- `characterKey`
- Position `x`, `y` au moment de l'atterrissage (depuis `character.location`)

Effets :
- Ajoute un `PositionSample` dans `landingSamples` (sans phase, sans timestamp)
- Stocké en JSON dans `SquadMatchTelemetry.landingSamples`
- Exposé via `GET /api/clans/{id}/telemetry/drop-zones` avec normalisation en pourcentage de carte et grille 40x40

Note : cet événement n'est présent que dans les fichiers parsés avec le parser v2. Les matchs antérieurs à la migration n'ont pas de `landingSamples`.

---

## Événements disponibles mais non parsés

| Événement | Données utiles | Intérêt estimé |
|---|---|---|
| `LogPlayerUseThrowable` | Grenades et molotovs déployés, position | Moyen — diversité de style de jeu |
| `LogSwimStart` / `LogSwimEnd` | Durée et distance de nage | Faible |
| `LogVaultStart` | Déplacements verticaux | Faible |
| `LogVehicleDamage` | Dégâts infligés aux véhicules | Faible |
| `LogPlayerDestroyBreachableWall` | Murs détruits | Faible |

---

## Champs partiellement utilisés

### CharacterWrapper

L'objet `CharacterWrapper` (présent dans certains événements) contient les champs `primaryWeaponFirst`, `primaryWeaponSecond` et `secondaryWeapon` qui indiquent l'arme en main au moment de l'événement. Ces champs ne sont pas actuellement utilisés par le parser pour qualifier les dégâts ou les kills par arme équipée.

### GameState

Le champ `GameState` dans `LogGameStatePeriodically` inclut `blackZonePosition`/`blackZoneRadius` et `numAliveTeams` qui ne sont pas tous utilisés.

### Vehicle

L'objet `Vehicle` dans `LogVehicleRide`/`LogVehicleLeave` contient `fuelPercent` et `altitudeAbs` qui ne sont pas extraits.

---

## Agrégats produits

### Ce qui va dans SquadMatchTelemetry (JSON brut)

Les champs JSON dans `SquadMatchTelemetry` stockent les données brutes par match, réutilisables pour recalculer les agrégats périodiques :

| Champ JSON | Contenu |
|---|---|
| `memberStats` | Agrégats par membre : kills, headshots, dégâts, revives, knockouts, positions, armes, etc. |
| `weaponStats` | Agrégats par arme sur l'ensemble du match |
| `positionSamples` | Positions x/y des membres au fil du temps (plafonnées à 2000) |
| `trajectorySegments` | Segments de trajectoire (plafonnés à 2000) |
| `deathSamples` | Positions de mort |
| `landingSamples` | Positions de parachutage (parser v2 uniquement) |
| `killSamples` | Positions des kills avec phase et timestamp |
| `shotSamples` | Clusters spatiaux de tirs par arme |
| `damageSamples` | Clusters spatiaux de dégâts |
| `knockoutSamples` | Positions des knockouts |
| `reviveSamples` | Positions des revives |
| `vehicleSamples` | Événements véhicule |
| `phaseSnapshots` | Snapshots de l'état de la partie |
| `summary` | Compteurs d'événements parsés |

### Ce qui est calculé en agrégats périodiques

À partir de `memberStats` dans `SquadMatchTelemetry`, le pipeline de recalcul (`period-aggregates.ts`) produit :

**MemberTelemetryStats** (par joueur, par période) :
- `avgKillsPerGame`, `avgDamageDealt`, `avgRevivesPerGame`, `avgKnockoutsPerGame`
- `avgHealsUsed`, `avgHealAmount`, `avgBoostsUsed`
- `maxVehicleSpeedKph` (maximum sur la période)
- `firstKillPhase` (moyenne — indicateur d'agressivité précoce)
- `blueZoneHitsRate`, `circleDelayPercent`
- `avgOnFootDistance`, `avgVehicleDistance`

**MemberWeaponStats** (par joueur, par arme, par période) :
- `kills`, `headshots`, `avgDistance`, `shotsFired`, `hitsLanded`, `matchCount`

**ClanSynergyTelemetryStats** (par paire de joueurs, par période) :
- `reviveCount`, `coKillCount`, `matchesTogether`

---

## Note sur le backfill

Les matchs parsés avec parser v1 ont `parserVersion = 'v1'` en base. Ces enregistrements n'ont pas les champs suivants dans `SquadMatchTelemetry` :

- `landingSamples` — absent (null)
- `maxVehicleSpeedKph` dans `memberStats` — absent (0 ou null)
- `shotSamples`, `damageSamples`, `killSamples`, `knockoutSamples`, `reviveSamples`, `vehicleSamples` — absents

Les agrégats `MemberTelemetryStats` calculés depuis ces données auront `maxVehicleSpeedKph = null` et `landingSamples` ne contiendra pas d'entrées pour ces matchs.

Le backfill v1 → v2 consiste à re-parser ces matchs depuis les fichiers `.telemetry-captured/` encore présents sur disque via le mode Queue Resync avec l'option `resetBeforeSync: true`.
