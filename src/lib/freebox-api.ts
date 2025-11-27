import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs/promises';
import type {
    ConnectionInfo,
    FreeboxAuthorizeResult,
    FreeboxAuthorizationStatus,
    FreeboxConnectionResponse
} from './types.js';

interface FreeboxResponse<T> {
    success: boolean;
    result: T;
    msg?: string;
}

function handleAxiosError(error: unknown, defaultMessage: string): never {
    if (typeof axios.isAxiosError === 'function' && axios.isAxiosError(error) && error.response) {
        throw new Error(
            `Freebox API error: ${error.response.status} - ${
                error.response.data?.msg || error.message
            }`
        );
    }

    const axiosLike = error as { response?: { status: number; data?: { msg?: string } }; message?: string };

    if (axiosLike.response) {
        throw new Error(
            `Freebox API error: ${axiosLike.response.status} - ${
                axiosLike.response.data?.msg || axiosLike.message || 'Unknown error'
            }`
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
        const response = await axios.get<FreeboxResponse<{ challenge: string }>>(
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
        handleAxiosError(error, 'Failed to get challenge');
    }
}

export async function openSession(
    apiUrl: string,
    appId: string,
    password: string
): Promise<string> {
    try {
        const response = await axios.post<FreeboxResponse<{ session_token: string }>>(
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
        handleAxiosError(error, 'Session failed');
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
        await axios.post(
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
        const response = await axios.get<FreeboxResponse<FreeboxConnectionResponse>>(
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
        handleAxiosError(error, 'Failed to get connection info');
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
        const response = await axios.post<FreeboxResponse<FreeboxAuthorizeResult>>(
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
        handleAxiosError(error, 'Request failed');
    }
}

export async function trackAuthorizationStatus(
    apiUrl: string,
    trackId: number | string
): Promise<FreeboxAuthorizeResult> {
    try {
        const response = await axios.get<FreeboxResponse<FreeboxAuthorizeResult>>(
            `${apiUrl}/login/authorize/${trackId}`
        );

        if (!response.data.success) {
            throw new Error(`Tracking failed: ${response.data.msg || 'Unknown error'}`);
        }

        return response.data.result;
    } catch (error) {
        handleAxiosError(error, 'Tracking error');
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

export function isAuthorizationGranted(status: FreeboxAuthorizationStatus): boolean {
    return status === 'granted';
}
