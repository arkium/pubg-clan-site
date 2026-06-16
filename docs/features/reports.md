# Rapports

Les rapports sont des synthèses périodiques automatisées de l'activité d'un clan. Ils agrègent les performances des membres sur une semaine ou un mois, calculent des highlights, des graphiques et des recommandations, et sont notifiés à chaque membre à leur génération.

---

## Modèles de données

### `Report`

| Champ | Type | Description |
|---|---|---|
| `id` | string (UUID) | Identifiant unique |
| `clanId` | number | Clan concerné |
| `type` | `'weekly' \| 'monthly'` | Type de rapport |
| `periodStart` | Date | Début de la période (normalisé au lundi pour weekly, au 1er du mois pour monthly) |
| `periodEnd` | Date | Fin de la période (dimanche 23:59:59 ou dernier jour du mois) |
| `topKiller` | number \| null | `memberId` du meilleur tueur (highlight) |
| `topDamage` | number \| null | `memberId` du plus gros dealer de dégâts |
| `bestWinRate` | number \| null | `memberId` du meilleur win rate (minimum 3 matchs) |
| `mvp` | number \| null | `memberId` du MVP (score composite kills+damage+winRate) |
| `totalMatches` | number | Nombre de matchs squad dans la période |
| `totalKills` | number | Kills totaux du clan |
| `totalDamage` | number | Dégâts totaux du clan |
| `avgTeamSize` | number | Taille d'équipe moyenne par match |
| `avgWinRate` | number | Ratio victories/matchs [0..1] |
| `playerStats` | JSON | Objet `{ [memberId]: ReportPlayerStats }` — stats par joueur stockées à la génération |
| `createdAt` | Date | Date de génération |

### `ReportSection`

Chaque rapport est associé à un ensemble de sections JSON :

| `sectionType` | `title` | Contenu |
|---|---|---|
| `highlights` | Highlights | Entrées topKiller, topDamage, bestWinRate, mvp avec valeur et sous-titre |
| `top_performers` | Top performers | `ReportPlayerStats[]` des 5 meilleurs (triés kills desc) |
| `stats_table` | Stats détaillées | `ReportPlayerStats[]` de tous les joueurs actifs |
| `progression` | Progression | Delta vs période précédente (kills, damage, assists, matches, winRate) + label comparaison |
| `charts` | Charts | Timeline kills+damage par jour, comparaison joueurs top 6, répartition par mode de jeu, heatmap activité heure/jour |
| `insights` | Insights | 5 phrases générées automatiquement (meilleur jour, heures actives, meilleur combo, meilleure progression, tendance) |
| `recommendations` | Recommandations | 2-3 conseils textuels basés sur les données |

### `ReportPlayerStats`

```typescript
type ReportPlayerStats = {
  memberId: number
  displayName: string
  matches: number
  kills: number
  damage: number
  assists: number
  revives: number
  wins: number
  winRate: number       // wins / matches
  avgKills: number      // kills / matches
  avgDamage: number     // damage / matches
  mvpScore: number      // score composite normalise [0..3]
  progression: {
    kills: number        // delta vs periode precedente
    damage: number
    assists: number
    matches: number
    winRate: number
  }
}
```

---

## Generation d'un rapport

Fonctions exportees depuis `src/lib/report-generator.ts` :

```typescript
generateWeeklyReport(clanId: number, weekStart: Date)
generateMonthlyReport(clanId: number, monthStart: Date)
```

### Pipeline

1. Normalisation de la periode (lundi pour weekly, 1er du mois pour monthly) et calcul de la periode precedente.
2. Chargement des `SquadMatch` avec leurs `SquadMember` pour la periode courante et precedente.
3. Agregation des stats par joueur : kills, damage, assists, revives, wins, winRate, avgKills, avgDamage, mvpScore, progression.
4. Calcul des highlights (top killer, top damage, best win rate avec min 3 matchs, MVP).
5. Construction des graphiques : timeline par date, comparaison top 6 joueurs, repartition par mode de jeu (`gameMode`), heatmap 7 jours x 24 heures.
6. Calcul des recommandations (max 3) selon taille d'equipe, win rate, joueurs peu actifs, meilleur support.
7. Calcul des insights (5 phrases analytiques).
8. Suppression du rapport existant pour la meme periode (`clanId + type + periodStart`) — un seul rapport par periode.
9. Persistance avec toutes les sections.
10. Notification `report_ready` a chaque membre actif du clan.

### Calcul du MVP Score

```
mvpScore = kills/maxKills + damage/maxDamage + winRate/maxWinRate
```

Score normalise sur 3 par rapport aux maximums du roster. Non comparable entre rapports.

---

## Routes API

### `GET /api/clans/[clanId]/reports`

Permission : `view_reports` (accessible sans session via `allowMissingActor`).

**Query params** :
- `?type=weekly|monthly` (optionnel)
- `?limit=10` (max 50)
- `?offset=0`

**Reponse 200** :

```typescript
type ReportListResponse = {
  reports: ReportSummary[]
  totalCount: number
}

type ReportSummary = {
  id: string
  clanId: number
  clanName: string
  type: 'weekly' | 'monthly'
  periodStart: string
  periodEnd: string
  totalMatches: number
  totalKills: number
  totalDamage: number
  avgTeamSize: number
  avgWinRate: number
  createdAt: string
  highlights: ReportHighlightsData
}
```

### `GET /api/clans/[clanId]/reports/[reportId]`

**Reponse 200** :

```typescript
type ReportDetailResponse = {
  report: ReportSummary & { playerStats: ReportPlayerStats[] }
  sections: ReportSectionItem[]
  insights: string[]
}
```

### `GET /api/clans/[clanId]/reports/[reportId]/export`

**Query param** : `?format=html` (defaut) | `json` | `pdf`

| Format | Content-Type | Fichier |
|---|---|---|
| `html` | `text/html; charset=utf-8` | `report-{id}.html` |
| `json` | `application/json; charset=utf-8` | `report-{id}.json` |
| `pdf` | `application/pdf` | `report-{id}.pdf` |

Le PDF est genere en pur JavaScript sans dependance externe. Il contient un resume texte brut et les insights (max 24 lignes, police Helvetica).

---

## Pages UI

### `/clans/[clanId]/reports`

Liste paginee des rapports avec filtres weekly/monthly. Carte par rapport avec periode, metriques cles et highlights.

### `/clans/[clanId]/reports/[reportId]`

Detail d'un rapport : en-tete (periode, totaux), highlights (4 cartes), tableau stats joueurs, progression vs periode precedente, graphiques, insights, recommandations, boutons d'export HTML/PDF/JSON.
