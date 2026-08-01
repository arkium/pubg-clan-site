# Drop Zones

Les zones de drop visualisent les points d'atterrissage en parachute des membres du clan, sous forme de points individuels et de heatmap agrégée sur une carte PUBG.

---

## Source de données

**Événement télémétrie** : `LogParachuteLanding` — émis quand un joueur touche le sol après avoir sauté de l'avion.

**Stockage** : colonne `landingSamples JSON NULL` dans la table `SquadMatchTelemetry`, ajoutée par la migration `20260607120000_...`. Un tableau JSON de points est stocké par match parsé.

Les matchs parsés **avant** l'application de cette migration ne contiennent pas de données `landingSamples`. Il n'y a pas de backfill historique prévu.

---

## Modèles de données

### `LandingPoint` — un point par membre par match

| Champ | Type | Description |
|---|---|---|
| `memberId` | number | ID interne `ClanMember` |
| `memberName` | string | `displayName` du membre |
| `matchId` | string | `squadMatchId` (UUID interne) |
| `mapName` | string | Identifiant de carte PUBG (voir liste ci-dessous) |
| `x` | number | Coordonnée X brute en unités carte PUBG (mètres approximatifs) |
| `y` | number | Coordonnée Y brute |
| `xPct` | number | Position normalisée en % [0..100] sur l'axe horizontal de l'image de carte |
| `yPct` | number | Position normalisée en % [0..100] sur l'axe vertical de l'image de carte |

### `HeatmapCell` — agrégat de la grille 40x40

| Champ | Type | Description |
|---|---|---|
| `xIndex` | number | Colonne dans la grille, [0..39] |
| `yIndex` | number | Ligne dans la grille, [0..39] |
| `count` | number | Nombre de landings dans cette cellule |

Seules les cellules avec `count > 0` figurent dans le tableau `heatmap`. La grille 40x40 correspond à des cellules d'environ 2 % de la carte.

### Statistiques par ville

La page membre associe chaque `LandingPoint` aux villes actives configurées dans `pubg_map_locations`. Un point appartient à une ville lorsque la distance entre ses coordonnées `xPct/yPct` et le centre de la ville est inférieure ou égale à son `radiusPct`.

Lorsque plusieurs périmètres se chevauchent, le point est affecté à la ville dont le ratio `distance / radiusPct` est le plus faible. Chaque point ne compte donc que pour une seule ville.

Le Top 5 affiché au-dessus de la carte est recalculé selon la portée, la période et la carte actives. Il expose :

- le nombre d'atterrissages dans la ville ;
- la part de tous les atterrissages de la carte ;
- le nombre de matchs distincts ;
- le nombre de membres distincts ;
- le membre ayant le plus d'atterrissages dans la ville, accompagné de son total ;
- la ville favorite, définie comme celle qui contient le plus d'atterrissages.

En cas d'égalité entre membres dans une ville, le nom affiché est le premier par ordre alphabétique.

Le filtre par ville limite les points affichés et reconstruit la heatmap à partir de ces seuls points. Les périmètres circulaires blancs sont visibles par défaut ; leur bouton superposé permet de masquer cette couche, placée au-dessus de la heatmap et sous les points individuels.

### Pression au drop

Chaque drop suivi est comparé aux autres `landingSamples` du même match. Les joueurs sont dédupliqués par `memberKey`, le joueur suivi est exclu, puis les joueurs situés à moins de `250 m` (`25 000` unités PUBG) sont comptés.

Le marqueur unique remplace l'ancien point et son remplissage indique le niveau provisoire :

| Niveau | Joueurs proches | Couleur |
|---|---:|---|
| Calme | 0–2 | Vert |
| Contesté | 3–7 | Jaune |
| Hot drop | 8–15 | Orange |
| Très chaud | 16+ | Rouge |

Sur la page clan, le contour du marqueur conserve la couleur du membre. L'infobulle expose le membre, la ville, le nombre de joueurs proches et le niveau. Les indicateurs affichent la pression moyenne, le maximum et la part de hot drops selon la période et les filtres actifs. Le Top 5 des villes ajoute sa pression moyenne et son taux de hot drops.

Ces valeurs sont actuellement calculées à la volée depuis les JSON existants. Les seuils doivent être calibrés avec plusieurs matchs réels avant toute persistance ou agrégation historique dédiée.

Les cartes membre et clan utilisent le même viewport interactif. Les contrôles superposés proposent un zoom de `1×` à `4×` par pas de `0,5×`, conservent le centre visible lors d'un zoom manuel et réinitialisent la carte entière depuis le bouton du niveau courant. La molette applique les mêmes pas de zoom en conservant sous le curseur le point de carte visé, sans faire défiler la page pendant une variation effective. Une carte agrandie se déplace directement par glisser-déposer à la souris, avec des curseurs `grab` et `grabbing` ; les barres de défilement sont masquées et le déplacement tactile natif reste disponible. La sélection d'une ville depuis le filtre ou le Top 5 passe au minimum à `2×` et centre automatiquement son périmètre.

---

## Normalisation des coordonnées

Les cartes PUBG principales (Erangel, Miramar) font environ 816 000 x 816 000 unités. La normalisation `xPct`/`yPct` est calculée ainsi :

```
xPct = (x / carteWidth) * 100
yPct = (y / carteHeight) * 100
```

Les valeurs `xPct`/`yPct` s'utilisent directement en CSS `left`/`top` sur une image de carte en `position: relative` :

```tsx
<img src={mapImageUrl} style={{ position: 'relative' }} />
{points.map(point => (
  <div
    key={point.matchId + point.memberId}
    style={{
      position: 'absolute',
      left: `${point.xPct}%`,
      top: `${point.yPct}%`,
    }}
  />
))}
```

---

## Cartes PUBG supportées

| `mapName` | Nom affiché |
|---|---|
| `Baltic_Main` | Erangel |
| `Desert_Main` | Miramar |
| `Savage_Main` | Sanhok |
| `Tiger_Main` | Taego |
| `Kiki_Main` | Deston |
| `Summerland_Main` | Karakin |
| `Neon_Main` | Rondo |
| `Range_Main` | Training Island |

---

## Contrat API

## Persistance de la pression au drop

Chaque drop d'un membre suivi est persisté dans `DropPressureStat` avec une contrainte unique sur le couple `(squadMatchId, memberId)`. La ligne conserve la carte, les coordonnées, la date du match, le nombre total de joueurs à moins de 250 m, le nombre d'adversaires identifié par `teamId` et le niveau de pression.

Les nouveaux parsings remplacent transactionnellement les lignes du match. L'historique existant se reconstruit de manière idempotente avec :

```bash
npm run telemetry:drop-pressure:backfill
npm run telemetry:drop-pressure:backfill -- --clan 1 --limit 500
```

Les dashboards membre et clan agrègent cette table selon les périodes calendaires `week`, `month` et `all`. Ils affichent six cartes KPI puis un classement triable des cinq membres selon le nombre de drops, les moyennes de proximité, le maximum ou la part de hot drops. Le dashboard membre conserve toujours la ligne du membre consulté avec son rang réel lorsqu'il se trouve hors du Top 5.

Une courbe intitulée « Évolution sur les 8 dernières semaines » complète les deux dashboards. Elle conserve les semaines sans drop dans l'axe et permet de basculer entre les adversaires moyens, les joueurs proches moyens, la part de hot drops et le volume de drops.

### `GET /api/clans/[clanId]/telemetry/drop-zones`

**Auth** : `requireNavPermission('clan.drop-zones')` — rôle requis configurable via `/settings/nav-permissions` (pas figé sur Owner).
**Query param** : `?period=week` (défaut) | `month` | `all`

**Réponse 200** (enveloppée dans `buildTelemetrySuccessResponse`) :

```typescript
type LandingPoint = {
  memberId: number
  memberName: string
  matchId: string
  mapName: string
  x: number
  y: number
  xPct: number
  yPct: number
}

type HeatmapCell = {
  xIndex: number  // [0..39]
  yIndex: number  // [0..39]
  count: number
}

type DropZonesData = {
  gridSize: 40
  points: LandingPoint[]
  heatmap: HeatmapCell[]  // uniquement les cellules count > 0
  options: {
    mapLocations: Record<string, MapLocation[]> // villes actives uniquement
  }
}
```

**Exemple complet** :

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
      {
        "memberId": 42,
        "memberName": "Kraken",
        "matchId": "abc-123-def",
        "mapName": "Baltic_Main",
        "x": 432100,
        "y": 218500,
        "xPct": 43.21,
        "yPct": 21.85
      }
    ],
    "heatmap": [
      { "xIndex": 17, "yIndex": 8, "count": 5 },
      { "xIndex": 18, "yIndex": 8, "count": 3 }
    ]
  },
  "legacy": {
    "clanId": 1,
    "period": "week",
    "periodKey": "week-2026-23",
    "total": 87
  }
}
```

---

## Pages UI

### `/clans/[clanId]/drop-zones`

Vue clan — points de landing de tous les membres actifs sur la période, superposés sur l'image de la carte. Elle reprend les mêmes statistiques par ville et le même rendu de densité que la page membre :

- Top 5 standardisé avec ville favorite, atterrissages, part, matchs, membres et membre principal ;
- filtres par période, affichage, carte, joueur et ville ;
- périmètres circulaires visibles par défaut et masquables depuis la carte ;
- zoom `1×–4×` par contrôles ou molette et recentrage automatique sur la ville sélectionnée ;
- déplacement de la carte agrandie par glisser-déposer, sans barres de défilement visibles ;
- heatmap carrée `40 × 40`, plages logarithmiques, seuil adaptatif et opacité de `10 %` à `60 %` ;
- points opaques colorés par membre au-dessus des périmètres et de la densité ;
- vue mobile en liste synthétique sans défilement horizontal de page.

### `/members/[id]/drop-zones`

Vue individuelle — points de landing d'un membre, du clan ou de sa meilleure formation, avec mise en avant des zones préférées, le même référentiel de villes et les mêmes interactions de carte que la vue clan.

---

## Limitations

- Les données `landingSamples` ne sont présentes que pour les matchs parsés après l'application de la migration SQL (ajout de la colonne `landingSamples JSON NULL`). Les matchs antérieurs ne sont pas backfillés.
- Les matchs parsés avec le parser v1 (avant la migration) n'ont pas non plus de `landingSamples`.
- L'auth de la route clan passe par `requireNavPermission('clan.drop-zones')` — le rôle minimal requis se configure depuis `/settings/nav-permissions`, pas besoin de modifier le code pour élargir ou restreindre l'accès.
