"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSettings = getSettings;
exports.updateSetting = updateSetting;
exports.getAllUsers = getAllUsers;
exports.approveUser = approveUser;
exports.setUserRole = setUserRole;
const convex_1 = require("../config/convex");
const api_1 = require("../../../convex/_generated/api");
const convexId_1 = require("../utils/convexId");
const convex = (0, convex_1.getConvexClient)();
async function getSettings(req, res) {
    try {
        const settings = await convex.query(api_1.api.applicationSettings.getAll);
        res.json(settings);
    }
    catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'Failed to get settings' });
    }
}
async function updateSetting(req, res) {
    try {
        const { key, value, description } = req.body;
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        await convex.mutation(api_1.api.applicationSettings.upsert, {
            key,
            value,
            description,
            userId: req.user.id,
        });
        await convex.mutation(api_1.api.activityLogs.create, {
            userId: req.user.id,
            action: 'updated_setting',
            entityType: 'applicationSettings',
            entityId: key,
            details: `Updated setting: ${key}`,
        });
        res.json({ message: 'Setting updated successfully' });
    }
    catch (error) {
        console.error('Update setting error:', error);
        res.status(500).json({ error: 'Failed to update setting' });
    }
}
async function getAllUsers(req, res) {
    try {
        const users = await convex.query(api_1.api.users.getAllUsers);
        res.json(users);
    }
    catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
}
async function approveUser(req, res) {
    try {
        const { userId } = req.params;
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        await convex.mutation(api_1.api.users.approveUser, { userId: (0, convexId_1.toConvexId)(userId) });
        await convex.mutation(api_1.api.activityLogs.create, {
            userId: req.user.id,
            action: 'approved_user',
            entityType: 'users',
            entityId: userId,
            details: 'Approved user account',
        });
        res.json({ message: 'User approved successfully' });
    }
    catch (error) {
        console.error('Approve user error:', error);
        res.status(500).json({ error: 'Failed to approve user' });
    }
}
async function setUserRole(req, res) {
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
        await convex.mutation(api_1.api.users.setUserRole, { userId: (0, convexId_1.toConvexId)(userId), role });
        await convex.mutation(api_1.api.activityLogs.create, {
            userId: req.user.id,
            action: 'changed_user_role',
            entityType: 'users',
            entityId: userId,
            details: `Changed user role to ${role}`,
        });
        res.json({ message: 'User role updated successfully' });
    }
    catch (error) {
        console.error('Set user role error:', error);
        res.status(500).json({ error: 'Failed to update user role' });
    }
}
