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

## Separation local / serveur

Le projet utilise des variables d'environnement pour separer les contextes local et serveur.

- Prisma lit `DATABASE_URL` depuis `.env`
- Next.js lit automatiquement `.env` et `.env.local`
- les scripts de deploiement serveur peuvent injecter les variables d'environnement systeme puis generer un `.env`

Recommendation pratique :

- local : utiliser `.env` pour toutes les variables backend, en particulier `DATABASE_URL`
- local optionnel : utiliser `.env.local` uniquement pour des overrides de confort non necessaires a Prisma
- serveur : utiliser des variables d'environnement systeme ou un `.env` genere au deploiement

Pourquoi : les commandes Prisma chargent naturellement `.env`, alors qu'un `DATABASE_URL` present uniquement dans `.env.local` peut ne pas etre vu par `prisma migrate` ou `prisma generate`.

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
