import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendHeartbeat } from '../src/lib/heartbeat.js';

vi.mock('../src/lib/http-client.js', async () => {
    const actual = await vi.importActual<typeof import('../src/lib/http-client.js')>(
        '../src/lib/http-client.js'
    );
    return {
        ...actual,
        post: vi.fn()
    };
});

vi.mock('../src/lib/utils.js', async () => {
    const actual =
        await vi.importActual<typeof import('../src/lib/utils.js')>('../src/lib/utils.js');
    return {
        ...actual,
        log: vi.fn(),
        sleep: vi.fn()
    };
});

describe('heartbeat', () => {
    let post: ReturnType<typeof vi.fn>;
    let sleep: ReturnType<typeof vi.fn>;
    let HttpClientError: typeof import('../src/lib/http-client.js').HttpClientError;

    beforeEach(async () => {
        vi.clearAllMocks();
        const httpClient = await import('../src/lib/http-client.js');
        const utils = await import('../src/lib/utils.js');
        post = vi.mocked(httpClient.post);
        sleep = vi.mocked(utils.sleep);
        HttpClientError = httpClient.HttpClientError;
    });

    describe('sendHeartbeat', () => {
        const vpsUrl = 'https://example.com';
        const secret = 'test-secret';
        const mockData = {
            ipv4: '1.2.3.4',
            ipv6: null,
            connection_state: 'up',
            media_state: 'ftth',
            connection_type: 'ethernet',
            bandwidth_down: 1000000000,
            bandwidth_up: 600000000,
            rate_down: 10176,
            rate_up: 7954,
            bytes_down: 43818124933,
            bytes_up: 1353818610,
            timestamp: '2025-11-26T10:00:00.000Z'
        };

        it('should send heartbeat successfully on first try', async () => {
            const mockResponse = { data: { success: true } };
            post.mockResolvedValue(mockResponse);

            const result = await sendHeartbeat(vpsUrl, secret, mockData);

            expect(result).toEqual({ success: true });
            expect(post).toHaveBeenCalledOnce();
            const callArgs = post.mock.calls[0];
            expect(callArgs[0]).toBe('https://example.com/heartbeat');
            expect(callArgs[1]).toEqual(mockData);
            expect(callArgs[2].timeout).toBe(15000);
            expect(callArgs[2].headers['Content-Type']).toBe('application/json');
            expect(callArgs[2].headers['Authorization']).toMatch(/^Bearer /);
            expect(callArgs[2].headers['Signature-Timestamp']).toBeDefined();
            expect(callArgs[2].headers['Signature-Nonce']).toBeDefined();
        });

        it('should retry on network failure', async () => {
            post.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce({
                data: { success: true }
            });

            const result = await sendHeartbeat(vpsUrl, secret, mockData, 3, 100);

            expect(result).toEqual({ success: true });
            expect(post).toHaveBeenCalledTimes(2);
            expect(sleep).toHaveBeenCalledWith(100);
        });

        it('should retry up to max retries', async () => {
            post.mockRejectedValue(new Error('Network error'));

            await expect(sendHeartbeat(vpsUrl, secret, mockData, 3, 50)).rejects.toThrow(
                'Failed to send heartbeat after 3 retries'
            );

            expect(post).toHaveBeenCalledTimes(4);
            expect(sleep).toHaveBeenCalledTimes(3);
        });

        it('should handle HTTP error responses', async () => {
            const error = new HttpClientError('Request failed', 500, 'Internal Server Error');
            post.mockRejectedValue(error);

            await expect(sendHeartbeat(vpsUrl, secret, mockData, 2, 50)).rejects.toThrow(
                'Failed to send heartbeat after 2 retries: 500 - Internal Server Error'
            );
        });

        it('should handle 404 errors', async () => {
            const error = new HttpClientError('Not found', 404, 'Not Found');
            post.mockRejectedValue(error);

            await expect(sendHeartbeat(vpsUrl, secret, mockData, 1, 50)).rejects.toThrow('404 - Not Found');
        });

        it('should retry with exponential backoff when called multiple times', async () => {
            post.mockRejectedValueOnce(new Error('Error 1'))
                .mockRejectedValueOnce(new Error('Error 2'))
                .mockResolvedValueOnce({ data: { success: true } });

            await sendHeartbeat(vpsUrl, secret, mockData, 5, 100);

            expect(sleep).toHaveBeenCalledTimes(2);
            expect(sleep).toHaveBeenNthCalledWith(1, 100);
            expect(sleep).toHaveBeenNthCalledWith(2, 100);
        });

        it('should include correct timeout', async () => {
            post.mockResolvedValue({ data: { success: true } });

            await sendHeartbeat(vpsUrl, secret, mockData);

            const callArgs = post.mock.calls[0];
            expect(callArgs[2].timeout).toBe(15000);
        });

        it('should send with correct content type', async () => {
            post.mockResolvedValue({ data: { success: true } });

            await sendHeartbeat(vpsUrl, secret, mockData);

            const callArgs = post.mock.calls[0];
            expect(callArgs[2].headers['Content-Type']).toBe('application/json');
        });

        it('should handle timeout errors', async () => {
            const error = new Error('Request timeout after 15000ms');
            post.mockRejectedValue(error);

            await expect(sendHeartbeat(vpsUrl, secret, mockData, 1, 50)).rejects.toThrow(
                'Request timeout after 15000ms'
            );
        });

        it('should not retry if maxRetries is 0', async () => {
            post.mockRejectedValue(new Error('Network error'));

            await expect(sendHeartbeat(vpsUrl, secret, mockData, 0, 50)).rejects.toThrow(
                'Failed to send heartbeat after 0 retries'
            );

            expect(post).toHaveBeenCalledOnce();
        });

        it.each([
            {
                description: 'should ensure URL ends with /heartbeat',
                url: 'https://example.com/api',
                expected: 'https://example.com/api/heartbeat'
            },
            {
                description: 'should not duplicate /heartbeat in URL',
                url: 'https://example.com/heartbeat',
                expected: 'https://example.com/heartbeat'
            },
            {
                description: 'should preserve custom port when appending /heartbeat',
                url: 'https://heartbeat.teol.casa:1337/api',
                expected: 'https://heartbeat.teol.casa:1337/api/heartbeat'
            },
            {
                description: 'should keep port when VPS URL already ends with /heartbeat',
                url: 'https://heartbeat.teol.casa:1337/api/heartbeat',
                expected: 'https://heartbeat.teol.casa:1337/api/heartbeat'
            },
            {
                description: 'should preserve query params when appending /heartbeat',
                url: 'https://example.com/api?foo=bar',
                expected: 'https://example.com/api/heartbeat?foo=bar'
            }
        ])('$description', async ({ url, expected }) => {
            post.mockResolvedValue({ data: { success: true } });

            await sendHeartbeat(url, secret, mockData);

            const callArgs = post.mock.calls[0];
            expect(callArgs[0]).toBe(expected);
        });

        it('should generate unique nonce for each request', async () => {
            post.mockResolvedValue({ data: { success: true } });

            await sendHeartbeat(vpsUrl, secret, mockData);
            await sendHeartbeat(vpsUrl, secret, mockData);

            const firstNonce = post.mock.calls[0][2].headers['Signature-Nonce'];
            const secondNonce = post.mock.calls[1][2].headers['Signature-Nonce'];
            expect(firstNonce).not.toBe(secondNonce);
        });
    });
});
