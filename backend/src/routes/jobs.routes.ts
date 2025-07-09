import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { 
  uploadAndProcessBOQ, 
  getJobStatus, 
  getJobLogs, 
  cancelJob 
} from '../controllers/jobPolling.controller';
import { uploadExcel } from '../middleware/upload';

const router = Router();

// Upload and process BOQ file
router.post('/upload', authenticate, uploadExcel, uploadAndProcessBOQ);

// Get job status
router.get('/:jobId/status', authenticate, getJobStatus);

// Get job logs
router.get('/:jobId/logs', authenticate, getJobLogs);

// Cancel job
router.post('/:jobId/cancel', authenticate, cancelJob);

export default router;
