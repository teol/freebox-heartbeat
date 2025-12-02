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

export interface HeartbeatPayload {
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
