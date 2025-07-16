"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const admin_controller_1 = require("../controllers/admin.controller");
const router = (0, express_1.Router)();
// All admin routes require authentication and admin role
router.use(auth_1.authenticate);
router.use(auth_1.requireAdmin);
// Settings
router.get('/settings', admin_controller_1.getSettings);
router.post('/settings', admin_controller_1.updateSetting);
// Users
router.get('/users', admin_controller_1.getAllUsers);
router.post('/users/:userId/approve', admin_controller_1.approveUser);
router.post('/users/:userId/role', admin_controller_1.setUserRole);
exports.default = router;
