import axios from 'axios';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import readline from 'readline';

// Load environment variables
dotenv.config();

const CONFIG = {
    appId: process.env.APP_ID || 'fr.mon.monitoring',
    appName: process.env.APP_NAME || 'Freebox Monitor',
    appVersion: process.env.APP_VERSION || '1.0.0',
    freeboxApiUrl: process.env.FREEBOX_API_URL || 'http://mafreebox.freebox.fr/api/v4',
    tokenFile: 'token.json'
};

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
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Request authorization from Freebox
 */
async function requestAuthorization() {
    try {
        log('Requesting authorization from Freebox...');

        const response = await axios.post(`${CONFIG.freeboxApiUrl}/login/authorize/`, {
            app_id: CONFIG.appId,
            app_name: CONFIG.appName,
            app_version: CONFIG.appVersion,
            device_name: 'Monitoring VM'
        });

        if (!response.data.success) {
            throw new Error(`Authorization request failed: ${response.data.msg || 'Unknown error'}`);
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
async function trackAuthorization(trackId) {
    const maxAttempts = 30; // 30 attempts = 30 seconds
    let attempts = 0;

    while (attempts < maxAttempts) {
        try {
            const response = await axios.get(
                `${CONFIG.freeboxApiUrl}/login/authorize/${trackId}`
            );

            if (!response.data.success) {
                throw new Error(`Tracking failed: ${response.data.msg || 'Unknown error'}`);
            }

            const status = response.data.result.status;
            const challenge = response.data.result.challenge;

            switch (status) {
                case 'pending':
                    process.stdout.write('.');
                    break;

                case 'timeout':
                    throw new Error('Authorization timeout - no validation on Freebox');

                case 'granted':
                    console.log('');
                    log('Authorization granted!');
                    return response.data.result.app_token;

                case 'denied':
                    throw new Error('Authorization denied on Freebox');

                default:
                    throw new Error(`Unknown status: ${status}`);
            }

            attempts++;
            await sleep(1000);

        } catch (error) {
            if (error.message.includes('Authorization')) {
                throw error;
            }
            throw new Error(`Tracking error: ${error.message}`);
        }
    }

    throw new Error('Timeout waiting for authorization (30 seconds)');
}

/**
 * Save token to file
 */
async function saveToken(appToken, trackId) {
    const data = {
        app_token: appToken,
        track_id: trackId,
        app_id: CONFIG.appId,
        created_at: new Date().toISOString()
    };

    try {
        await fs.writeFile(CONFIG.tokenFile, JSON.stringify(data, null, 2));
        // Set restrictive permissions
        await fs.chmod(CONFIG.tokenFile, 0o600);
        log(`Token saved to ${CONFIG.tokenFile}`);
        log('Token file permissions set to 600 (read/write for owner only)');
    } catch (error) {
        throw new Error(`Failed to save token: ${error.message}`);
    }
}

/**
 * Check if token file already exists
 */
async function checkExistingToken() {
    try {
        await fs.access(CONFIG.tokenFile);
        return true;
    } catch {
        return false;
    }
}

/**
 * Ask user for confirmation
 */
function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question(query, answer => {
            rl.close();
            resolve(answer);
        });
    });
}

/**
 * Main authorization flow
 */
async function main() {
    console.log('=== Freebox API Authorization ===\n');

    // Check if token already exists
    const tokenExists = await checkExistingToken();
    if (tokenExists) {
        log(`Token file ${CONFIG.tokenFile} already exists`, 'WARN');
        const answer = await askQuestion('Do you want to create a new token? (yes/no): ');

        if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
            log('Authorization cancelled');
            return;
        }
        console.log('');
    }

    try {
        // Request authorization
        const authResult = await requestAuthorization();
        const { app_token, track_id } = authResult;

        console.log('\n┌─────────────────────────────────────────────────────────┐');
        console.log('│                                                         │');
        console.log('│  ⚠️  IMPORTANT: VALIDATE ON YOUR FREEBOX NOW!  ⚠️       │');
        console.log('│                                                         │');
        console.log('│  Go to your Freebox LCD screen and accept the           │');
        console.log('│  authorization request.                                 │');
        console.log('│                                                         │');
        console.log('│  You have 30 seconds to validate...                     │');
        console.log('│                                                         │');
        console.log('└─────────────────────────────────────────────────────────┘\n');

        log('Waiting for validation');
        process.stdout.write('Progress: ');

        // Track authorization status
        const finalToken = await trackAuthorization(track_id);

        // Save token
        await saveToken(finalToken, track_id);

        console.log('\n┌─────────────────────────────────────────────────────────┐');
        console.log('│                                                         │');
        console.log('│  ✅ Authorization successful!                           │');
        console.log('│                                                         │');
        console.log('│  You can now run: npm start                             │');
        console.log('│                                                         │');
        console.log('└─────────────────────────────────────────────────────────┘\n');

    } catch (error) {
        log(`Error: ${error.message}`, 'ERROR');
        process.exit(1);
    }
}

// Run authorization
main().catch(error => {
    log(`Fatal error: ${error.message}`, 'ERROR');
    process.exit(1);
});
