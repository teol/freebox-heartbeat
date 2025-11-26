import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { sendHeartbeat } from '../lib/heartbeat.js';

vi.mock('axios');
vi.mock('../lib/utils.js', async () => {
    const actual = await vi.importActual('../lib/utils.js');
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
            const mockResponse = { data: { success: true } };
            axios.post.mockResolvedValue(mockResponse);

            const result = await sendHeartbeat(vpsUrl, mockData);

            expect(result).toEqual({ success: true });
            expect(axios.post).toHaveBeenCalledOnce();
            expect(axios.post).toHaveBeenCalledWith(vpsUrl, mockData, {
                timeout: 15000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        });

        it('should retry on network failure', async () => {
            const { sleep } = await import('../lib/utils.js');
            axios.post
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({ data: { success: true } });

            const result = await sendHeartbeat(vpsUrl, mockData, 3, 100);

            expect(result).toEqual({ success: true });
            expect(axios.post).toHaveBeenCalledTimes(2);
            expect(sleep).toHaveBeenCalledWith(100);
        });

        it('should retry up to max retries', async () => {
            const { sleep } = await import('../lib/utils.js');
            axios.post.mockRejectedValue(new Error('Network error'));

            await expect(sendHeartbeat(vpsUrl, mockData, 3, 50)).rejects.toThrow(
                'Failed to send heartbeat after 3 retries'
            );

            expect(axios.post).toHaveBeenCalledTimes(4);
            expect(sleep).toHaveBeenCalledTimes(3);
        });

        it('should handle HTTP error responses', async () => {
            const error = new Error('Request failed');
            error.response = {
                status: 500,
                statusText: 'Internal Server Error'
            };
            axios.post.mockRejectedValue(error);

            await expect(sendHeartbeat(vpsUrl, mockData, 2, 50)).rejects.toThrow(
                'Failed to send heartbeat after 2 retries: 500 - Internal Server Error'
            );
        });

        it('should handle 404 errors', async () => {
            const error = new Error('Not found');
            error.response = {
                status: 404,
                statusText: 'Not Found'
            };
            axios.post.mockRejectedValue(error);

            await expect(sendHeartbeat(vpsUrl, mockData, 1, 50)).rejects.toThrow('404 - Not Found');
        });

        it('should retry with exponential backoff when called multiple times', async () => {
            const { sleep } = await import('../lib/utils.js');
            axios.post
                .mockRejectedValueOnce(new Error('Error 1'))
                .mockRejectedValueOnce(new Error('Error 2'))
                .mockResolvedValueOnce({ data: { success: true } });

            await sendHeartbeat(vpsUrl, mockData, 5, 100);

            expect(sleep).toHaveBeenCalledTimes(2);
            expect(sleep).toHaveBeenNthCalledWith(1, 100);
            expect(sleep).toHaveBeenNthCalledWith(2, 100);
        });

        it('should include correct timeout', async () => {
            axios.post.mockResolvedValue({ data: { success: true } });

            await sendHeartbeat(vpsUrl, mockData);

            const callArgs = axios.post.mock.calls[0];
            expect(callArgs[2].timeout).toBe(15000);
        });

        it('should send with correct content type', async () => {
            axios.post.mockResolvedValue({ data: { success: true } });

            await sendHeartbeat(vpsUrl, mockData);

            const callArgs = axios.post.mock.calls[0];
            expect(callArgs[2].headers['Content-Type']).toBe('application/json');
        });

        it('should handle timeout errors', async () => {
            const error = new Error('timeout of 15000ms exceeded');
            error.code = 'ECONNABORTED';
            axios.post.mockRejectedValue(error);

            await expect(sendHeartbeat(vpsUrl, mockData, 1, 50)).rejects.toThrow(
                'timeout of 15000ms exceeded'
            );
        });

        it('should not retry if maxRetries is 0', async () => {
            axios.post.mockRejectedValue(new Error('Network error'));

            await expect(sendHeartbeat(vpsUrl, mockData, 0, 50)).rejects.toThrow(
                'Failed to send heartbeat after 0 retries'
            );

            expect(axios.post).toHaveBeenCalledOnce();
        });
    });
});
