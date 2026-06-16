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

### `GET /api/clans/[clanId]/telemetry/drop-zones`

**Auth** : `requireRole(['Owner'])` — réservé à l'owner du clan.
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

Vue clan — points de landing de tous les membres actifs sur la période, superposés sur l'image de la carte. Recommandations de rendu :
- Image de carte en `position: relative` comme conteneur
- Points colorés par membre (`left: xPct%`, `top: yPct%`)
- Overlay heatmap (grille 40x40) avec transparence proportionnelle à `count / count_max`
- Sélecteur de période (`SegmentedControl`)
- Légende : couleur → nom du membre
- Filtre par carte si plusieurs cartes dans la période

### `/members/[id]/drop-zones`

Vue individuelle — points de landing d'un seul membre, avec mise en avant de ses zones préférées.

---

## Limitations

- Les données `landingSamples` ne sont présentes que pour les matchs parsés après l'application de la migration SQL (ajout de la colonne `landingSamples JSON NULL`). Les matchs antérieurs ne sont pas backfillés.
- Les matchs parsés avec le parser v1 (avant la migration) n'ont pas non plus de `landingSamples`.
- L'auth de la route clan est restrictive (Owner uniquement). Si un accès Member est souhaité, modifier `requireRole` dans la route.
