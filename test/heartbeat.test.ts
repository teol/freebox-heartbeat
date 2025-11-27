import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendHeartbeat } from '../src/lib/heartbeat.js';

vi.mock('../src/lib/http-client.js', () => ({
    post: vi.fn(),
    HttpClientError: class HttpClientError extends Error {
        public readonly response?: {
            status: number;
            statusText: string;
            data?: unknown;
        };

        constructor(message: string, status?: number, statusText?: string, data?: unknown) {
            super(message);
            this.name = 'HttpClientError';
            if (status !== undefined && statusText !== undefined) {
                this.response = { status, statusText, data };
            }
        }
    }
}));

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
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('sendHeartbeat', () => {
        const vpsUrl = 'https://example.com/heartbeat';
        const mockData = {
            token: 'secret',
            ipv4: '1.2.3.4',
            connection_state: 'up',
            media_state: 'ftth',
            bandwidth_down: 1000000000,
            bandwidth_up: 600000000,
            timestamp: '2025-11-26T10:00:00.000Z'
        };

        it('should send heartbeat successfully on first try', async () => {
            const { post } = await import('../src/lib/http-client.js');
            const mockResponse = { data: { success: true } };
            vi.mocked(post).mockResolvedValue(mockResponse);

            const result = await sendHeartbeat(vpsUrl, mockData);

            expect(result).toEqual({ success: true });
            expect(post).toHaveBeenCalledOnce();
            expect(post).toHaveBeenCalledWith(vpsUrl, mockData, {
                timeout: 15000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        });

        it('should retry on network failure', async () => {
            const { post } = await import('../src/lib/http-client.js');
            const { sleep } = await import('../src/lib/utils.js');
            vi.mocked(post)
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({ data: { success: true } });

            const result = await sendHeartbeat(vpsUrl, mockData, 3, 100);

            expect(result).toEqual({ success: true });
            expect(post).toHaveBeenCalledTimes(2);
            expect(sleep).toHaveBeenCalledWith(100);
        });

        it('should retry up to max retries', async () => {
            const { post } = await import('../src/lib/http-client.js');
            const { sleep } = await import('../src/lib/utils.js');
            vi.mocked(post).mockRejectedValue(new Error('Network error'));

            await expect(sendHeartbeat(vpsUrl, mockData, 3, 50)).rejects.toThrow(
                'Failed to send heartbeat after 3 retries'
            );

            expect(post).toHaveBeenCalledTimes(4);
            expect(sleep).toHaveBeenCalledTimes(3);
        });

        it('should handle HTTP error responses', async () => {
            const { post, HttpClientError } = await import('../src/lib/http-client.js');
            const error = new HttpClientError('Request failed', 500, 'Internal Server Error');
            vi.mocked(post).mockRejectedValue(error);

            await expect(sendHeartbeat(vpsUrl, mockData, 2, 50)).rejects.toThrow(
                'Failed to send heartbeat after 2 retries: 500 - Internal Server Error'
            );
        });

        it('should handle 404 errors', async () => {
            const { post, HttpClientError } = await import('../src/lib/http-client.js');
            const error = new HttpClientError('Not found', 404, 'Not Found');
            vi.mocked(post).mockRejectedValue(error);

            await expect(sendHeartbeat(vpsUrl, mockData, 1, 50)).rejects.toThrow('404 - Not Found');
        });

        it('should retry with exponential backoff when called multiple times', async () => {
            const { post } = await import('../src/lib/http-client.js');
            const { sleep } = await import('../src/lib/utils.js');
            vi.mocked(post)
                .mockRejectedValueOnce(new Error('Error 1'))
                .mockRejectedValueOnce(new Error('Error 2'))
                .mockResolvedValueOnce({ data: { success: true } });

            await sendHeartbeat(vpsUrl, mockData, 5, 100);

            expect(sleep).toHaveBeenCalledTimes(2);
            expect(sleep).toHaveBeenNthCalledWith(1, 100);
            expect(sleep).toHaveBeenNthCalledWith(2, 100);
        });

        it('should include correct timeout', async () => {
            const { post } = await import('../src/lib/http-client.js');
            vi.mocked(post).mockResolvedValue({ data: { success: true } });

            await sendHeartbeat(vpsUrl, mockData);

            const callArgs = vi.mocked(post).mock.calls[0];
            expect(callArgs[2].timeout).toBe(15000);
        });

        it('should send with correct content type', async () => {
            const { post } = await import('../src/lib/http-client.js');
            vi.mocked(post).mockResolvedValue({ data: { success: true } });

            await sendHeartbeat(vpsUrl, mockData);

            const callArgs = vi.mocked(post).mock.calls[0];
            expect(callArgs[2].headers['Content-Type']).toBe('application/json');
        });

        it('should handle timeout errors', async () => {
            const { post } = await import('../src/lib/http-client.js');
            const error = new Error('Request timeout after 15000ms');
            vi.mocked(post).mockRejectedValue(error);

            await expect(sendHeartbeat(vpsUrl, mockData, 1, 50)).rejects.toThrow(
                'Request timeout after 15000ms'
            );
        });

        it('should not retry if maxRetries is 0', async () => {
            const { post } = await import('../src/lib/http-client.js');
            vi.mocked(post).mockRejectedValue(new Error('Network error'));

            await expect(sendHeartbeat(vpsUrl, mockData, 0, 50)).rejects.toThrow(
                'Failed to send heartbeat after 0 retries'
            );

            expect(post).toHaveBeenCalledOnce();
        });
    });
});
