#!/bin/bash
# Script de (re)déploiement — Masjid Al Nour
# À lancer sur le VPS, depuis /var/www/masjid, après chaque mise à jour du code :
#   bash deploy/deploy.sh
set -e

echo "== Frontend =="
cd /var/www/masjid/frontend
npm install
npm run build

echo "== Backend =="
cd /var/www/masjid/backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run build

echo "== Redémarrage du service =="
sudo systemctl restart masjid-backend
sudo systemctl status masjid-backend --no-pager

echo "== Terminé =="
