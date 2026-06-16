# Environnement de développement — Windows / VSCode

Guide d'installation et de configuration pour développer sur ce projet sous Windows avec VSCode.

---

## Prérequis

### Node.js 22 LTS

Le projet bloque explicitement Node 24+ via le script `predev`. Utiliser Node **22 LTS** uniquement.

**Via nvm-windows (recommandé — permet de switcher facilement) :**

1. Télécharger et installer [nvm-windows](https://github.com/coreybutler/nvm-windows/releases) (`nvm-setup.exe`)
2. Ouvrir un nouveau terminal PowerShell en administrateur :
   ```powershell
   nvm install 22.22.3
   nvm use 22.22.3
   node --version   # doit afficher v22.22.x
   ```
3. Le fichier `.nvmrc` à la racine du projet épingle la version — `nvm use` sans argument appliquera la bonne version.

**Via installeur direct :**

Télécharger Node.js 22 LTS depuis [nodejs.org](https://nodejs.org/). Vérifier que la commande `node --version` retourne bien `v22.x.x` et non `v24.x.x`.

### MySQL / MariaDB local

Plusieurs options :

| Option | Installation | Port par défaut |
|---|---|---|
| **Laragon** (recommandé Windows) | [laragon.org](https://laragon.org/) — inclut MariaDB, Apache, phpMyAdmin | 3306 |
| **XAMPP** | [apachefriends.org](https://www.apachefriends.org/) — inclut MariaDB | 3306 |
| **MariaDB standalone** | [mariadb.org/download](https://mariadb.org/download/) | 3306 |
| **MySQL Community** | [dev.mysql.com/downloads](https://dev.mysql.com/downloads/mysql/) | 3306 |

Créer la base de données après installation :
```sql
CREATE DATABASE pubg_clan_site CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

---

## Extensions VSCode recommandées

Installer via le marketplace ou via `Ctrl+Shift+X` :

| Extension | ID | Rôle |
|---|---|---|
| **Prisma** | `prisma.prisma` | Syntaxe, autocomplétion et formatage `schema.prisma` |
| **ESLint** | `dbaeumer.vscode-eslint` | Lint TypeScript en temps réel |
| **Tailwind CSS IntelliSense** | `bradlc.vscode-tailwindcss` | Autocomplétion classes Tailwind dans JSX |
| **Pretty TypeScript Errors** | `yoavbls.pretty-ts-errors` | Messages d'erreur TypeScript lisibles |
| **DotENV** | `mikestead.dotenv` | Coloration syntaxique des fichiers `.env` |

Optionnel mais utile :
- **GitLens** (`eamodio.gitlens`) — historique git inline
- **Error Lens** (`usernamehannah.error-lens`) — erreurs inline dans l'éditeur

---

## Installation

```bash
npm install
```

---

## Configuration `.env`

Créer un fichier `.env` à la racine du projet. Variables minimales pour démarrer :

```env
# Base de données
DATABASE_URL="mysql://root:@localhost:3306/pubg_clan_site"

# API PUBG (obligatoire pour les syncs PUBG — https://developer.pubg.com)
PUBG_API_KEY="votre-cle-api-pubg"
PUBG_BASE_URL="https://api.pubg.com"
PUBG_API_RATE_LIMIT_RPM="10"

# Application
APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
INTERNAL_APP_URL="http://127.0.0.1:3000"

# Auth
AUTH_BOOTSTRAP_SECRET="changez-moi-chaine-aleatoire-longue"
AUTH_ALLOW_LEGACY_ACTOR_ID="false"

# Crons — désactivés en dev (le worker cron tourne dans le process Next.js uniquement si true)
ENABLE_CRON_JOBS="false"

# Télémétrie — désactivée par défaut en dev
TELEMETRY_SYNC_ENABLED="false"
```

> **Note :** Prisma lit `DATABASE_URL` depuis `.env` (pas `.env.local`). Ne pas mettre `DATABASE_URL` uniquement dans `.env.local`.

Pour le `.env` complet avec toutes les variables de production (SMTP, crons, télémétrie avancée), voir [deployment.md](deployment.md).

---

## Base de données

### Appliquer les migrations

```bash
npx prisma migrate deploy
```

### Vérifier l'état des migrations

```bash
npx prisma migrate status
```

### Alternative sans migrations (synchronisation directe du schéma)

Utile si tu travailles sur une branche avec des changements de schéma non encore migrés :

```bash
npx prisma db push
```

### Ouvrir Prisma Studio (interface DB visuelle)

```bash
npx prisma studio
```

---

## Lancement en développement

### Terminal 1 — Application web

```bash
npm run dev
```

Application disponible sur [http://localhost:3000](http://localhost:3000).

> Le mode dev utilise Webpack avec `--max-old-space-size=8192` (8 Go) pour éviter les crashs lors des rechargements à chaud. Turbopack (`npm run dev:turbopack`) est disponible mais moins stable sur ce projet.

### Terminal 2 — Worker télémétrie resync (optionnel)

Nécessaire uniquement si `TELEMETRY_SYNC_ENABLED=true` dans `.env` :

```bash
npm run telemetry:worker
```

Pour une passe unique puis exit (pratique pour tester) :

```bash
npm run telemetry:worker:once
```

### Terminal 3 — Worker agrégats télémétrie (optionnel)

```bash
npm run telemetry:aggregates:worker
# ou passe unique :
npm run telemetry:aggregates:worker:once
```

**Configuration multi-terminaux VSCode recommandée :**

Dans VSCode, utiliser `Ctrl+Shift+5` (diviser le terminal) ou le panneau Terminaux pour avoir les 3 terminaux visibles simultanément. Nommer chaque terminal (`web`, `telemetry`, `aggregates`) via clic droit sur l'onglet.

---

## Problèmes courants sous Windows

### Port 3000 déjà utilisé

```powershell
# Trouver le PID qui occupe le port 3000
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess

# Terminer le process (remplacer <PID> par le numéro trouvé)
Stop-Process -Id <PID> -Force

# Puis relancer
npm run dev
```

### Mauvaise version de Node détectée

Le script `predev` bloque si Node >= 24 :
```
Node 24 detecte. Utilise Node 22.22.3 (voir .nvmrc).
```

Solution avec nvm-windows :
```powershell
nvm use 22.22.3
# ou simplement dans le dossier du projet :
nvm use
```

Vérification :
```powershell
node --version   # attendu : v22.x.x
```

### Erreur Prisma — variable DATABASE_URL manquante

Prisma ne lit que `.env`, pas `.env.local`. Vérifier que `DATABASE_URL` est bien dans `.env` à la racine.

### Le worker télémétrie crash avec exit code 5

C'est le bug `Readable.toWeb()` de Node.js 22. Le code contient déjà le correctif (adaptateur stream manuel dans `resync-files.ts`). Si le crash persiste, vérifier que le fichier n'a pas été modifié. Voir [telemetry/worker.md](../telemetry/worker.md) pour le détail.

### Les crons ne se déclenchent pas en dev

Normal : `ENABLE_CRON_JOBS="false"` dans `.env` les désactive. Les actions des crons peuvent être déclenchées manuellement depuis `/clans/[clanId]/settings/cron` ou via les routes API.

---

## Commandes utiles

```bash
npm run dev                        # Lancer l'app en dev
npm run build                      # Build production
npm run lint                       # ESLint
npm run test:telemetry             # Tests Vitest (télémétrie uniquement)
npm run telemetry:batch -- --help  # CLI batch télémétrie
npm run sync:pubg-assets           # Mettre à jour les dictionnaires PUBG
npx prisma studio                  # Interface DB visuelle
npx prisma migrate status          # État des migrations
npx prisma generate                # Régénérer le client Prisma après modif schéma
```
