import { getConvexClient } from '../config/convex';
import { api } from '../lib/convex-api';
import NodeCache from 'node-cache';
class ApiKeyService {
    static instance;
    cache;
    CACHE_KEY = 'api_keys';
    CACHE_TTL = 300; // 5 minutes
    constructor() {
        // Initialize cache with 5 minute TTL
        this.cache = new NodeCache({ stdTTL: this.CACHE_TTL, checkperiod: 120 });
    }
    static getInstance() {
        if (!ApiKeyService.instance) {
            ApiKeyService.instance = new ApiKeyService();
        }
        return ApiKeyService.instance;
    }
    async getApiKeys() {
        // Check cache first
        const cachedKeys = this.cache.get(this.CACHE_KEY);
        if (cachedKeys) {
            console.log('[ApiKeyService] Using cached API keys');
            return cachedKeys;
        }
        // Fetch from database
        console.log('[ApiKeyService] Fetching API keys from database');
        const convex = getConvexClient();
        try {
            const settings = await convex.query(api.applicationSettings.getByKeys, {
                keys: ['COHERE_API_KEY', 'OPENAI_API_KEY']
            });
            const apiKeys = {};
            settings.forEach(setting => {
                if (setting.key === 'COHERE_API_KEY') {
                    apiKeys.cohereApiKey = setting.value;
                }
                else if (setting.key === 'OPENAI_API_KEY') {
                    apiKeys.openaiApiKey = setting.value;
                }
            });
            // Cache the keys
            if (Object.keys(apiKeys).length > 0) {
                this.cache.set(this.CACHE_KEY, apiKeys);
                console.log('[ApiKeyService] API keys cached');
            }
            return apiKeys;
        }
        catch (error) {
            console.error('[ApiKeyService] Failed to fetch API keys:', error);
            // Fall back to environment variables if database fetch fails
            return {
                cohereApiKey: process.env.COHERE_API_KEY,
                openaiApiKey: process.env.OPENAI_API_KEY
            };
        }
    }
    async getCohereApiKey() {
        const keys = await this.getApiKeys();
        return keys.cohereApiKey;
    }
    async getOpenAiApiKey() {
        const keys = await this.getApiKeys();
        return keys.openaiApiKey;
    }
    // Clear cache when settings are updated
    clearCache() {
        this.cache.del(this.CACHE_KEY);
        console.log('[ApiKeyService] Cache cleared');
    }
    // Update API keys in database
    async updateApiKey(key, value, userId) {
        const convex = getConvexClient();
        await convex.mutation(api.applicationSettings.upsert, {
            key,
            value,
            description: key === 'COHERE_API_KEY' ? 'Cohere API key for embeddings' : 'OpenAI API key for embeddings',
            userId: userId
        });
        // Clear cache after update
        this.clearCache();
    }
}
export const apiKeyService = ApiKeyService.getInstance();
//# sourceMappingURL=apiKeyService.js.map