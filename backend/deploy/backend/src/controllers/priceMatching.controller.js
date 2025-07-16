"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserJobs = getUserJobs;
exports.getAllJobs = getAllJobs;
exports.uploadBOQ = uploadBOQ;
exports.uploadAndMatch = uploadAndMatch;
exports.startMatching = startMatching;
exports.getJobStatus = getJobStatus;
exports.getMatchResults = getMatchResults;
exports.updateMatchResult = updateMatchResult;
exports.exportResults = exportResults;
exports.stopJob = stopJob;
exports.autoSaveResult = autoSaveResult;
exports.runMatch = runMatch;
exports.deleteJob = deleteJob;
exports.getProcessorStatus = getProcessorStatus;
exports.testLocalMatch = testLocalMatch;
exports.stopAllJobs = stopAllJobs;
const convex_1 = require("../config/convex");
const api_1 = require("../../../convex/_generated/api");
const excel_service_1 = require("../services/excel.service");
const matching_service_1 = require("../services/matching.service");
const jobProcessor_service_1 = require("../services/jobProcessor.service");
const convexId_1 = require("../utils/convexId");
const uuid_1 = require("uuid");
const fileStorage_service_1 = require("../services/fileStorage.service");
const activityLogger_1 = require("../utils/activityLogger");
const convex = (0, convex_1.getConvexClient)();
const excelService = new excel_service_1.ExcelService();
const matchingService = matching_service_1.MatchingService.getInstance();
// Helper function to sanitize field names for Convex
function sanitizeFieldName(name) {
    // Replace non-ASCII and special characters with underscores
    return name.replace(/[^\x20-\x7E]/g, '_') // Non-ASCII characters
        .replace(/[Â£$â‚¬Â¥Â¢]/g, '_') // Currency symbols
        .replace(/\s+/g, '_') // Spaces
        .replace(/[^a-zA-Z0-9_]/g, '_') // Other special characters
        .replace(/_+/g, '_') // Multiple underscores
        .replace(/^_|_$/g, ''); // Leading/trailing underscores
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
async function getUserJobs(req, res) {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        const jobs = await convex.query(api_1.api.priceMatching.getUserJobs, {
            userId: (0, convexId_1.toConvexId)(req.user.id),
        });
        res.json(jobs);
    }
    catch (error) {
        console.error('Get user jobs error:', error);
        res.status(500).json({ error: 'Failed to get jobs' });
    }
}
async function getAllJobs(req, res) {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        // Get all jobs from the database
        const jobs = await convex.query(api_1.api.priceMatching.getAllJobs, {});
        res.json(jobs);
    }
    catch (error) {
        console.error('Get all jobs error:', error);
        res.status(500).json({ error: 'Failed to get all jobs' });
    }
}
async function uploadBOQ(req, res) {
    console.log('[UploadBOQ] Request received');
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        console.log('[UploadBOQ] Parsing Excel file:', req.file.originalname);
        // Parse the Excel file
        const parseResult = await excelService.parseExcelFile(req.file.buffer, req.file.originalname);
        if (parseResult.totalItems === 0) {
            res.status(400).json({ error: 'No valid items found in the Excel file' });
            return;
        }
        // Store the original file for later use in export
        const fileId = await fileStorage_service_1.fileStorage.saveFile(req.file.buffer, req.file.originalname);
        console.log(`[UploadBOQ] Stored original Excel file with ID: ${fileId}`);
        // Get items from all sheets
        const allItems = parseResult.sheets.flatMap(sheet => sheet.items);
        const firstSheet = parseResult.sheets[0];
        // Separate items with and without quantities
        const itemsWithQuantities = allItems.filter(item => item.quantity !== undefined &&
            item.quantity !== null &&
            item.quantity > 0);
        console.log('[UploadBOQ] Parsed items:', {
            totalItems: allItems.length,
            itemsWithQuantities: itemsWithQuantities.length,
            sheets: parseResult.sheets.length
        });
        // Create a project if projectName is provided
        let projectId;
        if (req.body.projectName && req.body.clientId) {
            console.log('[UploadBOQ] Creating project:', req.body.projectName);
            projectId = await convex.mutation(api_1.api.projects.create, {
                name: req.body.projectName,
                clientId: (0, convexId_1.toConvexId)(req.body.clientId),
                description: `BOQ matching project for ${req.file.originalname}`,
                status: 'active',
                userId: (0, convexId_1.toConvexId)(req.user.id),
            });
            console.log('[UploadBOQ] Project created with ID:', projectId);
        }
        // Create a matching job
        const jobId = await convex.mutation(api_1.api.priceMatching.createJob, {
            userId: (0, convexId_1.toConvexId)(req.user.id),
            fileName: req.file.originalname,
            // Provide empty array for fileBuffer until Convex schema is updated
            fileBuffer: [],
            itemCount: itemsWithQuantities.length, // Only count items with quantities
            matchingMethod: req.body.matchingMethod || 'LOCAL',
            clientId: req.body.clientId ? (0, convexId_1.toConvexId)(req.body.clientId) : undefined,
            projectId: projectId,
            projectName: req.body.projectName,
            headers: (firstSheet === null || firstSheet === void 0 ? void 0 : firstSheet.headers) || [],
            sheetName: (firstSheet === null || firstSheet === void 0 ? void 0 : firstSheet.sheetName) || 'Sheet1',
            // Use the fileId from storage instead
            fileId: fileId,
        });
        // Store parsed items
        const storedItems = [];
        for (const item of allItems) {
            const sanitizedOriginalData = sanitizeObjectKeys(item.originalData || {});
            const storedItem = {
                jobId: jobId,
                rowNumber: item.rowNumber,
                description: item.description,
                quantity: item.quantity,
                unit: item.unit,
                originalRowData: sanitizedOriginalData,
                contextHeaders: item.contextHeaders || [],
            };
            await convex.mutation(api_1.api.priceMatching.addParsedItem, storedItem);
            storedItems.push(storedItem);
        }
        console.log('[UploadBOQ] Created job:', jobId, 'with', storedItems.length, 'items');
        // Log activity
        await (0, activityLogger_1.logActivity)(req, 'upload_boq', 'aiMatchingJobs', jobId.toString(), `Uploaded ${req.file.originalname} with ${itemsWithQuantities.length} items`);
        res.json({
            jobId: jobId.toString(),
            fileName: req.file.originalname,
            itemCount: itemsWithQuantities.length,
            headers: (firstSheet === null || firstSheet === void 0 ? void 0 : firstSheet.headers) || [],
            items: parseResult.sheets.flatMap(sheet => {
                return sheet.items.map(item => ({
                    index: 0, // Will be set later
                    rowNumber: item.rowNumber,
                    fullText: item.description,
                    description: item.description,
                    quantity: item.quantity,
                    unit: item.unit,
                    type: item.quantity ? 'item' : 'header',
                    contextHeaders: item.contextHeaders || []
                }));
            }).map((item, index) => ({ ...item, index: index + 1 })),
        });
    }
    catch (error) {
        console.error('[UploadBOQ] Error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to upload BOQ' });
    }
}
async function uploadAndMatch(req, res) {
    const requestId = (0, uuid_1.v4)().substring(0, 8);
    console.log(`[UploadAndMatch-${requestId}] Starting upload and match process`);
    const startTime = Date.now();
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        const { matchingMethod = 'LOCAL', clientName = 'Default Client', clientId, projectName } = req.body;
        const userId = req.user.id;
        console.log(`[${requestId}] Parameters:`, {
            fileName: req.file.originalname,
            fileSize: req.file.size,
            matchingMethod,
            clientName,
            userId
        });
        // Helper function to generate detailed preview items
        function generatePreviewItems(items) {
            return items.map((item, index) => {
                // For context headers, just show the description
                // For BOQ items, show description with quantity/unit
                let fullText = item.description;
                // Add quantity and unit if available (for BOQ items)
                if (item.quantity && item.unit) {
                    fullText += ` - ${item.quantity} ${item.unit}`;
                }
                // Determine the type of item
                let itemType = 'item'; // default
                if (!item.quantity || item.quantity === 0) {
                    // Check what kind of header this is
                    if (item.description.match(/^(BILL|SUB-BILL)/i)) {
                        itemType = 'major-header';
                    }
                    else if (item.description.match(/^[A-Z]\d+\s/i)) {
                        itemType = 'section-header';
                    }
                    else if (item.description.match(/^(NOTE|Extra over|Earthwork|Disposal|Excavated|Filling)/i)) {
                        itemType = 'sub-header';
                    }
                    else {
                        itemType = 'context-header';
                    }
                }
                return {
                    index: index + 1,
                    rowNumber: item.rowNumber,
                    fullText: fullText,
                    description: item.description,
                    quantity: item.quantity,
                    unit: item.unit,
                    type: itemType,
                    contextHeaders: item.contextHeaders || []
                };
            });
        }
        console.log(`[${requestId}] Step 0: Validating matching method...`);
        if (!['LOCAL', 'COHERE', 'OPENAI'].includes(matchingMethod)) {
            res.status(400).json({ error: 'Invalid matching method' });
            return;
        }
        // Add a timeout for the entire operation
        const operationTimeout = setTimeout(() => {
            console.error(`[${requestId}] Operation timeout after 2 minutes`);
            if (!res.headersSent) {
                res.status(504).json({ error: 'Operation timeout. Please try uploading a smaller file or contact support.' });
            }
        }, 120000); // 2 minute timeout
        console.log(`[${requestId}] Step 1: Starting Excel file parsing...`);
        const parseStartTime = Date.now();
        // Parse the Excel file
        const parseResult = await excelService.parseExcelFile(req.file.buffer, req.file.originalname);
        // Store the original file for later use in export
        const fileId = await fileStorage_service_1.fileStorage.saveFile(req.file.buffer, req.file.originalname);
        console.log(`[${requestId}] Stored original Excel file with ID: ${fileId}`);
        const parseEndTime = Date.now();
        console.log(`[${requestId}] Step 1 Complete: Excel parsing took ${parseEndTime - parseStartTime}ms`);
        console.log(`[${requestId}] Parse result:`, {
            sheetsCount: parseResult.sheets.length,
            totalItems: parseResult.totalItems,
            fileName: parseResult.fileName,
            sheets: parseResult.sheets.map(s => ({
                name: s.sheetName,
                items: s.items.length,
                headers: s.headers
            }))
        });
        if (parseResult.totalItems === 0) {
            res.status(400).json({ error: 'No valid items found in the Excel file' });
            return;
        }
        // Get items from all sheets
        const allItems = parseResult.sheets.flatMap(sheet => sheet.items);
        const firstSheet = parseResult.sheets[0];
        // Separate items with and without quantities
        const itemsWithQuantities = allItems.filter(item => item.quantity !== undefined &&
            item.quantity !== null &&
            item.quantity > 0);
        const itemsWithoutQuantities = allItems.filter(item => item.quantity === undefined ||
            item.quantity === null ||
            item.quantity === 0);
        console.log(`[${requestId}] Step 2: Item analysis...`);
        console.log(`[${requestId}] Total items: ${allItems.length}`);
        console.log(`[${requestId}] Items with quantities (will be matched): ${itemsWithQuantities.length}`);
        console.log(`[${requestId}] Items without quantities (context headers): ${itemsWithoutQuantities.length}`);
        console.log(`[${requestId}] Step 3: Creating project and job in database...`);
        const jobCreateStartTime = Date.now();
        // Create a project if projectName is provided
        let projectId;
        if (projectName && clientId) {
            console.log(`[${requestId}] Creating project: ${projectName} for client: ${clientId}`);
            projectId = await convex.mutation(api_1.api.projects.create, {
                name: projectName,
                clientId: (0, convexId_1.toConvexId)(clientId),
                description: `BOQ matching project for ${req.file.originalname}`,
                status: 'active',
                userId: (0, convexId_1.toConvexId)(userId),
            });
            console.log(`[${requestId}] Project created with ID: ${projectId}`);
        }
        // Create a matching job
        const jobId = await convex.mutation(api_1.api.priceMatching.createJob, {
            userId: (0, convexId_1.toConvexId)(userId),
            fileName: req.file.originalname,
            fileBuffer: [],
            itemCount: itemsWithQuantities.length, // Only count items with quantities
            matchingMethod: matchingMethod,
            clientId: clientId ? (0, convexId_1.toConvexId)(clientId) : undefined,
            projectId: projectId,
            projectName: projectName,
            headers: (firstSheet === null || firstSheet === void 0 ? void 0 : firstSheet.headers) || [],
            sheetName: (firstSheet === null || firstSheet === void 0 ? void 0 : firstSheet.sheetName) || 'Sheet1',
            originalFileId: fileId,
        });
        console.log(`[${requestId}] Job created with ID: ${jobId}`);
        const jobCreateEndTime = Date.now();
        console.log(`[${requestId}] Step 3 Complete: Job creation took ${jobCreateEndTime - jobCreateStartTime}ms`);
        console.log(`[${requestId}] Step 4: Preparing items for processing...`);
        const prepareItemsStartTime = Date.now();
        // Prepare items for processing (no need to store in Convex)
        const preparedItems = allItems.map((item) => {
            const sanitizedOriginalData = sanitizeObjectKeys(item.originalData || {});
            return {
                jobId: jobId.toString(),
                rowNumber: item.rowNumber,
                description: item.description,
                quantity: item.quantity,
                unit: item.unit,
                originalRowData: sanitizedOriginalData,
                contextHeaders: item.contextHeaders || [],
            };
        });
        const prepareItemsEndTime = Date.now();
        console.log(`[${requestId}] Step 4 Complete: Preparing items took ${prepareItemsEndTime - prepareItemsStartTime}ms`);
        console.log(`[${requestId}] Step 5: Adding job to processor queue...`);
        const processorStartTime = Date.now();
        // Add job to processor queue with all parsed items
        await jobProcessor_service_1.jobProcessor.addJob(jobId.toString(), userId.toString(), preparedItems, matchingMethod);
        const processorEndTime = Date.now();
        console.log(`[${requestId}] Step 5 Complete: Adding to processor took ${processorEndTime - processorStartTime}ms`);
        // Log activity
        await (0, activityLogger_1.logActivity)(req, 'upload_and_match', 'aiMatchingJobs', jobId.toString(), `Uploaded ${req.file.originalname} with ${itemsWithQuantities.length} items and started ${matchingMethod} matching`);
        const totalEndTime = Date.now();
        console.log(`[${requestId}] Total operation time: ${totalEndTime - startTime}ms`);
        console.log(`[${requestId}] Breakdown:`, {
            parsing: parseEndTime - parseStartTime,
            jobCreation: jobCreateEndTime - jobCreateStartTime,
            itemPreparation: prepareItemsEndTime - prepareItemsStartTime,
            processorQueue: processorEndTime - processorStartTime,
            total: totalEndTime - startTime
        });
        // Clear the timeout since we're done
        clearTimeout(operationTimeout);
        // Return response with preview items
        res.json({
            jobId: jobId.toString(),
            fileName: req.file.originalname,
            itemCount: itemsWithQuantities.length,
            headers: (firstSheet === null || firstSheet === void 0 ? void 0 : firstSheet.headers) || [],
            items: generatePreviewItems(allItems), // Include all items in preview
            startTime: Date.now(),
        });
    }
    catch (error) {
        console.error(`[${requestId}] Upload and match error:`, error);
        console.error(`[${requestId}] Error stack:`, error.stack);
        // Clear the timeout on error
        clearTimeout(operationTimeout);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'Failed to upload and match BOQ' });
        }
    }
}
async function startMatching(req, res) {
    var _a, _b;
    const requestId = (0, uuid_1.v4)();
    console.log(`\n[StartMatching-${requestId}] ========== START MATCHING REQUEST ==========`);
    console.log(`[StartMatching-${requestId}] Time: ${new Date().toISOString()}`);
    console.log(`[StartMatching-${requestId}] User: ${((_a = req.user) === null || _a === void 0 ? void 0 : _a.email) || 'Unknown'} (ID: ${(_b = req.user) === null || _b === void 0 ? void 0 : _b.id})`);
    console.log(`[StartMatching-${requestId}] Job ID: ${req.params.jobId}`);
    console.log(`[StartMatching-${requestId}] Method: ${req.body.matchingMethod}`);
    console.log(`[StartMatching-${requestId}] Full request body:`, JSON.stringify(req.body, null, 2));
    try {
        const { jobId } = req.params;
        const { matchingMethod } = req.body;
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        // Get the job
        console.log('[StartMatching] Fetching job from Convex:', jobId);
        const job = await convex.query(api_1.api.priceMatching.getJob, { jobId: (0, convexId_1.toConvexId)(jobId) });
        if (!job) {
            console.error('[StartMatching] Job not found:', jobId);
            res.status(404).json({ error: 'Job not found' });
            return;
        }
        if (job.userId !== req.user.id) {
            res.status(403).json({ error: 'Access denied' });
            return;
        }
        console.log('[StartMatching] Job found:', {
            jobId,
            userId: job.userId,
            itemCount: job.itemCount,
            status: job.status
        });
        // Get parsed items from the job
        console.log(`[StartMatching-${requestId}] Fetching parsed items from database...`);
        const parsedItems = await convex.query(api_1.api.priceMatching.getParsedItems, {
            jobId: (0, convexId_1.toConvexId)(jobId),
        });
        console.log(`[StartMatching-${requestId}] Found ${parsedItems.length} parsed items`);
        if (parsedItems.length > 0) {
            const itemsWithQty = parsedItems.filter(item => item.quantity && item.quantity > 0).length;
            const contextHeaders = parsedItems.filter(item => !item.quantity || item.quantity === 0).length;
            console.log(`[StartMatching-${requestId}] Items breakdown:`);
            console.log(`[StartMatching-${requestId}]   - Items with quantity: ${itemsWithQty}`);
            console.log(`[StartMatching-${requestId}]   - Context headers: ${contextHeaders}`);
            console.log(`[StartMatching-${requestId}] First 3 items:`, parsedItems.slice(0, 3).map(item => ({
                row: item.rowNumber,
                desc: item.description.substring(0, 50) + '...',
                qty: item.quantity,
                unit: item.unit
            })));
        }
        if (parsedItems.length === 0) {
            console.error('[StartMatching] No parsed items found for job:', jobId);
            res.status(400).json({ error: 'No items found for this job' });
            return;
        }
        // Add job to processor queue
        console.log(`[StartMatching-${requestId}] Checking processor status before adding job...`);
        console.log(`[StartMatching-${requestId}] Processor status:`, jobProcessor_service_1.jobProcessor.getQueueStatus());
        console.log(`[StartMatching-${requestId}] Adding job to processor queue:`, {
            jobId,
            userId: req.user.id,
            itemCount: parsedItems.length,
            method: matchingMethod
        });
        await jobProcessor_service_1.jobProcessor.addJob(jobId, req.user.id.toString(), parsedItems, matchingMethod);
        console.log(`[StartMatching-${requestId}] Job added successfully to processor`);
        console.log(`[StartMatching-${requestId}] Processor status after:`, jobProcessor_service_1.jobProcessor.getQueueStatus());
        console.log(`[StartMatching-${requestId}] ========== REQUEST COMPLETE ==========\n`);
        res.json({
            success: true,
            message: 'Matching started',
            jobId,
        });
    }
    catch (error) {
        console.error('[StartMatching] Error:', error);
        res.status(500).json({ error: 'Failed to start matching' });
    }
}
async function getJobStatus(req, res) {
    var _a, _b;
    console.log('[GetJobStatus] Request for job:', req.params.jobId);
    try {
        const { jobId } = req.params;
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        // First check in-memory status from job processor
        const inMemoryJob = jobProcessor_service_1.jobProcessor.getJobStatus(jobId);
        console.log('[GetJobStatus] In-memory job status:', inMemoryJob ? {
            status: inMemoryJob.status,
            progress: inMemoryJob.progress,
            matchedCount: inMemoryJob.matchedCount,
            progressMessage: inMemoryJob.progressMessage
        } : 'Not found in memory');
        const job = await convex.query(api_1.api.priceMatching.getJob, { jobId: (0, convexId_1.toConvexId)(jobId) });
        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }
        console.log('[GetJobStatus] Database job status:', {
            status: job.status,
            progress: job.progress,
            matchedCount: job.matchedCount,
            progressMessage: job.progressMessage
        });
        if (job.userId !== req.user.id && req.user.role !== 'admin') {
            res.status(403).json({ error: 'Access denied' });
            return;
        }
        // Merge in-memory status with database status
        // In-memory status takes precedence for active jobs
        const status = {
            _id: job._id,
            status: (inMemoryJob === null || inMemoryJob === void 0 ? void 0 : inMemoryJob.status) || job.status,
            progress: (_a = inMemoryJob === null || inMemoryJob === void 0 ? void 0 : inMemoryJob.progress) !== null && _a !== void 0 ? _a : job.progress,
            progressMessage: (inMemoryJob === null || inMemoryJob === void 0 ? void 0 : inMemoryJob.progressMessage) || job.progressMessage,
            itemCount: (inMemoryJob === null || inMemoryJob === void 0 ? void 0 : inMemoryJob.itemCount) || job.itemCount,
            matchedCount: (_b = inMemoryJob === null || inMemoryJob === void 0 ? void 0 : inMemoryJob.matchedCount) !== null && _b !== void 0 ? _b : job.matchedCount,
            error: job.error,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
        };
        console.log('[GetJobStatus] Merged status:', {
            status: status.status,
            progress: status.progress,
            matchedCount: status.matchedCount,
            progressMessage: status.progressMessage
        });
        res.json(status);
    }
    catch (error) {
        console.error('[GetJobStatus] Error:', error);
        res.status(500).json({ error: 'Failed to get job status' });
    }
}
async function getMatchResults(req, res) {
    console.log('[GetMatchResults] Request for job:', req.params.jobId);
    try {
        const { jobId } = req.params;
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        // Get the job to check ownership
        const job = await convex.query(api_1.api.priceMatching.getJob, { jobId: (0, convexId_1.toConvexId)(jobId) });
        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }
        if (job.userId !== req.user.id && req.user.role !== 'admin') {
            res.status(403).json({ error: 'Access denied' });
            return;
        }
        // Get results
        const results = await convex.query(api_1.api.priceMatching.getMatchResults, {
            jobId: (0, convexId_1.toConvexId)(jobId),
        });
        console.log('[GetMatchResults] Found results:', results.length);
        res.json(results);
    }
    catch (error) {
        console.error('[GetMatchResults] Error:', error);
        res.status(500).json({ error: 'Failed to get match results' });
    }
}
async function updateMatchResult(req, res) {
    console.log('[UpdateMatchResult] Request received for resultId:', req.params.resultId);
    console.log('[UpdateMatchResult] Updates:', req.body);
    try {
        const { resultId } = req.params;
        const updates = req.body;
        if (!req.user) {
            console.error('[UpdateMatchResult] No user in request');
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        console.log('[UpdateMatchResult] User:', req.user.id);
        // Get the result to check ownership
        const result = await convex.query(api_1.api.priceMatching.getMatchResult, {
            resultId: (0, convexId_1.toConvexId)(resultId),
        });
        if (!result) {
            console.error('[UpdateMatchResult] Result not found:', resultId);
            res.status(404).json({ error: 'Result not found' });
            return;
        }
        console.log('[UpdateMatchResult] Found result, jobId:', result.jobId);
        // Get the job to check ownership
        const job = await convex.query(api_1.api.priceMatching.getJob, {
            jobId: result.jobId,
        });
        if (!job || (job.userId !== req.user.id && req.user.role !== 'admin')) {
            console.error('[UpdateMatchResult] Access denied. Job:', job ? 'exists' : 'not found', 'userId:', job === null || job === void 0 ? void 0 : job.userId, 'requestUserId:', req.user.id);
            res.status(403).json({ error: 'Access denied' });
            return;
        }
        console.log('[UpdateMatchResult] Updating result with mutation...');
        console.log('[UpdateMatchResult] User ID to convert:', req.user.id);
        try {
            // Update the result
            await convex.mutation(api_1.api.priceMatching.updateMatchResult, {
                userId: req.user.id,
                resultId: (0, convexId_1.toConvexId)(resultId),
                updates: {
                    matchedDescription: updates.matchedDescription,
                    matchedCode: updates.matchedCode,
                    matchedUnit: updates.matchedUnit,
                    matchedRate: updates.matchedRate,
                    confidence: updates.confidence,
                    totalPrice: updates.totalPrice,
                    notes: updates.notes,
                    isManuallyEdited: updates.isManuallyEdited,
                    matchMethod: updates.matchMethod,
                },
                userId: (0, convexId_1.toConvexId)(req.user.id),
            });
            console.log('[UpdateMatchResult] Mutation completed successfully');
        }
        catch (mutationError) {
            console.error('[UpdateMatchResult] Mutation error:', {
                error: mutationError,
                resultId,
                userId: req.user.id,
                updates
            });
            throw mutationError;
        }
        // Log activity
        await (0, activityLogger_1.logActivity)(req, 'update_match', 'matchResults', resultId, 'Updated match result');
        res.json({ success: true });
    }
    catch (error) {
        console.error('[UpdateMatchResult] Error details:', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            fullError: error
        });
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update match result' });
    }
}
async function exportResults(req, res) {
    try {
        const { jobId } = req.params;
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        // Get the job
        const job = await convex.query(api_1.api.priceMatching.getJob, { jobId: (0, convexId_1.toConvexId)(jobId) });
        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }
        if (job.userId !== req.user.id && req.user.role !== 'admin') {
            res.status(403).json({ error: 'Access denied' });
            return;
        }
        // Get results
        const results = await convex.query(api_1.api.priceMatching.getMatchResults, {
            jobId: (0, convexId_1.toConvexId)(jobId),
        });
        // Get original file
        const originalFile = await fileStorage_service_1.fileStorage.getFile(job.originalFileId);
        if (!originalFile) {
            res.status(404).json({ error: 'Original file not found' });
            return;
        }
        // Export to Excel
        const exportBuffer = await excelService.exportMatchResults(originalFile, results, {
            matchingMethod: job.matchingMethod,
            matchedCount: job.matchedCount,
            itemCount: job.itemCount,
        });
        // Log activity
        await (0, activityLogger_1.logActivity)(req, 'export_results', 'aiMatchingJobs', jobId, 'Exported match results');
        // Send file
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="matched_${job.fileName}"`);
        res.send(exportBuffer);
    }
    catch (error) {
        console.error('Export results error:', error);
        res.status(500).json({ error: 'Failed to export results' });
    }
}
async function stopJob(req, res) {
    try {
        const { jobId } = req.params;
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        // Get the job to check ownership
        const job = await convex.query(api_1.api.priceMatching.getJob, { jobId: (0, convexId_1.toConvexId)(jobId) });
        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }
        if (job.userId !== req.user.id && req.user.role !== 'admin') {
            res.status(403).json({ error: 'Access denied' });
            return;
        }
        // Cancel the job in the processor
        const cancelled = await jobProcessor_service_1.jobProcessor.cancelJob(jobId);
        if (cancelled) {
            // Update job status in database
            await convex.mutation(api_1.api.priceMatching.updateJobStatus, {
                jobId: (0, convexId_1.toConvexId)(jobId),
                status: 'failed',
                error: 'Job cancelled by user',
            });
            // Log activity
            await (0, activityLogger_1.logActivity)(req, 'stop_job', 'aiMatchingJobs', jobId, 'Stopped matching job');
            res.json({ success: true, message: 'Job stopped' });
        }
        else {
            res.status(400).json({ error: 'Job not found or already completed' });
        }
    }
    catch (error) {
        console.error('Stop job error:', error);
        res.status(500).json({ error: 'Failed to stop job' });
    }
}
async function autoSaveResult(req, res) {
    try {
        const { resultId } = req.params;
        const updates = req.body;
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        // Get the result to check ownership
        const result = await convex.query(api_1.api.priceMatching.getMatchResult, {
            resultId: (0, convexId_1.toConvexId)(resultId),
        });
        if (!result) {
            res.status(404).json({ error: 'Result not found' });
            return;
        }
        // Get the job to check ownership
        const job = await convex.query(api_1.api.priceMatching.getJob, {
            jobId: result.jobId,
        });
        if (!job || (job.userId !== req.user.id && req.user.role !== 'admin')) {
            res.status(403).json({ error: 'Access denied' });
            return;
        }
        // Update the result (autosave doesn't change isManuallyEdited)
        await convex.mutation(api_1.api.priceMatching.updateMatchResult, {
            userId: req.user.id,
            resultId: (0, convexId_1.toConvexId)(resultId),
            updates: {
                matchedDescription: updates.matchedDescription,
                matchedCode: updates.matchedCode,
                matchedUnit: updates.matchedUnit,
                matchedRate: updates.matchedRate,
                confidence: updates.confidence,
                totalPrice: updates.totalPrice,
                notes: updates.notes,
            },
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Autosave error:', error);
        res.status(500).json({ error: 'Failed to autosave' });
    }
}
async function runMatch(req, res) {
    try {
        const { resultId } = req.params;
        const { method = 'LOCAL' } = req.body;
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        // Get the result
        const result = await convex.query(api_1.api.priceMatching.getMatchResult, {
            resultId: (0, convexId_1.toConvexId)(resultId),
        });
        if (!result) {
            res.status(404).json({ error: 'Result not found' });
            return;
        }
        // Get the job to check ownership
        const job = await convex.query(api_1.api.priceMatching.getJob, {
            jobId: result.jobId,
        });
        if (!job || (job.userId !== req.user.id && req.user.role !== 'admin')) {
            res.status(403).json({ error: 'Access denied' });
            return;
        }
        // Get price items
        const priceItems = await convex.query(api_1.api.priceItems.getActive);
        // Run matching
        const matchResult = await matchingService.matchItem(result.originalDescription, method, priceItems, result.contextHeaders || []);
        // Update the result
        await convex.mutation(api_1.api.priceMatching.updateMatchResult, {
            userId: req.user.id,
            resultId: (0, convexId_1.toConvexId)(resultId),
            updates: {
                matchedItemId: matchResult.matchedItemId,
                matchedDescription: matchResult.matchedDescription,
                matchedCode: matchResult.matchedCode,
                matchedUnit: matchResult.matchedUnit,
                matchedRate: matchResult.matchedRate,
                confidence: matchResult.confidence,
                totalPrice: (result.originalQuantity || 0) * (matchResult.matchedRate || 0),
                matchMethod: method,
            },
        });
        res.json({ success: true, matchResult });
    }
    catch (error) {
        console.error('Run match error:', error);
        res.status(500).json({ error: 'Failed to run match' });
    }
}
async function deleteJob(req, res) {
    try {
        const { jobId } = req.params;
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        // Get the job to check ownership
        const job = await convex.query(api_1.api.priceMatching.getJob, { jobId: (0, convexId_1.toConvexId)(jobId) });
        if (!job) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }
        if (job.userId !== req.user.id && req.user.role !== 'admin') {
            res.status(403).json({ error: 'Access denied' });
            return;
        }
        // Delete all match results for this job
        await convex.mutation(api_1.api.priceMatching.deleteJobResults, {
            jobId: (0, convexId_1.toConvexId)(jobId),
        });
        // Delete the job
        await convex.mutation(api_1.api.priceMatching.deleteJob, {
            jobId: (0, convexId_1.toConvexId)(jobId),
        });
        // Log activity
        await (0, activityLogger_1.logActivity)(req, 'delete_job', 'aiMatchingJobs', jobId, 'Deleted matching job');
        res.json({ success: true });
    }
    catch (error) {
        console.error('Delete job error:', error);
        res.status(500).json({ error: 'Failed to delete job' });
    }
}
async function getProcessorStatus(req, res) {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        const status = jobProcessor_service_1.jobProcessor.getQueueStatus();
        res.json(status);
    }
    catch (error) {
        console.error('Get processor status error:', error);
        res.status(500).json({ error: 'Failed to get processor status' });
    }
}
async function testLocalMatch(req, res) {
    console.log('[TestLocalMatch] Request received:', { description: req.body.description });
    try {
        const { description } = req.body;
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        if (!description) {
            res.status(400).json({ error: 'Description is required' });
            return;
        }
        console.log(`[TestLocalMatch] Testing local match for: "${description}"`);
        // Get all active price items for matching
        console.log('[TestLocalMatch] Fetching price items from Convex...');
        const priceItems = await convex.query(api_1.api.priceItems.getActive);
        console.log('[TestLocalMatch] Found price items:', (priceItems === null || priceItems === void 0 ? void 0 : priceItems.length) || 0);
        if (!priceItems || priceItems.length === 0) {
            console.error('[TestLocalMatch] No price items found in database');
            res.status(500).json({ error: 'No price items available for matching' });
            return;
        }
        // Run local match test
        console.log('[TestLocalMatch] Running match with matching service...');
        const matchResult = await matchingService.matchItem(description, 'LOCAL', priceItems, [] // No context headers for instant test
        );
        console.log('[TestLocalMatch] Match result:', matchResult);
        // For now, return just the best match as an array
        const matches = [{
                description: matchResult.matchedDescription,
                code: matchResult.matchedCode,
                unit: matchResult.matchedUnit,
                rate: matchResult.matchedRate,
                confidence: matchResult.confidence,
            }];
        console.log(`[TestLocalMatch] Local test complete. Found 1 match`);
        res.json({
            matches: matches,
            bestMatch: matchResult,
        });
    }
    catch (error) {
        console.error('[TestLocalMatch] Error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to test local match' });
    }
}
async function stopAllJobs(req, res) {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        // Only allow admins or the user to stop their own jobs
        // For now, let's allow any authenticated user to stop all running jobs
        console.log(`[StopAllJobs] User ${req.user.id} requested to stop all running jobs`);
        // Get all running jobs from Convex
        const runningJobs = await convex.query(api_1.api.priceMatching.getRunningJobs, {});
        console.log(`[StopAllJobs] Found ${runningJobs.length} running jobs in Convex`);
        // Cancel all jobs in the processor
        const cancelledCount = await jobProcessor_service_1.jobProcessor.cancelAllJobs();
        console.log(`[StopAllJobs] Cancelled ${cancelledCount} jobs in processor`);
        // Update all running jobs in Convex to failed status
        let convexUpdateCount = 0;
        for (const job of runningJobs) {
            if (job.status !== 'completed' && job.status !== 'failed') {
                try {
                    await convex.mutation(api_1.api.priceMatching.updateJobStatus, {
                        jobId: job._id,
                        status: 'failed',
                        error: 'Job stopped by user (bulk stop)',
                    });
                    convexUpdateCount++;
                }
                catch (error) {
                    console.error(`[StopAllJobs] Failed to update job ${job._id} in Convex:`, error);
                }
            }
        }
        console.log(`[StopAllJobs] Updated ${convexUpdateCount} jobs in Convex`);
        // Log activity
        await (0, activityLogger_1.logActivity)(req, 'stop_all_jobs', 'system', null, `Stopped all running jobs (${cancelledCount} cancelled)`);
        res.json({
            success: true,
            message: `Stopped ${cancelledCount} running jobs`,
            details: {
                processorCancelled: cancelledCount,
                convexUpdated: convexUpdateCount,
            }
        });
    }
    catch (error) {
        console.error('[StopAllJobs] Error:', error);
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to stop all jobs' });
    }
}
