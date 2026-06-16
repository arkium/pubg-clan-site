# PUBG Clan Site

Application Next.js de suivi de clan PUBG — membres, stats, leaderboard, matchs, télémétrie et rapports.

## Démarrage rapide

```bash
npm install
# Créer .env à la racine avec au minimum DATABASE_URL, PUBG_API_KEY, APP_URL, AUTH_BOOTSTRAP_SECRET
npx prisma migrate deploy
npm run dev
```

Application : [http://localhost:3000](http://localhost:3000)

Guide complet d'installation (Node 22, VSCode, MySQL local, multi-terminaux) : [docs/ops/dev-setup.md](docs/ops/dev-setup.md)

## Documentation

Index complet : [docs/sommaire.md](docs/sommaire.md)

| Doc | Contenu |
|---|---|
| [docs/ops/dev-setup.md](docs/ops/dev-setup.md) | Installation Windows/VSCode, .env, problèmes courants |
| [docs/ops/deployment.md](docs/ops/deployment.md) | Déploiement Linux, systemd, migrations, healthchecks |
| [docs/ops/cron.md](docs/ops/cron.md) | Jobs cron, pilotage, CronExecution |
| [docs/telemetry/overview.md](docs/telemetry/overview.md) | Pipeline télémétrie, 3 modes de sync |
| [docs/architecture/stack.md](docs/architecture/stack.md) | Stack, contraintes Node 22, gotchas |

## Commandes PROD essentielles

```bash
sudo systemctl restart pubg-clan-site-web
sudo systemctl restart pubg-clan-site-cron
sudo systemctl status pubg-clan-site-web --no-pager -l
```
