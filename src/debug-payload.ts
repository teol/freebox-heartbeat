#!/usr/bin/env node
import { config } from './lib/config.js';
import * as freeboxApi from './lib/freebox-api.js';
import { buildHeartbeatPayload } from './lib/utils.js';

async function main(): Promise<void> {
    console.log('=== Heartbeat Payload Debug ===\n');
    console.log(`API URL : ${config.freeboxApiUrl}`);
    console.log(`Token   : ${config.tokenFile}\n`);

    const appToken = await freeboxApi.readAppToken(config.tokenFile);
    const sessionToken = await freeboxApi.loginToFreebox(
        config.freeboxApiUrl,
        config.appId,
        appToken
    );
    console.log('Session opened.\n');

    try {
        const connectionInfo = await freeboxApi.getConnectionInfo(config.freeboxApiUrl, sessionToken);
        console.log('Connection info fetched.');

        const isFtth = connectionInfo?.media === 'ftth';

        const [deviceCountsResult, ftthResult, systemResult] = await Promise.allSettled([
            freeboxApi.getConnectedDevices(config.freeboxApiUrl, sessionToken),
            isFtth
                ? freeboxApi.getFtthInfo(config.freeboxApiUrl, sessionToken)
                : Promise.resolve(null),
            freeboxApi.getSystemInfo(config.freeboxApiUrl, sessionToken)
        ]);

        if (deviceCountsResult.status === 'rejected') {
            console.warn(`[WARN] Connected devices: ${(deviceCountsResult.reason as Error)?.message}`);
        } else {
            console.log('Connected devices fetched.');
        }

        if (ftthResult.status === 'rejected') {
            console.warn(`[WARN] FTTH info: ${(ftthResult.reason as Error)?.message}`);
        } else if (isFtth) {
            console.log('FTTH info fetched.');
        } else {
            console.log('FTTH info skipped (non-FTTH line).');
        }

        if (systemResult.status === 'rejected') {
            console.warn(`[WARN] System info: ${(systemResult.reason as Error)?.message}`);
        } else {
            console.log('System info fetched.');
        }

        const payload = buildHeartbeatPayload(
            connectionInfo,
            deviceCountsResult.status === 'fulfilled' ? deviceCountsResult.value : null,
            ftthResult.status === 'fulfilled' ? ftthResult.value : null,
            systemResult.status === 'fulfilled' ? systemResult.value : null
        );

        console.log('\n' + '─'.repeat(60));
        console.log('  PAYLOAD (as it would be sent)');
        console.log('─'.repeat(60));
        console.log(JSON.stringify(payload, null, 4));
        console.log('─'.repeat(60));

        // Summary of nullable fields
        const nullFields = Object.entries(payload)
            .filter(([, v]) => v === null)
            .map(([k]) => k);

        if (nullFields.length > 0) {
            console.log(`\n[WARN] Null fields (${nullFields.length}): ${nullFields.join(', ')}`);
        } else {
            console.log('\nAll fields populated.');
        }
    } finally {
        try {
            await freeboxApi.logoutFromFreebox(config.freeboxApiUrl, sessionToken);
            console.log('\nSession closed.');
        } catch (error) {
            console.error(`\nLogout failed: ${(error as Error).message}`);
        }
    }
}

main().catch((err) => {
    console.error('Fatal:', (err as Error).message);
    process.exit(1);
});
