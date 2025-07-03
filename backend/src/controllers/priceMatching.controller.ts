import { Request, Response } from 'express';
import { getConvexClient } from '../config/convex.js';
import { api } from '../../../convex/_generated/api.js';
import { ExcelService } from '../services/excel.service.js';
import { MatchingService } from '../services/matching.service.js';
import { jobProcessor } from '../services/jobProcessor.service.js';
import { toConvexId } from '../utils/convexId.js';
import { v4 as uuidv4 } from 'uuid';
import { fileStorage } from '../services/fileStorage.service.js';

const convex = getConvexClient();
const excelService = new ExcelService();
const matchingService = MatchingService.getInstance();

// Helper function to sanitize field names for Convex
function sanitizeFieldName(name: string): string {
  // Replace non-ASCII and special characters with underscores
  return name.replace(/[^\x20-\x7E]/g, '_') // Non-ASCII characters
    .replace(/[£$€¥¢]/g, '_')                // Currency symbols
    .replace(/\s+/g, '_')                     // Spaces
    .replace(/[^a-zA-Z0-9_]/g, '_')         // Other special characters
    .replace(/_+/g, '_')                      // Multiple underscores
    .replace(/^_|_$/g, '');                   // Leading/trailing underscores
}

// Helper function to sanitize object keys
function sanitizeObjectKeys(obj: Record<string, any>): Record<string, any> {
  if (!obj || typeof obj !== 'object') {
    return {};
  }
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const sanitizedKey = sanitizeFieldName(key);
    sanitized[sanitizedKey] = value;
  }
  return sanitized;
}

export async function getUserJobs(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const jobs = await convex.query(api.priceMatching.getUserJobs, {
      userId: toConvexId<'users'>(req.user.id),
    });

    res.json(jobs);
  } catch (error) {
    console.error('Get user jobs error:', error);
    res.status(500).json({ error: 'Failed to get jobs' });
  }
}

export async function uploadBOQ(req: Request, res: Response): Promise<void> {
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
    const fileId = await fileStorage.saveFile(req.file.buffer, req.file.originalname);
    console.log(`[Upload] Stored original Excel file with ID: ${fileId}`);
    
    // Get items from all sheets
    const allItems = parseResult.sheets.flatMap(sheet => sheet.items);
    const firstSheet = parseResult.sheets[0];
    
    // Separate items with and without quantities
    const itemsWithQuantities = allItems.filter(item => 
      item.quantity !== undefined && 
      item.quantity !== null && 
      item.quantity > 0
    );

    // Create a matching job
    const jobId = await convex.mutation(api.priceMatching.createJob, {
      userId: toConvexId<'users'>(req.user.id),
      fileName: req.file.originalname,
      // Provide empty array for fileBuffer until Convex schema is updated
      fileBuffer: [],
      itemCount: itemsWithQuantities.length, // Only count items with quantities
      matchingMethod: req.body.matchingMethod || 'LOCAL',
      clientId: req.body.clientId ? toConvexId<'clients'>(req.body.clientId) : undefined,
      // Store headers from all sheets (sanitized)
      headers: (parseResult.sheets[0]?.headers || []).map(sanitizeFieldName),
      sheetName: parseResult.sheets[0]?.sheetName || 'Sheet1',
      originalFileId: fileId,
      // sheets - removed until Convex schema is updated
    });

    // Log activity
    await convex.mutation(api.activityLogs.create, {
      userId: toConvexId<'users'>(req.user.id),
      action: 'uploaded_boq',
      entityType: 'aiMatchingJobs',
      entityId: jobId,
      details: `Uploaded ${req.file.originalname} with ${itemsWithQuantities.length} items (${allItems.length - itemsWithQuantities.length} context headers) across ${parseResult.sheets.length} sheets`,
    });

    res.json({
      jobId,
      fileName: req.file.originalname,
      itemCount: itemsWithQuantities.length,
      sheets: parseResult.sheets.map(sheet => ({
        name: sheet.sheetName,
        itemCount: sheet.items.length,
        headers: sheet.headers,
      })),
      items: parseResult.sheets[0]?.items.slice(0, 10) || [], // Preview first 10 items
    });
  } catch (error) {
    console.error('Upload BOQ error:', error);
    res.status(500).json({ error: 'Failed to upload BOQ file' });
  }
}

export async function startMatching(req: Request, res: Response): Promise<void> {
  try {
    const { jobId } = req.params;
    const { matchingMethod } = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Get the job
    const job = await convex.query(api.priceMatching.getJob, { jobId: toConvexId<'aiMatchingJobs'>(jobId) });
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (job.userId !== req.user.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Update job status to parsing
    await convex.mutation(api.priceMatching.updateJobStatus, {
      jobId: toConvexId<'aiMatchingJobs'>(jobId),
      status: 'parsing',
      progress: 10,
      progressMessage: 'Parsing Excel file...',
    });

    // Parse the Excel file again to get items
    // TODO: Fetch file from fileUrl and parse it
    // For now, we'll skip this step since fileBuffer is not stored
    // const buffer = await fetchFileFromUrl(job.fileUrl);
    // const parseResult = await excelService.parseExcelFile(buffer, job.fileName);

    // Store parsed items with full row data from all sheets
    // TODO: Uncomment when file parsing is implemented
    // let allItems: any[] = [];
    // for (const sheet of parseResult.sheets) {
    //   const sheetItems = sheet.items.map(item => ({
    //     rowNumber: item.rowNumber,
    //     description: item.description,
    //     quantity: item.quantity,
    //     unit: item.unit,
    //     originalRowData: item.originalData,
    //     sheetName: sheet.sheetName,
    //     contextHeaders: item.contextHeaders,
    //   }));
    //   allItems = allItems.concat(sheetItems);
    // }

    // TODO: Implement storeParsedItems in Convex backend
    // await convex.mutation(api.priceMatching.storeParsedItems, {
    //   jobId: toConvexId<'aiMatchingJobs'>(jobId),
    //   items: allItems,
    // });

    // Start the matching process (in a real implementation, this would be async)
    // For now, we'll just update the status
    await convex.mutation(api.priceMatching.updateJobStatus, {
      jobId: toConvexId<'aiMatchingJobs'>(jobId),
      status: 'matching',
      progress: 30,
      progressMessage: 'Loading price database...',
    });

    res.json({
      message: 'Matching started',
      jobId,
    });
  } catch (error) {
    console.error('Start matching error:', error);
    res.status(500).json({ error: 'Failed to start matching' });
  }
}

export async function getJobStatus(req: Request, res: Response): Promise<void> {
  try {
    const { jobId } = req.params;

    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const job = await convex.query(api.priceMatching.getJob, { jobId: toConvexId<'aiMatchingJobs'>(jobId) });
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (job.userId !== req.user.id && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json(job);
  } catch (error) {
    console.error('Get job status error:', error);
    res.status(500).json({ error: 'Failed to get job status' });
  }
}

export async function getMatchResults(req: Request, res: Response): Promise<void> {
  try {
    const { jobId } = req.params;
    console.log(`[API] Getting match results for job: ${jobId}`);

    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    console.log(`[API] Querying Convex for job ${jobId} results...`);
    const results = await convex.query(api.priceMatching.getMatchResults, { jobId: toConvexId<'aiMatchingJobs'>(jobId) });
    
    console.log(`[API] Found ${results?.length || 0} results for job ${jobId}`);
    if (results && results.length > 0) {
      console.log(`[API] Sample result:`, {
        rowNumber: results[0].rowNumber,
        hasMatch: !!results[0].matchedDescription,
        confidence: results[0].confidence
      });
    }

    res.json(results);
  } catch (error) {
    console.error('[API] Get match results error:', error);
    res.status(500).json({ error: 'Failed to get match results' });
  }
}

export async function updateMatchResult(req: Request, res: Response): Promise<void> {
  try {
    const { resultId } = req.params;
    const updates = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    await convex.mutation(api.priceMatching.updateMatchResult, {
      resultId: toConvexId<'matchResults'>(resultId),
      updates,
      userId: toConvexId<'users'>(req.user.id),
    });

    res.json({ message: 'Match result updated successfully' });
  } catch (error) {
    console.error('Update match result error:', error);
    res.status(500).json({ error: 'Failed to update match result' });
  }
}

export async function exportResults(req: Request, res: Response): Promise<void> {
  try {
    const { jobId } = req.params;
    console.log(`[API/Export] Starting export for job: ${jobId}`);

    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Get job and results
    console.log(`[API/Export] Fetching job details...`);
    const job = await convex.query(api.priceMatching.getJob, { jobId: toConvexId<'aiMatchingJobs'>(jobId) });
    if (!job) {
      console.error(`[API/Export] Job ${jobId} not found`);
      res.status(404).json({ error: 'Job not found' });
      return;
    }
    console.log(`[API/Export] Job found: ${job.fileName}, status: ${job.status}`);
    console.log(`[API/Export] Original file ID: ${job.originalFileId || 'not found'}`);

    console.log(`[API/Export] Fetching match results...`);
    const results = await convex.query(api.priceMatching.getMatchResults, { jobId: toConvexId<'aiMatchingJobs'>(jobId) });
    console.log(`[API/Export] Found ${results?.length || 0} results to export`);

    if (!results || results.length === 0) {
      console.warn(`[API/Export] No results found for job ${jobId}`);
    }

    // Try to get the original Excel file if available
    let originalBuffer: Buffer | null = null;
    if (job.originalFileId) {
      console.log(`[API/Export] Retrieving original Excel file: ${job.originalFileId}`);
      originalBuffer = await fileStorage.getFile(job.originalFileId);
      if (originalBuffer) {
        console.log(`[API/Export] Original file retrieved, size: ${originalBuffer.length} bytes`);
      } else {
        console.warn(`[API/Export] Could not retrieve original file`);
      }
    }

    // Create Excel with results
    console.log(`[API/Export] Creating Excel file with results...`);
    const resultBuffer = await excelService.createExcelWithResults(originalBuffer, results, {
      sheets: [],  // TODO: Get sheets from parsed data
      headers: job.headers || [],
      contextHeaders: [],
      preserveOriginal: true, // Enable format preservation
    });
    
    console.log(`[API/Export] Excel file created, buffer size: ${resultBuffer?.length || 0} bytes`);

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="matched_${job.fileName}"`);

    res.send(resultBuffer);
    console.log(`[API/Export] Export completed successfully for job ${jobId}`);
  } catch (error) {
    console.error('[API/Export] Export results error:', error);
    res.status(500).json({ error: 'Failed to export results' });
  }
}

export async function stopJob(req: Request, res: Response): Promise<void> {
  try {
    const { jobId } = req.params;

    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Get the job
    const job = await convex.query(api.priceMatching.getJob, { jobId: toConvexId<'aiMatchingJobs'>(jobId) });
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (job.userId !== req.user.id && req.user.role !== 'admin') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Only allow stopping jobs that are in progress
    if (job.status === 'completed' || job.status === 'failed') {
      res.status(400).json({ error: 'Job is already finished' });
      return;
    }

    // Cancel the job in the processor
    const cancelled = await jobProcessor.cancelJob(jobId);
    
    if (!cancelled) {
      // If processor couldn't cancel, update Convex directly
      await convex.mutation(api.priceMatching.updateJobStatus, {
        jobId: toConvexId<'aiMatchingJobs'>(jobId),
        status: 'failed',
        progress: job.progress,
        error: 'Job stopped by user',
      });
    }

    // Log activity
    await convex.mutation(api.activityLogs.create, {
      userId: toConvexId<'users'>(req.user.id),
      action: 'stopped_job',
      entityType: 'aiMatchingJobs',
      entityId: jobId,
      details: `Stopped matching job ${job.fileName}`,
    });

    res.json({ message: 'Job stopped successfully' });
  } catch (error) {
    console.error('Stop job error:', error);
    res.status(500).json({ error: 'Failed to stop job' });
  }
}

export async function uploadAndMatch(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const requestId = `REQ_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log('\n=== UPLOAD AND MATCH REQUEST START ===');
    console.log(`Request ID: ${requestId}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`User: ${req.user?.email} (ID: ${req.user?.id})`);
    console.log(`File: ${req.file?.originalname} (Size: ${req.file?.size} bytes)`);
    console.log(`Client ID: ${req.body.clientId}`);
    console.log(`Project Name: ${req.body.projectName}`);
    console.log(`Matching Method: ${req.body.matchingMethod}`);
    console.log('=================================\n');
    
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { clientId, projectName, matchingMethod } = req.body;

    if (!clientId || !projectName || !matchingMethod) {
      res.status(400).json({ error: 'Missing required fields: clientId, projectName, matchingMethod' });
      return;
    }

    console.log(`[${requestId}] Step 1: Starting Excel file parsing...`);
    const parseStartTime = Date.now();
    
    // Parse the Excel file
    const parseResult = await excelService.parseExcelFile(req.file.buffer, req.file.originalname);
    
    // Store the original file for later use in export
    const fileId = await fileStorage.saveFile(req.file.buffer, req.file.originalname);
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
    const itemsWithQuantities = allItems.filter(item => 
      item.quantity !== undefined && 
      item.quantity !== null && 
      item.quantity > 0
    );
    
    const itemsWithoutQuantities = allItems.filter(item => 
      item.quantity === undefined || 
      item.quantity === null || 
      item.quantity === 0
    );
    
    console.log(`[${requestId}] Step 2: Item analysis...`);
    console.log(`[${requestId}] Total items: ${allItems.length}`);
    console.log(`[${requestId}] Items with quantities (will be matched): ${itemsWithQuantities.length}`);
    console.log(`[${requestId}] Items without quantities (context headers): ${itemsWithoutQuantities.length}`);
    
    if (itemsWithQuantities.length < 10) {
      console.log(`[${requestId}] Sample items with quantities:`, itemsWithQuantities.map(item => ({
        row: item.rowNumber,
        desc: item.description.substring(0, 50) + '...',
        qty: item.quantity,
        unit: item.unit
      })));
    }
    
    if (itemsWithoutQuantities.length > 0 && itemsWithoutQuantities.length < 10) {
      console.log(`[${requestId}] Sample context headers:`, itemsWithoutQuantities.map(item => ({
        row: item.rowNumber,
        desc: item.description.substring(0, 50) + '...',
        context: item.contextHeaders
      })));
    }
    
    // Create a matching job with correct item count
    console.log(`[${requestId}] Step 3: Creating matching job in database...`);
    const jobCreateStartTime = Date.now();
    let jobId;
    try {
      jobId = await convex.mutation(api.priceMatching.createJob, {
        userId: toConvexId<'users'>(req.user.id),
        fileName: req.file.originalname,
        // Provide empty array for fileBuffer until Convex schema is updated
        fileBuffer: [],
        itemCount: itemsWithQuantities.length, // Only count items with quantities
        matchingMethod,
        clientId: toConvexId<'clients'>(clientId),
        headers: firstSheet.headers.map(sanitizeFieldName),
        sheetName: firstSheet.sheetName,
        originalFileId: fileId,
        // projectName - removed until Convex schema is updated
      });
      const jobCreateEndTime = Date.now();
      console.log(`[${requestId}] Step 3 Complete: Job created in ${jobCreateEndTime - jobCreateStartTime}ms`);
      console.log(`[${requestId}] Job ID: ${jobId}`);
    } catch (createError: any) {
      console.error(`[${requestId}] ERROR: Failed to create job:`, createError);
      console.error(`[${requestId}] Error type:`, createError.constructor.name);
      console.error(`[${requestId}] Error message:`, createError.message);
      console.error(`[${requestId}] Error stack:`, createError.stack);
      throw createError;
    }

    // Log activity
    await convex.mutation(api.activityLogs.create, {
      userId: toConvexId<'users'>(req.user.id),
      action: 'uploaded_boq',
      entityType: 'aiMatchingJobs',
      entityId: jobId,
      details: `Uploaded ${req.file.originalname} with ${itemsWithQuantities.length} items (${itemsWithoutQuantities.length} context headers) for project: ${projectName}`,
    });

    // Start matching immediately
    await convex.mutation(api.priceMatching.updateJobStatus, {
      jobId: toConvexId<'aiMatchingJobs'>(jobId),
      status: 'parsing',
      progress: 10,
      progressMessage: 'Processing Excel file...',
    });

    // Store parsed items (all items including context headers)
    // TODO: Implement storeParsedItems in Convex backend
    // await convex.mutation(api.priceMatching.storeParsedItems, {
    //   jobId: toConvexId<'aiMatchingJobs'>(jobId),
    //   items: allItems.map(item => ({
    //     rowNumber: item.rowNumber,
    //     description: item.description,
    //     quantity: item.quantity,
    //     unit: item.unit,
    //     originalRowData: sanitizeObjectKeys(item.originalData),
    //     contextHeaders: item.contextHeaders,
    //   })),
    // });

    // Update status to pending
    await convex.mutation(api.priceMatching.updateJobStatus, {
      jobId: toConvexId<'aiMatchingJobs'>(jobId),
      status: 'pending',
      progress: 0,
      progressMessage: 'Job queued for processing...',
    });

    // Add job to the processor queue instead of processing inline
    console.log(`[${requestId}] Step 4: Adding job to processing queue...`);
    const queueStartTime = Date.now();
    
    await jobProcessor.addJob(jobId, req.user.id, allItems, matchingMethod);
    
    const queueEndTime = Date.now();
    console.log(`[${requestId}] Step 4 Complete: Job queued in ${queueEndTime - queueStartTime}ms`);
    console.log(`[${requestId}] Queue status:`, jobProcessor.getQueueStatus());

    const totalTime = Date.now() - startTime;
    console.log(`[${requestId}] === UPLOAD AND MATCH REQUEST COMPLETE ===`);
    console.log(`[${requestId}] Total time: ${totalTime}ms`);
    console.log(`[${requestId}] Response: Job ID ${jobId} with ${itemsWithQuantities.length} items`);
    console.log(`[${requestId}] =====================================\n`);
    
    res.json({
      jobId,
      fileName: req.file.originalname,
      itemCount: itemsWithQuantities.length, // Return count of items with quantities
      userId: toConvexId<'users'>(req.user.id),
    });
  } catch (error: any) {
    const totalTime = Date.now() - startTime;
    console.error(`[${requestId}] === UPLOAD AND MATCH ERROR ===`);
    console.error(`[${requestId}] Failed after ${totalTime}ms`);
    console.error(`[${requestId}] Error type:`, error.constructor.name);
    console.error(`[${requestId}] Error message:`, error.message);
    console.error(`[${requestId}] Error stack:`, error.stack);
    console.error(`[${requestId}] ============================\n`);
    res.status(500).json({ error: error.message || 'Failed to start matching job' });
  }
}

/* DEPRECATED: Now using JobProcessorService for better rate limit management
async function processMatchingJob(jobId: string, method: string, userId: string, parsedItems: any[]) {
  // Old implementation moved to JobProcessorService
  // This function processed jobs inline which caused rate limiting issues
  // The new JobProcessorService:
  // - Processes jobs in a queue
  // - Batches Convex updates
  // - Implements proper rate limiting
  // - Keeps processing state in Node.js memory
  // - Only uses Convex for data storage
}
*/

export async function autoSaveResult(req: Request, res: Response): Promise<void> {
  try {
    const { resultId } = req.params;
    const updates = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Auto-save with minimal validation
    await convex.mutation(api.priceMatching.autoSaveMatchResult, {
      resultId: toConvexId<'matchResults'>(resultId),
      updates,
      userId: toConvexId<'users'>(req.user.id),
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Auto-save error:', error);
    // Don't fail loudly for auto-save
    res.status(200).json({ success: false });
  }
}

export async function runMatch(req: Request, res: Response): Promise<void> {
  try {
    const { resultId } = req.params;
    const { method, jobId } = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    console.log(`[API] Re-matching result ${resultId} with method ${method}`);

    // Get the existing match result
    const result = await convex.query(api.priceMatching.getMatchResult, { 
      resultId: toConvexId<'matchResults'>(resultId) 
    });
    
    if (!result) {
      res.status(404).json({ error: 'Result not found' });
      return;
    }

    // Get all price items for matching
    const priceItems = await convex.query(api.priceItems.getActive);
    
    // Run the matching with the new method
    const matchingService = MatchingService.getInstance();
    const matchResult = await matchingService.matchItem(
      result.originalDescription,
      method,
      priceItems,
      result.contextHeaders
    );

    // Update the result with the new match
    const updates = {
      matchedItemId: matchResult.matchedItemId,
      matchedDescription: matchResult.matchedDescription,
      matchedCode: matchResult.matchedCode,
      matchedUnit: matchResult.matchedUnit,
      matchedRate: matchResult.matchedRate,
      confidence: matchResult.confidence,
      totalPrice: (result.originalQuantity || 0) * (matchResult.matchedRate || 0),
      notes: `Re-matched using ${method}`,
      isManuallyEdited: false, // Reset manual edit flag
    };

    await convex.mutation(api.priceMatching.updateMatchResult, {
      resultId: toConvexId<'matchResults'>(resultId),
      updates,
      userId: toConvexId<'users'>(req.user.id),
    });

    console.log(`[API] Re-match completed for result ${resultId}`);
    res.json({ success: true, ...updates });
  } catch (error) {
    console.error('Run match error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Match failed' });
  }
}

export async function deleteJob(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { jobId } = req.params;

    // Get the job to verify ownership
    const job = await convex.query(api.priceMatching.getJobById, {
      jobId: toConvexId<'aiMatchingJobs'>(jobId),
    });

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    if (job.userId !== req.user.id) {
      res.status(403).json({ error: 'Not authorized to delete this job' });
      return;
    }

    // Cancel job if it's in the processor
    await jobProcessor.cancelJob(jobId);

    // Delete all match results for this job
    // TODO: Implement deleteJobResults in Convex backend
    // await convex.mutation(api.priceMatching.deleteJobResults, {
    //   jobId: toConvexId<'aiMatchingJobs'>(jobId),
    // });

    // Delete the job itself
    await convex.mutation(api.priceMatching.deleteJob, {
      jobId: toConvexId<'aiMatchingJobs'>(jobId),
    });

    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
}

export async function getProcessorStatus(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const status = jobProcessor.getQueueStatus();
    res.json(status);
  } catch (error) {
    console.error('Get processor status error:', error);
    res.status(500).json({ error: 'Failed to get processor status' });
  }
}

export async function testLocalMatch(req: Request, res: Response): Promise<void> {
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

    console.log(`[API] Testing local match for: "${description}"`);

    // Get all active price items for matching
    const priceItems = await convex.query(api.priceItems.getActive);
    
    if (!priceItems || priceItems.length === 0) {
      res.status(500).json({ error: 'No price items available for matching' });
      return;
    }

    // Run local match test
    const matchResult = await matchingService.matchItem(
      description,
      'LOCAL',
      priceItems,
      [] // No context headers for instant test
    );

    // Get top 3 matches if using LOCAL method
    const allMatches = await matchingService.getTopMatches(
      description,
      'LOCAL',
      priceItems,
      3
    );

    console.log(`[API] Local test complete. Found ${allMatches.length} matches`);

    res.json({
      matches: allMatches,
      bestMatch: matchResult,
    });
  } catch (error) {
    console.error('Test local match error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to test local match' });
  }
}