# PUBG Clan Site

Application Next.js pour gestion de clan PUBG: membres, roles, invitations par email, stats et rapports.

## Documentation

La documentation detaillee est centralisee dans le dossier `docs/`.

- Index global: [docs/sommaire.md](docs/sommaire.md)
- Reference telemetry (document canonique): [docs/telemetrie-reference.md](docs/telemetrie-reference.md)
- Pilotage cron (ops): [docs/cron-clan-settings.md](docs/cron-clan-settings.md)

## Fonctionnalites principales

- Gestion des membres de clan: ajout, suivi, activation, changement de membre actif.
- Roles et permissions: Owner, Admin, Moderator, Member avec controles d'acces par fonctionnalite.
- Synchronisation PUBG: import des matchs, recalcul des stats, consolidation des donnees par joueur.
- Rapports automatiques: generation hebdomadaire/mensuelle et historique des rapports par clan.
- Analyse avancee: leaderboard, stats par carte, heatmap d'activite, progression et synergies d'equipe.
- Invitations et onboarding: invitations par email, activation de compte et parcours first-run.
- Notifications: preferences utilisateur et notifications applicatives liees aux performances et evenements.
- Pilotage cron (Owner Ops): declenchement manuel, verification de configuration, historique d'execution et supervision.
- Exploitation production: deploiement Prisma, execution en service systemd et demarrage automatique apres reboot serveur.

## DEV

### Prerequis (DEV)

- Node.js 22 LTS (recommande: 22.22.3)
- MySQL/MariaDB accessible
- Base de donnees creee

Le projet bloque Node 24 en `npm run dev`.

### Installation

```bash
npm install
```

### Variables `.env` (minimum)

```env
DATABASE_URL="mysql://user:password@localhost:3306/pubg_clan_site"
PUBG_API_KEY="your-pubg-api-key"
PUBG_BASE_URL="https://api.pubg.com"
PUBG_API_RATE_LIMIT_RPM="10"

APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
INTERNAL_APP_URL="http://127.0.0.1:3000"

ENABLE_CRON_JOBS="false"
AUTH_ALLOW_LEGACY_ACTOR_ID="false"
AUTH_BOOTSTRAP_SECRET="change-me-long-random-string"

# Optionnel (cron lifetime global)
CLAN_LIFETIME_STATS_SYNC_CRON="0 4 * * *"
```

Important:

- Prisma lit `DATABASE_URL` depuis `.env`.
- Eviter de mettre `DATABASE_URL` uniquement dans `.env.local`.
- `PUBG_API_RATE_LIMIT_RPM` est un fallback; la valeur effective peut etre surchargee via `AppConfig`.

### Base de donnees

Appliquer les migrations:

```bash
npx prisma migrate deploy
```

Alternative dev (sans migrations):

```bash
npx prisma db push
```

### Lancement

```bash
npm run dev
```

Application: http://localhost:3000

Si le port 3000 est deja pris:

```bash
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess
Stop-Process -Id <PID> -Force
npm run dev
```

## Telemetry (dev)

En local, lancer les workers telemetry dans 2 terminaux separes:

```bash
npm run telemetry:worker
npm run telemetry:aggregates:worker
```

Mode verification one-shot:

```bash
npm run telemetry:worker:once
npm run telemetry:aggregates:worker:once
```

Voir la doc canonique telemetry: [docs/telemetrie-reference.md](docs/telemetrie-reference.md)

## Production (Linux, mode 2 workers)

Commandes minimales de restart systemd:

```bash
sudo systemctl daemon-reload
sudo systemctl restart pubg-clan-site-web
sudo systemctl restart pubg-clan-site-cron
sudo systemctl status pubg-clan-site-web --no-pager -l
sudo systemctl status pubg-clan-site-cron --no-pager -l
```

Documentation ops detaillee:

- Runbook cron/ops: [docs/cron-clan-settings.md](docs/cron-clan-settings.md)
- Reference telemetry (dev + prod): [docs/telemetrie-reference.md](docs/telemetrie-reference.md)
- Index global docs: [docs/sommaire.md](docs/sommaire.md)
