import NodeCache from 'node-cache';
import { getConvexClient } from '../config/convex';
import { api } from '../lib/convex-api';
import { withRetry } from '../utils/retry';
import { projectLogger as logger } from '../utils/logger';
export class PriceListCacheService {
    static instance = null;
    cache;
    convex = getConvexClient();
    stats = {
        hits: 0,
        misses: 0,
        updates: 0,
        lastRefresh: new Date()
    };
    refreshInterval = null;
    // Cache configuration
    CACHE_KEY = 'price_items';
    CACHE_TTL = 3600; // 1 hour
    REFRESH_INTERVAL = 1800000; // 30 minutes
    MAX_RETRY_ATTEMPTS = 3;
    constructor() {
        this.cache = new NodeCache({
            stdTTL: this.CACHE_TTL,
            checkperiod: 600, // Check for expired keys every 10 minutes
            useClones: false, // Don't clone objects for better performance
            deleteOnExpire: true
        });
        // Set up automatic refresh
        this.startAutoRefresh();
        // Log cache events
        this.cache.on('expired', (key) => {
            logger.info('Cache key expired', { key });
        });
        this.cache.on('flush', () => {
            logger.info('Cache flushed');
        });
    }
    static getInstance() {
        if (!PriceListCacheService.instance) {
            PriceListCacheService.instance = new PriceListCacheService();
        }
        return PriceListCacheService.instance;
    }
    async getPriceItems() {
        // Try to get from cache first
        const cached = this.cache.get(this.CACHE_KEY);
        if (cached) {
            this.stats.hits++;
            return cached;
        }
        // Cache miss - fetch from database
        this.stats.misses++;
        logger.info('Price list cache miss, fetching from database');
        try {
            const items = await this.fetchPriceItems();
            // Store in cache
            this.cache.set(this.CACHE_KEY, items);
            this.stats.updates++;
            this.stats.lastRefresh = new Date();
            logger.info('Price list cached successfully', {
                itemCount: items.length,
                cacheStats: this.getStats()
            });
            return items;
        }
        catch (error) {
            logger.error('Failed to fetch price items', { error });
            // Return empty array as fallback
            return [];
        }
    }
    async fetchPriceItems() {
        return await withRetry(() => this.convex.query(api.priceItems.getActive), {
            maxAttempts: this.MAX_RETRY_ATTEMPTS,
            delayMs: 1000,
            onRetry: (error, attempt) => {
                logger.warn('Retry fetching price items', {
                    attempt,
                    error: error.message
                });
            }
        });
    }
    async refreshCache() {
        logger.info('Refreshing price list cache');
        try {
            const items = await this.fetchPriceItems();
            // Update cache
            this.cache.set(this.CACHE_KEY, items);
            this.stats.updates++;
            this.stats.lastRefresh = new Date();
            logger.info('Price list cache refreshed', {
                itemCount: items.length,
                cacheStats: this.getStats()
            });
        }
        catch (error) {
            logger.error('Failed to refresh price list cache', { error });
        }
    }
    startAutoRefresh() {
        // Initial load
        this.refreshCache().catch(error => {
            logger.error('Initial cache load failed', { error });
        });
        // Set up periodic refresh
        this.refreshInterval = setInterval(() => {
            this.refreshCache().catch(error => {
                logger.error('Periodic cache refresh failed', { error });
            });
        }, this.REFRESH_INTERVAL);
        logger.info('Price list cache auto-refresh started', {
            intervalMs: this.REFRESH_INTERVAL
        });
    }
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
            logger.info('Price list cache auto-refresh stopped');
        }
    }
    clearCache() {
        this.cache.flushAll();
        this.stats = {
            hits: 0,
            misses: 0,
            updates: 0,
            lastRefresh: new Date()
        };
        logger.info('Price list cache cleared');
    }
    getStats() {
        return { ...this.stats };
    }
    getCacheInfo() {
        const keys = this.cache.keys();
        const stats = this.getStats();
        const hitRate = stats.hits + stats.misses > 0
            ? (stats.hits / (stats.hits + stats.misses) * 100).toFixed(2)
            : '0.00';
        return {
            keys: keys.length,
            stats,
            hitRate: `${hitRate}%`,
            ttl: this.CACHE_TTL,
            refreshInterval: this.REFRESH_INTERVAL / 1000 / 60, // in minutes
        };
    }
    // Check if a specific item exists in cache
    async getItemById(itemId) {
        const items = await this.getPriceItems();
        return items.find(item => item._id === itemId) || null;
    }
    // Search items in cache
    async searchItems(query) {
        const items = await this.getPriceItems();
        const lowerQuery = query.toLowerCase();
        return items.filter(item => item.description.toLowerCase().includes(lowerQuery) ||
            (item.code && item.code.toLowerCase().includes(lowerQuery)) ||
            (item.category && item.category.toLowerCase().includes(lowerQuery)));
    }
    // Get items by category
    async getItemsByCategory(category) {
        const items = await this.getPriceItems();
        return items.filter(item => item.category && item.category.toLowerCase() === category.toLowerCase());
    }
}
// Export singleton instance
export const priceListCache = PriceListCacheService.getInstance();
//# sourceMappingURL=priceListCache.service.js.map