# Déploiement en production

## Contraintes Node.js

- Node.js **22 LTS** strictement requis.
- Node 24 est **bloqué** : le script `predev` détecte la version et interrompt le démarrage avec un message explicite.
- `package.json` déclare `"engines": { "node": ">=20 <24" }`.
- Utiliser `.nvmrc` pour épingler la version (`22.22.3` ou la dernière LTS 22.x).

---

## Variables d'environnement

### Base de données

| Variable | Exemple | Requis |
|---|---|---|
| `DATABASE_URL` | `mysql://user:pass@host:3306/dbname` | Oui |

### API PUBG

| Variable | Exemple | Requis |
|---|---|---|
| `PUBG_API_KEY` | JWT token PUBG | Oui |
| `PUBG_BASE_URL` | `https://api.pubg.com` | Oui |

### Application

| Variable | Exemple | Requis |
|---|---|---|
| `APP_URL` | `https://clan.example.com` | Oui |
| `NEXT_PUBLIC_APP_URL` | `https://clan.example.com` | Oui |
| `INTERNAL_APP_URL` | `http://127.0.0.1:3000` | Oui (worker cron) |
| `AUTH_BOOTSTRAP_SECRET` | chaîne aléatoire longue | Oui |
| `AUTH_ALLOW_LEGACY_ACTOR_ID` | `false` | Non (défaut `false`) |

### Email (SMTP)

| Variable | Exemple | Requis |
|---|---|---|
| `SMTP_HOST` | `ssl0.ovh.net` | Oui si notifications email |
| `SMTP_PORT` | `465` | Oui |
| `SMTP_SECURE` | `true` | Non (défaut `false`) |
| `SMTP_USER` | `no-reply@example.com` | Oui |
| `SMTP_PASS` | `*****` | Oui |
| `SMTP_FROM` | `PUBG Clan <no-reply@example.com>` | Oui |

### Cron

| Variable | Défaut | Requis sur |
|---|---|---|
| `ENABLE_CRON_JOBS` | — | Worker cron uniquement (`true`) |
| `CRON_BOOTSTRAP_SECRET` | — | Web worker ET worker cron (partagé) |
| `CLAN_MATCH_SYNC_CRON` | `0 2 * * *` | Optionnel |
| `CLAN_MATCH_SYNC_TIMEZONE` | `UTC` | Optionnel |
| `CLAN_STATS_RECALC_CRON` | `0 3 * * *` | Optionnel |
| `CLAN_LIFETIME_STATS_SYNC_CRON` | `0 4 * * *` | Optionnel |
| `CLAN_SEASON_STATS_SYNC_CRON` | `0 5 * * *` | Optionnel |
| `CLAN_ONLINE_REMINDER_CRON` | `0 18 * * *` | Optionnel |
| `WEEKLY_REPORT_REMINDER_CRON` | `0 9 * * *` | Optionnel |
| `WEEKLY_REPORT_GENERATION_CRON` | `0 8 * * 1` | Optionnel |
| `MONTHLY_REPORT_GENERATION_CRON` | `0 8 1 * *` | Optionnel |

### Télémétrie

| Variable | Défaut | Rôle |
|---|---|---|
| `TELEMETRY_SYNC_ENABLED` | — | `true` pour activer la sync télémétrie |
| `TELEMETRY_PARSER_VERSION` | — | Version du parser (`v2`) |
| `TELEMETRY_MAX_MATCHES_PER_RUN` | `50` | Matchs max par run de sync |
| `TELEMETRY_SYNC_CONCURRENCY` | `2` | Parallélisme de sync |
| `TELEMETRY_RETRY_MAX` | — | Nb max de tentatives par job |
| `TELEMETRY_FETCH_TIMEOUT_MS` | `30000` | Timeout fetch assets télémétrie |
| `TELEMETRY_MAX_ASSET_SIZE_MB` | `250` | Taille max d'un asset télémétrie |
| `TELEMETRY_CAPTURE_FIXTURES` | `false` | Capture des fixtures de test |
| `TELEMETRY_CAPTURE_FIXTURES_DIR` | — | Répertoire de capture |
| `TELEMETRY_CAPTURE_FIXTURE_MAX_BYTES` | `52428800` | Taille max d'une fixture capturée |
| `TELEMETRY_WORKER_DISABLE_INLINE_AGGREGATES` | `false` | Désactive les agrégats inline dans le worker |
| `TELEMETRY_WORKER_GC_ENABLED` | `false` | Active le GC explicite dans le worker |
| `TELEMETRY_RESYNC_STUCK_RECOVERY_MS` | `60000` | Délai avant récupération des jobs bloqués |
| `TELEMETRY_RESYNC_WORKER_MAX_PARALLEL` | `1` | Parallélisme du worker resync |
| `TELEMETRY_RESYNC_WORKER_LOCK_FILE` | `.telemetry-resync-worker.lock` | Fichier de verrou resync |
| `TELEMETRY_RESYNC_WORKER_LOCK_STALE_MS` | `1800000` | Délai de péremption du verrou resync |
| `TELEMETRY_AGGREGATE_WORKER_MAX_PARALLEL` | `1` | Parallélisme du worker agrégats |
| `TELEMETRY_AGGREGATE_WORKER_LOCK_FILE` | `.telemetry-aggregate-worker.lock` | Fichier de verrou agrégats |
| `TELEMETRY_AGGREGATE_WORKER_LOCK_STALE_MS` | `1800000` | Délai de péremption du verrou agrégats |

---

## Build production

```bash
npm run build
```

Le postbuild (`scripts/copy-standalone-assets.mjs`) copie automatiquement les assets statiques dans le répertoire `.next/standalone` requis par Next.js en mode standalone.

Résultat : `.next/standalone/` contient tout le nécessaire pour démarrer l'application sans `node_modules`.

---

## Démarrage des processus

### Application web

```bash
# Via npm
npm run start

# Via Node.js standalone (recommandé en production)
node .next/standalone/server.js
```

### Worker télémétrie resync (obligatoire si télémétrie activée)

Tourne en boucle infinie. Doit rester actif en permanence.

```bash
npm run telemetry:worker
# ou directement :
node --max-old-space-size=2048 --expose-gc node_modules/tsx/dist/cli.mjs scripts/telemetry-resync-worker.ts
```

Pour une passe unique puis exit :

```bash
npm run telemetry:worker:once
```

### Worker agrégats télémétrie

Peut tourner en batch périodique ou en boucle continue selon les besoins.

```bash
npm run telemetry:aggregates:worker
# Passe unique :
npm run telemetry:aggregates:worker:once
```

### Worker cron (si séparé du web)

Le worker cron est l'application Next.js elle-même démarrée avec `ENABLE_CRON_JOBS=true`. Il n'y a pas de processus distinct — c'est une instance du web server avec les crons activés.

---

## Exemples de units systemd

### Application web

```ini
[Unit]
Description=PUBG Clan Site — Web
After=network.target

[Service]
Type=simple
User=pubg
WorkingDirectory=/srv/pubg-clan-site
ExecStart=node .next/standalone/server.js
EnvironmentFile=/srv/pubg-clan-site/.env
Environment=PORT=3000
Environment=ENABLE_CRON_JOBS=false
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Worker cron

```ini
[Unit]
Description=PUBG Clan Site — Cron Worker
After=network.target pubg-clan-web.service

[Service]
Type=simple
User=pubg
WorkingDirectory=/srv/pubg-clan-site
ExecStart=node .next/standalone/server.js
EnvironmentFile=/srv/pubg-clan-site/.env
Environment=PORT=3001
Environment=ENABLE_CRON_JOBS=true
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Worker télémétrie resync

```ini
[Unit]
Description=PUBG Clan Site — Telemetry Resync Worker
After=network.target

[Service]
Type=simple
User=pubg
WorkingDirectory=/srv/pubg-clan-site
ExecStart=node --max-old-space-size=2048 --expose-gc node_modules/tsx/dist/cli.mjs scripts/telemetry-resync-worker.ts
EnvironmentFile=/srv/pubg-clan-site/.env
Restart=always
RestartSec=15

[Install]
WantedBy=multi-user.target
```

---

## Migration de la base de données

Ne jamais utiliser `prisma migrate deploy` directement en production sans vérification préalable.

Procédure recommandée :

1. **Sauvegarder la base** avant toute migration :
   ```bash
   mysqldump -u user -p dbname > backup-$(date +%Y%m%d-%H%M%S).sql
   ```
2. Vérifier les migrations pendantes :
   ```bash
   npx prisma migrate status
   ```
3. Appliquer les migrations sur un environnement de staging d'abord.
4. En production, appliquer uniquement si le staging est validé :
   ```bash
   npx prisma migrate deploy
   ```

En cas de problème de checksum (migration modifiée après application), ne pas tenter de résoudre automatiquement — corriger manuellement dans la table `_prisma_migrations` ou restaurer depuis le backup.

---

## Rollback

1. Couper les processus (web, cron, workers).
2. Restaurer le backup de base de données si une migration a été appliquée.
3. Revenir au commit précédent :
   ```bash
   git checkout <commit-sha>
   npm run build
   ```
4. Redémarrer les processus.

---

## Healthchecks

Endpoints à monitorer :

| Endpoint | Fréquence recommandée | Attente |
|---|---|---|
| `GET /api/auth/session` | 1 min | HTTP 200 |
| `GET /api/internal/cron/status` (header `x-cron-bootstrap-secret`) | 5 min | HTTP 200, `cronJobsEnabled: true` |

Le premier confirme que le web server répond et que la DB est accessible. Le second confirme que le worker cron est actif et que les jobs sont activés.

---

## Ressources minimales recommandées

| Process | RAM min | Notes |
|---|---|---|
| Application web | 512 Mo | Next.js standalone |
| Worker cron | 512 Mo | Même binaire que le web, crons actifs |
| Worker télémétrie resync | 512 Mo | `--max-old-space-size=2048` disponible, 512 Mo suffisants en fonctionnement normal |
| Worker agrégats | 512 Mo | Idem |

En cas de traitement de matchs en volume (backfill initial), le worker télémétrie peut atteindre 1-1.5 Go. Le flag `--max-old-space-size=2048` fixe un plafond de 2 Go.

Le web server en dev utilise `--max-old-space-size=8192` (8 Go) pour éviter les crashs lors des rechargements à chaud. Cette valeur est propre au mode développement uniquement.
