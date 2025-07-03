import FuzzySet from 'fuzzyset.js';
import * as fuzzball from 'fuzzball';
import Fuse from 'fuse.js';
import { CohereClient } from 'cohere-ai';
import OpenAI from 'openai';
import { getConvexClient } from '../config/convex.js';
import { api } from '../../../convex/_generated/api.js';
import { EnhancedMatchingService } from './enhancedMatching.service.js';
import { matchingCache, CacheService } from './cache.service.js';
import { PriceItem } from '../types/priceItem.types.js';
import { withRetry } from '../utils/retry.js';


interface MatchingResult {
  matchedItemId: string;
  matchedDescription: string;
  matchedCode: string;
  matchedUnit: string;
  matchedRate: number;
  confidence: number;
  method?: string;
}

export class MatchingService {
  private static instance: MatchingService | null = null;
  private convex = getConvexClient();
  private cohereClient: CohereClient | null = null;
  private openaiClient: OpenAI | null = null;
  private clientsInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private embeddingCache: Map<string, { embedding: number[], provider: 'cohere' | 'openai' }> = new Map();

  constructor() {
    // Start initialization immediately but don't await
    this.initializationPromise = this.initializeClients();
  }

  static getInstance(): MatchingService {
    if (!MatchingService.instance) {
      MatchingService.instance = new MatchingService();
    }
    return MatchingService.instance;
  }

  private async initializeClients() {
    try {
      // Get API keys from application settings
      const settings = await this.convex.query(api.applicationSettings.getByKeys, {
        keys: ['COHERE_API_KEY', 'OPENAI_API_KEY'],
      });

      const cohereKey = settings.find(s => s.key === 'COHERE_API_KEY')?.value;
      const openaiKey = settings.find(s => s.key === 'OPENAI_API_KEY')?.value;

      if (cohereKey) {
        // Cohere client expects the key as 'token'
        this.cohereClient = new CohereClient({ token: cohereKey });
        console.log('Cohere client initialized successfully');
      } else {
        console.log('No Cohere API key found in settings');
      }

      if (openaiKey) {
        // Try both ways to initialize OpenAI client
        try {
          this.openaiClient = new OpenAI({ apiKey: openaiKey });
          console.log('OpenAI client initialized successfully with apiKey');
        } catch (error) {
          // If that fails, try setting environment variable
          process.env.OPENAI_API_KEY = openaiKey;
          this.openaiClient = new OpenAI();
          console.log('OpenAI client initialized successfully with OPENAI_API_KEY env var');
        }
      } else {
        console.log('No OpenAI API key found in settings');
      }

      this.clientsInitialized = true;
    } catch (error) {
      console.error('Failed to initialize AI clients:', error);
      this.clientsInitialized = true; // Mark as initialized even if failed
    }
  }

  private async ensureClientsInitialized() {
    if (!this.clientsInitialized && this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  /**
   * Create enriched text for embedding that includes description, category, and subcategory
   */
  private createEnrichedText(item: PriceItem): string {
    const parts = [item.description];
    
    if (item.category) {
      parts.push(`Category: ${item.category}`);
    }
    
    if (item.subcategory || item.subCategoryName) {
      parts.push(`Subcategory: ${item.subcategory || item.subCategoryName}`);
    }
    
    if (item.material_type) {
      parts.push(`Material: ${item.material_type}`);
    }
    
    if (item.brand) {
      parts.push(`Brand: ${item.brand}`);
    }
    
    return parts.join(' | ');
  }

  /**
   * Pre-generate embeddings for all price items in batches
   */
  async generateBatchEmbeddings(
    priceItems: PriceItem[],
    provider: 'cohere' | 'openai' = 'cohere'
  ): Promise<void> {
    console.log(`[MatchingService] Starting batch embedding generation for ${priceItems.length} items using ${provider}`);
    
    if (provider === 'cohere' && !this.cohereClient) {
      throw new Error('Cohere client not initialized');
    }
    
    if (provider === 'openai' && !this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }
    
    // Filter items that need embeddings
    const itemsNeedingEmbeddings = priceItems.filter(item => {
      const enrichedText = this.createEnrichedText(item);
      const cached = this.embeddingCache.get(enrichedText);
      return !cached || cached.provider !== provider;
    });
    
    if (itemsNeedingEmbeddings.length === 0) {
      console.log(`[MatchingService] All items already have ${provider} embeddings`);
      return;
    }
    
    console.log(`[MatchingService] Generating embeddings for ${itemsNeedingEmbeddings.length} items`);
    
    const batchSize = provider === 'cohere' ? 96 : 100; // Cohere max 96, OpenAI max 100
    const batches = [];
    
    for (let i = 0; i < itemsNeedingEmbeddings.length; i += batchSize) {
      batches.push(itemsNeedingEmbeddings.slice(i, i + batchSize));
    }
    
    let totalGenerated = 0;
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const texts = batch.map(item => this.createEnrichedText(item));
      
      try {
        if (provider === 'cohere') {
          const response = await withRetry(
            () => this.cohereClient!.embed({
              texts,
              model: 'embed-english-v3.0',
              inputType: 'search_document',
            }),
            {
              maxAttempts: 3,
              delayMs: 2000,
              onRetry: (error, attempt) => {
                console.log(`Cohere batch ${i + 1}/${batches.length} failed (attempt ${attempt}):`, error.message);
              }
            }
          );
          
          const embeddings = Array.isArray(response.embeddings) 
            ? response.embeddings 
            : (response.embeddings as any).float || [];
          
          // Cache embeddings
          batch.forEach((item, index) => {
            const enrichedText = this.createEnrichedText(item);
            this.embeddingCache.set(enrichedText, {
              embedding: embeddings[index],
              provider: 'cohere'
            });
          });
          
          totalGenerated += embeddings.length;
        } else if (provider === 'openai') {
          const response = await withRetry(
            () => this.openaiClient!.embeddings.create({
              model: 'text-embedding-3-large',
              input: texts,
            }),
            {
              maxAttempts: 3,
              delayMs: 2000,
              onRetry: (error, attempt) => {
                console.log(`OpenAI batch ${i + 1}/${batches.length} failed (attempt ${attempt}):`, error.message);
              }
            }
          );
          
          // Cache embeddings
          batch.forEach((item, index) => {
            const enrichedText = this.createEnrichedText(item);
            this.embeddingCache.set(enrichedText, {
              embedding: response.data[index].embedding,
              provider: 'openai'
            });
          });
          
          totalGenerated += response.data.length;
        }
        
        console.log(`[MatchingService] Batch ${i + 1}/${batches.length} completed. Total generated: ${totalGenerated}`);
        
        // Add delay between batches to avoid rate limiting
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Failed to generate ${provider} embeddings for batch ${i + 1}:`, error);
        throw error;
      }
    }
    
    console.log(`[MatchingService] Batch embedding generation complete. Generated ${totalGenerated} embeddings`);
  }

  async matchItem(
    description: string,
    method: 'LOCAL' | 'COHERE' | 'OPENAI' | 'HYBRID' | 'ADVANCED' | 'LOCAL_UNIT' | 'HYBRID_CATEGORY',
    priceItems?: PriceItem[],
    contextHeaders?: string[]
  ): Promise<MatchingResult> {
    const matchStartTime = Date.now();
    const matchId = `MATCH_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`\n[MatchingService] === MATCH START (${matchId}) ===`);
    console.log(`[MatchingService] Description: "${description.substring(0, 100)}${description.length > 100 ? '...' : ''}"`);
    console.log(`[MatchingService] Method: ${method}`);
    console.log(`[MatchingService] Context: ${contextHeaders?.join(' > ') || 'None'}`);
    console.log(`[MatchingService] Has price items: ${priceItems ? `Yes (${priceItems.length} items)` : 'No'}`);
    
    // Ensure AI clients are initialized for methods that need them
    if (method === 'COHERE' || method === 'OPENAI' || method === 'HYBRID' || method === 'HYBRID_CATEGORY') {
      console.log(`[MatchingService] Initializing AI clients for ${method}...`);
      const initStartTime = Date.now();
      await this.ensureClientsInitialized();
      console.log(`[MatchingService] AI clients initialized in ${Date.now() - initStartTime}ms`);
    }

    // Get price items if not provided
    if (!priceItems) {
      console.log(`[MatchingService] Loading price items from database...`);
      const loadStartTime = Date.now();
      
      try {
        priceItems = await withRetry(
          () => this.convex.query(api.priceItems.getActive),
          {
            maxAttempts: 3,
            delayMs: 1000,
            onRetry: (error, attempt) => {
              console.log(`[MatchingService] Failed to fetch price items (attempt ${attempt}):`, error.message);
            }
          }
        );
        
        console.log(`[MatchingService] Loaded ${priceItems?.length || 0} price items in ${Date.now() - loadStartTime}ms`);
        
        if (!priceItems || priceItems.length === 0) {
          throw new Error('No price items found in database');
        }
      } catch (error) {
        console.error(`[MatchingService] ERROR: Failed to load price items after ${Date.now() - loadStartTime}ms`);
        throw new Error(`Failed to load price items: ${error.message}`);
      }
    }

    // Preprocess the description
    const processedDescription = EnhancedMatchingService.preprocessText(description);
    console.log(`[MatchingService] Processed description: "${processedDescription.substring(0, 80)}..."`);

    let result: MatchingResult;
    const methodStartTime = Date.now();
    
    try {
      console.log(`[MatchingService] Executing ${method} matching...`);
      
      switch (method) {
        case 'LOCAL':
          result = await this.localMatch(processedDescription, priceItems, contextHeaders);
          break;
        case 'LOCAL_UNIT':
          result = await this.localUnitMatch(processedDescription, priceItems, contextHeaders);
          break;
        case 'COHERE':
          result = await this.cohereMatch(processedDescription, priceItems, false, contextHeaders);
          break;
        case 'OPENAI':
          result = await this.openaiMatch(processedDescription, priceItems, false, contextHeaders);
          break;
        case 'HYBRID':
          result = await this.hybridMatch(processedDescription, priceItems, contextHeaders);
          break;
        case 'HYBRID_CATEGORY':
          result = await this.hybridCategoryMatch(processedDescription, priceItems, contextHeaders);
          break;
        case 'ADVANCED':
          result = await this.advancedMatch(processedDescription, priceItems, contextHeaders);
          break;
        default:
          throw new Error(`Unknown matching method: ${method}`);
      }
      
      const methodEndTime = Date.now();
      const totalTime = methodEndTime - matchStartTime;
      
      console.log(`[MatchingService] === MATCH COMPLETE (${matchId}) ===`);
      console.log(`[MatchingService] Method execution time: ${methodEndTime - methodStartTime}ms`);
      console.log(`[MatchingService] Total match time: ${totalTime}ms`);
      console.log(`[MatchingService] Match found: ${result.matchedDescription ? 'YES' : 'NO'}`);
      
      if (result.matchedDescription) {
        console.log(`[MatchingService] Matched item:`);
        console.log(`[MatchingService]   - Description: "${result.matchedDescription.substring(0, 80)}..."`);
        console.log(`[MatchingService]   - Code: ${result.matchedCode || 'N/A'}`);
        console.log(`[MatchingService]   - Unit: ${result.matchedUnit || 'N/A'}`);
        console.log(`[MatchingService]   - Rate: ${result.matchedRate}`);
        console.log(`[MatchingService]   - Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      } else {
        console.log(`[MatchingService] No match found`);
      }
      console.log(`[MatchingService] =============================\n`);
      
      return result;
      
    } catch (error) {
      const totalTime = Date.now() - matchStartTime;
      console.error(`[MatchingService] === MATCH ERROR (${matchId}) ===`);
      console.error(`[MatchingService] Failed after ${totalTime}ms`);
      console.error(`[MatchingService] Method: ${method}`);
      console.error(`[MatchingService] Error:`, error);
      console.error(`[MatchingService] Stack:`, error instanceof Error ? error.stack : 'No stack trace');
      console.error(`[MatchingService] =============================\n`);
      throw error;
    }
  }

  private async localMatch(description: string, priceItems: PriceItem[], contextHeaders?: string[]): Promise<MatchingResult> {
    console.log(`[MatchingService/LOCAL] Starting local match...`);
    console.log(`[MatchingService/LOCAL] Price items available: ${priceItems.length}`);
    
    // Check cache first
    const cacheKey = CacheService.generateMatchKey(description, 'LOCAL');
    const cached = matchingCache.get<MatchingResult>(cacheKey);
    if (cached) {
      console.log(`[MatchingService/LOCAL] Found cached result`);
      return cached;
    }

    console.log(`[MatchingService/LOCAL] No cache hit, performing fuzzy matching...`);
    const matchStartTime = Date.now();
    
    // Use enhanced matching with context
    const matches = EnhancedMatchingService.enhancedFuzzyMatch(description, priceItems, 5, contextHeaders);
    
    console.log(`[MatchingService/LOCAL] Fuzzy match completed in ${Date.now() - matchStartTime}ms`);
    console.log(`[MatchingService/LOCAL] Found ${matches.length} potential matches`);
    
    if (matches.length > 0) {
      console.log(`[MatchingService/LOCAL] Top 3 matches:`);
      matches.slice(0, 3).forEach((match, index) => {
        console.log(`[MatchingService/LOCAL]   ${index + 1}. Score: ${match.score.toFixed(1)}, Item: "${match.item.description.substring(0, 60)}..."`);
      });
    }
    
    if (matches.length === 0) {
      throw new Error('No suitable match found');
    }

    const bestMatch = matches[0];
    const result: MatchingResult = {
      matchedItemId: bestMatch.item._id,
      matchedDescription: bestMatch.item.description,
      matchedCode: bestMatch.item.code || '',
      matchedUnit: bestMatch.item.unit || '',
      matchedRate: bestMatch.item.rate,
      confidence: bestMatch.score / 100,
      method: 'LOCAL'
    };

    // Cache the result
    matchingCache.set(cacheKey, result, 3600); // 1 hour cache
    
    return result;
  }

  private async cohereMatch(description: string, priceItems: PriceItem[], generateEmbeddings: boolean = false, contextHeaders?: string[]): Promise<MatchingResult> {
    console.log(`[MatchingService/COHERE] Starting Cohere AI match...`);
    console.log(`[MatchingService/COHERE] Generate embeddings: ${generateEmbeddings}`);
    
    if (!this.cohereClient) {
      console.error(`[MatchingService/COHERE] ERROR: Cohere client not initialized`);
      throw new Error('Cohere API key not configured. Please add COHERE_API_KEY in Admin Settings.');
    }

    console.log(`[MatchingService/COHERE] Getting embedding for query...`);
    const embedStartTime = Date.now();
    
    // Create enriched query text including context
    let enrichedQuery = description;
    if (contextHeaders && contextHeaders.length > 0) {
      enrichedQuery = `${description} | Context: ${contextHeaders.join(' > ')}`;
    }
    
    // Get embedding for the enriched query
    const embeddingResponse = await this.cohereClient.embed({
      texts: [enrichedQuery],
      model: 'embed-english-v3.0',
      inputType: 'search_query',
    });
    
    console.log(`[MatchingService/COHERE] Query embedding generated in ${Date.now() - embedStartTime}ms`);

    // Handle Cohere's embedding response format
    const embeddings = Array.isArray(embeddingResponse.embeddings) 
      ? embeddingResponse.embeddings 
      : (embeddingResponse.embeddings as any).float || (embeddingResponse.embeddings as any).int8 || (embeddingResponse.embeddings as any).uint8 || (embeddingResponse.embeddings as any).ubinary || (embeddingResponse.embeddings as any).binary || [];
    const queryEmbedding = embeddings[0];

    // Get embeddings from cache or database
    let itemsWithEmbeddings: PriceItem[] = [];
    
    // First, ensure all items have embeddings (batch generate if needed)
    if (generateEmbeddings) {
      await this.generateBatchEmbeddings(priceItems, 'cohere');
    }
    
    // Get embeddings from cache
    for (const item of priceItems) {
      const enrichedText = this.createEnrichedText(item);
      const cached = this.embeddingCache.get(enrichedText);
      
      if (cached && cached.provider === 'cohere') {
        itemsWithEmbeddings.push({
          ...item,
          embedding: cached.embedding,
          embeddingProvider: 'cohere'
        });
      } else if (item.embedding && item.embeddingProvider === 'cohere') {
        // Use existing embedding but cache it with enriched text
        itemsWithEmbeddings.push(item);
        this.embeddingCache.set(enrichedText, {
          embedding: item.embedding,
          provider: 'cohere'
        });
      }
    }


    if (itemsWithEmbeddings.length === 0) {
      // Fall back to local matching
      return this.localMatch(description, priceItems, contextHeaders);
    }

    // Calculate cosine similarity
    let bestMatch: PriceItem | null = null;
    let bestSimilarity = -1;

    itemsWithEmbeddings.forEach(item => {
      const similarity = this.cosineSimilarity(queryEmbedding, item.embedding!);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = item;
      }
    });

    if (!bestMatch || bestSimilarity < 0.5) {
      throw new Error('No suitable match found');
    }

    return {
      matchedItemId: bestMatch._id,
      matchedDescription: bestMatch.description,
      matchedCode: bestMatch.code,
      matchedUnit: bestMatch.unit,
      matchedRate: bestMatch.rate,
      confidence: bestSimilarity,
      method: 'COHERE'
    };
  }

  private async openaiMatch(description: string, priceItems: PriceItem[], generateEmbeddings: boolean = false, contextHeaders?: string[]): Promise<MatchingResult> {
    console.log(`[MatchingService/OPENAI] Starting OpenAI match...`);
    console.log(`[MatchingService/OPENAI] Generate embeddings: ${generateEmbeddings}`);
    
    if (!this.openaiClient) {
      throw new Error('OpenAI API key not configured. Please add OPENAI_API_KEY in Admin Settings.');
    }

    // Create enriched query text including context
    let enrichedQuery = description;
    if (contextHeaders && contextHeaders.length > 0) {
      enrichedQuery = `${description} | Context: ${contextHeaders.join(' > ')}`;
    }
    
    // Get embedding for the enriched query
    const embeddingResponse = await this.openaiClient.embeddings.create({
      input: enrichedQuery,
      model: 'text-embedding-3-large',
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Get embeddings from cache or database
    let itemsWithEmbeddings: PriceItem[] = [];
    
    // First, ensure all items have embeddings (batch generate if needed)
    if (generateEmbeddings) {
      await this.generateBatchEmbeddings(priceItems, 'openai');
    }
    
    // Get embeddings from cache
    for (const item of priceItems) {
      const enrichedText = this.createEnrichedText(item);
      const cached = this.embeddingCache.get(enrichedText);
      
      if (cached && cached.provider === 'openai') {
        itemsWithEmbeddings.push({
          ...item,
          embedding: cached.embedding,
          embeddingProvider: 'openai'
        });
      } else if (item.embedding && item.embeddingProvider === 'openai') {
        // Use existing embedding but cache it with enriched text
        itemsWithEmbeddings.push(item);
        this.embeddingCache.set(enrichedText, {
          embedding: item.embedding,
          provider: 'openai'
        });
      }
    }


    if (itemsWithEmbeddings.length === 0) {
      // Fall back to local matching
      return this.localMatch(description, priceItems, contextHeaders);
    }

    // Calculate cosine similarity
    let bestMatch: PriceItem | null = null;
    let bestSimilarity = -1;

    itemsWithEmbeddings.forEach(item => {
      const similarity = this.cosineSimilarity(queryEmbedding, item.embedding!);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = item;
      }
    });

    if (!bestMatch || bestSimilarity < 0.5) {
      throw new Error('No suitable match found');
    }

    return {
      matchedItemId: bestMatch._id,
      matchedDescription: bestMatch.description,
      matchedCode: bestMatch.code,
      matchedUnit: bestMatch.unit,
      matchedRate: bestMatch.rate,
      confidence: bestSimilarity,
      method: 'OPENAI'
    };
  }

  private async hybridMatch(description: string, priceItems: PriceItem[], contextHeaders?: string[]): Promise<MatchingResult> {
    const results: MatchingResult[] = [];

    // Try local matching with context first (fastest)
    try {
      const localResult = await this.localMatch(description, priceItems, contextHeaders);
      results.push({ ...localResult, confidence: localResult.confidence * 0.7, method: 'LOCAL' }); // Weight local match lower
    } catch (error) {
      console.log('Local match failed:', error);
    }

    // For AI matching, only generate embeddings for top candidates from local match
    let candidateItems = priceItems;
    if (results.length > 0) {
      // Use local match to filter candidates - get top matches based on fuzzy matching
      const localMatches = EnhancedMatchingService.enhancedFuzzyMatch(description, priceItems, 100, contextHeaders);
      if (localMatches.length > 0) {
        // Take items with reasonable scores as candidates
        candidateItems = localMatches
          .filter(m => m.score > 50) // Only items with 50%+ fuzzy match score
          .map(m => m.item);
        
        console.log(`HYBRID: Filtered to ${candidateItems.length} candidates for AI matching (from ${priceItems.length} total)`);
      }
    }

    // Try Cohere matching only on candidates
    try {
      const cohereResult = await this.cohereMatch(description, candidateItems, false, contextHeaders);
      results.push({ ...cohereResult, method: 'COHERE' });
    } catch (error) {
      console.log('Cohere match failed:', error);
    }

    // Try OpenAI matching only on candidates
    try {
      const openaiResult = await this.openaiMatch(description, candidateItems, false, contextHeaders);
      results.push({ ...openaiResult, method: 'OPENAI' });
    } catch (error) {
      console.log('OpenAI match failed:', error);
    }

    if (results.length === 0) {
      throw new Error('No suitable match found using any method');
    }

    // Log results for debugging
    console.log(`HYBRID match results for "${description}":`, results.map(r => ({
      method: r.method || 'unknown',
      confidence: r.confidence,
      description: r.matchedDescription
    })));

    // Return the result with highest confidence, including HYBRID as the method
    const bestResult = results.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
    
    return {
      ...bestResult,
      method: 'HYBRID'
    };
  }

  private async advancedMatch(description: string, priceItems: PriceItem[], contextHeaders?: string[]): Promise<MatchingResult> {
    // Check cache first
    const cacheKey = CacheService.generateMatchKey(description, 'ADVANCED');
    const cached = matchingCache.get<MatchingResult>(cacheKey);
    if (cached) {
      return cached;
    }

    // Use multi-stage matching from enhanced service
    const matches = await EnhancedMatchingService.multiStageMatch(description, priceItems, {
      useExactMatch: true,
      useCodeMatch: true,
      useFuzzyMatch: true,
      useSemanticMatch: true,
      limit: 5
    });

    if (matches.length === 0) {
      throw new Error('No suitable match found');
    }

    const bestMatch = matches[0];
    const result: MatchingResult = {
      matchedItemId: bestMatch.item._id,
      matchedDescription: bestMatch.item.description,
      matchedCode: bestMatch.item.code || '',
      matchedUnit: bestMatch.item.unit || '',
      matchedRate: bestMatch.item.rate,
      confidence: bestMatch.score / 100,
      method: 'ADVANCED'
    };

    // Cache the result
    matchingCache.set(cacheKey, result, 3600); // 1 hour cache
    
    return result;
  }

  private extractKeywords(description: string): string[] {
    // Common construction keywords
    const importantWords = [
      'concrete', 'steel', 'rebar', 'cement', 'brick', 'block', 'pipe',
      'cable', 'wire', 'paint', 'tile', 'wood', 'glass', 'door', 'window',
      'excavation', 'foundation', 'slab', 'wall', 'ceiling', 'roof',
    ];

    const words = description.toLowerCase().split(/\s+/);
    return words.filter(word => 
      importantWords.includes(word) || word.length > 5
    );
  }

  private extractUnit(description: string): string | null {
    const unitPatterns = [
      /\b(m2|sqm|sq\.m|square meter)\b/i,
      /\b(m3|cum|cu\.m|cubic meter)\b/i,
      /\b(m|meter|metre|lm|linear meter)\b/i,
      /\b(kg|kilogram)\b/i,
      /\b(ton|tonne|mt)\b/i,
      /\b(no|nos|piece|pcs|unit)\b/i,
      /\b(l|ltr|liter|litre)\b/i,
    ];

    for (const pattern of unitPatterns) {
      const match = description.match(pattern);
      if (match) {
        return match[0].toLowerCase();
      }
    }

    return null;
  }

  private areUnitsCompatible(unit1: string, unit2: string): boolean {
    const unitGroups = [
      ['m2', 'sqm', 'sq.m', 'square meter'],
      ['m3', 'cum', 'cu.m', 'cubic meter'],
      ['m', 'meter', 'metre', 'lm', 'linear meter'],
      ['kg', 'kilogram'],
      ['ton', 'tonne', 'mt'],
      ['no', 'nos', 'piece', 'pcs', 'unit'],
      ['l', 'ltr', 'liter', 'litre'],
    ];

    const normalize = (unit: string) => unit.toLowerCase().replace(/\s+/g, '');
    const norm1 = normalize(unit1);
    const norm2 = normalize(unit2);

    // Check if units are in the same group
    for (const group of unitGroups) {
      const normalizedGroup = group.map(normalize);
      if (normalizedGroup.includes(norm1) && normalizedGroup.includes(norm2)) {
        return true;
      }
    }

    return norm1 === norm2;
  }

  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  private async localUnitMatch(description: string, priceItems: PriceItem[], contextHeaders?: string[]): Promise<MatchingResult> {
    // Check cache first
    const cacheKey = CacheService.generateMatchKey(description, 'LOCAL_UNIT');
    const cached = matchingCache.get<MatchingResult>(cacheKey);
    if (cached) {
      return cached;
    }

    // Extract unit from the description
    const queryUnit = EnhancedMatchingService.extractUnit(description);
    if (!queryUnit) {
      console.log('No unit found in query, falling back to regular local match');
      return this.localMatch(description, priceItems, contextHeaders);
    }

    const processedDescription = EnhancedMatchingService.preprocessText(description);
    const results: Array<{ item: PriceItem; score: number; unitScore: number }> = [];

    for (const item of priceItems) {
      const processedItem = EnhancedMatchingService.preprocessText(item.description);
      
      // Base fuzzy matching score
      let baseScore = fuzzball.token_set_ratio(processedDescription, processedItem);
      
      // Unit matching score with heavy weight
      let unitScore = 0;
      if (item.unit) {
        if (EnhancedMatchingService.areUnitsCompatible(queryUnit, item.unit)) {
          const conversionFactor = EnhancedMatchingService.getUnitConversionFactor(queryUnit, item.unit);
          if (conversionFactor === 1) {
            unitScore = 100; // Perfect unit match
          } else if (conversionFactor !== null) {
            unitScore = 80; // Compatible units (convertible)
          }
        } else {
          unitScore = 0; // Incompatible units - heavily penalize
          baseScore = baseScore * 0.3; // Reduce base score significantly
        }
      }

      // Extract and match keywords
      const queryKeywords = EnhancedMatchingService.extractKeywords(description);
      const itemKeywords = EnhancedMatchingService.extractKeywords(item.description);
      const commonKeywords = queryKeywords.filter(k => itemKeywords.includes(k));
      const keywordScore = Math.min(commonKeywords.length * 10, 30);

      // Calculate final score with unit priority
      // Unit matching contributes 50% of the score
      const finalScore = (unitScore * 0.5) + (baseScore * 0.3) + (keywordScore * 0.2);

      results.push({
        item,
        score: finalScore,
        unitScore
      });
    }

    // Sort by score and filter out items with incompatible units
    const sortedResults = results
      .filter(r => r.unitScore > 0 || !queryUnit) // Only include items with compatible units
      .sort((a, b) => b.score - a.score);

    if (sortedResults.length === 0) {
      // If no items with compatible units found, fall back to regular matching
      console.log('No items with compatible units found, falling back to regular local match');
      return this.localMatch(description, priceItems, contextHeaders);
    }

    const bestMatch = sortedResults[0];
    const result: MatchingResult = {
      matchedItemId: bestMatch.item._id,
      matchedDescription: bestMatch.item.description,
      matchedCode: bestMatch.item.code || '',
      matchedUnit: bestMatch.item.unit || '',
      matchedRate: bestMatch.item.rate,
      confidence: bestMatch.score / 100,
      method: 'LOCAL_UNIT'
    };

    // Cache the result
    matchingCache.set(cacheKey, result, 3600); // 1 hour cache
    
    return result;
  }

  private async hybridCategoryMatch(description: string, priceItems: PriceItem[], contextHeaders?: string[]): Promise<MatchingResult> {
    // Extract category information from the description
    const processedDescription = EnhancedMatchingService.preprocessText(description);
    const queryKeywords = EnhancedMatchingService.extractKeywords(description);
    
    // Identify potential categories from the description
    const detectedCategories = new Set<string>();
    for (const [category, keywords] of Object.entries(EnhancedMatchingService['constructionKeywords'])) {
      if (keywords.some(keyword => processedDescription.includes(keyword.toLowerCase()))) {
        detectedCategories.add(category);
      }
    }

    const results: Array<{ result: MatchingResult; categoryBonus: number }> = [];

    // Try local matching with category boost
    try {
      // First, filter items by category if detected
      let filteredItems = priceItems;
      if (detectedCategories.size > 0) {
        const categoryFilteredItems = priceItems.filter(item => 
          item.category && detectedCategories.has(item.category.toLowerCase())
        );
        if (categoryFilteredItems.length > 0) {
          filteredItems = categoryFilteredItems;
          console.log(`Filtered to ${filteredItems.length} items in categories: ${Array.from(detectedCategories).join(', ')}`);
        }
      }

      const localResult = await this.localMatch(description, filteredItems, contextHeaders);
      const matchedItem = priceItems.find(item => item._id === localResult.matchedItemId);
      
      let categoryBonus = 0;
      if (matchedItem?.category && detectedCategories.has(matchedItem.category.toLowerCase())) {
        categoryBonus = 0.3; // 30% bonus for category match
      }

      results.push({
        result: {
          ...localResult,
          confidence: Math.min(localResult.confidence + categoryBonus, 1.0)
        },
        categoryBonus
      });
    } catch (error) {
      console.log('Local match with category filter failed:', error);
    }

    // Try AI-based matching with category context
    const categoryContext = detectedCategories.size > 0 
      ? ` Category context: ${Array.from(detectedCategories).join(', ')}.`
      : '';

    // Try Cohere with category-aware query
    if (this.cohereClient) {
      try {
        const enhancedDescription = description + categoryContext;
        const cohereResult = await this.cohereMatch(enhancedDescription, priceItems, true, contextHeaders);
        const matchedItem = priceItems.find(item => item._id === cohereResult.matchedItemId);
        
        let categoryBonus = 0;
        if (matchedItem?.category && detectedCategories.has(matchedItem.category.toLowerCase())) {
          categoryBonus = 0.25; // 25% bonus for category match in AI results
        }

        results.push({
          result: {
            ...cohereResult,
            confidence: Math.min(cohereResult.confidence + categoryBonus, 1.0),
            method: 'COHERE'
          },
          categoryBonus
        });
      } catch (error) {
        console.log('Cohere match failed:', error);
      }
    }

    // Try OpenAI with category-aware query
    if (this.openaiClient) {
      try {
        const enhancedDescription = description + categoryContext;
        const openaiResult = await this.openaiMatch(enhancedDescription, priceItems, true, contextHeaders);
        const matchedItem = priceItems.find(item => item._id === openaiResult.matchedItemId);
        
        let categoryBonus = 0;
        if (matchedItem?.category && detectedCategories.has(matchedItem.category.toLowerCase())) {
          categoryBonus = 0.25; // 25% bonus for category match in AI results
        }

        results.push({
          result: {
            ...openaiResult,
            confidence: Math.min(openaiResult.confidence + categoryBonus, 1.0),
            method: 'OPENAI'
          },
          categoryBonus
        });
      } catch (error) {
        console.log('OpenAI match failed:', error);
      }
    }

    if (results.length === 0) {
      throw new Error('No suitable match found using any method');
    }

    // Log results for debugging
    console.log(`HYBRID_CATEGORY match results for "${description}":`, results.map(r => ({
      method: r.result.method || 'unknown',
      confidence: r.result.confidence,
      categoryBonus: r.categoryBonus,
      description: r.result.matchedDescription,
      category: priceItems.find(item => item._id === r.result.matchedItemId)?.category || 'none'
    })));

    // Return the result with highest confidence
    const bestResult = results.reduce((best, current) => 
      current.result.confidence > best.result.confidence ? current : best
    );
    
    return {
      ...bestResult.result,
      method: 'HYBRID_CATEGORY'
    };
  }

  async getTopMatches(
    description: string, 
    method: MatchingMethod, 
    priceItems: PriceItem[], 
    topN: number = 5,
    contextHeaders?: string[]
  ): Promise<MatchingResult[]> {
    if (method !== 'LOCAL' && method !== 'LOCAL_UNIT') {
      // For non-local methods, just return the single best match
      const bestMatch = await this.matchItem(description, method, priceItems, contextHeaders);
      return [bestMatch];
    }

    // For local matching, get multiple matches
    const fuse = new Fuse(priceItems, {
      keys: [
        { name: 'description', weight: 0.5 },
        { name: 'category', weight: 0.2 },
        { name: 'subcategory', weight: 0.1 },
        { name: 'subCategoryName', weight: 0.1 },
        { name: 'keywords', weight: 0.05 },
        { name: 'code', weight: 0.05 },
      ],
      threshold: 0.6,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });

    const searchResults = fuse.search(description).slice(0, topN);
    
    return searchResults.map(result => ({
      matchedItemId: result.item._id,
      matchedDescription: result.item.description,
      matchedCode: result.item.code,
      matchedUnit: result.item.unit,
      matchedRate: result.item.rate || 0,
      confidence: 1 - (result.score || 0),
      method: method,
    }));
  }
}