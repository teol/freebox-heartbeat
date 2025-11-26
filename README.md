# Freebox Heartbeat Monitor

Système de monitoring pour Freebox Delta permettant de détecter les downtime et surveiller l'état de la connexion Internet.

## Description

Ce projet est un script Node.js qui s'exécute sur une VM de la Freebox et :
- Interroge l'API locale Freebox toutes les minutes
- Récupère les informations de connexion (état, IP, bande passante, média)
- Envoie des heartbeats HTTP à un serveur distant de monitoring
- Permet de détecter les coupures de connexion et les basculements 4G

## Prérequis

- **Node.js 22** ou supérieur
- Une **Freebox Delta** avec accès à l'API locale
- Un serveur web distant pour recevoir les heartbeats
- Accès à une VM sur la Freebox ou un appareil sur le réseau local

## Installation

1. Clonez ou téléchargez ce projet sur votre VM Freebox :
```bash
git clone <url-du-repo>
cd freebox-heartbeat
```

2. Installez les dépendances :
```bash
npm install
```

3. Copiez le fichier de configuration :
```bash
cp .env.example .env
```

4. Éditez le fichier `.env` avec vos paramètres :
```env
VPS_URL=https://votre-serveur.com/heartbeat
SECRET=votre_secret_partage
APP_ID=fr.mon.monitoring
APP_NAME=Freebox Monitor
APP_VERSION=1.0.0
FREEBOX_API_URL=http://mafreebox.freebox.fr/api/v4
HEARTBEAT_INTERVAL=60000
```

## Configuration - Autorisation API Freebox

Avant la première utilisation, vous devez autoriser l'application sur votre Freebox :

1. Lancez le script d'autorisation :
```bash
node authorize.js
```

2. **Validez l'accès sur l'écran LCD de votre Freebox** dans les 30 secondes

3. Le script créera un fichier `token.json` contenant votre token d'accès

4. Ce fichier sera utilisé automatiquement par le script de monitoring

## Utilisation

### Lancement manuel

```bash
node monitor.js
```

### Lancement en tant que service (systemd)

1. Créez un fichier service :
```bash
sudo nano /etc/systemd/system/freebox-heartbeat.service
```

2. Ajoutez la configuration :
```ini
[Unit]
Description=Freebox Heartbeat Monitor
After=network.target

[Service]
Type=simple
User=votre-utilisateur
WorkingDirectory=/chemin/vers/freebox-heartbeat
ExecStart=/usr/bin/node monitor.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

3. Activez et démarrez le service :
```bash
sudo systemctl enable freebox-heartbeat
sudo systemctl start freebox-heartbeat
sudo systemctl status freebox-heartbeat
```

4. Consultez les logs :
```bash
sudo journalctl -u freebox-heartbeat -f
```

## Structure des données envoyées

Le script envoie les données suivantes au serveur distant :

```json
{
  "token": "SECRET_PARTAGE",
  "ipv4": "1.2.3.4",
  "connection_state": "up",
  "media_state": "ftth",
  "bandwidth_down": 1000000000,
  "bandwidth_up": 600000000,
  "timestamp": "2025-11-26T10:30:00.000Z"
}
```

### Champs :
- `token` : Secret partagé pour authentification
- `ipv4` : Adresse IP publique actuelle
- `connection_state` : État de la connexion (`up`, `down`, `going_up`, `going_down`)
- `media_state` : Type de média (`ftth`, `backup` pour 4G)
- `bandwidth_down` : Bande passante descendante (bits/s)
- `bandwidth_up` : Bande passante montante (bits/s)
- `timestamp` : Horodatage ISO 8601

## Fonctionnalités

- ✅ Authentification automatique à l'API Freebox
- ✅ Récupération des informations de connexion
- ✅ Envoi périodique de heartbeats
- ✅ Gestion des erreurs avec retry automatique
- ✅ Logs détaillés avec timestamps
- ✅ Détection des basculements FTTH ↔ 4G
- ✅ Fermeture propre de la session Freebox
- ✅ Variables d'environnement pour la configuration
- ✅ Graceful shutdown (SIGINT/SIGTERM)

## Dépannage

### Erreur d'autorisation
```
Error: Invalid token or session
```
→ Relancez `node authorize.js` pour obtenir un nouveau token

### La Freebox ne répond pas
```
Error: ECONNREFUSED
```
→ Vérifiez que vous êtes bien sur le réseau local de la Freebox
→ Vérifiez l'URL de l'API dans `.env`

### Le serveur distant ne reçoit pas les heartbeats
→ Vérifiez l'URL du serveur dans `.env`
→ Consultez les logs pour voir les erreurs d'envoi
→ Vérifiez que le SECRET est identique côté serveur

## Structure du projet

```
freebox-heartbeat/
├── monitor.js          # Script principal de monitoring
├── authorize.js        # Script d'autorisation Freebox
├── package.json        # Dépendances Node.js
├── .env.example        # Template de configuration
├── .env                # Configuration (à ne pas commiter)
├── .gitignore          # Fichiers à ignorer
├── token.json          # Token API Freebox (généré)
└── README.md           # Documentation
```

## Sécurité

- ⚠️ Ne commitez **jamais** les fichiers `.env` et `token.json`
- ⚠️ Utilisez un **SECRET** fort et unique
- ⚠️ Le serveur distant doit valider le SECRET avant d'accepter les données
- ⚠️ Limitez l'accès au fichier `token.json` (chmod 600)

## Licence

MIT

## Auteur

Projet de monitoring Freebox Delta
