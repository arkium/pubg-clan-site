## Demarrage local

Prerequis :

- Node.js installe localement
- MariaDB ou MySQL disponible localement
- une base creee pour le projet

### 1. Installer les dependances

```bash
npm install
```

### 2. Creer les variables d'environnement

Copier `.env.example` vers `.env` puis adapter les valeurs locales.

Exemple minimal :

```env
DATABASE_URL="mysql://user:password@localhost:3306/pubg_clan_site"
PUBG_API_KEY="your-pubg-api-key"
PUBG_BASE_URL="https://api.pubg.com"
APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
INTERNAL_APP_URL="http://127.0.0.1:3000"
ENABLE_CRON_JOBS="false"
AUTH_ALLOW_LEGACY_ACTOR_ID="false"
AUTH_BOOTSTRAP_SECRET="change-me-long-random-string"
```

### 3. Initialiser Prisma

Si les migrations doivent etre appliquees :

```bash
npx prisma migrate deploy
```

Si tu veux seulement aligner la base locale sur le schema pendant le dev :

```bash
npx prisma db push
```

### 4. Lancer le projet

```bash
npm run dev
```

L'application sera disponible sur http://localhost:3000.

## Authentification par invitation joueur

Le flux d'acces est desormais base sur une invitation envoyee par Owner/Admin:

1. Owner/Admin ouvre la page `clans/[clanId]/settings/members`.
2. Sur un joueur sans compte, cliquer `Inviter` puis saisir l'email.
3. Le backend cree un token d'activation et envoie un email (stub logue dans la console pour l'instant).
4. Le joueur ouvre le lien `/activate?token=...`, choisit son mot de passe, active son compte.
5. Ensuite connexion via `/login` (email + mot de passe).

### Variables auth utiles

- `AUTH_ALLOW_LEGACY_ACTOR_ID=false` (recommande): desactive le fallback `actorMemberId`/headers.
- `AUTH_ALLOW_LEGACY_ACTOR_ID=true` (transition): autorise temporairement l'ancien mecanisme d'acteur.
- `AUTH_BOOTSTRAP_SECRET`: secret requis pour initialiser l'invitation Owner sans session.

### Emails (Ubuntu / production)

Par defaut, l'application journalise les emails (mode fallback) si SMTP n'est pas configure.

Pour envoyer de vrais emails, definir ces variables:

- `SMTP_HOST`
- `SMTP_PORT` (souvent `587`)
- `SMTP_SECURE` (`false` pour STARTTLS sur 587, `true` pour SMTPS sur 465)
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM` (ex: `PUBG Clan <no-reply@votre-domaine.com>`)

Exemple rapide:

```env
SMTP_HOST="smtp.sendgrid.net"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="apikey"
SMTP_PASS="<secret>"
SMTP_FROM="PUBG Clan <no-reply@votre-domaine.com>"
```

Si SMTP n'est pas configure, recuperer le lien d'activation dans les logs:

```bash
grep -E "\[EmailService\]|Lien d'activation" -n /chemin/vers/logs/app.log | tail -n 120
```

Si tu utilises PM2:

```bash
pm2 logs <app-name> --lines 200 | grep -E "\[EmailService\]|Lien d'activation"
```

Si tu utilises systemd:

```bash
journalctl -u <service-name> -n 400 --no-pager | grep -E "\[EmailService\]|Lien d'activation"
```

Note: les endpoints d'invitation retournent aussi `activationUrl` dans la reponse JSON
(bootstrap owner et invitation membre), utile si l'email provider est indisponible.

### Bootstrap Owner (premiere activation)

Quand aucun compte n'existe encore, l'Owner est resolu depuis les donnees joueurs du clan:

1. Le backend cherche un joueur actif avec role `Owner` dans le clan.
2. Si aucun n'est trouve, il prend le premier joueur actif du clan (ordre d'arrivee).
3. Il cree ensuite une invitation d'activation pour ce joueur.

Mode recommande: bootstrap par pseudo Owner (pas besoin de clanId).

Exemple (PowerShell):

```powershell
Invoke-RestMethod -Method POST `
	-Uri "http://localhost:3000/api/auth/bootstrap-owner-invite" `
	-Headers @{ "x-bootstrap-secret" = "change-me-long-random-string" } `
	-ContentType "application/json" `
	-Body '{"ownerPlayerName":"MonPseudoPUBG","platformShard":"steam","email":"owner@example.com"}'
```

Le endpoint retourne `activationUrl` a transmettre a l'Owner.

Compatibilite: l'ancien payload avec `clanId` reste accepte pour les scripts existants.

## Separation local / serveur

## Version Node recommandee

Utiliser Node LTS (22.x) pour le developpement local.

- Recommande: `22.22.3`
- Eviter Node 24.x sur Windows pour `next dev` (crashs natifs V8 observes)

Si vous utilisez nvm:

```bash
nvm install 22.22.3
nvm use 22.22.3
node -v
```

Le projet utilise des variables d'environnement pour separer les contextes local et serveur.

- Prisma lit `DATABASE_URL` depuis `.env`
- Next.js lit automatiquement `.env` et `.env.local`
- les scripts de deploiement serveur peuvent injecter les variables d'environnement systeme puis generer un `.env`

Recommendation pratique :

- local : utiliser `.env` pour toutes les variables backend, en particulier `DATABASE_URL`
- local optionnel : utiliser `.env.local` uniquement pour des overrides de confort non necessaires a Prisma
- serveur : utiliser des variables d'environnement systeme ou un `.env` genere au deploiement

Variables d'URL et role de chaque variable :

- `APP_URL` sert pour les URLs serveur/public.
- `NEXT_PUBLIC_APP_URL` sert au client navigateur, donc doit pointer vers le domaine public HTTPS.
- `INTERNAL_APP_URL` sert aux appels internes (cron vers API locale), donc loopback en HTTP est ideal pour eviter un aller-retour via le proxy.

Pourquoi : les commandes Prisma chargent naturellement `.env`, alors qu'un `DATABASE_URL` present uniquement dans `.env.local` peut ne pas etre vu par `prisma migrate` ou `prisma generate`.

## Initialisation first-run (UI)

Au premier demarrage (base vide: aucun compte et aucun membre), la racine `/` affiche un assistant d'initialisation:

1. Saisir le nom affiche, pseudo PUBG, plateforme et email Owner.
2. L'application cree le premier membre, detecte/cree le clan, puis genere l'invitation Owner.
3. Redirection automatique vers `activationUrl` pour definir le mot de passe.

Cette page d'initialisation est automatiquement desactivee apres creation du premier membre.

L'etat est persiste en base via la table `AppConfig` (cle `setup_completed=true`).
La verification first-run est faite cote serveur avant rendu de la page d'accueil,
pour eviter l'affichage transitoire d'une autre page.

Pendant le first-run, un proxy Next force la navigation vers `/`:

- toutes les pages UI (ex: `/members`, `/clans`, `/login`) sont redirigees vers `/`
- les routes API restent accessibles pour que l'initialisation fonctionne

## Cron de synchronisation des matchs

- `src/instrumentation.ts` initialise les crons cote serveur au demarrage de l'application.
- `ENABLE_CRON_JOBS=true` active le worker cron en production (laisser desactive sur les autres workers).
- `CLAN_MATCH_SYNC_CRON` permet de surcharger l'expression cron (`0 2 * * *` par defaut).
- `CLAN_MATCH_SYNC_TIMEZONE` permet de choisir le fuseau horaire (`UTC` par defaut).
- `WEEKLY_REPORT_GENERATION_CRON` permet de surcharger la generation des rapports hebdo (`0 8 * * 1` par defaut).
- `MONTHLY_REPORT_GENERATION_CRON` permet de surcharger la generation des rapports mensuels (`0 8 1 * *` par defaut).
- `INTERNAL_APP_URL` peut etre utilise pour forcer l'URL interne appelee par les jobs planifies.

### Verification rapide du cron (PowerShell)

Verifier si le cron est initialise :

```powershell
Select-String -Path .\local.log -Encoding Unicode -Pattern "\[Cron\]" | Select-Object -Last 30
```

Messages attendus :

- actif : lignes `scheduled with ...` (ex: `Nightly clan sync scheduled with ...`)
- inactif : `Skipping cron initialization because this worker is not designated to run scheduled jobs`

Verifier une execution de sync (cron ou manuel) :

```powershell
Select-String -Path .\local.log -Encoding Unicode -Pattern "\[Clan Sync\]|\[ApiQueue" | Select-Object -Last 80
```

Tester manuellement les endpoints (utile en local) :

```powershell
Invoke-WebRequest -Uri http://localhost:3000/api/clans/2/sync-matches -Method POST
Invoke-WebRequest -Uri http://localhost:3000/api/clans/2/sync-stats -Method POST
```

Note : sous PowerShell, eviter `curl -X POST ...` car `curl` est un alias de `Invoke-WebRequest`.

## Configuration serveur (production)

### Checklist de base

- Configurer les variables d'environnement de l'application :
	- `DATABASE_URL`
	- `PUBG_API_KEY`
	- `APP_URL`
	- `NEXT_PUBLIC_APP_URL`
	- `INTERNAL_APP_URL`
	- `ENABLE_CRON_JOBS`
	- `MYSQL_ROOT_PASSWORD` (si utilisation de `deploy-phase2.sh`)
- Variables optionnelles pour `deploy-phase2.sh` :
	- `MYSQL_ROOT_USER` (defaut: `root`)
	- `DB_NAME` (defaut: `pubg_clan_site`)
	- `PUBG_BASE_URL` (defaut: `https://api.pubg.com`)
- Appliquer les migrations Prisma :

```bash
npx prisma migrate deploy
```

- Builder puis lancer l'application :

```bash
npm run build
npm start
```

### Worker cron dedie (important)

- Sur une architecture multi-instances, activer `ENABLE_CRON_JOBS=true` sur un seul worker.
- Sur tous les autres workers, forcer `ENABLE_CRON_JOBS=false` pour eviter les executions en double.

### Verifier le cron en serveur Linux

Verifier les logs d'initialisation et d'execution :

```bash
grep -E "\[Cron\]|\[Clan Sync\]|\[ApiQueue" -n /home/smk/public_html/local.log | tail -n 120
```

Messages attendus :

- actif : lignes `scheduled with ...`
- inactif : `Skipping cron initialization because this worker is not designated to run scheduled jobs`

Tester manuellement les endpoints de sync sur l'instance locale :

```bash
curl -X POST http://127.0.0.1:3000/api/clans/2/sync-matches
curl -X POST http://127.0.0.1:3000/api/clans/2/sync-stats
```

### Recommendation INTERNAL_APP_URL

- En production, preferer une URL interne locale (ex: `http://127.0.0.1:3000`) pour `INTERNAL_APP_URL`.
- Cela evite de faire sortir puis rerentrer les appels cron via le proxy public.

## Remediation en cas de fuite de secret

Si un token est detecte par GitGuardian ou GitHub Secret Scanning :

1. Revoquer immediatement le token chez le provider (ici PUBG) puis en generer un nouveau.
2. Remplacer la valeur sur toutes les plateformes (CI/CD, App Service, serveur, local).
3. Verifier que les secrets ne sont plus presents dans l'etat courant du repo.
4. Si le secret a ete pousse, purger l'historique Git puis forcer la mise a jour distante.

Commande de purge historique (exemple pour `.env`) :

```bash
git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch .env' --prune-empty --tag-name-filter cat -- --all
git push origin --force --all
git push origin --force --tags
```

Note: apres reecriture d'historique, chaque collaborateur doit resynchroniser son clone proprement.
