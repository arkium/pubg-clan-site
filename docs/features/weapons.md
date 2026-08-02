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
| `level` | number | Niveau de maîtrise PUBG (1 à 10+) | `LevelCurrent` |
| `xpTotal` | number | XP total accumulé | `XPTotal` |
| `tier` | number | Tier de médaille | `TierCurrent` |
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
