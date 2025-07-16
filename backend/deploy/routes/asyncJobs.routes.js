import { Router } from 'express';
import { AsyncJobController } from '../controllers/asyncJob.controller';
import { authenticate } from '../middleware/auth';
const router = Router();
const asyncJobController = new AsyncJobController();
// Submit job for async processing
router.post('/submit', authenticate, (req, res) => asyncJobController.submitJob(req, res));
// Check job status
router.get('/:jobId/status', authenticate, (req, res) => asyncJobController.getJobStatus(req, res));
// Download job results
router.get('/:jobId/download', authenticate, (req, res) => asyncJobController.downloadResults(req, res));
export default router;
//# sourceMappingURL=asyncJobs.routes.js.map