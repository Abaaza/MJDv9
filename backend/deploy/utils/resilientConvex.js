import { ConvexHttpClient } from 'convex/browser';
export class ResilientConvexClient {
    client;
    maxRetries;
    initialDelay;
    constructor(url, options = {}) {
        this.client = new ConvexHttpClient(url);
        this.maxRetries = options.maxRetries || 3;
        this.initialDelay = options.initialDelay || 1000;
    }
    async query(query, args) {
        return this.withRetry(() => this.client.query(query, args));
    }
    async mutation(mutation, args) {
        return this.withRetry(() => this.client.mutation(mutation, args));
    }
    async action(action, args) {
        return this.withRetry(() => this.client.action(action, args));
    }
    async withRetry(operation) {
        let lastError;
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                if (attempt < this.maxRetries - 1) {
                    const delay = this.initialDelay * Math.pow(2, attempt);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        throw lastError;
    }
}
//# sourceMappingURL=resilientConvex.js.map