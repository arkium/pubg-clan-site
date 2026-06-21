# Télémétrie — Opérations de production

Ce document décrit les opérations nécessaires au déploiement et à la maintenance du pipeline télémétrie en production.

---

## Migration SQL manuelle — ✅ Appliquée le 2026-06-20

**Fichier :** `prisma/migrations/20260607120000_add_squad_member_stats_and_heal_telemetry/migration.sql`
**Cible :** `smk.arkium.group:3306`
**Statut :** appliquée manuellement le 2026-06-20. Le fichier de travail `prisma/add-telemetry-columns.sql` a été supprimé après application.

### Pourquoi appliquer manuellement (historique)

Ne pas lancer `prisma migrate dev` ou `prisma migrate deploy` sur l'environnement de production. Ces commandes vérifient le checksum de toutes les migrations appliquées. La migration `20260604194120_add_weapon_stats_total_damage` ayant été appliquée directement en production sans passer par Prisma, un conflit de checksum est probable et bloquerait le déploiement.

La procédure correcte est d'exécuter le SQL manuellement sur le serveur cible, puis de mettre à jour la table `_prisma_migrations` si nécessaire pour que Prisma ne tente pas de la réappliquer.

### Contenu de la migration (6 blocs)

**Bloc 1 — `ALTER TABLE SquadMember` (P1.1)**

Ajoute 13 champs issus du résumé match PUBG API, sans appel télémétrie supplémentaire :

```sql
ALTER TABLE `SquadMember`
  ADD COLUMN `knockouts`       INT    NOT NULL DEFAULT 0,
  ADD COLUMN `headshotKills`   INT    NOT NULL DEFAULT 0,
  ADD COLUMN `timeSurvived`    INT    NOT NULL DEFAULT 0,
  ADD COLUMN `rideDistance`    DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `walkDistance`    DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `swimDistance`    DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `boosts`          INT    NOT NULL DEFAULT 0,
  ADD COLUMN `heals`           INT    NOT NULL DEFAULT 0,
  ADD COLUMN `vehicleDestroys` INT    NOT NULL DEFAULT 0,
  ADD COLUMN `roadKills`       INT    NOT NULL DEFAULT 0,
  ADD COLUMN `longestKill`     DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `teamKills`       INT    NOT NULL DEFAULT 0,
  ADD COLUMN `weaponsAcquired` INT    NOT NULL DEFAULT 0;
```

**Bloc 2 — `ALTER TABLE MemberTelemetryStats` (P1.3 — agrégats LogHeal)**

```sql
ALTER TABLE `MemberTelemetryStats`
  ADD COLUMN `avgHealsUsed`  DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `avgHealAmount` DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `avgBoostsUsed` DOUBLE NOT NULL DEFAULT 0;
```

**Bloc 3 — `ALTER TABLE MemberTelemetryStats` (P3.2 — vitesse max véhicule)**

```sql
ALTER TABLE `MemberTelemetryStats`
  ADD COLUMN `maxVehicleSpeedKph` DOUBLE NOT NULL DEFAULT 0;
```

**Bloc 4 — `ALTER TABLE SquadMatchTelemetry` (P3.1 — zones de drop)**

```sql
ALTER TABLE `SquadMatchTelemetry`
  ADD COLUMN `landingSamples` JSON NULL;
```

**Bloc 5 — `CREATE TABLE MemberSeasonStats` (P2.1)**

Table pour les stats ranked et normales par saison. Contrainte unique sur `(memberId, seasonId)`. Voir le fichier SQL complet pour la liste exhaustive des colonnes.

**Bloc 6 — `CREATE TABLE MemberWeaponMastery` (P2.2)**

Table pour la maîtrise par arme sur toute la carrière. Contrainte unique sur `(memberId, weaponId)`.

---

## Rollout initial — Séquence TEL-403

### Etape 0 — Preflight

Objectif : vérifier que l'environnement cible est prêt sans activer la sync télémétrie automatique.

Checklist :

1. Confirmer que les tables `SquadMatchTelemetry`, `MemberWeaponStats`, `MemberTelemetryStats` et `ClanSynergyTelemetryStats` existent sur la base cible.
2. Confirmer la présence d'au moins un clan actif et qu'un Owner peut ouvrir les pages ops.
3. Confirmer que les routes UI télémétrie fonctionnent en lecture (pas d'erreur 500 sur `/telemetry/recoveries`).
4. Confirmer que les tests télémétrie sont verts : `npm run test:telemetry`.
5. Confirmer que `TELEMETRY_SYNC_ENABLED=false` sur le worker cron.

Valeurs de départ recommandées pour les variables d'environnement du worker :

```
TELEMETRY_SYNC_ENABLED=false
TELEMETRY_MAX_MATCHES_PER_RUN=10
TELEMETRY_SYNC_CONCURRENCY=1
TELEMETRY_RETRY_MAX=2
TELEMETRY_FETCH_TIMEOUT_MS=30000
TELEMETRY_PARSER_VERSION=v2
```

Critère de sortie : aucune erreur bloquante de schéma ou de permission, dashboard recoveries accessible, historique cron lisible.

### Etape 1 — Dry-run opéré

Objectif : valider le pipeline sur un périmètre strictement contrôlé avant activation automatique.

Séquence :

1. Laisser `TELEMETRY_SYNC_ENABLED=false`.
2. Choisir un clan pilote avec un historique de matchs récents.
3. Depuis `/clans/[id]/telemetry/sync-batch-manual`, lancer une récupération manuelle sur 5 à 10 matchs en mode Direct Sync.
4. Vérifier les statuts des snapshots dans `/clans/[id]/telemetry/recoveries`.
5. Vérifier que les pages membres et clan affichent des données cohérentes.

Critère de sortie : pas d'erreur systémique sur le lot manuel, rollback non nécessaire.

### Etape 2 — Pilote automatisé (1 clan)

Objectif : activer la sync automatique avec débit minimal sur un seul clan.

Configuration :

```
TELEMETRY_SYNC_ENABLED=true
TELEMETRY_MAX_MATCHES_PER_RUN=10
TELEMETRY_SYNC_CONCURRENCY=1
```

Séquence :

1. Activer le flag sur le worker cron.
2. Redémarrer uniquement le process worker concerné.
3. Surveiller les premiers runs `daily_sync` dans `/clans/[id]/settings/cron`.
4. Contrôler le clan pilote pendant au moins 48 heures ou plusieurs runs complets.

Checklist run par run :

- Run 1 : vérifier qu'une exécution `daily_sync` récente existe, noter les valeurs de base (`scanned`, `parsed`, `failed`, p95, rate-limit remaining).
- Run 2 : comparer `failedRate` avec le run 1, vérifier l'absence de pic.
- Run 3 : confirmer l'absence d'incident bloquant, valider la décision de continuer ou rollback.

Critère de sortie : taux d'échec stable et expliqué, performance cron compatible avec la fenêtre de traitement, journal renseigné.

### Etape 3 — Extension globale progressive

Approche par paliers, en montant d'abord `TELEMETRY_MAX_MATCHES_PER_RUN` avant la concurrence :

| Palier | MAX_MATCHES_PER_RUN | SYNC_CONCURRENCY |
|--------|---------------------|-----------------|
| 1 | 10 | 1 |
| 2 | 25 | 1 |
| 3 | 25 | 2 |
| 4 | 50 | 2 |

Vérifier après chaque palier que les alertes et le backlog restent maîtrisés.

### Journal de rollout

Tenir un journal simple pendant toute la durée du rollout :

| Date/heure | Etape | Scope | Config | Résultat | Actions correctives |
|------------|-------|-------|--------|----------|---------------------|
| ... | Preflight | ... | ... | ... | ... |

### Rollback

Séquence de rollback prioritaire :

1. Repasser `TELEMETRY_SYNC_ENABLED=false` sur le worker cron.
2. Redémarrer le process worker.
3. Vérifier qu'aucun nouveau lot télémétrie automatique ne repart.
4. Conserver les snapshots existants en lecture seule — ne pas supprimer les données.
5. Masquer les entrées UI télémétrie si nécessaire en attendant le diagnostic.

Ce qu'il ne faut pas faire en premier recours : suppression en masse de snapshots, réinitialisation destructive des agrégats, rollback DB tant qu'un arrêt par flag suffit.

---

## Backfill v1 vers v2 — ✅ Complété le 2026-06-21

**Résultat :** 346 snapshots `SquadMatchTelemetry` — tous `status=success`, `parserVersion=v2`.

```sql
-- Vérification post-backfill (2026-06-21)
SELECT status, parserVersion, COUNT(*)
FROM SquadMatchTelemetry
GROUP BY status, parserVersion
ORDER BY status, parserVersion;
-- → success | v2 | 346
```

### Pourquoi ce backfill était nécessaire

Le parser v1 n'extrayait pas :
- `landingSamples` (zones de drop par match — migration `20260607120000`).
- `maxVehicleSpeedKph` (vitesse max véhicule — migration `20260607120000`).
- L'attribution d'armes par membre de façon déterministe.
- Les synergies entre membres dans tous les cas.

### Procédure utilisée (référence pour futurs backfills)

Via CLI :

```bash
npm run telemetry:batch -- --clan 1 --all-matches
npm run telemetry:worker
```

Via l'interface :

1. Aller sur `/clans/[id]/telemetry/sync-batch-manual`.
2. Sélectionner les matchs concernés ou utiliser "Tout sélectionner".
3. Choisir le mode "Queue Resync".
4. Lancer `npm run telemetry:worker` en parallèle pour traiter la file.

### Estimation de durée (référence)

Chaque match prend environ 30 à 60 secondes selon la taille du fichier télémétrie (lecture CDN ou relecture fichier local).

| Volume de matchs | Durée estimée (concurrence 1) |
|-----------------|-------------------------------|
| 100 matchs | 1 à 2 heures |
| 500 matchs | 5 à 10 heures |
| 1000 matchs | 10 à 20 heures |

Après un backfill, relancer le recalcul des agrégats si nécessaire :

```bash
npm run telemetry:batch -- --all-clans --recalc-aggregates-only
```

---

## Auto-cleanup cron (a implémenter — complexité faible, environ 1 heure)

### Problème

Les jobs stale (bloqués en `running` depuis trop longtemps, ou `queued` depuis plusieurs jours) s'accumulent en base sans nettoyage automatique. L'interface propose un bouton manuel, mais aucun cron ne le déclenche.

### Solution

Ajouter dans `src/lib/cron-jobs.ts` un job de nettoyage périodique qui appelle les actions de cleanup :

```typescript
// src/lib/cron-jobs.ts

async function runTelemetryCleanup(clanId: number) {
  await fetch(`/api/clans/${clanId}/telemetry/queue-cleanup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cleanup-stale', maxAgeHours: 24 }),
  })
  await fetch(`/api/clans/${clanId}/telemetry/queue-cleanup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cleanup-failed', maxAgeHours: 168 }), // 7 jours
  })
}
```

Fréquence suggérée : toutes les 6 heures. Ajouter la configuration dans les variables d'environnement :

```
TELEMETRY_CLEANUP_CRON=0 */6 * * *
```

---

## Streaming JSON parser (a implémenter — complexité moyenne, environ 4 heures)

### Problème

Le fichier `src/lib/pubg-telemetry/resync-files.ts` contient encore une étape de chargement du JSON complet en mémoire lors du parsing depuis les fichiers locaux capturés. Pour les fichiers supérieurs à 500 Mo non compressés, cela peut provoquer une erreur OOM (Out Of Memory) du process worker.

### Solution

Le parser streaming est déjà implémenté dans `src/lib/pubg-telemetry/parser.ts` via `parseTelemetrySnapshotFromStream()`. Il faut le brancher dans `resyncTelemetryFromCapturedFile()` dans `resync-files.ts` pour remplacer le chargement complet.

Attention : ne jamais utiliser `Readable.toWeb()` dans ce projet (fuite mémoire sur Node.js 22). Utiliser l'adaptateur manuel documenté dans `CLAUDE.md`.

### Impact

Résout le risque OOM pour les gros matchs (parties avec beaucoup de joueurs actifs, matchs sur grande carte). Les fichiers de test internes mesurent en moyenne 359 ms de parse sur un corpus de 20 fixtures réelles.

---

## Variables d'environnement télémétrie

| Variable | Valeur par défaut | Description |
|----------|------------------|-------------|
| `TELEMETRY_SYNC_ENABLED` | `false` | Active/désactive la sync télémétrie automatique dans le cron |
| `TELEMETRY_PARSER_VERSION` | `v2` | Version du parser actif (utiliser toujours `v2`) |
| `TELEMETRY_MAX_MATCHES_PER_RUN` | `50` | Nombre maximum de matchs traités par run cron |
| `TELEMETRY_SYNC_CONCURRENCY` | `2` | Nombre de matchs traités en parallèle (recommandé : 2 à 4) |
| `TELEMETRY_RETRY_MAX` | `2` | Nombre maximum de tentatives par job avant passage en `failed` |
| `TELEMETRY_FETCH_TIMEOUT_MS` | `30000` | Timeout de téléchargement CDN en millisecondes |
| `TELEMETRY_MAX_ASSET_SIZE_MB` | `250` | Taille maximale d'un fichier télémétrie en Mo |
| `TELEMETRY_WORKER_GC_ENABLED` | `false` | Active le GC forcé après chaque job dans le worker |
| `TELEMETRY_WORKER_MEMORY_THRESHOLD_PCT` | `75` | Seuil de backpressure mémoire en % du heap |
| `TELEMETRY_CAPTURE_FIXTURES_DIR` | `.telemetry-captured` | Répertoire des fichiers capturés localement |
| `CLAN_SEASON_STATS_SYNC_CRON` | `0 5 * * *` | Expression cron pour la sync des stats saisonnières |
| `DATABASE_URL` | — | URL de connexion MySQL (`mysql://user:pass@host:3306/db`) |
| `PUBG_API_KEY` | — | Clé API PUBG (requise) |
| `ENABLE_CRON_JOBS` | `false` | Active l'orchestrateur cron général (un seul process doit l'avoir à `true`) |

---

## Monitoring en production

### Dashboard web

URL : `/clans/[id]/telemetry/dashboard`

Métriques en temps réel : queued, running, success, failed, taux de succès, taux d'erreur. Auto-refresh 30 secondes. Actions rapides de maintenance.

### Console d'observabilité

URL : `/clans/[id]/telemetry/recoveries`

Vue 24h/7j/30j/all avec totaux, p95 des latences techniques, alertes de seuil.

### Métriques Prometheus

```bash
curl 'https://prod.example.com/api/clans/1/telemetry/metrics?format=prometheus'
```

Format text Prometheus compatible avec Grafana, Datadog ou tout scraper standard. Scraper recommandé : toutes les 60 secondes.

### Logs du worker

Le process `npm run telemetry:worker` écrit sur stdout/stderr. En production via systemd :

```bash
journalctl -u pubg-telemetry-worker -f --since "1 hour ago"
```

### Healthcheck

```bash
curl 'https://prod.example.com/api/internal/cron/status'
```

Vérifie la santé du worker cron et la configuration télémétrie.

---

## Déploiement production

### Unit file systemd — Worker télémétrie

```ini
[Unit]
Description=PUBG Clan Site — Telemetry Worker
After=network.target mysql.service
Wants=mysql.service

[Service]
Type=simple
User=app
Group=app
WorkingDirectory=/app/pubg-clan-site
EnvironmentFile=/app/pubg-clan-site/.env.production

# Mémoire limitée pour éviter les OOM non détectés
MemoryMax=512M
MemorySwapMax=0

ExecStart=/usr/bin/node --max-old-space-size=384 node_modules/.bin/ts-node scripts/telemetry-worker.ts
# ou via npm si le script est défini :
# ExecStart=/usr/bin/npm run telemetry:worker

Restart=always
RestartSec=15
# Backoff exponentiel : ne pas redémarrer en boucle sur crash OOM
RestartSteps=3
RestartMaxDelaySec=60

StandardOutput=journal
StandardError=journal
SyslogIdentifier=pubg-telemetry-worker

[Install]
WantedBy=multi-user.target
```

Commandes de gestion :

```bash
sudo systemctl enable pubg-telemetry-worker
sudo systemctl start pubg-telemetry-worker
sudo systemctl status pubg-telemetry-worker
journalctl -u pubg-telemetry-worker -f
```

### Unit file systemd — Serveur Next.js

```ini
[Unit]
Description=PUBG Clan Site — Next.js Web Server
After=network.target mysql.service

[Service]
Type=simple
User=app
Group=app
WorkingDirectory=/app/pubg-clan-site
EnvironmentFile=/app/pubg-clan-site/.env.production

Environment=NODE_ENV=production
Environment=ENABLE_CRON_JOBS=true
# Un seul process web doit avoir ENABLE_CRON_JOBS=true

ExecStart=/usr/bin/node --max-old-space-size=1024 .next/standalone/server.js

Restart=always
RestartSec=10

StandardOutput=journal
StandardError=journal
SyslogIdentifier=pubg-web

[Install]
WantedBy=multi-user.target
```

### Variables d'environnement à configurer en production

Fichier `/app/pubg-clan-site/.env.production` (non versionné) :

```bash
NODE_ENV=production
DATABASE_URL=mysql://user:password@smk.arkium.group:3306/pubg_clan

PUBG_API_KEY=your-api-key-here

ENABLE_CRON_JOBS=true
TELEMETRY_SYNC_ENABLED=true
TELEMETRY_PARSER_VERSION=v2
TELEMETRY_MAX_MATCHES_PER_RUN=25
TELEMETRY_SYNC_CONCURRENCY=2
TELEMETRY_RETRY_MAX=2
TELEMETRY_FETCH_TIMEOUT_MS=30000
TELEMETRY_MAX_ASSET_SIZE_MB=250
TELEMETRY_WORKER_GC_ENABLED=true
TELEMETRY_WORKER_MEMORY_THRESHOLD_PCT=75

CLAN_SEASON_STATS_SYNC_CRON=0 5 * * *
```

### Surveillance mémoire du worker

Alerter si le heap du worker dépasse 80% de la limite configurée. Le worker dispose d'un `WorkerHealthMonitor` qui expose `currentMemory` et `peakMemory` dans les métriques JSON. Une règle d'alerte Prometheus :

```yaml
alert: TelemetryWorkerHighMemory
expr: telemetry_worker_memory_pct{job="pubg-telemetry"} > 80
for: 5m
labels:
  severity: warning
annotations:
  summary: "Worker télémétrie heap > 80%"
```

En cas d'alerte :
1. Vérifier si un gros fichier est en cours de traitement (`running > 0` dans les métriques).
2. Réduire `TELEMETRY_MAX_MATCHES_PER_RUN` et `TELEMETRY_SYNC_CONCURRENCY`.
3. Activer `TELEMETRY_WORKER_GC_ENABLED=true` si ce n'est pas déjà le cas.
4. Si le heap continue de croître : redémarrer le worker (`systemctl restart pubg-telemetry-worker`).

### Après un déploiement applicatif

Si `npm run sync:pubg-assets` a été exécuté pour mettre à jour les icônes :

```bash
npm run sync:pubg-assets
npm run build
sudo systemctl restart pubg-web
sudo systemctl restart pubg-telemetry-worker
```

Le worker doit être redémarré pour recharger les modules compilés.
