# Télémétrie — Contrats API

Ce document recense les routes télémétrie et leurs contrats JSON. Toutes les routes sont accessibles uniquement aux membres authentifiés avec les rôles indiqués.

## Format de réponse commun

Toutes les routes télémétrie utilisent le contrat `buildTelemetrySuccessResponse` / `buildTelemetryErrorResponse` défini dans `src/lib/pubg-telemetry/api-contract.ts`.

```typescript
// Réponse succès
{
  success: true,
  meta: {
    scope: 'clan' | 'member',
    clanId?: number,
    memberId?: number,
    period: 'week' | 'month' | 'all',
    periodKey: string,   // ex. "week-2026-23", "month-2026-06", "all-time"
    count: number,
  },
  data: { ... },         // payload métier
  legacy: { ... },       // champs legacy pour compatibilité descendante
}

// Réponse erreur
{
  success: false,
  error: string,
  code?: string,
}
```

**Valeurs de `period` :**

| Valeur | Format `periodKey` | Fenêtre temporelle |
|--------|--------------------|--------------------|
| `week` | `week-YYYY-WW` | Lundi au dimanche de la semaine ISO courante |
| `month` | `month-YYYY-MM` | Du 1er au dernier jour du mois courant |
| `all` | `all-time` | Toutes les données disponibles |

---

## Clan scope — `/api/clans/[clanId]/telemetry/`

### GET /weapons

**Auth :** permission `clan.stats-weapons` (configurable par rôle)
**Query params :** `?period=week|month|all` (défaut : `week`)

**Réponse :**

```typescript
type WeaponRow = {
  memberId: number
  displayName: string
  pubgPlayerName: string
  weaponName: string          // clé télémétrie PUBG, ex. "WeapAK47_C"
  weaponLabel: string         // nom lisible, ex. "AKM"
  weaponCategoryCode: string  // ex. "AR", "SR", "SMG"
  weaponCategoryLabel: string // ex. "Assault Rifle"
  kills: number
  headshots: number
  shotsFired: number
  hitsLanded: number
  accuracy: number            // (hitsLanded / shotsFired) * 100, en %
  avgDistance: number         // distance moyenne de kill, en mètres
  maxDistance: number | null  // distance max de kill, en mètres
  totalDamage: number
  matchCount: number
}

type WeaponsResponse = {
  rows: WeaponRow[]
  weaponLabels: Record<string, string>  // mapping weaponName → label
  note: string | null                   // null si des données sont présentes
}
```

**Notes :**
- `avgDistance` et `maxDistance` sont convertis en mètres (les valeurs brutes en DB sont en centimètres).
- `maxDistance` peut être `null` pour les matchs parsés avant la migration `20260605091500`.
- La précision (`accuracy`) vaut `0` si `shotsFired === 0`.
- Les données proviennent de `MemberWeaponStats` pour les agrégats, complétées par les snapshots `SquadMatchTelemetry` pour la distance max snapshot-level.

---

### GET /synergies

**Auth :** Owner uniquement
**Query params :** `?period=week|month|all` (défaut : `week`)

**Réponse :**

```typescript
type SynergyRow = {
  memberAId: number
  memberAName: string
  memberBId: number
  memberBName: string
  reviveCount: number          // revives de A vers B ou B vers A, cumulés
  coKillCount: number          // kills en même temps sur la même cible
  sharedDamageEvents: number   // événements de dégâts partagés
}

type SynergiesResponse = {
  rows: SynergyRow[]
}
```

**Notes :**
- Triées par `reviveCount DESC, coKillCount DESC, sharedDamageEvents DESC`.
- Source : table `ClanSynergyTelemetryStats`, agrégats par paire de membres et par période.
- Une paire (A, B) = une ligne. L'ordre A/B est arbitraire (le plus petit `memberId` est toujours `memberAId`).

---

### GET /playstyle

**Auth :** Owner uniquement
**Query params :** `?period=week|month|all` (défaut : `week`)

**Réponse :**

```typescript
type PlaystyleRow = {
  memberId: number
  displayName: string
  pubgPlayerName: string
  aggressionScore: number              // score d'agressivité [0..100]
  supportScore: number                 // score de soutien [0..100]
  zoneDisciplineScore: number          // score de discipline de zone [0..100]
  avgBlueZoneHits: number              // moyenne de hits zone bleue par match
  avgFirstContactPhase: number         // phase moyenne du premier contact armé
  avgCircleDelaySeconds: number        // retard moyen d'entrée dans le cercle (secondes)
  avgCircleDelayPercent: number        // retard moyen normalisé en %
  avgSafeZonePresencePercent: number   // % du temps passé dans la zone safe
  avgOnFootDistanceMeters: number      // distance moyenne à pied par match (mètres)
  avgVehicleDistanceMeters: number     // distance moyenne en véhicule par match (mètres)
  avgDamageTaken: number               // dégâts reçus moyens par match
  avgHealsUsed: number                 // items de soin utilisés moyens par match
  avgHealAmount: number                // HP soignés moyens par match
  avgBoostsUsed: number                // boosts utilisés moyens par match
  maxVehicleSpeedKph: number           // vitesse max en véhicule atteinte sur la période (km/h)
  avgVehicleRideEvents: number
  avgVehicleLeaveEvents: number
  avgPositionEvents: number
  matchesPlayed: number
}

type PlaystyleResponse = {
  rows: PlaystyleRow[]
}
```

**Notes :**
- Source : table `MemberTelemetryStats`, agrégats périodiques.
- Les champs `avgCircleDelayPercent`, `avgSafeZonePresencePercent`, `avgHealsUsed`, `avgHealAmount`, `avgBoostsUsed`, `maxVehicleSpeedKph` peuvent être absents sur les anciens schémas. Dans ce cas, la route effectue un fallback avec des valeurs à `0` sans erreur.
- `avgHealsUsed` / `avgHealAmount` / `avgBoostsUsed` sont alimentés par `LogHeal` (parser v2+).
- `maxVehicleSpeedKph` est alimenté par `LogVehicleLeave.maxSpeed` (parser v2+, migration `20260607120000`).
- Triées par `aggressionScore DESC, supportScore DESC, matchesPlayed DESC`.

---

### GET /circles

**Auth :** Owner uniquement
**Query params :** `?period=week|month|all` (défaut : `week`)

Retourne les métriques de gestion des cercles par membre. Source : agrégats `MemberTelemetryStats` sur les champs cercles (`avgCircleDelaySeconds`, `avgCircleDelayPercent`, `avgSafeZonePresencePercent`, `avgFirstContactPhase`).

---

### GET /positions

**Auth :** permission `clan.positions` (configurable par rôle, voir `/settings/nav-permissions`)
**Query params :** `?period=week|month|all`, `?map=Baltic_Main` (optionnel)

Retourne les échantillons de positions sur carte (`positionSamples` dans `SquadMatchTelemetry`). Les positions sont normalisées en coordonnées brutes PUBG (repère métrique).

---

### GET /heatmap

**Auth :** permission `clan.heatmap-kills` (configurable par rôle, voir `/settings/nav-permissions`)
**Query params :** `?period=week|month|all`, `?map=Baltic_Main` (optionnel)

Retourne une grille de densité de kills par cellule sur la carte, pour overlay visuel.

---

### GET /loot

**Auth :** Owner uniquement
**Query params :** `?period=week|month|all` (défaut : `week`)

Retourne les données d'économie de loot (pickups, drops, équipements acquis) agrégées depuis `LogItemPickup`, `LogItemDrop`, `LogItemEquip`.

---

### GET /vehicles

**Auth :** Owner uniquement
**Query params :** `?period=week|month|all` (défaut : `week`)

Retourne les stats véhicules par membre (événements `LogVehicleRide`, `LogVehicleLeave`). Inclut la distance parcourue en véhicule, le nombre d'événements ride/leave, et `maxVehicleSpeedKph`.

---

### GET /drop-zones

**Auth :** permission `clan.drop-zones` (configurable par rôle, voir `/settings/nav-permissions`)
**Query params :** `?period=week|month|all` (défaut : `week`)

**Réponse :**

```typescript
type LandingPoint = {
  memberId: number
  memberName: string
  matchId: string       // squadMatchId (UUID)
  mapName: string       // ex. "Baltic_Main", "Desert_Main"
  x: number            // coordonnée brute (mètres, repère carte PUBG)
  y: number
  xPct: number         // position normalisée en % [0..100] sur la carte
  yPct: number         // position normalisée en % [0..100] sur la carte
}

type HeatmapCell = {
  xIndex: number   // colonne dans la grille 40x40 [0..39]
  yIndex: number   // ligne dans la grille 40x40 [0..39]
  count: number    // nombre de landings dans cette cellule
}

type DropZonesData = {
  gridSize: 40
  points: LandingPoint[]   // un point par membre par match
  heatmap: HeatmapCell[]   // uniquement les cellules avec count > 0
}
```

**Exemple de réponse complète :**

```json
{
  "success": true,
  "meta": { "scope": "clan", "clanId": 1, "period": "week", "periodKey": "week-2026-23", "count": 87 },
  "data": {
    "gridSize": 40,
    "points": [
      { "memberId": 42, "memberName": "Kraken", "matchId": "abc-123", "mapName": "Baltic_Main",
        "x": 432100, "y": 218500, "xPct": 43.21, "yPct": 21.85 }
    ],
    "heatmap": [
      { "xIndex": 17, "yIndex": 8, "count": 5 }
    ]
  },
  "legacy": { "clanId": 1, "period": "week", "periodKey": "week-2026-23", "total": 87 }
}
```

**Notes :**
- `xPct`/`yPct` sont utilisables directement en propriétés CSS `left`/`top` sur une image de carte.
- La grille 40x40 correspond à des cellules d'environ 2% de la carte.
- Source : champ `landingSamples` JSON dans `SquadMatchTelemetry` (migration `20260607120000`). Les matchs parsés avant cette migration n'ont pas de `landingSamples`.
- `mapName` peut être : `Baltic_Main` (Erangel), `Desert_Main` (Miramar), `Savage_Main` (Sanhok), `Tiger_Main` (Taego), `Kiki_Main` (Deston), `Neon_Main` (Rondo), `Summerland_Main` (Karakin), `Range_Main` (Camp Jackal).

---

## Clan scope — Gestion de la queue

### GET /sync-batch-manual

**Auth :** Owner uniquement

Retourne l'état courant de la queue de traitement télémétrie.

**Réponse :**

```typescript
type QueueStatus = {
  queue: {
    queued: number
    running: number
    success: number
    failed: number
    total: number
  }
  recentJobs: Array<{
    id: string
    status: 'queued' | 'running' | 'success' | 'failed'
    message: string | null
    details: Record<string, unknown> | null
    finishedAt: string | null
    createdAt: string
  }>
}
```

### POST /sync-batch-manual

**Auth :** Owner uniquement

**Corps :**

```typescript
{
  matchIds: string[]      // liste des squadMatchId à enqueuer
  mode?: 'direct' | 'capture' | 'queue'  // défaut: 'direct'
  resetBefore?: boolean   // réinitialiser la télémétrie avant traitement
  recalcAfter?: boolean   // recalculer les agrégats après traitement
}
```

**Réponse (mode direct) :**

```typescript
{
  successCount: number
  failedCount: number
  results: Array<{
    squadMatchId: string
    status: 'success' | 'failed'
    error?: string
    positionSamples?: number
    trajectorySegments?: number
  }>
}
```

---

### GET /resync-files-queue

Retourne la liste des jobs de resync de fichiers locaux capturés en attente.

### POST /resync-files-queue

Enqueue des jobs de resync depuis les fichiers capturés dans `.telemetry-captured/`.

**Corps :**

```typescript
{
  matchIds: string[]
  resetBefore?: boolean
}
```

---

### POST /sync-selected

Déclenche le sync direct pour les matchs sélectionnés depuis la vue session.

**Corps :**

```typescript
{
  matchIds: string[]
  force?: boolean    // traiter même si statut 'success' existant
}
```

### POST /resync-files-selected

Resync depuis les fichiers locaux capturés pour les matchs sélectionnés.

### POST /clear-selected

Réinitialise les données télémétrie pour les matchs sélectionnés (remet le statut à `pending`).

### POST /fetch-files-selected

Télécharge et capture les fichiers télémétrie depuis le CDN PUBG pour les matchs sélectionnés, sans les parser.

---

### GET /dead-letter

**Auth :** Owner uniquement

Retourne les jobs en dead-letter (échecs définitifs non retentatables).

### POST /dead-letter

Remet en file d'attente des jobs depuis la dead-letter.

**Corps :**

```typescript
{
  jobIds: string[]   // IDs de CronExecution à remettre en queue
}
```

---

### GET /queue-cleanup

**Auth :** Owner uniquement

Retourne l'état de la queue et les informations de priorité courantes.

### POST /queue-cleanup

**Auth :** Owner uniquement

Exécute une action de maintenance sur la queue.

**Corps :**

```typescript
{
  action: 'reorder-priority' | 'cleanup-stale' | 'cleanup-failed' | 'cancel-old'
  maxAgeHours?: number      // pour cleanup-stale (défaut: 24) et cleanup-failed (défaut: 1)
  cancelMaxAgeMs?: number   // pour cancel-old (défaut: 3600000, soit 1h)
}
```

| Action | Effet |
|--------|-------|
| `reorder-priority` | Réordonne les jobs `queued` par ancienneté de match (les plus récents en premier) |
| `cleanup-stale` | Supprime les jobs `queued` plus anciens que `maxAgeHours` heures |
| `cleanup-failed` | Supprime les jobs `failed` plus anciens que `maxAgeHours` heures |
| `cancel-old` | Marque comme `timeout-failed` les jobs `running` depuis plus de `cancelMaxAgeMs` ms |

---

### GET /metrics

**Auth :** Owner uniquement
**Query params :** `?format=json` (défaut) ou `?format=prometheus`

**Réponse JSON :**

```typescript
{
  queued: number
  running: number
  success: number
  failed: number
  recent_failures: number    // jobs échoués dans la dernière heure
  success_rate: number       // en %, sur les 50 derniers samples
  avg_duration_ms: number    // durée moyenne des jobs réussis (ms)
}
```

**Réponse Prometheus (`Content-Type: text/plain`) :**

```
# HELP telemetry_jobs_queued Jobs waiting to process
# TYPE telemetry_jobs_queued gauge
telemetry_jobs_queued{clan_id="1"} 12

# HELP telemetry_jobs_running Jobs currently processing
# TYPE telemetry_jobs_running gauge
telemetry_jobs_running{clan_id="1"} 2

# HELP telemetry_jobs_success Total successful jobs
# TYPE telemetry_jobs_success counter
telemetry_jobs_success{clan_id="1"} 347

# HELP telemetry_jobs_failed Total failed jobs
# TYPE telemetry_jobs_failed counter
telemetry_jobs_failed{clan_id="1"} 8

# HELP telemetry_recent_failures Failed jobs in last hour
# TYPE telemetry_recent_failures gauge
telemetry_recent_failures{clan_id="1"} 1

# HELP telemetry_success_rate Success rate percentage
# TYPE telemetry_success_rate gauge
telemetry_success_rate{clan_id="1"} 97.7

# HELP telemetry_avg_duration_ms Average job duration milliseconds
# TYPE telemetry_avg_duration_ms gauge
telemetry_avg_duration_ms{clan_id="1"} 28450
```

**Notes :**
- Les métriques sont stockées en mémoire (50 samples maximum dans `WorkerHealthMonitor`).
- Elles sont perdues au redémarrage du process.

---

### GET /observability

**Auth :** Owner uniquement
**Query params :** `?window=24h|7d|30d|all` (défaut : `24h`), `?limit=100`

Retourne les données d'observabilité du pipeline : totaux, p95 latences, taux d'échec, alertes seuils.

---

### GET /recoveries

**Auth :** Owner uniquement

Retourne les statistiques de récupération de jobs et l'historique récent des traitements télémétrie.

---

### POST /recalc-aggregates-batch

**Auth :** Owner uniquement

Déclenche le recalcul des agrégats périodiques (`MemberWeaponStats`, `MemberTelemetryStats`, `ClanSynergyTelemetryStats`) pour tous les matchs parsés du clan.

**Corps :**

```typescript
{
  scope: 'clan' | 'all-clans'
  period?: 'week' | 'month' | 'all'  // recalculer uniquement pour cette période
}
```

**Réponse :**

```typescript
{
  periodsUpdated: number
  memberTelemetryRows: number
  memberWeaponRows: number
  clanSynergyRows: number
}
```

---

### POST /import-file

**Auth :** Owner uniquement

Importe un fichier télémétrie JSON uploadé manuellement (hors CDN PUBG).

### POST /backfill-null-json

**Auth :** Owner uniquement

Déclenche un backfill des champs JSON manquants dans `SquadMatchTelemetry` (par exemple `memberStats` null sur les anciens snapshots parser v1).

---

## Member scope — `/api/members/[id]/telemetry/`

### GET /weapons

**Auth :** aucun rôle requis (lecture libre)
**Query params :** `?period=week|month|all` (défaut : `week`)

Identique au endpoint clan `/weapons`, mais filtré sur un membre spécifique. Retourne les `WeaponRow` du membre.

---

### GET /playstyle

**Auth :** aucun rôle requis
**Query params :** `?period=week|month|all` (défaut : `week`)

Retourne le profil de jeu du membre. Champs identiques à `PlaystyleRow` clan mais pour un seul membre.

---

### GET /circles

**Auth :** aucun rôle requis
**Query params :** `?period=week|month|all` (défaut : `week`)

Retourne les métriques de cercles du membre (`avgCircleDelaySeconds`, `avgCircleDelayPercent`, `avgSafeZonePresencePercent`, `avgFirstContactPhase`).

---

### GET /drop-zones

**Auth :** aucun rôle requis
**Query params :** `?period=week|month|all` (défaut : `week`)

Identique au endpoint clan `/drop-zones`, filtré sur un seul membre. Retourne `LandingPoint[]` + `HeatmapCell[]` pour ce membre uniquement.
