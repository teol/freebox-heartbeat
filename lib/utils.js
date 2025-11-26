/**
 * Log with timestamp
 */
export function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
}

/**
 * Sleep utility
 */
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Validate configuration object
 */
export function validateConfig(config) {
    const requiredFields = ['vpsUrl', 'secret', 'appId', 'freeboxApiUrl'];
    const missingFields = requiredFields.filter((field) => !config[field]);

    if (missingFields.length > 0) {
        throw new Error(`Missing required configuration fields: ${missingFields.join(', ')}`);
    }

    return true;
}

/**
 * Parse heartbeat payload
 */
export function buildHeartbeatPayload(connectionInfo, secret) {
    if (!connectionInfo) {
        throw new Error('Connection info is required');
    }

    return {
        token: secret,
        ipv4: connectionInfo.ipv4 || null,
        connection_state: connectionInfo.state || 'unknown',
        media_state: connectionInfo.media || 'unknown',
        bandwidth_down: connectionInfo.bandwidth_down || 0,
        bandwidth_up: connectionInfo.bandwidth_up || 0,
        timestamp: new Date().toISOString()
    };
}

/**
 * Check if error is authentication related
 */
export function isAuthError(error) {
    if (!error || !error.message) {
        return false;
    }

    const authKeywords = ['auth', '403', 'invalid session', 'unauthorized'];
    const errorMessage = error.message.toLowerCase();

    return authKeywords.some((keyword) => errorMessage.includes(keyword));
}
