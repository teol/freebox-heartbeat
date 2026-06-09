import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/lib/freebox-api.js', () => ({
    readAppToken: vi.fn(),
    loginToFreebox: vi.fn(),
    getConnectionInfo: vi.fn(),
    getConnectedDevices: vi.fn(),
    getFtthInfo: vi.fn(),
    getSystemInfo: vi.fn(),
    getStorageDisks: vi.fn(),
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
        freeboxApi.getConnectedDevices.mockResolvedValue({ total: 5, wifi: 3, devices: [] });
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
        freeboxApi.getStorageDisks.mockResolvedValue([
            {
                state: 'enabled',
                temp: 36,
                read_error_requests: 0,
                write_error_requests: 0,
                partitions: [
                    { state: 'mounted', total_bytes: 480000000000, used_bytes: 8000000000, free_bytes: 472000000000 }
                ]
            }
        ]);
        heartbeat.sendHeartbeat.mockResolvedValue({ success: true });
    }

    it('strips trailing slash from freeboxApiUrl before making API calls', async () => {
        setupDefaultMocks();

        const monitor = createMonitor({
            ...mockConfig,
            freeboxApiUrl: 'http://mafreebox.freebox.fr/api/v4/'
        });
        await monitor.start();

        expect(freeboxApi.getConnectionInfo).toHaveBeenCalledWith(
            'http://mafreebox.freebox.fr/api/v4',
            expect.anything()
        );
    });

    it('starts monitoring loop and schedules intervals', async () => {
        setupDefaultMocks();

        const monitor = createMonitor(mockConfig);
        await monitor.start();

        expect(heartbeat.sendHeartbeat).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(mockConfig.heartbeatInterval);
        await vi.runOnlyPendingTimersAsync();

        expect(heartbeat.sendHeartbeat.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('includes device counts and active_devices in the heartbeat payload', async () => {
        setupDefaultMocks();
        freeboxApi.getConnectedDevices.mockResolvedValue({
            total: 10,
            wifi: 7,
            devices: [
                { mac: 'AA:BB:CC:11:22:33', name: 'TestPhone', type: 'smartphone' },
                { mac: 'DD:EE:FF:44:55:66', name: 'TestDesktop', type: 'workstation' }
            ]
        });

        const monitor = createMonitor(mockConfig);
        await monitor.start();

        const payload = heartbeat.sendHeartbeat.mock.calls[0][2];
        expect(payload.connected_devices_total).toBe(10);
        expect(payload.connected_devices_wifi).toBe(7);
        expect(payload.active_devices).toEqual([
            { mac: 'AA:BB:CC:11:22:33', name: 'TestPhone', type: 'smartphone' },
            { mac: 'DD:EE:FF:44:55:66', name: 'TestDesktop', type: 'workstation' }
        ]);
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

    it('skips FTTH fetch and sets sfp fields to null on non-FTTH connections', async () => {
        setupDefaultMocks();
        freeboxApi.getConnectionInfo.mockResolvedValue({ state: 'up', media: 'backup' });

        const monitor = createMonitor(mockConfig);
        await monitor.start();

        expect(freeboxApi.getFtthInfo).not.toHaveBeenCalled();
        const payload = heartbeat.sendHeartbeat.mock.calls[0][2];
        expect(payload.sfp_pwr_rx_dbm).toBeNull();
        expect(payload.sfp_pwr_tx_dbm).toBeNull();
    });

    it('includes aggregated disk metrics in the heartbeat payload', async () => {
        setupDefaultMocks();
        freeboxApi.getStorageDisks.mockResolvedValue([
            {
                state: 'enabled',
                temp: 38,
                read_error_requests: 2,
                write_error_requests: 1,
                partitions: [
                    { state: 'mounted', total_bytes: 500000000000, used_bytes: 100000000000, free_bytes: 400000000000 },
                    { state: 'unmounted', total_bytes: 100000000000, used_bytes: 50000000000, free_bytes: 50000000000 }
                ]
            },
            {
                state: 'disabled',
                temp: 99,
                read_error_requests: 999,
                write_error_requests: 999,
                partitions: []
            }
        ]);

        const monitor = createMonitor(mockConfig);
        await monitor.start();

        const payload = heartbeat.sendHeartbeat.mock.calls[0][2];
        expect(payload.disk_temp).toBe(38);
        expect(payload.disk_read_errors).toBe(2);
        expect(payload.disk_write_errors).toBe(1);
        expect(payload.disk_total_bytes).toBe(500000000000);
        expect(payload.disk_used_bytes).toBe(100000000000);
        expect(payload.disk_free_bytes).toBe(400000000000);
    });

    it('sends heartbeat with null optional fields when secondary fetches fail', async () => {
        setupDefaultMocks();
        freeboxApi.getConnectedDevices.mockRejectedValue(new Error('LAN API unreachable'));
        freeboxApi.getFtthInfo.mockRejectedValue(new Error('FTTH API error'));
        freeboxApi.getSystemInfo.mockRejectedValue(new Error('System API error'));
        freeboxApi.getStorageDisks.mockRejectedValue(new Error('Storage API error'));

        const monitor = createMonitor(mockConfig);
        await monitor.start();

        expect(heartbeat.sendHeartbeat).toHaveBeenCalledTimes(1);
        const payload = heartbeat.sendHeartbeat.mock.calls[0][2];
        expect(payload.connected_devices_total).toBeNull();
        expect(payload.connected_devices_wifi).toBeNull();
        expect(payload.active_devices).toBeNull();
        expect(payload.sfp_pwr_rx_dbm).toBeNull();
        expect(payload.temp_cpu).toBeNull();
        expect(payload.disk_temp).toBeNull();
        expect(payload.disk_read_errors).toBeNull();
        expect(payload.disk_free_bytes).toBeNull();
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
