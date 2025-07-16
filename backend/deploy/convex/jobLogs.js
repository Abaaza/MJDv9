"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearJobLogs = exports.getJobLogs = exports.create = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
exports.create = (0, server_1.mutation)({
    args: {
        jobId: values_1.v.string(),
        level: values_1.v.union(values_1.v.literal("info"), values_1.v.literal("error"), values_1.v.literal("warning")),
        message: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("jobLogs", {
            jobId: args.jobId,
            level: args.level,
            message: args.message,
            timestamp: Date.now(),
        });
    },
});
exports.getJobLogs = (0, server_1.query)({
    args: {
        jobId: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("jobLogs")
            .filter((q) => q.eq(q.field("jobId"), args.jobId))
            .order("desc")
            .take(100);
    },
});
exports.clearJobLogs = (0, server_1.mutation)({
    args: {
        jobId: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        const logs = await ctx.db
            .query("jobLogs")
            .filter((q) => q.eq(q.field("jobId"), args.jobId))
            .collect();
        for (const log of logs) {
            await ctx.db.delete(log._id);
        }
    },
});
