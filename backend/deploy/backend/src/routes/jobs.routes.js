"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const jobPolling_controller_1 = require("../controllers/jobPolling.controller");
const upload_1 = require("../middleware/upload");
const router = (0, express_1.Router)();
// Upload and process BOQ file
router.post('/upload', auth_1.authenticate, upload_1.uploadExcel, jobPolling_controller_1.uploadAndProcessBOQ);
// Get job status
router.get('/:jobId/status', auth_1.authenticate, jobPolling_controller_1.getJobStatus);
// Get job logs
router.get('/:jobId/logs', auth_1.authenticate, jobPolling_controller_1.getJobLogs);
// Cancel job
router.post('/:jobId/cancel', auth_1.authenticate, jobPolling_controller_1.cancelJob);
exports.default = router;
