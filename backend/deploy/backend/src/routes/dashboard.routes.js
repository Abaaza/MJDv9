"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const dashboard_controller_1 = require("../controllers/dashboard.controller");
const router = (0, express_1.Router)();
// All dashboard routes require authentication
router.use(auth_1.authenticate);
router.get('/stats', dashboard_controller_1.getStats);
router.get('/activity', dashboard_controller_1.getRecentActivity);
router.get('/recent-jobs', dashboard_controller_1.getRecentJobs);
router.get('/system-health', dashboard_controller_1.getSystemHealth);
router.get('/activity-summary', dashboard_controller_1.getActivitySummary);
router.get('/activity-stats', dashboard_controller_1.getActivityStats);
exports.default = router;
