import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs/promises';

/**
 * Read app token from file
 */
export async function readAppToken(tokenFile = 'token.json') {
    try {
        const data = await fs.readFile(tokenFile, 'utf8');
        const { app_token } = JSON.parse(data);

        if (!app_token) {
            throw new Error('app_token not found in token.json');
        }

        return app_token;
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(
                'token.json not found. Please run "node authorize.js" first to obtain an API token.'
            );
        }
        throw error;
    }
}

/**
 * Calculate HMAC-SHA1 password from challenge
 */
export function calculatePassword(challenge, appToken) {
    if (!challenge || !appToken) {
        throw new Error('Challenge and app token are required');
    }

    return crypto.createHmac('sha1', appToken).update(challenge).digest('hex');
}

/**
 * Get login challenge from Freebox
 */
export async function getLoginChallenge(apiUrl) {
    try {
        const response = await axios.get(`${apiUrl}/login/`, {
            timeout: 10000
        });

        if (!response.data.success) {
            throw new Error('Failed to get login challenge');
        }

        return response.data.result.challenge;
    } catch (error) {
        if (error.response) {
            throw new Error(
                `Freebox API error: ${error.response.status} - ${error.response.data?.msg || error.message}`
            );
        }
        throw new Error(`Failed to get challenge: ${error.message}`);
    }
}

/**
 * Open session with Freebox
 */
export async function openSession(apiUrl, appId, password) {
    try {
        const response = await axios.post(
            `${apiUrl}/login/session/`,
            {
                app_id: appId,
                password: password
            },
            { timeout: 10000 }
        );

        if (!response.data.success) {
            throw new Error(`Session failed: ${response.data.msg || 'Unknown error'}`);
        }

        return response.data.result.session_token;
    } catch (error) {
        if (error.response) {
            throw new Error(
                `Freebox API error: ${error.response.status} - ${error.response.data?.msg || error.message}`
            );
        }
        throw new Error(`Session failed: ${error.message}`);
    }
}

/**
 * Login to Freebox API and get session token
 */
export async function loginToFreebox(apiUrl, appId, appToken) {
    const challenge = await getLoginChallenge(apiUrl);
    const password = calculatePassword(challenge, appToken);
    return await openSession(apiUrl, appId, password);
}

/**
 * Logout from Freebox API
 */
export async function logoutFromFreebox(apiUrl, sessionToken) {
    if (!sessionToken) {
        return;
    }

    try {
        await axios.post(
            `${apiUrl}/login/logout/`,
            {},
            {
                headers: { 'X-Fbx-App-Auth': sessionToken },
                timeout: 5000
            }
        );
    } catch (error) {
        throw new Error(`Logout failed: ${error.message}`);
    }
}

/**
 * Get connection information from Freebox
 */
export async function getConnectionInfo(apiUrl, sessionToken) {
    try {
        const response = await axios.get(`${apiUrl}/connection/`, {
            headers: { 'X-Fbx-App-Auth': sessionToken },
            timeout: 10000
        });

        if (!response.data.success) {
            throw new Error(`API error: ${response.data.msg || 'Unknown error'}`);
        }

        return response.data.result;
    } catch (error) {
        if (error.response) {
            throw new Error(
                `Freebox API error: ${error.response.status} - ${error.response.data?.msg || error.message}`
            );
        }
        throw new Error(`Failed to get connection info: ${error.message}`);
    }
}

/**
 * Request authorization from Freebox
 */
export async function requestAuthorization(apiUrl, appId, appName, appVersion, deviceName) {
    try {
        const response = await axios.post(`${apiUrl}/login/authorize/`, {
            app_id: appId,
            app_name: appName,
            app_version: appVersion,
            device_name: deviceName
        });

        if (!response.data.success) {
            throw new Error(
                `Authorization request failed: ${response.data.msg || 'Unknown error'}`
            );
        }

        return response.data.result;
    } catch (error) {
        if (error.response) {
            throw new Error(
                `Freebox API error: ${error.response.status} - ${error.response.data?.msg || error.message}`
            );
        }
        throw new Error(`Request failed: ${error.message}`);
    }
}

/**
 * Track authorization status
 */
export async function trackAuthorizationStatus(apiUrl, trackId) {
    try {
        const response = await axios.get(`${apiUrl}/login/authorize/${trackId}`);

        if (!response.data.success) {
            throw new Error(`Tracking failed: ${response.data.msg || 'Unknown error'}`);
        }

        return response.data.result;
    } catch (error) {
        throw new Error(`Tracking error: ${error.message}`);
    }
}

/**
 * Save token to file
 */
export async function saveToken(tokenFile, appToken, trackId, appId) {
    const data = {
        app_token: appToken,
        track_id: trackId,
        app_id: appId,
        created_at: new Date().toISOString()
    };

    try {
        await fs.writeFile(tokenFile, JSON.stringify(data, null, 2));
        await fs.chmod(tokenFile, 0o600);
    } catch (error) {
        throw new Error(`Failed to save token: ${error.message}`);
    }
}
