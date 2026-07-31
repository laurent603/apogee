# Déploiement APOGEE sur Plesk

## Étape 1 — Préparer les variables d'environnement

Créez un fichier `.env.local` à la racine du projet et remplissez ces valeurs :

```
DATABASE_URL="file:./apogee.db"
NEXTAUTH_URL="https://votre-domaine.com"
NEXTAUTH_SECRET="collez-ici-le-secret-généré-ci-dessous"
FACEBOOK_CLIENT_ID="votre-facebook-app-id"
FACEBOOK_CLIENT_SECRET="votre-facebook-app-secret"
ANTHROPIC_API_KEY="sk-ant-xxxxxxxx"
META_API_VERSION="v21.0"
```

Pour générer le NEXTAUTH_SECRET, exécutez :
```bash
openssl rand -base64 32
```

## Étape 2 — Facebook App Setup

1. Allez sur https://developers.facebook.com
2. Créez une nouvelle app → Type "Business"
3. Ajoutez le produit "Facebook Login"
4. Dans Paramètres > Basique : notez l'App ID et App Secret
5. Dans Facebook Login > Paramètres : ajoutez `https://votre-domaine.com/api/auth/callback/facebook` dans "URI de redirection OAuth valides"
6. Permissions à demander : `email`, `public_profile`, `ads_management`, `ads_read`, `business_management`

## Étape 3 — Déploiement sur Plesk

### Installation initiale
```bash
npm install
npm run db:push
npm run build
npm start
```

### Avec PM2 (recommandé pour maintenir l'app active)
```bash
npm install -g pm2
npm install
npm run db:push
npm run build
pm2 start npm --name "apogee" -- start
pm2 save
pm2 startup
```

### Configuration Plesk
1. Dans Plesk, allez dans votre domaine > Node.js
2. Mode : Production
3. Fichier de démarrage : `server.js` (ou configurez un proxy vers le port 3000)
4. Variables d'environnement : copiez le contenu de `.env.local`

## Étape 4 — Mises à jour futures
```bash
git pull  # ou re-uploadez les fichiers
npm install
npm run db:push
npm run build
pm2 restart apogee
```

## Notes importantes
- La base de données SQLite est dans `apogee.db` — sauvegardez ce fichier régulièrement
- Ne commitez jamais le fichier `.env.local`
- L'app tourne sur le port 3000 par défaut
