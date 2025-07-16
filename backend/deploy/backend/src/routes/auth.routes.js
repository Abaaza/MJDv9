"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_1 = require("../middleware/auth");
const validation_1 = require("../middleware/validation");
const router = (0, express_1.Router)();
router.post('/register', [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail(),
    (0, express_validator_1.body)('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    (0, express_validator_1.body)('name').trim().notEmpty().withMessage('Name is required'),
], validation_1.validateRequest, auth_controller_1.register);
router.post('/login', [
    (0, express_validator_1.body)('email').isEmail().normalizeEmail(),
    (0, express_validator_1.body)('password').notEmpty(),
], validation_1.validateRequest, auth_controller_1.login);
router.post('/refresh', auth_controller_1.refresh);
router.post('/logout', auth_1.authenticate, auth_controller_1.logout);
router.get('/me', auth_1.authenticate, auth_controller_1.getMe);
router.put('/profile', auth_1.authenticate, [
    (0, express_validator_1.body)('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
], validation_1.validateRequest, auth_controller_1.updateProfile);
router.post('/change-password', auth_1.authenticate, [
    (0, express_validator_1.body)('currentPassword').notEmpty().withMessage('Current password is required'),
    (0, express_validator_1.body)('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
], validation_1.validateRequest, auth_controller_1.changePassword);
exports.default = router;
