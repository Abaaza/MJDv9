"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAll = exports.getJob = exports.updateJobStatus = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
exports.updateJobStatus = (0, server_1.mutation)({
    args: {
        jobId: values_1.v.string(),
        status: values_1.v.optional(values_1.v.union(values_1.v.literal("pending"), values_1.v.literal("parsing"), values_1.v.literal("processing"), values_1.v.literal("matching"), values_1.v.literal("completed"), values_1.v.literal("failed"), values_1.v.literal("cancelled"))),
        progress: values_1.v.optional(values_1.v.number()),
        progressMessage: values_1.v.optional(values_1.v.string()),
        matchedCount: values_1.v.optional(values_1.v.number()),
        itemCount: values_1.v.optional(values_1.v.number()),
        error: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        const updates = {};
        if (args.status !== undefined) {
            // Map "processing" to "matching" for backward compatibility
            if (args.status === "processing") {
                updates.status = "matching";
            }
            else {
                updates.status = args.status;
            }
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
exports.getJob = (0, server_1.query)({
    args: {
        jobId: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.jobId);
    },
});
exports.getAll = (0, server_1.query)({
    handler: async (ctx) => {
        return await ctx.db.query("aiMatchingJobs").collect();
    },
});
