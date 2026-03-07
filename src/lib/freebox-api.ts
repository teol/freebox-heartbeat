import crypto from 'crypto';
import fs from 'fs/promises';
import * as httpClient from './http-client.js';
import { HttpClientError } from './http-client.js';
import type {
    ConnectionInfo,
    DeviceCounts,
    FreeboxAuthorizeResult,
    FreeboxAuthorizationStatus,
    FreeboxConnectionResponse,
    LanHost,
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
function toV2Url(apiUrl: string): string {
    return apiUrl.replace(/\/api\/v\d+$/, '/api/v2');
}

export async function getConnectedDevices(
    apiUrl: string,
    sessionToken: string | null
): Promise<DeviceCounts> {
    const headers = { 'X-Fbx-App-Auth': sessionToken ?? '' };

    try {
        const [lanResponse, wifiResponse] = await Promise.all([
            httpClient.get<FreeboxResponse<LanHost[]>>(`${apiUrl}/lan/browser/pub/`, {
                headers,
                timeout: 10000
            }),
            httpClient.get<FreeboxResponse<WifiBss[]>>(`${toV2Url(apiUrl)}/wifi/bss/`, {
                headers,
                timeout: 10000
            })
        ]);

        if (!lanResponse.data.success) {
            throw new Error(`LAN API error: ${lanResponse.data.msg || 'Unknown error'}`);
        }

        if (!wifiResponse.data.success) {
            throw new Error(`WiFi API error: ${wifiResponse.data.msg || 'Unknown error'}`);
        }

        const total = lanResponse.data.result.filter((host) => host.active).length;
        const wifi = wifiResponse.data.result.reduce(
            (sum, bss) => sum + (bss.status?.sta_count ?? 0),
            0
        );

        return { total, wifi };
    } catch (error) {
        handleHttpError(error, 'Failed to get connected devices');
    }
}

export function isAuthorizationGranted(status: FreeboxAuthorizationStatus): boolean {
    return status === 'granted';
}
