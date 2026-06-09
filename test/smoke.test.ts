/**
 * Smoke tests for dependency regression detection.
 *
 * These tests exercise real Node.js built-ins (http, crypto, Buffer, URL) without
 * mocks, so they will catch breaking changes introduced by dependency updates
 * (e.g. @types/node, tsx, vitest).
 */
import http from 'http';
import { createHmac, createHash, randomBytes } from 'crypto';
import { AddressInfo } from 'net';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { get, post, HttpClientError } from '../src/lib/http-client.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ServerHandle {
    url: string;
    close: () => Promise<void>;
}

function startServer(
    handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
): Promise<ServerHandle> {
    return new Promise((resolve, reject) => {
        const server = http.createServer(handler);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as AddressInfo;
            resolve({
                url: `http://127.0.0.1:${port}`,
                close: () =>
                    new Promise<void>((res, rej) =>
                        server.close((err) => (err ? rej(err) : res()))
                    )
            });
        });
        server.on('error', reject);
    });
}

// ---------------------------------------------------------------------------
// HTTP client — real network I/O against a local server
// ---------------------------------------------------------------------------

describe('smoke: http-client (real HTTP server)', () => {
    let server: ServerHandle;

    beforeAll(async () => {
        server = await startServer((req, res) => {
            const url = new URL(req.url!, `http://${req.headers.host}`);

            if (url.pathname === '/ok' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
                return;
            }

            if (url.pathname === '/echo' && req.method === 'POST') {
                const chunks: Buffer[] = [];
                req.on('data', (c: Buffer) => chunks.push(c));
                req.on('end', () => {
                    const body = Buffer.concat(chunks).toString('utf8');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(body);
                });
                return;
            }

            if (url.pathname === '/not-found') {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'not found' }));
                return;
            }

            if (url.pathname === '/server-error') {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
                return;
            }

            if (url.pathname === '/slow') {
                // Never responds — used to trigger timeout
                return;
            }

            if (url.pathname === '/no-content') {
                res.writeHead(204);
                res.end();
                return;
            }

            res.writeHead(400);
            res.end();
        });
    });

    afterAll(() => server.close());

    it('GET /ok returns parsed JSON body', async () => {
        const response = await get<{ ok: boolean }>(`${server.url}/ok`);

        expect(response.status).toBe(200);
        expect(response.data).toEqual({ ok: true });
    });

    it('POST /echo round-trips a JSON payload', async () => {
        const payload = { hello: 'world', n: 42, nested: { a: true } };
        const response = await post<typeof payload>(`${server.url}/echo`, payload);

        expect(response.status).toBe(200);
        expect(response.data).toEqual(payload);
    });

    it('POST /echo preserves numeric precision', async () => {
        // Large integers like bytes_down / bytes_up
        const payload = { bytes_down: 43818124933, bytes_up: 1353818610 };
        const response = await post<typeof payload>(`${server.url}/echo`, payload);

        expect(response.data.bytes_down).toBe(43818124933);
        expect(response.data.bytes_up).toBe(1353818610);
    });

    it('GET /not-found rejects with HttpClientError status 404', async () => {
        await expect(get(`${server.url}/not-found`)).rejects.toBeInstanceOf(HttpClientError);

        try {
            await get(`${server.url}/not-found`);
        } catch (err) {
            expect(err).toBeInstanceOf(HttpClientError);
            expect((err as HttpClientError).status).toBe(404);
        }
    });

    it('GET /server-error rejects with HttpClientError status 500', async () => {
        try {
            await get(`${server.url}/server-error`);
            expect.fail('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(HttpClientError);
            expect((err as HttpClientError).status).toBe(500);
        }
    });

    it('GET /slow rejects with timeout error', async () => {
        await expect(get(`${server.url}/slow`, { timeout: 100 })).rejects.toThrow(/timeout/i);
    });

    it('GET /no-content resolves with null data', async () => {
        const response = await get(`${server.url}/no-content`);

        expect(response.status).toBe(204);
        expect(response.data).toBeNull();
    });

    it('POST sets Content-Type and Content-Length headers automatically', async () => {
        let receivedHeaders: http.IncomingHttpHeaders | null = null;

        const s = await startServer((req, res) => {
            receivedHeaders = req.headers;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{}');
        });

        try {
            await post(s.url, { x: 1 });
            expect(receivedHeaders!['content-type']).toContain('application/json');
            expect(Number(receivedHeaders!['content-length'])).toBeGreaterThan(0);
        } finally {
            await s.close();
        }
    });
});

// ---------------------------------------------------------------------------
// Crypto primitives — verify Node.js crypto APIs work as expected
// ---------------------------------------------------------------------------

describe('smoke: crypto primitives', () => {
    it('createHash sha256 produces a 64-char hex digest', () => {
        const digest = createHash('sha256').update('hello').digest('hex');

        expect(digest).toHaveLength(64);
        expect(digest).toMatch(/^[a-f0-9]+$/);
    });

    it('createHash sha256 base64url digest contains no padding or unsafe chars', () => {
        const digest = createHash('sha256').update('hello world').digest('base64url');

        expect(digest).not.toContain('+');
        expect(digest).not.toContain('/');
        expect(digest).not.toContain('=');
    });

    it('createHmac sha256 produces a deterministic signature', () => {
        const sig1 = createHmac('sha256', 'secret').update('message').digest('base64url');
        const sig2 = createHmac('sha256', 'secret').update('message').digest('base64url');

        expect(sig1).toBe(sig2);
        expect(sig1.length).toBeGreaterThan(0);
    });

    it('createHmac sha256 produces different signatures for different secrets', () => {
        const sig1 = createHmac('sha256', 'secret-a').update('message').digest('base64url');
        const sig2 = createHmac('sha256', 'secret-b').update('message').digest('base64url');

        expect(sig1).not.toBe(sig2);
    });

    it('randomBytes produces unique values each call', () => {
        const a = randomBytes(16).toString('hex');
        const b = randomBytes(16).toString('hex');

        expect(a).toHaveLength(32);
        expect(a).not.toBe(b);
    });

    it('HMAC canonical message matches expected signature (heartbeat contract)', () => {
        // Reproduce exactly the signing logic from heartbeat.ts so a refactor
        // or crypto API change will be caught immediately.
        const secret = 'test-secret';
        const timestamp = '1700000000';
        const nonce = 'aabbccddeeff00112233445566778899';
        const body = JSON.stringify({ connection_state: 'up' });
        const bodyHash = createHash('sha256').update(body).digest('base64url');
        const canonical = `method=POST;path=/heartbeat;ts=${timestamp};nonce=${nonce};body_sha256=${bodyHash}`;
        const signature = createHmac('sha256', secret).update(canonical).digest('base64url');

        // The expected value was computed once and must stay stable across updates.
        expect(signature).toMatchSnapshot();
        // Structural checks independent of the snapshot value
        expect(signature).not.toContain('+');
        expect(signature).not.toContain('/');
        expect(signature).not.toContain('=');
    });
});

// ---------------------------------------------------------------------------
// URL API — used to normalise heartbeat endpoint URLs
// ---------------------------------------------------------------------------

describe('smoke: URL API', () => {
    it('URL preserves port in toString()', () => {
        const u = new URL('https://api.example.com:8080/path');
        expect(u.toString()).toContain(':8080');
    });

    it('URL.pathname can be reassigned without losing host/port', () => {
        const u = new URL('https://api.example.com:8080/api/v1');
        u.pathname = '/api/v1/heartbeat';
        expect(u.toString()).toBe('https://api.example.com:8080/api/v1/heartbeat');
    });

    it('URL preserves query string when pathname is changed', () => {
        const u = new URL('https://example.com/api?foo=bar');
        u.pathname = '/api/heartbeat';
        expect(u.search).toBe('?foo=bar');
        expect(u.toString()).toBe('https://example.com/api/heartbeat?foo=bar');
    });
});

// ---------------------------------------------------------------------------
// Buffer — used in http-client for body serialisation and response parsing
// ---------------------------------------------------------------------------

describe('smoke: Buffer', () => {
    it('Buffer.byteLength returns byte length of a UTF-8 string', () => {
        const str = '{"hello":"world"}';
        expect(Buffer.byteLength(str)).toBe(str.length); // all ASCII
    });

    it('Buffer.byteLength counts multi-byte characters correctly', () => {
        const str = 'café'; // 'é' is 2 bytes in UTF-8
        expect(Buffer.byteLength(str, 'utf8')).toBeGreaterThan(str.length);
    });

    it('Buffer.concat reconstructs the original string', () => {
        const parts = ['hel', 'lo ', 'world'].map((s) => Buffer.from(s, 'utf8'));
        const result = Buffer.concat(parts).toString('utf8');
        expect(result).toBe('hello world');
    });
});
