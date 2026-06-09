import type {
    ConnectionInfo,
    DeviceCounts,
    FtthInfo,
    HeartbeatPayload,
    MonitorConfig,
    StorageDisk,
    SystemInfo
} from './types.js';

export function log(message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO'): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function validateConfig(
    config: Partial<MonitorConfig>,
    defaults: Record<string, unknown> = {}
): boolean {
    const requiredFields: Array<keyof MonitorConfig> = [
        'vpsUrl',
        'secret',
        'appId',
        'freeboxApiUrl'
    ];
    const missingFields = requiredFields.filter((field) => !config[field]);

    if (missingFields.length > 0) {
        throw new Error(`Missing required configuration fields: ${missingFields.join(', ')}`);
    }

    // const unchangedDefaults = Object.entries(defaults)
    //     .filter(([field, defaultValue]) => config[field as keyof MonitorConfig] === defaultValue)
    //     .map(([field]) => field);

    // if (unchangedDefaults.length > 0) {
    //     throw new Error(`Configuration fields must be customized: ${unchangedDefaults.join(', ')}`);
    // }

    return true;
}

export function buildHeartbeatPayload(
    connectionInfo: ConnectionInfo | null,
    deviceCounts?: DeviceCounts | null,
    ftthInfo?: FtthInfo | null,
    systemInfo?: SystemInfo | null,
    storageDisks?: StorageDisk[] | null
): HeartbeatPayload {
    if (!connectionInfo) {
        throw new Error('Connection info is required');
    }

    // sfp_pwr_rx/tx are in units of 0.01 dBm; convert to dBm rounded to 2 decimal places.
    const sfpRx = ftthInfo?.sfp_pwr_rx != null ? Math.round(ftthInfo.sfp_pwr_rx) / 100 : null;
    const sfpTx = ftthInfo?.sfp_pwr_tx != null ? Math.round(ftthInfo.sfp_pwr_tx) / 100 : null;

    // Use the hottest available CPU temperature for a single actionable metric.
    const cpuTemps = [systemInfo?.temp_cpu_cp_master, systemInfo?.temp_cpu_ap].filter(
        (t): t is number => t != null
    );
    const tempCpu = cpuTemps.length > 0 ? Math.max(...cpuTemps) : null;

    // Aggregate storage metrics across all enabled disks and their mounted partitions.
    const enabledDisks = storageDisks?.filter((d) => d.state === 'enabled') ?? [];
    let diskTemp: number | null = null;
    let diskUsedBytes: number | null = null;
    let diskFreeBytes: number | null = null;
    let diskTotalBytes: number | null = null;
    let diskReadErrors: number | null = null;
    let diskWriteErrors: number | null = null;

    if (enabledDisks.length > 0) {
        const temps = enabledDisks.map((d) => d.temp).filter((t): t is number => t != null);
        diskTemp = temps.length > 0 ? Math.max(...temps) : null;

        const readErrors = enabledDisks
            .map((d) => d.read_error_requests)
            .filter((v): v is number => v != null);
        diskReadErrors = readErrors.length > 0 ? readErrors.reduce((sum, v) => sum + v, 0) : null;

        const writeErrors = enabledDisks
            .map((d) => d.write_error_requests)
            .filter((v): v is number => v != null);
        diskWriteErrors = writeErrors.length > 0 ? writeErrors.reduce((sum, v) => sum + v, 0) : null;

        const mountedPartitions = enabledDisks.flatMap((d) =>
            (d.partitions ?? []).filter((p) => p.state === 'mounted')
        );
        if (mountedPartitions.length > 0) {
            const usedValues = mountedPartitions.map((p) => p.used_bytes).filter((v): v is number => v != null);
            diskUsedBytes = usedValues.length > 0 ? usedValues.reduce((sum, v) => sum + v, 0) : null;

            const freeValues = mountedPartitions.map((p) => p.free_bytes).filter((v): v is number => v != null);
            diskFreeBytes = freeValues.length > 0 ? freeValues.reduce((sum, v) => sum + v, 0) : null;

            const totalValues = mountedPartitions.map((p) => p.total_bytes).filter((v): v is number => v != null);
            diskTotalBytes = totalValues.length > 0 ? totalValues.reduce((sum, v) => sum + v, 0) : null;
        }
    }

    return {
        ipv4: connectionInfo.ipv4 ?? null,
        ipv6: connectionInfo.ipv6 ?? null,
        connection_state: connectionInfo.state ?? 'unknown',
        media_state: connectionInfo.media ?? 'unknown',
        connection_type: connectionInfo.type ?? 'unknown',
        bandwidth_down: connectionInfo.bandwidth_down ?? 0,
        bandwidth_up: connectionInfo.bandwidth_up ?? 0,
        rate_down: connectionInfo.rate_down ?? 0,
        rate_up: connectionInfo.rate_up ?? 0,
        bytes_down: connectionInfo.bytes_down ?? 0,
        bytes_up: connectionInfo.bytes_up ?? 0,
        connected_devices_total: deviceCounts?.total ?? null,
        connected_devices_wifi: deviceCounts?.wifi ?? null,
        active_devices: deviceCounts?.devices ?? null,
        sfp_pwr_rx_dbm: sfpRx,
        sfp_pwr_tx_dbm: sfpTx,
        temp_cpu: tempCpu,
        temp_switch: systemInfo?.temp_sw ?? null,
        fan_rpm: systemInfo?.fan_rpm ?? null,
        uptime: systemInfo?.uptime_val ?? null,
        disk_temp: diskTemp,
        disk_used_bytes: diskUsedBytes,
        disk_free_bytes: diskFreeBytes,
        disk_total_bytes: diskTotalBytes,
        disk_read_errors: diskReadErrors,
        disk_write_errors: diskWriteErrors,
        timestamp: new Date().toISOString()
    };
}

export function isAuthError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const maybeError = error as { message?: string };
    if (!maybeError.message) {
        return false;
    }

    const authKeywords = ['auth', '403', 'invalid session', 'unauthorized'];
    const errorMessage = maybeError.message.toLowerCase();

    return authKeywords.some((keyword) => errorMessage.includes(keyword));
}
