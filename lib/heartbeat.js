import axios from 'axios';
import { sleep, log } from './utils.js';

/**
 * Send heartbeat to remote server with retry
 */
export async function sendHeartbeat(vpsUrl, data, maxRetries = 3, retryDelay = 5000, retries = 0) {
    try {
        const response = await axios.post(vpsUrl, data, {
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        log(`Heartbeat sent successfully: ${data.connection_state} (${data.media_state})`);
        return response.data;
    } catch (error) {
        const errorMsg = error.response
            ? `${error.response.status} - ${error.response.statusText}`
            : error.message;

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
