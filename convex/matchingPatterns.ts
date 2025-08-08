import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const recordPattern = mutation({
  args: {
    originalDescription: v.string(),
    originalUnit: v.optional(v.string()),
    originalCategory: v.optional(v.string()),
    originalSubcategory: v.optional(v.string()),
    originalContextHeaders: v.optional(v.array(v.string())),
    matchedItemId: v.id("priceItems"),
    matchedDescription: v.string(),
    matchedCode: v.optional(v.string()),
    matchedUnit: v.optional(v.string()),
    matchedRate: v.number(),
    embedding: v.optional(v.array(v.number())),
    embeddingProvider: v.optional(v.union(v.literal("cohere"), v.literal("openai"))),
    matchConfidence: v.number(),
    userId: v.id("users"),
    jobId: v.optional(v.id("aiMatchingJobs")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const existingPattern = await ctx.db
      .query("matchingPatterns")
      .withIndex("by_description", (q) => q.eq("originalDescription", args.originalDescription))
      .filter((q) => q.eq(q.field("matchedItemId"), args.matchedItemId))
      .first();

    if (existingPattern) {
      await ctx.db.patch(existingPattern._id, {
        usageCount: existingPattern.usageCount + 1,
        lastUsedAt: Date.now(),
        matchConfidence: Math.max(existingPattern.matchConfidence, args.matchConfidence),
        embedding: args.embedding || existingPattern.embedding,
        embeddingProvider: args.embeddingProvider || existingPattern.embeddingProvider,
      });
      return existingPattern._id;
    } else {
      return await ctx.db.insert("matchingPatterns", {
        originalDescription: args.originalDescription,
        originalUnit: args.originalUnit,
        originalCategory: args.originalCategory,
        originalSubcategory: args.originalSubcategory,
        originalContextHeaders: args.originalContextHeaders,
        matchedItemId: args.matchedItemId,
        matchedDescription: args.matchedDescription,
        matchedCode: args.matchedCode,
        matchedUnit: args.matchedUnit,
        matchedRate: args.matchedRate,
        embedding: args.embedding,
        embeddingProvider: args.embeddingProvider,
        matchConfidence: args.matchConfidence,
        usageCount: 1,
        lastUsedAt: Date.now(),
        createdAt: Date.now(),
        createdBy: args.userId,
        jobId: args.jobId,
        projectId: args.projectId,
        isActive: true,
      });
    }
  },
});

export const findSimilarPatterns = query({
  args: {
    description: v.string(),
    unit: v.optional(v.string()),
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
    contextHeaders: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;
    
    const patterns = await ctx.db
      .query("matchingPatterns")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .order("desc")
      .take(1000);

    const scoredPatterns = patterns.map((pattern) => {
      let score = 0;
      
      const descWords = args.description.toLowerCase().split(/\s+/);
      const patternWords = pattern.originalDescription.toLowerCase().split(/\s+/);
      const commonWords = descWords.filter(word => patternWords.includes(word));
      score += (commonWords.length / Math.max(descWords.length, patternWords.length)) * 50;
      
      if (args.unit && pattern.originalUnit) {
        if (args.unit.toLowerCase() === pattern.originalUnit.toLowerCase()) {
          score += 30;
        }
      }
      
      if (args.category && pattern.originalCategory) {
        if (args.category.toLowerCase() === pattern.originalCategory.toLowerCase()) {
          score += 15;
        }
      }
      
      if (args.subcategory && pattern.originalSubcategory) {
        if (args.subcategory.toLowerCase() === pattern.originalSubcategory.toLowerCase()) {
          score += 15;
        }
      }
      
      score += Math.min(pattern.usageCount * 2, 20);
      
      score *= pattern.matchConfidence;
      
      return { pattern, score };
    });

    return scoredPatterns
      .filter(p => p.score > 30)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(p => p.pattern);
  },
});

export const getPatternById = query({
  args: { id: v.id("matchingPatterns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const updatePatternUsage = mutation({
  args: {
    id: v.id("matchingPatterns"),
  },
  handler: async (ctx, args) => {
    const pattern = await ctx.db.get(args.id);
    if (pattern) {
      await ctx.db.patch(args.id, {
        usageCount: pattern.usageCount + 1,
        lastUsedAt: Date.now(),
      });
    }
  },
});

export const deactivatePattern = mutation({
  args: {
    id: v.id("matchingPatterns"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      isActive: false,
    });
  },
});

export const getTopPatterns = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;
    return await ctx.db
      .query("matchingPatterns")
      .withIndex("by_usage")
      .order("desc")
      .take(limit);
  },
});