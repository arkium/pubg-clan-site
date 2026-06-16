# Télémétrie — Dashboard et monitoring

Ce document décrit les pages d'administration et de monitoring du pipeline télémétrie.

## Pages disponibles

| URL | Rôle requis | Description |
|-----|-------------|-------------|
| `/clans/[clanId]/telemetry/dashboard` | Owner | Métriques en temps réel de la queue |
| `/clans/[clanId]/telemetry/errors` | Owner | Liste et retry des jobs échoués |
| `/clans/[clanId]/telemetry/matches` | Owner | Liste des matchs avec statut télémétrie |
| `/clans/[clanId]/telemetry/matches/session/[date]` | Owner | Sync télémétrie depuis la vue session |
| `/clans/[clanId]/telemetry/recoveries` | Owner | Console d'observabilité avancée |
| `/clans/[clanId]/telemetry/sync-batch-manual` | Owner | Interface de sync batch manuelle |

---

## Page dashboard — `/clans/[clanId]/telemetry/dashboard`

Fichier source : `src/app/clans/[clanId]/telemetry/dashboard/page.tsx`

### Métriques affichées

La page affiche 5 compteurs issus de `GET /api/clans/[clanId]/telemetry/sync-batch-manual` :

| Compteur | Description | Couleur |
|----------|-------------|---------|
| En attente | Jobs `queued` | Ambre |
| En traitement | Jobs `running` | Bleu |
| Succès | Jobs `success` | Vert |
| Echoués | Jobs `failed` | Rouge |
| Total | Somme de tous les statuts | Slate |

### Jauges visuelles

Deux barres de progression horizontales :

- **Taux de succès** : `(success / (success + failed)) * 100`, affichée en vert.
- **Taux d'erreur** : `(failed / total) * 100`, affichée en rouge.

Les pourcentages affichent `N/A` si `total === 0`.

### Actualisation automatique

- Auto-refresh toutes les 30 secondes via `setInterval`.
- Case à cocher pour activer/désactiver l'auto-refresh.
- Bouton "Actualiser" pour un refresh manuel immédiat.
- Heure de la dernière actualisation affichée en bas de page.

### Actions rapides

Trois boutons disponibles :

| Bouton | Action API | Paramètre |
|--------|-----------|-----------|
| Réorganiser priorités | `POST /queue-cleanup` | `{ action: 'reorder-priority' }` |
| Nettoyer les anciens jobs | `POST /queue-cleanup` | `{ action: 'cleanup-stale', maxAgeHours: 24 }` |
| Exporter métriques (Prometheus) | `GET /metrics?format=prometheus` | Téléchargement fichier `.txt` |

Chaque action est suivie d'un refresh automatique des métriques.

### Permissions

Page accessible exclusivement au rôle Owner. Utilise `SettingsSectionNav` avec la section `owner-menu`.

---

## Page erreurs — `/clans/[clanId]/telemetry/errors`

Fichier source : `src/app/clans/[clanId]/telemetry/errors/page.tsx`

### Source de données

La page lit `GET /api/clans/[clanId]/telemetry/sync-batch-manual` et filtre les jobs ayant `status === 'failed'` dans `recentJobs`.

### Filtrage temporel

Quatre filtres disponibles :

| Filtre | Fenêtre |
|--------|---------|
| Tous | Aucune limite |
| Dernière heure | `jobAge < 3 600 000 ms` |
| Dernier jour | `jobAge < 86 400 000 ms` |
| Dernière semaine | `jobAge < 604 800 000 ms` |

Le filtre est calculé depuis `job.finishedAt` et s'applique côté client sans nouvel appel API.

### Affichage d'un job échoué

Chaque job apparaît sous forme de carte expandable :

- **En-tête (toujours visible) :** message d'erreur, identifiant court (`id.slice(0, 12)...`), date de fin.
- **Détail (expandable) :** viewer JSON du champ `details` (fond blanc, police mono, hauteur max 192px avec scroll).
- **Bouton retry :** appelle `POST /api/clans/[clanId]/telemetry/dead-letter` avec `{ jobIds: [job.id] }`, puis rafraîchit la liste.

---

## Export de métriques — `/api/clans/[clanId]/telemetry/metrics`

Fichier source : `src/app/api/clans/[clanId]/telemetry/metrics/route.ts`

### Format JSON (défaut)

```
GET /api/clans/1/telemetry/metrics
```

```typescript
{
  queued: number           // jobs en file d'attente
  running: number          // jobs en cours de traitement
  success: number          // total jobs réussis
  failed: number           // total jobs échoués
  recent_failures: number  // jobs échoués dans la dernière heure
  success_rate: number     // taux de succès en %, sur 50 samples
  avg_duration_ms: number  // durée moyenne des jobs réussis, en ms
}
```

### Format Prometheus

```
GET /api/clans/1/telemetry/metrics?format=prometheus
Content-Type: text/plain
```

Chaque métrique est exportée avec commentaires `HELP` et `TYPE`, et le label `clan_id`. Voir l'exemple complet dans `docs/telemetry/api.md#get-metrics`.

### Limites des métriques en mémoire

- Les métriques sont stockées dans `WorkerHealthMonitor` avec un buffer de 50 samples.
- Elles sont perdues au redémarrage du worker ou du serveur Next.js.
- Elles ne sont pas persistées en base de données.

Pour un historique durable, il faudrait soit écrire les samples en DB, soit exporter vers Prometheus avec un scraping régulier.

---

## Page matchs — `/clans/[clanId]/telemetry/matches`

Liste des matchs du clan avec leur statut de télémétrie. Chaque match affiche :

| Statut | Signification | Action disponible |
|--------|---------------|-------------------|
| OK | Télémétrie traitée avec succès | Resync forcé (optionnel) |
| Capture | Fichier capturé, traitement en attente | Resync via worker |
| Manquant | Fichier non encore téléchargé | Capture puis resync |
| Gros | Fichier trop volumineux (>250 Mo) | Non traitable |

---

## Page session — `/clans/[clanId]/telemetry/matches/session/[date]`

Fichier source référencé dans `TELEMETRY_MATCHES_SESSION_INTERFACE.md`.

Interface de récupération télémétrie en 4 étapes :

### Etape 1 — Sélection des matchs

Checkboxes individuelles par match, avec boutons "Tout sélectionner" et "Vider la sélection". Un compteur affiche le nombre de matchs sélectionnés.

### Etape 2 — Mode de récupération

Trois modes disponibles, présentés sous forme de cartes :

| Mode | Quand l'utiliser | Limite recommandée |
|------|------------------|--------------------|
| Direct Sync | Test rapide, validation | Moins de 50 matchs |
| Capture seule | Archivage, workflow production | 50 à 1000 matchs |
| Queue Resync | Production, gros volumes | 100 matchs et plus |

**Direct Sync :** télécharge, capture et parse en une seule opération synchrone. Résultat immédiat mais peut timeout au-delà de 50 matchs.

**Capture seule :** télécharge et sauvegarde dans `.telemetry-captured/`, sans parser. Non bloquant. Les fichiers sont rejouables à tout moment.

**Queue Resync :** enqueue des jobs pour le worker asynchrone. Nécessite que `npm run telemetry:worker` soit actif. Retourne immédiatement.

### Etape 3 — Options

- Case "Réinitialiser télémétrie avant traitement" : vide les données existantes avant de parser.
- Case "Recalculer agrégats après traitement" : relance le calcul des agrégats périodiques.

### Etape 4 — Exécution et résultat

Affichage du résultat JSON avec compteurs de succès/échec et logs des opérations.

---

## Page recoveries — `/clans/[clanId]/telemetry/recoveries`

Console d'observabilité officielle du pipeline. Affiche :

- Totaux (`scanned`, `parsed`, `failed`) sur la fenêtre sélectionnée.
- P95 des latences techniques (`fetchMatchMs`, `downloadAssetMs`, `parseMs`, `persistMs`).
- Alertes seuils (taux d'échec élevé, latences anormales).
- Historique des exécutions cron avec statuts.

Accessible via le menu owner et depuis la page `/clans/[clanId]/settings/cron`.

---

## Page sync-batch-manual — `/clans/[clanId]/telemetry/sync-batch-manual`

Interface en 4 étapes identique à celle de la vue session, mais sans contexte de date préchargé. Permet d'ajouter des matchIds manuellement via un champ texte, ou de les importer en lot.

Voir `docs/archive/TELEMETRY_UI_GUIDE.md` pour la maquette complète.

---

## Ce qui reste à implémenter

### WebSocket temps réel

Le dashboard utilise actuellement du polling à 30 secondes. Une connexion WebSocket permettrait des mises à jour instantanées sans polling, mais ajoute de la complexité d'infrastructure. Le polling 30s est suffisant pour le monitoring de batch.

### Historique des métriques en base

Les métriques sont en mémoire (50 samples, perdues au redémarrage). Pour un historique persistant :

- Ajouter une table `TelemetryMetricSample` avec `(clanId, timestamp, queued, running, success, failed, avgDurationMs)`.
- Écrire un sample toutes les 5 minutes depuis le worker.
- Exposer une route `/metrics/history?window=24h` pour les graphes temporels.

### Filtrage avancé des erreurs

La page `/errors` filtre uniquement par âge. Des filtres supplémentaires utiles :

- Par type d'erreur (réseau CDN, parsing JSON, timeout, erreur DB).
- Par match spécifique (recherche par `squadMatchId`).
- Par membre (matchs du joueur concerné).

### Auto-cleanup cron

Les jobs stale s'accumulent en DB sans nettoyage automatique. Voir `docs/telemetry/ops.md` pour la procédure recommandée.
