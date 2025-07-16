"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobPollingService = void 0;
const convex_1 = require("../config/convex");
const api_1 = require("../../../convex/_generated/api");
const convexId_1 = require("../utils/convexId");
const matching_service_1 = require("./matching.service");
class JobPollingService {
    constructor() {
        this.convex = (0, convex_1.getConvexClient)();
        this.matchingService = matching_service_1.MatchingService.getInstance();
        this.activeJobs = new Map();
        // Batch configuration
        this.BATCH_SIZE = 10;
        this.PROCESSING_INTERVAL = 2000; // Process every 2 seconds for serverless
    }
    async createJob(jobId, userId, items, method) {
        // Store job in Convex with initial status
        await this.convex.mutation(api_1.api.aiMatchingJobs.updateJobStatus, {
            jobId,
            status: 'pending',
            progress: 0,
            progressMessage: 'Job queued',
            itemCount: items.length,
            matchedCount: 0
        });
        // Store job logs
        await this.addJobLog(jobId, 'info', `Job created with ${items.length} items using ${method} method`);
        await this.addJobLog(jobId, 'info', `Timer started at 00:00`);
        // Start processing in background (will continue even if request ends)
        this.startProcessing(jobId, userId, items, method);
    }
    async startProcessing(jobId, userId, items, method) {
        try {
            // Update status to processing
            await this.convex.mutation(api_1.api.aiMatchingJobs.updateJobStatus, {
                jobId,
                status: 'processing',
                progressMessage: 'Processing items...'
            });
            await this.addJobLog(jobId, 'info', 'Starting batch processing...');
            let processedCount = 0;
            const contextHeaders = [];
            // Process items in batches
            for (let i = 0; i < items.length; i += this.BATCH_SIZE) {
                const batch = items.slice(i, i + this.BATCH_SIZE);
                for (const item of batch) {
                    try {
                        // Check if this is a context header
                        if (!item.quantity || item.quantity === 0) {
                            contextHeaders.push(item.description);
                            // Save context header result
                            await this.convex.mutation(api_1.api.priceMatching.createMatchResult, {
                                jobId: (0, convexId_1.toConvexId)(jobId),
                                rowNumber: item.rowIndex || processedCount,
                                originalDescription: item.description,
                                originalQuantity: 0,
                                originalUnit: '',
                                matchMethod: 'CONTEXT',
                                matchedDescription: item.description,
                                matchedCode: '',
                                matchedRate: 0,
                                matchedUnit: '',
                                confidence: 1,
                                totalPrice: 0,
                                notes: 'Context header'
                            });
                            await this.addJobLog(jobId, 'info', `Context header: ${item.description}`);
                        }
                        else {
                            // Process regular item
                            const result = await this.matchingService.matchItem(item.description, method, undefined, contextHeaders);
                            await this.convex.mutation(api_1.api.priceMatching.createMatchResult, {
                                jobId: (0, convexId_1.toConvexId)(jobId),
                                rowNumber: item.rowIndex || processedCount,
                                originalDescription: item.description,
                                originalQuantity: item.quantity,
                                originalUnit: item.unit || '',
                                matchMethod: method,
                                matchedDescription: result.matchedDescription,
                                matchedCode: result.matchedCode,
                                matchedRate: result.matchedRate,
                                matchedUnit: result.matchedUnit,
                                confidence: result.confidence,
                                totalPrice: (item.quantity || 0) * result.matchedRate
                            });
                            await this.addJobLog(jobId, 'info', `Matched: "${item.description}" â†’ "${result.matchedDescription}" (${(result.confidence * 100).toFixed(1)}%)`);
                        }
                        processedCount++;
                        // Update progress
                        const progress = Math.round((processedCount / items.length) * 100);
                        await this.convex.mutation(api_1.api.aiMatchingJobs.updateJobStatus, {
                            jobId,
                            progress,
                            progressMessage: `Processed ${processedCount} of ${items.length} items`,
                            matchedCount: processedCount
                        });
                    }
                    catch (error) {
                        await this.addJobLog(jobId, 'error', `Failed to process item: ${error.message}`);
                    }
                }
                // Small delay between batches for serverless
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            // Mark job as completed
            await this.convex.mutation(api_1.api.aiMatchingJobs.updateJobStatus, {
                jobId,
                status: 'completed',
                progress: 100,
                progressMessage: `Completed processing ${processedCount} items`
            });
            await this.addJobLog(jobId, 'info', `Job completed successfully. Processed ${processedCount} items.`);
        }
        catch (error) {
            await this.convex.mutation(api_1.api.aiMatchingJobs.updateJobStatus, {
                jobId,
                status: 'failed',
                progressMessage: `Error: ${error.message}`
            });
            await this.addJobLog(jobId, 'error', `Job failed: ${error.message}`);
        }
    }
    async getJobStatus(jobId) {
        const job = await this.convex.query(api_1.api.priceMatching.getJob, {
            jobId: (0, convexId_1.toConvexId)(jobId)
        });
        if (!job)
            return null;
        // Get logs
        const logs = await this.convex.query(api_1.api.jobLogs.getJobLogs, { jobId });
        return {
            jobId: job._id,
            status: job.status,
            progress: job.progress || 0,
            progressMessage: job.progressMessage || '',
            itemCount: job.itemCount,
            matchedCount: job.matchedCount || 0,
            startTime: job.startedAt,
            lastUpdate: Date.now(),
            errors: job.error ? [job.error] : [],
            logs: logs.map(log => ({
                timestamp: log._creationTime,
                level: log.level,
                message: log.message
            }))
        };
    }
    async cancelJob(jobId) {
        const timeout = this.activeJobs.get(jobId);
        if (timeout) {
            clearTimeout(timeout);
            this.activeJobs.delete(jobId);
        }
        await this.convex.mutation(api_1.api.aiMatchingJobs.updateJobStatus, {
            jobId,
            status: 'cancelled',
            progressMessage: 'Job cancelled by user'
        });
        await this.addJobLog(jobId, 'info', 'Job cancelled by user');
    }
    async addJobLog(jobId, level, message) {
        try {
            await this.convex.mutation(api_1.api.jobLogs.create, {
                jobId,
                level,
                message
            });
        }
        catch (error) {
            console.error('Failed to add job log:', error);
        }
    }
}
exports.JobPollingService = JobPollingService;
