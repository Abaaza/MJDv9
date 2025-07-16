"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchingService = void 0;
const convex_1 = require("../config/convex");
const api_1 = require("../../../convex/_generated/api");
const cohere_ai_1 = require("cohere-ai");
const openai_1 = __importDefault(require("openai"));
const fuzz = __importStar(require("fuzzball"));
const lru_cache_1 = require("lru-cache");
const retry_1 = require("../utils/retry");
const enhancedMatching_service_1 = require("./enhancedMatching.service");
const cache_service_1 = require("./cache.service");
const debugLogger_1 = require("../utils/debugLogger");
const constructionPatterns_service_1 = require("./constructionPatterns.service");
class MatchingService {
    constructor() {
        this.convex = (0, convex_1.getConvexClient)();
        this.cohereClient = null;
        this.openaiClient = null;
        this.priceItemsCache = null;
        this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
        this.embeddingCache = new lru_cache_1.LRUCache({
            max: 1000,
            ttl: 1000 * 60 * 60, // 1 hour
        });
    }
    static getInstance() {
        if (!MatchingService.instance) {
            MatchingService.instance = new MatchingService();
        }
        return MatchingService.instance;
    }
    /**
     * Initialize AI clients on first use (lazy loading)
     */
    async ensureClientsInitialized() {
        var _a, _b;
        if (!this.cohereClient || !this.openaiClient) {
            console.log('[MatchingService] Initializing AI clients...');
            // Get API keys from Convex
            const settings = await (0, retry_1.withRetry)(() => this.convex.query(api_1.api.applicationSettings.getAll), {
                maxAttempts: 3,
                delayMs: 1000,
                onRetry: (error, attempt) => {
                    console.warn(`[MatchingService] Failed to fetch settings (attempt ${attempt}):`, error.message);
                }
            });
            const cohereKey = (_a = settings.find(s => s.key === 'COHERE_API_KEY')) === null || _a === void 0 ? void 0 : _a.value;
            const openaiKey = (_b = settings.find(s => s.key === 'OPENAI_API_KEY')) === null || _b === void 0 ? void 0 : _b.value;
            if (cohereKey && !this.cohereClient) {
                this.cohereClient = new cohere_ai_1.CohereClient({ token: cohereKey });
                console.log('[MatchingService] Cohere client initialized');
            }
            if (openaiKey && !this.openaiClient) {
                this.openaiClient = new openai_1.default({ apiKey: openaiKey });
                console.log('[MatchingService] OpenAI client initialized');
            }
        }
    }
    /**
     * Get price items with caching
     */
    async getPriceItems() {
        // Check cache first
        if (this.priceItemsCache && Date.now() - this.priceItemsCache.timestamp < this.CACHE_DURATION) {
            return this.priceItemsCache.items;
        }
        // Load from database
        const items = await (0, retry_1.withRetry)(() => this.convex.query(api_1.api.priceItems.getActive), {
            maxAttempts: 3,
            delayMs: 1000,
            onRetry: (error, attempt) => {
                console.log(`[MatchingService] Failed to fetch price items (attempt ${attempt}):`, error.message);
            }
        });
        if (!items || items.length === 0) {
            throw new Error('No price items found in database');
        }
        // Update cache
        this.priceItemsCache = { items, timestamp: Date.now() };
        return items;
    }
    /**
     * Create enriched text for embedding that includes all relevant information
     */
    createEnrichedText(item, contextHeaders) {
        const parts = [item.description];
        // Add context headers if provided
        if (contextHeaders && contextHeaders.length > 0) {
            parts.push(`Context: ${contextHeaders.join(' > ')}`);
        }
        // Emphasize category + subcategory combination for better matching
        if (item.category && item.subcategory) {
            // Repeat the combination for stronger embedding signal
            parts.push(`Category: ${item.category} - ${item.subcategory}`);
            parts.push(`Classification: ${item.category} ${item.subcategory}`);
            parts.push(`Type: ${item.category}/${item.subcategory}`);
        }
        else if (item.category) {
            parts.push(`Category: ${item.category}`);
            parts.push(`Type: ${item.category}`);
        }
        if (item.unit) {
            // Include normalized unit for better matching
            const normalizedUnit = this.normalizeUnit(item.unit);
            parts.push(`Unit: ${item.unit}`);
            if (normalizedUnit !== item.unit.toUpperCase()) {
                parts.push(`Unit: ${normalizedUnit}`);
            }
        }
        if (item.keywords && item.keywords.length > 0) {
            parts.push(`Keywords: ${item.keywords.join(', ')}`);
        }
        if (item.code) {
            parts.push(`Code: ${item.code}`);
        }
        return parts.join(' | ');
    }
    /**
     * Match item with pre-generated embedding (for batch processing)
     */
    async matchItemWithEmbedding(description, method, preGeneratedEmbedding, providedPriceItems, contextHeaders) {
        const priceItems = providedPriceItems || await this.getPriceItems();
        // Get items with existing embeddings
        const itemsWithEmbeddings = priceItems.filter(item => {
            const enrichedText = this.createEnrichedText(item);
            const cached = this.embeddingCache.get(enrichedText);
            const provider = method.toLowerCase();
            return (cached && cached.provider === provider) ||
                (item.embedding && item.embeddingProvider === provider);
        });
        if (itemsWithEmbeddings.length === 0) {
            console.warn(`[MatchingService/${method}] No items with embeddings. Falling back to LOCAL.`);
            return this.localMatch(description, priceItems, contextHeaders);
        }
        // Calculate similarities using pre-generated embedding
        const scoredMatches = [];
        for (const item of itemsWithEmbeddings) {
            const enrichedText = this.createEnrichedText(item);
            const cached = this.embeddingCache.get(enrichedText);
            const embedding = (cached === null || cached === void 0 ? void 0 : cached.embedding) || item.embedding;
            const similarity = this.cosineSimilarity(preGeneratedEmbedding, embedding);
            // Always collect all matches regardless of similarity
            scoredMatches.push({ item, similarity });
        }
        // Always proceed with best match, even if low similarity
        if (scoredMatches.length === 0) {
            console.warn(`[MatchingService/${method}] No embeddings available. Falling back to LOCAL.`);
            return this.localMatch(description, priceItems, contextHeaders);
        }
        // Sort by similarity
        scoredMatches.sort((a, b) => b.similarity - a.similarity);
        const bestMatch = scoredMatches[0];
        return {
            matchedItemId: bestMatch.item._id,
            matchedDescription: bestMatch.item.description,
            matchedCode: bestMatch.item.code || '',
            matchedUnit: bestMatch.item.unit || '',
            matchedRate: bestMatch.item.rate,
            confidence: Math.min(bestMatch.similarity, 0.99),
            method: method,
            matchingDetails: {
                scores: { similarity: bestMatch.similarity },
                factors: ['semantic'],
                reasoning: `Semantic match with ${(bestMatch.similarity * 100).toFixed(1)}% similarity`
            }
        };
    }
    /**
     * Main matching method - simplified to only support 3 methods
     */
    async matchItem(description, method, providedPriceItems, contextHeaders) {
        const matchStartTime = Date.now();
        const matchId = `MATCH_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log(`\n[MatchingService] === MATCH START (${matchId}) ===`);
        console.log(`[MatchingService] Description: "${description.substring(0, 100)}${description.length > 100 ? '...' : ''}"`);
        console.log(`[MatchingService] Method: ${method}`);
        console.log(`[MatchingService] Context: ${(contextHeaders === null || contextHeaders === void 0 ? void 0 : contextHeaders.join(' > ')) || 'None'}`);
        // Ensure AI clients are initialized for methods that need them
        if (['COHERE', 'OPENAI'].includes(method)) {
            await this.ensureClientsInitialized();
        }
        // Always get ALL price items from database if not provided
        const priceItems = providedPriceItems || await this.getPriceItems();
        console.log(`[MatchingService] Matching against ${priceItems.length} price items`);
        // Preprocess the description
        const processedDescription = enhancedMatching_service_1.EnhancedMatchingService.preprocessText(description);
        console.log(`[MatchingService] Processed description: "${processedDescription.substring(0, 80)}..."`);
        let result;
        try {
            switch (method) {
                case 'LOCAL':
                    result = await this.localMatch(processedDescription, priceItems, contextHeaders);
                    break;
                case 'COHERE':
                    result = await this.cohereMatch(processedDescription, priceItems, contextHeaders);
                    break;
                case 'OPENAI':
                    result = await this.openAIMatch(processedDescription, priceItems, contextHeaders);
                    break;
                default:
                    throw new Error(`Unknown matching method: ${method}`);
            }
            const totalTime = Date.now() - matchStartTime;
            console.log(`[MatchingService] === MATCH COMPLETE (${matchId}) ===`);
            console.log(`[MatchingService] Total time: ${totalTime}ms`);
            console.log(`[MatchingService] Confidence: ${(result.confidence * 100).toFixed(1)}%`);
            return result;
        }
        catch (error) {
            const totalTime = Date.now() - matchStartTime;
            console.error(`[MatchingService] === MATCH ERROR (${matchId}) ===`);
            console.error(`[MatchingService] Failed after ${totalTime}ms`);
            console.error(`[MatchingService] Error:`, error);
            throw error;
        }
    }
    /**
     * LOCAL MATCH - Fast fuzzy string matching
     */
    async localMatch(description, priceItems, contextHeaders) {
        var _a, _b;
        console.log(`[MatchingService/LOCAL] Fast fuzzy string matching with context awareness`);
        // Enhance description with context
        let enhancedDescription = description;
        let categoryContext = '';
        let fullContext = '';
        if (contextHeaders && contextHeaders.length > 0) {
            // Use all context headers for better matching
            fullContext = contextHeaders.join(' > ');
            categoryContext = contextHeaders[contextHeaders.length - 1]; // Most specific category
            enhancedDescription = `${description} [Context: ${fullContext}]`;
            console.log(`[MatchingService/LOCAL] Using context: "${fullContext}"`);
        }
        // Check cache
        const cacheKey = cache_service_1.CacheService.generateMatchKey(enhancedDescription, 'LOCAL');
        const cached = cache_service_1.matchingCache.get(cacheKey);
        if (cached) {
            return cached;
        }
        const matches = [];
        // Extract keywords for better matching
        const queryKeywords = enhancedMatching_service_1.EnhancedMatchingService.extractKeywords(enhancedDescription);
        const queryUnit = this.extractUnit(description);
        // Extract category keywords from context
        const contextKeywords = contextHeaders ?
            contextHeaders.flatMap(h => enhancedMatching_service_1.EnhancedMatchingService.extractKeywords(h)) : [];
        // Preprocess and extract construction features from query
        const preprocessedDescription = this.preprocessDescription(description);
        const queryFeatures = constructionPatterns_service_1.ConstructionPatternsService.extractConstructionFeatures(preprocessedDescription);
        const expandedDescription = constructionPatterns_service_1.ConstructionPatternsService.expandAbbreviations(preprocessedDescription);
        for (const item of priceItems) {
            // Create searchable text with context
            const searchText = this.createEnrichedText(item, contextHeaders);
            // Extract construction features from item
            const itemFeatures = constructionPatterns_service_1.ConstructionPatternsService.extractConstructionFeatures(item.description);
            // Initialize score components
            const scoreBreakdown = {
                fuzzy: 0,
                unit: 0,
                category: 0,
                keywords: 0,
                context: 0,
                construction: 0
            };
            // Calculate base fuzzy score - try multiple variations
            const preprocessedItemDesc = this.preprocessDescription(item.description);
            const fuzzyScores = [
                fuzz.token_set_ratio(description, item.description),
                fuzz.token_set_ratio(preprocessedDescription, preprocessedItemDesc),
                fuzz.token_set_ratio(expandedDescription, item.description),
                fuzz.partial_ratio(preprocessedDescription, preprocessedItemDesc)
            ];
            scoreBreakdown.fuzzy = Math.max(...fuzzyScores);
            // Enhanced unit matching with stronger weight (25% boost)
            if (queryUnit && item.unit) {
                const normalizedQueryUnit = this.normalizeUnit(queryUnit);
                const normalizedItemUnit = this.normalizeUnit(item.unit);
                if (normalizedQueryUnit === normalizedItemUnit) {
                    scoreBreakdown.unit = 25; // Exact match after normalization - highest boost
                }
                else if (this.areUnitsCompatible(queryUnit, item.unit)) {
                    scoreBreakdown.unit = 22; // Compatible units - very high boost
                }
                else if (queryUnit.toUpperCase() === item.unit.toUpperCase()) {
                    scoreBreakdown.unit = 25; // Raw exact match - highest boost
                }
            }
            else if (queryUnit && !item.unit) {
                scoreBreakdown.unit = -5; // Penalty for missing unit when query has unit
            }
            // Enhanced category + subcategory matching as a combined unit
            if (contextHeaders && contextHeaders.length > 0) {
                let categoryScore = 0;
                // Extract potential category and subcategory from context headers
                const potentialCategory = ((_a = contextHeaders[0]) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
                const potentialSubcategory = ((_b = contextHeaders[1]) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || '';
                // Check for exact category + subcategory match (highest priority)
                if (item.category && item.subcategory) {
                    const itemCategory = item.category.toLowerCase();
                    const itemSubcategory = item.subcategory.toLowerCase();
                    // Exact category + subcategory match = maximum bonus
                    if (potentialCategory && potentialSubcategory &&
                        fuzz.ratio(potentialCategory, itemCategory) > 85 &&
                        fuzz.ratio(potentialSubcategory, itemSubcategory) > 85) {
                        categoryScore = 30; // Significant boost for exact category+subcategory match
                    }
                    // Category matches but different subcategory
                    else if (potentialCategory && fuzz.ratio(potentialCategory, itemCategory) > 85) {
                        categoryScore = 15; // Medium boost for category-only match
                        // Check if any context header matches subcategory
                        const subcategoryMatches = contextHeaders.map(header => fuzz.partial_ratio(header.toLowerCase(), itemSubcategory));
                        if (Math.max(...subcategoryMatches) > 70) {
                            categoryScore += 10; // Additional boost if subcategory found in context
                        }
                    }
                    // Subcategory matches but different category (less common but possible)
                    else if (potentialSubcategory && fuzz.ratio(potentialSubcategory, itemSubcategory) > 85) {
                        categoryScore = 10;
                    }
                }
                // Fallback to category-only matching if no subcategory
                else if (item.category && potentialCategory) {
                    const itemCategory = item.category.toLowerCase();
                    if (fuzz.ratio(potentialCategory, itemCategory) > 85) {
                        categoryScore = 20;
                    }
                }
                scoreBreakdown.category = categoryScore;
            }
            // Enhanced keyword matching
            const itemKeywords = enhancedMatching_service_1.EnhancedMatchingService.extractKeywords(searchText);
            const commonKeywords = queryKeywords.filter(k => itemKeywords.includes(k));
            if (commonKeywords.length > 0) {
                scoreBreakdown.keywords = Math.min(15, commonKeywords.length * 3);
            }
            // Context keyword matching
            const commonContextKeywords = contextKeywords.filter(k => itemKeywords.includes(k));
            if (commonContextKeywords.length > 0) {
                scoreBreakdown.context = Math.min(10, commonContextKeywords.length * 2);
            }
            // Construction-specific scoring
            const constructionScore = constructionPatterns_service_1.ConstructionPatternsService.calculateConstructionScore(queryFeatures, itemFeatures);
            scoreBreakdown.construction = constructionScore * 0.3; // 30% of construction score
            // Calculate total score with weighted components
            const totalScore = Math.min(100, scoreBreakdown.fuzzy * 0.25 + // 25% weight on description match (reduced to give more weight to unit)
                scoreBreakdown.unit + // Unit match bonus (up to 25 points)
                scoreBreakdown.category + // Category match bonus
                scoreBreakdown.keywords + // Keyword match bonus
                scoreBreakdown.context + // Context keyword bonus
                scoreBreakdown.construction // Construction pattern bonus
            );
            // Always collect all matches regardless of score
            matches.push({ item, score: totalScore, breakdown: scoreBreakdown });
        }
        // Sort by score to find the best match
        matches.sort((a, b) => b.score - a.score);
        // Always return the best match, even if low confidence
        const bestMatch = matches[0];
        const result = {
            matchedItemId: bestMatch.item._id,
            matchedDescription: bestMatch.item.description,
            matchedCode: bestMatch.item.code || '',
            matchedUnit: bestMatch.item.unit || '',
            matchedRate: bestMatch.item.rate,
            confidence: bestMatch.score / 100,
            method: 'LOCAL',
            matchingDetails: {
                scores: bestMatch.breakdown,
                factors: Object.keys(bestMatch.breakdown).filter(k => bestMatch.breakdown[k] > 0),
                reasoning: `Composite match: ${bestMatch.breakdown.fuzzy.toFixed(0)}% description, ` +
                    `${bestMatch.breakdown.unit}pts unit${queryUnit && bestMatch.item.unit ? ` (${queryUnit} → ${bestMatch.item.unit})` : ''}, ` +
                    `${bestMatch.breakdown.category}pts category${bestMatch.item.subcategory ? '+subcategory' : ''}, ` +
                    `${bestMatch.breakdown.keywords}pts keywords`
            }
        };
        // Cache the result
        cache_service_1.matchingCache.set(cacheKey, result, 3600);
        return result;
    }
    /**
     * COHERE MATCH - Semantic matching with Cohere embeddings
     */
    async cohereMatch(description, priceItems, contextHeaders) {
        var _a, _b;
        const timer = debugLogger_1.debugLog.startTimer('COHERE', 'Semantic matching');
        debugLogger_1.debugLog.log('COHERE', `Matching "${description}" against ${priceItems.length} price items`);
        console.log(`[MatchingService/COHERE] Starting Cohere match for: "${description}"`);
        console.log(`[MatchingService/COHERE] Price items available: ${priceItems.length}`);
        console.log(`[MatchingService/COHERE] Context headers: ${(contextHeaders === null || contextHeaders === void 0 ? void 0 : contextHeaders.join(' > ')) || 'None'}`);
        if (!this.cohereClient) {
            const error = 'Cohere client not initialized. Please configure COHERE_API_KEY.';
            debugLogger_1.debugLog.error('COHERE', error);
            console.error(`[MatchingService/COHERE] ${error}`);
            throw new Error(error);
        }
        // Build enriched query with full context and construction patterns
        let enrichedQuery = description;
        const expandedDescription = constructionPatterns_service_1.ConstructionPatternsService.expandAbbreviations(description);
        const queryFeatures = constructionPatterns_service_1.ConstructionPatternsService.extractConstructionFeatures(description);
        // Extract category/subcategory from context for stronger matching
        let categoryContext = '';
        if (contextHeaders && contextHeaders.length > 0) {
            const potentialCategory = contextHeaders[0] || '';
            const potentialSubcategory = contextHeaders[1] || '';
            categoryContext = `Target Category: ${potentialCategory}. Target Subcategory: ${potentialSubcategory}.`;
            const fullContext = contextHeaders.join(' > ');
            enrichedQuery = `${categoryContext} Category: ${fullContext}. Task: ${expandedDescription}`;
            // Add construction features to query
            if (queryFeatures.workType) {
                enrichedQuery += ` Work Type: ${queryFeatures.workType}.`;
            }
            if (queryFeatures.material) {
                enrichedQuery += ` Material: ${queryFeatures.material}.`;
            }
            if (queryFeatures.grade) {
                enrichedQuery += ` Grade: ${queryFeatures.grade}.`;
            }
            debugLogger_1.debugLog.log('COHERE', `Enriched query with context and construction features`, { enrichedQuery });
        }
        else {
            enrichedQuery = expandedDescription;
        }
        // Extract unit from description for better matching
        const queryUnit = this.extractUnit(description);
        // Get query embedding
        let queryEmbedding;
        try {
            debugLogger_1.debugLog.log('COHERE', 'Generating query embedding...');
            const response = await (0, retry_1.withRetry)(() => this.cohereClient.embed({
                texts: [enrichedQuery],
                model: 'embed-english-v3.0',
                inputType: 'search_query',
                truncate: 'END'
            }), {
                maxAttempts: 2,
                delayMs: 3000,
                timeout: 30000,
                onRetry: (error, attempt) => {
                    debugLogger_1.debugLog.warning('COHERE', `Embedding generation retry ${attempt}`, { error: error.message });
                }
            });
            const embeddings = Array.isArray(response.embeddings)
                ? response.embeddings
                : response.embeddings.float || [];
            queryEmbedding = embeddings[0];
            console.log(`[MatchingService/COHERE] Generated query embedding with ${(queryEmbedding === null || queryEmbedding === void 0 ? void 0 : queryEmbedding.length) || 0} dimensions`);
            if (!queryEmbedding || queryEmbedding.length === 0) {
                throw new Error('Invalid embedding response from Cohere');
            }
        }
        catch (error) {
            console.error('[MatchingService/COHERE] Failed to generate query embedding:', error);
            debugLogger_1.debugLog.error('COHERE', 'Failed to generate embedding, falling back to LOCAL', error);
            // Fallback to LOCAL
            return this.localMatch(description, priceItems, contextHeaders);
        }
        // Get items with existing embeddings
        const itemsWithEmbeddings = priceItems.filter(item => {
            const enrichedText = this.createEnrichedText(item);
            const cached = this.embeddingCache.get(enrichedText);
            return (cached && cached.provider === 'cohere') ||
                (item.embedding && item.embeddingProvider === 'cohere');
        });
        if (itemsWithEmbeddings.length === 0) {
            console.warn('[MatchingService/COHERE] No items with embeddings. Falling back to LOCAL.');
            debugLogger_1.debugLog.warning('COHERE', `No price items have embeddings. Total items: ${priceItems.length}`);
            return this.localMatch(description, priceItems, contextHeaders);
        }
        console.log(`[MatchingService/COHERE] Comparing against ${itemsWithEmbeddings.length} items with embeddings`);
        debugLogger_1.debugLog.log('COHERE', `Found ${itemsWithEmbeddings.length} items with Cohere embeddings`);
        // Calculate similarities
        const scoredMatches = [];
        for (const item of itemsWithEmbeddings) {
            const enrichedText = this.createEnrichedText(item);
            const cached = this.embeddingCache.get(enrichedText);
            const embedding = (cached === null || cached === void 0 ? void 0 : cached.embedding) || item.embedding;
            const similarity = this.cosineSimilarity(queryEmbedding, embedding);
            // Always collect all matches regardless of similarity
            scoredMatches.push({ item, similarity });
        }
        if (scoredMatches.length === 0) {
            console.warn('[MatchingService/COHERE] No good semantic matches. Falling back to LOCAL.');
            return this.localMatch(description, priceItems, contextHeaders);
        }
        // Boost scores for category+subcategory matches
        if (contextHeaders && contextHeaders.length >= 2) {
            const targetCategory = ((_a = contextHeaders[0]) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
            const targetSubcategory = ((_b = contextHeaders[1]) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || '';
            scoredMatches.forEach(match => {
                var _a, _b;
                const itemCategory = ((_a = match.item.category) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
                const itemSubcategory = ((_b = match.item.subcategory) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || '';
                // Strong boost for exact category+subcategory match
                if (targetCategory && targetSubcategory &&
                    itemCategory.includes(targetCategory) &&
                    itemSubcategory.includes(targetSubcategory)) {
                    match.similarity = Math.min(0.99, match.similarity * 1.3); // 30% boost
                    console.log(`[MatchingService/COHERE] Boosted ${match.item.code} for category+subcategory match`);
                }
                // Medium boost for category-only match
                else if (targetCategory && itemCategory.includes(targetCategory)) {
                    match.similarity = Math.min(0.95, match.similarity * 1.15); // 15% boost
                }
            });
        }
        // Sort by similarity but give strong preference to unit matches
        scoredMatches.sort((a, b) => {
            // Apply strong unit matching boost
            let aScore = a.similarity;
            let bScore = b.similarity;
            if (queryUnit) {
                const normalizedQueryUnit = this.normalizeUnit(queryUnit);
                const normalizedAUnit = a.item.unit ? this.normalizeUnit(a.item.unit) : '';
                const normalizedBUnit = b.item.unit ? this.normalizeUnit(b.item.unit) : '';
                // 25% boost for exact unit match
                if (normalizedAUnit === normalizedQueryUnit) {
                    aScore *= 1.25;
                }
                else if (this.areUnitsCompatible(queryUnit, a.item.unit)) {
                    aScore *= 1.20; // 20% boost for compatible units
                }
                else if (!a.item.unit) {
                    aScore *= 0.95; // 5% penalty for missing unit
                }
                if (normalizedBUnit === normalizedQueryUnit) {
                    bScore *= 1.25;
                }
                else if (this.areUnitsCompatible(queryUnit, b.item.unit)) {
                    bScore *= 1.20;
                }
                else if (!b.item.unit) {
                    bScore *= 0.95;
                }
            }
            return bScore - aScore;
        });
        const bestMatch = scoredMatches[0];
        // Adjust confidence based on unit match
        let finalConfidence = bestMatch.similarity;
        let unitMatchInfo = '';
        if (queryUnit && bestMatch.item.unit) {
            const normalizedQueryUnit = this.normalizeUnit(queryUnit);
            const normalizedItemUnit = this.normalizeUnit(bestMatch.item.unit);
            if (normalizedQueryUnit === normalizedItemUnit) {
                finalConfidence = Math.min(0.99, finalConfidence * 1.15); // 15% boost for exact unit
                unitMatchInfo = ' with exact unit match';
            }
            else if (this.areUnitsCompatible(queryUnit, bestMatch.item.unit)) {
                finalConfidence = Math.min(0.99, finalConfidence * 1.10); // 10% boost for compatible unit
                unitMatchInfo = ' with compatible unit';
            }
        }
        else if (queryUnit && !bestMatch.item.unit) {
            finalConfidence *= 0.95; // 5% penalty for missing unit
            unitMatchInfo = ' (unit mismatch)';
        }
        return {
            matchedItemId: bestMatch.item._id,
            matchedDescription: bestMatch.item.description,
            matchedCode: bestMatch.item.code || '',
            matchedUnit: bestMatch.item.unit || '',
            matchedRate: bestMatch.item.rate,
            confidence: Math.min(finalConfidence, 0.99),
            method: 'COHERE',
            matchingDetails: {
                scores: { similarity: bestMatch.similarity, adjusted: finalConfidence },
                factors: ['semantic', 'unit', 'context'],
                reasoning: `Semantic match with ${(bestMatch.similarity * 100).toFixed(1)}% similarity${unitMatchInfo}`
            }
        };
    }
    /**
     * OPENAI MATCH - Semantic matching with OpenAI embeddings
     */
    async openAIMatch(description, priceItems, contextHeaders) {
        var _a, _b;
        console.log(`[MatchingService/OPENAI] Semantic matching with OpenAI`);
        if (!this.openaiClient) {
            throw new Error('OpenAI client not initialized. Please configure OPENAI_API_KEY.');
        }
        // Build enriched query with full context and construction patterns
        let enrichedQuery = description;
        const expandedDescription = constructionPatterns_service_1.ConstructionPatternsService.expandAbbreviations(description);
        const queryFeatures = constructionPatterns_service_1.ConstructionPatternsService.extractConstructionFeatures(description);
        // Extract category/subcategory from context for stronger matching
        let categoryContext = '';
        if (contextHeaders && contextHeaders.length > 0) {
            const potentialCategory = contextHeaders[0] || '';
            const potentialSubcategory = contextHeaders[1] || '';
            categoryContext = `Target Category: ${potentialCategory}. Target Subcategory: ${potentialSubcategory}.`;
            const fullContext = contextHeaders.join(' > ');
            enrichedQuery = `${categoryContext} Context: ${fullContext}. Task: ${expandedDescription}`;
            // Add construction features to query
            if (queryFeatures.workType) {
                enrichedQuery += ` Work Type: ${queryFeatures.workType}.`;
            }
            if (queryFeatures.material) {
                enrichedQuery += ` Material: ${queryFeatures.material}.`;
            }
            if (queryFeatures.grade) {
                enrichedQuery += ` Grade: ${queryFeatures.grade}.`;
            }
            console.log(`[MatchingService/OPENAI] Enriched query: "${enrichedQuery.substring(0, 100)}..."`);
        }
        else {
            enrichedQuery = expandedDescription;
        }
        // Extract unit from description for better matching
        const queryUnit = this.extractUnit(description);
        // Get query embedding
        let queryEmbedding;
        try {
            const response = await (0, retry_1.withRetry)(() => this.openaiClient.embeddings.create({
                input: enrichedQuery,
                model: 'text-embedding-3-large',
            }), {
                maxAttempts: 2,
                delayMs: 2000,
                timeout: 30000
            });
            queryEmbedding = response.data[0].embedding;
        }
        catch (error) {
            console.error('[MatchingService/OPENAI] Failed to generate query embedding:', error);
            // Fallback to LOCAL
            return this.localMatch(description, priceItems, contextHeaders);
        }
        // Get items with existing embeddings
        const itemsWithEmbeddings = priceItems.filter(item => {
            const enrichedText = this.createEnrichedText(item);
            const cached = this.embeddingCache.get(enrichedText);
            return (cached && cached.provider === 'openai') ||
                (item.embedding && item.embeddingProvider === 'openai');
        });
        if (itemsWithEmbeddings.length === 0) {
            console.warn('[MatchingService/OPENAI] No items with embeddings. Falling back to LOCAL.');
            return this.localMatch(description, priceItems, contextHeaders);
        }
        console.log(`[MatchingService/OPENAI] Comparing against ${itemsWithEmbeddings.length} items with embeddings`);
        // Calculate similarities
        const scoredMatches = [];
        for (const item of itemsWithEmbeddings) {
            const enrichedText = this.createEnrichedText(item);
            const cached = this.embeddingCache.get(enrichedText);
            const embedding = (cached === null || cached === void 0 ? void 0 : cached.embedding) || item.embedding;
            const similarity = this.cosineSimilarity(queryEmbedding, embedding);
            // Always collect all matches regardless of similarity
            scoredMatches.push({ item, similarity });
        }
        if (scoredMatches.length === 0) {
            console.warn('[MatchingService/OPENAI] No good semantic matches. Falling back to LOCAL.');
            return this.localMatch(description, priceItems, contextHeaders);
        }
        // Boost scores for category+subcategory matches
        if (contextHeaders && contextHeaders.length >= 2) {
            const targetCategory = ((_a = contextHeaders[0]) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
            const targetSubcategory = ((_b = contextHeaders[1]) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || '';
            scoredMatches.forEach(match => {
                var _a, _b;
                const itemCategory = ((_a = match.item.category) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
                const itemSubcategory = ((_b = match.item.subcategory) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || '';
                // Strong boost for exact category+subcategory match
                if (targetCategory && targetSubcategory &&
                    itemCategory.includes(targetCategory) &&
                    itemSubcategory.includes(targetSubcategory)) {
                    match.similarity = Math.min(0.99, match.similarity * 1.3); // 30% boost
                    console.log(`[MatchingService/OPENAI] Boosted ${match.item.code} for category+subcategory match`);
                }
                // Medium boost for category-only match
                else if (targetCategory && itemCategory.includes(targetCategory)) {
                    match.similarity = Math.min(0.95, match.similarity * 1.15); // 15% boost
                }
            });
        }
        // Sort by similarity but give strong preference to unit matches
        scoredMatches.sort((a, b) => {
            // Apply strong unit matching boost
            let aScore = a.similarity;
            let bScore = b.similarity;
            if (queryUnit) {
                const normalizedQueryUnit = this.normalizeUnit(queryUnit);
                const normalizedAUnit = a.item.unit ? this.normalizeUnit(a.item.unit) : '';
                const normalizedBUnit = b.item.unit ? this.normalizeUnit(b.item.unit) : '';
                // 25% boost for exact unit match
                if (normalizedAUnit === normalizedQueryUnit) {
                    aScore *= 1.25;
                }
                else if (this.areUnitsCompatible(queryUnit, a.item.unit)) {
                    aScore *= 1.20; // 20% boost for compatible units
                }
                else if (!a.item.unit) {
                    aScore *= 0.95; // 5% penalty for missing unit
                }
                if (normalizedBUnit === normalizedQueryUnit) {
                    bScore *= 1.25;
                }
                else if (this.areUnitsCompatible(queryUnit, b.item.unit)) {
                    bScore *= 1.20;
                }
                else if (!b.item.unit) {
                    bScore *= 0.95;
                }
            }
            return bScore - aScore;
        });
        const bestMatch = scoredMatches[0];
        // Adjust confidence based on unit match
        let finalConfidence = bestMatch.similarity;
        let unitMatchInfo = '';
        if (queryUnit && bestMatch.item.unit) {
            const normalizedQueryUnit = this.normalizeUnit(queryUnit);
            const normalizedItemUnit = this.normalizeUnit(bestMatch.item.unit);
            if (normalizedQueryUnit === normalizedItemUnit) {
                finalConfidence = Math.min(0.99, finalConfidence * 1.15); // 15% boost for exact unit
                unitMatchInfo = ' with exact unit match';
            }
            else if (this.areUnitsCompatible(queryUnit, bestMatch.item.unit)) {
                finalConfidence = Math.min(0.99, finalConfidence * 1.10); // 10% boost for compatible unit
                unitMatchInfo = ' with compatible unit';
            }
        }
        else if (queryUnit && !bestMatch.item.unit) {
            finalConfidence *= 0.95; // 5% penalty for missing unit
            unitMatchInfo = ' (unit mismatch)';
        }
        return {
            matchedItemId: bestMatch.item._id,
            matchedDescription: bestMatch.item.description,
            matchedCode: bestMatch.item.code || '',
            matchedUnit: bestMatch.item.unit || '',
            matchedRate: bestMatch.item.rate,
            confidence: Math.min(finalConfidence, 0.99),
            method: 'OPENAI',
            matchingDetails: {
                scores: { similarity: bestMatch.similarity, adjusted: finalConfidence },
                factors: ['semantic', 'unit', 'context'],
                reasoning: `Semantic match with ${(bestMatch.similarity * 100).toFixed(1)}% similarity${unitMatchInfo}`
            }
        };
    }
    /**
     * Generate embeddings for BOQ items in batches
     * This significantly improves performance by batching API calls
     */
    async generateBOQEmbeddings(items, provider) {
        await this.ensureClientsInitialized();
        const embeddings = new Map();
        const batchSize = provider === 'cohere' ? 96 : 2048; // Maximum supported batch sizes
        console.log(`[MatchingService] Generating ${provider} embeddings for ${items.length} BOQ items in batches of ${batchSize}`);
        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            try {
                if (provider === 'cohere' && this.cohereClient) {
                    const texts = batch.map(item => {
                        let enrichedQuery = item.description;
                        if (item.contextHeaders && item.contextHeaders.length > 0) {
                            const fullContext = item.contextHeaders.join(' > ');
                            enrichedQuery = `Context: ${fullContext}. Task: ${item.description}`;
                        }
                        return enrichedQuery;
                    });
                    const response = await (0, retry_1.withRetry)(() => this.cohereClient.embed({
                        texts,
                        model: 'embed-english-v3.0',
                        inputType: 'search_query',
                        truncate: 'END'
                    }), {
                        maxAttempts: 2,
                        delayMs: 3000,
                        timeout: 30000
                    });
                    const responseEmbeddings = Array.isArray(response.embeddings)
                        ? response.embeddings
                        : response.embeddings.float || [];
                    batch.forEach((item, idx) => {
                        if (responseEmbeddings[idx]) {
                            embeddings.set(item.description, responseEmbeddings[idx]);
                        }
                    });
                }
                else if (provider === 'openai' && this.openaiClient) {
                    const texts = batch.map(item => {
                        let enrichedQuery = item.description;
                        if (item.contextHeaders && item.contextHeaders.length > 0) {
                            const fullContext = item.contextHeaders.join(' > ');
                            enrichedQuery = `Context: ${fullContext}. Task: ${item.description}`;
                        }
                        return enrichedQuery;
                    });
                    const response = await (0, retry_1.withRetry)(() => this.openaiClient.embeddings.create({
                        input: texts,
                        model: 'text-embedding-3-large',
                    }), {
                        maxAttempts: 2,
                        delayMs: 2000,
                        timeout: 30000
                    });
                    batch.forEach((item, idx) => {
                        if (response.data[idx]) {
                            embeddings.set(item.description, response.data[idx].embedding);
                        }
                    });
                }
                console.log(`[MatchingService] Generated embeddings for batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)}`);
                // Rate limiting between batches
                if (i + batchSize < items.length) {
                    await new Promise(resolve => setTimeout(resolve, provider === 'cohere' ? 2000 : 1000));
                }
            }
            catch (error) {
                console.error(`[MatchingService] Failed to generate embeddings for batch:`, error);
            }
        }
        console.log(`[MatchingService] Generated ${embeddings.size} embeddings for BOQ items`);
        return embeddings;
    }
    /**
     * Generate embeddings for price items in batches
     */
    async generateBatchEmbeddings(priceItems, provider) {
        const batchSize = provider === 'cohere' ? 96 : 2048; // Maximum supported batch sizes
        const batches = [];
        for (let i = 0; i < priceItems.length; i += batchSize) {
            batches.push(priceItems.slice(i, i + batchSize));
        }
        console.log(`[MatchingService] Processing ${batches.length} batches of ${batchSize} items each for ${provider}`);
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const texts = batch.map(item => this.createEnrichedText(item));
            try {
                console.log(`[MatchingService] Processing batch ${i + 1}/${batches.length} (${batch.length} items)`);
                if (provider === 'cohere' && this.cohereClient) {
                    const response = await (0, retry_1.withRetry)(() => this.cohereClient.embed({
                        texts,
                        model: 'embed-english-v3.0',
                        inputType: 'search_document',
                        truncate: 'END'
                    }), {
                        maxAttempts: 2,
                        delayMs: 3000,
                        timeout: 30000
                    });
                    const embeddings = Array.isArray(response.embeddings)
                        ? response.embeddings
                        : response.embeddings.float || [];
                    // Cache embeddings
                    batch.forEach((item, index) => {
                        if (embeddings[index]) {
                            const enrichedText = this.createEnrichedText(item);
                            this.embeddingCache.set(enrichedText, {
                                embedding: embeddings[index],
                                provider: 'cohere'
                            });
                        }
                    });
                }
                else if (provider === 'openai' && this.openaiClient) {
                    const response = await (0, retry_1.withRetry)(() => this.openaiClient.embeddings.create({
                        model: 'text-embedding-3-large',
                        input: texts,
                    }), {
                        maxAttempts: 2,
                        delayMs: 2000,
                        timeout: 30000
                    });
                    // Cache embeddings
                    batch.forEach((item, index) => {
                        if (response.data[index]) {
                            const enrichedText = this.createEnrichedText(item);
                            this.embeddingCache.set(enrichedText, {
                                embedding: response.data[index].embedding,
                                provider: 'openai'
                            });
                        }
                    });
                }
                // Delay between batches
                if (i < batches.length - 1) {
                    const delay = provider === 'cohere' ? 2000 : 1000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
            catch (error) {
                console.error(`[MatchingService] Failed batch ${i + 1}:`, error.message);
                // Continue with next batch
            }
        }
        console.log(`[MatchingService] Completed embedding generation for ${provider}`);
    }
    // Helper methods
    cosineSimilarity(a, b) {
        if (a.length !== b.length)
            return 0;
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        normA = Math.sqrt(normA);
        normB = Math.sqrt(normB);
        if (normA === 0 || normB === 0)
            return 0;
        return dotProduct / (normA * normB);
    }
    extractUnit(description) {
        const unitPatterns = [
            /\b(M3|M2|M|ITEM|NO|m3|m2|m|item|no|nr|nos)\b/i,
            /\b(SQM|sqm|CUM|cum|LM|lm|RM|rm|M1|m1|rmt)\b/i,
            /\b(EA|ea|PC|pc|PCS|pcs|UNIT|unit)\b/i,
            /\b(TON|ton|TONNE|tonne|KG|kg|MT|mt|QTL|qtl|quintal)\b/i,
            /\b(L|l|LTR|ltr|LITER|liter|LITRE|litre)\b/i,
            /\b(BAG|bag|SET|set|PAIR|pair)\b/i,
            /\b(CFT|cft|SFT|sft|RFT|rft|CUFT|SQFT)\b/i,
            /\b(BRASS|brass)\b/i, // Common in South Asian construction
            /\b(TRIP|trip|LOAD|load)\b/i, // For transportation
            /(\d+(?:'|ft|foot|feet))\s*[xXÃ—]\s*(\d+(?:'|ft|foot|feet))/i // Dimension patterns
        ];
        for (const pattern of unitPatterns) {
            const match = description.match(pattern);
            if (match) {
                // Handle special cases
                if (match[1].toLowerCase() === 'mt' && /metric\s+ton/i.test(description)) {
                    return 'TON';
                }
                return match[1].toUpperCase();
            }
        }
        return undefined;
    }
    /**
     * Preprocess description to normalize construction terms
     */
    preprocessDescription(description) {
        let normalized = description;
        // Normalize common construction abbreviations
        const replacements = new Map([
            // Dimensions
            [/(\d+)\s*['"'"]\s*[xXÃ—]\s*(\d+)\s*['"'"]?/g, '$1 x $2'], // 10' x 20' -> 10 x 20
            [/(\d+)\s*mm\s*[xXÃ—]\s*(\d+)\s*mm/gi, '$1mm x $2mm'],
            [/\b(\d+)\s*['"'"]/g, '$1 feet'], // 10' -> 10 feet
            // Common typos and variations
            [/\bexcavat(e|ing|ion)\b/gi, 'excavating'],
            [/\bfill(ing)?\b/gi, 'filling'],
            [/\bconcret(e|ing)\b/gi, 'concrete'],
            [/\breinforc(e|ing|ement)\b/gi, 'reinforcement'],
            [/\bplaster(ing)?\b/gi, 'plastering'],
            [/\bbrickwork\b/gi, 'brick work'],
            [/\bformwork\b/gi, 'form work'],
            // Standardize measurements
            [/\bthk\b/gi, 'thick'],
            [/\bdia\b/gi, 'diameter'],
            [/\bc\/c\b/gi, 'center to center'],
            [/\b@\s*(\d+)/g, 'at $1'],
            // Material variations
            [/\bM\s*(\d+)\b/g, 'M$1'], // M 20 -> M20
            [/\bFe\s*(\d+)\b/g, 'Fe$1'], // Fe 500 -> Fe500
            [/\bgrade\s+(\w+)/gi, 'grade $1'],
            // Remove extra spaces
            [/\s+/g, ' '],
            [/^\s+|\s+$/g, '']
        ]);
        replacements.forEach((replacement, pattern) => {
            normalized = normalized.replace(pattern, replacement);
        });
        return normalized;
    }
    /**
     * Normalize unit strings for better comparison
     */
    normalizeUnit(unit) {
        if (!unit)
            return '';
        // Convert to uppercase and trim
        let normalized = unit.toUpperCase().trim();
        // Remove common punctuation and extra spaces
        normalized = normalized
            .replace(/[.\-_]/g, '') // Remove dots, dashes, underscores
            .replace(/\s+/g, ' ') // Multiple spaces to single space
            .trim();
        // Common normalizations
        const unitNormalizations = {
            // Square meter variations
            'SQ M': 'SQM',
            'SQ MT': 'SQM',
            'SQ MTR': 'SQM',
            'SQ METER': 'SQM',
            'SQ METRE': 'SQM',
            'SQUARE METER': 'SQM',
            'SQUARE METRE': 'SQM',
            'SM': 'SQM',
            // Cubic meter variations
            'CU M': 'CUM',
            'CU MT': 'CUM',
            'CU MTR': 'CUM',
            'CU METER': 'CUM',
            'CU METRE': 'CUM',
            'CUBIC METER': 'CUM',
            'CUBIC METRE': 'CUM',
            'CM': 'CUM',
            // Linear meter variations
            'MTR': 'M',
            'METER': 'M',
            'METRE': 'M',
            'LM': 'M',
            'RM': 'M',
            'RMT': 'M',
            'RUNNING METER': 'M',
            'RUNNING METRE': 'M',
            'LINEAR METER': 'M',
            'LINEAR METRE': 'M',
            // Number/quantity variations
            'NUMBER': 'NO',
            'NOS': 'NO',
            'NR': 'NO',
            'EACH': 'NO',
            'EA': 'NO',
            'PC': 'NO',
            'PCS': 'NO',
            'PIECE': 'NO',
            'PIECES': 'NO',
            'UNIT': 'NO',
            'QTY': 'NO',
            // Weight variations
            'KILOGRAM': 'KG',
            'KILO': 'KG',
            'KGS': 'KG',
            'METRIC TON': 'TON',
            'METRIC TONNE': 'TON',
            'TONNE': 'TON',
            'MT': 'TON',
            'QUINTAL': 'QTL',
            // Volume variations
            'LITRE': 'L',
            'LITER': 'L',
            'LTR': 'L',
            'LIT': 'L',
            // Imperial variations
            'SQUARE FEET': 'SFT',
            'SQUARE FOOT': 'SFT',
            'SQ FT': 'SFT',
            'SQFT': 'SFT',
            'CUBIC FEET': 'CFT',
            'CUBIC FOOT': 'CFT',
            'CU FT': 'CFT',
            'CUFT': 'CFT',
            'RUNNING FEET': 'RFT',
            'RUNNING FOOT': 'RFT',
            // Other
            'BAGS': 'BAG',
            'SETS': 'SET',
            'PAIRS': 'PAIR',
            '100CFT': 'BRASS',
            'HUNDRED CUBIC FEET': 'BRASS',
            'TRUCKLOAD': 'TRIP',
            'LOAD': 'TRIP'
        };
        // Apply normalization
        return unitNormalizations[normalized] || normalized;
    }
    /**
     * Check if two units are compatible/equivalent
     */
    areUnitsCompatible(unit1, unit2) {
        if (!unit1 || !unit2)
            return false;
        const u1 = unit1.toUpperCase().trim();
        const u2 = unit2.toUpperCase().trim();
        // Exact match
        if (u1 === u2)
            return true;
        // Define unit equivalence groups
        const unitGroups = [
            // Linear measurements
            ['M', 'M1', 'LM', 'RM', 'RMT', 'METER', 'METRE', 'MTR'],
            // Area measurements
            ['M2', 'SQM', 'SQ.M', 'SQUARE METER', 'SQUARE METRE', 'SM'],
            // Volume measurements
            ['M3', 'CUM', 'CU.M', 'CUBIC METER', 'CUBIC METRE', 'CM'],
            // Count/quantity
            ['NO', 'NR', 'NOS', 'NUMBER', 'ITEM', 'EACH', 'EA', 'PC', 'PCS', 'UNIT', 'QTY'],
            // Weight - small
            ['KG', 'KILOGRAM', 'KILO'],
            // Weight - large
            ['TON', 'TONNE', 'MT', 'METRIC TON', 'METRIC TONNE'],
            ['QTL', 'QUINTAL'], // 100kg
            // Volume - liquid
            ['L', 'LTR', 'LITER', 'LITRE', 'LIT'],
            // Area - imperial
            ['SFT', 'SQFT', 'SQ.FT', 'SQUARE FEET', 'SQUARE FOOT'],
            // Volume - imperial
            ['CFT', 'CUFT', 'CU.FT', 'CUBIC FEET', 'CUBIC FOOT'],
            // Running measurements
            ['RFT', 'RUNNING FEET', 'RUNNING FOOT'],
            // Special construction units
            ['BAG', 'BAGS'], // Cement bags
            ['BRASS', '100CFT'], // 100 cubic feet
            ['TRIP', 'LOAD', 'TRUCKLOAD'],
            ['SET', 'SETS'],
            ['PAIR', 'PAIRS']
        ];
        // Check if both units belong to the same group
        for (const group of unitGroups) {
            if (group.includes(u1) && group.includes(u2)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Get top N matches for a description
     * This method returns multiple matches instead of just the best one
     */
    async getTopMatches(description, method, providedPriceItems, limit = 3, contextHeaders) {
        // Get price items
        const priceItems = providedPriceItems || await this.getPriceItems();
        if (!priceItems || priceItems.length === 0) {
            return [];
        }
        // For now, only LOCAL method is implemented for multiple matches
        if (method !== 'LOCAL') {
            // For AI methods, fall back to single match and return as array
            try {
                const singleMatch = await this.matchItem(description, method, priceItems, contextHeaders);
                return [singleMatch];
            }
            catch (error) {
                return [];
            }
        }
        // LOCAL matching logic with multiple results
        console.log(`[MatchingService/LOCAL] Getting top ${limit} matches`);
        // Enhance description with context
        let enhancedDescription = description;
        let categoryContext = '';
        if (contextHeaders && contextHeaders.length > 0) {
            categoryContext = contextHeaders[0];
            enhancedDescription = `${description} [Context: ${categoryContext}]`;
        }
        const matches = [];
        // Extract keywords for better matching
        const queryKeywords = enhancedMatching_service_1.EnhancedMatchingService.extractKeywords(enhancedDescription);
        const queryUnit = this.extractUnit(description);
        for (const item of priceItems) {
            // Create searchable text with context
            const searchText = this.createEnrichedText(item, contextHeaders);
            // Initialize score components
            const scoreBreakdown = {
                fuzzy: 0,
                unit: 0,
                category: 0,
                keywords: 0
            };
            // Calculate base fuzzy score
            scoreBreakdown.fuzzy = fuzz.token_set_ratio(description, item.description);
            // Enhanced unit matching with stronger weight (25% boost) 
            if (queryUnit && item.unit) {
                const normalizedQueryUnit = this.normalizeUnit(queryUnit);
                const normalizedItemUnit = this.normalizeUnit(item.unit);
                if (normalizedQueryUnit === normalizedItemUnit) {
                    scoreBreakdown.unit = 25; // Exact match after normalization - highest boost
                }
                else if (this.areUnitsCompatible(queryUnit, item.unit)) {
                    scoreBreakdown.unit = 22; // Compatible units - very high boost
                }
                else if (queryUnit.toUpperCase() === item.unit.toUpperCase()) {
                    scoreBreakdown.unit = 25; // Raw exact match - highest boost
                }
            }
            else if (queryUnit && !item.unit) {
                scoreBreakdown.unit = -5; // Penalty for missing unit when query has unit
            }
            // Enhanced category matching
            if (categoryContext && item.category) {
                const categoryScore = fuzz.partial_ratio(categoryContext.toLowerCase(), item.category.toLowerCase());
                if (categoryScore > 80) {
                    scoreBreakdown.category = 15;
                }
                else if (categoryScore > 60) {
                    scoreBreakdown.category = 10;
                }
                else if (categoryScore > 40) {
                    scoreBreakdown.category = 5;
                }
            }
            // Boost for keyword matches
            const itemKeywords = enhancedMatching_service_1.EnhancedMatchingService.extractKeywords(searchText);
            const commonKeywords = queryKeywords.filter(k => itemKeywords.includes(k));
            if (commonKeywords.length > 0) {
                scoreBreakdown.keywords = Math.min(15, commonKeywords.length * 3);
            }
            // Calculate total score
            const score = Math.min(100, scoreBreakdown.fuzzy * 0.4 +
                scoreBreakdown.unit +
                scoreBreakdown.category +
                scoreBreakdown.keywords);
            if (score > 50) { // Lower threshold for multiple matches
                matches.push({ item, score });
            }
        }
        // Sort by score
        matches.sort((a, b) => b.score - a.score);
        // Return top N matches
        return matches.slice(0, limit).map(match => ({
            matchedItemId: match.item._id,
            matchedDescription: match.item.description,
            matchedCode: match.item.code || '',
            matchedUnit: match.item.unit || '',
            matchedRate: match.item.rate,
            confidence: match.score / 100,
            method: 'LOCAL',
            matchingDetails: {
                scores: { fuzzy: match.score },
                factors: ['fuzzy', 'keywords', 'unit'],
                reasoning: `Fuzzy match with ${match.score}% similarity`
            }
        }));
    }
    // Public method to clear caches
    clearCache() {
        this.embeddingCache.clear();
        this.priceItemsCache = null;
        cache_service_1.matchingCache.flush();
        console.log('[MatchingService] All caches cleared');
    }
}
exports.MatchingService = MatchingService;
