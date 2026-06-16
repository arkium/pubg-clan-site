# Télémétrie: Trois modes de récupération

## Vue d'ensemble

L'interface de récupération télémétrie manuelle propose **trois modes** pour adapter la récupération à vos besoins. Chaque mode a ses avantages et cas d'usage spécifiques.

### Comparaison rapide

| Aspect | Direct Sync | Capture seule | Queue Resync |
|--------|-------------|---------------|-------------|
| **Endpoint** | `/api/clans/{id}/telemetry/sync-selected` | `/api/clans/{id}/telemetry/fetch-files-selected` | `/api/clans/{id}/telemetry/sync-batch-manual` |
| **Bloquant** | ✅ Oui | ❌ Non | ❌ Non |
| **Temps réponse** | ~2-5s/match | ~1-3s/match | Immédiat (files queued) |
| **Prérequis** | Aucun | Aucun | Fichiers capturés |
| **Résultat** | Immédiat | Fichiers sauvegardés | Jobs en queue |
| **Fichiers locaux** | ❌ Aucun | ✅ Sauvegardés | ✅ Réutilisables |
| **Scalabilité** | <50 matches | Unlimited | Unlimited |
| **Complexité** | Simple | 2 étapes | 3 étapes |

---

## Mode 1: Direct Sync ⚡ (Recommandé pour tester)

### Description
Télécharge les données depuis PUBG API, les capture localement **ET** les traite immédiatement en une seule opération.

### Flux
```
PUBG API 
   ↓
Téléchargement
   ↓
Capture locale (.telemetry-captured/)
   ↓
Parsing et stockage DB
   ↓
Recalcul des agrégats
   ↓
Résultat immédiat
```

### Quand l'utiliser
✅ **Bon pour:**
- Tester avec un petit nombre de matches (<50)
- Vérifier que les données arrivent correctement
- Développement/debugging
- Démonstration rapide
- Données non-critiques

❌ **À éviter:**
- Batches >50 matches (peut timeout)
- Données volumineuses (risque OOM)
- Production pour gros volumes

### Exemple d'utilisation

**Via UI:**
1. Navigue vers `/clans/{id}/telemetry/sync-batch-manual`
2. Ajoute 5-10 match IDs
3. Sélectionne l'onglet "Direct Sync" (vert)
4. Configure les options (reset/recalc)
5. Clique "Direct Sync"
6. Attends le résultat (2-5 secondes par match)

**Via API:**
```bash
curl -X POST http://localhost:3000/api/clans/1/telemetry/sync-selected \
  -H "Content-Type: application/json" \
  -d '{
    "squadMatchIds": ["id1", "id2", "id3"],
    "recalculateAggregates": true
  }'

# Réponse immédiate avec détails:
# {
#   "successCount": 3,
#   "failedCount": 0,
#   "results": [{ status: "success", positionSamples: 245 }]
# }
```

### Avantages
- ✅ Une seule étape
- ✅ Résultat immédiat (pas d'attente)
- ✅ Simple et intuitif
- ✅ Aucun fichier local à gérer
- ✅ Parfait pour la démo

### Inconvénients
- ❌ Requête peut timeout si gros batch
- ❌ Perte de données si réseau interrompu
- ❌ Pas de fichiers sauvegardés pour rejouer
- ❌ Non-scalable pour production

### Options disponibles
- **Réinitialiser avant**: Efface les données existantes avant sync
- **Recalculer agrégats**: Rebuild les stats après sync (recommandé: ON)

---

## Mode 2: Capture seule 📁 (Recommandé pour sauvegarder)

### Description
Télécharge les données depuis PUBG API et les sauvegarde localement **SANS** les traiter. Les fichiers sont conservés pour un traitement ultérieur.

### Flux
```
PUBG API
   ↓
Téléchargement
   ↓
Capture locale (.telemetry-captured/)
   ✓ ARRÊT ICI
   
(Traitement séparé + tard avec mode Queue)
```

### Quand l'utiliser
✅ **Bon pour:**
- Sauvegarder les données brutes pour archivage
- Traitement en deux étapes (capture → resync)
- Données volumineuses (pas de timeout)
- Rejouer les captures anytime
- Debugging (analyser les fichiers JSON)
- Workflow asynchrone

❌ **À éviter:**
- Quand tu veux le résultat immédiatement
- Données qui ne valent pas la peine d'être sauvegardées

### Exemple d'utilisation

**Via UI:**
1. Navigue vers `/clans/{id}/telemetry/sync-batch-manual`
2. Ajoute les match IDs
3. Sélectionne l'onglet "Capture seule" (bleu)
4. Clique "Capturer fichiers"
5. Attend la capture (1-3 sec/match, non-bloquant)
6. **Plus tard:** Utilise le mode "Queue Resync" pour traiter

**Via API:**
```bash
# Étape 1: Capturer les fichiers
curl -X POST http://localhost:3000/api/clans/1/telemetry/fetch-files-selected \
  -H "Content-Type: application/json" \
  -d '{"squadMatchIds": ["id1", "id2", "id3"]}'

# Réponse immédiate:
# {
#   "captureDirectory": ".telemetry-captured",
#   "capturedCount": 3,
#   "results": [{ 
#     "squadMatchId": "id1",
#     "captureFilePath": ".telemetry-captured/pubg-id1.json",
#     "bytesRead": 2048576
#   }]
# }

# Vérifier les fichiers sauvegardés
ls -lah .telemetry-captured/ | grep "id1\|id2\|id3"

# Étape 2 (plus tard): Resync avec le mode Queue
```

### Avantages
- ✅ Non-bloquant (retour immédiat)
- ✅ Fichiers sauvegardés localement
- ✅ Rejouable anytime
- ✅ Parfait pour archivage/backup
- ✅ Utile pour debugging
- ✅ Scalable (pas de limite)

### Inconvénients
- ❌ Deux étapes requises (capture + resync)
- ❌ Fichiers consomment de l'espace disque
- ❌ Données pas traitées tout de suite
- ❌ Besoin de nettoyer les fichiers régulièrement

### Options disponibles
Aucune (juste capture, sans traitement)

### Gestion des fichiers

**Emplacement:** `.telemetry-captured/` (ou `$TELEMETRY_CAPTURE_FIXTURES_DIR`)

**Taille par défaut:** Max 250 MB par fichier (configurable via `TELEMETRY_CAPTURE_MAX_BYTES_MB`)

**Nommage:** `{prefix}-{squadMatchId}.json`

**Nettoyage (optionnel):**
```bash
# Voir l'utilisation disque
du -sh .telemetry-captured/

# Supprimer les fichiers capturés >30 jours
find .telemetry-captured -mtime +30 -delete
```

---

## Mode 3: Queue Resync 🔄 (Recommandé pour production)

### Description
Enqueue les jobs dans une **file d'attente persistante** pour traitement asynchrone par un worker. Idéal pour gros volumes et production.

### Flux
```
Matches sélectionnés
   ↓
Vérifier fichiers capturés
   ↓
Enqueue jobs (CronExecution table)
   ↓
RETOUR IMMÉDIAT (requête terminée)
   
(Worker traite en arrière-plan)
   ↓
Parsing + Stockage DB
   ↓
Récalcul agrégats
   ↓
Jobs marqués success/failed
```

### Prérequis
**Important:** Les fichiers doivent déjà exister dans `.telemetry-captured/`

**Deux options pour les obtenir:**
1. **Option A:** Utilise d'abord "Capture seule" pour télécharger les fichiers
2. **Option B:** Utilise le CLI qui fait tout automatiquement

### Quand l'utiliser
✅ **Bon pour:**
- Production (non-bloquant)
- Gros batches (100+ matches)
- Données volumineuses
- Processing asynchrone
- Scaling horizontal (plusieurs workers)
- Monitoring via dashboard

❌ **À éviter:**
- Quand tu veux le résultat immédiatement
- Fichiers pas encore capturés (sauf utiliser Capture seule d'abord)

### Exemple d'utilisation

**Workflow complet (Mode Capture seule → Mode Queue Resync):**

```bash
# Étape 1: Capturer les fichiers (mode "Capture seule")
curl -X POST http://localhost:3000/api/clans/1/telemetry/fetch-files-selected \
  -H "Content-Type: application/json" \
  -d '{"squadMatchIds": ["id1", "id2", "id3"]}'

# Output: capturedCount: 3 ✓

# Étape 2: Enqueue les jobs pour resync (mode "Queue Resync")
curl -X POST http://localhost:3000/api/clans/1/telemetry/sync-batch-manual \
  -H "Content-Type: application/json" \
  -d '{
    "squadMatchIds": ["id1", "id2", "id3"],
    "resetBeforeSync": false,
    "recalculateAggregates": true
  }'

# Output: Jobs queued ✓

# Étape 3: Lancer le worker pour traiter
npm run telemetry:worker

# Ou une seule fois:
npm run telemetry:worker:once

# Étape 4: Vérifier les résultats
curl http://localhost:3000/api/clans/1/telemetry/sync-batch-manual
# Shows: successCount, failedCount, queue stats
```

**Via UI:**
1. **Étape 1 (Capture):** 
   - Sélectionne l'onglet "Capture seule" 
   - Clique "Capturer fichiers"
   - Attends confirmation

2. **Étape 2 (Queue Resync):**
   - Sélectionne l'onglet "Queue Resync"
   - Configure options (reset/recalc)
   - Clique "Enqueue Resync"

3. **Étape 3 (Worker):**
   - Terminal: `npm run telemetry:worker`
   - Ou monitore via dashboard `/clans/{id}/telemetry/dashboard`

### Avantages
- ✅ Non-bloquant (requête returns immédiatement)
- ✅ Scalable (pas de limite)
- ✅ Production-ready
- ✅ Reprise automatique si crash
- ✅ Monitoring via dashboard
- ✅ Queue management avec priorités
- ✅ Dead letter queue pour erreurs

### Inconvénients
- ❌ Trois étapes (Capture → Queue → Worker)
- ❌ Données pas traitées instantanément
- ❌ Complexité opérationnelle
- ❌ Besoin de worker qui tourne

### Options disponibles
- **Réinitialiser avant**: Efface les données existantes
- **Recalculer agrégats**: Rebuild les stats après resync

### Monitoring

**Via Web Dashboard:**
```
http://localhost:3000/clans/{clanId}/telemetry/dashboard
```

Affiche:
- Jobs en queue / running / success / failed
- Success rate gauge
- Memory pressure indicator
- Worker health metrics
- Quick actions: cleanup, priority reorder

**Via API:**
```bash
# Statut du queue
curl http://localhost:3000/api/clans/1/telemetry/sync-batch-manual

# Metriques Prometheus
curl http://localhost:3000/api/clans/1/telemetry/metrics?format=prometheus

# Erreurs récentes
curl http://localhost:3000/clans/1/telemetry/errors
```

**Via CLI:**
```bash
npm run telemetry:batch -- --check
```

---

## Mode CLI: Tout automatisé 🤖

Le CLI combine tous les modes en une seule commande:

```bash
npm run telemetry:batch -- --clan 1 --all-matches
```

**Ce qu'il fait:**
1. ✅ Capture tous les matches depuis PUBG API
2. ✅ Enqueue les jobs pour resync
3. ✅ Lance le worker
4. ✅ Recalcule les agrégats
5. ✅ Affiche les stats finales

**Parfait pour:**
- Setup initial
- Synchronisation complète
- Automatisation

---

## Choisir le bon mode: Guide de décision

```
Quel est ton besoin?

┌─ Je veux TESTER rapidement
│  └─ → Direct Sync ✅
│     (5-10 matches, résultat immédiat)
│
├─ Je veux SAUVEGARDER les fichiers
│  └─ → Capture seule ✅
│     (Étape 1 du workflow production)
│
├─ Je veux PRODUCTION non-bloquant
│  └─ → Queue Resync ✅
│     (Utilise Capture seule en premier)
│
└─ Je veux TOUT en une commande
   └─ → CLI (telemetry:batch) ✅
      (Automatise tout)
```

### Décision rapide par volume

| Nombre de matches | Mode recommandé | Raison |
|-------------------|-----------------|--------|
| 1-10 | Direct Sync | Rapide, simple, résultat immédiat |
| 10-50 | Direct Sync | Toujours rapide |
| 50-100 | Capture seule → Queue | Évite timeout, plus fiable |
| 100+ | Queue Resync | Indispensable pour scaling |
| Illimité | CLI automation | Gère tout automatiquement |

---

## Problèmes courants

### ❌ "Captured telemetry file is missing"

**Cause:** Fichiers pas capturés avant de lancer Queue Resync

**Solution:** 
1. Utilise d'abord le mode "Capture seule"
2. Puis utilise le mode "Queue Resync"

### ❌ "Request timeout"

**Cause:** Direct Sync avec trop de matches

**Solution:**
1. Réduis le batch (<50 matches)
2. Ou utilise Capture seule → Queue Resync

### ❌ "Disk space full"

**Cause:** Fichiers capturés consomment trop d'espace

**Solution:**
```bash
# Nettoyer les fichiers >30 jours
find .telemetry-captured -mtime +30 -delete

# Ou configuration:
TELEMETRY_CAPTURE_MAX_BYTES_MB=100  # Réduire la limite
```

### ❌ Worker ne traite pas

**Cause:** Worker n'est pas lancé

**Solution:**
```bash
# Terminal séparé:
npm run telemetry:worker

# Ou une seule fois:
npm run telemetry:worker:once
```

---

## Configuration

### Variables d'environnement

```bash
# Activer la capture localement
TELEMETRY_CAPTURE_FIXTURES=true

# Dossier de sauvegarde (défaut: .telemetry-captured)
TELEMETRY_CAPTURE_FIXTURES_DIR=.telemetry-captured

# Taille max par fichier (MB, défaut: 250)
TELEMETRY_CAPTURE_MAX_BYTES_MB=250

# Timeout pour API PUBG (ms, défaut: 30000)
TELEMETRY_FETCH_TIMEOUT_MS=30000

# Taille max d'asset à télécharger (MB, défaut: 250)
TELEMETRY_MAX_ASSET_SIZE_MB=250

# Worker: Activer GC après jobs
TELEMETRY_WORKER_GC_ENABLED=true

# Worker: Seuil mémoire haute pression (%, défaut: 80)
TELEMETRY_WORKER_MEMORY_THRESHOLD_PCT=80

# Worker: Seuil mémoire critique (%, défaut: 95)
TELEMETRY_WORKER_MEMORY_CRITICAL_PCT=95
```

---

## Résumé des endpoints

### Direct Sync
```
POST /api/clans/{clanId}/telemetry/sync-selected
Body: { squadMatchIds: [...], recalculateAggregates?: boolean }
Returns: { successCount, failedCount, results: [] }
Timing: 2-5s/match (bloquant)
```

### Capture seule
```
POST /api/clans/{clanId}/telemetry/fetch-files-selected
Body: { squadMatchIds: [...] }
Returns: { captureDirectory, capturedCount, results: [] }
Timing: 1-3s/match (immédiat)
```

### Queue Resync
```
POST /api/clans/{clanId}/telemetry/sync-batch-manual
Body: { squadMatchIds: [...], resetBeforeSync?: boolean, recalculateAggregates?: boolean }
Returns: { queued: N, queueStatus: {...} }
Timing: Immédiat (worker traite)
```

### Vérifier statut
```
GET /api/clans/{clanId}/telemetry/sync-batch-manual
Returns: { queued: N, running: N, success: N, failed: N }
```

---

## Prochaines étapes

1. **Choisis ton mode** basé sur tes besoins
2. **Teste avec un petit batch** (5-10 matches)
3. **Monitor via dashboard** si Queue mode
4. **Automatise** avec CLI ou cron job

Pour plus de détails:
- 📖 [Capture & Resync Workflow](TELEMETRY_CAPTURE_AND_RESYNC_WORKFLOW.md)
- 📊 [Dashboard & Monitoring](TELEMETRY_PHASE3_GUIDE.md)
- 🔧 [Configuration & Troubleshooting](TELEMETRY_BATCH_README.md)
