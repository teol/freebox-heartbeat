#!/usr/bin/env node
import { config } from './lib/config.js';
import * as freeboxApi from './lib/freebox-api.js';

async function testApi(): Promise<void> {
    console.log('=== Freebox API Test Script ===\n');
    console.log(`API URL: ${config.freeboxApiUrl}`);
    console.log(`App ID: ${config.appId}`);
    console.log(`Token file: ${config.tokenFile}\n`);

    let sessionToken: string | null = null;

    try {
        // Step 1: Read app token
        console.log('📖 Reading app token from token.json...');
        const appToken = await freeboxApi.readAppToken(config.tokenFile);
        console.log('✓ App token loaded\n');

        // Step 2: Login to Freebox
        console.log('🔐 Logging in to Freebox...');
        sessionToken = await freeboxApi.loginToFreebox(
            config.freeboxApiUrl,
            config.appId,
            appToken
        );
        console.log('✓ Session opened\n');

        // Step 3: Get connection info
        console.log('📡 Fetching connection info from Freebox API...\n');
        const connectionInfo = await freeboxApi.getConnectionInfo(
            config.freeboxApiUrl,
            sessionToken
        );

        // Step 4: Display raw response
        console.log('=== RAW API RESPONSE ===');
        console.log(JSON.stringify(connectionInfo, null, 4));
        console.log('========================\n');

        // Step 5: Display formatted info
        console.log('=== FORMATTED INFO ===');
        console.log(`IPv4:           ${connectionInfo.ipv4 ?? 'N/A'}`);
        console.log(`State:          ${connectionInfo.state ?? 'N/A'}`);
        console.log(`Media:          ${connectionInfo.media ?? 'N/A'}`);
        console.log(`Bandwidth Down: ${connectionInfo.bandwidth_down ?? 'N/A'} bytes/s`);
        console.log(`Bandwidth Up:   ${connectionInfo.bandwidth_up ?? 'N/A'} bytes/s`);
        console.log('======================\n');

        console.log('✓ Test completed successfully');
    } catch (error) {
        console.error('❌ Error:', (error as Error).message);
        process.exit(1);
    } finally {
        // Cleanup: logout
        if (sessionToken) {
            console.log('\n🔒 Logging out...');
            try {
                await freeboxApi.logoutFromFreebox(config.freeboxApiUrl, sessionToken);
                console.log('✓ Logged out successfully');
            } catch (error) {
                console.error('⚠️ Logout error:', (error as Error).message);
            }
        }
    }
}

testApi();
