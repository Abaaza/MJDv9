import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";

export const create = mutation({
  args: {
    id: v.string(),
    code: v.optional(v.string()),
    ref: v.optional(v.string()),
    description: v.string(),
    keywords: v.optional(v.array(v.string())),
    // Construction-specific fields
    material_type: v.optional(v.string()),
    material_grade: v.optional(v.string()),
    material_size: v.optional(v.string()),
    material_finish: v.optional(v.string()),
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
    work_type: v.optional(v.string()),
    brand: v.optional(v.string()),
    unit: v.optional(v.string()),
    rate: v.number(),
    labor_rate: v.optional(v.number()),
    material_rate: v.optional(v.number()),
    wastage_percentage: v.optional(v.number()),
    // Supplier info
    supplier: v.optional(v.string()),
    location: v.optional(v.string()),
    availability: v.optional(v.string()),
    remark: v.optional(v.string()),
    // Legacy fields
    subCategoryCode: v.optional(v.string()),
    subCategoryName: v.optional(v.string()),
    sub_category: v.optional(v.string()),
    type: v.optional(v.string()),
    vehicle_type: v.optional(v.string()),
    vendor: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { userId, ...itemData } = args;
    const priceItemId = await ctx.db.insert("priceItems", {
      ...itemData,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: userId,
    });
    return priceItemId;
  },
});

export const update = mutation({
  args: {
    _id: v.id("priceItems"),
    id: v.optional(v.string()),
    code: v.optional(v.string()),
    ref: v.optional(v.string()),
    description: v.optional(v.string()),
    keywords: v.optional(v.array(v.string())),
    // Construction-specific fields
    material_type: v.optional(v.string()),
    material_grade: v.optional(v.string()),
    material_size: v.optional(v.string()),
    material_finish: v.optional(v.string()),
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
    work_type: v.optional(v.string()),
    brand: v.optional(v.string()),
    unit: v.optional(v.string()),
    rate: v.optional(v.number()),
    labor_rate: v.optional(v.number()),
    material_rate: v.optional(v.number()),
    wastage_percentage: v.optional(v.number()),
    // Supplier info
    supplier: v.optional(v.string()),
    location: v.optional(v.string()),
    availability: v.optional(v.string()),
    remark: v.optional(v.string()),
    // Legacy fields
    subCategoryCode: v.optional(v.string()),
    subCategoryName: v.optional(v.string()),
    sub_category: v.optional(v.string()),
    type: v.optional(v.string()),
    vehicle_type: v.optional(v.string()),
    vendor: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { _id, ...updates } = args;
    await ctx.db.patch(_id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

export const getActive = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("priceItems")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
  },
});

export const getActivePaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("priceItems")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getAll = query({
  handler: async (ctx) => {
    return await ctx.db.query("priceItems").collect();
  },
});

export const getAllPaginated = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("priceItems")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("priceItems")
      .withIndex("by_item_id", (q) => q.eq("id", args.id))
      .first();
  },
});

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("priceItems")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
  },
});

export const getByCategory = query({
  args: { category: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("priceItems")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .collect();
  },
});

export const getByCategoryPaginated = query({
  args: { 
    category: v.string(),
    paginationOpts: paginationOptsValidator 
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("priceItems")
      .withIndex("by_category", (q) => q.eq("category", args.category))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const updateEmbedding = mutation({
  args: {
    _id: v.id("priceItems"),
    embedding: v.array(v.number()),
    embeddingProvider: v.union(v.literal("cohere"), v.literal("openai")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args._id, {
      embedding: args.embedding,
      embeddingProvider: args.embeddingProvider,
      updatedAt: Date.now(),
    });
  },
});

export const searchPriceItems = query({
  args: {
    query: v.string(),
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    
    let results = await ctx.db
      .query("priceItems")
      .withSearchIndex("search_price_items", (q) => {
        let search = q.search("description", args.query);
        
        if (args.category) {
          search = search.eq("category", args.category);
        }
        
        if (args.subcategory) {
          search = search.eq("subcategory", args.subcategory);
        }
        
        return search.eq("isActive", true);
      })
      .take(limit);
    
    return results;
  },
});

export const searchPriceItemsPaginated = query({
  args: {
    query: v.string(),
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    let queryBuilder = ctx.db
      .query("priceItems")
      .withSearchIndex("search_price_items", (q) => {
        let search = q.search("description", args.query);
        
        if (args.category) {
          search = search.eq("category", args.category);
        }
        
        if (args.subcategory) {
          search = search.eq("subcategory", args.subcategory);
        }
        
        return search.eq("isActive", true);
      });
    
    return await queryBuilder.paginate(args.paginationOpts);
  },
});

export const bulkImport = mutation({
  args: {
    items: v.array(
      v.object({
        id: v.string(),
        code: v.optional(v.string()),
        ref: v.optional(v.string()),
        description: v.string(),
        keywords: v.optional(v.array(v.string())),
        // Construction-specific fields
        material_type: v.optional(v.string()),
        material_grade: v.optional(v.string()),
        material_size: v.optional(v.string()),
        material_finish: v.optional(v.string()),
        category: v.optional(v.string()),
        subcategory: v.optional(v.string()),
        work_type: v.optional(v.string()),
        brand: v.optional(v.string()),
        unit: v.optional(v.string()),
        rate: v.number(),
        labor_rate: v.optional(v.number()),
        material_rate: v.optional(v.number()),
        wastage_percentage: v.optional(v.number()),
        // Supplier info
        supplier: v.optional(v.string()),
        location: v.optional(v.string()),
        availability: v.optional(v.string()),
        remark: v.optional(v.string()),
      })
    ),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    };
    
    // Process items in smaller batches to avoid query limits
    const batchSize = 5; // Reduced to avoid rate limits
    for (let i = 0; i < args.items.length; i += batchSize) {
      const batch = args.items.slice(i, i + batchSize);
      
      for (const item of batch) {
        try {
          // Skip check for existing item to avoid query limits
          // Just try to insert, and handle duplicates
          const existing = null; // Temporarily disable existence check
          
          if (false) { // Temporarily disable update logic
            // Check if any field has changed
            const hasChanges = Object.keys(item).some(key => {
              return item[key as keyof typeof item] !== existing[key as keyof typeof existing];
            });
            
            if (hasChanges) {
              // Update existing item
              await ctx.db.patch(existing._id, {
                ...item,
                updatedAt: Date.now(),
              });
              results.updated++;
            } else {
              results.skipped++;
            }
          } else {
            // Create new item
            await ctx.db.insert("priceItems", {
              ...item,
              isActive: true,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              createdBy: args.userId as any,
            });
            results.created++;
          }
        } catch (error: any) {
          results.errors.push(`Item ${item.id}: ${error.message}`);
        }
      }
      
      // Log progress
      const processed = Math.min(i + batchSize, args.items.length);
      console.log(`Processed ${processed}/${args.items.length} items`);
    }
    
    return results;
  },
});

export const bulkCreate = mutation({
  args: {
    items: v.array(
      v.object({
        id: v.string(),
        code: v.optional(v.string()),
        ref: v.optional(v.string()),
        description: v.string(),
        keywords: v.optional(v.array(v.string())),
        subCategoryCode: v.optional(v.string()),
        subCategoryName: v.optional(v.string()),
        vehicle_make: v.optional(v.string()),
        vehicle_model: v.optional(v.string()),
        year: v.optional(v.string()),
        part_type: v.optional(v.string()),
        position: v.optional(v.string()),
        operation: v.optional(v.string()),
        damage_type: v.optional(v.string()),
        repair_type: v.optional(v.string()),
        rate: v.number(),
        category: v.optional(v.string()),
        remark: v.optional(v.string()),
        sub_category: v.optional(v.string()),
        subcategory: v.optional(v.string()),
        type: v.optional(v.string()),
        vehicle_type: v.optional(v.string()),
        vendor: v.optional(v.string()),
        unit: v.optional(v.string()),
      })
    ),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const results = [];
    for (const item of args.items) {
      const priceItemId = await ctx.db.insert("priceItems", {
        ...item,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: args.userId,
      });
      results.push(priceItemId);
    }
    return results;
  },
});

export const deactivate = mutation({
  args: { _id: v.id("priceItems") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args._id, {
      isActive: false,
      updatedAt: Date.now(),
    });
  },
});

export const deleteItem = mutation({
  args: { _id: v.id("priceItems") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args._id);
  },
});

export const getCount = query({
  handler: async (ctx) => {
    const items = await ctx.db.query("priceItems").collect();
    return items.length;
  },
});

export const getActiveCount = query({
  handler: async (ctx) => {
    const items = await ctx.db
      .query("priceItems")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    return items.length;
  },
});

export const getStats = query({
  handler: async (ctx) => {
    const allItems = await ctx.db
      .query("priceItems")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    
    // Get unique categories
    const categories = [...new Set(allItems.map(item => item.category).filter(Boolean))];
    
    // Count incomplete items
    const incompleteCount = allItems.filter(item => 
      !item.category || !item.subcategory || !item.rate || !item.unit || !item.description
    ).length;
    
    // Get last updated timestamp
    const lastUpdated = allItems.reduce((latest, item) => {
      return item.updatedAt > latest ? item.updatedAt : latest;
    }, 0);
    
    return {
      totalItems: allItems.length,
      categories,
      incompleteCount,
      lastUpdated,
    };
  },
});