# Stats armes

La section armes expose deux sources de données distinctes que la page `/members/[id]/weapons` présente côte à côte :

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

Vue agrégée des stats armes de tous les membres actifs du clan.

---

## 2. Weapon Mastery carrière

### Source

API PUBG `GET /shards/{shard}/players/{playerId}/weapon_mastery` — données de carrière complète du joueur, non filtrables par période.

### Modèle de données (`MemberWeaponMastery`)

| Champ DB | Type | Description |
|---|---|---|
| `weaponId` | string | Identifiant interne PUBG (ex. `Item_Weapon_AK47_C`) |
| `weaponName` | string | Nom humain dérivé (préfixe `Item_Weapon_` et suffixe `_C` supprimés) |
| `kills` | number | Kills totaux avec cette arme sur toute la carrière |
| `headshots` | number | Headshots totaux |
| `knockouts` | number | Knockdowns (ennemis mis à terre) |
| `shots` | number | Tirs effectués (carrière) |
| `hits` | number | Tirs ayant touché (carrière) |
| `damage` | number | Dégâts totaux infligés |
| `level` | number | Niveau de maîtrise PUBG (1 à 10+) |
| `xpTotal` | number | XP total accumulé |
| `tier` | number | Tier de médaille |
| `lastRefreshedAt` | string | ISO 8601 — date du dernier refresh depuis l'API PUBG |

Métriques dérivées (calculées côté client) :
- Taux de headshot : `headshots / kills * 100`
- Précision : `hits / shots * 100`

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

### `weapon-category-service.ts`

Classe les armes en catégories :

| Code | Catégorie |
|---|---|
| `AR` | Assault Rifle |
| `DMR` | Designated Marksman Rifle |
| `SR` | Sniper Rifle |
| `SMG` | Submachine Gun |
| `LMG` | Light Machine Gun |
| `SG` | Shotgun |
| `Autre` | Autres armes |

Les catégories par défaut sont définies dans `DEFAULT_WEAPON_CATEGORIES` (dictionnaire clé `weaponId` → code). Elles sont personnalisables et stockées en base via la clé `pubg_weapon_categories`.

---

## 6. Page `/members/[id]/weapons`

Client Component. Deux sections indépendantes sur la même page :

### Section "Maîtrise armes (carrière)"

- Chargement automatique au montage depuis `GET /api/members/[id]/weapon-mastery`
- Bouton "Rafraichir" → POST puis rechargement
- Date du dernier refresh affiché (`lastRefreshedAt` le plus récent)
- Tableau triable par colonnes : Arme, Kills, Headshots, Headshot %, Précision %, Dégâts, Niveau
- Tri par défaut : kills desc
- `WeaponIcon` affiché dans la colonne Arme

### Section "Stats télémétrie" (tableau du bas)

- `SegmentedControl` Semaine / Mois / Tous
- Rechargement à chaque changement de période via `GET /api/members/[id]/telemetry/weapons?period=`
- Tableau triable par colonnes : Arme, Kills, Headshots %, Tirs, Touches, Précision, Distance moyenne, Distance max, Matchs
- Tri par défaut : kills desc
- Les 3 meilleures armes par kills reçoivent un badge podium (`app-podium-badge--gold/silver/bronze`)
- `WeaponIcon` affiché dans la colonne Arme
- Si aucune donnée : message vide avec liens vers la page Cron et Recoveries télémétrie

---

## 7. Pages clan

### `/clans/[clanId]/stats/weapons`

Vue comparative du clan — stats armes agrégées par membre, filtrées par catégorie via onglets.

### `/clans/[clanId]/stats/weapons/categories`

Ventilation par catégorie d'arme pour le clan — détail des performances par type d'arme.
