"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfile = exports.updatePassword = exports.getById = exports.getAllUsers = exports.setUserRole = exports.approveUser = exports.getPendingUsers = exports.clearRefreshToken = exports.updateRefreshToken = exports.updateLastLogin = exports.getByRefreshToken = exports.getByEmail = exports.create = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
exports.create = (0, server_1.mutation)({
    args: {
        email: values_1.v.string(),
        password: values_1.v.string(),
        name: values_1.v.string(),
        role: values_1.v.union(values_1.v.literal("user"), values_1.v.literal("admin")),
        isApproved: values_1.v.boolean(),
        isActive: values_1.v.optional(values_1.v.boolean()),
    },
    handler: async (ctx, args) => {
        var _a;
        const userId = await ctx.db.insert("users", {
            ...args,
            isActive: (_a = args.isActive) !== null && _a !== void 0 ? _a : true,
            createdAt: Date.now(),
        });
        return userId;
    },
});
exports.getByEmail = (0, server_1.query)({
    args: { email: values_1.v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("users")
            .withIndex("by_email", (q) => q.eq("email", args.email))
            .first();
    },
});
exports.getByRefreshToken = (0, server_1.query)({
    args: { refreshToken: values_1.v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("users")
            .withIndex("by_refresh_token", (q) => q.eq("refreshToken", args.refreshToken))
            .first();
    },
});
exports.updateLastLogin = (0, server_1.mutation)({
    args: {
        userId: values_1.v.id("users"),
        refreshToken: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.userId, {
            lastLogin: Date.now(),
            refreshToken: args.refreshToken,
        });
    },
});
exports.updateRefreshToken = (0, server_1.mutation)({
    args: {
        userId: values_1.v.id("users"),
        refreshToken: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.userId, {
            refreshToken: args.refreshToken,
        });
    },
});
exports.clearRefreshToken = (0, server_1.mutation)({
    args: {
        userId: values_1.v.id("users"),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.userId, {
            refreshToken: undefined,
        });
    },
});
exports.getPendingUsers = (0, server_1.query)({
    handler: async (ctx) => {
        return await ctx.db
            .query("users")
            .filter((q) => q.eq(q.field("isApproved"), false))
            .collect();
    },
});
exports.approveUser = (0, server_1.mutation)({
    args: {
        userId: values_1.v.id("users"),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.userId, {
            isApproved: true,
        });
    },
});
exports.setUserRole = (0, server_1.mutation)({
    args: {
        userId: values_1.v.id("users"),
        role: values_1.v.union(values_1.v.literal("user"), values_1.v.literal("admin")),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.userId, {
            role: args.role,
        });
    },
});
exports.getAllUsers = (0, server_1.query)({
    handler: async (ctx) => {
        return await ctx.db.query("users").collect();
    },
});
exports.getById = (0, server_1.query)({
    args: { userId: values_1.v.id("users") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.userId);
    },
});
exports.updatePassword = (0, server_1.mutation)({
    args: {
        userId: values_1.v.id("users"),
        password: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.userId, {
            password: args.password,
        });
    },
});
exports.updateProfile = (0, server_1.mutation)({
    args: {
        userId: values_1.v.id("users"),
        updates: values_1.v.object({
            name: values_1.v.optional(values_1.v.string()),
        }),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.userId, args.updates);
    },
});
