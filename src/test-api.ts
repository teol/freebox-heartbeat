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
        console.log(`IPv4:              ${connectionInfo.ipv4 ?? 'N/A'}`);
        console.log(`IPv6:              ${connectionInfo.ipv6 ?? 'N/A'}`);
        console.log(`State:             ${connectionInfo.state ?? 'N/A'}`);
        console.log(`Media:             ${connectionInfo.media ?? 'N/A'}`);
        console.log(`Type:              ${connectionInfo.type ?? 'N/A'}`);
        console.log(
            `Bandwidth Down:    ${connectionInfo.bandwidth_down ?? 'N/A'} bytes/s (${connectionInfo.bandwidth_down ? (connectionInfo.bandwidth_down / 1000000000).toFixed(2) + ' Gbps' : 'N/A'})`
        );
        console.log(
            `Bandwidth Up:      ${connectionInfo.bandwidth_up ?? 'N/A'} bytes/s (${connectionInfo.bandwidth_up ? (connectionInfo.bandwidth_up / 1000000).toFixed(2) + ' Mbps' : 'N/A'})`
        );
        console.log(
            `Current Rate Down: ${connectionInfo.rate_down ?? 'N/A'} bytes/s (${connectionInfo.rate_down ? (connectionInfo.rate_down / 1000).toFixed(2) + ' Kbps' : 'N/A'})`
        );
        console.log(
            `Current Rate Up:   ${connectionInfo.rate_up ?? 'N/A'} bytes/s (${connectionInfo.rate_up ? (connectionInfo.rate_up / 1000).toFixed(2) + ' Kbps' : 'N/A'})`
        );
        console.log(
            `Total Bytes Down:  ${connectionInfo.bytes_down ?? 'N/A'} bytes (${connectionInfo.bytes_down ? (connectionInfo.bytes_down / 1000000000).toFixed(2) + ' GB' : 'N/A'})`
        );
        console.log(
            `Total Bytes Up:    ${connectionInfo.bytes_up ?? 'N/A'} bytes (${connectionInfo.bytes_up ? (connectionInfo.bytes_up / 1000000).toFixed(2) + ' MB' : 'N/A'})`
        );
        if (connectionInfo.ipv4_port_range) {
            console.log(
                `IPv4 Port Range:   ${connectionInfo.ipv4_port_range[0]} - ${connectionInfo.ipv4_port_range[1]}`
            );
        }
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
