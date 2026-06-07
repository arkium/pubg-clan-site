# Récupération télémétrie depuis la page des matchs

## Vue d'ensemble

Vous pouvez maintenant récupérer la télémétrie **directement depuis la page des matchs** (`/clans/{id}/matches/session/{date}`). Plus besoin d'aller sur une page séparée pour connaître les IDs de match!

## Flux utilisateur

### Étape 1: Visualiser les matchs
```
1. Allez sur /clans/1/matches?period=week
2. Cliquez sur la date que vous voulez (ex: 2026-05-31)
3. Vous voyez la liste de tous les matchs de cette soirée
```

### Étape 2: Sélectionner les matchs
```
4. Dans la section "Récupération télémétrie manuelle":
   - Cliquez sur les matchs individuels avec les checkboxes
   - Ou utilisez "Tout sélectionner" pour tous
   - Le compteur affiche: "N match(s) sélectionné(s)"
```

### Étape 3: Choisir le mode
```
5. Choisissez l'un des 3 modes:
   ⚡ Direct Sync      → Rapide, résultat immédiat (<50 matchs)
   📁 Capture seule    → Sauvegarde locale (50-1000 matchs)
   🔄 Queue Resync     → Asynchrone worker (100+ matchs)
```

### Étape 4: Exécuter et voir le résultat
```
6. Le mode se reconfigure avec:
   - Description du mode
   - Boutons d'action appropriés
   - Options contextuelles (reset, forcé, etc.)
   
7. Cliquez sur le bouton d'action
   - Voir la progression en temps réel
   - Messages de succès/erreur
   - Logs des opérations
```

---

## Les 3 modes expliqués

### ⚡ Mode Direct Sync (Rapide)

**C'est pour qui?**
- Tester avec 5-10 matchs
- Vérifier que la télémétrie arrive
- Petits batches

**C'est quoi?**
1. Télécharge depuis PUBG API
2. Capture localement
3. Traite immédiatement
→ Résultat en 2-5 secondes par match

**Avantages:**
- Résultat immédiat
- Pas de fichiers locaux à gérer
- Simple et intuitif

**Inconvénients:**
- Requête peut bloquer
- Peut timeout si gros batch
- Pas de reprise auto

**Options:**
- ✓ "Forcer le resync" - Traiter même si déjà Parser OK

**Bouton:**
- `Direct Sync (N matchs)` - Lance l'opération
- Voir le résultat dans la section verte

---

### 📁 Mode Capture seule (Stockage)

**C'est pour qui?**
- Sauvegarder les fichiers pour plus tard
- Etape 1 du workflow production
- Gros batches

**C'est quoi?**
1. Télécharge depuis PUBG API
2. Sauvegarde dans `.telemetry-captured/`
→ Arrête là (pas de traitement)

**Avantages:**
- Non-bloquant
- Fichiers conservés à jamais
- Rejouer anytime

**Inconvénients:**
- Données pas traitées tout de suite
- Besoin de faire étape 2 (Queue Resync)

**Bouton:**
- `Capturer fichiers (N)` - Télécharge et sauvegarde
- Voir le résultat dans la section bleue

**Après:**
- Les fichiers sont prêts pour le mode "Queue Resync"

---

### 🔄 Mode Queue Resync (Worker asynchrone)

**C'est pour qui?**
- Production (non-bloquant)
- Gros batches (100+)
- Workflow scalable

**C'est quoi?**
1. Vérifie que les fichiers existent
2. Enqueue les jobs pour worker
3. Retour immédiat
4. Worker traite en arrière-plan

**Avantages:**
- Non-bloquant
- Scalable
- Reprise auto

**Inconvénients:**
- 3 étapes (capture → queue → worker)
- Besoin d'un worker qui tourne
- Pas de résultat immédiat

**Boutons:**
- `Enqueue Resync (N)` - Ajoute à la file worker
- `Resync immédiat (N)` - Traite maintenant
- Voir progression et logs en temps réel

**Options:**
- ✓ "Réinitialiser DB avant resync" - Nettoie avant de traiter

**Après:**
- Lancez le worker: `npm run telemetry:worker`
- Monitore la progression dans les logs

---

## Messages et retours

### Direct Sync (Mode ⚡)

**Succès (vert):**
```
Resync URL terminé: 5 succès, 0 échec(s), 5 match(s) traité(s).
Agrégats recalculés: 45 lignes armes membre, 12 lignes membres...
```

**Notes de capture (orange):**
```
Captures: 5 réussie(s), 0 non tentée(s), 0 en erreur.
```

**Erreurs (rouge):**
```
match-id-1: erreur de parsing JSON
match-id-2: fichier trop volumineux
```

---

### Capture seule (Mode 📁)

**Succès (bleu):**
```
Téléchargement PUBG terminé: 5 succès, 0 échec(s), 5 fichier(s) capturé(s).
```

**Message info:**
```
Ensuite: utilisez le mode "Queue Resync" pour traiter les fichiers capturés.
```

---

### Queue Resync (Mode 🔄)

**Progression (temps réel):**
```
Progression: 3/10 | ✓ 2 | ✗ 1
En cours: match-id-5
```

**Logs (derniers 20 traitements):**
```
OK match-id-1 (2.5 Mo) pos:245 traj:48 morts:3
OK match-id-2 (1.8 Mo) pos:189 traj:32 morts:2
KO match-id-3: erreur parsing
```

**Succès (vert):**
```
Resync fichiers terminé: 8 succès, 2 échec(s).
Total parsé: 12.3 Mo. Agrégats: 1 période(s), 45 lignes membre...
```

**Erreurs (rouge):**
```
match-id-4: invalid json object event
match-id-5: fichier manquant
```

---

## Statut des fichiers

Dans la colonne "Statut" de la liste des matchs:

| Statut | Signification | Action |
|--------|---------------|--------|
| ✅ OK | Télémétrie déjà traitée | Sélectionner + "Forcer resync" pour retraiter |
| 📁 Capture | Fichier capturé, pas encore traité | Sélectionner + Queue Resync pour traiter |
| ❌ Manquant | Fichier pas encore capturé | Sélectionner + Capture seule pour télécharger |
| ⚠️ Gros | Fichier trop volumineux | Impossible à traiter (>250MB) |

---

## Cas d'usage courants

### Cas 1: Je veux tester rapidement (5 matchs)

```
1. Allez à la date
2. Sélectionnez 5 matchs
3. Mode: Direct Sync ⚡
4. Cliquez "Direct Sync (5 matchs)"
5. Attendez 10-25 secondes
6. Voir le résultat

⏱️ Total: ~30 secondes
```

### Cas 2: Je veux sauvegarder et traiter plus tard (100 matchs)

```
JOUR 1:
1. Sélectionnez 100 matchs
2. Mode: Capture seule 📁
3. Cliquez "Capturer fichiers (100)"
4. Attendez 2-5 minutes

JOUR 2 (quand prêt):
5. Mode: Queue Resync 🔄
6. Sélectionnez les mêmes 100 matchs
7. Cliquez "Enqueue Resync (100)"
8. Terminal: npm run telemetry:worker
9. Monitor les logs

⏱️ Capture: 2-5 min
⏱️ Resync: ~30s par match
```

### Cas 3: Je veux traiter directement en asynchrone (500 matchs)

```
1. Mode: Queue Resync 🔄
2. Sélectionnez 500 matchs
3. Cliquez "Enqueue Resync (500)"
4. Terminal: npm run telemetry:worker
5. Attendez que le worker traite

✓ Non-bloquant
✓ Scalable
✓ Reprise auto si erreur
```

---

## Troubleshooting

### ❌ "Capturer fichiers (0)"

**Problème:** Tous les fichiers sont déjà capturés

**Solution:** 
- Les fichiers existent déjà dans `.telemetry-captured/`
- Utilisez le mode "Queue Resync" pour les traiter
- Ou supprimez les vieux fichiers: `rm -rf .telemetry-captured/*`

### ❌ "Direct Sync" timeout

**Problème:** Trop de matchs (>50) ou réseau lent

**Solution:**
1. Réduis le nombre de matchs (<50)
2. Ou utilise "Capture seule" puis "Queue Resync"

### ❌ Queue Resync bloqué

**Problème:** Jobs restent "En cours" sans avancer

**Raison:** Le worker n'est pas lancé

**Solution:**
```bash
# Dans un terminal séparé:
npm run telemetry:worker

# Ou une seule fois:
npm run telemetry:worker:once
```

### ❌ Fichiers capturés manquants

**Problème:** Mode "Queue Resync" dit "fichiers manquants"

**Raison:** 
- Jamais capturés (utiliser "Capture seule" d'abord)
- Ou supprimés après capture

**Solution:**
1. Mode "Capture seule" pour télécharger
2. Puis mode "Queue Resync" pour traiter

---

## Clavier & Navigation

### Sélection rapide
- Cliquez sur le checkbox du match
- Ou utilisez "Tout sélectionner" / "Vider sélection"

### Changer de mode
- Cliquez sur la carte du mode (Direct/Capture/Queue)
- L'interface se reconfigure automatiquement

### Voir les logs
- Mode Direct Sync: Les notes de capture s'affichent
- Mode Queue Resync: Les logs en direct + progression

---

## Limitations et sécurité

### Limites
- **Direct Sync:** Max 50 matchs avant timeout (configurable)
- **Batch safe:** Traitement par lot max 1 match à la fois (sécurité)
- **Fichiers:** Max 250 MB par capture (configurable)

### Sécurité
- ✓ Les fichiers capturés ne sont jamais supprimés automatiquement
- ✓ Les opérations de suppression demandent confirmation
- ✓ Permissions: Propriétaire du clan uniquement
- ✓ Logs complets de toutes les opérations

---

## Ressources

- 📖 [Guide complet des 3 modes](TELEMETRY_SYNC_MODES.md)
- 📊 [Guide visual interface](TELEMETRY_UI_GUIDE.md)
- 🔄 [Workflow capture & resync](TELEMETRY_CAPTURE_AND_RESYNC_WORKFLOW.md)
- 📈 [Dashboard monitoring](TELEMETRY_PHASE3_GUIDE.md)
