import * as httpClient from './http-client.js';
import { HttpClientError } from './http-client.js';
import type { HeartbeatPayload } from './types.js';
import { sleep, log } from './utils.js';

export async function sendHeartbeat(
    vpsUrl: string,
    data: HeartbeatPayload,
    maxRetries = 3,
    retryDelay = 5000,
    retries = 0
): Promise<unknown> {
    try {
        const response = await httpClient.post(vpsUrl, data, {
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        log(`Heartbeat sent successfully: ${data.connection_state} (${data.media_state})`);
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
            return sendHeartbeat(vpsUrl, data, maxRetries, retryDelay, retries + 1);
        }

        throw new Error(`Failed to send heartbeat after ${maxRetries} retries: ${errorMsg}`);
    }
}
