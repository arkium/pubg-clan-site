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

### Phase 1 — Fondations (JSONs + script sync)

- [ ] Créer `src/lib/pubg-assets/` et y copier les JSONs prioritaires P1 :
  - `dictionaries/damageCauserName.json`
  - `dictionaries/damageTypeCategory.json`
  - `dictionaries/mapName.json`
  - `enums/damageReason.json`
- [ ] Créer `scripts/sync-pubg-assets.ts` — télécharge armes + véhicules + maps No_Text depuis raw GitHub
- [ ] Ajouter `npm run sync:pubg-assets` dans `package.json`
- [ ] Ajouter `public/icons/pubg/` au `.gitignore`
- [ ] Créer `src/lib/pubg-assets/asset-url.ts` avec `weaponTelemetryToAssetName()`, `vehicleTelemetryToAssetName()`, `weaponIconUrl()`, `vehicleIconUrl()`

### Phase 2 — Simplification des services labels (P1 quick wins)

- [ ] **`weapon-label-service.ts`** : remplacer `DEFAULT_WEAPON_LABELS` par import de `damageCauserName.json` filtré sur clés `Weap*_C`
- [ ] **`map-label-service.ts`** : remplacer `DEFAULT_MAP_LABELS` par import de `mapName.json`
- [ ] **`weapon-categories.ts`** : supprimer les aliases `item_weapon_*_c` — ne conserver que les clés `Weap*_C` et les aliases courts pour résolution de catégorie
- [ ] Exporter `DamageReason` type depuis `enums/damageReason.json` — remplacer les string literals dans le parser

### Phase 3 — Nouveaux services (P1-P2)

- [ ] Créer `src/lib/vehicle-label-service.ts` :
  - Extrait les entrées véhicules de `damageCauserName.json` (clés `BP_*_C`, `Dacia_*`, `Uaz_*`, `Buggy_*`, `AquaRail_*`, `Boat_*`, etc.)
  - Pattern identique aux autres label services (DB-backed avec DEFAULT_VEHICLE_LABELS)
  - Exposer `vehicleDisplayName(id, labels)`
- [ ] Créer `src/lib/damage-type-label-service.ts` à partir de `damageTypeCategory.json`
- [ ] Créer `src/lib/game-mode-label-service.ts` à partir de `gameMode.json`
- [ ] Intégrer `src/lib/pubg-assets/index.ts` comme point d'entrée unifié

### Phase 4 — Affichage visuel (P1)

- [ ] Composant `WeaponIcon` : `<img src={weaponIconUrl(id)} alt={resolveWeaponName(id)} />` avec fallback texte si PNG absent
- [ ] Composant `VehicleIcon` : même pattern
- [ ] Intégrer `WeaponIcon` dans la page `/clans/[clanId]/stats/weapons/`
- [ ] Intégrer `WeaponIcon` dans les tableaux kills/leaderboard si pertinent

### Phase 5 — Enrichissements (P2-P3)

- [ ] Copier `enums/regionId.json` → intégrer les noms de zones dans la page drop zones
- [ ] Copier `dictionaries/gameMode.json` → afficher les modes de jeu avec labels lisibles
- [ ] Copier `enums/weatherId.json` — label météo sur les fiches de match
- [ ] Copier `enums/item/category.json` + `subCategory.json` → types TypeScript
- [ ] Copier `enums/vehicle/vehicleType.json` → groupement véhicules (terrestre/aérien/nautique)
- [ ] Comparer `Assets/Maps/` avec images locales — migrer si meilleure qualité ou utiliser variants `No_Text` pour les heatmaps
- [ ] Copier `seasons.json` → remplacer les IDs de saison hardcodés

### Phase 6 — Bonus (P3-P4)

- [ ] `dictionaries/itemId.json` + `Assets/Icons/CarePackage/` → future page care packages
- [ ] `dictionaries/weaponMastery/medalName.json` → système de médailles en jeu
- [ ] `survivalTitles.json` → affichage tier de survie
- [ ] `Assets/MapSelection/` thumbnails → UI de sélection de map améliorée

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
