export interface MonitorConfig {
    vpsUrl: string;
    secret: string;
    appId: string;
    freeboxApiUrl: string;
    heartbeatInterval: number;
    maxRetries: number;
    retryDelay: number;
    tokenFile: string;
    sessionRefreshInterval: number;
}

export interface ConnectionInfo {
    ipv4?: string | null;
    ipv6?: string | null;
    state?: string | null;
    media?: string | null;
    type?: string | null;
    bandwidth_down?: number | null;
    bandwidth_up?: number | null;
    rate_down?: number | null;
    rate_up?: number | null;
    bytes_down?: number | null;
    bytes_up?: number | null;
    ipv4_port_range?: [number, number] | null;
}

export interface FtthInfo {
    // Raw values from the API are in units of 0.01 dBm (divide by 100 to get dBm).
    sfp_pwr_rx: number;
    sfp_pwr_tx: number;
    sfp_has_signal: boolean;
    link: boolean;
}

export interface SystemSensor {
    id: string;
    value: number;
}

export interface SystemFan {
    id: string;
    value: number;
}

export interface SystemInfo {
    // Flat fields present in older API versions
    temp_cpu_cp_master?: number;
    temp_cpu_ap?: number;
    temp_sw?: number;
    fan_rpm?: number;
    uptime_val?: number;
    // Array format introduced in API v8
    sensors?: SystemSensor[];
    fans?: SystemFan[];
}

export interface LanHostL3Connectivity {
    addr: string;
    af: 'ipv4' | 'ipv6';
    active: boolean;
    reachable: boolean;
    last_activity: number;
    last_time_reachable: number;
}

export interface LanHostL2Ident {
    id: string;
    type: string;
}

export interface LanHost {
    id: string;
    primary_name: string;
    host_type: string;
    active: boolean;
    reachable: boolean;
    last_activity: number;
    persistent: boolean;
    vendor_name?: string;
    l2ident?: LanHostL2Ident;
    l3connectivities: LanHostL3Connectivity[];
}

export interface WifiBssStatus {
    sta_count: number;
}

export interface WifiBss {
    id: string;
    status: WifiBssStatus;
}

export interface DeviceSnapshot {
    mac: string;
    name: string;
    type: string;
}

export interface DeviceCounts {
    total: number;
    wifi: number;
    devices: DeviceSnapshot[];
}

export interface HeartbeatPayload {
    // Connection
    ipv4: string | null;
    ipv6: string | null;
    connection_state: string;
    media_state: string;
    connection_type: string;
    bandwidth_down: number;
    bandwidth_up: number;
    rate_down: number;
    rate_up: number;
    bytes_down: number;
    bytes_up: number;
    // Connected devices
    connected_devices_total: number | null;
    connected_devices_wifi: number | null;
    active_devices: DeviceSnapshot[] | null;
    // FTTH optical link (null on non-FTTH lines)
    sfp_pwr_rx_dbm: number | null;
    sfp_pwr_tx_dbm: number | null;
    // System health
    temp_cpu: number | null;
    temp_switch: number | null;
    fan_rpm: number | null;
    uptime: number | null;
    timestamp: string;
}

export interface FreeboxAuthorizeResult {
    app_token?: string;
    track_id?: number | string;
    status?: FreeboxAuthorizationStatus;
    challenge?: string;
}

export interface FreeboxConnectionResponse {
    ipv4: string | null;
    ipv6: string;
    state: string;
    media: string;
    type: string;
    bandwidth_down: number;
    bandwidth_up: number;
    rate_down: number;
    rate_up: number;
    bytes_down: number;
    bytes_up: number;
    ipv4_port_range: [number, number];
}

export type FreeboxAuthorizationStatus = 'pending' | 'timeout' | 'granted' | 'denied' | string;
