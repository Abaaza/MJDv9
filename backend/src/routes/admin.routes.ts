import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import {
  getSettings,
  updateSetting,
  getAllUsers,
  approveUser,
  setUserRole,
} from '../controllers/admin.controller';

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// Settings
router.get('/settings', getSettings);
router.post('/settings', updateSetting);

// Users
router.get('/users', getAllUsers);
router.post('/users/:userId/approve', approveUser);
router.post('/users/:userId/role', setUserRole);

export default router;
