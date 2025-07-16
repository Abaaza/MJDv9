export class LRUCache {
    cache;
    maxSize;
    ttl;
    constructor(maxSize = 1000, ttl = 3600000) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.ttl = ttl;
    }
    set(key, value) {
        // Remove expired entries before adding new one
        this.cleanExpired();
        // If at capacity, remove least recently used
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }
        // Delete existing entry to move it to the end
        this.cache.delete(key);
        // Add to end (most recently used)
        this.cache.set(key, {
            value,
            expiry: Date.now() + this.ttl
        });
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            return undefined;
        }
        // Check if expired
        if (Date.now() > entry.expiry) {
            this.cache.delete(key);
            return undefined;
        }
        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry.value;
    }
    has(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            return false;
        }
        // Check if expired
        if (Date.now() > entry.expiry) {
            this.cache.delete(key);
            return false;
        }
        return true;
    }
    delete(key) {
        return this.cache.delete(key);
    }
    clear() {
        this.cache.clear();
    }
    size() {
        this.cleanExpired();
        return this.cache.size;
    }
    cleanExpired() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiry) {
                this.cache.delete(key);
            }
        }
    }
    // For debugging
    stats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            ttl: this.ttl
        };
    }
}
//# sourceMappingURL=lruCache.js.map