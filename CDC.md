# Cahier des charges — Mise en ligne de "Masjid Al Nour"

Document à transmettre tel quel à la personne qui va s'occuper de l'hébergement.

---

## 1. Contexte

C'est une application web pour une mosquée (Masjid Al Nour, Bamako) composée de
trois parties dans un seul projet :

1. **Écran public** (`/`) — affiché sur un écran/tablette dans la mosquée : horaires de prière, calendrier, annonces.
2. **Régie admin** (`/admin`) — interface privée pour gérer les annonces, les horaires, le nom de la mosquée, etc. Ce lien n'est jamais affiché publiquement, il est donné directement à l'administrateur de la mosquée.
3. **App mobile** (`/mobile`) — version PWA installable sur téléphone (Coran, vie du Prophète ﷺ, notifications de prière).

Stack technique : frontend en TypeScript/Vite (pas de framework), backend en NestJS + Prisma + PostgreSQL.

---

## 2. Ce qui est fourni

- Le code source complet, en zip (`MosqueApp-main`).
- **`DEPLOYMENT.md`** à la racine du zip : guide pas-à-pas complet, avec toutes les commandes prêtes à copier-coller, de la connexion SSH jusqu'au HTTPS actif. **C'est le document de référence technique — suis-le dans l'ordre.**
- Un dossier `deploy/` contenant tous les fichiers de configuration prêts à l'emploi :
  - `nginx.conf` — configuration du serveur web
  - `masjid-backend.service` — service système pour faire tourner le backend en permanence
  - `deploy.sh` — script pour redéployer une mise à jour en une commande
  - `.env.production.example` et `backend.env.production.example` — modèles de variables d'environnement

---

## 3. Ce qu'il faut faire

Suivre **`DEPLOYMENT.md`** intégralement, sur le VPS Contabo fourni. En résumé, dans l'ordre :

1. Pointer le nom de domaine (fourni par le client) vers l'IP du VPS (enregistrement DNS de type A).
2. Sécuriser le VPS de base (utilisateur non-root, pare-feu UFW).
3. Installer Node.js 20, PostgreSQL, Nginx, Certbot.
4. Créer la base PostgreSQL et l'utilisateur associé.
5. Déployer le code, configurer les fichiers `.env` (backend et frontend) avec les vraies valeurs (domaine, mot de passe DB, clés VAPID à générer).
6. Lancer les migrations Prisma (`prisma migrate deploy`) et le seed initial.
7. Construire le frontend (`npm run build`) et le backend.
8. Configurer Nginx pour servir le frontend et rediriger `/api` et `/uploads` vers le backend (port 3000, interne uniquement — ne pas exposer ce port publiquement).
9. Activer le service backend en permanence via systemd (`masjid-backend.service`).
10. Activer le HTTPS avec Certbot (`certbot --nginx`) — certificat Let's Encrypt, renouvellement automatique.

---

## 4. Comportement attendu à la fin (critères de validation)

Le travail est terminé quand **tout** ce qui suit est vrai :

- [ ] `https://votredomaine.com` affiche l'écran public, en HTTPS (cadenas vert, pas d'avertissement).
- [ ] `https://votredomaine.com/admin` affiche la régie admin (accessible uniquement via ce lien direct — aucun bouton nulle part n'y mène depuis l'écran public).
- [ ] `https://votredomaine.com/mobile` affiche l'app mobile, installable ("Ajouter à l'écran d'accueil").
- [ ] Le QR code affiché sur l'écran public et dans l'admin pointe bien vers `https://votredomaine.com/mobile` et fonctionne en le scannant depuis un téléphone (avec sa propre connexion 4G, pas besoin d'être sur le même Wi-Fi que le serveur).
- [ ] Une modification faite dans la régie admin (nom de la mosquée, annonce, etc.) apparaît sur l'écran public **en moins de 20 secondes**, sans rafraîchir manuellement la page, y compris depuis deux appareils différents.
- [ ] Une annonce vocale enregistrée dans l'admin est audible depuis un autre appareil (pas seulement celui qui l'a enregistrée) — ça valide que l'upload audio fonctionne et est bien servi par le serveur.
- [ ] Les notifications push fonctionnent sur un vrai téléphone après installation de l'app mobile (bouton "Notifications" dans l'app → autorisation demandée → une notification de test doit pouvoir arriver).
- [ ] Le certificat HTTPS se renouvelle automatiquement (vérifier que `certbot` a bien programmé une tâche de renouvellement : `sudo certbot renew --dry-run` doit réussir sans erreur).
- [ ] Si le VPS redémarre, le site et le backend redémarrent automatiquement tout seuls (pas d'intervention manuelle nécessaire) — à tester avec `sudo reboot` puis vérifier que tout revient en ligne.

---

## 5. Informations à demander AU CLIENT avant de commencer

- Le nom de domaine exact à utiliser.
- Les accès au panneau Contabo (ou juste l'IP + identifiants SSH du VPS si déjà créé).
- Les accès à la configuration DNS du domaine (chez le registrar), si le client préfère pointer le domaine lui-même plutôt que de donner ses accès.
- Une adresse e-mail de contact pour la mosquée (utilisée dans les clés VAPID et les emails de la mosquée).

## 6. Informations à RENDRE au client à la fin

- L'URL finale du site (`https://votredomaine.com`).
- Le lien direct de la régie admin (`https://votredomaine.com/admin`) — à transmettre uniquement à l'administrateur de la mosquée, jamais publié ailleurs.
- Les identifiants de connexion à la base PostgreSQL (pour qu'il puisse s'y connecter avec pgAdmin4 via tunnel SSH s'il le souhaite — la méthode est documentée dans `DEPLOYMENT.md` §4).
- Les identifiants SSH du VPS (si ce n'est pas le client qui les a fournis initialement).

## 7. Sécurité — à respecter impérativement

- Ne jamais commiter ou partager le fichier `.env` en clair dans un dépôt public.
- Ne pas ouvrir le port PostgreSQL (5432) publiquement — utiliser un tunnel SSH pour l'accès distant (pgAdmin4), comme documenté.
- Ne pas exposer le port 3000 (backend) publiquement — tout doit passer par Nginx (ports 80/443 uniquement, redirigés vers 443 par Certbot).
- Utiliser un mot de passe robuste pour l'utilisateur PostgreSQL et pour l'utilisateur système du VPS.

---

## En cas de blocage

`DEPLOYMENT.md` contient une section "En cas de souci" avec les commandes de logs
à consulter (`journalctl`, logs Nginx) et les erreurs les plus courantes.