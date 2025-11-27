import { describe, it, expect, vi, beforeEach } from 'vitest';
import { log, sleep, validateConfig, buildHeartbeatPayload, isAuthError } from '../lib/utils.js';

describe('utils', () => {
    describe('log', () => {
        beforeEach(() => {
            vi.spyOn(console, 'log').mockImplementation(() => {});
        });

        it('should log message with timestamp and default level', () => {
            log('Test message');
            expect(console.log).toHaveBeenCalled();
            const logCall = console.log.mock.calls[0][0];
            expect(logCall).toContain('[INFO]');
            expect(logCall).toContain('Test message');
            expect(logCall).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
        });

        it('should log message with custom level', () => {
            log('Error occurred', 'ERROR');
            expect(console.log).toHaveBeenCalled();
            const logCall = console.log.mock.calls[0][0];
            expect(logCall).toContain('[ERROR]');
            expect(logCall).toContain('Error occurred');
        });
    });

    describe('sleep', () => {
        it('should resolve after specified time', async () => {
            const start = Date.now();
            await sleep(100);
            const end = Date.now();
            expect(end - start).toBeGreaterThanOrEqual(90);
        });

        it('should return a promise', () => {
            const result = sleep(1);
            expect(result).toBeInstanceOf(Promise);
        });
    });

    describe('validateConfig', () => {
        it('should validate correct configuration', () => {
            const config = {
                vpsUrl: 'https://example.com',
                secret: 'my-secret',
                appId: 'my-app',
                freeboxApiUrl: 'http://mafreebox.freebox.fr/api/v4'
            };
            expect(validateConfig(config)).toBe(true);
        });

        it('should throw error for missing vpsUrl', () => {
            const config = {
                secret: 'my-secret',
                appId: 'my-app',
                freeboxApiUrl: 'http://mafreebox.freebox.fr/api/v4'
            };
            expect(() => validateConfig(config)).toThrow(
                'Missing required configuration fields: vpsUrl'
            );
        });

        it('should throw error for multiple missing fields', () => {
            const config = {
                vpsUrl: 'https://example.com'
            };
            expect(() => validateConfig(config)).toThrow('Missing required configuration fields');
        });

        it('should throw error for empty configuration', () => {
            expect(() => validateConfig({})).toThrow();
        });

        it('should throw when configuration values match defaults', () => {
            const config = {
                vpsUrl: 'https://votre-vps.com/report',
                secret: 'SECRET_PARTAGE',
                appId: 'fr.mon.monitoring',
                freeboxApiUrl: 'http://mafreebox.freebox.fr/api/v4'
            };

            expect(() =>
                validateConfig(config, {
                    vpsUrl: 'https://votre-vps.com/report',
                    secret: 'SECRET_PARTAGE',
                    appId: 'fr.mon.monitoring'
                })
            ).toThrow('Configuration fields must be customized');
        });
    });

    describe('buildHeartbeatPayload', () => {
        it('should build payload with complete connection info', () => {
            const connectionInfo = {
                ipv4: '1.2.3.4',
                state: 'up',
                media: 'ftth',
                bandwidth_down: 1000000000,
                bandwidth_up: 600000000
            };
            const secret = 'my-secret';

            const payload = buildHeartbeatPayload(connectionInfo, secret);

            expect(payload).toMatchObject({
                token: 'my-secret',
                ipv4: '1.2.3.4',
                connection_state: 'up',
                media_state: 'ftth',
                bandwidth_down: 1000000000,
                bandwidth_up: 600000000
            });
            expect(payload.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
        });

        it('should use defaults for missing fields', () => {
            const connectionInfo = {};
            const secret = 'my-secret';

            const payload = buildHeartbeatPayload(connectionInfo, secret);

            expect(payload).toMatchObject({
                token: 'my-secret',
                ipv4: null,
                connection_state: 'unknown',
                media_state: 'unknown',
                bandwidth_down: 0,
                bandwidth_up: 0
            });
        });

        it('should throw error if connectionInfo is null', () => {
            expect(() => buildHeartbeatPayload(null, 'secret')).toThrow(
                'Connection info is required'
            );
        });

        it('should handle partial connection info', () => {
            const connectionInfo = {
                state: 'down',
                media: 'backup'
            };
            const payload = buildHeartbeatPayload(connectionInfo, 'test-secret');

            expect(payload.connection_state).toBe('down');
            expect(payload.media_state).toBe('backup');
            expect(payload.ipv4).toBeNull();
        });
    });

    describe('isAuthError', () => {
        it('should return true for auth keyword', () => {
            const error = new Error('Authentication failed');
            expect(isAuthError(error)).toBe(true);
        });

        it('should return true for 403 error', () => {
            const error = new Error('Error 403 Forbidden');
            expect(isAuthError(error)).toBe(true);
        });

        it('should return true for invalid session', () => {
            const error = new Error('Invalid session token');
            expect(isAuthError(error)).toBe(true);
        });

        it('should return true for unauthorized', () => {
            const error = new Error('Unauthorized access');
            expect(isAuthError(error)).toBe(true);
        });

        it('should return false for non-auth errors', () => {
            const error = new Error('Network timeout');
            expect(isAuthError(error)).toBe(false);
        });

        it('should return false for null error', () => {
            expect(isAuthError(null)).toBe(false);
        });

        it('should return false for error without message', () => {
            expect(isAuthError({})).toBe(false);
        });

        it('should be case insensitive', () => {
            const error = new Error('AUTH ERROR');
            expect(isAuthError(error)).toBe(true);
        });
    });
});
