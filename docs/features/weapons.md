# Stats armes

La section armes expose deux sources de données distinctes que la page `/members/[id]/weapons` présente en deux onglets
([Armes d'un joueur](armes-joueur.md)) :

| Source | Table DB | Scope temporel | Déclencheur |
|---|---|---|---|
| Télémétrie match-par-match | `MemberWeaponStats` | week / month / all | Pipeline télémétrie (LogPlayerKillV2, LogWeaponFireCount, LogPlayerTakeDamage) |
| Weapon Mastery PUBG | `MemberWeaponMastery` | Carrière complète | API PUBG `weapon_mastery` — cron daily + bouton manuel |

---

## 1. Stats armes télémétrie

### Source d'événements

Le parser télémétrie extrait les données depuis trois types d'événements :

- `LogPlayerKillV2` — kills, headshots, distance du kill, arme utilisée, attacker/victim accountId
- `LogWeaponFireCount` — `shotsFired` par arme (événement émis par incréments de 10 par PUBG)
- `LogPlayerTakeDamage` — hitsLanded, partie du corps, arme source

### Modèle de données (`MemberWeaponStats`)

| Champ | Type | Description |
|---|---|---|
| `weaponName` | string | Identifiant arme PUBG (ex. `AK47`) |
| `kills` | number | Kills avec cette arme sur la période |
| `headshots` | number | Kills en headshot avec cette arme |
| `shotsFired` | number | Tirs effectués |
| `hitsLanded` | number | Tirs ayant touché |
| `accuracy` | number | `hitsLanded / shotsFired * 100` (%) |
| `avgDistance` | number | Distance moyenne des kills (mètres) |
| `maxDistance` | number \| null | Kill le plus lointain (mètres) |
| `matchCount` | number | Nombre de matchs où l'arme a été utilisée |

### Routes API télémétrie armes

**`GET /api/members/[id]/telemetry/weapons?period=week|month|all`**

Retourne les stats armes du membre pour la période.

**`GET /api/clans/[clanId]/telemetry/weapons?period=week|month|all`**

Vue agrégée des stats armes de tous les membres actifs du clan (une ligne par joueur et par arme). Chaque ligne porte
`weaponLabel`, `weaponKey` (clé du catalogue, `null` hors catalogue) et `weaponCategoryCode` / `weaponCategoryLabel`
tirés de `weapon-categories.ts` (§5) ; `matchCount` = matchs pris en compte. Garde : `clan.stats-weapons`.

---

## 2. Weapon Mastery carrière

### Source

API PUBG `GET /shards/{shard}/players/{playerId}/weapon_mastery` — données de carrière complète du joueur, non filtrables par période.

**Schéma officiel** : `https://documentation.pubg.com/en/mastery-endpoint.html` (OpenAPI spec exact : `https://documentation.pubg.com/en/_static/swagger/en/schemas/weaponSummary.yml`). Chaque arme expose jusqu'à trois blocs de stats au même schéma de champs — `StatsTotal` (legacy, gelé depuis le patch 18.2), `OfficialStatsTotal` (tracker actif, contient aussi `LongestKill`), `CompetitiveStatsTotal` (ranked uniquement, contient aussi `LongestKill`).

### Modèle de données (`MemberWeaponMastery`)

| Champ DB | Type | Description | Champ API source, avec description officielle |
|---|---|---|---|
| `weaponId` | string | Identifiant interne PUBG (ex. `Item_Weapon_AK47_C`) | — |
| `weaponName` | string | Nom humain dérivé (préfixe `Item_Weapon_` et suffixe `_C` supprimés) | — |
| `kills` | number | Kills totaux avec cette arme sur toute la carrière | `Kills` — *"The total number of kills for the player"* |
| `headshots` | number | Compte de **coups** en headshot, **pas** des kills en headshot — peut dépasser `kills` (constaté : M24 `HeadShots=205` pour `Kills=173`). Explication plausible : un coup en tête qui met l'adversaire à terre (knockdown) compte dans `HeadShots`, mais si l'équipe adverse le réanime avant l'achèvement, ça n'incrémente jamais `Kills`. Sémantique différente de `MemberWeaponStats.headshots` (télémétrie), qui lui est un compte de kills | `HeadShots` — *"The total headshots that the player has done in their career"* (libellé officiel ambigu ; nos données confirment que ce n'est pas limité aux kills) |
| `knockouts` | number | Knockdowns (ennemis mis à terre) | `Groggies` — *"The total number of times that the player has caused another player to become groggy during their career"*. **Pas** `Defeats`, qui est un compteur PUBG distinct (*"The total number of defeats in their career"*), quasi toujours à `0` et sans lien documenté avec les knockdowns |
| `shots` | number | Toujours `0` — voir note ci-dessous | Aucun champ équivalent dans le schéma officiel |
| `hits` | number | Toujours `0` — même limitation que `shots` | Aucun champ équivalent dans le schéma officiel |
| `damage` | number | Dégâts **totaux** infligés sur la carrière (pas une moyenne) | `DamagePlayer` — *"The total damage that the player has done in their career"* |
| `level` | number | Niveau de maîtrise PUBG, **1 à 99** relevés en base (2026-09-27) | `LevelCurrent` |
| `xpTotal` | number | XP total accumulé | `XPTotal` |
| `tier` | number | **Niveau d'expert** : +1 chaque fois que l'arme passe le niveau 100 et repart de zéro ([pubg.com/fr/news/2847](https://pubg.com/fr/news/2847)). 0 à 6 en base, lié aux kills, pas au niveau | `TierCurrent` |
| `lastRefreshedAt` | string | ISO 8601 — date du dernier refresh depuis l'API PUBG | — |

**Champ API disponible mais non capturé** : `LongestKill` (*"The longest distance that the player got a kill for"*, présent dans `OfficialStatsTotal`/`CompetitiveStatsTotal` mais absent de `StatsTotal`) — match exact vérifié contre l'écran "Maîtrise des armes" du client PUBG (M24 : `LongestKill=458` = "Élim. la plus lointaine (m)" affiché en jeu).

**"Dgt moyens" affiché par le client PUBG** (moyenne de dégâts) ne correspond à aucun champ du schéma officiel — le jeu la calcule avec une donnée interne non exposée par cette API publique. Ne pas essayer de la reproduire depuis `weapon_mastery`.

Métriques dérivées (calculées côté client) :
- "Headshot %" affiché en UI : `headshots / kills * 100` — **confirmé faux contre l'écran officiel PUBG**, pas juste une approximation dégradée. MP5K : jeu `7,44 %` vs notre calcul `40,8 %`. M24 : jeu `34,5 %` vs notre calcul `118,5 %` (dépasse 100 %, cas impossible). Le vrai taux de headshot PUBG se calcule sur un dénominateur (tirs ou touches totales) que l'API publique `weapon_mastery` n'expose pas et que le schéma officiel ne documente nulle part — `HeadShots/Kills` n'a aucun rapport avec cette métrique.
- Précision : `hits / shots * 100` — **toujours `0 %` en pratique**, `weapon_mastery` n'expose aucun champ de tirs/touches dans son schéma officiel (voir `docs/telemetry/pubg-api.md` — section Weapon mastery)

**Note** : `shots`/`hits` sont conservés dans le modèle Prisma pour compatibilité mais ne peuvent pas être alimentés depuis cette source. Seule la télémétrie match-par-match (`MemberWeaponStats`, section 1 ci-dessus) fournit une vraie précision, mais limitée à la période trackée, pas à la carrière.

### Refresh

- **Cron daily** : `daily_season_stats_sync` à `0 5 * * *` — met à jour `MemberWeaponMastery` en parallèle avec `MemberSeasonStats` pour tous les clans.
- **Bouton manuel** : POST sur la route ci-dessous.

### Routes API Weapon Mastery

**`GET /api/members/[id]/weapon-mastery`**

```typescript
type WeaponMasteryEntry = {
  id: number
  memberId: number
  weaponId: string        // ex. "Item_Weapon_AK47_C"
  weaponName: string      // ex. "AK47"
  kills: number
  headshots: number
  knockouts: number
  shots: number
  hits: number
  damage: number
  level: number
  xpTotal: number
  tier: number
  lastRefreshedAt: string  // ISO 8601
  createdAt: string
  updatedAt: string
}

type WeaponMasteryResponse = {
  memberId: number
  weapons: WeaponMasteryEntry[]  // triées par kills desc
}
```

**`POST /api/members/[id]/weapon-mastery`**

Force le refresh depuis l'API PUBG (1 appel API quota). Coût négligeable.

```typescript
// Réponse 200
{ memberId: number; count: number }  // count = nombre d'armes upsertées
```

Notes :
- Retourne un tableau vide (pas d'erreur) si le joueur n'a pas de données weapon mastery (404/422 PUBG).
- Les armes avec `kills === 0` figurent quand même si PUBG expose des données de maîtrise pour elles.

---

## 3. Complémentarité des deux vues

| Dimension | Télémétrie | Weapon Mastery |
|---|---|---|
| Scope temporel | Configurable (week/month/all) depuis les matchs parsés | Carrière complète PUBG (hors scope clan) |
| Précision tir | `shotsFired` / `hitsLanded` par match | `shots` / `hits` carrière |
| Distance de kill | `avgDistance`, `maxDistance` | Non disponible |
| Niveau et XP | Non disponible | `level`, `xpTotal`, `tier` |
| Knockdowns | Non exposé | `knockouts` |
| Usage en UI | Suivi période + analyse style jeu | Niveau global de maîtrise par arme |

La télémétrie est l'outil de suivi périodique du clan. La mastery est la référence de carrière officielle PUBG.

---

## 4. Icônes armes (`WeaponIcon`)

Composant : `src/components/ui/WeaponIcon.tsx`

Accepte un `id` correspondant à l'identifiant arme (soit le `weaponName` télémétrie, soit le `weaponId` mastery). La résolution de l'URL d'icône passe par `src/lib/pubg-assets/asset-url.ts`.

Usage dans la page weapons :
```tsx
<WeaponIcon id={row.weaponId} label={row.weaponName} size="sm" />
```

---

## 5. Labels et catégories personnalisables

### `weapon-label-service.ts`

Permet de personnaliser le nom affiché d'une arme (ex. remplacer `WeapAK47_C` par `AK-47 Custom`). Les labels sont stockés en base dans un `ClubSetting` avec la clé `pubg_weapon_labels`. Les labels par défaut proviennent de `src/lib/pubg-assets/dictionaries/damageCauserName.json`.

### Catégories d'armes — une seule liste : `src/lib/weapons/weapon-categories.ts`

Module pur (importable côté client), source unique du classement depuis le 2026-09-27 : l'armurerie du clan (§7), sa
route `GET /api/clans/[clanId]/telemetry/weapons` et la page armes d'un joueur (§6) classent toutes par lui.

| Code | Libellé (`WEAPON_CATEGORY_LABELS`) | Code | Libellé |
|---|---|---|---|
| `AR` | Fusils d'assaut | `PISTOL` | Pistolets |
| `DMR` | Fusils de précision | `MELEE` | Mêlée |
| `SR` | Snipers | `THROWABLE` | Explosifs |
| `SMG` | Pistolets-mitrailleurs | `SPECIAL` | Spécial |
| `LMG` | Mitrailleuses | `OTHER` | Autre (véhicules, poings, feu d'un jerrican, zone…) |
| `SG` | Fusils à pompe | | |

Chaque arme du catalogue porte sa `key` (`'beryl m762'`), ses `aliases` et ses **`telemetryIds`** : identifiants de
damage-causer relevés en base le 2026-09-27, le premier servant d'icône et de nom. Ils couvrent les variantes réelles —
skins (`WeapJuliesKar98k_C`), noms alternatifs (`WeapMosin_C`, `WeapWin1894_C`, `WeapFamasG2_C`), projectile d'une arme
de mêlée (`WeapPanProjectile_C`), feu au sol du Molotov (`BP_MolotovFireDebuff_C`, 321 kills contre 8 pour le
projectile). `label` complète le dictionnaire PUBG quand il n'a pas de nom (`WeapRPD_C`, 4 912 kills en production).

- `findWeaponEntry(id, label?)` : identifiant télémétrie d'abord (un libellé renommé par l'administration ne change pas
  la catégorie), puis clé ou alias, puis le libellé.
- `getWeaponCategory(id, label?)` : la catégorie, `OTHER` si rien ne correspond.
- Une arme nouvelle (identifiant inconnu) retombe sur son libellé (« M416 ») ; sinon elle apparaît dans « Autre » :
  **ajouter son identifiant dans `telemetryIds`**. Tests : `src/lib/weapons/weapon-categories.test.ts`.

Textes des catégories (accroche, description, conseil pro) : `src/lib/weapons/weapon-category-info.ts`, un par
catégorie, « Autre » compris (contrôlé par `weapon-categories.test.ts`).

### Ancienne liste — supprimée le 2026-09-27

`weapon-category-service.ts` (7 codes `AR`…`SG`, `Autre`) et son écran `/settings/weapon-categories` (« Alias
catégories armes ») rangeaient le P18C dans « Autre » quand la page Catégories le mettait dans « Pistolets ». Plus lus
par aucune page après la bascule, ils ont été supprimés (fichiers dans `archive/refonte-ui/armes/`) ; aucune surcharge
n'était stockée en base (`pubg_weapon_categories`, `pubg_category_labels` : vérifié le 2026-09-27). L'ancienne adresse
redirige vers `/settings/weapon-labels`. `ui-conformance.test.ts` empêche leur retour.

---

## 6. Page `/members/[id]/weapons`

Refonte du 2026-09-27 : deux onglets, « Suivi par le site » (télémétrie de la période et lancers) et « Carrière PUBG »
(maîtrise), cartes paginées au lieu des deux tableaux. Tout est décrit dans [Armes d'un joueur](armes-joueur.md).

---

## 7. L'armurerie du clan — `/clans/[clanId]/stats/weapons`

Une seule page pour les armes du clan (refonte du 2026-09-27, maquette `Armes.dc.html`). Elle remplace « Les armes du
clan » et « Catégories armes », qui parlaient des mêmes armes avec deux listes de catégories et deux sources de données
(anciens fichiers dans `archive/refonte-ui/armes/`, ignoré par git).

| Élément | Comportement |
|---|---|
| URL | `?cat=SR` : catégorie affichée (absente = « Tout l'arsenal »), écrite par `replaceState` comme `?period=` ; un code en minuscules est réécrit en majuscules, un code inconnu retiré |
| Ancienne URL | `/clans/[clanId]/stats/weapons/categories` → **redirection HTTP 307** (`next.config.ts`) vers `…/stats/weapons?cat=AR`, ou avec le `cat` et la `period` reçus |
| Bandeau d'image | « L'armurerie du clan », kills de la période, arme signature (la plus meurtrière) |
| Bandeau de filtres (`DockingToolbar`) | Période (`PeriodFilter`), joueur (`#weapon-player-dropdown`), matchs pris en compte ; docké : catégorie + rappel du tri |
| Sélecteur de catégorie | Chevrons ‹ ›, compteur « 3 / 11 », barre de progression cliquable, puces avec les kills par catégorie (ordinateur). « Autre » n'apparaît que si elle a des lignes |
| « Tout l'arsenal » | **Loadout du clan** : 5 emplacements du sac (principale, secondaire d'une autre famille, pistolet, mêlée, lancer), l'arme la plus meurtrière de chacun ; un clic ouvre sa catégorie |
| Une catégorie | Accroche, description, conseil pro, part des kills du clan ; **râtelier** : toutes les armes du catalogue, médailles aux 3 premières, maître de l'arme, chargeur de 10 balles pour la précision, armes sans kill en gris |
| Hauts faits | Tir le plus lointain, roi du headshot (≥ 5 kills), chirurgien (≥ 100 tirs), gâchette facile — recalculés sur la sélection |
| Classement | 10 colonnes (`SortableTh`), tirs et touches dans l'infobulle de Précision, rang = ordre décroissant du critère **sur la sélection** (l'ancien podium ignorait le filtre), pagination numérotée de 8 lignes ; `MobileRankList` sous 768 px |

**Icônes** (`ArmoryWeaponImage`) : silhouette blanche `Item_Weapon_<Nom>_C_w.png` (`weaponWhiteIconUrl`), noire en
thème clair hors vitrines. Ces fichiers font 100 px de haut et la largeur de l'arme : affichés à **hauteur fixe**
(20 px dans le tableau, 52 à 60 px dans le loadout, 30 % de la carte au râtelier), un pistolet reste plus court qu'un
fusil. 52 armes en ont une ; mêlée, explosifs, armes spéciales, JS9, RPD et véhicules retombent sur l'icône carrée
(240 × 240, arme en diagonale), puis sur rien si elle manque.

Calculs : `src/lib/weapons/armory.ts` (pur, testé par `armory.test.ts`). Composants : `src/components/weapons/`.
Route : chaque ligne porte `weaponKey` et `weaponCategoryCode` de `weapon-categories.ts` (contrat testé par
`src/lib/weapons/armory-route-contracts.test.ts`). Rendu : `e2e/armory.spec.ts`.

**Écarts assumés avec la maquette** (règles de la refonte, `CLAUDE.md` §6 bis) : états actifs (puces, barre, tri,
pagination) en accent et non en or ; rangs par `RankCell` (médailles SVG) au lieu des pastilles « #1 » ; classement mobile
par `MobileRankList` (puces « Trier par ») au lieu d'un menu ; filtre joueur par `MobileDropdownNav` ; hauteur du bandeau
d'image inchangée. L'or de la maquette vient des jetons `.game-ui` (`--game-gold*`).

**Navigation** : une seule entrée, `clan.stats-weapons`, libellée « L'armurerie du clan » (registre et surcharge en
base). L'entrée `clan.stats-weapons-categories` a été retirée du registre et de la table `NavItem` le 2026-09-27. Le menu
choisit son icône d'après le libellé (`NavIcon`) : un nouveau libellé doit y être ajouté, sinon l'icône disparaît.
