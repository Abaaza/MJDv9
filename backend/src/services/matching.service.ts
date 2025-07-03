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
  matchingDetails?: {
    scores?: Record<string, number>;
    factors?: string[];
    reasoning?: string;
  };
}

export class MatchingService {
  private static instance: MatchingService | null = null;
  private convex = getConvexClient();
  private cohereClient: CohereClient | null = null;
  private openaiClient: OpenAI | null = null;
  private clientsInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private embeddingCache: Map<string, { embedding: number[], provider: 'cohere' | 'openai' }> = new Map();
  
  // Enhanced caching for performance
  private priceItemsCache: { items: PriceItem[], timestamp: number } | null = null;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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
        this.cohereClient = new CohereClient({ token: cohereKey });
        console.log('Cohere client initialized successfully');
      } else {
        console.log('No Cohere API key found in settings');
      }

      if (openaiKey) {
        try {
          this.openaiClient = new OpenAI({ apiKey: openaiKey });
          console.log('OpenAI client initialized successfully with apiKey');
        } catch (error) {
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
      this.clientsInitialized = true;
    }
  }

  private async ensureClientsInitialized() {
    if (!this.clientsInitialized && this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  /**
   * Enhanced price items loading with caching
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
  private createEnrichedText(item: PriceItem): string {
    const parts = [item.description];
    
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

  async matchItem(
    description: string,
    method: 'LOCAL' | 'COHERE' | 'OPENAI' | 'HYBRID' | 'ADVANCED' | 'LOCAL_UNIT' | 'HYBRID_CATEGORY',
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
    if (['COHERE', 'OPENAI', 'HYBRID', 'HYBRID_CATEGORY'].includes(method)) {
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
          result = await this.enhancedLocalMatch(processedDescription, priceItems, contextHeaders);
          break;
        case 'LOCAL_UNIT':
          result = await this.enhancedLocalUnitMatch(processedDescription, priceItems, contextHeaders);
          break;
        case 'COHERE':
          result = await this.enhancedCohereMatch(processedDescription, priceItems, contextHeaders);
          break;
        case 'OPENAI':
          result = await this.enhancedOpenAIMatch(processedDescription, priceItems, contextHeaders);
          break;
        case 'HYBRID':
          result = await this.enhancedHybridMatch(processedDescription, priceItems, contextHeaders);
          break;
        case 'HYBRID_CATEGORY':
          result = await this.enhancedHybridCategoryMatch(processedDescription, priceItems, contextHeaders);
          break;
        case 'ADVANCED':
          result = await this.enhancedAdvancedMatch(processedDescription, priceItems, contextHeaders);
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
   * ENHANCED LOCAL MATCH - Smarter fuzzy matching with multiple strategies
   */
  private async enhancedLocalMatch(description: string, priceItems: PriceItem[], contextHeaders?: string[]): Promise<MatchingResult> {
    console.log(`[MatchingService/LOCAL] Enhanced LOCAL match with multi-strategy approach`);
    
    // Enhance description with first context header for better category understanding
    let enhancedDescription = description;
    let categoryContext = '';
    if (contextHeaders && contextHeaders.length > 0) {
      // Use the first (most immediate) context header as category context
      categoryContext = contextHeaders[0];
      enhancedDescription = `${description} [Context: ${categoryContext}]`;
      console.log(`[MatchingService/LOCAL] Using context header: "${categoryContext}"`);
    }
    
    // Check cache first
    const cacheKey = CacheService.generateMatchKey(enhancedDescription, 'LOCAL');
    const cached = matchingCache.get<MatchingResult>(cacheKey);
    if (cached) {
      return cached;
    }

    const matches: Array<{item: PriceItem, score: number, breakdown: any}> = [];
    
    // Extract key information from query and context
    const queryKeywords = EnhancedMatchingService.extractKeywords(enhancedDescription);
    const contextKeywords = categoryContext ? EnhancedMatchingService.extractKeywords(categoryContext) : [];
    const allKeywords = [...new Set([...queryKeywords, ...contextKeywords])];
    const queryUnit = this.extractUnit(description);
    const queryMaterials = this.extractMaterials(enhancedDescription);
    const querySpecs = this.extractTechnicalSpecs(enhancedDescription);
    
    for (const item of priceItems) {
      let totalScore = 0;
      const breakdown = {
        fuzzy: 0,
        keywords: 0,
        unit: 0,
        material: 0,
        specs: 0,
        category: 0
      };
      
      // 1. Enhanced fuzzy matching (40% weight)
      const fuzzyScore = Math.max(
        fuzzball.token_set_ratio(enhancedDescription.toLowerCase(), item.description.toLowerCase()),
        fuzzball.partial_ratio(enhancedDescription.toLowerCase(), item.description.toLowerCase()) * 0.9,
        fuzzball.token_sort_ratio(enhancedDescription.toLowerCase(), item.description.toLowerCase()) * 0.85
      );
      breakdown.fuzzy = fuzzyScore * 0.4;
      
      // 2. Keyword matching (20% weight) - now includes context keywords
      if (allKeywords.length > 0) {
        const itemKeywords = EnhancedMatchingService.extractKeywords(item.description);
        const matchingKeywords = allKeywords.filter(k => itemKeywords.includes(k));
        breakdown.keywords = (matchingKeywords.length / allKeywords.length) * 20;
      }
      
      // 3. Unit compatibility (15% weight)
      if (queryUnit && item.unit) {
        if (queryUnit === item.unit.toUpperCase()) {
          breakdown.unit = 15;
        } else if (this.areUnitsCompatible(queryUnit, item.unit.toUpperCase())) {
          breakdown.unit = 10;
        }
      }
      
      // 4. Material matching (10% weight)
      if (queryMaterials.length > 0) {
        const itemMaterials = this.extractMaterials(item.description);
        const matchingMaterials = queryMaterials.filter(m => itemMaterials.includes(m));
        breakdown.material = (matchingMaterials.length / queryMaterials.length) * 10;
      }
      
      // 5. Technical specs matching (10% weight)
      if (querySpecs.length > 0) {
        const itemSpecs = this.extractTechnicalSpecs(item.description);
        const matchingSpecs = querySpecs.filter(s => 
          itemSpecs.some(is => is.toLowerCase() === s.toLowerCase())
        );
        breakdown.specs = (matchingSpecs.length / querySpecs.length) * 10;
      }
      
      // 6. Category context bonus (5% weight)
      if (contextHeaders && item.category) {
        const categoryMatch = contextHeaders.some(h => 
          item.category!.toLowerCase().includes(h.toLowerCase().split(' ')[0])
        );
        breakdown.category = categoryMatch ? 5 : 0;
      }
      
      totalScore = Object.values(breakdown).reduce((a, b) => a + b, 0);
      
      if (totalScore > 30) {
        matches.push({ item, score: totalScore, breakdown });
      }
    }
    
    // Sort by score
    matches.sort((a, b) => b.score - a.score);
    
    if (matches.length === 0) {
      throw new Error('No suitable match found with LOCAL method');
    }

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
        factors: Object.entries(bestMatch.breakdown)
          .filter(([_, score]) => (score as number) > 0)
          .map(([factor]) => factor)
      }
    };

    // Cache the result
    matchingCache.set(cacheKey, result, 3600);
    
    return result;
  }

  /**
   * ENHANCED LOCAL_UNIT MATCH - Prioritizes unit compatibility with smart fallbacks
   */
  private async enhancedLocalUnitMatch(description: string, priceItems: PriceItem[], contextHeaders?: string[]): Promise<MatchingResult> {
    console.log(`[MatchingService/LOCAL_UNIT] Enhanced unit-focused matching`);
    
    // Enhance description with first context header
    let enhancedDescription = description;
    let categoryContext = '';
    if (contextHeaders && contextHeaders.length > 0) {
      categoryContext = contextHeaders[0];
      enhancedDescription = `${description} [Context: ${categoryContext}]`;
      console.log(`[MatchingService/LOCAL_UNIT] Using context header: "${categoryContext}"`);
    }
    
    // Extract unit from description
    const targetUnit = this.extractUnit(description);
    if (!targetUnit) {
      console.log(`[MatchingService/LOCAL_UNIT] No unit found in query, using enhanced local match`);
      return this.enhancedLocalMatch(description, priceItems, contextHeaders);
    }
    
    console.log(`[MatchingService/LOCAL_UNIT] Target unit: ${targetUnit}`);
    
    const matches: Array<{item: PriceItem, score: number, breakdown: any}> = [];
    
    // First pass: items with matching or compatible units
    const unitCompatibleItems = priceItems.filter(item => {
      if (!item.unit) return false;
      const itemUnit = item.unit.toUpperCase();
      return targetUnit === itemUnit || this.areUnitsCompatible(targetUnit, itemUnit);
    });
    
    console.log(`[MatchingService/LOCAL_UNIT] Found ${unitCompatibleItems.length} unit-compatible items`);
    
    // If no unit-compatible items, check all items but with penalty
    const itemsToCheck = unitCompatibleItems.length > 0 ? unitCompatibleItems : priceItems;
    const applyUnitPenalty = unitCompatibleItems.length === 0;
    
    for (const item of itemsToCheck) {
      let totalScore = 0;
      const breakdown = {
        description: 0,
        unit: 0,
        category: 0,
        keywords: 0,
        technical: 0
      };
      
      // Description matching (30% weight) - now includes context
      const descScore = fuzzball.token_set_ratio(enhancedDescription.toLowerCase(), item.description.toLowerCase());
      breakdown.description = descScore * 0.3;
      
      // Unit matching (40% weight - key differentiator)
      if (item.unit) {
        const itemUnit = item.unit.toUpperCase();
        if (targetUnit === itemUnit) {
          breakdown.unit = 40; // Perfect match
        } else if (this.areUnitsCompatible(targetUnit, itemUnit)) {
          breakdown.unit = 30; // Compatible units
        } else if (applyUnitPenalty) {
          breakdown.unit = -20; // Penalty for wrong unit
        }
      }
      
      // Category bonus (10% weight)
      if (contextHeaders && item.category) {
        const categoryMatch = contextHeaders.some(h => 
          item.category!.toLowerCase().includes(h.toLowerCase().split(' ')[0])
        );
        breakdown.category = categoryMatch ? 10 : 0;
      }
      
      // Keyword matching (10% weight) - includes context keywords
      const queryKeywords = EnhancedMatchingService.extractKeywords(enhancedDescription);
      const contextKeywords = categoryContext ? EnhancedMatchingService.extractKeywords(categoryContext) : [];
      const allKeywords = [...new Set([...queryKeywords, ...contextKeywords])];
      if (allKeywords.length > 0) {
        const itemKeywords = EnhancedMatchingService.extractKeywords(item.description);
        const matchingKeywords = allKeywords.filter(k => itemKeywords.includes(k));
        breakdown.keywords = (matchingKeywords.length / allKeywords.length) * 10;
      }
      
      // Technical matching (10% weight)
      const querySpecs = this.extractTechnicalSpecs(description);
      if (querySpecs.length > 0) {
        const itemSpecs = this.extractTechnicalSpecs(item.description);
        const matchingSpecs = querySpecs.filter(s => 
          itemSpecs.some(is => is.toLowerCase() === s.toLowerCase())
        );
        breakdown.technical = (matchingSpecs.length / querySpecs.length) * 10;
      }
      
      totalScore = Object.values(breakdown).reduce((a, b) => a + b, 0);
      
      // Only include items with positive scores
      if (totalScore > 20) {
        matches.push({ item, score: totalScore, breakdown });
      }
    }
    
    // Sort by score
    matches.sort((a, b) => b.score - a.score);
    
    if (matches.length === 0) {
      throw new Error(`No suitable match found with LOCAL_UNIT method for unit: ${targetUnit}`);
    }

    const bestMatch = matches[0];
    return {
      matchedItemId: bestMatch.item._id,
      matchedDescription: bestMatch.item.description,
      matchedCode: bestMatch.item.code || '',
      matchedUnit: bestMatch.item.unit || '',
      matchedRate: bestMatch.item.rate,
      confidence: bestMatch.score / 100,
      method: 'LOCAL_UNIT',
      matchingDetails: {
        scores: bestMatch.breakdown,
        factors: [`unit_match_${targetUnit}`],
        reasoning: `Best match for unit ${targetUnit}`
      }
    };
  }

  /**
   * ENHANCED COHERE MATCH - Advanced semantic understanding with technical focus
   */
  private async enhancedCohereMatch(description: string, priceItems: PriceItem[], contextHeaders?: string[]): Promise<MatchingResult> {
    console.log(`[MatchingService/COHERE] Enhanced Cohere semantic matching`);
    
    if (!this.cohereClient) {
      throw new Error('Cohere client not initialized. Please configure COHERE_API_KEY in application settings.');
    }

    // Build enriched query with technical context
    let enrichedQuery = description;
    let primaryContext = '';
    
    // Add hierarchical context - emphasize the first (most immediate) header
    if (contextHeaders && contextHeaders.length > 0) {
      primaryContext = contextHeaders[0];
      // For Cohere, we provide full context but emphasize the primary category
      enrichedQuery = `Primary category: ${primaryContext}. Full context: ${contextHeaders.join(' > ')}. Task: ${description}`;
      console.log(`[MatchingService/COHERE] Using primary context: "${primaryContext}"`);
    }
    
    // Extract and add technical specifications
    const specs = this.extractTechnicalSpecs(description);
    const materials = this.extractMaterials(description);
    const workTypes = this.extractWorkTypes(description);
    
    if (specs.length > 0) {
      enrichedQuery += ` | Technical specifications: ${specs.join(', ')}`;
    }
    if (materials.length > 0) {
      enrichedQuery += ` | Materials: ${materials.join(', ')}`;
    }
    if (workTypes.length > 0) {
      enrichedQuery += ` | Work types: ${workTypes.join(', ')}`;
    }
    
    console.log(`[MatchingService/COHERE] Enriched query: "${enrichedQuery.substring(0, 150)}..."`);

    // Get query embedding
    let queryEmbedding: number[];
    try {
      const response = await withRetry(
        () => this.cohereClient!.embed({
          texts: [enrichedQuery],
          model: 'embed-english-v3.0',
          inputType: 'search_query',
          truncate: 'END'
        }),
        {
          maxAttempts: 3,
          delayMs: 2000
        }
      );
      
      const embeddings = Array.isArray(response.embeddings) 
        ? response.embeddings 
        : (response.embeddings as any).float || [];
      queryEmbedding = embeddings[0];
      
      if (!queryEmbedding || queryEmbedding.length === 0) {
        throw new Error('Invalid embedding response from Cohere');
      }
    } catch (error) {
      throw new Error(`Cohere embedding generation failed: ${error.message}`);
    }

    // Ensure all price items have embeddings
    await this.ensureEmbeddings(priceItems, 'cohere');

    // Get items with embeddings
    const itemsWithEmbeddings = priceItems.filter(item => {
      const enrichedText = this.createEnrichedText(item);
      const cached = this.embeddingCache.get(enrichedText);
      return (cached && cached.provider === 'cohere') || 
             (item.embedding && item.embeddingProvider === 'cohere');
    });

    if (itemsWithEmbeddings.length === 0) {
      throw new Error('No items with Cohere embeddings found. Please regenerate embeddings.');
    }

    // Enhanced scoring with multiple factors
    const scoredMatches: Array<{
      item: PriceItem, 
      similarity: number, 
      contextBonus: number,
      technicalBonus: number,
      materialBonus: number,
      workTypeBonus: number,
      unitPenalty: number,
      finalScore: number
    }> = [];
    
    const queryUnit = this.extractUnit(description);
    
    for (const item of itemsWithEmbeddings) {
      // Get embedding
      const enrichedText = this.createEnrichedText(item);
      const cached = this.embeddingCache.get(enrichedText);
      const embedding = cached?.embedding || item.embedding!;
      
      // Calculate semantic similarity
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);
      
      // Context matching bonus (up to 10%)
      let contextBonus = 0;
      if (contextHeaders && item.category) {
        const categoryWords = item.category.toLowerCase().split(/\s+/);
        const contextWords = contextHeaders.join(' ').toLowerCase().split(/\s+/);
        const matchingWords = categoryWords.filter(w => contextWords.includes(w));
        contextBonus = (matchingWords.length / categoryWords.length) * 0.1;
      }
      
      // Technical specification bonus (up to 15%)
      let technicalBonus = 0;
      const itemSpecs = this.extractTechnicalSpecs(item.description);
      if (specs.length > 0 && itemSpecs.length > 0) {
        const matchingSpecs = specs.filter(s => 
          itemSpecs.some(is => is.toLowerCase() === s.toLowerCase())
        );
        technicalBonus = (matchingSpecs.length / specs.length) * 0.15;
      }
      
      // Material matching bonus (up to 10%)
      let materialBonus = 0;
      const itemMaterials = this.extractMaterials(item.description);
      if (materials.length > 0 && itemMaterials.length > 0) {
        const matchingMaterials = materials.filter(m => itemMaterials.includes(m));
        materialBonus = (matchingMaterials.length / materials.length) * 0.1;
      }
      
      // Work type matching bonus (up to 10%)
      let workTypeBonus = 0;
      const itemWorkTypes = this.extractWorkTypes(item.description);
      if (workTypes.length > 0 && itemWorkTypes.length > 0) {
        const matchingWorkTypes = workTypes.filter(w => itemWorkTypes.includes(w));
        workTypeBonus = (matchingWorkTypes.length / workTypes.length) * 0.1;
      }
      
      // Unit mismatch penalty (5%)
      let unitPenalty = 0;
      if (queryUnit && item.unit && !this.areUnitsCompatible(queryUnit, item.unit.toUpperCase())) {
        unitPenalty = 0.05;
      }
      
      // Calculate final score with Cohere's emphasis on semantic understanding
      const finalScore = (similarity * 0.55) + contextBonus + technicalBonus + 
                        materialBonus + workTypeBonus - unitPenalty;
      
      if (finalScore > 0.35) { // Lower threshold for better coverage
        scoredMatches.push({ 
          item, 
          similarity, 
          contextBonus,
          technicalBonus,
          materialBonus,
          workTypeBonus,
          unitPenalty,
          finalScore 
        });
      }
    }
    
    // Sort by final score
    scoredMatches.sort((a, b) => b.finalScore - a.finalScore);
    
    if (scoredMatches.length === 0) {
      throw new Error('No suitable semantic matches found with Cohere.');
    }
    
    const bestMatch = scoredMatches[0];
    
    return {
      matchedItemId: bestMatch.item._id,
      matchedDescription: bestMatch.item.description,
      matchedCode: bestMatch.item.code || '',
      matchedUnit: bestMatch.item.unit || '',
      matchedRate: bestMatch.item.rate,
      confidence: Math.min(bestMatch.finalScore, 0.99),
      method: 'COHERE',
      matchingDetails: {
        scores: {
          similarity: bestMatch.similarity,
          context: bestMatch.contextBonus,
          technical: bestMatch.technicalBonus,
          material: bestMatch.materialBonus,
          workType: bestMatch.workTypeBonus,
          unitPenalty: bestMatch.unitPenalty
        },
        factors: ['semantic', 'technical', 'contextual'],
        reasoning: `Semantic match with ${(bestMatch.similarity * 100).toFixed(1)}% similarity`
      }
    };
  }

  /**
   * ENHANCED OPENAI MATCH - Natural language understanding with work context
   */
  private async enhancedOpenAIMatch(description: string, priceItems: PriceItem[], contextHeaders?: string[]): Promise<MatchingResult> {
    console.log(`[MatchingService/OPENAI] Enhanced OpenAI semantic matching`);
    
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized. Please configure OPENAI_API_KEY in application settings.');
    }

    // Build context-aware query
    let enhancedQuery = description;
    let primaryContext = '';
    
    // Add hierarchical context - emphasize the first (most immediate) header
    if (contextHeaders && contextHeaders.length > 0) {
      primaryContext = contextHeaders[0];
      // For OpenAI, integrate context naturally into the query
      enhancedQuery = `${description} [Category: ${primaryContext}]`;
      console.log(`[MatchingService/OPENAI] Using primary context: "${primaryContext}"`);
    }
    
    // Extract work context and keywords from both description and context
    const workTypes = this.extractWorkTypes(description);
    const materials = this.extractMaterials(description);
    const patterns = this.extractPatterns(description);
    
    // Also extract from context header
    if (primaryContext) {
      const contextWorkTypes = this.extractWorkTypes(primaryContext);
      const contextMaterials = this.extractMaterials(primaryContext);
      workTypes.push(...contextWorkTypes);
      materials.push(...contextMaterials);
    }
    
    // Add work context to query
    if (workTypes.length > 0) {
      enhancedQuery += ` | Work categories: ${[...new Set(workTypes)].join(', ')}`;
    }
    if (materials.length > 0) {
      enhancedQuery += ` | Materials involved: ${[...new Set(materials)].join(', ')}`;
    }
    if (patterns.length > 0) {
      enhancedQuery += ` | Patterns: ${patterns.join(', ')}`;
    }
    if (contextHeaders && contextHeaders.length > 1) {
      enhancedQuery += ` | Full context: ${contextHeaders.join(' > ')}`;
    }

    // Get query embedding
    let queryEmbedding: number[];
    try {
      const response = await withRetry(
        () => this.openaiClient!.embeddings.create({
          model: 'text-embedding-3-large',
          input: enhancedQuery,
        }),
        {
          maxAttempts: 3,
          delayMs: 2000
        }
      );
      
      queryEmbedding = response.data[0].embedding;
      
      if (!queryEmbedding || queryEmbedding.length === 0) {
        throw new Error('Invalid embedding response from OpenAI');
      }
    } catch (error) {
      throw new Error(`OpenAI embedding generation failed: ${error.message}`);
    }

    // Ensure all price items have embeddings
    await this.ensureEmbeddings(priceItems, 'openai');

    // Get items with embeddings
    const itemsWithEmbeddings = priceItems.filter(item => {
      const enrichedText = this.createEnrichedText(item);
      const cached = this.embeddingCache.get(enrichedText);
      return (cached && cached.provider === 'openai') || 
             (item.embedding && item.embeddingProvider === 'openai');
    });

    if (itemsWithEmbeddings.length === 0) {
      throw new Error('No items with OpenAI embeddings found. Please regenerate embeddings.');
    }

    // Enhanced scoring
    const scoredMatches: Array<{
      item: PriceItem,
      similarity: number,
      workTypeBonus: number,
      patternBonus: number,
      contextBonus: number,
      unitCompatibility: number,
      finalScore: number
    }> = [];
    
    const queryUnit = this.extractUnit(description);
    
    for (const item of itemsWithEmbeddings) {
      // Get embedding
      const enrichedText = this.createEnrichedText(item);
      const cached = this.embeddingCache.get(enrichedText);
      const embedding = cached?.embedding || item.embedding!;
      
      // Calculate semantic similarity
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);
      
      // Work type matching bonus (up to 15%)
      let workTypeBonus = 0;
      const itemWorkTypes = this.extractWorkTypes(item.description);
      if (workTypes.length > 0 && itemWorkTypes.length > 0) {
        const commonWorkTypes = workTypes.filter(w => itemWorkTypes.includes(w));
        workTypeBonus = (commonWorkTypes.length / workTypes.length) * 0.15;
      }
      
      // Pattern matching bonus (up to 10%)
      let patternBonus = 0;
      const itemPatterns = this.extractPatterns(item.description);
      if (patterns.length > 0 && itemPatterns.length > 0) {
        const commonPatterns = patterns.filter(p => itemPatterns.includes(p));
        patternBonus = (commonPatterns.length / patterns.length) * 0.1;
      }
      
      // Context bonus (up to 10%)
      let contextBonus = 0;
      if (contextHeaders && item.category) {
        const relevance = this.calculateContextRelevance(contextHeaders, item.category);
        contextBonus = relevance * 0.1;
      }
      
      // Unit compatibility score (up to 10%)
      let unitCompatibility = 0;
      if (queryUnit && item.unit) {
        if (queryUnit === item.unit.toUpperCase()) {
          unitCompatibility = 0.1;
        } else if (this.areUnitsCompatible(queryUnit, item.unit.toUpperCase())) {
          unitCompatibility = 0.05;
        } else {
          unitCompatibility = -0.05; // Small penalty
        }
      }
      
      // OpenAI emphasizes natural language understanding
      const finalScore = (similarity * 0.65) + workTypeBonus + patternBonus + 
                        contextBonus + unitCompatibility;
      
      if (finalScore > 0.4) {
        scoredMatches.push({
          item,
          similarity,
          workTypeBonus,
          patternBonus,
          contextBonus,
          unitCompatibility,
          finalScore
        });
      }
    }
    
    // Sort by final score
    scoredMatches.sort((a, b) => b.finalScore - a.finalScore);
    
    if (scoredMatches.length === 0) {
      throw new Error('No suitable semantic matches found with OpenAI.');
    }
    
    const bestMatch = scoredMatches[0];
    
    return {
      matchedItemId: bestMatch.item._id,
      matchedDescription: bestMatch.item.description,
      matchedCode: bestMatch.item.code || '',
      matchedUnit: bestMatch.item.unit || '',
      matchedRate: bestMatch.item.rate,
      confidence: Math.min(bestMatch.finalScore, 0.99),
      method: 'OPENAI',
      matchingDetails: {
        scores: {
          similarity: bestMatch.similarity,
          workType: bestMatch.workTypeBonus,
          pattern: bestMatch.patternBonus,
          context: bestMatch.contextBonus,
          unit: bestMatch.unitCompatibility
        },
        factors: ['natural_language', 'work_context', 'patterns'],
        reasoning: `Natural language match with work type understanding`
      }
    };
  }

  /**
   * ENHANCED HYBRID MATCH - Intelligent ensemble with weighted voting
   */
  private async enhancedHybridMatch(description: string, priceItems: PriceItem[], contextHeaders?: string[]): Promise<MatchingResult> {
    console.log(`[MatchingService/HYBRID] Enhanced ensemble matching with intelligent voting`);
    
    // Define methods with dynamic weights based on query characteristics
    const queryUnit = this.extractUnit(description);
    const querySpecs = this.extractTechnicalSpecs(description);
    const queryMaterials = this.extractMaterials(description);
    
    // Adjust weights based on query characteristics
    const methods = [
      { 
        name: 'LOCAL', 
        weight: 0.2,
        fn: () => this.enhancedLocalMatch(description, priceItems, contextHeaders) 
      },
      { 
        name: 'LOCAL_UNIT', 
        weight: queryUnit ? 0.35 : 0.25, // Higher weight if unit is present
        fn: () => this.enhancedLocalUnitMatch(description, priceItems, contextHeaders) 
      },
      { 
        name: 'COHERE', 
        weight: querySpecs.length > 0 ? 0.3 : 0.25, // Higher for technical queries
        fn: () => this.enhancedCohereMatch(description, priceItems, contextHeaders) 
      },
      { 
        name: 'OPENAI', 
        weight: queryMaterials.length > 0 ? 0.3 : 0.25, // Higher for material queries
        fn: () => this.enhancedOpenAIMatch(description, priceItems, contextHeaders) 
      }
    ];
    
    // Execute all methods in parallel
    const promises = methods.map(async (method) => {
      try {
        const startTime = Date.now();
        const result = await method.fn();
        const duration = Date.now() - startTime;
        console.log(`[MatchingService/HYBRID] ${method.name} completed in ${duration}ms`);
        return { result, weight: method.weight, method: method.name };
      } catch (error) {
        console.log(`[MatchingService/HYBRID] ${method.name} failed:`, error.message);
        return null;
      }
    });
    
    const allResults = await Promise.all(promises);
    const validResults = allResults.filter(r => r !== null);
    
    if (validResults.length === 0) {
      throw new Error('All matching methods failed in HYBRID approach');
    }
    
    // Enhanced voting system with confidence boosting
    const votingMap = new Map<string, {
      totalScore: number,
      votes: number,
      methods: string[],
      bestResult: MatchingResult,
      consistencyBonus: number
    }>();
    
    validResults.forEach(({ result, weight, method }) => {
      if (!result) return;
      
      const key = result.matchedItemId;
      const current = votingMap.get(key);
      
      if (current) {
        // Multiple methods agreed on this item
        current.votes++;
        current.totalScore += result.confidence * weight;
        current.methods.push(method);
        
        // Keep the result with highest individual confidence
        if (result.confidence > current.bestResult.confidence) {
          current.bestResult = result;
        }
        
        // Calculate consistency bonus based on confidence similarity
        const avgConfidence = current.totalScore / current.votes;
        const confidenceDiff = Math.abs(result.confidence - avgConfidence);
        current.consistencyBonus += (1 - confidenceDiff) * 0.1;
      } else {
        votingMap.set(key, {
          totalScore: result.confidence * weight,
          votes: 1,
          methods: [method],
          bestResult: result,
          consistencyBonus: 0
        });
      }
    });
    
    // Convert to array and calculate final scores
    const votingResults = Array.from(votingMap.entries()).map(([itemId, data]) => {
      // Base score from weighted confidence
      const baseScore = data.totalScore;
      
      // Consensus bonus (20% per additional vote)
      const consensusBonus = (data.votes - 1) * 0.2;
      
      // Method diversity bonus (5% if both AI and local methods agree)
      const hasLocalMethod = data.methods.some(m => m.includes('LOCAL'));
      const hasAIMethod = data.methods.some(m => ['COHERE', 'OPENAI'].includes(m));
      const diversityBonus = (hasLocalMethod && hasAIMethod) ? 0.05 : 0;
      
      // Final voting score
      const votingScore = baseScore * (1 + consensusBonus + diversityBonus + data.consistencyBonus);
      
      return {
        itemId,
        votingScore,
        votes: data.votes,
        methods: data.methods,
        result: data.bestResult,
        consensusBonus,
        diversityBonus,
        consistencyBonus: data.consistencyBonus
      };
    });
    
    // Sort by voting score
    votingResults.sort((a, b) => b.votingScore - a.votingScore);
    
    console.log(`[MatchingService/HYBRID] Voting results:`);
    votingResults.slice(0, 3).forEach((vr, idx) => {
      console.log(`  ${idx + 1}. Score: ${vr.votingScore.toFixed(3)}, Votes: ${vr.votes}, Methods: ${vr.methods.join('+')}`);
      console.log(`     Bonuses - Consensus: ${vr.consensusBonus.toFixed(2)}, Diversity: ${vr.diversityBonus.toFixed(2)}, Consistency: ${vr.consistencyBonus.toFixed(2)}`);
    });
    
    const winner = votingResults[0];
    
    // Calculate hybrid confidence based on voting metrics
    const hybridConfidence = Math.min(
      winner.votingScore / validResults.length * (1 + winner.votes * 0.1),
      0.99
    );
    
    return {
      ...winner.result,
      confidence: hybridConfidence,
      method: 'HYBRID',
      matchingDetails: {
        scores: {
          votingScore: winner.votingScore,
          votes: winner.votes,
          consensusBonus: winner.consensusBonus,
          diversityBonus: winner.diversityBonus
        },
        factors: winner.methods,
        reasoning: `Ensemble consensus from ${winner.votes} methods: ${winner.methods.join(', ')}`
      }
    };
  }

  /**
   * ENHANCED HYBRID_CATEGORY MATCH - Category-aware matching with AI
   */
  private async enhancedHybridCategoryMatch(description: string, priceItems: PriceItem[], contextHeaders?: string[]): Promise<MatchingResult> {
    console.log(`[MatchingService/HYBRID_CATEGORY] Enhanced category-aware matching`);
    
    // Extract category information with enhanced detection
    const processedDescription = EnhancedMatchingService.preprocessText(description);
    const queryKeywords = EnhancedMatchingService.extractKeywords(description);
    
    // Include context header in category detection
    let enhancedDescription = description;
    let primaryContext = '';
    if (contextHeaders && contextHeaders.length > 0) {
      primaryContext = contextHeaders[0];
      enhancedDescription = `${description} [Context: ${primaryContext}]`;
      console.log(`[MatchingService/HYBRID_CATEGORY] Using primary context: "${primaryContext}"`);
    }
    
    // Enhanced category detection from both description and context
    const detectedCategories = new Set<string>();
    const categoryConfidence = new Map<string, number>();
    
    // Process both description and context header
    const processedEnhanced = EnhancedMatchingService.preprocessText(enhancedDescription);
    const processedContext = primaryContext ? EnhancedMatchingService.preprocessText(primaryContext) : '';
    
    for (const [category, keywords] of Object.entries(EnhancedMatchingService['constructionKeywords'])) {
      const matchingKeywords = keywords.filter(keyword => 
        processedEnhanced.includes(keyword.toLowerCase()) || 
        processedContext.includes(keyword.toLowerCase())
      );
      
      if (matchingKeywords.length > 0) {
        detectedCategories.add(category);
        // Calculate confidence based on keyword matches
        categoryConfidence.set(category, matchingKeywords.length / keywords.length);
      }
    }
    
    // If context header suggests a category, give it high priority
    if (primaryContext) {
      const contextKeywords = EnhancedMatchingService.extractKeywords(primaryContext);
      for (const keyword of contextKeywords) {
        for (const [category, catKeywords] of Object.entries(EnhancedMatchingService['constructionKeywords'])) {
          if (catKeywords.includes(keyword)) {
            detectedCategories.add(category);
            categoryConfidence.set(category, Math.max(categoryConfidence.get(category) || 0, 0.8));
          }
        }
      }
    }
    
    console.log(`[MatchingService/HYBRID_CATEGORY] Detected categories: ${Array.from(detectedCategories).join(', ')}`);
    
    // Filter items by category if detected
    let filteredItems = priceItems;
    let categoryFilterApplied = false;
    
    if (detectedCategories.size > 0) {
      const categoryFilteredItems = priceItems.filter(item => 
        item.category && detectedCategories.has(item.category.toLowerCase())
      );
      
      if (categoryFilteredItems.length > 0) {
        filteredItems = categoryFilteredItems;
        categoryFilterApplied = true;
        console.log(`[MatchingService/HYBRID_CATEGORY] Filtered to ${filteredItems.length} items in detected categories`);
      } else {
        console.log(`[MatchingService/HYBRID_CATEGORY] No items found in detected categories, using full list`);
      }
    }
    
    // Build category context for AI methods
    const categoryContext = detectedCategories.size > 0 
      ? ` Category context: ${Array.from(detectedCategories).join(', ')}.`
      : '';
    
    const results: Array<{
      result: MatchingResult;
      categoryBonus: number;
      method: string;
    }> = [];
    
    // Try multiple methods with category enhancement
    const methodPromises = [];
    
    // Enhanced LOCAL with category boost
    methodPromises.push(
      this.enhancedLocalMatch(description, filteredItems, contextHeaders)
        .then(localResult => {
          const matchedItem = priceItems.find(item => item._id === localResult.matchedItemId);
          let categoryBonus = 0;
          
          if (matchedItem?.category) {
            if (detectedCategories.has(matchedItem.category.toLowerCase())) {
              categoryBonus = 0.25 + (categoryConfidence.get(matchedItem.category.toLowerCase()) || 0) * 0.1;
            }
          }
          
          return {
            result: {
              ...localResult,
              confidence: Math.min(localResult.confidence + categoryBonus, 0.99)
            },
            categoryBonus,
            method: 'LOCAL'
          };
        })
        .catch(error => {
          console.log(`[MatchingService/HYBRID_CATEGORY] LOCAL failed:`, error.message);
          return null;
        })
    );
    
    // Try COHERE with category context if available
    if (this.cohereClient) {
      methodPromises.push(
        this.enhancedCohereMatch(description + categoryContext, filteredItems, contextHeaders)
          .then(cohereResult => {
            const matchedItem = priceItems.find(item => item._id === cohereResult.matchedItemId);
            let categoryBonus = 0;
            
            if (matchedItem?.category && detectedCategories.has(matchedItem.category.toLowerCase())) {
              categoryBonus = 0.2 + (categoryConfidence.get(matchedItem.category.toLowerCase()) || 0) * 0.15;
            }
            
            return {
              result: {
                ...cohereResult,
                confidence: Math.min(cohereResult.confidence + categoryBonus, 0.99)
              },
              categoryBonus,
              method: 'COHERE'
            };
          })
          .catch(error => {
            console.log(`[MatchingService/HYBRID_CATEGORY] COHERE failed:`, error.message);
            return null;
          })
      );
    }
    
    // Try OPENAI with category context if available
    if (this.openaiClient) {
      methodPromises.push(
        this.enhancedOpenAIMatch(description + categoryContext, filteredItems, contextHeaders)
          .then(openaiResult => {
            const matchedItem = priceItems.find(item => item._id === openaiResult.matchedItemId);
            let categoryBonus = 0;
            
            if (matchedItem?.category && detectedCategories.has(matchedItem.category.toLowerCase())) {
              categoryBonus = 0.2 + (categoryConfidence.get(matchedItem.category.toLowerCase()) || 0) * 0.15;
            }
            
            return {
              result: {
                ...openaiResult,
                confidence: Math.min(openaiResult.confidence + categoryBonus, 0.99)
              },
              categoryBonus,
              method: 'OPENAI'
            };
          })
          .catch(error => {
            console.log(`[MatchingService/HYBRID_CATEGORY] OPENAI failed:`, error.message);
            return null;
          })
      );
    }
    
    // Wait for all methods to complete
    const allResults = await Promise.all(methodPromises);
    const validResults = allResults.filter(r => r !== null);
    
    if (validResults.length === 0) {
      throw new Error('No suitable match found using HYBRID_CATEGORY method');
    }
    
    // Log results for debugging
    console.log(`[MatchingService/HYBRID_CATEGORY] Results from ${validResults.length} methods:`);
    validResults.forEach(r => {
      console.log(`  ${r.method}: Confidence ${r.result.confidence.toFixed(3)}, Category Bonus: ${r.categoryBonus.toFixed(3)}`);
    });
    
    // Return the result with highest confidence
    const bestResult = validResults.reduce((best, current) => 
      current.result.confidence > best.result.confidence ? current : best
    );
    
    return {
      ...bestResult.result,
      method: 'HYBRID_CATEGORY',
      matchingDetails: {
        scores: {
          baseConfidence: bestResult.result.confidence - bestResult.categoryBonus,
          categoryBonus: bestResult.categoryBonus,
          finalConfidence: bestResult.result.confidence
        },
        factors: [
          `category_filter_${categoryFilterApplied ? 'applied' : 'skipped'}`,
          `detected_categories_${Array.from(detectedCategories).join('_')}`,
          `method_${bestResult.method}`
        ],
        reasoning: `Category-aware match with ${Array.from(detectedCategories).join(', ')} detection`
      }
    };
  }

  /**
   * ENHANCED ADVANCED MATCH - Multi-stage pattern matching with ML
   */
  private async enhancedAdvancedMatch(description: string, priceItems: PriceItem[], contextHeaders?: string[]): Promise<MatchingResult> {
    console.log(`[MatchingService/ADVANCED] Enhanced multi-stage pattern matching`);
    
    // Check cache first
    const cacheKey = CacheService.generateMatchKey(description, 'ADVANCED');
    const cached = matchingCache.get<MatchingResult>(cacheKey);
    if (cached) {
      return cached;
    }

    // Enhance description with context header
    let enhancedDescription = description;
    let primaryContext = '';
    if (contextHeaders && contextHeaders.length > 0) {
      primaryContext = contextHeaders[0];
      enhancedDescription = `${description} [Context: ${primaryContext}]`;
      console.log(`[MatchingService/ADVANCED] Using primary context: "${primaryContext}"`);
    }
    
    // Multi-stage matching with scores
    const stages: Array<{item: PriceItem, score: number, stage: string, details: any}> = [];
    
    // Stage 1: Code matching (95-100 points)
    const codePatterns = [
      /\b[A-Z]{2,3}\d{2,4}\b/,  // Standard codes
      /\b\d{2,3}-\d{2,3}\b/,    // Numeric codes
      /\b[A-Z]\.\d{2}\.\d{2}\b/ // Dot-separated codes
    ];
    
    let codeExtracted: string | null = null;
    for (const pattern of codePatterns) {
      const match = enhancedDescription.match(pattern);
      if (match) {
        codeExtracted = match[0];
        break;
      }
    }
    
    if (codeExtracted) {
      console.log(`[MatchingService/ADVANCED] Stage 1: Code pattern detected: ${codeExtracted}`);
      
      const codeMatches = priceItems.filter(item => {
        if (!item.code) return false;
        const itemCode = item.code.toUpperCase();
        const queryCode = codeExtracted!.toUpperCase();
        
        // Exact match
        if (itemCode === queryCode) return true;
        // Partial match
        if (itemCode.includes(queryCode) || queryCode.includes(itemCode)) return true;
        // Fuzzy code match
        return fuzzball.ratio(itemCode, queryCode) > 80;
      });
      
      codeMatches.forEach(item => {
        const exactMatch = item.code?.toUpperCase() === codeExtracted!.toUpperCase();
        stages.push({ 
          item, 
          score: exactMatch ? 100 : 95, 
          stage: 'CODE_MATCH',
          details: { code: codeExtracted, exact: exactMatch }
        });
      });
    }
    
    // Stage 2: Advanced pattern matching (80-90 points)
    // Extract patterns from both description and context
    const materials = this.extractMaterials(enhancedDescription);
    const specs = this.extractTechnicalSpecs(enhancedDescription);
    const patterns = this.extractPatterns(enhancedDescription);
    const workTypes = this.extractWorkTypes(enhancedDescription);
    
    // Also extract from context header alone for additional keywords
    if (primaryContext) {
      const contextMaterials = this.extractMaterials(primaryContext);
      const contextWorkTypes = this.extractWorkTypes(primaryContext);
      materials.push(...contextMaterials);
      workTypes.push(...contextWorkTypes);
    }
    
    // Deduplicate arrays
    const uniqueMaterials = [...new Set(materials)];
    const uniqueSpecs = [...new Set(specs)];
    const uniquePatterns = [...new Set(patterns)];
    const uniqueWorkTypes = [...new Set(workTypes)];
    
    if (uniqueMaterials.length > 0 || uniqueSpecs.length > 0 || uniquePatterns.length > 0) {
      console.log(`[MatchingService/ADVANCED] Stage 2: Advanced pattern matching`);
      console.log(`  Materials: ${uniqueMaterials.join(', ')}`);
      console.log(`  Specs: ${uniqueSpecs.join(', ')}`);
      console.log(`  Patterns: ${uniquePatterns.join(', ')}`);
      
      priceItems.forEach(item => {
        let patternScore = 0;
        const matchDetails = {
          materials: [],
          specs: [],
          patterns: [],
          workTypes: []
        };
        
        // Material matching (up to 30 points)
        if (uniqueMaterials.length > 0) {
          const itemMaterials = this.extractMaterials(item.description);
          const matchingMaterials = uniqueMaterials.filter(m => itemMaterials.includes(m));
          matchDetails.materials = matchingMaterials;
          patternScore += (matchingMaterials.length / uniqueMaterials.length) * 30;
        }
        
        // Specification matching (up to 30 points)
        if (uniqueSpecs.length > 0) {
          const itemSpecs = this.extractTechnicalSpecs(item.description);
          const matchingSpecs = uniqueSpecs.filter(s => 
            itemSpecs.some(is => is.toLowerCase() === s.toLowerCase())
          );
          matchDetails.specs = matchingSpecs;
          patternScore += (matchingSpecs.length / uniqueSpecs.length) * 30;
        }
        
        // Pattern matching (up to 20 points)
        if (uniquePatterns.length > 0) {
          const itemPatterns = this.extractPatterns(item.description);
          const matchingPatterns = uniquePatterns.filter(p => itemPatterns.includes(p));
          matchDetails.patterns = matchingPatterns;
          patternScore += (matchingPatterns.length / uniquePatterns.length) * 20;
        }
        
        // Work type matching (up to 20 points)
        if (uniqueWorkTypes.length > 0) {
          const itemWorkTypes = this.extractWorkTypes(item.description);
          const matchingWorkTypes = uniqueWorkTypes.filter(w => itemWorkTypes.includes(w));
          matchDetails.workTypes = matchingWorkTypes;
          patternScore += (matchingWorkTypes.length / uniqueWorkTypes.length) * 20;
        }
        
        if (patternScore > 40 && !stages.some(s => s.item._id === item._id)) {
          stages.push({
            item,
            score: 80 + (patternScore / 100) * 10, // 80-90 range
            stage: 'PATTERN_MATCH',
            details: matchDetails
          });
        }
      });
    }
    
    // Stage 3: Enhanced fuzzy matching with context (60-80 points)
    const fuzzyMatches = await this.enhancedLocalMatch(description, priceItems, contextHeaders)
      .then(result => {
        const item = priceItems.find(i => i._id === result.matchedItemId);
        if (item) {
          return [{
            item,
            score: result.confidence * 100,
            details: result.matchingDetails
          }];
        }
        return [];
      })
      .catch(() => []);
    
    fuzzyMatches.forEach(match => {
      if (!stages.some(s => s.item._id === match.item._id)) {
        stages.push({
          item: match.item,
          score: Math.min(match.score * 0.8, 80), // Cap at 80
          stage: 'FUZZY_MATCH',
          details: match.details
        });
      }
    });
    
    // Stage 4: Semantic fallback if AI clients available (50-70 points)
    if ((this.cohereClient || this.openaiClient) && stages.length < 5) {
      try {
        const semanticResult = this.cohereClient 
          ? await this.enhancedCohereMatch(description, priceItems, contextHeaders)
          : await this.enhancedOpenAIMatch(description, priceItems, contextHeaders);
        
        const semanticItem = priceItems.find(i => i._id === semanticResult.matchedItemId);
        if (semanticItem && !stages.some(s => s.item._id === semanticItem._id)) {
          stages.push({
            item: semanticItem,
            score: Math.min(semanticResult.confidence * 70, 70),
            stage: 'SEMANTIC_MATCH',
            details: semanticResult.matchingDetails
          });
        }
      } catch (error) {
        console.log(`[MatchingService/ADVANCED] Semantic fallback failed:`, error.message);
      }
    }
    
    // Sort by score and remove duplicates
    const uniqueStages = new Map<string, typeof stages[0]>();
    stages.forEach(stage => {
      const existing = uniqueStages.get(stage.item._id);
      if (!existing || stage.score > existing.score) {
        uniqueStages.set(stage.item._id, stage);
      }
    });
    
    const finalStages = Array.from(uniqueStages.values())
      .sort((a, b) => b.score - a.score);
    
    console.log(`[MatchingService/ADVANCED] Final results by stage:`);
    finalStages.slice(0, 5).forEach((stage, idx) => {
      console.log(`  ${idx + 1}. Score: ${stage.score.toFixed(1)}, Stage: ${stage.stage}`);
      console.log(`     Item: ${stage.item.description.substring(0, 60)}...`);
    });
    
    if (finalStages.length === 0) {
      throw new Error('No suitable match found with ADVANCED method');
    }

    const bestMatch = finalStages[0];
    const result: MatchingResult = {
      matchedItemId: bestMatch.item._id,
      matchedDescription: bestMatch.item.description,
      matchedCode: bestMatch.item.code || '',
      matchedUnit: bestMatch.item.unit || '',
      matchedRate: bestMatch.item.rate,
      confidence: bestMatch.score / 100,
      method: 'ADVANCED',
      matchingDetails: {
        scores: { [bestMatch.stage.toLowerCase()]: bestMatch.score },
        factors: [bestMatch.stage],
        reasoning: `Matched via ${bestMatch.stage} with score ${bestMatch.score.toFixed(1)}`
      }
    };

    // Cache the result
    matchingCache.set(cacheKey, result, 3600);
    
    return result;
  }

  /**
   * Ensure all price items have embeddings for the specified provider
   */
  private async ensureEmbeddings(priceItems: PriceItem[], provider: 'cohere' | 'openai') {
    const itemsNeedingEmbeddings = priceItems.filter(item => {
      const enrichedText = this.createEnrichedText(item);
      const cached = this.embeddingCache.get(enrichedText);
      return !cached && (!item.embedding || item.embeddingProvider !== provider);
    });

    if (itemsNeedingEmbeddings.length === 0) {
      return;
    }

    console.log(`[MatchingService] Generating ${provider} embeddings for ${itemsNeedingEmbeddings.length} items`);
    
    // Batch generate embeddings
    await this.generateBatchEmbeddings(itemsNeedingEmbeddings, provider);
  }

  /**
   * Generate embeddings in batches for multiple items
   */
  async generateBatchEmbeddings(priceItems: PriceItem[], provider: 'cohere' | 'openai') {
    const batchSize = provider === 'cohere' ? 96 : 100; // API limits
    const batches: PriceItem[][] = [];
    
    for (let i = 0; i < priceItems.length; i += batchSize) {
      batches.push(priceItems.slice(i, i + batchSize));
    }
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const texts = batch.map(item => this.createEnrichedText(item));
      
      try {
        if (provider === 'cohere' && this.cohereClient) {
          const response = await withRetry(
            () => this.cohereClient!.embed({
              texts,
              model: 'embed-english-v3.0',
              inputType: 'search_document',
              truncate: 'END'
            }),
            {
              maxAttempts: 3,
              delayMs: 2000
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
              maxAttempts: 3,
              delayMs: 2000
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
        
        // Add delay between batches
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Failed to generate ${provider} embeddings for batch ${i + 1}:`, error);
        throw error;
      }
    }
  }

  // Helper methods

  private areUnitsCompatible(unit1: string, unit2: string): boolean {
    const compatibleGroups = [
      ['M', 'M1', 'LM', 'RM', 'RMT'],
      ['M2', 'SQM', 'SM', 'SQ.M', 'SQMT'],
      ['M3', 'CUM', 'CM', 'CU.M', 'CUMT', 'CBM'],
      ['ITEM', 'NO', 'NOS', 'EA', 'EACH', 'PC', 'PCS', 'UNIT'],
      ['KG', 'KGS', 'KILOGRAM'],
      ['TON', 'TONS', 'MT', 'TONNE'],
      ['L', 'LTR', 'LITER', 'LITRE'],
      ['BAG', 'BAGS'],
      ['SET', 'SETS']
    ];
    
    for (const group of compatibleGroups) {
      if (group.includes(unit1) && group.includes(unit2)) {
        return true;
      }
    }
    
    return false;
  }

  private extractTechnicalSpecs(description: string): string[] {
    const specs: string[] = [];
    
    // Extract dimensions
    const dimensionPattern = /\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*(?:mm|cm|m|in|ft)?/gi;
    const dimensions = description.match(dimensionPattern);
    if (dimensions) specs.push(...dimensions);
    
    // Extract measurements with units
    const measurementPattern = /\d+(?:\.\d+)?\s*(?:mm|cm|m|km|in|ft|yd|kg|g|ton|l|ml|gal)\b/gi;
    const measurements = description.match(measurementPattern);
    if (measurements) specs.push(...measurements.filter(m => !dimensions?.includes(m)));
    
    // Extract grades and classes
    const gradePattern = /\b(?:grade|class|type|category)\s+[A-Z0-9]+\b/gi;
    const grades = description.match(gradePattern);
    if (grades) specs.push(...grades);
    
    // Extract standards
    const standardPattern = /\b(?:BS|ISO|DIN|ASTM|EN|IS)\s*\d+(?:[-:]\d+)?\b/gi;
    const standards = description.match(standardPattern);
    if (standards) specs.push(...standards);
    
    // Extract ratios
    const ratioPattern = /\d+:\d+(?::\d+)?/g;
    const ratios = description.match(ratioPattern);
    if (ratios) specs.push(...ratios);
    
    return [...new Set(specs)];
  }

  private extractWorkTypes(description: string): string[] {
    const workTypes: string[] = [];
    const desc = description.toLowerCase();
    
    const workPatterns = {
      excavation: ['excavat', 'dig', 'trench', 'earthwork'],
      concrete: ['concrete', 'cement', 'mortar', 'grout', 'rcc', 'pcc'],
      steel: ['steel', 'iron', 'metal', 'rebar', 'reinforcement'],
      masonry: ['brick', 'block', 'stone', 'masonry', 'wall'],
      carpentry: ['wood', 'timber', 'carpent', 'joiner', 'shuttering'],
      plumbing: ['pipe', 'plumb', 'drain', 'water', 'sewage', 'sanitary'],
      electrical: ['electric', 'wire', 'cable', 'conduit', 'wiring'],
      painting: ['paint', 'coat', 'primer', 'emulsion', 'enamel'],
      roofing: ['roof', 'tile', 'shingle', 'gutter', 'waterproof'],
      insulation: ['insulat', 'thermal', 'acoustic', 'soundproof'],
      demolition: ['demoli', 'remov', 'strip', 'dismantle', 'break'],
      flooring: ['floor', 'tile', 'marble', 'granite', 'vitrified'],
      plastering: ['plaster', 'render', 'skim', 'stucco'],
      fabrication: ['fabricat', 'weld', 'cut', 'bend', 'assembly']
    };
    
    for (const [workType, keywords] of Object.entries(workPatterns)) {
      if (keywords.some(keyword => desc.includes(keyword))) {
        workTypes.push(workType);
      }
    }
    
    return workTypes;
  }

  private extractUnit(description: string): string | undefined {
    // Enhanced unit extraction with more patterns
    const unitPatterns = [
      /\b(M3|M2|M|ITEM|NO|m3|m2|m|item|no)\b/i,
      /\b(SQM|sqm|CUM|cum|LM|lm|RM|rm)\b/i,
      /\b(EA|ea|PC|pc|PCS|pcs|UNIT|unit)\b/i,
      /\b(TON|ton|KG|kg|KGS|kgs|MT|mt)\b/i,
      /\b(L|l|LTR|ltr|LITER|liter|LITRE|litre)\b/i,
      /\b(BAG|bag|BAGS|bags|SET|set|SETS|sets)\b/i,
      /\b(CFT|cft|SFT|sft|RFT|rft)\b/i
    ];
    
    for (const pattern of unitPatterns) {
      const match = description.match(pattern);
      if (match) {
        return match[1].toUpperCase();
      }
    }
    
    return undefined;
  }

  private extractMaterials(description: string): string[] {
    const materials: string[] = [];
    const desc = description.toLowerCase();
    
    const materialPatterns = [
      // Concrete materials
      'concrete', 'cement', 'mortar', 'grout', 'admixture',
      // Metals
      'steel', 'iron', 'aluminum', 'copper', 'brass', 'zinc',
      // Masonry
      'brick', 'block', 'stone', 'marble', 'granite', 'sandstone', 'limestone',
      // Wood
      'wood', 'timber', 'plywood', 'mdf', 'particle board', 'veneer',
      // Glass
      'glass', 'glazing', 'mirror',
      // Plastics
      'pvc', 'plastic', 'polymer', 'hdpe', 'upvc', 'polythene',
      // Ceramics
      'ceramic', 'tile', 'porcelain', 'vitrified',
      // Finishing
      'gypsum', 'plaster', 'putty', 'primer',
      // Road materials
      'asphalt', 'bitumen', 'tar',
      // Aggregates
      'sand', 'gravel', 'aggregate', 'chips', 'dust'
    ];
    
    materialPatterns.forEach(material => {
      if (desc.includes(material)) {
        materials.push(material);
      }
    });
    
    return [...new Set(materials)];
  }

  private extractPatterns(description: string): string[] {
    const patterns: string[] = [];
    
    // Size patterns
    if (/\d+\s*(?:mm|cm|m|inch|ft)/.test(description)) {
      patterns.push('SIZE_PATTERN');
    }
    
    // Ratio patterns
    if (/\d+:\d+(?::\d+)?/.test(description)) {
      patterns.push('RATIO_PATTERN');
    }
    
    // Thickness patterns
    if (/\b(?:thick|thickness|depth|height)\b/i.test(description)) {
      patterns.push('DIMENSION_PATTERN');
    }
    
    // Action patterns
    if (/\b(?:install|fix|lay|apply|mount|erect|construct)\b/i.test(description)) {
      patterns.push('INSTALLATION_PATTERN');
    }
    
    if (/\b(?:supply|provide|deliver|procure)\b/i.test(description)) {
      patterns.push('SUPPLY_PATTERN');
    }
    
    if (/\b(?:excavat|dig|cut|trench)\b/i.test(description)) {
      patterns.push('EXCAVATION_PATTERN');
    }
    
    if (/\b(?:finish|polish|paint|coat)\b/i.test(description)) {
      patterns.push('FINISHING_PATTERN');
    }
    
    // Quality patterns
    if (/\b(?:grade|class|quality|standard|specification)\b/i.test(description)) {
      patterns.push('QUALITY_PATTERN');
    }
    
    return patterns;
  }

  private calculateContextRelevance(contextHeaders: string[], category: string): number {
    if (!contextHeaders || contextHeaders.length === 0 || !category) {
      return 0;
    }
    
    const categoryWords = category.toLowerCase().split(/\s+/);
    const contextWords = contextHeaders.join(' ').toLowerCase().split(/\s+/);
    
    let matchCount = 0;
    for (const categoryWord of categoryWords) {
      if (contextWords.some(contextWord => 
        contextWord === categoryWord || 
        contextWord.includes(categoryWord) || 
        categoryWord.includes(contextWord)
      )) {
        matchCount++;
      }
    }
    
    return matchCount / categoryWords.length;
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

  async getTopMatches(
    description: string, 
    method: 'LOCAL' | 'COHERE' | 'OPENAI' | 'HYBRID' | 'ADVANCED' | 'LOCAL_UNIT' | 'HYBRID_CATEGORY', 
    priceItems: PriceItem[], 
    topN: number = 5,
    contextHeaders?: string[]
  ): Promise<MatchingResult[]> {
    if (method !== 'LOCAL' && method !== 'LOCAL_UNIT') {
      // For non-local methods, just return the single best match
      const bestMatch = await this.matchItem(description, method, priceItems, contextHeaders);
      return [bestMatch];
    }

    // For local matching, get multiple matches using our enhanced methods
    const allMatches: MatchingResult[] = [];
    
    try {
      // Process all items and collect scores
      for (const item of priceItems) {
        const mockDescription = item.description;
        
        // Create a temporary match result by matching against itself
        const tempMatch = method === 'LOCAL' 
          ? await this.enhancedLocalMatch(mockDescription, [item], contextHeaders)
          : await this.enhancedLocalUnitMatch(mockDescription, [item], contextHeaders);
        
        // Now match the query against this specific item
        const actualMatch = method === 'LOCAL'
          ? await this.enhancedLocalMatch(description, [item], contextHeaders)
          : await this.enhancedLocalUnitMatch(description, [item], contextHeaders);
        
        if (actualMatch.confidence > 0.3) {
          allMatches.push(actualMatch);
        }
      }
      
      // Sort by confidence and return top N
      allMatches.sort((a, b) => b.confidence - a.confidence);
      return allMatches.slice(0, topN);
      
    } catch (error) {
      console.error(`Error in getTopMatches: ${error.message}`);
      
      // Fallback to Fuse.js for basic fuzzy matching
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
        matchedCode: result.item.code || '',
        matchedUnit: result.item.unit || '',
        matchedRate: result.item.rate || 0,
        confidence: 1 - (result.score || 0),
        method: method,
      }));
    }
  }
}