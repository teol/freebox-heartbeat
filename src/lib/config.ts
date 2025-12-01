import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
    appId: string;
    appName: string;
    appVersion: string;
    freeboxApiUrl: string;
    tokenFile: string;
    vpsUrl: string;
    secret: string;
    heartbeatInterval: number;
    maxRetries: number;
    retryDelay: number;
    sessionRefreshInterval: number;
}

export function loadConfig(): AppConfig {
    return {
        // Application identification
        appId: process.env.APP_ID ?? 'fr.mon.monitoring',
        appName: process.env.APP_NAME ?? 'Freebox Monitor',
        appVersion: process.env.APP_VERSION ?? '1.0.0',

        // Freebox API configuration
        freeboxApiUrl: process.env.FREEBOX_API_URL ?? 'http://mafreebox.freebox.fr/api/v4',
        tokenFile: process.env.TOKEN_FILE ?? 'token.json',

        // VPS heartbeat configuration
        vpsUrl: process.env.VPS_URL ?? '',
        secret: process.env.SECRET ?? '',

        // Heartbeat timing
        heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL ?? '60000', 10),
        maxRetries: parseInt(process.env.MAX_RETRIES ?? '3', 10),
        retryDelay: parseInt(process.env.RETRY_DELAY ?? '5000', 10),
        sessionRefreshInterval: parseInt(process.env.SESSION_REFRESH_INTERVAL ?? '600000', 10)
    };
}

export const config = loadConfig();
