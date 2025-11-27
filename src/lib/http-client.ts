import http from 'http';
import https from 'https';

export interface HttpClientOptions {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    timeout?: number;
    body?: string | object;
}

export interface HttpClientResponse<T = unknown> {
    data: T;
    status: number;
    statusText: string;
}

export class HttpClientError extends Error {
    public readonly status?: number;
    public readonly statusText?: string;
    public readonly response?: {
        status: number;
        statusText: string;
        data?: unknown;
    };

    constructor(message: string, status?: number, statusText?: string, data?: unknown) {
        super(message);
        this.name = 'HttpClientError';
        this.status = status;
        this.statusText = statusText;
        if (status !== undefined) {
            this.response = { status, statusText: statusText ?? 'Unknown', data };
        }
    }
}

function buildRequestOptions(
    url: URL,
    options: HttpClientOptions
): http.RequestOptions {
    const isHttps = url.protocol === 'https:';
    const defaultPort = isHttps ? 443 : 80;

    return {
        hostname: url.hostname,
        port: url.port || defaultPort,
        path: url.pathname + url.search,
        method: options.method ?? 'GET',
        headers: options.headers ?? {},
        timeout: options.timeout
    };
}

function request<T>(url: string, options: HttpClientOptions = {}): Promise<HttpClientResponse<T>> {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        const requestOptions = buildRequestOptions(parsedUrl, options);

        let bodyData: string | undefined;
        if (options.body) {
            bodyData = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
            requestOptions.headers = {
                ...requestOptions.headers,
                'Content-Length': Buffer.byteLength(bodyData).toString()
            };
        }

        const req = protocol.request(requestOptions, (res) => {
            const chunks: Buffer[] = [];

            res.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
            });

            res.on('error', (error: Error) => {
                req.destroy();
                reject(new HttpClientError(`Response stream error: ${error.message}`));
            });

            res.on('end', () => {
                const rawData = Buffer.concat(chunks).toString('utf8');
                const statusCode = res.statusCode ?? 0;
                const statusMessage = res.statusMessage ?? 'Unknown';

                let parsedData: T;
                if (!rawData) {
                    parsedData = null as any;
                } else {
                    try {
                        parsedData = JSON.parse(rawData);
                    } catch {
                        parsedData = rawData as T;
                    }
                }

                if (statusCode >= 200 && statusCode < 300) {
                    resolve({
                        data: parsedData,
                        status: statusCode,
                        statusText: statusMessage
                    });
                } else {
                    reject(
                        new HttpClientError(
                            `HTTP ${statusCode}: ${statusMessage}`,
                            statusCode,
                            statusMessage,
                            parsedData
                        )
                    );
                }
            });
        });

        req.on('error', (error: Error) => {
            reject(new HttpClientError(error.message));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new HttpClientError(`Request timeout after ${options.timeout}ms`));
        });

        if (bodyData) {
            req.write(bodyData);
        }

        req.end();
    });
}

export function get<T>(url: string, options: Omit<HttpClientOptions, 'method' | 'body'> = {}): Promise<HttpClientResponse<T>> {
    return request<T>(url, { ...options, method: 'GET' });
}

export function post<T>(url: string, data?: object | string, options: Omit<HttpClientOptions, 'method' | 'body'> = {}): Promise<HttpClientResponse<T>> {
    const headers = { ...options.headers };
    if (data && typeof data === 'object') {
        headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    }

    return request<T>(url, {
        ...options,
        method: 'POST',
        body: data,
        headers
    });
}

export default { get, post };
