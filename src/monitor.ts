import { config } from './lib/config.js';
import { createMonitor, DEFAULT_PLACEHOLDERS } from './lib/monitor.js';
import { log, validateConfig } from './lib/utils.js';
import type { MonitorConfig } from './lib/types.js';

const monitorConfig: MonitorConfig = {
    vpsUrl: config.vpsUrl,
    secret: config.secret,
    appId: config.appId,
    freeboxApiUrl: config.freeboxApiUrl,
    heartbeatInterval: config.heartbeatInterval,
    maxRetries: config.maxRetries,
    retryDelay: config.retryDelay,
    tokenFile: config.tokenFile,
    sessionRefreshInterval: config.sessionRefreshInterval
};

validateConfig(monitorConfig, DEFAULT_PLACEHOLDERS);

const monitor = createMonitor(monitorConfig);

async function shutdown() {
    log('Shutting down gracefully...');
    await monitor.stop();
    log('Shutdown complete');
    process.exit(0);
}

async function main() {
    log('=== Freebox Heartbeat Monitor Started ===');
    log(`VPS URL: ${monitorConfig.vpsUrl}`);
    log(`Freebox API: ${monitorConfig.freeboxApiUrl}`);
    log(`Heartbeat interval: ${monitorConfig.heartbeatInterval}ms`);
    log(`Session refresh interval: ${monitorConfig.sessionRefreshInterval}ms`);

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    await monitor.start();
}

main().catch((error: Error) => {
    log(`Fatal error: ${error.message}`, 'ERROR');
    process.exit(1);
});
