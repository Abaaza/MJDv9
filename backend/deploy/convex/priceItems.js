"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateEmbedding = exports.getItemsForEmbedding = exports.getCategorySubcategories = exports.getCategories = exports.createBatch = exports.deleteBatch = exports.deleteItem = exports.setActive = exports.search = exports.getPaginated = exports.getByIds = exports.getById = exports.getActive = exports.getAll = exports.update = exports.create = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
const server_2 = require("convex/server");
exports.create = (0, server_1.mutation)({
    args: {
        id: values_1.v.string(),
        code: values_1.v.optional(values_1.v.string()),
        ref: values_1.v.optional(values_1.v.string()),
        description: values_1.v.string(),
        keywords: values_1.v.optional(values_1.v.array(values_1.v.string())),
        // Construction-specific fields
        material_type: values_1.v.optional(values_1.v.string()),
        material_grade: values_1.v.optional(values_1.v.string()),
        material_size: values_1.v.optional(values_1.v.string()),
        material_finish: values_1.v.optional(values_1.v.string()),
        category: values_1.v.optional(values_1.v.string()),
        subcategory: values_1.v.optional(values_1.v.string()),
        work_type: values_1.v.optional(values_1.v.string()),
        brand: values_1.v.optional(values_1.v.string()),
        unit: values_1.v.optional(values_1.v.string()),
        rate: values_1.v.number(),
        labor_rate: values_1.v.optional(values_1.v.number()),
        material_rate: values_1.v.optional(values_1.v.number()),
        wastage_percentage: values_1.v.optional(values_1.v.number()),
        // Supplier info
        supplier: values_1.v.optional(values_1.v.string()),
        location: values_1.v.optional(values_1.v.string()),
        availability: values_1.v.optional(values_1.v.string()),
        remark: values_1.v.optional(values_1.v.string()),
        // Legacy fields
        subCategoryCode: values_1.v.optional(values_1.v.string()),
        subCategoryName: values_1.v.optional(values_1.v.string()),
        sub_category: values_1.v.optional(values_1.v.string()),
        type: values_1.v.optional(values_1.v.string()),
        vehicle_type: values_1.v.optional(values_1.v.string()),
        vendor: values_1.v.optional(values_1.v.string()),
        userId: values_1.v.id("users"),
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
exports.update = (0, server_1.mutation)({
    args: {
        id: values_1.v.id("priceItems"),
        code: values_1.v.optional(values_1.v.string()),
        ref: values_1.v.optional(values_1.v.string()),
        description: values_1.v.optional(values_1.v.string()),
        keywords: values_1.v.optional(values_1.v.array(values_1.v.string())),
        // Construction-specific fields
        material_type: values_1.v.optional(values_1.v.string()),
        material_grade: values_1.v.optional(values_1.v.string()),
        material_size: values_1.v.optional(values_1.v.string()),
        material_finish: values_1.v.optional(values_1.v.string()),
        category: values_1.v.optional(values_1.v.string()),
        subcategory: values_1.v.optional(values_1.v.string()),
        work_type: values_1.v.optional(values_1.v.string()),
        brand: values_1.v.optional(values_1.v.string()),
        unit: values_1.v.optional(values_1.v.string()),
        rate: values_1.v.optional(values_1.v.number()),
        labor_rate: values_1.v.optional(values_1.v.number()),
        material_rate: values_1.v.optional(values_1.v.number()),
        wastage_percentage: values_1.v.optional(values_1.v.number()),
        // Supplier info
        supplier: values_1.v.optional(values_1.v.string()),
        location: values_1.v.optional(values_1.v.string()),
        availability: values_1.v.optional(values_1.v.string()),
        remark: values_1.v.optional(values_1.v.string()),
        // Legacy fields
        subCategoryCode: values_1.v.optional(values_1.v.string()),
        subCategoryName: values_1.v.optional(values_1.v.string()),
        sub_category: values_1.v.optional(values_1.v.string()),
        type: values_1.v.optional(values_1.v.string()),
        vehicle_type: values_1.v.optional(values_1.v.string()),
        vendor: values_1.v.optional(values_1.v.string()),
        // Metadata
        isActive: values_1.v.optional(values_1.v.boolean()),
    },
    handler: async (ctx, { id, ...updates }) => {
        await ctx.db.patch(id, {
            ...updates,
            updatedAt: Date.now(),
        });
    },
});
exports.getAll = (0, server_1.query)({
    handler: async (ctx) => {
        return await ctx.db
            .query("priceItems")
            .filter((q) => q.eq(q.field("isActive"), true))
            .collect();
    },
});
exports.getActive = (0, server_1.query)({
    handler: async (ctx) => {
        return await ctx.db
            .query("priceItems")
            .filter((q) => q.eq(q.field("isActive"), true))
            .collect();
    },
});
exports.getById = (0, server_1.query)({
    args: { id: values_1.v.id("priceItems") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});
exports.getByIds = (0, server_1.query)({
    args: { ids: values_1.v.array(values_1.v.id("priceItems")) },
    handler: async (ctx, args) => {
        const items = [];
        for (const id of args.ids) {
            const item = await ctx.db.get(id);
            if (item) {
                items.push(item);
            }
        }
        return items;
    },
});
exports.getPaginated = (0, server_1.query)({
    args: {
        paginationOpts: server_2.paginationOptsValidator,
        searchQuery: values_1.v.optional(values_1.v.string()),
        category: values_1.v.optional(values_1.v.string()),
        subcategory: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        let query = ctx.db.query("priceItems").filter((q) => q.eq(q.field("isActive"), true));
        // Apply filters if provided
        if (args.category) {
            query = query.filter((q) => q.eq(q.field("category"), args.category));
        }
        if (args.subcategory) {
            query = query.filter((q) => q.eq(q.field("subcategory"), args.subcategory));
        }
        return await query.paginate(args.paginationOpts);
    },
});
// Optimized search query
exports.search = (0, server_1.query)({
    args: {
        query: values_1.v.string(),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        const searchQuery = args.query.toLowerCase().trim();
        const limit = args.limit || 20;
        if (searchQuery.length < 2) {
            return [];
        }
        // Get all active items
        const allItems = await ctx.db
            .query("priceItems")
            .filter((q) => q.eq(q.field("isActive"), true))
            .collect();
        // Score each item based on search relevance
        const scoredItems = allItems.map(item => {
            let score = 0;
            const description = (item.description || '').toLowerCase();
            const code = (item.code || '').toLowerCase();
            const category = (item.category || '').toLowerCase();
            // Exact matches get highest score
            if (description === searchQuery || code === searchQuery) {
                score = 100;
            }
            // Starts with gets high score
            else if (description.startsWith(searchQuery) || code.startsWith(searchQuery)) {
                score = 80;
            }
            // Word boundary matches
            else if (description.includes(' ' + searchQuery) || description.includes(searchQuery + ' ')) {
                score = 60;
            }
            // Contains match
            else if (description.includes(searchQuery) || code.includes(searchQuery)) {
                score = 40;
            }
            // Category match
            else if (category.includes(searchQuery)) {
                score = 30;
            }
            // Check other fields
            else {
                const otherFields = [
                    item.subcategory,
                    item.material_type,
                    item.brand,
                    item.supplier,
                ].filter(Boolean).join(' ').toLowerCase();
                if (otherFields.includes(searchQuery)) {
                    score = 20;
                }
            }
            return { item, score };
        });
        // Filter out non-matches and sort by score
        const matches = scoredItems
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(({ item }) => item);
        return matches;
    },
});
exports.setActive = (0, server_1.mutation)({
    args: {
        id: values_1.v.id("priceItems"),
        isActive: values_1.v.boolean(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, {
            isActive: args.isActive,
            updatedAt: Date.now(),
        });
    },
});
exports.deleteItem = (0, server_1.mutation)({
    args: { id: values_1.v.id("priceItems") },
    handler: async (ctx, args) => {
        // Instead of deleting, we'll mark as inactive
        await ctx.db.patch(args.id, {
            isActive: false,
            updatedAt: Date.now(),
        });
    },
});
exports.deleteBatch = (0, server_1.mutation)({
    args: { ids: values_1.v.array(values_1.v.id("priceItems")) },
    handler: async (ctx, args) => {
        for (const id of args.ids) {
            await ctx.db.patch(id, {
                isActive: false,
                updatedAt: Date.now(),
            });
        }
    },
});
exports.createBatch = (0, server_1.mutation)({
    args: {
        items: values_1.v.array(values_1.v.object({
            id: values_1.v.string(),
            code: values_1.v.optional(values_1.v.string()),
            ref: values_1.v.optional(values_1.v.string()),
            description: values_1.v.string(),
            keywords: values_1.v.optional(values_1.v.array(values_1.v.string())),
            material_type: values_1.v.optional(values_1.v.string()),
            material_grade: values_1.v.optional(values_1.v.string()),
            material_size: values_1.v.optional(values_1.v.string()),
            material_finish: values_1.v.optional(values_1.v.string()),
            category: values_1.v.optional(values_1.v.string()),
            subcategory: values_1.v.optional(values_1.v.string()),
            work_type: values_1.v.optional(values_1.v.string()),
            brand: values_1.v.optional(values_1.v.string()),
            unit: values_1.v.optional(values_1.v.string()),
            rate: values_1.v.number(),
            labor_rate: values_1.v.optional(values_1.v.number()),
            material_rate: values_1.v.optional(values_1.v.number()),
            wastage_percentage: values_1.v.optional(values_1.v.number()),
            supplier: values_1.v.optional(values_1.v.string()),
            location: values_1.v.optional(values_1.v.string()),
            availability: values_1.v.optional(values_1.v.string()),
            remark: values_1.v.optional(values_1.v.string()),
            subCategoryCode: values_1.v.optional(values_1.v.string()),
            subCategoryName: values_1.v.optional(values_1.v.string()),
            sub_category: values_1.v.optional(values_1.v.string()),
            type: values_1.v.optional(values_1.v.string()),
            vehicle_type: values_1.v.optional(values_1.v.string()),
            vendor: values_1.v.optional(values_1.v.string()),
        })),
        userId: values_1.v.id("users"),
    },
    handler: async (ctx, { items, userId }) => {
        const created = [];
        for (const item of items) {
            const id = await ctx.db.insert("priceItems", {
                ...item,
                isActive: true,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                createdBy: userId,
            });
            created.push(id);
        }
        return created;
    },
});
exports.getCategories = (0, server_1.query)({
    handler: async (ctx) => {
        const items = await ctx.db
            .query("priceItems")
            .filter((q) => q.eq(q.field("isActive"), true))
            .collect();
        const categories = new Set();
        items.forEach(item => {
            if (item.category) {
                categories.add(item.category);
            }
        });
        return Array.from(categories).sort();
    },
});
exports.getCategorySubcategories = (0, server_1.query)({
    handler: async (ctx) => {
        const items = await ctx.db
            .query("priceItems")
            .filter((q) => q.eq(q.field("isActive"), true))
            .collect();
        const categorySubcategories = {};
        items.forEach(item => {
            if (item.category && item.subcategory) {
                if (!categorySubcategories[item.category]) {
                    categorySubcategories[item.category] = [];
                }
                if (!categorySubcategories[item.category].includes(item.subcategory)) {
                    categorySubcategories[item.category].push(item.subcategory);
                }
            }
        });
        // Sort subcategories within each category
        Object.keys(categorySubcategories).forEach(category => {
            categorySubcategories[category].sort();
        });
        return categorySubcategories;
    },
});
// Internal query for getting items with embeddings
exports.getItemsForEmbedding = (0, server_1.internalQuery)({
    args: {
        provider: values_1.v.union(values_1.v.literal("cohere"), values_1.v.literal("openai")),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        const query = ctx.db
            .query("priceItems")
            .filter((q) => q.eq(q.field("isActive"), true));
        const items = await query.collect();
        // Filter items that don't have embeddings or have embeddings from a different provider
        const itemsNeedingEmbedding = items.filter(item => !item.embedding || item.embeddingProvider !== args.provider);
        return args.limit
            ? itemsNeedingEmbedding.slice(0, args.limit)
            : itemsNeedingEmbedding;
    },
});
// Update item with embedding
exports.updateEmbedding = (0, server_1.mutation)({
    args: {
        id: values_1.v.id("priceItems"),
        embedding: values_1.v.array(values_1.v.number()),
        embeddingProvider: values_1.v.union(values_1.v.literal("cohere"), values_1.v.literal("openai")),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.id, {
            embedding: args.embedding,
            embeddingProvider: args.embeddingProvider,
            updatedAt: Date.now(),
        });
    },
});
