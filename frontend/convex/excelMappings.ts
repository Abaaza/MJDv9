import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create or update Excel mapping
export const upsert = mutation({
  args: {
    priceListId: v.id("clientPriceLists"),
    priceItemId: v.id("priceItems"),
    fileName: v.string(),
    sheetName: v.string(),
    rowNumber: v.number(),
    codeColumn: v.optional(v.string()),
    descriptionColumn: v.optional(v.string()),
    unitColumn: v.optional(v.string()),
    rateColumn: v.optional(v.string()),
    originalCode: v.optional(v.string()),
    originalDescription: v.optional(v.string()),
    originalUnit: v.optional(v.string()),
    originalRate: v.optional(v.any()),
    mappingConfidence: v.number(),
    mappingMethod: v.string(),
    isVerified: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { isVerified = false, ...mappingData } = args;
    
    // Check if mapping already exists
    const existingMapping = await ctx.db
      .query("excelMappings")
      .withIndex("by_price_list", (q) => q.eq("priceListId", args.priceListId))
      .filter((q) => 
        q.and(
          q.eq(q.field("priceItemId"), args.priceItemId),
          q.eq(q.field("sheetName"), args.sheetName),
          q.eq(q.field("rowNumber"), args.rowNumber)
        )
      )
      .first();
    
    if (existingMapping) {
      // Update existing mapping
      await ctx.db.patch(existingMapping._id, {
        ...mappingData,
        isVerified,
        updatedAt: Date.now(),
      });
      return { id: existingMapping._id, action: "updated" };
    } else {
      // Create new mapping
      const newMappingId = await ctx.db.insert("excelMappings", {
        ...mappingData,
        isVerified,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { id: newMappingId, action: "created" };
    }
  },
});

// Bulk create Excel mappings
export const bulkCreate = mutation({
  args: {
    priceListId: v.id("clientPriceLists"),
    fileName: v.string(),
    mappings: v.array(v.object({
      priceItemId: v.id("priceItems"),
      sheetName: v.string(),
      rowNumber: v.number(),
      codeColumn: v.optional(v.string()),
      descriptionColumn: v.optional(v.string()),
      unitColumn: v.optional(v.string()),
      rateColumn: v.optional(v.string()),
      originalCode: v.optional(v.string()),
      originalDescription: v.optional(v.string()),
      originalUnit: v.optional(v.string()),
      originalRate: v.optional(v.any()),
      mappingConfidence: v.number(),
      mappingMethod: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };
    
    for (const mapping of args.mappings) {
      try {
        // Check if mapping exists
        const existingMapping = await ctx.db
          .query("excelMappings")
          .withIndex("by_price_list", (q) => q.eq("priceListId", args.priceListId))
          .filter((q) => 
            q.and(
              q.eq(q.field("priceItemId"), mapping.priceItemId),
              q.eq(q.field("sheetName"), mapping.sheetName),
              q.eq(q.field("rowNumber"), mapping.rowNumber)
            )
          )
          .first();
        
        if (existingMapping) {
          // Update existing
          await ctx.db.patch(existingMapping._id, {
            ...mapping,
            fileName: args.fileName,
            updatedAt: Date.now(),
          });
          results.updated++;
        } else {
          // Create new
          await ctx.db.insert("excelMappings", {
            ...mapping,
            priceListId: args.priceListId,
            fileName: args.fileName,
            isVerified: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          results.created++;
        }
      } catch (error) {
        results.errors.push(`Error processing mapping for row ${mapping.rowNumber}: ${error}`);
      }
    }
    
    return results;
  },
});

// Get all mappings for a price list
export const getByPriceList = query({
  args: { priceListId: v.id("clientPriceLists") },
  handler: async (ctx, args) => {
    const mappings = await ctx.db
      .query("excelMappings")
      .withIndex("by_price_list", (q) => q.eq("priceListId", args.priceListId))
      .collect();
    
    // Enrich with price item details
    const enrichedMappings = await Promise.all(
      mappings.map(async (mapping) => {
        const priceItem = await ctx.db.get(mapping.priceItemId);
        return {
          ...mapping,
          priceItem,
        };
      })
    );
    
    return enrichedMappings;
  },
});

// Get mappings for a specific sheet
export const getBySheet = query({
  args: {
    fileName: v.string(),
    sheetName: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("excelMappings")
      .withIndex("by_sheet", (q) => 
        q.eq("fileName", args.fileName)
         .eq("sheetName", args.sheetName)
      )
      .collect();
  },
});

// Get unmapped rows for review
export const getUnverifiedMappings = query({
  args: { 
    priceListId: v.id("clientPriceLists"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    
    const unverifiedMappings = await ctx.db
      .query("excelMappings")
      .withIndex("by_price_list", (q) => q.eq("priceListId", args.priceListId))
      .filter((q) => q.eq(q.field("isVerified"), false))
      .take(limit);
    
    // Enrich with price item details
    const enrichedMappings = await Promise.all(
      unverifiedMappings.map(async (mapping) => {
        const priceItem = await ctx.db.get(mapping.priceItemId);
        return {
          ...mapping,
          priceItem,
        };
      })
    );
    
    // Sort by confidence (lowest first for review)
    return enrichedMappings.sort((a, b) => a.mappingConfidence - b.mappingConfidence);
  },
});

// Verify a mapping
export const verifyMapping = mutation({
  args: {
    mappingId: v.id("excelMappings"),
    isVerified: v.boolean(),
    newPriceItemId: v.optional(v.id("priceItems")),
  },
  handler: async (ctx, args) => {
    const updates: any = {
      isVerified: args.isVerified,
      updatedAt: Date.now(),
    };
    
    if (args.newPriceItemId) {
      updates.priceItemId = args.newPriceItemId;
      updates.mappingMethod = "manual";
      updates.mappingConfidence = 1.0;
    }
    
    await ctx.db.patch(args.mappingId, updates);
  },
});

// Get mapping statistics
export const getMappingStats = query({
  args: { priceListId: v.id("clientPriceLists") },
  handler: async (ctx, args) => {
    const allMappings = await ctx.db
      .query("excelMappings")
      .withIndex("by_price_list", (q) => q.eq("priceListId", args.priceListId))
      .collect();
    
    const stats = {
      total: allMappings.length,
      verified: allMappings.filter(m => m.isVerified).length,
      unverified: allMappings.filter(m => !m.isVerified).length,
      byMethod: {} as Record<string, number>,
      byConfidence: {
        high: allMappings.filter(m => m.mappingConfidence >= 0.8).length,
        medium: allMappings.filter(m => m.mappingConfidence >= 0.5 && m.mappingConfidence < 0.8).length,
        low: allMappings.filter(m => m.mappingConfidence < 0.5).length,
      },
      bySheet: {} as Record<string, number>,
    };
    
    // Count by method
    for (const mapping of allMappings) {
      stats.byMethod[mapping.mappingMethod] = (stats.byMethod[mapping.mappingMethod] || 0) + 1;
      stats.bySheet[mapping.sheetName] = (stats.bySheet[mapping.sheetName] || 0) + 1;
    }
    
    return stats;
  },
});

// Delete mappings for a price list
export const deleteByPriceList = mutation({
  args: { priceListId: v.id("clientPriceLists") },
  handler: async (ctx, args) => {
    const mappings = await ctx.db
      .query("excelMappings")
      .withIndex("by_price_list", (q) => q.eq("priceListId", args.priceListId))
      .collect();
    
    for (const mapping of mappings) {
      await ctx.db.delete(mapping._id);
    }
    
    return { deleted: mappings.length };
  },
});