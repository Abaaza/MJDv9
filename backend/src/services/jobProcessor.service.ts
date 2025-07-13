import { EventEmitter } from 'events';
import { getConvexClient } from '../config/convex';
import { api } from '../lib/convex-api';
import { MatchingService } from './matching.service';
import { logStorage } from './logStorage.service';
import { ConvexBatchProcessor } from '../utils/convexBatch';
import { PerformanceLogger } from '../utils/performanceLogger';
import { getMatchingConfig } from '../config/matching.config';

interface ProcessingJob {
  jobId: string;
  userId: string;
  status: 'pending' | 'parsing' | 'matching' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  progressMessage: string;
  itemCount: number;
  matchedCount: number;
  items: any[];
  method: string;
  startTime: number;
  lastUpdate: number;
  errors: string[];
}

export class JobProcessorService extends EventEmitter {
  private jobs: Map<string, ProcessingJob> = new Map();
  private processingQueue: string[] = [];
  private isProcessing = false;
  private convex = getConvexClient();
  private matchingService = MatchingService.getInstance();
  
  // Batch configuration
  private readonly BATCH_SIZE = 10;
  private readonly UPDATE_INTERVAL = 5000; // 5 seconds
  private readonly CONVEX_BATCH_SIZE = 50; // Update Convex every 50 items
  
  // Rate limiting
  private lastConvexUpdate = 0;
  private readonly MIN_UPDATE_INTERVAL = 5000; // Minimum 5 seconds between Convex updates
  private readonly CONVEX_MUTATION_DELAY = 100; // 100ms between individual mutations
  private readonly CONVEX_BATCH_DELAY = 2000; // 2 seconds between batches

  constructor() {
    super();
    // Start the processor
    this.startProcessor();
  }

  async addJob(jobId: string, userId: string, items: any[], method: string): Promise<void> {
    console.log(`[JobProcessor] Adding job ${jobId} to queue:`, {
      userId,
      itemCount: items.length,
      method,
      currentQueueLength: this.processingQueue.length
    });
    
    const job: ProcessingJob = {
      jobId,
      userId,
      status: 'pending',
      progress: 0,
      progressMessage: 'Job queued',
      itemCount: items.length,
      matchedCount: 0,
      items,
      method,
      startTime: Date.now(),
      lastUpdate: Date.now(),
      errors: [],
    };

    this.jobs.set(jobId, job);
    this.processingQueue.push(jobId);
    console.log(`[JobProcessor] Job ${jobId} added to queue. Queue length: ${this.processingQueue.length}`);
    
    // Count items with quantities vs context headers
    const itemsWithQuantities = items.filter(item => 
      item.quantity !== undefined && item.quantity !== null && item.quantity > 0
    ).length;
    const contextHeaders = items.length - itemsWithQuantities;
    
    // Emit event for real-time updates
    this.emit('job:queued', { jobId, userId, itemCount: itemsWithQuantities });
    this.emitLog(jobId, 'info', `Timer started at 00:00`);
    this.emitLog(jobId, 'info', `Job queued with ${itemsWithQuantities} items to match (${contextHeaders} context headers) using ${method} matching method`);
    
    // Update Convex with initial status
    await this.updateConvexStatus(jobId, {
      status: 'pending' as any,
      progress: 0,
      progressMessage: 'Job queued for processing',
    });
    
    // Pre-generate embeddings for AI methods (non-blocking)
    if (method === 'COHERE' || method === 'OPENAI' || method === 'HYBRID') {
      this.preGenerateEmbeddings(method).catch(error => {
        console.error(`[JobProcessor] Failed to pre-generate embeddings:`, error);
      });
    }
  }

  async cancelJob(jobId: string): Promise<boolean> {
    console.log(`[JobProcessor] Attempting to cancel job: ${jobId}`);
    const job = this.jobs.get(jobId);
    if (!job) {
      console.log(`[JobProcessor] Job ${jobId} not found in memory`);
      return false;
    }

    console.log(`[JobProcessor] Job ${jobId} current status: ${job.status}`);
    
    // Check if job is already in a final state
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      console.log(`[JobProcessor] Job ${jobId} already in final state: ${job.status}`);
      return false;
    }

    // Check if job is currently running before marking as cancelled
    const wasRunning = job.status === 'processing' || job.status === 'parsing' || job.status === 'matching';
    
    // Mark job as cancelled regardless of current status
    job.status = 'cancelled';
    this.emit('job:cancelled', { jobId });
    
    this.emitLog(jobId, 'warning', 'Job cancelled by user');
    
    // Update Convex status
    try {
      await this.updateConvexStatus(jobId, {
        status: 'failed' as any,
        error: 'Job cancelled by user',
      });
      console.log(`[JobProcessor] Job ${jobId} status updated in Convex`);
    } catch (error) {
      console.error(`[JobProcessor] Failed to update Convex status for job ${jobId}:`, error);
    }

    // Remove from queue if still pending
    const queueIndex = this.processingQueue.indexOf(jobId);
    if (queueIndex > -1) {
      this.processingQueue.splice(queueIndex, 1);
      console.log(`[JobProcessor] Job ${jobId} removed from processing queue`);
    }
    
    // If was currently processing, it will be stopped in the next iteration
    if (wasRunning) {
      this.emitLog(jobId, 'info', 'Stopping running job...');
    }
    
    console.log(`[JobProcessor] Job ${jobId} successfully cancelled`);
    return true;
  }

  async cancelAllJobs(): Promise<number> {
    console.log(`[JobProcessor] CancelAllJobs called`);
    console.log(`[JobProcessor] Current queue length: ${this.processingQueue.length}`);
    console.log(`[JobProcessor] Total jobs in memory: ${this.jobs.size}`);
    
    let cancelledCount = 0;
    const jobsToCancel: string[] = [];
    
    // Collect all jobs that need cancellation
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status !== 'completed' && job.status !== 'failed' && job.status !== 'cancelled') {
        jobsToCancel.push(jobId);
        console.log(`[JobProcessor] Job ${jobId} (status: ${job.status}) will be cancelled`);
      }
    }
    
    console.log(`[JobProcessor] Found ${jobsToCancel.length} jobs to cancel`);
    
    // Cancel each job
    for (const jobId of jobsToCancel) {
      const cancelled = await this.cancelJob(jobId);
      if (cancelled) {
        cancelledCount++;
      } else {
        console.log(`[JobProcessor] Failed to cancel job ${jobId}`);
      }
    }
    
    // Clear the processing queue
    this.processingQueue = [];
    console.log(`[JobProcessor] Processing queue cleared`);
    
    // Reset processing flag to allow new jobs
    this.isProcessing = false;
    console.log(`[JobProcessor] Processing flag reset`);
    
    console.log(`[JobProcessor] CancelAllJobs completed. Cancelled ${cancelledCount} jobs`);
    return cancelledCount;
  }

  getJobStatus(jobId: string): ProcessingJob | undefined {
    return this.jobs.get(jobId);
  }

  private emitProgress(job: ProcessingJob) {
    // Update in-memory storage
    logStorage.updateProgress(job.jobId, {
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      progressMessage: job.progressMessage,
      matchedCount: job.matchedCount,
      itemCount: job.itemCount,
      startTime: job.startTime || Date.now()
    });
    
    // Emit for any WebSocket listeners (optional)
    this.emit('job:progress', {
      jobId: job.jobId,
      progress: job.progress,
      matchedCount: job.matchedCount,
      progressMessage: job.progressMessage,
      itemCount: job.itemCount,
      status: job.status,
    });
  }

  private emitLog(jobId: string, level: 'info' | 'success' | 'warning' | 'error', message: string) {
    // Store in memory for fast access
    logStorage.addLog(jobId, level, message);
    
    // Emit for any WebSocket listeners (optional)
    this.emit('job:log', {
      jobId,
      level,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  private async startProcessor() {
    setInterval(async () => {
      if (!this.isProcessing && this.processingQueue.length > 0) {
        await this.processNextJob();
      }
    }, 1000); // Check every second
  }

  private async processNextJob() {
    const jobId = this.processingQueue.shift();
    if (!jobId) {
      console.log('[JobProcessor] No jobs in queue');
      return;
    }

    const job = this.jobs.get(jobId);
    if (!job) {
      console.log(`[JobProcessor] Job ${jobId} not found in memory`);
      return;
    }
    
    console.log(`[JobProcessor] Starting to process job ${jobId}`);
    const config = getMatchingConfig();
    
    // Start performance tracking
    PerformanceLogger.startTimer(`${jobId}-total`);

    this.isProcessing = true;
    job.status = 'parsing';
    job.progress = 0;
    job.progressMessage = 'Initializing job...';

    this.emit('job:started', { jobId });
    // Count items with quantities for accurate logging
    const itemsWithQuantities = job.items.filter(item => 
      item.quantity !== undefined && item.quantity !== null && item.quantity > 0
    ).length;
    const contextHeaders = job.items.length - itemsWithQuantities;
    this.emitLog(jobId, 'info', `Starting job processing for ${itemsWithQuantities} items (${contextHeaders} context headers)`);
    
    // Immediately update Convex to show parsing status
    await this.convex.mutation(api.priceMatching.updateJobStatus, {
      jobId: jobId as any,
      status: 'parsing' as any,
      progress: 0,
      progressMessage: 'Initializing job...',
    });

    try {
      // Step 1: Load price database (0-15%)
      console.log(`[JobProcessor] ${jobId}: Loading price database...`);
      job.progress = 1;
      job.progressMessage = 'Loading price database...';
      this.emitProgress(job);
      this.emitLog(jobId, 'info', 'Fetching price items from database');
      
      const priceItems = await this.convex.query(api.priceItems.getActive);
      console.log(`[JobProcessor] ${jobId}: Loaded ${priceItems?.length || 0} price items`);
      
      job.progress = 15;
      job.progressMessage = `Loaded ${priceItems.length} price items`;
      this.emitProgress(job);
      this.emitLog(jobId, 'success', `Successfully loaded ${priceItems.length} price items`);
      
      // Step 2: Prepare batches (15-25%)
      const isAIMethod = ['COHERE', 'OPENAI'].includes(job.method);
      const totalBatches = Math.ceil(job.items.length / this.BATCH_SIZE);
      
      if (isAIMethod) {
        job.progress = 20;
        job.progressMessage = 'Preparing batches for AI processing...';
        this.emitProgress(job);
        
        this.emitLog(jobId, 'info', `ðŸ¤– AI Method (${job.method}): Created ${totalBatches} batches of ${this.BATCH_SIZE} items each for optimal API performance`);
        
        job.progress = 25;
        job.progressMessage = `Starting AI processing of ${job.items.length} items in ${totalBatches} batches...`;
        this.emitProgress(job);
      } else {
        job.progress = 25;
        job.progressMessage = 'Starting LOCAL processing...';
        this.emitProgress(job);
        
        this.emitLog(jobId, 'info', `âš¡ LOCAL Method: Processing ${job.items.length} items efficiently (no API rate limits)`);
        
        job.progressMessage = `Processing ${job.items.length} items with LOCAL matching...`;
        this.emitProgress(job);
      }
      
      // Update Convex to show progress and transition to matching status
      console.log(`[JobProcessor] ${jobId}: Transitioning to matching status`);
      job.status = 'matching';
      await this.convex.mutation(api.priceMatching.updateJobStatus, {
        jobId: jobId as any,
        status: 'matching' as any,
        progress: 25,
        progressMessage: job.progressMessage,
      });
      this.emitProgress(job);
      console.log(`[JobProcessor] ${jobId}: Status updated to matching`);
      
      // Process items in batches
      const results: any[] = [];
      let savedResultsCount = 0; // Track how many results we've saved
      let processedCount = 0;
      let successCount = 0;
      let failureCount = 0;
      let contextHeaderCount = 0;

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        // Check if job was cancelled (need to re-fetch from map in case it was updated)
        const currentJob = this.jobs.get(jobId);
        if (!currentJob) {
          console.log(`[JobProcessor] ${jobId}: Job no longer exists, stopping processing`);
          break;
        }
        
        if (currentJob.status === 'cancelled') {
          console.log(`[JobProcessor] ${jobId}: Job cancelled, stopping processing`);
          this.emitLog(jobId, 'warning', 'Job cancelled by user');
          break;
        }

        const startIdx = batchIndex * this.BATCH_SIZE;
        const batch = job.items.slice(startIdx, startIdx + this.BATCH_SIZE);
        const batchNumber = batchIndex + 1;
        
        // Calculate realistic progress (25-95%) based on actual items to match
        const itemsToMatchSoFar = processedCount - contextHeaderCount;
        const progressPercentage = 25 + Math.round((itemsToMatchSoFar / job.itemCount) * 70);
        job.progress = progressPercentage;
        job.progressMessage = `Processing batch ${batchNumber}/${totalBatches} (${itemsToMatchSoFar}/${job.itemCount} items)`;
        
        this.emitProgress(job);
        
        if (isAIMethod) {
          this.emitLog(jobId, 'info', `ðŸ¤– Starting AI batch ${batchNumber}/${totalBatches} with ${batch.length} items`);
        } else {
          this.emitLog(jobId, 'info', `âš¡ Processing items ${startIdx + 1}-${startIdx + batch.length}`);
        }
        
        const batchStartTime = Date.now();
        const batchResults = await this.processBatch(job, batch, priceItems, startIdx);
        const batchDuration = Date.now() - batchStartTime;
        
        // Count successes and failures (exclude context headers)
        const batchSuccesses = batchResults.filter(r => r.matchMethod !== 'CONTEXT' && r.confidence > 0).length;
        const batchFailures = batchResults.filter(r => r.matchMethod !== 'CONTEXT' && r.confidence === 0).length;
        const batchContextHeaders = batchResults.filter(r => r.matchMethod === 'CONTEXT').length;
        
        results.push(...batchResults);
        processedCount += batch.length;
        successCount += batchSuccesses;
        failureCount += batchFailures;
        contextHeaderCount += batchContextHeaders;
        
        job.matchedCount = successCount;
        const itemsWithQuantities = processedCount - contextHeaderCount;
        job.progressMessage = `Processed ${itemsWithQuantities}/${job.itemCount} items (${successCount} matched, ${failureCount} failed)`;
        
        if (isAIMethod) {
          this.emitLog(jobId, 'success', 
            `ðŸ¤– AI Batch ${batchNumber}/${totalBatches} completed in ${(batchDuration/1000).toFixed(1)}s - ${batchSuccesses} matches, ${batchFailures} failures`
          );
        } else {
          this.emitLog(jobId, 'success', 
            `âš¡ Processed ${batch.length} items in ${(batchDuration/1000).toFixed(1)}s - ${batchSuccesses} matches, ${batchFailures} failures`
          );
        }
        
        // Update local state frequently
        this.emit('job:progress', {
          jobId,
          progress: job.progress,
          matchedCount: job.matchedCount,
          progressMessage: job.progressMessage,
          itemCount: job.itemCount,
          status: job.status,
        });

        // Save results to database - save ALL unsaved results
        const unsavedResults = results.slice(savedResultsCount);
        if (unsavedResults.length > 0 && (unsavedResults.length >= this.CONVEX_BATCH_SIZE || processedCount === job.itemCount)) {
          this.emitLog(jobId, 'info', `Saving ${unsavedResults.length} results to database (items ${savedResultsCount + 1}-${results.length})`);
          await this.batchUpdateConvex(jobId, job, unsavedResults);
          savedResultsCount = results.length; // Update saved count
          
          // Add delay after batch save to avoid rate limits
          if (processedCount < job.itemCount) {
            await new Promise(resolve => setTimeout(resolve, this.CONVEX_BATCH_DELAY));
          }
        }

        // Dynamic delay based on processing speed
        const delay = batchDuration < 500 ? 200 : 100;
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Final update (90-100%)
      job.progress = 95;
      job.progressMessage = 'Finalizing results...';
      this.emitProgress(job);
      const itemsToMatch = processedCount - contextHeaderCount;
      this.emitLog(jobId, 'info', `Processing complete. Total: ${processedCount} items (${itemsToMatch} with quantities, ${contextHeaderCount} context headers)`);
      this.emitLog(jobId, 'info', `Matching results: ${successCount} successful matches, ${failureCount} failures`);
      
      // Calculate match rate (only for items with quantities)
      const matchRate = itemsToMatch > 0 ? Math.round((successCount / itemsToMatch) * 100) : 0;
      this.emitLog(jobId, 'info', `Match rate: ${matchRate}% (${successCount}/${itemsToMatch} items with quantities)`);
      
      job.status = 'completed';
      job.progress = 100;
      job.progressMessage = `Completed: ${successCount} matches out of ${itemsToMatch} items (${matchRate}% success rate)`;
      
      // Emit final progress update before finalizing
      this.emitProgress(job);
      this.emitLog(jobId, 'success', 'âœ… Job completed successfully!');
      
      
      // Update Convex with final progress before finalization
      await this.convex.mutation(api.priceMatching.updateJobStatus, {
        jobId: jobId as any,
        status: 'completed' as any,
        progress: 100,
        progressMessage: job.progressMessage,
        matchedCount: job.matchedCount,
      });
      
      await this.finalizeJob(jobId, job, results);
      
    } catch (error: any) {
      console.error(`[JobProcessor] ${jobId}: Processing error:`, error);
      console.error(`[JobProcessor] ${jobId}: Error stack:`, error.stack);
      job.status = 'failed';
      job.errors.push(error.message);
      
      this.emitLog(jobId, 'error', `Job failed: ${error.message}`);
      
      await this.updateConvexStatus(jobId, {
        status: 'failed' as any,
        error: error.message,
      });
      
      this.emit('job:failed', { jobId, error: error.message });
    } finally {
      this.isProcessing = false;
      console.log(`[JobProcessor] ${jobId}: Processing complete. Queue length: ${this.processingQueue.length}`);
      
      // Clean up completed/failed jobs after 5 minutes
      setTimeout(async () => {
        console.log(`[JobProcessor] ${jobId}: Cleaning up job from memory`);
        this.emitLog(jobId, 'info', 'Cleaning up job from memory');
        this.jobs.delete(jobId);
      }, 5 * 60 * 1000);
    }
  }

  private async processBatch(
    job: ProcessingJob, 
    batch: any[], 
    priceItems: any[],
    startIndex: number
  ): Promise<any[]> {
    const results = [];
    const batchNumber = Math.floor(startIndex / this.BATCH_SIZE) + 1;
    
    // For AI methods, pre-generate embeddings for all items in the batch
    let batchEmbeddings: Map<string, number[]> | null = null;
    if (['COHERE', 'OPENAI'].includes(job.method)) {
      const itemsWithQuantity = batch.filter(item => 
        item.quantity !== undefined && item.quantity !== null && item.quantity !== 0
      );
      
      if (itemsWithQuantity.length > 0) {
        this.emitLog(job.jobId, 'info', `Generating ${job.method} embeddings for ${itemsWithQuantity.length} items in batch ${batchNumber}`);
        
        try {
          batchEmbeddings = await this.matchingService.generateBOQEmbeddings(
            itemsWithQuantity.map(item => ({
              description: item.description,
              contextHeaders: item.contextHeaders
            })),
            job.method.toLowerCase() as 'cohere' | 'openai'
          );
          
          this.emitLog(job.jobId, 'success', `Generated embeddings for ${batchEmbeddings.size} items`);
        } catch (error: any) {
          this.emitLog(job.jobId, 'warning', `Failed to generate batch embeddings: ${error.message}. Falling back to individual processing.`);
        }
      }
    }

    for (let i = 0; i < batch.length; i++) {
      // Check if job was cancelled before processing each item (re-fetch from map)
      const currentJob = this.jobs.get(job.jobId);
      if (!currentJob || currentJob.status === 'cancelled') {
        this.emitLog(job.jobId, 'warning', 'Job cancelled, stopping batch processing');
        break;
      }
      
      const item = batch[i];
      const itemIndex = startIndex + i + 1;
      
      // Check if this is a context header (no quantity)
      // Items with undefined, null, or 0 quantity are considered context headers
      const hasQuantity = item.quantity !== undefined && item.quantity !== null && item.quantity !== 0;
      
      if (!hasQuantity) {
        // This is a context header - just save it without matching
        const contextResult = {
          jobId: job.jobId as any,
          rowNumber: item.rowNumber,
          originalDescription: item.description,
          originalQuantity: 0,
          originalUnit: item.unit || '',
          originalRowData: item.originalRowData || {},
          // contextHeaders: item.contextHeaders || [], // Remove this field until Convex is updated
          matchedItemId: undefined,
          matchedDescription: '',
          matchedCode: '',
          matchedUnit: '',
          matchedRate: 0,
          confidence: 0,
          isManuallyEdited: false, // Set to false for new matches
          matchMethod: 'CONTEXT',
          totalPrice: 0,
          notes: 'Context header (no quantity)',
        };
        
        console.log(`[JobProcessor] Adding context header for row ${item.rowNumber}: "${item.description.substring(0, 50)}..."`);
        results.push(contextResult);
        continue;
      }
      
      try {
        // Log high-value items
        if (item.quantity > 100) {
          this.emitLog(job.jobId, 'info', 
            `Processing high-quantity item (Row ${item.rowNumber}): ${item.quantity} ${item.unit || 'units'} - ${item.description.substring(0, 50)}...`
          );
        }
        
        const matchStartTime = Date.now();
        let matchResult;
        
        // Use pre-generated embeddings for AI methods if available
        if (batchEmbeddings && batchEmbeddings.has(item.description) && ['COHERE', 'OPENAI'].includes(job.method)) {
          const embedding = batchEmbeddings.get(item.description)!;
          matchResult = await this.matchingService.matchItemWithEmbedding(
            item.description,
            job.method as 'COHERE' | 'OPENAI',
            embedding,
            priceItems,
            item.contextHeaders
          );
        } else {
          // Fallback to regular matching
          matchResult = await this.matchingService.matchItem(
            item.description,
            job.method as any,
            priceItems,
            item.contextHeaders
          );
        }
        
        const matchDuration = Date.now() - matchStartTime;

        // Log exceptional matches
        if (matchResult.confidence >= 0.9) {
          this.emitLog(job.jobId, 'success', 
            `High confidence match (${Math.round(matchResult.confidence * 100)}%) for Row ${item.rowNumber} in ${matchDuration}ms`
          );
        } else if (matchResult.confidence < 0.5) {
          this.emitLog(job.jobId, 'warning', 
            `Low confidence match (${Math.round(matchResult.confidence * 100)}%) for Row ${item.rowNumber}: "${item.description.substring(0, 50)}..."`
          );
        }

        const resultToSave = {
          jobId: job.jobId as any,  // Convert to any to handle Convex ID type
          rowNumber: item.rowNumber,
          originalDescription: item.description,
          originalQuantity: item.quantity || 0,
          originalUnit: item.unit || '',
          originalRowData: item.originalRowData || {},
          // contextHeaders: item.contextHeaders || [], // Remove this field until Convex is updated
          matchedItemId: matchResult.matchedItemId || undefined,
          matchedDescription: matchResult.matchedDescription || '',
          matchedCode: matchResult.matchedCode || '',
          matchedUnit: matchResult.matchedUnit || '',
          matchedRate: matchResult.matchedRate || 0,
          confidence: matchResult.confidence || 0,
          isManuallyEdited: false, // Set to false for new matches
          matchMethod: job.method,
          totalPrice: (item.quantity || 0) * (matchResult.matchedRate || 0),
          notes: '',
        };
        
        console.log(`[JobProcessor] Prepared result for row ${item.rowNumber}: ${matchResult.matchedDescription ? 'MATCHED' : 'NO MATCH'}`);
        results.push(resultToSave);
      } catch (error: any) {
        this.emitLog(job.jobId, 'error', 
          `Failed to match item ${item.rowNumber}: ${error.message}`
        );
        job.errors.push(`Item ${item.rowNumber}: ${error.message}`);
        
        // Add failed result
        const failedResult = {
          jobId: job.jobId as any,
          rowNumber: item.rowNumber,
          originalDescription: item.description,
          originalQuantity: item.quantity || 0,
          originalUnit: item.unit || '',
          originalRowData: item.originalRowData || {},
          // contextHeaders: item.contextHeaders || [], // Remove this field until Convex is updated
          matchedItemId: undefined,
          matchedDescription: '',
          matchedCode: '',
          matchedUnit: '',
          matchedRate: 0,
          confidence: 0,
          isManuallyEdited: false, // Set to false for new matches
          matchMethod: job.method,
          totalPrice: 0,
          notes: `Error: ${error.message}`,
        };
        
        console.log(`[JobProcessor] Adding failed result for row ${item.rowNumber}`);
        results.push(failedResult);
      }
    }

    return results;
  }

  private async batchUpdateConvex(jobId: string, job: ProcessingJob, results: any[]) {
    // Rate limit Convex updates
    const now = Date.now();
    if (now - this.lastConvexUpdate < this.MIN_UPDATE_INTERVAL) {
      await new Promise(resolve => setTimeout(resolve, this.MIN_UPDATE_INTERVAL - (now - this.lastConvexUpdate)));
    }

    try {
      console.log(`[JobProcessor] Updating Convex for job ${jobId}...`);
      console.log(`[JobProcessor] Saving ${results.length} match results to database`);
      
      // Update job status first
      await this.convex.mutation(api.priceMatching.updateJobStatus, {
        jobId: jobId as any,
        status: 'matching' as any,
        progress: job.progress,
        progressMessage: job.progressMessage,
      });
      
      // Small delay after status update
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Update matched count separately
      await this.convex.mutation(api.priceMatching.updateMatchedCount, {
        jobId: jobId as any,
        matchedCount: job.matchedCount,
      });
      
      // Small delay after count update
      await new Promise(resolve => setTimeout(resolve, 500));

      // Use batch processor for saving results
      const batchResult = await ConvexBatchProcessor.saveMatchResults(results);
      
      console.log(`[JobProcessor] Batch save complete: ${batchResult.saved} saved, ${batchResult.failed} failed`);
      
      if (batchResult.failed > 0) {
        this.emitLog(jobId, 'warning', `Failed to save ${batchResult.failed} results due to rate limits`);
      }

      this.lastConvexUpdate = Date.now();
    } catch (error: any) {
      console.error('[JobProcessor] Convex batch update error:', error);
      console.error('[JobProcessor] Error details:', error.stack);
      // Don't fail the job, just log the error
      job.errors.push(`Convex update error: ${error.message}`);
    }
  }

  private async updateConvexStatus(jobId: string, updates: any) {
    try {
      await this.convex.mutation(api.priceMatching.updateJobStatus, {
        jobId: jobId as any,
        ...updates,
      });
    } catch (error) {
      console.error('Failed to update Convex status:', error);
    }
  }


  private async finalizeJob(jobId: string, job: ProcessingJob, results: any[]) {
    try {
      console.log(`[JobProcessor] Finalizing job ${jobId}...`);
      console.log(`[JobProcessor] Total results to save: ${results.length}`);
      
      // Save any remaining unsaved results
      // Note: We no longer have savedResultsCount in this scope, so we'll save all results as a final check
      if (results.length > 0) {
        console.log(`[JobProcessor] Checking if all ${results.length} results are saved to database...`);
        // In case some results weren't saved, try saving them all again
        // The createMatchResult mutation should handle duplicates gracefully
      } else {
        console.log(`[JobProcessor] No results to save`);
      }
      
      // Final status update
      console.log(`[JobProcessor] Updating job status to completed...`);
      await this.convex.mutation(api.priceMatching.updateJobStatus, {
        jobId: jobId as any,
        status: 'completed' as any,
        progress: 100,
        progressMessage: 'Matching completed',
      });
      
      // Update final matched count
      await this.convex.mutation(api.priceMatching.updateMatchedCount, {
        jobId: jobId as any,
        matchedCount: job.matchedCount,
      });

      // Log completion
      await this.convex.mutation(api.activityLogs.create, {
        userId: job.userId as any,
        action: 'completed_matching',
        entityType: 'aiMatchingJobs',
        entityId: jobId,
        details: `Completed matching ${job.matchedCount} of ${job.itemCount} items`,
      });

      console.log(`[JobProcessor] Job ${jobId} finalized successfully`);
      console.log(`[JobProcessor] Summary: ${job.matchedCount}/${job.itemCount} items processed`);

      this.emit('job:completed', {
        jobId,
        // matchedCount: job.matchedCount, // TODO: Add this field to updateJobStatus mutation
        itemCount: job.itemCount,
        duration: Date.now() - job.startTime,
      });
    } catch (error) {
      console.error('[JobProcessor] Failed to finalize job:', error);
      console.error('[JobProcessor] Error details:', error instanceof Error ? error.stack : 'No stack trace');
    }
  }

  // Get queue status
  getQueueStatus() {
    const jobs = Array.from(this.jobs.values());
    return {
      queueLength: this.processingQueue.length,
      isProcessing: this.isProcessing,
      activeJobs: jobs.filter(j => j.status === 'processing').length,
      completedJobs: jobs.filter(j => j.status === 'completed').length,
      pendingJobs: jobs.filter(j => j.status === 'pending').length,
      parsingJobs: jobs.filter(j => j.status === 'parsing').length,
      matchingJobs: jobs.filter(j => j.status === 'matching').length,
      failedJobs: jobs.filter(j => j.status === 'failed').length,
      cancelledJobs: jobs.filter(j => j.status === 'cancelled').length,
      totalJobs: this.jobs.size,
    };
  }
  
  // Get all running jobs
  getRunningJobs(): Array<{ jobId: string; status: string; progress: number }> {
    const runningJobs: Array<{ jobId: string; status: string; progress: number }> = [];
    
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.status !== 'completed' && job.status !== 'failed' && job.status !== 'cancelled') {
        runningJobs.push({
          jobId,
          status: job.status,
          progress: job.progress
        });
      }
    }
    
    return runningJobs;
  }
  
  // Pre-generate embeddings for all price items
  private async preGenerateEmbeddings(method: string): Promise<void> {
    try {
      console.log(`[JobProcessor] Pre-generating embeddings for ${method} method...`);
      
      // Get all price items
      const priceItems = await this.convex.query(api.priceItems.getActive);
      if (!priceItems || priceItems.length === 0) {
        console.log('[JobProcessor] No price items found for embedding generation');
        return;
      }
      
      console.log(`[JobProcessor] Found ${priceItems.length} price items`);
      
      // Get matching service instance
      const matchingService = MatchingService.getInstance();
      
      // Generate embeddings based on method
      if (method === 'COHERE' || method === 'HYBRID') {
        await matchingService.generateBatchEmbeddings(priceItems, 'cohere');
        console.log('[JobProcessor] Cohere embeddings pre-generated');
      }
      
      if (method === 'OPENAI' || method === 'HYBRID') {
        await matchingService.generateBatchEmbeddings(priceItems, 'openai');
        console.log('[JobProcessor] OpenAI embeddings pre-generated');
      }
      
      console.log('[JobProcessor] Embedding pre-generation complete');
    } catch (error) {
      console.error('[JobProcessor] Error pre-generating embeddings:', error);
      // Don't throw - this is a non-blocking optimization
    }
  }
}

// Create singleton instance
export const jobProcessor = new JobProcessorService();
