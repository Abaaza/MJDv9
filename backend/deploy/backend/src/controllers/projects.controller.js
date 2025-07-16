"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadForProject = uploadForProject;
exports.uploadAndMatchForProject = uploadAndMatchForProject;
exports.exportProjectResults = exportProjectResults;
exports.getProjectJobs = getProjectJobs;
exports.linkJobToProject = linkJobToProject;
exports.unlinkJobFromProject = unlinkJobFromProject;
const excel_service_1 = require("../services/excel.service");
const convex_1 = require("../config/convex");
const api_1 = require("../../../convex/_generated/api");
const convexId_1 = require("../utils/convexId");
const matching_service_1 = require("../services/matching.service");
const batch_1 = require("../utils/batch");
const logger_1 = require("../utils/logger");
const convex = (0, convex_1.getConvexClient)();
const excelService = new excel_service_1.ExcelService();
const matchingService = matching_service_1.MatchingService.getInstance();
async function uploadForProject(req, res) {
    var _a, _b, _c, _d;
    try {
        logger_1.projectLogger.info('Upload for project started', {
            projectId: req.body.projectId,
            fileName: (_a = req.file) === null || _a === void 0 ? void 0 : _a.originalname,
            fileSize: (_b = req.file) === null || _b === void 0 ? void 0 : _b.size
        });
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }
        const projectId = req.body.projectId;
        if (!projectId) {
            res.status(400).json({ error: 'Project ID is required' });
            return;
        }
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        // Get project details
        const project = await convex.query(api_1.api.projects.get, {
            id: (0, convexId_1.toConvexId)(projectId)
        });
        if (!project) {
            res.status(404).json({ error: 'Project not found' });
            return;
        }
        // Parse Excel file
        let excelData;
        try {
            excelData = await excelService.parseExcelFile(req.file.buffer, req.file.originalname);
        }
        catch (error) {
            logger_1.projectLogger.error('Excel parsing error', {
                error: error instanceof Error ? error.message : 'Unknown error',
                fileName: req.file.originalname
            });
            res.status(400).json({
                error: error instanceof Error ? error.message : 'Failed to parse Excel file'
            });
            return;
        }
        // Create job with project context
        const jobId = await convex.mutation(api_1.api.priceMatching.createJob, {
            userId: (0, convexId_1.toConvexId)(req.user.id),
            fileName: req.file.originalname,
            itemCount: excelData.totalItems,
            matchingMethod: 'LOCAL',
            projectId: (0, convexId_1.toConvexId)(projectId),
            projectName: project.name,
            headers: (_c = excelData.sheets[0]) === null || _c === void 0 ? void 0 : _c.headers,
            sheetName: (_d = excelData.sheets[0]) === null || _d === void 0 ? void 0 : _d.sheetName
        });
        // Store BOQ items from all sheets using batch processing
        const allItems = excelData.sheets.flatMap(sheet => sheet.items);
        const batchResults = await (0, batch_1.processBatch)(allItems, 10, // Process 10 items at a time
        async (item) => {
            return await convex.mutation(api_1.api.priceMatching.createMatchResult, {
                jobId: (0, convexId_1.toConvexId)(jobId),
                rowNumber: item.rowNumber,
                originalDescription: item.description,
                originalQuantity: item.quantity,
                originalUnit: item.unit,
                originalRowData: item.originalData,
                confidence: 0,
                matchMethod: 'pending'
            });
        });
        if (batchResults.failed.length > 0) {
            logger_1.projectLogger.warn('Failed to store some BOQ items', {
                failedCount: batchResults.failed.length,
                totalCount: allItems.length,
                jobId
            });
        }
        logger_1.projectLogger.info('Upload for project completed successfully', {
            jobId,
            itemCount: excelData.totalItems,
            projectId,
            projectName: project.name
        });
        res.json({
            jobId,
            itemCount: excelData.totalItems,
            fileName: req.file.originalname,
            projectId,
            projectName: project.name
        });
    }
    catch (error) {
        logger_1.projectLogger.error('Upload for project error:', error);
        res.status(500).json({ error: 'Failed to upload BOQ for project' });
    }
}
async function uploadAndMatchForProject(req, res) {
    var _a, _b;
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }
        const projectId = req.body.projectId;
        if (!projectId) {
            res.status(400).json({ error: 'Project ID is required' });
            return;
        }
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        // Get project details
        const project = await convex.query(api_1.api.projects.get, {
            id: (0, convexId_1.toConvexId)(projectId)
        });
        if (!project) {
            res.status(404).json({ error: 'Project not found' });
            return;
        }
        // Parse Excel file
        let excelData;
        try {
            excelData = await excelService.parseExcelFile(req.file.buffer, req.file.originalname);
        }
        catch (error) {
            logger_1.projectLogger.error('Excel parsing error', {
                error: error instanceof Error ? error.message : 'Unknown error',
                fileName: req.file.originalname
            });
            res.status(400).json({
                error: error instanceof Error ? error.message : 'Failed to parse Excel file'
            });
            return;
        }
        // Create job with project context
        const jobId = await convex.mutation(api_1.api.priceMatching.createJob, {
            userId: (0, convexId_1.toConvexId)(req.user.id),
            fileName: req.file.originalname,
            itemCount: excelData.totalItems,
            matchingMethod: 'LOCAL',
            projectId: (0, convexId_1.toConvexId)(projectId),
            projectName: project.name,
            headers: (_a = excelData.sheets[0]) === null || _a === void 0 ? void 0 : _a.headers,
            sheetName: (_b = excelData.sheets[0]) === null || _b === void 0 ? void 0 : _b.sheetName
        });
        // Update job status to processing
        await convex.mutation(api_1.api.priceMatching.updateJobStatus, {
            jobId: (0, convexId_1.toConvexId)(jobId),
            status: 'matching',
            progress: 0
        });
        // Get price list items for matching
        const priceItems = await convex.query(api_1.api.priceItems.getAll, {});
        // Process matches for all items using batch processing
        let processedCount = 0;
        let matchedCount = 0;
        let totalValue = 0;
        const allItems = excelData.sheets.flatMap(sheet => sheet.items);
        // Process items in batches for better performance
        const batchSize = 5;
        for (let i = 0; i < allItems.length; i += batchSize) {
            const batch = allItems.slice(i, i + batchSize);
            // Process batch items in parallel
            const batchPromises = batch.map(async (item) => {
                // Find matches using LOCAL method
                const matchResult = await matchingService.matchItem(item.description, 'LOCAL', priceItems);
                // Use match result
                let matchedItemId = undefined;
                let matchedDescription = undefined;
                let matchedCode = undefined;
                let matchedUnit = undefined;
                let matchedRate = undefined;
                let confidence = 0;
                let itemTotalPrice = 0;
                try {
                    if (matchResult && matchResult.confidence > 0.7) {
                        matchedItemId = matchResult.matchedItemId;
                        matchedDescription = matchResult.matchedDescription;
                        matchedCode = matchResult.matchedCode;
                        matchedUnit = matchResult.matchedUnit;
                        matchedRate = matchResult.matchedRate;
                        confidence = matchResult.confidence;
                        if (item.quantity && matchedRate) {
                            itemTotalPrice = item.quantity * matchedRate;
                        }
                    }
                }
                catch (error) {
                    console.log('No match found for:', item.description);
                }
                // Store match result
                await convex.mutation(api_1.api.priceMatching.createMatchResult, {
                    jobId: (0, convexId_1.toConvexId)(jobId),
                    rowNumber: item.rowNumber,
                    originalDescription: item.description,
                    originalQuantity: item.quantity,
                    originalUnit: item.unit,
                    originalRowData: item.originalData,
                    matchedItemId,
                    matchedDescription,
                    matchedCode,
                    matchedUnit,
                    matchedRate,
                    confidence,
                    matchMethod: 'HYBRID',
                    totalPrice: itemTotalPrice
                });
                return { matched: confidence > 0.7, totalPrice: itemTotalPrice };
            });
            // Wait for batch to complete
            const batchResults = await Promise.all(batchPromises);
            // Update counts
            processedCount += batch.length;
            matchedCount += batchResults.filter(r => r.matched).length;
            totalValue += batchResults.reduce((sum, r) => sum + r.totalPrice, 0);
            // Update job progress
            const progress = Math.round((processedCount / excelData.totalItems) * 100);
            await convex.mutation(api_1.api.priceMatching.updateJobStatus, {
                jobId: (0, convexId_1.toConvexId)(jobId),
                status: 'matching',
                progress,
                progressMessage: `Processing item ${processedCount} of ${excelData.totalItems}`
            });
        }
        // Mark job as completed
        await convex.mutation(api_1.api.priceMatching.updateJobStatus, {
            jobId: (0, convexId_1.toConvexId)(jobId),
            status: 'completed',
            progress: 100
        });
        // Update matched count and total value
        await convex.mutation(api_1.api.priceMatching.updateMatchedCount, {
            jobId: (0, convexId_1.toConvexId)(jobId),
            matchedCount
        });
        await convex.mutation(api_1.api.priceMatching.updateTotalValue, {
            jobId: (0, convexId_1.toConvexId)(jobId),
            totalValue
        });
        // Update project total value if needed
        if (totalValue > 0) {
            const currentProject = await convex.query(api_1.api.projects.getById, {
                _id: (0, convexId_1.toConvexId)(projectId)
            });
            if (currentProject) {
                const newTotalValue = (currentProject.totalValue || 0) + totalValue;
                await convex.mutation(api_1.api.projects.updateTotalValue, {
                    _id: (0, convexId_1.toConvexId)(projectId),
                    totalValue: newTotalValue
                });
            }
        }
        res.json({
            jobId,
            itemCount: excelData.totalItems,
            fileName: req.file.originalname,
            projectId,
            projectName: project.name,
            status: 'completed',
            matchedCount,
            unmatchedCount: excelData.totalItems - matchedCount,
            totalValue
        });
    }
    catch (error) {
        logger_1.projectLogger.error('Upload and match for project error:', error);
        res.status(500).json({ error: 'Failed to process BOQ for project' });
    }
}
async function exportProjectResults(req, res) {
    try {
        const { jobId } = req.params;
        const { includeProjectInfo = true } = req.query;
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        // Get job details
        const job = await convex.query(api_1.api.priceMatching.getJob, { jobId: (0, convexId_1.toConvexId)(jobId) });
        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }
        // Verify user owns this job
        if (job.userId !== req.user.id) {
            res.status(403).json({ error: 'Unauthorized' });
            return;
        }
        // Get all match results
        const results = await convex.query(api_1.api.priceMatching.getMatchResults, {
            jobId: (0, convexId_1.toConvexId)(jobId)
        });
        // Get project info if linked
        let projectInfo = null;
        if (job.projectId && includeProjectInfo === 'true') {
            const project = await convex.query(api_1.api.projects.get, {
                id: (0, convexId_1.toConvexId)(job.projectId)
            });
            if (project) {
                projectInfo = {
                    name: project.name,
                    clientName: project.clientName,
                    description: project.description,
                    status: project.status,
                    totalValue: project.totalValue,
                    currency: 'USD' // Default currency
                };
            }
        }
        // Create Excel with results and project metadata
        const excelBuffer = await excelService.createExcelWithResults(null, // We don't store the original file buffer in Convex
        results, {
            sheets: job.sheetName ? [job.sheetName] : [],
            headers: job.headers || [],
            projectInfo
        });
        // Set response headers
        const fileName = projectInfo
            ? `${projectInfo.name.replace(/[^a-z0-9]/gi, '_')}_${job.fileName}`
            : `matched_${job.fileName}`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(excelBuffer);
    }
    catch (error) {
        logger_1.projectLogger.error('Export project results error:', error);
        res.status(500).json({ error: 'Failed to export project results' });
    }
}
async function getProjectJobs(req, res) {
    try {
        const { projectId } = req.params;
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        // Verify project exists
        const project = await convex.query(api_1.api.projects.get, {
            id: (0, convexId_1.toConvexId)(projectId)
        });
        if (!project) {
            res.status(404).json({ error: 'Project not found' });
            return;
        }
        // Get all jobs for this project
        const jobs = await convex.query(api_1.api.priceMatching.getJobsByProject, {
            projectId: (0, convexId_1.toConvexId)(projectId)
        });
        res.json(jobs);
    }
    catch (error) {
        logger_1.projectLogger.error('Get project jobs error:', error);
        res.status(500).json({ error: 'Failed to get project jobs' });
    }
}
async function linkJobToProject(req, res) {
    try {
        const { jobId } = req.params;
        const { projectId } = req.body;
        if (!projectId) {
            res.status(400).json({ error: 'Project ID is required' });
            return;
        }
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        // Verify job exists and user owns it
        const job = await convex.query(api_1.api.priceMatching.getJob, {
            jobId: (0, convexId_1.toConvexId)(jobId)
        });
        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }
        if (job.userId !== req.user.id && req.user.role !== 'admin') {
            res.status(403).json({ error: 'Unauthorized' });
            return;
        }
        // Verify project exists
        const project = await convex.query(api_1.api.projects.get, {
            id: (0, convexId_1.toConvexId)(projectId)
        });
        if (!project) {
            res.status(404).json({ error: 'Project not found' });
            return;
        }
        // Update job with project reference
        await convex.mutation(api_1.api.priceMatching.linkJobToProject, {
            jobId: (0, convexId_1.toConvexId)(jobId),
            projectId: (0, convexId_1.toConvexId)(projectId),
            projectName: project.name
        });
        res.json({
            success: true,
            message: 'Job linked to project successfully',
            projectName: project.name
        });
    }
    catch (error) {
        logger_1.projectLogger.error('Link job to project error:', error);
        res.status(500).json({ error: 'Failed to link job to project' });
    }
}
async function unlinkJobFromProject(req, res) {
    try {
        const { jobId } = req.params;
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        // Verify job exists and user owns it
        const job = await convex.query(api_1.api.priceMatching.getJob, {
            jobId: (0, convexId_1.toConvexId)(jobId)
        });
        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }
        if (job.userId !== req.user.id && req.user.role !== 'admin') {
            res.status(403).json({ error: 'Unauthorized' });
            return;
        }
        if (!job.projectId) {
            res.status(400).json({ error: 'Job is not linked to any project' });
            return;
        }
        // Remove project reference from job
        await convex.mutation(api_1.api.priceMatching.unlinkJobFromProject, {
            jobId: (0, convexId_1.toConvexId)(jobId)
        });
        res.json({
            success: true,
            message: 'Job unlinked from project successfully'
        });
    }
    catch (error) {
        logger_1.projectLogger.error('Unlink job from project error:', error);
        res.status(500).json({ error: 'Failed to unlink job from project' });
    }
}
