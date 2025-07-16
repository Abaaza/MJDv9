"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const upload_1 = require("../middleware/upload");
const priceMatching_controller_1 = require("../controllers/priceMatching.controller");
const router = (0, express_1.Router)();
// All price matching routes require authentication
router.use(auth_1.authenticate);
// Get all user jobs
router.get('/jobs', priceMatching_controller_1.getUserJobs);
// Get all jobs (for admin/client counting)
router.get('/all-jobs', priceMatching_controller_1.getAllJobs);
// Upload BOQ file
router.post('/upload', upload_1.uploadExcel, priceMatching_controller_1.uploadBOQ);
// Upload and match in one step
router.post('/upload-and-match', upload_1.uploadExcel, priceMatching_controller_1.uploadAndMatch);
// Start matching process
router.post('/:jobId/start', priceMatching_controller_1.startMatching);
// Get job status
router.get('/:jobId/status', priceMatching_controller_1.getJobStatus);
// Get match results
router.get('/:jobId/results', priceMatching_controller_1.getMatchResults);
// Update a match result
router.patch('/results/:resultId', priceMatching_controller_1.updateMatchResult);
// Re-match a single result
router.post('/results/:resultId/rematch', priceMatching_controller_1.runMatch);
// Export results to Excel
router.get('/:jobId/export', priceMatching_controller_1.exportResults);
// Stop a running job
router.post('/:jobId/stop', priceMatching_controller_1.stopJob);
// Stop all running jobs
router.post('/stop-all', priceMatching_controller_1.stopAllJobs);
// Auto-save match result
router.post('/results/:resultId/autosave', priceMatching_controller_1.autoSaveResult);
// Run match for a specific result
router.post('/results/:resultId/match', priceMatching_controller_1.runMatch);
// Delete a job and all its results
router.delete('/:jobId', priceMatching_controller_1.deleteJob);
// Get processor status
router.get('/processor/status', priceMatching_controller_1.getProcessorStatus);
// Test local match for single item (instant test)
router.post('/test/local', priceMatching_controller_1.testLocalMatch);
exports.default = router;
