import { getConvexClient } from '../config/convex';
import { api } from '../lib/convex-api';
import { MatchingService } from './matching.service';
import * as fuzz from 'fuzzball';

interface MatchingPattern {
  _id: string;
  originalDescription: string;
  originalUnit?: string;
  originalCategory?: string;
  originalSubcategory?: string;
  originalContextHeaders?: string[];
  matchedItemId: string;
  matchedDescription: string;
  matchedCode?: string;
  matchedUnit?: string;
  matchedRate: number;
  embedding?: number[];
  embeddingProvider?: 'cohere' | 'openai';
  matchConfidence: number;
  usageCount: number;
  lastUsedAt: number;
}

interface MatchResult {
  matchedItemId: string;
  matchedDescription: string;
  matchedCode: string;
  matchedUnit: string;
  matchedRate: number;
  confidence: number;
  method: string;
  patternId?: string;
  isLearnedMatch?: boolean;
}

export class LearningMatcherService {
  private static instance: LearningMatcherService;
  private convex = getConvexClient();
  private matchingService = MatchingService.getInstance();
  private patternCache: Map<string, MatchingPattern[]> = new Map();
  private CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private lastCacheUpdate = 0;

  static getInstance(): LearningMatcherService {
    if (!LearningMatcherService.instance) {
      LearningMatcherService.instance = new LearningMatcherService();
    }
    return LearningMatcherService.instance;
  }

  /**
   * Main matching method with learning capability
   */
  async matchWithLearning(
    description: string,
    method: 'LOCAL' | 'COHERE' | 'OPENAI' | 'COHERE_RERANK' | 'QWEN' | 'QWEN_RERANK',
    providedPriceItems?: any[],
    contextHeaders?: string[],
    userId?: string,
    jobId?: string,
    projectId?: string
  ): Promise<MatchResult> {
    console.log('[LearningMatcher] Starting match with learning:', {
      description: description.substring(0, 50) + '...',
      method,
      contextHeaders,
    });

    // Step 1: Check for similar patterns from previous manual edits
    const learnedMatch = await this.findLearnedMatch(
      description,
      contextHeaders,
      providedPriceItems
    );

    if (learnedMatch && learnedMatch.confidence > 0.85) {
      console.log('[LearningMatcher] Found high-confidence learned match:', {
        confidence: learnedMatch.confidence,
        description: learnedMatch.matchedDescription.substring(0, 50) + '...',
      });

      // Update pattern usage
      if (learnedMatch.patternId) {
        await this.convex.mutation(api.matchingPatterns.updatePatternUsage, {
          id: learnedMatch.patternId as any,
        });
      }

      // Mark as learned match and keep original method
      learnedMatch.isLearnedMatch = true;
      learnedMatch.method = method; // Keep the original method (OPENAI, COHERE, LOCAL)
      return learnedMatch;
    }

    // Step 2: Use regular matching if no good learned match
    const regularMatch = await this.matchingService.matchItem(
      description,
      method,
      providedPriceItems,
      contextHeaders
    );

    // Step 3: If learned match exists but with lower confidence, blend the results
    if (learnedMatch && learnedMatch.confidence > 0.6) {
      const blendedConfidence = (learnedMatch.confidence * 0.3 + regularMatch.confidence * 0.7);
      
      // Use learned match if it's significantly better
      if (learnedMatch.confidence > regularMatch.confidence + 0.2) {
        console.log('[LearningMatcher] Using learned match over regular match');
        return {
          ...learnedMatch,
          confidence: blendedConfidence,
          method: method, // Keep original method
          isLearnedMatch: true, // Mark as learned
        };
      }
    }

    return {
      ...regularMatch,
      method: regularMatch.method || method
    };
  }

  /**
   * Find a match from previously learned patterns
   */
  private async findLearnedMatch(
    description: string,
    contextHeaders?: string[],
    providedPriceItems?: any[]
  ): Promise<MatchResult | null> {
    try {
      // Extract unit from description
      const queryUnit = this.matchingService.extractUnit(description);
      const category = contextHeaders?.[0];
      const subcategory = contextHeaders?.[1];

      // Find similar patterns from database
      const patterns = await this.convex.query(api.matchingPatterns.findSimilarPatterns, {
        description,
        unit: queryUnit,
        category,
        subcategory,
        contextHeaders,
        limit: 5,
      });

      if (!patterns || patterns.length === 0) {
        return null;
      }

      // Calculate similarity scores for each pattern
      const scoredPatterns = patterns.map((pattern: any) => {
        let score = 0;

        // Text similarity (40% weight)
        const textSimilarity = fuzz.token_set_ratio(
          description.toLowerCase(),
          pattern.originalDescription.toLowerCase()
        ) / 100;
        score += textSimilarity * 0.4;

        // Unit match (30% weight)
        if (queryUnit && pattern.originalUnit) {
          const normalizedQuery = this.matchingService.normalizeUnit(queryUnit);
          const normalizedPattern = this.matchingService.normalizeUnit(pattern.originalUnit);
          if (normalizedQuery === normalizedPattern) {
            score += 0.3;
          }
        }

        // Context match (20% weight)
        if (category && pattern.originalCategory) {
          if (category.toLowerCase() === pattern.originalCategory.toLowerCase()) {
            score += 0.1;
          }
        }
        if (subcategory && pattern.originalSubcategory) {
          if (subcategory.toLowerCase() === pattern.originalSubcategory.toLowerCase()) {
            score += 0.1;
          }
        }

        // Pattern confidence and usage (10% weight)
        const usageScore = Math.min(pattern.usageCount / 10, 1) * 0.05;
        const confidenceScore = pattern.matchConfidence * 0.05;
        score += usageScore + confidenceScore;

        // If we have embeddings, calculate cosine similarity
        if (pattern.embedding && providedPriceItems) {
          // This would require generating embedding for current description
          // For now, we'll skip this as it requires async operation
        }

        return { pattern, score };
      });

      // Sort by score and get best match
      scoredPatterns.sort((a, b) => b.score - a.score);
      const bestMatch = scoredPatterns[0];

      if (bestMatch.score < 0.6) {
        return null;
      }

      // Get the matched price item details
      const priceItem = providedPriceItems?.find(
        item => item._id === bestMatch.pattern.matchedItemId
      );

      if (!priceItem) {
        // If we don't have the price item in cache, fetch it
        const fetchedItem = await this.convex.query(api.priceItems.getById, {
          id: bestMatch.pattern.matchedItemId as any,
        });
        
        if (!fetchedItem) {
          return null;
        }

        return {
          matchedItemId: bestMatch.pattern.matchedItemId,
          matchedDescription: bestMatch.pattern.matchedDescription,
          matchedCode: bestMatch.pattern.matchedCode || '',
          matchedUnit: bestMatch.pattern.matchedUnit || '',
          matchedRate: bestMatch.pattern.matchedRate,
          confidence: bestMatch.score,
          method: 'LEARNED',
          patternId: bestMatch.pattern._id,
          isLearnedMatch: true,
        };
      }

      return {
        matchedItemId: priceItem._id,
        matchedDescription: priceItem.description,
        matchedCode: priceItem.code || '',
        matchedUnit: priceItem.unit || '',
        matchedRate: priceItem.rate,
        confidence: bestMatch.score,
        method: 'LEARNED',
        patternId: bestMatch.pattern._id,
        isLearnedMatch: true,
      };
    } catch (error) {
      console.error('[LearningMatcher] Error finding learned match:', error);
      return null;
    }
  }

  /**
   * Record a manual edit as a learning pattern
   */
  async recordManualEdit(
    originalDescription: string,
    matchedItemId: string,
    matchedItem: any,
    confidence: number,
    contextHeaders?: string[],
    userId?: string,
    jobId?: string,
    projectId?: string,
    embedding?: number[],
    embeddingProvider?: 'cohere' | 'openai'
  ): Promise<void> {
    try {
      const queryUnit = this.matchingService.extractUnit(originalDescription);
      const category = contextHeaders?.[0];
      const subcategory = contextHeaders?.[1];

      await this.convex.mutation(api.matchingPatterns.recordPattern, {
        originalDescription,
        originalUnit: queryUnit,
        originalCategory: category,
        originalSubcategory: subcategory,
        originalContextHeaders: contextHeaders,
        matchedItemId: matchedItemId as any,
        matchedDescription: matchedItem.description,
        matchedCode: matchedItem.code,
        matchedUnit: matchedItem.unit,
        matchedRate: matchedItem.rate,
        embedding,
        embeddingProvider,
        matchConfidence: confidence,
        userId: userId as any,
        jobId: jobId as any,
        projectId: projectId as any,
      });

      // Clear cache to ensure fresh data
      this.patternCache.clear();
      
      console.log('[LearningMatcher] Recorded manual edit as pattern:', {
        originalDescription: originalDescription.substring(0, 50) + '...',
        matchedDescription: matchedItem.description.substring(0, 50) + '...',
      });
    } catch (error) {
      console.error('[LearningMatcher] Error recording manual edit:', error);
    }
  }

  /**
   * Calculate similarity between two embeddings
   */
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

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Batch match items with learning
   */
  async batchMatchWithLearning(
    items: Array<{ description: string; contextHeaders?: string[] }>,
    method: string,
    providedPriceItems?: any[],
    userId?: string,
    jobId?: string,
    projectId?: string
  ): Promise<MatchResult[]> {
    const results: MatchResult[] = [];

    for (const item of items) {
      const match = await this.matchWithLearning(
        item.description,
        method as any,
        providedPriceItems,
        item.contextHeaders,
        userId,
        jobId,
        projectId
      );
      results.push(match);
    }

    return results;
  }

  /**
   * Get statistics about learned patterns
   */
  async getPatternStatistics(): Promise<{
    totalPatterns: number;
    averageConfidence: number;
    mostUsedPatterns: any[];
  }> {
    try {
      const patterns = await this.convex.query(api.matchingPatterns.getTopPatterns, {
        limit: 100,
      });

      if (!patterns || patterns.length === 0) {
        return {
          totalPatterns: 0,
          averageConfidence: 0,
          mostUsedPatterns: [],
        };
      }

      const totalConfidence = patterns.reduce(
        (sum: number, p: any) => sum + p.matchConfidence,
        0
      );

      return {
        totalPatterns: patterns.length,
        averageConfidence: totalConfidence / patterns.length,
        mostUsedPatterns: patterns.slice(0, 10),
      };
    } catch (error) {
      console.error('[LearningMatcher] Error getting pattern statistics:', error);
      return {
        totalPatterns: 0,
        averageConfidence: 0,
        mostUsedPatterns: [],
      };
    }
  }
}