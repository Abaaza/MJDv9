"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadAndProcessBOQ = uploadAndProcessBOQ;
exports.getJobStatus = getJobStatus;
exports.getJobLogs = getJobLogs;
exports.cancelJob = cancelJob;
const convex_1 = require("../config/convex");
const api_1 = require("../../../convex/_generated/api");
const excel_service_1 = require("../services/excel.service");
const jobPolling_service_1 = require("../services/jobPolling.service");
const convexId_1 = require("../utils/convexId");
const fileStorage_service_1 = require("../services/fileStorage.service");
const activityLogger_1 = require("../utils/activityLogger");
const logStorage_service_1 = require("../services/logStorage.service");
const convex = (0, convex_1.getConvexClient)();
const excelService = new excel_service_1.ExcelService();
const jobPollingService = new jobPolling_service_1.JobPollingService();
// Helper function to sanitize field names for Convex
function sanitizeFieldName(name) {
    return name.replace(/[^\x20-\x7E]/g, '_')
        .replace(/[Â£$â‚¬Â¥Â¢]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}
// Helper function to sanitize object keys
function sanitizeObjectKeys(obj) {
    if (!obj || typeof obj !== 'object') {
        return {};
    }
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = sanitizeFieldName(key);
        sanitized[sanitizedKey] = value;
    }
    return sanitized;
}
async function uploadAndProcessBOQ(req, res) {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        // Parse the Excel file
        const parseResult = await excelService.parseExcelFile(req.file.buffer, req.file.originalname);
        if (parseResult.totalItems === 0) {
            res.status(400).json({ error: 'No valid items found in the Excel file' });
            return;
        }
        // Store the original file for later use in export
        const fileId = await fileStorage_service_1.fileStorage.saveFile(req.file.buffer, req.file.originalname);
        console.log(`[Upload] Stored original Excel file with ID: ${fileId}`);
        // Get items from all sheets
        const allItems = parseResult.sheets.flatMap(sheet => sheet.items);
        const firstSheet = parseResult.sheets[0];
        // Include all items (both with and without quantities for context headers)
        const itemsWithQuantities = allItems.filter(item => item.quantity !== undefined &&
            item.quantity !== null &&
            item.quantity > 0);
        // Create a matching job
        const jobId = await convex.mutation(api_1.api.priceMatching.createJob, {
            userId: (0, convexId_1.toConvexId)(req.user.id),
            fileName: req.file.originalname,
            fileBuffer: [],
            itemCount: itemsWithQuantities.length,
            matchingMethod: req.body.matchingMethod || 'LOCAL',
            projectId: req.body.projectId ? (0, convexId_1.toConvexId)(req.body.projectId) : undefined,
            originalFileId: fileId,
            headers: firstSheet.headers || [],
            sheetName: firstSheet.sheetName || 'Sheet1',
        });
        // Process all items with row information
        const itemsToProcess = allItems.map((item, index) => ({
            description: item.description,
            quantity: item.quantity || 0,
            unit: item.unit || '',
            rowIndex: item.rowNumber || index,
            originalRowData: sanitizeObjectKeys(item.originalData || {})
        }));
        // Start processing job asynchronously
        await jobPollingService.createJob(jobId, req.user.id, itemsToProcess, req.body.matchingMethod || 'LOCAL');
        // Log activity
        await (0, activityLogger_1.logActivity)(req, 'create', 'job', jobId, `Uploaded BOQ file: ${req.file.originalname}`);
        res.json({
            jobId,
            message: 'File uploaded successfully. Processing started.',
            itemCount: itemsWithQuantities.length,
            totalRows: allItems.length
        });
    }
    catch (error) {
        console.error('Upload BOQ error:', error);
        res.status(500).json({ error: error.message || 'Failed to upload file' });
    }
}
async function getJobStatus(req, res) {
    try {
        const { jobId } = req.params;
        const status = await jobPollingService.getJobStatus(jobId);
        if (!status) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }
        res.json(status);
    }
    catch (error) {
        console.error('Get job status error:', error);
        res.status(500).json({ error: 'Failed to get job status' });
    }
}
async function getJobLogs(req, res) {
    try {
        const { jobId } = req.params;
        // Get logs from memory - no Convex calls, no 429 errors!
        const logs = logStorage_service_1.logStorage.getLogs(jobId);
        // Also get the current progress
        const progress = logStorage_service_1.logStorage.getProgress(jobId);
        // Debug logging - disabled to reduce verbosity
        // console.log(`[API] Fetched ${logs.length} logs for job ${jobId} from memory`);
        res.json({
            logs,
            progress,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Get job logs error:', error);
        res.status(500).json({ error: 'Failed to get job logs' });
    }
}
async function cancelJob(req, res) {
    try {
        const { jobId } = req.params;
        await jobPollingService.cancelJob(jobId);
        res.json({ message: 'Job cancelled successfully' });
    }
    catch (error) {
        console.error('Cancel job error:', error);
        res.status(500).json({ error: 'Failed to cancel job' });
    }
}
