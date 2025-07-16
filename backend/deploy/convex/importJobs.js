"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActive = exports.getByUser = exports.getById = exports.updateProgress = exports.updateStatus = exports.create = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
exports.create = (0, server_1.mutation)({
    args: {
        userId: values_1.v.id("users"),
        type: values_1.v.string(),
        totalItems: values_1.v.number(),
        fileName: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        const jobId = await ctx.db.insert("importJobs", {
            userId: args.userId,
            type: args.type,
            totalItems: args.totalItems,
            fileName: args.fileName,
            status: "pending",
            progress: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        return jobId;
    },
});
exports.updateStatus = (0, server_1.mutation)({
    args: {
        jobId: values_1.v.id("importJobs"),
        status: values_1.v.union(values_1.v.literal("pending"), values_1.v.literal("processing"), values_1.v.literal("completed"), values_1.v.literal("failed")),
        progress: values_1.v.optional(values_1.v.number()),
        results: values_1.v.optional(values_1.v.object({
            created: values_1.v.number(),
            updated: values_1.v.number(),
            skipped: values_1.v.number(),
            errors: values_1.v.array(values_1.v.string()),
        })),
        error: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        const updates = {
            status: args.status,
            updatedAt: Date.now(),
        };
        if (args.progress !== undefined) {
            updates.progress = args.progress;
        }
        if (args.results) {
            updates.results = args.results;
        }
        if (args.error) {
            updates.error = args.error;
        }
        if (args.status === "completed" || args.status === "failed") {
            updates.completedAt = Date.now();
        }
        await ctx.db.patch(args.jobId, updates);
    },
});
exports.updateProgress = (0, server_1.mutation)({
    args: {
        jobId: values_1.v.id("importJobs"),
        progress: values_1.v.number(),
        message: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        const updates = {
            progress: args.progress,
            updatedAt: Date.now(),
        };
        if (args.message) {
            updates.progressMessage = args.message;
        }
        await ctx.db.patch(args.jobId, updates);
    },
});
exports.getById = (0, server_1.query)({
    args: { jobId: values_1.v.id("importJobs") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.jobId);
    },
});
exports.getByUser = (0, server_1.query)({
    args: { userId: values_1.v.id("users") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("importJobs")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .order("desc")
            .collect();
    },
});
exports.getActive = (0, server_1.query)({
    handler: async (ctx) => {
        return await ctx.db
            .query("importJobs")
            .filter((q) => q.or(q.eq(q.field("status"), "pending"), q.eq(q.field("status"), "processing")))
            .order("desc")
            .collect();
    },
});
