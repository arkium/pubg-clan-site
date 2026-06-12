# Intégration pubg/api-assets

Analyse complète du repo officiel [`pubg/api-assets`](https://github.com/pubg/api-assets), de la correspondance avec l'état du projet, et plan d'implémentation cohérent couvrant les trois sections : **Assets**, **Dictionaries**, **Enums**.

---

## Structure complète du repo

```
pubg/api-assets/
├── Assets/
│   ├── Icons/
│   │   ├── CarePackage/
│   │   ├── Insignias/
│   │   ├── Item/
│   │   ├── Killfeed/
│   │   └── Map/
│   ├── Item/
│   │   ├── Ammunition/None/
│   │   ├── Attachment/          ← ~882 fichiers PNG
│   │   ├── Equipment/
│   │   │   ├── Backpack/
│   │   │   ├── Headgear/
│   │   │   ├── Jacket/
│   │   │   ├── Throwable/
│   │   │   └── Vest/
│   │   ├── Use/
│   │   │   ├── Boost/
│   │   │   ├── Fuel/
│   │   │   ├── Gadget/
│   │   │   └── Heal/
│   │   └── Weapon/
│   │       ├── Handgun/
│   │       ├── Main/            ← armes longues (AR, DMR, SR, SMG, LMG, SG)
│   │       └── Melee/
│   ├── Logos/                   ← 6 variantes PNG (Black/Color/White × Icon/Logo)
│   ├── MapSelection/            ← 8 thumbnails de sélection de map
│   ├── Maps/                    ← ~50 PNG (High/Low Res × Text/No Text × 13 maps)
│   ├── Mastery/
│   │   ├── Survival_Mastery/
│   │   └── Weapon_Mastery/
│   ├── Teams/
│   └── Vehicle/                 ← 38 fichiers PNG
│
├── dictionaries/
│   ├── gameMode.json
│   ├── telemetry/
│   │   ├── damageCauserName.json
│   │   ├── damageTypeCategory.json
│   │   ├── mapName.json
│   │   ├── item/
│   │   │   └── itemId.json      ← 200+ items (armes, pièces, équipements, consommables)
│   │   └── vehicle/
│   │       └── vehicleId.json   ← 100+ véhicules
│   └── weaponMastery/
│       └── medalName.json       ← 12 médailles {name, description}
│
├── enums/
│   └── telemetry/
│       ├── attackType.json
│       ├── carryState.json
│       ├── damageReason.json    ← types de touche (HeadShot, TorsoShot, ArmShot…)
│       ├── objectType.json
│       ├── objectTypeStatus.json
│       ├── regionId.json        ← zones nommées par map (Pochinki, Miramar Ruins…)
│       ├── weatherId.json       ← conditions météo (Clear, Night, Snow…)
│       ├── item/
│       │   ├── category.json
│       │   └── subCategory.json
│       └── vehicle/
│           └── vehicleType.json
│
├── seasons.json                 ← saisons PC/Xbox/PS4/Stadia 2017-2022
└── survivalTitles.json          ← 8 tiers (Beginner → Lone Survivor, points 0-6000+)
```

---

## Conventions de nommage des assets

### Armes
| Format | Exemple |
|---|---|
| Fichier asset | `Item_Weapon_AK47_C.png` |
| Clé télémétrie | `WeapAK47_C` |
| Transformation | `Weap` → `Item_Weapon_` |

Chaque arme a jusqu'à 3 variants suffixés (`_C`, `_C_h`, `_C_w`). Le variant de base sans suffixe est le HUD standard.

```typescript
function weaponTelemetryToAssetName(telemetryId: string): string {
  // "WeapAK47_C" → "Item_Weapon_AK47_C"
  return telemetryId.replace(/^Weap/, 'Item_Weapon_')
}
```

### Véhicules
| Format | Exemple |
|---|---|
| Fichier asset | `BP_ATV_C.png`, `Dacia_A_00_v2_C.png` |
| Clé `damageCauserName` | `BP_ATV_C`, `Dacia_A_01_v2_C` |
| Transformation | Remplacer le numéro de variante (`_01_`, `_02_`…) par `_00_` |

Les icônes véhicules utilisent le suffixe canonique `_00_` indépendamment de la variante de couleur/skin en jeu.

```typescript
function vehicleTelemetryToAssetName(telemetryId: string): string {
  // "Dacia_A_03_v2_C" → "Dacia_A_00_v2_C"
  return telemetryId.replace(/_\d{2}_/, '_00_')
}
```

### Maps
Pattern : `[NomMap]_Main_[Résolution][_No_Text].png`
Exemples : `Erangel_Main_High_Res.png`, `Miramar_Main_Low_Res_No_Text.png`

Le variant `No_Text` (sans labels de zones) est idéal pour les heatmaps et cartes de drop zones.

---

## Inventaire des dictionnaires

### `damageCauserName.json` — ~160 entrées

Mappe les IDs de classe Unreal → nom lisible. Couvre trois domaines :
- **Armes** : `WeapAK47_C → "AKM"`, `WeapHK416_C → "M416"`, variants named (`WeapDuncansHK416_C → "M416"`)
- **Véhicules** : `BP_ATV_C → "Quad"`, `Dacia_A_01_v2_C → "Dacia"`, `Uaz_A_01_C → "UAZ (open top)"`
- **Entités/environnement** : `RedZoneBomb_C → "Redzone"`, `BP_FireEffectController_C → "Molotov Fire"`, `Buff_DecreaseBreathInApnea_C → "Drowning"`

### `damageTypeCategory.json` — 45 entrées

`Damage_Gun → "Gun Damage"`, `Damage_BlueZone → "Bluezone Damage"`, `Damage_Instant_Fall → "Fall Damage"`, `Damage_VehicleHit → "Vehicle Damage"`, etc.

### `mapName.json` — 12 entrées

`Baltic_Main → "Erangel (Remastered)"`, `Savage_Main → "Sanhok"`, `Neon_Main → "Rondo"`, etc.
> Différence avec l'actuel : le projet écrit `"Erangel"` pour `Baltic_Main` ; le repo officiel écrit `"Erangel (Remastered)"`.

### `itemId.json` — 200+ entrées

Couvre armes, pièces jointes (scopes, chargeurs, poignées, silencieux, crosses), armures (vests L1-3, helmets L1-3, backpacks L1-3), consommables (bandage, med kit, boost), grenades, clés de coffre, parachute, drones.

### `vehicleId.json` — 100+ entrées

Véhicules terrestres, nautiques, aériens, spéciaux. Complémentaire à `damageCauserName.json` mais avec des IDs différents (format interne vs format telemetry event).

### `gameMode.json`

Solo/Duo/Squad (TPP et FPP), Esports, War Mode, Zombie, Lab, Team Deathmatch — avec labels officiels anglais.

### `medalName.json` — 12 médailles

`MedalFirstBlood → {name: "First Blood", description: "…"}`, `MedalAnnihilation`, `MedalLongshot` (≥200m), `MedalFrenzy` (5 kills arme unique), `MedalRampage` (10 kills arme unique), etc.

---

## Inventaire des enums

Les enums sont des tableaux de valeurs valides — utiles pour la **validation TypeScript**, les filtres UI exhaustifs, et les types unions.

| Fichier | Contenu | Utilité projet |
|---|---|---|
| `damageReason.json` | `["HeadShot","TorsoShot","ArmShot","LegShot","PelvisShot","NonSpecific","None"]` | Validation des taux de headshot (déjà calculés) |
| `regionId.json` | Zones nommées par map (25 sur Erangel, 30 sur Miramar, 26 sur Vikendi…) | **Page drop zones** — nommer les zones d'atterrissage |
| `weatherId.json` | `["Clear","Night","Snow","Sunrise","Sunset","Overcast","Halloween",…]` | Affichage conditions de match |
| `attackType.json` | `["BlackZone","RedZone","Weapon"]` | Filtres future page dégâts |
| `item/category.json` | `["Ammunition","Attachment","Equipment","Event","Use","Weapon"]` | Groupement items |
| `item/subCategory.json` | `["Backpack","Boost","Handgun","Headgear","Heal","Main","Melee",…]` | Filtres items |
| `vehicle/vehicleType.json` | `["WheeledVehicle","FloatingVehicle","FlyingVehicle","Parachute",…]` | Groupement véhicules |
| `carryState.json` | États de transport de corps | Peu utile actuellement |
| `objectType.json` | `["Door","Window","PropaneTank","GasPump","Ascender",…]` | Peu utile actuellement |
| `objectTypeStatus.json` | États d'objets interactifs | Peu utile actuellement |

---

## État actuel du projet — correspondance

### Ce qui existe et sera simplifié

| Service actuel | Remplacé par | Note |
|---|---|---|
| `DEFAULT_WEAPON_LABELS` (43 entrées hardcodées) | `damageCauserName.json` filtré sur `Weap*_C` | Même format de clé — remplacement direct |
| `DEFAULT_MAP_LABELS` (11 entrées hardcodées) | `mapName.json` | Même format de clé |
| Aliases `item_weapon_*_c` dans `weapon-categories.ts` | Clés `Weap*_C` directement | Éliminer la double convention |

### Ce qui n'existe pas et sera créé

| Nouveau service | Alimenté par | Déclencheur |
|---|---|---|
| `vehicle-label-service.ts` | `damageCauserName.json` (entrées véhicules) | `vehicleDestroys`/`vehicleDistance` stockés sans label affiché |
| `damage-type-label-service.ts` | `damageTypeCategory.json` | Future page analytics dégâts |
| `game-mode-label-service.ts` | `gameMode.json` | Modes de jeu affichés en brut actuellement |
| Types TypeScript depuis enums | `damageReason.json`, `item/category.json`, `vehicleType.json` | Remplacement des string literals éparpillés |

### Ce qui reste nécessaire malgré l'intégration

| Élément | Raison |
|---|---|
| Système de labels DB (weapon/map) | Les noms officiels sont EN — les admins personnalisent en FR/contexte |
| `weapon-category-service.ts` (AR/DMR/SR…) | `damageCauserName.json` ne donne pas les catégories |
| `phase-label-service.ts` | Les phases de jeu ne sont pas dans les assets PUBG |
| `DEFAULT_CATEGORY_LABELS` (FR) | Labels de catégorie en français |

---

## Discordance de convention de nommage armes

Le projet utilise deux formats selon le service :

| Service | Format | Exemple |
|---|---|---|
| `weapon-label-service.ts` | `Weap*_C` PascalCase | `WeapAK47_C` |
| `weapon-categories.ts` aliases | `item_weapon_*_c` lowercase | `item_weapon_akm_c` |
| `damageCauserName.json` (officiel) | `Weap*_C` PascalCase | `WeapAK47_C` |
| Asset filename | `Item_Weapon_*_C` | `Item_Weapon_AK47_C.png` |

La donnée télémétrie PUBG arrive en `Weap*_C`. Le format `item_weapon_*_c` est une normalisation manuelle à éliminer.

---

## Architecture d'intégration

### Localisation des fichiers

```
src/lib/pubg-assets/
  index.ts                    ← point d'entrée unique, exporte tous les resolvers
  asset-url.ts                ← helpers weaponIconUrl(), vehicleIconUrl(), mapImageUrl()
  dictionaries/
    damageCauserName.json
    damageTypeCategory.json
    mapName.json
    gameMode.json
    item/
      itemId.json
    vehicle/
      vehicleId.json
    weaponMastery/
      medalName.json
  enums/
    damageReason.json
    regionId.json
    weatherId.json
    attackType.json
    item/
      category.json
      subCategory.json
    vehicle/
      vehicleType.json
  seasons.json
  survivalTitles.json

public/icons/pubg/
  weapons/                    ← Assets/Item/Weapon/Main/ + Handgun/ + Melee/
  vehicles/                   ← Assets/Vehicle/ (38 fichiers)

public/maps/pubg/             ← existant (conserver)
  [possibilité d'ajouter les No_Text variants pour heatmaps]
```

### Interface du module `index.ts`

```typescript
// src/lib/pubg-assets/index.ts

import damageCauserName from './dictionaries/damageCauserName.json'
import damageTypeCategory from './dictionaries/damageTypeCategory.json'
import mapName from './dictionaries/mapName.json'
import gameMode from './dictionaries/gameMode.json'

// Résolution de noms
export function resolveWeaponName(id: string): string
export function resolveVehicleName(id: string): string
export function resolveMapName(id: string): string
export function resolveDamageType(id: string): string
export function resolveGameMode(id: string): string

// URLs d'assets
export function weaponIconUrl(telemetryId: string): string
export function vehicleIconUrl(telemetryId: string): string
export function mapImageUrl(mapKey: string, opts?: { res?: 'high' | 'low'; noText?: boolean }): string

// Enums (pour types TypeScript et validation)
export type DamageReason = 'HeadShot' | 'TorsoShot' | 'ArmShot' | 'LegShot' | 'PelvisShot' | 'NonSpecific' | 'None'
export type VehicleType = 'WheeledVehicle' | 'FloatingVehicle' | 'FlyingVehicle' | 'Parachute' | 'TransportAircraft' | 'Mortar' | 'EmergencyPickup'
export type ItemCategory = 'Ammunition' | 'Attachment' | 'Equipment' | 'Event' | 'Use' | 'Weapon'
```

### Script de sync des assets visuels

`scripts/sync-pubg-assets.ts` — télécharge uniquement les assets nécessaires depuis raw GitHub :
- `Assets/Item/Weapon/Main/` → ~30 armes × 1 variant de base = ~30 fichiers
- `Assets/Item/Weapon/Handgun/` → ~7 fichiers
- `Assets/Item/Weapon/Melee/` → ~4 fichiers
- `Assets/Vehicle/` → 38 fichiers
- Optionnel : `Assets/Maps/*_No_Text_*.png` → 13 fichiers (heatmaps)

Total attendu : **~90 fichiers PNG**.

```bash
npm run sync:pubg-assets        # télécharge/met à jour les assets visuels
```

`/public/icons/pubg/` est ajouté au `.gitignore` — les assets visuels sont générés, pas versionnés. Les JSONs dans `src/lib/pubg-assets/` sont eux versionnés (source de vérité).

---

## Matrice de priorité

### Dictionnaires

| Ressource | Priorité | Raison |
|---|---|---|
| `damageCauserName.json` (armes) | **P1 — Quick win** | Remplace `DEFAULT_WEAPON_LABELS` directement |
| `damageCauserName.json` (véhicules) | **P1** | Données stockées, aucun label affiché actuellement |
| `mapName.json` | **P1 — Quick win** | Remplace `DEFAULT_MAP_LABELS` directement |
| `gameMode.json` | **P2** | Modes affichés en brut sur certaines pages |
| `damageTypeCategory.json` | **P2** | Prêt pour la future page analytics dégâts |
| `itemId.json` | **P3** | Utile pour care packages / loot (non implémenté) |
| `vehicleId.json` | **P3** | Complémentaire — IDs différents de `damageCauserName` |
| `medalName.json` | **P3** | Système de médailles non implémenté |
| `seasons.json` | **P2** | Résolution des IDs de saison actuellement hardcodés |
| `survivalTitles.json` | **P3** | Non affiché actuellement |

### Enums

| Ressource | Priorité | Raison |
|---|---|---|
| `damageReason.json` | **P1** | Génère le type TypeScript `DamageReason` (headshots déjà calculés) |
| `regionId.json` | **P2** | Page drop zones existante — nommer les zones atterrissage |
| `item/category.json` + `subCategory.json` | **P2** | Types pour grouper `itemId.json` |
| `vehicle/vehicleType.json` | **P2** | Groupement véhicules (terrestre/nautique/aérien) |
| `weatherId.json` | **P3** | Conditions météo des matchs |
| `attackType.json` | **P3** | Validation, peu affiché |
| `carryState.json` | **P4** | Peu pertinent affichage |
| `objectType.json` + `objectTypeStatus.json` | **P4** | Interactions objets non exploitées |

### Assets visuels

| Ressource | Priorité | Raison |
|---|---|---|
| `Assets/Item/Weapon/Main/` | **P1** | Icônes immédiatement intégrables dans tableau armes |
| `Assets/Item/Weapon/Handgun/` + `Melee/` | **P1** | Complète la couverture armes |
| `Assets/Vehicle/` | **P1** | Va avec le nouveau vehicle-label-service |
| `Assets/Maps/*_No_Text_*.png` | **P2** | Remplacement des images heatmap (sans labels de zones) |
| `Assets/MapSelection/` | **P3** | Thumbnails pour UI de sélection de map |
| `Assets/Icons/CarePackage/` | **P3** | Future page care packages |
| `Assets/Mastery/` | **P4** | Système mastery non implémenté |
| `Assets/Item/Attachment/` | **P4** | 882 fichiers — trop lourd sans feature dédiée |

---

## Plan d'implémentation avec checklist

### Phase 1 — Fondations (JSONs + script sync) ✅

- [x] Créer `src/lib/pubg-assets/` et y copier les JSONs prioritaires P1 :
  - `dictionaries/damageCauserName.json`
  - `dictionaries/damageTypeCategory.json`
  - `dictionaries/mapName.json`
  - `enums/damageReason.json`
- [x] Créer `scripts/sync-pubg-assets.ts` — télécharge armes + véhicules + maps No_Text depuis raw GitHub
- [x] Ajouter `npm run sync:pubg-assets` dans `package.json`
- [x] Ajouter `public/icons/pubg/` au `.gitignore`
- [x] Créer `src/lib/pubg-assets/asset-url.ts` avec `weaponTelemetryToAssetName()`, `vehicleTelemetryToAssetName()`, `weaponIconUrl()`, `vehicleIconUrl()`
- [x] Créer `src/lib/pubg-assets/index.ts` — point d'entrée unifié avec resolvers et re-exports
- [x] Exécuté `npm run sync:pubg-assets` : **164 icônes armes + 38 icônes véhicules** téléchargés dans `public/icons/pubg/`

### Phase 2 — Simplification des services labels (P1 quick wins) ✅

- [x] **`weapon-label-service.ts`** : `DEFAULT_WEAPON_LABELS` remplacé par `Object.fromEntries(damageCauserName.json filtré Weap*_C)` — couvre maintenant VSS, Lynx AMR, O12, R45, Mosin-Nagant et tous les variants named ; corrige UMP45 → UMP9 (nom officiel)
- [x] **`map-label-service.ts`** : `DEFAULT_MAP_LABELS` remplacé par import direct de `mapName.json` — Baltic_Main passe à "Erangel (Remastered)" (nom officiel)
- [x] **`weapon-categories.ts`** : aliases `item_weapon_*_c` supprimés — chaque entrée ne conserve que les alias courts (`'akm'`, `'scarl'`, `'m762'`…)
- [x] `DamageReason` type exporté depuis `pubg-assets/index.ts` (Phase 1) — pas de string literals à remplacer dans le parser actuel (détection headshot via `.includes('headshot')` générique)

### Phase 3 — Nouveaux services (P1-P2) ✅

- [x] Créer `src/lib/vehicle-label-service.ts` : **91 entrées** extraites via `VEHICLE_KEY_PREFIXES` depuis `damageCauserName.json` — DB-backed, expose `vehicleDisplayName(id, labels)`
- [x] Créer `src/lib/damage-type-label-service.ts` : wrapper pur sur `damageTypeCategory.json` — expose `damageTypeDisplayName(id)` (pas de customisation DB, labels système fixes)
- [x] Créer `src/lib/game-mode-label-service.ts` : wrapper pur sur `gameMode.json` (40 modes) — expose `gameModeDisplayName(id)`
- [x] `src/lib/pubg-assets/index.ts` mis à jour : `gameMode` dictionary + `resolveGameMode()` ajoutés

### Phase 4 — Affichage visuel (P1) ✅

- [x] Composant `WeaponIcon` (`src/components/ui/WeaponIcon.tsx`) : `<img>` + `pubg-icon-filter` (inversion light/dark via CSS) + fallback `null` si PNG absent
- [x] Composant `VehicleIcon` (`src/components/ui/VehicleIcon.tsx`) : même pattern
- [x] Intégrer `WeaponIcon` dans la page `/clans/[clanId]/stats/weapons/` (mobile card + tableau desktop)
- [x] Leaderboard/kills : pas de données armes → intégration non pertinente
- [x] `globals.css` : règle `html[data-app-theme='light'] .pubg-icon-filter { filter: brightness(0); }` ajoutée

### Phase 5 — Enrichissements (P2-P3) ✅ (partiel)

- [ ] `enums/telemetry/regionId.json` → intégrer les noms de zones dans la page drop zones (requiert refonte API + DB, reporté)
- [x] `dictionaries/gameMode.json` → `resolveGameMode()` appliqué dans 3 pages (`matches/telemetry`, `telemetry/matches/telemetry`, `telemetry/recoveries`) — `squad-fpp` → `"Squad FPP"`
- [ ] `enums/weatherId.json` — aucune donnée météo en DB actuellement, reporté
- [x] `enums/telemetry/item/category.json` + `subCategory.json` → copiés dans `src/lib/pubg-assets/enums/item/`, types `ItemCategory` et `ItemSubCategory` exportés depuis `index.ts`
- [x] `enums/telemetry/vehicle/vehicleType.json` → copié dans `src/lib/pubg-assets/enums/vehicle/`, type `VehicleType` exporté depuis `index.ts`
- [ ] Comparer `Assets/Maps/` avec images locales — images webp actuelles suffisantes, reporté
- [ ] `seasons.json` → saisons gérées dynamiquement via l'API PUBG, IDs non hardcodés, sans valeur ajoutée

### Phase 6 — Bonus (P3-P4) ✅ (partiel)

- [ ] `dictionaries/itemId.json` + `Assets/Icons/CarePackage/` → future page care packages (nécessite nouvelle page)
- [x] `dictionaries/weaponMastery/medalName.json` → copié dans `src/lib/pubg-assets/dictionaries/weaponMastery/`, service `src/lib/medal-name-service.ts` créé : `resolveMedalName(id)`, `resolveMedalDescription(id)`, type `MedalId` exporté. Prêt pour affichage quand les données mastery incluront les médailles.
- [x] `survivalTitles.json` → copié + restructuré dans `src/lib/pubg-assets/survivalTitles.json`, service `src/lib/survival-title-service.ts` créé : `survivalTitleFromPoints(sp)`, `survivalLevelFromPoints(sp)`, `formatSurvivalTitle(key)`. Prêt pour affichage quand `survivalPoints` sera ajouté au schéma DB.
- [ ] `Assets/MapSelection/` thumbnails → 8/11 cartes seulement (Deston/Rondo/Taego absents), nommage incompatible avec convention `{mapKey}.webp` → reporté

---

## Points manquants et axes d'amélioration

### Services créés mais non raccordés à l'UI

| Service | Raison du blocage | Ce qui débloque |
|---|---|---|
| `survival-title-service.ts` | Champ `survivalPoints` absent du schéma DB | Ajouter `survivalPoints Int?` dans `MemberStats`, puis le remplir via l'API PUBG mastery |
| `medal-name-service.ts` | Les médailles ne sont pas capturées dans les données mastery actuellement stockées | Étendre la réponse `/weapon-mastery` pour stocker `medals[]` par arme |
| `VehicleIcon` (composant) | Créé mais non intégré dans aucune page | Intégrer quand une page affiche des kills/données véhicules |

### Écarts de couverture connus

#### `resolveWeaponName` vs mastery IDs

`resolveWeaponName(id)` s'appuie sur `damageCauserName.json` dont les clés sont en format télémétrie `WeapAK47_C`. Les données **weapon mastery** utilisent le format `Item_Weapon_AK47_C`. Un appel `resolveWeaponName('Item_Weapon_AK47_C')` retourne l'ID brut au lieu du label.

**Correction à apporter dans `src/lib/pubg-assets/index.ts` :**
```typescript
export function resolveWeaponName(id: string): string {
  if (damageCauserName[id]) return damageCauserName[id]
  // Mastery format: Item_Weapon_AK47_C → tenter WeapAK47_C
  const telemetryKey = id.replace(/^Item_Weapon_/, 'Weap')
  return damageCauserName[telemetryKey] ?? id
}
```

#### `mapImageUrl()` vs `MapImage` — incohérence

La fonction `mapImageUrl()` dans `asset-url.ts` génère des chemins `_Low_Res.png` (héritage). Les images en production sont en `.webp`. Le composant `MapImage` contourne le problème en construisant le chemin directement.

**À corriger :** marquer `mapImageUrl()` `@deprecated` et toujours passer par `MapImage` en composant — ou mettre à jour la fonction pour retourner `.webp`.

#### `survivalTitles.json` — doublon SURVIVOR / LONE SURVIVOR

Les deux entrées partagent `title: 7` et les mêmes seuils (`minPoints: 6000, maxPoints: null`). Le service retournera toujours `LONE SURVIVOR` (itéré en premier). La distinction réelle dans le jeu n'est pas documentée dans le repo — à surveiller.

### Intégrations visuelles non exploitées

#### VehicleIcon — pages cibles potentielles

Le composant est prêt mais inutilisé. Pages pertinentes à terme :
- Future **page stats véhicules** (kills, distance parcourue par type)
- Page analytics dégâts (si créée)
- Kill feed dans le détail match

#### MapImage — intégrations supplémentaires

Actuellement : `/members/[id]/map-stats` et settings. Opportunités :
- **Page détail match** : bandeau de la map en haut (`/clans/[clanId]/matches/[matchId]`)
- **Sélecteur de map** dans les filtres (dropdown avec thumbnail)
- **Page drop zones** si créée

#### gameMode — filtres UI non résolus

`resolveGameMode()` est appliqué dans l'affichage des résultats (telemetry, recoveries) mais pas nécessairement dans les `SegmentedControl` de filtres. Vérifier :
- `/clans/[clanId]/matches` — filtre mode de jeu
- `/members/[id]/matches` — idem

### Assets `MapSelection/` — couverture incomplète

Le dossier `Assets/MapSelection/` contient 8 thumbnails, **Deston/Rondo (Neon_Main)/Taego absents**. La convention de nommage du repo diffère de la convention `.webp` locale.

Quand les 3 thumbnails manquants seront publiés :
1. Comparer la convention de nommage
2. Mettre à jour `scripts/sync-pubg-assets.ts` pour inclure `Assets/MapSelection/`
3. Étendre `MapImage` avec un mode `thumbnail` ou créer `MapThumbnail`

### Pages futures nécessitant de nouveaux assets

| Feature | Assets requis | JSONs requis | Complexité |
|---|---|---|---|
| **Care packages** | `Assets/Icons/CarePackage/` | `dictionaries/telemetry/item/itemId.json` | Élevée (nouvelle page + parser events) |
| **Stats véhicules** | `Assets/Vehicle/` ✅ déjà téléchargés | `dictionaries/telemetry/vehicle/vehicleId.json` | Moyenne |
| **Drop zones nommées** | Aucun | `enums/telemetry/regionId.json` | Élevée (refonte API drop zones + DB) |
| **Analytics dégâts** | Aucun | `dictionaries/damageTypeCategory.json` ✅ présent | Faible (service déjà créé) |
| **Météo match** | Aucun | `enums/telemetry/weatherId.json` | Faible — bloqué par absence de la donnée en DB |

### Schéma DB — champs à ajouter

```prisma
// prisma/schema.prisma

model MemberStats {
  // ...débloque survival-title-service.ts
  survivalPoints Int?
}

// Table séparée pour les médailles (débloque medal-name-service.ts)
model WeaponMasteryMedal {
  id        Int           @id @default(autoincrement())
  masteryId Int
  medalId   String        // MedalFirstBlood, MedalLongshot, etc.
  count     Int
  mastery   WeaponMastery @relation(fields: [masteryId], references: [id])
}
```

---

## Notes de licence

Repo régi par les Terms of Use PUBG et la politique "Player-created Content". Pas de fichier LICENSE explicite. Usage acceptable pour un site communautaire non commercial. Pas de CDN officiel — self-hosting requis.

---

## Références

- Repo : https://github.com/pubg/api-assets
- Raw base URL : `https://raw.githubusercontent.com/pubg/api-assets/master/`
- Dictionnaires télémétrie : `dictionaries/telemetry/`
- Enums télémétrie : `enums/telemetry/`
- Assets visuels : `Assets/`
