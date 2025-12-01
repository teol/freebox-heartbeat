import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import {
    readAppToken,
    calculatePassword,
    getLoginChallenge,
    openSession,
    loginToFreebox,
    logoutFromFreebox,
    getConnectionInfo,
    requestAuthorization,
    trackAuthorizationStatus,
    saveToken
} from '../src/lib/freebox-api.js';

vi.mock('../src/lib/http-client.js', async () => {
    const actual = await vi.importActual<typeof import('../src/lib/http-client.js')>(
        '../src/lib/http-client.js'
    );
    return {
        ...actual,
        get: vi.fn(),
        post: vi.fn()
    };
});

vi.mock('fs/promises', () => ({
    default: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        chmod: vi.fn(),
        access: vi.fn()
    }
}));

const mockedFs = fs as unknown as {
    readFile: ReturnType<typeof vi.fn>;
    writeFile: ReturnType<typeof vi.fn>;
    chmod: ReturnType<typeof vi.fn>;
    access: ReturnType<typeof vi.fn>;
};

describe('freebox-api', () => {
    let get: ReturnType<typeof vi.fn>;
    let post: ReturnType<typeof vi.fn>;
    let HttpClientError: typeof import('../src/lib/http-client.js').HttpClientError;

    beforeEach(async () => {
        vi.clearAllMocks();
        const httpClient = await import('../src/lib/http-client.js');
        get = vi.mocked(httpClient.get);
        post = vi.mocked(httpClient.post);
        HttpClientError = httpClient.HttpClientError;
    });

    describe('readAppToken', () => {
        it('should read and parse token from file', async () => {
            const tokenData = JSON.stringify({ app_token: 'test-token-123' });
            mockedFs.readFile.mockResolvedValue(tokenData);

            const token = await readAppToken('token.json');

            expect(token).toBe('test-token-123');
            expect(mockedFs.readFile).toHaveBeenCalledWith('token.json', 'utf8');
        });

        it('should throw error if token file not found', async () => {
            const error = new Error('File not found') as Error & { code?: string };
            error.code = 'ENOENT';
            mockedFs.readFile.mockRejectedValue(error);

            await expect(readAppToken('token.json')).rejects.toThrow(
                'token.json not found. Please run "yarn authorize"'
            );
        });

        it('should throw error if app_token is missing', async () => {
            mockedFs.readFile.mockResolvedValue(JSON.stringify({}));

            await expect(readAppToken('token.json')).rejects.toThrow(
                'app_token not found in token.json'
            );
        });

        it('should propagate other file read errors', async () => {
            mockedFs.readFile.mockRejectedValue(new Error('Permission denied'));

            await expect(readAppToken('token.json')).rejects.toThrow('Permission denied');
        });
    });

    describe('calculatePassword', () => {
        it('should calculate HMAC-SHA1 correctly', () => {
            const challenge = 'test-challenge';
            const appToken = 'test-token';

            const password = calculatePassword(challenge, appToken);

            expect(typeof password).toBe('string');
            expect(password.length).toBe(40);
            expect(password).toMatch(/^[a-f0-9]{40}$/);
        });

        it('should throw error if challenge is missing', () => {
            expect(() => calculatePassword(null, 'token')).toThrow(
                'Challenge and app token are required'
            );
        });

        it('should throw error if appToken is missing', () => {
            expect(() => calculatePassword('challenge', null)).toThrow(
                'Challenge and app token are required'
            );
        });

        it('should produce different hashes for different inputs', () => {
            const password1 = calculatePassword('challenge1', 'token');
            const password2 = calculatePassword('challenge2', 'token');

            expect(password1).not.toBe(password2);
        });
    });

    describe('getLoginChallenge', () => {
        it('should get challenge from API', async () => {
            const mockResponse = {
                data: {
                    success: true,
                    result: {
                        challenge: 'abc123'
                    }
                }
            };
            get.mockResolvedValue(mockResponse);

            const challenge = await getLoginChallenge('http://mafreebox.freebox.fr/api/v4');

            expect(challenge).toBe('abc123');
            expect(get).toHaveBeenCalledWith('http://mafreebox.freebox.fr/api/v4/login/', {
                timeout: 10000
            });
        });

        it('should throw error if API returns failure', async () => {
            get.mockResolvedValue({
                data: { success: false }
            });

            await expect(getLoginChallenge('http://api')).rejects.toThrow(
                'Failed to get login challenge'
            );
        });

        it('should handle network errors', async () => {
            get.mockRejectedValue(new Error('Network error'));

            await expect(getLoginChallenge('http://api')).rejects.toThrow(
                'Failed to get challenge: Network error'
            );
        });

        it('should handle API error responses', async () => {
            const error = new HttpClientError('Request failed', 500, 'Internal Server Error', {
                msg: 'Internal error'
            });
            get.mockRejectedValue(error);

            await expect(getLoginChallenge('http://api')).rejects.toThrow('Freebox API error: 500');
        });
    });

    describe('openSession', () => {
        it('should open session successfully', async () => {
            const mockResponse = {
                data: {
                    success: true,
                    result: {
                        session_token: 'session-123'
                    }
                }
            };
            post.mockResolvedValue(mockResponse);

            const token = await openSession('http://api', 'my-app', 'password-hash');

            expect(token).toBe('session-123');
            expect(post).toHaveBeenCalledWith(
                'http://api/login/session/',
                {
                    app_id: 'my-app',
                    password: 'password-hash'
                },
                { timeout: 10000 }
            );
        });

        it('should throw error if session fails', async () => {
            post.mockResolvedValue({
                data: {
                    success: false,
                    msg: 'Invalid credentials'
                }
            });

            await expect(openSession('http://api', 'app', 'pass')).rejects.toThrow(
                'Session failed: Invalid credentials'
            );
        });
    });

    describe('loginToFreebox', () => {
        it('should perform complete login flow', async () => {
            get.mockResolvedValue({
                data: {
                    success: true,
                    result: { challenge: 'challenge123' }
                }
            });
            post.mockResolvedValue({
                data: {
                    success: true,
                    result: { session_token: 'token123' }
                }
            });

            const token = await loginToFreebox('http://api', 'my-app', 'app-token');

            expect(token).toBe('token123');
            expect(get).toHaveBeenCalled();
            expect(post).toHaveBeenCalled();
        });
    });

    describe('logoutFromFreebox', () => {
        it('should logout successfully', async () => {
            post.mockResolvedValue({ data: { success: true } });

            await logoutFromFreebox('http://api', 'session-token');

            expect(post).toHaveBeenCalledWith(
                'http://api/login/logout/',
                {},
                {
                    headers: { 'X-Fbx-App-Auth': 'session-token' },
                    timeout: 5000
                }
            );
        });

        it('should not call API if token is null', async () => {
            await logoutFromFreebox('http://api', null);

            expect(post).not.toHaveBeenCalled();
        });

        it('should throw error on logout failure', async () => {
            post.mockRejectedValue(new Error('Network error'));

            await expect(logoutFromFreebox('http://api', 'token')).rejects.toThrow(
                'Logout failed: Network error'
            );
        });
    });

    describe('getConnectionInfo', () => {
        it('should retrieve connection information', async () => {
            const mockConnection = {
                ipv4: '1.2.3.4',
                state: 'up',
                media: 'ftth',
                bandwidth_down: 1000000000,
                bandwidth_up: 600000000
            };
            get.mockResolvedValue({
                data: {
                    success: true,
                    result: mockConnection
                }
            });

            const info = await getConnectionInfo('http://api', 'session-token');

            expect(info).toEqual(mockConnection);
            expect(get).toHaveBeenCalledWith('http://api/connection/', {
                headers: { 'X-Fbx-App-Auth': 'session-token' },
                timeout: 10000
            });
        });

        it('should throw error if API returns failure', async () => {
            get.mockResolvedValue({
                data: {
                    success: false,
                    msg: 'Unauthorized'
                }
            });

            await expect(getConnectionInfo('http://api', 'token')).rejects.toThrow(
                'API error: Unauthorized'
            );
        });
    });

    describe('requestAuthorization', () => {
        it('should request authorization successfully', async () => {
            const mockResult = {
                app_token: 'new-token',
                track_id: 123
            };
            post.mockResolvedValue({
                data: {
                    success: true,
                    result: mockResult
                }
            });

            const result = await requestAuthorization(
                'http://api',
                'app-id',
                'App Name',
                '1.0.0',
                'Device'
            );

            expect(result).toEqual(mockResult);
            expect(post).toHaveBeenCalledWith('http://api/login/authorize/', {
                app_id: 'app-id',
                app_name: 'App Name',
                app_version: '1.0.0',
                device_name: 'Device'
            });
        });

        it('should throw error on authorization failure', async () => {
            post.mockResolvedValue({
                data: {
                    success: false,
                    msg: 'Invalid request'
                }
            });

            await expect(
                requestAuthorization('http://api', 'id', 'name', '1.0', 'device')
            ).rejects.toThrow('Authorization request failed');
        });
    });

    describe('trackAuthorizationStatus', () => {
        it('should track authorization status', async () => {
            const mockResult = {
                status: 'granted',
                app_token: 'final-token'
            };
            get.mockResolvedValue({
                data: {
                    success: true,
                    result: mockResult
                }
            });

            const result = await trackAuthorizationStatus('http://api', 123);

            expect(result).toEqual(mockResult);
            expect(get).toHaveBeenCalledWith('http://api/login/authorize/123');
        });

        it('should throw error on tracking failure', async () => {
            get.mockResolvedValue({
                data: {
                    success: false,
                    msg: 'Not found'
                }
            });

            await expect(trackAuthorizationStatus('http://api', 999)).rejects.toThrow(
                'Tracking failed: Not found'
            );
        });
    });

    describe('saveToken', () => {
        it('should save token to file with correct permissions', async () => {
            mockedFs.writeFile.mockResolvedValue(undefined);
            mockedFs.chmod.mockResolvedValue(undefined);

            await saveToken('token.json', 'app-token-123', 456, 'my-app');

            expect(mockedFs.writeFile).toHaveBeenCalled();
            const savedData = JSON.parse(mockedFs.writeFile.mock.calls[0][1]);
            expect(savedData).toMatchObject({
                app_token: 'app-token-123',
                track_id: 456,
                app_id: 'my-app'
            });
            expect(savedData.created_at).toBeDefined();

            expect(mockedFs.chmod).toHaveBeenCalledWith('token.json', 0o600);
        });

        it('should throw error if write fails', async () => {
            mockedFs.writeFile.mockRejectedValue(new Error('Disk full'));

            await expect(saveToken('token.json', 'token', 1, 'app')).rejects.toThrow(
                'Failed to save token: Disk full'
            );
        });
    });
});
