# PUBG Clan Site

Application Next.js pour gestion de clan PUBG: membres, roles, invitations par email, stats et rapports.

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

## Invitations email

### Variables SMTP requises

Le test email et l'affichage du bouton `Inviter` dependent de ces variables:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Exemple:

```env
SMTP_HOST="smtp.sendgrid.net"
SMTP_PORT="587"
SMTP_USER="apikey"
SMTP_PASS="your-secret"
SMTP_FROM="PUBG Clan <no-reply@example.com>"
```

### Validation dans l'UI

1. Ouvrir `/settings/email-delivery` (Owner/Admin `manage_settings`).
2. Verifier l'etat des variables `.env` affichees.
3. Si complet, lancer `Envoyer un email test`.
4. En cas de besoin, utiliser `Revoquer la validation`.
5. Bouton `Recharger le statut` disponible pour relire la config sans recharger la page.

Si la config SMTP est incomplete:

- le bouton de test est masque
- un exemple `.env` est affiche
- les boutons `Inviter` sont masques dans `/clans/[clanId]/settings/members`

## Auth et first-run

- Au premier lancement (base vide), l'accueil guide la creation du premier membre.
- Le flux d'activation passe par `/activate?token=...`.
- Le bootstrap Owner peut aussi etre fait via `/api/auth/bootstrap-owner-invite` avec `x-bootstrap-secret`.

## PROD

### Prerequis (PROD)

- Serveur Linux avec `systemd`
- Node.js 22 LTS installe
- Base MySQL/MariaDB accessible depuis le serveur
- Variables d'environnement configurees dans `.env` (au minimum `DATABASE_URL`, `APP_URL`, `NEXT_PUBLIC_APP_URL`, `INTERNAL_APP_URL`, `PUBG_API_KEY`)
- Services systemd `pubg-clan-site-web` et `pubg-clan-site-cron` crees et actives (mode recommande)

### Checklist

1. Definir toutes les variables critiques (`DATABASE_URL`, `PUBG_API_KEY`, URLs, SMTP, auth secret).
2. Appliquer les migrations:

```bash
npx prisma migrate deploy
```

3. Build:

```bash
npm run build
```

Important pour le mode standalone:

- le build copie automatiquement les assets statiques dans `.next/standalone`
- si vous deploiement est manuel, reutiliser le dossier `.next/standalone` complet
- ne pas oublier que `public/` et `.next/static/` doivent etre presents a cote de `server.js`

4. Choisir le mode de demarrage (voir section ci-dessous):

- Manuel ponctuel: `node .next/standalone/server.js`
- Service persistant: `systemd` (recommande en production)

### npm start vs systemd (production)

- `npm start`:
	- lance l'application manuellement dans le shell courant
	- utile pour un test rapide
	- ne garantit pas un redemarrage automatique apres reboot serveur

- `systemd`:
	- lance l'application en service systeme
	- redemarre automatiquement en cas de crash
	- peut demarrer automatiquement au boot serveur (`systemctl enable`)
	- recommande pour la production

Note:

- En mode standalone Next.js, le service `systemd` doit pointer vers
	`/home/smk/apps/pubg-clan-site/.next/standalone/server.js`.
- Les chunks CSS/JS sont servis depuis `.next/standalone/.next/static` et `public/`; un deploiement sans ces dossiers provoque des 404 et laisse l'UI bloquee sur l'etat de chargement.

### Recommandations URLs

- `APP_URL`: URL publique serveur (ex: `https://app.mondomaine.com`)
- `NEXT_PUBLIC_APP_URL`: meme domaine public cote navigateur
- `INTERNAL_APP_URL`: URL interne locale pour les appels cron (ex: `http://127.0.0.1:3000`)

### Cron en production

Le mode recommande est le mode `2 workers` (section ci-dessous):

- worker web: `ENABLE_CRON_BOOTSTRAP=false`, `ENABLE_CRON_JOBS=false`
- worker cron: `ENABLE_CRON_BOOTSTRAP=false`, `ENABLE_CRON_JOBS=true`
- bootstrap explicite via `POST /api/internal/cron/bootstrap`

Mode legacy (service unique) uniquement si vous ne passez pas en 2 workers:

- `ENABLE_CRON_BOOTSTRAP=true`
- `ENABLE_CRON_JOBS=true` sur un seul process

Variables recommandees sur le worker cron principal:

```env
ENABLE_CRON_BOOTSTRAP="false"
ENABLE_CRON_JOBS="true"
CLAN_MATCH_SYNC_CRON="0 2 * * *"
CLAN_MATCH_SYNC_TIMEZONE="Europe/Paris"
CLAN_LIFETIME_STATS_SYNC_CRON="0 4 * * *"
INTERNAL_APP_URL="http://127.0.0.1:3000"
CRON_BOOTSTRAP_SECRET="change-me-long-random-string"
```

### Parametres CRON disponibles

Cette section documente les variables metier qui pilotent les jobs planifies.
Elle ne change pas la strategie de workers (web/cron), seulement les horaires des taches.

- `CLAN_MATCH_SYNC_CRON`: synchronisation des matchs clan (import PUBG)
- `CLAN_MATCH_SYNC_TIMEZONE`: timezone utilisee pour les expressions cron (defaut `UTC`)
- `CLAN_LIFETIME_STATS_SYNC_CRON`: sync quotidienne des stats lifetime PUBG
- `CLAN_STATS_RECALC_CRON`: recalcul des stats consolidees / badges
- `CLAN_ONLINE_REMINDER_CRON`: rappel quotidien de presence/online
- `WEEKLY_REPORT_REMINDER_CRON`: rappel quotidien pour preparation rapport hebdo
- `WEEKLY_REPORT_GENERATION_CRON`: generation automatique du rapport hebdomadaire
- `MONTHLY_REPORT_GENERATION_CRON`: generation automatique du rapport mensuel

Exemple complet:

```env
CLAN_MATCH_SYNC_CRON="0 2,12,13,14,15,17,21,22,23 * * *"
CLAN_MATCH_SYNC_TIMEZONE="Europe/Paris"
CLAN_LIFETIME_STATS_SYNC_CRON="0 4 * * *"
CLAN_STATS_RECALC_CRON="0 3 * * *"
CLAN_ONLINE_REMINDER_CRON="0 18 * * *"
WEEKLY_REPORT_REMINDER_CRON="0 9 * * *"
WEEKLY_REPORT_GENERATION_CRON="0 8 * * 1"
MONTHLY_REPORT_GENERATION_CRON="0 8 1 * *"
```

Note:

- Ces variables sont lues sur le worker cron (celui avec `ENABLE_CRON_JOBS=true`).
- Si une variable n'est pas definie, le fallback interne du code est utilise.

Important:

- En mode 2 workers, garder `ENABLE_CRON_BOOTSTRAP=false` et declencher le bootstrap via l'endpoint interne securise.
- Activer `ENABLE_CRON_JOBS=true` sur un seul worker cron.
- Mettre `ENABLE_CRON_JOBS=false` sur le worker web.
- Si `CLAN_MATCH_SYNC_TIMEZONE` est absent, la timezone par defaut est `UTC`.
- `CLAN_LIFETIME_STATS_SYNC_CRON` pilote la mise a jour quotidienne des stats PUBG lifetime pour tous les membres actifs.

Verification rapide (systemd):

```bash
sudo systemctl restart pubg-clan-site-web
sudo systemctl restart pubg-clan-site-cron
sudo systemctl status pubg-clan-site-web --no-pager -l
sudo systemctl status pubg-clan-site-cron --no-pager -l
journalctl -u pubg-clan-site-cron -n 200 --no-pager | grep -E "\[Cron\]|scheduled|Skipping"
```

Verification applicative:

- Ouvrir `/clans/[clanId]/settings/cron`
- Dans `Verification configuration`, verifier aussi la presence et la validite de `CLAN_LIFETIME_STATS_SYNC_CRON`.
- Dans `Verification configuration`, verifier `PUBG_API_RATE_LIMIT_RPM (effectif)` pour confirmer la valeur appliquee.
- Dans `Actions manuelles`, le bouton `Sync stats lifetime` permet de lancer un refresh global a la demande.
- Dans `Historique des cron`, verifier des entrees `Sync lifetime quotidienne` avec `source=scheduler`.
- L'historique doit afficher des entrees avec `source=scheduler` (et pas uniquement `manual`).

Reglage RPM via API (Owner/Admin manage_settings):

- `GET /api/settings/pubg-api-rate-limit`
- `POST /api/settings/pubg-api-rate-limit` avec payload JSON `{ "rpm": 12 }`

Monitoring API PUBG (Admin):

- Page: `/settings/pubg-api`
- Endpoint lecture: `GET /api/settings/pubg-api-calls?windowMinutes=60&historyLimit=150`
- La page affiche:
	- KPI de fenetre (total/succes/429/erreurs/latence moyenne)
	- Graphe minute par minute des appels
	- Historique recent des appels (endpoint, statut, duree, retries, erreur)
	- Formulaire de mise a jour du RPM (permission `manage_settings`)

### Reboot app en production (systemd)

Le mode recommande est `systemd` avec 2 workers (web + cron) en standalone Next.js.

### Mode 2 workers (recommande)

Objectif:

- `pubg-clan-site-web.service`: sert l'UI et les API publiques
- `pubg-clan-site-cron.service`: process dedie aux taches planifiees

Variables recommandees:

```env
# Communes
INTERNAL_APP_URL="http://127.0.0.1:3000"
CRON_BOOTSTRAP_SECRET="change-me-long-random-string"

# Worker web
ENABLE_CRON_BOOTSTRAP="false"
ENABLE_CRON_JOBS="false"

# Worker cron
ENABLE_CRON_BOOTSTRAP="false"
ENABLE_CRON_JOBS="true"
```

Pourquoi `ENABLE_CRON_BOOTSTRAP=false` aussi sur le worker cron?

- Le bootstrap cron est declenche explicitement via l'endpoint interne securise
	`POST /api/internal/cron/bootstrap`.
- Cela evite les erreurs de resolution de module instrumentation en mode standalone.

Endpoint interne (secret obligatoire):

- `POST /api/internal/cron/bootstrap`
- Header: `x-cron-bootstrap-secret: <CRON_BOOTSTRAP_SECRET>`
- `GET /api/internal/cron/status`

Exemple de service web:

```ini
[Unit]
Description=PUBG Clan Site Web
After=network.target

[Service]
Type=simple
User=smk
WorkingDirectory=/home/smk/apps/pubg-clan-site
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=ENABLE_CRON_BOOTSTRAP=false
Environment=ENABLE_CRON_JOBS=false
ExecStart=/usr/bin/node /home/smk/apps/pubg-clan-site/.next/standalone/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Exemple de service cron (meme machine, port interne):

```ini
[Unit]
Description=PUBG Clan Site Cron Worker
After=network.target

[Service]
Type=simple
User=smk
WorkingDirectory=/home/smk/apps/pubg-clan-site
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=ENABLE_CRON_BOOTSTRAP=false
Environment=ENABLE_CRON_JOBS=true
Environment=CRON_BOOTSTRAP_SECRET=change-me-long-random-string
ExecStart=/usr/bin/node /home/smk/apps/pubg-clan-site/.next/standalone/server.js
ExecStartPost=/bin/sh -lc 'sleep 2; curl -fsS -X POST http://127.0.0.1:3001/api/internal/cron/bootstrap -H "x-cron-bootstrap-secret: ${CRON_BOOTSTRAP_SECRET}"'
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Verification cron worker:

```bash
curl -fsS http://127.0.0.1:3001/api/internal/cron/status -H "x-cron-bootstrap-secret: <CRON_BOOTSTRAP_SECRET>"
journalctl -u pubg-clan-site-cron --since "10 minutes ago" --no-pager
```

Important:

- ne pas reutiliser l'ancien service unique `pubg-clan-site.service` si vous passez en mode 2 workers
- verifier que seuls `pubg-clan-site-web.service` et `pubg-clan-site-cron.service` sont actifs

```bash
sudo systemctl daemon-reload
sudo systemctl disable --now pubg-clan-site || true
sudo systemctl enable --now pubg-clan-site-web
sudo systemctl enable --now pubg-clan-site-cron
sudo systemctl status pubg-clan-site-web --no-pager -l
sudo systemctl status pubg-clan-site-cron --no-pager -l
```

## Securite

- Ne jamais versionner `.env` ni des logs contenant des secrets.
- Tourner les secrets immediatement en cas d'exposition.
- Eviter de laisser des tokens API dans les historiques Git.
