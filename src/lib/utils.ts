import type { ConnectionInfo, HeartbeatPayload, MonitorConfig } from './types.js';

export function log(message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO'): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function validateConfig(
    config: Partial<MonitorConfig>,
    defaults: Record<string, unknown> = {}
): boolean {
    const requiredFields: Array<keyof MonitorConfig> = [
        'vpsUrl',
        'secret',
        'appId',
        'freeboxApiUrl'
    ];
    const missingFields = requiredFields.filter((field) => !config[field]);

    if (missingFields.length > 0) {
        throw new Error(`Missing required configuration fields: ${missingFields.join(', ')}`);
    }

    const unchangedDefaults = Object.entries(defaults)
        .filter(([field, defaultValue]) => config[field as keyof MonitorConfig] === defaultValue)
        .map(([field]) => field);

    if (unchangedDefaults.length > 0) {
        throw new Error(`Configuration fields must be customized: ${unchangedDefaults.join(', ')}`);
    }

    return true;
}

export function buildHeartbeatPayload(
    connectionInfo: ConnectionInfo | null,
    secret: string
): HeartbeatPayload {
    if (!connectionInfo) {
        throw new Error('Connection info is required');
    }

    return {
        token: secret,
        ipv4: connectionInfo.ipv4 ?? null,
        ipv6: connectionInfo.ipv6 ?? null,
        connection_state: connectionInfo.state ?? 'unknown',
        media_state: connectionInfo.media ?? 'unknown',
        connection_type: connectionInfo.type ?? 'unknown',
        bandwidth_down: connectionInfo.bandwidth_down ?? 0,
        bandwidth_up: connectionInfo.bandwidth_up ?? 0,
        rate_down: connectionInfo.rate_down ?? 0,
        rate_up: connectionInfo.rate_up ?? 0,
        bytes_down: connectionInfo.bytes_down ?? 0,
        bytes_up: connectionInfo.bytes_up ?? 0,
        timestamp: new Date().toISOString()
    };
}

export function isAuthError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const maybeError = error as { message?: string };
    if (!maybeError.message) {
        return false;
    }

    const authKeywords = ['auth', '403', 'invalid session', 'unauthorized'];
    const errorMessage = maybeError.message.toLowerCase();

    return authKeywords.some((keyword) => errorMessage.includes(keyword));
}
