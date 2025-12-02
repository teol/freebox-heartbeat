import { createHmac, randomBytes } from 'crypto';
import * as httpClient from './http-client.js';
import { HttpClientError } from './http-client.js';
import type { HeartbeatPayload } from './types.js';
import { sleep, log } from './utils.js';

export async function sendHeartbeat(
    vpsUrl: string,
    secret: string,
    data: HeartbeatPayload,
    maxRetries = 3,
    retryDelay = 5000,
    retries = 0
): Promise<unknown> {
    try {
        // Ensure the URL ends with /heartbeat
        const url = vpsUrl.endsWith('/heartbeat') ? vpsUrl : `${vpsUrl.replace(/\/$/, '')}/heartbeat`;

        // Generate HMAC authentication headers
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonce = randomBytes(16).toString('hex');
        const canonicalMessage = `POST:/heartbeat:${timestamp}:${nonce}`;
        const signature = createHmac('sha256', secret)
            .update(canonicalMessage)
            .digest('base64url');

        const response = await httpClient.post(url, data, {
            timeout: 15000,
            headers: {
                'Authorization': `Bearer ${signature}`,
                'Signature-Timestamp': timestamp,
                'Signature-Nonce': nonce,
                'Content-Type': 'application/json'
            }
        });

        const rateDownMbps = (data.rate_down / 1000000).toFixed(2);
        const rateUpMbps = (data.rate_up / 1000000).toFixed(2);
        log(
            `Heartbeat sent: ${data.connection_state} (${data.media_state}/${data.connection_type}) ↓${rateDownMbps}Mbps ↑${rateUpMbps}Mbps`
        );
        return response.data;
    } catch (error) {
        const errorMsg =
            error instanceof HttpClientError && error.response
                ? `${error.response.status} - ${error.response.statusText}`
                : (error as Error).message;
        if (error instanceof HttpClientError && error.response?.status === 404)
            throw new Error(errorMsg);

        if (retries < maxRetries) {
            log(
                `Failed to send heartbeat (${errorMsg}), retrying in ${retryDelay}ms... (${retries + 1}/${maxRetries})`,
                'WARN'
            );
            await sleep(retryDelay);
            return sendHeartbeat(vpsUrl, secret, data, maxRetries, retryDelay, retries + 1);
        }

        throw new Error(`Failed to send heartbeat after ${maxRetries} retries: ${errorMsg}`);
    }
}
