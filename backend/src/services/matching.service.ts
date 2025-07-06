import { getConvexClient } from '../config/convex.js';
import { api } from '../../../convex/_generated/api.js';
import { PriceItem } from '../types/priceItem.types.js';
import { CohereClient } from 'cohere-ai';
import OpenAI from 'openai';
import * as fuzz from 'fuzzball';
import { LRUCache } from 'lru-cache';
import { withRetry } from '../utils/retry.js';
import { EnhancedMatchingService } from './enhancedMatching.service.js';
import { CacheService, matchingCache } from './cache.service.js';
import { debugLog } from '../utils/debugLogger.js';
import { ConstructionPatternsService } from './constructionPatterns.service.js';

interface EmbeddingCacheEntry {
  embedding: number[];
  provider: 'cohere' | 'openai';
}

interface MatchingResult {
  matchedItemId: string;
  matchedDescription: string;
  matchedCode: string;
  matchedUnit: string;
  matchedRate: number;
  confidence: number;
  method?: string;
  matchingDetails?: {
    scores?: Record<string, number>;
    factors?: string[];
    reasoning?: string;
  };
}

export class MatchingService {
  private static instance: MatchingService;
  private convex = getConvexClient();
  private cohereClient: CohereClient | null = null;
  private openaiClient: OpenAI | null = null;
  private embeddingCache: LRUCache<string, EmbeddingCacheEntry>;
  private priceItemsCache: { items: PriceItem[], timestamp: number } | null = null;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    this.embeddingCache = new LRUCache<string, EmbeddingCacheEntry>({
      max: 1000,
      ttl: 1000 * 60 * 60, // 1 hour
    });
  }

  static getInstance(): MatchingService {
    if (!MatchingService.instance) {
      MatchingService.instance = new MatchingService();
    }
    return MatchingService.instance;
  }

  /**
   * Initialize AI clients on first use (lazy loading)
   */
  private async ensureClientsInitialized() {
    if (!this.cohereClient || !this.openaiClient) {
      console.log('[MatchingService] Initializing AI clients...');
      
      // Get API keys from Convex
      const settings = await withRetry(
        () => this.convex.query(api.applicationSettings.getAll),
        {
          maxAttempts: 3,
          delayMs: 1000,
          onRetry: (error, attempt) => {
            console.warn(`[MatchingService] Failed to fetch settings (attempt ${attempt}):`, error.message);
          }
        }
      );
      
      const cohereKey = settings.find(s => s.key === 'COHERE_API_KEY')?.value;
      const openaiKey = settings.find(s => s.key === 'OPENAI_API_KEY')?.value;
      
      if (cohereKey && !this.cohereClient) {
        this.cohereClient = new CohereClient({ token: cohereKey });
        console.log('[MatchingService] Cohere client initialized');
      }
      
      if (openaiKey && !this.openaiClient) {
        this.openaiClient = new OpenAI({ apiKey: openaiKey });
        console.log('[MatchingService] OpenAI client initialized');
      }
    }
  }

  /**
   * Get price items with caching
   */
  private async getPriceItems(): Promise<PriceItem[]> {
    // Check cache first
    if (this.priceItemsCache && Date.now() - this.priceItemsCache.timestamp < this.CACHE_DURATION) {
      return this.priceItemsCache.items;
    }

    // Load from database
    const items = await withRetry(
      () => this.convex.query(api.priceItems.getActive),
      {
        maxAttempts: 3,
        delayMs: 1000,
        onRetry: (error, attempt) => {
          console.log(`[MatchingService] Failed to fetch price items (attempt ${attempt}):`, error.message);
        }
      }
    );

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
  private createEnrichedText(item: PriceItem, contextHeaders?: string[]): string {
    const parts = [item.description];
    
    // Add context headers if provided
    if (contextHeaders && contextHeaders.length > 0) {
      parts.push(`Context: ${contextHeaders.join(' > ')}`);
    }
    
    if (item.category) {
      parts.push(`Category: ${item.category}`);
    }
    
    if (item.subcategory) {
      parts.push(`Subcategory: ${item.subcategory}`);
    }
    
    if (item.unit) {
      parts.push(`Unit: ${item.unit}`);
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
  async matchItemWithEmbedding(
    description: string,
    method: 'COHERE' | 'OPENAI',
    preGeneratedEmbedding: number[],
    providedPriceItems?: PriceItem[],
    contextHeaders?: string[]
  ): Promise<MatchingResult> {
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
    const scoredMatches: Array<{item: PriceItem, similarity: number}> = [];
    
    for (const item of itemsWithEmbeddings) {
      const enrichedText = this.createEnrichedText(item);
      const cached = this.embeddingCache.get(enrichedText);
      const embedding = cached?.embedding || item.embedding!;
      
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
  async matchItem(
    description: string,
    method: 'LOCAL' | 'COHERE' | 'OPENAI',
    providedPriceItems?: PriceItem[],
    contextHeaders?: string[]
  ): Promise<MatchingResult> {
    const matchStartTime = Date.now();
    const matchId = `MATCH_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`\n[MatchingService] === MATCH START (${matchId}) ===`);
    console.log(`[MatchingService] Description: "${description.substring(0, 100)}${description.length > 100 ? '...' : ''}"`);
    console.log(`[MatchingService] Method: ${method}`);
    console.log(`[MatchingService] Context: ${contextHeaders?.join(' > ') || 'None'}`);
    
    // Ensure AI clients are initialized for methods that need them
    if (['COHERE', 'OPENAI'].includes(method)) {
      await this.ensureClientsInitialized();
    }

    // Always get ALL price items from database if not provided
    const priceItems = providedPriceItems || await this.getPriceItems();
    console.log(`[MatchingService] Matching against ${priceItems.length} price items`);

    // Preprocess the description
    const processedDescription = EnhancedMatchingService.preprocessText(description);
    console.log(`[MatchingService] Processed description: "${processedDescription.substring(0, 80)}..."`);

    let result: MatchingResult;
    
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
      
    } catch (error) {
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
  private async localMatch(description: string, priceItems: PriceItem[], contextHeaders?: string[]): Promise<MatchingResult> {
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
    const cacheKey = CacheService.generateMatchKey(enhancedDescription, 'LOCAL');
    const cached = matchingCache.get<MatchingResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const matches: Array<{item: PriceItem, score: number, breakdown: Record<string, number>}> = [];
    
    // Extract keywords for better matching
    const queryKeywords = EnhancedMatchingService.extractKeywords(enhancedDescription);
    const queryUnit = this.extractUnit(description);
    
    // Extract category keywords from context
    const contextKeywords = contextHeaders ? 
      contextHeaders.flatMap(h => EnhancedMatchingService.extractKeywords(h)) : [];
    
    // Preprocess and extract construction features from query
    const preprocessedDescription = this.preprocessDescription(description);
    const queryFeatures = ConstructionPatternsService.extractConstructionFeatures(preprocessedDescription);
    const expandedDescription = ConstructionPatternsService.expandAbbreviations(preprocessedDescription);
    
    for (const item of priceItems) {
      // Create searchable text with context
      const searchText = this.createEnrichedText(item, contextHeaders);
      
      // Extract construction features from item
      const itemFeatures = ConstructionPatternsService.extractConstructionFeatures(item.description);
      
      // Initialize score components
      const scoreBreakdown: Record<string, number> = {
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
      
      // Enhanced unit matching with compatibility check
      if (queryUnit && item.unit) {
        if (this.areUnitsCompatible(queryUnit, item.unit)) {
          scoreBreakdown.unit = 20; // High boost for compatible units
        } else if (queryUnit.toUpperCase() === item.unit.toUpperCase()) {
          scoreBreakdown.unit = 25; // Even higher for exact match
        }
      }
      
      // Enhanced category matching
      if (contextHeaders && contextHeaders.length > 0 && item.category) {
        // Check if any context header matches the item category
        const categoryMatches = contextHeaders.map(header => 
          fuzz.partial_ratio(header.toLowerCase(), item.category.toLowerCase())
        );
        const bestCategoryMatch = Math.max(...categoryMatches);
        
        if (bestCategoryMatch > 80) {
          scoreBreakdown.category = 15;
        } else if (bestCategoryMatch > 60) {
          scoreBreakdown.category = 10;
        } else if (bestCategoryMatch > 40) {
          scoreBreakdown.category = 5;
        }
        
        // Also check subcategory
        if (item.subcategory) {
          const subcategoryMatches = contextHeaders.map(header => 
            fuzz.partial_ratio(header.toLowerCase(), item.subcategory.toLowerCase())
          );
          const bestSubcategoryMatch = Math.max(...subcategoryMatches);
          if (bestSubcategoryMatch > 70) {
            scoreBreakdown.category += 5;
          }
        }
      }
      
      // Enhanced keyword matching
      const itemKeywords = EnhancedMatchingService.extractKeywords(searchText);
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
      const constructionScore = ConstructionPatternsService.calculateConstructionScore(
        queryFeatures,
        itemFeatures
      );
      scoreBreakdown.construction = constructionScore * 0.3; // 30% of construction score
      
      // Calculate total score with weighted components
      const totalScore = Math.min(100, 
        scoreBreakdown.fuzzy * 0.3 +      // 30% weight on description match (reduced from 40%)
        scoreBreakdown.unit +             // Unit match bonus
        scoreBreakdown.category +         // Category match bonus
        scoreBreakdown.keywords +         // Keyword match bonus
        scoreBreakdown.context +          // Context keyword bonus
        scoreBreakdown.construction       // Construction pattern bonus
      );
      
      // Always collect all matches regardless of score
      matches.push({ item, score: totalScore, breakdown: scoreBreakdown });
    }
    
    // Sort by score to find the best match
    matches.sort((a, b) => b.score - a.score);
    
    // Always return the best match, even if low confidence
    const bestMatch = matches[0];
    const result: MatchingResult = {
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
                   `${bestMatch.breakdown.unit}pts unit, ${bestMatch.breakdown.category}pts category, ` +
                   `${bestMatch.breakdown.keywords}pts keywords`
      }
    };
    
    // Cache the result
    matchingCache.set(cacheKey, result, 3600);
    
    return result;
  }

  /**
   * COHERE MATCH - Semantic matching with Cohere embeddings
   */
  private async cohereMatch(description: string, priceItems: PriceItem[], contextHeaders?: string[]): Promise<MatchingResult> {
    const timer = debugLog.startTimer('COHERE', 'Semantic matching');
    debugLog.log('COHERE', `Matching "${description}" against ${priceItems.length} price items`);
    console.log(`[MatchingService/COHERE] Starting Cohere match for: "${description}"`);
    console.log(`[MatchingService/COHERE] Price items available: ${priceItems.length}`);
    console.log(`[MatchingService/COHERE] Context headers: ${contextHeaders?.join(' > ') || 'None'}`);
    
    if (!this.cohereClient) {
      const error = 'Cohere client not initialized. Please configure COHERE_API_KEY.';
      debugLog.error('COHERE', error);
      console.error(`[MatchingService/COHERE] ${error}`);
      throw new Error(error);
    }

    // Build enriched query with full context and construction patterns
    let enrichedQuery = description;
    const expandedDescription = ConstructionPatternsService.expandAbbreviations(description);
    const queryFeatures = ConstructionPatternsService.extractConstructionFeatures(description);
    
    if (contextHeaders && contextHeaders.length > 0) {
      const fullContext = contextHeaders.join(' > ');
      enrichedQuery = `Category: ${fullContext}. Task: ${expandedDescription}`;
      
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
      
      debugLog.log('COHERE', `Enriched query with context and construction features`, { enrichedQuery });
    }
    
    // Extract unit from description for better matching
    const queryUnit = this.extractUnit(description);

    // Get query embedding
    let queryEmbedding: number[];
    try {
      debugLog.log('COHERE', 'Generating query embedding...');
      const response = await withRetry(
        () => this.cohereClient!.embed({
          texts: [enrichedQuery],
          model: 'embed-english-v3.0',
          inputType: 'search_query',
          truncate: 'END'
        }),
        {
          maxAttempts: 2,
          delayMs: 3000,
          timeout: 30000,
          onRetry: (error, attempt) => {
            debugLog.warning('COHERE', `Embedding generation retry ${attempt}`, { error: error.message });
          }
        }
      );
      
      const embeddings = Array.isArray(response.embeddings) 
        ? response.embeddings 
        : (response.embeddings as any).float || [];
      queryEmbedding = embeddings[0];
      
      console.log(`[MatchingService/COHERE] Generated query embedding with ${queryEmbedding?.length || 0} dimensions`);
      
      if (!queryEmbedding || queryEmbedding.length === 0) {
        throw new Error('Invalid embedding response from Cohere');
      }
    } catch (error) {
      console.error('[MatchingService/COHERE] Failed to generate query embedding:', error);
      debugLog.error('COHERE', 'Failed to generate embedding, falling back to LOCAL', error);
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
      debugLog.warning('COHERE', `No price items have embeddings. Total items: ${priceItems.length}`);
      return this.localMatch(description, priceItems, contextHeaders);
    }
    
    console.log(`[MatchingService/COHERE] Comparing against ${itemsWithEmbeddings.length} items with embeddings`);
    debugLog.log('COHERE', `Found ${itemsWithEmbeddings.length} items with Cohere embeddings`);

    // Calculate similarities
    const scoredMatches: Array<{item: PriceItem, similarity: number}> = [];
    
    for (const item of itemsWithEmbeddings) {
      const enrichedText = this.createEnrichedText(item);
      const cached = this.embeddingCache.get(enrichedText);
      const embedding = cached?.embedding || item.embedding!;
      
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);
      
      // Always collect all matches regardless of similarity
      scoredMatches.push({ item, similarity });
    }
    
    if (scoredMatches.length === 0) {
      console.warn('[MatchingService/COHERE] No good semantic matches. Falling back to LOCAL.');
      return this.localMatch(description, priceItems, contextHeaders);
    }
    
    // Sort by similarity but consider unit compatibility
    scoredMatches.sort((a, b) => {
      // Boost score for unit compatibility
      let aScore = a.similarity;
      let bScore = b.similarity;
      
      if (queryUnit) {
        if (this.areUnitsCompatible(queryUnit, a.item.unit)) {
          aScore += 0.1; // 10% boost for unit compatibility
        }
        if (this.areUnitsCompatible(queryUnit, b.item.unit)) {
          bScore += 0.1;
        }
      }
      
      return bScore - aScore;
    });
    
    const bestMatch = scoredMatches[0];
    
    // Adjust confidence based on unit match
    let finalConfidence = bestMatch.similarity;
    let unitMatchInfo = '';
    if (queryUnit && bestMatch.item.unit) {
      if (this.areUnitsCompatible(queryUnit, bestMatch.item.unit)) {
        finalConfidence = Math.min(0.99, finalConfidence + 0.05);
        unitMatchInfo = ' with compatible unit';
      }
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
  private async openAIMatch(description: string, priceItems: PriceItem[], contextHeaders?: string[]): Promise<MatchingResult> {
    console.log(`[MatchingService/OPENAI] Semantic matching with OpenAI`);
    
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized. Please configure OPENAI_API_KEY.');
    }

    // Build enriched query with full context and construction patterns
    let enrichedQuery = description;
    const expandedDescription = ConstructionPatternsService.expandAbbreviations(description);
    const queryFeatures = ConstructionPatternsService.extractConstructionFeatures(description);
    
    if (contextHeaders && contextHeaders.length > 0) {
      const fullContext = contextHeaders.join(' > ');
      enrichedQuery = `Context: ${fullContext}. Task: ${expandedDescription}`;
      
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
    
    // Extract unit from description for better matching
    const queryUnit = this.extractUnit(description);

    // Get query embedding
    let queryEmbedding: number[];
    try {
      const response = await withRetry(
        () => this.openaiClient!.embeddings.create({
          input: enrichedQuery,
          model: 'text-embedding-3-large',
        }),
        {
          maxAttempts: 2,
          delayMs: 2000,
          timeout: 30000
        }
      );
      
      queryEmbedding = response.data[0].embedding;
    } catch (error) {
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
    const scoredMatches: Array<{item: PriceItem, similarity: number}> = [];
    
    for (const item of itemsWithEmbeddings) {
      const enrichedText = this.createEnrichedText(item);
      const cached = this.embeddingCache.get(enrichedText);
      const embedding = cached?.embedding || item.embedding!;
      
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);
      
      // Always collect all matches regardless of similarity
      scoredMatches.push({ item, similarity });
    }
    
    if (scoredMatches.length === 0) {
      console.warn('[MatchingService/OPENAI] No good semantic matches. Falling back to LOCAL.');
      return this.localMatch(description, priceItems, contextHeaders);
    }
    
    // Sort by similarity but consider unit compatibility
    scoredMatches.sort((a, b) => {
      // Boost score for unit compatibility
      let aScore = a.similarity;
      let bScore = b.similarity;
      
      if (queryUnit) {
        if (this.areUnitsCompatible(queryUnit, a.item.unit)) {
          aScore += 0.1; // 10% boost for unit compatibility
        }
        if (this.areUnitsCompatible(queryUnit, b.item.unit)) {
          bScore += 0.1;
        }
      }
      
      return bScore - aScore;
    });
    
    const bestMatch = scoredMatches[0];
    
    // Adjust confidence based on unit match
    let finalConfidence = bestMatch.similarity;
    let unitMatchInfo = '';
    if (queryUnit && bestMatch.item.unit) {
      if (this.areUnitsCompatible(queryUnit, bestMatch.item.unit)) {
        finalConfidence = Math.min(0.99, finalConfidence + 0.05);
        unitMatchInfo = ' with compatible unit';
      }
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
  async generateBOQEmbeddings(
    items: Array<{ description: string; contextHeaders?: string[] }>,
    provider: 'cohere' | 'openai'
  ): Promise<Map<string, number[]>> {
    await this.ensureClientsInitialized();
    
    const embeddings = new Map<string, number[]>();
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
          
          const response = await withRetry(
            () => this.cohereClient!.embed({
              texts,
              model: 'embed-english-v3.0',
              inputType: 'search_query',
              truncate: 'END'
            }),
            {
              maxAttempts: 2,
              delayMs: 3000,
              timeout: 30000
            }
          );
          
          const responseEmbeddings = Array.isArray(response.embeddings)
            ? response.embeddings
            : (response.embeddings as any).float || [];
          
          batch.forEach((item, idx) => {
            if (responseEmbeddings[idx]) {
              embeddings.set(item.description, responseEmbeddings[idx]);
            }
          });
        } else if (provider === 'openai' && this.openaiClient) {
          const texts = batch.map(item => {
            let enrichedQuery = item.description;
            if (item.contextHeaders && item.contextHeaders.length > 0) {
              const fullContext = item.contextHeaders.join(' > ');
              enrichedQuery = `Context: ${fullContext}. Task: ${item.description}`;
            }
            return enrichedQuery;
          });
          
          const response = await withRetry(
            () => this.openaiClient!.embeddings.create({
              input: texts,
              model: 'text-embedding-3-large',
            }),
            {
              maxAttempts: 2,
              delayMs: 2000,
              timeout: 30000
            }
          );
          
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
      } catch (error) {
        console.error(`[MatchingService] Failed to generate embeddings for batch:`, error);
      }
    }
    
    console.log(`[MatchingService] Generated ${embeddings.size} embeddings for BOQ items`);
    return embeddings;
  }

  /**
   * Generate embeddings for price items in batches
   */
  async generateBatchEmbeddings(priceItems: PriceItem[], provider: 'cohere' | 'openai') {
    const batchSize = provider === 'cohere' ? 96 : 2048; // Maximum supported batch sizes
    const batches: PriceItem[][] = [];
    
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
          const response = await withRetry(
            () => this.cohereClient!.embed({
              texts,
              model: 'embed-english-v3.0',
              inputType: 'search_document',
              truncate: 'END'
            }),
            {
              maxAttempts: 2,
              delayMs: 3000,
              timeout: 30000
            }
          );
          
          const embeddings = Array.isArray(response.embeddings) 
            ? response.embeddings 
            : (response.embeddings as any).float || [];
          
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
        } else if (provider === 'openai' && this.openaiClient) {
          const response = await withRetry(
            () => this.openaiClient!.embeddings.create({
              model: 'text-embedding-3-large',
              input: texts,
            }),
            {
              maxAttempts: 2,
              delayMs: 2000,
              timeout: 30000
            }
          );
          
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
      } catch (error: any) {
        console.error(`[MatchingService] Failed batch ${i + 1}:`, error.message);
        // Continue with next batch
      }
    }
    
    console.log(`[MatchingService] Completed embedding generation for ${provider}`);
  }

  // Helper methods

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
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
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (normA * normB);
  }

  private extractUnit(description: string): string | undefined {
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
      /(\d+(?:'|ft|foot|feet))\s*[xX×]\s*(\d+(?:'|ft|foot|feet))/i // Dimension patterns
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
  private preprocessDescription(description: string): string {
    let normalized = description;
    
    // Normalize common construction abbreviations
    const replacements = new Map([
      // Dimensions
      [/(\d+)\s*['"'"]\s*[xX×]\s*(\d+)\s*['"'"]?/g, '$1 x $2'], // 10' x 20' -> 10 x 20
      [/(\d+)\s*mm\s*[xX×]\s*(\d+)\s*mm/gi, '$1mm x $2mm'],
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
   * Check if two units are compatible/equivalent
   */
  private areUnitsCompatible(unit1: string | undefined, unit2: string | undefined): boolean {
    if (!unit1 || !unit2) return false;
    
    const u1 = unit1.toUpperCase().trim();
    const u2 = unit2.toUpperCase().trim();
    
    // Exact match
    if (u1 === u2) return true;
    
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
  async getTopMatches(
    description: string, 
    method: 'LOCAL' | 'COHERE' | 'OPENAI',
    providedPriceItems?: PriceItem[], 
    limit: number = 3,
    contextHeaders?: string[]
  ): Promise<MatchingResult[]> {
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
      } catch (error) {
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

    const matches: Array<{item: PriceItem, score: number}> = [];
    
    // Extract keywords for better matching
    const queryKeywords = EnhancedMatchingService.extractKeywords(enhancedDescription);
    const queryUnit = this.extractUnit(description);
    
    for (const item of priceItems) {
      // Create searchable text with context
      const searchText = this.createEnrichedText(item, contextHeaders);
      
      // Initialize score components
      const scoreBreakdown: Record<string, number> = {
        fuzzy: 0,
        unit: 0,
        category: 0,
        keywords: 0
      };
      
      // Calculate base fuzzy score
      scoreBreakdown.fuzzy = fuzz.token_set_ratio(description, item.description);
      
      // Enhanced unit matching with compatibility check
      if (queryUnit && item.unit) {
        if (this.areUnitsCompatible(queryUnit, item.unit)) {
          scoreBreakdown.unit = 20;
        } else if (queryUnit.toUpperCase() === item.unit.toUpperCase()) {
          scoreBreakdown.unit = 25;
        }
      }
      
      // Enhanced category matching
      if (categoryContext && item.category) {
        const categoryScore = fuzz.partial_ratio(categoryContext.toLowerCase(), item.category.toLowerCase());
        if (categoryScore > 80) {
          scoreBreakdown.category = 15;
        } else if (categoryScore > 60) {
          scoreBreakdown.category = 10;
        } else if (categoryScore > 40) {
          scoreBreakdown.category = 5;
        }
      }
      
      // Boost for keyword matches
      const itemKeywords = EnhancedMatchingService.extractKeywords(searchText);
      const commonKeywords = queryKeywords.filter(k => itemKeywords.includes(k));
      if (commonKeywords.length > 0) {
        scoreBreakdown.keywords = Math.min(15, commonKeywords.length * 3);
      }
      
      // Calculate total score
      const score = Math.min(100, 
        scoreBreakdown.fuzzy * 0.4 +
        scoreBreakdown.unit +
        scoreBreakdown.category +
        scoreBreakdown.keywords
      );
      
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
    matchingCache.flush();
    console.log('[MatchingService] All caches cleared');
  }
}