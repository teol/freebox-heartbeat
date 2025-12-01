# Guide de test de l'API Freebox

Ce guide explique comment s'authentifier avec votre Freebox et exécuter le script de test pour voir le retour brut de l'API lors d'un `getConnectionInfo()`.

## Prérequis

1. Node.js 22+ installé
2. Yarn 4 (géré par Corepack)
3. Accès à votre Freebox sur le réseau local

## Étape 1 : Configuration initiale

### Installer les dépendances

```bash
yarn install
```

### Créer le fichier de configuration

Copiez le fichier d'exemple et configurez vos paramètres :

```bash
cp .env.example .env
```

Éditez le fichier `.env` et ajustez si nécessaire :

```env
FREEBOX_API_URL=https://mafreebox.freebox.fr/api/v8
FREEBOX_APP_ID=fr.freebox.heartbeat
TOKEN_FILE=token.json
```

**Note:** Si votre Freebox n'est pas accessible via `mafreebox.freebox.fr`, utilisez son adresse IP locale (par exemple `http://192.168.1.254/api/v8`).

## Étape 2 : Authentification avec la Freebox

L'authentification se fait en deux temps et nécessite une **validation manuelle sur l'écran LCD de votre Freebox**.

### Lancer la procédure d'autorisation

```bash
yarn build
yarn authorize
```

### Valider sur la Freebox

1. Le script affichera un message vous demandant de **valider l'accès sur votre Freebox**
2. Allez sur **l'écran LCD de votre Freebox Delta**
3. Un message s'affichera vous demandant d'autoriser l'application `Freebox Heartbeat Monitor`
4. **Appuyez sur ✓ (Oui)** pour accepter

### Confirmation

Une fois validé, le script créera automatiquement un fichier `token.json` contenant votre jeton d'authentification :

```json
{
  "app_token": "votre-token-ici",
  "track_id": 12345,
  "app_id": "fr.freebox.heartbeat",
  "created_at": "2024-12-01T10:00:00.000Z"
}
```

**⚠️ Important:** Ne partagez jamais ce fichier, il contient vos identifiants d'accès !

## Étape 3 : Exécuter le script de test

Une fois authentifié, vous pouvez exécuter le script de test :

```bash
yarn build
node --enable-source-maps dist/test-api.js
```

Ou en mode développement (sans build) :

```bash
tsx src/test-api.ts
```

## Sortie attendue

Le script affichera :

```
=== Freebox API Test Script ===

API URL: https://mafreebox.freebox.fr/api/v8
App ID: fr.freebox.heartbeat
Token file: token.json

📖 Reading app token from token.json...
✓ App token loaded

🔐 Logging in to Freebox...
✓ Session opened

📡 Fetching connection info from Freebox API...

=== RAW API RESPONSE ===
{
    "ipv4": "xxx.xxx.xxx.xxx",
    "state": "up",
    "media": "ftth",
    "bandwidth_down": 1000000000,
    "bandwidth_up": 600000000
}
========================

=== FORMATTED INFO ===
IPv4:           xxx.xxx.xxx.xxx
State:          up
Media:          ftth
Bandwidth Down: 1000000000 bytes/s
Bandwidth Up:   600000000 bytes/s
======================

✓ Test completed successfully

🔒 Logging out...
✓ Logged out successfully
```

## Que contient la réponse de l'API ?

Le retour brut de `getConnectionInfo()` contient les informations suivantes, qui sont ensuite envoyées dans le heartbeat :

- **`ipv4`**: Adresse IPv4 publique attribuée par votre FAI
- **`state`**: État de la connexion (`up`, `down`, `going_up`, `going_down`)
- **`media`**: Type de média utilisé (`ftth` pour fibre, `xdsl`, `ethernet`, etc.)
- **`bandwidth_down`**: Bande passante descendante en bytes/s (ex: 1000000000 = 1 Gbit/s)
- **`bandwidth_up`**: Bande passante montante en bytes/s (ex: 600000000 = 600 Mbit/s)

Ces données sont capturées par le moniteur et envoyées régulièrement au serveur VPS pour détecter les coupures de connexion.

## Dépannage

### Erreur: `token.json not found`

Vous devez d'abord exécuter `yarn authorize` et valider sur l'écran de la Freebox.

### Erreur: `ECONNREFUSED` ou `ETIMEDOUT`

Vérifiez que :
- Vous êtes bien sur le même réseau local que votre Freebox
- L'URL de l'API est correcte dans votre fichier `.env`
- Essayez avec l'IP locale : `http://192.168.1.254/api/v8`

### Erreur: `Freebox API error: 403`

Votre token a expiré ou a été révoqué. Relancez `yarn authorize`.

### Erreur: `Authorization denied`

Vous avez refusé l'autorisation sur l'écran LCD. Relancez `yarn authorize` et acceptez cette fois.

## Prochaines étapes

Une fois le test réussi, vous pouvez :

1. **Lancer le moniteur complet** : `yarn start`
2. **Configurer le heartbeat** : Voir le [README.md](./README.md) pour la configuration du serveur VPS
3. **Déployer en production** : Configurer le service systemd pour un démarrage automatique

## Ressources

- [Documentation API Freebox](https://dev.freebox.fr/sdk/os/)
- [README du projet](./README.md)
- [Guide de contribution](./AGENTS.md)
