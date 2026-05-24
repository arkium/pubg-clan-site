#!/bin/bash

set -e

if [ "$EUID" -ne 0 ]; then
  echo "❌ Ce script doit être exécuté en tant que ROOT"
  exit 1
fi

echo "🚀 Démarrage du déploiement Phase 2..."

DEPLOY_PATH="/home/smk/public_html"
DB_NAME="${DB_NAME:-pubg_clan_site}"
MYSQL_ROOT_USER="${MYSQL_ROOT_USER:-root}"

required_vars=(DATABASE_URL APP_URL NEXT_PUBLIC_APP_URL INTERNAL_APP_URL MYSQL_ROOT_PASSWORD)
for var_name in "${required_vars[@]}"; do
  if [ -z "${!var_name}" ]; then
    echo "❌ Variable d'environnement manquante: $var_name"
    exit 1
  fi
done

PUBG_API_KEY="${PUBG_API_KEY:-}"
PUBG_BASE_URL="${PUBG_BASE_URL:-https://api.pubg.com}"
ENABLE_CRON_JOBS="${ENABLE_CRON_JOBS:-true}"

echo "✅ Vérification des outils..."
node -v
npm -v
mysql --version

if [ ! -d "$DEPLOY_PATH/.git" ]; then
  echo "✅ Clonage du repository..."
  git clone https://github.com/arkium/pubg-clan-site.git $DEPLOY_PATH
else
  echo "✅ Git pull des merges Phase 2..."
  cd $DEPLOY_PATH
  git pull origin main
fi

cd $DEPLOY_PATH

echo "✅ Installation des dépendances npm..."
npm install

echo "✅ Création de la base de données..."
mysql -u "$MYSQL_ROOT_USER" -p"$MYSQL_ROOT_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS $DB_NAME;"

echo "✅ Création du fichier .env..."
cat > .env << EOF
DATABASE_URL="$DATABASE_URL"
PUBG_API_KEY="$PUBG_API_KEY"
PUBG_BASE_URL="$PUBG_BASE_URL"
APP_URL="$APP_URL"
NEXT_PUBLIC_APP_URL="$NEXT_PUBLIC_APP_URL"
INTERNAL_APP_URL="$INTERNAL_APP_URL"
ENABLE_CRON_JOBS="$ENABLE_CRON_JOBS"
EOF

echo "✅ Exécution des migrations Prisma..."
npx prisma migrate deploy

echo "✅ Build du projet Next.js..."
npm run build

echo "✅ Changement des permissions à smk:smk..."
chown -R smk:smk $DEPLOY_PATH

echo "✅ Vérification des fichiers critiques..."
ls -la $DEPLOY_PATH/.next | head -10 || echo "⚠️ Dossier .next"
ls -la $DEPLOY_PATH/node_modules | head -5

echo ""
echo "🎉 Déploiement Phase 2 TERMINÉ !"
echo ""
echo "📝 Prochaines étapes :"
echo "1. Se connecter en tant que smk: su - smk"
echo "2. Lancer le serveur: cd /home/smk/public_html && npm start"
echo "3. Ou avec PM2: pm2 start 'npm start' --name pubg-clan-site"
echo ""
echo "✅ Vérifier: https://smk.arkium.group"
