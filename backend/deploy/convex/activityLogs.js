"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanup = exports.getByDateRange = exports.getRecent = exports.getByEntity = exports.getByUser = exports.create = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
exports.create = (0, server_1.mutation)({
    args: {
        userId: values_1.v.id("users"),
        action: values_1.v.string(),
        entityType: values_1.v.string(),
        entityId: values_1.v.optional(values_1.v.string()),
        details: values_1.v.optional(values_1.v.string()),
        ipAddress: values_1.v.optional(values_1.v.string()),
        userAgent: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        const logId = await ctx.db.insert("activityLogs", {
            ...args,
            timestamp: Date.now(),
        });
        return logId;
    },
});
exports.getByUser = (0, server_1.query)({
    args: {
        userId: values_1.v.id("users"),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit || 50;
        return await ctx.db
            .query("activityLogs")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .order("desc")
            .take(limit);
    },
});
exports.getByEntity = (0, server_1.query)({
    args: {
        entityType: values_1.v.string(),
        entityId: values_1.v.string(),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit || 50;
        return await ctx.db
            .query("activityLogs")
            .withIndex("by_entity", (q) => q.eq("entityType", args.entityType).eq("entityId", args.entityId))
            .order("desc")
            .take(limit);
    },
});
exports.getRecent = (0, server_1.query)({
    args: {
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit || 100;
        const logs = await ctx.db
            .query("activityLogs")
            .withIndex("by_timestamp")
            .order("desc")
            .take(limit);
        // Get user names
        const logsWithUsers = await Promise.all(logs.map(async (log) => {
            const user = await ctx.db.get(log.userId);
            return {
                ...log,
                userName: (user === null || user === void 0 ? void 0 : user.name) || "Unknown",
                userEmail: (user === null || user === void 0 ? void 0 : user.email) || "",
            };
        }));
        return logsWithUsers;
    },
});
exports.getByDateRange = (0, server_1.query)({
    args: {
        startTime: values_1.v.number(),
        endTime: values_1.v.number(),
    },
    handler: async (ctx, args) => {
        const logs = await ctx.db
            .query("activityLogs")
            .withIndex("by_timestamp")
            .order("desc")
            .collect();
        return logs.filter((log) => log.timestamp >= args.startTime && log.timestamp <= args.endTime);
    },
});
exports.cleanup = (0, server_1.mutation)({
    args: {
        daysToKeep: values_1.v.number(),
    },
    handler: async (ctx, args) => {
        const cutoffTime = Date.now() - args.daysToKeep * 24 * 60 * 60 * 1000;
        const oldLogs = await ctx.db
            .query("activityLogs")
            .withIndex("by_timestamp")
            .filter((q) => q.lt(q.field("timestamp"), cutoffTime))
            .collect();
        let deletedCount = 0;
        for (const log of oldLogs) {
            await ctx.db.delete(log._id);
            deletedCount++;
        }
        return { deletedCount };
    },
});
