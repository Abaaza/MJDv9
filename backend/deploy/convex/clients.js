"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteClient = exports.getByName = exports.getById = exports.getActive = exports.getAll = exports.update = exports.create = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
exports.create = (0, server_1.mutation)({
    args: {
        name: values_1.v.string(),
        email: values_1.v.optional(values_1.v.string()),
        phone: values_1.v.optional(values_1.v.string()),
        address: values_1.v.optional(values_1.v.string()),
        contactPerson: values_1.v.optional(values_1.v.string()),
        notes: values_1.v.optional(values_1.v.string()),
        isActive: values_1.v.boolean(),
        userId: values_1.v.id("users"),
    },
    handler: async (ctx, args) => {
        const { userId, ...clientData } = args;
        const clientId = await ctx.db.insert("clients", {
            ...clientData,
            createdAt: Date.now(),
            createdBy: userId,
        });
        return clientId;
    },
});
exports.update = (0, server_1.mutation)({
    args: {
        _id: values_1.v.id("clients"),
        name: values_1.v.optional(values_1.v.string()),
        email: values_1.v.optional(values_1.v.string()),
        phone: values_1.v.optional(values_1.v.string()),
        address: values_1.v.optional(values_1.v.string()),
        contactPerson: values_1.v.optional(values_1.v.string()),
        notes: values_1.v.optional(values_1.v.string()),
        isActive: values_1.v.optional(values_1.v.boolean()),
    },
    handler: async (ctx, args) => {
        const { _id, ...updates } = args;
        await ctx.db.patch(_id, updates);
    },
});
exports.getAll = (0, server_1.query)({
    handler: async (ctx) => {
        return await ctx.db.query("clients").collect();
    },
});
exports.getActive = (0, server_1.query)({
    handler: async (ctx) => {
        return await ctx.db
            .query("clients")
            .withIndex("by_active", (q) => q.eq("isActive", true))
            .collect();
    },
});
exports.getById = (0, server_1.query)({
    args: { _id: values_1.v.id("clients") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args._id);
    },
});
exports.getByName = (0, server_1.query)({
    args: { name: values_1.v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("clients")
            .withIndex("by_name", (q) => q.eq("name", args.name))
            .first();
    },
});
exports.deleteClient = (0, server_1.mutation)({
    args: { _id: values_1.v.id("clients") },
    handler: async (ctx, args) => {
        await ctx.db.delete(args._id);
    },
});
