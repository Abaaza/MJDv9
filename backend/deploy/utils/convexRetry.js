import { getConvexClient } from '../config/convex';
const defaultOptions = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
};
export async function withRetry(operation, options = {}) {
    const opts = { ...defaultOptions, ...options };
    let lastError = null;
    let delay = opts.initialDelay;
    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            return await operation();
        }
        catch (error) {
            lastError = error;
            // Check if it's a network error
            const isNetworkError = error.message?.includes('fetch failed') ||
                error.message?.includes('ETIMEDOUT') ||
                error.message?.includes('ECONNREFUSED');
            if (attempt < opts.maxRetries && isNetworkError) {
                console.log(`[ConvexRetry] Attempt ${attempt + 1} failed with network error. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay = Math.min(delay * opts.backoffFactor, opts.maxDelay);
            }
            else {
                throw error;
            }
        }
    }
    throw lastError || new Error('Operation failed after retries');
}
// Wrapped Convex operations
export async function convexQuery(api, args = {}) {
    return withRetry(async () => {
        const client = getConvexClient();
        return await client.query(api, args);
    });
}
export async function convexMutation(api, args = {}) {
    return withRetry(async () => {
        const client = getConvexClient();
        return await client.mutation(api, args);
    });
}
//# sourceMappingURL=convexRetry.js.map