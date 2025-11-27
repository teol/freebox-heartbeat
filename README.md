# Freebox Heartbeat Monitor

Monitoring system for Freebox Delta to detect downtime and monitor Internet connection status.

## Description

This project is a Node.js (TypeScript) script that runs on a Freebox VM and:
- Queries the local Freebox API every minute
- Retrieves connection information (state, IP, bandwidth, media)
- Sends HTTP heartbeats to a remote monitoring server
- Detects connection outages and 4G failovers

## Prerequisites

- **Node.js 22** or higher
- A **Freebox Delta** with local API access
- The [teol/freebox-watcher](https://github.com/teol/freebox-watcher) monitoring server to receive heartbeats
- Access to a VM on the Freebox or a device on the local network

## Installation

1. Clone or download this project on your Freebox VM:
```bash
git clone <repo-url>
cd freebox-heartbeat
```

2. Install dependencies (Yarn 4 with Corepack):
```bash
corepack enable
yarn install
```

3. Copy the configuration file:
```bash
cp .env.example .env
```

4. Edit the `.env` file with your parameters:
```env
VPS_URL=https://your-server.com/heartbeat
SECRET=your_shared_secret
APP_ID=fr.mon.monitoring
APP_NAME=Freebox Monitor
APP_VERSION=1.0.0
FREEBOX_API_URL=http://mafreebox.freebox.fr/api/v4
HEARTBEAT_INTERVAL=60000
```

## Configuration - Freebox API Authorization

Before first use, you must authorize the application on your Freebox:

1. Run the authorization script:
```bash
yarn authorize
```

2. **Validate access on your Freebox LCD screen** within 30 seconds

3. The script will create a `token.json` file containing your access token

4. This file will be automatically used by the monitoring script

## Usage

### Manual launch

```bash
yarn start
```

### Running as a service (systemd)

1. Create a service file:
```bash
sudo nano /etc/systemd/system/freebox-heartbeat.service
```

2. Add the configuration:
```ini
[Unit]
Description=Freebox Heartbeat Monitor
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/freebox-heartbeat
ExecStart=/usr/bin/env yarn start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

3. Enable and start the service:
```bash
sudo systemctl enable freebox-heartbeat
sudo systemctl start freebox-heartbeat
sudo systemctl status freebox-heartbeat
```

4. View logs:
```bash
sudo journalctl -u freebox-heartbeat -f
```

## Data Structure

The script sends the following data to the remote server:

```json
{
  "token": "SHARED_SECRET",
  "ipv4": "1.2.3.4",
  "connection_state": "up",
  "media_state": "ftth",
  "bandwidth_down": 1000000000,
  "bandwidth_up": 600000000,
  "timestamp": "2025-11-26T10:30:00.000Z"
}
```

### Fields:
- `token`: Shared secret for authentication
- `ipv4`: Current public IP address
- `connection_state`: Connection state (`up`, `down`, `going_up`, `going_down`)
- `media_state`: Media type (`ftth`, `backup` for 4G)
- `bandwidth_down`: Download bandwidth (bits/s)
- `bandwidth_up`: Upload bandwidth (bits/s)
- `timestamp`: ISO 8601 timestamp

## Features

- ✅ Automatic authentication to Freebox API
- ✅ Connection information retrieval
- ✅ Periodic heartbeat sending
- ✅ Error handling with automatic retry
- ✅ Detailed logging with timestamps
- ✅ FTTH ↔ 4G failover detection
- ✅ Clean Freebox session closure
- ✅ Environment variables for configuration
- ✅ Graceful shutdown (SIGINT/SIGTERM)

## Troubleshooting

### Authorization error
```
Error: Invalid token or session
```
→ Re-run `yarn authorize` to obtain a new token

### Freebox not responding
```
Error: ECONNREFUSED
```
→ Check that you are on the Freebox local network
→ Verify the API URL in `.env`

### Remote server not receiving heartbeats
→ Check the server URL in `.env`
→ Review logs for sending errors
→ Verify that the SECRET matches on the server side

## Security

- ⚠️ **Never** commit `.env` and `token.json` files
- ⚠️ Use a **strong and unique** SECRET
- ⚠️ The remote server must validate the SECRET before accepting data
- ⚠️ Restrict access to `token.json` file (chmod 600)

## License

MIT
