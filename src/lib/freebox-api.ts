import crypto from 'crypto';
import fs from 'fs/promises';
import * as httpClient from './http-client.js';
import { HttpClientError } from './http-client.js';
import type {
    ConnectionInfo,
    DeviceCounts,
    DeviceSnapshot,
    FreeboxAuthorizeResult,
    FreeboxAuthorizationStatus,
    FreeboxConnectionResponse,
    FtthInfo,
    LanHost,
    StorageDisk,
    SystemInfo,
    SystemSensor,
    SystemFan,
    WifiBss
} from './types.js';

interface FreeboxResponse<T> {
    success: boolean;
    result: T;
    msg?: string;
}

function handleHttpError(error: unknown, defaultMessage: string): never {
    if (error instanceof HttpClientError && error.response) {
        const errorData = error.response.data as { msg?: string } | undefined;
        throw new Error(
            `Freebox API error: ${error.response.status} - ${errorData?.msg || error.message}`
        );
    }

    const message = (error as Error)?.message ?? 'Unknown error';
    throw new Error(`${defaultMessage}: ${message}`);
}

export async function readAppToken(tokenFile = 'token.json'): Promise<string> {
    try {
        const data = await fs.readFile(tokenFile, 'utf8');
        const { app_token: appToken } = JSON.parse(data) as { app_token?: string };

        if (!appToken) {
            throw new Error('app_token not found in token.json');
        }

        return appToken;
    } catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') {
            throw new Error(
                'token.json not found. Please run "yarn authorize" first to obtain an API token.'
            );
        }
        throw error as Error;
    }
}

export function calculatePassword(challenge: string | null, appToken: string | null): string {
    if (!challenge || !appToken) {
        throw new Error('Challenge and app token are required');
    }

    return crypto.createHmac('sha1', appToken).update(challenge).digest('hex');
}

export async function getLoginChallenge(apiUrl: string): Promise<string> {
    try {
        const response = await httpClient.get<FreeboxResponse<{ challenge: string }>>(
            `${apiUrl}/login/`,
            {
                timeout: 10000
            }
        );

        if (!response.data.success) {
            throw new Error('Failed to get login challenge');
        }

        return response.data.result.challenge;
    } catch (error) {
        handleHttpError(error, 'Failed to get challenge');
    }
}

export async function openSession(
    apiUrl: string,
    appId: string,
    password: string
): Promise<string> {
    try {
        const response = await httpClient.post<FreeboxResponse<{ session_token: string }>>(
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
        handleHttpError(error, 'Session failed');
    }
}

export async function loginToFreebox(
    apiUrl: string,
    appId: string,
    appToken: string
): Promise<string> {
    const challenge = await getLoginChallenge(apiUrl);
    const password = calculatePassword(challenge, appToken);
    return await openSession(apiUrl, appId, password);
}

export async function logoutFromFreebox(
    apiUrl: string,
    sessionToken: string | null
): Promise<void> {
    if (!sessionToken) {
        return;
    }

    try {
        await httpClient.post(
            `${apiUrl}/login/logout/`,
            {},
            {
                headers: { 'X-Fbx-App-Auth': sessionToken },
                timeout: 5000
            }
        );
    } catch (error) {
        throw new Error(`Logout failed: ${(error as Error).message}`);
    }
}

export async function getConnectionInfo(
    apiUrl: string,
    sessionToken: string | null
): Promise<ConnectionInfo> {
    try {
        const response = await httpClient.get<FreeboxResponse<FreeboxConnectionResponse>>(
            `${apiUrl}/connection/`,
            {
                headers: { 'X-Fbx-App-Auth': sessionToken ?? '' },
                timeout: 10000
            }
        );

        if (!response.data.success) {
            throw new Error(`API error: ${response.data.msg || 'Unknown error'}`);
        }

        return response.data.result;
    } catch (error) {
        handleHttpError(error, 'Failed to get connection info');
    }
}

export async function requestAuthorization(
    apiUrl: string,
    appId: string,
    appName: string,
    appVersion: string,
    deviceName: string
): Promise<FreeboxAuthorizeResult> {
    try {
        const response = await httpClient.post<FreeboxResponse<FreeboxAuthorizeResult>>(
            `${apiUrl}/login/authorize/`,
            {
                app_id: appId,
                app_name: appName,
                app_version: appVersion,
                device_name: deviceName
            }
        );

        if (!response.data.success) {
            throw new Error(
                `Authorization request failed: ${response.data.msg || 'Unknown error'}`
            );
        }

        return response.data.result;
    } catch (error) {
        handleHttpError(error, 'Request failed');
    }
}

export async function trackAuthorizationStatus(
    apiUrl: string,
    trackId: number | string
): Promise<FreeboxAuthorizeResult> {
    try {
        const response = await httpClient.get<FreeboxResponse<FreeboxAuthorizeResult>>(
            `${apiUrl}/login/authorize/${trackId}`
        );

        if (!response.data.success) {
            throw new Error(`Tracking failed: ${response.data.msg || 'Unknown error'}`);
        }

        return response.data.result;
    } catch (error) {
        handleHttpError(error, 'Tracking error');
    }
}

export async function saveToken(
    tokenFile: string,
    appToken: string,
    trackId: number | string,
    appId: string
): Promise<void> {
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
        throw new Error(`Failed to save token: ${(error as Error).message}`);
    }
}

// The WiFi API is only available on /api/v2, regardless of the configured API version.
export function toV2Url(apiUrl: string): string {
    return apiUrl.replace(/\/api\/v\d+\/?$/, '/api/v2');
}

export async function getConnectedDevices(
    apiUrl: string,
    sessionToken: string | null
): Promise<DeviceCounts> {
    const headers = { 'X-Fbx-App-Auth': sessionToken ?? '' };

    const [lanResult, wifiResult] = await Promise.allSettled([
        httpClient.get<FreeboxResponse<LanHost[]>>(`${apiUrl}/lan/browser/pub/`, {
            headers,
            timeout: 10000
        }),
        httpClient.get<FreeboxResponse<WifiBss[]>>(`${toV2Url(apiUrl)}/wifi/bss/`, {
            headers,
            timeout: 10000
        })
    ]);

    if (lanResult.status === 'rejected') {
        // A failure to get LAN devices is critical for this function.
        handleHttpError(lanResult.reason, 'Failed to get connected devices from LAN API');
    }

    if (lanResult.status !== 'fulfilled') {
        throw new Error('Failed to get connected devices from LAN API');
    }

    if (!lanResult.value.data.success) {
        throw new Error(`LAN API error: ${lanResult.value.data.msg || 'Unknown error'}`);
    }

    const activeHosts = lanResult.value.data.result.filter((host) => host.active);
    const total = activeHosts.length;
    const devices: DeviceSnapshot[] = activeHosts.map((host) => ({
        mac: host.l2ident?.id ?? '',
        name: host.primary_name,
        type: host.host_type
    }));

    let wifi = 0;
    if (wifiResult.status === 'fulfilled' && wifiResult.value.data.success) {
        wifi = wifiResult.value.data.result.reduce(
            (sum, bss) => sum + (bss.status?.sta_count ?? 0),
            0
        );
    } else {
        // A failure to get WiFi devices is not critical. Log and continue.
        const errorMsg =
            wifiResult.status === 'rejected'
                ? ((wifiResult.reason as Error)?.message ?? String(wifiResult.reason))
                : (wifiResult.value.data.msg || 'Unknown API error');
        console.warn(`Could not fetch WiFi device count: ${errorMsg}`);
    }

    return { total, wifi, devices };
}

export async function getFtthInfo(apiUrl: string, sessionToken: string | null): Promise<FtthInfo> {
    try {
        const response = await httpClient.get<FreeboxResponse<FtthInfo>>(
            `${apiUrl}/connection/ftth/`,
            {
                headers: { 'X-Fbx-App-Auth': sessionToken ?? '' },
                timeout: 10000
            }
        );

        if (!response.data.success) {
            throw new Error(`FTTH API error: ${response.data.msg || 'Unknown error'}`);
        }

        return response.data.result;
    } catch (error) {
        handleHttpError(error, 'Failed to get FTTH info');
    }
}

export async function getSystemInfo(
    apiUrl: string,
    sessionToken: string | null
): Promise<SystemInfo> {
    try {
        const response = await httpClient.get<FreeboxResponse<SystemInfo>>(`${apiUrl}/system/`, {
            headers: { 'X-Fbx-App-Auth': sessionToken ?? '' },
            timeout: 10000
        });

        if (!response.data.success) {
            throw new Error(`System API error: ${response.data.msg || 'Unknown error'}`);
        }

        return normalizeSystemInfo(response.data.result);
    } catch (error) {
        handleHttpError(error, 'Failed to get system info');
    }
}

// API v8 moved temperatures and fans from flat fields to sensors/fans arrays.
// Normalize both formats to flat fields so the rest of the code is unaffected.
function normalizeSystemInfo(raw: SystemInfo): SystemInfo {
    const normalized = { ...raw };

    if (Array.isArray(normalized.sensors)) {
        normalized.temp_cpu_cp_master ??= normalized.sensors.find((s: SystemSensor) => s.id === 'temp_cpu_cp_master')?.value;
        normalized.temp_cpu_ap ??= normalized.sensors.find((s: SystemSensor) => s.id === 'temp_cpu_ap')?.value;
        normalized.temp_sw ??= normalized.sensors.find((s: SystemSensor) => s.id === 'temp_sw')?.value;
    }

    if (Array.isArray(normalized.fans) && normalized.fan_rpm == null) {
        const values = normalized.fans
            .map((f: SystemFan) => f.value)
            .filter((v): v is number => v != null);
        if (values.length > 0) {
            normalized.fan_rpm = Math.max(...values);
        }
    }

    return normalized;
}

export async function getStorageDisks(
    apiUrl: string,
    sessionToken: string | null
): Promise<StorageDisk[]> {
    try {
        const response = await httpClient.get<FreeboxResponse<StorageDisk[]>>(
            `${apiUrl}/storage/disk/`,
            {
                headers: { 'X-Fbx-App-Auth': sessionToken ?? '' },
                timeout: 10000
            }
        );

        if (!response.data.success) {
            throw new Error(`Storage API error: ${response.data.msg || 'Unknown error'}`);
        }

        return response.data.result ?? [];
    } catch (error) {
        handleHttpError(error, 'Failed to get storage disks');
    }
}

export function isAuthorizationGranted(status: FreeboxAuthorizationStatus): boolean {
    return status === 'granted';
}
