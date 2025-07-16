import NodeCache from 'node-cache';
export class CacheService {
    cache;
    hitRate = { hits: 0, misses: 0 };
    constructor(options = {}) {
        this.cache = new NodeCache({
            stdTTL: options.stdTTL || 3600, // Default 1 hour
            checkperiod: options.checkperiod || 600, // Check every 10 minutes
            useClones: options.useClones !== false, // Clone by default for safety
        });
    }
    set(key, value, ttl) {
        return this.cache.set(key, value, ttl || 0);
    }
    get(key) {
        const value = this.cache.get(key);
        if (value !== undefined) {
            this.hitRate.hits++;
        }
        else {
            this.hitRate.misses++;
        }
        return value;
    }
    async getOrSet(key, factory, ttl) {
        const cached = this.get(key);
        if (cached !== undefined) {
            return cached;
        }
        const value = await factory();
        this.set(key, value, ttl);
        return value;
    }
    has(key) {
        return this.cache.has(key);
    }
    delete(key) {
        return this.cache.del(key);
    }
    deleteByPattern(pattern) {
        const keys = this.cache.keys();
        const toDelete = keys.filter(key => key.includes(pattern));
        return this.cache.del(toDelete);
    }
    flush() {
        this.cache.flushAll();
    }
    getStats() {
        const stats = this.cache.getStats();
        const hitRatePercentage = this.hitRate.hits + this.hitRate.misses > 0
            ? (this.hitRate.hits / (this.hitRate.hits + this.hitRate.misses)) * 100
            : 0;
        return {
            ...stats,
            hitRate: {
                ...this.hitRate,
                percentage: hitRatePercentage.toFixed(2) + '%'
            }
        };
    }
    // Cache key generators for consistency
    static generateMatchKey(description, method) {
        return `match:${method}:${Buffer.from(description).toString('base64')}`;
    }
    static generatePriceItemKey(id) {
        return `priceItem:${id}`;
    }
    static generateJobKey(jobId) {
        return `job:${jobId}`;
    }
    static generateUserKey(userId) {
        return `user:${userId}`;
    }
}
// Create singleton instances for different cache purposes
export const matchingCache = new CacheService({
    stdTTL: 3600, // 1 hour for matching results
});
export const priceItemCache = new CacheService({
    stdTTL: 7200, // 2 hours for price items
});
export const jobCache = new CacheService({
    stdTTL: 300, // 5 minutes for job status
});
export const userCache = new CacheService({
    stdTTL: 1800, // 30 minutes for user data
});
//# sourceMappingURL=cache.service.js.map