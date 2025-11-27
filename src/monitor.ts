import dotenv from 'dotenv';
import { createMonitor, DEFAULT_PLACEHOLDERS } from './lib/monitor.js';
import { log, validateConfig } from './lib/utils.js';
import type { MonitorConfig } from './lib/types.js';

dotenv.config();

const config: MonitorConfig = {
    vpsUrl: process.env.VPS_URL ?? '',
    secret: process.env.SECRET ?? '',
    appId: process.env.APP_ID ?? '',
    freeboxApiUrl: process.env.FREEBOX_API_URL ?? 'http://mafreebox.freebox.fr/api/v4',
    heartbeatInterval: Number.parseInt(process.env.HEARTBEAT_INTERVAL ?? '60000', 10),
    maxRetries: Number.parseInt(process.env.MAX_RETRIES ?? '3', 10),
    retryDelay: Number.parseInt(process.env.RETRY_DELAY ?? '5000', 10),
    tokenFile: process.env.TOKEN_FILE ?? 'token.json',
    sessionRefreshInterval: Number.parseInt(process.env.SESSION_REFRESH_INTERVAL ?? '900000', 10)
};

validateConfig(config, DEFAULT_PLACEHOLDERS);

const monitor = createMonitor(config);

async function shutdown() {
    log('Shutting down gracefully...');
    await monitor.stop();
    log('Shutdown complete');
    process.exit(0);
}

async function main() {
    log('=== Freebox Heartbeat Monitor Started ===');
    log(`VPS URL: ${config.vpsUrl}`);
    log(`Freebox API: ${config.freeboxApiUrl}`);
    log(`Heartbeat interval: ${config.heartbeatInterval}ms`);
    log(`Session refresh interval: ${config.sessionRefreshInterval}ms`);

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    await monitor.start();
}

main().catch((error: Error) => {
    log(`Fatal error: ${error.message}`, 'ERROR');
    process.exit(1);
});
