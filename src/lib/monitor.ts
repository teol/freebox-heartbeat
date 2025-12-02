import {
    readAppToken,
    loginToFreebox,
    getConnectionInfo,
    logoutFromFreebox
} from './freebox-api.js';
import { sendHeartbeat } from './heartbeat.js';
import { buildHeartbeatPayload, isAuthError, log, sleep, validateConfig } from './utils.js';
import type { MonitorConfig } from './types.js';

export const DEFAULT_PLACEHOLDERS: Pick<MonitorConfig, 'vpsUrl' | 'secret' | 'appId'> = {
    vpsUrl: 'https://votre-vps.com/report',
    secret: 'SECRET_PARTAGE',
    appId: 'fr.mon.monitoring'
};

export function createMonitor(config: MonitorConfig) {
    validateConfig(config, DEFAULT_PLACEHOLDERS);

    let sessionToken: string | null = null;
    let isRunning = false;
    let timeoutId: NodeJS.Timeout | null = null;
    let lastAuthAt = 0;

    async function authenticate(force = false): Promise<string | null> {
        const now = Date.now();
        const shouldRefresh =
            force || !sessionToken || now - lastAuthAt >= config.sessionRefreshInterval;

        if (!shouldRefresh) {
            return sessionToken;
        }

        const appToken = await readAppToken(config.tokenFile);
        sessionToken = await loginToFreebox(config.freeboxApiUrl, config.appId, appToken);
        lastAuthAt = Date.now();
        log('Authenticated with Freebox API');
        return sessionToken;
    }

    async function fetchConnectionInfoWithRefresh() {
        try {
            return await getConnectionInfo(config.freeboxApiUrl, sessionToken);
        } catch (error) {
            if (!isAuthError(error)) {
                throw error as Error;
            }

            log('Session appears invalid, refreshing authentication', 'WARN');
            await authenticate(true);
            return await getConnectionInfo(config.freeboxApiUrl, sessionToken);
        }
    }

    async function runOnce(): Promise<void> {
        try {
            await authenticate();
            const connectionInfo = await fetchConnectionInfoWithRefresh();
            const payload = buildHeartbeatPayload(connectionInfo);

            await sendHeartbeat(config.vpsUrl, config.secret, payload, config.maxRetries, config.retryDelay);
        } catch (error) {
            log(`Monitor iteration failed: ${(error as Error).message}`, 'ERROR');

            if (isAuthError(error)) {
                sessionToken = null;
                await sleep(500);
            }
        }
    }

    async function start(): Promise<void> {
        if (isRunning) {
            return;
        }

        const scheduleNext = async () => {
            if (!isRunning) {
                return;
            }

            await runOnce();

            if (isRunning) {
                timeoutId = setTimeout(scheduleNext, config.heartbeatInterval);
            }
        };

        isRunning = true;
        log('Monitoring loop started');
        await scheduleNext();
    }

    async function stop(): Promise<void> {
        if (!isRunning) {
            return;
        }

        isRunning = false;

        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        try {
            await logoutFromFreebox(config.freeboxApiUrl, sessionToken);
            log('Logged out from Freebox API');
        } catch (error) {
            log(`Logout warning: ${(error as Error).message}`, 'WARN');
        }

        sessionToken = null;
    }

    return {
        start,
        stop,
        get intervalId() {
            return timeoutId;
        },
        get running() {
            return isRunning;
        }
    };
}
