"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("convex/server");
const values_1 = require("convex/values");
exports.default = (0, server_1.defineSchema)({
    users: (0, server_1.defineTable)({
        email: values_1.v.string(),
        password: values_1.v.string(),
        name: values_1.v.string(),
        role: values_1.v.union(values_1.v.literal("user"), values_1.v.literal("admin")),
        isApproved: values_1.v.boolean(),
        isActive: values_1.v.optional(values_1.v.boolean()),
        createdAt: values_1.v.number(),
        lastLogin: values_1.v.optional(values_1.v.number()),
        refreshToken: values_1.v.optional(values_1.v.string()),
    })
        .index("by_email", ["email"])
        .index("by_refresh_token", ["refreshToken"]),
    applicationSettings: (0, server_1.defineTable)({
        key: values_1.v.string(),
        value: values_1.v.string(),
        description: values_1.v.optional(values_1.v.string()),
        updatedAt: values_1.v.number(),
        updatedBy: values_1.v.id("users"),
    }).index("by_key", ["key"]),
    priceItems: (0, server_1.defineTable)({
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
        // Legacy fields (keeping for compatibility)
        subCategoryCode: values_1.v.optional(values_1.v.string()),
        subCategoryName: values_1.v.optional(values_1.v.string()),
        sub_category: values_1.v.optional(values_1.v.string()),
        type: values_1.v.optional(values_1.v.string()),
        vendor: values_1.v.optional(values_1.v.string()),
        // Embedding fields
        embedding: values_1.v.optional(values_1.v.array(values_1.v.number())),
        embeddingProvider: values_1.v.optional(values_1.v.union(values_1.v.literal("cohere"), values_1.v.literal("openai"))),
        // Metadata
        isActive: values_1.v.boolean(),
        createdAt: values_1.v.number(),
        updatedAt: values_1.v.number(),
        createdBy: values_1.v.id("users"),
    })
        .index("by_item_id", ["id"])
        .index("by_code", ["code"])
        .index("by_category", ["category"])
        .index("by_subcategory", ["subcategory"])
        .index("by_active", ["isActive"])
        .searchIndex("search_price_items", {
        searchField: "description",
        filterFields: ["category", "subcategory", "isActive"]
    }),
    aiMatchingJobs: (0, server_1.defineTable)({
        userId: values_1.v.id("users"),
        clientId: values_1.v.optional(values_1.v.id("clients")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        projectName: values_1.v.optional(values_1.v.string()),
        fileName: values_1.v.string(),
        fileUrl: values_1.v.string(),
        originalFileId: values_1.v.optional(values_1.v.string()), // ID for retrieving original Excel from fileStorage
        status: values_1.v.union(values_1.v.literal("pending"), values_1.v.literal("parsing"), values_1.v.literal("matching"), values_1.v.literal("completed"), values_1.v.literal("failed")),
        progress: values_1.v.number(),
        progressMessage: values_1.v.optional(values_1.v.string()),
        itemCount: values_1.v.number(),
        matchedCount: values_1.v.number(),
        matchingMethod: values_1.v.union(values_1.v.literal("LOCAL"), values_1.v.literal("COHERE"), values_1.v.literal("OPENAI")),
        totalValue: values_1.v.optional(values_1.v.number()),
        error: values_1.v.optional(values_1.v.string()),
        startedAt: values_1.v.number(),
        completedAt: values_1.v.optional(values_1.v.number()),
        resultFileUrl: values_1.v.optional(values_1.v.string()),
        headers: values_1.v.optional(values_1.v.array(values_1.v.string())),
        sheetName: values_1.v.optional(values_1.v.string()),
    })
        .index("by_user", ["userId"])
        .index("by_status", ["status"])
        .index("by_client", ["clientId"])
        .index("by_project", ["projectId"]),
    matchResults: (0, server_1.defineTable)({
        jobId: values_1.v.id("aiMatchingJobs"),
        rowNumber: values_1.v.number(),
        originalDescription: values_1.v.string(),
        originalQuantity: values_1.v.optional(values_1.v.number()),
        originalUnit: values_1.v.optional(values_1.v.string()),
        originalRowData: values_1.v.optional(values_1.v.any()),
        contextHeaders: values_1.v.optional(values_1.v.array(values_1.v.string())),
        matchedItemId: values_1.v.optional(values_1.v.id("priceItems")),
        matchedDescription: values_1.v.optional(values_1.v.string()),
        matchedCode: values_1.v.optional(values_1.v.string()),
        matchedUnit: values_1.v.optional(values_1.v.string()),
        matchedRate: values_1.v.optional(values_1.v.number()),
        confidence: values_1.v.number(),
        matchMethod: values_1.v.string(),
        isManuallyEdited: values_1.v.optional(values_1.v.boolean()),
        totalPrice: values_1.v.optional(values_1.v.number()),
        notes: values_1.v.optional(values_1.v.string()),
    })
        .index("by_job", ["jobId"])
        .index("by_row", ["jobId", "rowNumber"]),
    clients: (0, server_1.defineTable)({
        name: values_1.v.string(),
        email: values_1.v.optional(values_1.v.string()),
        phone: values_1.v.optional(values_1.v.string()),
        address: values_1.v.optional(values_1.v.string()),
        contactPerson: values_1.v.optional(values_1.v.string()),
        notes: values_1.v.optional(values_1.v.string()),
        isActive: values_1.v.boolean(),
        createdAt: values_1.v.number(),
        createdBy: values_1.v.id("users"),
    })
        .index("by_name", ["name"])
        .index("by_active", ["isActive"]),
    projects: (0, server_1.defineTable)({
        name: values_1.v.string(),
        clientId: values_1.v.id("clients"),
        description: values_1.v.optional(values_1.v.string()),
        status: values_1.v.union(values_1.v.literal("draft"), values_1.v.literal("active"), values_1.v.literal("completed"), values_1.v.literal("cancelled")),
        totalValue: values_1.v.optional(values_1.v.number()),
        createdAt: values_1.v.number(),
        createdBy: values_1.v.id("users"),
    })
        .index("by_client", ["clientId"])
        .index("by_status", ["status"]),
    activityLogs: (0, server_1.defineTable)({
        userId: values_1.v.id("users"),
        action: values_1.v.string(),
        entityType: values_1.v.string(),
        entityId: values_1.v.optional(values_1.v.string()),
        details: values_1.v.optional(values_1.v.string()),
        ipAddress: values_1.v.optional(values_1.v.string()),
        userAgent: values_1.v.optional(values_1.v.string()),
        timestamp: values_1.v.number(),
    })
        .index("by_user", ["userId"])
        .index("by_timestamp", ["timestamp"])
        .index("by_entity", ["entityType", "entityId"]),
    importJobs: (0, server_1.defineTable)({
        userId: values_1.v.id("users"),
        type: values_1.v.string(),
        fileName: values_1.v.string(),
        totalItems: values_1.v.number(),
        status: values_1.v.union(values_1.v.literal("pending"), values_1.v.literal("processing"), values_1.v.literal("completed"), values_1.v.literal("failed")),
        progress: values_1.v.number(),
        progressMessage: values_1.v.optional(values_1.v.string()),
        results: values_1.v.optional(values_1.v.object({
            created: values_1.v.number(),
            updated: values_1.v.number(),
            skipped: values_1.v.number(),
            errors: values_1.v.array(values_1.v.string()),
        })),
        error: values_1.v.optional(values_1.v.string()),
        createdAt: values_1.v.number(),
        updatedAt: values_1.v.number(),
        completedAt: values_1.v.optional(values_1.v.number()),
    })
        .index("by_user", ["userId"])
        .index("by_status", ["status"])
        .index("by_created", ["createdAt"]),
    jobLogs: (0, server_1.defineTable)({
        jobId: values_1.v.string(),
        level: values_1.v.union(values_1.v.literal("info"), values_1.v.literal("error"), values_1.v.literal("warning")),
        message: values_1.v.string(),
        timestamp: values_1.v.number(),
    })
        .index("by_job", ["jobId"])
        .index("by_job_timestamp", ["jobId", "timestamp"])
        .index("by_timestamp", ["timestamp"]),
});
