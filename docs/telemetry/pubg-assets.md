# Résolution des assets PUBG — icônes, noms, catégories

Comment un ID télémétrie brut (`WeapAK47_C`, `ProjMolotov_C`, `Item_Heal_Bandage_C`...) devient une icône, un nom affiché et (pour les armes) une catégorie de filtre dans l'UI. Trois mécanismes **indépendants**, chacun avec ses propres règles et ses propres trous de couverture.

Repo source des assets et dictionnaires : `https://github.com/pubg/api-assets`.

---

## Les trois mécanismes

| | Icône | Nom affiché | Catégorie (armes uniquement) |
|---|---|---|---|
| **Fonction** | `weaponIconUrl()` / `vehicleIconUrl()` / `itemIconUrl()` | `resolveWeaponName()` / `resolveVehicleName()` / `resolveItemName()` | `weaponCategoryCode()` |
| **Fichier** | `src/lib/pubg-assets/asset-url.ts` | `src/lib/pubg-assets/index.ts` | `src/lib/weapon-category-service.ts` |
| **Source** | Convention de nommage (regex) + fichiers PNG dans `public/icons/pubg/` | Dictionnaires JSON copiés depuis `pubg-assets` | Liste codée en dur (`DEFAULT_WEAPON_CATEGORIES`), surchargeable en DB |
| **Automatique pour une nouvelle arme ?** | Oui, si le PNG existe côté repo officiel et a été synchronisé | Oui, si le dictionnaire est à jour | **Non** — nécessite un ajout manuel (code ou `/settings/weapon-categories`) |
| **Si absent** | `<img onError>` masque le composant (`return null`) | Fallback : l'ID brut est affiché tel quel | Fallback : `'Autre'` |

Aucun de ces trois mécanismes ne fait planter la page si une donnée manque — c'est un dégradé gracieux partout, pas une erreur bloquante.

---

## 1. Icônes — convention de nommage + synchronisation locale

### Armes (`WeaponIcon`, `public/icons/pubg/weapons/`)

```typescript
// src/lib/pubg-assets/asset-url.ts
function weaponTelemetryToAssetName(telemetryId: string): string {
  return telemetryId.replace(/^(Weap|Proj)/, 'Item_Weapon_')
}
```

Deux préfixes télémétrie possibles pour le même dossier d'assets :
- **`Weap*`** — armes à feu classiques : `WeapAK47_C` → `Item_Weapon_AK47_C.png`
- **`Proj*`** — objets lancés (grenades, Molotov, C4, sticky bomb) : `ProjMolotov_C` → `Item_Weapon_Molotov_C.png`

Le support du préfixe `Proj` a été ajouté le 2026-08-16 — avant ça, les jetables (`ProjGrenade_C`, `ProjMolotov_C`...) n'affichaient jamais d'icône sur `/clans/[clanId]/stats/weapons`, silencieusement (dégradé gracieux = bug invisible pendant longtemps).

**Exceptions ponctuelles (`WEAPON_ASSET_NAME_OVERRIDES`)** — certains IDs ne suivent ni la règle `Weap*`/`Proj*`, ni un simple renommage cohérent côté asset repo, trouvés en creusant pourquoi `/clans/[clanId]/stats/weapons/categories` affichait des cercles vides sur Mosin Nagant, Win94, Mortar et Bluezone Grenade :

| Telemetry ID | Fichier asset réel | Pourquoi le préfixe seul ne suffit pas |
|---|---|---|
| `WeapMosinNagant_C` | `Item_Weapon_Mosin_C.png` | Le repo officiel a raccourci le nom, pas de "Nagant" dans le fichier |
| `WeapWin94_C` | `Item_Weapon_Win1894_C.png` | Le repo officiel utilise le nom complet "1894", pas l'abréviation "94" |
| `Mortar_Projectile_C` | `Item_Weapon_Mortar_C.png` | Le causer vient d'un acteur de mode de jeu, pas d'un spawn d'arme — aucun préfixe `Weap`/`Proj` |
| `Bluezonebomb_EffectActor_C` | `Item_Weapon_BluezoneGrenade_C.png` | Idem — acteur d'effet de zone, pas une arme/projectile classique |

Ces quatre cas sont traités par une table d'alias `WEAPON_ASSET_NAME_OVERRIDES` dans `asset-url.ts` (même pattern que `ITEM_ASSET_NAME_OVERRIDES` pour les items, voir plus bas), consultée avant d'appliquer la regex `Weap|Proj`.

**Piège séparé : `/clans/[clanId]/stats/weapons/categories` a sa propre map locale.** Cette page ne dérive pas ses icônes des lignes de kills télémétrie (comme `/clans/[clanId]/stats/weapons`) mais d'un catalogue statique complet de toutes les armes/catégories (`weapon-categories.ts`), via une map dédiée `KEY_TO_TELEMETRY_ID` dans la page elle-même. Cette map peut être incomplète indépendamment de `weaponTelemetryToAssetName()` — c'est ce qui causait l'absence d'icône pour FAMAS G2 (clé simplement absente de la map) et pour les 5 explosifs + Mortar + Bluezone Grenade (absents aussi). Deux causes distinctes à vérifier si un cercle vide apparaît sur cette page précise :
1. La clé existe-t-elle dans `KEY_TO_TELEMETRY_ID` (`categories/page.tsx`) ?
2. Si oui, l'ID qu'elle contient résout-il vers un fichier existant (voir tableau ci-dessus) ?

Note : `smoke grenade` et `stun grenade` (flashbang) n'ont **aucun** ID de damage-causer réel (elles ne tuent jamais, absentes de `damageCauserName.json`) — la map utilise pour elles des IDs synthétiques (`ProjSmokeBomb_C`, `ProjFlashBang_C`) construits uniquement pour passer par la regex `Weap|Proj`, jamais censés matcher une vraie ligne de kills.

### Audit complet — icônes manquantes vs mismatch de nommage

Un audit systématique de tous les IDs `Weap*`/`Proj*` de `damageCauserName.json` contre les fichiers réellement présents (2026-08-16) a trouvé **12 cas au total**, deux causes distinctes :

**Mismatch de nommage (corrigible, résolu) :** `WeapCrossbow_1_C`, `WeapPanzerFaust100M1_C`, plus les 4 déjà listés ci-dessus (Mosin, Win94, Mortar, Bluezone), plus les variantes de mêlée jetées (`WeapCowbarProjectile_C`, `WeapMacheteProjectile_C`, `WeapPanProjectile_C`, `WeapSickleProjectile_C` → réutilisent l'icône de l'arme de mêlée) et les variantes nommées/lore (`WeapDuncansHK416_C`, `WeapJuliesKar98k_C`, `WeapLunchmeatsAK47_C`, `WeapMadsQBU88_C` → réutilisent l'icône de l'arme de base). Tous ajoutés à `WEAPON_ASSET_NAME_OVERRIDES`.

**Asset absent de tout le repo officiel (pas corrigible par un simple alias) :**
- `ProjIncendiary_C`, `ProjMolotov_DamageField_Direct_C` — champs de dégâts au sol (variantes du Molotov), pas des objets distincts.
- `WeapTurret_KillTruck_Main_C` — tourelle de véhicule (Kill Truck), pas une arme portable.
- `WeapJS9_C` — **corrigé manuellement** (voir section suivante).

### Icônes manuelles — armes absentes du repo officiel (`scripts/manual-weapon-assets/`)

Le SMG JS9 n'existe dans aucun dossier de `pubg/api-assets` (vérifié via l'API GitHub sur `Assets/Item/Weapon/Main` et `Handgun`) — trop récent pour que la communauté l'ait ajouté. Plutôt que d'accepter le trou, une icône a été récupérée à la main depuis le site officiel PUBG (`wstatic-prod.pubg.com`, format WebP, fond transparent avec ombre portée), convertie en PNG 240×240 (`sharp`, `trim` + `resize contain`) pour matcher la convention des autres icônes armes, puis placée dans **`scripts/manual-weapon-assets/`** — un dossier **versionné** (contrairement à `public/icons/pubg/`, qui reste ignoré par git).

`npm run sync:pubg-assets -- --weapons` (et le run complet par défaut) recopie systématiquement le contenu de ce dossier vers `public/icons/pubg/weapons/` après le sync GitHub, donc l'icône survit à un `git clone` frais ou à un déploiement sans étape manuelle supplémentaire.

**Si PUBG/la communauté ajoute un jour JS9 au repo officiel :** supprimer `scripts/manual-weapon-assets/Item_Weapon_JS9_C.png`, le sync GitHub prendra le relais automatiquement (l'écrasement manuel n'a plus lieu si le fichier source n'existe plus).

**Pour ajouter une autre arme dans ce cas de figure** (nouvelle arme PUBG pas encore dans `pubg/api-assets`) : déposer un PNG `Item_Weapon_<Nom>_C.png` (idéalement 240×240, fond transparent, cadrage cohérent avec les icônes existantes) dans `scripts/manual-weapon-assets/`, puis relancer le sync.

Le dossier sert aussi à **remplacer** une icône GitHub existante par la version officielle `pubg.com` quand le rendu diverge (le repo communautaire n'est pas toujours à jour) — `copyManualOverrides()` écrase sans condition, contrairement au sync GitHub qui skip les fichiers déjà présents. État au 2026-08-16 : 7 fichiers dans `scripts/manual-weapon-assets/` — JS9, RPD, M79, Stun Gun, Pickaxe (armes absentes du repo officiel) + Mortar, Bluezone Grenade (remplacement d'icône).

**Pickaxe — ID télémétrie non confirmé.** Contrairement aux autres entrées de cette liste, aucune trace de la pioche n'existe dans `damageCauserName.json` ni `itemId.json` — elle n'a jamais été vue comme causer de kill ou d'item utilisé dans les données capturées. L'ID `WeapPickAxe_C` utilisé dans `weapon-categories.ts`/`categories/page.tsx` suit la convention de nommage habituelle mais **n'est pas vérifié** contre une vraie ligne de télémétrie. À corriger si un jour un kill réel à la pioche apparaît avec un ID différent.

**Dragunov reclassé DMR (était SR).** Le site officiel PUBG (`pubg.com/fr/game-info/weapons/dmr`) le classe DMR aux côtés de Mini14/SLR/SKS/Mk12/VSS/QBU88/Mk14 — la classification a été alignée en conséquence dans `weapon-category-service.ts` et `weapon-categories.ts`.

**Sources GitHub synchronisées** (`scripts/sync-pubg-assets.ts`) :

| Dossier source | Contenu |
|---|---|
| `Assets/Item/Weapon/Main` | Armes longues (AR, DMR, SR, LMG, SMG, SG) |
| `Assets/Item/Weapon/Handgun` | Pistolets |
| `Assets/Item/Weapon/Melee` | Armes de mêlée |
| `Assets/Item/Equipment/Throwable` | Objets lancés — utilisent aussi le préfixe filename `Item_Weapon_*` malgré le dossier `Equipment/` côté repo |

### Véhicules (`VehicleIcon`, `public/icons/pubg/vehicles/`)

```typescript
function vehicleTelemetryToAssetName(telemetryId: string): string {
  return telemetryId.replace(/_\d{2}_/, '_00_')
}
```

Les variantes de couleur/skin (`_01_`, `_03_`...) sont toutes ramenées à la variante canonique `_00_` — un seul PNG par modèle de véhicule, peu importe la couleur réellement utilisée en jeu. Source : `Assets/Vehicle/`.

### Items "Use" (`ItemIcon`, `public/icons/pubg/items/`)

```typescript
export function itemIconUrl(telemetryId: string): string {
  const assetName = ITEM_ASSET_NAME_OVERRIDES[telemetryId] ?? telemetryId
  return `/icons/pubg/items/${assetName}.png`
}
```

Contrairement aux armes, l'`itemId` télémétrie correspond **directement** au nom de fichier — pas de préfixe à transformer. Source : `Assets/Item/Use/{Heal,Boost,Fuel,Gadget}`.

**Exception connue (`ITEM_ASSET_NAME_OVERRIDES`)** : la télémétrie envoie `Item_Mountainbike_C` (« b » minuscule), mais l'asset officiel s'appelle `Item_MountainBike_C.png` (« B » majuscule). Invisible sur Windows/macOS (systèmes de fichiers insensibles à la casse), aurait cassé silencieusement en prod Linux (sensible à la casse). Corrigé par une table d'alias à un seul niveau — si un autre cas de casse divergente apparaît un jour, l'ajouter au même endroit plutôt que de complexifier `itemIconUrl()`.

### Synchronisation locale

`public/icons/pubg/` est dans `.gitignore` — ces fichiers **ne sont jamais commités**, ils sont régénérés localement (et sur chaque environnement de déploiement) via :

```bash
npm run sync:pubg-assets                  # armes (+ jetables) + véhicules + items Use
npm run sync:pubg-assets -- --weapons     # armes + jetables uniquement
npm run sync:pubg-assets -- --vehicles    # véhicules uniquement
npm run sync:pubg-assets -- --items       # items Use (soin, boost, fuel, gadget) uniquement
npm run sync:pubg-assets -- --maps        # maps No_Text (heatmaps), hors scope par défaut
npm run sync:pubg-assets -- --force       # réécrit les fichiers déjà présents
```

Incrémental par défaut (skip les fichiers déjà téléchargés) — sûr à relancer souvent, y compris en CI/déploiement. État au 2026-08-16 : **178 fichiers armes** (dont variantes `_h`/`_w` par arme), **38 véhicules**, **8 items Use**.

**Piège à connaître :** un ID télémétrie peut être structurellement correct (le mapping de nommage fonctionne) mais ne rien afficher si l'asset n'a simplement pas encore été synchronisé localement. Avant de creuser un bug d'icône manquante, vérifier dans cet ordre :
1. Le fichier existe-t-il dans `public/icons/pubg/{weapons,vehicles,items}/` ?
2. Si non : relancer `npm run sync:pubg-assets`.
3. Si toujours absent après sync : l'asset n'existe probablement pas dans le repo officiel `pubg/api-assets` (cas rare — ex. `ProjIncendiary_C`, qui n'est pas un objet distinct mais un champ de dégâts au sol).

---

## 2. Noms affichés — dictionnaires JSON copiés depuis `pubg-assets`

| Dictionnaire local | Source officielle | Resolver | Couvre |
|---|---|---|---|
| `dictionaries/damageCauserName.json` | `dictionaries/telemetry/damageCauserName.json` | `resolveWeaponName()`, `resolveVehicleName()`, `resolveDamageCauser()` | Armes (`Weap*`), jetables (`Proj*`), véhicules, entités |
| `dictionaries/itemId.json` | `dictionaries/telemetry/item/itemId.json` | `resolveItemName()` | Tous les items (armes, munitions, équipement, items Use) — dictionnaire plus large que `damageCauserName.json`, ajouté le 2026-08-16 |

Ces dictionnaires sont des copies statiques versionnées dans `src/lib/pubg-assets/dictionaries/` (contrairement aux PNG, ils sont commités — petits fichiers texte, pas de raison de les régénérer à chaque déploiement). Une nouvelle arme/item sans entrée dans le dictionnaire s'affiche simplement sous son ID brut (`resolveXxxName()` retourne l'ID en fallback : `dict[id] ?? id`).

**Pour rafraîchir un dictionnaire** après une mise à jour du repo officiel : retélécharger le fichier JSON correspondant depuis `raw.githubusercontent.com/pubg/api-assets/master/...` et remplacer le fichier local — pas de script dédié à ce jour (les dictionnaires changent rarement, contrairement aux assets visuels qui suivent chaque nouvelle arme/skin).

---

## 3. Catégories d'armes — liste manuelle, PAS liée à `pubg-assets`

`weapon-category-service.ts` classe chaque arme (`WeapXXX_C`) dans une catégorie de filtre UI (`AR`, `DMR`, `SR`, `SMG`, `LMG`, `SG`, `Autre`) via `DEFAULT_WEAPON_CATEGORIES`, une map codée en dur **entretenue à la main**, sans lien avec les dictionnaires/enums `pubg-assets`.

```typescript
export function weaponCategoryCode(weaponName: string, categories: Record<string, CategoryCode>): CategoryCode {
  return categories[weaponName] ?? 'Autre'
}
```

Une arme absente de la liste retombe sur `'Autre'` — pas de crash, juste mal classée dans les filtres. Surchargeable sans déploiement de code via l'admin `/settings/weapon-categories` (persisté en DB, `getWeaponCategories()` fusionne DB + défauts codés en dur).

**Les objets lancés (`Proj*`) et les items Use (`Item_Heal_*`, `Item_Boost_*`...) ne sont pas couverts par ce mécanisme** — ils n'apparaissent dans aucun filtre de catégorie d'armes, seulement dans leurs propres listes (grenades sur la page armes, items Use pas encore affichés — voir `docs/TODO/todo.md`, section "Événements télémétrie non parsés").

---

## Runbook — ajouter le support d'une nouvelle arme/item PUBG

Quand PUBG sort une nouvelle arme ou un nouvel objet en saison :

1. **Icône** — vérifier si `pubg/api-assets` a déjà ajouté le PNG (généralement avec un peu de retard sur la sortie officielle). Si oui : `npm run sync:pubg-assets` suffit, aucun code à toucher tant que la convention de nommage est respectée (`Item_Weapon_<Nom>_C.png`, `Item_<Nom>_C.png`...).
2. **Si la convention de nommage est différente** (comme découvert pour `Proj*`, la casse de `Mountainbike`, ou les renommages Mosin/Win94/Mortar/Bluezone) : étendre `weaponTelemetryToAssetName()` (regex) ou ajouter une entrée à `WEAPON_ASSET_NAME_OVERRIDES`/`ITEM_ASSET_NAME_OVERRIDES` (`asset-url.ts`) — préférer un alias ponctuel à une règle générale tant qu'un seul cas est connu.
3. **Nom affiché** — vérifier que l'ID apparaît dans `damageCauserName.json` ou `itemId.json` ; sinon retélécharger la version à jour du dictionnaire officiel correspondant.
4. **Catégorie** (armes à feu uniquement) — ajouter l'entrée dans `DEFAULT_WEAPON_CATEGORIES` (`weapon-category-service.ts`) ou via `/settings/weapon-categories`, sinon l'arme tombe dans "Autre".
5. **Si l'asset n'existe pas encore côté `pubg/api-assets`** — rien à faire côté projet : le dégradé gracieux (`onError` → `null`) couvre le trou jusqu'à ce que le repo officiel le comble. Ne pas héberger de PNG en dehors du sync (le dossier est volontairement non versionné).

---

## Composants React

`WeaponIcon`, `VehicleIcon`, `ItemIcon` (`src/components/ui/`) partagent le même pattern :

```tsx
const [failed, setFailed] = useState(false)
if (failed) return null
return <img src={xxxIconUrl(id)} className="pubg-icon-filter ..." onError={() => setFailed(true)} />
```

`pubg-icon-filter` inverse les PNG blancs en thème clair (`filter: brightness(0)`, voir `globals.css`) — les assets officiels sont fournis en blanc, adaptés nativement au thème sombre.

---

## Voir aussi

- [API PUBG — endpoints et dictionnaires](pubg-api.md) — vue d'ensemble complète des dictionnaires/enums `pubg-assets` (au-delà des trois mécanismes détaillés ici)
- `docs/TODO/todo.md`, section P3 "Événements télémétrie non parsés" — chantier en attente pour exposer le détail des items Use (`LogItemUse`) dans une page dédiée
