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
    state?: string | null;
    media?: string | null;
    bandwidth_down?: number | null;
    bandwidth_up?: number | null;
}

export interface HeartbeatPayload {
    token: string;
    ipv4: string | null;
    connection_state: string;
    media_state: string;
    bandwidth_down: number;
    bandwidth_up: number;
    timestamp: string;
}

export interface FreeboxAuthorizeResult {
    app_token: string;
    track_id: number | string;
    status?: string;
    challenge?: string;
}

export interface FreeboxConnectionResponse {
    ipv4: string | null;
    state: string;
    media: string;
    bandwidth_down: number;
    bandwidth_up: number;
}

export type FreeboxAuthorizationStatus = 'pending' | 'timeout' | 'granted' | 'denied' | string;
