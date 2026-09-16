# Masjid Al Nour

Application d'affichage dynamique pour mosquee : ecran public Vite et API NestJS avec PostgreSQL/Prisma.

## Demarrage

Prerequisites : Node.js 20+.

### Configuration Supabase

1. Crée un compte gratuit sur https://supabase.com
2. Crée un nouveau projet
3. Récupère l'URL PostgreSQL directe depuis les paramètres du projet (`Settings > Database > Connection string`)
4. Remplace `DATABASE_URL` dans `backend/.env`

Exemple de chaîne de connexion Prisma/Supabase :

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres?sslmode=require"
```

Important : utilise la connexion directe PostgreSQL, pas le pooler, et inclue `?sslmode=require`.

### Installation

```powershell
Set-Location backend
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run start:dev
```

Dans un second terminal :

```powershell
npm install
npm run dev
```

- Frontend : http://localhost:5173
- API : http://localhost:3000
- Tableau public : `GET /api/public/dashboard`
- Publication admin : `POST /api/admin/mosques/:mosqueId/announcements`
- Reglages : `PATCH /api/admin/mosques/:mosqueId/settings`
- Horaires : `PATCH /api/admin/prayers/:id`

Le fichier `backend/.env` contient la configuration locale et est ignore par Git. Pour une base distante, remplacer `DATABASE_URL` par l'URL PostgreSQL du fournisseur choisi.

### Notifications Push

Dans `backend`, générez les clés avec `npx web-push generate-vapid-keys`, puis ajoutez `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY` dans `backend/.env`. Appliquez ensuite le schéma avec `npm run prisma:migrate`. Le mobile doit être servi en HTTPS (ou depuis localhost) pour demander les notifications.

### Adresses de l’application

- Écran public : `/`
- Application mobile : `/mobile`
- Régie privée : `/admin`
