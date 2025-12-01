import dotenv from 'dotenv';
import fs from 'fs/promises';
import readline from 'readline';
import {
    requestAuthorization,
    trackAuthorizationStatus,
    saveToken,
    isAuthorizationGranted
} from './lib/freebox-api.js';
import { log, sleep } from './lib/utils.js';
import type { FreeboxAuthorizationStatus } from './lib/types.js';

dotenv.config();

const CONFIG = {
    appId: process.env.APP_ID ?? 'fr.mon.monitoring',
    appName: process.env.APP_NAME ?? 'Freebox Monitor',
    appVersion: process.env.APP_VERSION ?? '1.0.0',
    freeboxApiUrl: process.env.FREEBOX_API_URL ?? 'http://mafreebox.freebox.fr/api/v4',
    tokenFile: process.env.TOKEN_FILE ?? 'token.json'
};

function askQuestion(query: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

async function checkExistingToken(): Promise<boolean> {
    try {
        await fs.access(CONFIG.tokenFile);
        return true;
    } catch {
        return false;
    }
}

async function waitForAuthorization(trackId: number | string): Promise<void> {
    const maxAttempts = 30;
    let attempts = 0;

    process.stdout.write('Progress: ');

    while (attempts < maxAttempts) {
        const result = await trackAuthorizationStatus(CONFIG.freeboxApiUrl, trackId);
        const status = result.status as FreeboxAuthorizationStatus;

        if (!status) {
            console.log('\n\n=== RAW API RESPONSE (missing status) ===');
            console.log(JSON.stringify(result, null, 2));
            console.log('=========================================\n');
            throw new Error('Authorization status missing from response');
        }

        if (status === 'pending') {
            process.stdout.write('.');
        } else if (status === 'timeout') {
            throw new Error('Authorization timeout - no validation on Freebox');
        } else if (isAuthorizationGranted(status)) {
            process.stdout.write('\n');
            log('Authorization granted!');
            console.log('\n=== RAW API RESPONSE (granted) ===');
            console.log(JSON.stringify(result, null, 2));
            console.log('===================================\n');
            return;
        } else if (status === 'denied') {
            throw new Error('Authorization denied on Freebox');
        } else {
            console.log('\n\n=== RAW API RESPONSE (unknown status) ===');
            console.log(JSON.stringify(result, null, 2));
            console.log('=========================================\n');
            throw new Error(`Unknown status: ${status}`);
        }

        attempts += 1;
        await sleep(1000);
    }

    throw new Error('Timeout waiting for authorization (30 seconds)');
}

async function main() {
    console.log('=== Freebox API Authorization ===\n');

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
        const authResult = await requestAuthorization(
            CONFIG.freeboxApiUrl,
            CONFIG.appId,
            CONFIG.appName,
            CONFIG.appVersion,
            'Monitoring VM'
        );

        console.log('\n=== RAW API RESPONSE (initial request) ===');
        console.log(JSON.stringify(authResult, null, 2));
        console.log('==========================================\n');

        const { track_id: trackId, app_token: appToken } = authResult;

        if (!trackId) {
            throw new Error('Authorization request did not return a valid track_id.');
        }

        if (!appToken) {
            throw new Error('Authorization request did not return a valid app_token.');
        }

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

        await waitForAuthorization(trackId);

        await saveToken(CONFIG.tokenFile, appToken, trackId, CONFIG.appId);

        console.log('\n┌─────────────────────────────────────────────────────────┐');
        console.log('│                                                         │');
        console.log('│  ✅ Authorization successful!                           │');
        console.log('│                                                         │');
        console.log('│  You can now run: yarn start                            │');
        console.log('│                                                         │');
        console.log('└─────────────────────────────────────────────────────────┘\n');
    } catch (error) {
        log(`Error: ${(error as Error).message}`, 'ERROR');
        process.exit(1);
    }
}

main().catch((error: Error) => {
    log(`Fatal error: ${error.message}`, 'ERROR');
    process.exit(1);
});
