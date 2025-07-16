"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const upload_1 = require("../middleware/upload");
const projects_controller_1 = require("../controllers/projects.controller");
const router = (0, express_1.Router)();
// All project routes require authentication
router.use(auth_1.authenticate);
// Upload BOQ file for a specific project
router.post('/upload', upload_1.uploadExcel, projects_controller_1.uploadForProject);
// Upload and match BOQ for a specific project in one step
router.post('/upload-and-match', upload_1.uploadExcel, projects_controller_1.uploadAndMatchForProject);
// Get all matching jobs for a specific project
router.get('/:projectId/jobs', projects_controller_1.getProjectJobs);
// Export project job results to Excel
router.get('/jobs/:jobId/export', projects_controller_1.exportProjectResults);
// Link existing job to a project
router.post('/jobs/:jobId/link', projects_controller_1.linkJobToProject);
// Unlink job from project
router.delete('/jobs/:jobId/link', projects_controller_1.unlinkJobFromProject);
exports.default = router;
