import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/freebox-api.js', () => ({
    readAppToken: vi.fn(),
    loginToFreebox: vi.fn(),
    getConnectionInfo: vi.fn(),
    logoutFromFreebox: vi.fn()
}));

vi.mock('../lib/heartbeat.js', () => ({
    sendHeartbeat: vi.fn()
}));

vi.mock('../lib/utils.js', async () => {
    const actual = await vi.importActual('../lib/utils.js');
    return {
        ...actual,
        log: vi.fn(),
        sleep: vi.fn().mockResolvedValue()
    };
});

const freeboxApi = await import('../lib/freebox-api.js');
const heartbeat = await import('../lib/heartbeat.js');
const { createMonitor } = await import('../lib/monitor.js');

const mockConfig = {
    vpsUrl: 'https://example.com/report',
    secret: 'super-secret',
    appId: 'app.monitor',
    freeboxApiUrl: 'http://mafreebox.freebox.fr/api/v4',
    heartbeatInterval: 1000,
    maxRetries: 2,
    retryDelay: 50,
    tokenFile: 'token.json',
    sessionRefreshInterval: 1000
};

describe('monitor', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('starts monitoring loop and schedules intervals', async () => {
        freeboxApi.readAppToken.mockResolvedValue('app-token');
        freeboxApi.loginToFreebox.mockResolvedValue('session-token');
        freeboxApi.getConnectionInfo.mockResolvedValue({ state: 'up', media: 'ftth' });
        heartbeat.sendHeartbeat.mockResolvedValue({ success: true });

        const monitor = createMonitor(mockConfig);
        await monitor.start();

        expect(heartbeat.sendHeartbeat).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(mockConfig.heartbeatInterval);
        await vi.runOnlyPendingTimersAsync();

        expect(heartbeat.sendHeartbeat.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('refreshes session after configured interval', async () => {
        freeboxApi.readAppToken.mockResolvedValue('app-token');
        freeboxApi.loginToFreebox.mockResolvedValue('session-token');
        freeboxApi.getConnectionInfo.mockResolvedValue({ state: 'up', media: 'ftth' });
        heartbeat.sendHeartbeat.mockResolvedValue({ success: true });

        const monitor = createMonitor({ ...mockConfig, heartbeatInterval: 500 });
        await monitor.start();

        expect(freeboxApi.loginToFreebox).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(1500);
        await vi.runOnlyPendingTimersAsync();

        expect(freeboxApi.loginToFreebox.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('re-authenticates when connection fetch returns auth error', async () => {
        freeboxApi.readAppToken.mockResolvedValue('app-token');
        freeboxApi.loginToFreebox.mockResolvedValue('session-token');
        const authError = new Error('Invalid session token');
        freeboxApi.getConnectionInfo
            .mockRejectedValueOnce(authError)
            .mockResolvedValueOnce({ state: 'up', media: 'ftth' });
        heartbeat.sendHeartbeat.mockResolvedValue({ success: true });

        const monitor = createMonitor(mockConfig);
        await monitor.start();

        expect(freeboxApi.loginToFreebox).toHaveBeenCalledTimes(2);
        expect(heartbeat.sendHeartbeat).toHaveBeenCalledTimes(1);
    });

    it('logs out and stops scheduling on shutdown', async () => {
        freeboxApi.readAppToken.mockResolvedValue('app-token');
        freeboxApi.loginToFreebox.mockResolvedValue('session-token');
        freeboxApi.getConnectionInfo.mockResolvedValue({ state: 'up', media: 'ftth' });
        heartbeat.sendHeartbeat.mockResolvedValue({ success: true });
        freeboxApi.logoutFromFreebox.mockResolvedValue();

        const monitor = createMonitor(mockConfig);
        await monitor.start();

        await monitor.stop();

        vi.advanceTimersByTime(mockConfig.heartbeatInterval);
        await vi.runOnlyPendingTimersAsync();

        expect(freeboxApi.logoutFromFreebox).toHaveBeenCalledTimes(1);
        expect(heartbeat.sendHeartbeat).toHaveBeenCalledTimes(1);
    });
});
