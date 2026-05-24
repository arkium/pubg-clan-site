# PUBG Clan Site

Application Next.js pour gestion de clan PUBG: membres, roles, invitations par email, stats et rapports.

## DEV (essentiel)

### Prerequis

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

APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
INTERNAL_APP_URL="http://127.0.0.1:3000"

ENABLE_CRON_JOBS="false"
AUTH_ALLOW_LEGACY_ACTOR_ID="false"
AUTH_BOOTSTRAP_SECRET="change-me-long-random-string"
```

Important:

- Prisma lit `DATABASE_URL` depuis `.env`.
- Eviter de mettre `DATABASE_URL` uniquement dans `.env.local`.

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

## PROD (essentiel)

### Checklist

1. Definir toutes les variables critiques (`DATABASE_URL`, `PUBG_API_KEY`, URLs, SMTP, auth secret).
2. Appliquer les migrations:

```bash
npx prisma migrate deploy
```

3. Build + start:

```bash
npm run build
npm start
```

### Recommandations URLs

- `APP_URL`: URL publique serveur (ex: `https://app.mondomaine.com`)
- `NEXT_PUBLIC_APP_URL`: meme domaine public cote navigateur
- `INTERNAL_APP_URL`: URL interne locale pour les appels cron (ex: `http://127.0.0.1:3000`)

### Cron en production

- Activer `ENABLE_CRON_JOBS=true` sur un seul worker
- Garder `ENABLE_CRON_JOBS=false` sur les autres workers

Verification logs (exemple Linux):

```bash
grep -E "\[Cron\]|\[Clan Sync\]|\[ApiQueue" -n /path/to/app.log | tail -n 120
```

## Securite

- Ne jamais versionner `.env` ni des logs contenant des secrets.
- Tourner les secrets immediatement en cas d'exposition.
- Eviter de laisser des tokens API dans les historiques Git.
