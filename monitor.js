import axios from 'axios';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration
const CONFIG = {
    vpsUrl: process.env.VPS_URL || 'https://votre-vps.com/report',
    secret: process.env.SECRET || 'SECRET_PARTAGE',
    appId: process.env.APP_ID || 'fr.mon.monitoring',
    freeboxApiUrl: process.env.FREEBOX_API_URL || 'http://mafreebox.freebox.fr/api/v4',
    heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '60000', 10),
    maxRetries: 3,
    retryDelay: 5000,
    tokenFile: 'token.json'
};

// State
let sessionToken = null;
let isRunning = true;
let intervalId = null;

/**
 * Log with timestamp
 */
function log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
}

/**
 * Sleep utility
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Read app token from file
 */
async function readAppToken() {
    try {
        const data = await fs.readFile(CONFIG.tokenFile, 'utf8');
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
 * Login to Freebox API and get session token
 */
async function loginToFreebox(appToken) {
    try {
        // Get login challenge
        const loginResp = await axios.get(`${CONFIG.freeboxApiUrl}/login/`, {
            timeout: 10000
        });

        if (!loginResp.data.success) {
            throw new Error('Failed to get login challenge');
        }

        const challenge = loginResp.data.result.challenge;

        // Calculate password (HMAC-SHA1 of challenge with app_token)
        const password = crypto.createHmac('sha1', appToken).update(challenge).digest('hex');

        // Open session
        const sessionResp = await axios.post(
            `${CONFIG.freeboxApiUrl}/login/session/`,
            {
                app_id: CONFIG.appId,
                password: password
            },
            { timeout: 10000 }
        );

        if (!sessionResp.data.success) {
            throw new Error(`Session failed: ${sessionResp.data.msg || 'Unknown error'}`);
        }

        return sessionResp.data.result.session_token;
    } catch (error) {
        if (error.response) {
            throw new Error(
                `Freebox API error: ${error.response.status} - ${error.response.data?.msg || error.message}`
            );
        }
        throw new Error(`Login failed: ${error.message}`);
    }
}

/**
 * Logout from Freebox API
 */
async function logoutFromFreebox(token) {
    if (!token) return;

    try {
        await axios.post(
            `${CONFIG.freeboxApiUrl}/login/logout/`,
            {},
            {
                headers: { 'X-Fbx-App-Auth': token },
                timeout: 5000
            }
        );
        log('Logged out from Freebox API');
    } catch (error) {
        log(`Logout warning: ${error.message}`, 'WARN');
    }
}

/**
 * Get connection information from Freebox
 */
async function getConnectionInfo(token) {
    try {
        const response = await axios.get(`${CONFIG.freeboxApiUrl}/connection/`, {
            headers: { 'X-Fbx-App-Auth': token },
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
 * Send heartbeat to remote server with retry
 */
async function sendHeartbeat(data, retries = 0) {
    try {
        const response = await axios.post(CONFIG.vpsUrl, data, {
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        log(`Heartbeat sent successfully: ${data.connection_state} (${data.media_state})`);
        return response.data;
    } catch (error) {
        const errorMsg = error.response
            ? `${error.response.status} - ${error.response.statusText}`
            : error.message;

        if (retries < CONFIG.maxRetries) {
            log(
                `Failed to send heartbeat (${errorMsg}), retrying in ${CONFIG.retryDelay}ms... (${retries + 1}/${CONFIG.maxRetries})`,
                'WARN'
            );
            await sleep(CONFIG.retryDelay);
            return sendHeartbeat(data, retries + 1);
        }

        throw new Error(`Failed to send heartbeat after ${CONFIG.maxRetries} retries: ${errorMsg}`);
    }
}

/**
 * Main monitoring function
 */
async function monitor() {
    try {
        // Read app token
        const appToken = await readAppToken();

        // Login to Freebox (reuse session token if valid)
        if (!sessionToken) {
            log('Logging in to Freebox API...');
            sessionToken = await loginToFreebox(appToken);
            log('Successfully logged in to Freebox API');
        }

        // Get connection information
        const connectionInfo = await getConnectionInfo(sessionToken);

        // Prepare payload
        const payload = {
            token: CONFIG.secret,
            ipv4: connectionInfo.ipv4 || null,
            connection_state: connectionInfo.state || 'unknown',
            media_state: connectionInfo.media || 'unknown',
            bandwidth_down: connectionInfo.bandwidth_down || 0,
            bandwidth_up: connectionInfo.bandwidth_up || 0,
            timestamp: new Date().toISOString()
        };

        // Send heartbeat to remote server
        await sendHeartbeat(payload);
    } catch (error) {
        log(`Error: ${error.message}`, 'ERROR');

        // If authentication error, clear session token to force re-login
        if (
            error.message.includes('auth') ||
            error.message.includes('403') ||
            error.message.includes('Invalid session')
        ) {
            log('Session may be invalid, will re-authenticate on next run', 'WARN');
            sessionToken = null;
        }
    }
}

/**
 * Graceful shutdown
 */
async function shutdown() {
    if (!isRunning) return;

    log('Shutting down gracefully...');
    isRunning = false;

    // Clear interval
    if (intervalId) {
        clearInterval(intervalId);
    }

    // Logout from Freebox
    await logoutFromFreebox(sessionToken);
    sessionToken = null;

    log('Shutdown complete');
    process.exit(0);
}

/**
 * Main entry point
 */
async function main() {
    log('=== Freebox Heartbeat Monitor Started ===');
    log(`VPS URL: ${CONFIG.vpsUrl}`);
    log(`Freebox API: ${CONFIG.freeboxApiUrl}`);
    log(`Heartbeat interval: ${CONFIG.heartbeatInterval}ms`);

    // Handle graceful shutdown
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Run immediately
    await monitor();

    // Then run at regular intervals
    intervalId = setInterval(async () => {
        if (isRunning) {
            await monitor();
        }
    }, CONFIG.heartbeatInterval);

    log('Monitoring loop started');
}

// Start the application
main().catch((error) => {
    log(`Fatal error: ${error.message}`, 'ERROR');
    process.exit(1);
});
