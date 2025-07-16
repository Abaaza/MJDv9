"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logActivity = logActivity;
const convex_1 = require("../config/convex");
const api_1 = require("../../../convex/_generated/api");
const convexId_1 = require("./convexId");
const convex = (0, convex_1.getConvexClient)();
async function logActivity(req, action, entityType, entityId, details) {
    try {
        if (!req.user)
            return;
        await convex.mutation(api_1.api.activityLogs.create, {
            userId: (0, convexId_1.toConvexId)(req.user.id),
            action,
            entityType,
            entityId,
            details,
            ipAddress: 'REDACTED',
            userAgent: 'REDACTED',
        });
    }
    catch (error) {
        console.error('[ActivityLogger] Failed to log activity:', error);
        // Don't throw - logging failures shouldn't break the main operation
    }
}
