"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpClient = void 0;
exports.createHttpClient = createHttpClient;
const axios_1 = __importDefault(require("axios"));
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
// Create axios instance with timeout and retry logic
function createHttpClient(options = {}) {
    const { timeout = 10000, // 10 seconds default
    maxRetries = 3, keepAlive = true } = options;
    // Create custom agents with keep-alive
    const httpAgent = new http_1.default.Agent({
        keepAlive,
        keepAliveMsecs: 1000,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: timeout,
    });
    const httpsAgent = new https_1.default.Agent({
        keepAlive,
        keepAliveMsecs: 1000,
        maxSockets: 50,
        maxFreeSockets: 10,
        timeout: timeout,
    });
    const client = axios_1.default.create({
        timeout,
        httpAgent,
        httpsAgent,
        // Disable proxy if it might be causing issues
        proxy: false,
        // Add headers that might help with connection
        headers: {
            'Connection': keepAlive ? 'keep-alive' : 'close',
            'Accept-Encoding': 'gzip, deflate',
        }
    });
    // Add retry interceptor
    client.interceptors.response.use(response => response, async (error) => {
        const config = error.config;
        // Check if we should retry
        if (!config || !config.retry) {
            config.retry = 0;
        }
        if (config.retry >= maxRetries) {
            return Promise.reject(error);
        }
        // Retry on network errors or 5xx errors
        if (error.code === 'ECONNABORTED' ||
            error.code === 'ETIMEDOUT' ||
            error.code === 'ENOTFOUND' ||
            error.code === 'ECONNREFUSED' ||
            (error.response && error.response.status >= 500)) {
            config.retry += 1;
            // Exponential backoff
            const delay = Math.pow(2, config.retry) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            return client(config);
        }
        return Promise.reject(error);
    });
    return client;
}
// Export a default client
exports.httpClient = createHttpClient();
