import {
    readAppToken,
    loginToFreebox,
    getConnectionInfo,
    logoutFromFreebox
} from './freebox-api.js';
import { sendHeartbeat } from './heartbeat.js';
import { buildHeartbeatPayload, isAuthError, log, sleep, validateConfig } from './utils.js';

export const DEFAULT_PLACEHOLDERS = {
    vpsUrl: 'https://votre-vps.com/report',
    secret: 'SECRET_PARTAGE',
    appId: 'fr.mon.monitoring'
};

export function createMonitor(config) {
    validateConfig(config, DEFAULT_PLACEHOLDERS);

    let sessionToken = null;
    let isRunning = false;
    let timeoutId = null;
    let lastAuthAt = 0;

    async function authenticate(force = false) {
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
                throw error;
            }

            log('Session appears invalid, refreshing authentication', 'WARN');
            await authenticate(true);
            return await getConnectionInfo(config.freeboxApiUrl, sessionToken);
        }
    }

    async function runOnce() {
        try {
            await authenticate();
            const connectionInfo = await fetchConnectionInfoWithRefresh();
            const payload = buildHeartbeatPayload(connectionInfo, config.secret);

            await sendHeartbeat(config.vpsUrl, payload, config.maxRetries, config.retryDelay);
        } catch (error) {
            log(`Monitor iteration failed: ${error.message}`, 'ERROR');

            if (isAuthError(error)) {
                sessionToken = null;
                await sleep(500);
            }
        }
    }

    async function start() {
        if (isRunning) {
            return;
        }

        isRunning = true;
        await runOnce();

        const scheduleNext = async () => {
            if (!isRunning) {
                return;
            }

            await runOnce();

            if (isRunning) {
                timeoutId = setTimeout(scheduleNext, config.heartbeatInterval);
            }
        };

        timeoutId = setTimeout(scheduleNext, config.heartbeatInterval);
        log('Monitoring loop started');
    }

    async function stop() {
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
            log(`Logout warning: ${error.message}`, 'WARN');
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
