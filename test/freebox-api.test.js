import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
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
} from '../lib/freebox-api.js';

vi.mock('axios');
vi.mock('fs/promises');

describe('freebox-api', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('readAppToken', () => {
        it('should read and parse token from file', async () => {
            const tokenData = JSON.stringify({ app_token: 'test-token-123' });
            fs.readFile.mockResolvedValue(tokenData);

            const token = await readAppToken('token.json');

            expect(token).toBe('test-token-123');
            expect(fs.readFile).toHaveBeenCalledWith('token.json', 'utf8');
        });

        it('should throw error if token file not found', async () => {
            const error = new Error('File not found');
            error.code = 'ENOENT';
            fs.readFile.mockRejectedValue(error);

            await expect(readAppToken('token.json')).rejects.toThrow(
                'token.json not found. Please run "node authorize.js"'
            );
        });

        it('should throw error if app_token is missing', async () => {
            fs.readFile.mockResolvedValue(JSON.stringify({}));

            await expect(readAppToken('token.json')).rejects.toThrow(
                'app_token not found in token.json'
            );
        });

        it('should propagate other file read errors', async () => {
            fs.readFile.mockRejectedValue(new Error('Permission denied'));

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
            axios.get.mockResolvedValue(mockResponse);

            const challenge = await getLoginChallenge('http://mafreebox.freebox.fr/api/v4');

            expect(challenge).toBe('abc123');
            expect(axios.get).toHaveBeenCalledWith('http://mafreebox.freebox.fr/api/v4/login/', {
                timeout: 10000
            });
        });

        it('should throw error if API returns failure', async () => {
            axios.get.mockResolvedValue({
                data: { success: false }
            });

            await expect(getLoginChallenge('http://api')).rejects.toThrow(
                'Failed to get login challenge'
            );
        });

        it('should handle network errors', async () => {
            axios.get.mockRejectedValue(new Error('Network error'));

            await expect(getLoginChallenge('http://api')).rejects.toThrow(
                'Failed to get challenge: Network error'
            );
        });

        it('should handle API error responses', async () => {
            const error = new Error('Request failed');
            error.response = {
                status: 500,
                data: { msg: 'Internal error' }
            };
            axios.get.mockRejectedValue(error);

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
            axios.post.mockResolvedValue(mockResponse);

            const token = await openSession('http://api', 'my-app', 'password-hash');

            expect(token).toBe('session-123');
            expect(axios.post).toHaveBeenCalledWith(
                'http://api/login/session/',
                {
                    app_id: 'my-app',
                    password: 'password-hash'
                },
                { timeout: 10000 }
            );
        });

        it('should throw error if session fails', async () => {
            axios.post.mockResolvedValue({
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
            axios.get.mockResolvedValue({
                data: {
                    success: true,
                    result: { challenge: 'challenge123' }
                }
            });
            axios.post.mockResolvedValue({
                data: {
                    success: true,
                    result: { session_token: 'token123' }
                }
            });

            const token = await loginToFreebox('http://api', 'my-app', 'app-token');

            expect(token).toBe('token123');
            expect(axios.get).toHaveBeenCalled();
            expect(axios.post).toHaveBeenCalled();
        });
    });

    describe('logoutFromFreebox', () => {
        it('should logout successfully', async () => {
            axios.post.mockResolvedValue({ data: { success: true } });

            await logoutFromFreebox('http://api', 'session-token');

            expect(axios.post).toHaveBeenCalledWith(
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

            expect(axios.post).not.toHaveBeenCalled();
        });

        it('should throw error on logout failure', async () => {
            axios.post.mockRejectedValue(new Error('Network error'));

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
            axios.get.mockResolvedValue({
                data: {
                    success: true,
                    result: mockConnection
                }
            });

            const info = await getConnectionInfo('http://api', 'session-token');

            expect(info).toEqual(mockConnection);
            expect(axios.get).toHaveBeenCalledWith('http://api/connection/', {
                headers: { 'X-Fbx-App-Auth': 'session-token' },
                timeout: 10000
            });
        });

        it('should throw error if API returns failure', async () => {
            axios.get.mockResolvedValue({
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
            axios.post.mockResolvedValue({
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
            expect(axios.post).toHaveBeenCalledWith('http://api/login/authorize/', {
                app_id: 'app-id',
                app_name: 'App Name',
                app_version: '1.0.0',
                device_name: 'Device'
            });
        });

        it('should throw error on authorization failure', async () => {
            axios.post.mockResolvedValue({
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
            axios.get.mockResolvedValue({
                data: {
                    success: true,
                    result: mockResult
                }
            });

            const result = await trackAuthorizationStatus('http://api', 123);

            expect(result).toEqual(mockResult);
            expect(axios.get).toHaveBeenCalledWith('http://api/login/authorize/123');
        });

        it('should throw error on tracking failure', async () => {
            axios.get.mockResolvedValue({
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
            fs.writeFile.mockResolvedValue();
            fs.chmod.mockResolvedValue();

            await saveToken('token.json', 'app-token-123', 456, 'my-app');

            expect(fs.writeFile).toHaveBeenCalled();
            const savedData = JSON.parse(fs.writeFile.mock.calls[0][1]);
            expect(savedData).toMatchObject({
                app_token: 'app-token-123',
                track_id: 456,
                app_id: 'my-app'
            });
            expect(savedData.created_at).toBeDefined();

            expect(fs.chmod).toHaveBeenCalledWith('token.json', 0o600);
        });

        it('should throw error if write fails', async () => {
            fs.writeFile.mockRejectedValue(new Error('Disk full'));

            await expect(saveToken('token.json', 'token', 1, 'app')).rejects.toThrow(
                'Failed to save token: Disk full'
            );
        });
    });
});
