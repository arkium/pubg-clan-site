# PUBG Clan Site

Application Next.js de suivi de clan PUBG — membres, stats, leaderboard, matchs, télémétrie, tournois inter-clans, rapports et notifications Discord.

## Démarrage rapide

```bash
npm install
# Créer .env à la racine avec au minimum DATABASE_URL, PUBG_API_KEY, APP_URL, AUTH_BOOTSTRAP_SECRET
npx prisma migrate deploy
npm run dev
```

Application : [http://localhost:3000](http://localhost:3000)

Guide complet d'installation (Node 22, VSCode, MySQL local, multi-terminaux) : [docs/ops/dev-setup.md](docs/ops/dev-setup.md)

## Tests

```bash
npm run test:telemetry   # nom historique : exécute TOUS les tests (src/lib/**/*.test.ts)
```

Vitest ne collecte que `src/lib/**/*.test.ts`. Un test placé ailleurs ne sera jamais exécuté, sans avertissement.

## Base de données

Le schéma Prisma et la base sont alignés. Avant toute écriture de schéma, afficher le SQL qui serait appliqué :

```bash
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script
```

La réponse attendue est `-- This is an empty migration.`. Toute autre sortie signale une dérive : la comprendre avant d'appliquer quoi que ce soit. `prisma db push` **supprime** ce qui existe en base et pas dans le schéma.

## Documentation

Index complet : [docs/sommaire.md](docs/sommaire.md)

| Doc | Contenu |
|---|---|
| [docs/ops/dev-setup.md](docs/ops/dev-setup.md) | Installation Windows/VSCode, .env, problèmes courants |
| [docs/ops/deployment.md](docs/ops/deployment.md) | Déploiement Linux, systemd, migrations, healthchecks |
| [docs/ops/cron.md](docs/ops/cron.md) | Jobs cron, pilotage, CronExecution |
| [docs/telemetry/overview.md](docs/telemetry/overview.md) | Pipeline télémétrie, 3 modes de sync |
| [docs/features/discord-notifications.md](docs/features/discord-notifications.md) | Webhooks Discord : alertes Top 1, diffusion des manches de tournoi |
| [docs/architecture/stack.md](docs/architecture/stack.md) | Stack, contraintes Node 22, gotchas |

## Commandes PROD essentielles

```bash
sudo systemctl restart pubg-clan-site-web
sudo systemctl restart pubg-clan-site-cron
sudo systemctl status pubg-clan-site-web --no-pager -l
```
