import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { testMatchingMethods, testSingleMethod } from '../controllers/test.controller.js';

const router = Router();

// Test all matching methods
router.get('/test-all-methods', authenticate, testMatchingMethods);

// Test single method
router.post('/test-method', authenticate, testSingleMethod);

export default router;