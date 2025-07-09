import { Request, Response } from 'express';
import { getConvexClient } from '../config/convex';
import { api } from '../../../convex/_generated/api';
import { toConvexId } from '../utils/convexId';

const convex = getConvexClient();

export async function getSettings(req: Request, res: Response): Promise<void> {
  try {
    const settings = await convex.query(api.applicationSettings.getAll);
    res.json(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
}

export async function updateSetting(req: Request, res: Response): Promise<void> {
  try {
    const { key, value, description } = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    await convex.mutation(api.applicationSettings.upsert, {
      key,
      value,
      description,
      userId: req.user.id as any,
    });

    await convex.mutation(api.activityLogs.create, {
      userId: req.user.id as any,
      action: 'updated_setting',
      entityType: 'applicationSettings',
      entityId: key,
      details: `Updated setting: ${key}`,
    });

    res.json({ message: 'Setting updated successfully' });
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
}

export async function getAllUsers(req: Request, res: Response): Promise<void> {
  try {
    const users = await convex.query(api.users.getAllUsers);
    res.json(users);
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
}

export async function approveUser(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;

    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    await convex.mutation(api.users.approveUser, { userId: toConvexId<'users'>(userId) });

    await convex.mutation(api.activityLogs.create, {
      userId: req.user.id as any,
      action: 'approved_user',
      entityType: 'users',
      entityId: userId,
      details: 'Approved user account',
    });

    res.json({ message: 'User approved successfully' });
  } catch (error) {
    console.error('Approve user error:', error);
    res.status(500).json({ error: 'Failed to approve user' });
  }
}

export async function setUserRole(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    if (role !== 'user' && role !== 'admin') {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    await convex.mutation(api.users.setUserRole, { userId: toConvexId<'users'>(userId), role });

    await convex.mutation(api.activityLogs.create, {
      userId: req.user.id as any,
      action: 'changed_user_role',
      entityType: 'users',
      entityId: userId,
      details: `Changed user role to ${role}`,
    });

    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error('Set user role error:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
}
