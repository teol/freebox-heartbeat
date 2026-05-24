import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/lib/freebox-api.js', () => ({
    readAppToken: vi.fn(),
    loginToFreebox: vi.fn(),
    getConnectionInfo: vi.fn(),
    getConnectedDevices: vi.fn(),
    getFtthInfo: vi.fn(),
    getSystemInfo: vi.fn(),
    logoutFromFreebox: vi.fn()
}));

vi.mock('../src/lib/heartbeat.js', () => ({
    sendHeartbeat: vi.fn()
}));

vi.mock('../src/lib/utils.js', async () => {
    const actual =
        await vi.importActual<typeof import('../src/lib/utils.js')>('../src/lib/utils.js');
    return {
        ...actual,
        log: vi.fn(),
        sleep: vi.fn().mockResolvedValue(undefined)
    };
});

const freeboxApi = await import('../src/lib/freebox-api.js');
const heartbeat = await import('../src/lib/heartbeat.js');
const { createMonitor } = await import('../src/lib/monitor.js');

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

    function setupDefaultMocks() {
        freeboxApi.readAppToken.mockResolvedValue('app-token');
        freeboxApi.loginToFreebox.mockResolvedValue('session-token');
        freeboxApi.getConnectionInfo.mockResolvedValue({ state: 'up', media: 'ftth' });
        freeboxApi.getConnectedDevices.mockResolvedValue({ total: 5, wifi: 3 });
        freeboxApi.getFtthInfo.mockResolvedValue({
            sfp_pwr_rx: -1917,
            sfp_pwr_tx: 269,
            sfp_has_signal: true,
            link: true
        });
        freeboxApi.getSystemInfo.mockResolvedValue({
            temp_cpu_cp_master: 74,
            temp_cpu_ap: 63,
            temp_sw: 45,
            fan_rpm: 1441,
            uptime_val: 7189324
        });
        heartbeat.sendHeartbeat.mockResolvedValue({ success: true });
    }

    it('starts monitoring loop and schedules intervals', async () => {
        setupDefaultMocks();

        const monitor = createMonitor(mockConfig);
        await monitor.start();

        expect(heartbeat.sendHeartbeat).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(mockConfig.heartbeatInterval);
        await vi.runOnlyPendingTimersAsync();

        expect(heartbeat.sendHeartbeat.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('includes device counts in the heartbeat payload', async () => {
        setupDefaultMocks();
        freeboxApi.getConnectedDevices.mockResolvedValue({ total: 10, wifi: 7 });

        const monitor = createMonitor(mockConfig);
        await monitor.start();

        const payload = heartbeat.sendHeartbeat.mock.calls[0][2];
        expect(payload.connected_devices_total).toBe(10);
        expect(payload.connected_devices_wifi).toBe(7);
    });

    it('includes FTTH and system data in the heartbeat payload', async () => {
        setupDefaultMocks();

        const monitor = createMonitor(mockConfig);
        await monitor.start();

        const payload = heartbeat.sendHeartbeat.mock.calls[0][2];
        expect(payload.sfp_pwr_rx_dbm).toBeCloseTo(-19.17, 1);
        expect(payload.sfp_pwr_tx_dbm).toBeCloseTo(2.69, 1);
        expect(payload.temp_cpu).toBe(74);
        expect(payload.temp_switch).toBe(45);
        expect(payload.fan_rpm).toBe(1441);
        expect(payload.uptime).toBe(7189324);
    });

    it('sends heartbeat with null optional fields when secondary fetches fail', async () => {
        setupDefaultMocks();
        freeboxApi.getConnectedDevices.mockRejectedValue(new Error('LAN API unreachable'));
        freeboxApi.getFtthInfo.mockRejectedValue(new Error('FTTH API error'));
        freeboxApi.getSystemInfo.mockRejectedValue(new Error('System API error'));

        const monitor = createMonitor(mockConfig);
        await monitor.start();

        expect(heartbeat.sendHeartbeat).toHaveBeenCalledTimes(1);
        const payload = heartbeat.sendHeartbeat.mock.calls[0][2];
        expect(payload.connected_devices_total).toBeNull();
        expect(payload.connected_devices_wifi).toBeNull();
        expect(payload.sfp_pwr_rx_dbm).toBeNull();
        expect(payload.temp_cpu).toBeNull();
    });

    it('refreshes session after configured interval', async () => {
        setupDefaultMocks();

        const monitor = createMonitor({ ...mockConfig, heartbeatInterval: 500 });
        await monitor.start();

        expect(freeboxApi.loginToFreebox).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(1500);
        await vi.runOnlyPendingTimersAsync();

        expect(freeboxApi.loginToFreebox.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('re-authenticates when connection fetch returns auth error', async () => {
        setupDefaultMocks();
        const authError = new Error('Invalid session token');
        freeboxApi.getConnectionInfo
            .mockRejectedValueOnce(authError)
            .mockResolvedValueOnce({ state: 'up', media: 'ftth' });

        const monitor = createMonitor(mockConfig);
        await monitor.start();

        expect(freeboxApi.loginToFreebox).toHaveBeenCalledTimes(2);
        expect(heartbeat.sendHeartbeat).toHaveBeenCalledTimes(1);
    });

    it('logs out and stops scheduling on shutdown', async () => {
        setupDefaultMocks();
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
