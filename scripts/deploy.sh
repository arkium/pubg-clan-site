#!/usr/bin/env bash
# Mise à jour courante du serveur de production — docs/ops/deployment.md, « Mise à jour courante du serveur ».
#
#   sudo bash /home/smk/apps/pubg-clan-site/scripts/deploy.sh
#
# Git tourne en root (il a l'accès au dépôt distant) ; tout ce qui écrit dans le projet tourne en smk, sinon le .env
# recopié par le build appartient à root et le site démarre sans variables (incident du 2026-10-10).
# Le .env n'est jamais lu ni réécrit ici. Un échec arrête le script avant le redémarrage des services.

set -euo pipefail

APP=/home/smk/apps/pubg-clan-site
APP_USER=smk
SERVICES=(
  pubg-clan-site-web
  pubg-clan-site-cron
  pubg-clan-site-telemetry-worker
  pubg-clan-site-telemetry-aggregates
)

git_root() { git -c safe.directory="$APP" "$@"; }
as_app() { sudo -u "$APP_USER" -H "$@"; }

# Tout le corps est dans une fonction : bash l'a lu en entier avant que git pull ne remplace ce fichier.
main() {
  if [ "$EUID" -ne 0 ]; then
    echo "❌ À lancer en root (sudo bash $0)" >&2
    exit 1
  fi

  cd "$APP"

  echo "▶ Code"
  git_root fetch origin
  git_root checkout main || git_root checkout -b main origin/main
  git_root pull origin main
  chown -R "$APP_USER:$APP_USER" "$APP"   # ce que git vient d'écrire en root revient à smk

  echo "▶ Dépendances et base"
  as_app npm install
  as_app npx prisma migrate deploy
  as_app npx prisma generate

  echo "▶ Build (le site est coupé jusqu'à la fin du build)"
  as_app rm -rf .next
  as_app npm run build

  if ! as_app test -r .env || ! as_app test -r .next/standalone/.env; then
    echo "❌ .env ou .next/standalone/.env illisible par $APP_USER : services non redémarrés" >&2
    exit 1
  fi
  echo "✅ .env lisibles par $APP_USER"

  echo "▶ Services"
  systemctl daemon-reload
  systemctl restart "${SERVICES[@]}"
  systemctl status "${SERVICES[@]}" --no-pager -l
}

main "$@"
