"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRunningJobs = exports.updateTotalValue = exports.updateMatchedCount = exports.deleteJob = exports.getJobById = exports.autoSaveMatchResult = exports.updateMatchResult = exports.createMatchResult = exports.getMatchResult = exports.getMatchResults = exports.getJob = exports.getAllJobs = exports.getUserJobs = exports.getJobsByProject = exports.unlinkJobFromProject = exports.linkJobToProject = exports.updateJobStatus = exports.createJob = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
exports.createJob = (0, server_1.mutation)({
    args: {
        userId: values_1.v.id("users"),
        fileName: values_1.v.string(),
        fileBuffer: values_1.v.optional(values_1.v.array(values_1.v.number())), // Made optional - large files exceed Convex limits
        itemCount: values_1.v.number(),
        matchingMethod: values_1.v.union(values_1.v.literal("LOCAL"), values_1.v.literal("COHERE"), values_1.v.literal("OPENAI")),
        clientId: values_1.v.optional(values_1.v.id("clients")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        projectName: values_1.v.optional(values_1.v.string()),
        headers: values_1.v.optional(values_1.v.array(values_1.v.string())),
        sheetName: values_1.v.optional(values_1.v.string()),
        originalFileId: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        const jobId = await ctx.db.insert("aiMatchingJobs", {
            userId: args.userId,
            clientId: args.clientId,
            projectId: args.projectId,
            projectName: args.projectName,
            fileName: args.fileName,
            fileUrl: "", // We'll store the buffer separately
            originalFileId: args.originalFileId,
            status: "pending",
            progress: 0,
            itemCount: args.itemCount,
            matchedCount: 0,
            matchingMethod: args.matchingMethod,
            startedAt: Date.now(),
            headers: args.headers,
            sheetName: args.sheetName,
        });
        // Skip storing file buffer - the table schema doesn't support it
        // and large files exceed Convex limits anyway
        // if (args.fileBuffer && args.fileBuffer.length < 8192) {
        //   await ctx.db.patch(jobId, {
        //     fileBuffer: args.fileBuffer,
        //   } as any);
        // }
        return jobId;
    },
});
exports.updateJobStatus = (0, server_1.mutation)({
    args: {
        jobId: values_1.v.string(), // Accept string ID that we'll convert
        status: values_1.v.union(values_1.v.literal("pending"), values_1.v.literal("parsing"), values_1.v.literal("processing"), values_1.v.literal("matching"), values_1.v.literal("completed"), values_1.v.literal("failed"), values_1.v.literal("cancelled")),
        progress: values_1.v.optional(values_1.v.number()),
        progressMessage: values_1.v.optional(values_1.v.string()),
        matchedCount: values_1.v.optional(values_1.v.number()),
        itemCount: values_1.v.optional(values_1.v.number()),
        error: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        const updates = {};
        // Map "processing" to "matching" for backward compatibility
        if (args.status === "processing") {
            updates.status = "matching";
        }
        else {
            updates.status = args.status;
        }
        if (args.progress !== undefined) {
            updates.progress = args.progress;
        }
        if (args.progressMessage !== undefined) {
            updates.progressMessage = args.progressMessage;
        }
        if (args.matchedCount !== undefined) {
            updates.matchedCount = args.matchedCount;
        }
        if (args.itemCount !== undefined) {
            updates.itemCount = args.itemCount;
        }
        if (args.error !== undefined) {
            updates.error = args.error;
        }
        if (args.status === "completed" || args.status === "failed" || args.status === "cancelled") {
            updates.completedAt = Date.now();
        }
        // Convert string ID to Convex ID
        await ctx.db.patch(args.jobId, updates);
    },
});
exports.linkJobToProject = (0, server_1.mutation)({
    args: {
        jobId: values_1.v.id("aiMatchingJobs"),
        projectId: values_1.v.id("projects"),
        projectName: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.jobId, {
            projectId: args.projectId,
            projectName: args.projectName,
        });
    },
});
exports.unlinkJobFromProject = (0, server_1.mutation)({
    args: {
        jobId: values_1.v.id("aiMatchingJobs"),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.jobId, {
            projectId: undefined,
            projectName: undefined,
        });
    },
});
exports.getJobsByProject = (0, server_1.query)({
    args: {
        projectId: values_1.v.id("projects"),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("aiMatchingJobs")
            .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
            .collect();
    },
});
exports.getUserJobs = (0, server_1.query)({
    args: {
        userId: values_1.v.id("users"),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("aiMatchingJobs")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .order("desc")
            .collect();
    },
});
exports.getAllJobs = (0, server_1.query)({
    args: {},
    handler: async (ctx) => {
        return await ctx.db
            .query("aiMatchingJobs")
            .order("desc")
            .collect();
    },
});
exports.getJob = (0, server_1.query)({
    args: {
        jobId: values_1.v.id("aiMatchingJobs"),
    },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.jobId);
    },
});
exports.getMatchResults = (0, server_1.query)({
    args: {
        jobId: values_1.v.id("aiMatchingJobs"),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("matchResults")
            .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
            .collect();
    },
});
exports.getMatchResult = (0, server_1.query)({
    args: {
        resultId: values_1.v.id("matchResults"),
    },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.resultId);
    },
});
exports.createMatchResult = (0, server_1.mutation)({
    args: {
        jobId: values_1.v.id("aiMatchingJobs"),
        rowNumber: values_1.v.number(),
        originalDescription: values_1.v.string(),
        originalQuantity: values_1.v.optional(values_1.v.number()),
        originalUnit: values_1.v.optional(values_1.v.string()),
        originalRowData: values_1.v.optional(values_1.v.any()),
        // contextHeaders: v.optional(v.array(v.string())), // Temporarily removed until schema is synced
        matchedItemId: values_1.v.optional(values_1.v.string()), // Keep as string for now to match deployed schema
        matchedDescription: values_1.v.optional(values_1.v.string()),
        matchedCode: values_1.v.optional(values_1.v.string()),
        matchedUnit: values_1.v.optional(values_1.v.string()),
        matchedRate: values_1.v.optional(values_1.v.number()),
        confidence: values_1.v.number(),
        matchMethod: values_1.v.string(),
        totalPrice: values_1.v.optional(values_1.v.number()),
        notes: values_1.v.optional(values_1.v.string()),
        isManuallyEdited: values_1.v.optional(values_1.v.boolean()), // Add to match schema
    },
    handler: async (ctx, args) => {
        // Clean the args to ensure we only save what the schema expects
        const { matchedItemId, isManuallyEdited, ...cleanArgs } = args;
        await ctx.db.insert("matchResults", {
            ...cleanArgs,
            matchedItemId: matchedItemId ? matchedItemId : undefined,
            isManuallyEdited: isManuallyEdited !== null && isManuallyEdited !== void 0 ? isManuallyEdited : false, // Default to false if not provided
        });
    },
});
exports.updateMatchResult = (0, server_1.mutation)({
    args: {
        resultId: values_1.v.id("matchResults"),
        updates: values_1.v.object({
            matchedItemId: values_1.v.optional(values_1.v.string()), // Keep as string for now to match deployed schema
            matchedDescription: values_1.v.optional(values_1.v.string()),
            matchedCode: values_1.v.optional(values_1.v.string()),
            matchedUnit: values_1.v.optional(values_1.v.string()),
            matchedRate: values_1.v.optional(values_1.v.number()),
            confidence: values_1.v.optional(values_1.v.number()),
            totalPrice: values_1.v.optional(values_1.v.number()),
            notes: values_1.v.optional(values_1.v.string()),
            isManuallyEdited: values_1.v.optional(values_1.v.boolean()),
            matchMethod: values_1.v.optional(values_1.v.string()),
        }),
        userId: values_1.v.id("users"),
    },
    handler: async (ctx, args) => {
        const { matchedItemId, isManuallyEdited, ...otherUpdates } = args.updates;
        await ctx.db.patch(args.resultId, {
            ...otherUpdates,
            matchedItemId: matchedItemId ? matchedItemId : undefined,
            isManuallyEdited: isManuallyEdited !== null && isManuallyEdited !== void 0 ? isManuallyEdited : true, // Default to true for manual updates
        });
    },
});
exports.autoSaveMatchResult = (0, server_1.mutation)({
    args: {
        resultId: values_1.v.id("matchResults"),
        updates: values_1.v.any(),
        userId: values_1.v.id("users"),
    },
    handler: async (ctx, args) => {
        // Auto-save with minimal validation
        await ctx.db.patch(args.resultId, {
            ...args.updates,
            lastAutoSave: Date.now(),
        });
    },
});
exports.getJobById = (0, server_1.query)({
    args: {
        jobId: values_1.v.id("aiMatchingJobs"),
    },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.jobId);
    },
});
exports.deleteJob = (0, server_1.mutation)({
    args: {
        jobId: values_1.v.id("aiMatchingJobs"),
    },
    handler: async (ctx, args) => {
        // Delete all match results first
        const results = await ctx.db
            .query("matchResults")
            .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
            .collect();
        for (const result of results) {
            await ctx.db.delete(result._id);
        }
        // Then delete the job
        await ctx.db.delete(args.jobId);
    },
});
exports.updateMatchedCount = (0, server_1.mutation)({
    args: {
        jobId: values_1.v.id("aiMatchingJobs"),
        matchedCount: values_1.v.number(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.jobId, {
            matchedCount: args.matchedCount,
        });
    },
});
exports.updateTotalValue = (0, server_1.mutation)({
    args: {
        jobId: values_1.v.id("aiMatchingJobs"),
        totalValue: values_1.v.number(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.jobId, {
            totalValue: args.totalValue,
        });
    },
});
exports.getRunningJobs = (0, server_1.query)({
    args: {},
    handler: async (ctx) => {
        // Get all jobs that are not completed or failed
        const runningJobs = await ctx.db
            .query("aiMatchingJobs")
            .filter((q) => q.and(q.neq(q.field("status"), "completed"), q.neq(q.field("status"), "failed")))
            .collect();
        return runningJobs;
    },
});
