# Déploiement sur Contabo — Masjid Al Nour

Guide complet pour mettre le site en ligne sur ton VPS Contabo, avec ton nom de
domaine, en HTTPS. Remplace partout `votredomaine.com` par ton vrai domaine et
`XX.XX.XX.XX` par l'adresse IP de ton VPS (visible dans ton panneau Contabo).

---

## 0. Prérequis

- Un VPS Contabo avec **Ubuntu 22.04 ou 24.04** (le choix le plus simple à la commande).
- Ton nom de domaine, avec accès à sa configuration DNS (chez ton registrar).
- Un accès SSH au VPS (identifiants fournis par Contabo par e-mail).

---

## 1. Pointer le domaine vers le VPS

Chez ton registrar (là où tu as acheté le domaine), ajoute un enregistrement DNS :

| Type | Nom | Valeur |
|---|---|---|
| A | `@` (ou vide) | `XX.XX.XX.XX` (IP de ton VPS) |
| A | `www` | `XX.XX.XX.XX` |

La propagation peut prendre de quelques minutes à quelques heures. Tu peux vérifier avec :
```bash
ping votredomaine.com
```
(doit répondre avec l'IP de ton VPS)

---

## 2. Première connexion et sécurité de base

```bash
ssh root@XX.XX.XX.XX
```

Mets le système à jour, crée un utilisateur dédié (éviter de tout faire en `root`), et active un pare-feu simple :

```bash
apt update && apt upgrade -y

adduser masjid
usermod -aG sudo masjid

ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

Reconnecte-toi avec ce nouvel utilisateur pour la suite :
```bash
ssh masjid@XX.XX.XX.XX
```

---

## 3. Installer Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # doit afficher v20.x
```

---

## 4. Installer et configurer PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres psql
```

Dans l'invite PostgreSQL qui s'ouvre :
```sql
CREATE DATABASE masjid_al_nour;
CREATE USER masjid_user WITH ENCRYPTED PASSWORD 'choisis-un-mot-de-passe-solide';
GRANT ALL PRIVILEGES ON DATABASE masjid_al_nour TO masjid_user;
\q
```

Garde ce mot de passe — il ira dans le fichier `.env` du backend à l'étape 7.

**Pour te connecter avec pgAdmin4 depuis ton PC** (facultatif mais pratique) : le plus
sûr est un tunnel SSH plutôt que d'ouvrir le port 5432 publiquement :
```bash
ssh -L 5433:localhost:5432 masjid@XX.XX.XX.XX
```
Puis dans pgAdmin4, connecte-toi sur `localhost:5433` avec les identifiants créés ci-dessus.

---

## 5. Installer Nginx et Certbot (HTTPS)

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

---

## 6. Envoyer le code sur le VPS

Depuis ton PC (pas sur le VPS), avec le zip du projet — ou mieux, via un dépôt Git si tu en as un :

```bash
# Depuis ton PC, dans le dossier du projet dézippé :
scp -r Mosque masjid@XX.XX.XX.XX:/home/masjid/
```

Sur le VPS :
```bash
sudo mkdir -p /var/www/masjid
sudo mv /home/masjid/Mosque/* /var/www/masjid/
sudo mv /home/masjid/Mosque/backend /var/www/masjid/backend
sudo mv /home/masjid/Mosque/deploy /var/www/masjid/deploy
sudo chown -R masjid:masjid /var/www/masjid
cd /var/www/masjid
```

Le dossier `frontend` attendu par `nginx.conf` correspond au dossier racine du
projet (celui qui contient `package.json`, `src/`, `index.html`) — si besoin,
renomme-le :
```bash
mv /var/www/masjid/Mosque /var/www/masjid/frontend   # adapte selon ta structure réelle
```

---

## 7. Configurer et démarrer le backend

```bash
cd /var/www/masjid/backend
cp ../deploy/backend.env.production.example .env
nano .env   # remplace DATABASE_URL, CORS_ORIGIN, et génère les clés VAPID (commande ci-dessous)
```

Générer les clés de notifications push (une seule fois) :
```bash
npx web-push generate-vapid-keys
```
Colle les deux clés affichées dans `.env`.

Puis :
```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
npm run build
```

Installer le service permanent (redémarre tout seul si le VPS reboote) :
```bash
sudo cp /var/www/masjid/deploy/masjid-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable masjid-backend
sudo systemctl start masjid-backend
sudo systemctl status masjid-backend   # doit afficher "active (running)"
```

---

## 8. Configurer et construire le frontend

```bash
cd /var/www/masjid/frontend
cp ../deploy/.env.production.example .env.production
nano .env.production   # remplace votredomaine.com par ton vrai domaine
npm install
npm run build
```

Ça crée le dossier `dist/` que Nginx va servir.

---

## 9. Configurer Nginx

```bash
sudo cp /var/www/masjid/deploy/nginx.conf /etc/nginx/sites-available/masjid
sudo nano /etc/nginx/sites-available/masjid   # remplace votredomaine.com partout
sudo ln -s /etc/nginx/sites-available/masjid /etc/nginx/sites-enabled/
sudo nginx -t   # doit dire "syntax is ok" et "test is successful"
sudo systemctl reload nginx
```

À ce stade, `http://votredomaine.com` (encore en HTTP) devrait déjà afficher le site.

---

## 10. Activer le HTTPS

```bash
sudo certbot --nginx -d votredomaine.com -d www.votredomaine.com
```

Certbot modifie automatiquement la config Nginx pour rediriger vers HTTPS et
renouvelle le certificat tout seul tous les 90 jours (aucune action de ta part).

Vérifie que ça marche :
```bash
curl -I https://votredomaine.com
```

---

## 11. Tester

- Écran public : `https://votredomaine.com`
- Régie admin : `https://votredomaine.com/admin`
- App mobile : `https://votredomaine.com/mobile` (ou scanner le QR code depuis l'écran public/admin)
- Notifications : ouvre `/mobile` sur un téléphone, ajoute à l'écran d'accueil, active les notifications — ça devrait maintenant fonctionner partout (HTTPS ✅).

---

## 12. Mises à jour futures

Une fois que tu modifies le code (nouvelles fonctionnalités, corrections), réenvoie-le sur le VPS puis :
```bash
cd /var/www/masjid
bash deploy/deploy.sh
```
Ce script réinstalle les dépendances, reconstruit le frontend et le backend,
applique les nouvelles migrations de base de données, et redémarre le service —
en une seule commande.

---

## En cas de souci

- Logs du backend : `sudo journalctl -u masjid-backend -f`
- Logs Nginx : `sudo tail -f /var/log/nginx/error.log`
- Le site ne charge pas : vérifie `sudo nginx -t` et `sudo systemctl status masjid-backend`
- Erreur CORS dans la console du navigateur : vérifie que `CORS_ORIGIN` dans `backend/.env` correspond exactement à `https://votredomaine.com` (sans slash final)
