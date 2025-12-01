import http from 'http';
import https from 'https';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

export interface HttpClientOptions {
    method?: HttpMethod;
    headers?: Record<string, string>;
    timeout?: number;
    body?: string | object;
}

export interface HttpClientResponse<T = unknown> {
    data: T;
    status: number;
    statusText: string;
    headers: http.IncomingHttpHeaders;
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

function buildRequestOptions(url: URL, options: HttpClientOptions): http.RequestOptions {
    const isHttps = url.protocol === 'https:';
    const defaultPort = isHttps ? 443 : 80;

    return {
        hostname: url.hostname,
        port: url.port || defaultPort,
        path: url.pathname + url.search,
        method: options.method ?? 'GET',
        headers: options.headers ?? {}
    };
}

function request<T>(url: string, options: HttpClientOptions = {}): Promise<HttpClientResponse<T>> {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        const requestOptions = buildRequestOptions(parsedUrl, options);

        let bodyData: string | undefined;
        if (options.body !== undefined) {
            let serializedBody: string;
            if (typeof options.body === 'string') {
                serializedBody = options.body;
            } else {
                serializedBody = JSON.stringify(options.body);
            }
            bodyData = serializedBody;

            const headers: http.OutgoingHttpHeaders = { ...(options.headers ?? {}) };

            if (
                typeof options.body === 'object' &&
                !headers['Content-Type'] &&
                !headers['content-type']
            ) {
                headers['Content-Type'] = 'application/json';
            }

            headers['Content-Length'] = Buffer.byteLength(serializedBody).toString();

            requestOptions.headers = headers;
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
                const statusCode = res.statusCode;

                if (statusCode === undefined) {
                    reject(new HttpClientError('Missing status code in HTTP response'));
                    return;
                }

                const statusMessage = res.statusMessage ?? 'Unknown';
                const contentTypeHeader = res.headers['content-type'];

                let contentType = '';
                if (Array.isArray(contentTypeHeader)) {
                    contentType = contentTypeHeader[0] ?? '';
                } else if (typeof contentTypeHeader === 'string') {
                    contentType = contentTypeHeader;
                }

                const isJson =
                    contentType.includes('application/json') || contentType.includes('+json');

                let parsedData: unknown;
                if (!rawData) {
                    parsedData = null;
                } else if (isJson) {
                    try {
                        parsedData = JSON.parse(rawData);
                    } catch (error) {
                        if (statusCode >= 200 && statusCode < 300) {
                            reject(
                                new HttpClientError(
                                    `Failed to parse JSON response: ${(error as Error).message}`,
                                    statusCode,
                                    statusMessage,
                                    rawData
                                )
                            );
                            return;
                        }

                        parsedData = rawData;
                    }
                } else {
                    parsedData = rawData;
                }

                if (statusCode >= 200 && statusCode < 300) {
                    resolve({
                        data: parsedData as T,
                        status: statusCode,
                        statusText: statusMessage,
                        headers: res.headers
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

        if (options.timeout !== undefined) {
            req.setTimeout(options.timeout);
        }

        req.on('error', (error: Error) => {
            req.destroy();
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

export function get<T>(
    url: string,
    options: Omit<HttpClientOptions, 'method' | 'body'> = {}
): Promise<HttpClientResponse<T>> {
    return request<T>(url, { ...options, method: 'GET' });
}

export function post<T>(
    url: string,
    data?: object | string,
    options: Omit<HttpClientOptions, 'method' | 'body'> = {}
): Promise<HttpClientResponse<T>> {
    return request<T>(url, {
        ...options,
        method: 'POST',
        body: data
    });
}

export function put<T>(
    url: string,
    data?: object | string,
    options: Omit<HttpClientOptions, 'method' | 'body'> = {}
): Promise<HttpClientResponse<T>> {
    return request<T>(url, { ...options, method: 'PUT', body: data });
}

export function patch<T>(
    url: string,
    data?: object | string,
    options: Omit<HttpClientOptions, 'method' | 'body'> = {}
): Promise<HttpClientResponse<T>> {
    return request<T>(url, { ...options, method: 'PATCH', body: data });
}

export function del<T>(
    url: string,
    options: Omit<HttpClientOptions, 'method' | 'body'> = {}
): Promise<HttpClientResponse<T>> {
    return request<T>(url, { ...options, method: 'DELETE' });
}

export default { get, post, put, patch, delete: del };
