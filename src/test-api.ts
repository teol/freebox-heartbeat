#!/usr/bin/env node
import * as httpClient from './lib/http-client.js';
import { config } from './lib/config.js';
import * as freeboxApi from './lib/freebox-api.js';


async function probe(label: string, url: string, headers: Record<string, string>): Promise<void> {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  ${label}`);
    console.log(`  GET ${url}`);
    console.log('─'.repeat(60));
    try {
        const res = await httpClient.get<unknown>(url, { headers, timeout: 10000 });
        console.log(JSON.stringify(res.data, null, 4));
    } catch (err) {
        console.error(`  ERROR: ${(err as Error).message}`);
    }
}

async function main(): Promise<void> {
    console.log('=== Freebox API Explorer ===\n');
    console.log(`API URL : ${config.freeboxApiUrl}`);
    console.log(`Token   : ${config.tokenFile}\n`);

    const appToken = await freeboxApi.readAppToken(config.tokenFile);
    const sessionToken = await freeboxApi.loginToFreebox(
        config.freeboxApiUrl,
        config.appId,
        appToken
    );
    console.log('Session opened.\n');

    const api = config.freeboxApiUrl;
    try {
        const h = { 'X-Fbx-App-Auth': sessionToken };
        const api2 = freeboxApi.toV2Url(api);

        // Connection
        await probe('Connection info', `${api}/connection/`, h);
        await probe('Connection xDSL stats', `${api}/connection/xdsl/`, h);
        await probe('Connection FTTH stats', `${api}/connection/ftth/`, h);
        await probe('Connection logs', `${api}/connection/logs/`, h);

        // System
        await probe('System info (temps, uptime, fans)', `${api}/system/`, h);

        // Storage
        await probe('Storage disks', `${api}/storage/disk/`, h);

        // LAN browser
        await probe('LAN interfaces', `${api}/lan/browser/interfaces/`, h);
        await probe('LAN hosts — pub (all active devices)', `${api}/lan/browser/pub/`, h);

        // WiFi (v2 only)
        await probe('WiFi access points', `${api2}/wifi/ap/`, h);
        await probe('WiFi BSS (sta_count per SSID)', `${api2}/wifi/bss/`, h);
        await probe('WiFi stations — AP 0 (2.4 GHz)', `${api2}/wifi/ap/0/stations/`, h);
        await probe('WiFi stations — AP 1 (5 GHz)', `${api2}/wifi/ap/1/stations/`, h);

        console.log(`\n${'─'.repeat(60)}`);
    } finally {
        await freeboxApi.logoutFromFreebox(api, sessionToken);
        console.log('\nSession closed.');
    }
}

main().catch((err) => {
    console.error('Fatal:', (err as Error).message);
    process.exit(1);
});
