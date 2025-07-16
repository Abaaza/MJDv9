"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.get = exports.removeMatchingJob = exports.addMatchingJob = exports.updateTotalValue = exports.getById = exports.getByStatus = exports.getByClient = exports.getAll = exports.update = exports.create = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
exports.create = (0, server_1.mutation)({
    args: {
        name: values_1.v.string(),
        clientId: values_1.v.id("clients"),
        description: values_1.v.optional(values_1.v.string()),
        status: values_1.v.union(values_1.v.literal("draft"), values_1.v.literal("active"), values_1.v.literal("completed"), values_1.v.literal("cancelled")),
        userId: values_1.v.id("users"),
    },
    handler: async (ctx, args) => {
        const { userId, ...projectData } = args;
        const projectId = await ctx.db.insert("projects", {
            ...projectData,
            totalValue: 0,
            createdAt: Date.now(),
            createdBy: userId,
        });
        return projectId;
    },
});
exports.update = (0, server_1.mutation)({
    args: {
        _id: values_1.v.id("projects"),
        name: values_1.v.optional(values_1.v.string()),
        description: values_1.v.optional(values_1.v.string()),
        status: values_1.v.optional(values_1.v.union(values_1.v.literal("draft"), values_1.v.literal("active"), values_1.v.literal("completed"), values_1.v.literal("cancelled"))),
        totalValue: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        const { _id, ...updates } = args;
        await ctx.db.patch(_id, updates);
    },
});
exports.getAll = (0, server_1.query)({
    handler: async (ctx) => {
        const projects = await ctx.db.query("projects").collect();
        // Get client names
        const projectsWithClients = await Promise.all(projects.map(async (project) => {
            const client = await ctx.db.get(project.clientId);
            return {
                ...project,
                clientName: (client === null || client === void 0 ? void 0 : client.name) || "Unknown",
            };
        }));
        return projectsWithClients;
    },
});
exports.getByClient = (0, server_1.query)({
    args: { clientId: values_1.v.id("clients") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("projects")
            .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
            .collect();
    },
});
exports.getByStatus = (0, server_1.query)({
    args: { status: values_1.v.union(values_1.v.literal("draft"), values_1.v.literal("active"), values_1.v.literal("completed"), values_1.v.literal("cancelled")) },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("projects")
            .withIndex("by_status", (q) => q.eq("status", args.status))
            .collect();
    },
});
exports.getById = (0, server_1.query)({
    args: { _id: values_1.v.id("projects") },
    handler: async (ctx, args) => {
        const project = await ctx.db.get(args._id);
        if (!project)
            return null;
        const client = await ctx.db.get(project.clientId);
        return {
            ...project,
            clientName: (client === null || client === void 0 ? void 0 : client.name) || "Unknown",
        };
    },
});
exports.updateTotalValue = (0, server_1.mutation)({
    args: {
        _id: values_1.v.id("projects"),
        totalValue: values_1.v.number(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args._id, { totalValue: args.totalValue });
    },
});
exports.addMatchingJob = (0, server_1.mutation)({
    args: {
        projectId: values_1.v.id("projects"),
        jobId: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        // This mutation exists for compatibility but jobs are now linked via the aiMatchingJobs table
        // The relationship is managed through the projectId field in aiMatchingJobs
        return { success: true };
    },
});
exports.removeMatchingJob = (0, server_1.mutation)({
    args: {
        projectId: values_1.v.id("projects"),
        jobId: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        // This mutation exists for compatibility but jobs are now linked via the aiMatchingJobs table
        // The relationship is managed through the projectId field in aiMatchingJobs
        return { success: true };
    },
});
exports.get = (0, server_1.query)({
    args: { id: values_1.v.id("projects") },
    handler: async (ctx, args) => {
        const project = await ctx.db.get(args.id);
        if (!project)
            return null;
        const client = await ctx.db.get(project.clientId);
        // Get all jobs for this project
        const jobs = await ctx.db
            .query("aiMatchingJobs")
            .withIndex("by_project", (q) => q.eq("projectId", args.id))
            .collect();
        return {
            ...project,
            clientName: (client === null || client === void 0 ? void 0 : client.name) || "Unknown",
            jobCount: jobs.length,
            jobs: jobs.map(job => ({
                _id: job._id,
                fileName: job.fileName,
                status: job.status,
                progress: job.progress,
                itemCount: job.itemCount,
                matchedCount: job.matchedCount,
                totalValue: job.totalValue,
                startedAt: job.startedAt,
                completedAt: job.completedAt,
            })),
        };
    },
});
