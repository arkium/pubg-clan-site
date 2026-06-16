# Interface de Récupération Télémétrie - Guide d'utilisation

## Aperçu de l'interface refactorisée

L'interface `/clans/{id}/telemetry/sync-batch-manual` propose maintenant une expérience en 4 étapes avec choix de mode clairement visible.

### Structure générale

```
┌─────────────────────────────────────────────────────────────────┐
│  Télémétrie - Récupération manuelle                             │
│  Trois modes: Direct (simple), Capture (sauvegarde), Queue...   │
└─────────────────────────────────────────────────────────────────┘

┌─ ÉTAPE 1: Sélectionner les matches ─────────────────────────────┐
│                                                                  │
│  [Input MatchID ________] [Ajouter]                             │
│                                                                  │
│  ✓ 5 match(s) sélectionnés  [Vider la sélection]               │
│  • match-id-1                                          [✕]      │
│  • match-id-2                                          [✕]      │
│  • match-id-3                                          [✕]      │
│  • match-id-4                                          [✕]      │
│  • match-id-5                                          [✕]      │
└─────────────────────────────────────────────────────────────────┘

┌─ ÉTAPE 2: Choisir le mode de récupération ──────────────────────┐
│                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────┐│
│  │ ⚡ DIRECT SYNC      │  │ 📁 CAPTURE SEULE    │  │ 🔄 QUEUE │
│  │ [Rapide]            │  │ [Stockage]          │  │ RESYNC   │
│  │                     │  │                     │  │[Worker]  │
│  │ Télécharge,         │  │ Télécharge et       │  │          │
│  │ capture et traite   │  │ sauvegarde local    │  │ Traite   │
│  │ en une seule op.    │  │ (sans traitement)   │  │ les fich. │
│  │                     │  │                     │  │ capturés  │
│  │ ✓ Résultat immédiat │  │ ✓ Non-bloquant      │  │✓ Non-bloc │
│  │ ✓ Pas de fichiers   │  │ ✓ Fichiers conserv. │  │✓ Scalable │
│  │ ⚠ Peut timeout      │  │ ✓ Rejouable         │  │✓ Monitoring
│  │                     │  │                     │  │          │
│  │ Reco: <50 matches   │  │ Étape 1 de Queue    │  │Besoin fic.
│  │                     │  │ Reco: 50-1000       │  │Reco: 100+ │
│  │ ► DIRECT SYNC       │  │ ► CAPTURER FICHIERS │  │►ENQUEUE R │
│  └─────────────────────┘  └─────────────────────┘  └──────────┘
│   ↑ Sélectionné                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─ ÉTAPE 3: Options ──────────────────────────────────────────────┐
│                                                                  │
│  ☐ Réinitialiser télémétrie avant traitement                   │
│  ☑ Recalculer agrégats après traitement                        │
│                                                                  │
│  Les fichiers seront sauvegardés dans .telemetry-captured/     │
└─────────────────────────────────────────────────────────────────┘

┌─ ÉTAPE 4: Exécuter ─────────────────────────────────────────────┐
│                                                                  │
│  [DIRECT SYNC] [Vérifier statut]                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─ RÉSULTAT (après exécution) ────────────────────────────────────┐
│ ✓ Résultat:                                                      │
│ {                                                                │
│   "successCount": 5,                                            │
│   "failedCount": 0,                                             │
│   "results": [                                                  │
│     {                                                           │
│       "squadMatchId": "match-id-1",                             │
│       "status": "success",                                      │
│       "positionSamples": 245,                                   │
│       "trajectorySegments": 48                                  │
│     }                                                           │
│   ]                                                             │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘

┌─ INFO CLI ──────────────────────────────────────────────────────┐
│ 💡 Mode CLI (alternative)                                       │
│ Traite tout en une seule commande:                             │
│                                                                  │
│ npm run telemetry:batch -- --clan 1 --all-matches              │
│ npm run telemetry:batch -- --check                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Flux utilisateur par scénario

### Scénario 1: Tester rapidement (3-5 matches)

```
1. Navigue vers /clans/1/telemetry/sync-batch-manual
2. Ajoute 3-5 match IDs
3. Sélectionne "Direct Sync" (vert)
4. Clique "Direct Sync"
5. Attends 15-25 secondes
6. Voir le résultat

⏱️ Temps total: ~30 secondes
📊 Données: Immédiatement visibles
```

### Scénario 2: Sauvegarder les fichiers (50-100 matches)

```
JOUR 1:
1. Navigue vers /clans/1/telemetry/sync-batch-manual
2. Ajoute 50-100 match IDs
3. Sélectionne "Capture seule" (bleu)
4. Clique "Capturer fichiers"
5. Attend 2-5 minutes
6. Vérifier: ls -la .telemetry-captured | grep "id-1\|id-2"

JOUR 2 (Quand ready pour traiter):
1. Retourner à /clans/1/telemetry/sync-batch-manual
2. Ajouter les mêmes match IDs (ou subset)
3. Sélectionner "Queue Resync" (violet)
4. Clique "Enqueue Resync"
5. Terminal: npm run telemetry:worker
6. Monitor: http://localhost:3000/clans/1/telemetry/dashboard

⏱️ Capture: 2-5 minutes (non-bloquant)
⏱️ Resync: Dépend du worker, ~30 secondes par match
💾 Fichiers: Conservés pour rejouer anytime
```

### Scénario 3: Production scale (1000+ matches)

```
JOUR 1 - CAPTURE (Batch 1: 500 matches):
1. Sélectionne matches 1-500
2. Mode: Capture seule
3. Click et attends (batch tourne en bg)

JOUR 2 - RESYNC (Batch 1):
1. Sélectionne matches 1-500
2. Mode: Queue Resync
3. Enqueue et lance worker
4. Monitor via dashboard

JOUR 3 - CAPTURE (Batch 2: 500+ matches):
1. Pendant que worker traite batch 1
2. Capture batch 2 en parallèle
3. Dashboard montre progress en temps réel

🎯 Avantages:
✅ Non-bloquant (chaque étape)
✅ Parallélisable (capture pendant resync)
✅ Recoverable (fichiers sauvegardés)
✅ Observable (dashboard + metrics)
✅ Scalable (worker peut être distribué)
```

---

## Indicateurs visuels

### Badges de mode

```
⚡ RAPIDE      → Direct Sync: Résultat immédiat
📁 STOCKAGE    → Capture seule: Fichiers sauvegardés
🔄 WORKER      → Queue Resync: Asynchrone
```

### États des boutons

```
[Actif]           → Cliquable, résultat attendu
[Disabled]        → Grisé, non-cliquable
[Traitement...]   → En cours, attendre
[✓ Résultat]      → Succès, voir le JSON
[❌ Erreur]       → Échec, corriger et réessayer
```

### Couleurs

```
🟢 Verde     → Direct Sync (rapide, simple)
🔵 Bleu      → Capture seule (stockage)
🟣 Violet    → Queue Resync (worker)
🔴 Rouge     → Erreur (action requise)
🟠 Orange    → Avertissement (info utile)
```

---

## Cas d'usage recommandés

### ✅ Direct Sync pour:
- ✓ Développement/test
- ✓ Vérifier que tout fonctionne
- ✓ Petits batches (<50)
- ✓ Démo rapide

### ✅ Capture seule pour:
- ✓ Archivage des données
- ✓ Étape 1 du workflow production
- ✓ Debugging (analyser les JSON)
- ✓ Rejouer des données anytime

### ✅ Queue Resync pour:
- ✓ Production (non-bloquant)
- ✓ Gros batches (100+)
- ✓ Monitoring requis
- ✓ Reprise auto en cas de crash

---

## Troubleshooting visuel

```
Je suis ici: [Mode choisi]
Mais j'ai une erreur?

┌─ "Captured telemetry file is missing"
│  └─ Solution: D'abord "Capture seule"
│                Puis "Queue Resync"
│
├─ "Request timeout"
│  └─ Solution: Réduis le batch
│                Ou utilise "Capture seule"
│
├─ "Disk space full"
│  └─ Solution: Nettoie les vieux fichiers
│                find .telemetry-captured -mtime +30 -delete
│
└─ "Worker ne traite pas"
   └─ Solution: Lance le worker
                npm run telemetry:worker
```

---

## Commandes rapides

```bash
# Tester un petit batch (Direct Sync via CLI)
npm run telemetry:batch -- --clan 1 --all-matches

# Vérifier le statut des jobs
npm run telemetry:batch -- --check

# Voir les fichiers capturés
ls -lah .telemetry-captured/

# Nettoyer les vieux fichiers
find .telemetry-captured -mtime +30 -delete

# Lancer le worker
npm run telemetry:worker

# Worker une seule fois
npm run telemetry:worker:once

# Monitor le dashboard
open http://localhost:3000/clans/1/telemetry/dashboard
```

---

## Prochaines étapes

1. **Choisis ton mode** basé sur le tableau de décision
2. **Teste avec 5 matches** (quelque soit le mode)
3. **Monitor via le dashboard** si Queue mode
4. **Automatise** avec cron ou CI/CD
5. **Documente** les patterns pour ton équipe

📖 Lire aussi:
- [TELEMETRY_SYNC_MODES.md](TELEMETRY_SYNC_MODES.md) - Comparaison détaillée
- [TELEMETRY_CAPTURE_AND_RESYNC_WORKFLOW.md](TELEMETRY_CAPTURE_AND_RESYNC_WORKFLOW.md) - Workflow deux phases
- [TELEMETRY_PHASE3_GUIDE.md](TELEMETRY_PHASE3_GUIDE.md) - Dashboard & monitoring
