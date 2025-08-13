import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Create or update a client-specific price item
export const upsert = mutation({
  args: {
    priceListId: v.id("clientPriceLists"),
    basePriceItemId: v.id("priceItems"),
    clientId: v.id("clients"),
    rate: v.number(),
    labor_rate: v.optional(v.number()),
    material_rate: v.optional(v.number()),
    wastage_percentage: v.optional(v.number()),
    discount: v.optional(v.number()),
    markup: v.optional(v.number()),
    notes: v.optional(v.string()),
    excelRow: v.optional(v.number()),
    excelSheet: v.optional(v.string()),
    excelCellRef: v.optional(v.string()),
    excelFormula: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { userId, ...itemData } = args;
    
    // Check if item already exists for this price list and base item
    const existingItem = await ctx.db
      .query("clientPriceItems")
      .withIndex("by_price_list_item", (q) => 
        q.eq("priceListId", args.priceListId)
         .eq("basePriceItemId", args.basePriceItemId)
      )
      .first();
    
    if (existingItem) {
      // Update existing item
      await ctx.db.patch(existingItem._id, {
        ...itemData,
        lastModified: Date.now(),
        modifiedBy: userId,
      });
      return { id: existingItem._id, action: "updated" };
    } else {
      // Create new item
      const newItemId = await ctx.db.insert("clientPriceItems", {
        ...itemData,
        isActive: true,
        lastModified: Date.now(),
        modifiedBy: userId,
      });
      return { id: newItemId, action: "created" };
    }
  },
});

// Bulk upsert client price items
export const bulkUpsert = mutation({
  args: {
    priceListId: v.id("clientPriceLists"),
    clientId: v.id("clients"),
    items: v.array(v.object({
      basePriceItemId: v.id("priceItems"),
      rate: v.number(),
      labor_rate: v.optional(v.number()),
      material_rate: v.optional(v.number()),
      wastage_percentage: v.optional(v.number()),
      discount: v.optional(v.number()),
      markup: v.optional(v.number()),
      notes: v.optional(v.string()),
      excelRow: v.optional(v.number()),
      excelSheet: v.optional(v.string()),
      excelCellRef: v.optional(v.string()),
      excelFormula: v.optional(v.string()),
    })),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };
    
    for (const item of args.items) {
      try {
        // Check if item already exists
        const existingItem = await ctx.db
          .query("clientPriceItems")
          .withIndex("by_price_list_item", (q) => 
            q.eq("priceListId", args.priceListId)
             .eq("basePriceItemId", item.basePriceItemId)
          )
          .first();
        
        if (existingItem) {
          // Update existing item
          await ctx.db.patch(existingItem._id, {
            ...item,
            clientId: args.clientId,
            priceListId: args.priceListId,
            lastModified: Date.now(),
            modifiedBy: args.userId,
          });
          results.updated++;
        } else {
          // Create new item
          await ctx.db.insert("clientPriceItems", {
            ...item,
            priceListId: args.priceListId,
            clientId: args.clientId,
            isActive: true,
            lastModified: Date.now(),
            modifiedBy: args.userId,
          });
          results.created++;
        }
      } catch (error) {
        results.errors.push(`Error processing item ${item.basePriceItemId}: ${error}`);
      }
    }
    
    return results;
  },
});

// Get all price items for a specific price list
export const getByPriceList = query({
  args: { priceListId: v.id("clientPriceLists") },
  handler: async (ctx, args) => {
    const clientPriceItems = await ctx.db
      .query("clientPriceItems")
      .withIndex("by_price_list", (q) => q.eq("priceListId", args.priceListId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    
    // Enrich with base price item details
    const enrichedItems = await Promise.all(
      clientPriceItems.map(async (item) => {
        const basePriceItem = await ctx.db.get(item.basePriceItemId);
        return {
          ...item,
          baseItem: basePriceItem,
        };
      })
    );
    
    return enrichedItems;
  },
});

// Get effective price for an item for a specific client
export const getEffectivePrice = query({
  args: {
    clientId: v.id("clients"),
    priceItemId: v.id("priceItems"),
    date: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const effectiveDate = args.date || Date.now();
    
    // Get effective price list for the client
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
    
    // Get default or most recent list
    const defaultList = effectiveLists.find(pl => pl.isDefault);
    const activeList = defaultList || effectiveLists.sort((a, b) => b.createdAt - a.createdAt)[0];
    
    if (!activeList) {
      // No client-specific price list, return base price
      const basePriceItem = await ctx.db.get(args.priceItemId);
      return {
        source: "base",
        rate: basePriceItem?.rate || 0,
        priceItem: basePriceItem,
      };
    }
    
    // Look for client-specific price
    const clientPriceItem = await ctx.db
      .query("clientPriceItems")
      .withIndex("by_price_list_item", (q) => 
        q.eq("priceListId", activeList._id)
         .eq("basePriceItemId", args.priceItemId)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();
    
    if (clientPriceItem) {
      const basePriceItem = await ctx.db.get(args.priceItemId);
      return {
        source: "client",
        rate: clientPriceItem.rate,
        clientPriceItem,
        priceItem: basePriceItem,
        priceList: activeList,
      };
    }
    
    // No client-specific price, return base price
    const basePriceItem = await ctx.db.get(args.priceItemId);
    return {
      source: "base",
      rate: basePriceItem?.rate || 0,
      priceItem: basePriceItem,
    };
  },
});

// Get all client-specific prices for a base price item
export const getByBasePriceItem = query({
  args: { basePriceItemId: v.id("priceItems") },
  handler: async (ctx, args) => {
    const clientPrices = await ctx.db
      .query("clientPriceItems")
      .withIndex("by_base_item", (q) => q.eq("basePriceItemId", args.basePriceItemId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    
    // Enrich with client and price list details
    const enrichedPrices = await Promise.all(
      clientPrices.map(async (price) => {
        const client = await ctx.db.get(price.clientId);
        const priceList = await ctx.db.get(price.priceListId);
        return {
          ...price,
          clientName: client?.name || "Unknown Client",
          priceListName: priceList?.name || "Unknown Price List",
        };
      })
    );
    
    return enrichedPrices;
  },
});

// Update rates from Excel mapping
export const updateFromExcelMapping = mutation({
  args: {
    priceListId: v.id("clientPriceLists"),
    mappings: v.array(v.object({
      basePriceItemId: v.id("priceItems"),
      rate: v.number(),
      excelRow: v.number(),
      excelSheet: v.string(),
      excelCellRef: v.optional(v.string()),
      excelFormula: v.optional(v.string()),
    })),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const priceList = await ctx.db.get(args.priceListId);
    if (!priceList) {
      throw new Error("Price list not found");
    }
    
    const results = {
      updated: 0,
      created: 0,
      errors: [] as string[],
    };
    
    for (const mapping of args.mappings) {
      try {
        // Check if client price item exists
        const existingItem = await ctx.db
          .query("clientPriceItems")
          .withIndex("by_price_list_item", (q) => 
            q.eq("priceListId", args.priceListId)
             .eq("basePriceItemId", mapping.basePriceItemId)
          )
          .first();
        
        if (existingItem) {
          // Update existing item with new rate and Excel mapping
          await ctx.db.patch(existingItem._id, {
            rate: mapping.rate,
            excelRow: mapping.excelRow,
            excelSheet: mapping.excelSheet,
            excelCellRef: mapping.excelCellRef,
            excelFormula: mapping.excelFormula,
            lastModified: Date.now(),
            modifiedBy: args.userId,
          });
          results.updated++;
        } else {
          // Create new client price item
          await ctx.db.insert("clientPriceItems", {
            priceListId: args.priceListId,
            basePriceItemId: mapping.basePriceItemId,
            clientId: priceList.clientId,
            rate: mapping.rate,
            excelRow: mapping.excelRow,
            excelSheet: mapping.excelSheet,
            excelCellRef: mapping.excelCellRef,
            excelFormula: mapping.excelFormula,
            isActive: true,
            lastModified: Date.now(),
            modifiedBy: args.userId,
          });
          results.created++;
        }
      } catch (error) {
        results.errors.push(`Error updating item ${mapping.basePriceItemId}: ${error}`);
      }
    }
    
    // Update price list sync time
    await ctx.db.patch(args.priceListId, {
      lastSyncedAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    return results;
  },
});