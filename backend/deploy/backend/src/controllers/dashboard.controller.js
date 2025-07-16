"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStats = getStats;
exports.getRecentActivity = getRecentActivity;
exports.getRecentJobs = getRecentJobs;
exports.getSystemHealth = getSystemHealth;
exports.getActivitySummary = getActivitySummary;
exports.getActivityStats = getActivityStats;
const convex_1 = require("../config/convex");
const api_1 = require("../../../convex/_generated/api");
const convexId_1 = require("../utils/convexId");
const httpClient_1 = require("../utils/httpClient");
const convex = (0, convex_1.getConvexClient)();
async function getStats(req, res) {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        const stats = await convex.query(api_1.api.dashboard.getStats, {
            userId: (0, convexId_1.toConvexId)(req.user.id),
        });
        console.log('[Dashboard] Stats for user', req.user.email, ':', {
            activitiesToday: stats.activitiesToday,
            totalProjects: stats.totalProjects,
            matchesToday: stats.matchesToday
        });
        res.json(stats);
    }
    catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to get dashboard stats' });
    }
}
async function getRecentActivity(req, res) {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        const limit = req.query.limit ? parseInt(req.query.limit) : 10;
        const activities = await convex.query(api_1.api.dashboard.getRecentActivity, {
            userId: (0, convexId_1.toConvexId)(req.user.id),
            limit,
        });
        res.json(activities);
    }
    catch (error) {
        console.error('Get recent activity error:', error);
        res.status(500).json({ error: 'Failed to get recent activity' });
    }
}
async function getRecentJobs(req, res) {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        const limit = req.query.limit ? parseInt(req.query.limit) : 5;
        const jobs = await convex.query(api_1.api.dashboard.getRecentJobs, {
            userId: (0, convexId_1.toConvexId)(req.user.id),
            limit,
        });
        res.json(jobs);
    }
    catch (error) {
        console.error('Get recent jobs error:', error);
        res.status(500).json({ error: 'Failed to get recent jobs' });
    }
}
async function getSystemHealth(req, res) {
    var _a, _b;
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        // Check API connectivity
        const apiStatus = {
            cohere: { status: 'unknown', responseTime: 0 },
            openai: { status: 'unknown', responseTime: 0 },
            convex: { status: 'unknown', responseTime: 0 }
        };
        // Check Cohere API
        try {
            const cohereKey = await convex.query(api_1.api.applicationSettings.getByKey, {
                key: 'COHERE_API_KEY'
            });
            if (cohereKey === null || cohereKey === void 0 ? void 0 : cohereKey.value) {
                const start = Date.now();
                await httpClient_1.httpClient.post('https://api.cohere.ai/v1/embed', {
                    texts: ['test'],
                    model: 'embed-english-v2.0'
                }, {
                    headers: {
                        'Authorization': `Bearer ${cohereKey.value}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 5000
                });
                apiStatus.cohere = { status: 'connected', responseTime: Date.now() - start };
            }
            else {
                apiStatus.cohere = { status: 'not_configured', responseTime: 0 };
            }
        }
        catch (error) {
            if (((_a = error.response) === null || _a === void 0 ? void 0 : _a.status) === 401) {
                apiStatus.cohere = { status: 'invalid_key', responseTime: 0 };
            }
            else {
                apiStatus.cohere = { status: 'error', responseTime: 0 };
            }
        }
        // Check OpenAI API
        try {
            const openaiKey = await convex.query(api_1.api.applicationSettings.getByKey, {
                key: 'OPENAI_API_KEY'
            });
            if (openaiKey === null || openaiKey === void 0 ? void 0 : openaiKey.value) {
                const start = Date.now();
                await httpClient_1.httpClient.get('https://api.openai.com/v1/models', {
                    headers: {
                        'Authorization': `Bearer ${openaiKey.value}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 5000
                });
                apiStatus.openai = { status: 'connected', responseTime: Date.now() - start };
            }
            else {
                apiStatus.openai = { status: 'not_configured', responseTime: 0 };
            }
        }
        catch (error) {
            if (((_b = error.response) === null || _b === void 0 ? void 0 : _b.status) === 401) {
                apiStatus.openai = { status: 'invalid_key', responseTime: 0 };
            }
            else {
                apiStatus.openai = { status: 'error', responseTime: 0 };
            }
        }
        // Check Convex database
        try {
            const start = Date.now();
            // Simple query to check database connectivity
            await convex.query(api_1.api.applicationSettings.getAll, undefined, { maxAttempts: 2, delayMs: 500 });
            apiStatus.convex = { status: 'connected', responseTime: Date.now() - start };
        }
        catch (error) {
            console.error('Convex health check failed:', error);
            apiStatus.convex = { status: 'error', responseTime: 0 };
        }
        res.json({
            apiStatus,
            timestamp: Date.now()
        });
    }
    catch (error) {
        console.error('Get system health error:', error);
        res.status(500).json({ error: 'Failed to get system health' });
    }
}
async function getActivitySummary(req, res) {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        // Get activity summary for different time periods
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;
        const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
        const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
        const [todayActivity, weekActivity, monthActivity] = await Promise.all([
            convex.query(api_1.api.dashboard.getActivitySummary, {
                userId: (0, convexId_1.toConvexId)(req.user.id),
                startDate: oneDayAgo,
                endDate: now
            }),
            convex.query(api_1.api.dashboard.getActivitySummary, {
                userId: (0, convexId_1.toConvexId)(req.user.id),
                startDate: oneWeekAgo,
                endDate: now
            }),
            convex.query(api_1.api.dashboard.getActivitySummary, {
                userId: (0, convexId_1.toConvexId)(req.user.id),
                startDate: oneMonthAgo,
                endDate: now
            })
        ]);
        res.json({
            today: todayActivity,
            week: weekActivity,
            month: monthActivity
        });
    }
    catch (error) {
        console.error('Get activity summary error:', error);
        res.status(500).json({ error: 'Failed to get activity summary' });
    }
}
async function getActivityStats(req, res) {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        const now = Date.now();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayMidnight = today.getTime();
        const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
        const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
        // Get all activities for the user
        const allActivities = await convex.query(api_1.api.dashboard.getRecentActivity, {
            userId: (0, convexId_1.toConvexId)(req.user.id),
            limit: 10000
        });
        // Calculate stats
        const totalActivities = allActivities.length;
        const todayActivities = allActivities.filter(a => a.timestamp >= todayMidnight).length;
        const weekActivities = allActivities.filter(a => a.timestamp >= oneWeekAgo).length;
        const monthActivities = allActivities.filter(a => a.timestamp >= oneMonthAgo).length;
        // Get top actions
        const actionCounts = {};
        allActivities.forEach(activity => {
            const action = activity.action.split(' ')[0].toLowerCase();
            actionCounts[action] = (actionCounts[action] || 0) + 1;
        });
        const topActions = Object.entries(actionCounts)
            .map(([action, count]) => ({ action, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
        // Get top entities
        const entityCounts = {};
        allActivities.forEach(activity => {
            entityCounts[activity.entityType] = (entityCounts[activity.entityType] || 0) + 1;
        });
        const topEntities = Object.entries(entityCounts)
            .map(([entity, count]) => ({ entity, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
        res.json({
            totalActivities,
            todayActivities,
            weekActivities,
            monthActivities,
            topActions,
            topEntities
        });
    }
    catch (error) {
        console.error('Get activity stats error:', error);
        res.status(500).json({ error: 'Failed to get activity stats' });
    }
}
