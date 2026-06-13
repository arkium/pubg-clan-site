# Télémétrie PUBG — Référence complète

> Fichier de référence unique. Remplace : `TELEMETRY_BATCH_README`, `TELEMETRY_SYNC_MODES`, `TELEMETRY_CAPTURE_AND_RESYNC_WORKFLOW`, `TELEMETRY_PHASE2_GUIDE`, `TELEMETRY_PHASE3_GUIDE`, `TELEMETRY_PRODUCTION_GUIDE`, `TELEMETRY_STATUS_COMPLETE`, `TELEMETRY_UI_GUIDE`, `resync-worker-runtime`, `telemetrie-matchs-clan`, `telemetrie-matchs-clan-deploiement`, `telemetrie-rollout`, `telemetry-sync-strategy`, `telemetry-worker-crash-fix`.

---

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture](#2-architecture)
3. [Les trois modes de sync](#3-les-trois-modes-de-sync)
4. [Worker — fonctionnement et configuration](#4-worker--fonctionnement-et-configuration)
5. [Bugs connus et correctifs appliqués](#5-bugs-connus-et-correctifs-appliqués)
6. [Échantillonnage adaptatif des positions](#6-échantillonnage-adaptatif-des-positions)
7. [Interface UI — page session](#7-interface-ui--page-session)
8. [Dashboard et monitoring](#8-dashboard-et-monitoring)
9. [Variables d'environnement](#9-variables-denvironnement)
10. [Commandes de référence](#10-commandes-de-référence)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Vue d'ensemble

La télémétrie PUBG permet d'enrichir chaque match d'une soirée avec les données brutes (positions, trajectoires, kills, dégâts, cercles...) publiées par l'API PUBG sous forme de fichiers JSON pouvant aller de 1 à 35 Mo.

### Pipeline en trois phases

```
Fichier JSON PUBG (1–35 Mo)
   ↓
Capture locale (.telemetry-captured/)
   ↓
Parsing streaming (parser.ts)
   ↓
Stockage DB (SquadMatchTelemetry)
   ↓
Recalcul agrégats (period-aggregates.ts)
```

### État des fonctionnalités

| Fonctionnalité | Statut |
|---|---|
| Sync manuel (3 modes) | ✅ Opérationnel |
| Worker asynchrone | ✅ Opérationnel |
| Protection mémoire (backpressure) | ✅ Opérationnel |
| Dead letter queue | ✅ Opérationnel |
| Dashboard monitoring | ✅ Opérationnel |
| Échantillonnage adaptatif (taille fichier) | ✅ Opérationnel |
| Annulation jobs bloqués (UI) | ✅ Opérationnel |

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────┐
│  Interface Web                                        │
│  /clans/[id]/telemetry/matches/session/[date]        │  ← sélection matchs + 3 modes
│  /clans/[id]/telemetry/dashboard                     │  ← monitoring queue
│  /clans/[id]/telemetry/errors                        │  ← jobs échoués
│  /clans/[id]/telemetry/sync-batch-manual             │  ← batch CLI-like
│  /clans/[id]/telemetry/recoveries                    │  ← suivi récupérations
└────────────────────────┬─────────────────────────────┘
                         │
┌──────────────────────────────────────────────────────┐
│  Routes API                                           │
│  POST /sync-selected            (Direct Sync)         │
│  POST /fetch-files-selected     (Capture seule)       │
│  POST /resync-files-selected    (Resync fichier)      │
│  POST /resync-files-queue       (Queue Resync)        │
│  GET  /sync-batch-manual        (statut file)         │
│  POST /queue-cleanup            (maintenance)         │
│  POST /dead-letter              (dead letter)         │
│  GET  /metrics                  (JSON + Prometheus)   │
└────────────────────────┬─────────────────────────────┘
                         │ table CronExecution
                         ▼
┌──────────────────────────────────────────────────────┐
│  File persistante (CronExecution)                     │
│  queued → running → success / failed                  │
└────────────────────────┬─────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│  Worker (scripts/telemetry-resync-worker.ts)          │
│  • Claim atomique 1 job                               │
│  • MemoryMonitor + BackpressureController             │
│  • Recovery des jobs bloqués au démarrage             │
│  • Logs métriques toutes les 30s                      │
└──────────────────────────────────────────────────────┘
```

### Fichiers clés

| Fichier | Rôle |
|---|---|
| `scripts/telemetry-resync-worker.ts` | Process worker |
| `src/lib/pubg-telemetry/resync-queue.ts` | Gestion file CronExecution |
| `src/lib/pubg-telemetry/resync-files.ts` | Lecture fichiers capturés + intervalle adaptatif |
| `src/lib/pubg-telemetry/parser.ts` | Parsing streaming JSON → snapshot |
| `src/lib/pubg-telemetry/manual-sync.ts` | Sync depuis stream (cap DB + persistence) |
| `src/lib/pubg-telemetry/persistence-payload.ts` | Construction payload Prisma |
| `src/lib/pubg-telemetry/persistence-fallback.ts` | Fallback SQL si Prisma KO sur JSON |
| `src/lib/pubg-telemetry/memory-monitor.ts` | Monitoring heap Node.js |
| `src/lib/pubg-telemetry/worker-backpressure.ts` | Pause automatique si mémoire haute |
| `src/lib/pubg-telemetry/stale-cleanup.ts` | Nettoyage jobs expirés |

---

## 3. Les trois modes de sync

### Comparatif rapide

| | Direct Sync ⚡ | Capture seule 📁 | Queue Resync 🔄 |
|---|---|---|---|
| **Bloquant** | Oui | Non | Non |
| **Fichiers locaux** | Non (éphémère) | Oui | Requis |
| **Volume recommandé** | < 50 matchs | Illimité | 100+ matchs |
| **Worker requis** | Non | Non | Oui |
| **Résultat** | Immédiat | Fichiers sur disque | Asynchrone |

---

### Mode 1 — Direct Sync ⚡

Télécharge depuis l'API PUBG, capture localement et traite en une seule opération HTTP.

**Flux :**
```
PUBG API → téléchargement → capture .telemetry-captured/ → parsing → DB → agrégats
```

**Endpoint :** `POST /api/clans/{id}/telemetry/sync-selected`

**Cas d'usage :** test rapide, < 50 matchs, dev/debug.  
**Risque :** timeout HTTP si batch trop grand.

---

### Mode 2 — Capture seule 📁

Télécharge et sauvegarde les fichiers JSON localement **sans les traiter**.

**Flux :**
```
PUBG API → téléchargement → .telemetry-captured/   [arrêt]
```

**Endpoint :** `POST /api/clans/{id}/telemetry/fetch-files-selected`

**Cas d'usage :** archivage, workflow en deux temps, debugging fichiers bruts.  
**Suivi :** les fichiers sont réutilisables à tout moment pour un re-parsing.

---

### Mode 3 — Queue Resync 🔄

Enfile les jobs dans la table `CronExecution`, le worker les traite en asynchrone.

**Flux :**
```
Vérification fichiers capturés → enqueue CronExecution → retour immédiat
Worker : claim → reset DB optionnel → parse → DB → agrégats
```

**Endpoint :** `POST /api/clans/{id}/telemetry/resync-files-queue`

**Prérequis :** fichiers déjà capturés (mode "Capture seule" en amont).  
**Cas d'usage :** production, 100+ matchs, non-bloquant.

**Commande worker :**
```bash
npm run telemetry:worker          # boucle infinie
npm run telemetry:worker:once     # traite les jobs en attente puis exit
```

---

### Guide de décision rapide

```
Quel volume ?
  < 50 matchs   → Direct Sync (résultat immédiat)
  50–100 matchs → Capture seule + Queue Resync
  100+ matchs   → Queue Resync (avec worker en arrière-plan)
  
Besoin de rejouer plus tard ?
  Oui → toujours passer par Capture seule d'abord
```

---

## 4. Worker — fonctionnement et configuration

### Démarrage

```bash
npm run telemetry:worker
```

Au démarrage, le worker :
1. Appelle `recoverStuckTelemetryResyncJobs` → remet en `queued` les jobs bloqués en `running` depuis > 10 minutes
2. Entre dans la boucle : claim → process → sleep 2s → repeat

> **Important :** `recoverStuckTelemetryResyncJobs` **remet en queue** (pas en `failed`). Un job qui crashe le worker sera reclaimed au prochain démarrage si plus de 10 min se sont écoulées. Voir [section 11](#11-troubleshooting) pour éviter la boucle infinie.

### Protection mémoire

```
Heap Node.js
  > 80%  → BackpressureController ralentit le claiming (délai 5s)
  > 95%  → Pause critique (délai 2s entre tentatives)
```

Variables de contrôle :
```env
TELEMETRY_WORKER_MEMORY_THRESHOLD_PCT=80
TELEMETRY_WORKER_MEMORY_CRITICAL_PCT=95
TELEMETRY_WORKER_GC_ENABLED=false       # true pour forcer GC après chaque job
```

### Logs émis

```
[TelemetryResyncWorker] started           { workerId, once, pollDelayMs, ... }
[TelemetryResyncWorker] job claimed       { jobId, squadMatchId, resetBeforeSync, ... }
[TelemetryResyncWorker] step reset-db     { jobId, squadMatchId }
[TelemetryResyncWorker] step reset-db done
[TelemetryResyncWorker] step resync-start { jobId, squadMatchId }
[TelemetrySync] capped arrays for DB      { positionSamples: { original, capped }, ... }
[TelemetryResyncWorker] step resync-done  { jobId, status }
[TelemetryResyncWorker] job success       { jobId, durationMs, queue }
[TelemetryResyncWorker] job failed        { jobId, error, queue }
[TelemetryResyncWorker] metrics           { toutes les 30s }
[TelemetryResyncWorker] recovered stuck jobs  { recovered }   ← si jobs bloqués au démarrage
```

---

## 5. Bugs connus et correctifs appliqués

### Bug 1 — `Readable.toWeb()` crash silencieux (Node.js 22)

**Symptôme :** worker crashe exit code 5 (V8 Fatal Error) après 1–2 jobs, sans aucun message d'erreur.

**Cause :** `Readable.toWeb()` a une fuite mémoire sur les streams séquentiels dans Node.js 22. Le 2e parse déclenche une corruption interne V8 non interceptable.

**Correctif (resync-files.ts) :**
```typescript
// NE PAS UTILISER : Readable.toWeb(nodeStream)

// UTILISER l'adaptateur manuel :
function nodeReadableToWebStream(readable: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      readable.on('data', (chunk) => {
        controller.enqueue(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk))
        readable.pause()
      })
      readable.on('end', () => controller.close())
      readable.on('error', (err) => controller.error(err))
    },
    pull() { readable.resume() },
    cancel() { readable.destroy() },
  })
}
```

---

### Bug 2 — Crash Prisma Rust engine sur gros JSON (fichiers ≥ 10 Mo)

**Symptôme :** worker crashe silencieusement après "job claimed", sur des fichiers de 10–35 Mo. Plusieurs matchs différents affectés.

**Cause :** Le Prisma Library Engine (Rust in-process) crash fatalement quand les colonnes JSON `positionSamples` et `trajectorySegments` contiennent des milliers d'entrées. Ce crash bypass tous les handlers JS (`uncaughtException`, `unhandledRejection`) — d'où le silence total.

- `--max-old-space-size` ne résout pas le problème (le crash est dans la heap Rust, pas JS)
- Pour un match de 30 min / 100 joueurs, le parser génère jusqu'à ~18 000 `positionSamples` (100 joueurs × 180 échantillons à 10s)

**Correctifs appliqués :**

1. **Échantillonnage adaptatif** selon la taille du fichier — voir [section 6](#6-échantillonnage-adaptatif-des-positions)
2. **Cap de sécurité** : `capParsedSnapshotForDb` plafonne à 2000 entrées pour `positionSamples` et `trajectorySegments` (garde-fou si l'échantillonnage adaptatif n'est pas suffisant)
3. **Heap worker augmentée** : `--max-old-space-size=2048` (était 512)
4. **Bouton "Annuler jobs bloqués"** dans l'UI (annule tous les jobs `running` immédiatement)

---

### Bug 3 — Jobs bloqués en `running` après crash

**Symptôme :** après un crash worker, le job reste en `running`. Si le worker est relancé dans les 10 premières minutes, `recoverStuckTelemetryResyncJobs` ne le récupère pas encore. Si relancé après 10 min, il est remis en `queued` → crash à nouveau → boucle infinie.

**Solution immédiate :** utiliser le bouton **"Annuler jobs bloqués"** sur la page session (`/clans/[id]/telemetry/matches/session/[date]`, cadre "Mode File (Queue) Resync") — annule instantanément tous les jobs `running`, les passe en `failed`. Puis relancer le worker.

---

## 6. Échantillonnage adaptatif des positions

### Principe

Le parser `parseTelemetrySnapshotFromStream` accepte un paramètre `minPositionSampleIntervalSeconds` qui contrôle l'intervalle minimal entre deux échantillons de position pour un même joueur.

Un intervalle plus grand = moins d'entrées dans `positionSamples` et `trajectorySegments` = moins de données à stocker en DB.

Les fichiers capturés sur disque ne sont **pas modifiés** — l'intervalle s'applique uniquement à la construction du snapshot DB.

### Grille automatique selon taille de fichier

Calculée dans `resolvePositionSampleInterval` (`resync-files.ts`) :

| Taille fichier | Intervalle | Samples max (100j × 30 min) |
|---|---|---|
| < 5 Mo | 10 s | ~18 000 |
| 5–15 Mo | 20 s | ~9 000 |
| ≥ 15 Mo | 30 s | ~6 000 |

### Override manuel (`.env`)

```env
TELEMETRY_POSITION_SAMPLE_INTERVAL_SECONDS=30
```

Accepte une valeur entre 5 et 300 secondes. Si défini, remplace la grille automatique pour tous les fichiers.

### Cap de sécurité DB (garde-fou)

Indépendamment de l'intervalle, `capParsedSnapshotForDb` (`manual-sync.ts`) plafonne toujours :
- `positionSamples` → max 2000 entrées (sub-sampling régulier si dépassé)
- `trajectorySegments` → max 2000 entrées

Le log `[TelemetrySync] capped arrays for DB` indique quand ce cap a été appliqué.

---

## 7. Interface UI — page session

### Accès

```
/clans/[clanId]/telemetry/matches/session/[date]?period=week
```

### Sections

**Liste des matchs** — sélection des matchs à synchroniser, badges de statut télémétrie, indicateur de présence des fichiers capturés.

**Récupération télémétrie manuelle** — trois cartes de mode (Direct Sync / Capture seule / Queue Resync). Sélectionner un mode affiche le panneau de contrôle correspondant.

**Mode File (Queue) Resync** — contient :
- Bouton **"Mettre en file"** → enqueue les matchs sélectionnés
- Bouton **"Resync immédiat"** → traitement synchrone depuis les fichiers capturés
- Options : "Réinitialiser DB avant resync", "Forcer le resync même si déjà Parser OK"
- Bloc **"Etat de la file en direct"** (refresh auto 5s) :
  - Restants / En attente / En cours / Succès / Echecs / Total
  - Liste des jobs récents
  - Bouton **"Annuler jobs bloqués"** → `POST /queue-cleanup { action: "cancel-old", cancelMaxAgeMs: 1 }` → annule tous les jobs `running`

**Bouton danger "Effacer télémétrie"** — supprime les fichiers capturés ET les données DB pour la sélection.

### Compteurs file en temps réel

- **Restants** = En attente + En cours
- **En attente** = jobs `queued`
- **En cours** = jobs `running` (1 maximum en temps normal)

---

## 8. Dashboard et monitoring

### Dashboard

```
/clans/[clanId]/telemetry/dashboard
```

Affiche :
- Statut de la file (queued / running / success / failed)
- Taux de succès
- Pression mémoire worker
- Actions rapides : cleanup stale, reorder priorité, cancel running

### Page erreurs

```
/clans/[clanId]/telemetry/errors
```

Browse les jobs `failed`, filtrage par période, retry manuel.

### API queue-cleanup — actions disponibles

```bash
# Annuler les jobs bloqués en "running"
POST /api/clans/{id}/telemetry/queue-cleanup
{ "action": "cancel-old", "cancelMaxAgeMs": 600000 }   # ms depuis startedAt

# Supprimer les jobs "queued" depuis > N heures
{ "action": "cleanup-stale", "maxAgeHours": 24 }

# Supprimer les jobs "failed" plus vieux que N heures
{ "action": "cleanup-failed", "maxAgeHours": 1 }

# Réordonner la file par priorité (matchs récents en premier)
{ "action": "reorder-priority" }
```

### Métriques

```bash
# JSON
GET /api/clans/{id}/telemetry/metrics

# Prometheus
GET /api/clans/{id}/telemetry/metrics?format=prometheus
```

---

## 9. Variables d'environnement

### Worker

| Variable | Défaut | Description |
|---|---|---|
| `TELEMETRY_RESYNC_WORKER_POLL_MS` | `2000` | Délai entre deux polls si queue vide |
| `TELEMETRY_RESYNC_WORKER_ID` | `pid-{PID}` | Identifiant du worker (utile multi-workers) |
| `TELEMETRY_WORKER_GC_ENABLED` | `false` | Forcer GC après chaque job (`--expose-gc` requis) |
| `TELEMETRY_WORKER_MEMORY_THRESHOLD_PCT` | `80` | Seuil haute pression mémoire |
| `TELEMETRY_WORKER_MEMORY_CRITICAL_PCT` | `95` | Seuil critique mémoire |

### Capture et parsing

| Variable | Défaut | Description |
|---|---|---|
| `TELEMETRY_CAPTURE_FIXTURES` | `true` | Activer la capture locale |
| `TELEMETRY_CAPTURE_FIXTURES_DIR` | `.telemetry-captured` | Répertoire des fichiers capturés |
| `TELEMETRY_CAPTURE_MAX_BYTES` | `250 * 1024 * 1024` | Taille max d'un fichier capturé |
| `TELEMETRY_FETCH_TIMEOUT_MS` | `30000` | Timeout requête API PUBG |
| `TELEMETRY_MAX_ASSET_SIZE_MB` | `250` | Taille max d'asset téléchargé |
| `TELEMETRY_PARSER_VERSION` | `v1` | Version du parser (stockée en DB) |

### Échantillonnage et clustering spatial

| Variable | Défaut | Description |
|---|---|---|
| `TELEMETRY_POSITION_SAMPLE_INTERVAL_SECONDS` | auto | Override de l'intervalle d'échantillonnage positions (5–300). Si absent, grille automatique par taille de fichier |
| `TELEMETRY_SHOT_CLUSTER_RADIUS_METERS` | `50` | Rayon de regroupement spatial des tirs (`shotSamples`). Points dans la même cellule de N×N mètres → centroïde. Valeur en mètres (1–1000) |
| `TELEMETRY_DAMAGE_CLUSTER_RADIUS_METERS` | `30` | Rayon de regroupement spatial des dégâts (`damageSamples`). Même principe que les tirs. Valeur en mètres (1–1000) |

---

## 10. Commandes de référence

### Worker

```bash
npm run telemetry:worker           # boucle infinie, polling 2s
npm run telemetry:worker:once      # traite les jobs en attente puis exit
npm run telemetry:worker:gc        # idem once, avec --expose-gc
npm run telemetry:worker:monitored # boucle infinie, avec --expose-gc
```

### Batch CLI

```bash
# Enqueue les matchs récents d'un clan
npm run telemetry:batch -- --clan 1

# Enqueue TOUS les matchs d'un clan (y compris anciens)
npm run telemetry:batch -- --clan 1 --all-matches

# Enqueue tous les clans
npm run telemetry:batch -- --all-clans

# Recalculer les agrégats sans resync
npm run telemetry:batch -- --clan 1 --recalc-aggregates-only

# Voir l'état de la file
npm run telemetry:batch -- --check --clan 1

# Voir les jobs en dead letter
npm run telemetry:batch -- --dead-letter --clan 1

# Relancer un job depuis dead letter
npm run telemetry:batch -- --retry-dead-letter <jobId> --clan 1
```

### Curl utiles

```bash
# Statut de la file
curl http://localhost:3000/api/clans/1/telemetry/sync-batch-manual

# Annuler les jobs running (tous)
curl -X POST http://localhost:3000/api/clans/1/telemetry/queue-cleanup \
  -H "Content-Type: application/json" \
  -d '{"action":"cancel-old","cancelMaxAgeMs":1}'

# Nettoyage stale (queued > 24h)
curl -X POST http://localhost:3000/api/clans/1/telemetry/queue-cleanup \
  -H "Content-Type: application/json" \
  -d '{"action":"cleanup-stale","maxAgeHours":24}'

# Métriques Prometheus
curl 'http://localhost:3000/api/clans/1/telemetry/metrics?format=prometheus'
```

---

## 11. Troubleshooting

### Worker crash silencieux (exit immédiat après "job claimed")

**Diagnostic :** regarder les logs de progression ajoutés dans le worker :
```
step reset-db      → crash ici = problème Prisma sur DELETE
step resync-start  → crash ici = crash pendant parsing ou upsert Prisma
step resync-done   → crash ici = crash pendant recalcul agrégats
```

Si aucun log de progression n'apparaît → crash pendant le `deleteMany` (rare, connexion DB ?).

**Causes possibles et solutions :**

| Cause | Solution |
|---|---|
| Fichier ≥ 10 Mo, Prisma Rust OOM | Échantillonnage adaptatif (auto) + cap 2000 |
| Bug `Readable.toWeb()` | Adaptateur custom déjà en place |
| Fichier corrompu | Supprimer le fichier `.telemetry-captured/` correspondant et re-capturer |

### Boucle infinie crash → recovery → crash

**Symptôme :** chaque démarrage du worker crashe sur le même match.

**Solution :**
1. Cliquer **"Annuler jobs bloqués"** dans l'UI (page session, cadre Queue Resync)
2. Le job passe de `running` à `failed`
3. Relancer le worker — il skip les jobs `failed`

Si le bouton UI n'est pas accessible :
```bash
curl -X POST http://localhost:3000/api/clans/1/telemetry/queue-cleanup \
  -H "Content-Type: application/json" \
  -d '{"action":"cancel-old","cancelMaxAgeMs":1}'
```

### Worker ne démarre pas / ne claim pas de jobs

```bash
# Vérifier qu'il y a des jobs en attente
curl http://localhost:3000/api/clans/1/telemetry/sync-batch-manual
# → "queued": 0 → rien à traiter, comportement normal

# Vérifier les jobs bloqués en "running" (pas repris avant 10 min)
SELECT status, COUNT(*) FROM CronExecution 
WHERE action='telemetry_resync_file' GROUP BY status;
```

### "Captured telemetry file is missing"

Fichier non capturé. Workflow correct :
1. D'abord : mode **Capture seule** → télécharge les fichiers
2. Ensuite : mode **Queue Resync** → traite les fichiers

### Agrégats incohérents après resync

```bash
npm run telemetry:batch -- --clan 1 --recalc-aggregates-only
```

### Espace disque saturé par `.telemetry-captured/`

```bash
# Voir la taille totale
du -sh .telemetry-captured/

# Supprimer les fichiers > 30 jours
find .telemetry-captured -mtime +30 -delete
```

### Statut `running` qui ne disparaît jamais

Job bloqué. Soit :
- Worker crashé en milieu de traitement
- Worker arrêté manuellement

→ Utiliser le bouton **"Annuler jobs bloqués"** ou attendre 10 min que `recoverStuckTelemetryResyncJobs` le requeue au prochain démarrage worker.
