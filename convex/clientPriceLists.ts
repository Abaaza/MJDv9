import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create a new client price list
export const create = mutation({
  args: {
    clientId: v.id("clients"),
    name: v.string(),
    description: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    effectiveFrom: v.optional(v.number()),
    effectiveTo: v.optional(v.number()),
    sourceFileName: v.optional(v.string()),
    sourceFileUrl: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { userId, isDefault = false, ...priceListData } = args;
    
    // If setting as default, unset other defaults for this client
    if (isDefault) {
      const existingDefaults = await ctx.db
        .query("clientPriceLists")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
        .filter((q) => q.eq(q.field("isDefault"), true))
        .collect();
      
      for (const existing of existingDefaults) {
        await ctx.db.patch(existing._id, { isDefault: false });
      }
    }
    
    const priceListId = await ctx.db.insert("clientPriceLists", {
      ...priceListData,
      isDefault,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: userId,
    });
    
    return priceListId;
  },
});

// Update a client price list
export const update = mutation({
  args: {
    id: v.id("clientPriceLists"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
    effectiveFrom: v.optional(v.number()),
    effectiveTo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, isDefault, ...updates } = args;
    
    // If setting as default, unset other defaults for this client
    if (isDefault === true) {
      const priceList = await ctx.db.get(id);
      if (priceList) {
        const existingDefaults = await ctx.db
          .query("clientPriceLists")
          .withIndex("by_client", (q) => q.eq("clientId", priceList.clientId))
          .filter((q) => q.eq(q.field("isDefault"), true))
          .collect();
        
        for (const existing of existingDefaults) {
          if (existing._id !== id) {
            await ctx.db.patch(existing._id, { isDefault: false });
          }
        }
      }
    }
    
    await ctx.db.patch(id, {
      ...updates,
      ...(isDefault !== undefined && { isDefault }),
      updatedAt: Date.now(),
    });
  },
});

// Get all price lists for a client
export const getByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("clientPriceLists")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
  },
});

// Get default price list for a client
export const getDefaultForClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("clientPriceLists")
      .withIndex("by_client_default", (q) => 
        q.eq("clientId", args.clientId).eq("isDefault", true)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();
  },
});

// Get effective price list for a client at a specific date
export const getEffectiveForClient = query({
  args: { 
    clientId: v.id("clients"),
    date: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const effectiveDate = args.date || Date.now();
    
    const priceLists = await ctx.db
      .query("clientPriceLists")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    
    // Filter by effective dates
    const effectiveLists = priceLists.filter(pl => {
      const isAfterStart = !pl.effectiveFrom || pl.effectiveFrom <= effectiveDate;
      const isBeforeEnd = !pl.effectiveTo || pl.effectiveTo >= effectiveDate;
      return isAfterStart && isBeforeEnd;
    });
    
    // Return default if exists, otherwise the most recent
    const defaultList = effectiveLists.find(pl => pl.isDefault);
    if (defaultList) return defaultList;
    
    // Return the most recently created effective list
    return effectiveLists.sort((a, b) => b.createdAt - a.createdAt)[0] || null;
  },
});

// Get a single price list by ID
export const getById = query({
  args: { id: v.id("clientPriceLists") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Sync price list from Excel file
export const syncFromExcel = mutation({
  args: {
    priceListId: v.id("clientPriceLists"),
    sourceFileUrl: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.priceListId, {
      sourceFileUrl: args.sourceFileUrl,
      updatedAt: Date.now(),
    });
    
    return { success: true };
  },
});

// Get all active price lists
export const getAllActive = query({
  handler: async (ctx) => {
    const priceLists = await ctx.db
      .query("clientPriceLists")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    
    // Get client names for each price list
    const enrichedLists = await Promise.all(
      priceLists.map(async (pl) => {
        const client = await ctx.db.get(pl.clientId);
        return {
          ...pl,
          clientName: client?.name || "Unknown Client",
        };
      })
    );
    
    return enrichedLists;
  },
});

// Delete a price list (soft delete)
export const deletePriceList = mutation({
  args: { id: v.id("clientPriceLists") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      isActive: false,
      updatedAt: Date.now(),
    });
    
    // Also deactivate all associated client price items
    const clientPriceItems = await ctx.db
      .query("clientPriceItems")
      .withIndex("by_price_list", (q) => q.eq("priceListId", args.id))
      .collect();
    
    for (const item of clientPriceItems) {
      await ctx.db.patch(item._id, {
        isActive: false,
        lastModified: Date.now(),
      });
    }
  },
});

