import { getConvexClient } from '../config/convex';
import { api } from '../lib/convex-api';
import { toConvexId } from './convexId';
const convex = getConvexClient();
export async function logActivity(req, action, entityType, entityId, details) {
    try {
        if (!req.user)
            return;
        await convex.mutation(api.activityLogs.create, {
            userId: toConvexId(req.user.id),
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
//# sourceMappingURL=activityLogger.js.map