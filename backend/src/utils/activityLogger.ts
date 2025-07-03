import { getConvexClient } from '../config/convex.js';
import { api } from '../../../convex/_generated/api.js';
import { toConvexId } from './convexId.js';
import type { Request } from 'express';

const convex = getConvexClient();

export async function logActivity(
  req: Request,
  action: string,
  entityType: string,
  entityId?: string,
  details?: string
): Promise<void> {
  try {
    if (!req.user) return;

    await convex.mutation(api.activityLogs.create, {
      userId: toConvexId<'users'>(req.user.id),
      action,
      entityType,
      entityId,
      details,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.get('user-agent'),
    });
  } catch (error) {
    console.error('[ActivityLogger] Failed to log activity:', error);
    // Don't throw - logging failures shouldn't break the main operation
  }
}